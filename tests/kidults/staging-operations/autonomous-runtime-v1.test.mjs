import assert from 'node:assert/strict';
import test from 'node:test';
import { AutonomousRuntime, MemoryTransitionLedger } from '../../../scripts/kidults/staging-operations/lib/autonomous-runtime-v1.mjs';
import { AwsDurabilityBoundary, MockImmutableStore, ephemeralEd25519 } from '../../../scripts/kidults/staging-operations/lib/aws-durability-v1.mjs';
import { idFrom } from '../../../scripts/kidults/staging-operations/lib/canonical-v1.mjs';
import { ProviderControl, ShadowFetchBroker } from '../../../scripts/kidults/staging-operations/lib/provider-control-v1.mjs';

const mainSha = '598ebea42f14730e1227c4af711238ff8b0d30b5';
const nowMs = Date.parse('2026-09-21T16:00:00.000Z');
const approval = (role, taskId, actor) => ({
  approval_id: idFrom('approval', { role, taskId, actor }), approver_id: actor, role, task_id: taskId,
  expires_at: '2026-09-21T17:00:00.000Z',
});
const request = taskId => ({
  task_id: taskId, provider_id: 'fixture-open-metadata', policy_version: 'provider-control-staging-v1',
  rights: { snapshot_id: `rights:${taskId}`, expires_at: '2026-09-22T16:00:00.000Z' },
  approval_a: approval('TRACK_A', taskId, `a-${taskId}`), approval_z: approval('TRACK_Z', taskId, `z-${taskId}`),
  environment: 'STAGING', production: 'HOLD', public: 'HOLD', g5: 'HOLD',
});
const build = ({ ledger = new MemoryTransitionLedger(), broker = new ShadowFetchBroker({ fixture: { synthetic: true } }), durability } = {}) => {
  const keys = ephemeralEd25519();
  return { ledger, runtime: new AutonomousRuntime({
    now: () => nowMs, ledger,
    providerControl: new ProviderControl({ now: () => nowMs, providers: [{ provider_id: 'fixture-open-metadata', kill_switch: false }] }),
    broker,
    durability: durability ?? new AwsDurabilityBoundary({ store: new MockImmutableStore(), ...keys, mainSha }),
  }) };
};

test('normal autonomous tick records exactly one verified terminal evidence binding', () => {
  const { ledger, runtime } = build();
  const result = runtime.tick(request('normal-1'));
  assert.equal(result.state, 'COMPLETE_VERIFIED');
  assert.equal(ledger.rows('normal-1').filter(row => row.state === 'COMPLETE_VERIFIED').length, 1);
  assert.match(result.receipt_digest, /^sha256:[a-f0-9]{64}$/);
});

test('duplicate concurrent lease is suppressed', () => {
  const { ledger, runtime } = build();
  assert.ok(ledger.acquire('duplicate-1', nowMs, 1000));
  assert.equal(runtime.tick(request('duplicate-1')).state, 'DUPLICATE_SUPPRESSED');
});

test('expired worker lease is recovered on the next tick', () => {
  let clock = nowMs;
  const ledger = new MemoryTransitionLedger();
  assert.ok(ledger.acquire('recover-1', clock, 1000));
  clock += 1001;
  const keys = ephemeralEd25519();
  const runtime = new AutonomousRuntime({
    now: () => clock, ledger,
    providerControl: new ProviderControl({ now: () => clock, providers: [{ provider_id: 'fixture-open-metadata', kill_switch: false }] }),
    broker: new ShadowFetchBroker({ fixture: { synthetic: true } }),
    durability: new AwsDurabilityBoundary({ store: new MockImmutableStore(), ...keys, mainSha }),
  });
  assert.equal(runtime.tick(request('recover-1')).state, 'COMPLETE_VERIFIED');
});

test('provider timeout retries are bounded and end in quarantine', () => {
  const broker = new ShadowFetchBroker({ fixture: {}, failAttempts: 3 });
  const { ledger, runtime } = build({ broker });
  const result = runtime.tick(request('timeout-1'));
  assert.equal(result.state, 'QUARANTINED');
  assert.equal(result.attempt, 3);
  assert.equal(ledger.rows('timeout-1').filter(row => row.state === 'RETRY_WAIT').length, 2);
});

test('upload failure never records success and remains evidence pending', () => {
  const keys = ephemeralEd25519();
  const durability = new AwsDurabilityBoundary({ store: new MockImmutableStore({ failUpload: true }), ...keys, mainSha });
  const { ledger, runtime } = build({ durability });
  assert.equal(runtime.tick(request('upload-fail')).state, 'EVIDENCE_PENDING');
  assert.equal(ledger.rows('upload-fail').some(row => row.state === 'COMPLETE_VERIFIED'), false);
});

test('signature failure never records success', () => {
  const keys = ephemeralEd25519();
  const durability = new AwsDurabilityBoundary({ store: new MockImmutableStore(), ...keys, mainSha, failSign: true });
  const { runtime } = build({ durability });
  const result = runtime.tick(request('sign-fail'));
  assert.equal(result.state, 'EVIDENCE_PENDING');
  assert.equal(result.reason, 'KMS_SIGN_FAILED');
});

test('readback corruption never records success', () => {
  const keys = ephemeralEd25519();
  const durability = new AwsDurabilityBoundary({ store: new MockImmutableStore({ corruptReadback: true }), ...keys, mainSha });
  const { runtime } = build({ durability });
  assert.equal(runtime.tick(request('readback-fail')).reason, 'READBACK_DIGEST_MISMATCH');
});
