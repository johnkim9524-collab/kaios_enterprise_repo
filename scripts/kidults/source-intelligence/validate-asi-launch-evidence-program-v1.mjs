#!/usr/bin/env node
import fs from 'node:fs';

const programPath = process.argv[2] || 'coordination/kidults/source-intelligence/asi-launch-evidence-program-v1.json';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const clone = value => structuredClone(value);
const sortedUnique = values => [...new Set(values)].sort();
const sameArray = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function deriveEligibleSourceIds(rights, snapshots, controlPlane) {
  assert(Array.isArray(rights.records), 'RIGHTS_RECORDS_UNREADABLE');
  assert(Array.isArray(snapshots.records), 'SNAPSHOT_RECORDS_UNREADABLE');
  assert(Array.isArray(controlPlane.source_records), 'CONTROL_PLANE_SOURCE_RECORDS_UNREADABLE');

  const rightsIds = new Set(rights.records
    .filter(record => record.decision === 'PASS')
    .map(record => record.source_id));
  const snapshotIds = new Set(snapshots.records
    .filter(record => record.decision_promotion_eligible === true)
    .map(record => record.source_id));
  const activationIds = new Set(controlPlane.source_records
    .filter(record => record.activation_eligible === true)
    .map(record => record.canonical_source_id));

  return sortedUnique([...rightsIds].filter(sourceId => snapshotIds.has(sourceId) && activationIds.has(sourceId)));
}

function validateEligibility(eligibilityStage, rights, snapshots, controlPlane) {
  const observed = eligibilityStage?.observed;
  assert(observed && Array.isArray(observed.eligible_source_ids), 'ELIGIBLE_SOURCE_IDS_MISSING');
  assert(observed.eligible_source_ids.every(sourceId => typeof sourceId === 'string' && sourceId.length > 0), 'ELIGIBLE_SOURCE_ID_INVALID');
  assert(sameArray(observed.eligible_source_ids, sortedUnique(observed.eligible_source_ids)), 'ELIGIBLE_SOURCE_IDS_NOT_SORTED_UNIQUE');
  assert(observed.eligible_sources === observed.eligible_source_ids.length, 'ELIGIBLE_SOURCE_COUNT_ID_DRIFT');
  const derived = deriveEligibleSourceIds(rights, snapshots, controlPlane);
  assert(sameArray(observed.eligible_source_ids, derived), 'ELIGIBLE_SOURCE_ID_JOIN_DRIFT');
  return derived;
}

