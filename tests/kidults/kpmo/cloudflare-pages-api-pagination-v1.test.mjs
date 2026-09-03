#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const files = {
  readonly: 'scripts/ops/cloudflare-pages-boundary-readonly.sh',
  cleanup: 'scripts/ops/cloudflare-pages-preview-cleanup.sh',
  contain: 'scripts/ops/cloudflare-pages-auto-deployment-containment.sh',
  deploy: 'scripts/ops/cloudflare-pages-governed-staging-deploy.sh',
};
const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, fs.readFileSync(value, 'utf8')]));
for (const [key, value] of Object.entries(source)) {
  assert.equal(value.includes('per_page=100'), false, `${key} retained invalid per_page=100`);
}
for (const key of ['readonly', 'cleanup', 'contain']) {
  assert.match(source[key], /PAGE_SIZE="\$\{PAGE_SIZE:-25\}"/);
  assert.match(source[key], /PAGE_SIZE > 25/);
  assert.match(source[key], /per_page=\$\{PAGE_SIZE\}/);
}
assert.equal((source.deploy.match(/per_page=25&page=1/g) || []).length, 2);
for (const marker of ['is_skipped', 'skip_reason', 'materialized', 'latest-attempt.json', 'skipped_preview_attempt_count', 'skipped_attempt_count']) {
  assert.equal(source.readonly.includes(marker), true, `readonly marker missing: ${marker}`);
}
assert.equal(source.cleanup.includes('select(.environment == "preview" and .materialized == true) | .id'), true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-pagination-'));
process.on('exit', () => fs.rmSync(temp, {recursive: true, force: true}));
const fakeBin = path.join(temp, 'bin');
fs.mkdirSync(fakeBin, {recursive: true});
const fakeCurl = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args.find((value) => value.startsWith('https://')) || '';
const perPage = Number((url.match(/[?&]per_page=(\d+)/) || [,'25'])[1]);
if (perPage > 25) {
  process.stdout.write(JSON.stringify({success:false,errors:[{code:8000024,message:'Invalid list options provided.'}],result:null}));
  process.exit(22);
}
if (process.env.FORCE_DEPLOYMENT_READBACK_FAILURE === '1' && url.includes('/deployments')) {
  process.stdout.write(JSON.stringify({success:false,errors:[{code:9109,message:'synthetic readback failure'}],result:null}));
  process.exit(22);
}
const project = {success:true,result:{id:'project-id',name:'kidults-workspace-staging',production_branch:'main',modified_on:'2026-08-29T00:00:00Z',source:{type:'github',config:{owner:'johnkim9524-collab',repo_name:'kaios_enterprise_repo',deployments_enabled:false,production_deployments_enabled:false,preview_deployment_setting:'none',preview_branch_includes:[],preview_branch_excludes:[]}}}};
const skippedPreview = {id:'skipped-preview',environment:'preview',url:null,aliases:[],created_on:'2026-08-29T00:03:00Z',is_skipped:true,skip_reason:'preview_deployments_disabled',latest_stage:{status:'idle'},deployment_trigger:{type:'github:push',metadata:{branch:'feature/test',commit_hash:'2222222222222222222222222222222222222222',commit_message:'skipped preview'}}};
const skippedProduction = {id:'skipped-production',environment:'production',url:null,aliases:[],created_on:'2026-08-29T00:02:00Z',is_skipped:true,skip_reason:'production_deployments_disabled',latest_stage:{status:'idle'},deployment_trigger:{type:'github:push',metadata:{branch:'main',commit_hash:'3333333333333333333333333333333333333333',commit_message:'skipped production'}}};
const governed = {id:'governed-production',environment:'production',url:'https://governed.kidults-workspace-staging.pages.dev',aliases:[],created_on:'2026-08-29T00:01:00Z',is_skipped:false,latest_stage:{status:'success'},deployment_trigger:{type:'ad_hoc',metadata:{branch:'main',commit_hash:'1111111111111111111111111111111111111111',commit_message:'[KIDULTS-GOVERNED-STAGING] repository=johnkim9524-collab/kaios_enterprise_repo source_sha=1111111111111111111111111111111111111111 run=1 attempt=1 reason=test'}}};
if (!url.includes('/deployments')) process.stdout.write(JSON.stringify(project));
else {
  const page = Number((url.match(/[?&]page=(\d+)/) || [,'1'])[1]);
  const result = page === 1 ? [skippedPreview, skippedProduction] : [governed];
  process.stdout.write(JSON.stringify({success:true,result,result_info:{page,per_page:25,count:result.length,total_count:3,total_pages:2}}));
}
`;
fs.writeFileSync(path.join(fakeBin, 'curl'), fakeCurl, {mode:0o755});
const receiptDir = path.join(temp, 'receipt');
const run = spawnSync('bash', [files.readonly], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    CLOUDFLARE_API_TOKEN: 'test-token-never-real',
    CLOUDFLARE_ACCOUNT_ID: '235eaa51d04e7f4436a9faa507a04f9d',
    CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
    EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
    RECEIPT_DIR: receiptDir,
    GITHUB_SHA: '1111111111111111111111111111111111111111',
  },
});
assert.notEqual(run.status, 0, 'any skipped deployment attempt must fail closed');
const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
assert.equal(receipt.state, 'VERIFIED_FAIL');
assert.equal(receipt.reason_code, 'SKIPPED_DEPLOYMENT_ATTEMPTS_PRESENT');
assert.equal(receipt.capacity_state, 'RESIDUAL_RED');
assert.equal(receipt.promotion_eligible, false);
assert.equal(receipt.visible_preview_count, 0);
assert.equal(receipt.skipped_preview_attempt_count, 1);
assert.equal(receipt.skipped_attempt_count, 2);
assert.equal(receipt.deployment_inventory_count, 3);
assert.equal(receipt.inventory_capacity, 2500);
assert.equal(receipt.inventory_capacity_remaining, 2497);
assert.equal(receipt.latest_deployment_governed, true);
assert.equal(receipt.latest_attempt.id, 'skipped-preview');
assert.equal(receipt.latest_deployment.id, 'governed-production');
assert.equal(receipt.settings_mutated, false);

const capacityReceiptDir = path.join(temp, 'capacity-receipt');
const capacityRun = spawnSync('bash', [files.readonly], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    CLOUDFLARE_API_TOKEN: 'test-token-never-real',
    CLOUDFLARE_ACCOUNT_ID: '235eaa51d04e7f4436a9faa507a04f9d',
    CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
    EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
    RECEIPT_DIR: capacityReceiptDir,
    GITHUB_SHA: '1111111111111111111111111111111111111111',
    MAX_PAGES: '1',
  },
});
assert.equal(capacityRun.status, 68, capacityRun.stderr || capacityRun.stdout);
const capacityReceipt = JSON.parse(fs.readFileSync(path.join(capacityReceiptDir, 'final.json')));
assert.equal(capacityReceipt.state, 'BLOCKED_INVENTORY_CAPACITY');
assert.equal(capacityReceipt.reason_code, 'DEPLOYMENT_INVENTORY_PAGE_LIMIT');
assert.equal(capacityReceipt.deployment_inventory_complete, false);
assert.equal(capacityReceipt.cloudflare_api_called, true);
assert.equal(capacityReceipt.capacity_state, 'EXHAUSTED');
assert.equal(capacityReceipt.promotion_eligible, false);

const readbackReceiptDir = path.join(temp, 'readback-receipt');
const readbackRun = spawnSync('bash', [files.readonly], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    CLOUDFLARE_API_TOKEN: 'test-token-never-real',
    CLOUDFLARE_ACCOUNT_ID: '235eaa51d04e7f4436a9faa507a04f9d',
    CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
    EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
    RECEIPT_DIR: readbackReceiptDir,
    GITHUB_SHA: '1111111111111111111111111111111111111111',
    FORCE_DEPLOYMENT_READBACK_FAILURE: '1',
  },
});
assert.equal(readbackRun.status, 69, readbackRun.stderr || readbackRun.stdout);
const readbackReceipt = JSON.parse(fs.readFileSync(path.join(readbackReceiptDir, 'final.json')));
assert.equal(readbackReceipt.state, 'VERIFIED_FAIL');
assert.equal(readbackReceipt.reason_code, 'DEPLOYMENT_INVENTORY_READBACK_FAILED');
assert.equal(readbackReceipt.deployment_inventory_complete, false);
assert.equal(readbackReceipt.capacity_state, 'READBACK_ERROR');
assert.equal(readbackReceipt.promotion_eligible, false);

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_API_PAGINATION_V1',
  result: 'PASS',
  invalid_per_page_100_rejected: true,
  bounded_page_size_25: true,
  skipped_preview_not_materialized: true,
  all_skipped_attempts_residual_fail_closed: true,
  inventory_capacity_exhaustion_durable_red: true,
  inventory_readback_failure_durable_red: true,
  latest_materialized_governed_selection: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
