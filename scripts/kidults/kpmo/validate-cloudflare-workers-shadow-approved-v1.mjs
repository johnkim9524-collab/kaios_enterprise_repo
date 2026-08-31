#!/usr/bin/env node
import fs from 'node:fs';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-one-shot-authorization-20260831-v1.json';
const RECEIPT_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260831-01.md';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';
const APPROVAL_ID = 'CF-WORKERS-SHADOW-20260831-01';
const CLEAN_BASE_MAIN_SHA = 'ffac1b93492704f57f6125ef67e9b83336083840';
const CLEAN_BRANCH = 'kpmo/cloudflare-workers-shadow-approved-clean-v1';

const fail = (message) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_APPROVED_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };

for (const file of [AUTH_PATH, RECEIPT_BODY_PATH, WORKFLOW_PATH, CONFIG_PATH, PACKAGE_PATH, LOCK_PATH]) {
  ok(fs.existsSync(file), `MISSING_FILE:${file}`);
}
ok(fs.existsSync(`${PORTAL_PATH}/index.html`), 'PORTAL_INDEX_MISSING');
ok(fs.existsSync(`${PORTAL_PATH}/workspace.html`), 'PORTAL_WORKSPACE_MISSING');

const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
const receiptBody = fs.readFileSync(RECEIPT_BODY_PATH, 'utf8');
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const configRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
const config = JSON.parse(configRaw);
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));

function validateAuthorization(value) {
  ok(value.id === APPROVAL_ID, 'APPROVAL_ID');
  ok(value.version === '1.0.0', 'APPROVAL_VERSION');
  ok(value.status === 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY', 'APPROVAL_STATUS');
  ok(value.authorized_by?.github_login === 'johnkim9524-collab', 'APPROVAL_AUTHOR_LOGIN');
  ok(value.authorized_by?.author_association === 'OWNER', 'APPROVAL_AUTHOR_ASSOCIATION');

  const receipt = value.authorization_receipt || {};
  ok(receipt.repository === 'johnkim9524-collab/kaios_enterprise_repo', 'RECEIPT_REPOSITORY');
  ok(receipt.issue_number === 1702, 'RECEIPT_ISSUE');
  ok(receipt.comment_id === 5480203136, 'RECEIPT_COMMENT_ID');
  ok(receipt.comment_node_id === 'IC_kwDOTF-G-M8AAAABRqVDgA', 'RECEIPT_COMMENT_NODE_ID');
  ok(receipt.api_url === 'https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/issues/comments/5480203136', 'RECEIPT_API_URL');
  ok(receipt.html_url === 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/1702#issuecomment-5480203136', 'RECEIPT_HTML_URL');
  ok(receipt.created_at === '2026-08-31T15:00:24Z', 'RECEIPT_CREATED_AT');
  ok(receipt.updated_at === receipt.created_at, 'RECEIPT_EDITED_OR_TIMESTAMP_DRIFT');
  ok(receipt.performed_via_github_app === 'chatgpt-codex-connector', 'RECEIPT_GITHUB_APP');
  ok(receipt.body_path === RECEIPT_BODY_PATH, 'RECEIPT_BODY_BINDING');
  ok(receipt.verification === 'FETCH_EXACT_COMMENT_ID_AND_MATCH_METADATA_AND_BODY_BEFORE_PROVIDER_SECRET_RESOLUTION', 'RECEIPT_VERIFICATION_RULE');

  const scope = value.authorized_scope || {};
  ok(scope.workflow === WORKFLOW_PATH, 'SCOPE_WORKFLOW');
  ok(scope.trigger === 'workflow_dispatch', 'SCOPE_TRIGGER');
  ok(scope.source_ref === 'refs/heads/main', 'SCOPE_SOURCE_REF');
  ok(scope.service === 'kidults-public-portal-shadow', 'SCOPE_SERVICE');
  ok(scope.target === 'workers_dev_non_production_only', 'SCOPE_TARGET');
  ok(scope.dispatch_count_max === 1, 'SCOPE_DISPATCH_COUNT');
  ok(scope.provider_deployment_attempt_count_max === 1, 'SCOPE_PROVIDER_ATTEMPT_COUNT');
  ok(scope.authorization_consumed_on === 'FIRST_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION_POINT');
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
    'credential_scope_expansion_allowed'
  ]) ok(scope[field] === false, `FORBIDDEN_SCOPE_ENABLED:${field}`);
  ok(scope.credential_scope === 'EXISTING_MINIMUM_REQUIRED_CLOUDFLARE_WORKERS_DEPLOYMENT_CREDENTIAL_ONLY', 'CREDENTIAL_SCOPE');

  ok(value.clean_recut?.source_base_main_sha === CLEAN_BASE_MAIN_SHA, 'CLEAN_BASE_MAIN_SHA');
  ok(value.clean_recut?.source_branch === CLEAN_BRANCH, 'CLEAN_BRANCH');
  ok(value.clean_recut?.prohibited_history_source === 'codex/cloudflare-pages-to-workers-migration-v1', 'PROHIBITED_HISTORY_SOURCE');
  ok(value.clean_recut?.execution_sha_binding === 'LIVE_PROTECTED_MAIN_SHA_AT_DISPATCH', 'EXECUTION_SHA_BINDING');
  ok(value.worker_config === CONFIG_PATH, 'WORKER_CONFIG_BINDING');
  ok(value.replay === 'FORBIDDEN_AFTER_FIRST_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');
  for (const excluded of ['SECOND_DISPATCH_OR_RERUN','PRODUCTION_ROUTE','CUSTOM_DOMAIN','PUBLIC_RELEASE','PRODUCTION_APPROVAL','G5','PAGES_DELETE','PAGES_DOMAIN_DETACH','SPEND_OR_CONTRACT_EXPANSION','NEW_CREDENTIAL_OR_SCOPE_EXPANSION','UNRELATED_PROVIDER_MUTATION']) {
    ok(value.authority_excludes?.includes(excluded), `MISSING_AUTHORITY_EXCLUSION:${excluded}`);
  }
}

