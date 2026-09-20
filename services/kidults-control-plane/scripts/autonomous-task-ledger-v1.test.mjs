import assert from 'node:assert/strict';
import test from 'node:test';
import { createTask, claimTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask, persistTaskTransition } from '../src/autonomous-control/task-ledger-v1.mjs';
import { fakeAutonomousTaskClient as fakeClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const now = new Date('2026-09-19T00:00:00.000Z');
const later = new Date('2026-09-19T00:01:00.000Z');

function fixture() {
  const task = createTask({ taskId: 'task:ledger-1', workflowType: 'synthetic-shadow', maxAttempts: 3,
    admissionRequestDigest: digest, now });
  return { task, claimed: claimTask(task, { workerId: 'worker:local-1', leaseSeconds: 300, now: later }) };
}

test('initial snapshot is recorded and exact replay is idempotent', async () => {
  const client = fakeClient();
  const { task } = fixture();
  assert.equal((await persistInitialTask(client, task)).state, 'RECORDED');
  assert.equal((await persistInitialTask(client, task)).state, 'IDEMPOTENT_REPLAY');
  assert.equal(client.state.snapshots.length, 1);
  assert.equal(client.state.transitions.length, 0);
});

test('conflicting initial snapshot rolls back and holds', async () => {
  const client = fakeClient();
  const { task } = fixture();
  await persistInitialTask(client, task);
  const conflict = { ...task, priority: task.priority + 1 };
  await assert.rejects(persistInitialTask(client, conflict), /TASK_LEDGER_INITIAL_CONFLICT/);
  assert.equal(client.state.snapshots.length, 1);
  assert.equal(client.state.calls.at(-1), 'ROLLBACK');
});

test('transition snapshot and receipt commit atomically and replay exactly', async () => {
  const client = fakeClient();
  const { task, claimed } = fixture();
  await persistInitialTask(client, task);
  assert.equal((await persistTaskTransition(client, task, claimed)).state, 'RECORDED');
  assert.equal(client.state.snapshots.length, 2);
  assert.equal(client.state.transitions.length, 1);
  assert.equal((await persistTaskTransition(client, task, claimed)).state, 'IDEMPOTENT_REPLAY');
  assert.equal(client.state.snapshots.length, 2);
  assert.equal(client.state.transitions.length, 1);
});

test('stale writer and divergent same revision fail closed with rollback', async () => {
  const client = fakeClient();
  const { task, claimed } = fixture();
  await persistInitialTask(client, task);
  await persistTaskTransition(client, task, claimed);
  const alternate = claimTask(task, { workerId: 'worker:local-2', leaseSeconds: 300, now: later });
  await assert.rejects(persistTaskTransition(client, task, alternate), /TASK_LEDGER_STALE_REVISION/);
  assert.equal(client.state.snapshots.length, 2);
  assert.equal(client.state.transitions.length, 1);
  assert.equal(client.state.calls.at(-1), 'ROLLBACK');
});

test('tampered receipt is rejected before transaction begins', async () => {
  const client = fakeClient();
  const { task, claimed } = fixture();
  const tampered = { ...claimed, receipt: { ...claimed.receipt, reason: 'TAMPERED_REASON' } };
  await assert.rejects(persistTaskTransition(client, task, tampered), /TASK_LEDGER_RECEIPT_DIGEST_MISMATCH/);
  assert.equal(client.state.calls.length, 0);
});

test('failed receipt insert rolls back its snapshot', async () => {
  const client = fakeClient();
  const original = client.query.bind(client);
  const { task, claimed } = fixture();
  await persistInitialTask(client, task);
  client.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO kidults_control.autonomous_task_transitions')) return { rows: [] };
    return original(sql, params);
  };
  await assert.rejects(persistTaskTransition(client, task, claimed), /TASK_LEDGER_TRANSITION_CONFLICT/);
  assert.equal(client.state.snapshots.length, 1);
  assert.equal(client.state.transitions.length, 0);
});
