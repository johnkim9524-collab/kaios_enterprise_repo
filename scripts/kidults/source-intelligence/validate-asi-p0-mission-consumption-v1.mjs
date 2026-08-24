#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-p0-mission-consumption-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readJson = (name) => JSON.parse(readText(name));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const canonicalPayload = (value) => JSON.stringify(stableValue(value));
const sha256Ref = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

assert(contract.id === 'kidults-asi-p0-mission-consumption-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.input_queue?.required_mission_count === 192, 'CONTRACT_MISSION_COUNT');
assert(contract.consumption_model?.missions_consumed_required === 192, 'CONTRACT_CONSUMED_COUNT');
assert(contract.consumption_model?.lane_tasks_required === 576, 'CONTRACT_TASK_COUNT');
assert(contract.consumption_model?.manual_routing_required === false, 'CONTRACT_MANUAL_ROUTING');
assert(contract.consumption_model?.runtime_alignment_preflight_required === true, 'CONTRACT_RUNTIME_PREFLIGHT');
assert(contract.licensed_gap_fill?.normal_autonomous_assignment_allowed === false, 'CONTRACT_LICENSED_GAP_FILL');
assert(contract.truth_boundary?.executes_external_discovery_network_calls === false, 'CONTRACT_NETWORK_BOUNDARY');
assert(contract.truth_boundary?.creates_source_candidates === false, 'CONTRACT_CANDIDATE_BOUNDARY');
assert(contract.truth_boundary?.creates_collection_right === false, 'CONTRACT_RIGHTS_BOUNDARY');
assert(contract.truth_boundary?.admits_evidence === false, 'CONTRACT_ADMISSION_BOUNDARY');
assert(contract.truth_boundary?.creates_market_claim === false, 'CONTRACT_CLAIM_BOUNDARY');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const ledger = readJson('p0-mission-consumption-ledger-v1.json');
const queue = readJson('p0-source-discovery-task-queue-v1.json');
const routing = readJson('p0-discovery-fleet-routing-v1.json');
const manifest = readJson('p0-mission-consumption-manifest-v1.json');

assert(ledger.id === 'kidults-asi-p0-mission-consumption-ledger-v1', 'LEDGER_ID');
assert(ledger.state === 'ALL_CURRENT_MISSIONS_CONSUMED_TO_DISCOVERY_TASKS', 'LEDGER_STATE');
assert(ledger.mission_count === 192 && ledger.missions_consumed === 192 && ledger.receipts?.length === 192, 'LEDGER_MISSION_COUNT');
assert(ledger.mission_consumption_percent === 100, 'LEDGER_CONSUMPTION_PERCENT');
assert(unique(ledger.receipts.map((receipt) => receipt.receipt_id)), 'LEDGER_RECEIPT_DUPLICATE');
assert(unique(ledger.receipts.map((receipt) => receipt.mission_id)), 'LEDGER_MISSION_DUPLICATE');
for (const receipt of ledger.receipts) {
  assert(receipt.state === 'CONSUMED_TO_THREE_DISCOVERY_LANE_TASKS', `LEDGER_RECEIPT_STATE:${receipt.mission_id}`);
  assert(receipt.expected_task_count === 3 && receipt.actual_task_count === 3 && receipt.task_ids?.length === 3, `LEDGER_RECEIPT_TASK_COUNT:${receipt.mission_id}`);
  assert(unique(receipt.task_ids), `LEDGER_RECEIPT_TASK_DUPLICATE:${receipt.mission_id}`);
  assert(JSON.stringify(receipt.lane_slots) === JSON.stringify(contract.consumption_model.lane_slots), `LEDGER_LANE_ORDER:${receipt.mission_id}`);
  assert(receipt.source_candidates_created === 0 && receipt.evidence_admitted === 0 && receipt.market_claims_created === 0, `LEDGER_PROMOTION:${receipt.mission_id}`);
  assert(receipt.public_release === 'HOLD' && receipt.production === 'HOLD', `LEDGER_RELEASE_BOUNDARY:${receipt.mission_id}`);
}
assert(ledger.source_candidates_created === 0 && ledger.evidence_admitted === 0 && ledger.market_claims_created === 0, 'LEDGER_AGGREGATE_PROMOTION');

assert(queue.id === 'kidults-asi-p0-source-discovery-task-queue-v1', 'QUEUE_ID');
assert(queue.state === 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT', 'QUEUE_STATE');
assert(queue.mission_count === 192 && queue.task_count === 576 && queue.tasks?.length === 576, 'QUEUE_TASK_COUNT');
assert(unique(queue.tasks.map((task) => task.task_id)), 'QUEUE_TASK_ID_DUPLICATE');
assert(unique(queue.tasks.map((task) => task.outbox_id)), 'QUEUE_OUTBOX_ID_DUPLICATE');
assert(unique(queue.tasks.map((task) => task.event.event_id)), 'QUEUE_EVENT_ID_DUPLICATE');
assert(queue.external_network_calls_executed === 0 && queue.source_candidates_created === 0, 'QUEUE_EXECUTION_OVERCLAIM');

const tasksByMission = new Map();
const tasksByLane = new Map();
for (const task of queue.tasks) {
  assert(task.state === 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT', `TASK_STATE:${task.task_id}`);
  assert(typeof task.target_fleet === 'string' && task.target_fleet.length > 0, `TASK_FLEET:${task.task_id}`);
  assert(typeof task.queue_binding === 'string' && task.queue_binding.length > 0, `TASK_BINDING:${task.task_id}`);
  assert(typeof task.queue_name === 'string' && task.queue_name.length > 0, `TASK_QUEUE:${task.task_id}`);
  assert(contract.consumption_model.lane_slots.includes(task.lane_slot), `TASK_LANE:${task.task_id}`);
  assert(contract.discovery_fleet_pools[task.lane_slot].includes(task.target_fleet), `TASK_FLEET_POOL:${task.task_id}`);
  assert(task.target_fleet !== contract.licensed_gap_fill.fleet_id, `TASK_LICENSED_FLEET_ASSIGNED:${task.task_id}`);
  assert(task.external_network_call_executed === false && task.source_candidate_created === false, `TASK_EXTERNAL_OR_CANDIDATE_OVERCLAIM:${task.task_id}`);
  assert(task.collection_authorized === false && task.evidence_admitted === false && task.market_claim_authorized === false, `TASK_PERMISSION:${task.task_id}`);
  assert(task.public_release === 'HOLD' && task.production === 'HOLD', `TASK_RELEASE_BOUNDARY:${task.task_id}`);

  const event = task.event;
  assert(event.event_type === contract.event_contract.event_type && event.event_version === contract.event_contract.event_version, `EVENT_TYPE_VERSION:${task.task_id}`);
  assert(event.producer_engine === contract.event_contract.producer_engine && event.producer_version === contract.event_contract.producer_version, `EVENT_PRODUCER:${task.task_id}`);
  assert(event.occurred_at === contract.event_contract.event_clock && event.observed_at === contract.event_contract.event_clock, `EVENT_CLOCK:${task.task_id}`);
  assert(event.assertion_purpose === contract.event_contract.assertion_purpose, `EVENT_PURPOSE:${task.task_id}`);
  assert(event.decision === 'NOT_APPLICABLE' && event.rights_state === 'NOT_APPLICABLE' && event.freshness_state === 'CURRENT', `EVENT_STATE:${task.task_id}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(event.input_snapshot_ref), `EVENT_SNAPSHOT:${task.task_id}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(event.payload_hash), `EVENT_HASH_FORMAT:${task.task_id}`);
  assert(event.payload_hash === sha256Ref(canonicalPayload(event.payload)), `EVENT_PAYLOAD_HASH:${task.task_id}`);
  assert(event.partition?.channel === 'OPEN_MARKET', `EVENT_CHANNEL:${task.task_id}`);
  for (const key of ['region', 'language', 'scope_id', 'source_role', 'canonical_host_hash']) {
    assert(typeof event.partition?.[key] === 'string' && event.partition[key].length > 0, `EVENT_PARTITION:${task.task_id}:${key}`);
  }
  assert(!Object.hasOwn(event.payload, 'target_fleet'), `EVENT_PAYLOAD_TARGET_ROUTING:${task.task_id}`);
  assert(event.payload.mission_id === task.mission_id && event.payload.market_cell_id === task.market_cell_id && event.payload.lane_slot === task.lane_slot, `EVENT_TASK_LINEAGE:${task.task_id}`);
  assert(event.payload.collection_authorized === false && event.payload.evidence_admitted === false && event.payload.market_claim_authorized === false, `EVENT_PAYLOAD_PERMISSION:${task.task_id}`);
  assert(event.payload.provider_direct_to_truth === false && event.payload.provider_direct_to_index === false && event.payload.provider_direct_to_projection === false, `EVENT_PROVIDER_DIRECT_PATH:${task.task_id}`);
  assert(event.payload.external_raw_data_is_owned_moat === false, `EVENT_EXTERNAL_MOAT:${task.task_id}`);
  assert(JSON.stringify(event.payload.query_bundle?.negative_semantic_controls) === JSON.stringify(contract.negative_semantic_controls), `EVENT_SEMANTIC_CONTROLS:${task.task_id}`);
  for (const principle of ['autonomous', 'global', 'irreplaceable_value', 'transparent']) {
    assert(Number(event.payload.four_principle_vector?.[principle]) >= 2, `EVENT_PRINCIPLE_FLOOR:${task.task_id}:${principle}`);
  }
  for (const reason of ['AUTONOMOUS_MISSION_CONSUMED', 'FOUR_PRINCIPLE_HARD_FLOOR_PASS', 'DISCOVERY_ONLY_NO_COLLECTION', 'NO_EVIDENCE_OR_CLAIM_PROMOTION']) {
    assert(event.reason_codes?.includes(reason), `EVENT_REASON:${task.task_id}:${reason}`);
  }
  assert(Array.isArray(event.trace_refs) && event.trace_refs.length >= 4, `EVENT_TRACE_REFS:${task.task_id}`);

  if (!tasksByMission.has(task.mission_id)) tasksByMission.set(task.mission_id, []);
  tasksByMission.get(task.mission_id).push(task);
  if (!tasksByLane.has(task.lane_slot)) tasksByLane.set(task.lane_slot, []);
  tasksByLane.get(task.lane_slot).push(task);
}
assert(tasksByMission.size === 192, 'QUEUE_DISTINCT_MISSIONS');
for (const [missionId, tasks] of tasksByMission) {
  assert(tasks.length === 3, `QUEUE_MISSION_TASK_COUNT:${missionId}`);
  assert(new Set(tasks.map((task) => task.lane_slot)).size === 3, `QUEUE_MISSION_LANE_COVERAGE:${missionId}`);
  const receipt = ledger.receipts.find((item) => item.mission_id === missionId);
  assert(receipt && JSON.stringify([...receipt.task_ids].sort()) === JSON.stringify(tasks.map((task) => task.task_id).sort()), `QUEUE_LEDGER_TASK_BINDING:${missionId}`);
}
for (const laneSlot of contract.consumption_model.lane_slots) {
  assert(tasksByLane.get(laneSlot)?.length === 192, `QUEUE_LANE_TASK_COUNT:${laneSlot}`);
}

assert(routing.id === 'kidults-asi-p0-discovery-fleet-routing-v1', 'ROUTING_ID');
assert(routing.state === 'DETERMINISTIC_RUNTIME_REGISTERED_ROUTING', 'ROUTING_STATE');
assert(routing.assigned_discovery_fleet_count === 11 && routing.total_discovery_fleet_count === 12, 'ROUTING_FLEET_COUNTS');
assert(routing.fleet_summary?.length === 11 && routing.fleet_summary.every((item) => item.task_count > 0 && item.runtime_registered === true), 'ROUTING_FLEET_SUMMARY');
assert(unique(routing.fleet_summary.map((item) => item.fleet_id)), 'ROUTING_FLEET_DUPLICATE');
assert(routing.lane_summary?.length === 3, 'ROUTING_LANE_SUMMARY_COUNT');
for (const lane of routing.lane_summary) {
  assert(lane.task_count === 192 && lane.mission_count === 192 && lane.distinct_fleet_count >= 2, `ROUTING_LANE_SUMMARY:${lane.lane_slot}`);
}
assert(routing.licensed_gap_fill?.fleet_id === contract.licensed_gap_fill.fleet_id && routing.licensed_gap_fill.assigned_task_count === 0, 'ROUTING_LICENSED_BOUNDARY');
assert(routing.manual_routing_required === false && routing.provider_lock_in_created === false, 'ROUTING_AUTONOMY_OR_LOCKIN');

assert(manifest.id === 'kidults-asi-p0-mission-consumption-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'P0_MISSIONS_CONSUMED_AND_DISCOVERY_TASKS_READY', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.results?.missions_available === 192 && manifest.results?.missions_consumed === 192 && manifest.results?.mission_consumption_percent === 100, 'MANIFEST_MISSION_RESULTS');
assert(manifest.results?.discovery_lane_tasks_created === 576 && manifest.results?.runtime_registered_fleets_assigned === 11, 'MANIFEST_TASK_RESULTS');
assert(manifest.results?.optional_licensed_fleet_tasks === 0, 'MANIFEST_LICENSED_TASKS');
assert(manifest.results?.source_candidates_created === 0 && manifest.results?.external_network_calls_executed === 0, 'MANIFEST_EXTERNAL_EXECUTION_OVERCLAIM');
assert(manifest.results?.evidence_admitted === 0 && manifest.results?.market_claims_created === 0, 'MANIFEST_PROMOTION_OVERCLAIM');
assert(manifest.output_files?.length === 3, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const file of manifest.output_files) {
  const content = readText(file.name);
  assert(file.sha256 === sha256Ref(content), `MANIFEST_OUTPUT_DIGEST:${file.name}`);
  assert(file.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${file.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-p0-mission-consumption-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  missions_consumed: 192,
  discovery_lane_tasks_created: 576,
  primary_lane_tasks: 192,
  independent_fallback_lane_tasks: 192,
  factual_origin_replacement_lane_tasks: 192,
  runtime_registered_discovery_fleets_assigned: 11,
  optional_licensed_fleet_tasks: 0,
  source_candidates_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  external_network_calls_executed: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
