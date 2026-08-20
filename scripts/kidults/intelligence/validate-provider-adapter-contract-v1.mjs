import fs from 'node:fs';
import assert from 'node:assert/strict';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/provider/provider-adapter-contract-v1.json', 'utf8'));
assert.equal(contract.version, '1.0.0');
assert.equal(contract.rights_gate.required_state, 'ALLOW');
assert.equal(contract.rights_gate.unknown_behavior, 'HOLD');
assert.equal(contract.activation_boundary.production_allowed, false);

const grading = contract.provider_classes.GRADING_EVIDENCE;
for (const rule of ['NO_PROVIDER_CENSUS_SUMMATION','RIGHTS_UNKNOWN_IS_HOLD','MISSING_POPULATION_REMAINS_UNKNOWN']) {
  assert.ok(grading.hard_rules.includes(rule));
}
assert.equal(grading.canonical_output, 'grading-evidence-v1');

const market = contract.provider_classes.COLLECTOR_MARKET_EVENT;
for (const rule of ['ASK_IS_NOT_SOLD','DUPLICATE_REPUBLICATION_COUNTS_ONCE','CORROBORATING_SOURCE_OWNERS_ARE_PRESERVED','FAILED_SALE_IS_NOT_ZERO_PRICE','MISSING_IS_NOT_ZERO']) {
  assert.ok(market.hard_rules.includes(rule));
}
assert.equal(market.canonical_output, 'market-event-v1');

const requiredStages = ['DISCOVER','RIGHTS_PREFLIGHT','FIELD_MAP','NORMALIZE','VALIDATE','ADMIT_OR_HOLD','EMIT_CANONICAL_EVIDENCE'];
assert.deepEqual(contract.adapter_lifecycle, requiredStages);
console.log(JSON.stringify({status:'PASS', contract:contract.id, grading_rules:grading.hard_rules.length, market_rules:market.hard_rules.length, production:'HOLD'}, null, 2));
