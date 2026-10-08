import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('workflow_run bootstrap and independent consumption agree despite default SHA drift', () => {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-run-bootstrap-test-'));
  const eventPath = path.join(directory, 'event.json');
  const unique = crypto.randomBytes(12).toString('hex');
  const env = {...process.env, GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
    GITHUB_EVENT_NAME: 'workflow_run', GITHUB_EVENT_PATH: eventPath,
    GITHUB_SHA: sha === 'a'.repeat(40) ? 'b'.repeat(40) : 'a'.repeat(40),
    GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '1',
    KIDULTS_BOOTSTRAP_NONCE: crypto.randomBytes(40).toString('hex')};
  delete env.KIDULTS_BOOTSTRAP_EXPECTED_SHA;
  const bindings = ['--agent-id', `workflow-run-test-${unique}`, '--agent-class', 'TEST_AGENTS',
    '--task-id', `workflow-run-test-${unique}`, '--session-id', `workflow-run-test-${unique}`,
    '--expected-sha', sha];
  const run = (script, args) => spawnSync(process.execPath, [script, ...args],
    {env, encoding: 'utf8', timeout: 30000});
  const bootstrap = 'scripts/governance/bootstrap-ai-agent-from-github-v1.mjs';
  const verifier = 'scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs';
  try {
    fs.writeFileSync(eventPath, JSON.stringify({workflow_run: {head_sha: sha}}));
    const created = run(bootstrap, bindings);
    assert.equal(created.status, 0, created.stderr);
    const receipt = JSON.parse(created.stdout);
    const args = ['--receipt', receipt.receipt_path, ...bindings, '--consume'];
    fs.writeFileSync(eventPath, JSON.stringify({workflow_run: {}}));
    const missing = run(verifier, args);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /GITHUB_EVENT_TRUSTED_SHA_UNRESOLVED/);
    fs.writeFileSync(eventPath, JSON.stringify({workflow_run: {head_sha: env.GITHUB_SHA}}));
    const mismatch = run(verifier, args);
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /GITHUB_EVENT_CHECKOUT_SHA_MISMATCH/);
    fs.writeFileSync(eventPath, JSON.stringify({workflow_run: {head_sha: sha}}));
    const consumed = run(verifier, args);
    assert.equal(consumed.status, 0, consumed.stderr);
    assert.equal(JSON.parse(consumed.stdout).state, 'BOOTSTRAP_VERIFIED');
    assert.equal(JSON.parse(consumed.stdout).consumed, true);
    const replay = run(verifier, args);
    assert.notEqual(replay.status, 0);
    assert.match(replay.stderr, /BOOTSTRAP_NONCE_REPLAY/);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
