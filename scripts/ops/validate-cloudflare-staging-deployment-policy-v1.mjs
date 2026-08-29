#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const paths = {
  policy: 'coordination/kidults/kpmo/cloudflare-staging-deployment-policy-v1.json',
  boundaryWorkflow: '.github/workflows/kidults-cloudflare-preview-estate-cleanup-v1.yml',
  monitorWorkflow: '.github/workflows/kidults-cloudflare-staging-drift-monitor-v1.yml',
  containmentScript: 'scripts/ops/cloudflare-pages-auto-deployment-containment.sh',
  readbackScript: 'scripts/ops/cloudflare-pages-staging-drift-readback.sh',
};

const base = {
  policy: JSON.parse(fs.readFileSync(paths.policy, 'utf8')),
  boundaryWorkflow: fs.readFileSync(paths.boundaryWorkflow, 'utf8'),
  monitorWorkflow: fs.readFileSync(paths.monitorWorkflow, 'utf8'),
  containmentScript: fs.readFileSync(paths.containmentScript, 'utf8'),
  readbackScript: fs.readFileSync(paths.readbackScript, 'utf8'),
};

function findingsFor(input) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const {policy, boundaryWorkflow, monitorWorkflow, containmentScript, readbackScript} = input;

  require(policy.id === 'kidults-cloudflare-staging-deployment-policy-v1', 'POLICY_ID');
  require(policy.version === '1.0.0', 'POLICY_VERSION');
  require(policy.project === 'kidults-workspace-staging', 'PROJECT_BINDING');
  require(policy.project_disposition === 'RETAIN_AS_CANONICAL_SHARED_PORTAL_STAGING', 'PROJECT_DISPOSITION');
  require(policy.canonical_portal_architecture === 'SHARED_RESPONSIVE_SINGLE_SURFACE', 'PORTAL_ARCHITECTURE');
  require(policy.target_settings?.legacy_deployments_enabled === false, 'LEGACY_AUTO_DEPLOY_TARGET');
  require(policy.target_settings?.production_deployments_enabled === false, 'PRODUCTION_AUTO_DEPLOY_TARGET');
  require(policy.target_settings?.preview_deployment_setting === 'none', 'PREVIEW_SETTING_TARGET');
  require(Array.isArray(policy.target_settings?.preview_branch_includes) && policy.target_settings.preview_branch_includes.length === 0, 'PREVIEW_INCLUDES_TARGET');
  require(Array.isArray(policy.target_settings?.preview_branch_excludes) && policy.target_settings.preview_branch_excludes.length === 0, 'PREVIEW_EXCLUDES_TARGET');
  require(policy.deployment_policy?.git_push_may_deploy === false, 'GIT_PUSH_BOUNDARY');
  require(policy.deployment_policy?.main_merge_may_deploy === false, 'MAIN_MERGE_BOUNDARY');
  require(policy.deployment_policy?.approved_exact_sha_deployment_only === true, 'EXACT_SHA_POLICY');
  require(policy.credential_policy?.read_monitor_credential === 'READ_ONLY', 'READ_ONLY_CREDENTIAL');
  require(policy.credential_policy?.write_credential_may_be_persistent === false, 'NO_PERSISTENT_WRITE_TOKEN');
  require(policy.monitoring_policy?.automatic_mutation_by_monitor === false, 'MONITOR_READ_ONLY_POLICY');
  require(policy.cleanup_policy?.workflow_trigger === 'WORKFLOW_DISPATCH_ONLY', 'MANUAL_CLEANUP_POLICY');
  require(policy.cleanup_policy?.production_history_deletion === false, 'PRODUCTION_HISTORY_POLICY');

  require(/\non:\n\s+workflow_dispatch:/.test(boundaryWorkflow), 'BOUNDARY_WORKFLOW_DISPATCH_MISSING');
  require(!/\non:\n(?:.|\n)*?\n\s+push:/.test(boundaryWorkflow), 'BOUNDARY_WORKFLOW_PUSH_TRIGGER_PRESENT');
  require(!/\non:\n(?:.|\n)*?\n\s+schedule:/.test(boundaryWorkflow), 'BOUNDARY_WORKFLOW_SCHEDULE_TRIGGER_PRESENT');
  require(boundaryWorkflow.includes('disable-auto-deploy'), 'BOUNDARY_EXECUTE_MODE_MISSING');
  require(boundaryWorkflow.includes('DISABLE_KIDULTS_STAGING_AUTO_DEPLOY'), 'BOUNDARY_CONFIRMATION_MISSING');
  require(boundaryWorkflow.includes('CLOUDFLARE_READ_API_TOKEN'), 'BOUNDARY_READ_TOKEN_MISSING');
  require(boundaryWorkflow.includes('CLOUDFLARE_PAGES_EDIT_TOKEN'), 'BOUNDARY_EDIT_TOKEN_MISSING');
  require(boundaryWorkflow.includes('production_deployments_enabled == false'), 'BOUNDARY_PRODUCTION_READBACK_MISSING');
  require(boundaryWorkflow.includes('preview_deployment_setting == "none"'), 'BOUNDARY_PREVIEW_READBACK_MISSING');
  require(boundaryWorkflow.includes('production_history_preserved == true'), 'BOUNDARY_HISTORY_PRESERVATION_MISSING');

  require(/\non:\n\s+workflow_dispatch:\n\s+schedule:/.test(monitorWorkflow), 'MONITOR_TRIGGERS_INVALID');
  require(monitorWorkflow.includes('CLOUDFLARE_READ_API_TOKEN'), 'MONITOR_READ_TOKEN_MISSING');
  require(!monitorWorkflow.includes('CLOUDFLARE_PAGES_EDIT_TOKEN'), 'MONITOR_EDIT_TOKEN_PRESENT');
  require(!monitorWorkflow.includes('CLOUDFLARE_API_TOKEN'), 'MONITOR_GENERIC_WRITE_TOKEN_PRESENT');
  require(monitorWorkflow.includes('cloudflare-pages-staging-drift-readback.sh'), 'MONITOR_SCRIPT_BINDING_MISSING');

  require(readbackScript.includes('--request GET'), 'READBACK_GET_MISSING');
  require(!/--request\s+(PATCH|POST|PUT|DELETE)/.test(readbackScript), 'READBACK_MUTATION_PRESENT');
  require(!/\bcurl\b[^\n]*(PATCH|POST|PUT|DELETE)/.test(readbackScript), 'READBACK_MUTATING_CURL_PRESENT');
  require(readbackScript.includes('PRODUCTION_AUTO_DEPLOY_ENABLED'), 'READBACK_PRODUCTION_DRIFT_MISSING');
  require(readbackScript.includes('PREVIEW_DEPLOYMENT_SETTING_NOT_NONE'), 'READBACK_PREVIEW_DRIFT_MISSING');
  require(readbackScript.includes('cloudflare_patch_executed:false'), 'READBACK_NO_PATCH_RECEIPT_MISSING');

  require(containmentScript.includes('--request "$method"'), 'CONTAINMENT_API_METHOD_BINDING_MISSING');
  require(containmentScript.includes('api_request PATCH'), 'CONTAINMENT_PATCH_MISSING');
  require(containmentScript.includes('.result.source.config.production_deployments_enabled == false'), 'CONTAINMENT_PRODUCTION_READBACK_MISSING');
  require(containmentScript.includes('.result.source.config.preview_deployment_setting == "none"'), 'CONTAINMENT_PREVIEW_READBACK_MISSING');
  require(containmentScript.includes('deployment_created:false'), 'CONTAINMENT_NO_DEPLOYMENT_RECEIPT_MISSING');
  require(containmentScript.includes('deployment_deleted:false'), 'CONTAINMENT_NO_DELETE_RECEIPT_MISSING');

  return findings;
}

