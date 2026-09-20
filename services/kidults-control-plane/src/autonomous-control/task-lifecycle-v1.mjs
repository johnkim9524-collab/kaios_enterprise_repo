import {
  digestObject,
  requireDigest,
  requireExactRecord,
  requireIdentifier,
  requireInstant,
  requireValue,
  snapshotJson,
} from '../common-control/canonical-v1.mjs';

export const TASK_KEYS = Object.freeze([
  'contractId', 'version', 'taskId', 'workflowType', 'state', 'revision', 'attempt',
  'maxAttempts', 'priority', 'availableAt', 'leaseOwner', 'leaseEpoch', 'leaseExpiresAt',
  'checkpointDigest', 'admissionRequestDigest', 'lastReason', 'createdAt', 'updatedAt',
]);
const STATES = new Set([
  'PENDING', 'LEASED', 'RUNNING', 'RETRY_SCHEDULED',
  'SUCCEEDED', 'FAILED', 'CANCELLED', 'QUARANTINED',
]);
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'QUARANTINED']);

function clock(now) {
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'TASK_CLOCK_INVALID');
  return now;
}

function integer(value, minimum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum, code);
  return value;
}

export function validateTask(input) {
  const task = snapshotJson(input);
  requireExactRecord(task, TASK_KEYS, 'TASK_SHAPE_INVALID');
  requireValue(task.contractId === 'kidults-autonomous-task-v1' && task.version === '1.0.0', 'TASK_CONTRACT_INVALID');
  requireIdentifier(task.taskId, 'TASK_ID_INVALID');
  requireIdentifier(task.workflowType, 'TASK_WORKFLOW_TYPE_INVALID');
  requireValue(STATES.has(task.state), 'TASK_STATE_INVALID');
  integer(task.revision, 0, 'TASK_REVISION_INVALID');
  integer(task.attempt, 0, 'TASK_ATTEMPT_INVALID');
  integer(task.maxAttempts, 1, 'TASK_MAX_ATTEMPTS_INVALID');
  requireValue(task.attempt <= task.maxAttempts, 'TASK_ATTEMPT_OVERFLOW');
  integer(task.priority, 0, 'TASK_PRIORITY_INVALID');
  requireInstant(task.availableAt, 'TASK_AVAILABLE_AT_INVALID');
  integer(task.leaseEpoch, 0, 'TASK_LEASE_EPOCH_INVALID');
  requireValue(task.leaseOwner === null || typeof task.leaseOwner === 'string', 'TASK_LEASE_OWNER_INVALID');
  if (task.leaseOwner !== null) requireIdentifier(task.leaseOwner, 'TASK_LEASE_OWNER_INVALID');
  requireValue(task.leaseExpiresAt === null || typeof task.leaseExpiresAt === 'string', 'TASK_LEASE_EXPIRY_INVALID');
  if (task.leaseExpiresAt !== null) requireInstant(task.leaseExpiresAt, 'TASK_LEASE_EXPIRY_INVALID');
  requireValue(task.checkpointDigest === null || typeof task.checkpointDigest === 'string', 'TASK_CHECKPOINT_INVALID');
  if (task.checkpointDigest !== null) requireDigest(task.checkpointDigest, 'TASK_CHECKPOINT_INVALID');
  requireDigest(task.admissionRequestDigest, 'TASK_ADMISSION_REQUEST_DIGEST_INVALID');
  requireValue(task.lastReason === null || typeof task.lastReason === 'string', 'TASK_REASON_INVALID');
  requireInstant(task.createdAt, 'TASK_CREATED_AT_INVALID');
  requireInstant(task.updatedAt, 'TASK_UPDATED_AT_INVALID');
  const leased = task.state === 'LEASED' || task.state === 'RUNNING';
  requireValue(leased === (task.leaseOwner !== null && task.leaseExpiresAt !== null), 'TASK_LEASE_STATE_INVALID');
  if (TERMINAL.has(task.state)) requireValue(task.leaseOwner === null && task.leaseExpiresAt === null, 'TASK_TERMINAL_LEASE_INVALID');
  return task;
}

