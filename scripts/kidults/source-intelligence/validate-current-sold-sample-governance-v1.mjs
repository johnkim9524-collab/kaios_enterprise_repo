#!/usr/bin/env node
import fs from 'node:fs';

const path = process.argv[2] || 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json';
const fail = (code) => { throw new Error(code); };
const ok = (condition, code) => { if (!condition) fail(code); };
const clone = (value) => JSON.parse(JSON.stringify(value));

const validate = (policy) => {
  ok(policy.id === 'KIDULTS_CURRENT_SOLD_SAMPLE_GOVERNANCE_V1' && policy.version === '1.1.0', 'POLICY_IDENTITY');
  ok(policy.rights_gate.mode === 'CENSUS_NOT_SAMPLE' && policy.rights_gate.required_for_every_event === true, 'RIGHTS_NOT_CENSUS');
  ok(policy.rights_gate.unknown_or_expired_is === 'HOLD' && policy.rights_gate.critical_rights_defect_tolerance === 0, 'RIGHTS_FAIL_CLOSED');
  ok(policy.statistical_method.interval === 'ONE_SIDED_EXACT_CLOPPER_PEARSON_UPPER_BOUND', 'INTERVAL_METHOD');
  ok(policy.statistical_method.confidence === 0.99 && policy.statistical_method.alpha === 0.01, 'TOP_TIER_CONFIDENCE');
  ok(policy.statistical_method.optional_stopping === false && policy.statistical_method.threshold_change_after_observation === false, 'STAT_STOPPING_POLICY');
  const tiers = new Map(policy.tiers.map((tier) => [tier.id, tier]));
  for (const id of ['CANARY', 'BOUNDED_FUNCTIONAL_PILOT', 'ADAPTER_QUALIFICATION', 'PRIVATE_E2E', 'BETA_RELIABILITY']) {
    ok(tiers.has(id), `MISSING_TIER:${id}`);
  }
  for (const [id, tier] of tiers) {
    ok(tier.claim_target === 'DATED_OBSERVED_SOLD_TRANSACTION', `CLAIM_TARGET_NOT_EXPLICIT:${id}`);
  }
  ok(tiers.get('CANARY').purpose === 'SCHEMA_AND_BOUNDARY_SMOKE' && tiers.get('CANARY').min_n === 5 && tiers.get('CANARY').max_n === 5, 'CANARY_EXACT_FIVE_POLICY');
  ok(tiers.get('BOUNDED_FUNCTIONAL_PILOT').min_n === 30 && tiers.get('BOUNDED_FUNCTIONAL_PILOT').max_n === 120 && tiers.get('BOUNDED_FUNCTIONAL_PILOT').statistical_claim === false, 'BOUNDED_PILOT_POLICY');
  const required = (tolerance, alpha = policy.statistical_method.alpha) => Math.ceil(Math.log(alpha) / Math.log(1 - tolerance));
  ok(tiers.get('ADAPTER_QUALIFICATION').zero_failure_n === required(0.01), 'ADAPTER_N_FORMULA');
  ok(tiers.get('PRIVATE_E2E').zero_failure_n === required(0.0025), 'E2E_N_FORMULA');
  ok(tiers.get('BETA_RELIABILITY').zero_failure_n === required(0.001), 'BETA_N_FORMULA');
  for (const id of ['ADAPTER_QUALIFICATION', 'PRIVATE_E2E', 'BETA_RELIABILITY']) {
    ok(tiers.get(id).critical_defect_tolerance === 0, `CRITICAL_DEFECT_NOT_ZERO:${id}`);
  }
  ok(tiers.get('PRIVATE_E2E').min_independent_ultimate_owners === 2 && tiers.get('PRIVATE_E2E').max_owner_share === 0.70, 'E2E_CONCENTRATION');
  ok(policy.defect_taxonomy.CRITICAL.tolerance === 0, 'CRITICAL_TAXONOMY');
  ok(policy.defect_taxonomy.MAJOR_A.tolerance === 0.001, 'MAJOR_A_TAXONOMY');
  ok(policy.defect_taxonomy.MAJOR_B.tolerance === 0.0025, 'MAJOR_B_TAXONOMY');
  ok(policy.defect_taxonomy.OPERATIONAL.tolerance === 0.01, 'OPERATIONAL_TAXONOMY');
  ok(policy.coverage_gate.separate_from_sample_size === true && policy.coverage_gate.market_representativeness_inferred_from_n === false, 'COVERAGE_SEPARATION');
  ok(policy.coverage_gate.duplicate_cluster_is_independent_sample === false, 'DUPLICATE_CLUSTER_INDEPENDENCE');
  ok(policy.failure_accounting.parse_drop_counts_as === 'FAILURE' && policy.failure_accounting.timeout_counts_as === 'FAILURE', 'FAILURE_ACCOUNTING');
  ok(policy.failure_accounting.retry_is_new_independent_success === false && policy.failure_accounting.duplicate_event_counts_as === 'INVALID_AND_HOLD', 'DEDUPE_ACCOUNTING');
  ok(policy.automatic_escalation.requested_claim_is_authoritative === true && policy.automatic_escalation.lower_tier_cannot_satisfy_higher_claim === true, 'AUTO_ESCALATION_POLICY');
  ok(policy.automatic_escalation.public_or_production_request_requires === 'PRODUCTION' && policy.automatic_escalation.threshold_downgrade_at_runtime === false, 'RELEASE_ESCALATION_POLICY');
  ok(policy.automatic_escalation.policy_version_and_digest_sealed_before_observation === true, 'PRE_OBSERVATION_POLICY_SEAL');
  const readiness = policy.promotion_matrix.PRODUCTION_READINESS;
  ok(readiness.required_tier === 'BETA_RELIABILITY' && readiness.required_natural_runs === 30 && readiness.required_window_days === 7, 'PRODUCTION_READINESS_MATRIX');
  ok(readiness.requires_slo_error_budget === true, 'PRODUCTION_READINESS_SLO_ERROR_BUDGET');
  ok(readiness.requires_pitr_rollback_receipt === true, 'PRODUCTION_READINESS_PITR_ROLLBACK');
  ok(readiness.release_allowed === false, 'PRODUCTION_READINESS_RELEASE_BOUNDARY');
  const production = policy.promotion_matrix.PRODUCTION;
  ok(production.required_tier === 'PRODUCTION_READINESS', 'PRODUCTION_REQUIRED_TIER');
  ok(production.release_allowed === true, 'PRODUCTION_RELEASE_ROUTE');
  ok(production.program_owner_approval_required === true, 'PRODUCTION_APPROVAL_MATRIX');
  return tiers;
};

