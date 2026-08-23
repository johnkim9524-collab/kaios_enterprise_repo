#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-p1-source-preflight-v1',
  contractPath = 'coordination/kidults/source-intelligence/asi-p1-source-classification-admission-preflight-contract-v1.json'
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
const canonicalJson = (value) => JSON.stringify(stableValue(value));
const sha256Ref = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-p1-source-classification-admission-preflight-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.classification_fleets?.length === 4, 'CONTRACT_CLASSIFICATION_FLEETS');
assert(contract.qualification_fleets?.length === 7, 'CONTRACT_QUALIFICATION_FLEETS');
assert(unique(contract.classification_fleets), 'CONTRACT_CLASSIFICATION_FLEET_DUPLICATE');
assert(unique(contract.qualification_fleets), 'CONTRACT_QUALIFICATION_FLEET_DUPLICATE');
assert(contract.gate1_source_safety?.metadata_hint_alone_can_pass === false, 'CONTRACT_METADATA_HINT_GATE');
assert(contract.gate1_source_safety?.unknown_or_missing_behavior === 'HOLD', 'CONTRACT_UNKNOWN_BEHAVIOR');
assert(contract.preflight_actions?.length === 7, 'CONTRACT_PREFLIGHT_ACTIONS');
assert(contract.required_outputs?.length === 7, 'CONTRACT_OUTPUT_COUNT');
assert(contract.truth_boundary?.performs_target_site_rights_or_access_probe === false, 'CONTRACT_PROBE_BOUNDARY');
assert(contract.truth_boundary?.creates_collection_right === false, 'CONTRACT_RIGHT_BOUNDARY');
assert(contract.truth_boundary?.passes_gate1_from_metadata_hint_only === false, 'CONTRACT_GATE1_BOUNDARY');
assert(contract.truth_boundary?.admits_evidence === false, 'CONTRACT_ADMISSION_BOUNDARY');
assert(contract.truth_boundary?.creates_market_claim === false, 'CONTRACT_CLAIM_BOUNDARY');

for (const name of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, name)), `MISSING_OUTPUT:${name}`);
  JSON.parse(readText(name));
}

const classification = readJson('p1-source-classification-ledger-v1.json');
const qualification = readJson('p1-source-qualification-ledger-v1.json');
const taskQueue = readJson('p1-source-preflight-task-queue-v1.json');
const gate1 = readJson('p1-gate1-source-safety-decisions-v1.json');
const admission = readJson('p1-evidence-admission-candidate-register-v1.json');
const actions = readJson('p1-preflight-action-queue-v1.json');
const manifest = readJson('p1-source-preflight-manifest-v1.json');

