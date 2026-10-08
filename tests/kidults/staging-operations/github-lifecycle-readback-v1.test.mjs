import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {githubLifecycleBinding} from '../../../scripts/kidults/staging-operations/lib/github-lifecycle-resume-v1.mjs';
import {operationKey} from '../../../scripts/kidults/staging-operations/lib/resume-operation-v1.mjs';
import {sha256,canonicalJson} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createGitHubLifecycleReadback,createGitHubLifecycleReceiptAuthenticator} from '../../../scripts/kidults/staging-operations/lib/github-lifecycle-readback-v1.mjs';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicPem=publicKey.export({type:'spki',format:'pem'});
const target={repository:'owner/repo',pull_request:2609,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40)};
const owner={login:'owner',type:'User'}, repo={id:128,full_name:target.repository};
function fixture(operation='READY_FOR_REVIEW',payload={}) {
  const binding=githubLifecycleBinding({repository:target.repository,rootMissionId:'root',stageId:'landing',operation,target,payload});
  const context={operation,target,payload,binding,key:operationKey(binding)};
  const data={pr:{id:90,number:2609,state:'open',draft:false,merged:false,user:owner,
    base:{ref:'main',sha:target.base_sha,repo},head:{sha:target.head_sha,repo}},
    main:{commit:{sha:target.base_sha}},head:{sha:target.head_sha,commit:{tree:{sha:target.head_tree_sha},committer:{date:'2026-10-08T01:00:00Z'}}},
    timeline:[{id:91,event:'ready_for_review',actor:owner,performed_via_github_app:null,created_at:'2026-10-08T02:00:00Z'}],
    comments:[],runs:[],merge:{},dispatchProof:null};
  let reads=0,signs=0;
  const request=async(url,options)=>{
    assert.ok(url.startsWith('https://api.github.com/repos/owner/repo/'));assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal);reads++;
    const path=new URL(url).pathname;
    const value=path.endsWith('/pulls/2609')?data.pr:path.endsWith('/branches/main')?data.main:
      path.endsWith(`/commits/${target.head_sha}`)?data.head:path.endsWith('/timeline')?data.timeline:
      path.endsWith('/comments')?data.comments:path.endsWith('/runs')?{workflow_runs:data.runs}:data.merge;
    return {ok:true,json:async()=>structuredClone(value)};
  };
  return {data,context,reads:()=>reads,signs:()=>signs,
    request,
    read:createGitHubLifecycleReadback({repository:target.repository,repositoryId:128,repositoryOwner:'owner',request,getSigningKey:async()=>{signs++;return privateKey;},
      readDispatchReceipt:async()=>data.dispatchProof,authenticateDispatchReceipt:async p=>p.authenticated===true}),
    auth:createGitHubLifecycleReceiptAuthenticator(publicPem)};
}
test('Ready uses native exact-head evidence and protected signature',async()=>{
  const f=fixture(),result=await f.read(f.context);assert.equal(result.state,'SUCCESS');assert.equal(result.receipt.evidence.kind,'NATIVE_OWNER_READY_EVENT');
  assert.equal(await f.auth(result.receipt,f.context),true);
  assert.equal(await f.auth({...result.receipt,evidence:{}},f.context),false);
  assert.equal(await f.auth({...result.receipt,public_key:publicPem},f.context),false);
});
test('draft absence is distinct from invalidated, synthetic or App Ready',async()=>{
  const a=fixture();a.data.pr.draft=true;a.data.timeline=[];assert.equal((await a.read(a.context)).state,'ABSENT');
  for(const app of [undefined,{id:1}]) {const f=fixture();f.data.timeline[0].performed_via_github_app=app;assert.equal((await f.read(f.context)).state,'UNKNOWN');assert.equal(f.signs(),0);}
  const b=fixture();b.data.timeline=[];b.data.pr.created_at='2026-10-08T02:00:00Z';assert.equal((await b.read(b.context)).state,'UNKNOWN');
  const c=fixture();c.data.pr.draft=true;assert.equal((await c.read(c.context)).state,'UNKNOWN');
});
test('repository ID, head tree and current main drift cannot prove success',async()=>{
  const f=fixture();f.data.pr.head.repo={...repo,id:999};await assert.rejects(f.read(f.context),/LIVE_TARGET_DRIFT/);
  const g=fixture();g.data.head.commit.tree.sha='d'.repeat(40);await assert.rejects(g.read(g.context),/LIVE_TARGET_DRIFT/);
  const h=fixture();h.data.main.commit.sha='d'.repeat(40);assert.equal((await h.read(h.context)).state,'UNKNOWN');
});
test('only one immutable native Owner comment proves exact posting',async()=>{
  const body='exact approved body',payload={body_sha256:sha256(body)},f=fixture('OWNER_APPROVAL_COMMENT',payload);
  const c={id:92,body,user:owner,author_association:'OWNER',performed_via_github_app:null,created_at:'2026-10-08T03:00:00Z',updated_at:'2026-10-08T03:00:00Z'};
  assert.equal((await f.read(f.context)).state,'ABSENT');f.data.comments=[c];assert.equal((await f.read(f.context)).state,'SUCCESS');
  f.data.comments=[c,{...c,id:93}];assert.equal((await f.read(f.context)).state,'UNKNOWN');
  f.data.comments=[{...c,updated_at:'2026-10-08T04:00:00Z'}];assert.equal((await f.read(f.context)).state,'UNKNOWN');
});
test('workflow dispatch acceptance never means job completion; duplicate or rerun is ambiguous',async()=>{
  const payload={workflow_id:12,run_name:'exact handoff',ref:'main',inputs:{pull_request_number:'2609',expected_head_sha:target.head_sha}},f=fixture('WORKFLOW_DISPATCH',payload);
  const r={id:100,display_title:payload.run_name,event:'workflow_dispatch',head_sha:target.base_sha,head_branch:'main',workflow_id:12,run_attempt:1,repository:repo,actor:owner,triggering_actor:owner,status:'queued'};
  f.data.runs=[r];assert.equal((await f.read(f.context)).state,'UNKNOWN');
  f.data.dispatchProof={id:'kidults-native-workflow-dispatch-input-receipt-v1',state:'DISPATCH_ACCEPTED',repository:target.repository,repository_id:128,
    run_id:100,run_attempt:1,workflow_id:12,head_sha:target.base_sha,inputs_sha256:sha256(canonicalJson(payload.inputs)),authenticated:true};
  const result=await f.read(f.context);assert.equal(result.state,'SUCCESS');assert.equal(result.receipt.evidence.kind,'WORKFLOW_DISPATCH_ACCEPTED_NOT_JOB_COMPLETION');
  f.data.runs=[r,{...r,id:101}];assert.equal((await f.read(f.context)).state,'UNKNOWN');
  f.data.runs=[{...r,run_attempt:2}];assert.equal((await f.read(f.context)).state,'UNKNOWN');
  f.data.runs=[r];f.data.dispatchProof.inputs_sha256=sha256(canonicalJson({pull_request_number:'9999'}));assert.equal((await f.read(f.context)).state,'UNKNOWN');
  f.data.dispatchProof.inputs_sha256=sha256(canonicalJson(payload.inputs));f.data.dispatchProof.authenticated=false;assert.equal((await f.read(f.context)).state,'UNKNOWN');
});
test('missing protected dispatch-input adapters denies before source reads or write admission',async()=>{
  const f=fixture('WORKFLOW_DISPATCH',{workflow_id:12,run_name:'handoff',ref:'main',inputs:{}});
  const read=createGitHubLifecycleReadback({repository:target.repository,repositoryId:128,repositoryOwner:'owner',request:f.request,getSigningKey:async()=>privateKey});
  await assert.rejects(read(f.context),/DISPATCH_INPUT_PROOF_ADAPTER_REQUIRED/);assert.equal(f.reads(),0);
});
test('merge requires exact two parents, tree, native Owner event and current main',async()=>{
  const f=fixture('MERGE_PROTECTED_MAIN');assert.equal((await f.read(f.context)).state,'ABSENT');
  const merged='d'.repeat(40);Object.assign(f.data.pr,{state:'closed',merged:true,merged_by:owner,merge_commit_sha:merged,merged_at:'2026-10-08T04:00:00Z'});
  f.data.main.commit.sha=merged;f.data.merge={sha:merged,commit:{tree:{sha:target.head_tree_sha}},parents:[{sha:target.base_sha},{sha:target.head_sha}]};
  f.data.timeline.push({id:100,event:'merged',commit_id:merged,actor:owner,performed_via_github_app:null});
  assert.equal((await f.read(f.context)).state,'SUCCESS');f.data.merge.parents.reverse();assert.equal((await f.read(f.context)).state,'UNKNOWN');
});
test('paginated truncation fails closed without signing a receipt',async()=>{
  const f=fixture();f.data.timeline=Array.from({length:100},()=>({event:'commented'}));
  await assert.rejects(f.read(f.context),/PAGINATION_BOUND/);assert.equal(f.reads(),13);assert.equal(f.signs(),0);
});
test('wrong protected verification key and target binding reject receipts',async()=>{
  const f=fixture(),result=await f.read(f.context);
  const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const auth=createGitHubLifecycleReceiptAuthenticator(other.publicKey.export({type:'spki',format:'pem'}));
  assert.equal(await auth(result.receipt,f.context),false);assert.equal(await f.auth(result.receipt,{...f.context,key:'changed'}),false);
});
test('unrecognized payload fields and caller request targets are rejected',async()=>{
  const f=fixture('READY_FOR_REVIEW',{url:'https://other.example'});await assert.rejects(f.read(f.context),/PAYLOAD/);assert.equal(f.signs(),0);
  const g=fixture();await assert.rejects(g.read({...g.context,key:'changed'}),/BINDING/);assert.equal(g.reads(),0);
});
