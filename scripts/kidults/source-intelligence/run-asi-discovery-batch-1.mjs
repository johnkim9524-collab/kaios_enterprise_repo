import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildDosV1 } from "../dos/build-dos-v1.mjs";
import { buildDosAsiExecutionV1 } from "../dos/build-dos-asi-execution-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "asi-discovery-batch-001-contract-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "asi-discovery-batch-001");
const PROVIDER_GITHUB = "GITHUB_REPOSITORY_SEARCH";
const PROVIDER_DATACITE = "DATACITE_DOI_METADATA";
const PROVIDER_WIKIDATA = "WIKIDATA_ACTION_API";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24)}`;
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ""))].sort();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const config = {
    output: defaultOutput,
    write: false,
    live: false,
    replay: null,
    target: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else if (argument === "--live") config.live = true;
    else if (argument === "--replay") config.replay = path.resolve(argv[++index]);
    else if (argument === "--target") config.target = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (config.live === Boolean(config.replay)) {
    throw new Error("Choose exactly one execution mode: --live or --replay <snapshot>.");
  }
  return config;
}

function writeOutputs(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

function normalizeEndpointUrl(input) {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|campaign$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of sorted) url.searchParams.append(key, value);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function sanitizeGitHubQuery(value) {
  const cleaned = String(value)
    .replace(/[“”\"]/g, " ")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = " in:name,description,readme archived:false fork:false";
  return `${cleaned.slice(0, Math.max(1, 250 - suffix.length))}${suffix}`;
}

const ROLE_SEARCH_TERMS = Object.freeze({
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

function compactScopeTerms(scopeName) {
  const stop = new Set(["and", "the", "of", "or"]);
  return scopeName.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter(token => token && !stop.has(token)).slice(0, 4).join(" ");
}

function githubQueries(lane) {
  const roleTerms = ROLE_SEARCH_TERMS[lane.source_role] ?? ["data", "api"];
  const scope = compactScopeTerms(lane.scope_name);
  const parent = lane.parent_core_domain.replace(/-/g, " ");
  return unique([
    sanitizeGitHubQuery(`${scope} ${roleTerms[0]} ${roleTerms[1]} data api`),
    sanitizeGitHubQuery(`${scope} ${roleTerms[0]} dataset catalog`),
    sanitizeGitHubQuery(`${parent} ${roleTerms[1]} data source`)
  ]);
}

async function fetchJson(url, options = {}, retry = {}) {
  const attempts = retry.attempts ?? 3;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return { data: await response.json(), response };
      const body = await response.text();
      const error = new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      error.status = response.status;
      error.response = response;
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const reset = Number(error.response?.headers?.get("x-ratelimit-reset") ?? 0) * 1000;
      const wait = reset > Date.now() ? Math.min(reset - Date.now() + 1000, 120000) : Math.min(1500 * (2 ** (attempt - 1)), 10000);
      await sleep(wait);
    }
  }
  throw lastError;
}

function createGitHubLimiter(minimumIntervalMs) {
  let nextAt = 0;
  return async () => {
    const now = Date.now();
    if (now < nextAt) await sleep(nextAt - now);
    nextAt = Date.now() + minimumIntervalMs;
  };
}

function githubRawRecords({ lane, query, items, observedAt }) {
  const records = [];
  for (let rank = 0; rank < items.length; rank += 1) {
    const item = items[rank];
    const base = {
      discovery_provider: PROVIDER_GITHUB,
      observed_at: observedAt,
      lane_id: lane.queue_id,
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      query,
      result_rank: rank + 1,
      provider_record_id: String(item.id),
      source_name: item.full_name,
      owner: item.owner?.login ?? "UNKNOWN",
      owner_type: item.owner?.type ?? "UNKNOWN",
      source_family_hint: `GITHUB_OWNER:${item.owner?.login ?? "UNKNOWN"}`,
      metadata: {
        repository_full_name: item.full_name,
        description: item.description ?? null,
        homepage: item.homepage ?? null,
        language: item.language ?? null,
        topics: item.topics ?? [],
        license_spdx_id: item.license?.spdx_id ?? null,
        archived: Boolean(item.archived),
        fork: Boolean(item.fork),
        pushed_at: item.pushed_at ?? null,
        updated_at: item.updated_at ?? null,
        stargazers_count: item.stargazers_count ?? 0,
        open_issues_count: item.open_issues_count ?? 0,
        visibility: item.visibility ?? "public"
      }
    };
    records.push({
      ...base,
      endpoint_url: item.html_url,
      channel_type_hint: "GITHUB_REPOSITORY"
    });
    const homepage = normalizeEndpointUrl(item.homepage ?? "");
    if (homepage && homepage !== normalizeEndpointUrl(item.html_url)) {
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

async function discoverGitHub({ lanes, contract, observedAt, errors }) {
  const token = process.env.GITHUB_DISCOVERY_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    errors.push({ provider_id: PROVIDER_GITHUB, error: "AUTHENTICATED_TOKEN_NOT_AVAILABLE" });
    return [];
  }
  const provider = contract.discovery_providers.find(item => item.provider_id === PROVIDER_GITHUB);
  const waitTurn = createGitHubLimiter(provider.minimum_request_interval_ms);
  const requestBudget = provider.request_budget;
  let requests = 0;
  const raw = [];
  const laneCounts = new Map(lanes.map(lane => [lane.queue_id, 0]));
  const queriesByLane = new Map(lanes.map(lane => [lane.queue_id, githubQueries(lane)]));

  async function runQuery(lane, query) {
    if (requests >= requestBudget) return;
    const target = lane.batch_1_targets.unique_source_endpoints;
    const perPage = Math.min(provider.per_page_maximum, Math.max(18, target * 3));
    await waitTurn();
    requests += 1;
    try {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", query);
      url.searchParams.set("per_page", String(perPage));
      const { data } = await fetchJson(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery"
        }
      }, { attempts: 4 });
      const records = githubRawRecords({ lane, query, items: data.items ?? [], observedAt });
      raw.push(...records);
      laneCounts.set(lane.queue_id, (laneCounts.get(lane.queue_id) ?? 0) + records.length);
    } catch (error) {
      errors.push({ provider_id: PROVIDER_GITHUB, lane_id: lane.queue_id, query, error: error.message });
    }
  }

  for (const lane of lanes) {
    if (requests >= requestBudget) break;
    await runQuery(lane, queriesByLane.get(lane.queue_id)[0]);
  }

  for (let queryIndex = 1; queryIndex < 3 && requests < requestBudget; queryIndex += 1) {
    const candidates = lanes
      .filter(lane => (laneCounts.get(lane.queue_id) ?? 0) < lane.batch_1_targets.unique_source_endpoints * 2)
      .sort((a, b) => (laneCounts.get(a.queue_id) ?? 0) - (laneCounts.get(b.queue_id) ?? 0) ||
        a.structural_priority_rank - b.structural_priority_rank);
    for (const lane of candidates) {
      if (requests >= requestBudget) break;
      const query = queriesByLane.get(lane.queue_id)[queryIndex];
      if (query) await runQuery(lane, query);
    }
  }
  return raw;
}

function dataciteLaneIds(laneMap, scopeId, attributes) {
  const text = [
    ...(attributes.titles ?? []).map(item => item.title),
    attributes.publisher,
    ...(attributes.subjects ?? []).map(item => item.subject),
    ...(attributes.descriptions ?? []).map(item => item.description)
  ].filter(Boolean).join(" ").toLowerCase();
  const roles = new Set(["CATALOG_REFERENCE", "INDEPENDENT_VERIFICATION"]);
  if (/provenance|ownership|history|archive/.test(text)) roles.add("PROVENANCE_HISTORY");
  if (/auction|sale|price|transaction|market/.test(text)) roles.add("SOLD_TRANSACTION");
  return [...roles].map(role => laneMap.get(`${scopeId}:${role}`)?.queue_id).filter(Boolean);
}

async function discoverDataCite({ scopes, laneMap, contract, observedAt, errors }) {
  const provider = contract.discovery_providers.find(item => item.provider_id === PROVIDER_DATACITE);
  const raw = [];
  let requests = 0;
  for (const scope of scopes) {
    if (requests >= provider.request_budget) break;
    requests += 1;
    const url = new URL("https://api.datacite.org/dois");
    url.searchParams.set("query", scope.scope_name);
    url.searchParams.set("page[size]", String(provider.page_size_maximum));
    try {
      const { data } = await fetchJson(url, {
        headers: { Accept: "application/vnd.api+json", "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" }
      }, { attempts: 3 });
      for (let rank = 0; rank < (data.data ?? []).length; rank += 1) {
        const item = data.data[rank];
        const attributes = item.attributes ?? {};
        const endpoint = normalizeEndpointUrl(attributes.url ?? `https://doi.org/${attributes.doi ?? item.id}`);
        if (!endpoint) continue;
        const laneIds = dataciteLaneIds(laneMap, scope.scope_id, attributes);
        raw.push({
          discovery_provider: PROVIDER_DATACITE,
          observed_at: observedAt,
          lane_ids: laneIds,
          lane_id: laneIds[0] ?? null,
          scope_id: scope.scope_id,
          scope_name: scope.scope_name,
          parent_core_domain: scope.parent_core_domain,
          source_role: "INDEPENDENT_VERIFICATION",
          query: scope.scope_name,
          result_rank: rank + 1,
          provider_record_id: attributes.doi ?? item.id,
          endpoint_url: endpoint,
          source_name: attributes.titles?.[0]?.title ?? attributes.doi ?? item.id,
          owner: attributes.publisher ?? attributes.clientId ?? "UNKNOWN",
          owner_type: "DATASET_PUBLISHER_OR_REPOSITORY",
          source_family_hint: `DATACITE_CLIENT:${attributes.clientId ?? attributes.publisher ?? "UNKNOWN"}`,
          channel_type_hint: "DATACITE_DATASET_OR_RESEARCH_RECORD",
          metadata: {
            doi: attributes.doi ?? item.id,
            publisher: attributes.publisher ?? null,
            client_id: attributes.clientId ?? null,
            types: attributes.types ?? null,
            subjects: attributes.subjects ?? [],
            rights_list: attributes.rightsList ?? [],
            publication_year: attributes.publicationYear ?? null,
            created: attributes.created ?? null,
            updated: attributes.updated ?? null,
            descriptions: attributes.descriptions ?? []
          }
        });
      }
    } catch (error) {
      errors.push({ provider_id: PROVIDER_DATACITE, scope_id: scope.scope_id, error: error.message });
    }
    await sleep(200);
  }
  return raw;
}

