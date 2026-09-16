#!/usr/bin/env node

import assert from 'node:assert/strict';
import { classifyMissionConsumptionWorkflowRun, EXPECTED_PRODUCER_WORKFLOW_PATH } from './classify-asi-mission-directed-workflow-run-v1.mjs';

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const currentMainSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const priorMainSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function event(overrides = {}) {
  return {
    workflow_run: {
      id: 123,
      run_attempt: 1,
      path: EXPECTED_PRODUCER_WORKFLOW_PATH,
      head_repository: { full_name: repository },
      head_branch: 'main',
      head_sha: currentMainSha,
      conclusion: 'success',
      ...overrides
    }
  };
}

function classify(overrides = {}) {
  return classifyMissionConsumptionWorkflowRun({ event: event(overrides), currentMainSha, repository });
}

{
  const result = classify();
  assert.equal(result.state, 'VERIFIED_PASS');
  assert.equal(result.classification, 'CURRENT_MAIN_EXACT');
  assert.equal(result.reason, 'CURRENT_MAIN_PRODUCER_BOUND');
  assert.equal(result.current_main_authority, true);
  assert.equal(result.promotion_eligible, false);
}

{
  const result = classify({ head_sha: priorMainSha });
  assert.equal(result.state, 'VERIFIED_SKIP');
  assert.equal(result.classification, 'EXPECTED_NONAUTHORITATIVE_SKIP');
  assert.equal(result.reason, 'STALE_PRIOR_MAIN_TRIGGER');
  assert.equal(result.current_main_authority, false);
}

for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
  const result = classify({ conclusion });
  assert.equal(result.state, 'VERIFIED_SKIP');
  assert.equal(result.classification, 'EXPECTED_NONAUTHORITATIVE_SKIP');
  assert.equal(result.reason, 'UPSTREAM_NON_SUCCESS');
  assert.equal(result.current_main_authority, false);
}

for (const [overrides, reason] of [
  [{ head_repository: { full_name: 'other/repo' } }, 'PRODUCER_REPOSITORY_MISMATCH'],
  [{ head_branch: 'feature' }, 'PRODUCER_BRANCH_MISMATCH'],
  [{ path: '.github/workflows/other.yml' }, 'PRODUCER_WORKFLOW_PATH_MISMATCH'],
  [{ head_sha: 'not-a-sha' }, 'PRODUCER_HEAD_SHA_INVALID']
]) {
  const result = classify(overrides);
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.classification, 'INVALID_TRIGGER');
  assert.equal(result.reason, reason);
  assert.equal(result.current_main_authority, false);
  assert.equal(result.promotion_eligible, false);
}

{
  const result = classifyMissionConsumptionWorkflowRun({ event: {}, currentMainSha, repository });
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.reason, 'WORKFLOW_RUN_EVENT_MISSING');
}

{
  const result = classifyMissionConsumptionWorkflowRun({ event: event(), currentMainSha: 'bad', repository });
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.reason, 'CURRENT_MAIN_SHA_INVALID');
}

console.log(JSON.stringify({ state: 'VERIFIED_PASS', test: 'asi-mission-directed-workflow-run-classification-v1' }));
