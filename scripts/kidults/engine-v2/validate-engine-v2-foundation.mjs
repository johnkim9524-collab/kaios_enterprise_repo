import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildFoundationPreflight, buildQuarantineReport } from "./run-foundation-preflight.mjs";

const root = process.cwd();
const errors = [];

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const fixture = readJson("coordination/kidults/engine-v2/fixtures/foundation-preflight-input-v1.json");
const run = readJson("coordination/kidults/engine-v2/runs/engine-foundation-preflight-r1.json");
const engineIndex = readJson("coordination/kidults/registry/engine/index.json");
const engineContract = readJson("coordination/kidults/registry/engine/records/engine-agci-os-v2-contract-v1.json");
const engineRun = readJson("coordination/kidults/registry/engine/records/engine-foundation-preflight-r1.json");
const quarantineIndex = readJson("coordination/kidults/registry/raw-quarantine/index.json");
const quarantinePolicy = readJson("coordination/kidults/registry/raw-quarantine/records/raw-quarantine-policy-v1.json");
const quarantineReport = readJson("coordination/kidults/registry/raw-quarantine/records/raw-quarantine-preflight-r1.json");
const catalog = readJson("coordination/kidults/registry/catalog.json");
const universe = readJson("coordination/kidults/registry/universe/records/universe-global-collectibles-v1.json");
const dynamicVertical = readJson("coordination/kidults/registry/dynamic-vertical/index.json");
const indexRegistry = readJson("coordination/kidults/registry/index/index.json");
const projection = readJson("coordination/kidults/registry/projection/records/projection-agci-os-current-v1.json");
const portal = readJson("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");

if (fixture) {
  const expectedRun = buildFoundationPreflight(fixture);
  const expectedQuarantine = buildQuarantineReport(expectedRun);
  assert(stableJson(run) === stableJson(expectedRun), "Committed Engine preflight output is not deterministic from the fixture.");
  assert(stableJson(quarantineReport) === stableJson(expectedQuarantine), "Committed Raw Quarantine report is not deterministic from the Engine run.");
}

assert(engineIndex?.current_record_id === engineRun?.id, "Engine Registry current pointer mismatch.");
assert(engineIndex?.status === "FOUNDATION_PREFLIGHT_PASS", "Engine Registry must report FOUNDATION_PREFLIGHT_PASS.");
assert(engineContract?.first_value === "AUTONOMOUS", "Engine contract must put AUTONOMOUS first.");
assert(engineContract?.execution_mode === "DETERMINISTIC_FAIL_CLOSED", "Engine execution mode must be deterministic and fail closed.");
assert(engineContract?.invariants?.missing_to_zero === false, "Engine must prohibit missing-to-zero conversion.");
assert(engineContract?.invariants?.provider_to_portal_direct_path === false, "Engine must prohibit Provider-to-Portal paths.");
assert(engineContract?.invariants?.provider_to_index_direct_path === false, "Engine must prohibit Provider-to-Index paths.");
assert(engineContract?.invariants?.listing_is_sale === false, "Engine must keep listings distinct from sales.");
assert(engineContract?.human_gates?.includes("DYNAMIC_VERTICAL_PROMOTION"), "Dynamic Vertical promotion must remain a human gate.");
assert(engineContract?.human_gates?.includes("PRODUCTION_AUTHORIZATION"), "Production must remain a human gate.");

assert(run?.run_mode === "CONTRACT_FIXTURE_ONLY", "Engine preflight must remain a contract fixture only.");
assert(run?.fixture_classification === "CONTRACT_TEST_FIXTURE_ONLY", "Fixture classification mismatch.");
assert(run?.state === "FOUNDATION_PREFLIGHT_PASS", "Engine preflight state mismatch.");
assert(run?.deterministic === true && run?.fail_closed === true, "Engine preflight must be deterministic and fail closed.");
assert(run?.input_record_count === 8, "Engine preflight input count must be 8.");
assert(run?.admitted_record_count === 4, "Engine preflight admitted count must be 4.");
assert(run?.quarantined_record_count === 4, "Engine preflight quarantine count must be 4.");
assert(run?.manual_review_count === 1, "Engine preflight must surface one identity review.");
assert(run?.market_graph?.sold_transaction_nodes === 1, "Engine preflight must create exactly one sold transaction.");
assert(run?.market_graph?.listing_nodes === 1, "Engine preflight must create exactly one listing.");
assert(run?.market_graph?.listing_is_sale === false, "Listing must never be counted as a sale.");
assert(run?.cluster_discovery?.discovered_count === 1, "Engine preflight must discover one test-only cluster.");
assert(run?.cluster_discovery?.approved_dynamic_vertical_count === 0, "Engine must not autonomously approve a Dynamic Vertical.");
assert(run?.index_generation?.vertical_intelligence === "NOT_COMPUTED", "Vertical Intelligence must remain NOT_COMPUTED.");
assert(run?.index_generation?.kidult_500 === "NOT_COMPUTED", "KIDULT 500 must remain NOT_COMPUTED.");
assert(run?.index_generation?.kidult_100 === "NOT_COMPUTED", "KIDULT 100 must remain NOT_COMPUTED.");
assert(run?.invariants?.production_mutation === false, "Engine preflight must perform no Production mutation.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Engine run fingerprint is invalid.");

