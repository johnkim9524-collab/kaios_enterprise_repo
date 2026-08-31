#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-one-shot-authorization-20260831-v1.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260831-01.md';
const TERMINAL_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260831-01-terminal.json';
const LIFETIME_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-receipt-lifetime-contract-v1.json';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const TEST_PATH = 'tests/kidults/kpmo/cloudflare-workers-shadow-receipt-lifetime-v1.test.mjs';
const ASSET_TEST_PATH = 'tests/kidults/kpmo/cloudflare-workers-shadow-assets-resolution-v1.test.mjs';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';
const APPROVAL_ID = 'CF-WORKERS-SHADOW-20260831-01';

const fail = message => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_CONSUMED_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };
const read = file => fs.readFileSync(file, 'utf8');
const parse = file => JSON.parse(read(file));

for (const file of [
  AUTH_PATH,
  APPROVAL_BODY_PATH,
  TERMINAL_PATH,
  LIFETIME_PATH,
  WORKFLOW_PATH,
  CONFIG_PATH,
  PACKAGE_PATH,
  LOCK_PATH,
  TEST_PATH,
  ASSET_TEST_PATH,
]) ok(fs.existsSync(file), `MISSING_FILE:${file}`);

const auth = parse(AUTH_PATH);
const approvalBody = read(APPROVAL_BODY_PATH);
const terminal = parse(TERMINAL_PATH);
const lifetime = parse(LIFETIME_PATH);
const workflow = read(WORKFLOW_PATH);
const configRaw = read(CONFIG_PATH);
const config = JSON.parse(configRaw);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);

