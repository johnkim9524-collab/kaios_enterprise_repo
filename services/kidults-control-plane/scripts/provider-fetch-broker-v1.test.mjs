import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { executeProviderFetch } from '../src/provider-fetch-broker.mjs';
import { canonicalJson, sha256 } from '../src/provider-control-runtime.mjs';
const policyBase = { allowedHosts: ['api.open.example'], allowedMethods: ['GET'], recordLimit: 2, byteLimit: 1000, timeoutMs: 1000 };
const trustedPolicy = { ...policyBase, digest: sha256(policyBase) };
const killKeys = generateKeyPairSync('ed25519');
const authorities = { KILL_SWITCH: { 'kill-authority': killKeys.publicKey } };
const killEnvelope = (overrides = {}) => { const payload = { generation: 7, status: 'INACTIVE', global: false, providers: [], purposes: [], issuedAt: '2026-09-21T10:00:00Z', expiresAt: '2026-09-22T00:00:00Z', ...overrides }; return { kind: 'KILL_SWITCH', issuer: 'kill-authority', payload, signature: sign(null, Buffer.from(canonicalJson(payload)), killKeys.privateKey).toString('base64') }; };
const permit = { action: 'REQUEST_OPAQUE_PERMIT', scope: { dataClass: 'REAL', providerId: 'OPEN', purposeCode: 'IDENTITY', endpoint: 'https://api.open.example/records', method: 'GET', fieldSchema: { id: { type: 'number', required: true } }, brokerPolicyDigest: trustedPolicy.digest }, boundary: { storageBoundaryId: 'REAL_QUARANTINE', writerCapability: 'WRITE_REAL_QUARANTINE', queueId: 'provider-real-ingress', kmsContext: 'kidults:data-class=REAL', dbNamespace: 'provider_real' }, killSwitchGeneration: 7, holds: { production: 'HOLD', public: 'HOLD', g5: 'HOLD' } };
const response = payload => { const bytes = Buffer.from(JSON.stringify(payload)); return { ok: true, status: 200, redirected: false, arrayBuffer: async () => bytes }; };
const harness = (overrides = {}) => {
  let consumed = false; let stored; let reserved = false;
  return { permitId: 'permit_1234567890abcdef', permitStore: { consume: async () => consumed ? null : (consumed = true, structuredClone(permit)) }, trustedPolicy,
    pilotLedger: { reserve: async () => reserved ? null : (reserved = true, 'reservation-1'), commit: async () => {}, release: async () => {} },
    quarantineStore: { storageBoundaryId: 'REAL_QUARANTINE', writerCapability: 'WRITE_REAL_QUARANTINE', write: async ({ bytes }) => { stored = Buffer.from(bytes); return 'artifact:opaque-1'; }, read: async () => Buffer.from(stored) },
    fetchImpl: async () => response([{ id: 1 }, { id: 2 }]), readKillSwitch: async () => killEnvelope(), authorities, evaluatedAt: '2026-09-21T12:00:00Z', ...overrides };
};
test('broker consumes once, readback-verifies bytes, and returns only opaque artifact', async () => {
  const h = harness(); const result = await executeProviderFetch(h); assert.equal(result.artifactRef, 'artifact:opaque-1'); assert.equal(result.records, undefined); assert.equal(result.receipt.status, 'RAW_QUARANTINED_VERIFIED');
  await assert.rejects(executeProviderFetch(h), /OPAQUE_PERMIT_INVALID_OR_CONSUMED/);
});
test('broker independently rejects forged destination and policy', async () => {
  const evil = structuredClone(permit); evil.scope.endpoint = 'https://evil.example/x';
  await assert.rejects(executeProviderFetch(harness({ permitStore: { consume: async () => evil } })), /BROKER_HOST_NOT_ALLOWED/);
  const drift = structuredClone(permit); drift.scope.brokerPolicyDigest = sha256({ drift: true });
  await assert.rejects(executeProviderFetch(harness({ permitStore: { consume: async () => drift } })), /BROKER_POLICY_DIGEST_MISMATCH/);
  await assert.rejects(executeProviderFetch(harness({ trustedPolicy: { ...trustedPolicy, byteLimit: 2000 } })), /BROKER_POLICY_DIGEST_MISMATCH/);
});
test('switch race, atomic cap, capability, and readback mismatch fail closed', async () => {
  let checks = 0;
  await assert.rejects(executeProviderFetch(harness({ readKillSwitch: async () => killEnvelope({ status: ++checks === 1 ? 'INACTIVE' : 'ACTIVE' }) })), /BROKER_KILL_SWITCH_CHANGED/);
  await assert.rejects(executeProviderFetch(harness({ pilotLedger: { reserve: async () => null, commit: async () => {}, release: async () => {} } })), /PILOT_ATOMIC_RESERVATION_DENIED/);
  await assert.rejects(executeProviderFetch(harness({ quarantineStore: { storageBoundaryId: 'SYNTHETIC_SANDBOX', writerCapability: 'WRITE_SYNTHETIC_ONLY', write: async () => 'x', read: async () => Buffer.alloc(0) } })), /QUARANTINE_CAPABILITY_MISMATCH/);
  await assert.rejects(executeProviderFetch(harness({ quarantineStore: { storageBoundaryId: 'REAL_QUARANTINE', writerCapability: 'WRITE_REAL_QUARANTINE', write: async () => 'x', read: async () => Buffer.from('corrupt') } })), /QUARANTINE_READBACK_HASH_MISMATCH/);
});
test('forged live switch and out-of-scope response fields fail closed', async () => {
  const forged = killEnvelope(); forged.signature = Buffer.alloc(64).toString('base64');
  await assert.rejects(executeProviderFetch(harness({ readKillSwitch: async () => forged })), /KILL_SWITCH_SIGNATURE_INVALID/);
  await assert.rejects(executeProviderFetch(harness({ fetchImpl: async () => response([{ id: 1, secret: 'x' }]) })), /BROKER_RESPONSE_FIELD_SCOPE_VIOLATION/);
  await assert.rejects(executeProviderFetch(harness({ fetchImpl: async () => response([{ id: 'wrong' }]) })), /BROKER_RESPONSE_FIELD_TYPE_VIOLATION/);
});
test('bounded response and retry classification remain fail closed', async () => {
  await assert.rejects(executeProviderFetch(harness({ fetchImpl: async () => response([{ value: 'x'.repeat(2000) }]) })), /BROKER_RESPONSE_BYTES_EXCEEDED/);
  await assert.rejects(executeProviderFetch(harness({ fetchImpl: async () => ({ ok: false, status: 429, redirected: false }) })), /BROKER_RETRYABLE_HTTP:429/);
});
