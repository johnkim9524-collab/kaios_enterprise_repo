import test from 'node:test';
import assert from 'node:assert/strict';
import {githubLifecycleBinding, resumeGitHubLifecycle} from '../../../scripts/kidults/staging-operations/lib/github-lifecycle-resume-v1.mjs';
const target = {repository:'owner/repo', pull_request:2609, base_sha:'a'.repeat(40), head_sha:'b'.repeat(40), head_tree_sha:'c'.repeat(40)};
function fixture(operation='READY_FOR_REVIEW') {
  let row, effects=0, external={state:'ABSENT'};
  const f={repository:target.repository, rootMissionId:'mission', stageId:'landing', operation,
    target:{...target}, payload:{purpose:'AUTONOMY_REMEDIATION'}, owner:'writer',
    readExternal:async()=>external, authenticateReceipt:async r=>r.authenticated===true, authorize:async()=>true,
    execute:async c=>{effects++;return receipt(c);},
    ledger:{claim:async(key,binding,owner)=>{if(row)return {...row,claimed:false};row={key,binding,owner,state:'IN_FLIGHT'};return {claimed:true};},
      assertOwner:async(key,owner)=>{assert.equal(row.key,key);assert.equal(row.owner,owner);assert.equal(row.state,'IN_FLIGHT');},
      finish:async(key,owner,state,receipt)=>{assert.equal(row.key,key);assert.equal(row.owner,owner);assert.equal(row.state,'IN_FLIGHT');Object.assign(row,{state,receipt});},
      reconcileSuccess:async(key,binding,receipt)=>{if(row)Object.assign(row,{state:'SUCCESS',receipt});}},
    effects:()=>effects, row:()=>row, external:value=>{external=value;}};
  return f;
}
function receipt(c) {return {id:'kidults-github-lifecycle-operation-receipt-v1',state:'SUCCESS',operation_key:c.key,binding:c.binding,
  production:'HOLD',public:'HOLD',g5:'HOLD',authenticated:true};}
for(const op of ['READY_FOR_REVIEW','OWNER_APPROVAL_COMMENT','WORKFLOW_DISPATCH','MERGE_PROTECTED_MAIN']) {
  test(`${op}: concurrent sessions execute only once and reuse terminal result`,async()=>{
    const f=fixture(op);await Promise.all([resumeGitHubLifecycle(f),resumeGitHubLifecycle({...f,owner:'replacement'})]);
    assert.equal(f.effects(),1);assert.equal((await resumeGitHubLifecycle({...f,owner:'replacement'})).state,'REUSED_SUCCESS');assert.equal(f.effects(),1);
  });
}
test('lost response is UNKNOWN; no timeout or replacement can retry',async()=>{
  const f=fixture();f.execute=async()=>{throw new Error('RESPONSE_LOST');};
  await assert.rejects(resumeGitHubLifecycle(f),/RESPONSE_LOST/);assert.equal(f.row().state,'UNKNOWN');
  assert.equal((await resumeGitHubLifecycle({...f,owner:'replacement'})).state,'OBSERVE_EXISTING');
});
test('late authenticated remote success preserves original writer',async()=>{
  const f=fixture();let accepted;f.execute=async c=>{accepted=receipt(c);throw new Error('RESPONSE_LOST');};
  await assert.rejects(resumeGitHubLifecycle(f),/RESPONSE_LOST/);f.external({state:'SUCCESS',receipt:accepted});
  assert.equal((await resumeGitHubLifecycle({...f,owner:'replacement'})).state,'REUSED_SUCCESS');assert.equal(f.row().owner,'writer');
});
test('forged, drifted and release-opening receipts fail before claim',async()=>{
  for(const change of [{authenticated:false},{binding:{}},{operation_key:'sha256:'+'0'.repeat(64)},{production:'PASS'}]) {
    const f=fixture();const binding=githubLifecycleBinding(f);const {operationKey}=await import('../../../scripts/kidults/staging-operations/lib/resume-operation-v1.mjs');
    f.external({state:'SUCCESS',receipt:{...receipt({binding,key:operationKey(binding)}),...change}});
    await assert.rejects(resumeGitHubLifecycle(f),/REMOTE_RECEIPT_INVALID/);assert.equal(f.row(),undefined);assert.equal(f.effects(),0);
  }
});
test('authority denial and writer fencing prevent side effect',async()=>{
  const f=fixture();f.authorize=async()=>false;await assert.rejects(resumeGitHubLifecycle(f),/AUTHORITY_DENIED/);assert.equal(f.effects(),0);
  const g=fixture();g.ledger.assertOwner=async()=>{throw new Error('WRITER_FENCED');};await assert.rejects(resumeGitHubLifecycle(g),/WRITER_FENCED/);assert.equal(g.effects(),0);
});
test('original target and payload cannot be altered by caller or callbacks',async()=>{
  const f=fixture();f.authorize=async c=>{f.target.head_sha='d'.repeat(40);f.payload.purpose='CHANGED';c.target.head_sha='e'.repeat(40);return true;};
  f.execute=async c=>{assert.equal(c.target.head_sha,target.head_sha);assert.equal(c.payload.purpose,'AUTONOMY_REMEDIATION');return receipt(c);};
  assert.equal((await resumeGitHubLifecycle(f)).state,'EXECUTED_VERIFIED');
});
test('different operation, target or payload never rebinds the original identity',()=>{
  const f=fixture(), original=githubLifecycleBinding(f);
  assert.notDeepEqual(githubLifecycleBinding({...f,operation:'MERGE_PROTECTED_MAIN'}),original);
  assert.notDeepEqual(githubLifecycleBinding({...f,target:{...target,head_sha:'d'.repeat(40)}}),original);
  assert.notDeepEqual(githubLifecycleBinding({...f,payload:{purpose:'CHANGED'}}),original);
  assert.throws(()=>githubLifecycleBinding({...f,target:{...target,session_id:'retry'}}),/TARGET_INVALID/);
});
test('lossy non-JSON payloads cannot share a canonical operation identity',()=>{
  const cyclic={};cyclic.self=cyclic;
  for(const value of [undefined,NaN,Infinity,()=>true,new Date(),cyclic]) {
    assert.throws(()=>githubLifecycleBinding({...fixture(),payload:{value}}),/PAYLOAD_INVALID/);
  }
});
