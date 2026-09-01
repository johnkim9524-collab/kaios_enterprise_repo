#!/usr/bin/env node
import fs from 'node:fs';

const queuePath = process.argv[2] || 'out/source-lawful-activation/source-lawful-activation-queue-v1.json';
const programPath = process.argv[3] || 'coordination/kidults/source-intelligence/source-lawful-activation-program-v1.json';
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const array = value => Array.isArray(value) ? value : [];
const laneOrder = new Map(program.activation_queue.sort_order.map((lane, index) => [lane, index]));

assert(program.operating_allocation.discovery_percent === 20, 'DISCOVERY_ALLOCATION_NOT_20');
assert(program.operating_allocation.activation_percent === 80, 'ACTIVATION_ALLOCATION_NOT_80');
assert(program.activation_queue.max_source_purpose_packets === 12, 'ACTIVATION_QUEUE_CAP_NOT_12');
assert(JSON.stringify(program.empirical_ladder.map(stage => stage.minimum_records)) === JSON.stringify([1, 5, 30, 120]), 'EMPIRICAL_LADDER_DRIFT');
assert(program.redundancy_rule.minimum_independent_current_market_source_owners_before_redundancy_claim === 2, 'REDUNDANCY_MINIMUM_DRIFT');
assert(program.authority_boundary.public === 'HOLD' && program.authority_boundary.production === 'HOLD' && program.authority_boundary.g5 === 'HOLD', 'PROGRAM_RELEASE_HOLD_DRIFT');

const requiredFields = [
  'object_identity',
  'sold_date',
  'sold_price',
  'currency',
  'venue_or_source_identity',
  'source_event_id_or_url',
  'observed_at_or_provenance_timestamp'
];
for (const field of requiredFields) {
  assert(program.claim_first_current_sold_contract.minimum_fields.includes(field), `MINIMUM_FIELD_MISSING:${field}`);
}

assert(queue.execution_class === 'CONTROL_ONLY_NO_NETWORK_NO_PROVIDER_AUTHORITY', 'EXECUTION_CLASS_NOT_CONTROL_ONLY');
assert(queue.activation_queue.length <= 12, 'ACTIVATION_QUEUE_EXCEEDS_CAP');
assert(queue.fail_closed_truth.no_external_action_executed === true, 'EXTERNAL_ACTION_BOUNDARY_BROKEN');
assert(queue.fail_closed_truth.lawful_current_sold_records_acquired === 0, 'EMPIRICAL_ACQUISITION_FALSE_GREEN');
assert(queue.fail_closed_truth.current_sold_evidence_admitted === 0, 'EVIDENCE_ADMISSION_FALSE_GREEN');
assert(queue.fail_closed_truth.independent_current_market_source_owners === 0, 'REDUNDANCY_FALSE_GREEN');
assert(queue.funnel.acquired === 0 && queue.funnel.evidence_admitted === 0 && queue.funnel.independent_redundancy === 0, 'FUNNEL_EMPIRICAL_ZERO_DRIFT');
assert(queue.fail_closed_truth.public === 'HOLD' && queue.fail_closed_truth.production === 'HOLD' && queue.fail_closed_truth.g5 === 'HOLD', 'QUEUE_RELEASE_HOLD_DRIFT');

