import { createHash } from 'node:crypto';
import {
  createPsaCertReferenceToken,
  decodePsaReferenceKey,
} from './psa-reference-token.mjs';

const MAX_PROBES = 3;
const MAX_PROVIDER_CALLS = 3;
const MAX_RETRIES_PER_CERT = 2;
const DEFAULT_TIMEOUT_MS = 10_000;
const DIGEST = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const REFERENCE_KEY_ID = 'PSA_CERT_REFERENCE_KEY_V1';

function validateCertNumber(value) {
  const cert = String(value ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  return cert;
}

function schemaKeys(value, prefix = '', found = new Set()) {
  if (Array.isArray(value)) {
    found.add(prefix ? `${prefix}[]` : '[]');
    if (value.length) schemaKeys(value[0], prefix ? `${prefix}[]` : '[]', found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const key of Object.keys(value).sort()) {
    const path = prefix ? `${prefix}.${key}` : key;
    found.add(path);
    schemaKeys(value[key], path, found);
  }
  return found;
}

function boundedProbeList(certNumbers) {
  if (!Array.isArray(certNumbers) || certNumbers.length < 1 || certNumbers.length > MAX_PROBES) {
    throw new Error('PSA_SCHEMA_CANARY_REQUIRES_ONE_TO_THREE_CERTS');
  }
  const values = certNumbers.map(validateCertNumber);
  if (new Set(values).size !== values.length) throw new Error('PSA_CERT_NUMBER_DUPLICATE');
  return values;
}

function assertRightsReceipt(receipt) {
  if (!receipt || receipt.provider_id !== 'psa-public-api') throw new Error('PSA_RIGHTS_RECEIPT_REQUIRED');
  if (receipt.scope !== 'PRIVATE_TEMPORARY_CERT_VERIFICATION_EVALUATION') throw new Error('PSA_RIGHTS_SCOPE_INVALID');
  for (const right of ['collect', 'store_private', 'derive_internal_er_calibration', 'internal_human_qa']) {
    if (receipt[right] !== 'ALLOW') throw new Error(`PSA_REQUIRED_RIGHT_NOT_ALLOWED:${right}`);
  }
  if (receipt.public_display !== 'BLOCK' || receipt.redistribute !== 'BLOCK') {
    throw new Error('PSA_PUBLIC_OR_REDISTRIBUTION_MUST_BE_BLOCKED');
  }
  if (!Number.isInteger(receipt.retention_days) || receipt.retention_days < 1 || receipt.retention_days > 30) {
    throw new Error('PSA_RETENTION_MUST_BE_ONE_TO_THIRTY_DAYS');
  }
  return receipt;
}

function certReferenceTokens(certs, certReferenceKey) {
  const validatedKey = decodePsaReferenceKey(String(certReferenceKey ?? ''));
  validatedKey.fill(0);
  return certs.map(cert => createPsaCertReferenceToken({
    keyBase64: certReferenceKey,
    certNumber: cert,
  }));
}

export function buildPsaSchemaCanaryPlan({ certNumbers, certReferenceKey, rightsReceipt, asOf = new Date() }) {
  const certs = boundedProbeList(certNumbers);
  const references = certReferenceTokens(certs, certReferenceKey);
  const rights = assertRightsReceipt(rightsReceipt);
  const observedAt = new Date(asOf);
  if (Number.isNaN(observedAt.valueOf())) throw new Error('PSA_CANARY_AS_OF_INVALID');
  return {
    provider_id: 'psa-public-api',
    state: 'READY_FOR_CREDENTIAL_BOUND_SCHEMA_CANARY_ONLY',
    probe_count: certs.length,
    reference_key_id: REFERENCE_KEY_ID,
    cert_reference_digests: references,
    endpoint_class: 'CERT_VERIFICATION_SINGLE_ITEM_BY_CERT_NUMBER',
    output_ceiling: 'SCHEMA_KEYS_FIELD_PRESENCE_AND_RESPONSE_DIGEST_ONLY',
    raw_payload_persistence: 'PROHIBITED',
    public_display: 'PROHIBITED',
    redistribution: 'PROHIBITED',
    retention_days: rights.retention_days,
    rights_evidence_ref: rights.evidence_ref,
    as_of: observedAt.toISOString(),
  };
}

export async function executePsaSchemaCanary({
  fetchImpl,
  accessToken,
  certNumbers,
  certReferenceKey,
  rightsReceipt,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  now = () => new Date(),
  executeProviderAttempt,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('PSA_FETCH_IMPLEMENTATION_REQUIRED');
  if (typeof accessToken !== 'string' || accessToken.length < 8) throw new Error('PSA_ACCESS_TOKEN_REQUIRED');
  if (typeof executeProviderAttempt !== 'function') throw new Error('PSA_QUOTA_BOUND_PROVIDER_ATTEMPT_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error('PSA_TIMEOUT_OUT_OF_BOUNDS');
  const certs = boundedProbeList(certNumbers);
  const references = certReferenceTokens(certs, certReferenceKey);
  assertRightsReceipt(rightsReceipt);
  const attempts = [];
  let providerCalls = 0;

  for (let certIndex = 0; certIndex < certs.length; certIndex += 1) {
    const cert = certs[certIndex];
    const startedAt = now().toISOString();
    let terminal = null;
    let retries = 0;
    while (!terminal && providerCalls < MAX_PROVIDER_CALLS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let retriable = false;
      let retryDelayMs = 0;
      try {
        const response = await executeProviderAttempt({
          certReferenceDigest: references[certIndex],
          certIndex,
          attemptOrdinal: retries + 1,
          request: async () => {
            providerCalls += 1;
            return fetchImpl(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(cert)}`, {
              method: 'GET',
              headers: { Authorization: `bearer ${accessToken}`, Accept: 'application/json' },
              signal: controller.signal,
            });
          },
        });
        const body = await response.text();
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* retain digest and schema failure only */ }
        const failureClass = response.ok ? (parsed ? null : 'INVALID_JSON') :
          (response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'PROVIDER_5XX' : 'HTTP_REJECTED');
        retriable = response.status === 429 || response.status >= 500;
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        retryDelayMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 5_000) : 250;
        terminal = {
          cert_reference_digest: references[certIndex], started_at: startedAt,
          completed_at: now().toISOString(), http_status: Number(response.status),
          outcome: response.ok && parsed ? 'SCHEMA_OBSERVED' : 'FAILED',
          response_sha256: DIGEST(body), schema_keys: parsed ? [...schemaKeys(parsed)].sort() : [],
          raw_payload_retained: false, failure_class: failureClass,
        };
      } catch (error) {
        if (String(error?.code || '').startsWith('PSA_QUOTA_')) throw error;
        retriable = true;
        terminal = {
          cert_reference_digest: references[certIndex], started_at: startedAt,
          completed_at: now().toISOString(), http_status: null, outcome: 'FAILED',
          response_sha256: null, schema_keys: [], raw_payload_retained: false,
          failure_class: error?.name === 'AbortError' ? 'TIMEOUT' : 'TRANSPORT_ERROR',
        };
        retryDelayMs = 250;
      } finally {
        clearTimeout(timer);
      }
      const certsRemaining = certs.length - certIndex - 1;
      const budgetAfterRetry = MAX_PROVIDER_CALLS - providerCalls - 1;
      const canRetry = retriable && retries < MAX_RETRIES_PER_CERT && budgetAfterRetry >= certsRemaining;
      if (canRetry) {
        retries += 1;
        terminal = null;
        await sleep(retryDelayMs);
      }
    }
    attempts.push({ ...terminal, provider_call_attempts: retries + 1 });
  }

  const successful = attempts.filter(attempt => attempt.outcome === 'SCHEMA_OBSERVED').length;
  return {
    receipt_id: 'KIDULTS_PSA_SCHEMA_CANARY_RECEIPT_V1',
    state: successful === attempts.length ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    provider_id: 'psa-public-api',
    reference_key_id: REFERENCE_KEY_ID,
    expected_cardinality: certs.length,
    actual_cardinality: attempts.length,
    provider_calls: providerCalls,
    provider_call_budget: MAX_PROVIDER_CALLS,
    successful_schema_observations: successful,
    attempts,
    promotion_authority: 'NONE',
    graded_population_increment: 0,
    candidate_evidence_increment: 0,
    raw_payload_retained: false,
    next_gate: 'APPROVE_EXACT_FIELD_MAP_AND_IMMUTABLY_BIND_PROVIDER_RIGHTS_EVIDENCE',
  };
}

export const psaAdapterInternals = { schemaKeys, validateCertNumber, assertRightsReceipt, certReferenceTokens };
