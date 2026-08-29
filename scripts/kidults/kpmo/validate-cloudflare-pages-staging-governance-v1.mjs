#!/usr/bin/env node
import fs from 'node:fs';

const paths = Object.freeze({
  policy: 'coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  readonlyWorkflow: '.github/workflows/kidults-cloudflare-pages-boundary-readonly-v1.yml',
  deployWorkflow: '.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml',
  emergencyWorkflow: '.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml',
  validationWorkflow: '.github/workflows/kidults-cloudflare-pages-staging-governance-validation-v1.yml',
  readonlyScript: 'scripts/ops/cloudflare-pages-boundary-readonly.sh',
  containScript: 'scripts/ops/cloudflare-pages-auto-deployment-containment.sh',
  cleanupScript: 'scripts/ops/cloudflare-pages-preview-cleanup.sh',
  deployScript: 'scripts/ops/cloudflare-pages-governed-staging-deploy.sh',
  runbook: 'docs/kidults/runtime/cloudflare-pages-staging-governance-v1.md',
  executableTest: 'tests/kidults/kpmo/cloudflare-pages-staging-governance-v1.test.mjs',
});

const REQUIRED_SECRET_WORKFLOWS = Object.freeze([
  '.github/workflows/kidults-cloudflare-pages-boundary-readonly-v1.yml',
  '.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml',
  '.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml',
]);
const CLOUDFLARE_SECRET_DIGEST = 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978';

