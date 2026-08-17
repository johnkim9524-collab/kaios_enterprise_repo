import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildMemoryFoundation, buildMemoryRegistryRun } from "./run-memory-foundation.mjs";

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

const fixture = readJson("coordination/kidults/memory/fixtures/memory-foundation-input-v1.json");
const run = readJson("coordination/kidults/memory/runs/memory-foundation-run-r1.json");
const memoryIndex = readJson("coordination/kidults/registry/memory/index.json");
const policy = readJson("coordination/kidults/registry/memory/records/memory-policy-v1.json");
const registryRun = readJson("coordination/kidults/registry/memory/records/memory-foundation-run-r1.json");
const schema = readJson("coordination/kidults/schemas/agci-memory-entry.schema.json");
const catalog = readJson("coordination/kidults/registry/catalog.json");
const universe = readJson("coordination/kidults/registry/universe/records/universe-global-collectibles-v1.json");
const projection = readJson("coordination/kidults/registry/projection/records/projection-agci-os-current-v1.json");
const portal = readJson("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");
const snapshot = readJson("coordination/kidults/registry/snapshot/index.json");
const assessment = readJson("coordination/kidults/registry/assessment/index.json");
const indexRegistry = readJson("coordination/kidults/registry/index/index.json");
const release = readJson("coordination/kidults/registry/release/index.json");

if (fixture) {
  const expectedRun = buildMemoryFoundation(fixture);
  const expectedRegistryRun = buildMemoryRegistryRun(expectedRun);
  assert(stableJson(run) === stableJson(expectedRun), "Committed Memory run is not deterministic from the fixture.");
  assert(stableJson(registryRun) === stableJson(expectedRegistryRun), "Memory Registry run does not match deterministic output.");

  const rerunA = buildMemoryFoundation(fixture);
  const rerunB = buildMemoryFoundation(fixture);
  assert(stableJson(rerunA) === stableJson(rerunB), "Same Memory input and replay cutoffs must produce identical output.");
  assert(rerunA.run_fingerprint === rerunB.run_fingerprint, "Memory run fingerprints differ for identical input.");
}

assert(memoryIndex?.current_record_id === registryRun?.id, "Memory Registry current run pointer mismatch.");
assert(memoryIndex?.current_policy_id === policy?.id, "Memory Registry policy pointer mismatch.");
assert(memoryIndex?.record_count === 2, "Memory Registry must contain policy and foundation run.");
assert(memoryIndex?.status === "MEMORY_FOUNDATION_PASS", "Memory Registry status mismatch.");

assert(policy?.first_value === "AUTONOMOUS", "Memory Policy must preserve AUTONOMOUS as the first value.");
assert(policy?.storage_model === "APPEND_ONLY_BITEMPORAL", "Memory storage model must be append-only bitemporal.");
assert(policy?.correction_model?.in_place_overwrite === false, "Memory corrections must not overwrite in place.");
assert(policy?.correction_model?.prior_entry_retained === true, "Prior Memory entries must be retained.");
assert(policy?.replay_contract?.same_input_same_output === true, "Memory replay must be deterministic.");
assert(policy?.identity_conflict_disposition === "REVIEW_REQUIRED_NO_AUTO_MERGE", "Identity conflict policy mismatch.");
assert(policy?.direct_memory_to_portal === false, "Direct Memory-to-Portal path must be prohibited.");
assert(policy?.direct_memory_to_index === false, "Direct Memory-to-Index path must be prohibited.");
assert(policy?.public_projection === false, "Memory foundation must not be public.");
assert(policy?.production_eligible === false, "Memory foundation must not be Production eligible.");

