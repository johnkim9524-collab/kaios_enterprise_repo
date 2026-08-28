import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CERT_REFERENCE_DIGEST_PATTERN = /^(?:sha256:[0-9a-f]{64}|hmac-sha256:v1:[0-9a-f]{64})$/;
const HMAC_CERT_REFERENCE_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
const CERT_REFERENCE_DOMAIN = 'KIDULTS_PSA_CERT_REFERENCE_V1\0';
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name}_REQUIRED`);
  return value;
}

function atPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function assertStore(store) {
  if (!store || typeof store.put !== 'function' || typeof store.listExpired !== 'function' || typeof store.delete !== 'function') {
    throw new Error('PSA_PRIVATE_STORE_INTERFACE_REQUIRED');
  }
  const capabilities = new Set(store.capabilities || []);
  for (const capability of ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT']) {
    if (!capabilities.has(capability)) throw new Error(`PSA_PRIVATE_STORE_CAPABILITY_MISSING:${capability}`);
  }
}

function assertEvaluationRights(rights) {
  if (rights?.provider_id !== 'psa-public-api') throw new Error('PSA_RIGHTS_RECEIPT_REQUIRED');
  if (rights.source_message_immutability !== 'VERIFIED') throw new Error('PSA_SOURCE_MESSAGE_IMMUTABILITY_NOT_VERIFIED');
  for (const key of ['collect', 'store_private', 'derive_internal_er_calibration', 'internal_human_qa']) {
    if (rights[key] !== 'ALLOW') throw new Error(`PSA_EVALUATION_RIGHT_NOT_ALLOWED:${key}`);
  }
  if (rights.public_display !== 'BLOCK' || rights.redistribute !== 'BLOCK') throw new Error('PSA_PUBLIC_BOUNDARY_INVALID');
  if (!Number.isInteger(rights.retention_days) || rights.retention_days < 1 || rights.retention_days > 30) {
    throw new Error('PSA_RETENTION_OUT_OF_BOUNDS');
  }
}

function normalize(rawPayload, fieldMap) {
  if (fieldMap?.provider_id !== 'psa-public-api' || fieldMap.state !== 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION') {
    throw new Error('PSA_EXACT_FIELD_MAP_NOT_APPROVED');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(fieldMap.observed_schema_digest || '')) throw new Error('PSA_SCHEMA_DIGEST_INVALID');
  if (!Array.isArray(fieldMap.mappings) || !fieldMap.mappings.length) throw new Error('PSA_FIELD_MAPPINGS_REQUIRED');
  const normalized = {};
  for (const mapping of fieldMap.mappings) {
    required(mapping.source_path, 'PSA_SOURCE_PATH');
    required(mapping.canonical_field, 'PSA_CANONICAL_FIELD');
    const value = atPath(rawPayload, mapping.source_path);
    if ((value === undefined || value === null) && mapping.required) throw new Error(`PSA_REQUIRED_FIELD_MISSING:${mapping.source_path}`);
    if (value !== undefined && value !== null) normalized[mapping.canonical_field] = value;
  }
  return normalized;
}

function normalizeCertNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4,16}$/.test(normalized)) throw new Error('PSA_PAYLOAD_CERT_NUMBER_INVALID');
  return normalized;
}

function assertPayloadCertReference({ rawPayload, normalized, certReferenceDigest, certReferenceKey }) {
  if (!HMAC_CERT_REFERENCE_PATTERN.test(certReferenceDigest || '')) throw new Error('PSA_HMAC_CERT_REFERENCE_REQUIRED');
  const candidates = [
    normalized.certification_number,
    rawPayload?.PSACert?.CertNumber,
    rawPayload?.CertNumber,
    rawPayload?.cert?.number,
  ].filter(value => value !== undefined && value !== null && value !== '');
  if (!candidates.length) throw new Error('PSA_PAYLOAD_CERT_NUMBER_REQUIRED');
  const certNumbers = [...new Set(candidates.map(normalizeCertNumber))];
  if (certNumbers.length !== 1) throw new Error('PSA_PAYLOAD_CERT_NUMBER_CONFLICT');
  if (!Buffer.isBuffer(certReferenceKey) || certReferenceKey.length !== 32) throw new Error('PSA_CERT_REFERENCE_KEY_REQUIRED');
  const expected = `hmac-sha256:v1:${createHmac('sha256', certReferenceKey).update(`${CERT_REFERENCE_DOMAIN}${certNumbers[0]}`).digest('hex')}`;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(certReferenceDigest))) throw new Error('PSA_CERT_REFERENCE_PAYLOAD_MISMATCH');
}

export async function stagePsaPrivateEvaluation({
  rawPayload,
  certReferenceDigest,
  certReferenceKey,
  rightsReceipt,
  fieldMap,
  privateStore,
  admitNormalized,
  acquiredAt = new Date(),
}) {
  assertStore(privateStore);
  assertEvaluationRights(rightsReceipt);
  if (typeof admitNormalized !== 'function') throw new Error('PSA_NORMALIZED_ADMISSION_CALLBACK_REQUIRED');
  if (!CERT_REFERENCE_DIGEST_PATTERN.test(certReferenceDigest || '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  if (!HMAC_CERT_REFERENCE_PATTERN.test(certReferenceDigest)) throw new Error('PSA_HMAC_CERT_REFERENCE_REQUIRED');
  const acquired = new Date(acquiredAt);
  if (Number.isNaN(acquired.valueOf())) throw new Error('PSA_ACQUIRED_AT_INVALID');
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) throw new Error('PSA_RAW_PAYLOAD_INVALID');
  const normalized = normalize(rawPayload, fieldMap);
  assertPayloadCertReference({ rawPayload, normalized, certReferenceDigest, certReferenceKey });
  const rawSerialized = canonical(rawPayload);
  const normalizedSerialized = canonical(normalized);
  const rawDigest = sha256(rawSerialized);
  const normalizedDigest = sha256(normalizedSerialized);
  const deleteBy = new Date(acquired.valueOf() + rightsReceipt.retention_days * 86_400_000).toISOString();
  const privateHandle = await privateStore.put({
    providerId: 'psa-public-api', certReferenceDigest, payload: rawPayload,
    acquiredAt: acquired.toISOString(), deleteBy, rawDigest,
  });
  required(privateHandle, 'PSA_PRIVATE_HANDLE');
  let admission;
  try {
    admission = await admitNormalized({
      providerId: 'psa-public-api', certReferenceDigest, normalized,
      rawDigest, normalizedDigest, acquiredAt: acquired.toISOString(), deleteBy,
      fieldMapId: fieldMap.field_map_id, rightsEvidenceRef: rightsReceipt.evidence_ref,
    });
    required(admission, 'PSA_NORMALIZED_ADMISSION_RECEIPT');
  } catch (admissionError) {
    try {
      const compensatedAt = new Date(Math.max(Date.now(), acquired.valueOf())).toISOString();
      const compensation = await privateStore.delete({
        handle: privateHandle,
        reason: 'ADMISSION_FAILED_COMPENSATION',
        deletedAt: compensatedAt,
      });
      if (compensation?.deletion_verified !== true || compensation?.raw_payload_retained !== false) {
        throw new Error('PSA_ADMISSION_COMPENSATION_NOT_VERIFIED');
      }
    } catch (compensationError) {
      throw new AggregateError(
        [admissionError, compensationError],
        'PSA_ADMISSION_FAILED_COMPENSATION_FAILED',
      );
    }
    throw admissionError;
  }
  return {
    receipt_id: 'KIDULTS_PSA_PRIVATE_EVALUATION_STAGE_RECEIPT_V1',
    state: 'VERIFIED_PASS', provider_id: 'psa-public-api',
    cert_reference_digest: certReferenceDigest, raw_digest: rawDigest,
    normalized_digest: normalizedDigest, field_map_id: fieldMap.field_map_id,
    private_handle_digest: sha256(String(privateHandle)), delete_by: deleteBy,
    admission_receipt_digest: sha256(canonical(admission)),
    raw_payload_in_receipt: false, public_display: 'BLOCK', redistribution: 'BLOCK',
    promotion_authority: 'NONE_UNTIL_EMPIRICAL_HANDOFF_AND_TRACK_B',
  };
}

export async function deleteExpiredPsaEvaluations({ privateStore, now = new Date() }) {
  assertStore(privateStore);
  const instant = new Date(now);
  if (Number.isNaN(instant.valueOf())) throw new Error('PSA_DELETION_NOW_INVALID');
  const expired = await privateStore.listExpired({ providerId: 'psa-public-api', beforeOrAt: instant.toISOString() });
  if (!Array.isArray(expired)) throw new Error('PSA_EXPIRED_LIST_INVALID');
  const deleted = [];
  const deletionReceiptDigests = [];
  const retentionBreaches = [];
  for (const item of expired) {
    required(item.handle, 'PSA_EXPIRED_HANDLE');
    const deletion = await privateStore.delete({ handle: item.handle, reason: 'RETENTION_EXPIRED', deletedAt: instant.toISOString() });
    if (deletion?.deletion_verified !== true || deletion?.raw_payload_retained !== false) {
      throw new Error('PSA_DELETION_RECEIPT_NOT_VERIFIED');
    }
    const handleDigest = sha256(String(item.handle));
    const deletionReceiptDigest = sha256(canonical({
      handle_digest: handleDigest,
      state: deletion.state ?? null,
      record_digest: SHA256_DIGEST_PATTERN.test(deletion.record_digest || '') ? deletion.record_digest : null,
      cert_reference_digest: CERT_REFERENCE_DIGEST_PATTERN.test(deletion.cert_reference_digest || '') ? deletion.cert_reference_digest : null,
      deleted_at: deletion.deleted_at ?? null,
      delete_at: deletion.delete_at ?? null,
      deletion_verified: true,
      retention_deadline_met: deletion.retention_deadline_met ?? null,
      raw_payload_retained: false,
    }));
    const retentionDeadlineMissed = deletion.retention_deadline_met === false || deletion.state === 'VERIFIED_RETENTION_BREACH_DELETED';
    deleted.push(handleDigest);
    deletionReceiptDigests.push(deletionReceiptDigest);
    if (retentionDeadlineMissed) {
      retentionBreaches.push({
        handleDigest,
        recordDigest: SHA256_DIGEST_PATTERN.test(deletion.record_digest || '') ? deletion.record_digest : null,
        receiptDigest: deletionReceiptDigest,
      });
    }
  }
  return {
    receipt_id: 'KIDULTS_PSA_RETENTION_DELETION_RECEIPT_V1',
    state: retentionBreaches.length ? 'VERIFIED_RETENTION_BREACH_DELETED' : 'VERIFIED_PASS', provider_id: 'psa-public-api',
    evaluated_at: instant.toISOString(), deleted_count: deleted.length,
    deleted_handle_digests: deleted.sort(), deletion_receipt_digests: deletionReceiptDigests.sort(),
    retention_breach_count: retentionBreaches.length,
    retention_breach_digests: retentionBreaches.map(({ receiptDigest }) => receiptDigest).sort(),
    retention_breach_handle_digests: retentionBreaches.map(({ handleDigest }) => handleDigest).sort(),
    retention_breach_record_digests: retentionBreaches.flatMap(({ recordDigest }) => recordDigest ? [recordDigest] : []).sort(),
    raw_payload_in_receipt: false,
  };
}

export const psaPrivateEvaluationInternals = { normalize, assertStore, assertEvaluationRights, assertPayloadCertReference };
