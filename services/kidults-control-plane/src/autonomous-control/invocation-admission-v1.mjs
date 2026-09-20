import {
  canonicalJson, digestObject, requireDigest, requireExactRecord, requireIdentifier,
  requireInstant, requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import {
  runBoundedShadowSupervisor, verifyShadowSupervisorReceipt,
} from './shadow-supervisor-v1.mjs';

const WRITER_ID = 'kpmo-autonomous-invocation-writer-v1';
const COMMAND_ID = /^supervisor-command:[A-Za-z0-9._:-]{1,108}$/;
const SUPERVISOR_STATES = new Set([
  'IDLE_DRAINED', 'TICK_BUDGET_EXHAUSTED', 'DURATION_BUDGET_EXHAUSTED',
  'GLOBAL_KILL_STOP', 'CANCELLED_STOP', 'RECOVERY_APPLIED_STOP',
  'RECOVERY_QUARANTINED_STOP', 'CONTENTION_STOP', 'RETRY_SCHEDULED_STOP',
  'TASK_QUARANTINED_STOP', 'FAIL_CLOSED_ERROR_STOP',
]);
const REQUEST_KEYS = Object.freeze([
  'contractId', 'version', 'commandId', 'requestedBy', 'workerId', 'maxTicks',
  'maxDurationMs', 'leaseSeconds', 'timeoutMs', 'retryDelaySeconds',
  'recoveryDelaySeconds', 'maxCandidates', 'handlerRegistryId', 'controlStateDigest',
  'requestedAt', 'expiresAt', 'scope', 'externalEgress', 'credentialResolution',
  'production', 'publicRelease', 'g5', 'requestId', 'requestDigest',
]);
const DECISION_KEYS = Object.freeze([
  'contractId', 'version', 'commandId', 'requestId', 'requestDigest', 'decision',
  'reviewerId', 'reviewerAuthentication', 'authorityClass', 'subjectType',
  'subjectId', 'subjectDigest', 'requiredReviewerRole', 'decidedAt', 'externalEgress',
  'credentialResolution', 'production', 'publicRelease', 'g5', 'decisionId',
  'decisionDigest',
]);
const CONSUMPTION_KEYS = Object.freeze([
  'contractId', 'version', 'commandId', 'requestId', 'requestDigest', 'decisionId',
  'decisionDigest', 'controlStateDigest', 'consumedAt', 'externalEgress',
  'credentialResolution', 'remoteWorkerActivation', 'production', 'publicRelease',
  'g5', 'consumptionId', 'receiptDigest',
]);
const EXECUTION_KEYS = Object.freeze([
  'contractId', 'version', 'commandId', 'requestDigest', 'decisionDigest',
  'consumptionReceiptDigest', 'supervisorReceiptDigest', 'supervisorState',
  'completedAt', 'externalEgress', 'credentialResolution', 'remoteWorkerActivation',
  'production', 'publicRelease', 'g5', 'executionId', 'receiptDigest',
]);

function boundedInteger(value, minimum, maximum, code) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= maximum, code);
  return value;
}

function nowFrom(clock) {
  requireValue(typeof clock === 'function', 'INVOCATION_ADMISSION_CLOCK_INVALID');
  const value = clock();
  requireValue(value instanceof Date && Number.isFinite(value.getTime()), 'INVOCATION_ADMISSION_CLOCK_INVALID');
  return value;
}

function exactSelfDigest(record, digestKey, idKey, idPrefix, code) {
  verifySelfDigest(record, digestKey, code);
  const unsigned = Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== idKey && key !== digestKey));
  requireValue(record[idKey] === `${idPrefix}:${digestObject(unsigned).slice(7)}`, code);
}

function protectedGates(record, code) {
  requireValue(record.externalEgress === false && record.credentialResolution === false
    && record.production === 'HOLD' && record.publicRelease === 'HOLD' && record.g5 === 'HOLD', code);
}

