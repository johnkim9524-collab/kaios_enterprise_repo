import { createHash } from 'node:crypto';
import { assertPsaPayloadCertificateBinding } from './psa-private-evaluation-store.mjs';

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
  if (!store || ['put', 'listExpired', 'delete', 'beginEvaluation', 'completeEvaluation'].some(method => typeof store[method] !== 'function')) {
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

export async function stagePsaPrivateEvaluation({
  rawPayload,
  certReferenceDigest,
  rightsReceipt,
  fieldMap,
  privateStore,
  admitNormalized,
  acquiredAt = new Date(),
  now = () => new Date(),
  operationId,
  admissionTimeoutMs = 10_000,
}) {
  assertStore(privateStore);
  assertEvaluationRights(rightsReceipt);
  if (typeof admitNormalized !== 'function') throw new Error('PSA_NORMALIZED_ADMISSION_CALLBACK_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(operationId || '')) throw new Error('PSA_EVALUATION_OPERATION_ID_REQUIRED');
  if (!Number.isInteger(admissionTimeoutMs) || admissionTimeoutMs < 10 || admissionTimeoutMs > 30_000) throw new Error('PSA_ADMISSION_TIMEOUT_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(certReferenceDigest || '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  const acquired = new Date(acquiredAt);
  if (Number.isNaN(acquired.valueOf())) throw new Error('PSA_ACQUIRED_AT_INVALID');
  const started = new Date(now());
  if (!Number.isFinite(started.valueOf()) || acquired > started) throw new Error('PSA_ACQUIRED_AT_FUTURE');
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) throw new Error('PSA_RAW_PAYLOAD_INVALID');
  const normalized = normalize(rawPayload, fieldMap);
  assertPsaPayloadCertificateBinding(rawPayload, certReferenceDigest);
  const rawSerialized = canonical(rawPayload);
  const normalizedSerialized = canonical(normalized);
  const rawDigest = sha256(rawSerialized);
  const normalizedDigest = sha256(normalizedSerialized);
  const deleteBy = new Date(acquired.valueOf() + rightsReceipt.retention_days * 86_400_000).toISOString();
  if (started.valueOf() >= Date.parse(deleteBy)) throw new Error('PSA_EVALUATION_INPUT_RETENTION_EXPIRED');
  const bindingDigest = sha256(canonical({ certReferenceDigest, rawDigest, normalizedDigest,
    acquiredAt: acquired.toISOString(), rightsReceipt, fieldMap }));
  const claim = await privateStore.beginEvaluation({ operationId, bindingDigest });
  if (claim?.state === 'COMPLETED') return claim.receipt;
  if (claim?.state !== 'CLAIMED') throw new Error('PSA_EVALUATION_RECONCILIATION_REQUIRED');
  const privateHandle = await privateStore.put({
    providerId: 'psa-public-api', certReferenceDigest, payload: rawPayload,
    acquiredAt: acquired.toISOString(), deleteBy, rawDigest, evaluationOperationId: operationId,
  });
  required(privateHandle, 'PSA_PRIVATE_HANDLE');
  let admission;
  let admissionFailure;
  let timer;
  const controller = new AbortController();
  try {
    const pending = Promise.resolve().then(() => admitNormalized({
      providerId: 'psa-public-api', certReferenceDigest, normalized,
      rawDigest, normalizedDigest, acquiredAt: acquired.toISOString(), deleteBy,
      fieldMapId: fieldMap.field_map_id, rightsEvidenceRef: rightsReceipt.evidence_ref,
      operationId, signal: controller.signal,
    }));
    admission = await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('PSA_ADMISSION_TIMEOUT')); }, admissionTimeoutMs);
    })]);
    if (admission?.state !== 'COMMITTED' || typeof admission.commandId !== 'string' || !admission.commandId.trim()) {
      admissionFailure = 'PSA_NORMALIZED_ADMISSION_NOT_COMMITTED';
    }
  } catch {
    // An ambiguous commit is never retried here. Callback errors may contain
    // private values; expose only a fixed error code after raw cleanup.
    admissionFailure = 'PSA_NORMALIZED_ADMISSION_OUTCOME_UNKNOWN';
  } finally {
    clearTimeout(timer);
  }
  let deletion;
  try {
    deletion = await privateStore.delete({
      handle: privateHandle, reason: 'EVALUATION_TERMINAL', deletedAt: new Date(now()).toISOString(),
    });
    if (deletion?.deletion_verified !== true || deletion.raw_payload_retained !== false
      || !((deletion.state === 'VERIFIED_PASS' && deletion.retention_deadline_met === true)
        || (deletion.state === 'VERIFIED_RETENTION_BREACH_DELETED' && deletion.retention_deadline_met === false))) {
      throw new Error('PSA_TERMINAL_DELETION_NOT_VERIFIED');
    }
  } catch {
    const error = new Error('PSA_EVALUATION_TERMINAL_CLEANUP_UNVERIFIED');
    error.recovery = {
      private_handle_digest: sha256(String(privateHandle)), cert_reference_digest: certReferenceDigest,
      admission_outcome: admissionFailure || 'COMMITTED', automatic_admission_retry: false,
      raw_cleanup_verified: false,
    };
    throw error;
  }
  if (admissionFailure) throw new Error(admissionFailure);
  if (deletion.retention_deadline_met !== true) throw new Error('PSA_EVALUATION_RETENTION_BREACH_DELETED');
  const receipt = {
    receipt_id: 'KIDULTS_PSA_PRIVATE_EVALUATION_STAGE_RECEIPT_V1',
    state: 'VERIFIED_PASS', provider_id: 'psa-public-api',
    cert_reference_digest: certReferenceDigest, raw_digest: rawDigest,
    normalized_digest: normalizedDigest, field_map_id: fieldMap.field_map_id,
    private_handle_digest: sha256(String(privateHandle)), delete_by: deleteBy,
    admission_receipt_digest: sha256(canonical(admission)),
    deletion_receipt_digest: sha256(canonical(deletion)), raw_payload_retained: false,
    raw_payload_in_receipt: false, public_display: 'BLOCK', redistribution: 'BLOCK',
    promotion_authority: 'NONE_UNTIL_EMPIRICAL_HANDOFF_AND_TRACK_B',
    operation_id: operationId,
    admission_evidence_scope: 'TRUSTED_CALLBACK_RESULT_NOT_NATIVE_LEDGER_READBACK',
    native_ledger_commit_verified: false,
  };
  await privateStore.completeEvaluation({ operationId, bindingDigest, receipt });
  return receipt;
}

