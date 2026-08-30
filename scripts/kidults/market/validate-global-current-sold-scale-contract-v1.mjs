#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const contractPath = path.resolve(process.argv[2] || 'coordination/kidults/market/global-current-sold-scale-contract-v1.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

assert(contract.id === 'kidults-global-current-sold-scale-contract-v1', 'CONTRACT_ID_MISMATCH');
assert(contract.status === 'MANDATORY_FAIL_CLOSED', 'CONTRACT_NOT_MANDATORY_FAIL_CLOSED');
assert(contract.core_vertical_count === 8, 'CORE_VERTICAL_COUNT_MUST_EQUAL_EIGHT');
assert(contract.truth_boundary?.total_record_count_alone_never_proves_global_readiness === true, 'TOTAL_ONLY_FALSE_PROMOTION_GUARD_MISSING');
assert(contract.truth_boundary?.one_hundred_or_one_hundred_twenty_records_are_admission_only === true, 'ADMISSION_ONLY_BOUNDARY_MISSING');
assert(contract.truth_boundary?.production_public_paid_and_g5_require_separate_authority === true, 'PROTECTED_AUTHORITY_BOUNDARY_MISSING');
assert(contract.event_admission?.rights_clear_for_exact_purpose_required === true, 'EXACT_PURPOSE_RIGHTS_GATE_MISSING');
assert(contract.event_admission?.immutable_evidence_receipt_required === true, 'IMMUTABLE_RECEIPT_GATE_MISSING');
assert(contract.event_admission?.track_b_required_before_projection === true, 'TRACK_B_GATE_MISSING');

const expected = [
  ['E2E_EMPIRICAL_ADMISSION', 120, 1],
  ['GLOBAL_MARKET_INTELLIGENCE_BETA', 40000, 8],
  ['GLOBAL_COMMERCIAL_LAUNCH_EVIDENCE_READY', 400000, 8],
  ['GLOBAL_NORMAL_OPERATIONS_EVIDENCE_READY', 2000000, 8],
  ['GLOBAL_LEADERSHIP_EVIDENCE_READY', 10000000, 8]
];
assert(Array.isArray(contract.stages) && contract.stages.length === expected.length, 'STAGE_SET_MISMATCH');
let previousTotal = 0;
for (const [index, [stageName, floor, activeVerticals]] of expected.entries()) {
  const stage = contract.stages[index];
  assert(stage.stage === stageName, `STAGE_ORDER_MISMATCH:${stageName}`);
  assert(stage.minimum_total_current_sold_events === floor, `GLOBAL_SCALE_FLOOR_MISMATCH:${stageName}`);
  assert(stage.minimum_total_current_sold_events > previousTotal, `NON_MONOTONIC_GLOBAL_SCALE:${stageName}`);
  assert(stage.minimum_active_verticals === activeVerticals, `ACTIVE_VERTICAL_FLOOR_MISMATCH:${stageName}`);
  assert(stage.minimum_freshness_compliance_ratio >= 0.8 && stage.minimum_freshness_compliance_ratio <= 1, `FRESHNESS_FLOOR_INVALID:${stageName}`);
  assert(stage.public_market_intelligence_allowed === false, `PUBLIC_SELF_AUTHORIZATION_FORBIDDEN:${stageName}`);
  assert(stage.paid_product_allowed === false, `PAID_SELF_AUTHORIZATION_FORBIDDEN:${stageName}`);
  assert(stage.production_authorized === false, `PRODUCTION_SELF_AUTHORIZATION_FORBIDDEN:${stageName}`);
  assert(stage.g5_authorized === false, `G5_SELF_AUTHORIZATION_FORBIDDEN:${stageName}`);
  if (stageName !== 'E2E_EMPIRICAL_ADMISSION') {
    assert(stage.minimum_events_per_active_vertical > 0, `PER_VERTICAL_FLOOR_MISSING:${stageName}`);
    assert(stage.minimum_independent_source_owners_per_active_vertical >= 3, `SOURCE_DIVERSITY_TOO_LOW:${stageName}`);
    assert(stage.minimum_macro_regions_per_active_vertical >= 3, `REGIONAL_DIVERSITY_TOO_LOW:${stageName}`);
    assert(stage.minimum_currencies_per_active_vertical >= 3, `CURRENCY_DIVERSITY_TOO_LOW:${stageName}`);
  }
  previousTotal = stage.minimum_total_current_sold_events;
}

assert(contract.maximums?.fixed_record_cap === null, 'FIXED_RECORD_CAP_FORBIDDEN');
assert(contract.maximums?.fixed_object_cap === null, 'FIXED_OBJECT_CAP_FORBIDDEN');
assert(contract.current_state?.rights_clear_collector_current_sold_events === 0, 'UNVERIFIED_EMPIRICAL_COUNT_MUST_REMAIN_ZERO');
assert(contract.current_state?.highest_verified_stage === 'NONE', 'UNVERIFIED_STAGE_FALSE_PROMOTION');
assert(contract.current_state?.public_release === 'HOLD', 'PUBLIC_MUST_REMAIN_HOLD');
assert(contract.current_state?.production === 'HOLD', 'PRODUCTION_MUST_REMAIN_HOLD');
assert(contract.current_state?.g5 === 'HOLD', 'G5_MUST_REMAIN_HOLD');

process.stdout.write(JSON.stringify({
  id: 'kidults-global-current-sold-scale-contract-validation-v1',
  state: 'VERIFIED_PASS',
  contract: contract.id,
  stage_count: contract.stages.length,
  global_beta_floor: 40000,
  commercial_launch_evidence_floor: 400000,
  normal_operations_evidence_floor: 2000000,
  global_leadership_evidence_floor: 10000000,
  fixed_upper_cap: null,
  current_empirical_stage: contract.current_state.highest_verified_stage,
  public_release: contract.current_state.public_release,
  production: contract.current_state.production,
  g5: contract.current_state.g5
}, null, 2) + '\n');
