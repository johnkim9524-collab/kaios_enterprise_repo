#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {buildMaterialRegistry,materialRegistryDigest,parityFailures,runMaterialRegistrySelfTest,sha256} from './material-defect-registry-v3.mjs';
import {MEMBERS,AGGREGATE,BASELINE,MS,ME,CS,CE,WRITER_WORKFLOW,BOT,marked,parseMarked,issueNo,generationId,memberPayload,commitPayload,validateMember,validateCommit,selfTest as libSelfTest} from './canonical-generation-v3-lib.mjs';

const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
const receiptPath=process.env.CANONICAL_GENERATION_RECEIPT_PATH||`${process.env.RUNNER_TEMP||'/tmp'}/canonical-generation-v3-receipt.json`;
const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const OWNER='johnkim9524-collab';
const APPROVAL_ISSUE=1713;
const WRITE_ACTION='APPLY_APPEND_ONLY_25_PLUS_COMMIT';
const AUTHORIZATION_MAX_AGE_MS=30*60*1000;
const die=(message)=>{throw new Error(message);};

function receipt(extra){
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
  fs.writeFileSync(receiptPath,`${JSON.stringify({receipt_id:'kpmo-canonical-generation-v3-receipt',version:'3.4.0',repository:repo||null,run_id:Number(process.env.GITHUB_RUN_ID||0)||null,run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT||0)||null,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD',...extra},null,2)}\n`);
}

async function api(url,options={}){
  const response=await fetch(url.startsWith('http')?url:`https://api.github.com/repos/${repo}${url}`,{
    ...options,
    headers:{...headers,...(options.headers||{})},
    signal:AbortSignal.timeout(20000)
  });
  const text=await response.text();
  if(!response.ok)die(`GITHUB_HTTP_${response.status}:${url}:${text.slice(0,240)}`);
  return text?JSON.parse(text):null;
}

async function pages(url){
  const out=[];
  for(let page=1;page<=100;page+=1){
    const value=await api(`${url}${url.includes('?')?'&':'?'}per_page=100&page=${page}`);
    if(!Array.isArray(value))die(`PAGINATION_SHAPE:${url}`);
    out.push(...value);
    if(value.length<100)return out;
  }
  die(`PAGINATION_BOUND:${url}`);
}

async function openIssues(){
  const query=encodeURIComponent(`repo:${repo} is:issue is:open`);
  const out=[];
  let total=null;
  for(let page=1;page<=10;page+=1){
    const value=await api(`https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=100&page=${page}`);
    if(value.incomplete_results!==false||!Number.isInteger(value.total_count)||value.total_count>1000||!Array.isArray(value.items))die('OPEN_ISSUE_SEARCH_INVALID');
    if(total===null)total=value.total_count;
    if(total!==value.total_count)die('OPEN_ISSUE_CARDINALITY_MOVED');
    out.push(...value.items);
    if(out.length>=total)break;
    if(!value.items.length||page===10)die('OPEN_ISSUE_PAGINATION_TRUNCATED');
  }
  if(out.length!==total||out.some((issue)=>issue.pull_request)||new Set(out.map((issue)=>issue.number)).size!==out.length)die('OPEN_ISSUE_SET_INVALID');
  return out;
}

async function snapshot(){
  const main=(await api('/branches/main'))?.commit?.sha;
  if(!/^[0-9a-f]{40}$/i.test(main||''))die('LIVE_MAIN_INVALID');
  const [baseline,issues]=await Promise.all([Promise.all(BASELINE.map((number)=>api(`/issues/${number}`))),openIssues()]);
  const failures=issues.flatMap(parityFailures);
  if(failures.length)die(`SEVERITY_PARITY:${failures.join(',')}`);
  const registry=buildMaterialRegistry(issues);
  const active=baseline.filter((issue)=>issue.state==='open').map((issue)=>issue.number).sort((a,b)=>a-b);
  const cardinality={
    P0:registry.filter((record)=>record.labels.includes('P0')).length,
    P1:registry.filter((record)=>record.labels.includes('P1')).length
  };
  const payload={repository:repo,protected_main_sha:main,canonical_issue_numbers:MEMBERS,canonical_issue_count:MEMBERS.length,active_baseline_defects:active,material_defect_count:registry.length,material_defect_issue_numbers:registry.map((record)=>record.issue_number),material_defect_registry_sha256:materialRegistryDigest(registry),material_defect_query_cardinality:cardinality,material_defects:registry,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false,empirical_gate_effect:'NONE'};
  return {...payload,truth_digest:sha256(payload)};
}

async function latestCommit(){
  return (await pages(`/issues/${AGGREGATE}/comments`)).filter((comment)=>String(comment.body||'').includes(CS)).sort((a,b)=>b.id-a.id)[0]||null;
}

