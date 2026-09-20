import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import {
  persistAdmissionProof, resolveAdmissionProof, validateAdmissionProof,
} from '../src/autonomous-control/admission-proof-store-v1.mjs';
import { createTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask } from '../src/autonomous-control/task-ledger-v1.mjs';
import {
  runOnePostgresSyntheticTaskCycle, runOneSyntheticTaskCycle, verifySingleCycleReceipt,
} from '../src/autonomous-control/task-runner-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const base = new Date('2026-09-19T06:00:00.000Z');
const workerId = 'synthetic-worker:cycle-1';

function control(overrides = {}) {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD', ...overrides,
  };
}
function source(taskId) {
  return {
    requestId: `request:${taskId}`, taskId, sourceId: 'synthetic-source',
    sourceFamilyId: 'synthetic-family', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'SYNTHETIC_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digestObject({ endpoint: 'none' }),
  };
}
function proof(taskId, issuedAt = base) {
  const sourceRequest = source(taskId);
  return { sourceRequest, ...evaluateAdmission({ sourceRequest, controlState: control(),
    now: issuedAt, ttlSeconds: 300 }) };
}
function clock(start = '2026-09-19T06:00:05.000Z') {
  let value = Date.parse(start);
  return () => { const result = new Date(value); value += 1000; return result; };
}
async function taskFixture(taskId, { maxAttempts = 3, withProof = true } = {}) {
  const client = fakeAutonomousTaskClient();
  const admissionProof = proof(taskId);
  const task = createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts,
    admissionRequestDigest: digestObject(admissionProof.sourceRequest), now: base });
  await persistInitialTask(client, task);
  if (withProof) await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
  return { client, task, admissionProof };
}

test('admission proof store records exact proof and resolves it by task and request digest', async () => {
  const client = fakeAutonomousTaskClient();
  const admissionProof = proof('task:proof-store');
  const first = await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
  const replay = await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:02.000Z') });
  assert.equal(first.state, 'RECORDED');
  assert.equal(replay.state, 'IDEMPOTENT_REPLAY');
  const resolved = await resolveAdmissionProof(client, {
    taskId: 'task:proof-store', admissionRequestDigest: digestObject(admissionProof.sourceRequest),
    now: new Date('2026-09-19T06:00:03.000Z'),
  });
  assert.equal(digestObject(resolved.proof), digestObject(admissionProof));
  assert.equal(resolved.proofDigest, digestObject(admissionProof));
});

test('proof validation rejects tampering and resolver excludes expired authority', async () => {
  const client = fakeAutonomousTaskClient();
  const admissionProof = proof('task:proof-guard');
  assert.throws(() => validateAdmissionProof({ ...admissionProof,
    sourceRequest: { ...admissionProof.sourceRequest, region: 'ALTERED' } }),
  /ADMISSION_PROOF_REQUEST_BINDING_INVALID/);
  await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
  assert.equal(await resolveAdmissionProof(client, {
    taskId: 'task:proof-guard', admissionRequestDigest: digestObject(admissionProof.sourceRequest),
    now: new Date('2026-09-19T06:05:00.000Z'),
  }), null);
});

test('proof conflicting readback rolls back and fails closed', async () => {
  const client = fakeAutonomousTaskClient();
  const admissionProof = proof('task:proof-conflict');
  await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
  client.state.admissionProofs[0].manifest_digest = digestObject({ forged: true });
  await assert.rejects(persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:02.000Z') }), /ADMISSION_PROOF_CONFLICT/);
});

test('resolver deterministically selects the newest still-valid proof', async () => {
  const client = fakeAutonomousTaskClient();
  const older = proof('task:proof-newest', new Date('2026-09-19T06:00:00.000Z'));
  const newer = proof('task:proof-newest', new Date('2026-09-19T06:00:10.000Z'));
  await persistAdmissionProof(client, older, { now: new Date('2026-09-19T06:00:01.000Z') });
  await persistAdmissionProof(client, newer, { now: new Date('2026-09-19T06:00:11.000Z') });
  const resolved = await resolveAdmissionProof(client, { taskId: 'task:proof-newest',
    admissionRequestDigest: digestObject(older.sourceRequest),
    now: new Date('2026-09-19T06:00:12.000Z') });
  assert.equal(resolved.proof.manifest.manifestId, newer.manifest.manifestId);
});

test('resolver rejects a row whose immutable columns diverge from proof JSON', async () => {
  const client = fakeAutonomousTaskClient();
  const admissionProof = proof('task:proof-readback');
  await persistAdmissionProof(client, admissionProof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
  client.state.admissionProofs[0].decision_digest = digestObject({ forged: true });
  await assert.rejects(resolveAdmissionProof(client, { taskId: 'task:proof-readback',
    admissionRequestDigest: digestObject(admissionProof.sourceRequest),
    now: new Date('2026-09-19T06:00:02.000Z') }), /ADMISSION_PROOF_READBACK_MISMATCH/);
});

test('single cycle claims, resolves proof, executes and emits a verifiable aggregate receipt', async () => {
  const fixture = await taskFixture('task:cycle-success');
  const result = await runOneSyntheticTaskCycle({ taskClient: fixture.client,
    controlState: control(), workerId, leaseSeconds: 120, retryDelaySeconds: 5, clock: clock() });
  assert.equal(result.state, 'EXECUTED');
  assert.equal(result.task.state, 'SUCCEEDED');
  assert.equal(result.receipt.executionReceiptDigest, result.executionReceipt.receiptDigest);
  assert.equal(digestObject(verifySingleCycleReceipt(result.receipt)), digestObject(result.receipt));
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition),
    ['CLAIM', 'START', 'CHECKPOINT', 'COMPLETE']);
});