const policy = JSON.parse(fs.readFileSync(path, 'utf8'));
const tiers = validate(policy);

const mutations = [
  ['rights-census-disabled', (p) => { p.rights_gate.required_for_every_event = false; }],
  ['rights-unknown-not-hold', (p) => { p.rights_gate.unknown_or_expired_is = 'PASS'; }],
  ['confidence-weakened', (p) => { p.statistical_method.confidence = 0.95; }],
  ['optional-stopping-enabled', (p) => { p.statistical_method.optional_stopping = true; }],
  ['retry-counted-independent', (p) => { p.failure_accounting.retry_is_new_independent_success = true; }],
  ['natural-run-count-lowered', (p) => { p.promotion_matrix.PRODUCTION_READINESS.required_natural_runs = 29; }],
  ['natural-run-window-lowered', (p) => { p.promotion_matrix.PRODUCTION_READINESS.required_window_days = 6; }],
  ['slo-error-budget-disabled', (p) => { p.promotion_matrix.PRODUCTION_READINESS.requires_slo_error_budget = false; }],
  ['pitr-rollback-disabled', (p) => { p.promotion_matrix.PRODUCTION_READINESS.requires_pitr_rollback_receipt = false; }],
  ['readiness-self-release-enabled', (p) => { p.promotion_matrix.PRODUCTION_READINESS.release_allowed = true; }],
  ['program-owner-approval-disabled', (p) => { p.promotion_matrix.PRODUCTION.program_owner_approval_required = false; }],
  ['public-route-downgraded', (p) => { p.automatic_escalation.public_or_production_request_requires = 'BETA_RELIABILITY'; }],
  ['runtime-threshold-downgrade-enabled', (p) => { p.automatic_escalation.threshold_downgrade_at_runtime = true; }],
  ['canary-not-exact-five', (p) => { p.tiers.find((tier) => tier.id === 'CANARY').max_n = 6; }],
  ['claim-target-weakened', (p) => { p.tiers.find((tier) => tier.id === 'CANARY').claim_target = 'GENERIC_RECORD'; }],
];

for (const [name, mutate] of mutations) {
  const mutated = clone(policy);
  mutate(mutated);
  let rejected = false;
  try {
    validate(mutated);
  } catch {
    rejected = true;
  }
  ok(rejected, `NEGATIVE_MUTATION_NOT_REJECTED:${name}`);
}

console.log(JSON.stringify({
  suite: 'CURRENT_SOLD_SAMPLE_GOVERNANCE_V1',
  result: 'VERIFIED_PASS',
  tiers: Object.fromEntries([...tiers].map(([key, value]) => [key, {
    min_n: value.min_n,
    max_n: value.max_n,
    zero_failure_n: value.zero_failure_n || null,
    claim_target: value.claim_target,
  }])),
  rights: 'CENSUS',
  coverage: 'SEPARATE',
  optional_stopping: false,
  production_readiness_release_allowed: false,
  explicit_program_owner_approval_required: true,
  negative_tests: mutations.length,
}));
