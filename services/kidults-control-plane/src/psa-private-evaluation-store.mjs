import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, open, readdir, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';

const DAY_MS = 86_400_000;
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const READABLE_CERT_REFERENCE_DIGEST_PATTERN = /^(?:sha256:[0-9a-f]{64}|hmac-sha256:v1:[0-9a-f]{64})$/;
const WRITABLE_CERT_REFERENCE_DIGEST_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_ROOT_MODE = 0o700;
const PRIVATE_RECORD_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/;
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
    record_version: '1.1.0', provider_id: 'psa-public-api', classification: 'PRIVATE_ONLY',
    cert_reference_digest: certReferenceDigest, observed_at: observedAt, delete_at: deleteAt,
    encryption: 'AES-256-GCM', plaintext_persisted: false, public_release: 'BLOCK', production: 'HOLD'
  };
}

function recordDigest(record) {
  const { record_digest: _omitted, ...bound } = record;
  return digest(stable(bound));
}

function assertWritableCertReference(certReferenceDigest) {
  const value = String(certReferenceDigest || '');
  if (!READABLE_CERT_REFERENCE_DIGEST_PATTERN.test(value)) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  if (!WRITABLE_CERT_REFERENCE_DIGEST_PATTERN.test(value)) throw new Error('PSA_CERT_REFERENCE_HMAC_REQUIRED');
}