ok(auth.id === APPROVAL_ID, 'APPROVAL_ID');
ok(auth.status === 'CONSUMED_FAIL_CLOSED_PRE_PROVIDER_NO_MUTATION', 'APPROVAL_NOT_CONSUMED');
ok(auth.authorization_receipt?.comment_id === 5480203136, 'ORIGINAL_APPROVAL_RECEIPT_DRIFT');
ok(auth.authorization_receipt?.created_at === '2026-08-31T15:00:24Z', 'ORIGINAL_APPROVAL_TIMESTAMP_DRIFT');
ok(auth.authorized_scope?.dispatch_count_max === 1, 'ORIGINAL_DISPATCH_BOUND_DRIFT');
ok(auth.authorized_scope?.provider_deployment_attempt_count_max === 1, 'ORIGINAL_PROVIDER_ATTEMPT_BOUND_DRIFT');
ok(auth.authorized_scope?.authorization_consumed_on === 'FIRST_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'CONSUMPTION_RULE_DRIFT');
ok(auth.consumption_result?.workflow_run_id === 33410598558, 'CONSUMED_RUN_ID');
ok(auth.consumption_result?.run_attempt === 1, 'CONSUMED_RUN_ATTEMPT');
ok(auth.consumption_result?.source_sha === 'e5efb9435e4a8847927791ae4fc9b580b75506c1', 'CONSUMED_SOURCE_SHA');
ok(auth.consumption_result?.provider_step === 'SKIPPED', 'PROVIDER_STEP_TRUTH');
ok(auth.consumption_result?.provider_mutation_attempted === false, 'PROVIDER_MUTATION_TRUTH');
ok(auth.consumption_result?.provider_deployment_attempt_count === 0, 'PROVIDER_ATTEMPT_COUNT_TRUTH');
ok(auth.consumption_result?.failure_code === 'RECEIPT_REMOVED_BY_CHECKOUT_CLEAN', 'FAILURE_CODE');
ok(auth.tombstone?.workflow_job_permanently_disabled === true, 'TOMBSTONE_DISABLED');
ok(auth.tombstone?.job_condition === '${{ false }}', 'TOMBSTONE_CONDITION');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');

ok(approvalBody.endsWith('\n'), 'APPROVAL_BODY_FINAL_NEWLINE');
ok(approvalBody.includes(`**Approval ID:** \`${APPROVAL_ID}\``), 'APPROVAL_BODY_ID');
ok(approvalBody.includes('authorization is consumed when the governed workflow is dispatched, whether the run passes or fails'), 'APPROVAL_BODY_CONSUMPTION');

ok(terminal.approval_id === APPROVAL_ID, 'TERMINAL_APPROVAL_ID');
ok(terminal.state === 'CONSUMED_FAIL_CLOSED_PRE_PROVIDER_NO_MUTATION', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33410598558, 'TERMINAL_RUN_ID');
ok(terminal.job_id === 99548916282, 'TERMINAL_JOB_ID');
ok(terminal.source_sha === 'e5efb9435e4a8847927791ae4fc9b580b75506c1', 'TERMINAL_SOURCE_SHA');
ok(terminal.authorization_consumed === true, 'TERMINAL_CONSUMPTION');
ok(terminal.provider_step === 'SKIPPED', 'TERMINAL_PROVIDER_STEP');
ok(terminal.provider_secret_step_executed === false, 'TERMINAL_PROVIDER_SECRET_STEP');
ok(terminal.provider_mutation_attempted === false, 'TERMINAL_PROVIDER_MUTATION');
ok(terminal.provider_deployment_attempt_count === 0, 'TERMINAL_PROVIDER_ATTEMPT_COUNT');
ok(terminal.cloudflare_mutation_count === 0, 'TERMINAL_CLOUDFLARE_MUTATION_COUNT');
ok(terminal.replay_authorized === false, 'TERMINAL_REPLAY');
ok(terminal.production_routes === 0 && terminal.custom_domains === 0, 'TERMINAL_TOPOLOGY');
ok(terminal.public === 'HOLD' && terminal.production === 'HOLD' && terminal.g5 === 'HOLD', 'TERMINAL_RELEASE_BOUNDARY');

ok(lifetime.id === 'kidults-cloudflare-workers-shadow-receipt-lifetime-contract-v1', 'LIFETIME_ID');
ok(lifetime.status === 'MANDATORY_FOR_ANY_FUTURE_WORKERS_SHADOW_ONE_SHOT', 'LIFETIME_STATUS');
ok(lifetime.canonical_receipt_location === 'RUNNER_TEMP_OUTSIDE_GITHUB_WORKSPACE', 'LIFETIME_LOCATION');
for (const control of [
  'CANONICAL_RECEIPT_CREATED_UNDER_RUNNER_TEMP',
  'CHECKOUT_CLEAN_CANNOT_DELETE_CANONICAL_RECEIPT',
  'ALWAYS_FINALIZER_CREATES_FALLBACK_TERMINAL_RECEIPT_WHEN_MISSING',
  'UPLOAD_ARTIFACT_READS_FROM_RUNNER_TEMP',
  'CHECKOUT_CLEAN_LIFETIME_REGRESSION_TEST_PASSES',
]) ok(lifetime.required_controls?.includes(control), `LIFETIME_CONTROL:${control}`);
ok(lifetime.future_execution?.current_approval_reusable === false, 'CURRENT_APPROVAL_REUSE');
ok(lifetime.future_execution?.new_explicit_approval_required === true, 'FUTURE_APPROVAL_REQUIRED');
ok(lifetime.future_execution?.new_versioned_workflow_required === true, 'FUTURE_VERSIONED_WORKFLOW_REQUIRED');

ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(workflow), 'MANUAL_TRIGGER_PERMISSION');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  schedule:', '\n  workflow_run:', '\n  repository_dispatch:']) {
  ok(!workflow.includes(forbiddenTrigger), `FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
}
ok(workflow.includes('if: ${{ false }}'), 'PERMANENT_TOMBSTONE_CONDITION');
ok(workflow.includes('environment: kidults-cloudflare-staging-deploy'), 'ENVIRONMENT_BINDING');
ok(workflow.includes('Verify live main before provider credential resolution'), 'LIVE_MAIN_GUARD');
ok(workflow.includes('test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"'), 'LIVE_MAIN_SHA_BINDING');
ok(workflow.includes('Verify consumed approval tombstone'), 'TOMBSTONE_VERIFICATION_STEP');
ok(workflow.includes('CONSUMED_ONE_SHOT_TOMBSTONE_NO_PROVIDER_MUTATION'), 'TOMBSTONE_MARKER');
ok(workflow.includes('Deploy one non-production Workers shadow'), 'REGISTERED_SECRET_STEP_NAME');
ok(!workflow.includes('wrangler deploy'), 'PROVIDER_COMMAND_REMAINS_IN_TOMBSTONE');
ok(!workflow.includes('api.cloudflare.com'), 'CLOUDFLARE_API_REMAINS_IN_TOMBSTONE');
ok(!workflow.includes('workers.dev shadow read-back'), 'READBACK_COMMAND_REMAINS_IN_TOMBSTONE');
ok(workflow.includes('actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8'), 'CHECKOUT_PIN');

const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)]
  .map(match => match[1])
  .sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'SECRET_NAME_SET');
const providerStepStart = workflow.indexOf('      - name: Deploy one non-production Workers shadow');
ok(providerStepStart >= 0, 'PROVIDER_STEP_BOUNDARY');
ok(!workflow.slice(0, providerStepStart).includes('${{ secrets.'), 'SECRET_BEFORE_PROVIDER_STEP');

ok(config.name === 'kidults-public-portal-shadow', 'WORKER_NAME');
ok(config.workers_dev === true, 'WORKERS_DEV_REQUIRED');
ok(config.preview_urls === false, 'PREVIEW_URLS_FORBIDDEN');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'PRODUCTION_ROUTE_ATTACHED');
ok(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'PORTAL_ASSET_SOURCE_CONFIG_RELATIVE');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configRaw.includes(forbidden), `FORBIDDEN_CONFIG_AUTHORITY:${forbidden}`);
}
const configDirectory = path.dirname(path.resolve(CONFIG_PATH));
const resolvedAssets = path.resolve(configDirectory, config.assets.directory);
const expectedAssets = path.resolve(PORTAL_PATH);
const legacyBadResolvedAssets = path.resolve(configDirectory, 'apps/kidults-enterprise-staging/public/portal');
ok(resolvedAssets === expectedAssets, 'PORTAL_ASSET_RESOLUTION');
ok(fs.statSync(resolvedAssets).isDirectory(), 'PORTAL_ASSET_DIRECTORY_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'index.html')), 'PORTAL_INDEX_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'workspace.html')), 'PORTAL_WORKSPACE_EXISTS');
ok(!fs.existsSync(legacyBadResolvedAssets), 'LEGACY_BAD_PATH_REJECTED');

ok(packageJson.name === 'kidults-cloudflare-workers-shadow-tooling', 'TOOLING_PACKAGE');
ok(packageJson.private === true, 'TOOLING_PRIVATE');
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_PACKAGE_EXACT');
ok(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
ok(packageLock.packages?.['']?.devDependencies?.wrangler === '4.127.1', 'LOCK_ROOT_WRANGLER_EXACT');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCKED_WRANGLER_VERSION');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-consumed-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: APPROVAL_ID,
  consumed_run_id: terminal.workflow_run_id,
  source_sha: terminal.source_sha,
  root_cause: terminal.root_cause,
  provider_step: terminal.provider_step,
  provider_mutation_attempted: false,
  provider_deployment_attempt_count: 0,
  cloudflare_mutation_count: 0,
  executable_lane: 'PERMANENT_TOMBSTONE_IF_FALSE',
  future_receipt_location: lifetime.canonical_receipt_location,
  config_relative_asset_path_verified: true,
  resolved_assets_directory: path.relative(process.cwd(), resolvedAssets),
  new_explicit_approval_required: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
