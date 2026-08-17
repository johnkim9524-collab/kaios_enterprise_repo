import { fetchJson, fingerprint, normalizeUrl, sleep, unique } from "./asi-discovery-common-v1.mjs";

const GITHUB = "GITHUB_REPOSITORY_SEARCH";
const DATACITE = "DATACITE_DOI_METADATA";
const WIKIDATA = "WIKIDATA_ACTION_API";

const ROLE_TERMS = Object.freeze({
  PRIMARY_AUTHORITY: ["official", "archive"],
  CATALOG_REFERENCE: ["catalog", "database"],
  LISTING_SUPPLY: ["marketplace", "inventory"],
  SOLD_TRANSACTION: ["sales", "price"],
  AUTHENTICATION_CONDITION: ["authentication", "grading"],
  PROVENANCE_HISTORY: ["provenance", "history"],
  CULTURE_ATTENTION: ["community", "trend"],
  AUCTION_PRIVATE_SALE: ["auction", "results"],
  INDEPENDENT_VERIFICATION: ["research", "dataset"],
  MACRO_CONTEXT: ["market", "report"]
});

function compactTokens(value) {
  const stop = new Set(["and", "the", "of", "or"]);
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter(token => token && !stop.has(token))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function githubQueries(lane) {
  const terms = ROLE_TERMS[lane.source_role] ?? ["data", "api"];
  const scopeTokens = compactTokens(lane.scope_name);
  const parentTokens = compactTokens(lane.parent_core_domain.replace(/-/g, " "));
  const distinctive = scopeTokens.slice(0, 2).join(" ") || lane.scope_name;
  const broadScope = scopeTokens[0] ?? lane.scope_name;
  const parent = parentTokens.slice(0, 2).join(" ") || lane.parent_core_domain;
  const suffix = " in:name,description,readme archived:false fork:false";
  return unique([
    `${distinctive} ${terms[0]}${suffix}`,
    `${broadScope} ${terms[1]}${suffix}`,
    `${parent} ${terms[0]} dataset${suffix}`
  ]).map(query => query.slice(0, 255));
}

function createLimiter(intervalMs) {
  let nextAt = 0;
  return async () => {
    const now = Date.now();
    if (now < nextAt) await sleep(nextAt - now);
    nextAt = Date.now() + intervalMs;
  };
}

function githubRecords(lane, query, items, observedAt) {
  const records = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const base = {
      discovery_provider: GITHUB,
      observed_at: observedAt,
      lane_ids: [lane.queue_id],
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      query,
      result_rank: index + 1,
      source_name: item.full_name,
      owner: item.owner?.login ?? "UNKNOWN",
      source_family_hint: `GITHUB_OWNER:${item.owner?.login ?? "UNKNOWN"}`,
      metadata: {
        description: item.description ?? null,
        homepage: item.homepage ?? null,
        language: item.language ?? null,
        topics: item.topics ?? [],
        license_spdx_id: item.license?.spdx_id ?? null,
        archived: Boolean(item.archived),
        pushed_at: item.pushed_at ?? null,
        updated_at: item.updated_at ?? null,
        stargazers_count: item.stargazers_count ?? 0
      }
    };
    records.push({
      ...base,
      provider_record_id: String(item.id),
      endpoint_url: item.html_url,
      channel_type_hint: "GITHUB_REPOSITORY"
    });
    const homepage = normalizeUrl(item.homepage ?? "");
    if (homepage && homepage !== normalizeUrl(item.html_url)) {
      records.push({
        ...base,
        provider_record_id: `${item.id}:homepage`,
        endpoint_url: homepage,
        channel_type_hint: "PROJECT_HOMEPAGE_FROM_GITHUB"
      });
    }
  }
  return records;
}

