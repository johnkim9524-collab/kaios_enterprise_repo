import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProducerCohort, triggerMatchesRun} from '../../../scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs';

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

test('cohort rejects a workflow_run edge whose exact parent run was not selected', () => {
  const spec = {path:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml'};
  const selected = {id:101, run_attempt:1};
  assert.equal(triggerMatchesRun(selected, spec, {id:'101',attempt:'1',path:spec.path}), true);
  assert.equal(triggerMatchesRun(selected, spec, {id:'102',attempt:'1',path:spec.path}), false);
  assert.equal(triggerMatchesRun(selected, spec, {id:'101',attempt:'2',path:spec.path}), false);
  assert.equal(triggerMatchesRun(selected, spec, {id:'999',attempt:'1',path:'.github/workflows/other.yml'}), true);
});
