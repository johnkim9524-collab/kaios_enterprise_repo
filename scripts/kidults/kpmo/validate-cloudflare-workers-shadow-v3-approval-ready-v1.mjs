#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json',
  terminal: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03-terminal.json',
  approvalBody: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03.md',
  workflow: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  credentialContract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  credentialAuth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  credentialTerminal: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json',
  credentialV1Workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  credentialV2Spec: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-v2-spec-v1.json',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs',
  extractorTest: 'tests/kidults/kpmo/github-comment-body-byte-exact-v1.test.mjs',
  config: 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc',
  package: 'tooling/kidults-cloudflare-workers-shadow/package.json',
  lock: 'tooling/kidults-cloudflare-workers-shadow/package-lock.json',
  portal: 'apps/kidults-enterprise-staging/public/portal',
};

const fail = code => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V3_CONSUMED_VALIDATION_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P).filter(value => value !== P.portal)) {
  ok(fs.existsSync(file), `MISSING_FILE:${file}`);
}
ok(fs.existsSync(P.portal), 'PORTAL_MISSING');

const auth = json(P.auth);
const terminal = json(P.terminal);
const approvalBody = read(P.approvalBody);
const workflow = read(P.workflow);
const registry = json(P.registry);
const credentialContract = json(P.credentialContract);
const credentialAuth = json(P.credentialAuth);
const credentialTerminal = json(P.credentialTerminal);
const credentialV1Workflow = read(P.credentialV1Workflow);
const credentialV2Spec = json(P.credentialV2Spec);
const extractor = read(P.extractor);
const extractorTest = read(P.extractorTest);
const configText = read(P.config);
const config = JSON.parse(configText);
const packageJson = json(P.package);
const packageLock = json(P.lock);

