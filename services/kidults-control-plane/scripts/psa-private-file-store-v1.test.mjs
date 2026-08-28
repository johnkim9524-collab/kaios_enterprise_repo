import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPsaPrivateFileStore, resolvePsaPrivateStoreRoot } from '../src/psa-private-evaluation-store.mjs';
import { deleteExpiredPsaEvaluations } from '../src/psa-private-evaluation.mjs';

const hash = char => `sha256:${char.repeat(64)}`;

test('file store encrypts raw PSA payload and emits verified deletion audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 7), now: () => new Date('2026-08-28T00:00:00Z') });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: hash('c'), payload: { PSACert: { CertNumber: '08178895', CardGrade: '10' } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const recordText = await readFile(join(root, handle.slice('psa-private-file:'.length)), 'utf8');
    assert(!recordText.includes('08178895'));
    assert(!recordText.includes('CardGrade'));
    const receipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-27T00:00:00Z' });
    assert.equal(receipt.deleted_count, 1);
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"deletion_verified":true'));
    assert(!audit.includes('08178895'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects retention beyond thirty days before write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-negative-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 3) });
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: hash('c'), payload: { PSACert: {} },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-28T00:00:01Z', rawDigest: hash('d')
    }), /DELETE_AT_OUT_OF_BOUNDS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects tampered deletion metadata and preserves the record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-tamper-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 5) });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: hash('c'), payload: { PSACert: { CertNumber: '08178895' } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const record = JSON.parse(await readFile(path, 'utf8'));
    record.delete_at = '2026-08-29T00:00:00.000Z';
    await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await assert.rejects(() => deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-08-29T00:00:00Z' }));
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
    await assert.rejects(() => resolvePsaPrivateStoreRoot({ rootDir: link, forbiddenRoot: repository }), /ROOT_OVERLAP_FORBIDDEN/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('late retention run deletes overdue raw data and records the deadline breach', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-late-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 6) });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: hash('c'), payload: { PSACert: { CertNumber: '08178895' } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const batchReceipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-28T00:00:00Z' });
    assert.equal(batchReceipt.deleted_count, 1);
    await assert.rejects(() => access(path), error => error?.code === 'ENOENT');
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"retention_deadline_met":false'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
