#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const approvalPath = 'coordination/kidults/runtime/cf-kidults-14501ac-01-approval.json';
const scriptPath = 'scripts/ops/cloudflare-pages-cf-kidults-14501ac-01.sh';
const workflowPath = '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml';
const preflightPath = '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml';
for (const path of [approvalPath, scriptPath, workflowPath, preflightPath]) {
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
}

const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
assert.equal(approval.state, 'PROGRAM_OWNER_EXPLICIT_ONE_SHOT_APPROVAL');
assert.equal(approval.approval_id, 'CF-KIDULTS-14501AC-01');
assert.equal(approval.source_event_id, 'CF-KIDULTS-14501AC-01');
assert.equal(approval.source_text_sha256, 'sha256:69bb0b446992e067269b36beb11f936f52e2a08d104d94d9f9940f2a6c9ad71f');
assert.equal(approval.one_time, true);
assert.equal(approval.target_sha, '14501ac022bdd7c918924a207f257b047b1ba970');
assert.equal(approval.max_materialized_preview_deletions, 588);
assert.equal(approval.authorization.read_only_parity_preflight, true);
assert.equal(approval.authorization.delete_materialized_preview_only, true);
assert.equal(approval.authorization.preserve_all_production_deployments, true);
assert.equal(approval.authorization.governed_staging_deploy_once, true);
assert.equal(approval.authorization.final_read_only_verification, true);
assert.equal(approval.forbidden.enable_automatic_git_deployments, true);
assert.equal(approval.forbidden.delete_production_deployments, true);
assert.equal(approval.forbidden.delete_pages_project, true);
assert.equal(approval.truth_boundary.public_release, 'HOLD');
assert.equal(approval.truth_boundary.production, 'HOLD');
assert.equal(approval.truth_boundary.g5, 'HOLD');
assert.ok(Date.parse(approval.expires_at) > Date.parse(approval.observed_at));

const script = fs.readFileSync(scriptPath, 'utf8');
assert.match(script, /MAX_PREVIEW_DELETIONS=.*588/);
assert.match(script, /select\(\.environment == "preview" and \.materialized == true\)/);
assert.match(script, /--url-query "force=true"/);
assert.match(script, /PRODUCTION_HISTORY_CHANGED_DURING_PREVIEW_CLEANUP/);
assert.match(script, /FINAL_PRODUCTION_HISTORY_MISSING_IDS/);
assert.match(script, /production_deployments_enabled == false/);
assert.match(script, /preview_deployment_setting == "none"/);
assert.match(script, /ONE_TIME_APPROVAL_REPLAY_REFUSED/);
assert.match(script, /PROVIDER_HTTP_401/);
assert.match(script, /PROVIDER_HTTP_403/);
assert.match(script, /PROVIDER_HTTP_404/);
assert.match(script, /PROVIDER_HTTP_5XX/);
assert.match(script, /PROVIDER_TRANSPORT_OR_TIMEOUT/);
assert.equal(script.includes('--request PATCH'), false);
assert.equal(script.includes('api_request DELETE "$API_ROOT"'), false);
assert.equal(script.includes('delete_pages_project'), false);

const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /workflows: \["KPMO CF-KIDULTS-14501AC-01 Preflight"\]/);
assert.match(workflow, /contains\(github\.event\.workflow_run\.head_commit\.message, 'CF-KIDULTS-14501AC-01'\)/);
assert.match(workflow, /environment: kidults-cloudflare-staging-deploy/);
assert.match(workflow, /Verify live main before provider credential resolution/);
assert.match(workflow, /Execute one-shot Preview retirement and governed STAGING/);
assert.match(workflow, /test "\$GITHUB_RUN_ATTEMPT" = "1"/);
assert.match(workflow, /ref: 14501ac022bdd7c918924a207f257b047b1ba970/);
assert.match(workflow, /approval_id=CF-KIDULTS-14501AC-01/);
assert.equal(workflow.includes('workflow_dispatch:'), false);

const preflight = fs.readFileSync(preflightPath, 'utf8');
assert.match(preflight, /pull_request:/);
assert.match(preflight, /push:/);
assert.match(preflight, /node tests\/kidults\/kpmo\/cf-kidults-14501ac-01-approval\.test\.mjs/);
assert.match(preflight, /bash -n scripts\/ops\/cloudflare-pages-cf-kidults-14501ac-01\.sh/);

console.log(JSON.stringify({
  suite: 'CF_KIDULTS_14501AC_01_APPROVAL_AND_EXECUTION_BOUNDARY',
  result: 'PASS',
  explicit_operation_specific_approval: true,
  exact_target_sha: true,
  max_materialized_preview_deletions: 588,
  production_history_preservation: true,
  fail_closed_provider_classes: ['401','403','404','5xx','timeout'],
  one_time_replay_guard: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