export async function deleteExpiredPsaEvaluations({ privateStore, now = new Date() }) {
  assertStore(privateStore);
  const instant = new Date(now);
  if (Number.isNaN(instant.valueOf())) throw new Error('PSA_DELETION_NOW_INVALID');
  const expired = await privateStore.listExpired({ providerId: 'psa-public-api', beforeOrAt: instant.toISOString() });
  if (!Array.isArray(expired)) throw new Error('PSA_EXPIRED_LIST_INVALID');
  const deleted = [];
  const deletionReceipts = [];
  let breaches = 0;
  for (const item of expired) {
    required(item.handle, 'PSA_EXPIRED_HANDLE');
    const deletion = await privateStore.delete({ handle: item.handle, reason: 'RETENTION_EXPIRED', deletedAt: instant.toISOString() });
    if (deletion?.deletion_verified !== true || deletion?.raw_payload_retained !== false) {
      throw new Error('PSA_DELETION_RECEIPT_NOT_VERIFIED');
    }
    const deadlineMet = deletion.retention_deadline_met;
    if (!((deletion.state === 'VERIFIED_PASS' && deadlineMet === true)
      || (deletion.state === 'VERIFIED_RETENTION_BREACH_DELETED' && deadlineMet === false))) {
      throw new Error('PSA_DELETION_RETENTION_STATE_INVALID');
    }
    if (!deadlineMet) breaches += 1;
    deletionReceipts.push(sha256(canonical(deletion)));
    deleted.push(sha256(String(item.handle)));
  }
  const receipt = {
    receipt_id: 'KIDULTS_PSA_RETENTION_DELETION_RECEIPT_V1',
    state: breaches ? 'VERIFIED_RETENTION_BREACH_DELETED' : 'VERIFIED_PASS', provider_id: 'psa-public-api',
    evaluated_at: instant.toISOString(), deleted_count: deleted.length,
    deleted_handle_digests: deleted.sort(), raw_payload_in_receipt: false,
    retention_deadline_met: breaches === 0, retention_breach_count: breaches,
    deletion_receipt_digests: deletionReceipts.sort(),
  };
  if (expired.invalid_record_digests?.length) {
    receipt.state = 'VERIFIED_FAIL_INVALID_PRIVATE_RECORD';
    receipt.invalid_record_digests = expired.invalid_record_digests;
    receipt.invalid_record_count = expired.invalid_record_digests.length;
    const error = new Error('PSA_PRIVATE_RECORD_TYPE_INVALID_OR_INTEGRITY_INVALID');
    error.receipt = receipt;
    throw error;
  }
  return receipt;
}

export const psaPrivateEvaluationInternals = { normalize, assertStore, assertEvaluationRights };
