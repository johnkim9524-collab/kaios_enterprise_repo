import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/kidults/kpmo/run-durable-canonical-ledger-canary-v1.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/kidults-autonomous-object-lock-canary-v1.yml','utf8');

test('canonical canary uses existing FINALIZER OIDC boundary and is explicit-only',()=>{
  assert.match(workflow,/durable_canonical_claim_canary:/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.durable_canonical_claim_canary/);
  assert.match(workflow,/KIDULTS_AUTONOMOUS_ENVIRONMENT: KIDULTS-AUTONOMOUS-FINALIZER/);
  assert.match(workflow,/run-durable-canonical-ledger-canary-v1\.mjs/);
  assert.match(workflow,/kidults-durable-canonical-ledger-canary-\$\{\{ github\.run_id \}\}/);
});

test('canonical canary proves duplicate and forged alias rejection before PASS',()=>{
  assert.match(script,/CREATE_CANONICAL_CLAIM/);
  assert.match(script,/COMMIT_CANONICAL_CLAIM/);
  assert.match(script,/CREATE_CANONICAL_ALIAS/);
  assert.match(script,/expectFailure/);
  assert.match(script,/receipt\.duplicate_claim_rejected=true/);
  assert.match(script,/receipt\.wrong_alias_rejected=true/);
  assert.match(script,/production:'HOLD',public:'HOLD',g5:'HOLD'/);
});


