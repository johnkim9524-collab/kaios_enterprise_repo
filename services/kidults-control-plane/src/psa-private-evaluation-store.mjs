import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DAY_MS = 86_400_000;
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;

export function buildPrivatePsaRecord({ certNumber, payload, key, observedAt = new Date() }) {
  const cert = String(certNumber ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('PSA_PAYLOAD_OBJECT_REQUIRED');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const deleteAt = new Date(observed.valueOf() + 30 * DAY_MS);
  return {
    record_version: '1.0.0',
    provider_id: 'psa-public-api',
    classification: 'PRIVATE_ONLY',
    cert_reference_digest: digest(cert),
    observed_at: observed.toISOString(),
    delete_at: deleteAt.toISOString(),
    encryption: 'AES-256-GCM',
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64'),
    plaintext_persisted: false,
    public_release: 'BLOCK',
    production: 'HOLD'
  };
}

export function decryptPrivatePsaRecord(record, key) {
  if (!record || record.classification !== 'PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_REQUIRED');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv_b64, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag_b64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext_b64, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function buildDeletionReceipt(record, { deletedAt = new Date(), deletionSucceeded }) {
  if (!record?.cert_reference_digest || !/^sha256:[0-9a-f]{64}$/.test(record.cert_reference_digest)) throw new Error('PSA_RECORD_DIGEST_REQUIRED');
  if (deletionSucceeded !== true) throw new Error('PSA_DELETION_NOT_VERIFIED');
  const at = new Date(deletedAt);
  if (Number.isNaN(at.valueOf())) throw new Error('PSA_DELETED_AT_INVALID');
  return {
    receipt_id: 'KIDULTS_PSA_PRIVATE_DATA_DELETION_RECEIPT_V1',
    provider_id: 'psa-public-api',
    cert_reference_digest: record.cert_reference_digest,
    deleted_at: at.toISOString(),
    deletion_verified: true,
    raw_payload_retained: false,
    promotion_authority: 'NONE',
    production: 'HOLD'
  };
}
