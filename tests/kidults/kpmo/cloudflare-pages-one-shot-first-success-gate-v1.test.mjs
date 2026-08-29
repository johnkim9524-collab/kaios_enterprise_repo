#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml';
const manifestPath = 'coordination/kidults/runtime/cloudflare-pages-one-shot-recovery-v3.json';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.equal(/Merge PR #\d+/.test(workflow), false, 'workflow retained a hardcoded PR identity');
assert.equal(workflow.includes('target_merge_pr'), false, 'workflow retained target_merge_pr coupling');
assert.match(workflow, /jobs:\n  authorize:/);
assert.match(workflow, /needs: authorize/);
assert.match(workflow, /if: needs\.authorize\.outputs\.should_execute == 'true'/);
assert.match(workflow, /environment: kidults-cloudflare-staging-deploy/);
assert.match(workflow, /PRIOR_SUCCESS_COUNT/);
assert.match(workflow, /\.conclusion == "success"/);
assert.match(workflow, /echo "should_execute=false"/);
assert.match(workflow, /echo "should_execute=true"/);
assert.match(workflow, /actions\/workflows\/\$WORKFLOW_FILE\/runs\?event=workflow_run&per_page=30/);
assert.match(workflow, /compare\/\$\{EVENT_HEAD_SHA\}\.\.\.\$\{LIVE_MAIN_SHA\}/);

const authorizeIndex = workflow.indexOf('  authorize:');
const executionIndex = workflow.indexOf('  retire-and-deploy:');
const environmentIndex = workflow.indexOf('environment: kidults-cloudflare-staging-deploy');
assert.ok(authorizeIndex >= 0 && executionIndex > authorizeIndex);
assert.ok(environmentIndex > executionIndex, 'provider environment must not resolve in authorize job');

assert.equal(manifest.id, 'kidults-cloudflare-pages-one-shot-recovery-v3');
assert.equal(manifest.version, '3.1.0');
assert.equal(manifest.state, 'AUTHORIZED_PENDING_EXECUTION');
assert.equal(manifest.execution_gate.execute_until_first_success_after_floor, true);
assert.equal(manifest.execution_gate.retry_after_failure_on_next_successful_main_ci, true);
assert.equal(manifest.execution_gate.hardcoded_pull_request_identity_forbidden, true);
assert.equal(manifest.public_release, 'HOLD');
assert.equal(manifest.production, 'HOLD');
assert.equal(manifest.g5, 'HOLD');

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_ONE_SHOT_FIRST_SUCCESS_GATE_V1',
  result: 'PASS',
  hardcoded_pr_identity_removed: true,
  provider_secrets_resolve_only_after_authorize: true,
  retry_until_first_success: true,
  post_success_provider_resolution_blocked: true,
  protected_main_lineage_required: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
