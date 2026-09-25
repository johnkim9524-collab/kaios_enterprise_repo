#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const SHA=/^[0-9a-f]{40}$/;
const ROOTS=[
  {id:'SHADOW',workflow:'kidults-asi-shadow-operating-evidence-v1.yml',path:'.github/workflows/kidults-asi-shadow-operating-evidence-v1.yml'},
  {id:'REQUIREMENT',workflow:'kidults-asi-requirement-adapter-coverage-v1.yml',path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml'},
  {id:'RESERVE',workflow:'kidults-asi-sharded-source-reserve-v1.yml',path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml'},
];
const ROOT_BY_PRODUCER=new Map(ROOTS.map((root)=>[root.id,root]));
const ACTIVE=new Set(['queued','in_progress','waiting','pending','requested']);
const TERMINAL=new Set(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale']);
const TRANSIENT_FAILURES=new Set(['CANONICAL_CONVERGENCE_TIMEOUT']);
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const fail=(code)=>{throw new Error(code);};

function positiveInteger(value){return Number.isSafeInteger(value)&&value>0;}
function numberFromEnv(name,fallback,{min,max}){
  const raw=process.env[name];
  const value=raw===undefined?fallback:Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)fail(`${name}_INVALID`);
  return value;
}

export function selectRootGeneration(runs,root,sourceSha){
  if(!Array.isArray(runs)||runs.length>100)fail('ROOT_RUN_INDEX_INVALID');
  const candidates=runs.filter((run)=>run?.repository?.full_name===REPOSITORY&&run?.path===root.path&&
    run?.head_branch==='main'&&run?.head_sha===sourceSha&&run?.event==='workflow_dispatch');
  for(const run of candidates){
    if(!positiveInteger(run.id)||!positiveInteger(run.run_attempt)||typeof run.created_at!=='string'||
      !Number.isFinite(Date.parse(run.created_at)))fail('ROOT_RUN_IDENTITY_INVALID');
    if(run.status==='completed'){
      if(!TERMINAL.has(run.conclusion))fail('ROOT_RUN_TERMINAL_INVALID');
    }else if(!ACTIVE.has(run.status)||run.conclusion!==null)fail('ROOT_RUN_LIFECYCLE_INVALID');
  }
  return candidates.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id-b.id).at(-1)??null;
}

export function classifyHealthReceipt(receipt,sourceSha){
  if(receipt?.receipt_id!=='kpmo-continuous-assurance-sentinel-health-v1'||receipt?.source_sha!==sourceSha||
    receipt?.public!=='HOLD'||receipt?.production!=='HOLD'||receipt?.g5!=='HOLD'||
    receipt?.promotion_eligible!==false)fail('HEALTH_RECEIPT_BOUNDARY_INVALID');
  if(receipt.state==='VERIFIED_PASS')return {state:'PASS',failed:[],waiting:[]};
  if(receipt.state==='VERIFIED_HOLD')return {state:'WAIT',failed:[],waiting:receipt.waiting_producers??[]};
  if(receipt.state==='VERIFIED_FAIL'&&TRANSIENT_FAILURES.has(receipt.failure_class))return {state:'WAIT',failed:[],waiting:['CANONICAL_TRUTH']};
  if(receipt.state==='VERIFIED_FAIL')return {state:'FAIL',failed:receipt.failed_producers??[],waiting:receipt.waiting_producers??[]};
  fail('HEALTH_RECEIPT_STATE_INVALID');
}

async function githubApi(route,token,{method='GET',body}={}){
  const url=new URL(`https://api.github.com/repos/${REPOSITORY}/${route}`);
  const response=await fetch(url,{method,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20_000)});
  if(method==='POST'&&response.status===204)return null;
  if(!response.ok)fail(`GITHUB_${method}_${response.status}`);
  return response.json();
}

async function rootRuns(root,token){
  const payload=await githubApi(`actions/workflows/${root.workflow}/runs?branch=main&per_page=100`,token);
  if(!Array.isArray(payload?.workflow_runs))fail('ROOT_RUN_INDEX_RESPONSE_INVALID');
  return payload.workflow_runs;
}

async function dispatchRoot(root,token){
  await githubApi(`actions/workflows/${root.workflow}/dispatches`,token,{method:'POST',body:{ref:'main'}});
}

export async function ensureRoot(root,{sourceSha,token,force=false,maxDispatches=2,apiRuns=rootRuns,dispatch=dispatchRoot}={}){
  const runs=await apiRuns(root,token);
  const exact=runs.filter((run)=>run?.head_sha===sourceSha&&run?.event==='workflow_dispatch'&&run?.path===root.path);
  const latest=selectRootGeneration(runs,root,sourceSha);
  const successfulOrActive=latest&&(latest.status!=='completed'||latest.conclusion==='success');
  if(successfulOrActive&&!force)return {action:'SKIPPED_EXISTING',run_id:latest.id};
  if(exact.length>=maxDispatches)fail(`${root.id}_ROOT_RETRY_EXHAUSTED`);
  await dispatch(root,token);
  return {action:force?'DISPATCHED_RECOVERY':'DISPATCHED',run_id:null};
}