assert(classification.id === 'kidults-asi-p1-source-classification-ledger-v1', 'CLASSIFICATION_ID');
assert(classification.state === 'PRELIMINARY_CLASSIFICATION_CANONICAL_HOST_PASS_ALL_OTHER_CRITICAL_FIELDS_HOLD', 'CLASSIFICATION_STATE');
assert(Number(classification.grain_count) > 0, 'CLASSIFICATION_GRAIN_COUNT');
assert(classification.assertion_count === classification.records?.length, 'CLASSIFICATION_ASSERTION_COUNT');
assert(unique(classification.records.map((record) => record.assertion_id)), 'CLASSIFICATION_ASSERTION_DUPLICATE');
const classificationByGrain = new Map();
for (const record of classification.records) {
  if (!classificationByGrain.has(record.grain_id)) classificationByGrain.set(record.grain_id, []);
  classificationByGrain.get(record.grain_id).push(record);
  assert(contract.classification_fleets.includes(record.engine_fleet), `CLASSIFICATION_FLEET:${record.assertion_id}`);
  assert(['CANONICAL_HOST', 'OWNER_LINEAGE', 'PROVENANCE', 'RELEVANCE', 'SCOPE_ROLE', 'REGION_LANGUAGE', 'MARKET_SEMANTICS'].includes(record.assertion_type), `CLASSIFICATION_TYPE:${record.assertion_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `CLASSIFICATION_RELEASE:${record.assertion_id}`);
  if (record.assertion_type === 'CANONICAL_HOST') {
    assert(record.decision === 'PASS' && record.state === 'CANONICALIZED_ENDPOINT_OBSERVED', `CLASSIFICATION_HOST_PASS:${record.assertion_id}`);
    assert(record.observed_fact_ceiling === 'CANONICAL_ENDPOINT_AND_HOST_ONLY', `CLASSIFICATION_HOST_CEILING:${record.assertion_id}`);
  } else {
    assert(record.decision === 'HOLD', `CLASSIFICATION_NONHOST_NOT_HOLD:${record.assertion_id}`);
    assert(record.observed_fact_ceiling === 'NO_POSITIVE_CLASSIFICATION_FACT', `CLASSIFICATION_NONHOST_CEILING:${record.assertion_id}`);
  }
  if (record.assertion_type === 'OWNER_LINEAGE') {
    assert(record.state === 'UNKNOWN_REQUIRES_AUTHORITATIVE_CLASSIFICATION', `CLASSIFICATION_OWNER_STATE:${record.assertion_id}`);
    assert(record.reason_codes.includes('FACTUAL_ORIGIN_NOT_ESTABLISHED'), `CLASSIFICATION_OWNER_ORIGIN:${record.assertion_id}`);
  }
  if (record.assertion_type === 'REGION_LANGUAGE') assert(record.reason_codes.includes('REGION_HINT_NOT_REGIONAL_COVERAGE'), `CLASSIFICATION_REGION_BOUNDARY:${record.assertion_id}`);
  if (record.assertion_type === 'MARKET_SEMANTICS') assert(record.reason_codes.includes('LISTING_NOT_SOLD'), `CLASSIFICATION_MARKET_SEMANTICS:${record.assertion_id}`);
}
assert(classificationByGrain.size === classification.grain_count, 'CLASSIFICATION_DISTINCT_GRAINS');
for (const [grainId, records] of classificationByGrain) {
  assert(records.length === 7, `CLASSIFICATION_GRAIN_ASSERTION_COUNT:${grainId}`);
  assert(new Set(records.map((record) => record.assertion_type)).size === 7, `CLASSIFICATION_GRAIN_ASSERTION_TYPES:${grainId}`);
  assert(records.filter((record) => record.decision === 'PASS').length === 1, `CLASSIFICATION_GRAIN_PASS_COUNT:${grainId}`);
}
assert(classification.canonical_host_pass_count === classification.grain_count, 'CLASSIFICATION_HOST_PASS_COUNT');
assert(classification.owner_lineage_pass_count === 0 && classification.market_semantics_pass_count === 0 && classification.regional_coverage_pass_count === 0, 'CLASSIFICATION_CRITICAL_PASS_OVERCLAIM');

assert(qualification.id === 'kidults-asi-p1-source-qualification-ledger-v1', 'QUALIFICATION_ID');
assert(qualification.state === 'PRELIMINARY_QUALIFICATION_ALL_CRITICAL_REQUIREMENTS_HOLD', 'QUALIFICATION_STATE');
assert(qualification.grain_count === classification.grain_count, 'QUALIFICATION_GRAIN_COUNT');
assert(qualification.assertion_count === qualification.records?.length, 'QUALIFICATION_ASSERTION_COUNT');
assert(unique(qualification.records.map((record) => record.assertion_id)), 'QUALIFICATION_ASSERTION_DUPLICATE');
const qualificationTypes = ['UTILITY_VALUE', 'COLLECT', 'STORE', 'TRANSFORM', 'RETENTION', 'ROBOTS', 'RATE_LIMIT', 'SCHEMA', 'COVERAGE_BIAS', 'INDEPENDENCE_REDUNDANCY', 'FRESHNESS', 'COST_ROI'];
const qualificationByGrain = new Map();
for (const record of qualification.records) {
  if (!qualificationByGrain.has(record.grain_id)) qualificationByGrain.set(record.grain_id, []);
  qualificationByGrain.get(record.grain_id).push(record);
  assert(contract.qualification_fleets.includes(record.engine_fleet), `QUALIFICATION_FLEET:${record.assertion_id}`);
  assert(qualificationTypes.includes(record.assertion_type), `QUALIFICATION_TYPE:${record.assertion_id}`);
  assert(record.decision === 'HOLD', `QUALIFICATION_NOT_HOLD:${record.assertion_id}`);
  assert(record.public_release === 'HOLD' && record.production === 'HOLD', `QUALIFICATION_RELEASE:${record.assertion_id}`);
  assert(record.target_site_probe_executed === false, `QUALIFICATION_PROBE_OVERCLAIM:${record.assertion_id}`);
  if (['COLLECT', 'STORE', 'TRANSFORM', 'RETENTION', 'ROBOTS'].includes(record.assertion_type)) {
    assert(record.rights_state === 'UNKNOWN', `QUALIFICATION_RIGHTS_NOT_UNKNOWN:${record.assertion_id}`);
  }
  if (record.assertion_type === 'INDEPENDENCE_REDUNDANCY') assert(record.reason_codes.includes('DISTINCT_HOST_NOT_DISTINCT_FACTUAL_ORIGIN'), `QUALIFICATION_ORIGIN_BOUNDARY:${record.assertion_id}`);
  if (record.assertion_type === 'FRESHNESS') assert(record.reason_codes.includes('DISCOVERY_TIME_NOT_TARGET_DATA_FRESHNESS'), `QUALIFICATION_FRESHNESS_BOUNDARY:${record.assertion_id}`);
  if (['UTILITY_VALUE', 'COST_ROI'].includes(record.assertion_type)) assert(record.advisory_only === true, `QUALIFICATION_ADVISORY:${record.assertion_id}`);
}
assert(qualificationByGrain.size === classification.grain_count, 'QUALIFICATION_DISTINCT_GRAINS');
for (const [grainId, records] of qualificationByGrain) {
  assert(records.length === 12, `QUALIFICATION_GRAIN_ASSERTION_COUNT:${grainId}`);
  assert(new Set(records.map((record) => record.assertion_type)).size === 12, `QUALIFICATION_GRAIN_ASSERTION_TYPES:${grainId}`);
  assert(records.every((record) => record.decision === 'HOLD'), `QUALIFICATION_GRAIN_DECISION:${grainId}`);
}
assert(qualification.rights_allow_count === 0 && qualification.technical_access_pass_count === 0 && qualification.independence_pass_count === 0, 'QUALIFICATION_CRITICAL_PASS_OVERCLAIM');

assert(taskQueue.id === 'kidults-asi-p1-source-preflight-task-queue-v1', 'TASK_QUEUE_ID');
assert(taskQueue.state === 'READY_FOR_SHADOW_RUNTIME_ALIGNMENT_PREFLIGHT', 'TASK_QUEUE_STATE');
assert(taskQueue.grain_count === classification.grain_count, 'TASK_QUEUE_GRAIN_COUNT');
assert(taskQueue.classification_fleet_count === 4 && taskQueue.qualification_fleet_count === 7, 'TASK_QUEUE_FLEET_COUNTS');
assert(taskQueue.task_count === taskQueue.tasks?.length && taskQueue.task_count === taskQueue.grain_count * 11, 'TASK_QUEUE_TASK_COUNT');
assert(unique(taskQueue.tasks.map((task) => task.task_id)), 'TASK_QUEUE_TASK_DUPLICATE');
assert(unique(taskQueue.tasks.map((task) => task.outbox_id)), 'TASK_QUEUE_OUTBOX_DUPLICATE');
assert(unique(taskQueue.tasks.map((task) => task.event.event_id)), 'TASK_QUEUE_EVENT_DUPLICATE');
const tasksByGrain = new Map();
for (const task of taskQueue.tasks) {
  if (!tasksByGrain.has(task.grain_id)) tasksByGrain.set(task.grain_id, []);
  tasksByGrain.get(task.grain_id).push(task);
  assert(['CLASSIFICATION', 'QUALIFICATION'].includes(task.stage), `TASK_STAGE:${task.task_id}`);
  assert(task.stage === 'CLASSIFICATION' ? contract.classification_fleets.includes(task.target_fleet) : contract.qualification_fleets.includes(task.target_fleet), `TASK_FLEET:${task.task_id}`);
  assert(task.state === 'READY_FOR_SHADOW_RUNTIME_ALIGNMENT_PREFLIGHT', `TASK_STATE:${task.task_id}`);
  assert(typeof task.queue_binding === 'string' && task.queue_binding.length > 0, `TASK_QUEUE_BINDING:${task.task_id}`);
  assert(typeof task.queue_name === 'string' && task.queue_name.length > 0, `TASK_QUEUE_NAME:${task.task_id}`);
  assert(task.target_site_probe_executed === false, `TASK_PROBE_OVERCLAIM:${task.task_id}`);
  assert(task.collection_authorized === false && task.evidence_admitted === false && task.market_claim_authorized === false, `TASK_PERMISSION:${task.task_id}`);
  assert(task.public_release === 'HOLD' && task.production === 'HOLD', `TASK_RELEASE:${task.task_id}`);
  const event = task.event;
  assert(event.event_version === '1.0.0', `EVENT_VERSION:${task.task_id}`);
  assert(event.event_type === (task.stage === 'CLASSIFICATION' ? 'SOURCE_IDENTIFIED' : 'SOURCE_CLASSIFICATION_ASSERTED'), `EVENT_TYPE:${task.task_id}`);
  assert(event.producer_engine === 'P1_SOURCE_PREFLIGHT_ORCHESTRATOR', `EVENT_PRODUCER:${task.task_id}`);
  assert(event.assertion_purpose === 'SOURCE_CLASSIFICATION_AND_ADMISSION_PREFLIGHT', `EVENT_PURPOSE:${task.task_id}`);
  assert(event.decision === 'HOLD' && event.rights_state === 'UNKNOWN' && event.freshness_state === 'CURRENT', `EVENT_STATE:${task.task_id}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(event.input_snapshot_ref), `EVENT_SNAPSHOT:${task.task_id}`);
  assert(/^sha256:[a-f0-9]{64}$/.test(event.payload_hash), `EVENT_HASH_FORMAT:${task.task_id}`);
  assert(event.payload_hash === sha256Ref(canonicalJson(event.payload)), `EVENT_PAYLOAD_HASH:${task.task_id}`);
  for (const key of ['channel', 'region', 'language', 'scope_id', 'source_role', 'canonical_host_hash']) assert(typeof event.partition?.[key] === 'string' && event.partition[key].length > 0, `EVENT_PARTITION:${task.task_id}:${key}`);
  assert(!Object.hasOwn(event.payload, 'target_fleet'), `EVENT_ROUTING_BYPASS:${task.task_id}`);
  assert(event.payload.provider_direct_to_truth === false && event.payload.provider_direct_to_index === false && event.payload.provider_direct_to_projection === false, `EVENT_PROVIDER_DIRECT_PATH:${task.task_id}`);
  assert(event.payload.external_raw_data_is_owned_moat === false, `EVENT_EXTERNAL_MOAT:${task.task_id}`);
  assert(event.payload.collection_execution_authorized === false && event.payload.evidence_admission_authorized === false && event.payload.public_projection_authorized === false && event.payload.production_authorized === false, `EVENT_PERMISSION:${task.task_id}`);
  assert(event.reason_codes?.includes('METADATA_HINTS_CANNOT_PASS_GATE1') && event.reason_codes?.includes('UNKNOWN_REMAINS_HOLD'), `EVENT_REASON_CODES:${task.task_id}`);
  assert(Array.isArray(event.trace_refs) && event.trace_refs.length >= 5, `EVENT_TRACE_REFS:${task.task_id}`);
}
assert(tasksByGrain.size === taskQueue.grain_count, 'TASK_QUEUE_DISTINCT_GRAINS');
for (const [grainId, tasks] of tasksByGrain) {
  assert(tasks.length === 11, `TASK_GRAIN_COUNT:${grainId}`);
  assert(tasks.filter((task) => task.stage === 'CLASSIFICATION').length === 4, `TASK_GRAIN_CLASSIFICATION_COUNT:${grainId}`);
  assert(tasks.filter((task) => task.stage === 'QUALIFICATION').length === 7, `TASK_GRAIN_QUALIFICATION_COUNT:${grainId}`);
  assert(new Set(tasks.map((task) => task.target_fleet)).size === 11, `TASK_GRAIN_FLEET_COVERAGE:${grainId}`);
}
assert(taskQueue.target_site_probes_executed === 0 && taskQueue.collection_rights_created === 0 && taskQueue.evidence_admitted === 0 && taskQueue.market_claims_created === 0, 'TASK_QUEUE_PROMOTION_OVERCLAIM');

