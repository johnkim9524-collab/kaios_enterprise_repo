import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ARL_ROOT,P1_ROOT,ROOTS,REPOSITORY,classifyHealthReceipt,ensureRoot,producerHealthFailureCode,selectRootGeneration,waitForSuccessfulRoot} from '../../../scripts/kidults/kpmo/run-exact-sha-producer-auto-convergence-v1.mjs';

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

test('direct ARL dispatch is bound to the exact successful P1 run',async()=>{
  let observedInputs=null;
  await ensureRoot(ARL_ROOT,{sourceSha:sha,token:'x',inputs:{p1_run_id:'42'},apiRuns:async()=>[],dispatch:async(_root,_token,inputs)=>{observedInputs=inputs;}});
  assert.deepEqual(observedInputs,{p1_run_id:'42'});
  const p1Run={...run(),path:P1_ROOT.path,id:42};
  const selected=await waitForSuccessfulRoot(P1_ROOT,{sourceSha:sha,token:'x',deadline:Date.now()+1000,pollMs:1,apiRuns:async()=>[p1Run],wait:async()=>{}});
  assert.equal(selected.id,42);
});

test('failed root performs one bounded retry and preserves exact inputs',async()=>{
  const failed={...run(),path:ARL_ROOT.path,id:41,conclusion:'failure'};
  const passed={...failed,id:42,created_at:'2026-09-25T00:01:00Z',conclusion:'success'};
  const indexes=[[failed],[failed],[failed,passed]];
  const dispatches=[];
  const selected=await waitForSuccessfulRoot(ARL_ROOT,{
    sourceSha:sha,token:'x',deadline:Date.now()+1000,pollMs:1,
    inputs:{p1_run_id:'17'},
    apiRuns:async()=>indexes.shift()??[failed,passed],
    dispatch:async(root,_token,inputs)=>dispatches.push({root,inputs}),
    wait:async()=>{},
  });
  assert.equal(selected.id,42);
  assert.equal(dispatches.length,1);
  assert.equal(dispatches[0].root,ARL_ROOT);
  assert.deepEqual(dispatches[0].inputs,{p1_run_id:'17'});
});

test('bounded retry never redispatches while the new run is not yet indexed',async()=>{
  const failed={...run(),path:ARL_ROOT.path,id:41,conclusion:'failure'};
  let reads=0;
  let dispatches=0;
  await assert.rejects(()=>waitForSuccessfulRoot(ARL_ROOT,{
    sourceSha:sha,token:'x',deadline:Date.now()+5,pollMs:1,
    inputs:{p1_run_id:'17'},
    apiRuns:async()=>{reads+=1;return [failed];},
    dispatch:async()=>{dispatches+=1;},
    wait:async()=>{},
  }),/ARL_ROOT_TIMEOUT/);
  assert.ok(reads>=2);
  assert.equal(dispatches,1);
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

test('terminal producer-health failure preserves the originating sentinel class',()=>{
  const classified=classifyHealthReceipt(health({
    state:'VERIFIED_FAIL',
    failed_producers:['REQUIREMENT'],
    producers:[{id:'REQUIREMENT',failure_class:'LATEST_APPLICABLE_FAILURE'}],
  }),sha);
  assert.deepEqual(classified.failure_classes,['LATEST_APPLICABLE_FAILURE']);
  assert.equal(producerHealthFailureCode(classified),'PRODUCER_HEALTH_FAILED_REQUIREMENT__LATEST_APPLICABLE_FAILURE');

  const race=classifyHealthReceipt(health({
    state:'VERIFIED_FAIL',
    failed_producers:[],
    failure_class:'SENTINEL_GENERATION_CHANGED_DURING_READ',
  }),sha);
  assert.equal(race.state,'WAIT');
  assert.deepEqual(race.waiting,['CANONICAL_TRUTH']);
  assert.deepEqual(race.failure_classes,['SENTINEL_GENERATION_CHANGED_DURING_READ']);
});

test('sentinel observes protected-main health without dispatching or mutating producers',()=>{
  const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
  assert.match(workflow,/^  workflow_run:\n    workflows:\n      - 'KIDULTS ASI Requirement-to-Adapter Coverage v1'/m);
  assert.match(workflow,/github\.event\.workflow_run\.head_sha != ''/);
  assert.doesNotMatch(workflow,/      - 'KIDULTS ASI Sharded Source Reserve v1'/m);
  assert.doesNotMatch(workflow,/^  push:/m);
  assert.doesNotMatch(workflow,/^  schedule:/m);
  assert.match(workflow,/permissions:\n  contents: read\n  actions: read/);
  assert.doesNotMatch(workflow,/Run exact-SHA producer auto-convergence/);
  assert.doesNotMatch(workflow,/node scripts\/kidults\/kpmo\/run-exact-sha-producer-auto-convergence-v1\.mjs/);
  assert.doesNotMatch(workflow,/actions: write/);
  for(const marker of ['promotion_eligible==false','public=="HOLD"','production=="HOLD"','g5=="HOLD"'])assert.ok(workflow.includes(marker));
});

test('root dispatches target authoritative producers without relying on token-suppressed workflow_run recursion',()=>{
  assert.equal(ROOTS.find((root)=>root.id==='REQUIREMENT').workflow,'kidults-asi-requirement-adapter-coverage-v1.yml');
  assert.equal(ROOTS.find((root)=>root.id==='RESERVE').workflow,'kidults-asi-sharded-source-reserve-v1.yml');
  assert.equal(P1_ROOT.workflow,'kidults-asi-p1-source-preflight-v1.yml');
  assert.equal(ARL_ROOT.workflow,'kidults-asi-autonomous-resolution-layer-v1.yml');
  const arl=fs.readFileSync(ARL_ROOT.path,'utf8');
  assert.match(arl,/p1_run_id:/);
  assert.match(arl,/EXACT_P1_WORKFLOW_DISPATCH_INPUT_VERIFIED/);
  const coverage=fs.readFileSync(ROOTS.find((root)=>root.id==='REQUIREMENT').path,'utf8');
  assert.match(coverage,/new Set\(\['workflow_run','workflow_dispatch'\]\)/);
});

test('natural assurance is causally serialized behind a successful sentinel',()=>{
  const sentinel=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
  const assurance=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  assert.match(sentinel,/^  workflow_run:\n    workflows:\n      - 'KIDULTS ASI Requirement-to-Adapter Coverage v1'/m);
  assert.doesNotMatch(sentinel,/      - 'KIDULTS ASI Sharded Source Reserve v1'/m);
  assert.doesNotMatch(sentinel,/      - 'KPMO Live Canonical Issue Truth V1'/m);
  assert.doesNotMatch(sentinel,/      - 'KIDULTS ASI SHADOW Operating Evidence v1'/m);
  assert.match(sentinel,/github\.event\.workflow_run\.head_sha != ''/);
  assert.match(assurance,/github\.event\.workflow_run\.name == 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1'/);
  assert.match(assurance,/github\.event\.workflow_run\.conclusion == 'success'/);
});
