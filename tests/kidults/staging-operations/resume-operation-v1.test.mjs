import test from 'node:test';
import assert from 'node:assert/strict';
import {operationKey,resumeOperation} from '../../../scripts/kidults/staging-operations/lib/resume-operation-v1.mjs';
const binding={repository:'owner/repo',root_mission_id:'root',stage_id:'stage',operation_kind:'DISPATCH',exact_target:'main-sha',payload_sha256:`sha256:${'a'.repeat(64)}`};
function fixture(){
  let row=null,effects=0;
  return {binding,owner:'writer',readExternal:async()=>({state:'ABSENT'}),verifyReceipt:async r=>r?.verified===true,authorize:async()=>true,
    execute:async()=>{effects++;return {verified:true};},
    ledger:{reconcileSuccess:async(k,b,r)=>{if(row)row={...row,state:'SUCCESS',receipt:r};},claim:async(k,b,o)=>{if(row)return {...row,claimed:false};row={state:'IN_FLIGHT',owner:o};return {claimed:true};},assertOwner:async(k,o)=>{assert.equal(row.owner,o);},finish:async(k,o,s,r)=>{assert.equal(row.owner,o);assert.equal(row.state,'IN_FLIGHT');row={...row,state:s,receipt:r};}},
    effects:()=>effects,row:()=>row};
}
test('operation identity is canonical and rejects session or retry fields',()=>{
  assert.equal(operationKey(binding),operationKey(Object.fromEntries(Object.entries(binding).reverse())));
  assert.throws(()=>operationKey({...binding,session_id:'new'}),/BINDING_FIELDS/);
  assert.notEqual(operationKey(binding),operationKey({...binding,exact_target:'other'}));
});
test('two concurrent sessions issue one side effect through atomic claim contract',async()=>{
  const f=fixture();const results=await Promise.all([resumeOperation(f),resumeOperation({...f,owner:'replacement'})]);
  assert.equal(f.effects(),1);assert.ok(results.some(r=>r.state==='OBSERVE_EXISTING'));
});
test('lost response leaves UNKNOWN and replacement never retries',async()=>{
  const f=fixture();f.execute=async()=>{throw new Error('RESPONSE_LOST');};
  await assert.rejects(resumeOperation(f),/RESPONSE_LOST/);assert.equal(f.row().state,'UNKNOWN');
  f.execute=async()=>{throw new Error('MUST_NOT_EXECUTE');};assert.equal((await resumeOperation({...f,owner:'replacement'})).state,'OBSERVE_EXISTING');
});
test('existing authenticated success skips side effect',async()=>{
  const f=fixture();f.readExternal=async()=>({state:'SUCCESS',receipt:{verified:true}});
  assert.equal((await resumeOperation(f)).state,'REUSED_SUCCESS');assert.equal(f.effects(),0);assert.equal(f.row(),null);
});
test('mere receipt existence cannot prove success',async()=>{
  const f=fixture();f.readExternal=async()=>({state:'SUCCESS',receipt:{}});
  await assert.rejects(resumeOperation(f),/REMOTE_RECEIPT_INVALID/);assert.equal(f.effects(),0);
});
test('authority denial cannot execute and cannot silently reopen claim',async()=>{
  const f=fixture();f.authorize=async()=>false;await assert.rejects(resumeOperation(f),/AUTHORITY_DENIED/);assert.equal(f.effects(),0);assert.equal(f.row().state,'UNKNOWN');
});
test('unknown remote outcome never claims or executes',async()=>{
  const f=fixture();f.readExternal=async()=>({state:'UNKNOWN'});assert.equal((await resumeOperation(f)).state,'HOLD_RECONCILE');assert.equal(f.row(),null);assert.equal(f.effects(),0);
});
test('late authenticated terminal receipt reconciles UNKNOWN without replacing writer or executing again',async()=>{
  const f=fixture();let effects=0;f.execute=async()=>{effects++;throw new Error('RESPONSE_LOST');};
  await assert.rejects(resumeOperation(f),/RESPONSE_LOST/);
  f.readExternal=async()=>({state:'SUCCESS',receipt:{verified:true}});
  assert.equal((await resumeOperation({...f,owner:'replacement'})).state,'REUSED_SUCCESS');
  assert.equal(effects,1);assert.equal(f.row().owner,'writer');assert.equal(f.row().state,'SUCCESS');
});
test('fenced writer cannot issue a remote side effect',async()=>{
  const f=fixture();f.ledger.assertOwner=async()=>{throw new Error('OPERATION_WRITER_FENCED');};
  await assert.rejects(resumeOperation(f),/WRITER_FENCED/);assert.equal(f.effects(),0);
});
test('ledger failure preserves the original uncertain transport cause',async()=>{
  const f=fixture();f.execute=async()=>{throw new Error('RESPONSE_LOST');};f.ledger.finish=async()=>{throw new Error('LEDGER_UNAVAILABLE');};
  await assert.rejects(resumeOperation(f),e=>e instanceof AggregateError && e.cause.message==='RESPONSE_LOST' && e.errors[1].message==='LEDGER_UNAVAILABLE');
  assert.equal((await resumeOperation({...f,owner:'replacement'})).state,'OBSERVE_EXISTING');
});
