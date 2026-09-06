import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {buildAtomicDispatchTerminalReceipt as build} from '../../../scripts/kidults/kpmo/initialize-atomic-dispatch-terminal-receipt-v1.mjs';
const sha='a'.repeat(40);
const good={repository:'johnkim9524-collab/kaios_enterprise_repo',prNumber:'2047',expectedHeadSha:sha,
 authorizationId:'LAND-PR-2047-'+sha.slice(0,12),landingActor:'johnkim9524-collab',landingRunId:'123',landingRunAttempt:'1',
 executionSourceSha:sha,checkoutSha:sha,now:'2026-09-06T11:00:00.000Z'};
for(const field of ['prNumber','landingRunId','landingRunAttempt'])for(const value of ['0','-1','01','1.0','1e3','9007199254740992','',undefined,NaN,Infinity])
 test(`reject invalid ${field}=${String(value)} before identity conversion`,()=>{
  const r=build({...good,[field]:value});assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.merge_committed,false);
  assert.equal(r.raw_authorization_persisted,false);
 });
for(const changes of [{executionSourceSha:undefined},{checkoutSha:undefined},{checkoutSha:'b'.repeat(40)},{executionSourceSha:'bad'}])
 test(`reject unbound execution source ${JSON.stringify(changes)}`,()=>{
  const r=build({...good,...changes});assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.execution_source_bound,false);
 });
test('valid native source context stays fail-closed until later authorization gates',()=>{
 const r=build(good);assert.equal(r.state,'DISPATCH_RECEIVED_FAIL_CLOSED');assert.equal(r.execution_source_sha,sha);
 assert.equal(r.execution_source_bound,true);assert.equal(r.merge_committed,false);
});
test('source-bound invalid authorization leaves durable sanitized receipt in actual CLI',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-source-'));
 try{
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const receipt=path.join(dir,'receipt.json');const secret='MALFORMED_APPROVAL_DO_NOT_PERSIST';
  const p=spawnSync(process.execPath,['scripts/kidults/kpmo/initialize-atomic-dispatch-terminal-receipt-v1.mjs'],{
   encoding:'utf8',timeout:5000,env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',GH_REPOSITORY:good.repository,
    PR_NUMBER:'2047',EXPECTED_HEAD_SHA:sha,LANDING_AUTHORIZATION_ID:secret,LANDING_ACTOR:good.landingActor,
    GITHUB_SHA:head,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',ATOMIC_LANDING_TERMINAL_RECEIPT_PATH:receipt}});
  assert.equal(p.status,1,p.stderr);const text=fs.readFileSync(receipt,'utf8'),r=JSON.parse(text);
  assert.equal(r.failure_code,'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID');assert.equal(r.execution_source_sha,head);
  assert.equal(r.execution_source_bound,true);assert.equal(r.merge_committed,false);
  assert.ok(!text.includes(secret));assert.ok(!p.stdout.includes(secret));assert.equal(fs.statSync(receipt).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

for(const mode of ['source-mismatch','malformed-authorization','tampered'])test(`actual finalizer retains ${mode} rejection without token or remote call`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-preserve-'));
 try{
  const input={...good,authorizationId:mode==='source-mismatch'?good.authorizationId:'bad-authorization',checkoutSha:mode==='source-mismatch'?'b'.repeat(40):sha};
  const receipt=build(input);if(mode==='tampered')receipt.landing_actor='other';
  const file=path.join(dir,'receipt.json'),bytes=JSON.stringify(receipt);fs.writeFileSync(file,bytes,{mode:0o600});
  const p=spawnSync(process.execPath,['scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs','--finalize'],{
   encoding:'utf8',timeout:5000,env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',GH_REPOSITORY:good.repository,
    PR_NUMBER:good.prNumber,EXPECTED_HEAD_SHA:sha,LANDING_AUTHORIZATION_ID:input.authorizationId,LANDING_ACTOR:good.landingActor,
    GITHUB_SHA:sha,GITHUB_RUN_ID:good.landingRunId,GITHUB_RUN_ATTEMPT:good.landingRunAttempt,ATOMIC_LANDING_TERMINAL_RECEIPT_PATH:file}});
  assert.equal(p.status,1);assert.equal(fs.readFileSync(file,'utf8'),bytes);
  if(mode==='tampered')assert.match(p.stderr,/ATOMIC_DISPATCH_REJECTION_BINDING_MISMATCH/);
  else {const r=JSON.parse(p.stderr.trim());assert.equal(r.dispatch_rejection_preserved,true);assert.equal(r.remote_request_performed,false);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
