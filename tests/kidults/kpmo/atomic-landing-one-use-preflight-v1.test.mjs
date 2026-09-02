import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAtomicLandingRunName,
  evaluateAtomicLandingOneUseRunSet,
  assertAtomicLandingConsumptionReceipt,
} from '../../../scripts/kidults/kpmo/run-atomic-landing-one-use-preflight-v1.mjs';

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const prNumber = 1843;
const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const authorizationId = `LAND-PR-${prNumber}-${headSha.slice(0, 12)}`;
const runId = 100;
const workflowId = 200;
const expectedRunName = buildAtomicLandingRunName({prNumber, headSha, authorizationId});
const run = (overrides = {}) => ({
  id: runId,
  workflow_id: workflowId,
  run_attempt: 1,
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: baseSha,
  display_title: expectedRunName,
  status: 'in_progress',
  conclusion: null,
  ...overrides,
});
const code = (fn, expected) => assert.throws(fn, error => error?.code === expected || error?.message === expected);

test('run-name binds PR, head, and deterministic authorization identifier', () => {
  assert.equal(expectedRunName, `KIDULTS Atomic Landing PR #1843 @ ${headSha} / ${authorizationId}`);
  code(() => buildAtomicLandingRunName({
    prNumber,
    headSha,
    authorizationId: 'LAND-PR-1843-wrong',
  }), 'ATOMIC_ONE_USE_AUTHORIZATION_ID_INVALID');
});

test('first exact matching dispatch is uniquely admitted', () => {
  const result = evaluateAtomicLandingOneUseRunSet([run()], {
    currentRunId: runId,
    currentRunAttempt: 1,
    workflowId,
    expectedRunName,
    protectedMainShaAtDispatch: baseSha,
  });
  assert.equal(result.matching_run_count, 1);
  assert.equal(result.matching_run_id, runId);
});

test('rerun attempt and every prior matching run conclusion fail closed', () => {
  code(() => evaluateAtomicLandingOneUseRunSet([run({run_attempt: 2})], {
    currentRunId: runId,
    currentRunAttempt: 2,
    workflowId,
    expectedRunName,
    protectedMainShaAtDispatch: baseSha,
  }), 'ATOMIC_LANDING_RERUN_ATTEMPT_FORBIDDEN');

  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'success', null]) {
    const prior = run({
      id: 99,
      status: conclusion === null ? 'in_progress' : 'completed',
      conclusion,
    });
    code(() => evaluateAtomicLandingOneUseRunSet([prior, run()], {
      currentRunId: runId,
      currentRunAttempt: 1,
      workflowId,
      expectedRunName,
      protectedMainShaAtDispatch: baseSha,
    }), 'ATOMIC_LANDING_AUTHORIZATION_ALREADY_CONSUMED');
  }
});

test('second distinct run is rejected even when the first never reached merge', () => {
  code(() => evaluateAtomicLandingOneUseRunSet([
    run({id: 90, status: 'completed', conclusion: 'failure'}),
    run(),
  ], {
    currentRunId: runId,
    currentRunAttempt: 1,
    workflowId,
    expectedRunName,
    protectedMainShaAtDispatch: baseSha,
  }), 'ATOMIC_LANDING_AUTHORIZATION_ALREADY_CONSUMED');
});

test('cross-PR same-head and prior-base generations do not substitute for the exact tuple', () => {
  const crossPrRunName = buildAtomicLandingRunName({
    prNumber: 1844,
    headSha,
    authorizationId: `LAND-PR-1844-${headSha.slice(0, 12)}`,
  });
  const result = evaluateAtomicLandingOneUseRunSet([
    run({id: 90, display_title: crossPrRunName}),
    run({id: 91, head_sha: 'c'.repeat(40)}),
    run(),
  ], {
    currentRunId: runId,
    currentRunAttempt: 1,
    workflowId,
    expectedRunName,
    protectedMainShaAtDispatch: baseSha,
  });
  assert.equal(result.matching_run_id, runId);
});

