import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import test from 'node:test';
import { access, chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPsaPrivateFileStore, resolvePsaPrivateStoreRoot } from '../src/psa-private-evaluation-store.mjs';
import { deleteExpiredPsaEvaluations } from '../src/psa-private-evaluation.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const keyedHash = char => `hmac-sha256:v1:${char.repeat(64)}`;
const syntheticCertNumber = '8'.repeat(8);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const payloadDigest = value => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
const stringDigest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const legacyRecordFixture = ({ key, certReferenceDigest, observedAt, deleteAt }) => {
  const metadata = {
    record_version: '1.1.0', provider_id: 'psa-public-api', classification: 'PRIVATE_ONLY',
    cert_reference_digest: certReferenceDigest, observed_at: observedAt, delete_at: deleteAt,
    encryption: 'AES-256-GCM', plaintext_persisted: false, public_release: 'BLOCK', production: 'HOLD',
  };
  const aad = Buffer.from(canonical(metadata));
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ PSACert: {} }))), cipher.final()]);
  const record = {
    ...metadata, aad_digest: stringDigest(aad), iv_b64: iv.toString('base64'),
    tag_b64: cipher.getAuthTag().toString('base64'), ciphertext_b64: ciphertext.toString('base64'),
  };
  return { ...record, record_digest: payloadDigest(record) };
};

test('file store encrypts raw PSA payload and emits verified deletion audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 7), now: () => new Date('2026-08-28T00:00:00Z') });
    const payload = { PSACert: { CertNumber: syntheticCertNumber, CardGrade: '10' } };
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload)
    });
    const recordText = await readFile(join(root, handle.slice('psa-private-file:'.length)), 'utf8');
    assert(!recordText.includes(syntheticCertNumber));
    assert(!recordText.includes('CardGrade'));
    const receipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-27T00:00:00Z' });
    assert.equal(receipt.deleted_count, 1);
    assert.equal(receipt.state, 'VERIFIED_PASS');
    assert.equal(receipt.retention_breach_count, 0);
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"deletion_verified":true'));
    assert(!audit.includes(syntheticCertNumber));
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal((await stat(join(root, 'audit.jsonl'))).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects legacy cert-reference digests for new writes and accepts only HMAC-v1 references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-cert-digest-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 2) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: hash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
    }), /PSA_CERT_REFERENCE_HMAC_REQUIRED/);
    assert.deepEqual(await readdir(root), []);
    await store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('d'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
    });
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: `hmac-sha256:v2:${'e'.repeat(64)}`, payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
    }), /PSA_CERT_REFERENCE_DIGEST_INVALID/);
    assert.equal((await readdir(root)).filter(name => name.endsWith('.json')).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store can authenticate and purge a preexisting legacy record without enabling legacy writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-legacy-purge-'));
  try {
    const key = Buffer.alloc(32, 12);
    const filename = '00000000-0000-4000-8000-000000000009.json';
    const record = legacyRecordFixture({
      key, certReferenceDigest: hash('c'), observedAt: '2026-08-28T00:00:00.000Z', deleteAt: '2026-09-27T00:00:00.000Z',
    });
    await writeFile(join(root, filename), `${JSON.stringify(record)}\n`, { mode: 0o600 });
    const store = createPsaPrivateFileStore({ rootDir: root, key });
    const receipt = await store.delete({
      handle: `psa-private-file:${filename}`, reason: 'RETENTION_EXPIRED', deletedAt: '2026-09-27T00:00:00.000Z',
    });
    assert.equal(receipt.cert_reference_digest, hash('c'));
    assert.equal(receipt.deletion_verified, true);
    await assert.rejects(() => access(join(root, filename)), error => error?.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects a caller raw digest that is not bound to the canonical payload before persisting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-raw-digest-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 4) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d'),
    }), /PSA_RAW_DIGEST_MISMATCH/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects retention beyond thirty days before write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-negative-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 3) });
    const payload = { PSACert: {} };
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-28T00:00:01Z', rawDigest: payloadDigest(payload)
    }), /DELETE_AT_OUT_OF_BOUNDS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store preserves unexpired data for retention deletion but permits verified admission-failure compensation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-compensation-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 3) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    await assert.rejects(() => store.delete({
      handle, reason: 'RETENTION_EXPIRED', deletedAt: '2026-08-28T00:00:01Z',
    }), /PSA_RETENTION_NOT_EXPIRED/);
    await access(path);
    const receipt = await store.delete({
      handle, reason: 'ADMISSION_FAILED_COMPENSATION', deletedAt: '2026-08-28T00:00:01Z',
    });
    assert.equal(receipt.deletion_verified, true);
    assert.equal(receipt.raw_payload_retained, false);
    await assert.rejects(() => access(path), error => error?.code === 'ENOENT');
    assert((await readFile(join(root, 'audit.jsonl'), 'utf8')).includes('"reason":"ADMISSION_FAILED_COMPENSATION"'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('expiry discovery authenticates deletion metadata before using it and rejects future-date evasion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-tamper-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 5) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload)
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const record = JSON.parse(await readFile(path, 'utf8'));
    record.delete_at = '2036-08-29T00:00:00.000Z';
    await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await assert.rejects(
      () => deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-27T00:00:00Z' }),
      /PSA_RECORD_DIGEST_INVALID/,
    );
    await access(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runtime root validation rejects a symlink into the forbidden repository tree', async () => {
  const base = await mkdtemp(join(tmpdir(), 'kidults-psa-private-root-'));
  try {
    const repository = join(base, 'repository');
    const link = join(base, 'private-link');
    await mkdir(repository);
    await symlink(repository, link, 'dir');
    await assert.rejects(() => resolvePsaPrivateStoreRoot({ rootDir: link, forbiddenRoot: repository }), /ROOT_SYMLINK_FORBIDDEN/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('file store fails closed on a group-readable private root instead of changing its permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-root-mode-'));
  try {
    await chmod(root, 0o750);
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 8) });
    await assert.rejects(
      () => store.listExpired({ providerId: 'psa-public-api', beforeOrAt: '2026-09-27T00:00:00Z' }),
      /PSA_PRIVATE_STORE_ROOT_PERMISSIONS_INVALID/,
    );
    assert.equal((await stat(root)).mode & 0o777, 0o750);
  } finally {
    await chmod(root, 0o700);
    await rm(root, { recursive: true, force: true });
  }
});

