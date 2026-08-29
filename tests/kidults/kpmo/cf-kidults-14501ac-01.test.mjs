#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifestPath = 'coordination/kidults/runtime/cf-kidults-14501ac-01.json';
const workflowPath = '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml';
const executorPath = 'scripts/ops/cloudflare-one-shot-cf-kidults-14501ac-01.py';

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const workflow = fs.readFileSync(workflowPath, 'utf8');
const executor = fs.readFileSync(executorPath, 'utf8');

assert.equal(manifest.id, 'CF-KIDULTS-14501AC-01');
assert.equal(manifest.authorization_issue, 1583);
assert.equal(manifest.authorization_state_required, 'AUTHORIZED');
assert.equal(manifest.repository, 'johnkim9524-collab/kaios_enterprise_repo');
assert.equal(manifest.project, 'kidults-workspace-staging');
assert.equal(manifest.target_sha, '14501ac022bdd7c918924a207f257b047b1ba970');
assert.equal(manifest.max_materialized_preview_deletions, 588);
assert.equal(manifest.one_time, true);
assert.equal(manifest.nonce, 'e7563f7a-90b2-448b-9488-935d56ff9158');
assert.equal(manifest.public_release, 'HOLD');
assert.equal(manifest.production, 'HOLD');
assert.equal(manifest.g5, 'HOLD');
assert.ok(manifest.authorized_operations.includes('DELETE_MATERIALIZED_PREVIEW_ONLY_MAX_588'));
assert.ok(manifest.authorized_operations.includes('PRESERVE_ALL_EXISTING_PRODUCTION_DEPLOYMENT_IDS_AND_HISTORY'));
assert.ok(manifest.forbidden_operations.includes('DELETE_PRODUCTION_DEPLOYMENT'));
assert.ok(manifest.forbidden_operations.includes('ENABLE_AUTOMATIC_GIT_DEPLOYMENTS'));
assert.ok(manifest.abort_on.includes('HTTP_404'));
assert.ok(manifest.abort_on.includes('HTTP_5XX'));

assert.match(workflow, /authorization_issue:\s*1583/);
assert.match(workflow, /CF-KIDULTS-14501AC-01/);
assert.match(workflow, /CONSUMED_PENDING_EXECUTION/);
assert.match(workflow, /environment:\s*kidults-cloudflare-staging-deploy/);
assert.match(workflow, /needs:\s*authorize-and-consume/);
assert.match(workflow, /Execute one-shot Preview retirement and governed STAGING/);
assert.match(workflow, /ref:\s*14501ac022bdd7c918924a207f257b047b1ba970/);
assert.match(workflow, /path:\s*approved-source/);
assert.match(workflow, /if:\s*always\(\)/);

assert.match(executor, /MAX_PREVIEW_DELETIONS = 588/);
assert.match(executor, /item\.get\("environment"\) == "preview" and is_materialized\(item\)/);
assert.match(executor, /query=\{"force": "true"\}/);
assert.match(executor, /after_cleanup_production != initial_production/);
assert.match(executor, /set\(initial_production\)\.issubset\(set\(final_production\)\)/);
assert.match(executor, /production_deployments_enabled/);
assert.match(executor, /preview_deployment_setting/);
assert.match(executor, /HTTP_401/);
assert.match(executor, /HTTP_403/);
assert.match(executor, /HTTP_404/);
assert.match(executor, /HTTP_5XX/);
assert.match(executor, /TIMEOUT_OR_TRANSPORT/);
assert.match(executor, /wrangler@4\.127\.1/);
assert.match(executor, /source_sha=\{TARGET_SHA\}/);
assert.equal(executor.includes('DELETE_PAGES_PROJECT'), false);
assert.equal(executor.includes('production_deployments_enabled = true'), false);
assert.equal(executor.includes('preview_deployment_setting = "all"'), false);

console.log(JSON.stringify({
  suite: 'CF_KIDULTS_14501AC_01',
  result: 'PASS',
  explicit_source_bound_approval: true,
  one_time_consumption_before_environment: true,
  preview_only_max_588: true,
  production_history_preserved: true,
  exact_target_sha_deploy: true,
  provider_errors_fail_closed: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
