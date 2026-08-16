import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildFoundationPreflight, buildQuarantineReport } from "./run-foundation-preflight.mjs";

const root = process.cwd();
const errors = [];
const read = relative => {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
  catch (error) { errors.push(`${relative}: ${error.message}`); return null; }
};
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const assert = (condition, message) => { if (!condition) errors.push(message); };

const fixture = read("coordination/kidults/engine-v2/fixtures/foundation-preflight-input-v1.json");
const run = read("coordination/kidults/engine-v2/runs/engine-foundation-preflight-r1.json");
const engineIndex = read("coordination/kidults/registry/engine/index.json");
const contract = read("coordination/kidults/registry/engine/records/engine-agci-os-v2-contract-v1.json");
const engineRun = read("coordination/kidults/registry/engine/records/engine-foundation-preflight-r1.json");
const quarantineIndex = read("coordination/kidults/registry/raw-quarantine/index.json");
const quarantinePolicy = read("coordination/kidults/registry/raw-quarantine/records/raw-quarantine-policy-v1.json");
const quarantine = read("coordination/kidults/registry/raw-quarantine/records/raw-quarantine-preflight-r1.json");
const catalog = read("coordination/kidults/registry/catalog.json");
const memoryIndex = read("coordination/kidults/registry/memory/index.json");
const universe = read("coordination/kidults/registry/universe/records/universe-global-collectibles-v1.json");
const dynamicVertical = read("coordination/kidults/registry/dynamic-vertical/index.json");
const indexes = read("coordination/kidults/registry/index/index.json");
const projection = read("coordination/kidults/registry/projection/records/projection-agci-os-current-v1.json");
const portal = read("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");

if (fixture) {
  const expectedRun = buildFoundationPreflight(fixture);
  const expectedQuarantine = buildQuarantineReport(expectedRun);
  assert(stable(run) === stable(expectedRun), "Engine fixture output is not deterministic.");
  assert(stable(quarantine) === stable(expectedQuarantine), "Raw Quarantine output is not deterministic.");
}

assert(engineIndex?.current_record_id === engineRun?.id, "Engine Registry pointer mismatch.");
assert(engineIndex?.status === "FOUNDATION_PREFLIGHT_PASS", "Engine Registry status mismatch.");
assert(contract?.first_value === "AUTONOMOUS", "Engine must put AUTONOMOUS first.");
assert(contract?.execution_mode === "DETERMINISTIC_FAIL_CLOSED", "Engine must be deterministic and fail closed.");
assert(contract?.invariants?.missing_to_zero === false, "Missing-to-zero is prohibited.");
assert(contract?.invariants?.provider_to_portal_direct_path === false, "Provider-to-Portal is prohibited.");
assert(contract?.invariants?.provider_to_index_direct_path === false, "Provider-to-Index is prohibited.");
assert(contract?.invariants?.listing_is_sale === false, "Listing must not equal sale.");
assert(contract?.human_gates?.includes("DYNAMIC_VERTICAL_PROMOTION"), "Vertical promotion must be a human gate.");
assert(contract?.human_gates?.includes("PRODUCTION_AUTHORIZATION"), "Production must be a human gate.");

assert(run?.run_mode === "CONTRACT_FIXTURE_ONLY", "Engine run boundary mismatch.");
assert(run?.fixture_classification === "CONTRACT_TEST_FIXTURE_ONLY", "Fixture classification mismatch.");
assert(run?.state === "FOUNDATION_PREFLIGHT_PASS", "Engine state mismatch.");
assert(run?.deterministic === true && run?.fail_closed === true, "Engine determinism/fail-closed mismatch.");
assert(run?.input_record_count === 8 && run?.admitted_record_count === 4 && run?.quarantined_record_count === 4,
  "Engine input/admission/quarantine counts changed.");
assert(run?.manual_review_count === 1, "Engine must surface one identity review.");
assert(run?.market_graph?.sold_transaction_nodes === 1 && run?.market_graph?.listing_nodes === 1,
  "Engine market-event counts changed.");
