import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const file = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

let registry = null;
try {
  registry = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  errors.push(`collection-scope-registry-v1.json: ${error.message}`);
}

assert(registry?.status === "FOUNDATION_ACTIVE", "Collection Scope Registry state mismatch.");
assert(registry?.governing_value === "IRREPLACEABLE_CUSTOMER_VALUE", "Irreplaceable Value must govern Collection Scopes.");
assert(registry?.scope_count === 32 && registry?.records?.length === 32, "Exactly 32 initial Collection Scopes are required.");
assert(registry?.core_domain_count === 8, "Exactly eight Core Domain compatibility categories are required.");
assert(registry?.qualified_object_target_per_core_domain === 1000, "Each Core Domain must target 1,000 qualified objects.");
assert(registry?.total_qualified_object_target === 8000, "Total qualified-object target must be 8,000.");
assert(registry?.scope_is_collection_unit_not_permanent_vertical === true, "Collection Scope cannot become a permanent Vertical.");
assert(registry?.scope_target_is_not_index_quota === true, "Collection Scope target cannot become an Index quota.");
assert(registry?.common_contract?.unknown_count === "NULL_NOT_ZERO", "Unknown counts must remain null, never zero.");
assert(registry?.common_contract?.provider_id_is_canonical_id === false, "Provider IDs cannot become canonical IDs.");
assert(registry?.common_contract?.automatic_merge_authorized === false, "Automatic entity merge must remain unauthorized.");
assert(registry?.common_contract?.public_scope_metric_before_track_b === false, "Track B must gate public Scope metrics.");
assert(registry?.common_contract?.production === "HOLD", "Production must remain HOLD.");
assert(registry?.common_contract?.required_source_roles?.length >= 7, "Each Scope must require at least seven Source roles.");
assert(registry?.common_contract?.sampling_strata?.length >= 7, "Representative sampling must include at least seven strata.");

const ids = new Set();
const byDomain = new Map();
for (const scope of registry?.records ?? []) {
  assert(typeof scope.scope_id === "string" && scope.scope_id.startsWith("scope-"), "Invalid Scope ID.");
  assert(!ids.has(scope.scope_id), `Duplicate Scope ID: ${scope.scope_id}`);
  ids.add(scope.scope_id);
  assert(scope.planning_object_target === 250, `${scope.scope_id}: planning target must be 250.`);
  assert(typeof scope.definition === "string" && scope.definition.length >= 40, `${scope.scope_id}: object universe definition is incomplete.`);
  assert(Array.isArray(scope.include) && scope.include.length >= 4, `${scope.scope_id}: inclusion criteria are incomplete.`);
  assert(Array.isArray(scope.exclude) && scope.exclude.length >= 2, `${scope.scope_id}: exclusion criteria are incomplete.`);
  assert(Array.isArray(scope.identity_fields) && scope.identity_fields.length >= 8, `${scope.scope_id}: identity model is incomplete.`);
  assert(Array.isArray(scope.known_biases) && scope.known_biases.length >= 3, `${scope.scope_id}: known biases are incomplete.`);
  assert(scope.status === "DEFINED_SOURCE_POOL_NOT_BUILT", `${scope.scope_id}: source-pool state must remain explicit.`);
  byDomain.set(scope.parent_core_domain, (byDomain.get(scope.parent_core_domain) ?? 0) + 1);
}

assert(byDomain.size === 8, "All eight Core Domains must have Collection Scopes.");
for (const [domain, count] of byDomain.entries()) {
  assert(count === 4, `${domain}: must contain four initial Collection Scopes.`);
}
assert([...byDomain.values()].reduce((sum, count) => sum + count * 250, 0) === 8000,
  "Collection Scope planning targets must total 8,000.");

assert(registry?.readiness_summary?.defined === 32, "All 32 Scope definitions must be registered.");
assert(registry?.readiness_summary?.source_pool_ready === 0, "No Scope Source Pool may be falsely marked ready.");
assert(registry?.readiness_summary?.sampling_executed === 0, "Sampling must not be falsely marked executed.");
assert(registry?.readiness_summary?.market_data_poc_ready === 0, "Market Data PoC must not be falsely marked ready.");

if (errors.length) {
  console.error(`AGCI-OS Collection Scope Registry v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Collection Scope Registry v1: PASS");
console.log("Scopes / Core Domains: 32 / 8");
console.log("Planning target: 250 per Scope / 1,000 per category / 8,000 total");
console.log("Source Pools ready: 0 — build next");
console.log("Sampling executed: 0 — never inferred");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
