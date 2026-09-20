import {
  digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import {
  runOneAutonomousControlTick, verifyAutonomousControlTickReceipt,
} from './control-tick-v1.mjs';
import { withAutonomousPostgresRuntime } from './postgres-runtime-client-v1.mjs';

const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'workerId', 'tickCount', 'executedCount',
  'recoveryCount', 'quarantineCount', 'lastTickState', 'tickStates', 'tickReceiptDigests',
  'failureClass', 'startedAt', 'finishedAt', 'elapsedMs', 'maxTicks',
  'maxDurationMs', 'externalEgress', 'credentialResolution',
  'remoteWorkerActivation', 'automaticTrigger', 'production', 'publicRelease',
  'g5', 'runId', 'receiptDigest',
]);

const STATES = new Set([
  'IDLE_DRAINED', 'TICK_BUDGET_EXHAUSTED', 'DURATION_BUDGET_EXHAUSTED',
  'GLOBAL_KILL_STOP', 'CANCELLED_STOP', 'RECOVERY_APPLIED_STOP',
  'RECOVERY_QUARANTINED_STOP', 'CONTENTION_STOP', 'RETRY_SCHEDULED_STOP',
  'TASK_QUARANTINED_STOP', 'FAIL_CLOSED_ERROR_STOP',
]);
const TICK_STATES = new Set([
  'RECOVERY_APPLIED', 'RECOVERY_QUARANTINED', 'RECOVERY_CONTENDED_RETRY',
  'CYCLE_IDLE', 'CYCLE_CONTENDED_RETRY', 'CYCLE_EXECUTED',
  'CYCLE_PROOF_UNAVAILABLE_RETRY', 'CYCLE_PREFLIGHT_DENIED_RETRY', 'CYCLE_QUARANTINED',
]);

function boundedInteger(value, minimum, maximum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= maximum, code);
  return value;
}

function nowFrom(clock) {
  requireValue(typeof clock === 'function', 'SHADOW_SUPERVISOR_CLOCK_INVALID');
  const value = clock();
  requireValue(value instanceof Date && Number.isFinite(value.getTime()), 'SHADOW_SUPERVISOR_CLOCK_INVALID');
  return value;
}

function monotonicFrom(monotonicClock) {
  requireValue(typeof monotonicClock === 'function', 'SHADOW_SUPERVISOR_MONOTONIC_CLOCK_INVALID');
  const value = monotonicClock();
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0,
    'SHADOW_SUPERVISOR_MONOTONIC_CLOCK_INVALID');
  return value;
}

function classifyFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('TASK_LEDGER_')) return 'TASK_LEDGER_FAILURE';
  if (message.startsWith('TASK_SCHEDULER_')) return 'TASK_SCHEDULER_FAILURE';
  if (message.startsWith('TASK_RUNNER_')) return 'TASK_RUNNER_FAILURE';
  if (message.startsWith('CONTROL_TICK_')) return 'CONTROL_TICK_FAILURE';
  return 'UNEXPECTED_DEPENDENCY_FAILURE';
}

function stopForTickState(state) {
  if (state === 'CYCLE_EXECUTED') return null;
  if (state === 'CYCLE_IDLE') return 'IDLE_DRAINED';
  if (state === 'RECOVERY_APPLIED') return 'RECOVERY_APPLIED_STOP';
  if (state === 'RECOVERY_QUARANTINED') return 'RECOVERY_QUARANTINED_STOP';
  if (state === 'RECOVERY_CONTENDED_RETRY' || state === 'CYCLE_CONTENDED_RETRY') {
    return 'CONTENTION_STOP';
  }
  if (state === 'CYCLE_PROOF_UNAVAILABLE_RETRY' || state === 'CYCLE_PREFLIGHT_DENIED_RETRY') {
    return 'RETRY_SCHEDULED_STOP';
  }
  if (state === 'CYCLE_QUARANTINED') return 'TASK_QUARANTINED_STOP';
  requireValue(false, 'SHADOW_SUPERVISOR_TICK_STATE_UNSUPPORTED');
}

