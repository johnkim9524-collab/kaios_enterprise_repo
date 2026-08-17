import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fetchJson,
  fingerprint,
  hashId,
  normalizeUrl,
  readJson,
  sleep,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "asi-targeted-global-discovery-wave-002-contract-v1.json"
);
const defaultOutput = path.join(
  root,
  "artifacts",
  "agci-os",
  "asi-targeted-global-discovery-wave-002-live"
);

function parseArgs(argv) {
  const config = { waveInput: null, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--wave-input") config.waveInput = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!config.waveInput) throw new Error("--wave-input is required.");
  return config;
}

function findFile(directory, fileName) {
  const direct = path.join(directory, fileName);
  if (fs.existsSync(direct)) return direct;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const location = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(location);
      else if (entry.name === fileName) return location;
    }
  }
  throw new Error(`Required file not found: ${fileName} under ${directory}`);
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function laneOffset(laneId, marketCount) {
  const digest = fingerprint(laneId).slice("sha256:".length);
  return Number.parseInt(digest.slice(0, 8), 16) % marketCount;
}

function rotateMarkets(laneId, markets, count) {
  const offset = laneOffset(laneId, markets.length);
  return Array.from({ length: count }, (_, index) => markets[(offset + index) % markets.length]);
}

function buildQueryPlan(nextWave, contract) {
  const records = [];
  for (const lane of [...nextWave.records].sort((a, b) => a.lane_id.localeCompare(b.lane_id))) {
    const sampling = contract.priority_sampling[lane.priority];
    if (!sampling) throw new Error(`${lane.lane_id}: no sampling rule for ${lane.priority}.`);
    const markets = rotateMarkets(lane.lane_id, contract.target_markets, sampling.query_count);
    const rolePhrase = contract.source_role_query_phrases[lane.source_role];
    if (!rolePhrase) throw new Error(`${lane.lane_id}: no role phrase for ${lane.source_role}.`);
    for (let index = 0; index < markets.length; index += 1) {
      const market = markets[index];
      const searchText = `${lane.collection_scope_name} ${rolePhrase} ${market.query_term}`
        .replace(/\s+/g, " ")
        .trim();
      records.push({
        query_id: `query:${lane.lane_id}:${String(index + 1).padStart(2, "0")}`,
        lane_id: lane.lane_id,
        core_domain_id: lane.core_domain_id,
        collection_scope_id: lane.collection_scope_id,
        collection_scope_name: lane.collection_scope_name,
        source_role: lane.source_role,
        lane_priority: lane.priority,
        query_ordinal: index + 1,
        market_id: market.market_id,
        market_name: market.market_name,
        macro_region: market.macro_region,
        search_text: searchText,
        search_language: contract.discovery_provider.search_language,
        result_limit: sampling.results_per_query,
        planned_result_slots: sampling.results_per_query
      });
    }
  }
  return records;
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker(workerId) {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index, workerId);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, index) => runWorker(index + 1)));
  return results;
}

function apiHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": "KIDULTS-AGCI-OS-ASI-Targeted-Global-Discovery/1.0 (metadata-only; contact via GitHub repository)"
  };
}