let previousLane = -1;
let previousScore = Number.POSITIVE_INFINITY;
for (const packet of queue.activation_queue) {
  const order = laneOrder.get(packet.lane);
  assert(Number.isInteger(order), `UNKNOWN_LANE:${packet.source_id}`);
  assert(order >= previousLane, `LANE_ORDER_DRIFT:${packet.source_id}`);
  if (order !== previousLane) previousScore = Number.POSITIVE_INFINITY;
  assert(packet.activation_score <= previousScore, `ACTIVATION_SCORE_ORDER_DRIFT:${packet.source_id}`);
  previousLane = order;
  previousScore = packet.activation_score;

  assert(packet.acquisition_authorized === false, `AUTO_ACQUISITION_AUTHORITY_FORBIDDEN:${packet.source_id}`);
  assert(packet.external_contact_authorized === false, `AUTO_CONTACT_AUTHORITY_FORBIDDEN:${packet.source_id}`);
  assert(packet.credential_use_authorized === false, `AUTO_CREDENTIAL_AUTHORITY_FORBIDDEN:${packet.source_id}`);
  assert(packet.spend_authorized === false, `AUTO_SPEND_AUTHORITY_FORBIDDEN:${packet.source_id}`);
  assert(packet.evidence_admitted === false && packet.first_event_state === 'NOT_ACQUIRED', `EMPIRICAL_STATE_FALSE_GREEN:${packet.source_id}`);
  assert(packet.public === 'HOLD' && packet.production === 'HOLD' && packet.g5 === 'HOLD', `PACKET_RELEASE_HOLD_DRIFT:${packet.source_id}`);
  assert(packet.evidence_class === 'CURRENT_SOLD_TRANSACTION', `EVIDENCE_CLASS_DRIFT:${packet.source_id}`);
  assert(array(packet.required_minimum_fields).length >= requiredFields.length, `MINIMUM_FIELDS_INCOMPLETE:${packet.source_id}`);
  assert(typeof packet.rights_receipt_digest === 'string' || packet.rights_receipt_digest === null, `RIGHTS_DIGEST_INVALID:${packet.source_id}`);

  if (packet.lane === 'NO_CONTRACT_FAST_LANE') {
    assert(packet.collector_domain_fit === true, `FAST_LANE_DOMAIN_NOT_COLLECTOR:${packet.source_id}`);
    assert(packet.individual_dated_sold_semantics_candidate === true, `FAST_LANE_SOLD_SEMANTICS_MISSING:${packet.source_id}`);
    assert(packet.rights.collect === 'PASS' && packet.rights.store === 'PASS' && packet.rights.derive === 'PASS', `FAST_LANE_RIGHTS_NOT_PASS:${packet.source_id}`);
    assert(packet.rights.field_purpose_rights_verified === true, `FAST_LANE_FIELD_PURPOSE_RIGHTS_NOT_VERIFIED:${packet.source_id}`);
    assert(packet.rights.commercial_reuse_authorized === true, `FAST_LANE_COMMERCIAL_REUSE_NOT_AUTHORIZED:${packet.source_id}`);
    assert(!Object.entries(packet.access).some(([key, value]) => key.endsWith('_required') && value === true), `FAST_LANE_EXTERNAL_COMMITMENT_REQUIRED:${packet.source_id}`);
    assert(packet.activation_decision === 'ELIGIBLE_FOR_BOUNDED_CANARY_REVIEW', `FAST_LANE_DECISION_DRIFT:${packet.source_id}`);
  }

  if (packet.lane === 'WRITTEN_CLARIFICATION_LANE') {
    assert(packet.activation_decision === 'HOLD_ROUTE_TRACK_Z_WRITTEN_CLARIFICATION', `WRITTEN_LANE_DECISION_DRIFT:${packet.source_id}`);
  }

  if (packet.lane === 'CONTRACT_CREDENTIAL_LANE') {
    assert(packet.activation_decision === 'HOLD_EXPLICIT_OWNER_GATE', `CONTRACT_LANE_DECISION_DRIFT:${packet.source_id}`);
  }
}

for (const packet of queue.dropped_or_wrong_purpose) {
  assert(packet.lane === 'DROP_OR_WRONG_PURPOSE', `DROP_LIST_WRONG_LANE:${packet.source_id}`);
  assert(packet.acquisition_authorized === false && packet.evidence_admitted === false, `DROP_SOURCE_PROMOTED:${packet.source_id}`);
  assert(!queue.activation_queue.some(active => active.source_id === packet.source_id), `DROP_SOURCE_IN_ACTIVATION_QUEUE:${packet.source_id}`);
}

assert(queue.lane_counts.no_contract_fast_lane === queue.fail_closed_truth.rights_clear_collector_current_sold_sources, 'FAST_LANE_TRUTH_COUNT_MISMATCH');
assert(queue.funnel.rights_pass === queue.lane_counts.no_contract_fast_lane, 'RIGHTS_PASS_FUNNEL_MISMATCH');
assert(queue.first_empirical_target.current_completed === 0, 'FIRST_EMPIRICAL_TARGET_FALSE_GREEN');
assert(JSON.stringify(queue.first_empirical_target.canary_ladder.map(stage => stage.minimum_records)) === JSON.stringify([1, 5, 30, 120]), 'QUEUE_CANARY_LADDER_DRIFT');

console.log(`SOURCE_LAWFUL_ACTIVATION_VALIDATION_PASS=1`);
console.log(`ACTIVATION_QUEUE_COUNT=${queue.activation_queue.length}`);
console.log(`FAST_LANE_COUNT=${queue.lane_counts.no_contract_fast_lane}`);
console.log(`WRITTEN_LANE_COUNT=${queue.lane_counts.written_clarification_lane}`);
console.log(`CONTRACT_LANE_COUNT=${queue.lane_counts.contract_credential_lane}`);
console.log(`DROP_COUNT=${queue.lane_counts.drop_or_wrong_purpose}`);
console.log('EMPIRICAL_CURRENT_SOLD_ADMITTED=0');
