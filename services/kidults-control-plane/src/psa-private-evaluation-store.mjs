import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DAY_MS = 86_400_000;
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const PSA_ALLOWED_PAYLOAD_FIELDS = Object.freeze([
  'Brand','CardGrade','CardNumber','Category','CertNumber','GradeDescription','IsDualCert','IsPSADNA','LabelType',
  'PopulationHigher','SpecID','SpecNumber','Subject','TotalPopulation','TotalPopulationWithQualifier','Variety','Year'
]);
const PSA_ALLOWED_FIELD_SET = new Set(PSA_ALLOWED_PAYLOAD_FIELDS);

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('PSA_PAYLOAD_OBJECT_REQUIRED');
  const topLevel = Object.keys(payload);
  if (topLevel.length !== 1 || topLevel[0] !== 'PSACert') throw new Error('PSA_CERT_PAYLOAD_REQUIRED');
  const psaCert = payload.PSACert;
  if (!psaCert || typeof psaCert !== 'object' || Array.isArray(psaCert)) throw new Error('PSA_CERT_PAYLOAD_REQUIRED');
  const disallowed = Object.keys(psaCert).filter(field => !PSA_ALLOWED_FIELD_SET.has(field)).sort();
  if (disallowed.length) throw new Error(`PSA_PAYLOAD_FIELD_NOT_ALLOWED:${disallowed[0]}`);
}

function authenticatedMetadata({ certReferenceDigest, observedAt, deleteAt }) {
  return {
    record_version: '1.1.0',
    provider_id: 'psa-public-api',
    classification: 'PRIVATE_ONLY',
    cert_reference_digest: certReferenceDigest,
    observed_at: observedAt,
    delete_at: deleteAt,
    encryption: 'AES-256-GCM',
    plaintext_persisted: false,
    public_release: 'BLOCK',
    production: 'HOLD'
  };
}

function recordDigest(record) {
  const { record_digest: _omitted, ...bound } = record;
  return digest(stable(bound));
}

export function buildPrivatePsaRecord({ certNumber, payload, key, observedAt = new Date() }) {
  const cert = String(certNumber ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  validatePayload(payload);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  const deleteAt = new Date(observed.valueOf() + 30 * DAY_MS);
  const metadata = authenticatedMetadata({
    certReferenceDigest: digest(cert),
    observedAt: observed.toISOString(),
    deleteAt: deleteAt.toISOString()
  });
  const aad = Buffer.from(stable(metadata));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const record = {
    ...metadata,
    aad_digest: digest(aad),
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64')
  };
  return { ...record, record_digest: recordDigest(record) };
}

export function decryptPrivatePsaRecord(record, key) {
  if (!record || record.classification !== 'PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_REQUIRED');
  if (record.record_version !== '1.1.0' || record.provider_id !== 'psa-public-api' || record.encryption !== 'AES-256-GCM') throw new Error('PSA_PRIVATE_RECORD_METADATA_INVALID');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(record.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_INVALID');
  const metadata = authenticatedMetadata({
    certReferenceDigest: record.cert_reference_digest,
    observedAt: record.observed_at,
    deleteAt: record.delete_at
  });
  const aad = Buffer.from(stable(metadata));
  if (digest(aad) !== record.aad_digest) throw new Error('PSA_RECORD_AAD_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv_b64, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(record.tag_b64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext_b64, 'base64')), decipher.final()]);
  const payload = JSON.parse(plaintext.toString('utf8'));
  validatePayload(payload);
  return payload;
}

export function buildDeletionReceipt(record, { deletedAt = new Date(), deletionSucceeded }) {
  if (!/^sha256:[0-9a-f]{64}$/.test(record?.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(record?.cert_reference_digest ?? '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_REQUIRED');
  if (deletionSucceeded !== true) throw new Error('PSA_DELETION_NOT_VERIFIED');
  const at = new Date(deletedAt);
  const observedAt = new Date(record.observed_at);
  const deleteAt = new Date(record.delete_at);
  if (Number.isNaN(at.valueOf())) throw new Error('PSA_DELETED_AT_INVALID');
  if (Number.isNaN(observedAt.valueOf()) || Number.isNaN(deleteAt.valueOf())) throw new Error('PSA_RETENTION_WINDOW_INVALID');
  if (at.valueOf() < observedAt.valueOf()) throw new Error('PSA_DELETION_BEFORE_OBSERVATION');
  if (at.valueOf() > deleteAt.valueOf()) throw new Error('PSA_DELETION_AFTER_RETENTION_DEADLINE');
  return {
    receipt_id: 'KIDULTS_PSA_PRIVATE_DATA_DELETION_RECEIPT_V1',
    provider_id: 'psa-public-api',
    record_digest: record.record_digest,
    cert_reference_digest: record.cert_reference_digest,
    deleted_at: at.toISOString(),
    delete_at: record.delete_at,
    deletion_verified: true,
    raw_payload_retained: false,
    promotion_authority: 'NONE',
    production: 'HOLD'
  };
}
