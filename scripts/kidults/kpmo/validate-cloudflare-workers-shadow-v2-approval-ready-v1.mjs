#!/usr/bin/env node
import fs from 'node:fs';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-authorization-20260901-v1.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-02.md';
const CONTRACT_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-execution-contract-v1.json';
const SPEC_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-workflow-spec-v1.json';
const LIFETIME_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-receipt-lifetime-contract-v1.json';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const V1_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const V2_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';
const APPROVAL_ID = 'CF-WORKERS-SHADOW-20260901-02';
const APPROVAL_ISSUE = 1711;
const APPROVAL_COMMENT_ID = 5481462895;
const APPROVAL_COMMENT_NODE_ID = 'IC_kwDOTF-G-M8AAAABRrh8bw';
const APPROVAL_CREATED_AT = '2026-08-31T16:43:16Z';

const fail = (message) => {
  throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V2_AUTHORIZED_FAIL:${message}`);
};
const ok = (condition, message) => {
  if (!condition) fail(message);
};
const read = path => fs.readFileSync(path, 'utf8');
const parse = path => JSON.parse(read(path));

for (const path of [
  AUTH_PATH,
  APPROVAL_BODY_PATH,
  CONTRACT_PATH,
  SPEC_PATH,
  LIFETIME_PATH,
  REGISTRY_PATH,
  V1_WORKFLOW_PATH,
  V2_WORKFLOW_PATH,
  CONFIG_PATH,
  PACKAGE_PATH,
  LOCK_PATH,
]) {
  ok(fs.existsSync(path), `MISSING_FILE:${path}`);
}
ok(fs.existsSync(`${PORTAL_PATH}/index.html`), 'PORTAL_INDEX_MISSING');
ok(fs.existsSync(`${PORTAL_PATH}/workspace.html`), 'PORTAL_WORKSPACE_MISSING');

const auth = parse(AUTH_PATH);
const approvalBody = read(APPROVAL_BODY_PATH);
const contract = parse(CONTRACT_PATH);
const spec = parse(SPEC_PATH);
const lifetime = parse(LIFETIME_PATH);
const registry = parse(REGISTRY_PATH);
const v1Workflow = read(V1_WORKFLOW_PATH);
const v2Workflow = read(V2_WORKFLOW_PATH);
const configRaw = read(CONFIG_PATH);
const config = JSON.parse(configRaw);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);

function validateScope(scope) {
  ok(scope?.workflow === V2_WORKFLOW_PATH, 'SCOPE_WORKFLOW');
  ok(scope?.trigger === 'workflow_dispatch', 'SCOPE_TRIGGER');
  ok(scope?.source_ref === 'refs/heads/main', 'SCOPE_SOURCE_REF');
  ok(scope?.service === 'kidults-public-portal-shadow', 'SCOPE_SERVICE');
  ok(scope?.target === 'workers_dev_non_production_only', 'SCOPE_TARGET');
  ok(scope?.workflow_dispatch_count_max === 1, 'SCOPE_DISPATCH_COUNT');
  ok(scope?.provider_deployment_attempt_count_max === 1, 'SCOPE_PROVIDER_ATTEMPT_COUNT');
  ok(scope?.authorization_consumed_on === 'FIRST_V2_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION');
  for (const field of [
    'production_routes_allowed',
    'custom_domains_allowed',
    'pages_delete_allowed',
    'pages_domain_detach_allowed',
    'public_promotion_allowed',
    'production_promotion_allowed',
    'g5_promotion_allowed',
    'external_spend_allowed',
    'contract_change_allowed',
    'new_credential_creation_allowed',
    'credential_scope_expansion_allowed',
  ]) {
    ok(scope?.[field] === false, `FORBIDDEN_SCOPE_ENABLED:${field}`);
  }
  ok(
    scope?.credential_scope === 'EXISTING_MINIMUM_REQUIRED_CLOUDFLARE_WORKERS_DEPLOYMENT_CREDENTIAL_ONLY',
    'CREDENTIAL_SCOPE',
  );
}

ok(auth.id === APPROVAL_ID, 'AUTH_ID');
ok(auth.version === '1.0.0', 'AUTH_VERSION');
ok(auth.status === 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY', 'AUTH_STATUS');
ok(auth.authorized_by?.github_login === 'johnkim9524-collab', 'AUTH_OWNER_LOGIN');
ok(auth.authorized_by?.author_association === 'OWNER', 'AUTH_OWNER_ASSOCIATION');
const receipt = auth.authorization_receipt || {};
ok(receipt.repository === 'johnkim9524-collab/kaios_enterprise_repo', 'RECEIPT_REPOSITORY');
ok(receipt.issue_number === APPROVAL_ISSUE, 'RECEIPT_ISSUE');
ok(receipt.comment_id === APPROVAL_COMMENT_ID, 'RECEIPT_COMMENT_ID');
ok(receipt.comment_node_id === APPROVAL_COMMENT_NODE_ID, 'RECEIPT_COMMENT_NODE_ID');
ok(
  receipt.api_url === `https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/issues/comments/${APPROVAL_COMMENT_ID}`,
  'RECEIPT_API_URL',
);
ok(
  receipt.html_url === `https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/${APPROVAL_ISSUE}#issuecomment-${APPROVAL_COMMENT_ID}`,
  'RECEIPT_HTML_URL',
);
ok(receipt.created_at === APPROVAL_CREATED_AT, 'RECEIPT_CREATED_AT');
ok(receipt.updated_at === APPROVAL_CREATED_AT, 'RECEIPT_EDITED_OR_TIMESTAMP_DRIFT');
ok(receipt.performed_via_github_app === 'chatgpt-codex-connector', 'RECEIPT_GITHUB_APP');
ok(receipt.body_path === APPROVAL_BODY_PATH, 'RECEIPT_BODY_PATH');
ok(
  receipt.verification === 'FETCH_EXACT_COMMENT_ID_AND_MATCH_METADATA_AND_BODY_BEFORE_PROVIDER_SECRET_RESOLUTION',
  'RECEIPT_VERIFICATION',
);
validateScope(auth.authorized_scope);
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_V2_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');
for (const excluded of [
  'RERUN_OR_SECOND_DISPATCH',
  'PRODUCTION_ROUTE',
  'CUSTOM_DOMAIN',
  'PAGES_DELETE_OR_DOMAIN_DETACH',
  'PUBLIC_RELEASE',
  'PRODUCTION_APPROVAL',
  'G5',
  'SPEND_OR_CONTRACT_EXPANSION',
  'NEW_CREDENTIAL_OR_SCOPE_EXPANSION',
  'UNRELATED_PROVIDER_MUTATION',
]) {
  ok(auth.authority_excludes?.includes(excluded), `AUTHORITY_EXCLUSION_MISSING:${excluded}`);
}