function runHealthResolver(outputPath,sourceSha,token){
  const here=path.dirname(fileURLToPath(import.meta.url));
  const resolver=path.join(here,'resolve-continuous-assurance-sentinel-health-v1.mjs');
  fs.rmSync(outputPath,{force:true});
  const child=spawnSync(process.execPath,[resolver,'--output',outputPath],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180_000,env:{...process.env,GITHUB_SHA:sourceSha,GH_TOKEN:token}});
  if(child.error&&!fs.existsSync(outputPath))fail('HEALTH_RESOLVER_EXECUTION_FAILED');
  if(!fs.existsSync(outputPath))fail('HEALTH_RECEIPT_MISSING');
  try{return JSON.parse(fs.readFileSync(outputPath,'utf8'));}catch{fail('HEALTH_RECEIPT_JSON_INVALID');}
}

function writeReceipt(output,base){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,`${JSON.stringify(base,null,2)}\n`);
}

export async function converge({repository,sourceSha,token,output,healthOutput,maxWaitMs,pollMs}){
  if(repository!==REPOSITORY)fail('REPOSITORY_INVALID');
  if(!SHA.test(sourceSha||''))fail('SOURCE_SHA_INVALID');
  if(!token)fail('GH_TOKEN_REQUIRED');
  const branch=await githubApi('branches/main',token);
  if(branch?.commit?.sha!==sourceSha)fail('MAIN_SHA_MOVED_BEFORE_CONVERGENCE');
  const roots=[];
  for(const root of ROOTS)roots.push({id:root.id,...await ensureRoot(root,{sourceSha,token})});
  const recovery=new Set();
  const observations=[];
  const started=Date.now();
  for(;;){
    const current=await githubApi('branches/main',token);
    if(current?.commit?.sha!==sourceSha)fail('MAIN_SHA_MOVED_DURING_CONVERGENCE');
    const health=runHealthResolver(healthOutput,sourceSha,token);
    const classification=classifyHealthReceipt(health,sourceSha);
    observations.push({at:new Date().toISOString(),state:health.state,failed:classification.failed,waiting:classification.waiting});
    if(classification.state==='PASS'){
      const receipt={receipt_id:'kpmo-exact-sha-producer-auto-convergence-v1',version:'1.0.0',state:'VERIFIED_PASS',repository,source_sha:sourceSha,roots,recovery_dispatches:[...recovery],observation_count:observations.length,last_observation:observations.at(-1),producer_health_receipt_digest:health.receipt_digest,promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD'};
      writeReceipt(output,receipt);return receipt;
    }
    if(classification.state==='FAIL'){
      let recovered=false;
      for(const producer of classification.failed){
        const root=ROOT_BY_PRODUCER.get(producer);
        if(!root||recovery.has(root.id))continue;
        await ensureRoot(root,{sourceSha,token,force:true});
        recovery.add(root.id);recovered=true;
      }
      if(!recovered)fail(`PRODUCER_HEALTH_FAILED_${classification.failed.join('_')||'UNKNOWN'}`);
    }
    if(Date.now()-started>=maxWaitMs)fail('PRODUCER_CONVERGENCE_TIMEOUT');
    await sleep(pollMs);
  }
}

async function main(){
  const output=process.argv[2]||path.join(process.env.RUNNER_TEMP||'/tmp','kpmo-exact-sha-producer-auto-convergence-v1.json');
  const healthOutput=process.argv[3]||path.join(process.env.RUNNER_TEMP||'/tmp','kpmo-continuous-assurance-sentinel-health-v1.json');
  const base={receipt_id:'kpmo-exact-sha-producer-auto-convergence-v1',version:'1.0.0',state:'VERIFIED_FAIL',repository:process.env.GITHUB_REPOSITORY||null,source_sha:process.env.GITHUB_SHA||null,promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD'};
  try{
    await converge({repository:process.env.GITHUB_REPOSITORY,sourceSha:process.env.GITHUB_SHA,token:process.env.GH_TOKEN,output,healthOutput,maxWaitMs:numberFromEnv('KPMO_CONVERGENCE_MAX_WAIT_MS',2_700_000,{min:60_000,max:3_000_000}),pollMs:numberFromEnv('KPMO_CONVERGENCE_POLL_MS',15_000,{min:1_000,max:60_000})});
  }catch(error){writeReceipt(output,{...base,failure_class:String(error?.message||error)});throw error;}
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch((error)=>{console.error(error);process.exitCode=1;});

export {ROOTS, REPOSITORY};
