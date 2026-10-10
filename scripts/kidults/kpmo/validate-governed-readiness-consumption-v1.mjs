#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/;
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
export function validateReadinessConsumption(receipt,{repository,runId,runAttempt,prNumber,headSha,baseSha,now=Date.now(),maximumAgeSeconds=900}){
  if(receipt?.id!=='kidults-governed-landing-readiness-receipt-v1'||receipt.version!=='1.0.0')fail('READINESS_RECEIPT_ID_VERSION_INVALID');
  if(!['READY_PENDING_ATOMIC_LANDING','READY_OPERATION_AUTHORITY_PENDING','READY_NON_GOVERNED_SCOPE_VERIFIED','DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE'].includes(receipt.state))fail(`READINESS_RECEIPT_NOT_CONSUMABLE:${receipt.state||'missing'}`);
  if(receipt.repository!==repository||String(receipt.workflow_run_id)!==String(runId)||Number(receipt.workflow_run_attempt)!==Number(runAttempt))fail('READINESS_RECEIPT_RUN_BINDING_MISMATCH');
  if(Number(receipt.pull_request)!==Number(prNumber)||receipt.exact_head_sha!==headSha||!SHA.test(headSha||'')||receipt.exact_base_sha!==baseSha||!SHA.test(baseSha||''))fail('READINESS_RECEIPT_EXACT_BINDING_MISMATCH');
  const draftTransition=receipt.state==='DRAFT_DEVELOPMENT_VALIDATED_NON_PROMOTABLE';
  if(draftTransition){
    if(receipt.promotion_eligible!==false||receipt.landing_authorization_created!==false||receipt.atomic_landing_required!==false||receipt.final_live_reread!==true)fail('READINESS_RECEIPT_DRAFT_AUTHORITY_BOUNDARY_INVALID');
  }else if(receipt.state==='READY_PENDING_ATOMIC_LANDING'){
    if(receipt.ordinary_readiness_published_success!==false||receipt.atomic_landing_required!==true||receipt.final_live_reread!==true
      ||('promotion_eligible' in receipt&&receipt.promotion_eligible!==false)
      ||('landing_authorization_created' in receipt&&receipt.landing_authorization_created!==false))fail('READINESS_RECEIPT_AUTHORITY_BOUNDARY_INVALID');
  }else if(['READY_OPERATION_AUTHORITY_PENDING','READY_NON_GOVERNED_SCOPE_VERIFIED'].includes(receipt.state)){
    if(receipt.status_context!=='KIDULTS Landing Readiness V1'||receipt.ordinary_readiness_published_success!==true
      ||receipt.promotion_eligible!==false||receipt.landing_authorization_created!==false||receipt.final_live_reread!==true
      ||receipt.atomic_landing_required!==(receipt.state==='READY_OPERATION_AUTHORITY_PENDING'))fail('READINESS_RECEIPT_ISOLATED_AUTHORITY_BOUNDARY_INVALID');
  }else fail(`READINESS_RECEIPT_NOT_CONSUMABLE:${receipt.state||'missing'}`);
  if(receipt.production!=='HOLD'||receipt.public_release!=='HOLD'||receipt.g5!=='HOLD')fail('READINESS_RECEIPT_HOLD_BOUNDARY_INVALID');
  const evaluated=Date.parse(receipt.evaluated_at);if(!Number.isFinite(evaluated)||evaluated>now)fail('READINESS_RECEIPT_TIME_INVALID');
  const age=Math.floor((now-evaluated)/1000);
  if(!Number.isInteger(maximumAgeSeconds)||maximumAgeSeconds<60||age>maximumAgeSeconds)fail('READINESS_CONSUMPTION_TIMEOUT_RECONVERGENCE_REQUIRED');
  const result={state:'READINESS_EXACT_HEAD_CONSUMED_FOR_AUTONOMOUS_DISPATCH',pull_request:Number(prNumber),exact_base_sha:baseSha,exact_head_sha:headSha,age_seconds:age,failure_code:null,landing_authorization_created:false,promotion_eligible:false,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
  if(draftTransition)result.draft_transition_eligible=true;
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const receipt=JSON.parse(fs.readFileSync(process.argv[2]||'', 'utf8'));
  const result=validateReadinessConsumption(receipt,{repository:process.env.GITHUB_REPOSITORY,runId:process.env.READINESS_RUN_ID,runAttempt:process.env.READINESS_RUN_ATTEMPT,prNumber:process.env.READINESS_PR_NUMBER,headSha:process.env.READINESS_HEAD_SHA,baseSha:process.env.READINESS_BASE_SHA,maximumAgeSeconds:Number(process.env.READINESS_MAXIMUM_AGE_SECONDS||900)});
  console.log(JSON.stringify(result));
  if(result.draft_transition_eligible===true)fs.appendFileSync(process.env.GITHUB_OUTPUT,'draft_transition_eligible=true\n');
}