ok(approvalBody.endsWith('\n'), 'APPROVAL_BODY_FINAL_NEWLINE');
for (const marker of [
  `**Approval ID:** \`${APPROVAL_ID}\``,
  'maximum workflow dispatches: **1**',
  'maximum provider deployment attempts: **1**',
  'Production routes allowed: **0**',
  'custom domains allowed: **0**',
  'Cloudflare Pages deletion, retirement, or domain detach mutation: forbidden',
  'Public promotion: not authorized',
  'Production promotion: not authorized',
  'G5 promotion: not authorized',
  'This receipt grants no standing authority and no replay authority',
  '**Approval state:** `AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY`',
]) {
  ok(approvalBody.includes(marker), `APPROVAL_BODY_MARKER_MISSING:${marker}`);
}

ok(contract.id === 'kidults-cloudflare-workers-shadow-v2-execution-contract-v1', 'CONTRACT_ID');
ok(contract.version === '1.0.0', 'CONTRACT_VERSION');
ok(contract.status === auth.status, 'CONTRACT_STATUS');
ok(contract.approval_id === APPROVAL_ID, 'CONTRACT_APPROVAL_ID');
ok(contract.approval_issue === APPROVAL_ISSUE, 'CONTRACT_APPROVAL_ISSUE');
ok(contract.prepared_from_protected_main_sha === '8d4a89b81d523f533ded56eae7c9a0617d158866', 'CONTRACT_BASE_SHA');
ok(contract.authorization?.authorized === true, 'CONTRACT_AUTHORIZED');
ok(contract.authorization?.authorization_record === AUTH_PATH, 'CONTRACT_AUTH_RECORD');
ok(contract.authorization?.authorized_by?.github_login === 'johnkim9524-collab', 'CONTRACT_OWNER');
ok(contract.authorization?.authorization_receipt?.comment_id === APPROVAL_COMMENT_ID, 'CONTRACT_RECEIPT');
ok(contract.authorization?.self_attestation_allowed === false, 'SELF_ATTESTATION_FORBIDDEN');
ok(contract.authorization?.issue_creation_is_authority === false, 'ISSUE_CREATION_AUTHORITY_FORBIDDEN');
ok(contract.authorization?.merge_is_authority === false, 'MERGE_AUTHORITY_FORBIDDEN');
ok(contract.authorization?.workflow_dispatch_is_authority === false, 'DISPATCH_AUTHORITY_FORBIDDEN');
validateScope(contract.authorized_scope);
ok(contract.implementation_state?.materialized_secret_bearing_workflow_present === true, 'CONTRACT_WORKFLOW_PRESENT');
ok(contract.implementation_state?.secret_registry_mutated_for_v2 === true, 'CONTRACT_REGISTRY_MUTATED');
ok(contract.implementation_state?.provider_mutation_authorized === true, 'CONTRACT_PROVIDER_AUTHORIZED');
ok(contract.implementation_state?.provider_mutation_executed === false, 'CONTRACT_PROVIDER_NOT_EXECUTED');
ok(contract.implementation_state?.cloudflare_mutation_count === 0, 'CONTRACT_MUTATION_TRUTH');
ok(contract.receipt_lifetime?.canonical_location === 'RUNNER_TEMP_OUTSIDE_GITHUB_WORKSPACE', 'CONTRACT_RECEIPT_LOCATION');
ok(contract.receipt_lifetime?.provider_attempt_marker_required === true, 'CONTRACT_PROVIDER_MARKER');
ok(contract.receipt_lifetime?.always_finalizer_required === true, 'CONTRACT_FINALIZER');
ok(contract.receipt_lifetime?.fallback_must_not_claim_zero_provider_attempt_when_marker_exists === true, 'CONTRACT_FALLBACK_TRUTH');
ok(contract.tooling?.wrangler_exact_version === '4.127.1', 'CONTRACT_WRANGLER');
ok(contract.tooling?.runtime_resolution === 'LOCAL_LOCKED_BINARY_ONLY', 'CONTRACT_RUNTIME_RESOLUTION');
ok(contract.prior_incident?.workflow_run_id === 33410598558, 'PRIOR_RUN');
ok(contract.prior_incident?.provider_step === 'SKIPPED', 'PRIOR_PROVIDER_STEP');
ok(contract.prior_incident?.provider_secret_step_executed === false, 'PRIOR_SECRET_STEP');
ok(contract.prior_incident?.cloudflare_mutation_count === 0, 'PRIOR_MUTATION');
ok(contract.prior_incident?.replay_authorized === false, 'PRIOR_REPLAY');
ok(contract.release_boundary?.public === 'HOLD', 'PUBLIC_HOLD');
ok(contract.release_boundary?.production === 'HOLD', 'PRODUCTION_HOLD');
ok(contract.release_boundary?.g5 === 'HOLD', 'G5_HOLD');
ok(contract.release_boundary?.pages_delete === 'FORBIDDEN', 'PAGES_DELETE_FORBIDDEN');

