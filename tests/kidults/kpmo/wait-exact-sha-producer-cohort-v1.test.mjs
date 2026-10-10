import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProducerCohort, DEFAULT_MAX_WAIT_SECONDS,waitForCohort,selectCausalExactRun} from '../../../scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs';

test('authenticated Coverage parent is selected even when a newer same-SHA run fails',()=>{
  const spec={path:'.github/workflows/coverage.yml',events:['workflow_run']},sha='a'.repeat(40);
  const first={id:1,run_attempt:1,path:spec.path,head_branch:'main',head_sha:sha,event:'workflow_run',created_at:'2026-10-09T10:00:00Z',status:'completed',conclusion:'success'};
  const later={...first,id:2,created_at:'2026-10-09T10:01:00Z',conclusion:'cancelled'};
  assert.equal(selectCausalExactRun([first,later],spec,sha,{path:spec.path,id:1,attempt:1}).id,1);
  assert.equal(selectCausalExactRun([first,later],spec,sha).id,2);
  for(const runs of [[later],[first,{...first}], [{...first,run_attempt:2}]])
    assert.throws(()=>selectCausalExactRun(runs,spec,sha,{path:spec.path,id:1,attempt:1}),/TRIGGER_RUN_INDEX_CARDINALITY/);
});

test('cohort is pending until every producer succeeds', () => {
  assert.equal(classifyProducerCohort([{state:'SUCCESS'},{state:'PENDING'}]).state, 'PENDING');
});
test('cohort cannot pass with a partial producer set', () => {
  assert.equal(classifyProducerCohort([{state:'SUCCESS'},{state:'SUCCESS'},{state:'SUCCESS'}]).state, 'PENDING');
});
test('cohort fails closed on index error', () => {
  assert.equal(classifyProducerCohort([{state:'SUCCESS'},{state:'INDEX_ERROR'}]).state, 'INDEX_ERROR');
});
test('cohort fails closed on terminal producer failure', () => {
  assert.equal(classifyProducerCohort([{state:'SUCCESS'},{state:'TERMINAL_FAILURE'}]).state, 'TERMINAL_FAILURE');
});
test('cohort passes only when all four producers succeed', () => {
  assert.equal(classifyProducerCohort([{state:'SUCCESS'},{state:'SUCCESS'},{state:'SUCCESS'},{state:'SUCCESS'}]).state, 'SUCCESS');
});

test('cohort timeout spans the full natural reserve window', () => {
  assert.equal(DEFAULT_MAX_WAIT_SECONDS, 2100);
});

test('waiter consumes the original deadline and cannot issue a fresh 2100-second budget',async()=>{
  let reads=0;
  await assert.rejects(waitForCohort({repo:'owner/repo',sha:'a'.repeat(40),token:'fixture',
    deadlineMs:Date.now()-1,read:async()=>{reads++;return {state:'PENDING'};}}),/COHORT_TIMEOUT/);
  assert.equal(reads,1);
  await assert.rejects(waitForCohort({repo:'owner/repo',sha:'a'.repeat(40),token:'fixture',
    deadlineMs:Date.now()+2101000}),/SHARED_DEADLINE_INVALID/);
});
