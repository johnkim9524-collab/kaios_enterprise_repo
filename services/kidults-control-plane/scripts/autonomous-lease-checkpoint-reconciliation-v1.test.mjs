import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import {
  checkpointTask, completeTask, createTask, startTask,
} from '../src/autonomous-control/task-lifecycle-v1.mjs';
import {
  persistInitialTask, persistTaskTransition, taskFromSnapshotRow,
} from '../src/autonomous-control/task-ledger-v1.mjs';
import {
  claimNextSyntheticTask, recoverNextExpiredSyntheticLease,
} from '../src/autonomous-control/task-scheduler-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const at = value => new Date(`2026-09-19T03:01:${value}.000Z`);

async function apply(client, before, result) {
  await persistTaskTransition(client, before, result);
  return result.task;
}

test('checkpoint survives agent loss and successor lease completes canonical truth', async () => {
  const client = fakeAutonomousTaskClient();
  const initial = createTask({ taskId: 'task:reconcile-agent-loss',
    workflowType: 'synthetic-shadow', maxAttempts: 3,
    admissionRequestDigest: digestObject({ request: 'reconcile-agent-loss' }),
    now: new Date('2026-09-19T03:00:00.000Z') });
  await persistInitialTask(client, initial);

  const firstLease = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:first', leaseSeconds: 10, now: at('00'),
  });
  assert.equal(firstLease.state, 'CLAIMED');
  let current = await apply(client, firstLease.task,
    startTask(firstLease.task, { workerId: 'synthetic-worker:first',
      leaseEpoch: 1, now: at('01') }));
  const checkpointDigest = digestObject({ cursor: 41, source: 'synthetic' });
  current = await apply(client, current, checkpointTask(current, {
    workerId: 'synthetic-worker:first', leaseEpoch: 1, checkpointDigest, now: at('02'),
  }));

  const recovered = await recoverNextExpiredSyntheticLease(client, {
    now: at('11'), retryDelaySeconds: 0,
  });
  assert.equal(recovered.state, 'RECOVERED');
  assert.equal(recovered.task.state, 'RETRY_SCHEDULED');
  assert.equal(recovered.task.checkpointDigest, checkpointDigest);
  assert.equal(recovered.task.leaseOwner, null);

  const successor = await claimNextSyntheticTask(client, {
    workerId: 'synthetic-worker:successor', leaseSeconds: 10, now: at('12'),
  });
  assert.equal(successor.state, 'CLAIMED');
  assert.equal(successor.task.leaseEpoch, 2);
  assert.equal(successor.task.checkpointDigest, checkpointDigest);
  current = await apply(client, successor.task, startTask(successor.task, {
    workerId: 'synthetic-worker:successor', leaseEpoch: 2, now: at('13'),
  }));
  assert.throws(() => checkpointTask(current, {
    workerId: 'synthetic-worker:first', leaseEpoch: 1,
    checkpointDigest: digestObject({ stale: true }), now: at('13'),
  }), /TASK_LEASE_FENCE_MISMATCH/);
  current = await apply(client, current, completeTask(current, {
    workerId: 'synthetic-worker:successor', leaseEpoch: 2, now: at('14'),
  }));
  const latestRow = client.state.snapshots
    .filter(row => row.task_id === initial.taskId)
    .sort((left, right) => right.revision - left.revision)[0];
  const canonicalTruth = taskFromSnapshotRow(latestRow);
  assert.equal(canonicalTruth.state, 'SUCCEEDED');
  assert.equal(canonicalTruth.leaseEpoch, 2);
  assert.equal(canonicalTruth.leaseOwner, null);
  assert.equal(canonicalTruth.checkpointDigest, checkpointDigest);
  assert.equal(digestObject(canonicalTruth), latestRow.task_digest);
  assert.deepEqual(client.state.transitions.map(row => row.transition), [
    'CLAIM', 'START', 'CHECKPOINT', 'RECOVER_EXPIRED_LEASE', 'CLAIM', 'START', 'COMPLETE',
  ]);
});
