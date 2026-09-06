#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';

const root=process.cwd();
const workflow=fs.readFileSync('.github/workflows/kpmo-live-canonical-issue-truth-v1.yml','utf8');
const runner='scripts/kidults/kpmo/run-live-canonical-truth-terminal-v1.mjs';
const sha='a'.repeat(40),repo='johnkim9524-collab/kaios_enterprise_repo';
function step(name){
  const start=workflow.indexOf(`      - name: ${name}\n`);
  assert.ok(start>=0,name);
  const next=workflow.indexOf('\n      - ',start+1);
  const block=workflow.slice(start,next<0?undefined:next);
  const body=block.split('        run: |\n')[1];assert.ok(body,name);
  return body.split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
}
// Execute the real workflow bootstrap/capture/emitter with a closed child test
// double. This tests terminal transport, not live Canonical/Owner authority.
function exercise(kind='mismatch',event='pull_request'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-terminal-test-'));
  try{
    const script=path.join(dir,'scripts/kidults/kpmo');fs.mkdirSync(script,{recursive:true});
    if(fs.existsSync(runner))fs.copyFileSync(runner,path.join(dir,runner));
    fs.writeFileSync(path.join(script,'validate-live-canonical-issue-truth-v1.mjs'),`
import fs from 'node:fs';
const kind=process.env.TEST_CASE;
const output={validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',version:'3.1.0',state:'VERIFIED_PASS',authority_model:'CANONICAL_GENERATION_V3_ONLY',protected_main_sha:process.env.EXPECTED_PROTECTED_MAIN_SHA,material_defect_registry_sha256:'sha256:'+'0'.repeat(64),material_defect_count:0,material_defects:[],material_defect_query_cardinality:{P0:0,P1:0},empirical_promotion:false,whole_platform_closure:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
let receipt={receipt_id:'kpmo-canonical-generation-v3-receipt',version:'3.5.1',repository:process.env.GITHUB_REPOSITORY,run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),state:'VERIFIED_FAIL',mode:'UNCOMMITTED',writes:0,failure_class:'COMMIT_MISMATCH',mismatch_fields:['material_defect_count','truth_digest'],promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
if(kind==='wrong-repository')receipt.repository='other/repo';
if(kind==='wrong-run')receipt.run_id+=1;
if(kind==='string-run')receipt.run_id=String(receipt.run_id);
if(kind==='wrong-attempt')receipt.run_attempt+=1;
if(kind==='authority')receipt.promotion_eligible=true;
if(kind==='writes')receipt.writes=26;
if(kind==='mode')receipt.mode='COMMITTED';
if(kind==='upstream-pass')receipt.state='VERIFIED_PASS';
if(kind==='unknown-field')receipt.mismatch_fields=['TOKEN_MUST_NOT_LEAK'];
if(kind==='duplicate-field')receipt.mismatch_fields=['truth_digest','truth_digest'];
if(kind==='leaky-error')receipt.failure_class='GITHUB_HTTP_403:https://example.invalid/?token=TOKEN_MUST_NOT_LEAK';
if(kind==='bad-error')receipt.failure_class='TOKEN_MUST_NOT_LEAK lowercase text';
const p=process.env.CANONICAL_GENERATION_RECEIPT_PATH||process.env.RUNNER_TEMP+'/canonical-generation-v3-receipt.json';
if(kind!=='missing'&&kind!=='stale'){
 if(kind==='symlink'){const target=p+'.other';fs.writeFileSync(target,JSON.stringify(receipt));fs.symlinkSync(target,p);}
 else fs.writeFileSync(p,kind==='bad-json'?'{':kind==='oversized'?'x'.repeat(70000):JSON.stringify(receipt));
}
if(kind==='pass'){console.log(JSON.stringify(output,null,2));process.exit(0);}
if(kind==='zero-exit-fail'){console.log(JSON.stringify({state:'VERIFIED_FAIL'}));process.exit(0);}
if(kind==='pass-on-failure')console.log(JSON.stringify(output));
console.error('child detail TOKEN_MUST_NOT_LEAK');
process.exit(1);
`);
    const temp=path.join(dir,'temp');fs.mkdirSync(temp);
    const stale=path.join(temp,'canonical-generation-v3-receipt.json');
    if(kind==='stale')fs.writeFileSync(stale,JSON.stringify({state:'VERIFIED_FAIL',failure_class:'STALE_SHOULD_NOT_BE_USED'}));
    const env={PATH:process.env.PATH,HOME:dir,RUNNER_TEMP:temp,GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:'9001',GITHUB_RUN_ATTEMPT:'1',RECEIPT_HEAD_SHA:sha,RECEIPT_EVENT:event,GITHUB_EVENT_NAME:event,GITHUB_TOKEN:'SYNTHETIC_ONLY',EXPECTED_PROTECTED_MAIN_SHA:sha,TEST_CASE:kind};
    const invoke=(body,extra={})=>spawnSync('bash',['-c',body],{cwd:dir,env:{...env,...extra},encoding:'utf8',timeout:10000});
    const init=invoke(step('Initialize fail-closed canonical-truth receipt'));assert.equal(init.status,0,init.stderr);
    const capture=invoke(step('Validate live canonical issue truth'));
    const emit=invoke(step('Emit exact canonical-truth receipt'),{VALIDATION_OUTCOME:capture.status===0?'success':'failure'});
    assert.equal(emit.status,0,emit.stderr);
    const text=fs.readFileSync(path.join(temp,'canonical-truth-validation-output-v1.json'),'utf8');
    const receipt=JSON.parse(fs.readFileSync(path.join(temp,'canonical-truth-receipt-v1.json'),'utf8'));
    assert.equal(receipt.validation_output_sha256,'sha256:'+crypto.createHash('sha256').update(text).digest('hex'));
    return {receipt,output:JSON.parse(text),capture,staleExists:fs.existsSync(stale)};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const event of ['pull_request','push','workflow_dispatch'])test(`${event}: actual capture and emitter preserve failure class, fields and exact identity`,()=>{
  const {receipt:x,output,capture}=exercise('mismatch',event);
  assert.equal(capture.status,1);assert.equal(x.state,'VERIFIED_FAIL');
  assert.equal(x.root_failure_class,'COMMIT_MISMATCH');
  assert.deepEqual(x.mismatch_fields,['material_defect_count','truth_digest']);
  assert.equal(output.repository,repo);assert.equal(output.head_sha,sha);
  assert.equal(output.run_id,9001);assert.equal(output.run_attempt,1);assert.equal(output.event,event);
  assert.equal(x.material_defect_count,null);assert.equal(x.material_defect_issue_numbers,null);
  assert.equal(x.material_registry_verified,false);assert.equal(x.g5,'HOLD');
});
test('successful zero-defect output remains verified zero, not unknown',()=>{
  const {receipt:x,capture}=exercise('pass');assert.equal(capture.status,0);
  assert.equal(x.state,'VERIFIED_PASS');assert.equal(x.material_registry_verified,true);
  assert.equal(x.material_defect_count,0);assert.deepEqual(x.material_defect_issue_numbers,[]);
  assert.equal(x.root_failure_class,null);assert.deepEqual(x.mismatch_fields,[]);
});
for(const kind of ['wrong-repository','wrong-run','string-run','wrong-attempt','authority','writes','mode','upstream-pass','unknown-field','duplicate-field','bad-error','missing','bad-json','oversized','symlink','stale','pass-on-failure','zero-exit-fail'])test(`failure diagnostic rejects or contains ${kind} without granting PASS`,()=>{
  const {receipt:x,output,capture,staleExists}=exercise(kind);
  assert.notEqual(capture.status,0);assert.equal(x.state,'VERIFIED_FAIL');
  assert.equal(x.material_registry_verified,false);assert.equal(x.material_defect_count,null);
  assert.equal(x.promotion_eligible,false);assert.equal(x.g5,'HOLD');
  assert.ok(typeof x.root_failure_class==='string');
  assert.ok(!JSON.stringify({x,output,capture}).includes('TOKEN_MUST_NOT_LEAK'));
  if(kind!=='pass-on-failure')assert.notEqual(x.root_failure_class,'COMMIT_MISMATCH');
  if(kind==='stale')assert.equal(staleExists,true);
});
test('HTTP diagnostic keeps only its bounded code, not response bodies or URLs',()=>{
  const {receipt:x,capture}=exercise('leaky-error');assert.equal(x.root_failure_class,'GITHUB_HTTP_403');
  assert.ok(!JSON.stringify({x,capture}).includes('TOKEN_MUST_NOT_LEAK'));
});
test('existing workflow runs the regression and watches both wrapper and test',()=>{
  assert.ok(workflow.includes(`"${runner}"`));
  assert.ok(workflow.includes('"tests/kidults/kpmo/canonical-failure-terminal-v1.test.mjs"'));
  assert.ok(workflow.includes('node --test tests/kidults/kpmo/canonical-failure-terminal-v1.test.mjs'));
});
