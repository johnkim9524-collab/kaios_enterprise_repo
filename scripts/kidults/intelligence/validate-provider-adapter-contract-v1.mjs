import fs from 'node:fs';
import assert from 'node:assert/strict';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/provider/provider-adapter-contract-v1.json', 'utf8'));
assert.equal(contract.version, '1.1.0');
assert.equal(contract.sample_policy, 'coordination/kidults/governance/provider-evidence-zero-defect-sample-policy-v1.json');
assert.equal(contract.negotiation_policy, 'coordination/kidults/provider/provider-sample-governance-negotiation-v1.json');
assert.equal(contract.rights_gate.required_state, 'ALLOW');
assert.equal(contract.rights_gate.unknown_behavior, 'HOLD');
assert.equal(contract.rights_gate.per_record_or_authorized_dataset_census, true);
assert.equal(contract.rights_gate.sample_majority_cannot_override, true);
assert.equal(contract.activation_boundary.production_allowed, false);
assert.equal(contract.activation_boundary.sample_target_is_purchase_commitment, false);
assert.equal(contract.activation_boundary.pilot_success_is_production_authorization, false);

const grading = contract.provider_classes.GRADING_EVIDENCE;
for (const rule of [
  'NO_PROVIDER_CENSUS_SUMMATION',
  'RIGHTS_UNKNOWN_IS_HOLD',
  'MISSING_POPULATION_REMAINS_UNKNOWN',
  'KNOWN_IDENTIFIER_ONLY_NO_ENUMERATION',
  'BOUNDED_120_IS_FUNCTIONAL_PILOT_NOT_RELIABILITY',
]) {
  assert.ok(grading.hard_rules.includes(rule));
}
assert.equal(grading.canonical_output, 'grading-evidence-v1');
for (const field of ['provider_schema_version', 'rights_receipt_digest', 'source_provenance_digest']) {
  assert.ok(grading.required_source_fields.includes(field));
}

const market = contract.provider_classes.COLLECTOR_MARKET_EVENT;
for (const rule of [
  'ASK_IS_NOT_SOLD',
  'DUPLICATE_REPUBLICATION_COUNTS_ONCE',
  'CORROBORATING_SOURCE_OWNERS_ARE_PRESERVED',
  'FAILED_SALE_IS_NOT_ZERO_PRICE',
  'MISSING_IS_NOT_ZERO',
  'FALSE_TERMINAL_SOLD_STATE_IS_CRITICAL_DEFECT',
]) {
  assert.ok(market.hard_rules.includes(rule));
}
assert.equal(market.canonical_output, 'market-event-v1');
assert.ok(market.sold_event_required_fields.includes('terminal_state_evidence'));

const requiredStages = [
  'DISCOVER',
  'RIGHTS_PREFLIGHT',
  'NEGOTIATE_STAGE_AND_VOLUME_BAND',
  'FIELD_MAP',
  'CONTROL_REPLAY',
  'CANARY_5',
  'BOUNDED_FUNCTIONAL_PILOT_30_TO_120',
  'OPTIONAL_ADAPTER_QUALIFICATION',
  'NORMALIZE',
  'VALIDATE_RIGHTS_SCHEMA_QUALITY_AND_COVERAGE',
  'TRACK_B_ASSESS',
  'ADMIT_OR_HOLD',
  'EMIT_CANONICAL_EVIDENCE',
];
assert.deepEqual(contract.adapter_lifecycle, requiredStages);

assert.equal(contract.sample_and_quality_gate.zero_failure_targets.ADAPTER_QUALIFICATION, 459);
assert.equal(contract.sample_and_quality_gate.zero_failure_targets.PRIVATE_E2E_RELIABILITY, 1840);
assert.equal(contract.sample_and_quality_gate.zero_failure_targets.BETA_RELIABILITY, 4603);
assert.equal(contract.sample_and_quality_gate.critical_defect_tolerance, 0);
assert.equal(contract.sample_and_quality_gate.duplicate_retry_and_republication_inflate_n, false);
assert.equal(contract.sample_and_quality_gate.parse_drop_and_timeout_are_failures, true);
assert.equal(contract.sample_and_quality_gate.track_b_independent_recomputation_required, true);

console.log(JSON.stringify({
  status: 'PASS',
  contract: contract.id,
  grading_rules: grading.hard_rules.length,
  market_rules: market.hard_rules.length,
  tiers: contract.sample_and_quality_gate.zero_failure_targets,
  production: 'HOLD',
}, null, 2));
