import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateSentinelObservation} from '../../../scripts/kidults/kpmo/validate-sentinel-observation-v1.mjs';
const stable=x=>Array.isArray(x)?`[${x.map(stable).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`:JSON.stringify(x);
const env={GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',SENTINEL_RESOLVER_OUTCOME:'failure'};
const ids=['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'];
function receipt(state='VERIFIED_HOLD'){
 const r={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',repository:env.GITHUB_REPOSITORY,source_sha:env.GITHUB_SHA,observer_run_id:900,observer_run_attempt:1,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',state,semantic_content_verified:state==='VERIFIED_PASS',runtime_health_proven:false,whole_platform_authority:false,promotion_eligible:false,provider_authority:false,database_authority:false,empirical_delta:0,public:'HOLD',production:'HOLD',g5:'HOLD',producers:ids.map(id=>({id,state,artifact_content_validated:state==='VERIFIED_PASS'})),failed_producers:state==='VERIFIED_FAIL'?ids:[],waiting_producers:state==='VERIFIED_HOLD'?ids:[]};
 return r;
}
function seal(r){return {...r,receipt_digest:`sha256:${crypto.createHash('sha256').update(stable(r)).digest('hex')}`};}
for(const state of ['VERIFIED_PASS','VERIFIED_HOLD','VERIFIED_FAIL'])test(`classification preserves ${state} without granting health authority`,()=>{
 const result=validateSentinelObservation(seal(receipt(state)),{...env,SENTINEL_RESOLVER_OUTCOME:state==='VERIFIED_PASS'?'success':'failure'});
 assert.equal(result.semantic_health_state,state);assert.equal(result.producer_health_authority,false);assert.equal(result.promotion_eligible,false);
});
test('a bound resolver failure remains an explicit RED classification',()=>{
 const r=receipt('VERIFIED_FAIL');delete r.producers;delete r.failed_producers;delete r.waiting_producers;
 r.failure_class='GITHUB_READ_TRANSPORT_FAILED';r.observer_run_id='900';r.observer_run_attempt='1';
 assert.equal(validateSentinelObservation(seal(r),env).semantic_health_state,'VERIFIED_FAIL');
});
for(const [label,mutate] of [
 ['wrong source',r=>r.source_sha='b'.repeat(40)],['wrong repository',r=>r.repository='wrong/repo'],
 ['prior run',r=>r.observer_run_id=899],['rerun',r=>r.observer_run_attempt=2],
 ['health authority',r=>r.whole_platform_authority=true],['release authority',r=>r.promotion_eligible=true],
 ['provider authority',r=>r.provider_authority=true],['database authority',r=>r.database_authority=true],
 ['operational proof',r=>r.runtime_health_proven=true],['business delta',r=>r.empirical_delta=1],
 ['public release',r=>r.public='PASS'],['missing producer',r=>r.producers.pop()],
 ['duplicate producer',r=>r.producers[0].id='REQUIREMENT'],['wrong aggregation',r=>r.waiting_producers=[]],
 ['unknown state',r=>r.state='SUCCESS'],['HOLD treated as semantic pass',r=>r.semantic_content_verified=true],
])test(`classification refuses ${label} even with recalculated digest`,()=>{const r=receipt();mutate(r);assert.throws(()=>validateSentinelObservation(seal(r),env));});
test('wrong receipt digest and unsigned bootstrap cannot become valid classification',()=>{
 const r=seal(receipt());r.receipt_digest='sha256:'+'0'.repeat(64);assert.throws(()=>validateSentinelObservation(r,env));
 assert.throws(()=>validateSentinelObservation(receipt(),env));
});
test('PASS needs all four producer content proofs and successful resolver outcome',()=>{
 const r=receipt('VERIFIED_PASS');r.producers[0].artifact_content_validated=false;
 assert.throws(()=>validateSentinelObservation(seal(r),{...env,SENTINEL_RESOLVER_OUTCOME:'success'}));
 assert.throws(()=>validateSentinelObservation(seal(receipt('VERIFIED_PASS')),env));
});
test('repository-wide fanout stays inside unchanged limits with existing mutation guards',()=>{
 const p=spawnSync(process.execPath,['scripts/kidults/kpmo/validate-asi-workflow-fanout-budget-v1.mjs'],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,p.stderr);const report=JSON.parse(p.stdout);
 assert.ok(report.workflow_run_consumers<=16);
 assert.ok(report.execution_workflow_run_edges<=29);assert.ok(report.control_observer_edges<=21);
 const budget=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/asi-workflow-fanout-budget-v1.json'));
 assert.equal(budget.budgets.workflow_run_consumers_max,16);
 assert.equal(budget.budgets.execution_workflow_run_edges_max,29);
 assert.equal(budget.budgets.control_observer_edges_max,21);
});
test('observer records RED/HOLD without changing the independent strict gate',()=>{
 const a=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
 const job=a.slice(a.indexOf('  observe-core-producer-content:'));
 assert.ok(job.includes('not health authorization'));
 assert.ok(job.includes('SENTINEL_RESOLVER_OUTCOME: ${{ steps.resolve.outcome }}'));
 assert.ok(job.includes('validate-sentinel-observation-v1.mjs'));
 assert.ok(job.includes('retention-days: 90'));
 assert.ok(!job.includes('actions: write')&&!job.includes('secrets.')&&!job.includes('needs:'));
 const s=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
 assert.ok(!/^  workflow_run:/m.test(s));
 for(const marker of ['schedule:', 'workflow_dispatch:', 'Enforce fail-closed producer health after receipt retention','.state=="VERIFIED_PASS"','.semantic_content_verified==true'])assert.ok(s.includes(marker));
});

import os from 'node:os';
import path from 'node:path';
for(const state of ['VERIFIED_PASS','VERIFIED_HOLD','VERIFIED_FAIL','TAMPERED'])test(`real observation CLI preserves ${state} without health authority`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-observation-cli-'));
 try{
  const input=path.join(dir,'receipt.json'),summary=path.join(dir,'summary.md');
  const r=seal(receipt(state==='TAMPERED'?'VERIFIED_HOLD':state));
  if(state==='TAMPERED')r.state='VERIFIED_PASS';
  fs.writeFileSync(input,JSON.stringify(r));
  const p=spawnSync(process.execPath,['scripts/kidults/kpmo/validate-sentinel-observation-v1.mjs',input],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,...env,SENTINEL_RESOLVER_OUTCOME:state==='VERIFIED_PASS'?'success':'failure',GITHUB_STEP_SUMMARY:summary}});
  assert.equal(p.error,undefined,p.stderr);
  if(state==='TAMPERED'){assert.notEqual(p.status,0);assert.equal(fs.existsSync(summary),false);return;}
  assert.equal(p.status,0,p.stderr);const output=JSON.parse(p.stdout);
  assert.equal(output.semantic_health_state,state);assert.equal(output.producer_health_authority,false);
  assert.ok(fs.readFileSync(summary,'utf8').includes(`**${state}**`));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
