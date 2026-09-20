import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import { persistAdmissionProof } from '../src/autonomous-control/admission-proof-store-v1.mjs';
import {
  runOneAutonomousControlTick, runOnePostgresAutonomousControlTick,
  verifyAutonomousControlTickReceipt,
} from '../src/autonomous-control/control-tick-v1.mjs';
import { claimTask, createTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask, persistTaskTransition } from '../src/autonomous-control/task-ledger-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const base = new Date('2026-09-19T06:00:00.000Z');
const claimAt = new Date('2026-09-19T06:00:10.000Z');
const workerId = 'synthetic-worker:control-tick-1';

function control() {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
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

function makeTask(taskId, { maxAttempts = 3 } = {}) {
  const sourceRequest = source(taskId);
  return {
    sourceRequest,
    proof: { sourceRequest, ...evaluateAdmission({ sourceRequest, controlState: control(),
      now: base, ttlSeconds: 300 }) },
    task: createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts,
      admissionRequestDigest: digestObject(sourceRequest), now: base }),
  };
}

function clock(start = '2026-09-19T06:00:21.000Z') {
  let value = Date.parse(start);
  return () => { const result = new Date(value); value += 1000; return result; };
}

async function storePending(client, fixture, withProof = true) {
  await persistInitialTask(client, fixture.task);
  if (withProof) await persistAdmissionProof(client, fixture.proof,
    { now: new Date('2026-09-19T06:00:01.000Z') });
}

async function storeExpired(client, fixture) {
  await persistInitialTask(client, fixture.task);
  const leased = claimTask(fixture.task, {
    workerId: 'synthetic-worker:expired-owner', leaseSeconds: 10, now: claimAt,
  });
  await persistTaskTransition(client, fixture.task, leased);
}

function run(client, overrides = {}) {
  return runOneAutonomousControlTick({ taskClient: client, controlState: control(),
    workerId, leaseSeconds: 120, retryDelaySeconds: 5, recoveryDelaySeconds: 5,
    clock: clock(), ...overrides });
}

test('control tick recovers one expired lease before claiming available work', async () => {
  const client = fakeAutonomousTaskClient();
  await storeExpired(client, makeTask('task:tick-expired'));
  await storePending(client, makeTask('task:tick-pending'));
  const result = await run(client);
  assert.equal(result.state, 'RECOVERY_APPLIED');
  assert.equal(result.task.taskId, 'task:tick-expired');
  assert.equal(result.cycle, null);
  assert.deepEqual(client.state.transitions.map((row) => row.task_id),
    ['task:tick-expired', 'task:tick-expired']);
  assert.equal(Math.max(...client.state.snapshots
    .filter((row) => row.task_id === 'task:tick-pending').map((row) => row.revision)), 0);
  verifyAutonomousControlTickReceipt(result.receipt);
});

test('PostgreSQL control tick uses one connection and preserves recovery-first ordering', async () => {
  const client = fakeAutonomousTaskClient();
  await storeExpired(client, makeTask('task:postgres-tick-expired'));
  await storePending(client, makeTask('task:postgres-tick-pending'));
  const events = [];
  const result = await runOnePostgresAutonomousControlTick({
    postgres: { opaque: 'connector-owned' }, controlState: control(), workerId,
    leaseSeconds: 120, retryDelaySeconds: 5, recoveryDelaySeconds: 5, clock: clock(),
  }, { connect: async options => {
    events.push(['connect', options]);
    return {
      query: (...args) => client.query(...args),
      close: async () => { events.push(['close']); },
    };
  } });
  assert.equal(result.state, 'RECOVERY_APPLIED');
  assert.equal(result.task.taskId, 'task:postgres-tick-expired');
  assert.equal(result.cycle, null);
  assert.deepEqual(events, [['connect', { opaque: 'connector-owned' }], ['close']]);
  assert.equal(client.state.transitions.some(
    row => row.task_id === 'task:postgres-tick-pending'), false);
});

test('PostgreSQL control tick denies caller client substitution before connecting', async () => {
  await assert.rejects(runOnePostgresAutonomousControlTick({
    postgres: {}, taskClient: fakeAutonomousTaskClient(), controlState: control(),
    workerId, leaseSeconds: 120,
  }, { connect: async () => { throw new Error('CONNECT_MUST_NOT_RUN'); } }),
  /CONTROL_TICK_POSTGRES_CLIENT_OVERRIDE_DENIED/);
});

test('control tick executes one proof-backed task only when recovery is idle', async () => {
  const client = fakeAutonomousTaskClient();
  await storePending(client, makeTask('task:tick-execute'));
  const result = await run(client);
  assert.equal(result.recovery.state, 'IDLE');
  assert.equal(result.state, 'CYCLE_EXECUTED');
  assert.equal(result.task.state, 'SUCCEEDED');
  assert.equal(result.receipt.cycleReceiptDigest, result.cycle.receipt.receiptDigest);
  verifyAutonomousControlTickReceipt(result.receipt);
});

test('control tick returns a verifiable idle cycle without mutation', async () => {
  const client = fakeAutonomousTaskClient();
  const result = await run(client);
  assert.equal(result.state, 'CYCLE_IDLE');
  assert.equal(result.recovery.state, 'IDLE');
  assert.equal(client.state.transitions.length, 0);
  verifyAutonomousControlTickReceipt(result.receipt);
});

test('control tick quarantines an expired final attempt and does not claim pending work', async () => {
  const client = fakeAutonomousTaskClient();
  await storeExpired(client, makeTask('task:tick-exhausted', { maxAttempts: 1 }));
  await storePending(client, makeTask('task:tick-after-quarantine'));
  const result = await run(client);
  assert.equal(result.state, 'RECOVERY_QUARANTINED');
  assert.equal(result.task.state, 'QUARANTINED');
  assert.equal(client.state.transitions.some((row) => row.task_id === 'task:tick-after-quarantine'), false);
  verifyAutonomousControlTickReceipt(result.receipt);
});

test('recovery contention fails closed before a new claim', async () => {
  const client = fakeAutonomousTaskClient();
  await storeExpired(client, makeTask('task:tick-contended'));
  await storePending(client, makeTask('task:tick-blocked'));
  client.state.forceRevisionConflictTaskIds.add('task:tick-contended');
  const result = await run(client, { maxCandidates: 1 });
  assert.equal(result.state, 'RECOVERY_CONTENDED_RETRY');
  assert.equal(result.task, null);
  assert.equal(client.state.transitions.some((row) => row.task_id === 'task:tick-blocked'), false);
  verifyAutonomousControlTickReceipt(result.receipt);
});

test('control tick receipt rejects tampering and extra authority fields', async () => {
  const client = fakeAutonomousTaskClient();
  const result = await run(client);
  assert.throws(() => verifyAutonomousControlTickReceipt({ ...result.receipt,
    production: 'ACTIVE' }), /CONTROL_TICK_PROTECTED_GATE_INVALID/);
  assert.throws(() => verifyAutonomousControlTickReceipt({ ...result.receipt,
    providerActivation: 'ACTIVE' }), /CONTROL_TICK_RECEIPT_SHAPE_INVALID/);
});
