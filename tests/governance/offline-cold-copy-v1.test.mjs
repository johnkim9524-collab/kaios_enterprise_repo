import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createResilientGitCheckpoint } from '../../scripts/governance/resilient-git-checkpoint-v1.mjs';
import { createOfflineColdCopy, verifyOfflineColdCopy }
  from '../../scripts/governance/offline-cold-copy-v1.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kidults-offline-test-'));
  const checkpointRoot = path.join(root, 'checkpoint');
  const mediaRoot = path.join(root, 'media');
  const secretRoot = path.join(root, 'secrets');
  mkdirSync(secretRoot, { mode: 0o700 });
  const keyFile = path.join(secretRoot, 'encryption.key');
  const signingKeyFile = path.join(secretRoot, 'signing.pem');
  writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(signingKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const manifest = createResilientGitCheckpoint({ checkpointRoot,
    createdAt: '2026-09-20T00:00:00.000Z', repository });
  return { root, checkpointRoot, mediaRoot, keyFile, signingKeyFile,
    branch: manifest.branch, custodianId: 'offline-custodian-a', mediaId: 'usb-a-2026' };
}

test('writes an encrypted generation and verifies an isolated exact restore', () => {
  const input = fixture();
  const created = createOfflineColdCopy({ ...input, observedAt: '2026-09-20T00:00:00.000Z' });
  assert.equal(created.state, 'OFFLINE_COPY_WRITTEN_PENDING_INDEPENDENT_RESTORE');
  const verified = verifyOfflineColdCopy(input);
  assert.equal(verified.state, 'OFFLINE_COPY_AND_ISOLATED_RESTORE_VERIFIED');
  assert.equal(verified.sourceSha, created.sourceSha);
  assert.equal(verified.sourceTree, created.sourceTree);
  assert.equal(verified.isolated, true);
  assert.equal(verified.independentCustodian, false);
  assert(verified.testsPassed >= 1);
});

test('fails closed when the decryption key does not match', () => {
  const input = fixture();
  createOfflineColdCopy({ ...input, observedAt: '2026-09-20T00:00:00.000Z' });
  const wrongKey = path.join(input.root, 'wrong.key');
  writeFileSync(wrongKey, randomBytes(32), { mode: 0o600 });
  assert.throws(() => verifyOfflineColdCopy({ ...input, keyFile: wrongKey }),
    /OFFLINE_DECRYPTION_FAILED/);
});

test('rejects encryption or signing keys stored on the offline medium', () => {
  const input = fixture();
  mkdirSync(input.mediaRoot, { mode: 0o700 });
  const unsafeKey = path.join(input.mediaRoot, 'unsafe.key');
  writeFileSync(unsafeKey, randomBytes(32), { mode: 0o600 });
  assert.throws(() => createOfflineColdCopy({ ...input, keyFile: unsafeKey,
    observedAt: '2026-09-20T00:00:00.000Z' }), /OFFLINE_KEY_MUST_NOT_BE_ON_MEDIA/);
});