assert(run?.status === "MEMORY_FOUNDATION_PASS", "Memory run must pass.");
assert(run?.run_mode === "CONTRACT_FIXTURE_ONLY", "Memory run must remain a contract fixture.");
assert(run?.storage_model === "APPEND_ONLY_BITEMPORAL", "Memory run storage model mismatch.");
assert(run?.deterministic_replay === "PASS", "Memory deterministic replay must pass.");
assert(run?.fail_closed === true, "Memory admission must fail closed.");
assert(run?.input_entry_count === 11, "Memory input count must be 11.");
assert(run?.admitted_entry_count === 8, "Memory admitted count must be 8.");
assert(run?.quarantined_entry_count === 3, "Memory quarantined count must be 3.");
assert(run?.review_required_count === 1, "Memory must surface one identity review.");
assert(run?.supersession_chain_count === 1, "Memory must retain one correction lineage.");
assert(run?.replay_snapshot_count === 3, "Memory must produce three historical replay snapshots.");
assert(run?.memory_type_count === 5, "All five Memory types must be exercised.");
assert(run?.provenance_coverage === 1, "Admitted Memory provenance coverage must be 100%.");
assert(run?.rights_coverage === 1, "Admitted Memory rights coverage must be 100%.");
assert(run?.bitemporal_coverage === 1, "Admitted Memory bitemporal coverage must be 100%.");
assert(/^sha256:[a-f0-9]{64}$/.test(run?.run_fingerprint ?? ""), "Memory run fingerprint is invalid.");

for (const reason of ["PROVENANCE_REFERENCE_MISSING", "RIGHTS_STATE_MISSING", "STALE_MEMORY_ENTRY"]) {
  assert(run?.quarantine_reason_counts?.[reason] === 1, `Memory quarantine reason count mismatch: ${reason}`);
}
assert(run?.quarantined_entries?.every(entry => entry.index_eligible === false), "Quarantined Memory must not be Index eligible.");
assert(run?.quarantined_entries?.every(entry => entry.publication_eligible === false), "Quarantined Memory must not be public.");
assert(run?.review_required?.[0]?.auto_merge === false, "Identity conflicts must not auto-merge.");

const supersession = run?.supersession_chains?.[0];
assert(supersession?.prior_memory_entry_id === "mem-market-sale-001", "Supersession prior entry mismatch.");
assert(supersession?.correction_memory_entry_id === "mem-market-sale-002", "Supersession correction entry mismatch.");
assert(supersession?.overwrite_performed === false && supersession?.prior_entry_retained === true,
  "Supersession must preserve prior truth without overwrite.");

const comparison = run?.replay_comparisons?.[0];
assert(comparison?.changed_assertion_count === 1, "Correction replay must expose exactly one changed assertion.");
assert(comparison?.changes?.[0]?.assertion_key === "entity:design:alpha|SOLD_PRICE_USD", "Replay change key mismatch.");
assert(comparison?.changes?.[0]?.before_value?.amount === 1000, "Before-correction replay value mismatch.");
assert(comparison?.changes?.[0]?.after_value?.amount === 1100, "After-correction replay value mismatch.");
assert(run?.replay_snapshots?.every(item => /^sha256:[a-f0-9]{64}$/.test(item.replay_fingerprint)),
  "Every replay snapshot must have a deterministic fingerprint.");

for (const entry of run?.admitted_entries ?? []) {
  assert(Boolean(entry.valid_from) && Boolean(entry.recorded_at), `${entry.memory_entry_id}: bitemporal fields missing.`);
  assert(Boolean(entry.provenance_reference), `${entry.memory_entry_id}: provenance missing after admission.`);
  assert(Boolean(entry.rights_state), `${entry.memory_entry_id}: rights missing after admission.`);
  assert(entry.immutable === true, `${entry.memory_entry_id}: Memory entry must be immutable.`);
  assert(entry.index_eligible === false && entry.publication_eligible === false && entry.production_eligible === false,
    `${entry.memory_entry_id}: fixture Memory boundary violation.`);
}

const schemaRequired = new Set(schema?.required ?? []);
for (const field of [
  "memory_entry_id", "memory_type", "subject_id", "assertion_type", "value",
  "valid_from", "valid_to", "recorded_at", "freshness_state", "supersedes",
  "source_id", "provenance_reference", "rights_state", "memory_state", "immutable"
]) {
  assert(schemaRequired.has(field), `Memory schema missing required field: ${field}`);
}

