import assert from 'node:assert/strict';
import test from 'node:test';
import {resumeDispatchFanout} from '../../../scripts/kidults/kpmo/lib/resume-dispatch-fanout-v1.mjs';
const sha=x=>x.repeat(40);
function fixture(){
  let row=null,sends=0;const keys=[];
  return {envelope:{repository:'owner/repo',repository_id:1,pull_request:9,base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),scope_digest:'sha256:scope',authorization_generation:'stable-generation',nonce_digest:'sha256:nonce'},
    rootMissionId:'original-mission',runId:123,runAttempt:1,owner:'original-writer',now:'2026-10-04T00:00:00Z',
    readExternal:async()=>({state:'ABSENT'}),authenticateReceipt:async()=>true,authorize:async()=>true,
    send:async x=>{sends++;keys.push(x.idempotencyKey);return {accepted:true};},
    ledger:{reconcileSuccess:async()=>{},claim:async key=>{keys.push(key);if(row)return {...row,claimed:false};row={state:'IN_FLIGHT'};return {claimed:true};},assertOwner:async()=>{},finish:async(k,o,s,r)=>{row={state:s,receipt:r};}},
    sends:()=>sends,keys};
}
test('existing fanout connects to resume executor with transport-independent identity',async()=>{
  const f=fixture();assert.equal((await resumeDispatchFanout(f)).state,'EXECUTED_VERIFIED');
  assert.equal((await resumeDispatchFanout({...f,runId:456,runAttempt:2})).state,'REUSED_SUCCESS');
  assert.equal(f.sends(),1);assert.equal(new Set(f.keys).size,1);
});
test('ambiguous GitHub response suppresses a replacement dispatch',async()=>{
  const f=fixture();f.send=async()=>({accepted:false});
  await assert.rejects(resumeDispatchFanout(f),/DELIVERY_UNKNOWN/);
  assert.equal((await resumeDispatchFanout({...f,runId:456})).state,'OBSERVE_EXISTING');
});
test('untrusted receipt cannot mark dispatch completion',async()=>{
  const f=fixture();f.authenticateReceipt=async()=>false;
  await assert.rejects(resumeDispatchFanout(f),/RESULT_RECEIPT_INVALID/);
});