ok(spec.id === 'kidults-cloudflare-workers-shadow-v2-workflow-spec-v1', 'SPEC_ID');
ok(spec.version === '1.0.0', 'SPEC_VERSION');
ok(spec.status === 'AUTHORIZED_EXECUTABLE_ONE_SHOT_PENDING_GOVERNED_LANDING', 'SPEC_STATUS');
ok(spec.approval_id === APPROVAL_ID && spec.approval_issue === APPROVAL_ISSUE, 'SPEC_APPROVAL_BINDING');
ok(spec.authorization_record === AUTH_PATH, 'SPEC_AUTH_RECORD');
ok(spec.materialized_workflow_path === V2_WORKFLOW_PATH, 'SPEC_WORKFLOW_PATH');
ok(spec.materialized_workflow_present === true, 'SPEC_WORKFLOW_PRESENT');
ok(spec.provider_mutation_authorized === true, 'SPEC_PROVIDER_AUTHORIZED');
ok(JSON.stringify(spec.trigger) === JSON.stringify(['workflow_dispatch']), 'SPEC_TRIGGER');
ok(JSON.stringify(spec.permissions) === JSON.stringify(['contents:read']), 'SPEC_PERMISSIONS');
ok(spec.environment === 'kidults-cloudflare-staging-deploy', 'SPEC_ENVIRONMENT');
ok(spec.runner === 'ubuntu-24.04', 'SPEC_RUNNER');
ok(spec.timeout_minutes === 15, 'SPEC_TIMEOUT');
ok(spec.concurrency?.group === 'kidults-cloudflare-workers-shadow-deploy-v2', 'SPEC_CONCURRENCY');
ok(spec.concurrency?.cancel_in_progress === false, 'SPEC_CANCEL_POLICY');
const expectedSteps = [
  'Initialize canonical runner-temp receipt',
  'Consume unique first v2 authorization',
  'Verify live main before provider credential resolution',
  'Checkout exact execution SHA',
  'Verify exact Program Owner v2 approval receipt',
  'Set up governed Node',
  'Install locked Wrangler tooling',
  'Validate authorized v2 shadow contract',
  'Bind exact source and artifact digests',
  'Deploy one non-production Workers shadow v2',
  'Verify workers.dev shadow read-back',
  'Finalize sanitized terminal receipt',
  'Upload sanitized terminal receipt',
];
ok(JSON.stringify(spec.ordered_steps) === JSON.stringify(expectedSteps), 'SPEC_STEP_ORDER');
for (const [name, value] of Object.entries(spec.canonical_runtime_paths || {})) {
  ok(
    typeof value === 'string' && value.startsWith('${RUNNER_TEMP}/kidults-cloudflare-workers-shadow-v2/'),
    `SPEC_RUNNER_TEMP_PATH:${name}`,
  );
  ok(!value.includes('${GITHUB_WORKSPACE}'), `SPEC_WORKSPACE_PATH_FORBIDDEN:${name}`);
}
ok(spec.provider_step?.name === 'Deploy one non-production Workers shadow v2', 'SPEC_PROVIDER_STEP');
ok(JSON.stringify(spec.provider_step?.secret_names) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'SPEC_SECRET_SET');
ok(spec.provider_step?.secret_scope === 'STEP_ONLY_AFTER_ALL_PREFLIGHTS', 'SPEC_SECRET_SCOPE');
ok(spec.provider_step?.attempt_marker_created === 'IMMEDIATELY_BEFORE_WRANGLER_PROCESS', 'SPEC_MARKER_POINT');
ok(spec.provider_step?.max_attempts === 1, 'SPEC_PROVIDER_MAX');
ok(spec.always_finalizer?.required === true, 'SPEC_FINALIZER');
ok(
  spec.always_finalizer?.missing_or_invalid_receipt_without_provider_marker?.provider_mutation_attempted === false,
  'SPEC_PRE_PROVIDER_FALLBACK',
);
ok(
  spec.always_finalizer?.missing_or_invalid_receipt_with_provider_marker?.provider_mutation_attempted
    === 'UNKNOWN_REQUIRES_PROVIDER_READBACK',
  'SPEC_POST_PROVIDER_FALLBACK',
);

