import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/scope-source-pool-foundation-v1");
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

const funnel = read("global-source-discovery-funnel.json");
const readiness = read("scope-source-pool-readiness.json");
const gaps = read("source-role-gap-matrix.json");
const queue = read("acquisition-priority-queue.json");
const manifest = read("run-manifest.json");

assert(manifest?.status === "SOURCE_POOL_FOUNDATION_READY_COLLECTION_BLOCKED",
  "Source Pool foundation run state mismatch.");
assert(manifest?.category_count === 8, "Source Pool foundation must contain eight Core Domain categories.");
assert(manifest?.collection_scope_count === 32, "Source Pool foundation must contain 32 Collection Scopes.");
assert(manifest?.source_universe_target === null, "Global Source Universe must not use a numeric site target.");
assert(manifest?.source_universe_mode === "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION",
  "Global Source Universe must continuously enumerate the global open market.");
assert(manifest?.category_qualified_object_target === 1000,
  "Qualified-object target must be 1,000 per category.");
assert(manifest?.total_qualified_object_target === 8000,
  "Total qualified-object target must be 8,000.");
assert(manifest?.current_qualified_objects === null,
  "Unknown current qualified-object count must remain null.");
assert(manifest?.current_qualified_objects_status === "NOT_MEASURED",
  "Unknown current qualified-object count must be NOT_MEASURED.");
assert(manifest?.known_seed_channel_candidates >= 25,
  "At least the existing 25 Core Domain seed candidates must be represented.");
assert(manifest?.discovery_work_item_count === 224,
  "Discovery queue must contain 32 Scopes x 7 required Source Roles = 224 items.");
assert(manifest?.required_source_role_slots === 224,
  "Required Source Role slot count must be 224.");
assert(manifest?.validated_source_role_slots === 0,
  "No Scope-validated Source Role may be inferred from Core Domain seed candidates.");
assert(manifest?.source_pools_ready === 0,
  "No Source Pool may be marked ready before Scope relevance and risk gates.");
assert(manifest?.market_data_poc_ready_scopes === 0,
  "No Collection Scope may be Market Data PoC-ready at foundation stage.");
assert(manifest?.acquisition_authorized === false,
  "Source discovery foundation must not authorize acquisition.");
assert(manifest?.candidate_r2_created === false,
  "Source Pool foundation must not create Candidate R2.");
assert(manifest?.indexes_computed === 0,
  "Source Pool foundation must not compute Indexes.");
assert(manifest?.public_projection === false,
  "Source Pool foundation must not create a public Projection.");
assert(manifest?.production === "HOLD", "Production must remain HOLD.");

assert(funnel?.targets?.source_channels_discovered === null,
  "Discovery funnel must not use a numeric site target.");
assert(funnel?.targets?.source_discovery_mode === "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION",
  "Discovery funnel must use continuous global open-market enumeration.");
assert(funnel?.targets?.deep_assessments === 1000,
  "Discovery funnel deep-assessment target must be 1,000.");
assert(funnel?.targets?.rights_access_preflights === 250,
  "Discovery funnel rights/access preflight target must be 250.");
assert(funnel?.targets?.bounded_live_adapters === 50,
  "Discovery funnel bounded-live adapter target must be 50.");
assert(funnel?.scope_discovery_allocation_total === null,
  "Open-ended Source discovery must not be allocated as a numeric quota.");
assert(funnel?.numeric_site_target_is_prohibited === true,
  "Source discovery must prohibit numeric completion targets.");
assert(funnel?.scope_deep_assessment_allocation_total === 1000,
  "Scope deep-assessment allocations must sum to 1,000.");
assert(funnel?.scope_rights_preflight_allocation_total === 250,
  "Scope rights/access allocations must sum to 250.");
assert(funnel?.scope_adapter_allocation_total === 50,
  "Scope adapter allocations must sum to 50.");
assert(funnel?.official_rebased_counts?.source_channels_discovered === null,
  "Unmeasured post-reset Source discovery count must remain null.");
assert(funnel?.discovery_authorizes_acquisition === false,
  "Discovery must not authorize acquisition.");
assert(funnel?.bulk_collection_authorized === false,
  "Bulk collection must remain unauthorized.");
assert(funnel?.production === "HOLD", "Source funnel Production state must remain HOLD.");

assert(readiness?.status === "FOUNDATION_READY_ALL_SCOPES_HOLD",
  "Scope readiness report state mismatch.");
assert(readiness?.category_count === 8, "Readiness report category count mismatch.");
assert(readiness?.scope_count === 32, "Readiness report Scope count mismatch.");
assert(readiness?.source_pools_ready === 0, "Source Pools ready must be zero.");
assert(readiness?.market_data_poc_ready_scopes === 0, "Market Data PoC-ready Scopes must be zero.");
assert(readiness?.representative_sampling_runs === 0, "Representative sampling runs must be zero.");
assert(readiness?.current_qualified_object_count === null,
  "Readiness report must not invent a current qualified-object count.");
assert(Array.isArray(readiness?.categories) && readiness.categories.length === 8,
  "Readiness report must contain eight category records.");