// This child-process harness verifies failure handling only; fake AWS responses
// are regression fixtures and never provider/runtime proof.
const executable=path.resolve('scripts/kidults/kpmo/run-durable-canonical-ledger-canary-v1.mjs');
const marker='PRIVATE_PROVIDER_ERROR_PAYLOAD';
const fakeAws=String.raw`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
if(args[0]==='kms'){console.log('REGRESSION_SIGNATURE');process.exit(0)}
const config=JSON.parse(process.env.FAKE_CONFIG);
const counter=process.env.FAKE_COUNTER;
const call=fs.existsSync(counter)?Number(fs.readFileSync(counter))+1:1;
fs.writeFileSync(counter,String(call));
const payload=JSON.parse(args[args.indexOf('--payload')+1]);
let meta={StatusCode:200};
let body={ok:true,action:payload.action,pk:'CANONICAL#'+payload.authorization_generation+'#'+payload.canonical_key,
 state:call===1?'LEASED':call===3?'COMMITTED':'DEDUPED_ALIAS'};
if(call===1){body.sk='CLAIM';body.lease_epoch=1}
if(call===3)body.lease_epoch=1;
if(call===2){meta.FunctionError='Unhandled';body={errorType:'ConditionalCheckFailedException',errorMessage:'An error occurred (ConditionalCheckFailedException) when calling the PutItem operation: The conditional request failed'}}
if(call===4){meta.FunctionError='Unhandled';body={errorType:'ValueError',errorMessage:'CANONICAL_ALIAS_BINDING_INVALID'}}
if(config.call===call){
 if(config.transport){process.stderr.write('PRIVATE_PROVIDER_ERROR_PAYLOAD');process.exit(23)}
 if(config.meta)Object.assign(meta,config.meta);
 if(config.removeError)delete meta.FunctionError;
 if(config.body)Object.assign(body,config.body);
}
fs.writeFileSync(args[args.length-1],config.call===call&&config.malformed?'not json':JSON.stringify(body));
console.log(JSON.stringify(meta));
`;
function run(config={},envOverride={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-canary-regression-'));
 try{
  fs.writeFileSync(path.join(dir,'aws'),fakeAws,{mode:0o700});
  const counter=path.join(dir,'counter');
  const child=spawnSync(process.execPath,[executable],{cwd:dir,encoding:'utf8',env:{...process.env,
   PATH:dir+path.delimiter+process.env.PATH,RUNNER_TEMP:dir,GITHUB_RUN_ID:'12345',GITHUB_SHA:'a'.repeat(40),
   KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION:'regression-writer',
   KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN:'private-regression-key',
   KIDULTS_AUTONOMOUS_WORKLOAD_ID:'regression-workload',KIDULTS_AUTONOMOUS_ENVIRONMENT:'REGRESSION_ONLY',
   FAKE_CONFIG:JSON.stringify(config),FAKE_COUNTER:counter,...envOverride}});
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'out/durable-canonical-ledger-canary-v1/receipt.json'),'utf8'));
  assert.deepEqual(JSON.parse(child.stdout),receipt);
  assert.equal(child.stderr,'');
  assert.equal(child.stdout.includes(marker),false);
  assert.equal(child.stdout.includes('private-regression-key'),false);
  assert.equal(child.stdout.includes('REGRESSION_SIGNATURE'),false);
  assert.equal(receipt.business_runtime_proven,false);
  assert.equal(receipt.production,'HOLD');assert.equal(receipt.public,'HOLD');assert.equal(receipt.g5,'HOLD');
  return {receipt,status:child.status,calls:fs.existsSync(counter)?Number(fs.readFileSync(counter)):0};
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('producer-compatible response sequence validates all five control assertions',()=>{
 const {receipt,status,calls}=run();
 assert.equal(status,0);assert.equal(calls,5);assert.equal(receipt.state,'VERIFIED_PASS');
 assert.equal(receipt.leader_state,'LEASED');assert.equal(receipt.committed_state,'COMMITTED');assert.equal(receipt.alias_state,'DEDUPED_ALIAS');
 assert.equal(receipt.duplicate_claim_rejected,true);assert.equal(receipt.wrong_alias_rejected,true);
 assert.equal(receipt.response_evidence.length,5);
 for(const evidence of receipt.response_evidence)assert.match(evidence.response_digest,/^sha256:[a-f0-9]{64}$/);
});
const cases=[
 ['claim wrong state',1,{body:{state:'UNEXPECTED_STATE'}},'CREATE_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['claim wrong key',1,{body:{pk:'wrong'}},'CREATE_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['claim wrong action',1,{body:{action:'COMMIT_CANONICAL_CLAIM'}},'CREATE_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['claim wrong sort key',1,{body:{sk:'ALIAS'}},'CREATE_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['claim wrong epoch',1,{body:{lease_epoch:2}},'CREATE_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['commit wrong state',3,{body:{state:'LEASED'}},'COMMIT_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['commit wrong epoch',3,{body:{lease_epoch:2}},'COMMIT_CLAIM','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['alias wrong state',5,{body:{state:'COMMITTED'}},'CREATE_ALIAS','CANARY_WRITER_RESPONSE_BINDING_INVALID'],
 ['duplicate arbitrary exception',2,{body:{errorType:'RuntimeError',errorMessage:marker}},'DUPLICATE_CLAIM_NEGATIVE','CANARY_EXPECTED_FAILURE_CLASS_MISMATCH'],
 ['duplicate wrong operation',2,{body:{errorMessage:'An error occurred (ConditionalCheckFailedException) when calling the UpdateItem operation: failed'}},'DUPLICATE_CLAIM_NEGATIVE','CANARY_EXPECTED_FAILURE_CLASS_MISMATCH'],
 ['duplicate missing FunctionError',2,{removeError:true},'DUPLICATE_CLAIM_NEGATIVE','CANARY_EXPECTED_FAILURE_MISSING'],
 ['wrong alias arbitrary exception',4,{body:{errorType:'RuntimeError',errorMessage:marker}},'WRONG_ALIAS_NEGATIVE','CANARY_EXPECTED_FAILURE_CLASS_MISMATCH'],
 ['wrong alias near-match message',4,{body:{errorMessage:'CANONICAL_ALIAS_BINDING_INVALID '+marker}},'WRONG_ALIAS_NEGATIVE','CANARY_EXPECTED_FAILURE_CLASS_MISMATCH'],
 ['wrong alias missing FunctionError',4,{removeError:true},'WRONG_ALIAS_NEGATIVE','CANARY_EXPECTED_FAILURE_MISSING'],
 ['positive writer failure',3,{meta:{FunctionError:'Unhandled'},body:{errorMessage:marker}},'COMMIT_CLAIM','CANARY_WRITER_REJECTED'],
 ['invalid invocation status',1,{meta:{StatusCode:202}},'CREATE_CLAIM','CANARY_INVOKE_STATUS_INVALID'],
 ['malformed provider JSON',1,{malformed:true},'CREATE_CLAIM','CANARY_RESPONSE_JSON_INVALID'],
 ['transport provider error sanitized',3,{transport:true},'COMMIT_CLAIM','CANARY_EXECUTION_FAILED'],
];
for(const [name,call,config,stage,code] of cases)test(name+' stops at first failure and preserves sanitized receipt',()=>{
 const result=run({call,...config});
 assert.equal(result.status,1);assert.equal(result.calls,call);assert.equal(result.receipt.state,'VERIFIED_FAIL');
 assert.equal(result.receipt.failed_stage,stage);assert.equal(result.receipt.failure_code,code);
 assert.equal(result.receipt.response_evidence.length,call-1);
 if(call<=2)assert.equal(result.receipt.duplicate_claim_rejected,false);
 if(call<=4)assert.equal(result.receipt.wrong_alias_rejected,false);
});
test('missing execution binding still persists failure receipt without provider calls',()=>{
 const result=run({}, {GITHUB_RUN_ID:''});
 assert.equal(result.status,1);assert.equal(result.calls,0);
 assert.equal(result.receipt.failed_stage,'VALIDATE_EXECUTION_BINDING');assert.equal(result.receipt.failure_code,'CANARY_ENV_REQUIRED');
});
test('invalid execution binding still persists failure receipt without provider calls',()=>{
 const result=run({}, {GITHUB_RUN_ID:'12345/unsafe'});
 assert.equal(result.status,1);assert.equal(result.calls,0);assert.equal(result.receipt.failure_code,'CANARY_EXECUTION_BINDING_INVALID');
});
