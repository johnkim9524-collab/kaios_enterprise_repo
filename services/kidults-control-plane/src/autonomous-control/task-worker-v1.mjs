import {
  digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import { normalizeSourceRequest } from '../common-control/admission-v1.mjs';
import { executeShadowBroker } from '../common-control/shadow-broker-v1.mjs';
import {
  cancelTask, checkpointTask, completeTask, scheduleRetry, startTask, validateTask,
} from './task-lifecycle-v1.mjs';
import { persistTaskTransition } from './task-ledger-v1.mjs';

const REGISTRIES = new WeakMap();
const DESCRIPTOR_KEYS = Object.freeze(['workflowType', 'handlerId', 'execute']);
const PROOF_KEYS = Object.freeze(['sourceRequest', 'decision', 'manifest']);
const EXECUTION_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'taskId', 'workflowType', 'workerId', 'leaseEpoch',
  'handlerId', 'outcome', 'finalState', 'startRevision', 'finalRevision',
  'finalTaskDigest', 'preflightReceiptDigest', 'transitionReceiptDigests',
  'startedAt', 'finishedAt', 'errorCode', 'externalEgress', 'credentialResolution',
  'production', 'publicRelease', 'g5', 'executionId', 'receiptDigest',
]);

function exactDescriptor(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'TASK_HANDLER_DESCRIPTOR_INVALID');
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    'TASK_HANDLER_DESCRIPTOR_INVALID');
  requireValue(Reflect.ownKeys(value).length === DESCRIPTOR_KEYS.length
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && DESCRIPTOR_KEYS.includes(key)),
  'TASK_HANDLER_DESCRIPTOR_INVALID');
  for (const key of DESCRIPTOR_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value'), 'TASK_HANDLER_DESCRIPTOR_INVALID');
  }
  requireIdentifier(value.workflowType, 'TASK_HANDLER_WORKFLOW_INVALID');
  requireIdentifier(value.handlerId, 'TASK_HANDLER_ID_INVALID');
  requireValue(typeof value.execute === 'function', 'TASK_HANDLER_EXECUTE_INVALID');
  return Object.freeze({ workflowType: value.workflowType, handlerId: value.handlerId, execute: value.execute });
}

export function createSyntheticHandlerRegistry(descriptors) {
  requireValue(Array.isArray(descriptors) && descriptors.length >= 1 && descriptors.length <= 16,
    'TASK_HANDLER_REGISTRY_SIZE_INVALID');
  const entries = descriptors.map(exactDescriptor);
  requireValue(entries.every(entry => entry.workflowType === 'synthetic-shadow'), 'TASK_HANDLER_NON_SYNTHETIC_DENIED');
  requireValue(new Set(entries.map(entry => entry.workflowType)).size === entries.length,
    'TASK_HANDLER_WORKFLOW_DUPLICATE');
  requireValue(new Set(entries.map(entry => entry.handlerId)).size === entries.length,
    'TASK_HANDLER_ID_DUPLICATE');
  const registry = Object.freeze({ contractId: 'kidults-static-synthetic-handler-registry-v1' });
  REGISTRIES.set(registry, new Map(entries.map(entry => [entry.workflowType, entry])));
  return registry;
}

function clockNow(clock) {
  requireValue(typeof clock === 'function', 'TASK_WORKER_CLOCK_INVALID');
  const value = clock();
  requireValue(value instanceof Date && Number.isFinite(value.getTime()), 'TASK_WORKER_CLOCK_INVALID');
  return value;
}

function boundedInteger(value, minimum, maximum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= maximum, code);
  return value;
}

