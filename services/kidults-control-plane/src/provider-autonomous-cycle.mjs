import { createHash } from 'node:crypto';

const STATES = new Set(['CLOSED', 'BOUNDED', 'CONDITIONAL', 'HOLD']);
const HEX64 = /^[0-9a-f]{64}$/;

function fail(code) {
  throw new Error(code);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('NON_CANONICAL_VALUE');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireHold(provider, field) {
  if (provider[field] !== 'HOLD') fail(`PROVIDER_${field.toUpperCase()}_HOLD_REQUIRED`);
}
function validateDurableEvidence(evidence, evaluatedAt) {
  if (!evidence || evidence.verified !== true) fail('AWS_DURABLE_EVIDENCE_NOT_VERIFIED');
  if (evidence.objectLockMode !== 'COMPLIANCE') fail('AWS_OBJECT_LOCK_COMPLIANCE_REQUIRED');
  if (evidence.kmsSignatureValid !== true) fail('AWS_KMS_SIGNATURE_REQUIRED');
  if (!HEX64.test(evidence.manifestSha256 || '')) fail('MANIFEST_DIGEST_INVALID');
  if (!HEX64.test(evidence.receiptSha256 || '')) fail('RECEIPT_DIGEST_INVALID');
  const retention = Date.parse(evidence.retentionUntil);
  const evaluated = Date.parse(evaluatedAt);
  if (!Number.isFinite(retention) || !Number.isFinite(evaluated)) fail('EVIDENCE_TIME_INVALID');
  const minimum = new Date(evaluatedAt);
  minimum.setUTCFullYear(minimum.getUTCFullYear() + 9);
  if (retention < minimum.valueOf()) fail('AWS_RETENTION_WINDOW_TOO_SHORT');
}

export function evaluateProviderAutonomousCycle({
  registry,
  providerId,
  exactHeadSha,
  evaluatedAt,
  durableEvidence,
}) {
  if (!registry || registry.status !== 'ACTIVE_FAIL_CLOSED') fail('PROVIDER_REGISTRY_NOT_ACTIVE');
  if (!/^[0-9a-f]{40}$/.test(exactHeadSha || '')) fail('EXACT_HEAD_SHA_INVALID');
  const provider = registry.providers?.find(item => item.provider_id === providerId);
  if (!provider) fail('PROVIDER_NOT_REGISTERED');
  if (!STATES.has(provider.state)) fail('PROVIDER_STATE_INVALID');
  requireHold(provider, 'production');
  requireHold(provider, 'public_release');
  validateDurableEvidence(durableEvidence, evaluatedAt);

  const liveFetchAllowed = provider.state === 'BOUNDED'
    && provider.acquisition_authorized === true
    && provider.credential_authorized === true
    && provider.new_spend_authorized === false
    && provider.adapter_state === 'ACTIVE';

  const decision = {
    schemaVersion: '1.0.0',
    cycle: 'STAGING_PROVIDER_AUTONOMOUS',
    providerId,
    providerState: provider.state,
    exactHeadSha,
    action: liveFetchAllowed ? 'BOUNDED_FETCH' : 'SHADOW_NO_FETCH',
    reason: liveFetchAllowed ? 'ALL_BOUNDED_PROVIDER_GATES_PASS' : 'PROVIDER_GATES_FAIL_CLOSED',
    brokerEgress: liveFetchAllowed,
    immutableEvidence: {
      backend: 'AWS_S3_OBJECT_LOCK',
      mode: durableEvidence.objectLockMode,
      manifestSha256: durableEvidence.manifestSha256,
      receiptSha256: durableEvidence.receiptSha256,
      retentionUntil: new Date(durableEvidence.retentionUntil).toISOString(),
      kmsSignatureValid: true,
    },
    holds: { production: 'HOLD', public: 'HOLD', g5: 'HOLD' },
    evaluatedAt: new Date(evaluatedAt).toISOString(),
  };
  const binding = {
    schemaVersion: decision.schemaVersion,
    cycle: decision.cycle,
    providerId: decision.providerId,
    providerState: decision.providerState,
    exactHeadSha: decision.exactHeadSha,
    action: decision.action,
    reason: decision.reason,
    brokerEgress: decision.brokerEgress,
    immutableEvidence: decision.immutableEvidence,
    holds: decision.holds,
    evaluatedAt: decision.evaluatedAt,
  };
  return {
    ...decision,
    decisionDigest: `sha256:${sha256(canonicalJson(binding))}`,
  };
}

export const providerAutonomousCycleInternals = { canonicalJson, sha256 };
