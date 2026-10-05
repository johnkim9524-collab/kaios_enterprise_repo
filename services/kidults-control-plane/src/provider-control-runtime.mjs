import { createHash, verify } from 'node:crypto';

const HEAD = /^[0-9a-f]{40}$/;
const fail = code => { throw new Error(code); };
const instant = (value, code) => { const n = Date.parse(value); if (!Number.isFinite(n)) fail(code); return n; };
const registryInstant = (value, code) => instant(/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value}T23:59:59Z` : value, code);
export const canonicalJson = value => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  fail('NON_CANONICAL_VALUE');
};
export const sha256 = value => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex')}`;

export function verifyAuthorityEnvelope(envelope, { kind, authorities, now }) {
  if (!envelope || envelope.kind !== kind || !envelope.payload || typeof envelope.signature !== 'string') fail(`${kind}_ENVELOPE_INVALID`);
  const publicKey = authorities?.[kind]?.[envelope.issuer];
  if (!publicKey) fail(`${kind}_ISSUER_NOT_TRUSTED`);
  if (!verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, Buffer.from(envelope.signature, 'base64'))) fail(`${kind}_SIGNATURE_INVALID`);
  if (envelope.payload.issuedAt && instant(envelope.payload.issuedAt, `${kind}_ISSUED_AT_INVALID`) > now) fail(`${kind}_FROM_FUTURE`);
  if (instant(envelope.payload.expiresAt, `${kind}_EXPIRY_INVALID`) <= now) fail(`${kind}_EXPIRED`);
  return envelope.payload;
}

const same = (a, b, code) => { if (canonicalJson(a) !== canonicalJson(b)) fail(code); };
const requireBindings = (payload, expected, kind) => {
  for (const k of Object.keys(expected)) same(payload[k], expected[k], `${kind}_BINDING_MISMATCH:${k}`);
};

function validateRegistry(registry, provider, now) {
  if (registry?.status !== 'ACTIVE_FAIL_CLOSED') fail('PROVIDER_REGISTRY_NOT_ACTIVE');
  const asOf = registryInstant(registry.as_of, 'REGISTRY_AS_OF_INVALID');
  const observedValue = provider.communication?.observed_through
    || provider.communication_reconciliation?.observed_through || registry.communication_status?.observed_through
    || registry.as_of;
  const observed = registryInstant(observedValue, 'REGISTRY_COMMUNICATION_DATE_INVALID');
  if (asOf > now || observed > now) fail('REGISTRY_FROM_FUTURE');
  const days = registry.evidence_freshness_policy?.max_age_days_by_state?.[provider.state];
  if (!Number.isInteger(days) || days < 1) fail('PROVIDER_FRESHNESS_POLICY_MISSING');
  const max = days * 86_400_000;
  if (now - asOf > max) fail('REGISTRY_SNAPSHOT_STALE');
  if (now - observed > max) fail('REGISTRY_COMMUNICATION_STALE');
  const evidence = instant(`${provider.evidence_date}T23:59:59Z`, 'PROVIDER_EVIDENCE_DATE_INVALID');
  if (evidence > now || now - evidence > max) fail('PROVIDER_EVIDENCE_STALE');
}

function validateBoundary(boundary, dataClass) {
  const required = dataClass === 'REAL'
    ? { storageBoundaryId: 'REAL_QUARANTINE', writerCapability: 'WRITE_REAL_QUARANTINE', queueId: 'provider-real-ingress', kmsContext: 'kidults:data-class=REAL', dbNamespace: 'provider_real' }
    : { storageBoundaryId: 'SYNTHETIC_SANDBOX', writerCapability: 'WRITE_SYNTHETIC_ONLY', queueId: 'provider-synthetic-control', kmsContext: 'kidults:data-class=SYNTHETIC', dbNamespace: 'provider_synthetic' };
  if (!['REAL', 'SYNTHETIC'].includes(dataClass)) fail('DATA_CLASS_INVALID');
  requireBindings(boundary || {}, required, 'DATA_BOUNDARY');
  return required;
}

