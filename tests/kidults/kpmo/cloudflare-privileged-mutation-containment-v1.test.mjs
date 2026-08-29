#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const emergencyPath = '.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml';
const deployPath = '.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml';
const containmentPath = 'coordination/kidults/runtime/cloudflare-privileged-mutation-containment-v1.json';
for (const path of [emergencyPath, deployPath, containmentPath]) {
  assert.equal(fs.existsSync(path), true, `missing ${path}`);
}

const emergency = fs.readFileSync(emergencyPath, 'utf8');
const deploy = fs.readFileSync(deployPath, 'utf8');
const containment = JSON.parse(fs.readFileSync(containmentPath, 'utf8'));

assert.equal(containment.state, 'FAIL_CLOSED_CONTAINED');
assert.equal(containment.issue, 1576);
assert.equal(containment.repository, 'johnkim9524-collab/kaios_enterprise_repo');
assert.equal(containment.project, 'kidults-workspace-staging');
assert.equal(containment.root_cause, 'REPOSITORY_OR_WORKFLOW_INPUT_CAN_SELF_ASSERT_EXTERNAL_AUTHORIZATION');
assert.equal(containment.contained_workflows.length, 2);
for (const lane of containment.contained_workflows) {
  assert.equal(lane.state, 'PERMANENTLY_SKIPPED_PENDING_ISSUE_1576');
  assert.equal(lane.provider_secret_resolution_reachable, false);
  assert.equal(lane.provider_mutation_reachable, false);
}
assert.equal(containment.non_authoritative_inputs.includes('TYPED_CONFIRMATION_PHRASE'), true);
assert.equal(containment.non_authoritative_inputs.includes('REPOSITORY_JSON'), true);
assert.equal(containment.re_enable_requirements.includes('ATOMIC_ONE_TIME_CONSUMPTION_BEFORE_PROVIDER_SECRET_RESOLUTION'), true);
assert.equal(containment.re_enable_requirements.includes('SEPARATE_PUBLIC_PRODUCTION_G5_APPROVALS'), true);
assert.equal(containment.preserved_truth.completed_one_shot_run_id, 33262992819);
assert.equal(containment.preserved_truth.materialized_preview_deleted, 588);
assert.equal(containment.preserved_truth.materialized_preview_remaining, 0);
assert.equal(containment.preserved_truth.preexisting_production_ids_preserved, 124);
assert.equal(containment.mutation_by_containment.cloudflare_api_called, false);
assert.equal(containment.mutation_by_containment.credentials_read, false);
assert.equal(containment.release_boundary.public_release, 'HOLD');
assert.equal(containment.release_boundary.platform_production, 'HOLD');
assert.equal(containment.release_boundary.g5, 'HOLD');

assert.match(emergency, /^name: KIDULTS Cloudflare Pages Emergency Control v1/m);
assert.match(emergency, /if: \$\{\{ false \}\}/);
assert.match(emergency, /environment: kidults-cloudflare-staging-deploy/);
assert.match(emergency, /Verify live main before provider credential resolution/);
assert.match(emergency, /Execute approved Cloudflare Pages emergency control/);
assert.match(emergency, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
assert.match(emergency, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
assert.match(emergency, /external_authorization_issue/);
assert.equal(emergency.includes('CONTAIN_KIDULTS_WORKSPACE_STAGING'), false);
assert.equal(emergency.includes('DELETE_PREVIEW_ONLY_KIDULTS_WORKSPACE_STAGING'), false);
assert.equal(emergency.includes('cloudflare-pages-auto-deployment-containment.sh --execute'), false);
assert.equal(emergency.includes('cloudflare-pages-preview-cleanup.sh --delete-preview'), false);
assert.equal(emergency.includes('--request DELETE'), false);
assert.equal(emergency.includes('wrangler'), false);
assert.equal(emergency.includes('exit 78'), true);

assert.match(deploy, /^name: KIDULTS Cloudflare Pages Governed STAGING Deploy v1/m);
assert.equal((deploy.match(/if: \$\{\{ false \}\}/g) || []).length, 2);
assert.match(deploy, /environment: kidults-cloudflare-staging-deploy/);
assert.match(deploy, /Verify live main before provider credential resolution/);
assert.match(deploy, /Execute governed Cloudflare STAGING deployment/);
assert.match(deploy, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
assert.match(deploy, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
assert.match(deploy, /external_authorization_issue/);
assert.equal(deploy.includes('DEPLOY_KIDULTS_WORKSPACE_STAGING'), false);
assert.equal(deploy.includes('cloudflare-pages-governed-staging-deploy.sh'), false);
assert.equal(deploy.includes('npx --yes wrangler'), false);
assert.equal(deploy.includes('--request DELETE'), false);
assert.equal((deploy.match(/exit 78/g) || []).length, 2);

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PRIVILEGED_MUTATION_CONTAINMENT_V1',
  result: 'PASS',
  issue: 1576,
  emergency_lane_fail_closed: true,
  staging_deploy_lane_fail_closed: true,
  typed_phrase_is_authorization: false,
  workflow_input_is_authorization: false,
  repository_json_is_authorization: false,
  provider_secret_resolution_reachable: false,
  provider_mutation_reachable: false,
  generic_external_atomic_authorization_gate: 'REQUIRED_BEFORE_RE_ENABLE',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
