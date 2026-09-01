#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json';
const TERMINAL_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03-terminal.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03.md';
const PREFLIGHT_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';

const fail = (code) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V3_CONSUMED_VALIDATION_FAIL:${code}`); };
const assert = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of [
  AUTH_PATH,
  TERMINAL_PATH,
  APPROVAL_BODY_PATH,
  PREFLIGHT_PATH,
  WORKFLOW_PATH,
  REGISTRY_PATH,
  CONFIG_PATH,
  PACKAGE_PATH,
  LOCK_PATH,
]) assert(fs.existsSync(file), `MISSING_FILE:${file}`);

const auth = parse(AUTH_PATH);
const terminal = parse(TERMINAL_PATH);
const approvalBody = read(APPROVAL_BODY_PATH);
const preflight = parse(PREFLIGHT_PATH);
const workflow = read(WORKFLOW_PATH);
const registry = parse(REGISTRY_PATH);
const configText = read(CONFIG_PATH);
const config = JSON.parse(configText);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);

assert(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
assert(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'AUTH_STATUS');
assert(auth.root_approval_receipt?.comment_id === 5487854388, 'ROOT_APPROVAL_COMMENT');
assert(auth.post_landing_execution_binding_receipt?.comment_id === 5488380368, 'POST_LANDING_BINDING_COMMENT');
assert(auth.post_landing_execution_binding_receipt?.landing_pr_number === 1749, 'LANDING_PR');
assert(auth.post_landing_execution_binding_receipt?.landing_exact_head_sha === '7cd46ac41dd6765fb628a954be6eb8677bb11faa', 'LANDING_HEAD');
assert(auth.post_landing_execution_binding_receipt?.landing_merge_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'LANDING_MERGE');

const consumption = auth.consumption_result || {};
assert(consumption.workflow_run_id === 33465807642, 'CONSUMING_RUN');
assert(consumption.job_id === 99725309548, 'CONSUMING_JOB');
assert(consumption.source_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'CONSUMING_SHA');
assert(consumption.authorization_consumed === true, 'AUTH_NOT_CONSUMED');
assert(consumption.unique_first_dispatch_verified === true, 'UNIQUE_FIRST_DISPATCH');
assert(consumption.locked_wrangler_version === '4.127.1', 'WRANGLER_VERSION');
assert(consumption.locked_wrangler_dry_run_verified === true, 'DRY_RUN');
assert(consumption.dry_run_asset_count === 128, 'DRY_RUN_ASSET_COUNT');
assert(consumption.provider_attempt_marker_written === true, 'PROVIDER_MARKER');
assert(consumption.provider_process_invoked === true, 'PROVIDER_PROCESS');
assert(consumption.provider_deployment_attempt_count === 1, 'PROVIDER_ATTEMPT_COUNT');
assert(consumption.provider_exit_code === 1, 'PROVIDER_EXIT');
assert(consumption.remote_api_request_evidenced === true, 'REMOTE_API_REQUEST');
assert(consumption.cloudflare_error_code === 7003, 'CLOUDFLARE_ERROR_CODE');
assert(consumption.root_cause_class === 'CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH', 'ROOT_CAUSE_CLASS');
assert(consumption.worker_upload_completed === false, 'UPLOAD_TRUTH');
assert(consumption.worker_deployment_success === false, 'DEPLOYMENT_TRUTH');
assert(consumption.deployment_id === null, 'DEPLOYMENT_ID_TRUTH');
assert(consumption.workers_dev_url === null, 'WORKERS_DEV_URL_TRUTH');
assert(consumption.readback_executed === false, 'READBACK_TRUTH');
assert(consumption.remote_mutation_evidenced === false, 'REMOTE_MUTATION_TRUTH');
assert(consumption.artifact_id === 9784793397, 'ARTIFACT_ID');
assert(consumption.artifact_digest === 'sha256:0ab4517f47cfbb2cdf3de1a81e03af981df2dd5285df403dc8b4f611c5267c05', 'ARTIFACT_DIGEST');

assert(auth.tombstone?.zero_executable_authority === true, 'TOMBSTONE_AUTHORITY');
assert(auth.tombstone?.workflow_trigger_removed === true, 'TOMBSTONE_TRIGGER');
assert(auth.tombstone?.secret_registry_membership === false, 'TOMBSTONE_REGISTRY');
assert(auth.tombstone?.environment_bound === false, 'TOMBSTONE_ENVIRONMENT');
assert(auth.tombstone?.secret_references_present === false, 'TOMBSTONE_SECRETS');
assert(auth.tombstone?.checkout_present === false, 'TOMBSTONE_CHECKOUT');
assert(auth.tombstone?.provider_tooling_present === false, 'TOMBSTONE_TOOLING');
assert(auth.tombstone?.network_provider_step_present === false, 'TOMBSTONE_NETWORK');
assert(auth.future_execution?.current_approval_reusable === false, 'AUTH_REUSE');
assert(auth.future_execution?.rerun_authorized === false, 'RERUN');
assert(auth.future_execution?.second_dispatch_authorized === false, 'SECOND_DISPATCH');
assert(auth.future_execution?.environment_secret_correction_required === true, 'SECRET_CORRECTION');
assert(auth.future_execution?.separately_approved_read_only_credential_identity_preflight_required === true, 'IDENTITY_PREFLIGHT_REQUIRED');
assert(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V3_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');

assert(sha256(approvalBody) === auth.root_approval_receipt.body_sha256, 'APPROVAL_BODY_DIGEST');
assert(approvalBody.includes('CF-WORKERS-SHADOW-20260901-03'), 'APPROVAL_BODY_ID');
assert(approvalBody.includes('rerun·replay·두 번째 dispatch는 승인하지 않습니다.'), 'APPROVAL_BODY_NO_REPLAY');

assert(terminal.state === 'VERIFIED_FAIL_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'TERMINAL_STATE');
assert(terminal.workflow_run_id === 33465807642, 'TERMINAL_RUN');
assert(terminal.job_id === 99725309548, 'TERMINAL_JOB');
assert(terminal.authorization_consumed === true, 'TERMINAL_CONSUMED');
assert(terminal.preflight?.locked_wrangler_dry_run === 'PASS', 'TERMINAL_DRY_RUN');
assert(terminal.preflight?.dry_run_asset_count === 128, 'TERMINAL_DRY_RUN_ASSET_COUNT');
assert(terminal.provider?.attempt_marker_written === true, 'TERMINAL_MARKER');
assert(terminal.provider?.process_invoked === true, 'TERMINAL_PROVIDER_PROCESS');
assert(terminal.provider?.deployment_attempt_count === 1, 'TERMINAL_PROVIDER_COUNT');
assert(terminal.provider?.cloudflare_error_code === 7003, 'TERMINAL_ERROR_CODE');
assert(terminal.provider?.root_cause_class === 'CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH', 'TERMINAL_ROOT_CAUSE');
assert(terminal.provider?.worker_upload_completed === false, 'TERMINAL_UPLOAD');
assert(terminal.provider?.worker_deployment_success === false, 'TERMINAL_DEPLOYMENT');
assert(terminal.provider?.deployment_id === null, 'TERMINAL_DEPLOYMENT_ID');
assert(terminal.provider?.workers_dev_url === null, 'TERMINAL_URL');
assert(terminal.provider?.readback_executed === false, 'TERMINAL_READBACK');
assert(terminal.provider?.remote_mutation_evidenced === false, 'TERMINAL_REMOTE_MUTATION');
assert(terminal.artifact?.id === 9784793397, 'TERMINAL_ARTIFACT_ID');
assert(terminal.artifact?.digest === 'sha256:0ab4517f47cfbb2cdf3de1a81e03af981df2dd5285df403dc8b4f611c5267c05', 'TERMINAL_ARTIFACT_DIGEST');
assert(terminal.terminal_controls?.replay_authorized === false, 'TERMINAL_REPLAY');
assert(terminal.terminal_controls?.rerun_authorized === false, 'TERMINAL_RERUN');
assert(terminal.terminal_controls?.second_dispatch_authorized === false, 'TERMINAL_SECOND_DISPATCH');
assert(terminal.release_boundary?.production_routes === 0 && terminal.release_boundary?.custom_domains === 0, 'TERMINAL_TOPOLOGY');
assert(terminal.release_boundary?.public === 'HOLD' && terminal.release_boundary?.production === 'HOLD' && terminal.release_boundary?.g5 === 'HOLD', 'TERMINAL_HOLD');

// Tombstone validation distinguishes executable authority from historical diagnostic text.
// A literal root-cause class may contain secret *names*; that is not a secret binding.
assert(/^on:\s*\[\]\n\npermissions:\n  contents: read\n/m.test(workflow), 'WORKFLOW_NO_TRIGGER');
assert(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH_REINTRODUCED');
assert(workflow.includes('runs-on: ubuntu-24.04'), 'WORKFLOW_RUNNER');
assert(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'WORKFLOW_TOMBSTONE_MARKER');
assert(workflow.includes('historical_cloudflare_error_code:7003'), 'WORKFLOW_HISTORICAL_ERROR_TRUTH');
assert(workflow.includes('CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH'), 'WORKFLOW_HISTORICAL_ROOT_CAUSE_TRUTH');
assert(workflow.includes('Upload consumed authorization tombstone'), 'WORKFLOW_TOMBSTONE_ARTIFACT');
const uploadIndex = workflow.indexOf('Upload consumed authorization tombstone');
const redIndex = workflow.indexOf('Enforce consumed authorization no replay');
assert(uploadIndex >= 0 && redIndex > uploadIndex, 'WORKFLOW_UPLOAD_BEFORE_RED');
for (const forbidden of [
  'environment:',
  '${{ secrets.',
  'actions/checkout@',
  'actions/setup-node@',
  'curl ',
  'npm ',
  'npx ',
  'node_modules/.bin/wrangler',
]) assert(!workflow.includes(forbidden), `WORKFLOW_EXECUTABLE_AUTHORITY:${forbidden}`);
assert(!/^\s+CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)\s*:/m.test(workflow), 'WORKFLOW_SECRET_ENV_BINDING');

assert(!registry.registered_workflows?.includes(WORKFLOW_PATH), 'REGISTRY_V3_PRESENT');
assert(!registry.required_environment_bindings?.some((binding) => binding.workflow === WORKFLOW_PATH), 'REGISTRY_V3_BINDING_PRESENT');
assert(registry.registered_count === 22, 'REGISTRY_COUNT');
assert(registry.registered_workflows?.length === 22, 'REGISTRY_WORKFLOW_LENGTH');
assert(registry.required_environment_bindings?.length === 22, 'REGISTRY_BINDING_LENGTH');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) assert(registry.repository_binding_state?.[key] === 22, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, binding) => sum + (binding.required_secret_step_names?.length || 0),
  0,
);
assert(privilegedSteps === 25, 'REGISTRY_PRIVILEGED_CALCULATED');
assert(registry.repository_binding_state?.privileged_secret_steps === 25, 'REGISTRY_PRIVILEGED_RECORDED');
assert(registry.repository_containment?.provider_activation === 'HOLD', 'REGISTRY_PROVIDER_HOLD');

assert(preflight.id === 'kidults-cloudflare-workers-shadow-credential-identity-preflight-v1', 'PREFLIGHT_ID');
assert(preflight.status === 'MANDATORY_BEFORE_ANY_FUTURE_WORKERS_SHADOW_DEPLOYMENT_APPROVAL', 'PREFLIGHT_STATUS');
assert(preflight.authority?.standing_execution_authority === false, 'PREFLIGHT_STANDING_AUTHORITY');
assert(preflight.authority?.separate_explicit_program_owner_approval_required === true, 'PREFLIGHT_APPROVAL_REQUIRED');
assert(preflight.authority?.read_only_external_calls_only === true, 'PREFLIGHT_READ_ONLY');
assert(preflight.authority?.worker_mutation_allowed === false, 'PREFLIGHT_MUTATION');
assert(preflight.github_secret_boundary?.environment === 'kidults-cloudflare-staging-deploy', 'PREFLIGHT_ENVIRONMENT');
assert(preflight.github_secret_boundary?.environment_level_value_is_authoritative_when_duplicate_names_exist === true, 'PREFLIGHT_SECRET_PRECEDENCE');
assert(preflight.maximum_external_read_requests === 3, 'PREFLIGHT_REQUEST_BOUND');
assert(preflight.required_preflight_sequence?.length === 4, 'PREFLIGHT_SEQUENCE_LENGTH');
assert(preflight.required_preflight_sequence?.every((step, index) => step.order === index + 1), 'PREFLIGHT_SEQUENCE_ORDER');
assert(preflight.pass_condition?.cloudflare_error_7003_observed === false, 'PREFLIGHT_7003_REJECTION');
assert(preflight.pass_condition?.worker_mutation_count === 0, 'PREFLIGHT_ZERO_MUTATION');
assert(preflight.future_deployment_gate?.new_versioned_workflow_required === true, 'PREFLIGHT_NEW_VERSION');
assert(preflight.future_deployment_gate?.new_explicit_program_owner_deployment_approval_required === true, 'PREFLIGHT_NEW_APPROVAL');

assert(config.name === 'kidults-public-portal-shadow', 'CONFIG_NAME');
assert(config.workers_dev === true && config.preview_urls === false, 'CONFIG_WORKERS_DEV');
assert(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES');
assert(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'CONFIG_ASSET_VALUE');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  assert(!configText.includes(forbidden), `CONFIG_FORBIDDEN:${forbidden}`);
}
const resolvedAssets = path.resolve(path.dirname(path.resolve(CONFIG_PATH)), config.assets.directory);
assert(resolvedAssets === path.resolve(PORTAL_PATH), 'CONFIG_ASSET_RESOLUTION');
assert(fs.existsSync(path.join(resolvedAssets, 'index.html')), 'PORTAL_INDEX');
assert(fs.existsSync(path.join(resolvedAssets, 'workspace.html')), 'PORTAL_WORKSPACE');

assert(packageJson.devDependencies?.wrangler === '4.127.1', 'PACKAGE_WRANGLER');
assert(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
assert(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCKED_WRANGLER');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v3-consumed-7003-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  authorization_state: auth.status,
  workflow_run_id: terminal.workflow_run_id,
  provider_process_invoked: true,
  provider_deployment_attempt_count: 1,
  cloudflare_error_code: 7003,
  worker_deployment_success: false,
  workers_dev_url: null,
  remote_mutation_evidenced: false,
  v3_zero_executable_authority: true,
  credential_identity_preflight_required: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  production_routes: 0,
  custom_domains: 0,
  pages_delete: 'FORBIDDEN',
  pages_domain_detach: 'FORBIDDEN',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
