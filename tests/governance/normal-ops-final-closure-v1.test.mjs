import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dispatcher=fs.readFileSync('.github/workflows/kidults-autonomous-dispatcher-v1.yml','utf8');
const snapshot=fs.readFileSync('.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml','utf8');
const broker=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-event-token-broker-v1.json','utf8'));

test('dispatcher accepts opaque non-whitespace GitHub installation tokens without logging them',()=>{
  assert.match(dispatcher,/length>=20 and length<=2048/);
  assert.match(dispatcher,/test\(\"\^\[\^\[:space:\]\]\+\$\"\)/);
  assert.doesNotMatch(dispatcher,/test\(\"\^\[A-Za-z0-9_\]\+\$\"\)/);
  assert.match(dispatcher,/::add-mask::\$token/);
});

test('snapshot provider receipt is conditional on an actually generated pair',()=>{
  assert.match(snapshot,/id: snapshot_pair/);
  assert.match(snapshot,/generated=false/);
  assert.match(snapshot,/steps\.snapshot_pair\.outputs\.generated == 'true'/);
});

test('broker has bounded Lambda execution telemetry authority',()=>{
  assert.deepEqual(broker.Resources.BrokerRole.Properties.ManagedPolicyArns,[
    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
  ]);
});
