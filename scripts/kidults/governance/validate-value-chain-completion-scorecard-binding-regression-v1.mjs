import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const VALIDATOR='scripts/kidults/governance/validate-value-chain-completion-scorecard-v1.mjs';
const SCORECARD='coordination/kidults/kpmo/value-chain-completion-scorecard-v1.json';
const scorecard=JSON.parse(fs.readFileSync(SCORECARD,'utf8'));
const sourceSha=scorecard.protected_main_truth_at_update;
const differentSha=sourceSha==='1111111111111111111111111111111111111111'
  ? '2222222222222222222222222222222222222222'
  : '1111111111111111111111111111111111111111';
const failures=[];

function run(extraEnv={}){
  const env={...process.env};
  for(const key of ['GITHUB_EVENT_PATH','GITHUB_REF','GITHUB_SHA','KIDULTS_EXPECTED_PROTECTED_MAIN_SHA','KIDULTS_SCORECARD_RECEIPT_PATH']) delete env[key];
  Object.assign(env,extraEnv);
  return spawnSync(process.execPath,[VALIDATOR],{cwd:process.cwd(),env,encoding:'utf8'});
}

function expect(condition,message){if(!condition) failures.push(message)}

const exactSource=run({KIDULTS_EXPECTED_PROTECTED_MAIN_SHA:sourceSha});
expect(exactSource.status===0,'EXACT_SOURCE_PROTECTED_MAIN_REJECTED');

const staleSource=run({KIDULTS_EXPECTED_PROTECTED_MAIN_SHA:differentSha});
expect(staleSource.status!==0 && staleSource.stderr.includes('Stale source protected-main scorecard binding'),'STALE_SOURCE_PROTECTED_MAIN_ACCEPTED');

const mainRuntime=run({GITHUB_REF:'refs/heads/main',GITHUB_SHA:differentSha});
expect(mainRuntime.status===0,'NON_SELF_REFERENTIAL_MAIN_RUNTIME_REJECTED');
if(mainRuntime.status===0){
  try{
    const receipt=JSON.parse(mainRuntime.stdout);
    expect(receipt.state==='VERIFIED_PASS','MAIN_RUNTIME_RECEIPT_NOT_PASS');
    expect(receipt.observed_repository_sha===differentSha,'MAIN_RUNTIME_SHA_NOT_BOUND');
    expect(receipt.scorecard_source_protected_main_sha===sourceSha,'SOURCE_PROVENANCE_NOT_PRESERVED');
    expect(receipt.observed_repository_sha!==receipt.scorecard_source_protected_main_sha,'STATIC_SELF_SHA_SEMANTICS_REINTRODUCED');
    expect(/^sha256:[0-9a-f]{64}$/.test(receipt.scorecard_sha256||''),'SCORECARD_BLOB_DIGEST_MISSING');
    expect(receipt.promotion_eligible===false,'RUNTIME_RECEIPT_PROMOTION_OVERCLAIM');
  }catch{failures.push('MAIN_RUNTIME_RECEIPT_NOT_JSON')}
}

const combined=run({
  KIDULTS_EXPECTED_PROTECTED_MAIN_SHA:sourceSha,
  GITHUB_REF:'refs/heads/main',
  GITHUB_SHA:differentSha
});
expect(combined.status===0,'SOURCE_PLUS_RUNTIME_DUAL_BINDING_REJECTED');

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'kidults-scorecard-binding-'));
try{
  const failureReceiptPath=path.join(tempDir,'failure-receipt.json');
  const malformed=run({
    GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:'not-a-sha',
    KIDULTS_SCORECARD_RECEIPT_PATH:failureReceiptPath
  });
  expect(malformed.status!==0,'MALFORMED_MAIN_RUNTIME_SHA_ACCEPTED');
  expect(fs.existsSync(failureReceiptPath),'FAILURE_RECEIPT_NOT_PRESERVED');
  if(fs.existsSync(failureReceiptPath)){
    const failureReceipt=JSON.parse(fs.readFileSync(failureReceiptPath,'utf8'));
    expect(failureReceipt.state==='VERIFIED_FAIL','FAILURE_RECEIPT_STATE_NOT_FAIL');
    expect(failureReceipt.promotion_eligible===false,'FAILURE_RECEIPT_PROMOTION_OVERCLAIM');
    expect(Array.isArray(failureReceipt.errors) && failureReceipt.errors.length>0,'FAILURE_RECEIPT_CAUSE_MISSING');
  }
}finally{
  fs.rmSync(tempDir,{recursive:true,force:true});
}

if(failures.length){
  console.error(JSON.stringify({state:'VERIFIED_FAIL',failures},null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  id:'kidults-value-chain-scorecard-binding-regression-v1',
  state:'VERIFIED_PASS',
  cases:5,
  source_protected_main_sha:sourceSha,
  non_self_referential_runtime_sha:differentSha,
  terminal_failure_receipt_preserved:true,
  empirical_gate_effect:'NONE',
  promotion_eligible:false,
  production:'HOLD',
  public_release:'HOLD',
  g5:'HOLD'
},null,2));
