import fs from 'node:fs';

const planPath = process.argv[2] || 'coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json';
const contractPath = process.argv[3] || 'coordination/kidults/entity-resolution/entity-resolution-benchmark-v2-contract.json';
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const policy = contract.empirical_attestation_policy.empirical_sample_policy;
const fail = m => { throw new Error(m); };

if (plan.production !== 'HOLD') fail('PRODUCTION_MUST_HOLD');
if (plan.dataset_target.dataset_class_required !== 'REAL_WORLD_LABELED') fail('REAL_WORLD_LABELED_REQUIRED');
if (plan.dataset_target.constructed_controls_allowed_for_promotion !== false) fail('CONSTRUCTED_CONTROLS_MUST_NOT_PROMOTE');
if (plan.dataset_target.labels_from_resolver_under_test_allowed !== false) fail('LABEL_LEAKAGE_PROHIBITED');
if (plan.dataset_target.total_cases < policy.minimum_total_cases) fail('TOTAL_CASE_FLOOR');
if (plan.dataset_target.blind_holdout_cases < policy.minimum_blind_holdout_cases) fail('BLIND_CASE_FLOOR');

const requiredArchetypes = [...contract.empirical_attestation_policy.required_poc_scope_archetypes].sort();
const observedArchetypes = plan.strata.map(s => s.archetype).sort();
if (JSON.stringify(requiredArchetypes) !== JSON.stringify(observedArchetypes)) fail('ARCHETYPE_SET_MISMATCH');

for (const s of plan.strata) {
  if (s.cases < policy.minimum_cases_per_required_scope_archetype) fail(`STRATUM_CASE_FLOOR:${s.archetype}`);
  if (s.blind < policy.minimum_blind_cases_per_required_scope_archetype) fail(`STRATUM_BLIND_FLOOR:${s.archetype}`);
  const classSum = Object.values(s.case_class_targets).reduce((a,b)=>a+b,0);
  const boundarySum = Object.values(s.identity_boundary_targets).reduce((a,b)=>a+b,0);
  if (classSum !== s.cases) fail(`CASE_CLASS_ALLOCATION_MISMATCH:${s.archetype}`);
  if (boundarySum !== s.cases) fail(`BOUNDARY_ALLOCATION_MISMATCH:${s.archetype}`);
}

for (const c of contract.required_case_classes) {
  if ((plan.aggregate_targets.case_classes[c] || 0) < policy.minimum_cases_per_required_case_class) fail(`CASE_CLASS_FLOOR:${c}`);
}
for (const b of contract.identity_boundaries) {
  if ((plan.aggregate_targets.identity_boundaries[b] || 0) < policy.minimum_cases_per_identity_boundary) fail(`IDENTITY_BOUNDARY_FLOOR:${b}`);
}
if (plan.review_protocol.minimum_independent_reviewers < contract.empirical_attestation_policy.minimum_independent_reviewers) fail('REVIEWER_FLOOR');
if (!plan.holdout_protocol.partition_case_ids_before_model_freeze || !plan.holdout_protocol.blind_case_labels_absent_from_modeling_inputs || !plan.holdout_protocol.partition_commit_sha_must_precede_model_freeze_sha) fail('HOLDOUT_SEAL_PROTOCOL_INCOMPLETE');
if (plan.review_protocol.current_state !== 'REVIEWERS_NOT_YET_ATTESTED') fail('MUST_NOT_FAKE_REVIEW_COMPLETION');
if (plan.downstream.canonical_empirical_attestation !== 'REQUIRED_NOT_YET_CREATED' || plan.downstream.track_b !== 'REQUIRED_NOT_STARTED') fail('DOWNSTREAM_OVERCLAIM');

console.log(JSON.stringify({status:'PASS_PREFLIGHT_ONLY', total_cases:plan.dataset_target.total_cases, blind_cases:plan.dataset_target.blind_holdout_cases, strata:plan.strata.length, production:'HOLD'}, null, 2));