export function createSupervisorInvocationRequest({
  commandId, requestedBy, workerId, maxTicks, maxDurationMs, leaseSeconds,
  timeoutMs = 1000, retryDelaySeconds = 1, recoveryDelaySeconds = 1,
  maxCandidates = 8, controlState, requestedAt, ttlSeconds,
}) {
  requireIdentifier(commandId, 'INVOCATION_REQUEST_COMMAND_INVALID');
  requireValue(COMMAND_ID.test(commandId), 'INVOCATION_REQUEST_COMMAND_SCOPE_DENIED');
  requireIdentifier(requestedBy, 'INVOCATION_REQUEST_REQUESTER_INVALID');
  requireIdentifier(workerId, 'INVOCATION_REQUEST_WORKER_INVALID');
  requireValue(workerId.startsWith('synthetic-worker:'), 'INVOCATION_REQUEST_WORKER_SCOPE_DENIED');
  boundedInteger(maxTicks, 1, 16, 'INVOCATION_REQUEST_TICK_BUDGET_INVALID');
  boundedInteger(maxDurationMs, 1, 60000, 'INVOCATION_REQUEST_DURATION_BUDGET_INVALID');
  boundedInteger(leaseSeconds, 1, 3600, 'INVOCATION_REQUEST_LEASE_INVALID');
  boundedInteger(timeoutMs, 1, 60000, 'INVOCATION_REQUEST_TIMEOUT_INVALID');
  boundedInteger(retryDelaySeconds, 1, 86400, 'INVOCATION_REQUEST_RETRY_DELAY_INVALID');
  boundedInteger(recoveryDelaySeconds, 1, 86400, 'INVOCATION_REQUEST_RECOVERY_DELAY_INVALID');
  boundedInteger(maxCandidates, 1, 16, 'INVOCATION_REQUEST_CANDIDATE_LIMIT_INVALID');
  boundedInteger(ttlSeconds, 1, 3600, 'INVOCATION_REQUEST_TTL_INVALID');
  const issued = requireInstant(requestedAt, 'INVOCATION_REQUEST_TIME_INVALID');
  const unsigned = {
    contractId: 'kidults-autonomous-supervisor-invocation-request-v1', version: '1.0.0',
    commandId, requestedBy, workerId, maxTicks, maxDurationMs, leaseSeconds, timeoutMs,
    retryDelaySeconds, recoveryDelaySeconds, maxCandidates,
    handlerRegistryId: 'synthetic-handler-registry-v1',
    controlStateDigest: digestObject(snapshotJson(controlState)), requestedAt,
    expiresAt: new Date(issued.getTime() + ttlSeconds * 1000).toISOString(),
    scope: 'LOCAL_SYNTHETIC_SHADOW_ONLY', externalEgress: false,
    credentialResolution: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const requestId = `supervisor-request:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, requestId };
  return { ...identified, requestDigest: digestObject(identified) };
}

export function validateSupervisorInvocationRequest(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, REQUEST_KEYS, 'INVOCATION_REQUEST_SHAPE_INVALID');
  requireValue(request.contractId === 'kidults-autonomous-supervisor-invocation-request-v1'
    && request.version === '1.0.0', 'INVOCATION_REQUEST_CONTRACT_INVALID');
  requireIdentifier(request.commandId, 'INVOCATION_REQUEST_COMMAND_INVALID');
  requireValue(COMMAND_ID.test(request.commandId), 'INVOCATION_REQUEST_COMMAND_SCOPE_DENIED');
  requireIdentifier(request.requestedBy, 'INVOCATION_REQUEST_REQUESTER_INVALID');
  requireIdentifier(request.workerId, 'INVOCATION_REQUEST_WORKER_INVALID');
  requireValue(request.workerId.startsWith('synthetic-worker:'), 'INVOCATION_REQUEST_WORKER_SCOPE_DENIED');
  boundedInteger(request.maxTicks, 1, 16, 'INVOCATION_REQUEST_TICK_BUDGET_INVALID');
  boundedInteger(request.maxDurationMs, 1, 60000, 'INVOCATION_REQUEST_DURATION_BUDGET_INVALID');
  boundedInteger(request.leaseSeconds, 1, 3600, 'INVOCATION_REQUEST_LEASE_INVALID');
  boundedInteger(request.timeoutMs, 1, 60000, 'INVOCATION_REQUEST_TIMEOUT_INVALID');
  boundedInteger(request.retryDelaySeconds, 1, 86400, 'INVOCATION_REQUEST_RETRY_DELAY_INVALID');
  boundedInteger(request.recoveryDelaySeconds, 1, 86400, 'INVOCATION_REQUEST_RECOVERY_DELAY_INVALID');
  boundedInteger(request.maxCandidates, 1, 16, 'INVOCATION_REQUEST_CANDIDATE_LIMIT_INVALID');
  requireValue(request.handlerRegistryId === 'synthetic-handler-registry-v1'
    && request.scope === 'LOCAL_SYNTHETIC_SHADOW_ONLY', 'INVOCATION_REQUEST_SCOPE_INVALID');
  requireDigest(request.controlStateDigest, 'INVOCATION_REQUEST_CONTROL_DIGEST_INVALID');
  const requestedAt = requireInstant(request.requestedAt, 'INVOCATION_REQUEST_TIME_INVALID');
  const expiresAt = requireInstant(request.expiresAt, 'INVOCATION_REQUEST_TIME_INVALID');
  requireValue(expiresAt > requestedAt && expiresAt.getTime() - requestedAt.getTime() <= 3600000,
    'INVOCATION_REQUEST_LIFETIME_INVALID');
  protectedGates(request, 'INVOCATION_REQUEST_PROTECTED_GATE_INVALID');
  requireIdentifier(request.requestId, 'INVOCATION_REQUEST_ID_INVALID');
  requireDigest(request.requestDigest, 'INVOCATION_REQUEST_DIGEST_INVALID');
  exactSelfDigest(request, 'requestDigest', 'requestId', 'supervisor-request',
    'INVOCATION_REQUEST_INTEGRITY_INVALID');
  return request;
}

export function createSupervisorInvocationDecision(requestInput, {
  decision, reviewerId, decidedAt,
}) {
  const request = validateSupervisorInvocationRequest(requestInput);
  requireValue(decision === 'APPROVED' || decision === 'REJECTED', 'INVOCATION_DECISION_VALUE_INVALID');
  requireIdentifier(reviewerId, 'INVOCATION_DECISION_REVIEWER_INVALID');
  requireValue(reviewerId.startsWith('kpmo-reviewer:'), 'INVOCATION_DECISION_REVIEWER_SCOPE_DENIED');
  const observed = requireInstant(decidedAt, 'INVOCATION_DECISION_TIME_INVALID');
  requireValue(observed >= new Date(request.requestedAt), 'INVOCATION_DECISION_TIME_ORDER_INVALID');
  if (decision === 'APPROVED') {
    requireValue(observed < new Date(request.expiresAt), 'INVOCATION_DECISION_REQUEST_EXPIRED');
  }
  const unsigned = {
    contractId: 'kidults-autonomous-supervisor-invocation-decision-v1', version: '1.0.0',
    commandId: request.commandId, requestId: request.requestId,
    requestDigest: request.requestDigest, decision, reviewerId,
    reviewerAuthentication: 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER',
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId: request.requestId, subjectDigest: request.requestDigest,
    requiredReviewerRole: 'KPMO', decidedAt,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const decisionId = `supervisor-decision:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, decisionId };
  return { ...identified, decisionDigest: digestObject(identified) };
}

