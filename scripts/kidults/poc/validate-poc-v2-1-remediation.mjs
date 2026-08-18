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
  'MISSING_NE_ZERO',
  'ATTENTION_NE_DEMAND_NE_TRANSACTION',
  'LISTING_NE_SOLD_TRANSACTION',
  'BID_ASK_NE_TRANSACTION',
  'PUBLIC_REPRESENTATION_NE_REGIONAL_MARKET_SIGNIFICANCE',
  'SCARCITY_NE_ILLIQUIDITY',
  'PROVIDER_NE_TRUTH',
  'NO_FALSE_COMPARABILITY'
]) {
  expect(guards.has(required), `missing truth guard: ${required}`);
}

expect(contract.regional_independence?.minimum_independent_families >= 2, 'regional significance requires >=2 independent families');
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

if (failures.length) {
  console.error('KIDULTS PoC v2.1 remediation validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KIDULTS PoC v2.1 remediation validation: PASS');
