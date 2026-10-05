import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamoDBOperationLedger} from '../../../scripts/kidults/staging-operations/lib/dynamodb-operation-ledger-v1.mjs';
import {operationKey,resumeOperation} from '../../../scripts/kidults/staging-operations/lib/resume-operation-v1.mjs';
const binding={repository:'owner/repo',root_mission_id:'root',stage_id:'fanout',operation_kind:'WORKFLOW_DISPATCH',exact_target:'exact',payload_sha256:`sha256:${'a'.repeat(64)}`};
const key=operationKey(binding);
const conflict=()=>Object.assign(new Error('conflict'),{name:'ConditionalCheckFailedException'});
const ledger=request=>new DynamoDBOperationLedger({request,table:'fixture-only',repository:'owner/repo'});
test('new operation uses isolated keys and a conditional insert',async()=>{
  const l=ledger(async(op,p)=>{
    assert.equal(op,'Put');assert.equal(p.Item.pk,`RESUME_OPERATION_V1#${key}`);
    assert.equal(p.Item.sk,'OPERATION');assert.match(p.ConditionExpression,/attribute_not_exists/);
  });
  assert.equal((await l.claim(key,binding,'original')).claimed,true);
  await assert.rejects(l.claim(key,{...binding,repository:'other/repo'},'writer'),/KEY_MISMATCH/);
});
test('unknown prior delivery prevents replacement execution',async()=>{
  let effects=0;
  const l=ledger(async(op,p)=>{if(op==='Put')throw conflict();assert.equal(op,'Get');assert.equal(p.ConsistentRead,true);return {Item:{binding,owner:'original',state:'UNKNOWN'}};});
  const result=await resumeOperation({binding,owner:'replacement',ledger:l,readExternal:async()=>({state:'ABSENT'}),authorize:async()=>true,verifyReceipt:async()=>true,execute:async()=>{effects++;}});
  assert.equal(result.state,'OBSERVE_EXISTING');assert.equal(effects,0);
});
test('wrong owner and conditional update rejection fence writers',async()=>{
  const l=ledger(async op=>{if(op==='Get')return {Item:{owner:'original',state:'IN_FLIGHT'}};throw conflict();});
  await assert.rejects(l.assertOwner(key,'replacement'),/WRITER_FENCED/);
  await assert.rejects(l.finish(key,'replacement','SUCCESS',{}),/WRITER_FENCED/);
});
test('late authenticated reconciliation retains owner and cannot upsert a missing operation',async()=>{
  const l=ledger(async(op,p)=>{
    assert.equal(op,'Update');assert.match(p.ConditionExpression,/binding = :binding/);
    assert.doesNotMatch(p.UpdateExpression,/owner/);
    assert.equal(p.ExpressionAttributeValues[':binding'],binding);
  });
  await l.reconcileSuccess(key,binding,{authenticated:true});
  const absent=ledger(async op=>{if(op==='Update')throw conflict();return {};});
  await absent.reconcileSuccess(key,binding,{authenticated:true});
});
test('transport uncertainty is propagated and never treated as conditional conflict',async()=>{
  let calls=0;const l=ledger(async()=>{calls++;throw new Error('NETWORK_UNCERTAIN');});
  await assert.rejects(l.claim(key,binding,'original'),/NETWORK_UNCERTAIN/);assert.equal(calls,1);
});
