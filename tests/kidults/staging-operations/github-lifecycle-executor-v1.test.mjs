import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createProtectedGitHubLifecycleExecutor} from '../../../scripts/kidults/staging-operations/lib/github-lifecycle-executor-v1.mjs';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const target={repository:'owner/repo',pull_request:2609,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40)};
const repo={id:128,full_name:target.repository}, actor={login:'owner',type:'User'};
function fixture() {
  let row,ready=false,effects=0,lost=false;
  const denied=()=>{const e=new Error('CONDITIONAL');e.name='ConditionalCheckFailedException';throw e;};
  const options={config:{operationTable:'protected-table',rootMissionId:'root',stageId:'landing',repository:target.repository,
    repositoryId:128,repositoryOwner:'owner',enabledOperations:['READY_FOR_REVIEW']},writer:'original-writer',
    signingPublicKey:publicKey.export({type:'spki',format:'pem'}),getSigningKey:async()=>privateKey,authorize:async()=>true,
    request:async(url,request)=>{
      assert.equal(request.method,'GET');const path=new URL(url).pathname;
      let value;
      if(path.endsWith('/pulls/2609'))value={number:2609,state:'open',draft:!ready,merged:false,base:{ref:'main',sha:target.base_sha,repo},head:{sha:target.head_sha,repo}};
      else if(path.endsWith('/branches/main'))value={commit:{sha:target.base_sha}};
      else if(path.includes('/commits/'))value={sha:target.head_sha,commit:{tree:{sha:target.head_tree_sha},committer:{date:'2026-10-08T01:00:00Z'}}};
      else value=ready?[{id:123,event:'ready_for_review',actor,performed_via_github_app:null,created_at:'2026-10-08T02:00:00Z'}]:[];
      return {ok:true,json:async()=>value};
    },
    ledgerRequest:async(operation,params)=>{
      assert.equal(params.TableName,'protected-table');
      if(operation==='Get')return {Item:row};
      if(operation==='Put'){if(row)denied();row=structuredClone(params.Item);return {};}
      const values=params.ExpressionAttributeValues;
      if(!row)denied();
      if(values[':owner'] && (row.owner!==values[':owner']||row.state!=='IN_FLIGHT'))denied();
      if(values[':binding'] && (JSON.stringify(row.binding)!==JSON.stringify(values[':binding'])||!['IN_FLIGHT','UNKNOWN'].includes(row.state)))denied();
      row.state=values[':next']||values[':success'];row.receipt=values[':receipt'];return {};
    },
    executeNative:async()=>{effects++;ready=true;if(lost)throw new Error('UI_RESPONSE_LOST');}};
  return {options,event:{operation:'READY_FOR_REVIEW',target,payload:{}},effects:()=>effects,row:()=>row,lose:()=>{lost=true;}};
}
test('protected executor composes native readback, real signatures and Dynamo conditional claim',async()=>{
  const f=fixture(),execute=createProtectedGitHubLifecycleExecutor(f.options);
  const results=await Promise.all([execute(f.event),execute(f.event)]);
  assert.equal(f.effects(),1);assert.ok(results.some(r=>r.state==='EXECUTED_VERIFIED'));
  assert.equal((await execute(f.event)).state,'REUSED_SUCCESS');assert.equal(f.effects(),1);assert.equal(f.row().state,'SUCCESS');
});
test('lost native response reconciles actual signed event without replay or writer replacement',async()=>{
  const f=fixture();f.lose();const execute=createProtectedGitHubLifecycleExecutor(f.options);
  await assert.rejects(execute(f.event),/UI_RESPONSE_LOST/);assert.equal(f.row().state,'UNKNOWN');
  const replacement=createProtectedGitHubLifecycleExecutor({...f.options,writer:'replacement'});
  assert.equal((await replacement(f.event)).state,'REUSED_SUCCESS');assert.equal(f.row().owner,'original-writer');assert.equal(f.effects(),1);
});
test('caller cannot select writer, table, mission, signing key or an unenabled operation',async()=>{
  const f=fixture(),execute=createProtectedGitHubLifecycleExecutor(f.options);
  for(const key of ['writer','operationTable','rootMissionId','signingPublicKey']) {
    await assert.rejects(execute({...f.event,[key]:'override'}),/INPUT_DENIED/);
  }
  await assert.rejects(execute({...f.event,operation:'MERGE_PROTECTED_MAIN'}),/INPUT_DENIED/);assert.equal(f.effects(),0);assert.equal(f.row(),undefined);
});
