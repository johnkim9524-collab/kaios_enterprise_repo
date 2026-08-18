import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const errors = [];

function read(relative, base = registryRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(base, relative), "utf8"));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}

function text(relative) {
  try {
    return fs.readFileSync(path.join(root, relative), "utf8");
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return "";
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const catalog = read("catalog.json");
const autonomousIndex = read("autonomous/index.json");
const autonomous = read("autonomous/records/autonomous-operating-contract-v1.json");
const engineIndex = read("engine/index.json");
const memoryIndex = read("memory/index.json");
const memoryPolicy = read("memory/records/memory-policy-v1.json");
const memoryRun = read("memory/records/memory-foundation-run-r1.json");
const universeIndex = read("universe/index.json");
const universe = read("universe/records/universe-global-collectibles-v1.json");
const coreDomains = read("core-domain/records/core-domain-set-v1.json");
const legacyVertical = read("vertical/index.json");
const entity = read("entity/records/entity-identity-contract-v1.json");
const marketEvent = read("market-event/records/market-event-contract-v1.json");
const marketGraph = read("market-graph/records/market-graph-contract-v1.json");
const cluster = read("cluster/records/cluster-discovery-contract-v1.json");
const dynamicVerticalIndex = read("dynamic-vertical/index.json");
const dynamicVertical = read("dynamic-vertical/records/dynamic-vertical-lifecycle-v1.json");
const indexRegistry = read("index/index.json");
const verticalIndex = read("index/records/index-vertical-intelligence-template-v1.json");
const kidult500 = read("index/records/index-kidult-500-v1.json");
const kidult100 = read("index/records/index-kidult-100-v2.json");
const providerMapping = read("provider-mapping/records/provider-canonical-mapping-contract-v1.json");
const projectionIndex = read("projection/index.json");
const projection = read("projection/records/projection-agci-os-current-v1.json");
const portal = read("apps/kidults-enterprise-staging/public/portal/data/registry-view.json", root);
const compatibility = read("coordination/kidults/architecture/registry-v2-compatibility-map.json", root);
const architecture = text("coordination/kidults/architecture/autonomous-global-collectibles-intelligence-os-v3.1.md");
const memoryArchitecture = text("coordination/kidults/architecture/agci-memory-layer-v1.md");

assert(catalog?.registry_system_version === "2.0.0", "Registry system must be v2.0.0.");
assert(catalog?.catalog_revision === "2.2.0", "Registry v2 catalog revision must be v2.2.0.");
assert(catalog?.first_value === "AUTONOMOUS", "Catalog first value must be AUTONOMOUS.");
for (const required of [
  "autonomous","engine","memory","raw-quarantine","universe","core-domain","entity",
  "market-event","market-graph","cluster","dynamic-vertical","index","provider-mapping","projection"
]) {
  assert(catalog?.registries?.some(item => item.registry_key === required),
    `Catalog missing Registry v2 key: ${required}`);
}

assert(autonomousIndex?.current_record_id === autonomous?.id, "Autonomous current pointer mismatch.");
assert(autonomous?.first_value === "AUTONOMOUS", "Autonomous Operating Contract does not put AUTONOMOUS first.");
assert(autonomous?.quality_targets?.provider_to_portal_direct_paths === 0, "Provider-to-Portal target must be zero.");
assert(autonomous?.human_gates?.includes("PRODUCTION_AUTHORIZATION"), "Production must remain a human gate.");

assert(engineIndex?.status === "FOUNDATION_PREFLIGHT_PASS", "Engine Registry foundation state mismatch.");

assert(memoryIndex?.current_record_id === memoryRun?.id, "Memory Registry current run pointer mismatch.");
assert(memoryIndex?.current_policy_id === memoryPolicy?.id, "Memory Registry current policy pointer mismatch.");
assert(memoryIndex?.status === "MEMORY_FOUNDATION_PASS", "Memory Registry foundation state mismatch.");
assert(memoryPolicy?.storage_model === "APPEND_ONLY_BITEMPORAL", "Memory storage model mismatch.");
assert(memoryPolicy?.correction_model?.in_place_overwrite === false, "Memory must prohibit in-place correction.");
assert(memoryPolicy?.replay_contract?.same_input_same_output === true, "Memory replay must be deterministic.");
assert(memoryPolicy?.direct_memory_to_portal === false, "Memory-to-Portal direct path must be false.");
assert(memoryPolicy?.direct_memory_to_index === false, "Memory-to-Index direct path must be false.");
assert(memoryRun?.deterministic_replay === "PASS", "Memory run deterministic replay mismatch.");
assert(memoryRun?.provenance_coverage === 1, "Memory provenance coverage must be 100%.");
assert(memoryRun?.rights_coverage === 1, "Memory rights coverage must be 100%.");
assert(memoryRun?.bitemporal_coverage === 1, "Memory bitemporal coverage must be 100%.");
assert(memoryRun?.fixture_entries_in_global_universe === false, "Memory fixtures must not enter the Global Universe.");
assert(memoryRun?.indexes_computed === 0, "Memory foundation must compute no Index.");
assert(memoryRun?.production_eligible === false, "Memory foundation must not be Production eligible.");

assert(universeIndex?.record_count === 1, "Exactly one Global Universe must be registered.");
assert(universe?.scope === "GLOBAL_ALL_COLLECTIBLES", "Universe scope must be global collectibles.");
assert(universe?.object_count === null && universe?.object_count_status === "NOT_VERIFIED",
  "Universe object count must not be fabricated.");
assert(universe?.provider_direct_to_portal === false, "Universe contract must prohibit Provider-to-Portal flow.");

assert(coreDomains?.domain_count === 8 && coreDomains?.domains?.length === 8,
  "Core Domains v1 must contain exactly eight Provider-facing domains.");
assert(coreDomains?.not_permanent_market_verticals === true,
  "Core Domains must not be treated as permanent Verticals.");
assert(coreDomains?.fixed_index_allocation === false, "Core Domains must not impose fixed Index allocation.");
assert(legacyVertical?.record_count === 8, "Legacy eight Vertical records must remain intact for compatibility.");
for (const domain of coreDomains?.domains ?? []) {
  assert(legacyVertical?.records?.some(item => item.id === domain.legacy_vertical_id),
    `${domain.id}: legacy Vertical alias does not resolve.`);
}

assert(entity?.identity_types?.join(",") ===
  "SOURCE_RECORD,PHYSICAL_OBJECT,CANONICAL_DESIGN,MARKET_EVENT,EVIDENCE_ASSERTION",
  "Entity identity separation contract mismatch.");
assert(entity?.provider_id_is_canonical_id === false, "Provider IDs cannot become canonical IDs directly.");
assert(marketEvent?.listing_is_sale === false, "Listings must not be treated as sales.");
assert(marketEvent?.direct_portal_projection === false, "Market Events cannot project directly to Portal.");
assert(marketGraph?.provider_category_is_graph_cluster === false,
  "Provider categories cannot define market clusters.");
assert(cluster?.autonomous_recommendation === true && cluster?.autonomous_public_promotion === false,
  "Cluster discovery must recommend autonomously but require human promotion.");
assert(cluster?.minimum_observations === null && cluster?.minimum_observations_status === "NOT_CALIBRATED",
  "Cluster thresholds must not be invented.");

assert(dynamicVerticalIndex?.approved_vertical_count === 0,
  "No Dynamic Vertical may be falsely approved during bootstrap.");
assert(dynamicVertical?.states?.includes("SPLIT") && dynamicVertical?.states?.includes("MERGED"),
  "Dynamic Vertical lifecycle must support market evolution.");
assert(dynamicVertical?.core_domain_is_vertical === false,
  "Core Domain and Dynamic Vertical must remain distinct.");

assert(indexRegistry?.record_count === 3,
  "Index Registry must contain Vertical, KIDULT 500 and KIDULT 100 definitions.");
assert(verticalIndex?.minimum_publishable_constituents === 100,
  "Each publishable Vertical Index must contain at least 100 objects.");
assert(kidult500?.target_constituents === 500 && kidult500?.fixed_core_domain_quota === false,
  "KIDULT 500 contract mismatch.");
assert(kidult100?.target_constituents === 100 && kidult100?.fixed_core_domain_quota === false,
  "KIDULT 100 contract mismatch.");
assert([verticalIndex,kidult500,kidult100].every(
  item => item.constituent_count === null && item.publication_eligible === false),
  "Uncomputed Indexes must remain null and not publishable.");

assert(providerMapping?.provider_role === "MARKET_SENSOR", "Provider role must be MARKET_SENSOR.");
assert(providerMapping?.direct_provider_to_portal === false, "Direct Provider-to-Portal path must be false.");
assert(providerMapping?.direct_provider_to_index === false, "Direct Provider-to-Index path must be false.");
assert(providerMapping?.ingestion_flow?.[1] === "RAW_QUARANTINE",
  "Provider ingestion must enter Raw Quarantine.");

assert(projectionIndex?.current_record_id === projection?.id, "Projection Registry current pointer mismatch.");
assert(projectionIndex?.registry_version === "2.3.0", "Projection Registry version must be v2.3.0.");
assert(projection?.market_funnel_alignment?.contract === "coordination/kidults/architecture/platform-market-funnel-alignment-v1.json",
  "Projection must bind to the canonical platform market funnel.");
assert(projection?.market_funnel_alignment?.repository_canonical_architecture_and_integration_boundary_alignment_percent === 100,
  "Projection must expose 100% canonical architecture/integration-boundary alignment.");
assert(projection?.market_funnel_alignment?.full_52_engine_runtime_implementation_verified === false,
  "Projection must not claim full 52-engine runtime implementation.");
assert(projection?.market_funnel_alignment?.deployed_operational_alignment_percent === 0,
  "Projection must not overclaim deployed operational alignment.");
assert(projection?.autonomous?.first_value === "AUTONOMOUS", "Projection must expose Autonomous first.");
assert(projection?.memory?.current_run_id === memoryRun?.id, "Projection Memory pointer mismatch.");
assert(projection?.memory?.storage_model === "APPEND_ONLY_BITEMPORAL",
  "Projection must expose bitemporal Memory.");
assert(projection?.memory?.deterministic_replay === "PASS",
  "Projection must expose deterministic Memory replay.");
assert(projection?.memory?.direct_memory_to_portal === false,
  "Projection must preserve no direct Memory-to-Portal path.");
assert(projection?.memory?.fixture_entries_in_global_universe === false,
  "Projection must exclude fixture Memory from Universe.");
assert(projection?.memory?.public_projection === false,
  "Projection Memory foundation must remain internal.");
assert(projection?.core_domains?.count === 8, "Projection Core Domain count mismatch.");
assert(projection?.dynamic_verticals?.approved_count === 0,
  "Projection must not fabricate approved Verticals.");
assert(projection?.indexes?.kidult_500?.status === "NOT_COMPUTED",
  "Projection must not fabricate KIDULT 500.");
assert(projection?.indexes?.kidult_100?.status === "NOT_COMPUTED",
  "Projection must not fabricate KIDULT 100.");
assert(projection?.provider?.direct_portal_path === false,
  "Projection must preserve zero direct Provider paths.");
assert(projection?.publication?.production === "HOLD",
  "Projection Production state must remain HOLD.");
assert(projection?.snapshot?.candidate_id === projection?.assessment?.current_snapshot_id,
  "Projection Candidate/Assessment same-ID gate mismatch.");

assert(portal?.source_projection_id === projection?.id,
  "Portal must consume the current Projection Registry record.");
assert(portal?.architecture?.boundary === "PROJECTION_CONSUMER_ONLY",
  "Portal boundary must be Projection consumer only.");
assert(portal?.generated_from?.length === 2 &&
  portal.generated_from.every(item => item.includes("registry/projection")),
  "Portal generated_from must contain Projection Registry sources only.");
assert(portal?.memory?.current_run_id === memoryRun?.id,
  "Portal must consume Memory through Projection.");
assert(portal?.memory?.direct_memory_to_portal === false,
  "Portal must expose no direct Memory path.");
assert(portal?.memory?.public_projection === false,
  "Portal must not expose fixture Memory publicly.");
assert(portal?.provider?.direct_portal_path === false,
  "Portal must expose no direct Provider path.");
assert(portal?.indexes?.kidult_500?.status === "NOT_COMPUTED",
  "Portal must fail closed on KIDULT 500.");
assert(portal?.publication?.production === "HOLD",
  "Portal Production state must remain HOLD.");

assert(compatibility?.strategy === "STRANGLER_PATTERN" && compatibility?.legacy_preservation === true,
  "Compatibility strategy must preserve legacy through Strangler migration.");
assert(architecture.includes("AUTONOMOUS") && architecture.includes("AGCI-OS"),
  "Canonical architecture document is incomplete.");
assert(memoryArchitecture.includes("append-only") &&
  memoryArchitecture.includes("recorded_at") &&
  memoryArchitecture.includes("valid_from"),
  "Memory architecture document is incomplete.");

if (errors.length) {
  console.error(`AGCI-OS Registry v2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Registry v2: PASS");
console.log(`Catalog registries: ${catalog.registries.length}`);
console.log(`Catalog revision: ${catalog.catalog_revision}`);
console.log(`Global Universe: ${universe.id}`);
console.log(`Core Domains: ${coreDomains.domain_count} compatibility interfaces`);
console.log(`Memory: ${memoryRun.status} / ${memoryRun.storage_model}`);
console.log(`Memory replay snapshots: ${memoryRun.replay_snapshot_count}`);
console.log(`Approved Dynamic Verticals: ${dynamicVerticalIndex.approved_vertical_count}`);
console.log(`Vertical Index minimum: ${verticalIndex.minimum_publishable_constituents}`);
console.log(`KIDULT 500: ${kidult500.status}`);
console.log(`KIDULT 100: ${kidult100.status}`);
console.log(`Portal source: ${portal.source_projection_id}`);
console.log("Provider-to-Portal direct paths: 0");
console.log("Memory-to-Portal direct paths: 0");
console.log("Production: HOLD");