assert(gate1.id === 'kidults-asi-p1-gate1-source-safety-decisions-v1', 'GATE1_ID');
assert(gate1.state === 'ALL_CURRENT_GRAINS_HOLD_PENDING_PREFLIGHT', 'GATE1_STATE');
assert(gate1.decision_count === taskQueue.grain_count && gate1.decisions?.length === gate1.decision_count, 'GATE1_DECISION_COUNT');
assert(gate1.pass_count === 0 && gate1.hold_count === gate1.decision_count && gate1.reject_count === 0 && gate1.metadata_hint_pass_count === 0, 'GATE1_COUNTS');
assert(unique(gate1.decisions.map((decision) => decision.gate1_decision_id)), 'GATE1_ID_DUPLICATE');
for (const decision of gate1.decisions) {
  assert(decision.decision === 'HOLD' && decision.rights_state === 'UNKNOWN', `GATE1_DECISION_STATE:${decision.gate1_decision_id}`);
  assert(decision.metadata_hint_alone_can_pass === false, `GATE1_METADATA_HINT:${decision.gate1_decision_id}`);
  assert(decision.target_site_probe_executed === false, `GATE1_PROBE_OVERCLAIM:${decision.gate1_decision_id}`);
  assert(decision.collection_authorized === false && decision.evidence_admitted === false && decision.market_claim_authorized === false, `GATE1_PERMISSION:${decision.gate1_decision_id}`);
  assert(decision.passed_requirements?.includes('CANONICAL_SOURCE_IDENTITY_PASS') && decision.passed_requirements?.includes('NO_PROVIDER_DIRECT_PATH'), `GATE1_PASSED_REQUIREMENTS:${decision.gate1_decision_id}`);
  assert(decision.unresolved_requirements?.length >= 5, `GATE1_UNRESOLVED_REQUIREMENTS:${decision.gate1_decision_id}`);
  for (const reason of ['OWNER_AND_FACTUAL_ORIGIN_UNKNOWN', 'PURPOSE_SPECIFIC_RIGHTS_UNKNOWN', 'MARKET_SEMANTICS_UNVERIFIED', 'TECHNICAL_ACCESS_AND_SCHEMA_UNPROBED', 'REGIONAL_RELEVANCE_UNVERIFIED']) assert(decision.reason_codes?.includes(reason), `GATE1_REASON:${decision.gate1_decision_id}:${reason}`);
  assert(decision.public_release === 'HOLD' && decision.production === 'HOLD', `GATE1_RELEASE:${decision.gate1_decision_id}`);
}

