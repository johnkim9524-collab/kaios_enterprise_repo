import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import { persistAdmissionProof } from '../src/autonomous-control/admission-proof-store-v1.mjs';
import {
  createSupervisorInvocationDecision, createSupervisorInvocationRequest,
  persistSupervisorInvocationDecision, persistSupervisorInvocationRequest,
  runAdmittedShadowSupervisor, validateSupervisorInvocationConsumption,
  validateSupervisorInvocationDecision, validateSupervisorInvocationRequest,
  verifySupervisorInvocationExecutionReceipt,
} from '../src/autonomous-control/invocation-admission-v1.mjs';
import { createTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask } from '../src/autonomous-control/task-ledger-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const base = new Date('2026-09-19T08:00:00.000Z');

function control(overrides = {}) {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD', ...overrides,
  };
}

function request(commandId = 'supervisor-command:local-1', overrides = {}) {
  return createSupervisorInvocationRequest({ commandId, requestedBy: 'kpmo-requester:local',
    workerId: 'synthetic-worker:admitted-1', maxTicks: 2, maxDurationMs: 1000,
    leaseSeconds: 120, controlState: control(), requestedAt: base.toISOString(),
    ttlSeconds: 300, ...overrides });
}

function decision(invocationRequest, value = 'APPROVED') {
  return createSupervisorInvocationDecision(invocationRequest, { decision: value,
    reviewerId: 'kpmo-reviewer:local-1', decidedAt: new Date(base.getTime() + 1000).toISOString() });
}

function clock(start = base.getTime() + 2000) {
  let value = start;
  return () => { const result = new Date(value); value += 100; return result; };
}

function monotonic() {
  let value = 0;
  return () => value++;
}

async function queue(client, invocationRequest, invocationDecision) {
  await persistSupervisorInvocationRequest(client, invocationRequest);
  await persistSupervisorInvocationDecision(client, invocationRequest, invocationDecision);
}

async function storeExecutableTask(client, taskId) {
  const sourceRequest = {
    requestId: `request:${taskId}`, taskId, sourceId: 'synthetic-source',
    sourceFamilyId: 'synthetic-family', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'SYNTHETIC_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digestObject({ endpoint: 'none' }),
  };
  const proof = { sourceRequest, ...evaluateAdmission({ sourceRequest, controlState: control(),
    now: base, ttlSeconds: 300 }) };
  const task = createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts: 3,
    admissionRequestDigest: digestObject(sourceRequest), now: base });
  await persistInitialTask(client, task);
  await persistAdmissionProof(client, proof, { now: new Date(base.getTime() + 500) });
}

test('request and decision bind exact budgets, control state and launcher approval subject', () => {
  const invocationRequest = request();
  const invocationDecision = decision(invocationRequest);
  assert.equal(validateSupervisorInvocationRequest(invocationRequest).maxTicks, 2);
  assert.equal(validateSupervisorInvocationDecision(invocationDecision, invocationRequest)
    .reviewerAuthentication, 'CRYPTOGRAPHIC_APPROVAL_REQUIRED_AT_LAUNCHER');
  assert.equal(invocationDecision.subjectId, invocationRequest.requestId);
  assert.equal(invocationDecision.subjectDigest, invocationRequest.requestDigest);
  assert.equal(invocationDecision.requiredReviewerRole, 'KPMO');
  assert.throws(() => validateSupervisorInvocationRequest({ ...invocationRequest,
    maxTicks: 3 }), /INVOCATION_REQUEST_INTEGRITY_INVALID/);
  assert.throws(() => validateSupervisorInvocationDecision({ ...invocationDecision,
    subjectDigest: digestObject({ substituted: true }) }, invocationRequest),
  /INVOCATION_DECISION_AUTHORITY_INVALID/);
});

test('request and decision persistence are append-only exact replay', async () => {
  const client = fakeAutonomousTaskClient();
  const invocationRequest = request();
  const invocationDecision = decision(invocationRequest);
  assert.equal((await persistSupervisorInvocationRequest(client, invocationRequest)).state, 'QUEUED');
  assert.equal((await persistSupervisorInvocationRequest(client, invocationRequest)).state, 'IDEMPOTENT_REPLAY');
  assert.equal((await persistSupervisorInvocationDecision(client, invocationRequest, invocationDecision)).state,
    'DECIDED');
  assert.equal((await persistSupervisorInvocationDecision(client, invocationRequest, invocationDecision)).state,
    'IDEMPOTENT_REPLAY');
  await assert.rejects(persistSupervisorInvocationDecision(client, invocationRequest,
    decision(invocationRequest, 'REJECTED')), /INVOCATION_DECISION_CONFLICT/);
  await assert.rejects(persistSupervisorInvocationRequest(client,
    request('supervisor-command:local-1', { maxTicks: 3 })), /INVOCATION_REQUEST_CONFLICT/);
});

