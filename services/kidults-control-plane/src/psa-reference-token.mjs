import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const PSA_HMAC_TOKEN_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
export const PSA_SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const PSA_REFERENCE_DOMAINS = Object.freeze({
  CERT_REFERENCE: 'KIDULTS_PSA_CERT_REFERENCE_V1',
  SOURCE_RECORD: 'KIDULTS_PSA_SOURCE_RECORD_V1',
  SOURCE_BUNDLE: 'KIDULTS_PSA_SOURCE_BUNDLE_V1',
});

const CANONICAL_BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalizePsaReferenceValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('PSA_CANONICAL_VALUE_INVALID');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizePsaReferenceValue).join(',')}]`;
  if (!isPlainObject(value)) fail('PSA_CANONICAL_VALUE_INVALID');
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (typeof value[key] === 'undefined') fail('PSA_CANONICAL_VALUE_INVALID');
  }
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizePsaReferenceValue(value[key])}`).join(',')}}`;
}

export function normalizePsaCertNumber(value) {
  if (typeof value !== 'string') fail('PSA_CERT_NUMBER_INVALID');
  const normalized = value.trim();
  if (!/^\d{4,16}$/.test(normalized)) fail('PSA_CERT_NUMBER_INVALID');
  return normalized;
}

export function decodePsaReferenceKey(keyBase64) {
  if (typeof keyBase64 !== 'string' || !CANONICAL_BASE64_32_BYTES.test(keyBase64)) {
    fail('PSA_REFERENCE_KEY_INVALID');
  }
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== keyBase64) fail('PSA_REFERENCE_KEY_INVALID');
  return key;
}

export function createPsaHmacToken({ keyBase64, domain, value }) {
  if (!Object.values(PSA_REFERENCE_DOMAINS).includes(domain)) fail('PSA_REFERENCE_DOMAIN_INVALID');
  const key = decodePsaReferenceKey(keyBase64);
  const material = typeof value === 'string' ? value : canonicalizePsaReferenceValue(value);
  const digest = createHmac('sha256', key)
    .update(`${domain}\0${material}`, 'utf8')
    .digest('hex');
  key.fill(0);
  return `hmac-sha256:v1:${digest}`;
}

export function createPsaCertReferenceToken({ keyBase64, certNumber }) {
  const normalizedDigits = normalizePsaCertNumber(certNumber);
  return createPsaHmacToken({
    keyBase64,
    domain: PSA_REFERENCE_DOMAINS.CERT_REFERENCE,
    value: normalizedDigits,
  });
}

export function createPsaSourceRecordToken({
  keyBase64,
  authorityId,
  certReferenceToken,
  sourceRecordLocator,
  sourceObservedAt,
}) {
  if (typeof authorityId !== 'string' || authorityId.length < 3) fail('PSA_SOURCE_AUTHORITY_ID_INVALID');
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(certReferenceToken || ''))) fail('PSA_CERT_REFERENCE_TOKEN_INVALID');
  if (typeof sourceRecordLocator !== 'string' || sourceRecordLocator.length < 1) fail('PSA_SOURCE_RECORD_LOCATOR_INVALID');
  if (typeof sourceObservedAt !== 'string' || Number.isNaN(Date.parse(sourceObservedAt))) fail('PSA_SOURCE_OBSERVED_AT_INVALID');
  return createPsaHmacToken({
    keyBase64,
    domain: PSA_REFERENCE_DOMAINS.SOURCE_RECORD,
    value: {
      authority_id: authorityId,
      cert_reference_digest: certReferenceToken,
      source_observed_at: new Date(sourceObservedAt).toISOString(),
      source_record_locator: sourceRecordLocator,
    },
  });
}

export function createPsaSourceBundleToken({ keyBase64, authorityId, records }) {
  if (typeof authorityId !== 'string' || authorityId.length < 3) fail('PSA_SOURCE_AUTHORITY_ID_INVALID');
  if (!Array.isArray(records) || records.length < 1) fail('PSA_SOURCE_BUNDLE_RECORDS_INVALID');
  const normalized = records.map(record => {
    if (!isPlainObject(record)) fail('PSA_SOURCE_BUNDLE_RECORD_INVALID');
    if (!PSA_HMAC_TOKEN_PATTERN.test(String(record.cert_reference_digest || ''))) fail('PSA_CERT_REFERENCE_TOKEN_INVALID');
    if (!PSA_HMAC_TOKEN_PATTERN.test(String(record.source_record_token || ''))) fail('PSA_SOURCE_RECORD_TOKEN_INVALID');
    return {
      cert_reference_digest: record.cert_reference_digest,
      source_record_token: record.source_record_token,
    };
  }).sort((left, right) => {
    const certOrder = left.cert_reference_digest.localeCompare(right.cert_reference_digest);
    return certOrder || left.source_record_token.localeCompare(right.source_record_token);
  });
  return createPsaHmacToken({
    keyBase64,
    domain: PSA_REFERENCE_DOMAINS.SOURCE_BUNDLE,
    value: { authority_id: authorityId, records: normalized },
  });
}

export function sha256PsaCanonical(value) {
  return `sha256:${createHash('sha256').update(canonicalizePsaReferenceValue(value), 'utf8').digest('hex')}`;
}

export function equalPsaReferenceTokens(left, right) {
  if (!PSA_HMAC_TOKEN_PATTERN.test(String(left || '')) || !PSA_HMAC_TOKEN_PATTERN.test(String(right || ''))) return false;
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
