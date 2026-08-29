#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const approvalPath = 'coordination/kidults/runtime/cf-kidults-14501ac-01-approval.json';
const completionPath = 'coordination/kidults/runtime/cloudflare-pages-one-shot-completion-v1.json';
const scriptPath = 'scripts/ops/cloudflare-pages-cf-kidults-14501ac-01.sh';
const workflowPath = '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml';
const retirementGuardPath = '.github/workflows/kpmo-cf-kidults-14501ac-01-preflight.yml';
for (const path of [approvalPath, completionPath, scriptPath, workflowPath, retirementGuardPath]) {
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
}

const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
assert.equal(approval.state, 'CONSUMED_COMPLETED');
assert.equal(approval.approval_id, 'CF-KIDULTS-14501AC-01');
assert.equal(approval.repository_role, 'AUDIT_TOMBSTONE_NOT_AUTHORIZATION');
assert.equal(approval.authoritative_external_receipt.issue, 1583);
assert.equal(approval.authoritative_external_receipt.state, 'CLOSED_COMPLETED');
assert.equal(approval.authoritative_external_receipt.replay_authorized, false);
assert.equal(approval.original_authorization.one_time, true);
assert.equal(approval.original_authorization.expired, true);
assert.equal(approval.original_authorization.target_sha, '14501ac022bdd7c918924a207f257b047b1ba970');
assert.equal(approval.original_authorization.max_materialized_preview_deletions, 588);
assert.equal(approval.execution.run_id, 33262992819);
assert.equal(approval.execution.run_attempt, 1);
assert.equal(approval.execution.artifact_id, 9717897493);
assert.equal(approval.execution.artifact_digest, 'sha256:5c642753fad37bebd70555938e2a0e6daed95c88d9d5fb4e6bc6cf49cb33e309');
assert.equal(approval.execution.deleted_materialized_preview_count, 588);
assert.equal(approval.execution.remaining_materialized_preview_count, 0);
assert.equal(approval.execution.preexisting_production_ids_preserved, 124);
assert.equal(approval.execution.governed_staging_deployment_id, 'dc6654a1-ee61-4762-92a1-b3f25e064e91');
assert.equal(approval.execution.settings_mutated, false);
assert.equal(approval.execution.production_deployment_deleted, false);
assert.equal(approval.execution.pages_project_deleted, false);
for (const key of [
  'executable',
  'provider_credentials_may_resolve',
  'provider_calls_allowed',
  'preview_deletion_allowed',
  'staging_deployment_allowed',
  'replay_allowed',
  'rerun_allowed',
  'new_run_attempt_one_allowed'
]) {
  assert.equal(approval.execution_lane[key], false, `${key} must remain false`);
}
assert.equal(approval.execution_lane.state, 'RETIRED');
assert.equal(approval.execution_lane.fresh_operation_specific_approval_required, true);
assert.equal(approval.truth_boundary.public_release, 'HOLD');
assert.equal(approval.truth_boundary.production, 'HOLD');
assert.equal(approval.truth_boundary.g5, 'HOLD');

const completion = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
assert.equal(completion.state, 'COMPLETE_VERIFIED');
assert.equal(completion.approval_id, approval.approval_id);
assert.equal(completion.approval_consumed, true);
assert.equal(completion.workflow_run_id, approval.execution.run_id);
assert.equal(completion.artifact_id, approval.execution.artifact_id);
assert.equal(completion.artifact_digest, approval.execution.artifact_digest);
assert.equal(completion.preview_retirement.initial_materialized_count, 588);
assert.equal(completion.preview_retirement.deleted_materialized_count, 588);
assert.equal(completion.preview_retirement.remaining_materialized_count, 0);
assert.equal(completion.production_history.initial_count, 124);
assert.equal(completion.production_history.all_preexisting_ids_preserved, true);
assert.equal(completion.governed_staging_deployment.id, approval.execution.governed_staging_deployment_id);

const script = fs.readFileSync(scriptPath, 'utf8');
assert.match(script, /CONSUMED_COMPLETED/);
assert.match(script, /AUDIT_TOMBSTONE_NOT_AUTHORIZATION/);
assert.match(script, /provider_calls_allowed == false/);
assert.match(script, /preview_deletion_allowed == false/);
assert.match(script, /staging_deployment_allowed == false/);
assert.match(script, /exit 78/);
for (const prohibited of [
  'CLOUDFLARE_API_TOKEN',
  'wrangler',
  'curl ',
  '--request DELETE',
  '--url-query "force=true"',
  'pages deploy'
]) {
  assert.equal(script.includes(prohibited), false, `retired script contains prohibited token: ${prohibited}`);
}
const scriptRun = spawnSync('bash', [scriptPath], {encoding: 'utf8'});
assert.equal(scriptRun.status, 78, scriptRun.stderr || scriptRun.stdout);
assert.match(scriptRun.stdout, /consumed, completed and permanently retired/);
assert.match(scriptRun.stdout, /No provider credential resolution, provider call, deletion, deployment/);

const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /workflows: \["KPMO CF-KIDULTS-14501AC-01 Retirement Guard"\]/);
assert.match(workflow, /if: \$\{\{ false \}\}/);
assert.match(workflow, /environment: kidults-cloudflare-staging-deploy/);
assert.match(workflow, /Verify live main before provider credential resolution/);
assert.match(workflow, /Execute one-shot Preview retirement and governed STAGING/);
assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
assert.equal(workflow.includes('npx --yes wrangler'), false);
assert.equal(workflow.includes('--request DELETE'), false);
assert.equal(workflow.includes('workflow_dispatch:'), false);

const retirementGuard = fs.readFileSync(retirementGuardPath, 'utf8');
assert.match(retirementGuard, /^name: KPMO CF-KIDULTS-14501AC-01 Retirement Guard/m);
assert.match(retirementGuard, /validate-consumed-tombstone/);
assert.match(retirementGuard, /Prove consumed approval cannot authorize replay/);
assert.match(retirementGuard, /node tests\/kidults\/kpmo\/cf-kidults-14501ac-01-approval\.test\.mjs/);
assert.equal(retirementGuard.includes('secrets.'), false);

console.log(JSON.stringify({
  suite: 'CF_KIDULTS_14501AC_01_CONSUMED_TOMBSTONE',
  result: 'PASS',
  provider_result_preserved: true,
  approval_state: 'CONSUMED_COMPLETED',
  repository_artifact_authorizes_execution: false,
  execution_lane_retired: true,
  secret_resolution_runtime_reachable: false,
  provider_calls_runtime_reachable: false,
  replay_runtime_reachable: false,
  generic_independent_atomic_approval_control: 'OPEN_ISSUE_1576',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
