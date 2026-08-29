#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts/ops/cloudflare-pages-boundary-readonly.sh');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cf-readonly-lineage-'));
process.on('exit', () => fs.rmSync(tempRoot, {recursive: true, force: true}));
const fakeBin = path.join(tempRoot, 'bin');
fs.mkdirSync(fakeBin, {recursive: true});

const fakeCurl = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const url = args.find((value) => value.startsWith('https://')) || '';
const scenario = process.env.FAKE_CF_SCENARIO;
const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const targetSha = '14501ac022bdd7c918924a207f257b047b1ba970';
const project = {
  success:true,
  result:{
    id:'project-id',name:'kidults-workspace-staging',production_branch:'main',modified_on:null,
    source:{type:'github',config:{
      owner:'johnkim9524-collab',repo_name:'kaios_enterprise_repo',deployments_enabled:true,
      production_deployments_enabled:false,preview_deployment_setting:'none',
      preview_branch_includes:['*'],preview_branch_excludes:[]
    }}
  }
};
const deployment = ({id,message,sha=targetSha,created='2026-08-29T16:35:16Z',skipped=false,trigger='ad_hoc',status='success'}) => ({
  id,environment:'production',url:'https://' + id + '.kidults-workspace-staging.pages.dev',aliases:[],created_on:created,
  is_skipped:skipped,skip_reason:skipped?'production_deployments_disabled':null,
  latest_stage:{status},deployment_trigger:{type:trigger,metadata:{branch:'main',commit_hash:sha,commit_message:message}}
});
let message;
if (scenario === 'approval-bound') {
  message='[KIDULTS-GOVERNED-STAGING] approval_id=CF-KIDULTS-14501AC-01 repository=' + repository + ' source_sha=' + targetSha + ' run=33262992819 attempt=1';
} else if (scenario === 'legacy') {
  message='[KIDULTS-GOVERNED-STAGING] repository=' + repository + ' source_sha=' + targetSha + ' run=1 attempt=1 reason=test';
} else if (scenario === 'malformed') {
  message='[KIDULTS-GOVERNED-STAGING] approval_id=CF-KIDULTS-14501AC-01 repository=other/repo source_sha=' + targetSha + ' run=1 attempt=1';
} else {
  process.exit(71);
}
const skipped = deployment({
  id:'skipped-current-main',
  message:'ambient',
  sha:'31602fcb127c962ff69f1d35eb3623c871a67efb',
  created:'2026-08-29T16:39:46Z',
  skipped:true,
  trigger:'github:push',
  status:'idle'
});
const governed = deployment({id:'governed-target',message});
const response = url.includes('/deployments')
  ? {success:true,result:[skipped,governed],result_info:{page:1,per_page:25,total_pages:1}}
  : project;
process.stdout.write(JSON.stringify(response));
`;
fs.writeFileSync(path.join(fakeBin, 'curl'), fakeCurl, {mode:0o755});

function runCase(scenario) {
  const receiptDir = path.join(tempRoot, scenario);
  const result = spawnSync('bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_CF_SCENARIO: scenario,
      CLOUDFLARE_API_TOKEN: 'test-token-never-real',
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      CLOUDFLARE_PAGES_PROJECT_NAME: 'kidults-workspace-staging',
      EXPECTED_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
      GITHUB_SHA: '31602fcb127c962ff69f1d35eb3623c871a67efb',
      RECEIPT_DIR: receiptDir,
    },
  });
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, 'final.json'), 'utf8'));
  return {result, receipt};
}

const approvalBound = runCase('approval-bound');
assert.equal(approvalBound.result.status, 0, approvalBound.result.stderr || approvalBound.result.stdout);
assert.equal(approvalBound.receipt.state, 'COMPLETE_VERIFIED');
assert.equal(approvalBound.receipt.settings_pass, true);
assert.equal(approvalBound.receipt.visible_preview_count, 0);
assert.equal(approvalBound.receipt.latest_deployment_governed, true);
assert.equal(approvalBound.receipt.latest_deployment_lineage_format, 'APPROVAL_BOUND_V1');
assert.equal(approvalBound.receipt.latest_deployment.commit_hash, '14501ac022bdd7c918924a207f257b047b1ba970');
assert.equal(approvalBound.receipt.latest_attempt.is_skipped, true);
assert.equal(approvalBound.receipt.latest_deployment_matches_current_main, false);
assert.equal(approvalBound.receipt.current_main_match_is_informational, true);

const legacy = runCase('legacy');
assert.equal(legacy.result.status, 0, legacy.result.stderr || legacy.result.stdout);
assert.equal(legacy.receipt.state, 'COMPLETE_VERIFIED');
assert.equal(legacy.receipt.latest_deployment_governed, true);
assert.equal(legacy.receipt.latest_deployment_lineage_format, 'LEGACY_GOVERNED_V1');

const malformed = runCase('malformed');
assert.notEqual(malformed.result.status, 0);
assert.equal(malformed.receipt.state, 'VERIFIED_FAIL');
assert.equal(malformed.receipt.settings_pass, true);
assert.equal(malformed.receipt.visible_preview_count, 0);
assert.equal(malformed.receipt.latest_deployment_governed, false);
assert.equal(malformed.receipt.latest_deployment_lineage_format, 'UNRECOGNIZED');

console.log(JSON.stringify({
  suite:'KIDULTS_CLOUDFLARE_PAGES_READONLY_GOVERNED_LINEAGE_V1',
  result:'PASS',
  approval_bound_lineage_accepted:true,
  legacy_lineage_retained:true,
  wrong_repository_rejected:true,
  skipped_current_main_informational:true,
  remote_mutation:false,
  public_release:'HOLD',
  production:'HOLD',
  g5:'HOLD'
}, null, 2));
