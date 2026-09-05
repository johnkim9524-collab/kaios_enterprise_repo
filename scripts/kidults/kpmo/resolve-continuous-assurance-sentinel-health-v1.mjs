#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {REPOSITORY, MAX_ARCHIVE_BYTES, validateProducerContent, validateCoverageAliasClosure} from './validate-sentinel-producer-content-v1.mjs';

const SHA=/^[0-9a-f]{40}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const TERMINAL=new Set(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale']);
const SPECS=[
  {id:'SHADOW',workflow:'kidults-asi-shadow-operating-evidence-v1.yml',path:'.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml',events:['schedule','push','workflow_dispatch'],artifacts:['kidults-asi-shadow-operating-evidence-v1']},
  {id:'REQUIREMENT',workflow:'kidults-asi-requirement-adapter-coverage-v1.yml',path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',events:['workflow_run'],artifacts:['kidults-asi-requirement-adapter-coverage-v1']},
  {id:'RESERVE',workflow:'kidults-asi-sharded-source-reserve-v1.yml',path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',events:['workflow_run','schedule','workflow_dispatch'],artifacts:['kidults-asi-sharded-source-reserve-v1','kidults-asi-sharded-source-reserve-waiting-v1'],waitingArtifact:'kidults-asi-sharded-source-reserve-waiting-v1'},
  {id:'CANONICAL_TRUTH',workflow:'kpmo-live-canonical-issue-truth-v1.yml',path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',events:['push','workflow_dispatch','issues'],artifactForRun:(run)=>`kpmo-live-canonical-issue-truth-v1-${run.id}`},
];

const stable=(value)=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const sha256=(value)=>`sha256:${crypto.createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex')}`;
const fail=(code)=>{throw new Error(code);};

function sealReceipt(base){
  const snapshot=JSON.parse(JSON.stringify(base));
  if(stable(base)!==stable(snapshot))fail('SENTINEL_RECEIPT_NOT_JSON_STABLE');
  return {...snapshot,receipt_digest:sha256(snapshot)};
}

const positiveInteger=value=>Number.isSafeInteger(value)&&value>0;
const ACTIVE=new Set(['queued','in_progress','waiting','pending','requested']);

// Both public evaluation and the authenticated collector use this one selection
// rule. Ambiguous pages/attempts never become a best-effort older PASS.
export function selectProducerGeneration(runs,spec,sourceSha,observedAt){
  if(!Array.isArray(runs)||runs.length>1000)fail('RUN_INDEX_SHAPE_OR_BOUND');
  const observed=Date.parse(observedAt);
  if(typeof observedAt!=='string'||!Number.isFinite(observed))fail('OBSERVED_AT_INVALID');
  const ids=new Set();
  for(const run of runs){
    if(!run||typeof run!=='object'||Array.isArray(run))fail('RUN_INDEX_RECORD_INVALID');
    if(!positiveInteger(run.id)||!positiveInteger(run.run_attempt))fail('RUN_INDEX_IDENTITY_INVALID');
    if(ids.has(run.id))fail('RUN_INDEX_DUPLICATE_ID');
    ids.add(run.id);
    if(run.repository?.full_name!==REPOSITORY)fail('RUN_INDEX_REPOSITORY_INVALID');
    if(typeof run.path!=='string'||!run.path.startsWith('.github/workflows/')||
       typeof run.head_branch!=='string'||!run.head_branch||
       typeof run.head_sha!=='string'||!SHA.test(run.head_sha)||
       typeof run.event!=='string'||!run.event)fail('RUN_INDEX_SOURCE_CONTEXT_INVALID');
    if(typeof run.created_at!=='string'||!Number.isFinite(Date.parse(run.created_at))||
       Date.parse(run.created_at)>observed)fail('RUN_INDEX_CREATED_AT_INVALID');
    if(run.status==='completed'){
      if(!TERMINAL.has(run.conclusion))fail('RUN_INDEX_TERMINAL_CONCLUSION_INVALID');
    }else if(!ACTIVE.has(run.status)||run.conclusion!==null){
      fail('RUN_INDEX_LIFECYCLE_INVALID');
    }
  }
  const candidates=runs.filter(run=>run.path===spec.path&&run.head_branch==='main'&&
    run.head_sha===sourceSha&&spec.events.includes(run.event)).sort((a,b)=>
    Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id);
  return {candidates,latest:candidates.at(-1)};
}

function generationSignature(run){
  return stable(run?[run.id,run.run_attempt,run.repository?.full_name,run.path,
    run.head_branch,run.head_sha,run.event,run.created_at,run.run_started_at??null,
    run.status,run.conclusion]:null);
}

function exactArtifact(spec,run,artifacts,observedAt,archivesById={},relatedById={},sourceSha=run.head_sha){
  const expected=spec.artifactForRun?[spec.artifactForRun(run)]:spec.artifacts;
  const rows=(artifacts||[]).filter((a)=>expected.includes(a?.name));
  if(rows.length!==1)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_CARDINALITY_${rows.length}`};
  const a=rows[0];
  if(a.expired!==false)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_EXPIRED_OR_INVALID`};
  if(Number(a?.workflow_run?.id)!==Number(run.id)||a?.workflow_run?.head_sha!==run.head_sha)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_RUN_BINDING`};
  if(!DIGEST.test(a.digest||''))return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_DIGEST`};
  if(!Number.isFinite(Date.parse(a.expires_at||''))||Date.parse(a.expires_at)<=Date.parse(observedAt))return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_EXPIRY`};
  const metadata={artifact_transport_verified:true,artifact_content_validated:false,artifact_id:Number(a.id),artifact_name:a.name,artifact_digest:a.digest,artifact_expires_at:a.expires_at};
  const bytes=archivesById[a.id];
  if(!Buffer.isBuffer(bytes))return {...metadata,state:'VERIFIED_HOLD',failure_class:`${spec.id}_ARTIFACT_CONTENT_NOT_VALIDATED`};
  try{
    let content=validateProducerContent(spec,run,a,bytes,sourceSha,observedAt);
    if(content.alias){
      const target=relatedById[content.alias.canonical_artifact_id];
      if(target){
        if(target.run.path!==spec.path||target.run.event!=='workflow_run')throw new Error('COVERAGE_ALIAS_RUN_PATH_EVENT');
        const leader=validateProducerContent(spec,target.run,target.artifact,target.bytes,sourceSha,observedAt);
        content=validateCoverageAliasClosure(content,leader,target.run,target.artifact);
      }
    }
    const {alias,leader,...sanitized}=content;
    return {...metadata,...sanitized};
  }catch(error){return {...metadata,state:'VERIFIED_FAIL',failure_class:`${spec.id}_CONTENT_REJECTED`,content_error_code:String(error.message).split(':')[0]};}

}

export function evaluateProducer(spec,runs,artifactsByRun,sourceSha,observedAt,archivesById={},relatedById={}){
  if(typeof sourceSha!=='string'||!SHA.test(sourceSha))fail('SOURCE_SHA_INVALID');
  let candidates;
  try{({candidates}=selectProducerGeneration(runs,spec,sourceSha,observedAt));}
  catch(error){return {id:spec.id,state:'VERIFIED_FAIL',failure_class:error.message,selected_run_id:null,superseded_red_run_ids:[]};}
  if(!candidates.length)return {id:spec.id,state:'VERIFIED_HOLD',failure_class:'NO_APPLICABLE_EXACT_SHA_GENERATION',selected_run_id:null,superseded_red_run_ids:[]};
  const latest=candidates.at(-1);
  const olderReds=candidates.slice(0,-1).filter((run)=>run.status==='completed'&&TERMINAL.has(run.conclusion)&&run.conclusion!=='success').map((run)=>Number(run.id));
  if(latest.status!=='completed')return {id:spec.id,state:'VERIFIED_HOLD',failure_class:'NEWER_APPLICABLE_GENERATION_NONTERMINAL',selected_run_id:Number(latest.id),selected_run_status:latest.status,superseded_red_run_ids:[]};
  if(!TERMINAL.has(latest.conclusion))return {id:spec.id,state:'VERIFIED_FAIL',failure_class:`TERMINAL_CONCLUSION_UNKNOWN_${latest.conclusion||'NULL'}`,selected_run_id:Number(latest.id),superseded_red_run_ids:[]};
  if(latest.conclusion!=='success')return {id:spec.id,state:'VERIFIED_FAIL',failure_class:`LATEST_APPLICABLE_${String(latest.conclusion).toUpperCase()}`,selected_run_id:Number(latest.id),selected_run_attempt:latest.run_attempt,selected_event:latest.event,superseded_red_run_ids:[]};
  const artifact=exactArtifact(spec,latest,artifactsByRun?.[latest.id]||[],observedAt,archivesById,relatedById,sourceSha);
  return {id:spec.id,...artifact,selected_run_id:Number(latest.id),selected_run_attempt:latest.run_attempt,selected_event:latest.event,selected_created_at:latest.created_at,superseded_red_run_ids:artifact.state==='VERIFIED_PASS'?olderReds:[]};
}

export function evaluateHealth(input){
  if(input?.repository!==REPOSITORY)fail('SENTINEL_REPOSITORY_INVALID');
  if(!positiveInteger(input.observer_run_id)||!positiveInteger(input.observer_run_attempt))fail('SENTINEL_OBSERVER_IDENTITY_INVALID');
  const observedAt=input.observed_at;
  if(!Number.isFinite(Date.parse(observedAt||'')))fail('OBSERVED_AT_INVALID');
  if(!SHA.test(input.source_sha||''))fail('SOURCE_SHA_INVALID');
  const producers=SPECS.map((spec)=>evaluateProducer(spec,input.runs?.[spec.id]||[],input.artifacts_by_run||{},input.source_sha,observedAt,input.archives_by_id||{},input.related_by_id||{}));
  const failures=producers.filter((p)=>p.state==='VERIFIED_FAIL');
  const holds=producers.filter((p)=>p.state==='VERIFIED_HOLD');
  const state=failures.length?'VERIFIED_FAIL':holds.length?'VERIFIED_HOLD':'VERIFIED_PASS';
  const base={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',state,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',semantic_content_verified:state==='VERIFIED_PASS',runtime_health_proven:false,observer_run_id:input.observer_run_id??null,observer_run_attempt:input.observer_run_attempt??null,repository:input.repository,source_sha:input.source_sha,observed_at:observedAt,producers,failed_producers:failures.map((p)=>p.id),waiting_producers:holds.map((p)=>p.id),whole_platform_authority:false,promotion_eligible:false,empirical_delta:0,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD'};
  return sealReceipt(base);
}

async function api(url,token){
  const u=new URL(url);
  if(u.origin!=='https://api.github.com'||u.username||u.password)fail('GITHUB_API_ORIGIN_INVALID');
  let response;
  try{response=await fetch(u,{method:'GET',redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});}catch{fail('GITHUB_READ_TRANSPORT_FAILED');}
  if(!response.ok)fail(`GITHUB_HTTP_${response.status}`);
  return response.json();
}

export function allowedArtifactRedirect(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||
      !['.blob.core.windows.net','.actions.githubusercontent.com'].some(suffix=>u.hostname.endsWith(suffix)))fail('ARTIFACT_REDIRECT_ORIGIN_INVALID');
  return u;
}
async function downloadArtifact(repo,artifact,token){
  if(!Number.isSafeInteger(artifact.id)||artifact.id<=0||!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<=0||artifact.size_in_bytes>MAX_ARCHIVE_BYTES)fail('ARTIFACT_DOWNLOAD_BOUND');
  let response;
  try{
    response=await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${artifact.id}/zip`,{method:'GET',redirect:'manual',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
    if(response.status===302){
      const target=allowedArtifactRedirect(response.headers.get('location'));
      // Never forward the repository bearer token to signed object storage.
      response=await fetch(target,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
    }
    if(!response.ok||!response.body)fail('ARTIFACT_DOWNLOAD_FAILED');
    const chunks=[];let total=0;
    for await(const chunk of response.body){total+=chunk.length;if(total>MAX_ARCHIVE_BYTES)fail('ARTIFACT_DOWNLOAD_SIZE_LIMIT');chunks.push(Buffer.from(chunk));}
    if(total!==artifact.size_in_bytes)fail('ARTIFACT_DOWNLOAD_LENGTH_MISMATCH');
    return Buffer.concat(chunks);
  }catch(error){if(/^(ARTIFACT_|GITHUB_)/.test(error.message))throw error;fail('ARTIFACT_DOWNLOAD_TRANSPORT_FAILED');}
}
const latestApplicable=(runs,spec,sha)=>selectProducerGeneration(runs,spec,sha,new Date().toISOString()).latest;

async function workflowRuns(repo,spec,sha,token){
  const out=[];let expectedCount;
  for(let page=1;page<=10;page+=1){
    const url=`https://api.github.com/repos/${repo}/actions/workflows/${spec.workflow}/runs?branch=main&head_sha=${sha}&per_page=100&page=${page}`;
    const value=await api(url,token);
    if(!Array.isArray(value?.workflow_runs)||value.workflow_runs.length>100||
       !Number.isSafeInteger(value.total_count)||value.total_count<0||value.total_count>1000||
       value.incomplete_results===true)throw new Error(`${spec.id}_RUN_INDEX_INVALID`);
    if(expectedCount===undefined)expectedCount=value.total_count;
    if(value.total_count!==expectedCount)throw new Error(`${spec.id}_RUN_INDEX_COUNT_CHANGED`);
    out.push(...value.workflow_runs);
    if(out.length>expectedCount)throw new Error(`${spec.id}_RUN_INDEX_CARDINALITY_INVALID`);
    if(out.length===expectedCount)return out;
    if(value.workflow_runs.length<100)throw new Error(`${spec.id}_RUN_INDEX_TRUNCATED`);
  }
  throw new Error(`${spec.id}_RUN_INDEX_PAGINATION_BOUND`);
}

async function liveInput(){
  const repo=process.env.GITHUB_REPOSITORY||'';
  const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
  if(repo!==REPOSITORY||!token)fail('REPOSITORY_OR_TOKEN_MISSING');
  if(!['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME||''))fail('SENTINEL_EVENT_NOT_ALLOWED');
  if(process.env.GITHUB_REF!=='refs/heads/main')fail('SENTINEL_MAIN_REF_REQUIRED');
  const observerRun=Number(process.env.GITHUB_RUN_ID),observerAttempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  if(!Number.isSafeInteger(observerRun)||observerRun<=0||!Number.isSafeInteger(observerAttempt)||observerAttempt<=0)fail('SENTINEL_OBSERVER_IDENTITY_INVALID');
  const main=await api(`https://api.github.com/repos/${repo}/branches/main`,token);
  const sourceSha=main?.commit?.sha||'';
  if(!SHA.test(sourceSha)||process.env.GITHUB_SHA!==sourceSha||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==sourceSha)fail('SENTINEL_EXACT_LIVE_MAIN_MISMATCH');
  const runs={},artifactsByRun={},archivesById={},relatedById={};
  for(const spec of SPECS){
    runs[spec.id]=await workflowRuns(repo,spec,sourceSha,token);
    const run=latestApplicable(runs[spec.id],spec,sourceSha);
    if(!run||run.status!=='completed'||run.conclusion!=='success')continue;
    const value=await api(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,token);
    if(!Array.isArray(value?.artifacts)||value.total_count!==value.artifacts.length)fail('ARTIFACT_INDEX_TRUNCATED');
    artifactsByRun[run.id]=value.artifacts;
    const expected=spec.artifactForRun?[spec.artifactForRun(run)]:spec.artifacts;
    const selected=value.artifacts.filter(a=>expected.includes(a.name));
    if(selected.length!==1)continue;
    const artifact=selected[0];archivesById[artifact.id]=await downloadArtifact(repo,artifact,token);
    // Resolve at most one same-source alias target, never recursive/latest fallback.
    if(spec.id==='REQUIREMENT'){
      const content=validateProducerContent(spec,run,artifact,archivesById[artifact.id],sourceSha,new Date().toISOString());
      if(content.alias){
        const a=content.alias;
        const leaderRun=await api(`https://api.github.com/repos/${repo}/actions/runs/${a.canonical_workflow_run_id}`,token);
        const leaderArtifact=await api(`https://api.github.com/repos/${repo}/actions/artifacts/${a.canonical_artifact_id}`,token);
        if(leaderRun.path!==spec.path||leaderRun.event!=='workflow_run'||leaderRun.head_sha!==sourceSha||leaderRun.run_attempt!==a.canonical_workflow_run_attempt||leaderArtifact.digest!==a.canonical_artifact_digest)fail('COVERAGE_ALIAS_REMOTE_BINDING');
        relatedById[leaderArtifact.id]={run:leaderRun,artifact:leaderArtifact,bytes:await downloadArtifact(repo,leaderArtifact,token)};
      }
    }
  }
  // Fail rather than publish an older green if main, run selection or attempt moved.
  for(const spec of SPECS){
    const before=latestApplicable(runs[spec.id],spec,sourceSha);
    const after=latestApplicable(await workflowRuns(repo,spec,sourceSha,token),spec,sourceSha);
    if(generationSignature(before)!==generationSignature(after))fail('SENTINEL_GENERATION_CHANGED_DURING_READ');
  }
  for(const related of Object.values(relatedById)){
    const fresh=await api(`https://api.github.com/repos/${repo}/actions/runs/${related.run.id}`,token);
    if(generationSignature(fresh)!==generationSignature(related.run)||fresh.head_sha!==sourceSha||fresh.status!=='completed'||fresh.conclusion!=='success')fail('COVERAGE_ALIAS_RUN_CHANGED_DURING_READ');
  }
  const afterMain=await api(`https://api.github.com/repos/${repo}/branches/main`,token);
  if(afterMain?.commit?.sha!==sourceSha)fail('SENTINEL_MAIN_CHANGED_DURING_READ');
  return {repository:repo,source_sha:sourceSha,observer_run_id:observerRun,observer_run_attempt:observerAttempt,observed_at:new Date().toISOString(),runs,artifacts_by_run:artifactsByRun,archives_by_id:archivesById,related_by_id:relatedById};
}

function fakeRun(id,spec,sha,{status='completed',conclusion='success',event=spec.events[0],minute=id}={}){return {id,run_attempt:1,repository:{full_name:REPOSITORY},path:spec.path,head_branch:'main',head_sha:sha,event,status,conclusion,created_at:`2026-09-04T00:${String(minute%60).padStart(2,'0')}:00Z`};}
function fakeArtifact(id,run,name){return {id,name,expired:false,digest:`sha256:${String(id).padStart(64,'0').slice(-64)}`,expires_at:'2026-12-01T00:00:00Z',workflow_run:{id:run.id,head_sha:run.head_sha}};}

function selfTest(){
  const sha='a'.repeat(40),observed='2026-09-04T01:00:00Z';
  const input={repository:REPOSITORY,source_sha:sha,observed_at:observed,observer_run_id:900,observer_run_attempt:1,runs:{},artifacts_by_run:{}};
  for(const spec of SPECS){const run=fakeRun(10+SPECS.indexOf(spec),spec,sha);input.runs[spec.id]=[run];const name=spec.artifactForRun?spec.artifactForRun(run):spec.artifacts[0];input.artifacts_by_run[run.id]=[fakeArtifact(100+SPECS.indexOf(spec),run,name)];}
  const metadataOnly=evaluateHealth(input);if(metadataOnly.state!=='VERIFIED_HOLD'||metadataOnly.producers.length!==4||metadataOnly.whole_platform_authority!==false||metadataOnly.producers.some((p)=>p.artifact_transport_verified!==true||p.artifact_content_validated!==false))fail('SELF_METADATA_ONLY_MUST_HOLD');
  const red=structuredClone(input);red.runs.SHADOW.push(fakeRun(99,SPECS[0],sha,{conclusion:'failure',minute:59}));if(evaluateHealth(red).state!=='VERIFIED_FAIL')fail('SELF_LATEST_RED');
  const pending=structuredClone(input);pending.runs.REQUIREMENT.push(fakeRun(98,SPECS[1],sha,{status:'in_progress',conclusion:null,minute:58}));if(evaluateHealth(pending).state!=='VERIFIED_HOLD')fail('SELF_PENDING');
  const missing=structuredClone(input);missing.artifacts_by_run[missing.runs.CANONICAL_TRUTH[0].id]=[];if(evaluateHealth(missing).state!=='VERIFIED_FAIL')fail('SELF_MISSING_ARTIFACT');
  const waiting=structuredClone(input);const rr=waiting.runs.RESERVE[0];waiting.artifacts_by_run[rr.id]=[fakeArtifact(333,rr,SPECS[2].waitingArtifact)];if(evaluateHealth(waiting).state!=='VERIFIED_HOLD')fail('SELF_WAITING');
  const supersede=structuredClone(input);const spec=SPECS[0];const old=fakeRun(1,spec,sha,{conclusion:'failure',minute:1});const newer=fakeRun(2,spec,sha,{conclusion:'success',minute:2});supersede.runs.SHADOW=[old,newer];supersede.artifacts_by_run[newer.id]=[fakeArtifact(444,newer,spec.artifacts[0])];const result=evaluateHealth(supersede);const shadow=result.producers.find((p)=>p.id==='SHADOW');if(result.state!=='VERIFIED_HOLD'||shadow.failure_class!=='SHADOW_ARTIFACT_CONTENT_NOT_VALIDATED'||shadow.superseded_red_run_ids.length!==0)fail('SELF_METADATA_SUPERSESSION_MUST_HOLD');
  console.log(JSON.stringify({suite:'KPMO_CONTINUOUS_ASSURANCE_SENTINEL_HEALTH_V1',state:'VERIFIED_PASS',metadata_only_semantic_pass:false,metadata_only_state:'VERIFIED_HOLD',positive:0,negative:6,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM'}));
}

function outputPath(){const index=process.argv.indexOf('--output');return index>=0?process.argv[index+1]:'';}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const out=outputPath();if(!out)fail('OUTPUT_REQUIRED');
  try{const result=evaluateHealth(await liveInput());fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,`${JSON.stringify(result,null,2)}\n`);console.log(JSON.stringify({state:result.state,failed:result.failed_producers,waiting:result.waiting_producers}));if(result.state!=='VERIFIED_PASS')process.exitCode=1;}
  catch(error){const base={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',state:'VERIFIED_FAIL',coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',repository:process.env.GITHUB_REPOSITORY||null,observer_run_id:process.env.GITHUB_RUN_ID||null,observer_run_attempt:process.env.GITHUB_RUN_ATTEMPT||null,semantic_content_verified:false,runtime_health_proven:false,source_sha:process.env.GITHUB_SHA||null,observed_at:new Date().toISOString(),failure_class:String(error?.message||error),whole_platform_authority:false,promotion_eligible:false,empirical_delta:0,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD'};const receipt=sealReceipt(base);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,`${JSON.stringify(receipt,null,2)}\n`);}console.error(error);process.exitCode=1;}
}

if(import.meta.url===`file://${process.argv[1]}`)await main();
export {SPECS};