export function validateSupervisorInvocationDecision(input, requestInput) {
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = snapshotJson(input);
  requireExactRecord(decision, DECISION_KEYS, 'INVOCATION_DECISION_SHAPE_INVALID');
  requireValue(decision.contractId === 'kidults-autonomous-supervisor-invocation-decision-v1'
    && decision.version === '1.0.0', 'INVOCATION_DECISION_CONTRACT_INVALID');
  requireValue(decision.decision === 'APPROVED' || decision.decision === 'REJECTED',
    'INVOCATION_DECISION_VALUE_INVALID');
  requireIdentifier(decision.reviewerId, 'INVOCATION_DECISION_REVIEWER_INVALID');
  requireValue(decision.reviewerId.startsWith('kpmo-reviewer:')
    && decision.reviewerAuthentication === 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER'
    && decision.authorityClass === 'LOCAL_SYNTHETIC_SHADOW'
    && decision.subjectType === 'SUPERVISOR_INVOCATION'
    && decision.subjectId === request.requestId
    && decision.subjectDigest === request.requestDigest
    && decision.requiredReviewerRole === 'KPMO',
  'INVOCATION_DECISION_AUTHORITY_INVALID');
  requireInstant(decision.decidedAt, 'INVOCATION_DECISION_TIME_INVALID');
  requireValue(new Date(decision.decidedAt) >= new Date(request.requestedAt),
    'INVOCATION_DECISION_TIME_ORDER_INVALID');
  if (decision.decision === 'APPROVED') {
    requireValue(new Date(decision.decidedAt) < new Date(request.expiresAt),
      'INVOCATION_DECISION_REQUEST_EXPIRED');
  }
  protectedGates(decision, 'INVOCATION_DECISION_PROTECTED_GATE_INVALID');
  requireValue(decision.commandId === request.commandId && decision.requestId === request.requestId
    && decision.requestDigest === request.requestDigest, 'INVOCATION_DECISION_REQUEST_BINDING_INVALID');
  requireIdentifier(decision.decisionId, 'INVOCATION_DECISION_ID_INVALID');
  requireDigest(decision.decisionDigest, 'INVOCATION_DECISION_DIGEST_INVALID');
  exactSelfDigest(decision, 'decisionDigest', 'decisionId', 'supervisor-decision',
    'INVOCATION_DECISION_INTEGRITY_INVALID');
  return decision;
}

