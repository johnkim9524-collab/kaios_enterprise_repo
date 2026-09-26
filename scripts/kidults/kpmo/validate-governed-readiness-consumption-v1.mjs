#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/;
const GOVERNED_WORKFLOW='KIDULTS Governed Landing Authorization V1';
const TERMINAL_NONCONSUMABLE_STATES=new Set([
  'CLOSED_TERMINAL_NON_AUTHORIZING',
  'MERGED_POST_LANDING_VERIFICATION_REQUIRED',
]);
const fail=code=>{const error=new Error(code);error.code=code;throw error;};

function parsePullRequests(value){
  if(value==null||value==='') return null;
  let parsed;
  try { parsed=typeof value==='string'?JSON.parse(value):value; } catch { fail('READINESS_WORKFLOW_RUN_PR_BINDING_INVALID'); }
  if(!Array.isArray(parsed)) fail('READINESS_WORKFLOW_RUN_PR_BINDING_INVALID');
  return parsed;
}

export function validateReadinessConsumption(receipt,{repository,runId,runAttempt,prNumber,headSha,now=Date.now(),maximumAgeSeconds=900,workflowName=null,workflowConclusion=null,workflowEvent=null,workflowHeadSha=null,workflowHeadBranch=null,workflowRepository=null,workflowPullRequests=null}){
  if(receipt?.id!=='kidults-governed-landing-readiness-receipt-v1'||receipt.version!=='1.0.0')fail('READINESS_RECEIPT_ID_VERSION_INVALID');
  if(workflowName!=null&&workflowName!==GOVERNED_WORKFLOW)fail('READINESS_WORKFLOW_NAME_MISMATCH');
  if(workflowConclusion!=null&&workflowConclusion!=='success')fail('READINESS_WORKFLOW_NOT_SUCCESS');
  if(workflowEvent!=null&&!['pull_request','pull_request_target'].includes(workflowEvent))fail('READINESS_WORKFLOW_EVENT_INVALID');
  if(workflowHeadBranch!=null&&workflowHeadBranch!=='main')fail('READINESS_WORKFLOW_HEAD_BRANCH_INVALID');
  if(workflowRepository!=null&&workflowRepository!==repository)fail('READINESS_WORKFLOW_REPOSITORY_MISMATCH');
  if(workflowHeadSha!=null&&workflowHeadSha!==receipt.exact_head_sha)fail('READINESS_WORKFLOW_HEAD_MISMATCH');
  const triggerPullRequests=parsePullRequests(workflowPullRequests);
  if(triggerPullRequests){
    const matched=triggerPullRequests.some(pr=>Number(pr?.number)===Number(receipt.pull_request)
      && String(pr?.head?.sha||pr?.head_sha||'')===String(receipt.exact_head_sha||''));
    if(!matched)fail('READINESS_WORKFLOW_RUN_PR_BINDING_MISMATCH');
  }
  if(receipt.repository!==repository||String(receipt.workflow_run_id)!==String(runId)||Number(receipt.workflow_run_attempt)!==Number(runAttempt))fail('READINESS_RECEIPT_RUN_BINDING_MISMATCH');
  if(Number(receipt.pull_request)!==Number(prNumber)||receipt.exact_head_sha!==headSha||!SHA.test(headSha||''))fail('READINESS_RECEIPT_EXACT_HEAD_MISMATCH');
  if(receipt.state==='LIFECYCLE_READY_AUTOMATED'){
    if(receipt.atomic_landing_required!==false||receipt.ready_state_grants_authorization!==false)fail('READINESS_RECEIPT_LIFECYCLE_BOUNDARY_INVALID');
    if(receipt.production!=='HOLD'||receipt.public_release!=='HOLD'||receipt.g5!=='HOLD')fail('READINESS_RECEIPT_HOLD_BOUNDARY_INVALID');
    return {state:'READINESS_LIFECYCLE_ONLY_PENDING_RERUN',receipt_state:receipt.state,dispatch_eligible:false,pull_request:Number(receipt.pull_request),exact_head_sha:receipt.exact_head_sha,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
  }
  if(TERMINAL_NONCONSUMABLE_STATES.has(receipt.state)){
    if(receipt.atomic_landing_required!==false)fail('READINESS_RECEIPT_TERMINAL_BOUNDARY_INVALID');
    if(receipt.production!=='HOLD'||receipt.public_release!=='HOLD'||receipt.g5!=='HOLD')fail('READINESS_RECEIPT_HOLD_BOUNDARY_INVALID');
    return {state:'READINESS_NONCONSUMABLE_TERMINAL',receipt_state:receipt.state,dispatch_eligible:false,pull_request:Number(receipt.pull_request),exact_head_sha:receipt.exact_head_sha,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
  }
  if(receipt.state!=='READY_PENDING_ATOMIC_LANDING')fail(`READINESS_RECEIPT_NOT_CONSUMABLE:${receipt.state||'missing'}`);
  if(receipt.ordinary_readiness_published_success!==false||receipt.atomic_landing_required!==true||receipt.final_live_reread!==true)fail('READINESS_RECEIPT_AUTHORITY_BOUNDARY_INVALID');
  if(receipt.production!=='HOLD'||receipt.public_release!=='HOLD'||receipt.g5!=='HOLD')fail('READINESS_RECEIPT_HOLD_BOUNDARY_INVALID');
  const evaluated=Date.parse(receipt.evaluated_at);if(!Number.isFinite(evaluated)||evaluated>now)fail('READINESS_RECEIPT_TIME_INVALID');
  const age=Math.floor((now-evaluated)/1000);
  if(!Number.isInteger(maximumAgeSeconds)||maximumAgeSeconds<60||age>maximumAgeSeconds)fail('READINESS_CONSUMPTION_TIMEOUT_RECONVERGENCE_REQUIRED');
  return {state:'READINESS_EXACT_HEAD_CONSUMED_FOR_AUTONOMOUS_DISPATCH',dispatch_eligible:true,pull_request:Number(prNumber),exact_head_sha:headSha,age_seconds:age,failure_code:null,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const receipt=JSON.parse(fs.readFileSync(process.argv[2]||'', 'utf8'));
  console.log(JSON.stringify(validateReadinessConsumption(receipt,{repository:process.env.GITHUB_REPOSITORY,runId:process.env.READINESS_RUN_ID,runAttempt:process.env.READINESS_RUN_ATTEMPT,prNumber:process.env.READINESS_PR_NUMBER,headSha:process.env.READINESS_HEAD_SHA,maximumAgeSeconds:Number(process.env.READINESS_MAXIMUM_AGE_SECONDS||900),workflowName:process.env.READINESS_WORKFLOW_NAME,workflowConclusion:process.env.READINESS_WORKFLOW_CONCLUSION,workflowEvent:process.env.READINESS_WORKFLOW_EVENT,workflowHeadSha:process.env.READINESS_WORKFLOW_HEAD_SHA,workflowHeadBranch:process.env.READINESS_WORKFLOW_HEAD_BRANCH,workflowRepository:process.env.READINESS_WORKFLOW_REPOSITORY,workflowPullRequests:process.env.READINESS_WORKFLOW_PULL_REQUESTS})));
}
