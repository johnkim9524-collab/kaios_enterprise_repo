import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const INFRASTRUCTURE_HOSTS = new Set([
  "doi.org", "github.com", "gitlab.com", "wikidata.org", "wikipedia.org", "archive.org",
  "web.archive.org", "google.com", "bing.com", "yahoo.com"
]);
const SOCIAL_HOSTS = new Set([
  "facebook.com", "instagram.com", "linkedin.com", "pinterest.com", "tiktok.com", "x.com", "twitter.com",
  "youtube.com", "youtu.be", "weibo.com", "reddit.com"
]);
const CORE_MARKET_ROLES = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION", "AUTHENTICATION_CONDITION"]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function normalizeSite(input) {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    return {
      canonical_site_host: host,
      canonical_site_url: `${url.protocol}//${host}`,
      is_social_host: SOCIAL_HOSTS.has(host) || [...SOCIAL_HOSTS].some(value => host.endsWith(`.${value}`)),
      is_infrastructure_host: INFRASTRUCTURE_HOSTS.has(host) || [...INFRASTRUCTURE_HOSTS].some(value => host.endsWith(`.${value}`))
    };
  } catch {
    return null;
  }
}

function readRecords(files) {
  const records = [];
  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    const items = Array.isArray(value) ? value : value.records;
    if (!Array.isArray(items)) throw new Error(`${file}: expected an array or an object with records[].`);
    records.push(...items.map(item => ({ ...item, input_file: path.basename(file) })));
  }
  return records;
}

