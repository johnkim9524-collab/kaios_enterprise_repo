import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/dos-asi-execution-v1");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
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

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

const ledger = read("decision-source-requirement-ledger-v1.json");
const queue = read("dos-asi-priority-queue-v1.json");
const batch = read("asi-batch-1-execution-plan-v1.json");
const workload = read("digitalocean-asi-workload-envelope-v1.json");
const gaps = read("dos-asi-gap-register-v1.json");
const manifest = read("run-manifest.json");

assert(manifest?.status === "DOS_TO_ASI_EXECUTION_BRIDGE_PASS", "DOS-to-ASI manifest state must pass.");
assert(ledger?.decision_dna_count === 1769, "DOS-to-ASI must consume all 1,769 Decision DNA records.");
assert(ledger?.represented_decision_dna_count === ledger?.decision_dna_count,
  "Every Decision DNA record must be represented in at least one Source-role lane.");
assert(ledger?.uncovered_decision_dna_count === 0, "Uncovered Decision DNA count must be zero.");
assert(ledger?.collection_scope_count === 32, "Collection Scope count must be 32.");
assert(ledger?.mandatory_lane_count === 224, "Mandatory Scope × Source-role lane count must be 224.");
assert(ledger?.supplemental_lane_count === 96, "Supplemental Scope × Source-role lane count must be 96.");
assert(ledger?.total_lane_count === 320, "Total structural Source-role lane count must be 320.");
assert(ledger?.mandatory_source_roles?.length === 7, "Mandatory Source-role count must be seven.");
assert(ledger?.supplemental_source_roles?.length === 3, "Supplemental Source-role count must be three.");
assert(ledger?.records?.filter(item => item.lane_class === "MANDATORY_BATCH_1").length === 224,
  "Ledger mandatory lane class count mismatch.");
assert(ledger?.records?.filter(item => item.lane_class === "SUPPLEMENTAL_VALUE_TRACEABLE_BACKLOG").length === 96,
  "Ledger supplemental lane class count mismatch.");
assert(ledger?.records?.filter(item => item.lane_class === "MANDATORY_BATCH_1")
  .every(item => item.decision_scope_count > 0),
  "Every mandatory lane must have Decision demand.");
assert(ledger?.records?.filter(item => item.lane_class === "MANDATORY_BATCH_1")
  .every(item => item.role_specific_data_field_count > 0),
  "Every mandatory lane must have role-specific Data Field demand.");
assert(ledger?.records?.every(item => item.acquisition_authorized === false),
  "No ledger lane may authorize acquisition.");
assert(ledger?.actual_source_readiness === null && ledger?.actual_source_readiness_status === "NOT_MEASURED",
  "Actual Source readiness must remain null / NOT_MEASURED.");
assert(ledger?.public_projection === false && ledger?.production === "HOLD",
  "Ledger must remain internal and Production HOLD.");

assert(queue?.status === "DECISION_WEIGHTED_STRUCTURAL_QUEUE_READY_DISCOVERY_NOT_EXECUTED",
  "DOS-to-ASI priority queue state mismatch.");
assert(queue?.mandatory_work_item_count === 224, "Priority queue must contain 224 mandatory items.");
assert(queue?.supplemental_backlog_count === 96, "Priority queue must contain 96 supplemental backlog items.");
assert(queue?.items?.length === 224 && queue?.supplemental_backlog?.length === 96,
  "Priority queue item counts mismatch.");
assert(queue?.items?.every(item => item.structural_priority_rank >= 1 && item.structural_priority_rank <= 224),
  "Mandatory priority ranks must be within 1..224.");
assert(new Set(queue?.items?.map(item => item.structural_priority_rank)).size === 224,
  "Mandatory priority ranks must be unique.");
assert(queue?.items?.every(item => item.query_templates?.length >= 3),
  "Every mandatory queue item must contain discovery query templates.");
assert(queue?.empirical_priority_calibrated === false,
  "Structural queue must not claim empirical priority calibration.");