ok(lifetime.id === 'kidults-cloudflare-workers-shadow-receipt-lifetime-contract-v1', 'LIFETIME_ID');
ok(lifetime.status === 'MANDATORY_FOR_ANY_FUTURE_WORKERS_SHADOW_ONE_SHOT', 'LIFETIME_STATUS');
ok(lifetime.canonical_receipt_location === 'RUNNER_TEMP_OUTSIDE_GITHUB_WORKSPACE', 'LIFETIME_LOCATION');
ok(lifetime.future_execution?.current_approval_reusable === false, 'V1_APPROVAL_REUSE_FORBIDDEN');
ok(lifetime.future_execution?.new_explicit_approval_required === true, 'NEW_APPROVAL_REQUIRED');

ok(v1Workflow.includes('if: ${{ false }}'), 'V1_TOMBSTONE_MISSING');
ok(v1Workflow.includes('CONSUMED_ONE_SHOT_TOMBSTONE_NO_PROVIDER_MUTATION'), 'V1_TOMBSTONE_MARKER');

ok(config.name === 'kidults-public-portal-shadow', 'WORKER_NAME');
ok(config.compatibility_date === '2026-08-31', 'COMPATIBILITY_DATE');
ok(config.workers_dev === true, 'WORKERS_DEV_REQUIRED');
ok(config.preview_urls === false, 'PREVIEW_URLS_FORBIDDEN');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'PRODUCTION_ROUTES_ZERO');
ok(config.assets?.directory === PORTAL_PATH, 'PORTAL_ASSET_SOURCE');
ok(config.assets?.html_handling === 'auto-trailing-slash', 'HTML_HANDLING');
ok(config.assets?.not_found_handling === 'none', 'NOT_FOUND_HANDLING');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configRaw.includes(forbidden), `FORBIDDEN_CONFIG_AUTHORITY:${forbidden}`);
}
ok(packageJson.name === 'kidults-cloudflare-workers-shadow-tooling', 'PACKAGE_NAME');
ok(packageJson.private === true, 'PACKAGE_PRIVATE');
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_PACKAGE_EXACT');
ok(!packageJson.scripts || Object.keys(packageJson.scripts).length === 0, 'PACKAGE_SCRIPTS_FORBIDDEN');
ok(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
ok(packageLock.packages?.['']?.devDependencies?.wrangler === '4.127.1', 'LOCK_ROOT_WRANGLER');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCK_WRANGLER_VERSION');

ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(v2Workflow), 'WORKFLOW_TRIGGER_PERMISSIONS');
for (const forbiddenTrigger of [
  '\n  push:',
  '\n  pull_request:',
  '\n  pull_request_target:',
  '\n  schedule:',
  '\n  workflow_run:',
  '\n  repository_dispatch:',
]) {
  ok(!v2Workflow.includes(forbiddenTrigger), `FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
}
ok(v2Workflow.includes('environment: kidults-cloudflare-staging-deploy'), 'WORKFLOW_ENVIRONMENT');
ok(v2Workflow.includes('runs-on: ubuntu-24.04'), 'WORKFLOW_RUNNER');
ok(v2Workflow.includes('timeout-minutes: 15'), 'WORKFLOW_TIMEOUT');
ok(v2Workflow.includes('group: kidults-cloudflare-workers-shadow-deploy-v2'), 'WORKFLOW_CONCURRENCY');
let priorStepIndex = -1;
for (const step of expectedSteps) {
  const index = v2Workflow.indexOf(`      - name: ${step}`);
  ok(index > priorStepIndex, `WORKFLOW_STEP_ORDER:${step}`);
  priorStepIndex = index;
}
ok(v2Workflow.includes('ROOT="$RUNNER_TEMP/kidults-cloudflare-workers-shadow-v2"'), 'RUNNER_TEMP_ROOT');
ok(!v2Workflow.includes('artifacts/cloudflare-workers-shadow/receipt.json'), 'V1_WORKSPACE_RECEIPT_PATH_FORBIDDEN');
ok(!v2Workflow.includes('RECEIPT="$GITHUB_WORKSPACE'), 'WORKSPACE_CANONICAL_RECEIPT_FORBIDDEN');
ok(v2Workflow.includes('test "$GITHUB_RUN_ATTEMPT" = "1"'), 'RERUN_BLOCK');
ok(
  v2Workflow.includes('/actions/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml/runs?event=workflow_dispatch&branch=main&per_page=100'),
  'V2_DISPATCH_LEDGER_ENDPOINT',
);
ok(v2Workflow.includes('.total_count == 1'), 'UNIQUE_DISPATCH_ASSERTION');
ok(v2Workflow.includes('V2_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN'), 'SECOND_DISPATCH_BLOCK');
ok(v2Workflow.includes('Verify live main before provider credential resolution'), 'LIVE_MAIN_GUARD_STEP');
ok(v2Workflow.includes('test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"'), 'LIVE_MAIN_SHA_BINDING');
ok(v2Workflow.includes('/issues/comments/5481462895'), 'APPROVAL_ENDPOINT');
ok(v2Workflow.includes(`.node_id=="${APPROVAL_COMMENT_NODE_ID}"`), 'APPROVAL_NODE_ID');
ok(v2Workflow.includes(`.created_at=="${APPROVAL_CREATED_AT}"`), 'APPROVAL_CREATED_AT');
ok(v2Workflow.includes('and .author_association=="OWNER"'), 'APPROVAL_OWNER_ASSOCIATION');
ok(v2Workflow.includes('and .performed_via_github_app.slug=="chatgpt-codex-connector"'), 'APPROVAL_APP');
ok(v2Workflow.includes('cmp --silent "$EXPECTED_BODY" "$ACTUAL_BODY"'), 'APPROVAL_BODY_COMPARE');
ok(
  v2Workflow.includes('npm ci --ignore-scripts --no-audit --no-fund --prefix tooling/kidults-cloudflare-workers-shadow'),
  'LOCKED_TOOL_INSTALL',
);
ok(!/\bnpx\b/.test(v2Workflow), 'NPX_RUNTIME_RESOLUTION_FORBIDDEN');
ok(
  v2Workflow.includes('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy'),
  'LOCAL_WRANGLER_EXECUTION',
);
const markerIndex = v2Workflow.indexOf('> "$MARKER"');
const wranglerIndex = v2Workflow.indexOf('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy');
ok(markerIndex >= 0 && wranglerIndex > markerIndex, 'PROVIDER_MARKER_BEFORE_WRANGLER');
ok(v2Workflow.includes('.provider_attempt_marker_written=true'), 'PROVIDER_MARKER_RECEIPT');
ok(v2Workflow.includes('.provider_mutation_attempted=true'), 'CONSERVATIVE_PROVIDER_ATTEMPT_TRUTH');
ok(v2Workflow.includes('if: ${{ always() }}'), 'ALWAYS_FINALIZER');
ok(v2Workflow.includes('VERIFIED_FAIL_PRE_PROVIDER_RECEIPT_RECOVERED'), 'PRE_PROVIDER_FALLBACK');
ok(v2Workflow.includes('VERIFIED_FAIL_POST_PROVIDER_ATTEMPT_RECEIPT_RECOVERED'), 'POST_PROVIDER_FALLBACK');
ok(v2Workflow.includes('UNKNOWN_REQUIRES_PROVIDER_READBACK'), 'POST_PROVIDER_UNKNOWN_TRUTH');
ok(v2Workflow.includes('path: ${{ runner.temp }}/kidults-cloudflare-workers-shadow-v2/receipt.json'), 'RUNNER_TEMP_ARTIFACT_UPLOAD');
ok(v2Workflow.includes('test "$http_code" = "200"'), 'HTTP_200_ASSERTION');
ok(v2Workflow.includes('grep -Eiq \'<!doctype html|<html\''), 'HTML_ASSERTION');
ok(v2Workflow.includes('PUBLIC_PRODUCTION_G5_HOLD'), 'HOLD_RECEIPT');
ok(v2Workflow.includes('actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8'), 'CHECKOUT_PIN');
ok(v2Workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'SETUP_NODE_PIN');
ok(v2Workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_PIN');

const secretNames = [...v2Workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)]
  .map(match => match[1])
  .sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'WORKFLOW_SECRET_SET');
const providerStepStart = v2Workflow.indexOf('      - name: Deploy one non-production Workers shadow v2');
const readbackStepStart = v2Workflow.indexOf('      - name: Verify workers.dev shadow read-back');
ok(providerStepStart >= 0 && readbackStepStart > providerStepStart, 'PROVIDER_STEP_BOUNDARIES');
ok(!v2Workflow.slice(0, providerStepStart).includes('${{ secrets.'), 'SECRET_BEFORE_PROVIDER_STEP');
ok(!v2Workflow.slice(readbackStepStart).includes('${{ secrets.'), 'SECRET_AFTER_PROVIDER_STEP');

ok(registry.id === 'kidults-secret-bearing-workflow-dispatch-registry-v1', 'REGISTRY_ID');
ok(registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'REGISTRY_STATUS');
ok(registry.registered_workflows?.includes(V2_WORKFLOW_PATH), 'V2_WORKFLOW_UNREGISTERED');
ok(registry.registered_count === registry.registered_workflows?.length, 'REGISTRY_COUNT_DRIFT');
ok(registry.registered_count === 24, 'REGISTRY_EXPECTED_COUNT');
ok(registry.required_environment_bindings?.length === registry.registered_count, 'REGISTRY_BINDING_COUNT');
ok(registry.required_environment_count === 9, 'REGISTRY_ENVIRONMENT_COUNT');
const v2Binding = registry.required_environment_bindings?.find(
  binding => binding.workflow === V2_WORKFLOW_PATH && binding.job === 'deploy-shadow-v2',
);
ok(Boolean(v2Binding), 'V2_BINDING_MISSING');
ok(v2Binding.environment === 'kidults-cloudflare-staging-deploy', 'V2_BINDING_ENVIRONMENT');
ok(
  v2Binding.required_secret_name_digest === 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978',
  'V2_BINDING_SECRET_DIGEST',
);
ok(
  JSON.stringify(v2Binding.required_secret_step_names) === JSON.stringify(['Deploy one non-production Workers shadow v2']),
  'V2_BINDING_STEP',
);
ok(
  JSON.stringify(v2Binding.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']),
  'V2_BINDING_TRIGGER',
);
ok(v2Binding.remote_mutation_class === 'REMOTE_STAGING_MUTATION', 'V2_BINDING_MUTATION_CLASS');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) {
  ok(registry.repository_binding_state?.[key] === registry.registered_count, `REGISTRY_BINDING_STATE:${key}`);
}
const derivedPrivilegedStepCount = registry.required_environment_bindings
  .reduce((sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state?.privileged_secret_steps === derivedPrivilegedStepCount, 'REGISTRY_PRIVILEGED_STEP_DRIFT');
ok(derivedPrivilegedStepCount === 27, 'REGISTRY_EXPECTED_PRIVILEGED_STEPS');

const negativeMutations = [
  value => { value.status = 'NOT_AUTHORIZED'; },
  value => { value.authorized_scope.workflow_dispatch_count_max = 2; },
  value => { value.authorized_scope.provider_deployment_attempt_count_max = 2; },
  value => { value.authorized_scope.production_routes_allowed = true; },
  value => { value.authorized_scope.custom_domains_allowed = true; },
  value => { value.authorized_scope.pages_delete_allowed = true; },
  value => { value.replay = 'ALLOWED'; },
];
for (const mutate of negativeMutations) {
  const candidate = structuredClone(auth);
  mutate(candidate);
  const rejected = (
    candidate.status !== 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY'
    || candidate.authorized_scope.workflow_dispatch_count_max !== 1
    || candidate.authorized_scope.provider_deployment_attempt_count_max !== 1
    || candidate.authorized_scope.production_routes_allowed !== false
    || candidate.authorized_scope.custom_domains_allowed !== false
    || candidate.authorized_scope.pages_delete_allowed !== false
    || candidate.replay !== 'FORBIDDEN_AFTER_FIRST_V2_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE'
  );
  ok(rejected, 'NEGATIVE_AUTHORIZATION_MUTATION_ACCEPTED');
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v2-authorized-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: APPROVAL_ID,
  approval_issue: APPROVAL_ISSUE,
  approval_comment_id: APPROVAL_COMMENT_ID,
  authorization_state: auth.status,
  materialized_secret_bearing_workflow_present: true,
  secret_registry_mutated_for_v2: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: derivedPrivilegedStepCount,
  runner_temp_receipt_contract: 'BOUND',
  provider_attempt_marker: 'BOUND',
  always_finalizer: 'BOUND',
  prior_cloudflare_mutation_count: 0,
  current_cloudflare_mutation_count: 0,
  production_routes: 0,
  custom_domains: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
