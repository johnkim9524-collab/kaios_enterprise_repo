import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import { persistAdmissionProof } from '../src/autonomous-control/admission-proof-store-v1.mjs';
import {
  runBoundedShadowSupervisor, runPostgresBoundedShadowSupervisor,
  verifyShadowSupervisorReceipt,
} from '../src/autonomous-control/shadow-supervisor-v1.mjs';
import { claimTask, createTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';
import { persistInitialTask, persistTaskTransition } from '../src/autonomous-control/task-ledger-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const base = new Date('2026-09-19T07:00:00.000Z');
const workerId = 'synthetic-worker:shadow-supervisor-1';

function control(overrides = {}) {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD', ...overrides,
  };
}

function fixture(taskId, { maxAttempts = 3, priority = 100 } = {}) {
  const sourceRequest = {
    requestId: `request:${taskId}`, taskId, sourceId: 'synthetic-source',
    sourceFamilyId: 'synthetic-family', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'SYNTHETIC_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digestObject({ endpoint: 'none' }),
  };
  return {
    proof: { sourceRequest, ...evaluateAdmission({ sourceRequest, controlState: control(),
      now: base, ttlSeconds: 300 }) },
    task: createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts, priority,
      admissionRequestDigest: digestObject(sourceRequest), now: base }),
  };
}

function clock() {
  let value = base.getTime() + 20_000;
  return () => { const result = new Date(value); value += 100; return result; };
}

function monotonic(values = [0, 0, 1, 2, 3, 4]) {
  const queue = [...values];
  let last = queue.at(-1) ?? 0;
  return () => { if (queue.length) last = queue.shift(); return last; };
}

async function store(client, item, { withProof = true } = {}) {
  await persistInitialTask(client, item.task);
  if (withProof) await persistAdmissionProof(client, item.proof,
    { now: new Date(base.getTime() + 1_000) });
}

function run(client, overrides = {}) {
  return runBoundedShadowSupervisor({ taskClient: client, controlState: control(),
    workerId, leaseSeconds: 120, maxTicks: 3, maxDurationMs: 1000,
    retryDelaySeconds: 5, recoveryDelaySeconds: 5, clock: clock(),
    monotonicClock: monotonic(), ...overrides });
}

