#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Exercise the actual CLI with a closed in-process transport. Every unexpected
// request throws. No real token, GitHub write, or runtime evidence is involved.
const root=process.cwd();
function exercise(options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-refresh-'));
  const receipt=path.join(dir,'receipt.json'), trace=path.join(dir,'trace.json');
  if(options.preexisting)fs.writeFileSync(receipt,JSON.stringify({state:'VERIFIED_FAIL',failure_class:'BOOTSTRAP_NOT_RUN'}));
  const setup=`
import fs from 'node:fs';
import {MEMBERS,BASELINE,MS,ME,CS,CE,BOT,WRITER_WORKFLOW,marked,memberPayload,commitPayload,generationId} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/kidults/kpmo/canonical-generation-v3-lib.mjs')).href)};
import {buildMaterialRegistry,materialRegistryDigest,sha256} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/kidults/kpmo/material-defect-registry-v3.mjs')).href)};
const o=${JSON.stringify(options)};
const repo='johnkim9524-collab/kaios_enterprise_repo',main='a'.repeat(40),owner='johnkim9524-collab';
const now=new Date(),earlier=new Date(now-120000).toISOString(),started=new Date(now-60000).toISOString();
const issue=(n,title='[P1] synthetic control')=>({number:n,state:'open',title,labels:[{name:'P1'}]});
const original=[issue(9)];
let live=o.current?structuredClone(original):[...structuredClone(original),issue(10)];
if(o.baseline)live=[...structuredClone(original),issue(BASELINE[0])];
if(o.titleOnly)live=[issue(9,'[P1] changed synthetic title')];
function snap(issues){const registry=buildMaterialRegistry(issues);const s={repository:repo,protected_main_sha:main,canonical_issue_numbers:MEMBERS,canonical_issue_count:25,active_baseline_defects:BASELINE.filter(n=>issues.some(x=>x.number===n)).sort((a,b)=>a-b),material_defect_count:registry.length,material_defect_issue_numbers:registry.map(x=>x.issue_number),material_defect_registry_sha256:materialRegistryDigest(registry),material_defect_query_cardinality:{P0:0,P1:registry.length},material_defects:registry,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false,empirical_gate_effect:'NONE'};return {...s,truth_digest:sha256(s)};}
const old=snap(original),id=generationId(main,500,1),members=new Map();
const bot=(number,cid,body)=>({id:cid,user:{login:BOT,type:'Bot'},performed_via_github_app:{slug:'github-actions'},issue_url:'https://api.github.com/repos/'+repo+'/issues/'+number,created_at:earlier,updated_at:earlier,body});
const entries=MEMBERS.map((n,i)=>{const body=marked(MS,ME,memberPayload(old,id,n,i,500,1,earlier));members.set(100+i,bot(n,100+i,body));return {issue_number:n,comment_id:100+i,comment_body_sha256:sha256(body)};});
const payload=commitPayload(old,id,500,1,entries,earlier);
const mutations={
  'repository':()=>payload.repository='wrong/repo',
  'hold':()=>payload.production='PASS',
  'count':()=>payload.material_defect_count=77,
  'version':()=>payload.version='99',
  'digest':()=>payload.material_defect_registry_sha256='bad',
  'duplicate-defects':()=>{payload.material_defect_count=2;payload.material_defect_issue_numbers=[9,9];},
  'baseline':()=>payload.active_baseline_defects=[999999],
  'member-count':()=>payload.member_comments.pop(),
  'member-digest':()=>payload.member_comments[0].comment_body_sha256='sha256:'+'f'.repeat(64),
  'extra-field':()=>payload.approved=true,
};
if(mutations[o.corrupt])mutations[o.corrupt]();
let aggregate=bot(344,1000,marked(CS,CE,payload));
if(o.corrupt==='aggregate-mutated')aggregate.updated_at=started;
if(o.corrupt==='aggregate-author')aggregate.user.login=owner;
if(o.corrupt==='aggregate-app')aggregate.performed_via_github_app.slug='other-app';
if(o.wrongMemberId)members.get(100).id=999;
if(o.corrupt==='member-mutated')members.get(100).updated_at=started;
if(o.corrupt==='member-body')members.get(100).body+='changed';
if(o.corrupt==='member-version'){const p=memberPayload(old,id,MEMBERS[0],0,500,1,earlier);p.version='99';members.get(100).body=marked(MS,ME,p);payload.member_comments[0].comment_body_sha256=sha256(members.get(100).body);aggregate.body=marked(CS,CE,payload);}
const aid='CANONICAL-V3-'+main.slice(0,12)+'-SYNTHETIC_1234567890';
const body='CANONICAL_V3_AUTHORIZATION_ID: '+aid+'\\nTARGET_MAIN_SHA: '+main+'\\nACTION: APPLY_APPEND_ONLY_25_PLUS_COMMIT';
const approval={id:42,user:{login:owner},author_association:'OWNER',performed_via_github_app:o.authApp?{id:1}:null,body,created_at:earlier,updated_at:earlier};
const run=n=>({id:n,run_attempt:1,repository:{full_name:repo},head_branch:'main',head_sha:main,event:'workflow_dispatch',path:WRITER_WORKFLOW,actor:{login:owner},triggering_actor:{login:owner},run_started_at:started,status:n===500?'completed':'in_progress',conclusion:n===500?'success':null});
let cid=2000,mainReads=0,searches=0;const requests=[];
process.on('exit',()=>fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify(requests)));
globalThis.fetch=async (url,opts={})=>{
 const u=new URL(url),method=opts.method||'GET';
 if(u.origin!=='https://api.github.com')throw new Error('TEST_UNEXPECTED_ORIGIN');
 const p=u.pathname.replace('/repos/'+repo,'');requests.push({method,path:p});
 let value;
 if(method==='GET'&&p==='/branches/main'){mainReads++;value={commit:{sha:o.mainDrift&&mainReads>1?'b'.repeat(40):main}};}
 else if(method==='GET'&&u.pathname==='/search/issues'){searches++;const posts=requests.filter(x=>x.method==='POST').length; const changed=(o.beforeCommit&&posts===25)||(o.afterCommit&&posts===26)||(o.liveDrift&&searches>1); const items=changed?[...live,issue(11)]:live;value={items,incomplete_results:false,total_count:items.length};}
 else if(method==='GET'&&p==='/issues/344/comments')value=o.readbackMissing&&requests.filter(x=>x.method==='POST').length===26?[]:[aggregate];
 else if(method==='GET'&&p==='/issues/1713/comments')value=o.noApproval?[]:[approval];
 else if(method==='GET'&&p.startsWith('/issues/comments/')){
   const n=Number(p.split('/').at(-1));value=n===42?{...approval,...(o.revoked?{updated_at:started,body:'REVOKED'}:{})}:n===aggregate.id?aggregate:members.get(n);if(!value)throw new Error('TEST_UNKNOWN_COMMENT');
 }
 else if(method==='GET'&&p.startsWith('/actions/runs/')){const n=Number(p.split('/').at(-1));value=run(n);if(n===500&&o.priorFailed){value.conclusion='failure';}if(n===500&&o.priorRetry)value.run_attempt=2;if(n===500&&o.priorWrongSource)value.head_sha='b'.repeat(40);}
 else if(method==='POST'&&/^\\/issues\\/[0-9]+\\/comments$/.test(p)){
   const count=requests.filter(x=>x.method==='POST').length; if(count===o.failPost)return {ok:false,status:500,text:async()=>JSON.stringify({message:'synthetic transport failure'})};
   const n=Number(p.split('/')[2]),text=JSON.parse(opts.body).body;value=bot(n,++cid,text);
   if(text.includes(CS))aggregate=value;else members.set(value.id,value);
 }
 else throw new Error('TEST_UNEXPECTED_REQUEST:'+method+':'+p);
 return {ok:true,status:200,text:async()=>JSON.stringify(value)};
};
process.argv=[process.execPath,${JSON.stringify(path.join(root,'scripts/kidults/kpmo/canonical-generation-v3.mjs'))},...(o.read?[]:['--write'])];
await import(${JSON.stringify(pathToFileURL(path.join(root,'scripts/kidults/kpmo/canonical-generation-v3.mjs')).href)});
`;
  const env={PATH:process.env.PATH,HOME:dir,LANG:'C.UTF-8',GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_TOKEN:'SYNTHETIC_NOT_A_CREDENTIAL',GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'johnkim9524-collab',GITHUB_SHA:'a'.repeat(40),TARGET_MAIN_SHA:'a'.repeat(40),GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:options.retry?'2':'1',CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY:options.noAuthority?'DENIED':'AUTHORIZED',CANONICAL_GENERATION_AUTHORIZATION_ID:'CANONICAL-V3-aaaaaaaaaaaa-SYNTHETIC_1234567890',CANONICAL_GENERATION_RECEIPT_PATH:receipt};
  try {
    const proc=spawnSync(process.execPath,['--input-type=module','-e',setup],{cwd:root,env,encoding:'utf8',timeout:12000});
    assert.equal(proc.error,undefined,proc.error?.message);
    const calls=fs.existsSync(trace)?JSON.parse(fs.readFileSync(trace,'utf8')):[];
    return {status:proc.status,stderr:proc.stderr,stdout:proc.stdout,receipt:fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt,'utf8')):null,calls,posts:calls.filter(x=>x.method==='POST')};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}


