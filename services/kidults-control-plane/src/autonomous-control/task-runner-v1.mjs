import {
  digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import { resolveAdmissionProof } from './admission-proof-store-v1.mjs';
import { releaseLeasedTaskForRetry } from './task-lifecycle-v1.mjs';
import { persistTaskTransition } from './task-ledger-v1.mjs';
import { claimNextSyntheticTask } from './task-scheduler-v1.mjs';
import { SYNTHETIC_HANDLER_REGISTRY_V1 } from './synthetic-handler-registry-v1.mjs';
import { executeClaimedSyntheticTask } from './task-worker-v1.mjs';
import { withAutonomousPostgresRuntime } from './postgres-runtime-client-v1.mjs';

const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'taskId', 'workerId', 'claimReceiptDigest',
  'proofDigest', 'executionReceiptDigest', 'releaseReceiptDigest', 'observedAt',
  'externalEgress', 'credentialResolution', 'remoteWorkerActivation', 'production',
  'publicRelease', 'g5', 'cycleId', 'receiptDigest',
]);

function nowFrom(clock) {
  requireValue(typeof clock === 'function', 'TASK_RUNNER_CLOCK_INVALID');
  const value = clock();
  requireValue(value instanceof Date && Number.isFinite(value.getTime()), 'TASK_RUNNER_CLOCK_INVALID');
  return value;
}

