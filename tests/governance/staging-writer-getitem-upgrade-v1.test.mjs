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


test('STAGING validator binds the exact previous-to-current recovery capsule transition',()=>{
  assert.match(source,/PREVIOUS_RECOVERY_CAPSULE_WRITER_SHA256 = '5950fd39493d33a9a371cbe1263858aeabe9edfeec816f26504ccc29fb8ba690'/);
  assert.match(source,/CURRENT_RECOVERY_CAPSULE_WRITER_SHA256 = 'd160ab65af2967635f75b637c5d5582529f5b2ef62a34e7b08cd00bbe715191d'/);
  assert.match(source,/sha256Hex\(source\)===PREVIOUS_RECOVERY_CAPSULE_WRITER_SHA256&&sha256Hex\(targetZip\)===CURRENT_RECOVERY_CAPSULE_WRITER_SHA256/);
  assert.match(source,/expected\.Properties\.Code\.ZipFile=targetZip;\n    return equal\(expected,to\);/);
});

test('previous recovery capsule exception remains code-only and fail-closed',()=>{
  const branch=source.slice(source.indexOf('The immediately previous deployed recovery capsule'),source.indexOf('if(sha256Hex(source)===CONSUMPTION_V1_WRITER_SHA256'));
  assert.ok(branch.includes('expected.Properties.Code.ZipFile=targetZip'));
  assert.ok(branch.includes('return equal(expected,to)'));
  assert.doesNotMatch(branch,/Environment|Policies|Role/);
});
