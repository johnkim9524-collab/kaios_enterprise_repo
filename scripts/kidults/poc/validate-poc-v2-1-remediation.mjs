import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'coordination/kidults/poc/poc-v2-1-remediation-execution-contract-v1.json');
const contract = JSON.parse(fs.readFileSync(file, 'utf8'));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(contract.issue === 457, 'issue must be #457');
expect(contract.production === 'HOLD', 'Production must remain HOLD');
expect(contract.provider_contact === 'HOLD', 'Broad Provider Contact must remain HOLD');
expect(Array.isArray(contract.p0_defects) && contract.p0_defects.length === 2, 'exactly two P0 defects must remain');
expect(contract.p0_defects.includes('REGIONAL_MARKET_INDEPENDENCE'), 'regional P0 missing');
expect(contract.p0_defects.includes('SCOPE_SPECIFIC_MARKET_ACTIVITY_DEPTH'), 'market activity P0 missing');

const guards = new Set(contract.truth_guards || []);
for (const required of [
  'EVIDENCE_BEFORE_METRICS',
  'CLAIM_STRENGTH_LE_EVIDENCE_STRENGTH',
  'MISSING_NE_ZERO',
  'ATTENTION_NE_DEMAND_NE_TRANSACTION',
  'LISTING_NE_SOLD_TRANSACTION',
  'BID_ASK_NE_TRANSACTION',
  'PUBLIC_REPRESENTATION_NE_REGIONAL_MARKET_SIGNIFICANCE',
  'SCARCITY_NE_LIQUIDITY',
  'PROVIDER_NE_TRUTH',
  'NO_FALSE_COMPARABILITY'
]) {
  expect(guards.has(required), `missing truth guard: ${required}`);
}

const claimPolicy = contract.claim_evidence_policy || {};
const txAdmission = claimPolicy.transaction_admission || {};
const escalation = claimPolicy.independence_escalation || {};
expect(claimPolicy.governing_rule === 'CLAIM_STRENGTH_LE_EVIDENCE_STRENGTH', 'claim/evidence governing rule missing');
expect(txAdmission.universal_minimum_sold_source_families === null, 'SOLD admission must not impose a universal family-count minimum');
expect(txAdmission.single_authoritative_source_allowed === true, 'single authoritative SOLD source must be admissible when transaction requirements pass');
for (const required of [
  'CANONICAL_PRODUCT_IDENTITY',
  'TERMINAL_SOLD_STATE',
  'SALE_DATE',
  'AMOUNT',
  'CURRENCY',
  'VENUE_OR_REFERENCE',
  'PROVENANCE',
  'RIGHTS_ADMISSIBLE',
  'FRESHNESS_STATE'
]) {
  expect(txAdmission.required_fields?.includes(required), `missing SOLD admission requirement: ${required}`);
}
for (const prohibited of [
  'SINGLE_TRANSACTION_TO_REPRESENTATIVE_MARKET_PRICE',
  'SINGLE_TRANSACTION_TO_LIQUIDITY',
  'SINGLE_TRANSACTION_TO_REGIONAL_MARKET_SIGNIFICANCE',
  'SINGLE_TRANSACTION_TO_CROSS_MARKET_RANK'
]) {
  expect(txAdmission.prohibited_inference?.includes(prohibited), `missing prohibited inference: ${prohibited}`);
}
expect(escalation.mode === 'RISK_BASED_BY_CLAIM', 'independence escalation must be risk-based by claim');
for (const claim of ['MARKET_REPRESENTATIVENESS', 'VALUATION', 'LIQUIDITY', 'REGIONAL_MARKET_SIGNIFICANCE', 'CROSS_MARKET_RANKING']) {
  expect(escalation.claims_requiring_progressively_stronger_corroboration?.includes(claim), `missing escalation claim: ${claim}`);
}

expect(contract.regional_independence?.minimum_independent_families >= 2, 'regional context candidate requires >=2 independent families');
expect(
  contract.regional_independence?.scope_of_rule === 'REGIONAL_CONTEXT_SOURCE_PAIR_CANDIDATE_ONLY_NOT_SOLD_TRANSACTION_ADMISSION',
  'regional two-family rule must be explicitly scoped away from SOLD transaction admission'
);
expect(
  contract.regional_independence?.required_components?.length === 1
    && contract.regional_independence.required_components[0] === 'TWO_PUBLISHER_INDEPENDENT_OFFICIAL_REGIONAL_INSTITUTION_RELEASE_EVENT_OR_VENUE_REFERENCES',
  'regional context admission must require two publisher-independent official references'
);
expect(
  contract.regional_independence?.optional_components?.includes('REGIONAL_PUBLIC_REPRESENTATION_NOT_IDENTITY_EVIDENCE'),
  'public representation must remain optional and non-identity evidence'
);
expect(contract.challenger_reterminalization?.slot_count === 160, 'challenger slot count must remain 160');
expect(contract.challenger_reterminalization?.forced_selection === false, 'forced selection must be prohibited');
expect(contract.challenger_reterminalization?.selection_requires_role_evidence === true, 'role evidence required for selection');
expect(contract.scale_gate?.full_320_expansion_allowed === false, '320 expansion must remain blocked before remediation exit');
expect(contract.provider_rule?.broad_provider_selection === 'PROHIBITED', 'broad provider selection must be prohibited');
expect(contract.provider_rule?.targeted_inquiry_requires_program_owner_authorization === true, 'targeted provider inquiry requires Program Owner authorization');

const evidenceClasses = new Set(contract.market_activity?.evidence_classes || []);
for (const required of ['ACTIVE_LISTING', 'BID_ASK_SIGNAL', 'VERIFIED_SOLD_EVENT', 'FAILED_SALE_EVENT', 'TIME_TO_SALE']) {
  expect(evidenceClasses.has(required), `missing market evidence class: ${required}`);
}
expect(
  contract.market_activity?.admission_rule?.includes('does not require a universal two-family minimum'),
  'market-activity admission rule must preserve non-universal SOLD family-count policy'
);

if (failures.length) {
  console.error('KIDULTS PoC v2.1 remediation validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KIDULTS PoC v2.1 remediation validation: PASS');
