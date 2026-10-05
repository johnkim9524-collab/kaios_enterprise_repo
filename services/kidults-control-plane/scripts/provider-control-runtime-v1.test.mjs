import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authorizeProviderControl, canonicalJson, evaluateProviderControl, sha256 } from '../src/provider-control-runtime.mjs';
const pairs = Object.fromEntries(['RIGHTS','SCHEMA','KILL_SWITCH'].map(k => [k, generateKeyPairSync('ed25519')]));
const authorities = Object.fromEntries(Object.entries(pairs).map(([k,v]) => [k, { [`${k.toLowerCase()}-authority`]: v.publicKey }]));
const envelope = (kind, payload, issuer = `${kind.toLowerCase()}-authority`) => ({ kind, issuer, payload, signature: sign(null, Buffer.from(canonicalJson(payload)), pairs[kind].privateKey).toString('base64') });
const policy = { allowedHosts: ['api.open.example'], allowedMethods: ['GET'], recordLimit: 30, byteLimit: 100000, timeoutMs: 5000 };
const registry = (overrides = {}) => ({ status: 'ACTIVE_FAIL_CLOSED', as_of: '2026-09-20', communication_status: { observed_through: '2026-09-20' }, evidence_freshness_policy: { max_age_days_by_state: { BOUNDED: 31 } }, providers: [{ provider_id: 'OPEN_ARCHIVE', state: 'BOUNDED', evidence_date: '2026-09-20', acquisition_authorized: true, credential_mode: 'NONE', credential_authorized: false, new_spend_authorized: false, adapter_state: 'ACTIVE', production: 'HOLD', public_release: 'HOLD', ...overrides }] });
const realBoundary = { storageBoundaryId: 'REAL_QUARANTINE', writerCapability: 'WRITE_REAL_QUARANTINE', queueId: 'provider-real-ingress', kmsContext: 'kidults:data-class=REAL', dbNamespace: 'provider_real' };
const syntheticBoundary = { storageBoundaryId: 'SYNTHETIC_SANDBOX', writerCapability: 'WRITE_SYNTHETIC_ONLY', queueId: 'provider-synthetic-control', kmsContext: 'kidults:data-class=SYNTHETIC', dbNamespace: 'provider_synthetic' };
const base = extra => {
  const input = { registry: registry(), providerId: 'OPEN_ARCHIVE', exactHeadSha: 'a'.repeat(40), evaluatedAt: '2026-09-21T12:00:00Z', purposeCode: 'IDENTITY_CATALOG', schemaVersion: 'open-v1', generation: 7, dataClass: 'REAL', dataBoundary: realBoundary, endpoint: 'https://api.open.example/records', method: 'GET', fieldSchema: { id: { type: 'number', required: true }, title: { type: 'string', required: false } }, evidenceClass: 'IDENTITY_CONTEXT', region: 'ap-northeast-2', retention: 'P10Y', brokerPolicy: policy, authorities, retryState: { attempts: 0, budget: 2 }, ...extra };
  const scope = { providerId: input.providerId, purposeCode: input.purposeCode, generation: input.generation, exactHeadSha: input.exactHeadSha, dataClass: input.dataClass, region: input.region, evidenceClass: input.evidenceClass, endpoint: input.endpoint, method: input.method, fieldSchema: input.fieldSchema, collectRight: true, storeRight: true, transformRight: false, retention: input.retention, brokerPolicyDigest: sha256(input.brokerPolicy), registrySnapshotDigest: sha256(input.registry) };
  input.rightsEnvelope ??= envelope('RIGHTS', { ...scope, issuedAt: '2026-09-21T10:00:00Z', expiresAt: '2026-09-22T00:00:00Z' });
  input.schemaEnvelope ??= envelope('SCHEMA', { ...scope, schemaVersion: input.schemaVersion, issuedAt: '2026-09-21T10:00:00Z', expiresAt: '2026-09-22T00:00:00Z' });
  input.killSwitchEnvelope ??= envelope('KILL_SWITCH', { generation: 7, status: 'INACTIVE', global: false, providers: [], purposes: [], issuedAt: '2026-09-21T10:00:00Z', expiresAt: '2026-09-22T00:00:00Z' });
  return input;
};
test('trusted dual signatures bind complete request scope', () => { const d = evaluateProviderControl(base()); assert.equal(d.action, 'REQUEST_OPAQUE_PERMIT'); assert.equal(d.brokerEgress, false); assert.deepEqual(d.holds, { production: 'HOLD', public: 'HOLD', g5: 'HOLD' }); });
test('self-asserted, altered, or wrong-authority envelopes fail closed', () => {
  const input = base();
  assert.throws(() => evaluateProviderControl({ ...input, rightsEnvelope: { ...input.rightsEnvelope, signature: Buffer.alloc(64).toString('base64') } }), /RIGHTS_SIGNATURE_INVALID/);
  assert.throws(() => evaluateProviderControl({ ...input, rightsEnvelope: { ...input.rightsEnvelope, issuer: 'attacker' } }), /RIGHTS_ISSUER_NOT_TRUSTED/);
  const changed = structuredClone(input.rightsEnvelope); changed.payload.endpoint = 'https://evil.example/x';
  assert.throws(() => evaluateProviderControl({ ...input, rightsEnvelope: changed }), /RIGHTS_SIGNATURE_INVALID/);
});
test('registry snapshot, communication, and evidence freshness are independent gates', () => {
  assert.throws(() => evaluateProviderControl(base({ registry: { ...registry(), as_of: '2026-01-01' } })), /REGISTRY_SNAPSHOT_STALE/);
  assert.throws(() => evaluateProviderControl(base({ registry: { ...registry(), communication_status: { observed_through: '2026-01-01' } } })), /REGISTRY_COMMUNICATION_STALE/);
  assert.throws(() => evaluateProviderControl(base({ registry: registry({ evidence_date: '2026-01-01' }) })), /PROVIDER_EVIDENCE_STALE/);
});
test('canonical registry date-time and provider communication shape are accepted', () => {
  const canonical = JSON.parse(readFileSync(new URL('../../../coordination/kidults/registry/provider/records/provider-operating-state-v1.json', import.meta.url)));
  canonical.providers.push(registry().providers[0]);
  assert.equal(evaluateProviderControl(base({ registry: canonical })).action, 'REQUEST_OPAQUE_PERMIT');
});
test('synthetic control never receives egress or a permit and cannot claim REAL boundary', () => {
  const d = evaluateProviderControl(base({ dataClass: 'SYNTHETIC', dataBoundary: syntheticBoundary })); assert.equal(d.action, 'SYNTHETIC_CONTROL_ONLY'); assert.equal(d.brokerEgress, false);
  assert.throws(() => evaluateProviderControl(base({ dataClass: 'SYNTHETIC', dataBoundary: realBoundary })), /DATA_BOUNDARY_BINDING_MISMATCH/);
});
test('opaque permit comes only from protected store', async () => {
  let stored; const p = await authorizeProviderControl({ decision: evaluateProviderControl(base()), permitStore: { issue: async d => { stored = d; return 'permit_1234567890abcdef'; } } });
  assert.equal(p.permitId, 'permit_1234567890abcdef'); assert.equal(stored.scope.endpoint, 'https://api.open.example/records');
  await assert.rejects(authorizeProviderControl({ decision: { action: 'REQUEST_OPAQUE_PERMIT', brokerEgress: true }, permitStore: { issue: async () => 'permit_1234567890abcdef' } }), /PERMIT_REQUEST_INVALID/);
});