const findings = findingsFor(base);
const mutations = [
  ['AUTO_PUSH_REINTRODUCED', {boundaryWorkflow: base.boundaryWorkflow.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:')}],
  ['PRODUCTION_AUTO_DEPLOY_ALLOWED', {policy: {...base.policy, target_settings: {...base.policy.target_settings, production_deployments_enabled: true}}}],
  ['PREVIEW_AUTO_DEPLOY_ALLOWED', {policy: {...base.policy, target_settings: {...base.policy.target_settings, preview_deployment_setting: 'all'}}}],
  ['PERSISTENT_WRITE_TOKEN_ALLOWED', {policy: {...base.policy, credential_policy: {...base.policy.credential_policy, write_credential_may_be_persistent: true}}}],
  ['MONITOR_EDIT_TOKEN_ADDED', {monitorWorkflow: `${base.monitorWorkflow}\n# CLOUDFLARE_PAGES_EDIT_TOKEN\n`}],
  ['READBACK_PATCH_ADDED', {readbackScript: `${base.readbackScript}\ncurl --request PATCH example.invalid\n`}],
  ['EXACT_SHA_POLICY_REMOVED', {policy: {...base.policy, deployment_policy: {...base.policy.deployment_policy, approved_exact_sha_deployment_only: false}}}],
  ['PRODUCTION_HISTORY_DELETE_ALLOWED', {policy: {...base.policy, cleanup_policy: {...base.policy.cleanup_policy, production_history_deletion: true}}}],
  ['CONFIRMATION_REMOVED', {boundaryWorkflow: base.boundaryWorkflow.replaceAll('DISABLE_KIDULTS_STAGING_AUTO_DEPLOY', 'CONFIRMATION_REMOVED')}],
  ['PROJECT_REBOUND', {policy: {...base.policy, project: 'unexpected-project'}}],
];

const mutationResults = mutations.map(([id, patch]) => {
  const candidate = {...base, ...patch};
  const rejected = findingsFor(candidate).length > 0;
  if (!rejected) findings.push(`MUTATION_FALSE_GREEN:${id}`);
  return {id, rejected};
});

const receipt = {
  id: 'kidults-cloudflare-staging-deployment-policy-validation-v1',
  version: '1.0.0',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  project: base.policy.project,
  project_disposition: base.policy.project_disposition,
  manual_mutation_only: true,
  read_only_hourly_monitor: true,
  exact_sha_deployment_policy: true,
  automatic_git_deployment_target: false,
  negative_mutations_rejected: mutationResults.filter((item) => item.rejected).length,
  mutations: mutationResults,
  findings,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

console.log(JSON.stringify(receipt, null, 2));
assert.equal(findings.length, 0, findings.join(','));