function encryptRecord({ certReferenceDigest, payload, key, observedAt, deleteAt }) {
  assertWritableCertReference(certReferenceDigest);
  validatePayload(payload);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const observed = new Date(observedAt);
  const deletion = new Date(deleteAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  if (Number.isNaN(deletion.valueOf()) || deletion <= observed || deletion > new Date(observed.valueOf() + 30 * DAY_MS)) {
    throw new Error('PSA_DELETE_AT_OUT_OF_BOUNDS');
  }
  const metadata = authenticatedMetadata({
    certReferenceDigest, observedAt: observed.toISOString(), deleteAt: deletion.toISOString()
  });
  const aad = Buffer.from(stable(metadata));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const record = {
    ...metadata, aad_digest: digest(aad), iv_b64: iv.toString('base64'),
    tag_b64: cipher.getAuthTag().toString('base64'), ciphertext_b64: ciphertext.toString('base64')
  };
  return { ...record, record_digest: recordDigest(record) };
}

export function buildPrivatePsaRecord({ certNumber, certReferenceKey, payload, key, observedAt = new Date() }) {
  const cert = String(certNumber ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  if (!Buffer.isBuffer(certReferenceKey) || certReferenceKey.length !== 32) throw new Error('PSA_CERT_REFERENCE_KEY_REQUIRED');
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  const certReferenceDigest = `hmac-sha256:v1:${createHmac('sha256', certReferenceKey)
    .update(`KIDULTS_PSA_CERT_REFERENCE_V1\0${cert}`)
    .digest('hex')}`;
  return encryptRecord({
    certReferenceDigest, payload, key, observedAt: observed,
    deleteAt: new Date(observed.valueOf() + 30 * DAY_MS)
  });
}

export function buildPrivatePsaRecordFromDigest({ certReferenceDigest, payload, key, observedAt = new Date(), deleteAt }) {
  return encryptRecord({ certReferenceDigest, payload, key, observedAt, deleteAt });
}

export function decryptPrivatePsaRecord(record, key) {
  if (!record || record.classification !== 'PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_REQUIRED');
  if (record.record_version !== '1.1.0' || record.provider_id !== 'psa-public-api' || record.encryption !== 'AES-256-GCM') throw new Error('PSA_PRIVATE_RECORD_METADATA_INVALID');
  if (!READABLE_CERT_REFERENCE_DIGEST_PATTERN.test(record.cert_reference_digest ?? '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(record.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_INVALID');
  const metadata = authenticatedMetadata({
    certReferenceDigest: record.cert_reference_digest, observedAt: record.observed_at, deleteAt: record.delete_at
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
  if (!SHA256_DIGEST_PATTERN.test(record?.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_REQUIRED');
  if (!READABLE_CERT_REFERENCE_DIGEST_PATTERN.test(record?.cert_reference_digest ?? '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_REQUIRED');
  if (deletionSucceeded !== true) throw new Error('PSA_DELETION_NOT_VERIFIED');
  const at = new Date(deletedAt);
  const observedAt = new Date(record.observed_at);
  const deleteAt = new Date(record.delete_at);
  if (Number.isNaN(at.valueOf())) throw new Error('PSA_DELETED_AT_INVALID');
  if (Number.isNaN(observedAt.valueOf()) || Number.isNaN(deleteAt.valueOf())) throw new Error('PSA_RETENTION_WINDOW_INVALID');
  if (at.valueOf() < observedAt.valueOf()) throw new Error('PSA_DELETION_BEFORE_OBSERVATION');
  const deadlineMet = at.valueOf() <= deleteAt.valueOf();
  return {
    receipt_id: 'KIDULTS_PSA_PRIVATE_DATA_DELETION_RECEIPT_V1',
    state: deadlineMet ? 'VERIFIED_PASS' : 'VERIFIED_RETENTION_BREACH_DELETED',
    provider_id: 'psa-public-api', record_digest: record.record_digest,
    cert_reference_digest: record.cert_reference_digest, deleted_at: at.toISOString(), delete_at: record.delete_at,
    deletion_verified: true, retention_deadline_met: deadlineMet, raw_payload_retained: false,
    promotion_authority: 'NONE', production: 'HOLD'
  };
}

function assertRoot(rootDir) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new Error('PSA_PRIVATE_STORE_ROOT_REQUIRED');
  const root = resolve(rootDir);
  if (resolve(root, '..') === root) throw new Error('PSA_PRIVATE_STORE_ROOT_TOO_BROAD');
  return root;
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`);
}

async function resolveProspectivePath(path) {
  const missing = [];
  let cursor = path;
  while (true) {
    try {
      return resolve(await realpath(cursor), ...missing.reverse());
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(basename(cursor));
      cursor = parent;
    }
  }
}

async function ensurePrivateRoot(root, forbiddenReal) {
  let rootLinkStat;
  try {
    rootLinkStat = await lstat(root);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (forbiddenReal && pathsOverlap(await resolveProspectivePath(root), forbiddenReal)) {
      throw new Error('PSA_PRIVATE_STORE_ROOT_OVERLAP_FORBIDDEN');
    }
    await mkdir(root, { recursive: true, mode: PRIVATE_ROOT_MODE });
    rootLinkStat = await lstat(root);
  }
  if (rootLinkStat.isSymbolicLink()) throw new Error('PSA_PRIVATE_STORE_ROOT_SYMLINK_FORBIDDEN');
  if (!rootLinkStat.isDirectory()) throw new Error('PSA_PRIVATE_STORE_ROOT_NOT_DIRECTORY');
  const rootReal = await realpath(root);
  if (forbiddenReal && pathsOverlap(rootReal, forbiddenReal)) throw new Error('PSA_PRIVATE_STORE_ROOT_OVERLAP_FORBIDDEN');
  const rootStat = await stat(rootReal);
  if (!rootStat.isDirectory()) throw new Error('PSA_PRIVATE_STORE_ROOT_NOT_DIRECTORY');
  if ((rootStat.mode & 0o777) !== PRIVATE_ROOT_MODE) throw new Error('PSA_PRIVATE_STORE_ROOT_PERMISSIONS_INVALID');
  return rootReal;
}

export async function resolvePsaPrivateStoreRoot({ rootDir, forbiddenRoot }) {
  const root = assertRoot(rootDir);
  const forbidden = assertRoot(forbiddenRoot);
  const forbiddenReal = await realpath(forbidden);
  const rootReal = await ensurePrivateRoot(root, forbiddenReal);
  return rootReal;
}

function recordPath(root, handle) {
  const name = String(handle || '').slice('psa-private-file:'.length);
  if (!String(handle || '').startsWith('psa-private-file:') || !PRIVATE_RECORD_NAME_PATTERN.test(name)) throw new Error('PSA_PRIVATE_HANDLE_INVALID');
  const path = resolve(root, name);
  if (!path.startsWith(`${root}${sep}`)) throw new Error('PSA_PRIVATE_HANDLE_OUTSIDE_ROOT');
  return path;
}

function assertPrivateFileStat(fileStat, kind) {
  if (!fileStat.isFile()) throw new Error(`PSA_PRIVATE_${kind}_TYPE_INVALID`);
  if (fileStat.nlink !== 1) throw new Error(`PSA_PRIVATE_${kind}_LINK_COUNT_INVALID`);
  if ((fileStat.mode & 0o777) !== PRIVATE_FILE_MODE) throw new Error(`PSA_PRIVATE_${kind}_PERMISSIONS_INVALID`);
}

async function openPrivateFile(path, flags, kind) {
  let file;
  try {
    file = await open(path, flags | fsConstants.O_NOFOLLOW, PRIVATE_FILE_MODE);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`PSA_PRIVATE_${kind}_SYMLINK_FORBIDDEN`);
    throw error;
  }
  try {
    assertPrivateFileStat(await file.stat(), kind);
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function readPrivateRecord(root, name) {
  if (!PRIVATE_RECORD_NAME_PATTERN.test(name)) throw new Error('PSA_PRIVATE_HANDLE_INVALID');
  const path = resolve(root, name);
  if (!path.startsWith(`${root}${sep}`)) throw new Error('PSA_PRIVATE_HANDLE_OUTSIDE_ROOT');
  const linkStat = await lstat(path);
  if (linkStat.isSymbolicLink()) throw new Error('PSA_PRIVATE_RECORD_SYMLINK_FORBIDDEN');
  if (!linkStat.isFile()) throw new Error('PSA_PRIVATE_RECORD_TYPE_INVALID');
  const file = await openPrivateFile(path, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK, 'RECORD');
  try {
    const fileStat = await file.stat();
    if (fileStat.dev !== linkStat.dev || fileStat.ino !== linkStat.ino) throw new Error('PSA_PRIVATE_RECORD_CHANGED_DURING_OPEN');
    const record = JSON.parse(await file.readFile('utf8'));
    return { path, record, fileStat };
  } finally {
    await file.close();
  }
}

export function createPsaPrivateFileStore({ rootDir, key, now = () => new Date() }) {
  const root = assertRoot(rootDir);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const auditPath = resolve(root, 'audit.jsonl');
  const ensureRoot = async () => {
    const rootReal = await ensurePrivateRoot(root);
    if (rootReal !== root) throw new Error('PSA_PRIVATE_STORE_ROOT_CANONICAL_REQUIRED');
    return rootReal;
  };
  const audit = async event => {
    await ensureRoot();
    let file;
    try {
      file = await openPrivateFile(
        auditPath,
        fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
        'AUDIT',
      );
      await file.writeFile(`${JSON.stringify(event)}\n`, 'utf8');
    } finally {
      await file?.close();
    }
  };
  return {
    capabilities: ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT'],
    async put({ providerId, certReferenceDigest, payload, acquiredAt, deleteBy, rawDigest }) {
      if (providerId !== 'psa-public-api') throw new Error('PSA_PROVIDER_ID_INVALID');
      assertWritableCertReference(certReferenceDigest);
      if (!SHA256_DIGEST_PATTERN.test(String(rawDigest || ''))) throw new Error('PSA_RAW_DIGEST_INVALID');
      if (rawDigest !== digest(stable(payload))) throw new Error('PSA_RAW_DIGEST_MISMATCH');
      const record = buildPrivatePsaRecordFromDigest({ certReferenceDigest, payload, key, observedAt: acquiredAt, deleteAt: deleteBy });
      await ensureRoot();
      const filename = `${randomUUID()}.json`;
      const path = resolve(root, filename);
      const file = await openPrivateFile(
        path,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        'RECORD',
      );
      try { await file.writeFile(`${JSON.stringify(record)}\n`, 'utf8'); } finally { await file.close(); }
      const handle = `psa-private-file:${filename}`;
      try {
        await audit({ operation: 'PUT', provider_id: providerId, handle_digest: digest(handle), cert_reference_digest: certReferenceDigest, raw_digest: rawDigest, at: new Date(now()).toISOString(), delete_at: record.delete_at });
      } catch (error) {
        await unlink(path).catch(unlinkError => {
          throw new AggregateError([error, unlinkError], 'PSA_PRIVATE_PUT_AUDIT_AND_COMPENSATION_FAILED');
        });
        throw error;
      }
      return handle;
    },
    async listExpired({ providerId, beforeOrAt }) {
      if (providerId !== 'psa-public-api') throw new Error('PSA_PROVIDER_ID_INVALID');
      const cutoff = new Date(beforeOrAt);
      if (Number.isNaN(cutoff.valueOf())) throw new Error('PSA_EXPIRY_CUTOFF_INVALID');
      await ensureRoot();
      const entries = await readdir(root, { withFileTypes: true });
      const expired = [];
      for (const entry of entries) {
        if (!PRIVATE_RECORD_NAME_PATTERN.test(entry.name)) continue;
        const { record } = await readPrivateRecord(root, entry.name);
        decryptPrivatePsaRecord(record, key);
        const deleteAt = new Date(record.delete_at);
        if (Number.isNaN(deleteAt.valueOf())) throw new Error('PSA_PRIVATE_RECORD_DELETE_AT_INVALID');
        if (deleteAt.valueOf() <= cutoff.valueOf()) expired.push({ handle: `psa-private-file:${entry.name}` });
      }
      await audit({ operation: 'LIST_EXPIRED', provider_id: providerId, at: new Date(now()).toISOString(), cutoff: cutoff.toISOString(), count: expired.length });
      return expired;
    },
    async delete({ handle, reason, deletedAt }) {
      if (!['RETENTION_EXPIRED', 'ADMISSION_FAILED_COMPENSATION'].includes(reason)) throw new Error('PSA_DELETION_REASON_INVALID');
      await ensureRoot();
      const path = recordPath(root, handle);
      const { record, fileStat } = await readPrivateRecord(root, handle.slice('psa-private-file:'.length));
      decryptPrivatePsaRecord(record, key);
      const at = new Date(deletedAt);
      if (Number.isNaN(at.valueOf())) throw new Error('PSA_DELETED_AT_INVALID');
      if (reason === 'RETENTION_EXPIRED' && at.valueOf() < new Date(record.delete_at).valueOf()) throw new Error('PSA_RETENTION_NOT_EXPIRED');
      const receipt = buildDeletionReceipt(record, { deletedAt: at, deletionSucceeded: true });
      const currentStat = await lstat(path);
      if (currentStat.dev !== fileStat.dev || currentStat.ino !== fileStat.ino) throw new Error('PSA_PRIVATE_RECORD_CHANGED_BEFORE_DELETE');
      await unlink(path);
      let deletionVerified = false;
      try { await access(path); } catch (error) { if (error?.code === 'ENOENT') deletionVerified = true; else throw error; }
      if (!deletionVerified) throw new Error('PSA_DELETION_NOT_VERIFIED');
      await audit({ operation: 'DELETE', reason, provider_id: 'psa-public-api', handle_digest: digest(handle), cert_reference_digest: record.cert_reference_digest, at: receipt.deleted_at, deletion_verified: true, retention_deadline_met: receipt.retention_deadline_met });
      return receipt;
    }
  };
}
