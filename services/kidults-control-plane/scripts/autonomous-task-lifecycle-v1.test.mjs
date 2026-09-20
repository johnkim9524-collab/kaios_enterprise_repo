import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import {
  cancelTask,
  checkpointTask,
  claimTask,
  completeTask,
  createTask,
  failTask,
  releaseLeasedTaskForRetry,
  recoverExpiredLease,
  scheduleRetry,
  startTask,
  validateTask,
} from '../src/autonomous-control/task-lifecycle-v1.mjs';

const at = value => new Date(value);
const digest = value => digestObject({ value });

function pending(overrides = {}) {
  return createTask({
    taskId: 'task-001', workflowType: 'SYNTHETIC_KIR_CONTROL', maxAttempts: 2,
    priority: 10, admissionRequestDigest: digest('admission-request'),
    now: at('2026-09-19T00:00:00.000Z'), ...overrides,
  });
}

function running(overrides = {}) {
  const task = pending(overrides);
  const claimed = claimTask(task, { workerId: 'worker-001', leaseSeconds: 60, now: at('2026-09-19T00:00:01.000Z') });
  return startTask(claimed.task, { workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:02.000Z') });
}

test('task claim and start are revisioned and fenced by worker and lease epoch', () => {
  const task = pending();
  const claimed = claimTask(task, { workerId: 'worker-001', leaseSeconds: 60, now: at('2026-09-19T00:00:01.000Z') });
  assert.equal(claimed.task.state, 'LEASED');
  assert.equal(claimed.task.attempt, 1);
  assert.equal(claimed.task.leaseEpoch, 1);
  assert.equal(claimed.task.revision, 1);
  assert.equal(claimed.receipt.fromState, 'PENDING');
  assert.equal(claimed.receipt.toState, 'LEASED');
  const started = startTask(claimed.task, { workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:02.000Z') });
  assert.equal(started.task.state, 'RUNNING');
  assert.equal(started.task.revision, 2);
  assert.equal(started.receipt.externalEgress, false);
});

test('checkpoint is immutable-digest bound and does not release the lease', () => {
  const started = running();
  const checkpoint = checkpointTask(started.task, {
    workerId: 'worker-001', leaseEpoch: 1, checkpointDigest: digest('checkpoint-001'),
    now: at('2026-09-19T00:00:03.000Z'),
  });
  assert.equal(checkpoint.task.state, 'RUNNING');
  assert.equal(checkpoint.task.checkpointDigest, digest('checkpoint-001'));
  assert.equal(checkpoint.task.leaseOwner, 'worker-001');
  assert.notEqual(checkpoint.receipt.beforeDigest, checkpoint.receipt.afterDigest);
});

test('successful completion clears the lease and makes the task terminal', () => {
  const started = running();
  const completed = completeTask(started.task, {
    workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:03.000Z'),
  });
  assert.equal(completed.task.state, 'SUCCEEDED');
  assert.equal(completed.task.leaseOwner, null);
  assert.equal(completed.task.leaseExpiresAt, null);
  assert.throws(() => cancelTask(completed.task, {
    reason: 'LATE_CANCEL', now: at('2026-09-19T00:00:04.000Z'),
  }), /TASK_TERMINAL_IMMUTABLE/);
});

test('non-retryable failure clears the lease and records a terminal reason', () => {
  const started = running();
  const failed = failTask(started.task, {
    workerId: 'worker-001', leaseEpoch: 1, reason: 'NON_RETRYABLE_INPUT',
    now: at('2026-09-19T00:00:03.000Z'),
  });
  assert.equal(failed.task.state, 'FAILED');
  assert.equal(failed.task.lastReason, 'NON_RETRYABLE_INPUT');
  assert.equal(failed.task.leaseOwner, null);
  assert.equal(failed.receipt.transition, 'FAIL_TERMINAL');
});

for (const [name, workerId, leaseEpoch, expected] of [
  ['wrong worker', 'worker-002', 1, 'TASK_LEASE_FENCE_MISMATCH'],
  ['stale epoch', 'worker-001', 2, 'TASK_LEASE_FENCE_MISMATCH'],
]) {
  test(`${name} cannot checkpoint or complete a task`, () => {
    const started = running();
    assert.throws(() => checkpointTask(started.task, {
      workerId, leaseEpoch, checkpointDigest: digest('forged-checkpoint'),
      now: at('2026-09-19T00:00:03.000Z'),
    }), new RegExp(expected));
    assert.throws(() => completeTask(started.task, {
      workerId, leaseEpoch, now: at('2026-09-19T00:00:03.000Z'),
    }), new RegExp(expected));
  });
}

test('expired lease cannot complete and is recovered to a scheduled retry', () => {
  const task = pending();
  const claimed = claimTask(task, { workerId: 'worker-001', leaseSeconds: 10, now: at('2026-09-19T00:00:01.000Z') });
  const started = startTask(claimed.task, { workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:02.000Z') });
  assert.throws(() => completeTask(started.task, {
    workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:11.000Z'),
  }), /TASK_LEASE_EXPIRED/);
  const recovered = recoverExpiredLease(started.task, {
    retryDelaySeconds: 5, now: at('2026-09-19T00:00:11.000Z'),
  });
  assert.equal(recovered.task.state, 'RETRY_SCHEDULED');
  assert.equal(recovered.task.leaseOwner, null);
  assert.equal(recovered.task.attempt, 1);
});

test('retry preserves checkpoint and requires a fresh lease epoch', () => {
  const started = running();
  const checkpoint = checkpointTask(started.task, {
    workerId: 'worker-001', leaseEpoch: 1, checkpointDigest: digest('checkpoint-001'),
    now: at('2026-09-19T00:00:03.000Z'),
  });
  const retried = scheduleRetry(checkpoint.task, {
    workerId: 'worker-001', leaseEpoch: 1, reason: 'TRANSIENT_FAILURE', delaySeconds: 5,
    now: at('2026-09-19T00:00:04.000Z'),
  });
  assert.equal(retried.task.state, 'RETRY_SCHEDULED');
  assert.equal(retried.task.checkpointDigest, digest('checkpoint-001'));
  assert.throws(() => claimTask(retried.task, {
    workerId: 'worker-002', leaseSeconds: 60, now: at('2026-09-19T00:00:08.000Z'),
  }), /TASK_NOT_AVAILABLE/);
  const reclaimed = claimTask(retried.task, {
    workerId: 'worker-002', leaseSeconds: 60, now: at('2026-09-19T00:00:09.000Z'),
  });
  assert.equal(reclaimed.task.attempt, 2);
  assert.equal(reclaimed.task.leaseEpoch, 2);
  assert.equal(reclaimed.task.checkpointDigest, digest('checkpoint-001'));
});

test('attempt exhaustion quarantines instead of creating an infinite retry', () => {
  const first = running({ maxAttempts: 1 });
  const exhausted = scheduleRetry(first.task, {
    workerId: 'worker-001', leaseEpoch: 1, reason: 'TRANSIENT_FAILURE', delaySeconds: 0,
    now: at('2026-09-19T00:00:03.000Z'),
  });
  assert.equal(exhausted.task.state, 'QUARANTINED');
  assert.equal(exhausted.task.lastReason, 'TASK_ATTEMPTS_EXHAUSTED');
  assert.equal(exhausted.receipt.transition, 'QUARANTINE_EXHAUSTED');
});

test('leased task can be safely returned before start with the same lease fence', () => {
  const claimed = claimTask(pending(), {
    workerId: 'worker-001', leaseSeconds: 60, now: at('2026-09-19T00:00:01.000Z'),
  });
  const released = releaseLeasedTaskForRetry(claimed.task, {
    workerId: 'worker-001', leaseEpoch: 1, reason: 'TASK_ADMISSION_PROOF_UNAVAILABLE',
    delaySeconds: 5, now: at('2026-09-19T00:00:02.000Z'),
  });
  assert.equal(released.task.state, 'RETRY_SCHEDULED');
  assert.equal(released.task.leaseOwner, null);
  assert.equal(released.receipt.transition, 'RELEASE_LEASE_RETRY');
  assert.throws(() => releaseLeasedTaskForRetry(claimed.task, {
    workerId: 'worker-002', leaseEpoch: 1, reason: 'TASK_ADMISSION_PROOF_UNAVAILABLE',
    delaySeconds: 0, now: at('2026-09-19T00:00:02.000Z'),
  }), /TASK_LEASE_FENCE_MISMATCH/);
});

test('cancellation clears an active lease and blocks delayed workers', () => {
  const started = running();
  const cancelled = cancelTask(started.task, {
    reason: 'OPERATOR_CANCELLED', now: at('2026-09-19T00:00:03.000Z'),
  });
  assert.equal(cancelled.task.state, 'CANCELLED');
  assert.equal(cancelled.task.leaseOwner, null);
  assert.throws(() => completeTask(cancelled.task, {
    workerId: 'worker-001', leaseEpoch: 1, now: at('2026-09-19T00:00:04.000Z'),
  }), /TASK_TERMINAL_IMMUTABLE/);
});

test('same transition input and clock produce identical task and receipt', () => {
  const task = pending();
  const options = { workerId: 'worker-001', leaseSeconds: 60, now: at('2026-09-19T00:00:01.000Z') };
  assert.deepEqual(claimTask(task, options), claimTask(task, options));
});

test('task rejects hidden fields, accessors and malformed lease combinations', () => {
  assert.throws(() => validateTask({ ...pending(), hidden: true }), /TASK_SHAPE_INVALID/);
  const accessor = { ...pending() };
  Object.defineProperty(accessor, 'lastReason', { enumerable: true, get: () => 'FORGED' });
  assert.throws(() => validateTask(accessor), /COMMON_CONTROL_JSON_DESCRIPTOR_INVALID/);
  assert.throws(() => validateTask({ ...pending(), state: 'RUNNING' }), /TASK_LEASE_STATE_INVALID/);
});