// Immutable Workers shadow v3 incident truth.
ok(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
ok(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'AUTH_STATUS');
ok(auth.root_approval_receipt?.comment_id === 5487854388, 'ROOT_APPROVAL_COMMENT');
ok(auth.post_landing_execution_binding_receipt?.comment_id === 5488380368, 'POST_LANDING_BINDING_COMMENT');
ok(auth.post_landing_execution_binding_receipt?.landing_pr_number === 1749, 'LANDING_PR');
ok(auth.post_landing_execution_binding_receipt?.landing_exact_head_sha === '7cd46ac41dd6765fb628a954be6eb8677bb11faa', 'LANDING_HEAD');
ok(auth.post_landing_execution_binding_receipt?.landing_merge_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'LANDING_MERGE');

const consumed = auth.consumption_result || {};
ok(consumed.workflow_run_id === 33465807642, 'CONSUMING_RUN');
ok(consumed.job_id === 99725309548, 'CONSUMING_JOB');
ok(consumed.source_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'CONSUMING_SHA');
ok(consumed.authorization_consumed === true, 'AUTH_NOT_CONSUMED');
ok(consumed.unique_first_dispatch_verified === true, 'UNIQUE_FIRST_DISPATCH');
ok(consumed.locked_wrangler_version === '4.127.1', 'WRANGLER_VERSION');
ok(consumed.locked_wrangler_dry_run_verified === true, 'DRY_RUN');
ok(consumed.dry_run_asset_count === 128, 'DRY_RUN_ASSET_COUNT');
ok(consumed.provider_attempt_marker_written === true, 'PROVIDER_MARKER');
ok(consumed.provider_process_invoked === true, 'PROVIDER_PROCESS');
ok(consumed.provider_deployment_attempt_count === 1, 'PROVIDER_ATTEMPT_COUNT');
ok(consumed.provider_exit_code === 1, 'PROVIDER_EXIT');
ok(consumed.remote_api_request_evidenced === true, 'REMOTE_API_REQUEST');
ok(consumed.cloudflare_error_code === 7003, 'CLOUDFLARE_ERROR_CODE');
ok(consumed.root_cause_class === 'CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH', 'ROOT_CAUSE_CLASS');
ok(consumed.worker_upload_completed === false, 'UPLOAD_TRUTH');
ok(consumed.worker_deployment_success === false, 'DEPLOYMENT_TRUTH');
ok(consumed.deployment_id === null, 'DEPLOYMENT_ID_TRUTH');
ok(consumed.workers_dev_url === null, 'WORKERS_DEV_URL_TRUTH');
ok(consumed.readback_executed === false, 'READBACK_TRUTH');
ok(consumed.remote_mutation_evidenced === false, 'REMOTE_MUTATION_TRUTH');
ok(consumed.artifact_id === 9784793397, 'ARTIFACT_ID');
ok(consumed.artifact_digest === 'sha256:0ab4517f47cfbb2cdf3de1a81e03af981df2dd5285df403dc8b4f611c5267c05', 'ARTIFACT_DIGEST');

ok(auth.tombstone?.zero_executable_authority === true, 'TOMBSTONE_AUTHORITY');
ok(auth.tombstone?.workflow_trigger_removed === true, 'TOMBSTONE_TRIGGER');
ok(auth.tombstone?.secret_registry_membership === false, 'TOMBSTONE_REGISTRY');
ok(auth.tombstone?.environment_bound === false, 'TOMBSTONE_ENVIRONMENT');
ok(auth.tombstone?.secret_references_present === false, 'TOMBSTONE_SECRETS');
ok(auth.tombstone?.checkout_present === false, 'TOMBSTONE_CHECKOUT');
ok(auth.tombstone?.provider_tooling_present === false, 'TOMBSTONE_TOOLING');
ok(auth.tombstone?.network_provider_step_present === false, 'TOMBSTONE_NETWORK');
ok(auth.future_execution?.current_approval_reusable === false, 'AUTH_REUSE');
ok(auth.future_execution?.rerun_authorized === false, 'RERUN');
ok(auth.future_execution?.second_dispatch_authorized === false, 'SECOND_DISPATCH');
ok(auth.future_execution?.separately_approved_read_only_credential_identity_preflight_required === true, 'IDENTITY_PREFLIGHT_REQUIRED');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V3_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');

ok(sha256(approvalBody) === auth.root_approval_receipt.body_sha256, 'APPROVAL_BODY_DIGEST');
ok(approvalBody.includes('CF-WORKERS-SHADOW-20260901-03'), 'APPROVAL_BODY_ID');
ok(approvalBody.includes('rerun·replay·두 번째 dispatch는 승인하지 않습니다.'), 'APPROVAL_BODY_NO_REPLAY');

ok(terminal.state === 'VERIFIED_FAIL_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33465807642 && terminal.job_id === 99725309548, 'TERMINAL_RUN_JOB');
ok(terminal.authorization_consumed === true, 'TERMINAL_CONSUMED');
ok(terminal.provider?.deployment_attempt_count === 1, 'TERMINAL_PROVIDER_COUNT');
ok(terminal.provider?.cloudflare_error_code === 7003, 'TERMINAL_ERROR_CODE');
ok(terminal.provider?.worker_deployment_success === false, 'TERMINAL_DEPLOYMENT');
ok(terminal.provider?.workers_dev_url === null, 'TERMINAL_URL');
ok(terminal.provider?.readback_executed === false, 'TERMINAL_READBACK');
ok(terminal.provider?.remote_mutation_evidenced === false, 'TERMINAL_REMOTE_MUTATION');
ok(terminal.artifact?.id === 9784793397, 'TERMINAL_ARTIFACT_ID');
ok(terminal.artifact?.digest === consumed.artifact_digest, 'TERMINAL_ARTIFACT_DIGEST');
ok(terminal.terminal_controls?.rerun_authorized === false
  && terminal.terminal_controls?.replay_authorized === false
  && terminal.terminal_controls?.second_dispatch_authorized === false, 'TERMINAL_NO_REPLAY');
ok(terminal.release_boundary?.production_routes === 0 && terminal.release_boundary?.custom_domains === 0, 'TERMINAL_TOPOLOGY');
ok(terminal.release_boundary?.public === 'HOLD'
  && terminal.release_boundary?.production === 'HOLD'
  && terminal.release_boundary?.g5 === 'HOLD', 'TERMINAL_HOLD');

// Historical v3 workflow is a zero-authority tombstone.
ok(/^on:\s*\[\]\s*$/m.test(workflow), 'WORKFLOW_NO_TRIGGER');
ok(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH_REINTRODUCED');
ok(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'WORKFLOW_TOMBSTONE_MARKER');
ok(workflow.includes('historical_cloudflare_error_code:7003'), 'WORKFLOW_HISTORICAL_ERROR_TRUTH');
ok(workflow.includes('CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH'), 'WORKFLOW_HISTORICAL_ROOT_CAUSE_TRUTH');
for (const forbidden of [
  'environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@',
  'curl ', 'npm ', 'npx ', 'node_modules/.bin/wrangler',
]) ok(!workflow.includes(forbidden), `WORKFLOW_EXECUTABLE_AUTHORITY:${forbidden}`);
ok(!/^\s+CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)\s*:/m.test(workflow), 'WORKFLOW_SECRET_ENV_BINDING');

// Privileged inventory must exclude both exhausted Workers v3 and credential preflight v1 lanes.
ok(!registry.registered_workflows?.includes(P.workflow), 'REGISTRY_V3_PRESENT');
ok(!registry.registered_workflows?.includes(P.credentialV1Workflow), 'REGISTRY_CREDENTIAL_V1_PRESENT');
ok(!registry.required_environment_bindings?.some(value => value.workflow === P.workflow), 'REGISTRY_V3_BINDING_PRESENT');
ok(!registry.required_environment_bindings?.some(value => value.workflow === P.credentialV1Workflow), 'REGISTRY_CREDENTIAL_V1_BINDING_PRESENT');
ok(registry.registered_count === 22, 'REGISTRY_COUNT');
ok(registry.registered_count === registry.registered_workflows?.length, 'REGISTRY_COUNT_SELF_CONSISTENCY');
ok(registry.registered_count === registry.required_environment_bindings?.length, 'REGISTRY_BINDING_SELF_CONSISTENCY');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0,
);
ok(privilegedSteps === 25, 'REGISTRY_PRIVILEGED_CALCULATED');
ok(registry.repository_binding_state?.privileged_secret_steps === privilegedSteps, 'REGISTRY_PRIVILEGED_RECORDED');
ok(registry.repository_containment?.provider_activation === 'HOLD', 'REGISTRY_PROVIDER_HOLD');

// The corrective credential preflight v1 itself failed before authorization and is permanently closed.
ok(credentialContract.id === 'kidults-cloudflare-workers-shadow-credential-identity-preflight-v1', 'PREFLIGHT_ID');
ok(credentialContract.status === 'V1_PREAUTHORIZATION_SERIALIZATION_FAILURE_CLOSED_V2_REQUIRED', 'PREFLIGHT_STATUS');
ok(credentialContract.v1_terminal?.workflow_run_id === 33478469222, 'PREFLIGHT_RUN');
ok(credentialContract.v1_terminal?.authorization_consumed === false, 'PREFLIGHT_AUTH_CONSUMED');
ok(credentialContract.v1_terminal?.external_read_request_count === 0, 'PREFLIGHT_EXTERNAL_REQUESTS');
ok(credentialContract.v1_terminal?.credential_probe_step === 'SKIPPED', 'PREFLIGHT_PROBE_STEP');
ok(credentialContract.v1_terminal?.failure_code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'PREFLIGHT_FAILURE_CODE');
ok(credentialContract.v1_containment?.secret_registry_membership === false, 'PREFLIGHT_REGISTRY');
ok(credentialContract.v1_containment?.environment === null, 'PREFLIGHT_ENVIRONMENT');
ok(Array.isArray(credentialContract.v1_containment?.secret_references)
  && credentialContract.v1_containment.secret_references.length === 0, 'PREFLIGHT_SECRETS');
ok(credentialContract.v1_containment?.provider_network_path === false, 'PREFLIGHT_NETWORK');
ok(credentialContract.v1_containment?.same_approval_reusable === false, 'PREFLIGHT_APPROVAL_REUSE');
ok(credentialContract.v1_containment?.rerun_authorized === false
  && credentialContract.v1_containment?.replay_authorized === false
  && credentialContract.v1_containment?.second_dispatch_authorized === false, 'PREFLIGHT_NO_REPLAY');
ok(credentialContract.byte_exact_approval_body_contract?.required_extraction === 'NO_ADDED_RECORD_SEPARATOR', 'PREFLIGHT_BYTE_EXACT');
ok(credentialContract.byte_exact_approval_body_contract?.forbidden_implementation === "jq -r '.body' > file", 'PREFLIGHT_FORBIDDEN_EXTRACTOR');
ok(credentialContract.v2_gate?.new_versioned_workflow_required === true
  && credentialContract.v2_gate?.new_explicit_program_owner_approval_required === true, 'PREFLIGHT_V2_GATE');

ok(credentialAuth.status === 'PREAUTHORIZATION_FAILED_NOT_CONSUMED_V1_LANE_EXHAUSTED_NO_EXTERNAL_CALL', 'PREFLIGHT_AUTH_STATUS');
ok(credentialAuth.terminal_result?.workflow_run_id === 33478469222, 'PREFLIGHT_AUTH_RUN');
ok(credentialAuth.terminal_result?.authorization_consumed === false, 'PREFLIGHT_AUTH_NOT_CONSUMED');
ok(credentialAuth.terminal_result?.external_read_request_count === 0, 'PREFLIGHT_AUTH_REQUESTS');
ok(credentialAuth.authority_classification?.same_approval_operationally_reusable === false, 'PREFLIGHT_AUTH_NO_REUSE');
ok(credentialTerminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'PREFLIGHT_TERMINAL_STATE');
ok(credentialTerminal.external_read_request_count === 0, 'PREFLIGHT_TERMINAL_REQUESTS');
ok(credentialTerminal.operational_authority?.v1_lane_exhausted === true, 'PREFLIGHT_TERMINAL_EXHAUSTED');

ok(/^on:\s*\[\]\s*$/m.test(credentialV1Workflow), 'PREFLIGHT_WORKFLOW_NO_TRIGGER');
ok(!credentialV1Workflow.includes('workflow_dispatch'), 'PREFLIGHT_WORKFLOW_DISPATCH');
ok(!credentialV1Workflow.includes('environment:'), 'PREFLIGHT_WORKFLOW_ENVIRONMENT');
ok(!credentialV1Workflow.includes('${{ secrets.'), 'PREFLIGHT_WORKFLOW_SECRETS');
ok(!credentialV1Workflow.includes('curl '), 'PREFLIGHT_WORKFLOW_NETWORK');
ok(credentialV1Workflow.includes('PREAUTHORIZATION_FAILED_V1_LANE_EXHAUSTED_ZERO_EXECUTABLE_AUTHORITY'), 'PREFLIGHT_WORKFLOW_TOMBSTONE');

ok(credentialV2Spec.status === 'DESIGN_READY_EXTERNAL_AUTHORITY_ABSENT', 'PREFLIGHT_V2_SPEC_STATUS');
ok(credentialV2Spec.materialized_workflow === false, 'PREFLIGHT_V2_NOT_MATERIALIZED');
ok(credentialV2Spec.standing_authority === false, 'PREFLIGHT_V2_NO_AUTHORITY');
ok(credentialV2Spec.new_explicit_program_owner_approval_required === true, 'PREFLIGHT_V2_NEW_APPROVAL');
ok(extractor.includes('process.stdout.write(payload.body)'), 'PREFLIGHT_BYTE_EXACT_EXTRACTOR');
ok(extractorTest.includes("execFileSync('jq', ['-r', '.body', oneLfJson])"), 'PREFLIGHT_JQ_RAW_NEGATIVE_TEST');
ok(extractorTest.includes("execFileSync('jq', ['-j', '.body', oneLfJson])"), 'PREFLIGHT_JQ_JOIN_TEST');

// Static Worker configuration and exact tooling remain regression-protected only.
ok(config.name === 'kidults-public-portal-shadow', 'CONFIG_NAME');
ok(config.workers_dev === true && config.preview_urls === false, 'CONFIG_WORKERS_DEV');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES');
ok(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'CONFIG_ASSET_VALUE');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configText.includes(forbidden), `CONFIG_FORBIDDEN:${forbidden}`);
}
const resolvedAssets = path.resolve(path.dirname(path.resolve(P.config)), config.assets.directory);
ok(resolvedAssets === path.resolve(P.portal), 'CONFIG_ASSET_RESOLUTION');
ok(fs.existsSync(path.join(resolvedAssets, 'index.html')), 'PORTAL_INDEX');
ok(fs.existsSync(path.join(resolvedAssets, 'workspace.html')), 'PORTAL_WORKSPACE');
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'PACKAGE_WRANGLER');
ok(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCKED_WRANGLER');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v3-consumed-7003-validation-v3',
  state: 'VERIFIED_PASS',
  workers_shadow_v3_run_id: 33465807642,
  workers_shadow_v3_provider_attempt_count: 1,
  workers_shadow_v3_cloudflare_error_code: 7003,
  workers_shadow_v3_zero_executable_authority: true,
  credential_preflight_v1_run_id: 33478469222,
  credential_preflight_v1_authorization_consumed: false,
  credential_preflight_v1_external_request_count: 0,
  credential_preflight_v1_zero_executable_authority: true,
  credential_preflight_v2_new_approval_required: true,
  byte_exact_comment_body_extractor_required: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  production_routes: 0,
  custom_domains: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
