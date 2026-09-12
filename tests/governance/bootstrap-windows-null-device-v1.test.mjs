import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const bootstrapPath = path.resolve('scripts/governance/bootstrap-ai-agent-from-github-v1.mjs');
const sources = [
  'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs',
  'scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs',
  'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs',
].map(filename => fs.readFileSync(filename, 'utf8'));

test('Git isolation uses the platform null device on every bootstrap surface', () => {
  for (const source of sources) {
    assert.match(source, /process\.platform === 'win32' \? 'NUL' : os\.devNull/);
    assert.match(source, /core\.hooksPath=\$\{GIT_NULL_DEVICE\}/);
    assert.doesNotMatch(source, /core\.hooksPath=\$\{os\.devNull\}/);
  }
});

test('a real lower Git failure is retained in a bounded fail-closed receipt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-not-repo-'));
  try {
    const result = spawnSync(process.execPath, [
      bootstrapPath,
      '--agent-id', 'bootstrap-null-device-regression',
      '--agent-class', 'TEST_AGENTS',
      '--task-id', 'bootstrap-null-device-regression',
      '--session-id', 'bootstrap-null-device-regression',
      '--expected-sha', 'a'.repeat(40),
    ], {
      cwd: directory,
      encoding: 'utf8',
      env: {...process.env, KIDULTS_BOOTSTRAP_NONCE: 'b'.repeat(64)},
    });
    assert.notEqual(result.status, 0);
    const lines = result.stderr.trim().split(/\r?\n/).filter(Boolean);
    const receipt = JSON.parse(lines.at(-1));
    assert.equal(receipt.state, 'VERIFIED_FAIL');
    assert.equal(receipt.failure_code, 'NOT_INSIDE_GIT_REPOSITORY');
    assert.ok(receipt.bounded_failure_detail.length > 0);
    assert.ok(Buffer.byteLength(receipt.bounded_failure_detail, 'ascii') <= 160);
    assert.match(receipt.bounded_failure_detail, /not a git repository/i);
    assert.equal(receipt.raw_nonce_persisted_or_logged, false);
    assert.doesNotMatch(result.stderr, /b{32,}/);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
