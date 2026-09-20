import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readSafeEvidenceReceipt } from './verify-autonomous-postgres-evidence-v1.mjs';

test('independent verifier reads only a private regular receipt outside the repository', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kidults-postgres-receipt-'));
  try {
    await chmod(directory, 0o700);
    const receipt = path.join(directory, 'receipt.json');
    await writeFile(receipt, '{"safe":true}\n', { mode: 0o600 });
    assert.deepEqual(readSafeEvidenceReceipt(receipt), { safe: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('independent verifier rejects symlink, broad permissions and oversized evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kidults-postgres-receipt-negative-'));
  try {
    await chmod(directory, 0o700);
    const receipt = path.join(directory, 'receipt.json');
    await writeFile(receipt, '{"safe":true}\n', { mode: 0o600 });
    const link = path.join(directory, 'linked.json');
    await symlink(receipt, link);
    assert.throws(() => readSafeEvidenceReceipt(link), /FILE_INVALID/);
    await chmod(receipt, 0o644);
    assert.throws(() => readSafeEvidenceReceipt(receipt), /PERMISSIONS_INVALID/);
    await chmod(receipt, 0o600);
    await writeFile(receipt, 'x'.repeat(65537), { mode: 0o600 });
    assert.throws(() => readSafeEvidenceReceipt(receipt), /SIZE_INVALID/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('independent verifier rejects repository files and malformed JSON', async () => {
  assert.throws(() => readSafeEvidenceReceipt(fileURLToPath(import.meta.url)),
    /INSIDE_REPOSITORY_DENIED/);
  const directory = await mkdtemp(path.join(tmpdir(), 'kidults-postgres-receipt-json-'));
  try {
    await chmod(directory, 0o700);
    const receipt = path.join(directory, 'receipt.json');
    await writeFile(receipt, '{broken', { mode: 0o600 });
    assert.throws(() => readSafeEvidenceReceipt(receipt), /JSON_INVALID/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('independent verifier CLI fails closed without an exact receipt binding', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(
    './verify-autonomous-postgres-evidence-v1.mjs', import.meta.url))], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' },
  });
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.state, 'VERIFIED_FAIL');
  assert.equal(failure.reason, 'POSTGRES_EVIDENCE_VERIFY_ARGUMENTS_INVALID');
  assert.equal(failure.authorityGranted, false);
  assert.equal(failure.credentialMaterialRead, false);
});