export function compileCandidates(rawRecords, contract, canonicalScopeRegistry) {
  if (contract.universe_boundary?.numeric_site_target !== null || contract.universe_boundary?.open_ended !== true) {
    throw new Error("Global open-market discovery must be open-ended and quota-free.");
  }
  if (contract.promotion_boundaries?.unknown_rights_authorizes_adapter !== false ||
      contract.promotion_boundaries?.discovery_authorizes_content_collection !== false) {
    throw new Error("Fail-closed rights and collection boundaries are required.");
  }
  const allowedScopes = new Set(canonicalScopeRegistry.records.map(scope => scope.scope_id));
  const allowedRoles = new Set(contract.required_source_roles.map(role => role.role));
  const allowedRegions = new Set(contract.geographic_regions.map(region => region.region_id));
  const channelIds = new Set(contract.discovery_channel_families.map(channel => channel.channel_id));
  const sites = new Map();
  const rejected = [];

  for (let index = 0; index < rawRecords.length; index += 1) {
    const raw = rawRecords[index];
    const url = raw.site_url ?? raw.website_url ?? raw.endpoint_url ?? raw.url;
    const normalized = normalizeSite(url);
    const rejectionReasons = [];
    if (!normalized) rejectionReasons.push("INVALID_OR_NON_PUBLIC_HTTP_SITE_URL");
    if (normalized?.is_social_host) rejectionReasons.push("SOCIAL_PROFILE_HOST_NOT_A_SOURCE_SITE");
    if (normalized?.is_infrastructure_host && raw.actual_source_host !== true) rejectionReasons.push("DISCOVERY_INFRASTRUCTURE_HOST_NOT_THE_ACTUAL_SOURCE");
    const scopes = unique(raw.scope_ids ?? [raw.scope_id]).filter(value => allowedScopes.has(value));
    const roles = unique(raw.source_roles ?? [raw.source_role]).filter(value => allowedRoles.has(value));
    const regions = unique(raw.region_ids ?? [raw.region_id]).filter(value => allowedRegions.has(value));
    const channelId = raw.discovery_channel_id;
    if (!scopes.length) rejectionReasons.push("NO_CANONICAL_SCOPE_MAPPING");
    if (!roles.length) rejectionReasons.push("NO_ALLOWED_SOURCE_ROLE_MAPPING");
    if (!regions.length) rejectionReasons.push("NO_GLOBAL_REGION_MAPPING");
    if (!channelIds.has(channelId)) rejectionReasons.push("UNKNOWN_DISCOVERY_CHANNEL");
    if (!raw.observed_at) rejectionReasons.push("MISSING_OBSERVED_AT");
    if (!raw.provider_record_id) rejectionReasons.push("MISSING_PROVIDER_RECORD_ID");
    if (rejectionReasons.length) {
      rejected.push({ record_index: index, url: url ?? null, reasons: rejectionReasons });
      continue;
    }

    const key = normalized.canonical_site_host;
    const item = sites.get(key) ?? {
      site_id: hashId("site", key),
      canonical_site_host: key,
      canonical_site_urls: new Set(),
      source_names: new Set(),
      scope_ids: new Set(),
      source_roles: new Set(),
      region_ids: new Set(),
      language_codes: new Set(),
      discovery_channel_ids: new Set(),
      assertions: []
    };
    item.canonical_site_urls.add(normalized.canonical_site_url);
    if (raw.source_name) item.source_names.add(raw.source_name);
    scopes.forEach(value => item.scope_ids.add(value));
    roles.forEach(value => item.source_roles.add(value));
    regions.forEach(value => item.region_ids.add(value));
    (raw.language_codes ?? []).forEach(value => item.language_codes.add(value));
    item.discovery_channel_ids.add(channelId);
    item.assertions.push({
      discovery_channel_id: channelId,
      provider_record_id: raw.provider_record_id,
      observed_at: raw.observed_at,
      input_file: raw.input_file ?? null,
      source_url: url,
      classification_basis: raw.classification_basis ?? "DISCOVERY_METADATA_PRELIMINARY"
    });
    sites.set(key, item);
  }

  const records = [...sites.values()].map(item => {
    const roles = [...item.source_roles].sort();
    const record = {
      site_id: item.site_id,
      canonical_site_host: item.canonical_site_host,
      canonical_site_urls: [...item.canonical_site_urls].sort(),
      source_names: [...item.source_names].sort(),
      candidate_scope_ids: [...item.scope_ids].sort(),
      candidate_source_roles: roles,
      candidate_region_ids: [...item.region_ids].sort(),
      language_codes: [...item.language_codes].sort(),
      discovery_channel_ids: [...item.discovery_channel_ids].sort(),
      discovery_assertions: item.assertions.sort((a, b) => `${a.discovery_channel_id}:${a.provider_record_id}`.localeCompare(`${b.discovery_channel_id}:${b.provider_record_id}`)),
      open_market_candidate: roles.some(role => CORE_MARKET_ROLES.has(role)),
      scope_relevance_state: "DISCOVERY_MAPPING_UNREVIEWED",
      owner_and_source_family_state: "NOT_REVIEWED",
      legal_state: "TERMS_ROBOTS_FIELD_RIGHTS_NOT_REVIEWED",
      market_semantics_state: "NOT_REVIEWED",
      freshness_state: "DISCOVERY_OBSERVED_SOURCE_FRESHNESS_NOT_REVIEWED",
      review_state: "QUEUED_FAIL_CLOSED",
      source_pool_state: "NOT_ELIGIBLE",
      acquisition_authorized: false,
      commercial_use_authorized: false,
      market_claim_authorized: false,
      public_projection: false,
      production: "HOLD"
    };
    record.record_fingerprint = fingerprint(record);
    return record;
  }).sort((a, b) => Number(b.open_market_candidate) - Number(a.open_market_candidate) || a.site_id.localeCompare(b.site_id));

  const output = {
    id: "asi-global-open-market-site-candidates-v1",
    record_type: "asi_global_open_market_site_candidate_universe",
    version: "1.0.0",
    status: "DISCOVERY_CANDIDATES_COMPILED_REVIEW_AND_LEGAL_ADMISSION_PENDING",
    contract_id: contract.id,
    raw_assertion_count: rawRecords.length,
    rejected_assertion_count: rejected.length,
    unique_candidate_site_count: records.length,
    open_market_candidate_site_count: records.filter(record => record.open_market_candidate).length,
    directly_relevant_site_count: null,
    legally_admitted_site_count: null,
    source_pool_eligible_site_count: 0,
    records,
    rejected_assertions: rejected,
    site_paths_and_query_variants_count_once: true,
    discovery_does_not_authorize_acquisition: true,
    market_claims_created: 0,
    public_projection: false,
    production: "HOLD"
  };
  output.universe_fingerprint = fingerprint(output);
  return output;
}

function parseArgs(argv) {
  const config = { inputs: [], scopes: null, contract: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") config.inputs.push(path.resolve(argv[++index]));
    else if (argv[index] === "--scopes") config.scopes = path.resolve(argv[++index]);
    else if (argv[index] === "--contract") config.contract = path.resolve(argv[++index]);
    else if (argv[index] === "--output") config.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!config.inputs.length || !config.scopes || !config.contract || !config.output) {
    throw new Error("Required: --input <json> [--input ...] --scopes <canonical registry> --contract <contract> --output <json>.");
  }
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const output = compileCandidates(readRecords(config.inputs), JSON.parse(fs.readFileSync(config.contract, "utf8")), JSON.parse(fs.readFileSync(config.scopes, "utf8")));
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`KIDULTS ASI candidate compiler: ${output.status}`);
  console.log(`Raw / rejected / unique sites / open-market candidates: ${output.raw_assertion_count} / ${output.rejected_assertion_count} / ${output.unique_candidate_site_count} / ${output.open_market_candidate_site_count}`);
  console.log("Direct relevance / legal admission: NOT REVIEWED");
  console.log("Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
