#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-mission-consumption-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-consumption-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readJson = (name) => JSON.parse(readText(name));
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const sha256Ref = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const slotOrder = ['PRIMARY_CANDIDATE_LANE', 'INDEPENDENT_FALLBACK_LANE', 'FACTUAL_ORIGIN_REPLACEMENT_LANE'];
const eventHashPattern = /^sha256:[a-f0-9]{64}$/;
const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
assert(contract.id === 'kidults-asi-mission-consumption-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P0', 'CONTRACT_AUTHORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.expected_input_counts?.missions === 192, 'CONTRACT_MISSION_COUNT');
assert(contract.execution_model?.expected_product_work_items === 960, 'CONTRACT_PRODUCT_WORK_COUNT');
assert(contract.execution_model?.expected_source_lane_slots === 576, 'CONTRACT_LANE_COUNT');
assert(JSON.stringify(contract.execution_model?.source_lane_slots) === JSON.stringify(slotOrder), 'CONTRACT_SLOT_ORDER');
assert(contract.runtime_bridge?.input_event_type === 'SOURCE_DISCOVERY_REQUESTED', 'CONTRACT_EVENT_TYPE');
assert(contract.runtime_bridge?.target_runtime_fleet === 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER', 'CONTRACT_RUNTIME_FLEET');
assert(contract.runtime_bridge?.rights_state === 'UNKNOWN' && contract.runtime_bridge?.decision === 'HOLD', 'CONTRACT_EVENT_HOLD_BOUNDARY');
assert(contract.runtime_bridge?.source_seed_rights_state === 'UNKNOWN', 'CONTRACT_SEED_RIGHTS_BOUNDARY');
assert(contract.truth_boundary?.external_source_content_collected === false, 'CONTRACT_EXTERNAL_COLLECTION');
assert(contract.truth_boundary?.source_right_created === false, 'CONTRACT_RIGHT_CREATION');
assert(contract.truth_boundary?.market_event_admitted === false, 'CONTRACT_MARKET_EVENT');
assert(contract.truth_boundary?.graph_fact_created === false, 'CONTRACT_GRAPH_FACT');
assert(contract.truth_boundary?.snapshot_candidate_created === false, 'CONTRACT_SNAPSHOT');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const state = readJson('mission-consumption-state-v1.json');
const products = readJson('mission-product-work-items-v1.json');
const lanes = readJson('mission-source-lane-assignments-v1.json');
const intents = readJson('mission-discovery-intent-v1.json');
const events = readJson('mission-runtime-discovery-events-v1.json');
const manifest = readJson('mission-consumption-manifest-v1.json');

assert(state.id === 'kidults-asi-mission-consumption-state-v1', 'STATE_ID');
assert(state.state === 'ALL_GENERATED_MISSIONS_CONSUMED', 'STATE_STATUS');
assert(state.mission_count === 192 && state.records?.length === 192, 'STATE_MISSION_COUNT');
assert(state.missions_consumed_exactly_once === true, 'STATE_EXACTLY_ONCE');
assert(unique(state.records.map((record) => record.mission_id)), 'STATE_DUPLICATE_MISSION');
assert(state.runtime_discovery_event_count === events.event_count, 'STATE_EVENT_COUNT_MISMATCH');
assert(state.external_collection_executed === false, 'STATE_EXTERNAL_COLLECTION');
assert(state.evidence_admitted === 0 && state.market_claims_created === 0, 'STATE_PROMOTION_OVERCLAIM');
for (const record of state.records) {
  assert(record.consumed === true, `STATE_NOT_CONSUMED:${record.mission_id}`);
  assert(['RUNTIME_DISCOVERY_EVENT_EMITTED', 'CONSUMED_SOURCE_LANES_PARTIAL', 'CONSUMED_DISCOVERY_GAP_OPEN'].includes(record.state), `STATE_INVALID:${record.mission_id}`);
  assert(record.source_lane_slots === 3, `STATE_LANE_COUNT:${record.mission_id}`);
  assert(record.product_work_items_bound >= 0, `STATE_PRODUCT_COUNT:${record.mission_id}`);
  assert(record.external_collection_executed === false, `STATE_COLLECTION:${record.mission_id}`);
  assert(record.evidence_admitted === false && record.market_claim_authorized === false, `STATE_PROMOTION:${record.mission_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `STATE_RELEASE:${record.mission_id}`);
}

assert(products.id === 'kidults-asi-mission-product-work-items-v1', 'PRODUCT_ID');
assert(products.state === 'PRODUCT_WORK_OBLIGATIONS_MATERIALIZED', 'PRODUCT_STATE');
assert(products.total_work_items === 960 && products.work_items?.length === 960, 'PRODUCT_COUNT');
assert(unique(products.work_items.map((item) => item.work_item_id)), 'PRODUCT_DUPLICATE_ID');
assert(products.mission_bound_work_items === 870, 'PRODUCT_MISSION_BOUND_COUNT');
assert(products.split_scope_review_work_items === 60, 'PRODUCT_SPLIT_SCOPE_COUNT');
assert(products.retired_scope_review_work_items === 30, 'PRODUCT_RETIRED_SCOPE_COUNT');
assert(products.semantic_review_work_items === 30, 'PRODUCT_SEMANTIC_REVIEW_COUNT');
assert(products.work_items.filter((item) => !item.mission_id).length === 90, 'PRODUCT_UNRESOLVED_SCOPE_COUNT');
for (const item of products.work_items) {
  assert(['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'].includes(item.evidence_class), `PRODUCT_EVIDENCE_CLASS:${item.work_item_id}`);
  assert(Array.isArray(item.required_source_roles) && item.required_source_roles.length >= 2, `PRODUCT_SOURCE_ROLES:${item.work_item_id}`);
  assert(Array.isArray(item.required_market_semantics) && item.required_market_semantics.length >= 5, `PRODUCT_SEMANTICS:${item.work_item_id}`);
  if (item.state === 'MISSION_BOUND' || item.state === 'MISSION_BOUND_SEMANTIC_REVIEW_REQUIRED') {
    assert(typeof item.mission_id === 'string' && item.candidate_mission_ids?.length === 1, `PRODUCT_MISSION_BINDING:${item.work_item_id}`);
  } else {
    assert(item.mission_id === null, `PRODUCT_AMBIGUOUS_MISSION_PROMOTION:${item.work_item_id}`);
  }
  assert(item.source_pool_promoted === false && item.collection_authorized === false && item.evidence_admitted === false && item.market_claim_authorized === false, `PRODUCT_PERMISSION:${item.work_item_id}`);
  assert(item.public_release === 'HOLD' && item.production === 'HOLD', `PRODUCT_RELEASE:${item.work_item_id}`);
}

assert(lanes.id === 'kidults-asi-mission-source-lane-assignments-v1', 'LANE_ID');
assert(lanes.state === 'SOURCE_LANE_OBLIGATIONS_MATERIALIZED', 'LANE_STATE');
assert(lanes.mission_count === 192, 'LANE_MISSION_COUNT');
assert(lanes.source_lane_slot_count === 576 && lanes.assignments?.length === 576, 'LANE_SLOT_COUNT');
assert(unique(lanes.assignments.map((record) => record.lane_assignment_id)), 'LANE_DUPLICATE_ID');
assert(lanes.registered_source_assignment_count === lanes.assignments.filter((record) => record.registered_source).length, 'LANE_REGISTERED_COUNT');
assert(lanes.runtime_event_eligible_assignment_count === lanes.assignments.filter((record) => record.runtime_event_eligible).length, 'LANE_ELIGIBLE_COUNT');
assert(lanes.unfilled_discovery_required_count === lanes.assignments.filter((record) => !record.runtime_event_eligible).length, 'LANE_UNFILLED_COUNT');
assert(lanes.source_owner_independence_verified_count === 0 && lanes.factual_origin_independence_verified_count === 0, 'LANE_INDEPENDENCE_OVERCLAIM');
const lanesByMission = new Map();
for (const record of lanes.assignments) {
  if (!lanesByMission.has(record.mission_id)) lanesByMission.set(record.mission_id, []);
  lanesByMission.get(record.mission_id).push(record);
  assert(slotOrder.includes(record.lane_slot), `LANE_SLOT:${record.lane_assignment_id}`);
  assert(record.rights_state === 'UNKNOWN', `LANE_RIGHTS:${record.lane_assignment_id}`);
  assert(record.source_owner_independence_state !== 'VERIFIED' && record.factual_origin_independence_state !== 'VERIFIED', `LANE_INDEPENDENCE:${record.lane_assignment_id}`);
  assert(record.source_admitted === false && record.collection_authorized === false && record.evidence_admitted === false && record.market_claim_authorized === false, `LANE_PERMISSION:${record.lane_assignment_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `LANE_RELEASE:${record.lane_assignment_id}`);
  if (record.runtime_event_eligible) {
    assert(record.registered_source && record.assignment_state !== 'TARGET_SPECIFIC_SCOPE_EVIDENCE_REQUIRED', `LANE_ELIGIBLE_SOURCE:${record.lane_assignment_id}`);
    assert(record.registered_source.migration_type !== 'SPLIT_TARGET_SPECIFIC_EVIDENCE_REQUIRED', `LANE_SPLIT_PROMOTION:${record.lane_assignment_id}`);
    assert(Array.isArray(record.registered_source.matched_roles) && record.registered_source.matched_roles.length > 0, `LANE_MATCHED_ROLE:${record.lane_assignment_id}`);
    assert(record.registered_source.matched_roles.every((role) => record.registered_source.source_roles.includes(role)), `LANE_ROLE_PROVENANCE:${record.lane_assignment_id}`);
  }
}
assert(lanesByMission.size === 192, 'LANE_MISSION_COVERAGE');
for (const [missionId, records] of lanesByMission) {
  assert(records.length === 3, `LANE_MISSION_SLOT_COUNT:${missionId}`);
  assert(JSON.stringify(records.map((record) => record.lane_slot).sort()) === JSON.stringify([...slotOrder].sort()), `LANE_MISSION_SLOT_SET:${missionId}`);
  const assignedHosts = records.filter((record) => record.registered_source).map((record) => record.registered_source.canonical_host);
  assert(unique(assignedHosts), `LANE_HOST_DUPLICATE:${missionId}`);
}
assert(lanes.source_right_created === false && lanes.evidence_admitted === false, 'LANE_GLOBAL_PERMISSION');

assert(intents.id === 'kidults-asi-mission-discovery-intent-v1', 'INTENT_ID');
assert(intents.state === 'UNFILLED_OR_TARGET_REVIEW_LANES_READY_FOR_BOUNDED_DISCOVERY', 'INTENT_STATE');
assert(intents.intent_count === intents.intents?.length, 'INTENT_COUNT');
assert(intents.intent_count === lanes.unfilled_discovery_required_count, 'INTENT_UNFILLED_MISMATCH');
assert(unique(intents.intents.map((intent) => intent.discovery_intent_id)), 'INTENT_DUPLICATE_ID');
const intentLaneIds = new Set(intents.intents.map((intent) => `mission-lane::${intent.mission_id}::${intent.lane_slot}`));
for (const record of lanes.assignments.filter((item) => !item.runtime_event_eligible)) {
  assert(intentLaneIds.has(record.lane_assignment_id), `INTENT_MISSING_FOR_LANE:${record.lane_assignment_id}`);
}
for (const intent of intents.intents) {
  assert(intent.state === 'READY_FOR_BOUNDED_PUBLIC_METADATA_DISCOVERY', `INTENT_STATUS:${intent.discovery_intent_id}`);
  assert(slotOrder.includes(intent.lane_slot), `INTENT_SLOT:${intent.discovery_intent_id}`);
  assert(Array.isArray(intent.preferred_discovery_channels) && intent.preferred_discovery_channels.length >= 5, `INTENT_CHANNELS:${intent.discovery_intent_id}`);
  assert(intent.target_site_body_traversal_authorized === false && intent.rights_effect === 'NONE' && intent.admission_effect === 'NONE' && intent.collection_authorized === false, `INTENT_PERMISSION:${intent.discovery_intent_id}`);
  assert(intent.public_release === 'HOLD' && intent.production === 'HOLD', `INTENT_RELEASE:${intent.discovery_intent_id}`);
}

assert(events.id === 'kidults-asi-mission-runtime-discovery-events-v1', 'EVENT_SET_ID');
assert(events.state === 'RUNTIME_COMPATIBLE_DISCOVERY_EVENTS_MATERIALIZED', 'EVENT_SET_STATE');
assert(events.event_count === events.events?.length && events.event_count > 0, 'EVENT_COUNT');
assert(events.input_event_type === 'SOURCE_DISCOVERY_REQUESTED', 'EVENT_INPUT_TYPE');
assert(events.target_runtime_fleet === 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER', 'EVENT_TARGET_FLEET');
assert(events.expected_processor_output_type === 'SOURCE_DISCOVERED' && events.expected_processor_decision === 'HOLD', 'EVENT_EXPECTED_OUTPUT');
assert(unique(events.events.map((event) => event.event_id)), 'EVENT_DUPLICATE_ID');
assert(events.external_collection_executed === false && events.collection_authorized === false, 'EVENT_SET_PERMISSION');
const eligibleLaneIds = new Set(lanes.assignments.filter((record) => record.runtime_event_eligible).map((record) => record.lane_assignment_id));
assert(events.event_count === eligibleLaneIds.size, 'EVENT_ELIGIBLE_LANE_COUNT');
for (const event of events.events) {
  assert(event.event_type === 'SOURCE_DISCOVERY_REQUESTED' && event.event_version === '1.0.0', `EVENT_TYPE_VERSION:${event.event_id}`);
  assert(event.producer_engine === 'AUTONOMOUS_MISSION_GENERATOR' && event.producer_version === 'mission-consumption-bridge-1.0.0', `EVENT_PRODUCER:${event.event_id}`);
  assert(event.partition?.channel === 'APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER', `EVENT_CHANNEL:${event.event_id}`);
  assert(typeof event.partition?.region === 'string' && event.partition.region.length > 0, `EVENT_REGION:${event.event_id}`);
  assert(event.partition?.language === 'en', `EVENT_LANGUAGE:${event.event_id}`);
  assert(typeof event.partition?.scope_id === 'string' && event.partition.scope_id.length > 0, `EVENT_SCOPE:${event.event_id}`);
  assert(typeof event.partition?.source_role === 'string' && event.partition.source_role.length > 0, `EVENT_SOURCE_ROLE:${event.event_id}`);
  assert(eventHashPattern.test(event.partition?.canonical_host_hash || ''), `EVENT_HOST_HASH:${event.event_id}`);
  assert(eventHashPattern.test(event.input_snapshot_ref || '') && eventHashPattern.test(event.payload_hash || ''), `EVENT_HASH:${event.event_id}`);
  assert(event.payload_hash === sha256Ref(canonicalJson(event.payload)), `EVENT_PAYLOAD_DIGEST:${event.event_id}`);
  assert(event.rights_state === 'UNKNOWN' && event.freshness_state === 'CURRENT' && event.decision === 'HOLD', `EVENT_TRUTH_STATE:${event.event_id}`);
  assert(event.assertion_purpose === 'MISSION_BOUND_SOURCE_DISCOVERY_PREFLIGHT', `EVENT_PURPOSE:${event.event_id}`);
  assert(Array.isArray(event.reason_codes) && event.reason_codes.includes('REGISTERED_SOURCE_IS_NOT_RIGHTS_ADMITTED'), `EVENT_REASON:${event.event_id}`);
  assert(Array.isArray(event.trace_refs) && event.trace_refs.includes(event.payload.mission_id) && event.trace_refs.includes(event.payload.market_cell_id), `EVENT_TRACE:${event.event_id}`);
  assert(slotOrder.includes(event.payload.lane_slot), `EVENT_SLOT:${event.event_id}`);
  assert(eligibleLaneIds.has(`mission-lane::${event.payload.mission_id}::${event.payload.lane_slot}`), `EVENT_LANE_BINDING:${event.event_id}`);
  assert(typeof event.payload.source_id === 'string' && event.payload.source_id.length > 0, `EVENT_SOURCE_ID:${event.event_id}`);
  const seed = event.payload.discovery_seed;
  assert(seed && seed.source_id === event.payload.source_id, `EVENT_SEED_SOURCE:${event.event_id}`);
  assert(typeof seed.canonical_host === 'string' && hostPattern.test(seed.canonical_host), `EVENT_SEED_HOST:${event.event_id}`);
  assert(seed.discovery_rights_state === 'UNKNOWN' && seed.registered_source_frontier_only === true, `EVENT_SEED_RIGHTS:${event.event_id}`);
  assert(event.payload.content_collection_authorized === false && event.payload.external_collection_execution_authorized === false && event.payload.public_projection_authorized === false && event.payload.production_authorized === false, `EVENT_PERMISSION:${event.event_id}`);
  assert(event.payload.provider_direct_to_truth !== true && event.payload.provider_direct_to_index !== true && event.payload.provider_direct_to_projection !== true, `EVENT_PROVIDER_BYPASS:${event.event_id}`);
  assert(event.public_release === undefined, `EVENT_ADDITIONAL_PROPERTY:${event.event_id}`);
}
assert(events.public_release === 'HOLD' && events.production === 'HOLD', 'EVENT_SET_RELEASE');

assert(manifest.id === 'kidults-asi-mission-consumption-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'MISSION_CONSUMPTION_OUTPUTS_READY_FOR_VALIDATION_AND_RUNTIME_REPLAY', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.results?.missions_consumed === 192, 'MANIFEST_MISSION_COUNT');
assert(manifest.results?.product_work_items === 960, 'MANIFEST_PRODUCT_COUNT');
assert(manifest.results?.mission_bound_product_work_items === 870, 'MANIFEST_BOUND_PRODUCT_COUNT');
assert(manifest.results?.unresolved_product_scope_work_items === 90, 'MANIFEST_UNRESOLVED_PRODUCT_COUNT');
assert(manifest.results?.source_lane_slots === 576, 'MANIFEST_LANE_COUNT');
assert(manifest.results?.registered_source_assignments === lanes.registered_source_assignment_count, 'MANIFEST_REGISTERED_COUNT');
assert(manifest.results?.runtime_event_eligible_assignments === lanes.runtime_event_eligible_assignment_count, 'MANIFEST_ELIGIBLE_COUNT');
assert(manifest.results?.discovery_intents === intents.intent_count, 'MANIFEST_INTENT_COUNT');
assert(manifest.results?.runtime_discovery_events === events.event_count, 'MANIFEST_EVENT_COUNT');
assert(manifest.results?.external_collection_executed === false && manifest.results?.evidence_admitted === 0 && manifest.results?.market_claims_created === 0, 'MANIFEST_PROMOTION_OVERCLAIM');
assert(manifest.output_files?.length === 5, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of manifest.output_files) {
  const text = readText(output.name);
  assert(output.sha256 === sha256Ref(text), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === Buffer.byteLength(text), `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE');

console.log(JSON.stringify({
  id: 'kidults-asi-mission-consumption-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  missions_consumed: state.mission_count,
  product_work_items: products.total_work_items,
  mission_bound_product_work_items: products.mission_bound_work_items,
  unresolved_product_scope_work_items: products.work_items.filter((item) => !item.mission_id).length,
  source_lane_slots: lanes.source_lane_slot_count,
  registered_source_assignments: lanes.registered_source_assignment_count,
  runtime_event_eligible_assignments: lanes.runtime_event_eligible_assignment_count,
  discovery_intents: intents.intent_count,
  runtime_discovery_events: events.event_count,
  source_owner_independence_verified: 0,
  factual_origin_independence_verified: 0,
  external_collection_executed: false,
  market_event_admitted: false,
  graph_fact_created: false,
  snapshot_candidate_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
