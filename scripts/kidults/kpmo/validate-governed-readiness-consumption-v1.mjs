#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/;
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
export function validateReadinessConsumption(receipt,{repository,runId,runAttempt,prNumber,headSha,now=Date.now(),maximumAgeSeconds=900}){
  if(receipt?.id!=='kidults-governed-landing-readiness-receipt-v1'||receipt.version!=='1.0.0')fail('READINESS_RECEIPT_ID_VERSION_INVALID');
  if(receipt.state!=='READY_PENDING_ATOMIC_LANDING')fail(`READINESS_RECEIPT_NOT_CONSUMABLE:${receipt.state||'missing'}`);
  if(receipt.repository!==repository||String(receipt.workflow_run_id)!==String(runId)||Number(receipt.workflow_run_attempt)!==Number(runAttempt))fail('READINESS_RECEIPT_RUN_BINDING_MISMATCH');
  if(Number(receipt.pull_request)!==Number(prNumber)||receipt.exact_head_sha!==headSha||!SHA.test(headSha||''))fail('READINESS_RECEIPT_EXACT_HEAD_MISMATCH');
  if(receipt.ordinary_readiness_published_success!==false||receipt.atomic_landing_required!==true||receipt.final_live_reread!==true)fail('READINESS_RECEIPT_AUTHORITY_BOUNDARY_INVALID');
  if(receipt.production!=='HOLD'||receipt.public_release!=='HOLD'||receipt.g5!=='HOLD')fail('READINESS_RECEIPT_HOLD_BOUNDARY_INVALID');
  const evaluated=Date.parse(receipt.evaluated_at);if(!Number.isFinite(evaluated)||evaluated>now)fail('READINESS_RECEIPT_TIME_INVALID');
  const age=Math.floor((now-evaluated)/1000);
  if(!Number.isInteger(maximumAgeSeconds)||maximumAgeSeconds<60||age>maximumAgeSeconds)fail('READINESS_CONSUMPTION_TIMEOUT_RECONVERGENCE_REQUIRED');
  return {state:'READINESS_EXACT_HEAD_CONSUMED_FOR_AUTONOMOUS_DISPATCH',pull_request:Number(prNumber),exact_head_sha:headSha,age_seconds:age,failure_code:null,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const receipt=JSON.parse(fs.readFileSync(process.argv[2]||'', 'utf8'));
  console.log(JSON.stringify(validateReadinessConsumption(receipt,{repository:process.env.GITHUB_REPOSITORY,runId:process.env.READINESS_RUN_ID,runAttempt:process.env.READINESS_RUN_ATTEMPT,prNumber:process.env.READINESS_PR_NUMBER,headSha:process.env.READINESS_HEAD_SHA,maximumAgeSeconds:Number(process.env.READINESS_MAXIMUM_AGE_SECONDS||900)})));
}