assert(admission.id === 'kidults-asi-p1-evidence-admission-candidate-register-v1', 'ADMISSION_ID');
assert(admission.state === 'CANDIDATES_REGISTERED_NONE_READY_OR_ADMITTED', 'ADMISSION_STATE');
assert(admission.candidate_count === gate1.decision_count && admission.candidates?.length === admission.candidate_count, 'ADMISSION_COUNT');
assert(admission.ready_count === 0 && admission.admitted_count === 0, 'ADMISSION_READY_OR_ADMITTED_OVERCLAIM');
assert(unique(admission.candidates.map((candidate) => candidate.admission_candidate_id)), 'ADMISSION_ID_DUPLICATE');
for (const candidate of admission.candidates) {
  assert(candidate.state === 'NOT_READY_GATE1_HOLD' && candidate.gate1_decision === 'HOLD' && candidate.rights_state === 'UNKNOWN', `ADMISSION_CANDIDATE_STATE:${candidate.admission_candidate_id}`);
  assert(candidate.output_class === 'INTERNAL_PREFLIGHT_ONLY', `ADMISSION_OUTPUT_CLASS:${candidate.admission_candidate_id}`);
  assert(candidate.required_next_actions?.length === 7, `ADMISSION_NEXT_ACTIONS:${candidate.admission_candidate_id}`);
  assert(candidate.admitted_evidence_id === null && candidate.evidence_admitted === false, `ADMISSION_EVIDENCE_OVERCLAIM:${candidate.admission_candidate_id}`);
  assert(candidate.collection_authorized === false && candidate.market_claim_authorized === false, `ADMISSION_PERMISSION:${candidate.admission_candidate_id}`);
}