function consumptionReceipt(request, decision, currentControlState, consumedAt) {
  requireValue(decision.decision === 'APPROVED', 'INVOCATION_CONSUMPTION_NOT_APPROVED');
  const controlStateDigest = digestObject(snapshotJson(currentControlState));
  requireValue(controlStateDigest === request.controlStateDigest,
    'INVOCATION_CONSUMPTION_CONTROL_STATE_CHANGED');
  const consumed = requireInstant(consumedAt, 'INVOCATION_CONSUMPTION_TIME_INVALID');
  requireValue(consumed >= new Date(decision.decidedAt), 'INVOCATION_CONSUMPTION_TIME_ORDER_INVALID');
  requireValue(consumed < new Date(request.expiresAt), 'INVOCATION_CONSUMPTION_REQUEST_EXPIRED');
  const unsigned = {
    contractId: 'kidults-autonomous-supervisor-invocation-consumption-v1', version: '1.0.0',
    commandId: request.commandId, requestId: request.requestId,
    requestDigest: request.requestDigest, decisionId: decision.decisionId,
    decisionDigest: decision.decisionDigest, controlStateDigest, consumedAt,
    externalEgress: false, credentialResolution: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const consumptionId = `supervisor-consumption:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, consumptionId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function validateSupervisorInvocationConsumption(input, requestInput, decisionInput) {
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = validateSupervisorInvocationDecision(decisionInput, request);
  const receipt = snapshotJson(input);
  requireValue(decision.decision === 'APPROVED', 'INVOCATION_CONSUMPTION_NOT_APPROVED');
  requireExactRecord(receipt, CONSUMPTION_KEYS, 'INVOCATION_CONSUMPTION_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-supervisor-invocation-consumption-v1'
    && receipt.version === '1.0.0', 'INVOCATION_CONSUMPTION_CONTRACT_INVALID');
  requireValue(receipt.commandId === request.commandId && receipt.requestId === request.requestId
    && receipt.requestDigest === request.requestDigest && receipt.decisionId === decision.decisionId
    && receipt.decisionDigest === decision.decisionDigest
    && receipt.controlStateDigest === request.controlStateDigest,
  'INVOCATION_CONSUMPTION_BINDING_INVALID');
  const consumedAt = requireInstant(receipt.consumedAt, 'INVOCATION_CONSUMPTION_TIME_INVALID');
  requireValue(consumedAt >= new Date(decision.decidedAt), 'INVOCATION_CONSUMPTION_TIME_ORDER_INVALID');
  requireValue(consumedAt < new Date(request.expiresAt), 'INVOCATION_CONSUMPTION_REQUEST_EXPIRED');
  requireIdentifier(receipt.consumptionId, 'INVOCATION_CONSUMPTION_ID_INVALID');
  requireDigest(receipt.receiptDigest, 'INVOCATION_CONSUMPTION_DIGEST_INVALID');
  requireValue(receipt.remoteWorkerActivation === 'HOLD', 'INVOCATION_CONSUMPTION_REMOTE_GATE_INVALID');
  protectedGates(receipt, 'INVOCATION_CONSUMPTION_PROTECTED_GATE_INVALID');
  exactSelfDigest(receipt, 'receiptDigest', 'consumptionId', 'supervisor-consumption',
    'INVOCATION_CONSUMPTION_INTEGRITY_INVALID');
  return receipt;
}

function invocationExecutionReceipt(request, decision, consumption, supervisorReceipt) {
  const verifiedSupervisor = verifyShadowSupervisorReceipt(supervisorReceipt);
  const unsigned = {
    contractId: 'kidults-autonomous-supervisor-invocation-execution-receipt-v1', version: '1.0.0',
    commandId: request.commandId, requestDigest: request.requestDigest,
    decisionDigest: decision.decisionDigest,
    consumptionReceiptDigest: consumption.receiptDigest,
    supervisorReceiptDigest: verifiedSupervisor.receiptDigest,
    supervisorState: verifiedSupervisor.state, completedAt: verifiedSupervisor.finishedAt,
    externalEgress: false, credentialResolution: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const executionId = `supervisor-execution:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, executionId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifySupervisorInvocationExecutionReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, EXECUTION_KEYS, 'INVOCATION_EXECUTION_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-supervisor-invocation-execution-receipt-v1'
    && receipt.version === '1.0.0', 'INVOCATION_EXECUTION_RECEIPT_CONTRACT_INVALID');
  requireIdentifier(receipt.commandId, 'INVOCATION_EXECUTION_COMMAND_INVALID');
  for (const digest of [receipt.requestDigest, receipt.decisionDigest,
    receipt.consumptionReceiptDigest, receipt.supervisorReceiptDigest]) {
    requireDigest(digest, 'INVOCATION_EXECUTION_DIGEST_INVALID');
  }
  requireValue(SUPERVISOR_STATES.has(receipt.supervisorState), 'INVOCATION_EXECUTION_STATE_INVALID');
  requireInstant(receipt.completedAt, 'INVOCATION_EXECUTION_TIME_INVALID');
  requireIdentifier(receipt.executionId, 'INVOCATION_EXECUTION_ID_INVALID');
  requireDigest(receipt.receiptDigest, 'INVOCATION_EXECUTION_DIGEST_INVALID');
  requireValue(receipt.remoteWorkerActivation === 'HOLD', 'INVOCATION_EXECUTION_REMOTE_GATE_INVALID');
  protectedGates(receipt, 'INVOCATION_EXECUTION_PROTECTED_GATE_INVALID');
  exactSelfDigest(receipt, 'receiptDigest', 'executionId', 'supervisor-execution',
    'INVOCATION_EXECUTION_INTEGRITY_INVALID');
  return receipt;
}