test('bounded supervisor executes only up to the explicit tick budget', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:supervisor-first', { priority: 1 }));
  await store(client, fixture('task:supervisor-second', { priority: 2 }));
  await store(client, fixture('task:supervisor-third', { priority: 3 }));
  const result = await run(client, { maxTicks: 2 });
  assert.equal(result.state, 'TICK_BUDGET_EXHAUSTED');
  assert.equal(result.ticks.length, 2);
  assert.equal(result.receipt.executedCount, 2);
  assert.equal(client.state.transitions.some((row) => row.task_id === 'task:supervisor-third'), false);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('bounded supervisor drains to idle after successful work', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:supervisor-drain'));
  const result = await run(client);
  assert.equal(result.state, 'IDLE_DRAINED');
  assert.deepEqual(result.receipt.tickStates, ['CYCLE_EXECUTED', 'CYCLE_IDLE']);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('PostgreSQL supervisor shares one connection across bounded ticks and closes once', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:postgres-supervisor-first', { priority: 1 }));
  await store(client, fixture('task:postgres-supervisor-second', { priority: 2 }));
  const events = [];
  const result = await runPostgresBoundedShadowSupervisor({
    postgres: { opaque: 'connector-owned' }, controlState: control(), workerId,
    leaseSeconds: 120, maxTicks: 3, maxDurationMs: 1000,
    retryDelaySeconds: 5, recoveryDelaySeconds: 5, clock: clock(),
    monotonicClock: monotonic(),
  }, { connect: async options => {
    events.push(['connect', options]);
    return {
      query: (...args) => client.query(...args),
      close: async () => { events.push(['close']); },
    };
  } });
  assert.equal(result.state, 'IDLE_DRAINED');
  assert.deepEqual(result.receipt.tickStates,
    ['CYCLE_EXECUTED', 'CYCLE_EXECUTED', 'CYCLE_IDLE']);
  assert.deepEqual(events, [['connect', { opaque: 'connector-owned' }], ['close']]);
});

test('PostgreSQL supervisor denies caller client substitution before connecting', async () => {
  await assert.rejects(runPostgresBoundedShadowSupervisor({
    postgres: {}, taskClient: fakeAutonomousTaskClient(), controlState: control(),
    workerId, leaseSeconds: 120, maxTicks: 1, maxDurationMs: 1000,
  }, { connect: async () => { throw new Error('CONNECT_MUST_NOT_RUN'); } }),
  /SHADOW_SUPERVISOR_POSTGRES_CLIENT_OVERRIDE_DENIED/);
});

test('recovery is a supervisor stop and cannot be followed by a fresh claim', async () => {
  const client = fakeAutonomousTaskClient();
  const expired = fixture('task:supervisor-expired');
  await store(client, expired);
  const leased = claimTask(expired.task, { workerId: 'synthetic-worker:expired',
    leaseSeconds: 10, now: new Date(base.getTime() + 5_000) });
  await persistTaskTransition(client, expired.task, leased);
  await store(client, fixture('task:supervisor-blocked'));
  const result = await run(client);
  assert.equal(result.state, 'RECOVERY_APPLIED_STOP');
  assert.equal(result.receipt.recoveryCount, 1);
  assert.equal(client.state.transitions.some((row) => row.task_id === 'task:supervisor-blocked'), false);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('proof retry and quarantine stop without immediate task re-execution', async () => {
  const retryClient = fakeAutonomousTaskClient();
  await store(retryClient, fixture('task:supervisor-no-proof'), { withProof: false });
  const retried = await run(retryClient);
  assert.equal(retried.state, 'RETRY_SCHEDULED_STOP');
  assert.equal(retried.ticks.length, 1);

  const quarantineClient = fakeAutonomousTaskClient();
  await store(quarantineClient, fixture('task:supervisor-quarantine', { maxAttempts: 1 }),
    { withProof: false });
  const quarantined = await run(quarantineClient);
  assert.equal(quarantined.state, 'TASK_QUARANTINED_STOP');
  assert.equal(quarantined.receipt.quarantineCount, 1);
  verifyShadowSupervisorReceipt(quarantined.receipt);
});

test('claim contention stops the supervisor before any alternative loop', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:supervisor-contended'));
  client.state.forceRevisionConflictTaskIds.add('task:supervisor-contended');
  const result = await run(client, { maxCandidates: 1 });
  assert.equal(result.state, 'CONTENTION_STOP');
  assert.equal(result.ticks.length, 1);
  assert.equal(client.state.transitions.length, 0);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('global kill and pre-cancellation stop before database access', async () => {
  const killedClient = fakeAutonomousTaskClient();
  const killed = await run(killedClient, { controlState: control({ globalKill: true }) });
  assert.equal(killed.state, 'GLOBAL_KILL_STOP');
  assert.equal(killedClient.state.calls.length, 0);

  const cancelledClient = fakeAutonomousTaskClient();
  const controller = new AbortController();
  controller.abort();
  const cancelled = await run(cancelledClient, { cancellationSignal: controller.signal });
  assert.equal(cancelled.state, 'CANCELLED_STOP');
  assert.equal(cancelledClient.state.calls.length, 0);
  verifyShadowSupervisorReceipt(killed.receipt);
  verifyShadowSupervisorReceipt(cancelled.receipt);
});

test('duration budget is checked before dispatching the next tick', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:supervisor-duration'));
  const callsBefore = client.state.calls.length;
  const result = await run(client, { maxDurationMs: 5,
    monotonicClock: monotonic([0, 5, 5]) });
  assert.equal(result.state, 'DURATION_BUDGET_EXHAUSTED');
  assert.equal(result.ticks.length, 0);
  assert.equal(client.state.calls.length, callsBefore);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('unexpected dependency failure is reduced to a bounded class and fails closed', async () => {
  const client = fakeAutonomousTaskClient();
  await store(client, fixture('task:supervisor-corrupt'));
  client.state.snapshots[0].task_json.priority = 999;
  const result = await run(client);
  assert.equal(result.state, 'FAIL_CLOSED_ERROR_STOP');
  assert.equal(result.receipt.failureClass, 'TASK_LEDGER_FAILURE');
  assert.equal(JSON.stringify(result.receipt).includes('SNAPSHOT_ROW_MISMATCH'), false);
  verifyShadowSupervisorReceipt(result.receipt);
});

test('supervisor receipt rejects count and protected-gate tampering', async () => {
  const client = fakeAutonomousTaskClient();
  const result = await run(client);
  assert.throws(() => verifyShadowSupervisorReceipt({ ...result.receipt,
    executedCount: 1 }), /SHADOW_SUPERVISOR_COUNT_BINDING_INVALID/);
  assert.throws(() => verifyShadowSupervisorReceipt({ ...result.receipt,
    automaticTrigger: 'ACTIVE' }), /SHADOW_SUPERVISOR_PROTECTED_GATE_INVALID/);
});