test('file store does not write through an audit symlink and removes the uncommitted encrypted record', async () => {
  const base = await mkdtemp(join(tmpdir(), 'kidults-psa-private-audit-symlink-'));
  try {
    const root = join(base, 'private');
    const outside = join(base, 'outside-audit.jsonl');
    await mkdir(root, { mode: 0o700 });
    await writeFile(outside, 'outside\n', { mode: 0o600 });
    await symlink(outside, join(root, 'audit.jsonl'));
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 8) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
    }), /PSA_PRIVATE_AUDIT_SYMLINK_FORBIDDEN/);
    assert.equal(await readFile(outside, 'utf8'), 'outside\n');
    assert.deepEqual((await readdir(root)).filter(name => name.endsWith('.json')), []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('file store rejects record symlinks, hard links, and relaxed record permissions during expiry discovery', async t => {
  await t.test('symlink', async () => {
    const base = await mkdtemp(join(tmpdir(), 'kidults-psa-private-record-symlink-'));
    try {
      const root = join(base, 'private');
      await mkdir(root, { mode: 0o700 });
      const target = join(base, 'outside.json');
      const recordName = '00000000-0000-4000-8000-000000000001.json';
      await writeFile(target, '{}\n', { mode: 0o600 });
      await symlink(target, join(root, recordName));
      const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 8) });
      await assert.rejects(
        () => store.listExpired({ providerId: 'psa-public-api', beforeOrAt: '2026-09-27T00:00:00Z' }),
        /PSA_PRIVATE_RECORD_SYMLINK_FORBIDDEN/,
      );
      assert.equal(await readFile(target, 'utf8'), '{}\n');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  await t.test('hard link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-record-hardlink-'));
    try {
      const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 8) });
      const payload = { PSACert: { CertNumber: syntheticCertNumber } };
      const handle = await store.put({
        providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
        acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
      });
      const original = join(root, handle.slice('psa-private-file:'.length));
      const linked = join(root, '00000000-0000-4000-8000-000000000002.json');
      await link(original, linked);
      assert.equal((await lstat(original)).nlink, 2);
      await assert.rejects(
        () => store.listExpired({ providerId: 'psa-public-api', beforeOrAt: '2026-09-27T00:00:00Z' }),
        /PSA_PRIVATE_RECORD_LINK_COUNT_INVALID/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('relaxed permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-record-mode-'));
    try {
      const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 8) });
      const payload = { PSACert: { CertNumber: syntheticCertNumber } };
      const handle = await store.put({
        providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
        acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload),
      });
      await chmod(join(root, handle.slice('psa-private-file:'.length)), 0o640);
      await assert.rejects(
        () => store.listExpired({ providerId: 'psa-public-api', beforeOrAt: '2026-09-27T00:00:00Z' }),
        /PSA_PRIVATE_RECORD_PERMISSIONS_INVALID/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test('late retention run deletes overdue raw data and records the deadline breach', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-late-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 6) });
    const payload = { PSACert: { CertNumber: syntheticCertNumber } };
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: keyedHash('c'), payload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: payloadDigest(payload)
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const batchReceipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-28T00:00:00Z' });
    assert.equal(batchReceipt.deleted_count, 1);
    assert.equal(batchReceipt.state, 'VERIFIED_RETENTION_BREACH_DELETED');
    assert.equal(batchReceipt.retention_breach_count, 1);
    assert.equal(batchReceipt.retention_breach_digests.length, 1);
    assert.equal(batchReceipt.retention_breach_record_digests.length, 1);
    await assert.rejects(() => access(path), error => error?.code === 'ENOENT');
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"retention_deadline_met":false'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