function verifyPreflight(task, proofInput, controlState, now) {
  const proof = snapshotJson(proofInput);
  requireExactRecord(proof, PROOF_KEYS, 'TASK_WORKER_ADMISSION_PROOF_SHAPE_INVALID');
  requireValue(proof.manifest !== null, 'TASK_WORKER_MANIFEST_REQUIRED');
  const source = normalizeSourceRequest(proof.sourceRequest);
  requireValue(source.taskId === task.taskId, 'TASK_WORKER_ADMISSION_TASK_MISMATCH');
  requireValue(digestObject(source) === task.admissionRequestDigest, 'TASK_WORKER_ADMISSION_DIGEST_MISMATCH');
  const receipt = executeShadowBroker({
    sourceRequest: source, decision: proof.decision, manifest: proof.manifest,
    brokerRequest: {
      requestId: source.requestId, taskId: task.taskId, manifestId: proof.manifest.manifestId,
      endpointFingerprint: source.endpointFingerprint, attempt: 1,
    },
    controlState, now,
  });
  requireValue(receipt.state === 'SHADOW_NO_FETCH_RECORDED', `TASK_WORKER_PREFLIGHT_DENIED:${receipt.primaryReason}`);
  requireValue(receipt.egressAttempted === false && receipt.credentialResolved === false,
    'TASK_WORKER_PREFLIGHT_CAPABILITY_INVALID');
  return receipt;
}

