#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-authorization-20260901-v1.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-02.md';
const TERMINAL_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-02-terminal.json';
const CONTRACT_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-execution-contract-v1.json';
const SPEC_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-workflow-spec-v1.json';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const V1_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const V2_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';

const fail = (message) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V2_CONSUMED_VALIDATION_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));

for (const file of [
  AUTH_PATH,
  APPROVAL_BODY_PATH,
  TERMINAL_PATH,
  CONTRACT_PATH,
  SPEC_PATH,
  REGISTRY_PATH,
  V1_WORKFLOW_PATH,
  V2_WORKFLOW_PATH,
  CONFIG_PATH,
  PACKAGE_PATH,
  LOCK_PATH,
]) ok(fs.existsSync(file), `MISSING_FILE:${file}`);

const auth = parse(AUTH_PATH);
const terminal = parse(TERMINAL_PATH);
const contract = parse(CONTRACT_PATH);
const spec = parse(SPEC_PATH);
const registry = parse(REGISTRY_PATH);
const v1Workflow = read(V1_WORKFLOW_PATH);
const v2Workflow = read(V2_WORKFLOW_PATH);
const configRaw = read(CONFIG_PATH);
const config = JSON.parse(configRaw);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);
const approvalBody = read(APPROVAL_BODY_PATH);

ok(auth.id === 'CF-WORKERS-SHADOW-20260901-02', 'AUTH_ID');
ok(auth.status === 'CONSUMED_FAIL_CLOSED_LOCAL_CONFIG_VALIDATION_NO_REMOTE_MUTATION_EVIDENCED', 'AUTH_CONSUMED_STATE');
ok(auth.authorization_receipt?.comment_id === 5481462895, 'AUTH_COMMENT_ID');
ok(auth.authorization_receipt?.comment_node_id === 'IC_kwDOTF-G-M8AAAABRrh8bw', 'AUTH_COMMENT_NODE_ID');
ok(auth.consumption_result?.workflow_run_id === 33417453349, 'AUTH_RUN_ID');
ok(auth.consumption_result?.job_id === 99571430841, 'AUTH_JOB_ID');
ok(auth.consumption_result?.source_sha === '5bed9c28aa0b5071de53a86535af8cd72c583ea1', 'AUTH_SOURCE_SHA');
ok(auth.consumption_result?.authorization_consumed === true, 'AUTH_CONSUMED');
ok(auth.consumption_result?.provider_attempt_marker_written === true, 'AUTH_PROVIDER_MARKER');
ok(auth.consumption_result?.provider_process_invoked === true, 'AUTH_PROVIDER_PROCESS');
ok(auth.consumption_result?.provider_deployment_attempt_count === 1, 'AUTH_PROVIDER_ATTEMPT_COUNT');
ok(auth.consumption_result?.wrangler_version === '4.127.1', 'AUTH_WRANGLER_VERSION');
ok(auth.consumption_result?.wrangler_exit_code === 1, 'AUTH_WRANGLER_EXIT');
ok(auth.consumption_result?.failure_code === 'WRANGLER_ASSETS_DIRECTORY_NOT_FOUND_RELATIVE_TO_CONFIG', 'AUTH_FAILURE_CODE');
ok(auth.consumption_result?.remote_api_request_evidenced === false, 'AUTH_REMOTE_REQUEST_EVIDENCE');
ok(auth.consumption_result?.workers_dev_url === null, 'AUTH_WORKERS_DEV_URL');
ok(auth.consumption_result?.readback_executed === false, 'AUTH_READBACK');
ok(auth.future_execution?.current_approval_reusable === false, 'AUTH_NOT_REUSABLE');
ok(auth.future_execution?.rerun_authorized === false, 'AUTH_RERUN_FORBIDDEN');
ok(auth.future_execution?.second_dispatch_authorized === false, 'AUTH_SECOND_DISPATCH_FORBIDDEN');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_V2_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'AUTH_REPLAY');