function jsonValue(value, code) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw new Error(code); }
}
function sameJson(left, right) { return canonicalJson(jsonValue(left, 'INVOCATION_READBACK_JSON_INVALID')) === canonicalJson(right); }
async function begin(client) {
  requireValue(client && typeof client.query === 'function', 'INVOCATION_CLIENT_INVALID');
  await client.query('BEGIN');
  await client.query("SELECT set_config('kidults.writer_id', $1, true)", [WRITER_ID]);
  await client.query('SELECT kidults_control.assert_registered_writer($1)', [WRITER_ID]);
}
async function rollback(client) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } }

function requestMatches(row, request) {
  return row && row.command_id === request.commandId && row.request_id === request.requestId
    && row.request_digest === request.requestDigest && row.writer_id === WRITER_ID
    && sameJson(row.request_json, request);
}
function decisionMatches(row, decision) {
  return row && row.command_id === decision.commandId && row.request_id === decision.requestId
    && row.request_digest === decision.requestDigest && row.decision_id === decision.decisionId
    && row.decision_digest === decision.decisionDigest && row.writer_id === WRITER_ID
    && sameJson(row.decision_json, decision);
}
function consumptionMatches(row, receipt) {
  return row && row.command_id === receipt.commandId && row.request_id === receipt.requestId
    && row.request_digest === receipt.requestDigest && row.decision_id === receipt.decisionId
    && row.decision_digest === receipt.decisionDigest
    && row.control_state_digest === receipt.controlStateDigest
    && row.consumption_id === receipt.consumptionId
    && row.receipt_digest === receipt.receiptDigest && row.writer_id === WRITER_ID
    && sameJson(row.consumption_json, receipt);
}

