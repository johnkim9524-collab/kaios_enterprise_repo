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
 else if(method==='GET'&&u.pathname==='/search/issues'){searches++;const items=o.liveDrift&&searches>1?[...live,issue(11)]:live;value={items,incomplete_results:false,total_count:items.length};}
 else if(method==='GET'&&p==='/issues/344/comments')value=[aggregate];
 else if(method==='GET'&&p==='/issues/1713/comments')value=o.noApproval?[]:[approval];
 else if(method==='GET'&&p.startsWith('/issues/comments/')){
   const n=Number(p.split('/').at(-1));value=n===42?{...approval,...(o.revoked?{updated_at:started,body:'REVOKED'}:{})}:n===aggregate.id?aggregate:members.get(n);if(!value)throw new Error('TEST_UNKNOWN_COMMENT');
 }
 else if(method==='GET'&&p.startsWith('/actions/runs/')){const n=Number(p.split('/').at(-1));value=run(n);if(n===500&&o.priorFailed){value.conclusion='failure';}if(n===500&&o.priorRetry)value.run_attempt=2;if(n===500&&o.priorWrongSource)value.head_sha='b'.repeat(40);}
 else if(method==='POST'&&/^\\/issues\\/[0-9]+\\/comments$/.test(p)){
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

for(const [name,o] of [['new material issue',{}],['material title-only change',{titleOnly:true}],['active baseline change',{baseline:true}]])test(`authorized same-main refresh appends 25 members + commit for ${name}`,()=>{
 const x=exercise(o);assert.equal(x.status,0,x.stderr);assert.equal(x.posts.length,26);assert.equal(x.receipt.state,'VERIFIED_PASS');assert.equal(x.receipt.mode,'COMMITTED');assert.equal(x.receipt.refresh.reason,'MATERIAL_SNAPSHOT_CHANGED');assert.equal(x.receipt.refresh.prior_generation_id,'kpmo-canonical-v3-aaaaaaaaaaaa-500-1');assert.equal(x.receipt.promotion_eligible,false);
});
test('unchanged current generation remains idempotent with zero posts',()=>{const x=exercise({current:true});assert.equal(x.status,0,x.stderr);assert.equal(x.posts.length,0);assert.equal(x.receipt.mode,'IDEMPOTENT_EXISTING_GENERATION');});
test('read-only validation never silently repairs or accepts same-main stale truth',()=>{const x=exercise({read:true});assert.equal(x.status,1);assert.equal(x.posts.length,0);assert.equal(x.receipt.failure_class,'COMMIT_MISMATCH');assert.ok(x.receipt.mismatch_fields.includes('material_defect_count'));});
const corruptionCodes={repository:'REFRESH_NON_MATERIAL_DRIFT',hold:'REFRESH_NON_MATERIAL_DRIFT',count:'REFRESH_PRIOR_MATERIAL_SET_INVALID',version:'REFRESH_PRIOR_VERSION_OR_RUN_INVALID',digest:'REFRESH_PRIOR_DIGEST_INVALID','duplicate-defects':'REFRESH_PRIOR_MATERIAL_SET_INVALID',baseline:'REFRESH_PRIOR_BASELINE_INVALID','member-count':'COMMIT_PAYLOAD_INVALID','member-digest':'MEMBER_COMMENT_235_IDENTITY_INVALID','extra-field':'REFRESH_PRIOR_FIELDS_MISMATCH','aggregate-mutated':'REFRESH_PRIOR_COMMENT_MUTATED_OR_UNTRUSTED','aggregate-author':'AGGREGATE_COMMENT_IDENTITY_INVALID','aggregate-app':'REFRESH_PRIOR_COMMENT_MUTATED_OR_UNTRUSTED','member-mutated':'REFRESH_PRIOR_COMMENT_MUTATED_OR_UNTRUSTED','member-body':'MEMBER_COMMENT_235_IDENTITY_INVALID','member-version':'REFRESH_PRIOR_MEMBER_VERSION_INVALID'};
for(const corrupt of Object.keys(corruptionCodes))test(`refresh rejects damaged prior ${corrupt} before writes`,()=>{const x=exercise({corrupt});assert.equal(x.status,1,x.stderr);assert.equal(x.receipt?.failure_class,corruptionCodes[corrupt],x.stderr);assert.equal(x.posts.length,0);assert.equal(x.receipt.state,'VERIFIED_FAIL');});
const boundaryCodes=['EXPLICIT_WRITE_AUTHORITY_MISSING','AUTHORIZATION_COMMENT_CARDINALITY:0','AUTHORIZATION_APP_MEDIATED_FORBIDDEN','WRITER_RERUN_FORBIDDEN_FRESH_DISPATCH_REQUIRED','AUTHORIZATION_BODY_MISMATCH','PRE_WRITE_TRUTH_MOVED','PRE_WRITE_TRUTH_MOVED','REFRESH_PRIOR_WRITER_RUN_INVALID','REFRESH_PRIOR_WRITER_RUN_INVALID','REFRESH_PRIOR_WRITER_RUN_INVALID'];
for(const [index,[name,o]] of [['missing authority',{noAuthority:true}],['missing Owner comment',{noApproval:true}],['App-mediated approval',{authApp:true}],['rerun',{retry:true}],['revoked approval during prior read',{revoked:true}],['main changed before first write',{mainDrift:true}],['truth changed before first write',{liveDrift:true}],['prior failed writer',{priorFailed:true}],['prior retried writer',{priorRetry:true}],['prior writer source drift',{priorWrongSource:true}]].entries())test(`same-main refresh preserves ${name} fail-closed boundary`,()=>{const x=exercise(o);assert.equal(x.status,1,x.stderr);assert.equal(x.receipt?.failure_class,boundaryCodes[index],x.stderr);assert.equal(x.posts.length,0);assert.equal(x.receipt.state,'VERIFIED_FAIL');});