test('approved request is consumed once before supervisor execution', async () => {
  const client = fakeAutonomousTaskClient();
  const invocationRequest = request('supervisor-command:execute-once');
  const invocationDecision = decision(invocationRequest);
  await queue(client, invocationRequest, invocationDecision);
  await storeExecutableTask(client, 'task:admitted-execution');
  const first = await runAdmittedShadowSupervisor({ admissionClient: client, taskClient: client,
    request: invocationRequest, decision: invocationDecision, controlState: control(),
    clock: clock(), monotonicClock: monotonic() });
  assert.equal(first.state, 'ADMITTED_AND_EXECUTED');
  assert.equal(first.supervisor.state, 'IDLE_DRAINED');
  assert.equal(client.state.invocationConsumptions.length, 1);
  validateSupervisorInvocationConsumption(first.admissionReceipt, invocationRequest, invocationDecision);
  assert.equal(first.executionReceipt.consumptionReceiptDigest, first.admissionReceipt.receiptDigest);
  assert.equal(first.executionReceipt.supervisorReceiptDigest, first.supervisor.receipt.receiptDigest);
  verifySupervisorInvocationExecutionReceipt(first.executionReceipt);
  assert.throws(() => verifySupervisorInvocationExecutionReceipt({ ...first.executionReceipt,
    production: 'ACTIVE' }), /INVOCATION_EXECUTION_PROTECTED_GATE_INVALID/);
  const transitionCount = client.state.transitions.length;
  const replay = await runAdmittedShadowSupervisor({ admissionClient: client, taskClient: client,
    request: invocationRequest, decision: invocationDecision, controlState: control(),
    clock: clock(base.getTime() + 4000), monotonicClock: monotonic() });
  assert.equal(replay.state, 'ALREADY_CONSUMED_HOLD');
  assert.equal(replay.supervisor, null);
  assert.equal(replay.executionReceipt, null);
  assert.equal(client.state.transitions.length, transitionCount);
});

test('rejected decision never creates a consumption or invokes supervisor', async () => {
  const client = fakeAutonomousTaskClient();
  const invocationRequest = request('supervisor-command:rejected');
  const invocationDecision = decision(invocationRequest, 'REJECTED');
  await queue(client, invocationRequest, invocationDecision);
  await storeExecutableTask(client, 'task:rejected-remains-pending');
  const result = await runAdmittedShadowSupervisor({ admissionClient: client, taskClient: client,
    request: invocationRequest, decision: invocationDecision, controlState: control(),
    clock: clock(), monotonicClock: monotonic() });
  assert.equal(result.state, 'REJECTED_HOLD');
  assert.equal(result.supervisor, null);
  assert.equal(result.executionReceipt, null);
  assert.equal(client.state.invocationConsumptions.length, 0);
  assert.equal(client.state.transitions.length, 0);
});

test('expired or changed control authority fails before consumption', async () => {
  const expiredClient = fakeAutonomousTaskClient();
  const expiringRequest = request('supervisor-command:expired', { ttlSeconds: 2 });
  const expiringDecision = decision(expiringRequest);
  await queue(expiredClient, expiringRequest, expiringDecision);
  await assert.rejects(runAdmittedShadowSupervisor({ admissionClient: expiredClient,
    taskClient: expiredClient, request: expiringRequest, decision: expiringDecision,
    controlState: control(), clock: clock(base.getTime() + 2000), monotonicClock: monotonic() }),
  /INVOCATION_CONSUMPTION_REQUEST_EXPIRED/);
  assert.equal(expiredClient.state.invocationConsumptions.length, 0);

  const changedClient = fakeAutonomousTaskClient();
  const changedRequest = request('supervisor-command:changed-control');
  const changedDecision = decision(changedRequest);
  await queue(changedClient, changedRequest, changedDecision);
  await assert.rejects(runAdmittedShadowSupervisor({ admissionClient: changedClient,
    taskClient: changedClient, request: changedRequest, decision: changedDecision,
    controlState: control({ killEpoch: 2, globalKill: true }),
    clock: clock(), monotonicClock: monotonic() }), /INVOCATION_CONSUMPTION_CONTROL_STATE_CHANGED/);
  assert.equal(changedClient.state.invocationConsumptions.length, 0);
});

test('substituted request or decision cannot consume queued authority', async () => {
  const client = fakeAutonomousTaskClient();
  const original = request('supervisor-command:substitution');
  const approved = decision(original);
  await queue(client, original, approved);
  const substituted = request('supervisor-command:substitution', { maxDurationMs: 2000 });
  await assert.rejects(runAdmittedShadowSupervisor({ admissionClient: client, taskClient: client,
    request: substituted, decision: decision(substituted), controlState: control(),
    clock: clock(), monotonicClock: monotonic() }), /INVOCATION_ADMISSION_REQUEST_MISMATCH/);
  assert.equal(client.state.invocationConsumptions.length, 0);
});
