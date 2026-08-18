import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/asi-global-source-universe-v1");
const errors = [];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function verify(value, field, name) {
  if (!value) return;
  const clone = structuredClone(value);
  const observed = clone[field];
  delete clone[field];
  assert(observed === fingerprint(clone), `${name}: ${field} mismatch.`);
}

const scopes = read("canonical-collection-scope-registry-v2.json");
const crosswalk = read("scope-registry-crosswalk-audit-v1.json");
const frontier = read("global-open-market-scope-role-region-frontier-v1.json");
const legal = read("global-open-market-legal-source-admission-v1.json");
const manifest = read("run-manifest.json");

verify(scopes, "registry_fingerprint", "canonical-collection-scope-registry-v2.json");
verify(crosswalk, "audit_fingerprint", "scope-registry-crosswalk-audit-v1.json");
verify(frontier, "frontier_fingerprint", "global-open-market-scope-role-region-frontier-v1.json");
verify(legal, "admission_fingerprint", "global-open-market-legal-source-admission-v1.json");
verify(manifest, "run_fingerprint", "run-manifest.json");

assert(manifest?.status === "ENGINE_AND_GLOBAL_REVIEW_FRONTIER_READY_LIVE_DISCOVERY_NOT_PROVEN", "Manifest must preserve the live-not-proven boundary.");
assert(manifest?.canonical_scope_count === 32, "Canonical Scope count must be 32.");
assert(manifest?.source_role_count === 7, "Required Source Role count must be seven.");
assert(manifest?.geographic_region_count === 12, "Global region count must be 12.");
assert(manifest?.coverage_cell_count === 2688, "Coverage frontier must contain 32 x 7 x 12 = 2,688 cells.");
assert(manifest?.numeric_site_target === null, "Numeric site targets are prohibited.");
assert(manifest?.discovery_mode === "CONTINUOUS_GLOBAL_OPEN_MARKET_ENUMERATION", "Discovery must be continuous global open-market enumeration.");
assert(manifest?.discovered_unique_sites === null && manifest?.reviewed_unique_sites === null && manifest?.legally_admitted_unique_sites === null,
  "Unexecuted discovery and review counts must remain null, never zero or invented.");
assert(manifest?.source_pools_ready === 0, "No Source Pool may be promoted by a frontier build.");
assert(manifest?.acquisition_authorized === false && manifest?.market_claims_created === 0 && manifest?.indexes_computed === 0,
  "Frontier construction must not authorize acquisition or create market claims or indexes.");
assert(manifest?.production === "HOLD", "Production must remain HOLD.");

assert(scopes?.scope_count === 32 && scopes?.records?.length === 32, "Canonical registry must contain 32 Scopes.");
assert(new Set(scopes?.records?.map(scope => scope.scope_id)).size === 32, "Canonical Scope IDs must be unique.");
assert(scopes?.records?.every(scope => scope.required_region_ids.length === 12 && scope.required_source_roles.length === 7),
  "Every Scope must bind all regions and required Source Roles.");
assert(scopes?.records?.every(scope => scope.discovery_mode === "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION"),
  "Every Scope must use open-ended global discovery.");
assert(scopes?.records?.every(scope => scope.market_rank_state === "NOT_RANKABLE"), "Frontier-only Scopes must remain NOT_RANKABLE.");

assert(crosswalk?.legacy_scope_count === 32 && crosswalk?.legacy_scopes_covered === 32, "All 32 legacy Scopes must be covered.");
assert(crosswalk?.current_scope_count === 32 && crosswalk?.current_scopes_covered === 32, "All 32 current Scopes must be covered.");
assert(crosswalk?.split_records?.length === 2, "Two explicit legacy split records must be preserved.");
assert(crosswalk?.retired_records?.length === 1, "One legacy Scope must be explicitly retired without forced inference.");
assert(crosswalk?.implicit_migrations_allowed === false, "Implicit Scope migration must be prohibited.");

assert(frontier?.coverage_cell_count === 2688 && frontier?.cells?.length === 2688, "Frontier cell count mismatch.");
assert(new Set(frontier?.cells?.map(cell => cell.cell_id)).size === 2688, "Frontier cell IDs must be unique.");
assert(frontier?.numeric_site_target === null && frontier?.discovery_is_open_ended === true, "Frontier must not impose a site quota.");
assert(frontier?.cells?.every(cell => cell.numeric_site_quota === null && cell.discovery_state === "NOT_EXECUTED" && cell.gap_state === "NOT_OBSERVED"),
  "Every unexecuted cell must remain quota-free and NOT_OBSERVED.");
assert(frontier?.cells?.every(cell => cell.acquisition_authorized === false && cell.market_claim_authorized === false),
  "No frontier cell may authorize acquisition or market claims.");
assert(frontier?.cells?.filter(cell => ["LISTING_SUPPLY", "SOLD_TRANSACTION"].includes(cell.source_role))
  .every(cell => cell.market_universe_priority === "CORE_OPEN_MARKET"), "Listing and sold roles must be core open-market roles.");

assert(legal?.status === "ACTIVE_FAIL_CLOSED", "Legal admission contract must be fail-closed.");
assert(legal?.required_legal_fields?.length >= 15, "Legal admission must cover field-level rights, robots, retention, attribution, territory and review timing.");
assert(legal?.unknown_rights_admission === false && legal?.missing_direct_relevance_admission === false && legal?.query_match_only_admission === false,
  "Unknown rights, missing relevance and query-only matches must not be admitted.");
assert(legal?.museum_or_institution_presence_as_market_evidence === false && legal?.listing_as_sold === false,
  "Institution presence and listings must not be promoted to market transactions.");

if (errors.length) {
  console.error(`KIDULTS ASI Global Source Universe: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS ASI Global Source Universe: PASS");
console.log("Canonical Scopes / roles / regions / coverage cells: 32 / 7 / 12 / 2,688");
console.log("Global open-market discovery: CONTINUOUS OPEN-ENDED / NO NUMERIC SITE TARGET");
console.log("Scope migration: 32 legacy covered / 32 current covered / explicit splits and retirement preserved");
console.log("Legal Source admission: FAIL-CLOSED; discovery, review and admission counts remain null");
console.log("Source Pools ready: 0; Acquisition: BLOCKED; Production: HOLD");