function validate(program) {
  assert(program.id === 'kidults-asi-launch-evidence-program-v1' && program.version === '1.0.0', 'PROGRAM_IDENTITY');
  assert(program.status === 'ACTIVE_FAIL_CLOSED_EXTERNAL_EVIDENCE_REQUIRED', 'PROGRAM_STATUS');
  assert(program.targets.launch_sources_min === 1 && program.targets.launch_sources_recommended === 2, 'LAUNCH_SOURCE_TARGET');
  assert(program.targets.lawful_current_sold_events === 120, 'LAWFUL_120_TARGET');
  assert(program.targets.scale_verticals === 8 && program.targets.scale_independent_source_owners === 32 && program.targets.scale_current_sold_events === 40000, 'GLOBAL_SCALE_TARGET');
  assert(program.stages.length === 8 && program.stages.every((stage, index) => stage.ordinal === index + 1), 'STRICT_STAGE_SEQUENCE');

  const rights = read(program.authoritative_inputs.rights_decisions);
  const snapshots = read(program.authoritative_inputs.rights_snapshots);
  const adapters = read(program.authoritative_inputs.adapter_registry);
  const controlPlane = read(program.authoritative_inputs.source_control_plane);
  const staging = read(program.authoritative_inputs.staging_admission);
  const runtime = read(program.authoritative_inputs.runtime_boundary);
  const providers = read(program.authoritative_inputs.provider_registry);
  assert(Array.isArray(providers.providers), 'PROVIDER_REGISTRY_UNREADABLE');

  const active = rights.records.filter(record => record.work_state === 'ACTIVE').map(record => record.source_id);
  const queued = rights.records.filter(record => record.work_state === 'QUEUED').map(record => record.source_id);
  assert(program.negotiation_queue.wip_limit === 6 && active.length === 6 && queued.length === 6, 'NEGOTIATION_WIP_COUNTS');
  assert(JSON.stringify(program.negotiation_queue.active_source_ids) === JSON.stringify(active), 'NEGOTIATION_ACTIVE_DRIFT');
  assert(JSON.stringify(program.negotiation_queue.queued_source_ids) === JSON.stringify(queued), 'NEGOTIATION_QUEUED_DRIFT');

  const stage = id => program.stages.find(item => item.id === id);
  const capture = stage('CAPTURE_AND_REUSE_RIGHTS');
  assert(capture.observed.reviewed_sources === rights.summary.sources_reviewed, 'RIGHTS_REVIEW_COUNT_DRIFT');
  assert(capture.observed.snapshot_bound === snapshots.summary.source_content_snapshot_bound, 'SNAPSHOT_BOUND_COUNT_DRIFT');
  assert(capture.observed.authorized_capture_pending === snapshots.summary.authorized_capture_pending, 'CAPTURE_PENDING_COUNT_DRIFT');
  assert(capture.observed.reference_only === snapshots.summary.reference_only_not_captured_due_restriction, 'REFERENCE_ONLY_COUNT_DRIFT');
  assert(capture.observed.rights_clear_current_sold === rights.summary.rights_clear_for_current_sold, 'RIGHTS_CLEAR_COUNT_DRIFT');

  const eligibility = stage('VALUE_RIGHTS_SCHEMA_ELIGIBILITY');
  const eligibleSourceIds = validateEligibility(eligibility, rights, snapshots, controlPlane);
  const eligible = eligibility.observed.eligible_sources;
  assert(eligible <= rights.summary.rights_clear_for_current_sold && eligible <= snapshots.summary.promotion_eligible, 'ELIGIBLE_WITHOUT_RIGHTS_SNAPSHOT');

  const activation = stage('ADAPTER_AND_LAWFUL_120');
  assert(activation.observed.empirically_active_adapters === controlPlane.summary.empirically_active_adapters, 'ACTIVE_ADAPTER_COUNT_DRIFT');
  assert(activation.observed.lawful_current_sold_events === adapters.truth_boundary.market_events_created, 'LAWFUL_EVENT_COUNT_DRIFT');
  const postgres = stage('POSTGRESQL_IMMUTABLE_RECEIPTS');
  assert(postgres.observed.remote_staging_execution === (runtime.remaining_internal_p0.postgres_remote_staging_execution === 'PROVEN'), 'REMOTE_POSTGRES_TRUTH_DRIFT');
  assert(postgres.observed.pitr_proven === (runtime.remaining_internal_p0.pitr === 'PROVEN'), 'PITR_TRUTH_DRIFT');
  const trackB = stage('TRACK_B_TO_PROJECTION');
  assert(trackB.observed.track_b_results === adapters.truth_boundary.track_b_results_created, 'TRACK_B_COUNT_DRIFT');
  assert(trackB.observed.approved_projections === adapters.truth_boundary.projections_created, 'PROJECTION_COUNT_DRIFT');
  assert(staging.empty_state.track_b === 'NOT_STARTED' || trackB.observed.track_b_results > 0, 'STAGING_TRACK_B_DRIFT');

  assert(activation.observed.empirically_active_adapters <= eligible, 'ADAPTER_BEFORE_ELIGIBILITY');
  assert(activation.observed.lawful_current_sold_events === 0 || activation.observed.empirically_active_adapters > 0, 'EVENTS_WITHOUT_ACTIVE_ADAPTER');
  assert(postgres.observed.persistent_receipts <= activation.observed.lawful_current_sold_events, 'RECEIPTS_EXCEED_LAWFUL_EVENTS');
  assert(trackB.observed.track_b_results <= postgres.observed.persistent_receipts, 'TRACK_B_BEFORE_PERSISTENT_RECEIPTS');
  assert(trackB.observed.approved_projections <= trackB.observed.track_b_results, 'PROJECTION_BEFORE_TRACK_B');
  const scale = stage('GLOBAL_BETA_SCALE').observed;
  assert(scale.active_verticals === 0 || trackB.observed.approved_projections > 0, 'SCALE_BEFORE_LAUNCH_CELL');
  assert(scale.active_verticals <= program.targets.scale_verticals && scale.independent_source_owners <= program.targets.scale_independent_source_owners && scale.lawful_current_sold_events <= program.targets.scale_current_sold_events, 'SCALE_OBSERVED_EXCEEDS_TARGET');

  assert(program.promotion_law.strict_stage_order === true && program.promotion_law.rights_unknown_is_hold === true && program.promotion_law.public_visibility_is_permission === false, 'PROMOTION_LAW_WEAKENED');
  assert(program.promotion_law.aggregate_count_substitution_for_source_identity === false, 'SOURCE_IDENTITY_LAW_WEAKENED');
  assert(program.authority_boundary.production === 'HOLD' && program.authority_boundary.public_release === 'HOLD' && program.authority_boundary.g5 === 'HOLD', 'PROTECTED_GATE_WEAKENED');
  return {active, queued, eligibleSourceIds};
}

