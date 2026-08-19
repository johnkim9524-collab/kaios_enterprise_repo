import fs from 'node:fs';

const policyPath = process.argv[2] || 'coordination/kidults/source-intelligence/asi-global-regional-market-balance-policy-v1.json';
const bindingPath = process.argv[3] || 'coordination/kidults/source-intelligence/asi-global-regional-market-balance-binding-v1.json';
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }
function sum(obj) { return Object.values(obj).reduce((a, b) => a + b, 0); }

assert(policy.id === 'asi-global-regional-market-balance-policy-v1', 'POLICY_ID_INVALID');
assert(policy.production === 'HOLD' && policy.public_release === 'HOLD', 'RELEASE_HOLD_REQUIRED');
assert(Array.isArray(policy.canonical_macroregions) && policy.canonical_macroregions.length === 8, 'EIGHT_MACROREGIONS_REQUIRED');
assert(new Set(policy.canonical_macroregions.map(r => r.id)).size === 8, 'DUPLICATE_MACROREGION');
const bootstrapSum = policy.canonical_macroregions.reduce((n, r) => n + r.bootstrap_collection_share, 0);
assert(near(bootstrapSum, 1), `BOOTSTRAP_SHARE_SUM_INVALID:${bootstrapSum}`);
assert(policy.bootstrap_state?.mode === 'STRUCTURAL_BOOTSTRAP_NOT_MARKET_SHARE', 'BOOTSTRAP_TRUTH_BOUNDARY_REQUIRED');
assert(policy.bootstrap_state?.market_scale_estimates_verified === false, 'UNVERIFIED_MARKET_SHARE_MUST_NOT_BE_CLAIMED');

assert(near(sum(policy.collection_priority_model.factor_weights), 1), 'COLLECTION_FACTOR_WEIGHTS_MUST_SUM_1');
assert(near(sum(policy.collection_priority_model.bootstrap_blend), 1), 'BOOTSTRAP_BLEND_MUST_SUM_1');
assert(near(sum(policy.analytical_weight_model.factor_weights), 1), 'ANALYTICAL_FACTOR_WEIGHTS_MUST_SUM_1');
assert(policy.analytical_weight_model.record_count_weight === 0, 'RECORD_COUNT_MUST_NOT_DRIVE_ANALYTICAL_WEIGHT');
assert(policy.analytical_weight_model.must_be_computed_separately_from_collection_share === true, 'COLLECTION_ANALYSIS_SEPARATION_REQUIRED');

const c = policy.collection_priority_model.portfolio_constraints;
assert(c.maximum_macroregion_share_without_explicit_exception <= 0.35, 'MACROREGION_COLLECTION_CAP_TOO_HIGH');
assert(c.maximum_single_country_share_without_explicit_exception <= 0.30, 'COUNTRY_COLLECTION_CAP_TOO_HIGH');
assert(c.minimum_macroregion_share_when_strategically_relevant >= 0.04, 'REGIONAL_FLOOR_TOO_LOW');
assert(Array.isArray(c.exception_requires) && c.exception_requires.length >= 3, 'GOVERNED_EXCEPTION_REQUIREMENTS_MISSING');

const global = policy.claim_geography_gates?.GLOBAL;
assert(global.minimum_macroregions >= 5, 'GLOBAL_GATE_REGION_FLOOR_TOO_LOW');
assert(global.minimum_weighted_market_coverage >= 0.75, 'GLOBAL_GATE_COVERAGE_TOO_LOW');
assert(global.maximum_single_macroregion_analytical_contribution <= 0.45, 'GLOBAL_ANALYTICAL_MACRO_CAP_TOO_HIGH');
assert(global.maximum_single_country_analytical_contribution <= 0.35, 'GLOBAL_ANALYTICAL_COUNTRY_CAP_TOO_HIGH');
assert(global.rights_and_provenance_coverage === 1, 'GLOBAL_RIGHTS_PROVENANCE_MUST_BE_COMPLETE');
assert(global.failure_state === 'NOT_VERIFIED_GLOBAL', 'GLOBAL_FAIL_CLOSED_STATE_REQUIRED');

const dimensions = new Set(policy.required_market_record_dimensions || []);
for (const field of ['macroregion_id','country_code','language','currency','source_role','evidence_class','rights_state','provenance_ref','source_owner_id']) {
  assert(dimensions.has(field), `REQUIRED_MARKET_DIMENSION_MISSING:${field}`);
}

const metrics = new Set(policy.coverage_and_bias_metrics?.required || []);
for (const metric of ['REGIONAL_COLLECTION_SHARE','REGIONAL_ANALYTICAL_WEIGHT','REGIONAL_COVERAGE_DEBT','REGIONAL_HHI','COUNTRY_HHI','SOURCE_OWNER_HHI_BY_REGION','LOCAL_VENUE_DIVERSITY','SOURCE_REMOVAL_SENSITIVITY_BY_REGION']) {
  assert(metrics.has(metric), `REQUIRED_BIAS_METRIC_MISSING:${metric}`);
}

assert(policy.category_region_matrix_rule?.no_global_pool_without_cell_binding === true, 'CELL_BINDING_REQUIRED');
assert(binding.policy === policyPath, 'BINDING_POLICY_PATH_MISMATCH');
assert(binding.production === 'HOLD' && binding.public_release === 'HOLD', 'BINDING_RELEASE_HOLD_REQUIRED');
const consumers = new Set(binding.consumer_engines || []);
for (const engine of ['SOURCE_DISCOVERY_ENGINE','SOURCE_CLASSIFICATION_ENGINE','COVERAGE_AND_BIAS_ENGINE','ACQUISITION_PLANNER','SOURCE_POOL_EVOLUTION_ENGINE','MARKET_GRAPH_ENGINE','KIDULT_100_ENGINE']) {
  assert(consumers.has(engine), `ASI_CONSUMER_BINDING_MISSING:${engine}`);
}
assert(binding.fail_closed?.global_gate_failure === 'NOT_VERIFIED_GLOBAL', 'BINDING_GLOBAL_FAIL_CLOSED_REQUIRED');
assert(binding.execution_precedence?.at(-1) === 'VOLUME', 'VOLUME_MUST_HAVE_LOWEST_PRECEDENCE');

console.log(JSON.stringify({
  status: 'PASS',
  macroregions: policy.canonical_macroregions.length,
  bootstrap_share_sum: bootstrapSum,
  collection_factor_sum: sum(policy.collection_priority_model.factor_weights),
  analytical_factor_sum: sum(policy.analytical_weight_model.factor_weights),
  global_minimum_macroregions: global.minimum_macroregions,
  global_minimum_weighted_market_coverage: global.minimum_weighted_market_coverage,
  record_count_analytical_weight: policy.analytical_weight_model.record_count_weight,
  production: policy.production,
  public_release: policy.public_release
}));