function executionReceipt({ task, finalTask, workerId, handlerId, outcome, errorCode,
  preflightReceipt, transitionReceipts }) {
  const unsigned = {
    contractId: 'kidults-synthetic-task-execution-receipt-v1', version: '1.0.0',
    taskId: task.taskId, workflowType: task.workflowType, workerId,
    leaseEpoch: task.leaseEpoch, handlerId, outcome, finalState: finalTask.state,
    startRevision: task.revision, finalRevision: finalTask.revision,
    finalTaskDigest: digestObject(finalTask), preflightReceiptDigest: preflightReceipt.receiptDigest,
    transitionReceiptDigests: transitionReceipts.map(receipt => receipt.receiptDigest),
    startedAt: transitionReceipts[0].observedAt,
    finishedAt: transitionReceipts.at(-1).observedAt,
    errorCode, externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const executionId = `task-execution:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, executionId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifySyntheticExecutionReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, EXECUTION_RECEIPT_KEYS, 'TASK_EXECUTION_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-synthetic-task-execution-receipt-v1'
    && receipt.version === '1.0.0', 'TASK_EXECUTION_RECEIPT_CONTRACT_INVALID');
  for (const [value, code] of [
    [receipt.taskId, 'TASK_EXECUTION_RECEIPT_TASK_INVALID'],
    [receipt.workflowType, 'TASK_EXECUTION_RECEIPT_WORKFLOW_INVALID'],
    [receipt.workerId, 'TASK_EXECUTION_RECEIPT_WORKER_INVALID'],
    [receipt.handlerId, 'TASK_EXECUTION_RECEIPT_HANDLER_INVALID'],
    [receipt.executionId, 'TASK_EXECUTION_RECEIPT_ID_INVALID'],
  ]) requireIdentifier(value, code);
  boundedInteger(receipt.leaseEpoch, 1, Number.MAX_SAFE_INTEGER, 'TASK_EXECUTION_RECEIPT_LEASE_INVALID');
  boundedInteger(receipt.startRevision, 0, Number.MAX_SAFE_INTEGER, 'TASK_EXECUTION_RECEIPT_REVISION_INVALID');
  boundedInteger(receipt.finalRevision, receipt.startRevision + 1, Number.MAX_SAFE_INTEGER,
    'TASK_EXECUTION_RECEIPT_REVISION_INVALID');
  requireDigest(receipt.finalTaskDigest, 'TASK_EXECUTION_RECEIPT_TASK_DIGEST_INVALID');
  requireDigest(receipt.preflightReceiptDigest, 'TASK_EXECUTION_RECEIPT_PREFLIGHT_DIGEST_INVALID');
  requireValue(Array.isArray(receipt.transitionReceiptDigests)
    && receipt.transitionReceiptDigests.length >= 1 && receipt.transitionReceiptDigests.length <= 64,
  'TASK_EXECUTION_RECEIPT_TRANSITIONS_INVALID');
  receipt.transitionReceiptDigests.forEach(value => requireDigest(value, 'TASK_EXECUTION_RECEIPT_TRANSITIONS_INVALID'));
  requireValue(new Set(receipt.transitionReceiptDigests).size === receipt.transitionReceiptDigests.length,
    'TASK_EXECUTION_RECEIPT_TRANSITIONS_INVALID');
  const startedAt = requireInstant(receipt.startedAt, 'TASK_EXECUTION_RECEIPT_TIME_INVALID');
  const finishedAt = requireInstant(receipt.finishedAt, 'TASK_EXECUTION_RECEIPT_TIME_INVALID');
  requireValue(finishedAt >= startedAt, 'TASK_EXECUTION_RECEIPT_TIME_INVALID');
  const outcomes = new Set(['SUCCEEDED', 'RETRY_SCHEDULED', 'QUARANTINED', 'CANCELLED']);
  requireValue(outcomes.has(receipt.outcome), 'TASK_EXECUTION_RECEIPT_OUTCOME_INVALID');
  requireValue(receipt.finalState === receipt.outcome, 'TASK_EXECUTION_RECEIPT_STATE_INVALID');
  requireValue(receipt.errorCode === null || typeof receipt.errorCode === 'string',
    'TASK_EXECUTION_RECEIPT_ERROR_INVALID');
  if (receipt.errorCode !== null) requireIdentifier(receipt.errorCode, 'TASK_EXECUTION_RECEIPT_ERROR_INVALID');
  requireValue((receipt.outcome === 'SUCCEEDED') === (receipt.errorCode === null),
    'TASK_EXECUTION_RECEIPT_ERROR_INVALID');
  requireValue(receipt.externalEgress === false && receipt.credentialResolution === false
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'TASK_EXECUTION_RECEIPT_PROTECTED_GATE_INVALID');
  verifySelfDigest(receipt, 'receiptDigest', 'TASK_EXECUTION_RECEIPT_DIGEST_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'executionId' && key !== 'receiptDigest'));
  requireValue(receipt.executionId === `task-execution:${digestObject(unsigned).slice(7)}`,
    'TASK_EXECUTION_RECEIPT_ID_INVALID');
  return receipt;
}

function stopError(code) {
  const error = new Error(code);
  error.taskWorkerStop = true;
  return error;
}

export async function executeClaimedSyntheticTask(client, {
  task: inputTask, workerId, leaseEpoch, admissionProof, controlState, handlerRegistry,
  timeoutMs = 1000, retryDelaySeconds = 0, cancellationSignal = null,
  clock = () => new Date(),
}) {
  requireValue(client && typeof client.query === 'function', 'TASK_WORKER_CLIENT_INVALID');
  const task = validateTask(inputTask);
  requireValue(task.workflowType === 'synthetic-shadow' && task.state === 'LEASED', 'TASK_WORKER_TASK_SCOPE_INVALID');
  requireIdentifier(workerId, 'TASK_WORKER_ID_INVALID');
  requireValue(/^synthetic-worker:[A-Za-z0-9][A-Za-z0-9._-]{0,110}$/.test(workerId),
    'TASK_WORKER_NAMESPACE_DENIED');
  requireValue(task.leaseOwner === workerId && task.leaseEpoch === leaseEpoch, 'TASK_WORKER_LEASE_FENCE_MISMATCH');
  boundedInteger(timeoutMs, 1, 60000, 'TASK_WORKER_TIMEOUT_INVALID');
  boundedInteger(retryDelaySeconds, 0, 86400, 'TASK_WORKER_RETRY_DELAY_INVALID');
  requireValue(cancellationSignal === null
    || (typeof cancellationSignal === 'object' && typeof cancellationSignal.aborted === 'boolean'
      && typeof cancellationSignal.addEventListener === 'function'
      && typeof cancellationSignal.removeEventListener === 'function'), 'TASK_WORKER_CANCELLATION_SIGNAL_INVALID');
  const handlers = REGISTRIES.get(handlerRegistry);
  requireValue(handlers instanceof Map, 'TASK_WORKER_HANDLER_REGISTRY_UNTRUSTED');
  const handler = handlers.get(task.workflowType);
  requireValue(handler !== undefined, 'TASK_WORKER_HANDLER_NOT_REGISTERED');

  const preflightReceipt = verifyPreflight(task, admissionProof, controlState, clockNow(clock));
  const transitionReceipts = [];
  let currentTask = task;

  async function apply(result) {
    await persistTaskTransition(client, currentTask, result);
    currentTask = result.task;
    transitionReceipts.push(result.receipt);
  }

  if (cancellationSignal?.aborted) {
    await apply(cancelTask(currentTask, { reason: 'TASK_EXECUTION_CANCELLED_BEFORE_START', now: clockNow(clock) }));
    return {
      task: currentTask,
      receipt: executionReceipt({ task, finalTask: currentTask, workerId, handlerId: handler.handlerId,
        outcome: 'CANCELLED', errorCode: 'TASK_EXECUTION_CANCELLED_BEFORE_START',
        preflightReceipt, transitionReceipts }),
    };
  }

  await apply(startTask(currentTask, { workerId, leaseEpoch, now: clockNow(clock) }));
  const controller = new AbortController();
  let phase = 'ACTIVE';
  let stopCode = null;
  let transitionTail = Promise.resolve();
  let transitionFailure = null;
  const stop = code => {
    if (stopCode === null) stopCode = code;
    if (!controller.signal.aborted) controller.abort(code);
  };
  const externalAbort = () => stop('TASK_EXECUTION_CANCELLED');
  cancellationSignal?.addEventListener('abort', externalAbort, { once: true });
  const timer = setTimeout(() => stop('TASK_EXECUTION_TIMEOUT'), timeoutMs);

  const checkpoint = checkpointDigest => {
    requireValue(phase === 'ACTIVE' && !controller.signal.aborted, 'TASK_WORKER_CHECKPOINT_AFTER_STOP');
    requireDigest(checkpointDigest, 'TASK_WORKER_CHECKPOINT_DIGEST_INVALID');
    const operation = transitionTail.then(async () => {
      const result = checkpointTask(currentTask, {
        workerId, leaseEpoch, checkpointDigest, now: clockNow(clock),
      });
      try {
        await apply(result);
      } catch (error) {
        error.taskWorkerInfrastructureFailure = true;
        throw error;
      }
      return { taskRevision: currentTask.revision, transitionReceiptDigest: result.receipt.receiptDigest };
    });
    transitionTail = operation.catch(error => { transitionFailure ??= error; });
    return operation;
  };

  const context = Object.freeze({
    taskId: task.taskId, workflowType: task.workflowType,
    admissionRequestDigest: task.admissionRequestDigest,
    workerId, leaseEpoch, signal: controller.signal, checkpoint,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  const stopPromise = new Promise((resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(stopError(stopCode)), { once: true });
  });

  let result;
  let handlerError = null;
  try {
    result = await Promise.race([Promise.resolve().then(() => handler.execute(context)), stopPromise]);
  } catch (error) {
    handlerError = error;
  } finally {
    phase = 'FINALIZING';
    clearTimeout(timer);
    cancellationSignal?.removeEventListener('abort', externalAbort);
    await transitionTail;
  }
  if (transitionFailure?.taskWorkerInfrastructureFailure) throw transitionFailure;

  if (handlerError === null) {
    try {
      const normalized = snapshotJson(result);
      requireExactRecord(normalized, ['outcome'], 'TASK_HANDLER_RESULT_INVALID');
      requireValue(normalized.outcome === 'SUCCEEDED', 'TASK_HANDLER_RESULT_INVALID');
    } catch {
      handlerError = new Error('TASK_HANDLER_RESULT_INVALID');
    }
  }

  let outcome;
  let errorCode = null;
  if (handlerError === null) {
    await apply(completeTask(currentTask, { workerId, leaseEpoch, now: clockNow(clock) }));
    outcome = 'SUCCEEDED';
  } else if (handlerError.taskWorkerStop && stopCode === 'TASK_EXECUTION_CANCELLED') {
    errorCode = stopCode;
    await apply(cancelTask(currentTask, { reason: errorCode, now: clockNow(clock) }));
    outcome = 'CANCELLED';
  } else {
    errorCode = handlerError.taskWorkerStop && stopCode === 'TASK_EXECUTION_TIMEOUT'
      ? stopCode
      : handlerError.message === 'TASK_HANDLER_RESULT_INVALID'
        ? 'TASK_HANDLER_RESULT_INVALID' : 'TASK_HANDLER_FAILED';
    await apply(scheduleRetry(currentTask, {
      workerId, leaseEpoch, reason: errorCode, delaySeconds: retryDelaySeconds, now: clockNow(clock),
    }));
    outcome = currentTask.state === 'QUARANTINED' ? 'QUARANTINED' : 'RETRY_SCHEDULED';
  }

  return {
    task: currentTask,
    receipt: executionReceipt({ task, finalTask: currentTask, workerId, handlerId: handler.handlerId,
      outcome, errorCode, preflightReceipt, transitionReceipts }),
  };
}