const program = read(programPath);
const result = validate(program);
const expectFailure = (code, mutate) => {
  const candidate = clone(program);
  mutate(candidate);
  let error;
  try { validate(candidate); } catch (caught) { error = caught; }
  assert(error?.message === code, `NEGATIVE_TEST_DID_NOT_FAIL:${code}:${error?.message || 'NONE'}`);
};
expectFailure('ACTIVE_ADAPTER_COUNT_DRIFT', candidate => { candidate.stages.find(stage => stage.id === 'ADAPTER_AND_LAWFUL_120').observed.empirically_active_adapters = 1; });
expectFailure('TRACK_B_COUNT_DRIFT', candidate => { candidate.stages.find(stage => stage.id === 'TRACK_B_TO_PROJECTION').observed.track_b_results = 1; });
expectFailure('PROJECTION_COUNT_DRIFT', candidate => { const stage = candidate.stages.find(item => item.id === 'TRACK_B_TO_PROJECTION'); stage.observed.approved_projections = 1; });
expectFailure('SCALE_BEFORE_LAUNCH_CELL', candidate => { candidate.stages.find(stage => stage.id === 'GLOBAL_BETA_SCALE').observed.active_verticals = 1; });
expectFailure('PROTECTED_GATE_WEAKENED', candidate => { candidate.authority_boundary.production = 'ALLOW'; });

const disjointEligibilityStage = { observed: { eligible_sources: 1, eligible_source_ids: ['source-a'] } };
const disjointRights = { records: [{ source_id: 'source-a', decision: 'PASS' }] };
const disjointSnapshots = { records: [{ source_id: 'source-b', decision_promotion_eligible: true }] };
const disjointControlPlane = { source_records: [{ canonical_source_id: 'source-a', activation_eligible: true }] };
let disjointError;
try { validateEligibility(disjointEligibilityStage, disjointRights, disjointSnapshots, disjointControlPlane); } catch (caught) { disjointError = caught; }
assert(disjointError?.message === 'ELIGIBLE_SOURCE_ID_JOIN_DRIFT', `NEGATIVE_TEST_DID_NOT_FAIL:ELIGIBLE_SOURCE_ID_JOIN_DRIFT:${disjointError?.message || 'NONE'}`);

console.log(JSON.stringify({
  suite: 'KIDULTS_ASI_LAUNCH_EVIDENCE_PROGRAM_V1',
  result: 'VERIFIED_PASS',
  stages: program.stages.length,
  negotiation_active: result.active.length,
  negotiation_queued: result.queued.length,
  eligible_source_ids: result.eligibleSourceIds,
  rights_clear_sources: program.stages.find(stage => stage.id === 'CAPTURE_AND_REUSE_RIGHTS').observed.rights_clear_current_sold,
  lawful_current_sold_events: program.stages.find(stage => stage.id === 'ADAPTER_AND_LAWFUL_120').observed.lawful_current_sold_events,
  protected_gates: 'HOLD',
  negative_tests: 6
}));
