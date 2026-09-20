import { requireIdentifier, requireValue } from '../common-control/canonical-v1.mjs';
import { claimTask, recoverExpiredLease } from './task-lifecycle-v1.mjs';
import { persistTaskTransition, taskFromSnapshotRow } from './task-ledger-v1.mjs';

const SYNTHETIC_WORKFLOW = 'synthetic-shadow';
const SYNTHETIC_WORKER = /^synthetic-worker:[A-Za-z0-9][A-Za-z0-9._-]{0,110}$/;
const CONTENTION_CODES = new Set([
  'TASK_LEDGER_STALE_REVISION', 'TASK_LEDGER_REVISION_CONFLICT',
  'TASK_LEDGER_TRANSITION_CONFLICT',
]);

const CLAIM_CANDIDATES_SQL = `/* AUTONOMOUS_SCHEDULER_CLAIM_CANDIDATES_V1 */
WITH latest AS (
  SELECT DISTINCT ON (task_id) *
  FROM kidults_control.autonomous_task_snapshots
  ORDER BY task_id, revision DESC
)
SELECT * FROM latest
WHERE state IN ('PENDING', 'RETRY_SCHEDULED')
  AND task_json->>'workflowType' = 'synthetic-shadow'
  AND (task_json->>'availableAt')::timestamptz <= $1::timestamptz
  AND (task_json->>'attempt')::integer < (task_json->>'maxAttempts')::integer
ORDER BY (task_json->>'priority')::integer ASC,
  (task_json->>'availableAt')::timestamptz ASC, task_id ASC
LIMIT $2`;

const EXPIRED_LEASES_SQL = `/* AUTONOMOUS_SCHEDULER_EXPIRED_LEASES_V1 */
WITH latest AS (
  SELECT DISTINCT ON (task_id) *
  FROM kidults_control.autonomous_task_snapshots
  ORDER BY task_id, revision DESC
)
SELECT * FROM latest
WHERE state IN ('LEASED', 'RUNNING')
  AND task_json->>'workflowType' = 'synthetic-shadow'
  AND task_json->>'leaseExpiresAt' IS NOT NULL
  AND (task_json->>'leaseExpiresAt')::timestamptz <= $1::timestamptz
ORDER BY (task_json->>'leaseExpiresAt')::timestamptz ASC, task_id ASC
LIMIT $2`;

function schedulerClock(now) {
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'TASK_SCHEDULER_CLOCK_INVALID');
  return now;
}

function candidateLimit(value = 8) {
  requireValue(Number.isSafeInteger(value) && value >= 1 && value <= 16, 'TASK_SCHEDULER_CANDIDATE_LIMIT_INVALID');
  return value;
}

function boundedInteger(value, minimum, maximum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= maximum, code);
  return value;
}

function assertClient(client) {
  requireValue(client && typeof client.query === 'function', 'TASK_SCHEDULER_CLIENT_INVALID');
}

function assertSyntheticTask(task) {
  requireValue(task.workflowType === SYNTHETIC_WORKFLOW, 'TASK_SCHEDULER_NON_SYNTHETIC_TASK_DENIED');
  return task;
}

function isContention(error) { return error instanceof Error && CONTENTION_CODES.has(error.message); }

function boundary(state, detail = {}) {
  return {
    state, ...detail, scope: 'LOCAL_SYNTHETIC_SHADOW_ONLY', externalEgress: false,
    credentialResolution: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

export async function claimNextSyntheticTask(client, {
  workerId, leaseSeconds, now, maxCandidates = 8,
}) {
  assertClient(client);
  requireIdentifier(workerId, 'TASK_SCHEDULER_WORKER_ID_INVALID');
  requireValue(SYNTHETIC_WORKER.test(workerId), 'TASK_SCHEDULER_WORKER_SCOPE_DENIED');
  boundedInteger(leaseSeconds, 1, 3600, 'TASK_SCHEDULER_LEASE_SECONDS_INVALID');
  const observedAt = schedulerClock(now).toISOString();
  const limit = candidateLimit(maxCandidates);
  const candidates = await client.query(CLAIM_CANDIDATES_SQL, [observedAt, limit]);
  let contended = 0;
  for (const row of candidates.rows ?? []) {
    const before = assertSyntheticTask(taskFromSnapshotRow(row));
    const result = claimTask(before, { workerId, leaseSeconds, now });
    try {
      const persisted = await persistTaskTransition(client, before, result);
      return boundary('CLAIMED', {
        task: result.task, receipt: result.receipt, persistenceState: persisted.state,
        examinedCandidates: contended + 1, contendedCandidates: contended,
      });
    } catch (error) {
      if (!isContention(error)) throw error;
      contended += 1;
    }
  }
  return boundary(contended ? 'CONTENDED_RETRY' : 'IDLE', {
    task: null, receipt: null, examinedCandidates: (candidates.rows ?? []).length,
    contendedCandidates: contended,
  });
}

export async function recoverNextExpiredSyntheticLease(client, {
  now, retryDelaySeconds = 0, maxCandidates = 8,
}) {
  assertClient(client);
  boundedInteger(retryDelaySeconds, 0, 86400, 'TASK_SCHEDULER_RETRY_DELAY_INVALID');
  const observedAt = schedulerClock(now).toISOString();
  const limit = candidateLimit(maxCandidates);
  const candidates = await client.query(EXPIRED_LEASES_SQL, [observedAt, limit]);
  let contended = 0;
  for (const row of candidates.rows ?? []) {
    const before = assertSyntheticTask(taskFromSnapshotRow(row));
    const result = recoverExpiredLease(before, { retryDelaySeconds, now });
    try {
      const persisted = await persistTaskTransition(client, before, result);
      return boundary(result.task.state === 'QUARANTINED' ? 'QUARANTINED' : 'RECOVERED', {
        task: result.task, receipt: result.receipt, persistenceState: persisted.state,
        examinedCandidates: contended + 1, contendedCandidates: contended,
      });
    } catch (error) {
      if (!isContention(error)) throw error;
      contended += 1;
    }
  }
  return boundary(contended ? 'CONTENDED_RETRY' : 'IDLE', {
    task: null, receipt: null, examinedCandidates: (candidates.rows ?? []).length,
    contendedCandidates: contended,
  });
}
