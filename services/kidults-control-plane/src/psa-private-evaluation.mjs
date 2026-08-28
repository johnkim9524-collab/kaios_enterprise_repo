import { createHash } from 'node:crypto';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
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

function assertCertReferenceBinding(normalized, certReferenceDigest) {
  const cert = String(normalized?.certification_number ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERTIFICATION_NUMBER_INVALID');
  if (sha256(cert) !== certReferenceDigest) throw new Error('PSA_CERT_REFERENCE_DIGEST_MISMATCH');
}

function assertAdmissionReceipt(admission) {
  if (!admission || typeof admission !== 'object' || Array.isArray(admission)) throw new Error('PSA_NORMALIZED_ADMISSION_RECEIPT_INVALID');
  if (!['COMMITTED', 'VERIFIED_PASS'].includes(admission.state)) throw new Error('PSA_NORMALIZED_ADMISSION_NOT_COMMITTED');
}

async function compensatePrivateWrite({ privateStore, privateHandle, acquiredAt }) {
  let deletion;
  try {
    deletion = await privateStore.delete({ handle: privateHandle, reason: 'STAGE_ABORT', deletedAt: acquiredAt });
  } catch (error) {
    throw new Error('PSA_STAGE_COMPENSATING_DELETION_FAILED', { cause: error });
  }
  if (deletion?.deletion_verified !== true || deletion?.raw_payload_retained !== false) {
    throw new Error('PSA_STAGE_COMPENSATING_DELETION_NOT_VERIFIED');
  }
}

export async function stagePsaPrivateEvaluation({
  rawPayload,
  certReferenceDigest,
  rightsReceipt,
  fieldMap,
  privateStore,
  admitNormalized,
  acquiredAt = new Date(),
}) {
  assertStore(privateStore);
  assertEvaluationRights(rightsReceipt);
  if (typeof admitNormalized !== 'function') throw new Error('PSA_NORMALIZED_ADMISSION_CALLBACK_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(certReferenceDigest || '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  const acquired = new Date(acquiredAt);
  if (Number.isNaN(acquired.valueOf())) throw new Error('PSA_ACQUIRED_AT_INVALID');
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) throw new Error('PSA_RAW_PAYLOAD_INVALID');
  const normalized = normalize(rawPayload, fieldMap);
  assertCertReferenceBinding(normalized, certReferenceDigest);
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
    assertAdmissionReceipt(admission);
  } catch (error) {
    try {
      await compensatePrivateWrite({ privateStore, privateHandle, acquiredAt: acquired.toISOString() });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'PSA_STAGE_ADMISSION_FAILED_AND_COMPENSATION_FAILED');
    }
    throw error;
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
  for (const item of expired) {
    required(item.handle, 'PSA_EXPIRED_HANDLE');
    const deletion = await privateStore.delete({ handle: item.handle, reason: 'RETENTION_EXPIRED', deletedAt: instant.toISOString() });
    if (deletion?.deletion_verified !== true || deletion?.raw_payload_retained !== false) {
      throw new Error('PSA_DELETION_RECEIPT_NOT_VERIFIED');
    }
    deleted.push(sha256(String(item.handle)));
  }
  return {
    receipt_id: 'KIDULTS_PSA_RETENTION_DELETION_RECEIPT_V1',
    state: 'VERIFIED_PASS', provider_id: 'psa-public-api',
    evaluated_at: instant.toISOString(), deleted_count: deleted.length,
    deleted_handle_digests: deleted.sort(), raw_payload_in_receipt: false,
  };
}

export const psaPrivateEvaluationInternals = { normalize, assertStore, assertEvaluationRights, assertCertReferenceBinding, assertAdmissionReceipt, compensatePrivateWrite };
