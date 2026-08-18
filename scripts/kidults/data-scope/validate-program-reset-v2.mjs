import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/program-reset-category-1000-v1");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const category = read("category-scale-plan.json");
const source = read("source-universe-plan.json");
const fusion = read("provider-fusion-readiness.json");
const roadmap = read("program-roadmap.json");
const manifest = read("run-manifest.json");

assert(manifest?.status === "STRATEGY_AND_SCALE_FOUNDATION_READY", "Strategy reset run state mismatch.");
assert(category?.category_count === 8, "Category scale plan must contain exactly eight Core Domain categories.");
assert(category?.collection_scope_count === 32, "Category scale plan must contain 32 initial Collection Scopes.");
assert(category?.total_qualified_object_target === 8000, "Total qualified object target must be 8,000.");
assert(category?.categories?.every(item => item.qualified_object_target === 1000),
  "Every Core Domain category must target 1,000 qualified objects.");
assert(category?.categories?.every(item => item.current_qualified_objects === null),
  "Unknown current qualified counts must remain null, never zero.");
assert(category?.categories?.every(item => item.current_qualified_objects_status === "NOT_MEASURED"),
  "Unknown current qualified counts must be explicitly NOT_MEASURED.");
assert(category?.categories?.every(item => item.collection_scopes.length === 4),
  "Every Core Domain must contain four initial Collection Scopes.");
assert(category?.categories?.every(item =>
  item.collection_scopes.reduce((sum, scope) => sum + scope.planning_object_target, 0) === 1000),
  "Each category planning allocation must sum to 1,000.");
assert(category?.categories?.every(item =>
  item.collection_scopes.every(scope => scope.allocation_is_index_quota === false)),
  "Collection Scope planning targets must never become Index quotas.");
assert(category?.fixed_index_quota === false, "Category 1000 cannot impose fixed Index quotas.");
assert(category?.dynamic_verticals_downstream === true,
  "Dynamic Verticals must remain downstream market discoveries.");
assert(category?.candidate_r2_authorized === false, "Scale planning cannot authorize Candidate R2.");
assert(category?.indexes_computed === 0, "Scale planning cannot compute Indexes.");
assert(category?.production === "HOLD", "Production must remain HOLD.");

assert(source?.targets?.discovered === null, "Global Source Universe must not use a numeric site target.");
assert(source?.targets?.discovery_mode === "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION",
  "Global Source Universe must continuously enumerate the global open market.");
assert(source?.numeric_site_target_is_prohibited === true,
  "Global Source Universe must prohibit numeric site-count completion claims.");
assert(source?.open_ended_global_open_market_enumeration === true,
  "Global Source Universe enumeration must be open-ended.");
assert(source?.targets?.deep_assessed === 1000, "Deep Source assessment target must be 1,000.");
assert(source?.targets?.rights_access_preflight === 250, "Rights/access preflight target must be 250.");
assert(source?.targets?.bounded_live_adapters === 50, "Bounded-live adapter target must be 50.");
assert(source?.current?.discovered === null, "Unknown current Source count must remain null.");
assert(source?.discovery_does_not_authorize_acquisition === true,
  "Source discovery cannot authorize acquisition.");
assert(source?.bulk_collection_authorized === false, "Bulk collection must remain unauthorized.");

assert(fusion?.direct_provider_to_portal === false, "Provider-to-Portal direct path must be false.");
assert(fusion?.direct_provider_to_index === false, "Provider-to-Index direct path must be false.");
assert(fusion?.provider_id_as_canonical_id === false, "Provider IDs cannot become canonical IDs.");
assert(fusion?.provider_overwrites_self_collected_truth === false,
  "Provider data cannot overwrite self-collected truth.");
assert(fusion?.internal_fusion_authorizes_publication === false,
  "Internal fusion cannot authorize publication.");
assert(fusion?.production === "HOLD", "Provider fusion Production state must remain HOLD.");

assert(Array.isArray(roadmap?.critical_path) &&
  roadmap.critical_path[0] === "VALUE_TO_DATA_SCOPE_FOUNDATION",
  "Critical path must begin with Value-to-Data Scope.");
assert(roadmap?.milestones?.length === 8, "Program roadmap must contain M0 through M7.");
assert(roadmap?.current_official_state?.kidult_500 === "NOT_COMPUTED",
  "KIDULT 500 must remain NOT_COMPUTED.");
assert(roadmap?.current_official_state?.kidult_100 === "NOT_COMPUTED",
  "KIDULT 100 must remain NOT_COMPUTED.");
assert(roadmap?.production === "HOLD", "Roadmap Production state must remain HOLD.");

assert(manifest?.current_data_claims_created === 0, "Strategy reset must create no market claims.");
assert(manifest?.indexes_computed === 0, "Strategy reset must create no Index.");
assert(manifest?.candidate_r2_created === false, "Strategy reset must not create Candidate R2.");
assert(manifest?.public_projection === false, "Strategy reset must not create public Projection.");
assert(manifest?.production === "HOLD", "Strategy reset Production state must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS Program Strategy Reset + Category 1000: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Program Strategy Reset + Category 1000: PASS");
console.log("North Star: IRREPLACEABLE CUSTOMER VALUE");
console.log("Categories / Collection Scopes: 8 / 32");
console.log("Qualified object target: 1,000 per category / 8,000 total");
console.log("Source Universe: CONTINUOUS OPEN-ENDED GLOBAL OPEN-MARKET ENUMERATION");
console.log("Current counts: null / NOT_MEASURED");
console.log("Provider Fusion: governed accelerator, no direct Portal or Index path");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