async function discoverGitHub(lanes, provider, observedAt, errors) {
  const token = process.env.GITHUB_DISCOVERY_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    errors.push({ provider_id: GITHUB, error: "AUTHENTICATED_TOKEN_NOT_AVAILABLE" });
    return [];
  }
  const waitTurn = createLimiter(provider.minimum_request_interval_ms);
  const counts = new Map(lanes.map(lane => [lane.queue_id, 0]));
  const queries = new Map(lanes.map(lane => [lane.queue_id, githubQueries(lane)]));
  const raw = [];
  let requests = 0;

  async function execute(lane, query) {
    if (!query || requests >= provider.request_budget) return;
    await waitTurn();
    requests += 1;
    try {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", query);
      url.searchParams.set("per_page", String(provider.per_page_maximum));
      const { data } = await fetchJson(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery"
        }
      }, 4);
      const records = githubRecords(lane, query, data.items ?? [], observedAt);
      raw.push(...records);
      counts.set(lane.queue_id, (counts.get(lane.queue_id) ?? 0) + records.length);
    } catch (error) {
      errors.push({ provider_id: GITHUB, lane_id: lane.queue_id, query, error: error.message });
    }
  }

  // Coverage-first: no lane receives a retry until all mandatory lanes receive one request.
  for (const lane of lanes) await execute(lane, queries.get(lane.queue_id)[0]);

  for (let queryIndex = 1; queryIndex < 3 && requests < provider.request_budget; queryIndex += 1) {
    const gaps = lanes
      .filter(lane => (counts.get(lane.queue_id) ?? 0) < lane.batch_1_targets.unique_source_endpoints * 2)
      .sort((a, b) => (counts.get(a.queue_id) ?? 0) - (counts.get(b.queue_id) ?? 0) ||
        a.structural_priority_rank - b.structural_priority_rank);
    for (const lane of gaps) await execute(lane, queries.get(lane.queue_id)[queryIndex]);
  }
  return raw;
}

function scopeContext(lanes) {
  const scopes = new Map();
  const laneMap = new Map();
  for (const lane of lanes) {
    scopes.set(lane.scope_id, {
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain
    });
    laneMap.set(`${lane.scope_id}:${lane.source_role}`, lane.queue_id);
  }
  return { scopes: [...scopes.values()].sort((a, b) => a.scope_id.localeCompare(b.scope_id)), laneMap };
}

async function discoverDataCite(scopes, laneMap, provider, observedAt, errors) {
  const raw = [];
  for (const scope of scopes.slice(0, provider.request_budget)) {
    const url = new URL("https://api.datacite.org/dois");
    url.searchParams.set("query", scope.scope_name);
    url.searchParams.set("page[size]", String(provider.page_size_maximum));
    try {
      const { data } = await fetchJson(url, {
        headers: { Accept: "application/vnd.api+json", "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" }
      });
      for (let index = 0; index < (data.data ?? []).length; index += 1) {
        const item = data.data[index];
        const a = item.attributes ?? {};
        const endpoint = normalizeUrl(a.url ?? `https://doi.org/${a.doi ?? item.id}`);
        if (!endpoint) continue;
        const text = [a.publisher, ...(a.titles ?? []).map(value => value.title), ...(a.subjects ?? []).map(value => value.subject)]
          .filter(Boolean).join(" ").toLowerCase();
        const roles = new Set(["CATALOG_REFERENCE", "INDEPENDENT_VERIFICATION"]);
        if (/provenance|history|archive/.test(text)) roles.add("PROVENANCE_HISTORY");
        if (/auction|sale|price|transaction|market/.test(text)) roles.add("SOLD_TRANSACTION");
        const laneIds = [...roles].map(role => laneMap.get(`${scope.scope_id}:${role}`)).filter(Boolean);
        raw.push({
          discovery_provider: DATACITE,
          observed_at: observedAt,
          lane_ids: laneIds,
          scope_id: scope.scope_id,
          scope_name: scope.scope_name,
          parent_core_domain: scope.parent_core_domain,
          source_role: "INDEPENDENT_VERIFICATION",
          query: scope.scope_name,
          result_rank: index + 1,
          provider_record_id: a.doi ?? item.id,
          endpoint_url: endpoint,
          source_name: a.titles?.[0]?.title ?? a.doi ?? item.id,
          owner: a.publisher ?? a.clientId ?? "UNKNOWN",
          source_family_hint: `DATACITE_CLIENT:${a.clientId ?? a.publisher ?? "UNKNOWN"}`,
          channel_type_hint: "DATACITE_DATASET_OR_RESEARCH_RECORD",
          metadata: {
            publisher: a.publisher ?? null,
            client_id: a.clientId ?? null,
            rights_list: a.rightsList ?? [],
            publication_year: a.publicationYear ?? null,
            updated_at: a.updated ?? a.created ?? null
          }
        });
      }
    } catch (error) {
      errors.push({ provider_id: DATACITE, scope_id: scope.scope_id, error: error.message });
    }
    await sleep(150);
  }
  return raw;
}