test('sanitized consumption receipt is exact tuple bound', () => {
  const receipt = {
    id: 'kidults-atomic-landing-one-use-consumption-v1',
    version: '1.0.0',
    state: 'CONSUMED_BY_FIRST_MATCHING_DISPATCH',
    repository,
    pull_request: prNumber,
    exact_head_sha: headSha,
    exact_base_sha: baseSha,
    protected_main_sha_at_dispatch: baseSha,
    landing_workflow_run_id: runId,
    landing_workflow_run_attempt: 1,
    matching_run_count: 1,
    authorization_id_sha256: crypto.createHash('sha256').update(authorizationId).digest('hex'),
    run_name_sha256: crypto.createHash('sha256').update(expectedRunName).digest('hex'),
    raw_authorization_persisted: false,
    pr_head_matches_input: true,
    pr_base_matches_dispatch_main: true,
    live_main_matches_dispatch_main: true,
  };
  assert.equal(assertAtomicLandingConsumptionReceipt(receipt, {
    repository,
    prNumber,
    headSha,
    baseSha,
    authorizationId,
    runId,
    runAttempt: 1,
    expectedRunName,
  }).state, 'CONSUMED_BY_FIRST_MATCHING_DISPATCH');
  code(() => assertAtomicLandingConsumptionReceipt({...receipt, pull_request: 1844}, {
    repository,
    prNumber,
    headSha,
    baseSha,
    authorizationId,
    runId,
    runAttempt: 1,
    expectedRunName,
  }), 'ATOMIC_CONSUMPTION_PR_MISMATCH');
});

test('workflow places one-use consumption before lifecycle and always reconciles terminal receipt', () => {
  const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
  assert.match(workflow, /run-name: "KIDULTS Atomic Landing PR #\$\{\{ inputs\.pull_request_number \}\} @ \$\{\{ inputs\.expected_head_sha \}\} \/ \$\{\{ inputs\.landing_authorization_id \}\}"/);
  const consumeIndex = workflow.indexOf('Consume one-use exact-head landing authorization');
  const lifecycleIndex = workflow.indexOf('Require latest terminal exact-head lifecycle authority');
  const mergeIndex = workflow.indexOf('Re-read live authority and execute exact-head server merge');
  assert.ok(consumeIndex >= 0 && consumeIndex < lifecycleIndex && lifecycleIndex < mergeIndex);
  assert.match(workflow, /run: node scripts\/kidults\/kpmo\/run-atomic-landing-one-use-preflight-v1\.mjs/);
  assert.match(workflow, /ATOMIC_LANDING_CONSUMPTION_PATH: \$\{\{ runner\.temp \}\}\/kidults-atomic-landing-consumption\/receipt\.json/);
  assert.match(workflow, /Reconcile durable atomic landing terminal receipt\n        if: always\(\)/);
});

test('runner rechecks one-use consumption and explicit Ready authority immediately before merge', () => {
  const runner = fs.readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
  const gates = fs.readFileSync('scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs', 'utf8');
  assert.match(runner, /selectLatestProgramOwnerReadyEvent/);
  assert.match(runner, /assertLiveOneUseConsumption/);
  assert.match(runner, /IMMEDIATE_PREMERGE_PROGRAM_OWNER_APPROVAL_DRIFT/);
  assert.match(runner, /await assertLiveOneUseConsumption\(immediatePreMerge\.base\.sha\)/);
  assert.match(gates, /PROGRAM_OWNER_EXACT_HEAD_APPROVAL_APP_MEDIATED/);
});

test('terminal receipt persists sanitized one-use consumption evidence', () => {
  const reconciler = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');
  assert.match(reconciler, /authorization_consumption: authorizationConsumption/);
  assert.match(reconciler, /authorization_id_sha256: authorizationIdSha256/);
  assert.match(reconciler, /landing_workflow_run_attempt: Number\(landingRunAttempt\)/);
  assert.match(reconciler, /ATOMIC_TERMINAL_CONSUMPTION_RAW_AUTHORIZATION_LEAK/);
  assert.doesNotMatch(reconciler, /operation_authorization_id:/);
});
