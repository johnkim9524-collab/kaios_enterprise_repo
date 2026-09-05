#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SHA=/^[0-9a-f]{40}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const TERMINAL=new Set(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale']);
const SPECS=[
  {id:'SHADOW',workflow:'kidults-asi-shadow-operating-evidence-v1.yml',path:'.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml',events:['schedule','push'],artifacts:['kidults-asi-shadow-operating-evidence-v1']},
  {id:'REQUIREMENT',workflow:'kidults-asi-requirement-adapter-coverage-v1.yml',path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',events:['workflow_run'],artifacts:['kidults-asi-requirement-adapter-coverage-v1']},
  {id:'RESERVE',workflow:'kidults-asi-sharded-source-reserve-v1.yml',path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',events:['workflow_run','schedule','workflow_dispatch'],artifacts:['kidults-asi-sharded-source-reserve-v1','kidults-asi-sharded-source-reserve-waiting-v1'],waitingArtifact:'kidults-asi-sharded-source-reserve-waiting-v1'},
  {id:'CANONICAL_TRUTH',workflow:'kpmo-live-canonical-issue-truth-v1.yml',path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',events:['push','workflow_dispatch'],artifactForRun:(run)=>`kpmo-live-canonical-issue-truth-v1-${run.id}`},
];

const stable=(value)=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const sha256=(value)=>`sha256:${crypto.createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex')}`;
const fail=(code)=>{throw new Error(code);};

function exactArtifact(spec,run,artifacts,observedAt){
  const expected=spec.artifactForRun?[spec.artifactForRun(run)]:spec.artifacts;
  const rows=(artifacts||[]).filter((a)=>expected.includes(a?.name));
  if(rows.length!==1)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_CARDINALITY_${rows.length}`};
  const a=rows[0];
  if(a.expired!==false)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_EXPIRED_OR_INVALID`};
  if(Number(a?.workflow_run?.id)!==Number(run.id)||a?.workflow_run?.head_sha!==run.head_sha)return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_RUN_BINDING`};
  if(!DIGEST.test(a.digest||''))return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_DIGEST`};
  if(!Number.isFinite(Date.parse(a.expires_at||''))||Date.parse(a.expires_at)<=Date.parse(observedAt))return {state:'VERIFIED_FAIL',failure_class:`${spec.id}_ARTIFACT_EXPIRY`};
  const waiting=spec.waitingArtifact&&a.name===spec.waitingArtifact;
  if(waiting)return {state:'VERIFIED_HOLD',failure_class:`${spec.id}_WAITING_ARTIFACT`,artifact_transport_verified:true,artifact_content_validated:false,artifact_id:Number(a.id),artifact_name:a.name,artifact_digest:a.digest,artifact_expires_at:a.expires_at};
  // GitHub artifact-index metadata proves transport existence only. It cannot
  // prove the producer's internal terminal receipt state or authority ceiling.
  // Until a producer-specific payload validator supplies content-bound proof,
  // metadata-only evidence must remain HOLD and can never become semantic PASS.
  return {state:'VERIFIED_HOLD',failure_class:`${spec.id}_ARTIFACT_CONTENT_NOT_VALIDATED`,artifact_transport_verified:true,artifact_content_validated:false,artifact_id:Number(a.id),artifact_name:a.name,artifact_digest:a.digest,artifact_expires_at:a.expires_at};
}

export function evaluateProducer(spec,runs,artifactsByRun,sourceSha,observedAt){
  if(!SHA.test(sourceSha))fail('SOURCE_SHA_INVALID');
  const candidates=(runs||[]).filter((run)=>run?.path===spec.path&&run?.head_branch==='main'&&run?.head_sha===sourceSha&&spec.events.includes(run?.event)).sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0)||Number(a.id)-Number(b.id));
  if(!candidates.length)return {id:spec.id,state:'VERIFIED_HOLD',failure_class:'NO_APPLICABLE_EXACT_SHA_GENERATION',selected_run_id:null,superseded_red_run_ids:[]};
  const latest=candidates.at(-1);
  const olderReds=candidates.slice(0,-1).filter((run)=>run.status==='completed'&&TERMINAL.has(run.conclusion)&&run.conclusion!=='success').map((run)=>Number(run.id));
  if(latest.status!=='completed')return {id:spec.id,state:'VERIFIED_HOLD',failure_class:'NEWER_APPLICABLE_GENERATION_NONTERMINAL',selected_run_id:Number(latest.id),selected_run_status:latest.status,superseded_red_run_ids:[]};
  if(!TERMINAL.has(latest.conclusion))return {id:spec.id,state:'VERIFIED_FAIL',failure_class:`TERMINAL_CONCLUSION_UNKNOWN_${latest.conclusion||'NULL'}`,selected_run_id:Number(latest.id),superseded_red_run_ids:[]};
  if(latest.conclusion!=='success')return {id:spec.id,state:'VERIFIED_FAIL',failure_class:`LATEST_APPLICABLE_${String(latest.conclusion).toUpperCase()}`,selected_run_id:Number(latest.id),selected_run_attempt:Number(latest.run_attempt||1),selected_event:latest.event,superseded_red_run_ids:[]};
  const artifact=exactArtifact(spec,latest,artifactsByRun?.[latest.id]||[],observedAt);
  return {id:spec.id,...artifact,selected_run_id:Number(latest.id),selected_run_attempt:Number(latest.run_attempt||1),selected_event:latest.event,selected_created_at:latest.created_at,superseded_red_run_ids:artifact.state==='VERIFIED_PASS'?olderReds:[]};
}