for (const [id, file] of Object.entries(paths)) {
  if (!fs.existsSync(file)) throw new Error(`MISSING_${id}:${file}`);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const policy = JSON.parse(read(paths.policy));
const registry = JSON.parse(read(paths.registry));

function findingsFor(input) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const {
    policy, registry, readonlyWorkflow, deployWorkflow, emergencyWorkflow,
    validationWorkflow, readonlyScript, containScript, cleanupScript, deployScript, runbook, executableTest,
  } = input;

  require(policy.id === 'kidults-cloudflare-pages-staging-governance-v1', 'POLICY_ID');
  require(policy.version === '1.0.0', 'POLICY_VERSION');
  require(policy.status === 'PROGRAM_OWNER_APPROVED_STAGING_GOVERNANCE', 'POLICY_STATUS');
  require(policy.project?.name === 'kidults-workspace-staging', 'PROJECT_NAME');
  require(policy.project?.platform_role === 'CONTROLLED_STATIC_STAGING_MIRROR', 'PLATFORM_ROLE');
  require(policy.project?.expected_repository === 'johnkim9524-collab/kaios_enterprise_repo', 'REPOSITORY_BINDING');
  require(policy.project?.production_branch === 'main', 'PROJECT_PRODUCTION_BRANCH');
  require(policy.project?.source_root === 'apps/kidults-enterprise-staging/public', 'SOURCE_ROOT');
  require(policy.automatic_deployment_boundary?.legacy_deployments_enabled === false, 'LEGACY_AUTO_DEPLOY_OFF');
  require(policy.automatic_deployment_boundary?.production_deployments_enabled === false, 'PRODUCTION_AUTO_DEPLOY_OFF');
  require(policy.automatic_deployment_boundary?.preview_deployment_setting === 'none', 'PREVIEW_NONE');
  require((policy.automatic_deployment_boundary?.preview_branch_includes || []).length === 0, 'PREVIEW_INCLUDE_EMPTY');
  require((policy.automatic_deployment_boundary?.preview_branch_excludes || []).length === 0, 'PREVIEW_EXCLUDE_EMPTY');
  require(policy.automatic_deployment_boundary?.git_push_is_deployment_authority === false, 'GIT_PUSH_NOT_AUTHORITY');
  require(policy.deployment_policy?.trigger === 'workflow_dispatch_only', 'DEPLOY_MANUAL_ONLY');
  require(policy.deployment_policy?.source_sha === 'EXACT_LIVE_MAIN_ONLY', 'EXACT_MAIN_ONLY');
  require(policy.deployment_policy?.authorization_phrase === 'DEPLOY_KIDULTS_WORKSPACE_STAGING', 'DEPLOY_AUTH_PHRASE');
  require(policy.read_only_monitor?.schedule === '*/30 * * * *', 'READONLY_SCHEDULE');
  require(policy.read_only_monitor?.visible_preview_count_must_be_zero === true, 'PREVIEW_COUNT_ZERO_REQUIRED');
  require(policy.read_only_monitor?.current_main_match_is_informational === true, 'MAIN_MATCH_INFORMATIONAL');
  require(policy.emergency_control?.default_operation === 'contain_auto_deployments', 'EMERGENCY_DEFAULT');
  require(JSON.stringify(policy.emergency_control?.allowed_operations) === JSON.stringify(['contain_auto_deployments', 'delete_preview_deployments']), 'EMERGENCY_ALLOWED_OPERATIONS');
  require(policy.emergency_control?.production_deployment_delete_forbidden === true, 'PRODUCTION_DELETE_FORBIDDEN');
  require(policy.credential_policy?.write_token_persistent_repository_secret === false, 'NO_PERSISTENT_WRITE_TOKEN');
  require(policy.truth_boundary?.platform_environment === 'STAGING', 'PLATFORM_STAGING');
  require(policy.truth_boundary?.public_release === 'HOLD', 'PUBLIC_HOLD');
  require(policy.truth_boundary?.production === 'HOLD', 'PRODUCTION_HOLD');
  require(policy.truth_boundary?.g5 === 'HOLD', 'G5_HOLD');

  const liveMainMarkers = [
    'Verify live main before provider credential resolution',
    'test "$GITHUB_REF" = "refs/heads/main"',
    '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main',
    'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
  ];
  for (const marker of liveMainMarkers) {
    require(readonlyWorkflow.includes(marker), `READONLY_LIVE_MAIN:${marker}`);
    require(deployWorkflow.includes(marker), `DEPLOY_LIVE_MAIN:${marker}`);
    require(emergencyWorkflow.includes(marker), `EMERGENCY_LIVE_MAIN:${marker}`);
  }

  require(readonlyWorkflow.includes('push:\n    branches: [main]'), 'READONLY_PUSH_MAIN');
  require(readonlyWorkflow.includes("cron: '*/30 * * * *'"), 'READONLY_CRON');
  require(readonlyWorkflow.includes('workflow_dispatch:'), 'READONLY_DISPATCH');
  require(readonlyWorkflow.includes('environment: kidults-cloudflare-readonly'), 'READONLY_ENVIRONMENT');
  require(!readonlyWorkflow.includes('environment: kidults-cloudflare-staging-deploy'), 'READONLY_ADMIN_ENV_FORBIDDEN');
  require(readonlyWorkflow.includes('Read-only Cloudflare Pages boundary and deployment inventory'), 'READONLY_SECRET_STEP');
  require(readonlyWorkflow.includes('bash scripts/ops/cloudflare-pages-boundary-readonly.sh'), 'READONLY_SCRIPT_CALL');

  require(deployWorkflow.includes('on:\n  workflow_dispatch:'), 'DEPLOY_DISPATCH_ONLY_HEADER');
  require(!deployWorkflow.includes('\n  push:'), 'DEPLOY_PUSH_TRIGGER_FORBIDDEN');
  require(!deployWorkflow.includes('\n  schedule:'), 'DEPLOY_SCHEDULE_TRIGGER_FORBIDDEN');
  require((deployWorkflow.match(/test "\$GITHUB_ACTOR" = "\$GITHUB_REPOSITORY_OWNER"/g) || []).length >= 2, 'DEPLOY_OWNER_GUARD_BOTH_JOBS');
  require((deployWorkflow.match(/test "\$AUTHORIZATION" = "DEPLOY_KIDULTS_WORKSPACE_STAGING"/g) || []).length >= 2, 'DEPLOY_CONFIRMATION_BOTH_JOBS');
  require((deployWorkflow.match(/test "\$REQUESTED_SHA" = "\$GITHUB_SHA"/g) || []).length >= 2, 'DEPLOY_EXACT_SHA_BOTH_JOBS');
  require(deployWorkflow.includes('environment: kidults-cloudflare-staging-deploy'), 'DEPLOY_ENVIRONMENT');
  require(deployWorkflow.includes('Execute governed Cloudflare STAGING deployment'), 'DEPLOY_SECRET_STEP');
  require(deployWorkflow.includes('bash scripts/ops/cloudflare-pages-governed-staging-deploy.sh'), 'DEPLOY_SCRIPT_CALL');

  require(emergencyWorkflow.includes('on:\n  workflow_dispatch:'), 'EMERGENCY_DISPATCH_ONLY_HEADER');
  require(!emergencyWorkflow.includes('\n  push:'), 'EMERGENCY_PUSH_TRIGGER_FORBIDDEN');
  require(!emergencyWorkflow.includes('\n  schedule:'), 'EMERGENCY_SCHEDULE_TRIGGER_FORBIDDEN');
  require(!emergencyWorkflow.includes('- inventory'), 'EMERGENCY_INVENTORY_MUST_USE_READONLY_WORKFLOW');
  for (const operation of ['contain_auto_deployments', 'delete_preview_deployments']) {
    require(emergencyWorkflow.includes(operation), `EMERGENCY_OPERATION:${operation}`);
  }
  require(emergencyWorkflow.includes('CONTAIN_KIDULTS_WORKSPACE_STAGING'), 'CONTAIN_CONFIRMATION');
  require(emergencyWorkflow.includes('DELETE_PREVIEW_ONLY_KIDULTS_WORKSPACE_STAGING'), 'PREVIEW_DELETE_CONFIRMATION');
  require(emergencyWorkflow.includes('environment: kidults-cloudflare-staging-deploy'), 'EMERGENCY_ENVIRONMENT');
  require(emergencyWorkflow.includes('Execute approved Cloudflare Pages emergency control'), 'EMERGENCY_SECRET_STEP');

  for (const marker of [
    'list_all_deployments()',
    'production_deployments_enabled == false',
    'preview_deployment_setting == "none"',
    'visible_preview_count',
    "jq '.[0] // null'",
    'trigger_type == "ad_hoc"',
    'startswith("[KIDULTS-GOVERNED-STAGING] repository=" + $expected_repository + " ")',
    'settings_mutated:false',
    'current_main_match_is_informational:true',
  ]) require(readonlyScript.includes(marker), `READONLY_SCRIPT_MARKER:${marker}`);
  require(!readonlyScript.includes('map(select(.latest_stage_status == "success")) | .[0]'), 'READONLY_MUST_INSPECT_LATEST_ATTEMPT');
  require(readonlyScript.includes('latest-attempt.json'), 'READONLY_LATEST_ATTEMPT_RETAINED');
  require(readonlyScript.includes('select(.materialized == true)'), 'READONLY_LATEST_MATERIALIZED_SELECTION');
  require(readonlyScript.includes('skipped_preview_attempt_count'), 'READONLY_SKIPPED_PREVIEW_INFORMATIONAL');
  for (const [id, script] of Object.entries({readonlyScript, containScript, cleanupScript, deployScript})) {
    require(!script.includes('per_page=100'), `CLOUDFLARE_INVALID_PAGE_SIZE:${id}`);
  }
  for (const [id, script] of Object.entries({readonlyScript, containScript, cleanupScript})) {
    require(script.includes('PAGE_SIZE="${PAGE_SIZE:-25}"'), `CLOUDFLARE_PAGE_SIZE_DECLARATION:${id}`);
    require(script.includes('PAGE_SIZE > 25'), `CLOUDFLARE_PAGE_SIZE_GUARD:${id}`);
    require(script.includes('per_page=${PAGE_SIZE}'), `CLOUDFLARE_BOUNDED_PAGE_QUERY:${id}`);
  }
  require((deployScript.match(/per_page=25&page=1/g) || []).length === 2, 'DEPLOY_BOUNDED_PAGE_QUERY');

  for (const marker of [
    '.config.deployments_enabled = false',
    '.config.production_deployments_enabled = false',
    '.config.preview_deployment_setting = "none"',
    '.config.preview_branch_includes = []',
    '.config.preview_branch_excludes = []',
    'list_all_deployment_ids()',
    'test "$before_ids" = "$after_ids"',
  ]) require(containScript.includes(marker), `CONTAINMENT_MARKER:${marker}`);
  require(!containScript.includes('/deployments/$deployment_id'), 'CONTAINMENT_MUST_NOT_DELETE');

  for (const marker of [
    'list_all_deployments()',
    'select(.environment == "preview" and .materialized == true)',
    'select(.environment == "production")',
    'initial_preview_ids="$(jq -c \'[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort\' <<<"$initial")"',
    'DELETE "$API_ROOT/deployments/$deployment_id"',
    'test "$initial_production_ids" = "$final_production_ids"',
    'production_mutation:false',
  ]) require(cleanupScript.includes(marker), `CLEANUP_MARKER:${marker}`);
  require(!cleanupScript.includes('select(.environment == "production") | .id | @sh'), 'CLEANUP_PRODUCTION_DELETE_FORBIDDEN');
  require(cleanupScript.includes('select(.environment == "preview" and .materialized == true) | .id'), 'CLEANUP_MATERIALIZED_PREVIEW_ONLY');

  for (const marker of [
    'if [[ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]]; then',
    'production_deployments_enabled == false',
    'preview_deployment_setting == "none"',
    'wrangler@4.127.1 pages deploy',
    '--project-name "$PROJECT_NAME"',
    '--branch main',
    '--commit-hash "$SOURCE_SHA"',
    '--commit-message "$commit_message"',
    'commit_message="[KIDULTS-GOVERNED-STAGING] repository=${EXPECTED_REPOSITORY}',
    'test "$(jq \'length\' <<<"$new_ids")" -eq 1',
    'trigger_type == "ad_hoc"',
    'automatic_git_deployments_disabled_after_deploy:true',
    'public_release:"HOLD"',
    'production:"HOLD"',
    'g5:"HOLD"',
  ]) require(deployScript.includes(marker), `DEPLOY_SCRIPT_MARKER:${marker}`);
  require((deployScript.match(/production_deployments_enabled == false/g) || []).length >= 2, 'DEPLOY_PRE_AND_POST_AUTO_SETTING_GUARD');
  require(!deployScript.includes('pages deployment delete'), 'DEPLOY_SCRIPT_DELETE_FORBIDDEN');

  require(validationWorkflow.includes('validate-cloudflare-pages-staging-governance-v1.mjs'), 'VALIDATION_WORKFLOW_SELF');
  require(validationWorkflow.includes('inventory-secret-bearing-workflow-dispatch-v1.mjs --enforce-registry'), 'VALIDATION_REGISTRY_ENFORCEMENT');
  require(validationWorkflow.includes('cloudflare-pages-staging-governance-v1.test.mjs'), 'VALIDATION_EXECUTABLE_TEST');
  require(executableTest.includes('unauthorized_preview_rejected'), 'EXECUTABLE_UNAUTHORIZED_PREVIEW_TEST');
  require(executableTest.includes('cleanup_deletes_preview_only'), 'EXECUTABLE_PREVIEW_ONLY_DELETE_TEST');
  require(executableTest.includes('governed_exact_sha_deploy'), 'EXECUTABLE_EXACT_SHA_DEPLOY_TEST');
  require(runbook.includes('automatic deployments: disabled'), 'RUNBOOK_AUTO_DEPLOY_OFF');
  require(runbook.includes('must not merge while the Pages project can still auto-deploy `main`'), 'RUNBOOK_PREMERGE_BOUNDARY');
  require(runbook.includes('workflow_dispatch'), 'RUNBOOK_MANUAL_DEPLOY');
  require(runbook.includes('must not be repurposed for mutation'), 'RUNBOOK_READONLY_BOUNDARY');
  require(runbook.toLowerCase().includes('production-environment deployment deletion: prohibited'), 'RUNBOOK_PRODUCTION_DELETE_FORBIDDEN');

  for (const workflow of REQUIRED_SECRET_WORKFLOWS) {
    require((registry.registered_workflows || []).includes(workflow), `REGISTRY_WORKFLOW:${workflow}`);
  }
  require(new Set(registry.registered_workflows || []).size === (registry.registered_workflows || []).length, 'REGISTRY_WORKFLOW_DUPLICATE');
  require(registry.registered_count === (registry.registered_workflows || []).length, 'REGISTRY_COUNT');
  require(registry.registered_count === 20, 'REGISTRY_EXPECTED_COUNT');
  require(registry.required_environment_count === 9, 'REGISTRY_ENVIRONMENT_COUNT');
  require((registry.required_environment_bindings || []).length === 20, 'REGISTRY_BINDING_COUNT');

  const binding = (workflow, job) => (registry.required_environment_bindings || []).find(
    (item) => item.workflow === workflow && item.job === job,
  );
  const readonlyBinding = binding(REQUIRED_SECRET_WORKFLOWS[0], 'audit-pages-boundary');
  const emergencyBinding = binding(REQUIRED_SECRET_WORKFLOWS[1], 'control');
  const deployBinding = binding(REQUIRED_SECRET_WORKFLOWS[2], 'deploy');
  require(readonlyBinding?.environment === 'kidults-cloudflare-readonly', 'REGISTRY_READONLY_ENV');
  require(JSON.stringify(readonlyBinding?.allowed_trigger_classes) === JSON.stringify(['push', 'schedule', 'workflow_dispatch']), 'REGISTRY_READONLY_TRIGGERS');
  require(readonlyBinding?.remote_mutation_class === 'READ_ONLY_CONTROL_PLANE', 'REGISTRY_READONLY_CLASS');
  require(emergencyBinding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_EMERGENCY_ENV');
  require(JSON.stringify(emergencyBinding?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_EMERGENCY_TRIGGERS');
  require(emergencyBinding?.remote_mutation_class === 'REMOTE_STAGING_MUTATION', 'REGISTRY_EMERGENCY_CLASS');
  require(deployBinding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_DEPLOY_ENV');
  require(JSON.stringify(deployBinding?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_DEPLOY_TRIGGERS');
  require(deployBinding?.remote_mutation_class === 'REMOTE_STAGING_MUTATION', 'REGISTRY_DEPLOY_CLASS');
  for (const item of [readonlyBinding, emergencyBinding, deployBinding]) {
    require(item?.required_secret_name_digest === CLOUDFLARE_SECRET_DIGEST, 'REGISTRY_CF_SECRET_DIGEST');
  }

  return findings;
}

const base = Object.freeze({
  policy,
  registry,
  readonlyWorkflow: read(paths.readonlyWorkflow),
  deployWorkflow: read(paths.deployWorkflow),
  emergencyWorkflow: read(paths.emergencyWorkflow),
  validationWorkflow: read(paths.validationWorkflow),
  readonlyScript: read(paths.readonlyScript),
  containScript: read(paths.containScript),
  cleanupScript: read(paths.cleanupScript),
  deployScript: read(paths.deployScript),
  runbook: read(paths.runbook),
  executableTest: read(paths.executableTest),
});

const findings = findingsFor(base);
const mutations = [
  ['AUTO_PRODUCTION_REENABLED', {policy: {...policy, automatic_deployment_boundary: {...policy.automatic_deployment_boundary, production_deployments_enabled: true}}}],
  ['PREVIEW_ALL_REENABLED', {policy: {...policy, automatic_deployment_boundary: {...policy.automatic_deployment_boundary, preview_deployment_setting: 'all'}}}],
  ['DEPLOY_PUSH_TRIGGER_ADDED', {deployWorkflow: base.deployWorkflow.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:')}],
  ['EMERGENCY_PUSH_TRIGGER_ADDED', {emergencyWorkflow: base.emergencyWorkflow.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:')}],
  ['DEPLOY_OWNER_GUARD_REMOVED', {deployWorkflow: base.deployWorkflow.replaceAll('test "$GITHUB_ACTOR" = "$GITHUB_REPOSITORY_OWNER"', '')}],
  ['DEPLOY_EXACT_SHA_GUARD_REMOVED', {deployWorkflow: base.deployWorkflow.replaceAll('test "$REQUESTED_SHA" = "$GITHUB_SHA"', '')}],
  ['READONLY_USES_ADMIN_ENV', {readonlyWorkflow: base.readonlyWorkflow.replace('environment: kidults-cloudflare-readonly', 'environment: kidults-cloudflare-staging-deploy')}],
  ['READONLY_IGNORES_FAILED_LATEST', {readonlyScript: base.readonlyScript.replace("jq '.[0] // null'", "jq 'map(select(.latest_stage_status == \"success\")) | .[0] // null'")}],
  ['CONTAINMENT_LEAVES_PRODUCTION_AUTO_ON', {containScript: base.containScript.replace('.config.production_deployments_enabled = false', '.config.production_deployments_enabled = true')}],
  ['CONTAINMENT_HISTORY_GUARD_REMOVED', {containScript: base.containScript.replace('test "$before_ids" = "$after_ids"', 'true')}],
  ['CLEANUP_PRODUCTION_PRESERVATION_REMOVED', {cleanupScript: base.cleanupScript.replace('test "$initial_production_ids" = "$final_production_ids"', 'true')}],
  ['CLEANUP_FILTER_SWITCHED_TO_PRODUCTION', {cleanupScript: base.cleanupScript.replace('initial_preview_ids="$(jq -c \'[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort\' <<<"$initial")"', 'initial_preview_ids="$(jq -c \'[.[] | select(.environment == "production") | .id] | unique | sort\' <<<"$initial")"')}],
  ['DEPLOY_MESSAGE_PREFIX_REMOVED', {deployScript: base.deployScript.replace('commit_message="[KIDULTS-GOVERNED-STAGING] repository=${EXPECTED_REPOSITORY}', 'commit_message="[UNCONTROLLED] repository=${EXPECTED_REPOSITORY}')}],
  ['DEPLOY_AUTO_SETTING_GUARD_REMOVED', {deployScript: base.deployScript.replaceAll('and .result.source.config.production_deployments_enabled == false', 'and true')}],
  ['REGISTRY_DEPLOY_WORKFLOW_REMOVED', {registry: {...registry, registered_workflows: registry.registered_workflows.filter((x) => x !== REQUIRED_SECRET_WORKFLOWS[2])}}],
  ['REGISTRY_SECRET_DIGEST_CHANGED', {registry: {...registry, required_environment_bindings: registry.required_environment_bindings.map((item) => item.workflow === REQUIRED_SECRET_WORKFLOWS[2] ? {...item, required_secret_name_digest: 'sha256:' + '0'.repeat(64)} : item)}}],
];

const mutationResults = mutations.map(([id, patch]) => {
  const mutated = {...base, ...patch};
  return {id, rejected: findingsFor(mutated).length > 0};
});
for (const result of mutationResults) {
  if (!result.rejected) findings.push(`MUTATION_FALSE_GREEN:${result.id}`);
}

const receipt = {
  id: 'kidults-cloudflare-pages-staging-governance-validation-receipt-v1',
  version: '1.0.0',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  project: 'kidults-workspace-staging',
  architecture: 'CONTROLLED_STATIC_STAGING_MIRROR',
  automatic_git_deployments: 'DISABLED_REQUIRED',
  governed_exact_sha_deployment: true,
  readonly_drift_monitor: true,
  emergency_preview_cleanup_manual_only: true,
  negative_mutations_rejected: mutationResults.filter((x) => x.rejected).length,
  mutations: mutationResults,
  findings,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