assert(engineRun?.run_fingerprint === run?.run_fingerprint, "Engine Registry run fingerprint mismatch.");
assert(engineRun?.input_record_count === run?.input_record_count, "Engine Registry input count mismatch.");
assert(engineRun?.admitted_record_count === run?.admitted_record_count, "Engine Registry admitted count mismatch.");
assert(engineRun?.quarantined_record_count === run?.quarantined_record_count, "Engine Registry quarantine count mismatch.");
assert(engineRun?.discovered_cluster_count === run?.cluster_discovery?.discovered_count, "Engine Registry cluster count mismatch.");
assert(engineRun?.kidult_500_state === "NOT_COMPUTED" && engineRun?.kidult_100_state === "NOT_COMPUTED", "Engine Registry must fail closed on Index outputs.");

assert(quarantineIndex?.current_record_id === quarantineReport?.id, "Raw Quarantine Registry current pointer mismatch.");
assert(quarantinePolicy?.quarantine_disposition === "QUARANTINED_NOT_INDEX_ELIGIBLE", "Quarantine disposition mismatch.");
assert(quarantinePolicy?.direct_portal_projection === false, "Quarantine records must not project directly to Portal.");
assert(quarantinePolicy?.direct_index_admission === false, "Quarantine records must not enter Indexes.");
assert(quarantineReport?.quarantined_record_count === 4, "Raw Quarantine report count mismatch.");
assert(quarantineReport?.index_eligible_quarantined_records === 0, "No quarantined record may be Index eligible.");
for (const reason of ["DUPLICATE_SOURCE_RECORD", "RIGHTS_STATE_MISSING", "PROVENANCE_REFERENCE_MISSING", "STALE_OBSERVATION"]) {
  assert(quarantineReport?.reason_counts?.[reason] === 1, `Quarantine reason count mismatch: ${reason}`);
}

assert(catalog?.registry_system_version === "2.0.0", "Registry system major version must remain v2.0.0 during the Strangler migration.");
assert(catalog?.catalog_revision === "2.1.0", "Catalog revision must advance to v2.1.0 for Engine v2.");
assert(catalog?.registries?.some(item => item.registry_key === "engine"), "Catalog must register the Engine Registry.");
assert(catalog?.registries?.some(item => item.registry_key === "raw-quarantine"), "Catalog must register the Raw Quarantine Registry.");
assert(universe?.object_count === null && universe?.object_count_status === "NOT_VERIFIED", "Contract fixtures must not inflate the Global Universe count.");
assert(dynamicVertical?.approved_vertical_count === 0, "Contract fixture cluster discovery must not approve Dynamic Verticals.");
assert(indexRegistry?.records?.every(item => item.status === "CONTRACT_REGISTERED_NOT_COMPUTED"), "Index Registry definitions must remain uncomputed.");

assert(projection?.engine_v2?.current_run_id === run?.run_id, "Projection Engine v2 run pointer mismatch.");
assert(projection?.engine_v2?.status === "FOUNDATION_PREFLIGHT_PASS", "Projection must expose Engine v2 foundation PASS.");
assert(projection?.engine_v2?.run_mode === "CONTRACT_FIXTURE_ONLY", "Projection must expose the contract-only run boundary.");
assert(projection?.engine_v2?.quarantined_record_count === 4, "Projection quarantine count mismatch.");
assert(projection?.engine_v2?.approved_dynamic_vertical_count === 0, "Projection must not show approved Dynamic Verticals.");
assert(projection?.engine_v2?.indexes_computed === 0, "Projection must not show computed Indexes.");
assert(projection?.raw_quarantine?.current_report_id === quarantineReport?.id, "Projection Raw Quarantine pointer mismatch.");
assert(projection?.publication?.production === "HOLD", "Projection Production must remain HOLD.");

assert(portal?.source_projection_id === projection?.id, "Portal must consume the current AGCI-OS Projection.");
assert(portal?.engine_v2?.current_run_id === run?.run_id, "Portal Engine v2 run pointer mismatch.");
assert(portal?.engine_v2?.status === "FOUNDATION_PREFLIGHT_PASS", "Portal must expose Engine v2 foundation state.");
assert(portal?.engine_v2?.run_mode === "CONTRACT_FIXTURE_ONLY", "Portal must preserve contract-only boundary.");
assert(portal?.raw_quarantine?.index_eligible_quarantined_records === 0, "Portal must preserve quarantine exclusion.");
assert(portal?.indexes?.kidult_500?.status === "NOT_COMPUTED", "Portal must not fabricate KIDULT 500.");
assert(portal?.indexes?.kidult_100?.status === "NOT_COMPUTED", "Portal must not fabricate KIDULT 100.");
assert(portal?.publication?.production === "HOLD", "Portal Production must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS Engine v2 Foundation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Engine v2 Foundation: PASS");
console.log(`Run: ${run.run_id}`);
console.log(`Input / admitted / quarantined: ${run.input_record_count} / ${run.admitted_record_count} / ${run.quarantined_record_count}`);
console.log(`Manual review: ${run.manual_review_count}`);
console.log(`Market events: ${run.market_events.length}`);
console.log(`Discovered test clusters: ${run.cluster_discovery.discovered_count}`);
console.log("Approved Dynamic Verticals: 0");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