function wikidataRoles(description = "") {
  const text = description.toLowerCase();
  const roles = new Set(["PRIMARY_AUTHORITY", "CATALOG_REFERENCE"]);
  if (/museum|archive|library|collection|institute|institution/.test(text)) roles.add("PROVENANCE_HISTORY");
  if (/auction|marketplace|dealer|sale/.test(text)) roles.add("SOLD_TRANSACTION");
  if (/association|community|magazine|journal|media/.test(text)) roles.add("CULTURE_ATTENTION");
  roles.add("INDEPENDENT_VERIFICATION");
  return [...roles];
}

async function discoverWikidata({ scopes, laneMap, contract, observedAt, errors }) {
  const provider = contract.discovery_providers.find(item => item.provider_id === PROVIDER_WIKIDATA);
  const raw = [];
  let requests = 0;
  for (const scope of scopes) {
    if (requests + 2 > provider.request_budget) break;
    const searchUrl = new URL("https://www.wikidata.org/w/api.php");
    searchUrl.searchParams.set("action", "wbsearchentities");
    searchUrl.searchParams.set("search", scope.scope_name);
    searchUrl.searchParams.set("language", "en");
    searchUrl.searchParams.set("uselang", "en");
    searchUrl.searchParams.set("limit", String(provider.entity_search_limit));
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    try {
      requests += 1;
      const { data: searchData } = await fetchJson(searchUrl, {
        headers: { "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" }
      }, { attempts: 3 });
      const ids = unique((searchData.search ?? []).map(item => item.id)).slice(0, provider.entity_search_limit);
      if (!ids.length) continue;
      const entityUrl = new URL("https://www.wikidata.org/w/api.php");
      entityUrl.searchParams.set("action", "wbgetentities");
      entityUrl.searchParams.set("ids", ids.join("|"));
      entityUrl.searchParams.set("props", "labels|descriptions|claims");
      entityUrl.searchParams.set("languages", "en");
      entityUrl.searchParams.set("format", "json");
      entityUrl.searchParams.set("origin", "*");
      requests += 1;
      const { data: entityData } = await fetchJson(entityUrl, {
        headers: { "User-Agent": "KIDULTS-AGCI-OS-ASI-Discovery" }
      }, { attempts: 3 });
      let rank = 0;
      for (const id of ids) {
        const entity = entityData.entities?.[id];
        if (!entity || entity.missing !== undefined) continue;
        rank += 1;
        const description = entity.descriptions?.en?.value ?? "";
        const roles = wikidataRoles(description);
        const laneIds = roles.map(role => laneMap.get(`${scope.scope_id}:${role}`)?.queue_id).filter(Boolean);
        const websites = (entity.claims?.P856 ?? [])
          .map(claim => claim.mainsnak?.datavalue?.value)
          .map(normalizeEndpointUrl)
          .filter(Boolean);
        const endpoints = websites.length ? websites : [`https://www.wikidata.org/wiki/${id}`];
        for (const endpoint of endpoints) {
          raw.push({
            discovery_provider: PROVIDER_WIKIDATA,
            observed_at: observedAt,
            lane_ids: laneIds,
            lane_id: laneIds[0] ?? null,
            scope_id: scope.scope_id,
            scope_name: scope.scope_name,
            parent_core_domain: scope.parent_core_domain,
            source_role: roles[0],
            query: scope.scope_name,
            result_rank: rank,
            provider_record_id: id,
            endpoint_url: endpoint,
            source_name: entity.labels?.en?.value ?? id,
            owner: entity.labels?.en?.value ?? id,
            owner_type: "WIKIDATA_ENTITY_ASSERTION",
            source_family_hint: "WIKIDATA_KNOWLEDGE_GRAPH",
            channel_type_hint: websites.length ? "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA" : "WIKIDATA_ENTITY_RECORD",
            metadata: {
              wikidata_id: id,
              description,
              official_website_claim_count: websites.length,
              entity_url: `https://www.wikidata.org/wiki/${id}`
            }
          });
        }
      }
    } catch (error) {
      errors.push({ provider_id: PROVIDER_WIKIDATA, scope_id: scope.scope_id, error: error.message });
    }
    await sleep(350);
  }
  return raw;
}

