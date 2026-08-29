#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts/ops/cloudflare-pages-boundary-readonly.sh');
assert.equal(fs.existsSync(script), true, script);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-pages-missing-credentials-'));
process.on('exit', () => fs.rmSync(tempRoot, {recursive: true, force: true}));

const cases = [
  {
    name: 'token-absent',
    env: {
      CLOUDFLARE_API_TOKEN: '',
      CLOUDFLARE_ACCOUNT_ID: 'sentinel-account-id-never-emit',
    },
    forbidden: 'sentinel-account-id-never-emit',
  },
  {
    name: 'account-absent',
    env: {
      CLOUDFLARE_API_TOKEN: 'sentinel-token-never-emit',
      CLOUDFLARE_ACCOUNT_ID: '',
    },
    forbidden: 'sentinel-token-never-emit',
  },
];

for (const item of cases) {
  const receiptDir = path.join(tempRoot, item.name);
  const result = spawnSync('bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
      EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      RECEIPT_DIR: receiptDir,
      GITHUB_SHA: '7089bedb2ff96d8304dbac5994cf500acec13c27',
      ...item.env,
    },
  });

  assert.equal(result.status, 65, result.stderr || result.stdout);
  const receiptPath = path.join(receiptDir, 'final.json');
  assert.equal(fs.existsSync(receiptPath), true, `${item.name}: missing fail-closed receipt`);

  const raw = fs.readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(raw);
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.deepEqual(receipt.blockers, ['CLOUDFLARE_READONLY_CREDENTIALS_ABSENT']);
  assert.equal(receipt.settings_pass, false);
  assert.equal(receipt.latest_deployment_governed, false);
  assert.equal(receipt.visible_preview_count, null);
  assert.equal(receipt.project_readback, null);
  assert.equal(receipt.latest_deployment, null);
  assert.equal(receipt.read_only, true);
  assert.equal(receipt.settings_mutated, false);
  assert.equal(receipt.deployment_created, false);
  assert.equal(receipt.deployment_deleted, false);
  assert.equal(receipt.provider_credential_activated, false);
  assert.equal(receipt.secret_material_emitted, false);
  assert.equal(receipt.public_release, 'HOLD');
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.g5, 'HOLD');
  assert.equal(raw.includes(item.forbidden), false, `${item.name}: partial credential leaked`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_MISSING_CREDENTIALS_RECEIPT_V1',
  result: 'PASS',
  cases: cases.length,
  fail_closed_exit_65: true,
  receipt_always_emitted: true,
  partial_credentials_not_emitted: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
