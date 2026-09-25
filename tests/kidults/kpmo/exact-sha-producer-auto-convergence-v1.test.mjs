import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ROOTS,REPOSITORY,classifyHealthReceipt,ensureRoot,selectRootGeneration} from '../../../scripts/kidults/kpmo/run-exact-sha-producer-auto-convergence-v1.mjs';

const sha='a'.repeat(40);
const root=ROOTS[0];
const run=(overrides={})=>({id:1,run_attempt:1,repository:{full_name:REPOSITORY},path:root.path,head_branch:'main',head_sha:sha,event:'workflow_dispatch',created_at:'2026-09-25T00:00:00Z',status:'completed',conclusion:'success',...overrides});
const health=(overrides={})=>({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',source_sha:sha,state:'VERIFIED_PASS',promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD',...overrides});

test('root selection is exact-SHA, workflow-bound and latest',()=>{
  assert.equal(selectRootGeneration([run(),run({id:2,created_at:'2026-09-25T00:01:00Z',status:'in_progress',conclusion:null})],root,sha).id,2);
  assert.equal(selectRootGeneration([run({head_sha:'b'.repeat(40)})],root,sha),null);
});

test('existing successful or active root makes convergence idempotent',async()=>{
  let dispatches=0;
  const result=await ensureRoot(root,{sourceSha:sha,token:'x',apiRuns:async()=>[run()],dispatch:async()=>{dispatches+=1;}});
  assert.equal(result.action,'SKIPPED_EXISTING');assert.equal(dispatches,0);
});

test('missing root dispatches and failed root permits one bounded retry',async()=>{
  let dispatches=0;
  assert.equal((await ensureRoot(root,{sourceSha:sha,token:'x',apiRuns:async()=>[],dispatch:async()=>{dispatches+=1;}})).action,'DISPATCHED');
  assert.equal((await ensureRoot(root,{sourceSha:sha,token:'x',force:true,apiRuns:async()=>[run({conclusion:'failure'})],dispatch:async()=>{dispatches+=1;}})).action,'DISPATCHED_RECOVERY');
  assert.equal(dispatches,2);
});

test('third root dispatch is rejected fail-closed',async()=>{
  const runs=[run({id:1,conclusion:'failure'}),run({id:2,created_at:'2026-09-25T00:01:00Z',conclusion:'failure'})];
  await assert.rejects(()=>ensureRoot(root,{sourceSha:sha,token:'x',force:true,apiRuns:async()=>runs,dispatch:async()=>{}}),/SHADOW_ROOT_RETRY_EXHAUSTED/);
});

test('health receipt preserves HOLD boundary and separates wait, fail and pass',()=>{
  assert.equal(classifyHealthReceipt(health(),sha).state,'PASS');
  assert.equal(classifyHealthReceipt(health({state:'VERIFIED_HOLD',waiting_producers:['RESERVE']}),sha).state,'WAIT');
  assert.deepEqual(classifyHealthReceipt(health({state:'VERIFIED_FAIL',failed_producers:['SHADOW']}),sha).failed,['SHADOW']);
  assert.throws(()=>classifyHealthReceipt(health({production:'PASS'}),sha),/HEALTH_RECEIPT_BOUNDARY_INVALID/);
});

test('workflow starts roots on protected-main push and retains terminal HOLD boundary',()=>{
  const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
  assert.match(workflow,/^  push:\n    branches: \[main\]/m);
  assert.match(workflow,/Run exact-SHA producer auto-convergence/);
  assert.match(workflow,/run-exact-sha-producer-auto-convergence-v1\.mjs/);
  for(const marker of ['promotion_eligible==false','public=="HOLD"','production=="HOLD"','g5=="HOLD"'])assert.ok(workflow.includes(marker));
});

test('root dispatches target authoritative producers without relying on token-suppressed workflow_run recursion',()=>{
  assert.equal(ROOTS.find((root)=>root.id==='REQUIREMENT').workflow,'kidults-asi-requirement-adapter-coverage-v1.yml');
  assert.equal(ROOTS.find((root)=>root.id==='RESERVE').workflow,'kidults-asi-sharded-source-reserve-v1.yml');
});