function bounded(x){assert.equal(x.receipt.promotion_eligible,false);for(const k of ['production','public','g5'])assert.equal(x.receipt[k],'HOLD');}
for(const [name,o,expected] of [
 ['missing authority',{noAuthority:true},'EXPLICIT_WRITE_AUTHORITY_MISSING'],
 ['missing approval',{noApproval:true},'AUTHORIZATION_COMMENT_CARDINALITY:0'],
 ['App approval',{authApp:true},'AUTHORIZATION_APP_MEDIATED_FORBIDDEN'],
 ['rerun',{retry:true},'WRITER_RERUN_FORBIDDEN_FRESH_DISPATCH_REQUIRED'],
 ['read-only material drift',{read:true},'COMMIT_MISMATCH'],
 ['revoked approval',{revoked:true},'AUTHORIZATION_BODY_MISMATCH'],
])test(`current CLI failure replaces bootstrap-only receipt: ${name}`,()=>{
 const x=exercise({...o,preexisting:true});assert.equal(x.status,1,x.stderr);assert.equal(x.posts.length,0);assert.equal(x.receipt.failure_class,expected);assert.equal(x.receipt.writes,0);bounded(x);
});
test('actual writer rejects a wrong returned member ID despite matching body and digest',()=>{const x=exercise({wrongMemberId:true});assert.equal(x.status,1);assert.equal(x.posts.length,0);assert.equal(x.receipt.failure_class,'MEMBER_COMMENT_235_IDENTITY_INVALID');bounded(x);});
test('truth changed after 25 members prevents aggregate POST',()=>{const x=exercise({beforeCommit:true});assert.equal(x.status,1);assert.equal(x.posts.length,25);assert.equal(x.receipt.writes,25);assert.equal(x.receipt.failure_class,'PRE_COMMIT_TRUTH_MOVED');assert.equal(x.receipt.aggregate_comment_written,false);assert.equal(x.receipt.aggregate_comment_id,null);bounded(x);});
test('truth changed after aggregate preserves 26 acknowledged POSTs and aggregate ID',()=>{const x=exercise({afterCommit:true});assert.equal(x.status,1);assert.equal(x.posts.length,26);assert.equal(x.receipt.writes,26);assert.equal(x.receipt.failure_class,'POST_WRITE_TRUTH_MOVED');assert.equal(x.receipt.aggregate_comment_written,true);assert.equal(x.receipt.aggregate_comment_id,2026);bounded(x);});
test('missing readback preserves exact acknowledged aggregate for bounded recovery',()=>{const x=exercise({readbackMissing:true});assert.equal(x.status,1);assert.equal(x.receipt.failure_class,'POST_WRITE_READBACK_INVALID');assert.equal(x.receipt.writes,26);assert.equal(x.receipt.aggregate_comment_id,2026);assert.equal(x.receipt.aggregate_comment_written,true);bounded(x);});
for(const [at,acked] of [[5,4],[26,25]])test(`transport error at POST ${at} records only ${acked} acknowledged writes`,()=>{const x=exercise({failPost:at});assert.equal(x.status,1);assert.equal(x.posts.length,at);assert.equal(x.receipt.writes,acked);assert.match(x.receipt.failure_class,/GITHUB_HTTP_500/);assert.equal(x.receipt.aggregate_comment_written,false);bounded(x);});
for(const current of [false,true])test(`normal writer path remains valid (idempotent=${current})`,()=>{const x=exercise({current,preexisting:true});assert.equal(x.status,0,x.stderr);assert.equal(x.receipt.state,'VERIFIED_PASS');assert.equal(x.receipt.writes,current?0:26);bounded(x);});

