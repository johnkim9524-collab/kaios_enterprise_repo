#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [
  outputDir = '/tmp/kidults-asi-mission-directed-discovery-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-directed-discovery-contract-v1.json'
] = process.argv.slice(2);
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const discovery = JSON.parse(fs.readFileSync(path.join(outputDir, 'mission-directed-discovery-v1.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(outputDir, 'mission-directed-discovery-cycle-state-v1.json'), 'utf8'));
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const laneIds = contract.provider_lanes.map((lane) => lane.lane_id);
const requiredCandidateFields = contract.candidate_required_fields;
const unique = (values) => new Set(values).size === values.length;
const allowedReceiptStates = new Set(['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'FAILED']);
const allowedLaneStates = new Set(['SUCCESS_WITH_RESULTS', 'SUCCESS_ZERO_RESULTS', 'PARTIAL_SUCCESS', 'FAILED', 'NOT_SCHEDULED_THIS_CYCLE']);

assert(contract.id === 'kidults-asi-mission-directed-discovery-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.cycle_policy?.default_batch_size === 24, 'CONTRACT_BATCH_SIZE');
assert(contract.cycle_policy?.minimum_healthy_provider_lanes === 1, 'CONTRACT_HEALTH_FLOOR');
assert(contract.cycle_policy?.zero_candidate_cycle_is_terminal_observation === true, 'CONTRACT_ZERO_CANDIDATE_TERMINAL');
assert(contract.truth_boundary?.live_public_metadata_requests_executed === true, 'CONTRACT_LIVE_REQUESTS');
assert(contract.truth_boundary?.target_source_body_traversed === false, 'CONTRACT_TARGET_BODY');
assert(contract.truth_boundary?.collection_right_created === false, 'CONTRACT_RIGHTS');

assert(discovery.id === 'kidults-asi-mission-directed-public-metadata-discovery-v1', 'DISCOVERY_ID');
assert(discovery.version === '1.0.0', 'DISCOVERY_VERSION');
const zeroCandidateTerminal = discovery.candidate_count === 0;
assert(discovery.status === (zeroCandidateTerminal ? contract.cycle_policy.zero_candidate_terminal_status : 'SHADOW_MISSION_DIRECTED_PUBLIC_METADATA_DISCOVERY_COMPLETE'), 'DISCOVERY_STATUS');
assert(discovery.contract_id === contract.id && discovery.contract_version === contract.version, 'DISCOVERY_CONTRACT_BINDING');
assert(Number.isInteger(discovery.cycle_number) && discovery.cycle_number >= 1, 'DISCOVERY_CYCLE');
assert(Number.isInteger(discovery.total_intent_count) && discovery.total_intent_count >= 1, 'DISCOVERY_TOTAL_INTENTS');
assert(Number.isInteger(discovery.batch_size) && discovery.batch_size >= contract.cycle_policy.minimum_batch_size && discovery.batch_size <= contract.cycle_policy.maximum_batch_size, 'DISCOVERY_BATCH_SIZE');
assert(Number.isInteger(discovery.cursor_start) && discovery.cursor_start >= 0 && discovery.cursor_start < discovery.total_intent_count, 'DISCOVERY_CURSOR_START');
assert(Number.isInteger(discovery.cursor_next) && discovery.cursor_next >= 0 && discovery.cursor_next < discovery.total_intent_count, 'DISCOVERY_CURSOR_NEXT');
assert(discovery.attempted_intent_count === discovery.batch_size, 'DISCOVERY_ATTEMPTED_COUNT');
assert(discovery.intent_receipts?.length === discovery.attempted_intent_count, 'DISCOVERY_RECEIPT_COUNT');
assert(discovery.successful_intent_count + discovery.failed_intent_count === discovery.attempted_intent_count, 'DISCOVERY_RESULT_COUNT');
assert(discovery.partial_failure_state === (discovery.failed_intent_count > 0 ? 'PARTIAL_PROVIDER_FAILURE_VISIBLE' : 'NONE'), 'DISCOVERY_PARTIAL_FAILURE_STATE');
assert(discovery.candidate_count === discovery.candidates?.length && discovery.candidate_count >= 0, 'DISCOVERY_CANDIDATE_COUNT');
if (zeroCandidateTerminal) {
  assert(discovery.zero_candidate_terminal === true && discovery.zero_candidate_reason === 'ALL_BOUNDED_PROVIDER_LANES_RETURNED_ZERO', 'DISCOVERY_ZERO_CANDIDATE_RECEIPT');
  assert(discovery.primary_discovery_fallback_used === true && discovery.candidates.length === 0, 'DISCOVERY_ZERO_CANDIDATE_FALLBACK');
} else {
  assert(discovery.candidate_count >= contract.cycle_policy.minimum_live_candidates_per_successful_cycle && discovery.zero_candidate_terminal !== true, 'DISCOVERY_SUCCESS_CANDIDATE_FLOOR');
}
assert(discovery.healthy_provider_lanes >= contract.cycle_policy.minimum_healthy_provider_lanes, 'DISCOVERY_HEALTHY_LANES');
assert(discovery.lane_health?.length === laneIds.length, 'DISCOVERY_LANE_COUNT');
assert(unique(discovery.intent_receipts.map((receipt) => receipt.receipt_id)), 'DISCOVERY_RECEIPT_DUPLICATE');
assert(unique(discovery.candidates.map((candidate) => candidate.candidate_id)), 'DISCOVERY_CANDIDATE_DUPLICATE');
assert(unique(discovery.candidates.map((candidate) => `${candidate.mission_discovery_intent_id}|${candidate.endpoint_url}`)), 'DISCOVERY_MISSION_ENDPOINT_DUPLICATE');

for (const lane of discovery.lane_health) {
  assert(laneIds.includes(lane.lane_id), `DISCOVERY_UNKNOWN_LANE:${lane.lane_id}`);
  assert(allowedLaneStates.has(lane.status), `DISCOVERY_LANE_STATE:${lane.lane_id}`);
  assert(Number.isInteger(lane.attempted_intents) && lane.attempted_intents >= 0, `DISCOVERY_LANE_ATTEMPTS:${lane.lane_id}`);
  assert(lane.successful_intents + lane.failed_intents === lane.attempted_intents, `DISCOVERY_LANE_TOTAL:${lane.lane_id}`);
  assert(Number.isInteger(lane.observed_candidates) && lane.observed_candidates >= 0, `DISCOVERY_LANE_CANDIDATES:${lane.lane_id}`);
  assert(Array.isArray(lane.errors), `DISCOVERY_LANE_ERRORS:${lane.lane_id}`);
}
for (const laneId of laneIds) assert(discovery.lane_health.some((lane) => lane.lane_id === laneId), `DISCOVERY_MISSING_LANE:${laneId}`);

for (const receipt of discovery.intent_receipts) {
  assert(allowedReceiptStates.has(receipt.state), `DISCOVERY_RECEIPT_STATE:${receipt.receipt_id}`);
  assert(laneIds.includes(receipt.provider_lane), `DISCOVERY_RECEIPT_LANE:${receipt.receipt_id}`);
  for (const key of ['mission_discovery_intent_id', 'mission_id', 'market_cell_id', 'lane_slot', 'scope_id', 'region', 'evidence_class']) {
    assert(typeof receipt[key] === 'string' && receipt[key].length > 0, `DISCOVERY_RECEIPT_FIELD:${receipt.receipt_id}:${key}`);
  }
  assert(Number.isInteger(receipt.candidate_count) && receipt.candidate_count >= 0, `DISCOVERY_RECEIPT_CANDIDATES:${receipt.receipt_id}`);
  assert(receipt.target_site_body_traversed === false && receipt.source_content_collected === false && receipt.collection_right_created === false && receipt.admission_effect === 'NONE', `DISCOVERY_RECEIPT_PERMISSION:${receipt.receipt_id}`);
  assert(receipt.public_release === 'HOLD' && receipt.production === 'HOLD', `DISCOVERY_RECEIPT_RELEASE:${receipt.receipt_id}`);
  if (receipt.state === 'FAILED') assert(typeof receipt.error === 'string' && receipt.error.length > 0, `DISCOVERY_RECEIPT_ERROR:${receipt.receipt_id}`);
}

for (const candidate of discovery.candidates) {
  for (const field of requiredCandidateFields) {
    assert(candidate[field] !== undefined && candidate[field] !== null && candidate[field] !== '', `DISCOVERY_CANDIDATE_FIELD:${candidate.candidate_id}:${field}`);
  }
  assert(laneIds.includes(candidate.discovery_provider), `DISCOVERY_CANDIDATE_PROVIDER:${candidate.candidate_id}`);
  assert(candidate.discovery_channel === 'OPEN_STRUCTURED_DATA', `DISCOVERY_CANDIDATE_CHANNEL:${candidate.candidate_id}`);
  assert(candidate.universe_target === 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE', `DISCOVERY_CANDIDATE_UNIVERSE:${candidate.candidate_id}`);
  assert(candidate.live_external_observation === true && candidate.supplemental_discovery_intent === true, `DISCOVERY_CANDIDATE_LIVE:${candidate.candidate_id}`);
  assert(candidate.discovery_intent_family_hint === 'MISSION_DIRECTED_CRITICAL_MARKET_GAP', `DISCOVERY_CANDIDATE_INTENT_HINT:${candidate.candidate_id}`);
  assert(candidate.source_family_hint === 'UNCLASSIFIED_ANY_SITE_CANDIDATE', `DISCOVERY_CANDIDATE_PRECLASSIFIED:${candidate.candidate_id}`);
  assert(JSON.stringify(candidate.candidate_source_roles) === JSON.stringify(['UNCLASSIFIED_PENDING_RELEVANCE']), `DISCOVERY_CANDIDATE_ROLE:${candidate.candidate_id}`);
  assert(candidate.terminal_transaction_asserted === false, `DISCOVERY_CANDIDATE_SOLD_ASSERTION:${candidate.candidate_id}`);
  assert(candidate.rights_state === 'UNASSESSED' && candidate.admission_state === 'NOT_ADMITTED' && candidate.gate_1_state === 'PENDING' && candidate.evidence_state === 'DISCOVERY_METADATA_ONLY', `DISCOVERY_CANDIDATE_STATE:${candidate.candidate_id}`);
  assert(candidate.acquisition_authorized === false && candidate.target_site_body_crawled === false && candidate.content_acquired === false, `DISCOVERY_CANDIDATE_COLLECTION:${candidate.candidate_id}`);
  assert(candidate.provider_contacted === false && candidate.account_created === false && candidate.eula_accepted === false && candidate.spend_authorized === false, `DISCOVERY_CANDIDATE_COMMITMENT:${candidate.candidate_id}`);
  assert(candidate.public_release === 'HOLD' && candidate.production === 'HOLD', `DISCOVERY_CANDIDATE_RELEASE:${candidate.candidate_id}`);
  assert(candidate.metadata?.mission_discovery_intent_id === candidate.mission_discovery_intent_id && candidate.metadata?.mission_id === candidate.mission_id && candidate.metadata?.market_cell_id === candidate.market_cell_id, `DISCOVERY_CANDIDATE_LINEAGE:${candidate.candidate_id}`);
}

for (const [key, expected] of Object.entries({
  target_site_body_crawled: false,
  content_acquired: false,
  acquisition_authorized: false,
  account_created: false,
  eula_accepted: false,
  spend_authorized: false,
  collection_right_created: false,
  evidence_admitted: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(discovery[key] === expected, `DISCOVERY_BOUNDARY:${key}`);

assert(state.id === 'kidults-asi-mission-directed-discovery-cycle-state-v1', 'STATE_ID');
assert(state.version === '1.0.0' && state.status === 'ACTIVE_ROLLING_CURSOR', 'STATE_STATUS');
assert(state.input_intent_digest === discovery.input_intent_digest, 'STATE_INPUT_DIGEST');
assert(state.total_intent_count === discovery.total_intent_count, 'STATE_TOTAL_INTENTS');
assert(state.cycle_number === discovery.cycle_number, 'STATE_CYCLE');
assert(state.cursor_start === discovery.cursor_start && state.next_cursor === discovery.cursor_next, 'STATE_CURSOR');
assert(state.batch_size === discovery.batch_size && state.wrapped_this_cycle === discovery.wrapped_this_cycle && state.full_rotation_count === discovery.full_rotation_count, 'STATE_ROTATION');
assert(state.last_cycle_candidate_count === discovery.candidate_count && state.last_cycle_healthy_provider_lanes === discovery.healthy_provider_lanes, 'STATE_LAST_CYCLE');
assert(state.manual_orchestration_required === false, 'STATE_MANUAL_ORCHESTRATION');
assert(state.target_site_body_crawled === false && state.content_acquired === false, 'STATE_COLLECTION');
assert(state.public_release === 'HOLD' && state.production === 'HOLD', 'STATE_RELEASE');

console.log(JSON.stringify({
  id: 'kidults-asi-mission-directed-discovery-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  cycle_number: discovery.cycle_number,
  total_intents: discovery.total_intent_count,
  batch_size: discovery.batch_size,
  cursor_start: discovery.cursor_start,
  cursor_next: discovery.cursor_next,
  full_rotation_count: discovery.full_rotation_count,
  attempted_intents: discovery.attempted_intent_count,
  successful_intents: discovery.successful_intent_count,
  failed_intents: discovery.failed_intent_count,
  candidates: discovery.candidate_count,
  zero_candidate_terminal: zeroCandidateTerminal,
  unique_endpoints: discovery.unique_endpoint_count,
  missions_with_candidates: discovery.missions_with_candidates,
  healthy_provider_lanes: discovery.healthy_provider_lanes,
  target_site_body_crawled: false,
  content_acquired: false,
  collection_right_created: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