async function validateCurrent(snapshotValue,expectedRun=null){
  const aggregate=await latestCommit();
  if(!aggregate)return null;
  if(aggregate.user?.login!==BOT||issueNo(aggregate)!==AGGREGATE)die('AGGREGATE_COMMENT_IDENTITY_INVALID');
  const commit=parseMarked(aggregate.body,CS,CE);
  if(commit.protected_main_sha!==snapshotValue.protected_main_sha)return {stale:true,generation_id:commit.generation_id};
  validateCommit(commit,snapshotValue,expectedRun);
  const comments=await Promise.all(commit.member_comments.map((entry)=>api(`/issues/comments/${entry.comment_id}`)));
  for(let index=0;index<MEMBERS.length;index+=1){
    const comment=comments[index],entry=commit.member_comments[index];
    if(comment.user?.login!==BOT||issueNo(comment)!==MEMBERS[index]||comment.id>=aggregate.id||sha256(String(comment.body||''))!==entry.comment_body_sha256)die(`MEMBER_COMMENT_${MEMBERS[index]}_IDENTITY_INVALID`);
    validateMember(parseMarked(comment.body,MS,ME),snapshotValue,{id:commit.generation_id,issue:MEMBERS[index],index:index+1,run:commit.writer_run_id,attempt:commit.writer_run_attempt});
  }
  return {stale:false,generation_id:commit.generation_id,aggregate_comment_id:aggregate.id,writer_run_id:commit.writer_run_id,truth_digest:snapshotValue.truth_digest};
}

const post=(issue,body)=>api(`/issues/${issue}/comments`,{method:'POST',body:JSON.stringify({body})});
function authorizationId(main,requested){
  const value=String(requested||'');
  if(!/^CANONICAL-V3-[0-9a-f]{12}-[A-Z0-9][A-Z0-9_-]{15,63}$/.test(value))die('AUTHORIZATION_ID_FORMAT_INVALID');
  if(!value.startsWith(`CANONICAL-V3-${main.slice(0,12)}-`))die('AUTHORIZATION_ID_MAIN_BINDING_INVALID');
  return value;
}
const authorizationBody=(id,main)=>`CANONICAL_V3_AUTHORIZATION_ID: ${id}\nTARGET_MAIN_SHA: ${main}\nACTION: ${WRITE_ACTION}`;

function validateAuthorizationComment(comment,expectedBody,runStartedAt){
  if(comment?.user?.login!==OWNER)die('AUTHORIZATION_OWNER_IDENTITY_INVALID');
  if(comment?.author_association!=='OWNER')die('AUTHORIZATION_OWNER_ASSOCIATION_INVALID');
  if(comment?.performed_via_github_app)die('AUTHORIZATION_APP_MEDIATED_FORBIDDEN');
  if(String(comment?.body||'').trim()!==expectedBody)die('AUTHORIZATION_BODY_MISMATCH');
  if(!comment?.created_at||!comment?.updated_at||comment.created_at!==comment.updated_at)die('AUTHORIZATION_COMMENT_MUTATED');
  const approvalTime=Date.parse(comment.created_at),runTime=Date.parse(runStartedAt);
  if(!Number.isFinite(approvalTime)||!Number.isFinite(runTime)||approvalTime>=runTime)die('AUTHORIZATION_NOT_PREEXISTING');
  if(runTime-approvalTime>AUTHORIZATION_MAX_AGE_MS)die('AUTHORIZATION_STALE');
}

async function verifyWriteAuthority(snapshotValue,run,attempt){
  if(process.env.CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY!=='AUTHORIZED')die('EXPLICIT_WRITE_AUTHORITY_MISSING');
  if(process.env.GITHUB_ACTIONS!=='true')die('WRITE_REQUIRES_GITHUB_ACTIONS');
  if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')die('WRITE_REQUIRES_WORKFLOW_DISPATCH');
  if(process.env.GITHUB_REF!=='refs/heads/main')die('WRITE_REQUIRES_MAIN_REF');
  if(process.env.GITHUB_ACTOR!==OWNER)die('WRITE_REQUIRES_OWNER_ACTOR');
  if(attempt!==1)die('WRITER_RERUN_FORBIDDEN_FRESH_DISPATCH_REQUIRED');
  const expectedId=authorizationId(snapshotValue.protected_main_sha,process.env.CANONICAL_GENERATION_AUTHORIZATION_ID);

  const runEnvelope=await api(`/actions/runs/${run}`);
  if(runEnvelope?.id!==run||runEnvelope?.run_attempt!==attempt)die('WRITER_RUN_IDENTITY_MISMATCH');
  if(runEnvelope?.repository?.full_name!==repo||runEnvelope?.head_branch!=='main'||runEnvelope?.head_sha!==snapshotValue.protected_main_sha)die('WRITER_RUN_SOURCE_SCOPE_INVALID');
  if(runEnvelope?.event!=='workflow_dispatch'||runEnvelope?.path!==WRITER_WORKFLOW||runEnvelope?.actor?.login!==OWNER||runEnvelope?.triggering_actor?.login!==OWNER)die('WRITER_RUN_AUTHORITY_ENVELOPE_INVALID');
  if(!runEnvelope?.run_started_at)die('WRITER_RUN_STARTED_AT_MISSING');

  const expectedBody=authorizationBody(expectedId,snapshotValue.protected_main_sha);
  const approvals=(await pages(`/issues/${APPROVAL_ISSUE}/comments`)).filter((comment)=>String(comment?.body||'').trim()===expectedBody);
  if(approvals.length!==1)die(`AUTHORIZATION_COMMENT_CARDINALITY:${approvals.length}`);
  validateAuthorizationComment(approvals[0],expectedBody,runEnvelope.run_started_at);
  return {authorization_id:expectedId,approval_issue:APPROVAL_ISSUE,approval_comment_id:approvals[0].id,approval_created_at:approvals[0].created_at,writer_workflow_path:WRITER_WORKFLOW,writer_run_id:run,writer_run_attempt:attempt,writer_run_started_at:runEnvelope.run_started_at};
}