// Isolated wrapper tests: the real wrapper executes, child transport is closed.
// Timer acceleration only applies to this synthetic child. No live dispatch.
function recoveryExercise(kind){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-recovery-proof-'));
 const original=path.join(dir,'writer.json'),trace=path.join(dir,'calls.json');
 const code=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const kind=${JSON.stringify(kind)},original=${JSON.stringify(original)},trace=${JSON.stringify(trace)};
const main='a'.repeat(40);const calls=[];let reads=0;
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const timer=globalThis.setTimeout;globalThis.setTimeout=(f,_ms,...args)=>timer(f,0,...args);
const failed={repository:'johnkim9524-collab/kaios_enterprise_repo',run_id:900,run_attempt:1,state:'VERIFIED_FAIL',mode:'PARTIAL_NONAUTHORITATIVE',failure_class:'POST_WRITE_READBACK_INVALID',member_comments_written:25,writes:26,aggregate_comment_written:true,aggregate_comment_id:999,generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-900-1',promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
const edits={'unacknowledged':{writes:25},'string-count':{writes:'26'},'aggregate-unacknowledged':{aggregate_comment_written:false},'missing-aggregate':{aggregate_comment_id:0},'truth-moved':{failure_class:'POST_WRITE_TRUTH_MOVED'},'prior-run':{run_id:899},'prior-repo':{repository:'wrong/repo'},'retried':{run_attempt:2},'wrong-generation':{generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-899-1'}};
Object.assign(failed,edits[kind]||{});
cp.spawnSync=(_file,args,options)=>{
 const write=args.includes('--write'),output=options.env.CANONICAL_GENERATION_RECEIPT_PATH;
 calls.push({write,output});fs.writeFileSync(trace,JSON.stringify(calls));
 if(write){fs.writeFileSync(original,JSON.stringify(failed));return {status:1,stdout:'',stderr:''};}
 reads++;
 if(kind==='exhausted'||reads<3){fs.mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});fs.writeFileSync(output,JSON.stringify({state:'VERIFIED_FAIL',writes:0,failure_class:'TRANSIENT_READ_FAILURE'}));return {status:1,stdout:'',stderr:''};}
 const v={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',generation_id:failed.generation_id,writer_run_id:900,protected_main_sha:main,canonical_issue_count:25,aggregate_comment_id:999,truth_digest:'sha256:'+'1'.repeat(64),promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 if(kind==='wrong-aggregate')v.aggregate_comment_id=888;
 if(kind==='wrong-main')v.protected_main_sha='b'.repeat(40);
 if(kind==='wrong-run')v.writer_run_id=899;
 if(kind==='string-run')v.writer_run_id='900';
 if(kind==='bad-json')return {status:0,stdout:'not json',stderr:''};
 return {status:0,stdout:JSON.stringify(v),stderr:''};
};syncBuiltinESMExports();`;
 try{
 const pre=path.join(dir,'mock.mjs');fs.writeFileSync(pre,code);
 const p=spawnSync(process.execPath,['--import',pre,'scripts/kidults/kpmo/run-canonical-generation-v3-apply-v1.mjs'],{encoding:'utf8',timeout:12000,env:{PATH:process.env.PATH,HOME:dir,GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',TARGET_MAIN_SHA:'a'.repeat(40),CANONICAL_GENERATION_RECEIPT_PATH:original}});
 assert.equal(p.error,undefined,p.error?.message);
 return {status:p.status,stderr:p.stderr,receipt:JSON.parse(fs.readFileSync(original,'utf8')),calls:JSON.parse(fs.readFileSync(trace,'utf8')),remaining:fs.readdirSync(dir),original};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('eventual readback recovers exact acknowledged aggregate, with one writer and isolated read receipts',()=>{
 const x=recoveryExercise('valid');assert.equal(x.status,0,x.stderr);assert.equal(x.receipt.mode,'COMMITTED_EVENTUAL_READBACK_RECOVERED');assert.equal(x.receipt.writes,26);assert.equal(x.receipt.aggregate_comment_id,999);assert.equal(x.receipt.original_reported_writes,26);assert.equal(x.receipt.inferred_aggregate_write_from_post_write_failure_path,false);assert.equal(x.calls.filter(c=>c.write).length,1);assert.equal(x.calls.filter(c=>!c.write).length,3);assert.ok(x.calls.filter(c=>!c.write).every(c=>c.output!==x.original));assert.ok(x.remaining.every(n=>!n.startsWith('canonical-readback-')));bounded(x);
});
for(const kind of ['unacknowledged','string-count','aggregate-unacknowledged','missing-aggregate','truth-moved','prior-run','prior-repo','retried','wrong-generation'])test(`wrapper never retries noneligible receipt: ${kind}`,()=>{
 const x=recoveryExercise(kind);assert.notEqual(x.status,0);assert.equal(x.calls.length,1);assert.equal(x.receipt.state,'VERIFIED_FAIL');bounded(x);
});
for(const kind of ['exhausted','wrong-aggregate','wrong-main','wrong-run','string-run','bad-json'])test(`failed readback ${kind} preserves writer receipt and cleans retry files`,()=>{
 const x=recoveryExercise(kind);assert.notEqual(x.status,0);assert.equal(x.calls.filter(c=>c.write).length,1);assert.equal(x.receipt.state,'VERIFIED_FAIL');assert.equal(x.receipt.failure_class,'POST_WRITE_READBACK_INVALID');assert.equal(x.receipt.writes,26);assert.equal(x.receipt.aggregate_comment_id,999);assert.ok(x.remaining.every(n=>!n.startsWith('canonical-readback-')));bounded(x);
});