assert(readiness?.categories?.every(category => category.collection_scope_count === 4),
  "Every category must contain four Collection Scopes.");
assert(readiness?.categories?.every(category => category.qualified_object_target === 1000),
  "Every category must target 1,000 qualified objects.");
assert(readiness?.categories?.every(category => category.current_qualified_objects === null),
  "Every unknown category count must remain null.");
assert(readiness?.categories?.every(category => category.scope_ready_source_pool_count === 0),
  "No category may infer a ready Source Pool.");
assert(Array.isArray(readiness?.scopes) && readiness.scopes.length === 32,
  "Readiness report must contain 32 Scope records.");
assert(readiness?.scopes?.every(scope => scope.status === "HOLD_SOURCE_POOL_NOT_READY"),
  "Every Collection Scope must remain HOLD_SOURCE_POOL_NOT_READY.");
assert(readiness?.scopes?.every(scope => scope.planning_object_target === 250),
  "Every initial Collection Scope planning target must be 250.");
assert(readiness?.scopes?.every(scope => scope.current_qualified_objects === null),
  "Every unknown Scope count must remain null.");
assert(readiness?.scopes?.every(scope => scope.source_pool_targets.curated_candidates === 10),
  "Every Scope must target at least 10 curated Source candidates.");
assert(readiness?.scopes?.every(scope => scope.source_pool_targets.required_roles === 7),
  "Every Scope must require seven Source Roles.");
assert(readiness?.scopes?.every(scope => scope.scope_ready_candidate_count === 0),
  "Core Domain seeds cannot count as Scope-ready candidates.");
assert(readiness?.scopes?.every(scope => scope.validated_source_roles.length === 0),
  "Core Domain role hints cannot count as validated Scope Role coverage.");
assert(readiness?.scopes?.every(scope => scope.required_role_gap_count === 7),
  "Every Scope must expose all seven unvalidated role gaps.");
assert(readiness?.scopes?.every(scope => scope.acquisition_authorized === false),
  "No Scope may authorize acquisition.");
assert(readiness?.kidult_500 === "NOT_COMPUTED", "KIDULT 500 must remain NOT_COMPUTED.");
assert(readiness?.kidult_100 === "NOT_COMPUTED", "KIDULT 100 must remain NOT_COMPUTED.");
assert(readiness?.production === "HOLD", "Readiness Production state must remain HOLD.");

assert(gaps?.required_role_slot_count === 224, "Role-gap matrix must contain 224 required slots.");
assert(gaps?.validated_role_slot_count === 0, "Validated Source Role slots must be zero.");
assert(gaps?.missing_role_slot_count === 224, "All 224 Scope Role slots must remain validation gaps.");
assert(Array.isArray(gaps?.items) && gaps.items.length === 224,
  "Role-gap matrix must contain 224 work items.");
assert(gaps?.items?.every(item => item.scope_validated_source_count === 0),
  "No role-gap item may infer a Scope-validated source.");
assert(gaps?.items?.every(item => item.gap_state === "MISSING_SCOPE_VALIDATED_ROLE_COVERAGE"),
  "Every role-gap item must preserve the missing validation state.");
assert(gaps?.items?.every(item => Array.isArray(item.query_templates) && item.query_templates.length === 3),
  "Every role-gap item must include three deterministic discovery query templates.");
assert(gaps?.market_claim_authorized === false, "Role-gap foundation cannot authorize market claims.");

assert(queue?.status === "DISCOVERY_QUEUE_READY_ACQUISITION_BLOCKED",
  "Discovery queue state mismatch.");
assert(queue?.work_item_count === 224, "Discovery queue item count must be 224.");
assert(Array.isArray(queue?.items) && queue.items.length === 224,
  "Discovery queue must contain 224 items.");
assert(queue?.items?.every(item => item.queue_state === "DISCOVERY_ONLY"),
  "Every queue item must remain discovery-only.");
assert(queue?.items?.every(item => item.acquisition_authorized === false),
  "No queue item may authorize acquisition.");
assert(queue?.items?.every(item => item.production_eligible === false),
  "No queue item may be Production eligible.");
assert(queue?.acquisition_authorized === false,
  "Discovery priority queue must not authorize acquisition.");
assert(queue?.public_projection === false,
  "Discovery priority queue must not create a public Projection.");
assert(queue?.production === "HOLD", "Discovery queue Production state must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS Scope Source Pool Foundation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Scope Source Pool Foundation: PASS");
console.log("Categories / Collection Scopes: 8 / 32");
console.log(`Known Core Domain seed channels: ${manifest.known_seed_channel_candidates}`);
console.log("Global Source discovery: CONTINUOUS OPEN-ENDED; review capacity floors: 1,000 / 250 / 50");
console.log("Discovery work items: 224 (32 Scopes x 7 required Source Roles)");
console.log("Scope-validated Source Role slots: 0 / 224");
console.log("Source Pools ready: 0; Market Data PoC-ready Scopes: 0");
console.log("Qualified-object target: 1,000 per category / 8,000 total");
console.log("Current qualified counts: null / NOT_MEASURED");
console.log("Acquisition: BLOCKED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