export async function persistSupervisorInvocationRequest(client, input) {
  const request = validateSupervisorInvocationRequest(input);
  requireValue(Buffer.byteLength(canonicalJson(request), 'utf8') <= 65536, 'INVOCATION_REQUEST_TOO_LARGE');
  try {
    await begin(client);
    const inserted = await client.query(`INSERT INTO kidults_control.autonomous_supervisor_invocation_requests
      (command_id, request_id, request_digest, expires_at, request_json, writer_id)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      ON CONFLICT (command_id) DO NOTHING RETURNING *`, [request.commandId, request.requestId,
      request.requestDigest, request.expiresAt, JSON.stringify(request), WRITER_ID]);
    const row = inserted.rows?.[0] ?? (await client.query(
      'SELECT * FROM kidults_control.autonomous_supervisor_invocation_requests WHERE command_id=$1',
      [request.commandId])).rows?.[0];
    requireValue(requestMatches(row, request), 'INVOCATION_REQUEST_CONFLICT');
    await client.query('COMMIT');
    return { state: inserted.rows?.length ? 'QUEUED' : 'IDEMPOTENT_REPLAY',
      requestDigest: request.requestDigest, remoteActivation: 'HOLD' };
  } catch (error) { await rollback(client); throw error; }
}

export async function persistSupervisorInvocationDecision(client, requestInput, decisionInput) {
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = validateSupervisorInvocationDecision(decisionInput, request);
  try {
    await begin(client);
    const storedRequest = (await client.query(
      'SELECT * FROM kidults_control.autonomous_supervisor_invocation_requests WHERE command_id=$1',
      [request.commandId])).rows?.[0];
    requireValue(requestMatches(storedRequest, request), 'INVOCATION_DECISION_REQUEST_NOT_FOUND');
    const inserted = await client.query(`INSERT INTO kidults_control.autonomous_supervisor_invocation_decisions
      (command_id, request_id, request_digest, decision_id, decision, decision_digest, decision_json, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT (command_id) DO NOTHING RETURNING *`, [decision.commandId, decision.requestId,
      decision.requestDigest, decision.decisionId, decision.decision,
      decision.decisionDigest, JSON.stringify(decision), WRITER_ID]);
    const row = inserted.rows?.[0] ?? (await client.query(
      'SELECT * FROM kidults_control.autonomous_supervisor_invocation_decisions WHERE command_id=$1',
      [decision.commandId])).rows?.[0];
    requireValue(decisionMatches(row, decision), 'INVOCATION_DECISION_CONFLICT');
    await client.query('COMMIT');
    return { state: inserted.rows?.length ? 'DECIDED' : 'IDEMPOTENT_REPLAY',
      decisionDigest: decision.decisionDigest, remoteActivation: 'HOLD' };
  } catch (error) { await rollback(client); throw error; }
}

