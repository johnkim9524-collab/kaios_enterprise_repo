import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectStableHealth,isConvergingDynamicHold} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
test('moving snapshot retry is bounded and never retries authority or byte-integrity failures',async()=>{
  for(const code of ['SENTINEL_GENERATION_ADVANCED_DURING_READ','SENTINEL_GENERATION_CHANGED_DURING_READ','SENTINEL_MAIN_CHANGED_DURING_READ','ARCHIVE_DIGEST','HTTP_503']){
    let reads=0;const waits=[];
    await assert.rejects(collectStableHealth({readInput:async()=>{reads++;throw new Error(code);},sleep:async ms=>waits.push(ms)}),new RegExp(code));
    const moving=code==='SENTINEL_GENERATION_ADVANCED_DURING_READ';
    assert.equal(reads,moving?3:1);assert.deepEqual(waits,moving?[5000,5000]:[]);
  }
});

const health=(state='VERIFIED_HOLD',runId=200)=>({state,source_sha:'a'.repeat(40),producers:[
  {id:'SHADOW',state:'VERIFIED_PASS'},{id:'REQUIREMENT',state:'VERIFIED_PASS'},
  {id:'RESERVE',state:state==='VERIFIED_HOLD'?'VERIFIED_HOLD':'VERIFIED_PASS',
    failure_class:state==='VERIFIED_HOLD'?'NEWER_APPLICABLE_GENERATION_NONTERMINAL':null,selected_run_id:runId},
  {id:'CANONICAL_TRUTH',state:'VERIFIED_PASS'}],production:'HOLD',public:'HOLD',g5:'HOLD'});

test('new generation appearing after the waiter is reobserved to terminal success without older PASS fallback',async()=>{
  let clock=1000,reads=0;const waits=[];
  const result=await collectStableHealth({now:()=>clock,deadlineMs:31000,pollMs:15000,
    evaluate:x=>x,readInput:async()=>{reads++;return health(reads===1?'VERIFIED_HOLD':'VERIFIED_PASS',201);},
    sleep:async ms=>{waits.push(ms);clock+=ms;}});
  assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.producers[2].selected_run_id,201);
  assert.equal(reads,2);assert.deepEqual(waits,[15000]);
  assert.equal(result.convergence_wait.shared_deadline_ms,31000);
});

test('genuine terminal failure stops immediately; unrelated and unvalidated artifact HOLD cannot poll',async()=>{
  for(const result of [{...health(),state:'VERIFIED_FAIL'},
    {...health(),producers:health().producers.map(p=>p.id==='RESERVE'?{...p,failure_class:'RESERVE_ARTIFACT_CONTENT_NOT_VALIDATED'}:p)},
    {...health(),producers:health().producers.map(p=>p.id==='SHADOW'?{...p,state:'VERIFIED_HOLD',failure_class:'NEWER_APPLICABLE_GENERATION_NONTERMINAL'}:p)}]){
    let reads=0,waits=0;
    await collectStableHealth({readInput:async()=>{reads++;return result;},evaluate:x=>x,sleep:async()=>{waits++;}});
    assert.equal(reads,1);assert.equal(waits,0);assert.equal(isConvergingDynamicHold(result),false);
  }
});

test('pending timeout retains a sealed HOLD receipt and uses only the remaining shared deadline',async()=>{
  let clock=20000,reads=0;const waits=[];
  const result=await collectStableHealth({now:()=>clock,deadlineMs:21000,pollMs:15000,
    evaluate:x=>x,readInput:async()=>{reads++;return health();},sleep:async ms=>{waits.push(ms);clock+=ms;}});
  assert.equal(result.state,'VERIFIED_HOLD');assert.match(result.receipt_digest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(result.convergence_wait.timed_out,true);assert.equal(result.convergence_wait.shared_deadline_ms,21000);
  assert.deepEqual(waits,[1000]);assert.equal(reads,2);
});

test('expired shared deadline never starts another wait or resets the 2100-second budget',async()=>{
  let waits=0;
  const result=await collectStableHealth({now:()=>22000,deadlineMs:21000,evaluate:x=>x,readInput:async()=>health(),sleep:async()=>{waits++;}});
  assert.equal(waits,0);assert.equal(result.convergence_wait.shared_deadline_ms,21000);
  assert.equal(result.convergence_wait.timed_out,true);
  await assert.rejects(collectStableHealth({now:()=>1000,deadlineMs:2101001}),/SHARED_DEADLINE_INVALID/);
});

test('main, schema, attempt and digest failures never receive convergence retry',async()=>{
  for(const code of ['SENTINEL_MAIN_CHANGED_DURING_READ','RUN_INDEX_SHAPE_OR_BOUND','RUN_INDEX_IDENTITY_INVALID',
    'SENTINEL_GENERATION_CHANGED_DURING_READ','ARCHIVE_DIGEST','COVERAGE_ALIAS_RUN_CHANGED_DURING_READ']){
    let reads=0,waits=0;
    await assert.rejects(collectStableHealth({readInput:async()=>{reads++;throw new Error(code);},sleep:async()=>{waits++;}}),new RegExp(code));
    assert.equal(reads,1);assert.equal(waits,0);
  }
});

test('workflow publishes one deadline before waiter and resolver consumes it without a new job budget',()=>{
  const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
  assert.equal((workflow.match(/export KPMO_PRODUCER_COHORT_DEADLINE_MS=/g)||[]).length,1);
  assert.ok(workflow.indexOf('export KPMO_PRODUCER_COHORT_DEADLINE_MS=')<workflow.indexOf('node scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs "$KPMO_SOURCE_SHA"'));
  assert.match(workflow,/KPMO_PRODUCER_COHORT_DEADLINE_MS.*\$GITHUB_ENV/);
});
test('retry observes a fresh snapshot instead of returning an older green',async()=>{
  let reads=0;
  await assert.rejects(collectStableHealth({readInput:async()=>{reads++;throw new Error(reads===1?'SENTINEL_GENERATION_ADVANCED_DURING_READ':'ARCHIVE_DIGEST');},sleep:async()=>{}}),/ARCHIVE_DIGEST/);
  assert.equal(reads,2);
  await assert.rejects(collectStableHealth({maximumAttempts:4}),/RETRY_BOUND/);
});
