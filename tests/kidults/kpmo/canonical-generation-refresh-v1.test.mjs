import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// This suite runs the actual CLI, but ALL fetch calls terminate in an isolated
// in-memory transport. No GitHub credentials, requests, comments or dispatches.
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const SHA='a'.repeat(40);
const library=pathToFileURL(path.resolve('scripts/kidults/kpmo/canonical-generation-v3-lib.mjs')).href;
const registry=pathToFileURL(path.resolve('scripts/kidults/kpmo/material-defect-registry-v3.mjs')).href;
function exercise(scenario,{readOnly=false,envOverrides={}}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-refresh-offline-'));
  const receiptPath=path.join(dir,'receipt.json'),trace=path.join(dir,'trace.jsonl');
  const hook=`import fs from 'node:fs';
import {MEMBERS,BASELINE,MS,ME,CS,CE,WRITER_WORKFLOW,marked,memberPayload,commitPayload,generationId} from ${JSON.stringify(library)};
import {buildMaterialRegistry,materialRegistryDigest,sha256} from ${JSON.stringify(registry)};
const scenario=process.env.SCENARIO,repo=${JSON.stringify(REPO)},main=${JSON.stringify(SHA)},run=900,at=new Date().toISOString();
const issues=[{number:1,state:'open',title:'[P1] synthetic first defect',labels:['P1']},{number:2,state:'open',title:'[P1] synthetic second defect',labels:['P1']}];
function snapshot(items,sha=main){const records=buildMaterialRegistry(items);const x={repository:repo,protected_main_sha:sha,canonical_issue_numbers:MEMBERS,canonical_issue_count:25,active_baseline_defects:BASELINE.filter(n=>items.some(i=>i.number===n)),material_defect_count:records.length,material_defect_issue_numbers:records.map(x=>x.issue_number),material_defect_registry_sha256:materialRegistryDigest(records),material_defect_query_cardinality:{P0:0,P1:records.length},material_defects:records,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false,empirical_gate_effect:'NONE'};return {...x,truth_digest:sha256(x)};}
const oldItems=scenario==='idempotent'?issues:issues.slice(0,1);
const old=snapshot(oldItems,scenario==='main-advance'?'b'.repeat(40):main);
const generation=generationId(old.protected_main_sha,800,1),comments=new Map(),entries=[];
function comment(id,issue,body){return {id,issue_url:'https://api.github.com/repos/'+repo+'/issues/'+issue,user:{login:'github-actions[bot]',type:'Bot'},performed_via_github_app:{slug:'github-actions'},created_at:at,updated_at:at,body};}
for(let i=0;i<MEMBERS.length;i++){const id=1000+i;let payload=memberPayload(old,generation,MEMBERS[i],i,800,1,at);if(scenario==='member-rehashed-drift'&&i===0)payload.material_defect_count=99;const body=marked(MS,ME,payload);comments.set(id,comment(id,MEMBERS[i],body));entries.push({issue_number:MEMBERS[i],comment_id:id,comment_body_sha256:sha256(body)});}
const oldCommit=commitPayload(old,generation,800,1,entries,at);
if(scenario==='aggregate-policy')oldCommit.public='PASS';
if(scenario==='aggregate-repository')oldCommit.repository='other/repository';
if(scenario==='aggregate-count-shape')oldCommit.material_defect_count=true;
if(scenario==='aggregate-run-shape')oldCommit.writer_run_id=0;
if(scenario==='aggregate-version')oldCommit.version='999';
let aggregate=comment(1100,344,marked(CS,CE,oldCommit));
if(scenario==='aggregate-edited')aggregate.updated_at=new Date(Date.now()+1000).toISOString();
if(scenario==='member-edited')comments.get(1000).updated_at=new Date(Date.now()+1000).toISOString();
if(scenario==='member-digest')comments.get(1000).body+='tamper';
if(scenario==='missing-member')comments.delete(1000);
if(scenario==='spoofed-member')comments.get(1000).user.login='other-user';
const oldBody=aggregate.body;let searchReads=0,approvalReads=0,postCount=0,lastApproval=null;
const approvalBody='CANONICAL_V3_AUTHORIZATION_ID: CANONICAL-V3-aaaaaaaaaaaa-OWNER_NONCE_0001\\nTARGET_MAIN_SHA: '+main+'\\nACTION: APPLY_APPEND_ONLY_25_PLUS_COMMIT';
globalThis.fetch=async(value,options={})=>{
 const u=new URL(value),method=options.method||'GET';
 fs.appendFileSync(process.env.TRACE,JSON.stringify({path:u.pathname,method})+'\\n');
 if(u.origin!=='https://api.github.com')throw Error('OFFLINE_UNEXPECTED_ORIGIN');
 const json=(x,status=200)=>Response.json(x,{status});
 if(method==='POST'){
  if(!u.pathname.match(/\\/issues\\/\\d+\\/comments$/))throw Error('OFFLINE_UNEXPECTED_POST');
  postCount++;if(scenario==='member-write-fails'&&postCount===5)return json({message:'synthetic rejection'},500);
  const issue=Number(u.pathname.split('/').at(-2)),body=JSON.parse(options.body).body,id=2000+postCount;
  const c=comment(id,issue,body);comments.set(id,c);if(body.includes(CS))aggregate=c;
  fs.appendFileSync(process.env.POSTS,JSON.stringify(c)+'\\n');return json(c);
 }
 if(method!=='GET')throw Error('OFFLINE_MUTATION_FORBIDDEN');
 if(u.pathname.endsWith('/branches/main'))return json({commit:{sha:main}});
 if(u.pathname==='/search/issues'){
  searchReads++;let items=issues;
  if(scenario==='prewrite-truth-drift'&&searchReads>=2)items=issues.concat({number:3,state:'open',title:'[P1] synthetic third defect',labels:['P1']});
  if(scenario==='precommit-truth-drift'&&postCount===25)items=issues.concat({number:3,state:'open',title:'[P1] changed before aggregate',labels:['P1']});
  if(scenario==='postwrite-truth-drift'&&postCount===26)items=issues.concat({number:3,state:'open',title:'[P1] changed after aggregate',labels:['P1']});
  return json({incomplete_results:false,total_count:items.length,items});
 }
 if(u.pathname.endsWith('/actions/runs/800'))return json({id:800,run_attempt:1,repository:{full_name:repo},head_branch:'main',head_sha:main,event:'workflow_dispatch',path:WRITER_WORKFLOW,actor:{login:'johnkim9524-collab'},triggering_actor:{login:'johnkim9524-collab'},status:'completed',conclusion:'success'});
 if(u.pathname.endsWith('/actions/runs/900'))return json({id:run,run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),repository:{full_name:repo},head_branch:'main',head_sha:main,event:'workflow_dispatch',path:WRITER_WORKFLOW,actor:{login:'johnkim9524-collab'},triggering_actor:{login:'johnkim9524-collab'},run_started_at:new Date(Date.now()-30000).toISOString()});
 if(u.pathname.endsWith('/issues/1713/comments')){
  approvalReads++;const time=new Date(Date.now()-(scenario==='stale-approval'?3600000:60000)).toISOString();
  const c={id:1200,user:{login:'johnkim9524-collab'},author_association:'OWNER',body:approvalBody,created_at:time,updated_at:time};
  if(scenario==='app-approval')c.performed_via_github_app={id:1};
  if(scenario==='revoked-during-read'&&approvalReads>1)c.updated_at=at;
  lastApproval=c;
  return json(scenario==='no-approval'?[]:scenario==='duplicate-approval'?[c,{...c,id:1201}]:[c]);
 }
 if(u.pathname.endsWith('/issues/comments/1200'))return json(scenario==='revoked-during-read'?{...lastApproval,updated_at:at}:lastApproval);
 if(u.pathname.endsWith('/issues/344/comments'))return json([aggregate]);
 const id=Number(u.pathname.match(/\\/issues\\/comments\\/(\\d+)$/)?.[1]);
 if(id)return comments.has(id)?json(comments.get(id)):json({message:'synthetic missing member'},404);
 throw Error('OFFLINE_UNEXPECTED_ROUTE:'+u.pathname);
};
process.on('exit',()=>fs.writeFileSync(process.env.FINAL_STATE,JSON.stringify({oldBody,priorAggregateUntouched:oldBody===marked(CS,CE,oldCommit),aggregate,postCount,searchReads,approvalReads})));`;
  try{
    const preload=path.join(dir,'transport.mjs');fs.writeFileSync(preload,hook);
    // A pre-existing bootstrap must not hide this invocation's actual failure.
    fs.writeFileSync(receiptPath,JSON.stringify({state:'VERIFIED_FAIL',failure_class:'BOOTSTRAP_NOT_RUN'}));
    const env={PATH:process.env.PATH,LANG:'C.UTF-8',GITHUB_REPOSITORY:REPO,GITHUB_TOKEN:'SYNTHETIC_ONLY_NOT_A_CREDENTIAL',GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,TARGET_MAIN_SHA:SHA,GITHUB_ACTOR:'johnkim9524-collab',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',CANONICAL_GENERATION_AUTHORIZATION_ID:'CANONICAL-V3-aaaaaaaaaaaa-OWNER_NONCE_0001',CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY:'AUTHORIZED',CANONICAL_GENERATION_RECEIPT_PATH:receiptPath,SCENARIO:scenario,TRACE:trace,POSTS:path.join(dir,'posts.jsonl'),FINAL_STATE:path.join(dir,'final.json'),...envOverrides};
    const result=spawnSync(process.execPath,['--import',preload,'scripts/kidults/kpmo/canonical-generation-v3.mjs',...(readOnly?[]:['--write'])],{env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    assert.equal(result.error,undefined,result.stderr);
    const receipt=JSON.parse(fs.readFileSync(receiptPath));
    const calls=fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const posts=fs.existsSync(env.POSTS)?fs.readFileSync(env.POSTS,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
    const final=JSON.parse(fs.readFileSync(env.FINAL_STATE));
    assert.ok(!JSON.stringify(receipt).includes(env.GITHUB_TOKEN));
    assert.ok(calls.every(x=>['GET','POST'].includes(x.method)));
    return {result,receipt,calls,posts,final};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function assertBounded(receipt){for(const k of ['production','public','g5'])assert.equal(receipt[k],'HOLD');assert.equal(receipt.promotion_eligible,false);}
for(const scenario of ['same-main-refresh','main-advance'])test(`offline Canonical writer safely appends 25+1 after ${scenario}`,()=>{
 const {result,receipt,posts,final}=exercise(scenario);assert.equal(result.status,0,result.stderr);assert.equal(receipt.state,'VERIFIED_PASS');assert.equal(receipt.writes,26);assert.equal(posts.length,26);assert.ok(final.priorAggregateUntouched);assertBounded(receipt);
});
test('offline identical generation remains a verified no-write idempotent path',()=>{
 const {result,receipt,posts}=exercise('idempotent');assert.equal(result.status,0,result.stderr);assert.equal(receipt.mode,'IDEMPOTENT_EXISTING_GENERATION');assert.equal(posts.length,0);assertBounded(receipt);
});
test('read-only live validation never turns material drift into PASS or a write',()=>{
 const {result,receipt,posts}=exercise('same-main-refresh',{readOnly:true});assert.notEqual(result.status,0);assert.equal(posts.length,0);assert.equal(receipt.failure_class,'COMMIT_MISMATCH');assert.ok(receipt.mismatch_fields.includes('material_defect_count'));assertBounded(receipt);
});
for(const scenario of ['missing-member','member-digest','member-rehashed-drift','member-edited','aggregate-edited','spoofed-member','aggregate-policy','aggregate-repository','aggregate-count-shape','aggregate-run-shape','aggregate-version','stale-approval','app-approval','no-approval','duplicate-approval','prewrite-truth-drift','revoked-during-read'])test(`offline refresh blocks ${scenario} before any write`,()=>{
 const {result,receipt,posts}=exercise(scenario);assert.notEqual(result.status,0);assert.equal(receipt.state,'VERIFIED_FAIL');assert.equal(posts.length,0);assert.notEqual(receipt.failure_class,'BOOTSTRAP_NOT_RUN');assertBounded(receipt);
});
for(const [name,env] of [['rerun',{GITHUB_RUN_ATTEMPT:'2'}],['non-owner',{GITHUB_ACTOR:'other'}],['non-dispatch',{GITHUB_EVENT_NAME:'push'}],['no-explicit-authority',{CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY:''}],['stale-target',{TARGET_MAIN_SHA:'b'.repeat(40)}]])test(`offline refresh preserves ${name} rejection`,()=>{
 const {result,receipt,posts}=exercise('same-main-refresh',{envOverrides:env});assert.notEqual(result.status,0);assert.equal(posts.length,0);assert.notEqual(receipt.failure_class,'BOOTSTRAP_NOT_RUN');assertBounded(receipt);
});
test('truth movement after members prevents aggregate commit and records 25 acknowledged writes',()=>{
 const {receipt,posts}=exercise('precommit-truth-drift');assert.equal(receipt.state,'VERIFIED_FAIL');assert.equal(receipt.failure_class,'PRE_COMMIT_TRUTH_MOVED');assert.equal(posts.length,25);assert.equal(receipt.writes,25);assert.equal(receipt.aggregate_comment_written,false);assertBounded(receipt);
});
test('post-aggregate truth movement records all 26 acknowledged writes, never 25',()=>{
 const {receipt,posts}=exercise('postwrite-truth-drift');assert.equal(receipt.state,'VERIFIED_FAIL');assert.equal(receipt.failure_class,'POST_WRITE_TRUTH_MOVED');assert.equal(posts.length,26);assert.equal(receipt.writes,26);assert.equal(receipt.aggregate_comment_written,true);assertBounded(receipt);
});
test('member write failure preserves exact acknowledged partial count and original cause',()=>{
 const {receipt,posts}=exercise('member-write-fails');assert.equal(receipt.state,'VERIFIED_FAIL');assert.match(receipt.failure_class,/GITHUB_HTTP_500/);assert.equal(posts.length,4);assert.equal(receipt.writes,4);assert.equal(receipt.aggregate_comment_written,false);assertBounded(receipt);
});

function recoveryExercise(scenario){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-recovery-offline-'));
 const receiptPath=path.join(dir,'writer.json'),trace=path.join(dir,'calls.jsonl');
 const hook=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const original=process.env.CANONICAL_GENERATION_RECEIPT_PATH;let reads=0;
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,_ms,...args)=>timer(fn,0,...args);
cp.spawnSync=(_file,args,options)=>{
 const writing=args.includes('--write');const output=options.env.CANONICAL_GENERATION_RECEIPT_PATH;
 fs.appendFileSync(process.env.TRACE,JSON.stringify({writing,output})+'\\n');
 if(writing){fs.writeFileSync(original,JSON.stringify({repository:'johnkim9524-collab/kaios_enterprise_repo',run_id:900,run_attempt:1,state:'VERIFIED_FAIL',mode:'PARTIAL_NONAUTHORITATIVE',failure_class:'POST_WRITE_READBACK_INVALID',member_comments_written:25,writes:26,aggregate_comment_written:true,aggregate_comment_id:999,generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-900-1',production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false}));return {status:1,stdout:'',stderr:''};}
 reads++;
 if(process.env.SCENARIO==='exhausted'||reads<3){fs.mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});fs.writeFileSync(output,JSON.stringify({state:'VERIFIED_FAIL',failure_class:'TRANSIENT_READ_FAILURE',writes:0}));return {status:1,stdout:'',stderr:''};}
 const validation={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-900-1',writer_run_id:900,protected_main_sha:'a'.repeat(40),canonical_issue_count:25,aggregate_comment_id:process.env.SCENARIO==='wrong-aggregate'?888:999,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 return {status:0,stdout:JSON.stringify(validation),stderr:''};
};syncBuiltinESMExports();`;
 try{
  const preload=path.join(dir,'mock.mjs');fs.writeFileSync(preload,hook);
  const result=spawnSync(process.execPath,['--import',preload,'scripts/kidults/kpmo/run-canonical-generation-v3-apply-v1.mjs'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,SCENARIO:scenario,TRACE:trace,CANONICAL_GENERATION_RECEIPT_PATH:receiptPath,GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',TARGET_MAIN_SHA:SHA}});
  assert.equal(result.error,undefined,result.stderr);
  return {result,receipt:JSON.parse(fs.readFileSync(receiptPath)),calls:fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse),receiptPath};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('bounded eventual readback uses isolated failure receipts and only one writer invocation',()=>{
 const {result,receipt,calls,receiptPath}=recoveryExercise('recovered');assert.equal(result.status,0,result.stderr);assert.equal(receipt.mode,'COMMITTED_EVENTUAL_READBACK_RECOVERED');assert.equal(receipt.aggregate_comment_id,999);assert.equal(receipt.writes,26);assert.equal(receipt.original_reported_writes,26);assert.equal(receipt.inferred_aggregate_write_from_post_write_failure_path,false);assert.equal(calls.filter(x=>x.writing).length,1);assert.ok(calls.filter(x=>!x.writing).every(x=>x.output!==receiptPath));assertBounded(receipt);
});
for(const scenario of ['exhausted','wrong-aggregate'])test(`readback ${scenario} preserves the original acknowledged writer failure`,()=>{
 const {result,receipt,calls}=recoveryExercise(scenario);assert.notEqual(result.status,0);assert.equal(receipt.state,'VERIFIED_FAIL');assert.equal(receipt.failure_class,'POST_WRITE_READBACK_INVALID');assert.equal(receipt.writes,26);assert.equal(receipt.aggregate_comment_id,999);assert.equal(calls.filter(x=>x.writing).length,1);assertBounded(receipt);
});