assert(actions.id === 'kidults-asi-p1-preflight-action-queue-v1', 'ACTION_QUEUE_ID');
assert(actions.state === 'QUEUED_NOT_EXECUTED', 'ACTION_QUEUE_STATE');
assert(actions.unique_candidate_count > 0, 'ACTION_QUEUE_CANDIDATE_COUNT');
assert(JSON.stringify(actions.action_types) === JSON.stringify(contract.preflight_actions), 'ACTION_QUEUE_TYPES');
assert(actions.action_count === actions.actions?.length && actions.action_count === actions.unique_candidate_count * 7, 'ACTION_QUEUE_COUNT');
assert(unique(actions.actions.map((action) => action.action_id)), 'ACTION_QUEUE_ID_DUPLICATE');
const actionsByCandidate = new Map();
for (const action of actions.actions) {
  if (!actionsByCandidate.has(action.candidate_id)) actionsByCandidate.set(action.candidate_id, []);
  actionsByCandidate.get(action.candidate_id).push(action);
  assert(contract.preflight_actions.includes(action.action_type), `ACTION_TYPE:${action.action_id}`);
  assert(action.state === 'QUEUED_NOT_EXECUTED', `ACTION_STATE:${action.action_id}`);
  assert(action.network_probe_authorized === false && action.collection_authorized === false && action.evidence_admitted === false, `ACTION_PERMISSION:${action.action_id}`);
  assert(Array.isArray(action.impacted_grain_ids) && action.impacted_grain_ids.length >= 1, `ACTION_GRAINS:${action.action_id}`);
  assert(Array.isArray(action.impacted_mission_ids) && action.impacted_mission_ids.length >= 1, `ACTION_MISSIONS:${action.action_id}`);
  assert(typeof action.expected_output === 'string' && action.expected_output.length > 0, `ACTION_OUTPUT:${action.action_id}`);
  assert(action.public_release === 'HOLD' && action.production === 'HOLD', `ACTION_RELEASE:${action.action_id}`);
}
assert(actionsByCandidate.size === actions.unique_candidate_count, 'ACTION_QUEUE_DISTINCT_CANDIDATES');
for (const [candidateId, candidateActions] of actionsByCandidate) {
  assert(candidateActions.length === 7, `ACTION_CANDIDATE_COUNT:${candidateId}`);
  assert(new Set(candidateActions.map((action) => action.action_type)).size === 7, `ACTION_CANDIDATE_TYPES:${candidateId}`);
}
assert(actions.target_site_network_probes_executed === 0 && actions.collection_rights_created === 0 && actions.evidence_admitted === 0, 'ACTION_QUEUE_EXECUTION_OVERCLAIM');

