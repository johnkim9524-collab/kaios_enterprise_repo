#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const scripts = {
  readonly: path.join(repoRoot, 'scripts/ops/cloudflare-pages-boundary-readonly.sh'),
  contain: path.join(repoRoot, 'scripts/ops/cloudflare-pages-auto-deployment-containment.sh'),
  cleanup: path.join(repoRoot, 'scripts/ops/cloudflare-pages-preview-cleanup.sh'),
  deploy: path.join(repoRoot, 'scripts/ops/cloudflare-pages-governed-staging-deploy.sh'),
};
for (const script of Object.values(scripts)) assert.equal(fs.existsSync(script), true, script);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-pages-governance-'));
process.on('exit', () => fs.rmSync(tempRoot, {recursive: true, force: true}));
const fakeBin = path.join(tempRoot, 'bin');
fs.mkdirSync(fakeBin, {recursive: true});

const fakeCurl = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const methodIndex = args.indexOf('--request');
const method = methodIndex >= 0 ? args[methodIndex + 1] : 'GET';
const url = args.find((value) => /^https:\/\//.test(value)) || '';
const scenario = process.env.FAKE_CF_SCENARIO;
const stateDir = process.env.FAKE_CF_STATE_DIR;
fs.mkdirSync(stateDir, {recursive: true});
const counter = (name) => {
  const file = path.join(stateDir, name);
  const value = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  fs.writeFileSync(file, String(value + 1));
  return value + 1;
};
const project = (enabled) => ({
  success: true,
  result: {
    id: 'project-id', name: 'kidults-workspace-staging', production_branch: 'main', modified_on: '2026-08-29T00:00:00Z',
    source: {type: 'github', config: {
      owner: 'johnkim9524-collab', repo_name: 'kaios_enterprise_repo',
      deployments_enabled: enabled, production_deployments_enabled: enabled,
      preview_deployment_setting: enabled ? 'all' : 'none',
      preview_branch_includes: [], preview_branch_excludes: []
    }}
  }
});
const deployment = ({id, environment='production', trigger='ad_hoc', sha='1111111111111111111111111111111111111111', message='[KIDULTS-GOVERNED-STAGING] repository=johnkim9524-collab/kaios_enterprise_repo source_sha=1111111111111111111111111111111111111111 run=1 attempt=1 reason=test', status='success', created='2026-08-29T00:00:00Z'}) => ({
  id, environment, url: 'https://' + id + '.kidults-workspace-staging.pages.dev', aliases: [], created_on: created,
  latest_stage: {status},
  deployment_trigger: {type: trigger, metadata: {branch: 'main', commit_hash: sha, commit_message: message}}
});
const list = (items) => ({success:true, result:items, result_info:{page:1,per_page:100,total_pages:1}});
let response;
if (scenario === 'readonly-pass') {
  response = url.includes('/deployments') ? list([deployment({id:'governed'})]) : project(false);
} else if (scenario === 'readonly-fail-preview') {
  response = url.includes('/deployments') ? list([
    deployment({id:'preview', environment:'preview', trigger:'github:push', message:'ambient', created:'2026-08-29T00:02:00Z'}),
    deployment({id:'governed', created:'2026-08-29T00:01:00Z'})
  ]) : project(false);
} else if (scenario === 'contain-pass') {
  if (method === 'PATCH') response = project(false);
  else if (url.includes('/deployments')) response = list([deployment({id:'prod-old'})]);
  else response = counter('project-get') === 1 ? project(true) : project(false);
} else if (scenario === 'cleanup-pass') {
  if (method === 'DELETE') {
    fs.appendFileSync(path.join(stateDir, 'deleted.log'), url + '\n');
    if (!url.endsWith('/deployments/preview-1')) process.exit(70);
    response = {success:true,result:null};
  } else {
    const call = counter('deployments-get');
    response = call === 1
      ? list([deployment({id:'prod-old'}), deployment({id:'preview-1',environment:'preview',trigger:'github:push',message:'ambient'})])
      : list([deployment({id:'prod-old'})]);
  }
} else if (scenario === 'deploy-pass') {
  if (!url.includes('/deployments')) response = project(false);
  else {
    const call = counter('deployments-get');
    const old = deployment({id:'prod-old'});
    if (call === 1) response = list([old]);
    else response = list([deployment({
      id:'governed-new', sha:process.env.FAKE_SOURCE_SHA,
      message:process.env.FAKE_DEPLOY_MESSAGE, created:'2026-08-29T00:03:00Z'
    }), old]);
  }
} else {
  process.stderr.write('unknown fake scenario: ' + scenario + '\n');
  process.exit(71);
}
process.stdout.write(JSON.stringify(response));
`;
fs.writeFileSync(path.join(fakeBin, 'curl'), fakeCurl, {mode: 0o755});

const fakeNpx = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_CF_STATE_DIR/npx.log"
[[ "$*" == *"wrangler@4.127.1 pages deploy"* ]]
[[ "$*" == *"--project-name kidults-workspace-staging"* ]]
[[ "$*" == *"--branch main"* ]]
`;
fs.writeFileSync(path.join(fakeBin, 'npx'), fakeNpx, {mode: 0o755});

function run(script, args, {scenario, cwd = repoRoot, env = {}}) {
  const stateDir = fs.mkdtempSync(path.join(tempRoot, `${scenario}-`));
  const result = spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_CF_SCENARIO: scenario,
      FAKE_CF_STATE_DIR: stateDir,
      CLOUDFLARE_API_TOKEN: 'test-token-never-real',
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
      EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      ...env,
    },
  });
  return {result, stateDir};
}

