import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import { createTask, claimTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask, persistTaskTransition } from '../src/autonomous-control/task-ledger-v1.mjs';
import {
  createSyntheticHandlerRegistry, executeClaimedSyntheticTask,
  verifySyntheticExecutionReceipt,
} from '../src/autonomous-control/task-worker-v1.mjs';
import { SYNTHETIC_HANDLER_REGISTRY_V1 } from '../src/autonomous-control/synthetic-handler-registry-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const workerId = 'synthetic-worker:executor-1';
const issuedAt = new Date('2026-09-19T04:00:00.000Z');
const claimedAt = new Date('2026-09-19T04:00:05.000Z');

function sourceRequest(taskId) {
  return {
    requestId: `request:${taskId}`, taskId, sourceId: 'synthetic-source',
    sourceFamilyId: 'synthetic-family', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'SYNTHETIC_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digestObject({ endpoint: 'none' }),
  };
}

function controlState(overrides = {}) {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD', ...overrides,
  };
}

function proof(taskId) {
  const source = sourceRequest(taskId);
  const admitted = evaluateAdmission({ sourceRequest: source, controlState: controlState(), now: issuedAt, ttlSeconds: 300 });
  return { source, admissionProof: { sourceRequest: source, ...admitted } };
}

function clock(start = '2026-09-19T04:00:10.000Z') {
  let current = Date.parse(start);
  return () => {
    const value = new Date(current);
    current += 1000;
    return value;
  };
}

async function claimedFixture({ taskId = 'task:worker-1', maxAttempts = 3 } = {}) {
  const client = fakeAutonomousTaskClient();
  const { source, admissionProof } = proof(taskId);
  const initial = createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts,
    admissionRequestDigest: digestObject(source), now: issuedAt });
  await persistInitialTask(client, initial);
  const claimed = claimTask(initial, { workerId, leaseSeconds: 120, now: claimedAt });
  await persistTaskTransition(client, initial, claimed);
  return { client, task: claimed.task, admissionProof };
}

function registry(execute, handlerId = 'synthetic-test-handler-v1') {
  return createSyntheticHandlerRegistry([{ workflowType: 'synthetic-shadow', handlerId, execute }]);
}

function workerInput(fixture, overrides = {}) {
  return {
    task: fixture.task, workerId, leaseEpoch: fixture.task.leaseEpoch,
    admissionProof: fixture.admissionProof, controlState: controlState(),
    handlerRegistry: SYNTHETIC_HANDLER_REGISTRY_V1, timeoutMs: 100,
    retryDelaySeconds: 5, clock: clock(), ...overrides,
  };
}

test('registered synthetic handler starts, checkpoints and completes with a digest-bound receipt', async () => {
  const fixture = await claimedFixture();
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture));
  assert.equal(result.task.state, 'SUCCEEDED');
  assert.equal(result.task.revision, 4);
  assert.match(result.task.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.receipt.outcome, 'SUCCEEDED');
  assert.equal(result.receipt.transitionReceiptDigests.length, 3);
  assert.equal(result.receipt.externalEgress, false);
  assert.equal(result.receipt.credentialResolution, false);
  const { receiptDigest, ...unsigned } = result.receipt;
  assert.equal(receiptDigest, digestObject(unsigned));
  const verified = verifySyntheticExecutionReceipt(result.receipt);
  assert.equal(verified.receiptDigest, result.receipt.receiptDigest);
  assert.equal(digestObject(verified), digestObject(result.receipt));
  assert.equal(fixture.client.state.transitions.length, 4);
});

test('execution receipt verifier rejects tampering, extra fields and protected-gate escalation', async () => {
  const fixture = await claimedFixture({ taskId: 'task:receipt-verification' });
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture));
  assert.throws(() => verifySyntheticExecutionReceipt({ ...result.receipt, outcome: 'CANCELLED' }),
    /TASK_EXECUTION_RECEIPT_STATE_INVALID|TASK_EXECUTION_RECEIPT_DIGEST_INVALID/);
  assert.throws(() => verifySyntheticExecutionReceipt({ ...result.receipt, unexpected: true }),
    /TASK_EXECUTION_RECEIPT_SHAPE_INVALID/);
  assert.throws(() => verifySyntheticExecutionReceipt({ ...result.receipt, production: 'ACTIVE' }),
    /TASK_EXECUTION_RECEIPT_PROTECTED_GATE_INVALID/);
});

test('changed kill state denies preflight before start or handler invocation', async () => {
  const fixture = await claimedFixture({ taskId: 'task:kill-denied' });
  let invoked = false;
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    controlState: controlState({ globalKill: true, killEpoch: 2 }),
    handlerRegistry: registry(async () => { invoked = true; return { outcome: 'SUCCEEDED' }; }),
  })), /TASK_WORKER_PREFLIGHT_DENIED:OPS_GLOBAL_KILL_ENGAGED/);
  assert.equal(invoked, false);
  assert.equal(fixture.client.state.transitions.length, 1);
});

test('tampered admission digest fails before any execution transition', async () => {
  const fixture = await claimedFixture({ taskId: 'task:proof-tamper' });
  fixture.admissionProof.sourceRequest = { ...fixture.admissionProof.sourceRequest, region: 'ALTERED' };
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture)),
    /TASK_WORKER_ADMISSION_DIGEST_MISMATCH/);
  assert.equal(fixture.client.state.transitions.length, 1);
});