function validateConfig(value, raw) {
  ok(value.name === 'kidults-public-portal-shadow', 'WORKER_NAME');
  ok(value.compatibility_date === '2026-08-31', 'COMPATIBILITY_DATE');
  ok(value.workers_dev === true, 'WORKERS_DEV_REQUIRED');
  ok(value.preview_urls === false, 'PREVIEW_URLS_FORBIDDEN');
  ok(Array.isArray(value.routes) && value.routes.length === 0, 'PRODUCTION_ROUTE_ATTACHED');
  ok(value.assets?.directory === PORTAL_PATH, 'PORTAL_ASSET_SOURCE');
  ok(value.assets?.html_handling === 'auto-trailing-slash', 'HTML_HANDLING');
  ok(value.assets?.not_found_handling === 'none', 'SOFT_404_OR_SPA_FALLBACK_FORBIDDEN');
  for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
    ok(!raw.includes(forbidden), `FORBIDDEN_CONFIG_AUTHORITY:${forbidden}`);
  }
}

validateAuthorization(auth);
validateConfig(config, configRaw);

ok(receiptBody.endsWith('\n'), 'RECEIPT_BODY_FINAL_NEWLINE');
ok(receiptBody.includes(`**Approval ID:** \`${APPROVAL_ID}\``), 'RECEIPT_BODY_APPROVAL_ID');
ok(receiptBody.includes('maximum provider deployment attempts: **1**'), 'RECEIPT_BODY_ATTEMPT_BOUND');
ok(receiptBody.includes('authorization is consumed when the governed workflow is dispatched, whether the run passes or fails'), 'RECEIPT_BODY_CONSUMPTION_BOUND');
ok(receiptBody.includes('Production routes allowed: **0**'), 'RECEIPT_BODY_PRODUCTION_ROUTE_BOUND');
ok(receiptBody.includes('custom domains allowed: **0**'), 'RECEIPT_BODY_CUSTOM_DOMAIN_BOUND');
ok(receiptBody.includes('Public promotion: not authorized'), 'RECEIPT_BODY_PUBLIC_HOLD');
ok(receiptBody.includes('Production promotion: not authorized'), 'RECEIPT_BODY_PRODUCTION_HOLD');
ok(receiptBody.includes('G5 promotion: not authorized'), 'RECEIPT_BODY_G5_HOLD');

ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(workflow), 'MANUAL_TRIGGER_AND_PERMISSION_CONTRACT');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  schedule:', '\n  workflow_run:', '\n  repository_dispatch:']) {
  ok(!workflow.includes(forbiddenTrigger), `FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
}
ok(workflow.includes('environment: kidults-cloudflare-staging-deploy'), 'ENVIRONMENT_BINDING');
ok(workflow.includes('Verify live main before provider credential resolution'), 'LIVE_MAIN_GUARD_STEP');
ok(workflow.includes('test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"'), 'LIVE_MAIN_SHA_BINDING');
ok(workflow.includes('Consume one-shot authorization through unique main dispatch ledger'), 'ONE_SHOT_LEDGER_STEP');
ok(workflow.includes('test "$GITHUB_RUN_ATTEMPT" = "1"'), 'RERUN_BLOCK');
ok(workflow.includes('/actions/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml/runs?event=workflow_dispatch&branch=main&per_page=100'), 'DISPATCH_LEDGER_ENDPOINT');
ok(workflow.includes('.total_count == 1'), 'UNIQUE_DISPATCH_ASSERTION');
ok(workflow.includes('Verify exact Program Owner approval receipt'), 'EXTERNAL_APPROVAL_STEP');
ok(workflow.includes('/issues/comments/5480203136'), 'EXTERNAL_APPROVAL_ENDPOINT');
ok(workflow.includes('cmp --silent "$EXPECTED_BODY" "$ACTUAL_BODY"'), 'EXTERNAL_APPROVAL_BODY_COMPARISON');
ok(workflow.includes('npm ci --ignore-scripts --no-audit --no-fund --prefix tooling/kidults-cloudflare-workers-shadow'), 'LOCKED_TOOL_INSTALL');
ok(workflow.includes('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy'), 'LOCAL_WRANGLER_EXECUTION');
ok(workflow.includes('Bind exact source and artifact digests'), 'ARTIFACT_DIGEST_BINDING');
ok(workflow.includes('Deploy one non-production Workers shadow'), 'PROVIDER_STEP_NAME');
ok(workflow.includes('Verify workers.dev shadow read-back'), 'SHADOW_READBACK_STEP');
ok(workflow.includes('test "$http_code" = "200"'), 'HTTP_200_ASSERTION');
ok(workflow.includes('PUBLIC_PRODUCTION_G5_HOLD'), 'RELEASE_HOLD_RECEIPT');
ok(workflow.includes('actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8'), 'CHECKOUT_ACTION_PIN');
ok(workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'SETUP_NODE_ACTION_PIN');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_ACTION_PIN');

const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)].map((match) => match[1]).sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'SECRET_NAME_SET');
const providerStepStart = workflow.indexOf('      - name: Deploy one non-production Workers shadow');
const readbackStepStart = workflow.indexOf('      - name: Verify workers.dev shadow read-back');
ok(providerStepStart >= 0 && readbackStepStart > providerStepStart, 'PROVIDER_STEP_BOUNDARIES');
ok(!workflow.slice(0, providerStepStart).includes('${{ secrets.'), 'SECRET_BEFORE_PROVIDER_STEP');
ok(!workflow.slice(readbackStepStart).includes('${{ secrets.'), 'SECRET_AFTER_PROVIDER_STEP');

ok(packageJson.name === 'kidults-cloudflare-workers-shadow-tooling', 'TOOLING_PACKAGE_NAME');
ok(packageJson.private === true, 'TOOLING_PACKAGE_PRIVATE');
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_PACKAGE_EXACT');
ok(!packageJson.scripts || Object.keys(packageJson.scripts).length === 0, 'TOOLING_SCRIPTS_FORBIDDEN');
ok(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
ok(packageLock.packages?.['']?.devDependencies?.wrangler === '4.127.1', 'LOCK_ROOT_WRANGLER_EXACT');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCKED_WRANGLER_VERSION');

const negativeMutations = [
  (value) => { value.status = 'NOT_AUTHORIZED'; },
  (value) => { value.authorized_scope.dispatch_count_max = 2; },
  (value) => { value.authorized_scope.production_routes_allowed = true; },
  (value) => { value.authorized_scope.custom_domains_allowed = true; },
  (value) => { value.authorized_scope.public_promotion_allowed = true; },
  (value) => { value.replay = 'ALLOWED'; }
];
for (const mutate of negativeMutations) {
  const candidate = structuredClone(auth);
  mutate(candidate);
  let rejected = false;
  try { validateAuthorization(candidate); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_AUTHORIZATION_MUTATION_ACCEPTED');
}

const configMutations = [
  (value) => { value.routes = [{ pattern: 'kidults.com/*', zone_name: 'kidults.com' }]; },
  (value) => { value.workers_dev = false; },
  (value) => { value.preview_urls = true; },
  (value) => { value.assets.not_found_handling = 'single-page-application'; }
];
for (const mutate of configMutations) {
  const candidate = structuredClone(config);
  mutate(candidate);
  let rejected = false;
  try { validateConfig(candidate, JSON.stringify(candidate)); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_CONFIG_MUTATION_ACCEPTED');
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-approved-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: APPROVAL_ID,
  approval_comment_id: 5480203136,
  clean_base_main_sha: CLEAN_BASE_MAIN_SHA,
  clean_branch: CLEAN_BRANCH,
  trigger: 'workflow_dispatch_only',
  dispatch_count_max: 1,
  provider_deployment_attempt_count_max: 1,
  authorization_consumed_on: 'FIRST_WORKFLOW_DISPATCH_PASS_OR_FAIL',
  worker_service: config.name,
  workers_dev: true,
  production_routes: 0,
  custom_domains: 0,
  wrangler_version: '4.127.1',
  negative_authorization_mutations_rejected: negativeMutations.length,
  negative_config_mutations_rejected: configMutations.length,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  pages_delete: 'FORBIDDEN'
}, null, 2));
