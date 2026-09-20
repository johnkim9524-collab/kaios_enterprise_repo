import assert from 'node:assert/strict';
import test from 'node:test';
import { createTask, claimTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask, persistTaskTransition } from '../src/autonomous-control/task-ledger-v1.mjs';
import {
  claimNextSyntheticTask, recoverNextExpiredSyntheticLease,
} from '../src/autonomous-control/task-scheduler-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const admissionRequestDigest = `sha256:${'b'.repeat(64)}`;
const createdAt = new Date('2026-09-19T03:00:00.000Z');
const claimAt = new Date('2026-09-19T03:01:00.000Z');

function task(taskId, { priority = 100, availableAt, maxAttempts = 3, workflowType = 'synthetic-shadow' } = {}) {
  return createTask({ taskId, workflowType, maxAttempts, priority, availableAt,
    admissionRequestDigest, now: createdAt });
}

async function store(client, ...tasks) {
  for (const value of tasks) await persistInitialTask(client, value);
}

test('scheduler claims the highest-priority available synthetic task deterministically', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, task('task:later-priority', { priority: 50 }), task('task:first-priority', { priority: 10 }));
  const result = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local-1', leaseSeconds: 120, now: claimAt,
  });
  assert.equal(result.state, 'CLAIMED');
  assert.equal(result.task.taskId, 'task:first-priority');
  assert.equal(result.task.state, 'LEASED');
  assert.equal(result.task.leaseEpoch, 1);
  assert.equal(result.externalEgress, false);
  assert.equal(result.production, 'HOLD');
});

test('scheduler ignores future and non-synthetic tasks', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client,
    task('task:future', { availableAt: '2026-09-19T04:00:00.000Z' }),
    task('task:provider-live', { workflowType: 'provider-live' }),
  );
  const result = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local-1', leaseSeconds: 120, now: claimAt,
  });
  assert.equal(result.state, 'IDLE');
  assert.equal(result.task, null);
  assert.equal(client.state.transitions.length, 0);
});

test('a claimed task is not offered to a second scheduler', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, task('task:single'));
  assert.equal((await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:one', leaseSeconds: 120, now: claimAt,
  })).state, 'CLAIMED');
  const second = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:two', leaseSeconds: 120, now: claimAt,
  });
  assert.equal(second.state, 'IDLE');
  assert.equal(client.state.transitions.length, 1);
});

test('scheduler skips a CAS-contended candidate and claims the next bounded candidate', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, task('task:contended', { priority: 1 }), task('task:next', { priority: 2 }));
  client.state.forceRevisionConflictTaskIds.add('task:contended');
  const result = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local-1', leaseSeconds: 120, now: claimAt, maxCandidates: 2,
  });
  assert.equal(result.state, 'CLAIMED');
  assert.equal(result.task.taskId, 'task:next');
  assert.equal(result.contendedCandidates, 1);
  assert.equal(result.examinedCandidates, 2);
});

test('all bounded CAS conflicts return retry without weakening the gate', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, task('task:contended-only'));
  client.state.forceRevisionConflictTaskIds.add('task:contended-only');
  const result = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local-1', leaseSeconds: 120, now: claimAt, maxCandidates: 1,
  });
  assert.equal(result.state, 'CONTENDED_RETRY');
  assert.equal(result.task, null);
  assert.equal(result.remoteWorkerActivation, 'HOLD');
  assert.equal(client.state.transitions.length, 0);
});

test('corrupted snapshot evidence fails closed and is never treated as ordinary contention', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, task('task:corrupted'));
  client.state.snapshots[0].task_json.priority = 999;
  await assert.rejects(claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local-1', leaseSeconds: 120, now: claimAt,
  }), /TASK_LEDGER_SNAPSHOT_ROW_MISMATCH/);
  assert.equal(client.state.transitions.length, 0);
  assert.equal(client.state.snapshots.length, 1);
});

test('expired lease is recovered into retry with a cleared lease', async () => {
  const client = fakeAutonomousTaskClient();
  const initial = task('task:expired');
  await store(client, initial);
  const leased = claimTask(initial, { workerId: 'synthetic-worker:old', leaseSeconds: 10, now: claimAt });
  await persistTaskTransition(client, initial, leased);
  const result = await recoverNextExpiredSyntheticLease(client, {
    now: new Date('2026-09-19T03:01:11.000Z'), retryDelaySeconds: 5,
  });
  assert.equal(result.state, 'RECOVERED');
  assert.equal(result.task.state, 'RETRY_SCHEDULED');
  assert.equal(result.task.leaseOwner, null);
  assert.equal(result.task.lastReason, 'TASK_LEASE_EXPIRED_RECOVERED');
});

test('expired final attempt is quarantined rather than retried forever', async () => {
  const client = fakeAutonomousTaskClient();
  const initial = task('task:exhausted', { maxAttempts: 1 });
  await store(client, initial);
  const leased = claimTask(initial, { workerId: 'synthetic-worker:old', leaseSeconds: 10, now: claimAt });
  await persistTaskTransition(client, initial, leased);
  const result = await recoverNextExpiredSyntheticLease(client, {
    now: new Date('2026-09-19T03:01:11.000Z'),
  });
  assert.equal(result.state, 'QUARANTINED');
  assert.equal(result.task.state, 'QUARANTINED');
  assert.equal(result.task.lastReason, 'TASK_ATTEMPTS_EXHAUSTED');
});

test('active lease is not recovered early', async () => {
  const client = fakeAutonomousTaskClient();
  const initial = task('task:active');
  await store(client, initial);
  const leased = claimTask(initial, { workerId: 'synthetic-worker:old', leaseSeconds: 120, now: claimAt });
  await persistTaskTransition(client, initial, leased);
  const result = await recoverNextExpiredSyntheticLease(client, {
    now: new Date('2026-09-19T03:01:30.000Z'),
  });
  assert.equal(result.state, 'IDLE');
  assert.equal(client.state.transitions.length, 1);
});

test('unsafe worker, lease, retry and scan inputs fail before database access', async () => {
  const client = fakeAutonomousTaskClient();
  await assert.rejects(claimNextSyntheticTask(client, {
    workerId: 'provider-worker:live', leaseSeconds: 120, now: claimAt,
  }), /TASK_SCHEDULER_WORKER_SCOPE_DENIED/);
  await assert.rejects(claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local', leaseSeconds: 120, now: claimAt, maxCandidates: 17,
  }), /TASK_SCHEDULER_CANDIDATE_LIMIT_INVALID/);
  await assert.rejects(claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:local', leaseSeconds: 3601, now: claimAt,
  }), /TASK_SCHEDULER_LEASE_SECONDS_INVALID/);
  await assert.rejects(recoverNextExpiredSyntheticLease(client, {
    retryDelaySeconds: 86401, now: claimAt,
  }), /TASK_SCHEDULER_RETRY_DELAY_INVALID/);
  assert.equal(client.state.calls.length, 0);
});