assert(manifest.id === 'kidults-asi-p1-source-preflight-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'P1_CLASSIFICATION_QUALIFICATION_AND_GATE1_PREFLIGHT_PREPARED', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.results?.candidate_mission_grains === classification.grain_count, 'MANIFEST_GRAIN_COUNT');
assert(manifest.results?.unique_candidates === actions.unique_candidate_count, 'MANIFEST_UNIQUE_CANDIDATES');
assert(manifest.results?.preliminary_classification_assertions === classification.assertion_count, 'MANIFEST_CLASSIFICATION_ASSERTIONS');
assert(manifest.results?.preliminary_qualification_assertions === qualification.assertion_count, 'MANIFEST_QUALIFICATION_ASSERTIONS');
assert(manifest.results?.runtime_preflight_tasks === taskQueue.task_count, 'MANIFEST_TASK_COUNT');
assert(manifest.results?.classification_tasks === taskQueue.grain_count * 4 && manifest.results?.qualification_tasks === taskQueue.grain_count * 7, 'MANIFEST_STAGE_TASK_COUNTS');
assert(manifest.results?.gate1_pass === 0 && manifest.results?.gate1_hold === gate1.decision_count && manifest.results?.gate1_reject === 0, 'MANIFEST_GATE1_COUNTS');
assert(manifest.results?.evidence_admission_candidates === admission.candidate_count && manifest.results?.evidence_admission_ready === 0 && manifest.results?.evidence_admitted === 0, 'MANIFEST_ADMISSION_COUNTS');
assert(manifest.results?.preflight_actions_queued === actions.action_count, 'MANIFEST_ACTION_COUNT');
for (const key of ['target_site_network_probes_executed', 'collection_rights_created', 'market_claims_created']) assert(manifest.results?.[key] === 0, `MANIFEST_BOUNDARY:${key}`);
assert(manifest.output_files?.length === 6, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const file of manifest.output_files) {
  const content = readText(file.name);
  assert(file.sha256 === sha256Ref(content), `MANIFEST_OUTPUT_DIGEST:${file.name}`);
  assert(file.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${file.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE');

console.log(JSON.stringify({
  id: 'kidults-asi-p1-source-preflight-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  candidate_mission_grains: classification.grain_count,
  unique_candidates: actions.unique_candidate_count,
  preliminary_classification_assertions: classification.assertion_count,
  preliminary_qualification_assertions: qualification.assertion_count,
  runtime_preflight_tasks: taskQueue.task_count,
  gate1_pass: 0,
  gate1_hold: gate1.decision_count,
  gate1_reject: 0,
  evidence_admission_candidates: admission.candidate_count,
  evidence_admission_ready: 0,
  evidence_admitted: 0,
  preflight_actions_queued: actions.action_count,
  target_site_network_probes_executed: 0,
  collection_rights_created: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