test('PostgreSQL integration shares one connection across task and proof ledgers and closes it', async () => {
  const fixture = await taskFixture('task:postgres-cycle-success');
  const events = [];
  const result = await runOnePostgresSyntheticTaskCycle({
    postgres: { opaque: 'connector-owned' }, controlState: control(), workerId,
    leaseSeconds: 120, retryDelaySeconds: 5, clock: clock(),
  }, { connect: async options => {
    events.push(['connect', options]);
    return {
      query: (...args) => fixture.client.query(...args),
      close: async () => { events.push(['close']); },
    };
  } });
  assert.equal(result.state, 'EXECUTED');
  assert.deepEqual(events, [['connect', { opaque: 'connector-owned' }], ['close']]);
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition),
    ['CLAIM', 'START', 'CHECKPOINT', 'COMPLETE']);
});

test('PostgreSQL integration denies client substitution and preserves primary failure on close', async () => {
  await assert.rejects(runOnePostgresSyntheticTaskCycle({
    postgres: {}, taskClient: fakeAutonomousTaskClient(), controlState: control(),
    workerId, leaseSeconds: 120,
  }, { connect: async () => { throw new Error('CONNECT_MUST_NOT_RUN'); } }),
  /TASK_RUNNER_POSTGRES_CLIENT_OVERRIDE_DENIED/);
  const primary = new Error('PRIMARY_QUERY_FAILURE');
  await assert.rejects(runOnePostgresSyntheticTaskCycle({
    postgres: {}, controlState: control(), workerId, leaseSeconds: 120, clock: clock(),
  }, { connect: async () => ({
    query: async () => { throw primary; },
    close: async () => { throw new Error('SECONDARY_CLOSE_FAILURE'); },
  }) }), error => error === primary);
});

test('idle cycle performs no mutation', async () => {
  const client = fakeAutonomousTaskClient();
  const result = await runOneSyntheticTaskCycle({ taskClient: client, controlState: control(),
    workerId, leaseSeconds: 120, clock: clock() });
  assert.equal(result.state, 'IDLE');
  assert.equal(client.state.transitions.length, 0);
  verifySingleCycleReceipt(result.receipt);
});

test('missing proof releases the lease for bounded retry without invoking a handler', async () => {
  const fixture = await taskFixture('task:cycle-no-proof', { withProof: false });
  const result = await runOneSyntheticTaskCycle({ taskClient: fixture.client,
    controlState: control(), workerId, leaseSeconds: 120, retryDelaySeconds: 9, clock: clock() });
  assert.equal(result.state, 'PROOF_UNAVAILABLE_RETRY');
  assert.equal(result.task.state, 'RETRY_SCHEDULED');
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition),
    ['CLAIM', 'RELEASE_LEASE_RETRY']);
  verifySingleCycleReceipt(result.receipt);
});

test('changed control state denies preflight and returns the claim without start', async () => {
  const fixture = await taskFixture('task:cycle-killed');
  const result = await runOneSyntheticTaskCycle({ taskClient: fixture.client,
    controlState: control({ globalKill: true, killEpoch: 2 }), workerId,
    leaseSeconds: 120, retryDelaySeconds: 3, clock: clock() });
  assert.equal(result.state, 'PREFLIGHT_DENIED_RETRY');
  assert.equal(result.task.lastReason, 'TASK_ADMISSION_PREFLIGHT_DENIED');
  assert.deepEqual(fixture.client.state.transitions.map(row => row.transition),
    ['CLAIM', 'RELEASE_LEASE_RETRY']);
});

test('proof failure on final allowed attempt quarantines instead of looping', async () => {
  const fixture = await taskFixture('task:cycle-quarantine', { maxAttempts: 1, withProof: false });
  const result = await runOneSyntheticTaskCycle({ taskClient: fixture.client,
    controlState: control(), workerId, leaseSeconds: 120, clock: clock() });
  assert.equal(result.state, 'QUARANTINED');
  assert.equal(result.task.state, 'QUARANTINED');
  assert.equal(result.task.lastReason, 'TASK_ATTEMPTS_EXHAUSTED');
  verifySingleCycleReceipt(result.receipt);
});