{
  const receiptDir = path.join(tempRoot, 'readonly-pass-receipt');
  const {result} = run(scripts.readonly, [], {
    scenario: 'readonly-pass',
    env: {RECEIPT_DIR: receiptDir, GITHUB_SHA: '1111111111111111111111111111111111111111'},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
  assert.equal(receipt.state, 'COMPLETE_VERIFIED');
  assert.equal(receipt.settings_mutated, false);
  assert.equal(receipt.visible_preview_count, 0);
}

{
  const receiptDir = path.join(tempRoot, 'readonly-fail-receipt');
  const {result} = run(scripts.readonly, [], {
    scenario: 'readonly-fail-preview',
    env: {RECEIPT_DIR: receiptDir, GITHUB_SHA: '1111111111111111111111111111111111111111'},
  });
  assert.notEqual(result.status, 0, 'unauthorized Preview must fail closed');
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.visible_preview_count, 1);
  assert.equal(receipt.latest_deployment_governed, false);
}

{
  const receiptDir = path.join(tempRoot, 'contain-receipt');
  const {result} = run(scripts.contain, ['--execute'], {
    scenario: 'contain-pass',
    env: {RECEIPT_DIR: receiptDir, CONTROL_REASON: 'test containment'},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
  assert.equal(receipt.state, 'COMPLETE_VERIFIED');
  assert.equal(receipt.deployment_created, false);
  assert.equal(receipt.deployment_deleted, false);
  assert.deepEqual(receipt.deployment_ids_preserved, ['prod-old']);
}

{
  const receiptDir = path.join(tempRoot, 'cleanup-receipt');
  const {result, stateDir} = run(scripts.cleanup, ['--delete-preview'], {
    scenario: 'cleanup-pass',
    env: {RECEIPT_DIR: receiptDir, CONTROL_REASON: 'test preview cleanup'},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
  assert.equal(receipt.state, 'COMPLETE_VERIFIED');
  assert.equal(receipt.deleted_preview_count, 1);
  assert.deepEqual(receipt.production_ids_preserved, ['prod-old']);
  const deleted = fs.readFileSync(path.join(stateDir, 'deleted.log'), 'utf8');
  assert.match(deleted, /preview-1/);
  assert.doesNotMatch(deleted, /prod-old/);
}

{
  const deployRepo = path.join(tempRoot, 'deploy-repo');
  fs.mkdirSync(path.join(deployRepo, 'apps/kidults-enterprise-staging/public'), {recursive: true});
  fs.writeFileSync(path.join(deployRepo, 'apps/kidults-enterprise-staging/public/index.html'), '<!doctype html><title>KIDULTS</title>');
  for (const args of [['init'], ['config','user.email','qa@example.invalid'], ['config','user.name','KIDULTS QA'], ['add','.'], ['commit','-m','fixture']]) {
    const git = spawnSync('git', args, {cwd: deployRepo, encoding:'utf8'});
    assert.equal(git.status, 0, git.stderr);
  }
  const sha = spawnSync('git', ['rev-parse','HEAD'], {cwd: deployRepo, encoding:'utf8'}).stdout.trim();
  const reason = 'bounded mock deployment';
  const runId = '123456';
  const attempt = '1';
  const message = `[KIDULTS-GOVERNED-STAGING] repository=johnkim9524-collab/kaios_enterprise_repo source_sha=${sha} run=${runId} attempt=${attempt} reason=${reason}`;
  const receiptDir = path.join(tempRoot, 'deploy-receipt');
  const {result, stateDir} = run(scripts.deploy, [], {
    scenario: 'deploy-pass',
    cwd: deployRepo,
    env: {
      RECEIPT_DIR: receiptDir,
      SOURCE_DIR: 'apps/kidults-enterprise-staging/public',
      SOURCE_SHA: sha,
      DEPLOY_REASON: reason,
      GITHUB_RUN_ID: runId,
      GITHUB_RUN_ATTEMPT: attempt,
      GITHUB_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      FAKE_SOURCE_SHA: sha,
      FAKE_DEPLOY_MESSAGE: message,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
  assert.equal(receipt.state, 'COMPLETE_VERIFIED');
  assert.equal(receipt.source_sha, sha);
  assert.equal(receipt.deployment.id, 'governed-new');
  assert.equal(receipt.deployment.trigger_type, 'ad_hoc');
  const npxLog = fs.readFileSync(path.join(stateDir, 'npx.log'), 'utf8');
  assert.match(npxLog, /--commit-hash/);
  assert.match(npxLog, /--branch main/);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_STAGING_GOVERNANCE_EXECUTABLE_TEST_V1',
  result: 'PASS',
  cases: 5,
  readonly_pass: true,
  unauthorized_preview_rejected: true,
  containment_preserves_deployments: true,
  cleanup_deletes_preview_only: true,
  governed_exact_sha_deploy: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
