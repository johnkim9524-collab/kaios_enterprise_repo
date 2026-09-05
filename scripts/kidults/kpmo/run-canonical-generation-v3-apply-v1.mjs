#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const WRITER='scripts/kidults/kpmo/canonical-generation-v3.mjs';
const receiptPath=process.env.CANONICAL_GENERATION_RECEIPT_PATH||`${process.env.RUNNER_TEMP||'/tmp'}/canonical-generation-v3-receipt.json`;
const RECOVERY_DELAYS_MS=[5000,15000,30000,60000,90000];
const die=(message)=>{throw new Error(message);};
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const sha256=(value)=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

function runCanonical(args){
  const result=spawnSync(process.execPath,[WRITER,...args],{encoding:'utf8',env:process.env});
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  return result;
}

function readReceiptText(){
  if(!fs.existsSync(receiptPath)||fs.statSync(receiptPath).size===0)die('CANONICAL_V3_APPLY_RECEIPT_MISSING');
  return fs.readFileSync(receiptPath,'utf8');
}

function parseJson(text,label){
  try{return JSON.parse(text);}catch{die(`${label}_JSON_INVALID`);}
}

function recoveryEligible(receipt){
  return receipt?.state==='VERIFIED_FAIL'
    && receipt?.mode==='PARTIAL_NONAUTHORITATIVE'
    && receipt?.failure_class==='POST_WRITE_READBACK_INVALID'
    && Number(receipt?.member_comments_written)===25
    && Number(receipt?.writes)===25
    && /^kpmo-canonical-v3-[0-9a-f]{12}-[1-9][0-9]*-1$/.test(String(receipt?.generation_id||''));
}

function validateRecoveredAuthority(receipt,validation){
  if(validation?.state!=='VERIFIED_PASS')die('CANONICAL_V3_RECOVERY_VALIDATION_NOT_PASS');
  if(validation?.authority_model!=='CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT')die('CANONICAL_V3_RECOVERY_AUTHORITY_MODEL_INVALID');
  if(validation?.generation_id!==receipt?.generation_id)die('CANONICAL_V3_RECOVERY_GENERATION_MISMATCH');
  if(Number(validation?.writer_run_id)!==Number(process.env.GITHUB_RUN_ID))die('CANONICAL_V3_RECOVERY_RUN_MISMATCH');
  if(validation?.protected_main_sha!==process.env.TARGET_MAIN_SHA)die('CANONICAL_V3_RECOVERY_MAIN_MISMATCH');
  if(validation?.canonical_issue_count!==25)die('CANONICAL_V3_RECOVERY_MEMBER_COUNT_INVALID');
  if(!Number.isInteger(validation?.aggregate_comment_id)||validation.aggregate_comment_id<1)die('CANONICAL_V3_RECOVERY_AGGREGATE_ID_INVALID');
  if(validation?.promotion_eligible!==false||validation?.production!=='HOLD'||validation?.public!=='HOLD'||validation?.g5!=='HOLD')die('CANONICAL_V3_RECOVERY_BOUNDARY_INVALID');
}

function writeReceipt(receipt){
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true,mode:0o700});
  const tmp=`${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp,`${JSON.stringify(receipt,null,2)}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
  fs.renameSync(tmp,receiptPath);
  fs.chmodSync(receiptPath,0o600);
}

function selfTest(){
  const valid={state:'VERIFIED_FAIL',mode:'PARTIAL_NONAUTHORITATIVE',failure_class:'POST_WRITE_READBACK_INVALID',member_comments_written:25,writes:25,generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-123-1'};
  if(!recoveryEligible(valid))die('SELF_TEST_RECOVERY_ELIGIBLE_REJECTED');
  for(const mutation of [
    {...valid,failure_class:'POST_WRITE_TRUTH_MOVED'},
    {...valid,member_comments_written:24},
    {...valid,writes:26},
    {...valid,generation_id:'kpmo-canonical-v3-aaaaaaaaaaaa-123-2'},
    {...valid,state:'VERIFIED_PASS'}
  ]) if(recoveryEligible(mutation))die('SELF_TEST_RECOVERY_MUTATION_ESCAPED');
  const validation={state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_APPEND_ONLY_COMMIT',generation_id:valid.generation_id,writer_run_id:123,protected_main_sha:'a'.repeat(40),canonical_issue_count:25,aggregate_comment_id:999,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
  const oldRun=process.env.GITHUB_RUN_ID,oldMain=process.env.TARGET_MAIN_SHA;
  process.env.GITHUB_RUN_ID='123';process.env.TARGET_MAIN_SHA='a'.repeat(40);
  validateRecoveredAuthority(valid,validation);
  process.env.GITHUB_RUN_ID=oldRun;process.env.TARGET_MAIN_SHA=oldMain;
  console.log(JSON.stringify({test:'CANONICAL_V3_APPLY_EVENTUAL_READBACK_RECOVERY_V1',state:'VERIFIED_PASS',recovery_only_for_exact_post_write_readback_failure:true,same_generation_required:true,same_first_attempt_run_required:true,exact_main_required:true,member_count_required:25,bounded_retry_count:RECOVERY_DELAYS_MS.length,rerun_required:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'}));
}

if(process.argv.includes('--self-test')){
  selfTest();
  process.exit(0);
}

const first=runCanonical(['--write']);
if(first.status===0)process.exit(0);

const failedText=readReceiptText();
const failedReceipt=parseJson(failedText,'CANONICAL_V3_FAILED_RECEIPT');
if(!recoveryEligible(failedReceipt))process.exit(Number.isInteger(first.status)?first.status:1);

const originalReceiptSha256=sha256(failedText);
for(let index=0;index<RECOVERY_DELAYS_MS.length;index+=1){
  await sleep(RECOVERY_DELAYS_MS[index]);
  const validationRun=runCanonical([]);
  if(validationRun.status!==0)continue;
  const validation=parseJson(String(validationRun.stdout||'').trim(),'CANONICAL_V3_RECOVERY_VALIDATION');
  validateRecoveredAuthority(failedReceipt,validation);
  const recovered={
    ...failedReceipt,
    state:'VERIFIED_PASS',
    mode:'COMMITTED_EVENTUAL_READBACK_RECOVERED',
    writes:26,
    original_reported_writes:failedReceipt.writes,
    aggregate_comment_id:validation.aggregate_comment_id,
    truth_digest:validation.truth_digest||failedReceipt.truth_digest||null,
    recovered_from_failure_class:failedReceipt.failure_class,
    pre_recovery_receipt_sha256:originalReceiptSha256,
    readback_recovery_attempt:index+1,
    readback_recovery_delay_ms:RECOVERY_DELAYS_MS[index],
    readback_recovered_at:new Date().toISOString(),
    independent_validation_authority_model:validation.authority_model,
    recovered_same_generation:true,
    inferred_aggregate_write_from_post_write_failure_path:true
  };
  writeReceipt(recovered);
  console.log(JSON.stringify({state:recovered.state,mode:recovered.mode,generation_id:recovered.generation_id,aggregate_comment_id:recovered.aggregate_comment_id,writes:recovered.writes,readback_recovery_attempt:recovered.readback_recovery_attempt}));
  process.exit(0);
}

console.error('CANONICAL_V3_EVENTUAL_READBACK_RECOVERY_EXHAUSTED');
process.exit(Number.isInteger(first.status)?first.status:1);