function supervisorReceipt({ state, workerId, ticks, failureClass, startedAt, finishedAt,
  elapsedMs, maxTicks, maxDurationMs }) {
  const states = ticks.map((tick) => tick.state);
  const unsigned = {
    contractId: 'kidults-autonomous-shadow-supervisor-receipt-v1', version: '1.0.0',
    state, workerId, tickCount: ticks.length,
    executedCount: states.filter((value) => value === 'CYCLE_EXECUTED').length,
    recoveryCount: states.filter((value) => value === 'RECOVERY_APPLIED').length,
    quarantineCount: states.filter((value) => value.includes('QUARANTINED')).length,
    lastTickState: states.at(-1) ?? null, tickStates: states,
    tickReceiptDigests: ticks.map((tick) => tick.receipt.receiptDigest),
    failureClass, startedAt, finishedAt, elapsedMs, maxTicks, maxDurationMs,
    externalEgress: false, credentialResolution: false, remoteWorkerActivation: 'HOLD',
    automaticTrigger: 'NOT_REGISTERED_HOLD', production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const runId = `shadow-supervisor:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, runId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifyShadowSupervisorReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'SHADOW_SUPERVISOR_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-shadow-supervisor-receipt-v1'
    && receipt.version === '1.0.0', 'SHADOW_SUPERVISOR_RECEIPT_CONTRACT_INVALID');
  requireValue(STATES.has(receipt.state), 'SHADOW_SUPERVISOR_RECEIPT_STATE_INVALID');
  requireIdentifier(receipt.workerId, 'SHADOW_SUPERVISOR_WORKER_INVALID');
  requireIdentifier(receipt.runId, 'SHADOW_SUPERVISOR_RUN_ID_INVALID');
  requireInstant(receipt.startedAt, 'SHADOW_SUPERVISOR_TIME_INVALID');
  requireInstant(receipt.finishedAt, 'SHADOW_SUPERVISOR_TIME_INVALID');
  requireValue(Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt),
    'SHADOW_SUPERVISOR_TIME_ORDER_INVALID');
  boundedInteger(receipt.tickCount, 0, 16, 'SHADOW_SUPERVISOR_RECEIPT_COUNT_INVALID');
  boundedInteger(receipt.executedCount, 0, receipt.tickCount, 'SHADOW_SUPERVISOR_RECEIPT_COUNT_INVALID');
  boundedInteger(receipt.recoveryCount, 0, receipt.tickCount, 'SHADOW_SUPERVISOR_RECEIPT_COUNT_INVALID');
  boundedInteger(receipt.quarantineCount, 0, receipt.tickCount, 'SHADOW_SUPERVISOR_RECEIPT_COUNT_INVALID');
  boundedInteger(receipt.elapsedMs, 0, Number.MAX_SAFE_INTEGER, 'SHADOW_SUPERVISOR_ELAPSED_INVALID');
  boundedInteger(receipt.maxTicks, 1, 16, 'SHADOW_SUPERVISOR_TICK_BUDGET_INVALID');
  boundedInteger(receipt.maxDurationMs, 1, 60000, 'SHADOW_SUPERVISOR_DURATION_BUDGET_INVALID');
  requireValue(Array.isArray(receipt.tickReceiptDigests)
    && receipt.tickReceiptDigests.length === receipt.tickCount,
  'SHADOW_SUPERVISOR_TICK_DIGEST_BINDING_INVALID');
  for (const digest of receipt.tickReceiptDigests) {
    requireDigest(digest, 'SHADOW_SUPERVISOR_TICK_DIGEST_INVALID');
  }
  requireValue(new Set(receipt.tickReceiptDigests).size === receipt.tickReceiptDigests.length,
    'SHADOW_SUPERVISOR_TICK_DIGEST_REPLAY_INVALID');
  requireValue(receipt.lastTickState === null || typeof receipt.lastTickState === 'string',
    'SHADOW_SUPERVISOR_LAST_TICK_INVALID');
  requireValue(Array.isArray(receipt.tickStates) && receipt.tickStates.length === receipt.tickCount
    && receipt.tickStates.every((value) => TICK_STATES.has(value)),
  'SHADOW_SUPERVISOR_TICK_STATE_BINDING_INVALID');
  requireValue((receipt.tickCount === 0) === (receipt.lastTickState === null),
    'SHADOW_SUPERVISOR_LAST_TICK_BINDING_INVALID');
  requireValue(receipt.lastTickState === (receipt.tickStates.at(-1) ?? null),
    'SHADOW_SUPERVISOR_LAST_TICK_BINDING_INVALID');
  requireValue(receipt.tickStates.slice(0, -1).every((value) => value === 'CYCLE_EXECUTED'),
    'SHADOW_SUPERVISOR_CONTINUATION_BINDING_INVALID');
  requireValue((receipt.state === 'FAIL_CLOSED_ERROR_STOP') === (receipt.failureClass !== null),
    'SHADOW_SUPERVISOR_FAILURE_BINDING_INVALID');
  if (receipt.failureClass !== null) {
    requireValue(new Set(['TASK_LEDGER_FAILURE', 'TASK_SCHEDULER_FAILURE', 'TASK_RUNNER_FAILURE',
      'CONTROL_TICK_FAILURE', 'UNEXPECTED_DEPENDENCY_FAILURE']).has(receipt.failureClass),
    'SHADOW_SUPERVISOR_FAILURE_CLASS_INVALID');
  }
  requireValue(receipt.executedCount
      === receipt.tickStates.filter((value) => value === 'CYCLE_EXECUTED').length
    && receipt.recoveryCount
      === receipt.tickStates.filter((value) => value === 'RECOVERY_APPLIED').length
    && receipt.quarantineCount
      === receipt.tickStates.filter((value) => value.includes('QUARANTINED')).length,
  'SHADOW_SUPERVISOR_COUNT_BINDING_INVALID');
  requireValue(receipt.recoveryCount <= 1 && receipt.quarantineCount <= 1,
    'SHADOW_SUPERVISOR_EXCEPTION_BUDGET_INVALID');
  const expectedTerminal = {
    IDLE_DRAINED: ['CYCLE_IDLE'], RECOVERY_APPLIED_STOP: ['RECOVERY_APPLIED'],
    RECOVERY_QUARANTINED_STOP: ['RECOVERY_QUARANTINED'],
    CONTENTION_STOP: ['RECOVERY_CONTENDED_RETRY', 'CYCLE_CONTENDED_RETRY'],
    RETRY_SCHEDULED_STOP: ['CYCLE_PROOF_UNAVAILABLE_RETRY', 'CYCLE_PREFLIGHT_DENIED_RETRY'],
    TASK_QUARANTINED_STOP: ['CYCLE_QUARANTINED'],
  };
  if (Object.hasOwn(expectedTerminal, receipt.state)) {
    requireValue(expectedTerminal[receipt.state].includes(receipt.lastTickState),
      'SHADOW_SUPERVISOR_STOP_BINDING_INVALID');
  }
  if (receipt.state === 'TICK_BUDGET_EXHAUSTED') {
    requireValue(receipt.tickCount === receipt.maxTicks && receipt.lastTickState === 'CYCLE_EXECUTED',
      'SHADOW_SUPERVISOR_STOP_BINDING_INVALID');
    requireValue(receipt.elapsedMs < receipt.maxDurationMs,
      'SHADOW_SUPERVISOR_BUDGET_STATE_BINDING_INVALID');
  }
  if (receipt.state === 'DURATION_BUDGET_EXHAUSTED') {
    requireValue(receipt.elapsedMs >= receipt.maxDurationMs,
      'SHADOW_SUPERVISOR_BUDGET_STATE_BINDING_INVALID');
  }
  if (['DURATION_BUDGET_EXHAUSTED', 'GLOBAL_KILL_STOP', 'CANCELLED_STOP',
    'FAIL_CLOSED_ERROR_STOP'].includes(receipt.state)) {
    requireValue(receipt.lastTickState === null || receipt.lastTickState === 'CYCLE_EXECUTED',
      'SHADOW_SUPERVISOR_STOP_BINDING_INVALID');
  }
  requireValue(receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.remoteWorkerActivation === 'HOLD' && receipt.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'SHADOW_SUPERVISOR_PROTECTED_GATE_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'SHADOW_SUPERVISOR_RECEIPT_DIGEST_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'runId' && key !== 'receiptDigest'));
  requireValue(receipt.runId === `shadow-supervisor:${digestObject(unsigned).slice(7)}`,
    'SHADOW_SUPERVISOR_RUN_ID_INVALID');
  return receipt;
}

export async function runBoundedShadowSupervisor({
  taskClient, proofClient = taskClient, controlState, workerId, leaseSeconds,
  maxTicks, maxDurationMs, timeoutMs = 1000, retryDelaySeconds = 1,
  recoveryDelaySeconds = 1, maxCandidates = 8, handlerRegistry,
  cancellationSignal = null, clock = () => new Date(),
  monotonicClock = () => performance.now(),
}) {
  requireIdentifier(workerId, 'SHADOW_SUPERVISOR_WORKER_INVALID');
  boundedInteger(maxTicks, 1, 16, 'SHADOW_SUPERVISOR_TICK_BUDGET_INVALID');
  boundedInteger(maxDurationMs, 1, 60000, 'SHADOW_SUPERVISOR_DURATION_BUDGET_INVALID');
  boundedInteger(timeoutMs, 1, 60000, 'SHADOW_SUPERVISOR_TIMEOUT_INVALID');
  const startedAt = nowFrom(clock).toISOString();
  const startedMonotonic = monotonicFrom(monotonicClock);
  const ticks = [];
  let state = null;
  let failureClass = null;

  while (ticks.length < maxTicks && state === null) {
    if (cancellationSignal?.aborted === true) {
      state = 'CANCELLED_STOP';
      break;
    }
    const currentControlState = snapshotJson(controlState);
    if (currentControlState.globalKill === true) {
      state = 'GLOBAL_KILL_STOP';
      break;
    }
    const elapsedBeforeTick = monotonicFrom(monotonicClock) - startedMonotonic;
    if (elapsedBeforeTick >= maxDurationMs) {
      state = 'DURATION_BUDGET_EXHAUSTED';
      break;
    }
    const remainingMs = Math.max(1, Math.floor(maxDurationMs - elapsedBeforeTick));
    try {
      const tick = await runOneAutonomousControlTick({
        taskClient, proofClient, controlState: currentControlState, workerId, leaseSeconds,
        timeoutMs: Math.min(timeoutMs, remainingMs), retryDelaySeconds, recoveryDelaySeconds,
        maxCandidates, handlerRegistry, cancellationSignal, clock,
      });
      verifyAutonomousControlTickReceipt(tick.receipt);
      ticks.push(tick);
      state = stopForTickState(tick.state);
    } catch (error) {
      state = 'FAIL_CLOSED_ERROR_STOP';
      failureClass = classifyFailure(error);
    }
  }

  const finishedMonotonic = monotonicFrom(monotonicClock);
  const elapsedMs = Math.max(0, Math.floor(finishedMonotonic - startedMonotonic));
  if (state === null) {
    state = elapsedMs >= maxDurationMs ? 'DURATION_BUDGET_EXHAUSTED' : 'TICK_BUDGET_EXHAUSTED';
  }
  const finishedAt = nowFrom(clock).toISOString();
  const receipt = supervisorReceipt({ state, workerId, ticks, failureClass,
    startedAt, finishedAt, elapsedMs, maxTicks, maxDurationMs });
  return { state, ticks, receipt };
}

export async function runPostgresBoundedShadowSupervisor(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'SHADOW_SUPERVISOR_POSTGRES_INPUT_INVALID');
  const { postgres, ...supervisorInput } = input;
  requireValue(!Object.hasOwn(supervisorInput, 'taskClient')
    && !Object.hasOwn(supervisorInput, 'proofClient'),
  'SHADOW_SUPERVISOR_POSTGRES_CLIENT_OVERRIDE_DENIED');
  return withAutonomousPostgresRuntime(postgres,
    client => runBoundedShadowSupervisor({ ...supervisorInput,
      taskClient: client, proofClient: client }), dependencies);
}