async function discoverWikidata(scopes, laneMap, provider, observedAt, errors) {
  const raw = [];
  let requests = 0;
  for (const scope of scopes) {
    if (requests + 2 > provider.request_budget) break;
    try {
      const search = new URL("https://www.wikidata.org/w/api.php");
      for (const [key, value] of Object.entries({
        action: "wbsearchentities", search: scope.scope_name, language: "en", uselang: "en",
        limit: String(provider.entity_search_limit), format: "json", origin: "*"
      })) search.searchParams.set(key, value);
      requests += 1;
      const { data: searchData } = await fetchJson(search, { headers: { "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" } });
      const ids = unique((searchData.search ?? []).map(item => item.id));
      if (!ids.length) continue;
      const entities = new URL("https://www.wikidata.org/w/api.php");
      for (const [key, value] of Object.entries({
        action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims",
        languages: "en", format: "json", origin: "*"
      })) entities.searchParams.set(key, value);
      requests += 1;
      const { data } = await fetchJson(entities, { headers: { "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" } });
      let rank = 0;
      for (const id of ids) {
        const entity = data.entities?.[id];
        if (!entity || entity.missing !== undefined) continue;
        rank += 1;
        const description = entity.descriptions?.en?.value ?? "";
        const roles = new Set(["PRIMARY_AUTHORITY", "CATALOG_REFERENCE", "INDEPENDENT_VERIFICATION"]);
        if (/museum|archive|library|collection|institute/.test(description.toLowerCase())) roles.add("PROVENANCE_HISTORY");
        const laneIds = [...roles].map(role => laneMap.get(`${scope.scope_id}:${role}`)).filter(Boolean);
        const websites = (entity.claims?.P856 ?? [])
          .map(claim => normalizeUrl(claim.mainsnak?.datavalue?.value)).filter(Boolean);
        const endpoints = websites.length ? websites : [`https://www.wikidata.org/wiki/${id}`];
        for (const endpoint of endpoints) {
          raw.push({
            discovery_provider: WIKIDATA,
            observed_at: observedAt,
            lane_ids: laneIds,
            scope_id: scope.scope_id,
            scope_name: scope.scope_name,
            parent_core_domain: scope.parent_core_domain,
            source_role: "PRIMARY_AUTHORITY",
            query: scope.scope_name,
            result_rank: rank,
            provider_record_id: id,
            endpoint_url: endpoint,
            source_name: entity.labels?.en?.value ?? id,
            owner: entity.labels?.en?.value ?? id,
            source_family_hint: "WIKIDATA_KNOWLEDGE_GRAPH",
            channel_type_hint: websites.length ? "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA" : "WIKIDATA_ENTITY_RECORD",
            metadata: { wikidata_id: id, description, official_website_claim_count: websites.length }
          });
        }
      }
    } catch (error) {
      errors.push({ provider_id: WIKIDATA, scope_id: scope.scope_id, error: error.message });
    }
    await sleep(250);
  }
  return raw;
}

export async function runLiveDiscovery(contract, bridge) {
  const observedAt = process.env.ASI_DISCOVERY_OBSERVED_AT || new Date().toISOString();
  const lanes = bridge["dos-asi-priority-queue-v1.json"].items;
  const { scopes, laneMap } = scopeContext(lanes);
  const errors = [];
  const provider = id => contract.discovery_providers.find(item => item.provider_id === id);
  const github = await discoverGitHub(lanes, provider(GITHUB), observedAt, errors);
  const datacite = await discoverDataCite(scopes, laneMap, provider(DATACITE), observedAt, errors);
  const wikidata = await discoverWikidata(scopes, laneMap, provider(WIKIDATA), observedAt, errors);
  const snapshot = {
    id: "kidults-asi-raw-discovery-snapshot-batch-001",
    record_type: "asi_raw_discovery_snapshot",
    version: "1.0.0",
    status: "IMMUTABLE_LIVE_METADATA_SNAPSHOT",
    observed_at: observedAt,
    contract_id: contract.id,
    discovery_provider_counts: { [GITHUB]: github.length, [DATACITE]: datacite.length, [WIKIDATA]: wikidata.length },
    request_or_provider_errors: errors,
    raw_record_count: github.length + datacite.length + wikidata.length,
    records: [...github, ...datacite, ...wikidata],
    content_acquired: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
  snapshot.snapshot_fingerprint = fingerprint(snapshot);
  return snapshot;
}