assert(catalog?.registry_system_version === "2.0.0", "Registry system major version must remain v2.0.0.");
assert(catalog?.catalog_revision === "2.2.0", "Catalog revision must be v2.2.0 after Memory Layer registration.");
assert(catalog?.registries?.some(item => item.registry_key === "memory"), "Catalog must register the Memory Registry.");

assert(registryRun?.run_fingerprint === run?.run_fingerprint, "Memory Registry run fingerprint mismatch.");
assert(registryRun?.latest_replay_fingerprint === run?.replay_snapshots?.at(-1)?.replay_fingerprint,
  "Memory Registry latest replay pointer mismatch.");
assert(registryRun?.fixture_entries_in_global_universe === false, "Fixture Memory must not inflate the Global Universe.");
assert(registryRun?.indexes_computed === 0, "Memory foundation must compute no Index.");
assert(registryRun?.mutation_performed === false, "Memory foundation must perform no Production mutation.");
assert(registryRun?.immutable === true, "Memory Registry run must be immutable.");

assert(universe?.object_count === null && universe?.object_count_status === "NOT_VERIFIED",
  "Memory fixture must not change the Global Universe count.");
assert(indexRegistry?.records?.every(item => item.status === "CONTRACT_REGISTERED_NOT_COMPUTED"),
  "Memory foundation must not compute Index definitions.");
assert(snapshot?.current_candidate_snapshot_id === "candidate-structural-20260816-r1",
  "Candidate R1 pointer must remain unchanged.");
assert(assessment?.current_assessment_id === "assessment-candidate-structural-20260816-r1-v1",
  "Assessment v1 pointer must remain unchanged.");
assert(release?.status === "HOLD", "Production must remain HOLD.");

assert(projection?.memory?.current_run_id === run?.run_id, "Projection Memory run pointer mismatch.");
assert(projection?.memory?.status === "MEMORY_FOUNDATION_PASS", "Projection Memory status mismatch.");
assert(projection?.memory?.storage_model === "APPEND_ONLY_BITEMPORAL", "Projection Memory storage model mismatch.");
assert(projection?.memory?.deterministic_replay === "PASS", "Projection must expose deterministic Memory replay.");
assert(projection?.memory?.public_projection === false, "Projection must preserve internal-only Memory.");
assert(projection?.memory?.fixture_entries_in_global_universe === false, "Projection must exclude fixture Memory from Universe.");
assert(projection?.memory?.indexes_computed === 0, "Projection Memory must compute no Index.");
assert(projection?.publication?.production === "HOLD", "Projection Production must remain HOLD.");

assert(portal?.source_projection_id === projection?.id, "Portal must consume the current AGCI-OS Projection.");
assert(portal?.architecture?.boundary === "PROJECTION_CONSUMER_ONLY", "Portal must remain a Projection-only consumer.");
assert(portal?.memory?.current_run_id === run?.run_id, "Portal Memory run pointer mismatch.");
assert(portal?.memory?.direct_memory_to_portal === false, "Portal must preserve no direct Memory path.");
assert(portal?.memory?.public_projection === false, "Portal must not expose fixture Memory publicly.");
assert(portal?.indexes?.kidult_500?.status === "NOT_COMPUTED", "Portal must not compute KIDULT 500.");
assert(portal?.indexes?.kidult_100?.status === "NOT_COMPUTED", "Portal must not compute KIDULT 100.");
assert(portal?.publication?.production === "HOLD", "Portal Production must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS Memory Layer: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Memory Layer: PASS");
console.log(`Run: ${run.run_id}`);
console.log(`Input / admitted / quarantined: ${run.input_entry_count} / ${run.admitted_entry_count} / ${run.quarantined_entry_count}`);
console.log(`Review required: ${run.review_required_count}`);
console.log(`Supersession chains: ${run.supersession_chain_count}`);
console.log(`Replay snapshots: ${run.replay_snapshot_count}`);
console.log(`Correction replay: ${comparison.changes[0].before_value.amount} → ${comparison.changes[0].after_value.amount}`);
console.log("Global Universe fixture inflation: 0");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