function cycleReceipt({ state, taskId, workerId, claimReceiptDigest = null, proofDigest = null,
  executionReceiptDigest = null, releaseReceiptDigest = null, observedAt }) {
  const unsigned = {
    contractId: 'kidults-autonomous-single-cycle-receipt-v1', version: '1.0.0',
    state, taskId, workerId, claimReceiptDigest, proofDigest,
    executionReceiptDigest, releaseReceiptDigest, observedAt,
    externalEgress: false, credentialResolution: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const cycleId = `task-cycle:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, cycleId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifySingleCycleReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'TASK_RUNNER_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-single-cycle-receipt-v1'
    && receipt.version === '1.0.0', 'TASK_RUNNER_RECEIPT_CONTRACT_INVALID');
  requireValue(new Set(['IDLE', 'CONTENDED_RETRY', 'EXECUTED', 'PROOF_UNAVAILABLE_RETRY',
    'PREFLIGHT_DENIED_RETRY', 'QUARANTINED']).has(receipt.state), 'TASK_RUNNER_RECEIPT_STATE_INVALID');
  requireIdentifier(receipt.workerId, 'TASK_RUNNER_RECEIPT_WORKER_INVALID');
  requireIdentifier(receipt.cycleId, 'TASK_RUNNER_RECEIPT_ID_INVALID');
  requireInstant(receipt.observedAt, 'TASK_RUNNER_RECEIPT_TIME_INVALID');
  for (const value of [receipt.claimReceiptDigest, receipt.proofDigest,
    receipt.executionReceiptDigest, receipt.releaseReceiptDigest]) {
    requireValue(value === null || typeof value === 'string', 'TASK_RUNNER_RECEIPT_DIGEST_INVALID');
    if (value !== null) requireDigest(value, 'TASK_RUNNER_RECEIPT_DIGEST_INVALID');
  }
  requireValue(receipt.taskId === null || typeof receipt.taskId === 'string', 'TASK_RUNNER_RECEIPT_TASK_INVALID');
  if (receipt.taskId !== null) requireIdentifier(receipt.taskId, 'TASK_RUNNER_RECEIPT_TASK_INVALID');
  const noClaim = receipt.state === 'IDLE' || receipt.state === 'CONTENDED_RETRY';
  requireValue(noClaim === (receipt.taskId === null && receipt.claimReceiptDigest === null),
    'TASK_RUNNER_RECEIPT_CLAIM_BINDING_INVALID');
  requireValue((receipt.state === 'EXECUTED') === (receipt.executionReceiptDigest !== null),
    'TASK_RUNNER_RECEIPT_EXECUTION_BINDING_INVALID');
  requireValue((receipt.state === 'PROOF_UNAVAILABLE_RETRY' || receipt.state === 'PREFLIGHT_DENIED_RETRY'
    || receipt.state === 'QUARANTINED') === (receipt.releaseReceiptDigest !== null),
  'TASK_RUNNER_RECEIPT_RELEASE_BINDING_INVALID');
  requireValue(receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.remoteWorkerActivation === 'HOLD' && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'TASK_RUNNER_RECEIPT_PROTECTED_GATE_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'TASK_RUNNER_RECEIPT_DIGEST_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'cycleId' && key !== 'receiptDigest'));
  requireValue(receipt.cycleId === `task-cycle:${digestObject(unsigned).slice(7)}`,
    'TASK_RUNNER_RECEIPT_ID_INVALID');
  return receipt;
}

async function releaseClaim(taskClient, task, { workerId, retryDelaySeconds, reason, clock }) {
  const released = releaseLeasedTaskForRetry(task, {
    workerId, leaseEpoch: task.leaseEpoch, reason,
    delaySeconds: retryDelaySeconds, now: nowFrom(clock),
  });
  await persistTaskTransition(taskClient, task, released);
  return released;
}

export async function runOneSyntheticTaskCycle({
  taskClient, proofClient = taskClient, controlState, workerId, leaseSeconds,
  timeoutMs = 1000, retryDelaySeconds = 0, maxCandidates = 8,
  handlerRegistry = SYNTHETIC_HANDLER_REGISTRY_V1, cancellationSignal = null,
  clock = () => new Date(),
}) {
  const claim = await claimNextSyntheticTask(taskClient, {
    workerId, leaseSeconds, maxCandidates, now: nowFrom(clock),
  });
  if (claim.state !== 'CLAIMED') {
    const receipt = cycleReceipt({ state: claim.state, taskId: null, workerId,
      observedAt: nowFrom(clock).toISOString() });
    return { state: claim.state, task: null, executionReceipt: null,
      releaseReceipt: null, receipt };
  }

  const task = claim.task;
  const resolved = await resolveAdmissionProof(proofClient, {
    taskId: task.taskId, admissionRequestDigest: task.admissionRequestDigest, now: nowFrom(clock),
  });
  if (resolved === null) {
    const released = await releaseClaim(taskClient, task, { workerId, retryDelaySeconds,
      reason: 'TASK_ADMISSION_PROOF_UNAVAILABLE', clock });
    const state = released.task.state === 'QUARANTINED' ? 'QUARANTINED' : 'PROOF_UNAVAILABLE_RETRY';
    const receipt = cycleReceipt({ state, taskId: task.taskId, workerId,
      claimReceiptDigest: claim.receipt.receiptDigest,
      releaseReceiptDigest: released.receipt.receiptDigest,
      observedAt: nowFrom(clock).toISOString() });
    return { state, task: released.task, executionReceipt: null,
      releaseReceipt: released.receipt, receipt };
  }

  try {
    const executed = await executeClaimedSyntheticTask(taskClient, {
      task, workerId, leaseEpoch: task.leaseEpoch, admissionProof: resolved.proof,
      controlState, handlerRegistry, timeoutMs, retryDelaySeconds, cancellationSignal, clock,
    });
    const receipt = cycleReceipt({ state: 'EXECUTED', taskId: task.taskId, workerId,
      claimReceiptDigest: claim.receipt.receiptDigest, proofDigest: resolved.proofDigest,
      executionReceiptDigest: executed.receipt.receiptDigest,
      observedAt: nowFrom(clock).toISOString() });
    return { state: 'EXECUTED', task: executed.task, executionReceipt: executed.receipt,
      releaseReceipt: null, receipt };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('TASK_WORKER_PREFLIGHT_DENIED:')) throw error;
    const released = await releaseClaim(taskClient, task, { workerId, retryDelaySeconds,
      reason: 'TASK_ADMISSION_PREFLIGHT_DENIED', clock });
    const state = released.task.state === 'QUARANTINED' ? 'QUARANTINED' : 'PREFLIGHT_DENIED_RETRY';
    const receipt = cycleReceipt({ state, taskId: task.taskId, workerId,
      claimReceiptDigest: claim.receipt.receiptDigest, proofDigest: resolved.proofDigest,
      releaseReceiptDigest: released.receipt.receiptDigest,
      observedAt: nowFrom(clock).toISOString() });
    return { state, task: released.task, executionReceipt: null,
      releaseReceipt: released.receipt, receipt };
  }
}

export async function runOnePostgresSyntheticTaskCycle(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'TASK_RUNNER_POSTGRES_INPUT_INVALID');
  const { postgres, ...cycleInput } = input;
  requireValue(!Object.hasOwn(cycleInput, 'taskClient') && !Object.hasOwn(cycleInput, 'proofClient'),
    'TASK_RUNNER_POSTGRES_CLIENT_OVERRIDE_DENIED');
  return withAutonomousPostgresRuntime(postgres,
    client => runOneSyntheticTaskCycle({ ...cycleInput,
      taskClient: client, proofClient: client }), dependencies);
}
