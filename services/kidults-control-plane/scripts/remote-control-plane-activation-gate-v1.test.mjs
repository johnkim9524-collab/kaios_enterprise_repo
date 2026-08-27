import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateRemoteActivation } from './remote-control-plane-activation-gate-v1.mjs';

const HEAD = 'a'.repeat(40);
const IDS = [
  'remote-postgres-provisioning',
  'remote-postgres-rls-concurrency',
  'remote-postgres-pitr',
  'governed-d1-projector-deployment',
  'legacy-d1-writer-cutover',
  'remote-rollback',
  'exact-head-checks',
  'post-merge-main-revalidation',
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'kaios-remote-evidence-'));
  const evidenceDir = path.join(root, 'receipts');
  await mkdir(evidenceDir);
  const entries = [];
  for (const id of IDS) {
    const file = `${id}.json`;
    const raw = Buffer.from(`${JSON.stringify({ id, status: 'PASS', head_sha: HEAD, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD' })}\n`);
    await writeFile(path.join(evidenceDir, file), raw);
    entries.push({ id, file, sha256: sha256(raw) });
  }
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify({ version: 'remote-control-plane-evidence-manifest-v1', head_sha: HEAD, receipts: entries })}\n`);
  return { root, evidenceDir, manifestPath, entries, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('accepts only a complete digest-bound exact-head receipt bundle', async () => {
  const f = await fixture();
  try {
    const result = evaluateRemoteActivation({ evidenceDir: f.evidenceDir, manifestPath: f.manifestPath, expectedHeadSha: HEAD });
    assert.equal(result.ok, true);
    assert.equal(result.verified_receipts.length, 8);
    assert.match(result.manifest_sha256, /^[a-f0-9]{64}$/);
  } finally { await f.cleanup(); }
});

test('rejects a stale manifest head', async () => {
  const f = await fixture();
  try {
    const result = evaluateRemoteActivation({ evidenceDir: f.evidenceDir, manifestPath: f.manifestPath, expectedHeadSha: 'b'.repeat(40) });
    assert.deepEqual(result, { ok: false, reason: 'REMOTE_EVIDENCE_MANIFEST_STALE_HEAD' });
  } finally { await f.cleanup(); }
});

test('rejects tampered receipt bytes even when receipt JSON remains valid', async () => {
  const f = await fixture();
  try {
    const target = path.join(f.evidenceDir, f.entries[0].file);
    await writeFile(target, `${JSON.stringify({ id: IDS[0], status: 'PASS', head_sha: HEAD, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD', tampered: true })}\n`);
    const result = evaluateRemoteActivation({ evidenceDir: f.evidenceDir, manifestPath: f.manifestPath, expectedHeadSha: HEAD });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'REMOTE_EVIDENCE_INCOMPLETE_OR_INVALID');
    assert.equal(result.invalid[0].reason, 'RECEIPT_DIGEST_MISMATCH');
  } finally { await f.cleanup(); }
});

test('rejects path traversal from manifest entries', async () => {
  const f = await fixture();
  try {
    const manifest = { version: 'remote-control-plane-evidence-manifest-v1', head_sha: HEAD, receipts: [...f.entries] };
    manifest.receipts[0] = { ...manifest.receipts[0], file: '../escape.json' };
    await writeFile(f.manifestPath, `${JSON.stringify(manifest)}\n`);
    const result = evaluateRemoteActivation({ evidenceDir: f.evidenceDir, manifestPath: f.manifestPath, expectedHeadSha: HEAD });
    assert.equal(result.ok, false);
    assert.equal(result.invalid[0].reason, 'RECEIPT_PATH_ESCAPE');
  } finally { await f.cleanup(); }
});

test('rejects any receipt that tries to authorize production, public release or G5', async () => {
  const f = await fixture();
  try {
    const id = IDS[2];
    const file = `${id}.json`;
    const raw = Buffer.from(`${JSON.stringify({ id, status: 'PASS', head_sha: HEAD, production: 'AUTHORIZED', public_release: 'HOLD', g5: 'HOLD' })}\n`);
    await writeFile(path.join(f.evidenceDir, file), raw);
    const manifest = { version: 'remote-control-plane-evidence-manifest-v1', head_sha: HEAD, receipts: f.entries.map((e) => e.id === id ? { ...e, sha256: sha256(raw) } : e) };
    await writeFile(f.manifestPath, `${JSON.stringify(manifest)}\n`);
    const result = evaluateRemoteActivation({ evidenceDir: f.evidenceDir, manifestPath: f.manifestPath, expectedHeadSha: HEAD });
    assert.equal(result.ok, false);
    assert.equal(result.invalid[0].reason, 'FORBIDDEN_PRODUCTION_AUTHORIZATION_IN_EVIDENCE');
  } finally { await f.cleanup(); }
});