test('handler failure schedules a bounded retry and records no raw error material', async () => {
  const fixture = await claimedFixture({ taskId: 'task:handler-failure' });
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async () => { throw new Error('private internal detail'); }),
  }));
  assert.equal(result.task.state, 'RETRY_SCHEDULED');
  assert.equal(result.receipt.outcome, 'RETRY_SCHEDULED');
  assert.equal(result.receipt.errorCode, 'TASK_HANDLER_FAILED');
  assert.equal(JSON.stringify(result).includes('private internal detail'), false);
});

test('invalid handler result is a typed retry reason', async () => {
  const fixture = await claimedFixture({ taskId: 'task:invalid-result' });
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async () => ({ outcome: 'UNREGISTERED' })),
  }));
  assert.equal(result.task.state, 'RETRY_SCHEDULED');
  assert.equal(result.receipt.errorCode, 'TASK_HANDLER_RESULT_INVALID');
});

test('detached accepted checkpoint settles before successful final transition', async () => {
  const fixture = await claimedFixture({ taskId: 'task:detached-checkpoint' });
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async context => {
      context.checkpoint(digestObject({ checkpoint: 'detached-but-accepted' }));
      return { outcome: 'SUCCEEDED' };
    }),
  }));
  assert.equal(result.task.state, 'SUCCEEDED');
  assert.equal(result.task.revision, 4);
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition),
    ['CLAIM', 'START', 'CHECKPOINT', 'COMPLETE']);
});

test('checkpoint persistence failure is not hidden as an ordinary handler retry', async () => {
  const fixture = await claimedFixture({ taskId: 'task:checkpoint-persistence-failure' });
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async context => {
      fixture.client.state.forceRevisionConflictTaskIds.add(fixture.task.taskId);
      await context.checkpoint(digestObject({ checkpoint: 'must-fail' }));
      return { outcome: 'SUCCEEDED' };
    }),
  })), /TASK_LEDGER_REVISION_CONFLICT/);
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition), ['CLAIM', 'START']);
  assert.equal(fixture.client.state.snapshots.at(-1).state, 'RUNNING');
});

test('timeout aborts the context and schedules retry', async () => {
  const fixture = await claimedFixture({ taskId: 'task:timeout' });
  let observedSignal;
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    timeoutMs: 5,
    handlerRegistry: registry(async context => {
      observedSignal = context.signal;
      return new Promise(() => {});
    }),
  }));
  assert.equal(observedSignal.aborted, true);
  assert.equal(result.task.state, 'RETRY_SCHEDULED');
  assert.equal(result.receipt.errorCode, 'TASK_EXECUTION_TIMEOUT');
});

test('external cancellation during execution cancels after accepted checkpoints settle', async () => {
  const fixture = await claimedFixture({ taskId: 'task:cancel-running' });
  const cancellation = new AbortController();
  const resultPromise = executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    cancellationSignal: cancellation.signal,
    handlerRegistry: registry(async context => {
      const pending = context.checkpoint(digestObject({ checkpoint: 'accepted-before-cancel' }));
      cancellation.abort();
      await pending;
      return new Promise(() => {});
    }),
  }));
  const result = await resultPromise;
  assert.equal(result.task.state, 'CANCELLED');
  assert.equal(result.receipt.outcome, 'CANCELLED');
  assert.equal(result.receipt.errorCode, 'TASK_EXECUTION_CANCELLED');
  assert.equal(result.receipt.transitionReceiptDigests.length, 3);
});

test('pre-cancelled signal cancels leased task without starting handler', async () => {
  const fixture = await claimedFixture({ taskId: 'task:cancel-before' });
  const cancellation = new AbortController();
  cancellation.abort();
  let invoked = false;
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    cancellationSignal: cancellation.signal,
    handlerRegistry: registry(async () => { invoked = true; return { outcome: 'SUCCEEDED' }; }),
  }));
  assert.equal(invoked, false);
  assert.equal(result.task.state, 'CANCELLED');
  assert.equal(result.receipt.errorCode, 'TASK_EXECUTION_CANCELLED_BEFORE_START');
  assert.equal(result.receipt.transitionReceiptDigests.length, 1);
});

test('final failed attempt quarantines instead of retrying forever', async () => {
  const fixture = await claimedFixture({ taskId: 'task:worker-exhausted', maxAttempts: 1 });
  const result = await executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async () => { throw new Error('failure'); }),
  }));
  assert.equal(result.task.state, 'QUARANTINED');
  assert.equal(result.receipt.outcome, 'QUARANTINED');
  assert.equal(result.task.lastReason, 'TASK_ATTEMPTS_EXHAUSTED');
});

test('start persistence conflict prevents handler invocation', async () => {
  const fixture = await claimedFixture({ taskId: 'task:start-conflict' });
  fixture.client.state.forceRevisionConflictTaskIds.add(fixture.task.taskId);
  let invoked = false;
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: registry(async () => { invoked = true; return { outcome: 'SUCCEEDED' }; }),
  })), /TASK_LEDGER_REVISION_CONFLICT/);
  assert.equal(invoked, false);
  assert.equal(fixture.client.state.transitions.length, 1);
});

test('untrusted registry and non-synthetic worker fail before database access', async () => {
  const fixture = await claimedFixture({ taskId: 'task:untrusted' });
  const callCount = fixture.client.state.calls.length;
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    handlerRegistry: {},
  })), /TASK_WORKER_HANDLER_REGISTRY_UNTRUSTED/);
  await assert.rejects(executeClaimedSyntheticTask(fixture.client, workerInput(fixture, {
    workerId: 'provider-worker:live',
  })), /TASK_WORKER_NAMESPACE_DENIED/);
  assert.equal(fixture.client.state.calls.length, callCount);
});