async function searchQuery(query, contract) {
  const url = new URL(contract.discovery_provider.api);
  const params = {
    action: contract.discovery_provider.search_action,
    search: query.search_text,
    language: query.search_language,
    uselang: query.search_language,
    limit: String(query.result_limit),
    format: "json",
    origin: "*"
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const { data } = await fetchJson(
      url,
      { headers: apiHeaders() },
      contract.discovery_provider.retry_attempts
    );
    const results = (data.search ?? []).slice(0, query.result_limit).map((record, index) => ({
      query_id: query.query_id,
      lane_id: query.lane_id,
      core_domain_id: query.core_domain_id,
      collection_scope_id: query.collection_scope_id,
      collection_scope_name: query.collection_scope_name,
      source_role: query.source_role,
      lane_priority: query.lane_priority,
      market_id: query.market_id,
      market_name: query.market_name,
      macro_region: query.macro_region,
      search_text: query.search_text,
      search_language: query.search_language,
      result_rank: index + 1,
      entity_id: record.id ?? null,
      matched_label: record.label ?? null,
      matched_description: record.description ?? null,
      matched_aliases: record.aliases ?? [],
      matched_url: record.url ?? null,
      matched_concept_uri: record.concepturi ?? null,
      match_type: record.match?.type ?? null,
      match_language: record.match?.language ?? null,
      match_text: record.match?.text ?? null
    }));
    return {
      query,
      request_state: "SUCCESS",
      actual_result_count: results.length,
      results,
      error: null
    };
  } catch (error) {
    return {
      query,
      request_state: "FAILED_EXPLICIT",
      actual_result_count: 0,
      results: [],
      error: error.message
    };
  } finally {
    await sleep(contract.discovery_provider.minimum_worker_interval_ms);
  }
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function claimValues(entity, propertyId) {
  return (entity?.claims?.[propertyId] ?? [])
    .map(claim => claim?.mainsnak?.datavalue?.value)
    .filter(value => value !== null && value !== undefined);
}

function entityIds(entity, propertyId) {
  return unique(claimValues(entity, propertyId)
    .map(value => typeof value === "object" ? value.id : null)
    .filter(Boolean));
}

function labelMap(entity) {
  return Object.fromEntries(
    Object.entries(entity?.labels ?? {})
      .map(([language, value]) => [language, value?.value ?? null])
      .filter(([, value]) => value)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function descriptionMap(entity) {
  return Object.fromEntries(
    Object.entries(entity?.descriptions ?? {})
      .map(([language, value]) => [language, value?.value ?? null])
      .filter(([, value]) => value)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

async function fetchEntityChunk(ids, contract) {
  const url = new URL(contract.discovery_provider.api);
  const params = {
    action: contract.discovery_provider.entity_action,
    ids: ids.join("|"),
    props: "labels|descriptions|claims",
    languages: contract.discovery_provider.entity_languages.join("|"),
    format: "json",
    origin: "*"
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const { data } = await fetchJson(
      url,
      { headers: apiHeaders() },
      contract.discovery_provider.retry_attempts
    );
    const records = [];
    for (const id of ids) {
      const entity = data.entities?.[id];
      if (!entity || entity.missing !== undefined) continue;
      const officialWebsites = unique(claimValues(entity, contract.discovery_provider.official_website_property)
        .map(value => normalizeUrl(value))
        .filter(Boolean));
      records.push({
        entity_id: id,
        entity_url: `https://www.wikidata.org/wiki/${id}`,
        labels: labelMap(entity),
        descriptions: descriptionMap(entity),
        official_websites: officialWebsites,
        country_entity_ids: entityIds(entity, contract.discovery_provider.country_property),
        headquarters_entity_ids: entityIds(entity, contract.discovery_provider.headquarters_property),
        instance_of_entity_ids: entityIds(entity, contract.discovery_provider.instance_of_property)
      });
    }
    return { request_state: "SUCCESS", ids, records, error: null };
  } catch (error) {
    return { request_state: "FAILED_EXPLICIT", ids, records: [], error: error.message };
  } finally {
    await sleep(contract.discovery_provider.minimum_worker_interval_ms);
  }
}

export async function runTargetedGlobalDiscoveryWave002Live({ waveInput }) {
  const contract = readJson(contractPath);
  const nextWave = readJson(findFile(waveInput, "next-autonomous-source-work-wave-v1.json"));
  const queries = buildQueryPlan(nextWave, contract);
  const searchResponses = await mapLimit(
    queries,
    contract.discovery_provider.request_concurrency,
    query => searchQuery(query, contract)
  );
  const searchResults = searchResponses.flatMap(response => response.results);
  const entityIdList = unique(searchResults.map(record => record.entity_id).filter(Boolean));
  const entityChunks = chunks(entityIdList, contract.discovery_provider.entity_batch_size);
  const entityResponses = await mapLimit(
    entityChunks,
    contract.discovery_provider.request_concurrency,
    ids => fetchEntityChunk(ids, contract)
  );
  const entities = entityResponses.flatMap(response => response.records)
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const entityMap = new Map(entities.map(record => [record.entity_id, record]));
  const resolvedResults = searchResults.map(record => ({
    ...record,
    entity_resolution_state: entityMap.has(record.entity_id) ? "RESOLVED" : "NOT_RESOLVED",
    entity: entityMap.get(record.entity_id) ?? null
  }));

  const output = jsonSafe({
    id: "asi-targeted-global-wave-002-raw-snapshot",
    record_type: "autonomous_targeted_global_discovery_raw_snapshot",
    version: "1.0.0",
    status: "IMMUTABLE_LIVE_METADATA_SNAPSHOT_COMPILE_REQUIRED",
    observed_at: process.env.ASI_WAVE_002_OBSERVED_AT || contract.observed_at,
    contract_id: contract.id,
    provider_id: contract.discovery_provider.provider_id,
    next_wave_input_id: nextWave.id,
    planned_scope_role_lanes: contract.expected_plan.scope_role_lanes,
    planned_queries: contract.expected_plan.planned_queries,
    planned_result_slots: contract.expected_plan.planned_result_slots,
    actual_query_count: queries.length,
    successful_query_count: searchResponses.filter(record => record.request_state === "SUCCESS").length,
    failed_query_count: searchResponses.filter(record => record.request_state !== "SUCCESS").length,
    actual_search_result_count: resolvedResults.length,
    unique_entity_ids: entityIdList.length,
    entity_batch_request_count: entityChunks.length,
    successful_entity_batch_count: entityResponses.filter(record => record.request_state === "SUCCESS").length,
    failed_entity_batch_count: entityResponses.filter(record => record.request_state !== "SUCCESS").length,
    resolved_entity_count: entities.length,
    official_website_claim_count: entities.reduce((sum, record) => sum + record.official_websites.length, 0),
    queries,
    query_responses: searchResponses.map(response => ({
      query_id: response.query.query_id,
      request_state: response.request_state,
      actual_result_count: response.actual_result_count,
      error: response.error
    })),
    entity_batch_responses: entityResponses.map((response, index) => ({
      batch_id: `entity-batch-${String(index + 1).padStart(4, "0")}`,
      request_state: response.request_state,
      requested_entity_count: response.ids.length,
      resolved_entity_count: response.records.length,
      error: response.error
    })),
    results: resolvedResults,
    content_acquired: false,
    rights_cleared: false,
    track_b_qualification_created: 0,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  });
  output.snapshot_fingerprint = fingerprint(output);
  return { "asi-targeted-global-wave-002-raw-snapshot.json": output };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = await runTargetedGlobalDiscoveryWave002Live({ waveInput: config.waveInput });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const snapshot = outputs["asi-targeted-global-wave-002-raw-snapshot.json"];
  console.log("KIDULTS ASI Targeted Global Discovery Wave 002 Live: COMPLETE");
  console.log(`Queries success / failed: ${snapshot.successful_query_count} / ${snapshot.failed_query_count}`);
  console.log(`Planned slots / actual results: ${snapshot.planned_result_slots} / ${snapshot.actual_search_result_count}`);
  console.log(`Unique / resolved entities: ${snapshot.unique_entity_ids} / ${snapshot.resolved_entity_count}`);
  console.log(`Official website claims: ${snapshot.official_website_claim_count}`);
  console.log("Content acquisition: false; Rights cleared: false; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