assert(queue?.acquisition_authorized === false && queue?.public_projection === false && queue?.production === "HOLD",
  "Priority queue must not authorize acquisition, public projection or Production.");

assert(batch?.status === "PLAN_READY_EXECUTION_NOT_STARTED", "ASI Batch 1 plan state mismatch.");
assert(batch?.targets?.unique_source_endpoint_discovery_target === 2000, "Batch 1 discovery target must be 2,000.");
assert(batch?.targets?.deep_assessment_target === 200, "Batch 1 deep-assessment target must be 200.");
assert(batch?.targets?.rights_access_cost_preflight_target === 50, "Batch 1 preflight target must be 50.");
assert(batch?.targets?.bounded_adapter_contract_target === 8, "Batch 1 adapter target must be eight.");
assert(sum(queue?.items ?? [], item => item.batch_1_targets.unique_source_endpoints) === 2000,
  "Allocated discovery targets must sum to 2,000.");
assert(sum(queue?.items ?? [], item => item.batch_1_targets.deep_assessments) === 200,
  "Allocated deep-assessment targets must sum to 200.");
assert(sum(queue?.items ?? [], item => item.batch_1_targets.rights_access_cost_preflights) === 50,
  "Allocated preflight targets must sum to 50.");
assert(sum(queue?.items ?? [], item => item.batch_1_targets.bounded_adapter_contracts) === 8,
  "Allocated adapter targets must sum to eight.");
assert(queue?.items?.every(item => item.batch_1_targets.unique_source_endpoints >= 1),
  "Every mandatory lane must receive at least one discovery target.");
assert(batch?.category_allocations?.length === 8, "Batch plan must contain eight category allocations.");
assert(batch?.scope_allocations?.length === 32, "Batch plan must contain 32 Scope allocations.");
assert(batch?.scope_allocations?.every(item => item.deep_assessment_target >= 1),
  "Every Collection Scope must receive at least one deep-assessment target.");
assert(batch?.category_allocations?.every(item => item.preflight_target >= 1),
  "Every category must receive at least one preflight target.");
assert(batch?.category_allocations?.every(item => item.adapter_target === 1),
  "Every category must receive exactly one initial adapter target.");
assert(batch?.adapter_prerequisite_pass === true, "Adapter prerequisite nesting must pass.");
assert(batch?.actual?.unique_source_endpoints === null && batch?.actual?.status === "NOT_EXECUTED",
  "Batch actuals must remain null / NOT_EXECUTED.");
assert(batch?.discovery_authorized === true, "Decision-aligned Source discovery must be authorized.");
assert(batch?.bulk_acquisition_authorized === false && batch?.market_claim_authorized === false,
  "Batch plan must not authorize bulk acquisition or market claims.");
assert(batch?.production === "HOLD", "Batch plan Production state must remain HOLD.");

assert(workload?.status === "WORKLOAD_DEFINED_TECHNICAL_BINDING_AND_SIZING_PENDING",
  "DigitalOcean workload envelope state mismatch.");
assert(workload?.digitalocean_commercial_state === "FOUNDER_CONFIRMED_CONTRACTED",
  "DigitalOcean commercial state must be contracted.");
assert(workload?.digitalocean_technical_binding === "NOT_VERIFIED",
  "DigitalOcean technical binding must remain NOT_VERIFIED until evidence exists.");
assert(workload?.workload?.mandatory_queue_items === 224 && workload?.workload?.supplemental_backlog_items === 96,
  "DigitalOcean queue workload counts mismatch.");
assert(workload?.workload?.source_discovery_operations === 2000,
  "DigitalOcean discovery workload must equal Batch 1 target.");
assert(workload?.sizing?.worker_concurrency === null && workload?.sizing?.worker_concurrency_status === "NOT_MEASURED",
  "DigitalOcean worker sizing must not be invented.");
assert(workload?.sizing?.resource_sizing_without_measurement === false,
  "Resource sizing without measurement must be false.");