ok(terminal.state === 'CONSUMED_FAIL_CLOSED_LOCAL_CONFIG_VALIDATION_NO_REMOTE_MUTATION_EVIDENCED', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33417453349, 'TERMINAL_RUN_ID');
ok(terminal.job_id === 99571430841, 'TERMINAL_JOB_ID');
ok(terminal.provider_attempt_marker_written === true, 'TERMINAL_MARKER');
ok(terminal.provider_process_invoked === true, 'TERMINAL_PROVIDER_PROCESS');
ok(terminal.provider_deployment_attempt_count === 1, 'TERMINAL_PROVIDER_ATTEMPT');
ok(terminal.provider_exit_code === 1, 'TERMINAL_EXIT');
ok(terminal.failure?.stage === 'LOCAL_ASSETS_DIRECTORY_VALIDATION', 'TERMINAL_FAILURE_STAGE');
ok(terminal.remote_api_request_evidenced === false, 'TERMINAL_REMOTE_REQUEST_EVIDENCE');
ok(terminal.cloudflare_mutation_count_verified === null, 'TERMINAL_NO_FALSE_MUTATION_COUNT');
ok(terminal.workers_dev_url === null, 'TERMINAL_NO_URL');
ok(terminal.readback_executed === false, 'TERMINAL_NO_READBACK');
ok(terminal.artifact?.id === 9767560816, 'TERMINAL_ARTIFACT_ID');
ok(terminal.artifact?.digest === 'sha256:71d36043dfc6ea863a9a5977059b5f45559c2d9fae8f5068fa85de3b0d21ed2c', 'TERMINAL_ARTIFACT_DIGEST');
ok(terminal.replay_authorized === false && terminal.rerun_authorized === false && terminal.second_dispatch_authorized === false, 'TERMINAL_NO_REPLAY');

ok(contract.status === 'CONSUMED_FAIL_CLOSED_LOCAL_CONFIG_VALIDATION', 'CONTRACT_STATE');
ok(contract.authorization?.authorized === false, 'CONTRACT_NOT_AUTHORIZED');
ok(contract.authorization?.consumed === true, 'CONTRACT_CONSUMED');
ok(contract.implementation_state?.workflow_permanently_tombstoned === true, 'CONTRACT_TOMBSTONED');
ok(contract.implementation_state?.provider_mutation_authorized === false, 'CONTRACT_PROVIDER_UNAUTHORIZED');
ok(contract.root_cause?.id === 'WRANGLER_CONFIG_RELATIVE_ASSET_PATH_NOT_MODELED', 'CONTRACT_ROOT_CAUSE');
ok(contract.remediation?.config_path_corrected === true, 'CONTRACT_CONFIG_FIXED');
ok(contract.remediation?.locked_wrangler_dry_run_gate_added === true, 'CONTRACT_DRY_RUN_GATE');
ok(contract.future_execution?.current_approval_reusable === false, 'CONTRACT_APPROVAL_NOT_REUSABLE');
ok(contract.release_boundary?.public === 'HOLD' && contract.release_boundary?.production === 'HOLD' && contract.release_boundary?.g5 === 'HOLD', 'CONTRACT_RELEASE_HOLD');

ok(spec.status === 'CONSUMED_PERMANENT_NON_EXECUTING_TOMBSTONE', 'SPEC_STATE');
ok(spec.workflow_executable === false, 'SPEC_NOT_EXECUTABLE');
ok(spec.job_condition === '${{ false }}', 'SPEC_JOB_FALSE');
ok(spec.provider_mutation_authorized === false, 'SPEC_PROVIDER_UNAUTHORIZED');
ok(spec.asset_resolution?.wrangler_semantics === 'DIRECTORY_RELATIVE_TO_WRANGLER_CONFIGURATION_FILE', 'SPEC_ASSET_SEMANTICS');
ok(spec.asset_resolution?.locked_wrangler_dry_run_required === true, 'SPEC_DRY_RUN_REQUIRED');

ok(v1Workflow.includes('if: ${{ false }}'), 'V1_TOMBSTONE_REQUIRED');
ok(v2Workflow.includes('if: ${{ false }}'), 'V2_TOMBSTONE_REQUIRED');
ok(v2Workflow.includes('CONSUMED_V2_TOMBSTONE_NO_REPLAY'), 'V2_TOMBSTONE_MARKER');
ok(v2Workflow.includes('Verify live main before provider credential resolution'), 'V2_LIVE_MAIN_GUARD');
ok(v2Workflow.includes('$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main'), 'V2_LIVE_MAIN_ENDPOINT');
ok(v2Workflow.includes('Deploy one non-production Workers shadow v2'), 'V2_REGISTERED_SECRET_STEP');
ok(!v2Workflow.includes('node_modules/.bin/wrangler deploy'), 'V2_PROVIDER_COMMAND_REMOVED');
ok(!v2Workflow.includes('npx '), 'V2_NPX_FORBIDDEN');

