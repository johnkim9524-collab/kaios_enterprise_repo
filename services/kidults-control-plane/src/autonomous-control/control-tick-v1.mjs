import {
  digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import { recoverNextExpiredSyntheticLease } from './task-scheduler-v1.mjs';
import { runOneSyntheticTaskCycle } from './task-runner-v1.mjs';
import { withAutonomousPostgresRuntime } from './postgres-runtime-client-v1.mjs';

const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'workerId', 'recoveryState', 'recoveryTaskId',
  'recoveryReceiptDigest', 'cycleState', 'cycleTaskId', 'cycleReceiptDigest',
  'observedAt', 'externalEgress', 'credentialResolution', 'remoteWorkerActivation',
  'production', 'publicRelease', 'g5', 'tickId', 'receiptDigest',
]);

const RECOVERY_STATES = new Set(['IDLE', 'RECOVERED', 'QUARANTINED', 'CONTENDED_RETRY']);
const CYCLE_STATES = new Set([
  'IDLE', 'CONTENDED_RETRY', 'EXECUTED', 'PROOF_UNAVAILABLE_RETRY',
  'PREFLIGHT_DENIED_RETRY', 'QUARANTINED',
]);
const TICK_STATES = new Set([
  'RECOVERY_APPLIED', 'RECOVERY_QUARANTINED', 'RECOVERY_CONTENDED_RETRY',
  ...[...CYCLE_STATES].map((state) => `CYCLE_${state}`),
]);

function nowFrom(clock) {
  requireValue(typeof clock === 'function', 'CONTROL_TICK_CLOCK_INVALID');
  const value = clock();
  requireValue(value instanceof Date && Number.isFinite(value.getTime()), 'CONTROL_TICK_CLOCK_INVALID');
  return value;
}

