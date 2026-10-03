import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
const source=template.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;

test('AWS ledger writer implements all durable canonical state transitions',()=>{
  for(const action of ['CREATE_CANONICAL_CLAIM','TAKEOVER_CANONICAL_CLAIM','COMMIT_CANONICAL_CLAIM','CREATE_CANONICAL_ALIAS'])
    assert.match(source,new RegExp(`action == '${action}'`));
  assert.match(source,/ConditionExpression='#s=:leased AND lease_epoch=:prior AND lease_expires_at_epoch < :now'/);
  assert.match(source,/ConditionExpression='#s=:leased AND run_id=:run AND head_sha=:head AND lease_epoch=:epoch AND lease_expires_at_epoch >= :now'/);
  assert.match(source,/ConsistentRead=True/);
  assert.match(source,/CANONICAL_ALIAS_BINDING_INVALID/);
});

test('canonical mutation fields are covered by the signed finalizer core',()=>{
  for(const field of ['canonical_key','lease_expires_at_epoch','prior_lease_epoch','now_epoch','canonical_receipt_digest','lease_epoch','canonical_run_id','alias_run_id'])
    assert.match(source,new RegExp(`core\\['${field}'\\] = required\\(event, '${field}'\\)`));
});

test('canonical aliases and claims remain conditionally unique',()=>{
  assert.match(source,/ConditionExpression='attribute_not_exists\(pk\) AND attribute_not_exists\(sk\)'/);
  assert.match(source,/'sk':\{'S':'ALIAS#'\+alias_run_id\}/);
});
