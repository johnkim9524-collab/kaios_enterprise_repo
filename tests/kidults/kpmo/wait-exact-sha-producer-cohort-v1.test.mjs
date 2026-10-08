import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProducerCohort, DEFAULT_MAX_WAIT_SECONDS,waitForCohort} from '../../../scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs';

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