assert(workload?.production_mutations_authorized === false && workload?.production === "HOLD",
  "DigitalOcean workload must not authorize Production mutation.");

assert(gaps?.status === "STRUCTURAL_BRIDGE_PASS_OPERATIONAL_EXECUTION_GAPS_ACTIVE",
  "DOS-to-ASI gap state mismatch.");
assert(gaps?.structural_gap_count === 0, "DOS-to-ASI structural gap count must be zero.");
assert(gaps?.operational_gap_count >= 8, "Operational execution gaps must be disclosed.");
assert(gaps?.unknown_requirement_coerced_to_known === 0, "Unknown requirements cannot be coerced to known.");
assert(gaps?.unknown_risk_coerced_to_low === 0, "Unknown risk cannot be coerced to low.");
assert(gaps?.candidate_r2 === "BLOCKED", "Candidate R2 must remain blocked.");
assert(gaps?.kidult_500 === "NOT_COMPUTED" && gaps?.kidult_100 === "NOT_COMPUTED",
  "KIDULT 500/100 must remain NOT_COMPUTED.");
assert(gaps?.production === "HOLD", "Gap register Production state must remain HOLD.");

for (const [name, value] of [
  ["decision-source-requirement-ledger-v1.json", ledger],
  ["dos-asi-priority-queue-v1.json", queue],
  ["asi-batch-1-execution-plan-v1.json", batch],
  ["digitalocean-asi-workload-envelope-v1.json", workload],
  ["dos-asi-gap-register-v1.json", gaps]
]) {
  if (!value) continue;
  const copy = { ...value };
  delete copy.fingerprint;
  assert(value.fingerprint === fingerprint(copy), `${name}: fingerprint mismatch.`);
  assert(manifest?.outputs?.[name] === value.fingerprint, `${name}: manifest output pointer mismatch.`);
}

assert(manifest?.decision_dna_count === 1769 && manifest?.represented_decision_dna_count === 1769,
  "Manifest Decision DNA coverage mismatch.");
assert(manifest?.mandatory_lane_count === 224 && manifest?.supplemental_lane_count === 96,
  "Manifest lane count mismatch.");
assert(manifest?.batch_1_targets?.unique_source_endpoints === 2000,
  "Manifest Batch 1 discovery target mismatch.");
assert(manifest?.digitalocean_commercial_state === "FOUNDER_CONFIRMED_CONTRACTED",
  "Manifest DigitalOcean commercial state mismatch.");
assert(manifest?.digitalocean_technical_binding === "NOT_VERIFIED",
  "Manifest DigitalOcean binding state mismatch.");
assert(manifest?.structural_gap_count === 0, "Manifest structural gap count must be zero.");
assert(manifest?.discovery_executed === false && manifest?.acquisition_authorized === false,
  "Manifest must show discovery not executed and acquisition blocked.");
assert(manifest?.market_claims_created === 0 && manifest?.indexes_computed === 0,
  "Bridge must create no market claim or Index.");
assert(manifest?.candidate_r2_created === false && manifest?.public_projection === false,
  "Bridge must not create Candidate R2 or public projection.");
assert(manifest?.production === "HOLD", "Manifest Production state must remain HOLD.");

if (errors.length) {
  console.error(`KIDULTS DOS-to-ASI Execution Bridge v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS DOS-to-ASI Execution Bridge v1: PASS");
console.log("Decision DNA represented: 1,769 / 1,769");
console.log("Collection Scopes: 32");
console.log("Mandatory / supplemental lanes: 224 / 96");
console.log("Batch 1: 2,000 discoveries / 200 deep / 50 preflights / 8 adapters");
console.log("DigitalOcean: CONTRACTED / TECHNICAL BINDING NOT_VERIFIED");
console.log("Structural gaps: 0; Operational execution gaps: disclosed");
console.log("Discovery: NOT_EXECUTED; Acquisition: BLOCKED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