assert(run?.market_graph?.listing_is_sale === false, "Listing must remain distinct from sale.");
assert(run?.cluster_discovery?.discovered_count === 1, "Engine must retain one test discovery.");
assert(run?.cluster_discovery?.approved_dynamic_vertical_count === 0, "Engine must not approve a Dynamic Vertical.");
assert(run?.index_generation?.vertical_intelligence === "NOT_COMPUTED" &&
  run?.index_generation?.kidult_500 === "NOT_COMPUTED" &&
  run?.index_generation?.kidult_100 === "NOT_COMPUTED", "Engine must not compute Indexes.");
assert(run?.invariants?.production_mutation === false, "Engine must perform no Production mutation.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Engine fingerprint invalid.");

assert(engineRun?.run_fingerprint === run?.run_fingerprint, "Engine Registry fingerprint mismatch.");
assert(engineRun?.kidult_500_state === "NOT_COMPUTED" && engineRun?.kidult_100_state === "NOT_COMPUTED",
  "Engine Registry must preserve uncomputed Indexes.");

assert(quarantineIndex?.current_record_id === quarantine?.id, "Raw Quarantine pointer mismatch.");
assert(quarantinePolicy?.quarantine_disposition === "QUARANTINED_NOT_INDEX_ELIGIBLE",
  "Raw Quarantine disposition mismatch.");
assert(quarantinePolicy?.direct_portal_projection === false && quarantinePolicy?.direct_index_admission === false,
  "Raw Quarantine direct paths must be false.");
assert(quarantine?.quarantined_record_count === 4 && quarantine?.index_eligible_quarantined_records === 0,
  "Raw Quarantine counts changed.");
for (const reason of ["DUPLICATE_SOURCE_RECORD","RIGHTS_STATE_MISSING","PROVENANCE_REFERENCE_MISSING","STALE_OBSERVATION"]) {
  assert(quarantine?.reason_counts?.[reason] === 1, `Raw Quarantine reason mismatch: ${reason}`);
}

assert(catalog?.registry_system_version === "2.0.0", "Registry system major version must remain v2.0.0.");
assert(catalog?.catalog_revision === "2.2.0", "Catalog revision must be v2.2.0.");
for (const key of ["engine","memory","raw-quarantine"]) {
  assert(catalog?.registries?.some(item => item.registry_key === key), `Catalog missing ${key} Registry.`);
}
assert(memoryIndex?.status === "MEMORY_FOUNDATION_PASS", "Memory foundation must coexist with Engine v2.");
assert(universe?.object_count === null && universe?.object_count_status === "NOT_VERIFIED",
  "Fixtures must not inflate the Global Universe.");
assert(dynamicVertical?.approved_vertical_count === 0, "No Dynamic Vertical may be approved by fixtures.");
assert(indexes?.records?.every(item => item.status === "CONTRACT_REGISTERED_NOT_COMPUTED"),
  "Index definitions must remain uncomputed.");

assert(projection?.engine_v2?.current_run_id === run?.run_id, "Projection Engine pointer mismatch.");
assert(projection?.engine_v2?.status === "FOUNDATION_PREFLIGHT_PASS", "Projection Engine status mismatch.");
assert(projection?.engine_v2?.quarantined_record_count === 4, "Projection quarantine count mismatch.");
assert(projection?.engine_v2?.approved_dynamic_vertical_count === 0 &&
  projection?.engine_v2?.indexes_computed === 0, "Projection must preserve Engine fail-closed outputs.");
assert(projection?.publication?.production === "HOLD", "Projection Production must remain HOLD.");

assert(portal?.source_projection_id === projection?.id, "Portal Projection pointer mismatch.");
assert(portal?.engine_v2?.current_run_id === run?.run_id, "Portal Engine pointer mismatch.");
assert(portal?.raw_quarantine?.index_eligible_quarantined_records === 0, "Portal must preserve quarantine exclusion.");
assert(portal?.indexes?.kidult_500?.status === "NOT_COMPUTED" &&
  portal?.indexes?.kidult_100?.status === "NOT_COMPUTED", "Portal must not fabricate Indexes.");
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
console.log(`Memory compatibility: ${memoryIndex.status}`);
console.log("Approved Dynamic Verticals: 0");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