export function evaluateProviderControl(input) {
  const { registry, providerId, exactHeadSha, evaluatedAt, purposeCode, schemaVersion, generation,
    dataClass, dataBoundary, endpoint, method, fieldSchema, evidenceClass, region, retention,
    brokerPolicy, rightsEnvelope, schemaEnvelope, killSwitchEnvelope, authorities, retryState = { attempts: 0, budget: 2 } } = input;
  const now = instant(evaluatedAt, 'EVALUATED_AT_INVALID');
  if (!HEAD.test(exactHeadSha || '')) fail('EXACT_HEAD_SHA_INVALID');
  if (!Number.isSafeInteger(generation) || generation < 1) fail('GENERATION_INVALID');
  const provider = registry?.providers?.find(p => p.provider_id === providerId);
  if (!provider) fail('PROVIDER_NOT_REGISTERED');
  if (provider.production !== 'HOLD' || provider.public_release !== 'HOLD') fail('PROTECTED_HOLD_REQUIRED');
  validateRegistry(registry, provider, now);
  const boundary = validateBoundary(dataBoundary, dataClass);
  const policyDigest = sha256(brokerPolicy);
  const registrySnapshotDigest = sha256(registry);
  const scope = { providerId, purposeCode, generation, exactHeadSha, dataClass, region, evidenceClass,
    endpoint, method, fieldSchema, collectRight: true, storeRight: true, transformRight: false,
    retention, brokerPolicyDigest: policyDigest, registrySnapshotDigest };
  const kill = verifyAuthorityEnvelope(killSwitchEnvelope, { kind: 'KILL_SWITCH', authorities, now });
  requireBindings(kill, { generation }, 'KILL_SWITCH');
  if (kill.status !== 'INACTIVE' || kill.global === true || kill.providers?.includes(providerId) || kill.purposes?.includes(purposeCode)) fail('KILL_SWITCH_ACTIVE');
  if (dataClass === 'SYNTHETIC') return Object.freeze({ action: 'SYNTHETIC_CONTROL_ONLY', brokerEgress: false, scope, boundary, holds: { production: 'HOLD', public: 'HOLD', g5: 'HOLD' } });
  if (provider.state !== 'BOUNDED' || provider.acquisition_authorized !== true || provider.new_spend_authorized !== false || provider.adapter_state !== 'ACTIVE') fail('PROVIDER_GATES_FAIL_CLOSED');
  if ((provider.credential_mode === 'NONE') !== (provider.credential_authorized === false)) fail('CREDENTIAL_BOUNDARY_NOT_SATISFIED');
  if (!Number.isInteger(retryState.attempts) || !Number.isInteger(retryState.budget) || retryState.attempts >= retryState.budget) fail('RETRY_BUDGET_EXHAUSTED');
  const rights = verifyAuthorityEnvelope(rightsEnvelope, { kind: 'RIGHTS', authorities, now });
  const schema = verifyAuthorityEnvelope(schemaEnvelope, { kind: 'SCHEMA', authorities, now });
  requireBindings(rights, scope, 'RIGHTS');
  requireBindings(schema, { ...scope, schemaVersion }, 'SCHEMA');
  return Object.freeze({ action: 'REQUEST_OPAQUE_PERMIT', brokerEgress: false, scope, boundary,
    schemaVersion, killSwitchGeneration: generation, rightsDigest: sha256(rights), schemaDigest: sha256(schema),
    holds: { production: 'HOLD', public: 'HOLD', g5: 'HOLD' } });
}

export async function authorizeProviderControl({ decision, permitStore }) {
  if (decision?.action !== 'REQUEST_OPAQUE_PERMIT' || decision.brokerEgress !== false) fail('PERMIT_REQUEST_INVALID');
  if (typeof permitStore?.issue !== 'function') fail('PERMIT_STORE_REQUIRED');
  const permitId = await permitStore.issue(structuredClone(decision));
  if (typeof permitId !== 'string' || !/^permit_[A-Za-z0-9_-]{16,}$/.test(permitId)) fail('OPAQUE_PERMIT_ID_INVALID');
  return Object.freeze({ permitId, action: 'PERMIT_ISSUED', brokerEgress: false, holds: decision.holds });
}
