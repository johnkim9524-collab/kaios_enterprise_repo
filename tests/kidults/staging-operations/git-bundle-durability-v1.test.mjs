import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MockImmutableStore, ephemeralEd25519 } from '../../../scripts/kidults/staging-operations/lib/aws-durability-v1.mjs';
import { buildGitBundleManifest } from '../../../scripts/kidults/staging-operations/lib/git-bundle-durability-v1.mjs';

test('git bundle automation exact-binds ref, signs, uploads and verifies readback', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-bundle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const expectedSha = process.env.TEST_GIT_SHA;
  const ref = process.env.TEST_GIT_REF;
  assert.match(expectedSha, /^[0-9a-f]{40}$/);
  assert.match(ref, /^refs\/heads\//);
  const result = buildGitBundleManifest({
    repositoryRoot: process.cwd(), ref, expectedSha, outputDirectory: directory,
    ...ephemeralEd25519(), immutableStore: new MockImmutableStore(),
  });
  assert.equal(result.manifest.protected_sha, expectedSha);
  assert.equal(result.signature_verified, true);
  assert.equal(result.readback_verified, true);
  assert.equal(result.manifest.production, 'HOLD');
});

test('git bundle automation fails before creation on protected SHA drift', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-bundle-drift-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => buildGitBundleManifest({
    repositoryRoot: process.cwd(), ref: process.env.TEST_GIT_REF,
    expectedSha: '0000000000000000000000000000000000000000', outputDirectory: directory,
    ...ephemeralEd25519(), immutableStore: new MockImmutableStore(),
  }), /PROTECTED_MAIN_SHA_MISMATCH/);
});