async function write(){
  if(!repo||!token)die('REPOSITORY_OR_TOKEN_MISSING');
  const snapshotValue=await snapshot();
  const target=process.env.TARGET_MAIN_SHA||'';
  const checkout=process.env.GITHUB_SHA||'';
  if(target!==snapshotValue.protected_main_sha)die('TARGET_MAIN_MISSING_OR_STALE');
  if(checkout!==snapshotValue.protected_main_sha)die('EVENT_SHA_NOT_LIVE_MAIN');
  const run=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  if(!Number.isInteger(run)||run<1||!Number.isInteger(attempt)||attempt<1)die('WRITER_RUN_IDENTITY_INVALID');
  const authorization=await verifyWriteAuthority(snapshotValue,run,attempt);
  const prior=await validateCurrent(snapshotValue);
  if(prior&&!prior.stale){receipt({state:'VERIFIED_PASS',mode:'IDEMPOTENT_EXISTING_GENERATION',...prior,authorization,writes:0});return;}
  const id=generationId(snapshotValue.protected_main_sha,run,attempt),generatedAt=new Date().toISOString(),entries=[];
  try{
    for(let index=0;index<MEMBERS.length;index+=1){
      const body=marked(MS,ME,memberPayload(snapshotValue,id,MEMBERS[index],index,run,attempt,generatedAt));
      const comment=await post(MEMBERS[index],body);
      entries.push({issue_number:MEMBERS[index],comment_id:comment.id,comment_body_sha256:sha256(body)});
    }
    const body=marked(CS,CE,commitPayload(snapshotValue,id,run,attempt,entries,new Date().toISOString()));
    const aggregate=await post(AGGREGATE,body);
    const postWriteSnapshot=await snapshot();
    if(postWriteSnapshot.truth_digest!==snapshotValue.truth_digest)die('POST_WRITE_TRUTH_MOVED');
    const verified=await validateCurrent(postWriteSnapshot,run);
    if(!verified||verified.stale||verified.aggregate_comment_id!==aggregate.id)die('POST_WRITE_READBACK_INVALID');
    receipt({state:'VERIFIED_PASS',mode:'COMMITTED',generation_id:id,aggregate_comment_id:aggregate.id,member_count:MEMBERS.length,truth_digest:postWriteSnapshot.truth_digest,authorization,writes:26});
  }catch(error){
    receipt({state:'VERIFIED_FAIL',mode:'PARTIAL_NONAUTHORITATIVE',generation_id:id,member_comments_written:entries.length,authorization,writes:entries.length,failure_class:error.message});
    throw error;
  }
}

