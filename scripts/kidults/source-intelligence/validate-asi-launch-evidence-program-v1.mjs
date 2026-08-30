#!/usr/bin/env node
import fs from 'node:fs';

const programPath = process.argv[2] || 'coordination/kidults/source-intelligence/asi-launch-evidence-program-v1.json';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const clone = value => structuredClone(value);

function validate(program) {
  assert(program.id === 'kidults-asi-launch-evidence-program-v1' && program.version === '1.0.0', 'PROGRAM_IDENTITY');
  assert(program.status === 'ACTIVE_FAIL_CLOSED_EXTERNAL_EVIDENCE_REQUIRED', 'PROGRAM_STATUS');
  assert(program.targets.launch_sources_min === 1 && program.targets.launch_sources_recommended === 2, 'LAUNCH_SOURCE_TARGET');
  const samplePolicy = read(program.authoritative_inputs.sample_governance);
  assert(program.targets.lawful_current_sold_events === null, 'FIXED_SAMPLE_TARGET_REMAINS');
  assert(samplePolicy.rights_gate.mode === 'CENSUS_NOT_SAMPLE' && samplePolicy.coverage_gate.separate_from_sample_size === true, 'SAMPLE_POLICY_BOUNDARY');
  assert(program.targets.scale_verticals === 8 && program.targets.scale_independent_source_owners === 32 && program.targets.scale_current_sold_events === 40000, 'GLOBAL_SCALE_TARGET');
  assert(program.stages.length === 8 && program.stages.every((stage, index) => stage.ordinal === index + 1), 'STRICT_STAGE_SEQUENCE');

  const rights = read(program.authoritative_inputs.rights_decisions);
  const snapshots = read(program.authoritative_inputs.rights_snapshots);
  const schemas = read(program.authoritative_inputs.source_schema_snapshots);
  const eligibilityContract = read(program.authoritative_inputs.source_eligibility_contract);
  const adapters = read(program.authoritative_inputs.adapter_registry);
  const controlPlane = read(program.authoritative_inputs.source_control_plane);
  const staging = read(program.authoritative_inputs.staging_admission);
  const runtime = read(program.authoritative_inputs.runtime_boundary);
  const providers = read(program.authoritative_inputs.provider_registry);
  assert(Array.isArray(providers.providers), 'PROVIDER_REGISTRY_UNREADABLE');

  const active = rights.records.filter(record => record.work_state === 'ACTIVE').map(record => record.source_id);
  const queued = rights.records.filter(record => record.work_state === 'QUEUED').map(record => record.source_id);
  assert(program.negotiation_queue.wip_limit === 6 && active.length === 6 && queued.length === 6, 'NEGOTIATION_WIP_COUNTS');
  assert(program.negotiation_queue.membership_source === 'DERIVED_FROM_RIGHTS_DECISIONS_WORK_STATE', 'NEGOTIATION_MEMBERSHIP_SOURCE');
  assert(program.negotiation_queue.wip_limit === 6 && active.length <= program.negotiation_queue.wip_limit, 'NEGOTIATION_BACKPRESSURE');
  assert(program.qualification_queue_control.wip_limit === 64 && program.qualification_queue_control.current_pending <= 64, 'QUALIFICATION_WIP_OVERFLOW');
  assert(program.qualification_queue_control.current_pending < program.qualification_queue_control.backpressure_at || program.qualification_queue_control.new_curated_admission === 'PAUSED_AT_BACKPRESSURE', 'QUALIFICATION_BACKPRESSURE_BYPASS');
  assert(program.qualification_queue_control.resolution_due_runs === 5 && program.qualification_queue_control.timeout_action === 'MOVE_TO_DLQ_AND_RETAIN_RESEARCH_ONLY' && program.qualification_queue_control.promotion_from_dlq === false, 'QUALIFICATION_DLQ_POLICY');

  const stage = id => program.stages.find(item => item.id === id);
  const capture = stage('CAPTURE_AND_REUSE_RIGHTS');
  assert(capture.observed.reviewed_sources === rights.summary.sources_reviewed, 'RIGHTS_REVIEW_COUNT_DRIFT');
  assert(capture.observed.snapshot_bound === snapshots.summary.source_content_snapshot_bound, 'SNAPSHOT_BOUND_COUNT_DRIFT');
  assert(capture.observed.capture_permission_evidence_pending === snapshots.summary.capture_permission_evidence_pending, 'CAPTURE_PENDING_COUNT_DRIFT');
  assert(capture.observed.reference_only === snapshots.summary.reference_only_not_captured_due_restriction, 'REFERENCE_ONLY_COUNT_DRIFT');
  assert(capture.observed.rights_clear_current_sold === rights.summary.rights_clear_for_current_sold, 'RIGHTS_CLEAR_COUNT_DRIFT');

  const activation = stage('ADAPTER_AND_LAWFUL_SAMPLE_GATE');
  assert(activation.observed.empirically_active_adapters === controlPlane.summary.empirically_active_adapters, 'ACTIVE_ADAPTER_COUNT_DRIFT');
  assert(activation.observed.lawful_current_sold_events === adapters.truth_boundary.market_events_created, 'LAWFUL_EVENT_COUNT_DRIFT');
  const postgres = stage('POSTGRESQL_IMMUTABLE_RECEIPTS');
  assert(postgres.observed.remote_staging_execution === (runtime.remaining_internal_p0.postgres_remote_staging_execution === 'PROVEN'), 'REMOTE_POSTGRES_TRUTH_DRIFT');
  assert(postgres.observed.pitr_proven === (runtime.remaining_internal_p0.pitr === 'PROVEN'), 'PITR_TRUTH_DRIFT');
  const trackB = stage('TRACK_B_TO_PROJECTION');
  assert(trackB.observed.track_b_results === adapters.truth_boundary.track_b_results_created, 'TRACK_B_COUNT_DRIFT');
  assert(trackB.observed.approved_projections === adapters.truth_boundary.projections_created, 'PROJECTION_COUNT_DRIFT');
  assert(staging.empty_state.track_b === 'NOT_STARTED' || trackB.observed.track_b_results > 0, 'STAGING_TRACK_B_DRIFT');

  const schemaBy = new Map(schemas.records.map(record => [record.source_id, record]));
  const snapshotBy = new Map(snapshots.records.map(record => [record.source_id, record]));
  const derivedEligibleCeiling = rights.records.filter(record => {
    const snapshot = snapshotBy.get(record.source_id), schema = schemaBy.get(record.source_id);
    return record.decision === eligibilityContract.eligibility_rules.rights_decision &&
      Object.entries(eligibilityContract.eligibility_rules.required_rights).every(([key, value]) => record.rights?.[key] === value) &&
      snapshot?.capture_state === eligibilityContract.eligibility_rules.snapshot_state && snapshot?.decision_promotion_eligible === true &&
      schema?.state === eligibilityContract.eligibility_rules.schema_state && schema?.terminal_sold_compatible === true;
  }).length;
  const eligible = stage('VALUE_RIGHTS_SCHEMA_ELIGIBILITY').observed.eligible_sources;
  assert(eligible <= derivedEligibleCeiling, 'ELIGIBLE_SOURCE_COUNT_EXCEEDS_DERIVED_EVIDENCE_CEILING');
  if (derivedEligibleCeiling === 0) assert(eligible === 0, 'ELIGIBLE_SOURCE_WITHOUT_RIGHTS_SNAPSHOT_SCHEMA');
  assert(eligible <= rights.summary.rights_clear_for_current_sold && eligible <= snapshots.summary.promotion_eligible, 'ELIGIBLE_WITHOUT_RIGHTS_SNAPSHOT');
  assert(activation.observed.empirically_active_adapters <= eligible, 'ADAPTER_BEFORE_ELIGIBILITY');
  assert(activation.observed.lawful_current_sold_events === 0 || activation.observed.empirically_active_adapters > 0, 'EVENTS_WITHOUT_ACTIVE_ADAPTER');
  assert(postgres.observed.persistent_receipts <= activation.observed.lawful_current_sold_events, 'RECEIPTS_EXCEED_LAWFUL_EVENTS');
  if (!postgres.observed.remote_staging_execution || !postgres.observed.pitr_proven) assert(postgres.observed.persistent_receipts === 0, 'PERSISTENT_RECEIPTS_WITHOUT_REMOTE_RUNTIME');
  assert(trackB.observed.track_b_results <= postgres.observed.persistent_receipts, 'TRACK_B_BEFORE_PERSISTENT_RECEIPTS');
  assert(trackB.observed.approved_projections <= trackB.observed.track_b_results, 'PROJECTION_BEFORE_TRACK_B');
  const scale = stage('GLOBAL_BETA_SCALE').observed;
  assert(scale.active_verticals === 0 || trackB.observed.approved_projections > 0, 'SCALE_BEFORE_LAUNCH_CELL');
  assert(scale.active_verticals <= program.targets.scale_verticals && scale.independent_source_owners <= program.targets.scale_independent_source_owners && scale.lawful_current_sold_events <= program.targets.scale_current_sold_events, 'SCALE_OBSERVED_EXCEEDS_TARGET');

  assert(program.promotion_law.strict_stage_order === true && program.promotion_law.rights_unknown_is_hold === true && program.promotion_law.public_visibility_is_permission === false, 'PROMOTION_LAW_WEAKENED');
  assert(program.authority_boundary.production === 'HOLD' && program.authority_boundary.public_release === 'HOLD' && program.authority_boundary.g5 === 'HOLD', 'PROTECTED_GATE_WEAKENED');
  return {active, queued};
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
expectFailure('ACTIVE_ADAPTER_COUNT_DRIFT', candidate => { candidate.stages.find(stage => stage.id === 'ADAPTER_AND_LAWFUL_SAMPLE_GATE').observed.empirically_active_adapters = 1; });
expectFailure('TRACK_B_COUNT_DRIFT', candidate => { candidate.stages.find(stage => stage.id === 'TRACK_B_TO_PROJECTION').observed.track_b_results = 1; });
expectFailure('PROJECTION_COUNT_DRIFT', candidate => { const stage = candidate.stages.find(item => item.id === 'TRACK_B_TO_PROJECTION'); stage.observed.approved_projections = 1; });
expectFailure('SCALE_BEFORE_LAUNCH_CELL', candidate => { candidate.stages.find(stage => stage.id === 'GLOBAL_BETA_SCALE').observed.active_verticals = 1; });
expectFailure('PROTECTED_GATE_WEAKENED', candidate => { candidate.authority_boundary.production = 'ALLOW'; });
expectFailure('QUALIFICATION_WIP_OVERFLOW', candidate => { candidate.qualification_queue_control.current_pending = 65; });

console.log(JSON.stringify({
  suite: 'KIDULTS_ASI_LAUNCH_EVIDENCE_PROGRAM_V1',
  result: 'VERIFIED_PASS',
  stages: program.stages.length,
  negotiation_active: result.active.length,
  negotiation_queued: result.queued.length,
  rights_clear_sources: program.stages.find(stage => stage.id === 'CAPTURE_AND_REUSE_RIGHTS').observed.rights_clear_current_sold,
  lawful_current_sold_events: program.stages.find(stage => stage.id === 'ADAPTER_AND_LAWFUL_SAMPLE_GATE').observed.lawful_current_sold_events,
  protected_gates: 'HOLD',
  negative_tests: 6
}));
