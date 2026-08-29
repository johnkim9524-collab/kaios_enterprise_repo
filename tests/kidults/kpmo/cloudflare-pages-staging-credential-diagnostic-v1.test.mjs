#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = 'scripts/ops/cloudflare-pages-staging-credential-diagnostic.sh';
const canonicalAccount = '235eaa51d04e7f4436a9faa507a04f9d';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-credential-diagnostic-'));
process.on('exit', () => fs.rmSync(temp, {recursive: true, force: true}));
const fakeBin = path.join(temp, 'bin');
fs.mkdirSync(fakeBin, {recursive: true});

const fakeCurl = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
const url = args.find((value) => value.startsWith('https://')) || '';
const canonical = '235eaa51d04e7f4436a9faa507a04f9d';
let status = '200';
let body = {success:true,result:{status:'active'}};
if (url.includes('/pages/projects/')) {
  const account = (url.match(/\/accounts\/([0-9a-f]{32})\//) || [,''])[1];
  const visible = account === canonical && process.env.FAKE_CANONICAL_VISIBLE !== 'false';
  if (visible) {
    body = {success:true,result:{name:'kidults-workspace-staging',source:{type:'github',config:{owner:'johnkim9524-collab',repo_name:'kaios_enterprise_repo'}}}};
  } else {
    status = '404';
    body = {success:false,errors:[{code:8000007,message:'Project not found'}],result:null};
  }
}
if (!output) process.exit(64);
fs.writeFileSync(output, JSON.stringify(body));
process.stdout.write(status);
`;
fs.writeFileSync(path.join(fakeBin, 'curl'), fakeCurl, {mode:0o755});

function runCase(name, accountId, canonicalVisible = true) {
  const caseDir = path.join(temp, name);
  const receiptDir = path.join(caseDir, 'receipt');
  const effectiveFile = path.join(caseDir, 'effective-account-id');
  fs.mkdirSync(caseDir, {recursive: true});
  const run = spawnSync('bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_CANONICAL_VISIBLE: canonicalVisible ? 'true' : 'false',
      CLOUDFLARE_API_TOKEN: 'test-token-never-real',
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
      EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      RECEIPT_DIR: receiptDir,
      EFFECTIVE_ACCOUNT_ID_FILE: effectiveFile,
    },
  });
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json'), 'utf8'));
  return {run, receipt, effectiveFile};
}

const configured = runCase('configured', canonicalAccount);
assert.equal(configured.run.status, 0, configured.run.stderr || configured.run.stdout);
assert.equal(configured.receipt.state, 'COMPLETE_VERIFIED');
assert.equal(configured.receipt.reason_code, 'CONFIGURED_ACCOUNT_PROJECT_VISIBLE');
assert.equal(configured.receipt.effective_account_source, 'CONFIGURED');
assert.equal(configured.receipt.configured_account_id.matches_canonical, true);
assert.equal(fs.readFileSync(configured.effectiveFile, 'utf8'), canonicalAccount);

const fallback = runCase('fallback', '11111111111111111111111111111111');
assert.equal(fallback.run.status, 0, fallback.run.stderr || fallback.run.stdout);
assert.equal(fallback.receipt.state, 'COMPLETE_VERIFIED');
assert.equal(fallback.receipt.reason_code, 'CANONICAL_ACCOUNT_PROJECT_VISIBLE');
assert.equal(fallback.receipt.effective_account_source, 'CANONICAL_FALLBACK');
assert.equal(fallback.receipt.project_visibility.configured.http_status, '404');
assert.equal(fallback.receipt.project_visibility.canonical.http_status, '200');
assert.equal(fs.readFileSync(fallback.effectiveFile, 'utf8'), canonicalAccount);

const blocked = runCase('blocked', '11111111111111111111111111111111', false);
assert.equal(blocked.run.status, 67, blocked.run.stderr || blocked.run.stdout);
assert.equal(blocked.receipt.state, 'BLOCKED_TOKEN_SCOPE_OR_ACCOUNT_RESOURCE_MISMATCH');
assert.equal(blocked.receipt.reason_code, 'ACTIVE_TOKEN_CANNOT_SEE_CANONICAL_PAGES_PROJECT');
assert.equal(blocked.receipt.token_verify.status, 'active');
assert.equal(blocked.receipt.project_visibility.configured.http_status, '404');
assert.equal(blocked.receipt.project_visibility.canonical.http_status, '404');
assert.equal(fs.existsSync(blocked.effectiveFile), false);
assert.equal(blocked.receipt.settings_mutated, false);
assert.equal(blocked.receipt.deployment_created, false);
assert.equal(blocked.receipt.deployment_deleted, false);

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_STAGING_CREDENTIAL_DIAGNOSTIC_V1',
  result: 'PASS',
  configured_account_path: true,
  canonical_fallback_path: true,
  active_token_without_project_visibility_fails_closed: true,
  secret_material_exposed: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