function laneContextMaps(bridge, dos) {
  const priority = bridge["dos-asi-priority-queue-v1.json"];
  const ledger = bridge["decision-source-requirement-ledger-v1.json"];
  const decisionMap = new Map(dos["decision-library-v1.json"].records.map(record => [record.decision_scope_id, record]));
  const ledgerMap = new Map(ledger.records.map(record => [record.lane_id, record]));
  const laneMap = new Map(priority.items.map(item => [`${item.scope_id}:${item.source_role}`, item]));
  const scopeMap = new Map(priority.items.map(item => [item.scope_id, {
    scope_id: item.scope_id,
    scope_name: item.scope_name,
    parent_core_domain: item.parent_core_domain
  }]));
  return { priority, ledgerMap, decisionMap, laneMap, scopes: [...scopeMap.values()].sort((a, b) => a.scope_id.localeCompare(b.scope_id)) };
}

async function buildLiveSnapshot({ contract, bridge, dos, targetOverride }) {
  const observedAt = process.env.ASI_DISCOVERY_OBSERVED_AT || new Date().toISOString();
  const contexts = laneContextMaps(bridge, dos);
  const lanes = contexts.priority.items;
  const errors = [];
  const github = await discoverGitHub({ lanes, contract, observedAt, errors });
  const datacite = await discoverDataCite({ scopes: contexts.scopes, laneMap: contexts.laneMap, contract, observedAt, errors });
  const wikidata = await discoverWikidata({ scopes: contexts.scopes, laneMap: contexts.laneMap, contract, observedAt, errors });
  const records = [...github, ...datacite, ...wikidata];
  const snapshot = {
    id: "kidults-asi-raw-discovery-snapshot-batch-001",
    record_type: "asi_raw_discovery_snapshot",
    version: "1.0.0",
    status: "IMMUTABLE_LIVE_METADATA_SNAPSHOT",
    observed_at: observedAt,
    contract_id: contract.id,
    target_unique_endpoints: targetOverride ?? contract.targets.unique_source_endpoints_minimum,
    discovery_provider_counts: {
      [PROVIDER_GITHUB]: github.length,
      [PROVIDER_DATACITE]: datacite.length,
      [PROVIDER_WIKIDATA]: wikidata.length
    },
    request_or_provider_errors: errors,
    raw_record_count: records.length,
    records,
    content_acquired: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
  snapshot.snapshot_fingerprint = fingerprint(snapshot);
  return snapshot;
}

function rawLaneIds(raw) {
  return unique([raw.lane_id, ...(raw.lane_ids ?? [])]);
}

function deriveRights(record) {
  const assertions = record.raw_assertions;
  const githubLicenses = unique(assertions.map(item => item.metadata?.license_spdx_id));
  const dataciteRights = assertions.flatMap(item => item.metadata?.rights_list ?? []);
  if (dataciteRights.length) {
    return {
      rights_state: "EXPLICIT_DATACITE_RIGHTS_METADATA_REVIEW_REQUIRED",
      commercial_use_state: "RIGHTS_METADATA_PRESENT_COMMERCIAL_SCOPE_REVIEW_REQUIRED",
      rights_evidence: dataciteRights
    };
  }
  if (githubLicenses.length) {
    return {
      rights_state: `EXPLICIT_REPOSITORY_LICENSE_METADATA:${githubLicenses.join(",")}`,
      commercial_use_state: "REPOSITORY_LICENSE_EXPLICIT_UNDERLYING_DATA_RIGHTS_NOT_VERIFIED",
      rights_evidence: githubLicenses
    };
  }
  return {
    rights_state: "UNKNOWN_TERMS_AND_FIELD_LEVEL_RIGHTS_NOT_ASSESSED",
    commercial_use_state: "UNKNOWN_NOT_INFERRED",
    rights_evidence: []
  };
}

function freshnessState(rawAssertions) {
  const timestamps = rawAssertions.flatMap(item => [item.metadata?.updated_at, item.metadata?.pushed_at, item.metadata?.updated, item.metadata?.created])
    .filter(Boolean).sort().reverse();
  return timestamps.length
    ? { state: "METADATA_TIMESTAMP_AVAILABLE_SOURCE_FRESHNESS_NOT_VERIFIED", latest_metadata_timestamp: timestamps[0] }
    : { state: "UNKNOWN_NOT_ASSESSED", latest_metadata_timestamp: null };
}

function channelPriority(type) {
  const order = {
    OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA: 1,
    PROJECT_HOMEPAGE_FROM_GITHUB: 2,
    DATACITE_DATASET_OR_RESEARCH_RECORD: 3,
    GITHUB_REPOSITORY: 4,
    WIKIDATA_ENTITY_RECORD: 5
  };
  return order[type] ?? 99;
}

function mergeRawRecords(snapshot, contexts) {
  const endpointMap = new Map();
  const invalid = [];
  for (const raw of snapshot.records) {
    const normalized = normalizeEndpointUrl(raw.endpoint_url);
    if (!normalized) {
      invalid.push({ provider: raw.discovery_provider, provider_record_id: raw.provider_record_id, endpoint_url: raw.endpoint_url });
      continue;
    }
    const current = endpointMap.get(normalized) ?? {
      normalized_endpoint_url: normalized,
      endpoint_url_assertions: [],
      raw_assertions: [],
      lane_ids: new Set(),
      scope_ids: new Set(),
      source_roles: new Set(),
      owners: new Set(),
      source_families: new Set(),
      channel_types: new Set(),
      discovery_providers: new Set(),
      source_names: new Set()
    };
    current.endpoint_url_assertions.push(raw.endpoint_url);
    current.raw_assertions.push(raw);
    for (const laneId of rawLaneIds(raw)) current.lane_ids.add(laneId);
    if (raw.scope_id) current.scope_ids.add(raw.scope_id);
    if (raw.source_role) current.source_roles.add(raw.source_role);
    if (raw.owner) current.owners.add(raw.owner);
    if (raw.source_family_hint) current.source_families.add(raw.source_family_hint);
    if (raw.channel_type_hint) current.channel_types.add(raw.channel_type_hint);
    if (raw.discovery_provider) current.discovery_providers.add(raw.discovery_provider);
    if (raw.source_name) current.source_names.add(raw.source_name);
    endpointMap.set(normalized, current);
  }

  const records = [...endpointMap.values()].map(item => {
    const lanes = unique([...item.lane_ids]).map(id => contexts.ledgerMap.get(id)).filter(Boolean);
    const decisionIds = unique(lanes.flatMap(lane => lane.decision_scope_ids));
    const decisionRecords = decisionIds.map(id => contexts.decisionMap.get(id)).filter(Boolean);
    const rights = deriveRights(item);
    const freshness = freshnessState(item.raw_assertions);
    const channelTypes = unique([...item.channel_types]);
    const owners = unique([...item.owners]);
    const providerIds = unique([...item.discovery_providers]);
    const sourceFamilies = unique([...item.source_families]);
    const sourceRoles = unique([...item.source_roles, ...lanes.map(lane => lane.source_role)]);
    const scopes = unique([...item.scope_ids, ...lanes.map(lane => lane.scope_id)]);
    const valueScopes = unique(decisionRecords.flatMap(record => record.irreplaceable_value_scope_ids));
    const products = unique(decisionRecords.flatMap(record => record.intelligence_product_ids));
    const fields = unique(lanes.flatMap(lane => lane.role_specific_data_fields));
    const decisions = unique(decisionRecords.map(record => `${record.customer_segment}:${record.decision_name}`));
    const archived = item.raw_assertions.some(assertion => assertion.metadata?.archived === true);
    const authorityCandidate = sourceRoles.includes("PRIMARY_AUTHORITY") || channelTypes.includes("OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA");
    const normalized = item.normalized_endpoint_url;
    const primaryType = channelTypes.sort((a, b) => channelPriority(a) - channelPriority(b) || a.localeCompare(b))[0] ?? "UNKNOWN";
    const record = {
      source_id: hashId("src", `${owners[0] ?? "UNKNOWN"}:${normalized}`),
      endpoint_id: hashId("ep", normalized),
      endpoint_url: normalized,
      normalized_endpoint_url: normalized,
      owner: owners.length === 1 ? owners[0] : "MULTIPLE_OWNER_ASSERTIONS",
      owner_assertions: owners,
      jurisdiction_state: "UNKNOWN_NOT_ASSESSED",
      source_family: sourceFamilies.length === 1 ? sourceFamilies[0] : "MULTIPLE_LINEAGE_ASSERTIONS",
      source_family_assertions: sourceFamilies,
      channel_type: primaryType,
      channel_type_assertions: channelTypes,
      candidate_collection_scopes: scopes,
      candidate_source_roles: sourceRoles,
      customer_decisions_supported: decisions,
      decision_scope_ids: decisionIds,
      value_scope_ids: valueScopes,
      intelligence_product_ids: products,
      required_data_fields_supported: fields,
      discovery_provenance: item.raw_assertions.map(assertion => ({
        discovery_provider: assertion.discovery_provider,
        observed_at: assertion.observed_at,
        query: assertion.query,
        lane_id: assertion.lane_id,
        scope_id: assertion.scope_id,
        source_role: assertion.source_role,
        provider_record_id: assertion.provider_record_id,
        result_rank: assertion.result_rank
      })),
      authority_state: authorityCandidate ? "AUTHORITY_CANDIDATE_NOT_VERIFIED" : "NOT_ASSESSED",
      independence_state: providerIds.length > 1
        ? "MULTI_DISCOVERY_PROVIDER_NOT_YET_INDEPENDENT_SOURCE_VALIDATION"
        : "NOT_ASSESSED",
      rights_state: rights.rights_state,
      commercial_use_state: rights.commercial_use_state,
      rights_evidence: rights.rights_evidence,
      access_state: "PUBLIC_METADATA_OBSERVED_CONTENT_ACQUISITION_NOT_AUTHORIZED",
      schema_state: providerIds.some(id => [PROVIDER_GITHUB, PROVIDER_DATACITE, PROVIDER_WIKIDATA].includes(id))
        ? "STRUCTURED_DISCOVERY_METADATA_SOURCE_SCHEMA_NOT_VERIFIED"
        : "UNKNOWN_NOT_ASSESSED",
      freshness_state: freshness.state,
      latest_metadata_timestamp: freshness.latest_metadata_timestamp,
      bias_risk: unique([
        ...providerIds.map(id => `${id}_DISCOVERY_BIAS`),
        "SEARCH_RANKING_BIAS",
        "SCOPE_QUERY_MATCH_PRELIMINARY_NOT_VALIDATED"
      ]),
      continuity_risk: archived ? "ELEVATED_ARCHIVED_SOURCE" : "UNKNOWN_NOT_ASSESSED",
      cost_state: "DISCOVERY_METADATA_NO_INCREMENTAL_FEE_OBSERVED_DOWNSTREAM_COST_UNKNOWN",
      assessment_depth: "BASIC_CLASSIFICATION",
      next_gate: "DEEP_SCOPE_UTILITY_RIGHTS_ACCESS_BIAS_AND_CONTINUITY_ASSESSMENT",
      scope_relevance_state: "QUERY_MATCH_PRELIMINARY",
      acquisition_authorized: false,
      provider_direct_to_portal: false,
      provider_direct_to_index: false,
      public_projection: false,
      production: "HOLD"
    };
    record.classification_completeness = Object.values(record).filter(value => value === undefined).length === 0 ? 1 : 0;
    return record;
  }).sort((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));

  return { records, invalid };
}

function utilityScore(record) {
  const explicitRights = !record.rights_state.startsWith("UNKNOWN");
  const structured = record.schema_state.startsWith("STRUCTURED");
  const score = Math.min(100,
    10 +
    Math.min(record.candidate_collection_scopes.length, 5) * 5 +
    Math.min(record.candidate_source_roles.length, 5) * 7 +
    Math.min(record.value_scope_ids.length, 7) * 4 +
    Math.min(record.intelligence_product_ids.length, 8) * 3 +
    Math.min(record.required_data_fields_supported.length, 20) +
    (explicitRights ? 8 : 0) +
    (structured ? 5 : 0) +
    (record.latest_metadata_timestamp ? 3 : 0));
  return score;
}

function buildDerivedOutputs(snapshot, contract, bridge, dos) {
  const contexts = laneContextMaps(bridge, dos);
  const { records, invalid } = mergeRawRecords(snapshot, contexts);
  const recordMap = new Map(records.map(record => [record.endpoint_id, record]));
  const scored = records.map(record => ({
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    provisional_utility_score: utilityScore(record),
    scoring_basis: "STRUCTURAL_DECISION_VALUE_AND_METADATA_COMPLETENESS_NOT_EMPIRICAL_MARKET_UTILITY",
    scope_count: record.candidate_collection_scopes.length,
    source_role_count: record.candidate_source_roles.length,
    value_scope_count: record.value_scope_ids.length,
    intelligence_product_count: record.intelligence_product_ids.length,
    data_field_count: record.required_data_fields_supported.length,
    rights_state: record.rights_state,
    risk_state: record.continuity_risk,
    acquisition_authorized: false
  })).sort((a, b) => b.provisional_utility_score - a.provisional_utility_score || a.endpoint_id.localeCompare(b.endpoint_id));

  const deepTarget = contract.targets.deep_assessments_minimum;
  const deepRecords = scored.slice(0, Math.min(deepTarget, scored.length)).map((score, index) => {
    const source = recordMap.get(score.endpoint_id);
    return {
      assessment_id: `deep-${String(index + 1).padStart(4, "0")}`,
      endpoint_id: source.endpoint_id,
      source_id: source.source_id,
      endpoint_url: source.endpoint_url,
      preliminary_scope_relevance: source.candidate_collection_scopes,
      decision_scope_count: source.decision_scope_ids.length,
      value_scope_ids: source.value_scope_ids,
      source_roles: source.candidate_source_roles,
      utility_score_provisional: score.provisional_utility_score,
      rights_state: source.rights_state,
      commercial_use_state: source.commercial_use_state,
      authority_state: source.authority_state,
      independence_state: source.independence_state,
      freshness_state: source.freshness_state,
      bias_risk: source.bias_risk,
      continuity_risk: source.continuity_risk,
      cost_state: source.cost_state,
      single_source_substitution_contribution: "NOT_MEASURED",
      canonical_identity_contribution: source.candidate_source_roles.includes("PRIMARY_AUTHORITY") ? "CANDIDATE_NOT_VERIFIED" : "NOT_ASSESSED",
      memory_time_depth_contribution: source.latest_metadata_timestamp ? "METADATA_TIMESTAMP_ONLY_NOT_MARKET_HISTORY" : "NOT_ASSESSED",
      source_removal_sensitivity: "NOT_EXECUTED",
      deep_assessment_state: "AUTOMATED_PRELIMINARY_DEEP_REVIEW_HUMAN_AND_TERMS_REVIEW_REQUIRED",
      acquisition_authorized: false,
      production: "HOLD"
    };
  });

  const explicitRights = deepRecords.filter(record => !record.rights_state.startsWith("UNKNOWN"));
  const remaining = deepRecords.filter(record => record.rights_state.startsWith("UNKNOWN"));
  const preflightTarget = contract.targets.rights_access_cost_preflights_minimum;
  const preflightSelected = [...explicitRights, ...remaining].slice(0, Math.min(preflightTarget, deepRecords.length));
  const preflights = preflightSelected.map((record, index) => ({
    preflight_id: `preflight-${String(index + 1).padStart(3, "0")}`,
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    terms_state: "NOT_REVIEWED_IN_LIVE_METADATA_DISCOVERY",
    commercial_use_state: record.commercial_use_state,
    robots_access_state: "NOT_REVIEWED",
    field_level_rights_state: record.rights_state,
    rate_limit_state: "DISCOVERY_PROVIDER_RATE_LIMIT_KNOWN_TARGET_SOURCE_RATE_LIMIT_UNKNOWN",
    technical_access_state: "PUBLIC_METADATA_ENDPOINT_OBSERVED_TARGET_INTERFACE_NOT_VERIFIED",
    cost_state: record.cost_state,
    continuity_state: record.continuity_risk,
    preflight_state: "RECORDED_NOT_PASSED",
    advancement_gate: "MANUAL_OR_AUTOMATED_OFFICIAL_TERMS_AND_ACCESS_REVIEW_REQUIRED",
    acquisition_authorized: false,
    production: "HOLD"
  }));

  const categoryIds = unique(contexts.priority.items.map(item => item.parent_core_domain));
  const preflightMap = new Map(preflights.map(item => [item.endpoint_id, item]));
  const adapterCandidates = [];
  for (const categoryId of categoryIds) {
    const categoryScopeIds = new Set(contexts.priority.items.filter(item => item.parent_core_domain === categoryId).map(item => item.scope_id));
    const candidate = deepRecords
      .filter(record => recordMap.get(record.endpoint_id).candidate_collection_scopes.some(scopeId => categoryScopeIds.has(scopeId)))
      .sort((a, b) => Number(preflightMap.has(b.endpoint_id)) - Number(preflightMap.has(a.endpoint_id)) ||
        b.utility_score_provisional - a.utility_score_provisional)[0];
    if (!candidate) continue;
    adapterCandidates.push({
      adapter_contract_candidate_id: `adapter-candidate-${categoryId}`,
      core_domain_id: categoryId,
      endpoint_id: candidate.endpoint_id,
      source_id: candidate.source_id,
      endpoint_url: candidate.endpoint_url,
      contract_state: preflightMap.has(candidate.endpoint_id)
        ? "BOUNDED_ADAPTER_CONTRACT_CANDIDATE_PREFLIGHT_NOT_PASSED"
        : "BLOCKED_NO_PREFLIGHT_RECORD",
      request_budget: 0,
      schema_contract: "NOT_VERIFIED",
      field_allowlist: [],
      raw_quarantine_first: true,
      fail_closed: true,
      audit_and_recovery_required: true,
      acquisition_authorized: false,
      provider_direct_to_portal: false,
      provider_direct_to_index: false,
      production: "HOLD"
    });
  }

  const laneCoverage = contexts.priority.items.map(lane => {
    const endpointIds = unique(records.filter(record => record.discovery_provenance.some(item => item.lane_id === lane.queue_id)).map(record => record.endpoint_id));
    return {
      lane_id: lane.queue_id,
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      target_unique_source_endpoints: lane.batch_1_targets.unique_source_endpoints,
      discovered_unique_endpoint_count: endpointIds.length,
      endpoint_ids: endpointIds,
      coverage_state: endpointIds.length > 0 ? "CANDIDATE_COVERAGE_PRESENT_NOT_VALIDATED" : "GAP_NO_CANDIDATE_DISCOVERED"
    };
  });

  const providerCounts = Object.fromEntries(unique(records.flatMap(record => record.discovery_provenance.map(item => item.discovery_provider))).map(provider => [
    provider,
    records.filter(record => record.discovery_provenance.some(item => item.discovery_provider === provider)).length
  ]));
  const sourceUniverse = {
    id: "kidults-global-source-universe-batch-001",
    record_type: "global_source_universe_batch",
    version: "1.0.0",
    status: records.length >= contract.targets.unique_source_endpoints_minimum
      ? "DISCOVERY_TARGET_REACHED_CLASSIFICATION_PRELIMINARY"
      : "DISCOVERY_PARTIAL_TARGET_NOT_REACHED",
    observed_at: snapshot.observed_at,
    contract_id: contract.id,
    raw_record_count: snapshot.raw_record_count,
    unique_endpoint_count: records.length,
    discovery_provider_unique_endpoint_counts: providerCounts,
    records,
    basic_classification_coverage: records.length ? records.filter(record => record.classification_completeness === 1).length / records.length : 0,
    content_acquired: false,
    acquisition_authorized: false,
    public_projection: false,
    production: "HOLD"
  };

  const dedup = {
    id: "kidults-endpoint-deduplication-report-batch-001",
    record_type: "endpoint_deduplication_report",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    raw_record_count: snapshot.raw_record_count,
    invalid_endpoint_count: invalid.length,
    invalid_endpoints: invalid,
    valid_raw_endpoint_count: snapshot.raw_record_count - invalid.length,
    unique_normalized_endpoint_count: records.length,
    merged_duplicate_assertion_count: Math.max(0, snapshot.raw_record_count - invalid.length - records.length),
    final_duplicate_endpoint_id_count: records.length - new Set(records.map(record => record.endpoint_id)).size,
    final_duplicate_normalized_url_count: records.length - new Set(records.map(record => record.normalized_endpoint_url)).size,
    owner_and_lineage_independence_not_inferred: true,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const classification = {
    id: "kidults-source-classification-report-batch-001",
    record_type: "source_classification_report",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    required_fields: contract.classification_required_fields,
    record_count: records.length,
    complete_record_count: records.filter(record => record.classification_completeness === 1).length,
    classification_coverage: sourceUniverse.basic_classification_coverage,
    unknown_risk_coerced_to_low: 0,
    records,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const coverage = {
    id: "kidults-scope-role-coverage-matrix-batch-001",
    record_type: "scope_role_coverage_matrix",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    mandatory_lane_count: laneCoverage.length,
    lanes_with_candidate_coverage: laneCoverage.filter(item => item.discovered_unique_endpoint_count > 0).length,
    lanes_without_candidate_coverage: laneCoverage.filter(item => item.discovered_unique_endpoint_count === 0).length,
    records: laneCoverage,
    scope_relevance_validated: false,
    source_pools_ready: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const utility = {
    id: "kidults-source-utility-scorecard-batch-001",
    record_type: "source_utility_scorecard",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    score_model: "STRUCTURAL_DECISION_VALUE_AND_METADATA_COMPLETENESS_V1",
    empirical_market_utility_calibrated: false,
    records: scored,
    deep_assessments: deepRecords,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const risk = {
    id: "kidults-source-risk-register-batch-001",
    record_type: "source_risk_register",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    record_count: records.length,
    unknown_risk_coerced_to_low: 0,
    records: records.map(record => ({
      endpoint_id: record.endpoint_id,
      source_id: record.source_id,
      rights_state: record.rights_state,
      commercial_use_state: record.commercial_use_state,
      bias_risk: record.bias_risk,
      continuity_risk: record.continuity_risk,
      jurisdiction_state: record.jurisdiction_state,
      risk_classification: record.continuity_risk.startsWith("ELEVATED") ? "ELEVATED" : "UNKNOWN_NOT_ASSESSED",
      acquisition_authorized: false
    })),
    acquisition_authorized: false,
    production: "HOLD"
  };

  const preflight = {
    id: "kidults-rights-access-cost-preflight-batch-001",
    record_type: "rights_access_cost_preflight",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    preflight_record_count: preflights.length,
    preflight_pass_count: 0,
    records: preflights,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const adapterQueue = {
    id: "kidults-adapter-contract-queue-batch-001",
    record_type: "bounded_adapter_contract_queue",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    candidate_count: adapterCandidates.length,
    implemented_adapter_count: 0,
    records: adapterCandidates,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const priorityPlan = {
    id: "kidults-acquisition-priority-plan-batch-001",
    record_type: "acquisition_priority_plan",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    state: "DISCOVERY_AND_PREFLIGHT_RESULTS_AVAILABLE_ACQUISITION_BLOCKED",
    lane_priorities: [...laneCoverage]
      .sort((a, b) => a.discovered_unique_endpoint_count - b.discovered_unique_endpoint_count || a.lane_id.localeCompare(b.lane_id))
      .map((lane, index) => ({
        priority_rank: index + 1,
        lane_id: lane.lane_id,
        scope_id: lane.scope_id,
        source_role: lane.source_role,
        discovered_unique_endpoint_count: lane.discovered_unique_endpoint_count,
        next_action: lane.discovered_unique_endpoint_count === 0
          ? "EXPAND_DISCOVERY_QUERY_AND_SOURCE_FAMILY_DIVERSITY"
          : "VALIDATE_SCOPE_RELEVANCE_THEN_DEEP_ASSESS_TOP_CANDIDATES"
      })),
    acquisition_authorized: false,
    market_claim_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "raw-discovery-snapshot.json": snapshot,
    "global-source-universe-batch-001.json": sourceUniverse,
    "endpoint-deduplication-report.json": dedup,
    "source-classification-report.json": classification,
    "scope-role-coverage-matrix.json": coverage,
    "source-utility-scorecard.json": utility,
    "source-risk-register.json": risk,
    "rights-access-cost-preflight.json": preflight,
    "adapter-contract-queue.json": adapterQueue,
    "acquisition-priority-plan.json": priorityPlan
  };
  for (const value of Object.values(outputs)) {
    if (value.snapshot_fingerprint) continue;
    value.fingerprint = fingerprint(value);
  }

  const pass = records.length >= contract.targets.unique_source_endpoints_minimum &&
    sourceUniverse.basic_classification_coverage === 1 &&
    coverage.lanes_with_candidate_coverage === contract.targets.mandatory_scope_source_role_lanes &&
    deepRecords.length >= contract.targets.deep_assessments_minimum &&
    preflights.length >= contract.targets.rights_access_cost_preflights_minimum &&
    adapterCandidates.length >= contract.targets.bounded_adapter_contract_candidates_minimum &&
    dedup.final_duplicate_normalized_url_count === 0;

  const manifest = {
    id: "kidults-asi-discovery-batch-001-run-manifest",
    record_type: "asi_live_discovery_run",
    version: "1.0.0",
    status: pass ? "ASI_DISCOVERY_BATCH_001_TARGET_PASS" : "ASI_DISCOVERY_BATCH_001_PARTIAL",
    observed_at: snapshot.observed_at,
    contract_id: contract.id,
    inputs: {
      raw_snapshot: snapshot.snapshot_fingerprint,
      dos_asi_bridge: bridge["run-manifest.json"].run_fingerprint,
      dos: dos["run-manifest.json"].run_fingerprint
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.snapshot_fingerprint ?? value.fingerprint])),
    raw_records: snapshot.raw_record_count,
    unique_source_endpoints: records.length,
    basic_classification_coverage: sourceUniverse.basic_classification_coverage,
    mandatory_lanes_with_candidate_coverage: coverage.lanes_with_candidate_coverage,
    mandatory_lane_count: coverage.mandatory_lane_count,
    deep_assessments: deepRecords.length,
    preflight_records: preflights.length,
    preflight_passes: 0,
    adapter_contract_candidates: adapterCandidates.length,
    implemented_adapters: 0,
    provider_errors: snapshot.request_or_provider_errors.length,
    discovery_executed: true,
    content_acquired: false,
    acquisition_authorized: false,
    market_claims_created: 0,
    candidate_r2_created: false,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["batch-run-manifest.json"] = manifest;
  return outputs;
}

export function buildFromSnapshot(snapshot, contract = readJson(contractPath), bridge = buildDosAsiExecutionV1(), dos = buildDosV1()) {
  return buildDerivedOutputs(snapshot, contract, bridge, dos);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const contract = readJson(contractPath);
  if (config.target !== null) contract.targets.unique_source_endpoints_minimum = config.target;
  const bridge = buildDosAsiExecutionV1();
  const dos = buildDosV1();
  const snapshot = config.live
    ? await buildLiveSnapshot({ contract, bridge, dos, targetOverride: config.target })
    : readJson(config.replay);
  const outputs = buildDerivedOutputs(snapshot, contract, bridge, dos);
  if (config.write) writeOutputs(config.output, outputs);
  const manifest = outputs["batch-run-manifest.json"];
  console.log(`KIDULTS ASI Discovery Batch 001: ${manifest.status}`);
  console.log(`Raw / unique endpoints: ${manifest.raw_records} / ${manifest.unique_source_endpoints}`);
  console.log(`Mandatory lane coverage: ${manifest.mandatory_lanes_with_candidate_coverage} / ${manifest.mandatory_lane_count}`);
  console.log(`Deep / preflight / adapter candidates: ${manifest.deep_assessments} / ${manifest.preflight_records} / ${manifest.adapter_contract_candidates}`);
  console.log(`Provider errors: ${manifest.provider_errors}`);
  console.log("Content acquisition: false");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