export function evaluateHealth(input){
  const observedAt=input.observed_at;
  if(!Number.isFinite(Date.parse(observedAt||'')))fail('OBSERVED_AT_INVALID');
  if(!SHA.test(input.source_sha||''))fail('SOURCE_SHA_INVALID');
  const producers=SPECS.map((spec)=>evaluateProducer(spec,input.runs?.[spec.id]||[],input.artifacts_by_run||{},input.source_sha,observedAt));
  const failures=producers.filter((p)=>p.state==='VERIFIED_FAIL');
  const holds=producers.filter((p)=>p.state==='VERIFIED_HOLD');
  const state=failures.length?'VERIFIED_FAIL':holds.length?'VERIFIED_HOLD':'VERIFIED_PASS';
  const base={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',state,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',repository:input.repository,source_sha:input.source_sha,observed_at:observedAt,producers,failed_producers:failures.map((p)=>p.id),waiting_producers:holds.map((p)=>p.id),whole_platform_authority:false,promotion_eligible:false,empirical_delta:0,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD'};
  return {...base,receipt_digest:sha256(base)};
}

async function api(url,token){
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  if(!response.ok)throw new Error(`GITHUB_HTTP_${response.status}:${url}:${text.slice(0,160)}`);
  return text?JSON.parse(text):null;
}

async function workflowRuns(repo,spec,sha,token){
  const out=[];
  for(let page=1;page<=10;page+=1){
    const url=`https://api.github.com/repos/${repo}/actions/workflows/${spec.workflow}/runs?branch=main&head_sha=${sha}&per_page=100&page=${page}`;
    const value=await api(url,token);
    if(!Array.isArray(value?.workflow_runs))throw new Error(`${spec.id}_RUN_INDEX_INVALID`);
    out.push(...value.workflow_runs);
    if(value.workflow_runs.length<100)return out;
  }
  throw new Error(`${spec.id}_RUN_INDEX_PAGINATION_BOUND`);
}

async function liveInput(){
  const repo=process.env.GITHUB_REPOSITORY||'';
  const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)||!token)fail('REPOSITORY_OR_TOKEN_MISSING');
  if(!['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME||''))fail('SENTINEL_EVENT_NOT_ALLOWED');
  if(process.env.GITHUB_REF!=='refs/heads/main')fail('SENTINEL_MAIN_REF_REQUIRED');
  const main=await api(`https://api.github.com/repos/${repo}/branches/main`,token);
  const sourceSha=main?.commit?.sha||'';
  if(!SHA.test(sourceSha)||process.env.GITHUB_SHA!==sourceSha)fail('SENTINEL_EXACT_LIVE_MAIN_MISMATCH');
  const runs={};
  const artifactsByRun={};
  for(const spec of SPECS){
    runs[spec.id]=await workflowRuns(repo,spec,sourceSha,token);
    for(const run of runs[spec.id]){
      if(run.status!=='completed'||run.conclusion!=='success')continue;
      const value=await api(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,token);
      if(!Array.isArray(value?.artifacts))throw new Error(`${spec.id}_ARTIFACT_INDEX_INVALID`);
      if(Number(value.total_count)!==value.artifacts.length)throw new Error(`${spec.id}_ARTIFACT_INDEX_TRUNCATED`);
      artifactsByRun[run.id]=value.artifacts;
    }
  }
  return {repository:repo,source_sha:sourceSha,observed_at:new Date().toISOString(),runs,artifacts_by_run:artifactsByRun};
}

function fakeRun(id,spec,sha,{status='completed',conclusion='success',event=spec.events[0],minute=id}={}){return {id,run_attempt:1,path:spec.path,head_branch:'main',head_sha:sha,event,status,conclusion,created_at:`2026-09-04T00:${String(minute%60).padStart(2,'0')}:00Z`};}
function fakeArtifact(id,run,name){return {id,name,expired:false,digest:`sha256:${String(id).padStart(64,'0').slice(-64)}`,expires_at:'2026-12-01T00:00:00Z',workflow_run:{id:run.id,head_sha:run.head_sha}};}

function selfTest(){
  const sha='a'.repeat(40),observed='2026-09-04T01:00:00Z';
  const input={repository:'o/r',source_sha:sha,observed_at:observed,runs:{},artifacts_by_run:{}};
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
  catch(error){const base={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',state:'VERIFIED_FAIL',coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',repository:process.env.GITHUB_REPOSITORY||null,source_sha:process.env.GITHUB_SHA||null,observed_at:new Date().toISOString(),failure_class:String(error?.message||error),whole_platform_authority:false,promotion_eligible:false,empirical_delta:0,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD'};const receipt={...base,receipt_digest:sha256(base)};if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,`${JSON.stringify(receipt,null,2)}\n`);}console.error(error);process.exitCode=1;}
}

if(import.meta.url===`file://${process.argv[1]}`)await main();
export {SPECS};