function tickReceipt({ state, workerId, recovery, cycle, observedAt }) {
  const unsigned = {
    contractId: 'kidults-autonomous-control-tick-receipt-v1', version: '1.0.0',
    state, workerId, recoveryState: recovery.state,
    recoveryTaskId: recovery.task?.taskId ?? null,
    recoveryReceiptDigest: recovery.receipt?.receiptDigest ?? null,
    cycleState: cycle?.state ?? null,
    cycleTaskId: cycle?.task?.taskId ?? null,
    cycleReceiptDigest: cycle?.receipt?.receiptDigest ?? null,
    observedAt, externalEgress: false, credentialResolution: false,
    remoteWorkerActivation: 'HOLD', production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const tickId = `control-tick:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, tickId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifyAutonomousControlTickReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'CONTROL_TICK_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-control-tick-receipt-v1'
    && receipt.version === '1.0.0', 'CONTROL_TICK_RECEIPT_CONTRACT_INVALID');
  requireValue(TICK_STATES.has(receipt.state), 'CONTROL_TICK_RECEIPT_STATE_INVALID');
  requireValue(RECOVERY_STATES.has(receipt.recoveryState), 'CONTROL_TICK_RECOVERY_STATE_INVALID');
  requireValue(receipt.cycleState === null || CYCLE_STATES.has(receipt.cycleState),
    'CONTROL_TICK_CYCLE_STATE_INVALID');
  requireIdentifier(receipt.workerId, 'CONTROL_TICK_WORKER_INVALID');
  requireIdentifier(receipt.tickId, 'CONTROL_TICK_ID_INVALID');
  requireInstant(receipt.observedAt, 'CONTROL_TICK_TIME_INVALID');
  for (const value of [receipt.recoveryTaskId, receipt.cycleTaskId]) {
    requireValue(value === null || typeof value === 'string', 'CONTROL_TICK_TASK_INVALID');
    if (value !== null) requireIdentifier(value, 'CONTROL_TICK_TASK_INVALID');
  }
  for (const value of [receipt.recoveryReceiptDigest, receipt.cycleReceiptDigest]) {
    requireValue(value === null || typeof value === 'string', 'CONTROL_TICK_DIGEST_INVALID');
    if (value !== null) requireDigest(value, 'CONTROL_TICK_DIGEST_INVALID');
  }

  const recoveryApplied = receipt.recoveryState === 'RECOVERED' || receipt.recoveryState === 'QUARANTINED';
  const recoveryStopped = recoveryApplied || receipt.recoveryState === 'CONTENDED_RETRY';
  requireValue(recoveryApplied
    ? receipt.recoveryTaskId !== null && receipt.recoveryReceiptDigest !== null
    : receipt.recoveryTaskId === null && receipt.recoveryReceiptDigest === null,
  'CONTROL_TICK_RECOVERY_BINDING_INVALID');
  requireValue(recoveryStopped === (receipt.cycleState === null
    && receipt.cycleTaskId === null && receipt.cycleReceiptDigest === null),
  'CONTROL_TICK_RECOVERY_PRIORITY_INVALID');
  requireValue((receipt.recoveryState === 'IDLE') === (receipt.cycleState !== null
    && receipt.cycleReceiptDigest !== null), 'CONTROL_TICK_CYCLE_BINDING_INVALID');
  if (receipt.cycleState !== null) {
    const noCycleTask = receipt.cycleState === 'IDLE' || receipt.cycleState === 'CONTENDED_RETRY';
    requireValue(noCycleTask === (receipt.cycleTaskId === null), 'CONTROL_TICK_CYCLE_TASK_BINDING_INVALID');
    requireValue(receipt.state === `CYCLE_${receipt.cycleState}`, 'CONTROL_TICK_STATE_BINDING_INVALID');
  } else {
    const expected = receipt.recoveryState === 'RECOVERED' ? 'RECOVERY_APPLIED'
      : receipt.recoveryState === 'QUARANTINED' ? 'RECOVERY_QUARANTINED'
        : 'RECOVERY_CONTENDED_RETRY';
    requireValue(receipt.state === expected, 'CONTROL_TICK_STATE_BINDING_INVALID');
  }
  requireValue(receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.remoteWorkerActivation === 'HOLD' && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'CONTROL_TICK_PROTECTED_GATE_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'CONTROL_TICK_RECEIPT_DIGEST_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'tickId' && key !== 'receiptDigest'));
  requireValue(receipt.tickId === `control-tick:${digestObject(unsigned).slice(7)}`,
    'CONTROL_TICK_ID_INVALID');
  return receipt;
}

export async function runOneAutonomousControlTick({
  taskClient, proofClient = taskClient, controlState, workerId, leaseSeconds,
  timeoutMs = 1000, retryDelaySeconds = 0, recoveryDelaySeconds = 0,
  maxCandidates = 8, handlerRegistry, cancellationSignal = null,
  clock = () => new Date(),
}) {
  requireIdentifier(workerId, 'CONTROL_TICK_WORKER_INVALID');
  const recovery = await recoverNextExpiredSyntheticLease(taskClient, {
    now: nowFrom(clock), retryDelaySeconds: recoveryDelaySeconds, maxCandidates,
  });
  if (recovery.state !== 'IDLE') {
    const state = recovery.state === 'RECOVERED' ? 'RECOVERY_APPLIED'
      : recovery.state === 'QUARANTINED' ? 'RECOVERY_QUARANTINED'
        : 'RECOVERY_CONTENDED_RETRY';
    const receipt = tickReceipt({ state, workerId, recovery, cycle: null,
      observedAt: nowFrom(clock).toISOString() });
    return { state, recovery, cycle: null, task: recovery.task, receipt };
  }

  const cycle = await runOneSyntheticTaskCycle({
    taskClient, proofClient, controlState, workerId, leaseSeconds, timeoutMs,
    retryDelaySeconds, maxCandidates, handlerRegistry, cancellationSignal, clock,
  });
  const state = `CYCLE_${cycle.state}`;
  const receipt = tickReceipt({ state, workerId, recovery, cycle,
    observedAt: nowFrom(clock).toISOString() });
  return { state, recovery, cycle, task: cycle.task, receipt };
}

export async function runOnePostgresAutonomousControlTick(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'CONTROL_TICK_POSTGRES_INPUT_INVALID');
  const { postgres, ...tickInput } = input;
  requireValue(!Object.hasOwn(tickInput, 'taskClient') && !Object.hasOwn(tickInput, 'proofClient'),
    'CONTROL_TICK_POSTGRES_CLIENT_OVERRIDE_DENIED');
  return withAutonomousPostgresRuntime(postgres,
    client => runOneAutonomousControlTick({ ...tickInput,
      taskClient: client, proofClient: client }), dependencies);
}
