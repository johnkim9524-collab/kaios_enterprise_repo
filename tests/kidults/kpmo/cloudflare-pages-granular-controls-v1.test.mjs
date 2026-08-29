#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const readonlyScript = 'scripts/ops/cloudflare-pages-boundary-readonly.sh';
const containScript = fs.readFileSync('scripts/ops/cloudflare-pages-auto-deployment-containment.sh', 'utf8');
const cleanupScript = fs.readFileSync('scripts/ops/cloudflare-pages-preview-cleanup.sh', 'utf8');
const deployScript = fs.readFileSync('scripts/ops/cloudflare-pages-governed-staging-deploy.sh', 'utf8');

assert.equal(containScript.includes('.config.deployments_enabled = false'), false);
assert.equal(containScript.includes('.config.preview_branch_includes = []'), false);
assert.equal(containScript.includes('.config.preview_branch_excludes = []'), false);
assert.equal(deployScript.includes('source.config.deployments_enabled'), false);
assert.equal(deployScript.includes('preview_branch_includes'), false);
assert.equal(deployScript.includes('preview_branch_excludes'), false);
assert.match(cleanupScript, /DELETE_CONCURRENCY="\$\{DELETE_CONCURRENCY:-4\}"/);
assert.match(cleanupScript, /DELETE_CONCURRENCY must be an integer from 1 to 8/);
assert.match(cleanupScript, /deletion_success_uses_post_readback_absence:true/);
assert.match(cleanupScript, /xargs -r -n 1 -P "\$DELETE_CONCURRENCY"/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-granular-'));
process.on('exit', () => fs.rmSync(temp, {recursive: true, force: true}));
const fakeBin = path.join(temp, 'bin');
fs.mkdirSync(fakeBin, {recursive: true});
const currentSha = '1111111111111111111111111111111111111111';
const fakeCurl = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args.find((value) => value.startsWith('https://')) || '';
const project = {success:true,result:{
  id:'project-id',name:'kidults-workspace-staging',production_branch:'main',modified_on:null,
  source:{type:'github',config:{
    owner:'johnkim9524-collab',repo_name:'kaios_enterprise_repo',
    deployments_enabled:true,
    production_deployments_enabled:false,
    preview_deployment_setting:'none',
    preview_branch_includes:['*'],preview_branch_excludes:[]
  }}
}};
const skippedProduction = {
  id:'skipped-production',environment:'production',url:'https://skipped.kidults-workspace-staging.pages.dev',aliases:[],created_on:'2026-08-29T00:03:00Z',
  is_skipped:true,skip_reason:'production_deployments_disabled',latest_stage:{status:'idle'},
  deployment_trigger:{type:'github:push',metadata:{branch:'main',commit_hash:'${currentSha}',commit_message:'current main skipped'}}
};
const skippedPreview = {
  id:'skipped-preview',environment:'preview',url:'https://skipped-preview.kidults-workspace-staging.pages.dev',aliases:[],created_on:'2026-08-29T00:02:00Z',
  is_skipped:true,skip_reason:'preview_deployments_disabled',latest_stage:{status:'idle'},
  deployment_trigger:{type:'github:push',metadata:{branch:'feature/test',commit_hash:'2222222222222222222222222222222222222222',commit_message:'preview skipped'}}
};
const governed = {
  id:'governed-production',environment:'production',url:'https://governed.kidults-workspace-staging.pages.dev',aliases:[],created_on:'2026-08-29T00:01:00Z',
  is_skipped:false,skip_reason:null,latest_stage:{status:'success'},
  deployment_trigger:{type:'ad_hoc',metadata:{branch:'main',commit_hash:'3333333333333333333333333333333333333333',commit_message:'[KIDULTS-GOVERNED-STAGING] repository=johnkim9524-collab/kaios_enterprise_repo source_sha=3333333333333333333333333333333333333333 run=1 attempt=1 reason=test'}}
};
if (!url.includes('/deployments')) process.stdout.write(JSON.stringify(project));
else process.stdout.write(JSON.stringify({success:true,result:[skippedProduction,skippedPreview,governed],result_info:{page:1,per_page:25,count:3,total_count:3,total_pages:1}}));
`;
fs.writeFileSync(path.join(fakeBin, 'curl'), fakeCurl, {mode:0o755});
const receiptDir = path.join(temp, 'receipt');
const result = spawnSync('bash', [readonlyScript], {
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
    GITHUB_SHA: currentSha,
  },
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json')));
assert.equal(receipt.state, 'COMPLETE_VERIFIED');
assert.equal(receipt.automatic_deployment_containment_pass, true);
assert.equal(receipt.current_main_auto_attempt_skipped, true);
assert.equal(receipt.project_readback.legacy_deployments_enabled, true);
assert.equal(receipt.project_readback.legacy_deployments_enabled_authoritative, false);
assert.equal(receipt.preview_branch_rules_authoritative, false);
assert.equal(receipt.preview_branch_rules_inert, true);
assert.equal(receipt.visible_preview_count, 0);
assert.equal(receipt.skipped_preview_attempt_count, 1);
assert.equal(receipt.latest_deployment_governed, true);
assert.equal(receipt.latest_attempt.id, 'skipped-production');
assert.equal(receipt.latest_deployment.id, 'governed-production');

console.log(JSON.stringify({
  suite:'KIDULTS_CLOUDFLARE_PAGES_GRANULAR_CONTROLS_V1',
  result:'PASS',
  deprecated_legacy_flag_informational:true,
  non_custom_preview_rules_inert:true,
  current_main_auto_attempt_skipped:true,
  skipped_attempt_not_materialized:true,
  bounded_preview_retirement:true,
  public_release:'HOLD',production:'HOLD',g5:'HOLD'
}, null, 2));
