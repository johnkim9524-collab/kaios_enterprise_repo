#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts/ops/cloudflare-pages-boundary-readonly.sh');
assert.equal(fs.existsSync(script), true, script);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-readonly-credential-receipt-'));
process.on('exit', () => fs.rmSync(tempRoot, {recursive: true, force: true}));

function runCase(id, {apiToken, accountId, expectedPresence}) {
  const receiptDir = path.join(tempRoot, id);
  const result = spawnSync('bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
      EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      RECEIPT_DIR: receiptDir,
      GITHUB_SHA: '1111111111111111111111111111111111111111',
    },
  });

  assert.equal(result.status, 65, result.stderr || result.stdout);
  assert.match(result.stderr, /Cloudflare read-only credentials are absent/);

  const finalPath = path.join(receiptDir, 'final.json');
  assert.equal(fs.existsSync(finalPath), true, `${id}: missing final.json`);
  const raw = fs.readFileSync(finalPath, 'utf8');
  const receipt = JSON.parse(raw);

  assert.equal(receipt.id, 'kidults-cloudflare-pages-boundary-readonly-receipt-v1');
  assert.equal(receipt.state, 'BLOCKED_CREDENTIALS_ABSENT');
  assert.equal(receipt.reason_code, 'CLOUDFLARE_READONLY_CREDENTIALS_ABSENT');
  assert.equal(receipt.exit_code, 65);
  assert.deepEqual(receipt.credential_presence, expectedPresence);
  assert.equal(receipt.cloudflare_api_called, false);
  assert.equal(receipt.settings_readback_complete, false);
  assert.equal(receipt.deployment_inventory_complete, false);
  assert.equal(receipt.read_only, true);
  assert.equal(receipt.settings_mutated, false);
  assert.equal(receipt.deployment_created, false);
  assert.equal(receipt.deployment_deleted, false);
  assert.equal(receipt.public_release, 'HOLD');
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
  assert.doesNotMatch(raw, /test-token-never-real/);
  assert.doesNotMatch(raw, /test-account-never-real/);
}

runCase('token-absent', {
  apiToken: '',
  accountId: 'test-account-never-real',
  expectedPresence: {api_token_present: false, account_id_present: true},
});

runCase('account-absent', {
  apiToken: 'test-token-never-real',
  accountId: '',
  expectedPresence: {api_token_present: true, account_id_present: false},
});

runCase('both-absent', {
  apiToken: '',
  accountId: '',
  expectedPresence: {api_token_present: false, account_id_present: false},
});

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_READONLY_CREDENTIAL_FAILURE_RECEIPT_V1',
  result: 'PASS',
  cases: 3,
  fail_closed_exit: 65,
  sanitized_receipt_emitted: true,
  cloudflare_api_called: false,
  remote_mutation: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