const secretNames = [...v2Workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)]
  .map((match) => match[1])
  .sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'V2_SECRET_SET');

ok(config.name === 'kidults-public-portal-shadow', 'CONFIG_NAME');
ok(config.workers_dev === true, 'CONFIG_WORKERS_DEV');
ok(config.preview_urls === false, 'CONFIG_PREVIEW_URLS');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES_ZERO');
ok(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'CONFIG_ASSET_VALUE');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configRaw.includes(forbidden), `CONFIG_FORBIDDEN_AUTHORITY:${forbidden}`);
}

const configDirectory = path.dirname(path.resolve(CONFIG_PATH));
const resolvedAssets = path.resolve(configDirectory, config.assets.directory);
const expectedAssets = path.resolve(PORTAL_PATH);
const legacyBadResolvedAssets = path.resolve(configDirectory, 'apps/kidults-enterprise-staging/public/portal');
ok(resolvedAssets === expectedAssets, 'CONFIG_RELATIVE_RESOLUTION');
ok(fs.statSync(resolvedAssets).isDirectory(), 'CONFIG_RESOLVED_DIRECTORY_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'index.html')), 'CONFIG_RESOLVED_INDEX_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'workspace.html')), 'CONFIG_RESOLVED_WORKSPACE_EXISTS');
ok(legacyBadResolvedAssets !== expectedAssets, 'LEGACY_BAD_PATH_MUST_DIFFER');
ok(!fs.existsSync(legacyBadResolvedAssets), 'LEGACY_BAD_PATH_MUST_NOT_EXIST');

ok(registry.registered_workflows?.includes(V2_WORKFLOW_PATH), 'REGISTRY_V2_RETAINED');
ok(registry.registered_count === 24, 'REGISTRY_COUNT');
ok(registry.repository_binding_state?.environment_bound_secret_bearing_jobs === 24, 'REGISTRY_ENV_COUNT');
ok(registry.repository_binding_state?.exact_main_guarded_secret_bearing_jobs === 24, 'REGISTRY_MAIN_GUARD_COUNT');
ok(registry.repository_binding_state?.live_main_sha_guarded_secret_bearing_jobs === 24, 'REGISTRY_LIVE_MAIN_COUNT');
ok(registry.repository_binding_state?.step_scoped_secret_bearing_jobs === 24, 'REGISTRY_STEP_SCOPE_COUNT');
ok(registry.repository_binding_state?.privileged_secret_steps === 27, 'REGISTRY_SECRET_STEP_COUNT');

ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_PACKAGE_EXACT');
ok(packageLock.lockfileVersion === 3, 'WRANGLER_LOCKFILE_VERSION');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'WRANGLER_LOCK_EXACT');

ok(approvalBody.includes('**Approval ID:** `CF-WORKERS-SHADOW-20260901-02`'), 'APPROVAL_BODY_ID');
ok(approvalBody.includes('maximum provider deployment attempts: **1**'), 'APPROVAL_BODY_ATTEMPT');
ok(approvalBody.includes('Production routes allowed: **0**'), 'APPROVAL_BODY_ROUTE_BOUND');
ok(approvalBody.includes('custom domains allowed: **0**'), 'APPROVAL_BODY_DOMAIN_BOUND');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v2-consumed-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  authorization_state: auth.status,
  workflow_run_id: terminal.workflow_run_id,
  provider_process_invoked: true,
  provider_deployment_attempt_count: 1,
  remote_api_request_evidenced: false,
  cloudflare_mutation_count_verified: null,
  workers_dev_url: null,
  v2_workflow_tombstoned: true,
  config_relative_asset_path_verified: true,
  resolved_assets_directory: path.relative(process.cwd(), resolvedAssets),
  locked_wrangler_version: '4.127.1',
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: registry.repository_binding_state.privileged_secret_steps,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