function transitionReceipt(before, after, { transition, reason, workerId, observedAt }) {
  const unsigned = {
    contractId: 'kidults-autonomous-task-transition-receipt-v1', version: '1.0.0',
    taskId: before.taskId, transition, fromState: before.state, toState: after.state,
    fromRevision: before.revision, toRevision: after.revision,
    beforeDigest: digestObject(before), afterDigest: digestObject(after),
    workerId, leaseEpoch: after.leaseEpoch, reason, observedAt,
    externalEgress: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const receiptId = `task-transition:${digestObject(unsigned).slice('sha256:'.length)}`;
  const identified = { ...unsigned, receiptId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

function transition(input, patch, metadata) {
  const before = validateTask(input);
  requireValue(!TERMINAL.has(before.state), 'TASK_TERMINAL_IMMUTABLE');
  const updatedAt = clock(metadata.now).toISOString();
  requireValue(updatedAt >= before.updatedAt, 'TASK_CLOCK_REGRESSION');
  const after = validateTask({ ...before, ...patch, revision: before.revision + 1, updatedAt });
  return {
    task: after,
    receipt: transitionReceipt(before, after, {
      transition: metadata.transition,
      reason: metadata.reason,
      workerId: metadata.workerId ?? null,
      observedAt: updatedAt,
    }),
  };
}

function assertState(task, allowed, code) {
  requireValue(!TERMINAL.has(task.state), 'TASK_TERMINAL_IMMUTABLE');
  requireValue(allowed.includes(task.state), code);
}

function assertLease(task, workerId, leaseEpoch, now) {
  requireIdentifier(workerId, 'TASK_WORKER_ID_INVALID');
  integer(leaseEpoch, 1, 'TASK_LEASE_EPOCH_INVALID');
  requireValue(task.leaseOwner === workerId && task.leaseEpoch === leaseEpoch, 'TASK_LEASE_FENCE_MISMATCH');
  requireValue(requireInstant(task.leaseExpiresAt, 'TASK_LEASE_EXPIRY_INVALID') > clock(now), 'TASK_LEASE_EXPIRED');
}

export function createTask({ taskId, workflowType, maxAttempts, priority = 100, availableAt, admissionRequestDigest, now }) {
  const timestamp = clock(now).toISOString();
  const task = {
    contractId: 'kidults-autonomous-task-v1', version: '1.0.0',
    taskId, workflowType, state: 'PENDING', revision: 0, attempt: 0,
    maxAttempts, priority, availableAt: availableAt ?? timestamp,
    leaseOwner: null, leaseEpoch: 0, leaseExpiresAt: null, checkpointDigest: null,
    admissionRequestDigest, lastReason: 'TASK_CREATED', createdAt: timestamp, updatedAt: timestamp,
  };
  return validateTask(task);
}

export function claimTask(input, { workerId, leaseSeconds, now }) {
  const task = validateTask(input);
  assertState(task, ['PENDING', 'RETRY_SCHEDULED'], 'TASK_NOT_CLAIMABLE');
  requireValue(requireInstant(task.availableAt, 'TASK_AVAILABLE_AT_INVALID') <= clock(now), 'TASK_NOT_AVAILABLE');
  requireValue(task.attempt < task.maxAttempts, 'TASK_ATTEMPTS_EXHAUSTED');
  requireIdentifier(workerId, 'TASK_WORKER_ID_INVALID');
  integer(leaseSeconds, 1, 'TASK_LEASE_SECONDS_INVALID');
  requireValue(leaseSeconds <= 3600, 'TASK_LEASE_SECONDS_INVALID');
  return transition(task, {
    state: 'LEASED', attempt: task.attempt + 1, leaseOwner: workerId,
    leaseEpoch: task.leaseEpoch + 1,
    leaseExpiresAt: new Date(clock(now).getTime() + leaseSeconds * 1000).toISOString(),
    lastReason: 'TASK_LEASE_ACQUIRED',
  }, { transition: 'CLAIM', reason: 'TASK_LEASE_ACQUIRED', workerId, now });
}

export function startTask(input, { workerId, leaseEpoch, now }) {
  const task = validateTask(input);
  assertState(task, ['LEASED'], 'TASK_NOT_STARTABLE');
  assertLease(task, workerId, leaseEpoch, now);
  return transition(task, { state: 'RUNNING', lastReason: 'TASK_STARTED' },
    { transition: 'START', reason: 'TASK_STARTED', workerId, now });
}

export function checkpointTask(input, { workerId, leaseEpoch, checkpointDigest, now }) {
  const task = validateTask(input);
  assertState(task, ['RUNNING'], 'TASK_NOT_CHECKPOINTABLE');
  assertLease(task, workerId, leaseEpoch, now);
  requireDigest(checkpointDigest, 'TASK_CHECKPOINT_INVALID');
  return transition(task, { checkpointDigest, lastReason: 'TASK_CHECKPOINT_RECORDED' },
    { transition: 'CHECKPOINT', reason: 'TASK_CHECKPOINT_RECORDED', workerId, now });
}

export function completeTask(input, { workerId, leaseEpoch, now }) {
  const task = validateTask(input);
  assertState(task, ['RUNNING'], 'TASK_NOT_COMPLETABLE');
  assertLease(task, workerId, leaseEpoch, now);
  return transition(task, {
    state: 'SUCCEEDED', leaseOwner: null, leaseExpiresAt: null, lastReason: 'TASK_SUCCEEDED',
  }, { transition: 'COMPLETE', reason: 'TASK_SUCCEEDED', workerId, now });
}

export function failTask(input, { workerId, leaseEpoch, reason, now }) {
  const task = validateTask(input);
  assertState(task, ['RUNNING'], 'TASK_NOT_FAILABLE');
  assertLease(task, workerId, leaseEpoch, now);
  requireIdentifier(reason, 'TASK_FAILURE_REASON_INVALID');
  return transition(task, {
    state: 'FAILED', leaseOwner: null, leaseExpiresAt: null, lastReason: reason,
  }, { transition: 'FAIL_TERMINAL', reason, workerId, now });
}

export function scheduleRetry(input, { workerId, leaseEpoch, reason, delaySeconds, now }) {
  const task = validateTask(input);
  assertState(task, ['RUNNING'], 'TASK_NOT_RETRYABLE');
  assertLease(task, workerId, leaseEpoch, now);
  requireIdentifier(reason, 'TASK_RETRY_REASON_INVALID');
  integer(delaySeconds, 0, 'TASK_RETRY_DELAY_INVALID');
  requireValue(delaySeconds <= 86400, 'TASK_RETRY_DELAY_INVALID');
  const exhausted = task.attempt >= task.maxAttempts;
  return transition(task, {
    state: exhausted ? 'QUARANTINED' : 'RETRY_SCHEDULED',
    availableAt: new Date(clock(now).getTime() + delaySeconds * 1000).toISOString(),
    leaseOwner: null, leaseExpiresAt: null,
    lastReason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : reason,
  }, {
    transition: exhausted ? 'QUARANTINE_EXHAUSTED' : 'SCHEDULE_RETRY',
    reason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : reason, workerId, now,
  });
}

export function releaseLeasedTaskForRetry(input, { workerId, leaseEpoch, reason, delaySeconds, now }) {
  const task = validateTask(input);
  assertState(task, ['LEASED'], 'TASK_LEASE_NOT_RELEASABLE');
  assertLease(task, workerId, leaseEpoch, now);
  requireIdentifier(reason, 'TASK_RETRY_REASON_INVALID');
  integer(delaySeconds, 0, 'TASK_RETRY_DELAY_INVALID');
  requireValue(delaySeconds <= 86400, 'TASK_RETRY_DELAY_INVALID');
  const exhausted = task.attempt >= task.maxAttempts;
  return transition(task, {
    state: exhausted ? 'QUARANTINED' : 'RETRY_SCHEDULED',
    availableAt: new Date(clock(now).getTime() + delaySeconds * 1000).toISOString(),
    leaseOwner: null, leaseExpiresAt: null,
    lastReason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : reason,
  }, {
    transition: exhausted ? 'QUARANTINE_EXHAUSTED' : 'RELEASE_LEASE_RETRY',
    reason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : reason, workerId, now,
  });
}

export function recoverExpiredLease(input, { retryDelaySeconds = 0, now }) {
  const task = validateTask(input);
  assertState(task, ['LEASED', 'RUNNING'], 'TASK_NOT_LEASE_RECOVERABLE');
  requireValue(requireInstant(task.leaseExpiresAt, 'TASK_LEASE_EXPIRY_INVALID') <= clock(now), 'TASK_LEASE_NOT_EXPIRED');
  integer(retryDelaySeconds, 0, 'TASK_RETRY_DELAY_INVALID');
  const exhausted = task.attempt >= task.maxAttempts;
  return transition(task, {
    state: exhausted ? 'QUARANTINED' : 'RETRY_SCHEDULED',
    availableAt: new Date(clock(now).getTime() + retryDelaySeconds * 1000).toISOString(),
    leaseOwner: null, leaseExpiresAt: null,
    lastReason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : 'TASK_LEASE_EXPIRED_RECOVERED',
  }, {
    transition: exhausted ? 'QUARANTINE_EXHAUSTED' : 'RECOVER_EXPIRED_LEASE',
    reason: exhausted ? 'TASK_ATTEMPTS_EXHAUSTED' : 'TASK_LEASE_EXPIRED_RECOVERED',
    workerId: null, now,
  });
}

export function cancelTask(input, { reason, now }) {
  const task = validateTask(input);
  requireIdentifier(reason, 'TASK_CANCEL_REASON_INVALID');
  return transition(task, {
    state: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null, lastReason: reason,
  }, { transition: 'CANCEL', reason, workerId: null, now });
}