export async function consumeSupervisorInvocation(client, {
  request: requestInput, decision: decisionInput, currentControlState, now,
}) {
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = validateSupervisorInvocationDecision(decisionInput, request);
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'INVOCATION_CONSUMPTION_TIME_INVALID');
  try {
    await begin(client);
    const stored = (await client.query(`/* AUTONOMOUS_SUPERVISOR_INVOCATION_ADMISSION_V1 */
      SELECT r.*, d.decision_id, d.decision, d.decision_digest, d.decision_json,
        d.writer_id AS decision_writer_id
      FROM kidults_control.autonomous_supervisor_invocation_requests r
      JOIN kidults_control.autonomous_supervisor_invocation_decisions d USING (command_id)
      WHERE r.command_id=$1`, [request.commandId])).rows?.[0];
    requireValue(requestMatches(stored, request), 'INVOCATION_ADMISSION_REQUEST_MISMATCH');
    requireValue(decisionMatches({ ...stored, writer_id: stored.decision_writer_id }, decision),
      'INVOCATION_ADMISSION_DECISION_MISMATCH');
    if (decision.decision !== 'APPROVED') {
      await client.query('COMMIT');
      return { state: 'REJECTED_HOLD', receipt: null };
    }
    const receipt = consumptionReceipt(request, decision, currentControlState, now.toISOString());
    const inserted = await client.query(`INSERT INTO kidults_control.autonomous_supervisor_invocation_consumptions
      (command_id, request_id, request_digest, decision_id, decision_digest, control_state_digest,
       consumption_id, consumed_at, consumption_json, receipt_digest, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
      ON CONFLICT (command_id) DO NOTHING RETURNING *`, [receipt.commandId, receipt.requestId,
      receipt.requestDigest, receipt.decisionId, receipt.decisionDigest, receipt.controlStateDigest,
      receipt.consumptionId, receipt.consumedAt, JSON.stringify(receipt), receipt.receiptDigest, WRITER_ID]);
    if (!inserted.rows?.length) {
      const existing = (await client.query(
        'SELECT * FROM kidults_control.autonomous_supervisor_invocation_consumptions WHERE command_id=$1',
        [request.commandId])).rows?.[0];
      requireValue(existing && existing.command_id === request.commandId,
        'INVOCATION_CONSUMPTION_READBACK_MISSING');
      const existingReceipt = validateSupervisorInvocationConsumption(
        jsonValue(existing.consumption_json, 'INVOCATION_READBACK_JSON_INVALID'), request, decision);
      requireValue(consumptionMatches(existing, existingReceipt),
        'INVOCATION_CONSUMPTION_READBACK_MISMATCH');
      await client.query('COMMIT');
      return { state: 'ALREADY_CONSUMED_HOLD', receipt: null };
    }
    requireValue(consumptionMatches(inserted.rows[0], receipt), 'INVOCATION_CONSUMPTION_READBACK_MISMATCH');
    await client.query('COMMIT');
    return { state: 'CONSUMED', receipt };
  } catch (error) { await rollback(client); throw error; }
}

export async function runAdmittedShadowSupervisor({
  admissionClient, taskClient, proofClient = taskClient, request, decision,
  controlState, clock = () => new Date(), monotonicClock,
}) {
  const boundedControlState = snapshotJson(controlState);
  const observedAt = nowFrom(clock);
  const admission = await consumeSupervisorInvocation(admissionClient, {
    request, decision, currentControlState: boundedControlState, now: observedAt,
  });
  if (admission.state !== 'CONSUMED') {
    return { state: admission.state, admissionReceipt: null, supervisor: null,
      executionReceipt: null };
  }
  const verifiedRequest = validateSupervisorInvocationRequest(request);
  const supervisor = await runBoundedShadowSupervisor({
    taskClient, proofClient, controlState: boundedControlState,
    workerId: verifiedRequest.workerId, leaseSeconds: verifiedRequest.leaseSeconds,
    maxTicks: verifiedRequest.maxTicks, maxDurationMs: verifiedRequest.maxDurationMs,
    timeoutMs: verifiedRequest.timeoutMs, retryDelaySeconds: verifiedRequest.retryDelaySeconds,
    recoveryDelaySeconds: verifiedRequest.recoveryDelaySeconds,
    maxCandidates: verifiedRequest.maxCandidates, clock, monotonicClock,
  });
  const executionReceipt = invocationExecutionReceipt(verifiedRequest,
    validateSupervisorInvocationDecision(decision, verifiedRequest), admission.receipt,
    supervisor.receipt);
  return { state: 'ADMITTED_AND_EXECUTED', admissionReceipt: admission.receipt,
    supervisor, executionReceipt };
}
