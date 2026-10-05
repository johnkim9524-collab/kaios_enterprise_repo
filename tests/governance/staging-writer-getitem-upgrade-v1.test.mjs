import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs','utf8');

test('STAGING validator permits only exact writer GetItem authority expansion',()=>{
  assert.match(source,/\['dynamodb:PutItem','dynamodb:UpdateItem'\]/);
  assert.match(source,/\['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'\]/);
  assert.match(source,/return equal\(\{\.\.\.currentStatement,Action:desiredActions\}, desiredStatement\)/);
});

test('GetItem upgrade remains exact-statement bound and does not authorize scan',()=>{
  assert.doesNotMatch(source,/desiredActions.*dynamodb:Scan/);
  assert.match(source,/TEMPLATE_DELTA_EXCEEDS_BOUNDED_LEDGER_READ_OR_LEGACY_VERIFIER_READ/);
});