async function validate(){
  if(!repo||!token)die('REPOSITORY_OR_TOKEN_MISSING');
  const snapshotValue=await snapshot();
  const current=await validateCurrent(snapshotValue);
  if(!current||current.stale)die(current?'LATEST_COMMITTED_GENERATION_STALE':'COMMITTED_GENERATION_MISSING');
  console.log(JSON.stringify({validator:'KPMO_CANONICAL_GENERATION_V3',version:'3.4.0',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',state:'VERIFIED_PASS',...current,protected_main_sha:snapshotValue.protected_main_sha,canonical_issue_count:25,canonical_issues:snapshotValue.canonical_issue_numbers,active_baseline_trust_root_defects:snapshotValue.active_baseline_defects,material_defect_count:snapshotValue.material_defect_count,material_defect_registry_sha256:snapshotValue.material_defect_registry_sha256,material_defect_query_cardinality:snapshotValue.material_defect_query_cardinality,material_defects:snapshotValue.material_defects,empirical_promotion:false,whole_platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
}

function selfTest(){
  const material=runMaterialRegistrySelfTest();
  const library=libSelfTest();
  const source=fs.readFileSync(new URL(import.meta.url),'utf8');
  const active=source.slice(0,source.indexOf('function selfTest'));
  if(!active.includes("method:'POST'")||['PATCH','PUT','DELETE'].some((method)=>active.includes(`method:'${method}'`)))die('SELF_TEST_NON_APPEND_MUTATION_SURFACE');
  for(const marker of [
    "CANONICAL_GENERATION_EXPLICIT_WRITE_AUTHORITY!=='AUTHORIZED'",
    "GITHUB_ACTIONS!=='true'",
    "GITHUB_EVENT_NAME!=='workflow_dispatch'",
    "GITHUB_REF!=='refs/heads/main'",
    'GITHUB_ACTOR!==OWNER',
    "attempt!==1",
    'runEnvelope?.triggering_actor?.login!==OWNER',
    'runEnvelope?.run_started_at',
    'POST_WRITE_TRUTH_MOVED',
    'authorizationId(snapshotValue.protected_main_sha,process.env.CANONICAL_GENERATION_AUTHORIZATION_ID)',
    'runEnvelope?.path!==WRITER_WORKFLOW',
    'comment?.performed_via_github_app',
    'comment.created_at!==comment.updated_at',
    'AUTHORIZATION_COMMENT_CARDINALITY'
  ]) if(!active.includes(marker))die(`SELF_TEST_WRITE_AUTHORITY_GUARD_MISSING:${marker}`);
  const main='a'.repeat(40);
  const id=authorizationId(main,'CANONICAL-V3-aaaaaaaaaaaa-OWNER_NONCE_0001');
  if(id!=='CANONICAL-V3-aaaaaaaaaaaa-OWNER_NONCE_0001')die('SELF_TEST_AUTHORIZATION_ID');
  for(const badId of ['CANONICAL-V3-aaaaaaaaaaaa-short','CANONICAL-V3-bbbbbbbbbbbb-OWNER_NONCE_0001','CANONICAL-V3-aaaaaaaaaaaa-owner-lowercase-nonce']){
    let escaped=true;try{authorizationId(main,badId);}catch{escaped=false;}if(escaped)die('SELF_TEST_AUTHORIZATION_ID_MUTATION_ESCAPED');
  }
  const body=authorizationBody(id,main);
  if(body!==`CANONICAL_V3_AUTHORIZATION_ID: ${id}\nTARGET_MAIN_SHA: ${main}\nACTION: ${WRITE_ACTION}`)die('SELF_TEST_AUTHORIZATION_BODY');
  let rejected=0;
  for(const bad of [
    {user:{login:OWNER},author_association:'OWNER',performed_via_github_app:null,body,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:01Z'},
    {user:{login:'other'},author_association:'OWNER',performed_via_github_app:null,body,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'},
    {user:{login:OWNER},author_association:'OWNER',performed_via_github_app:{id:1},body,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'},
    {user:{login:OWNER},author_association:'OWNER',performed_via_github_app:null,body,created_at:'2025-12-31T23:29:59Z',updated_at:'2025-12-31T23:29:59Z'}
  ]){
    try{validateAuthorizationComment(bad,body,'2026-01-01T00:01:00Z');}catch{rejected+=1;}
  }
  if(rejected!==4)die('SELF_TEST_AUTHORIZATION_NEGATIVE_CASES');
  validateAuthorizationComment({user:{login:OWNER},author_association:'OWNER',performed_via_github_app:null,body,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'},body,'2026-01-01T00:01:00Z');
  console.log(JSON.stringify({...library,material_registry_self_test:material.state,cli_append_only:true,explicit_write_authority_required:true,workflow_write_authority:false,write_workflow_not_present:false,owner_preapproval_comment_required:true,authorization_bound_to_exact_main_and_run_envelope:true,owner_nonce_preexists_run:true,authorization_max_age_minutes:30,app_mediated_approval_forbidden:true,rerun_forbidden:true,triggering_actor_owner_required:true,authorization_bound_to_run_started_at:true,post_write_live_truth_rebound:true,label_cardinality_overlap_preserved:true,authorization_negative_cases:4},null,2));
}

try{
  if(process.argv.includes('--self-test'))selfTest();
  else if(process.argv.includes('--write'))await write();
  else await validate();
}catch(error){
  if(!process.argv.includes('--self-test')&&!fs.existsSync(receiptPath))receipt({state:'VERIFIED_FAIL',mode:'UNCOMMITTED',failure_class:error instanceof Error?error.message:String(error),writes:0});
  console.error(error);
  process.exit(1);
}
