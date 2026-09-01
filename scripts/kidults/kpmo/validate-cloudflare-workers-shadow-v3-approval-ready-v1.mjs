#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03.md';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml';
const V1_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const V2_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const PORTAL_PATH = 'apps/kidults-enterprise-staging/public/portal';

const fail = (code) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V3_APPROVAL_READY_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of [
  AUTH_PATH,
  APPROVAL_BODY_PATH,
  WORKFLOW_PATH,
  V1_WORKFLOW_PATH,
  V2_WORKFLOW_PATH,
  REGISTRY_PATH,
  CONFIG_PATH,
  PACKAGE_PATH,
  LOCK_PATH,
]) ok(fs.existsSync(file), `MISSING_FILE:${file}`);

const auth = parse(AUTH_PATH);
const approvalBody = read(APPROVAL_BODY_PATH);
const workflow = read(WORKFLOW_PATH);
const v1Workflow = read(V1_WORKFLOW_PATH);
const v2Workflow = read(V2_WORKFLOW_PATH);
const registry = parse(REGISTRY_PATH);
const configRaw = read(CONFIG_PATH);
const config = JSON.parse(configRaw);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);

ok(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
ok(auth.version === '1.0.0', 'AUTH_VERSION');
ok(auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'AUTH_STATUS');
ok(auth.authorized_by?.github_login === 'johnkim9524-collab', 'AUTH_OWNER');
ok(auth.authorized_by?.author_association === 'OWNER', 'AUTH_ASSOCIATION');
ok(auth.root_approval_receipt?.issue_number === 1743, 'AUTH_ISSUE');
ok(auth.root_approval_receipt?.comment_id === 5487854388, 'AUTH_COMMENT_ID');
ok(auth.root_approval_receipt?.comment_node_id === 'IC_kwDOTF-G-M8AAAABRxoDNA', 'AUTH_COMMENT_NODE');
ok(auth.root_approval_receipt?.created_at === '2026-09-01T02:24:14Z', 'AUTH_CREATED_AT');
ok(auth.root_approval_receipt?.updated_at === '2026-09-01T02:24:14Z', 'AUTH_UPDATED_AT');
ok(auth.root_approval_receipt?.performed_via_github_app === 'chatgpt-codex-connector', 'AUTH_APP');
ok(auth.root_approval_receipt?.body_sha256 === 'sha256:6b7f1e25850a0a05d193ef04b444d00cfaaf56b2f4fc37c6e884b907da2a3cce', 'AUTH_BODY_DIGEST');
ok(sha256(approvalBody) === auth.root_approval_receipt.body_sha256, 'APPROVAL_BODY_DIGEST');
ok(approvalBody.endsWith('\n'), 'APPROVAL_BODY_FINAL_NEWLINE');
for (const required of [
  '**Approval ID:** `CF-WORKERS-SHADOW-20260901-03`',
  'kidults-public-portal-shadow v3',
  'non-Production workers.dev only',
  'Production route 0, custom domain 0',
  'Public·Production·G5 HOLD',
  'rerun·replay·두 번째 dispatch는 승인하지 않습니다.',
  'nonce와 만료시각',
]) ok(approvalBody.includes(required), `APPROVAL_BODY_REQUIRED:${required}`);

ok(auth.issuance_binding?.protected_main_sha_at_receipt_issuance === '0f71b08aae471b03e39528c1bfbb3e243134d09d', 'AUTH_ISSUANCE_MAIN');
ok(auth.issuance_binding?.nonce === '8a780e2bed4c518380cf0729778a50601637dd48d2e582b5', 'AUTH_NONCE');
ok(auth.issuance_binding?.issued_at === '2026-09-01T02:23:41Z', 'AUTH_ISSUED');
ok(auth.issuance_binding?.expires_at === '2026-09-02T02:23:41Z', 'AUTH_EXPIRY');
ok(Date.parse(auth.issuance_binding.expires_at) > Date.parse(auth.issuance_binding.issued_at), 'AUTH_EXPIRY_ORDER');

const binding = auth.post_landing_execution_binding || {};
ok(binding.required === true, 'BINDING_REQUIRED');
ok(binding.issue_number === 1743, 'BINDING_ISSUE');
ok(binding.marker_start === '<!-- CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1_START -->', 'BINDING_START');
ok(binding.marker_end === '<!-- CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1_END -->', 'BINDING_END');
ok(binding.schema === 'CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1', 'BINDING_SCHEMA');
ok(binding.state === 'BOUND_TO_EXACT_POST_LANDING_MAIN', 'BINDING_STATE');
ok(binding.valid_binding_count_required === 1, 'BINDING_COUNT');
ok(binding.required_root_approval_comment_id === 5487854388, 'BINDING_ROOT_COMMENT');
ok(binding.required_root_approval_body_sha256 === auth.root_approval_receipt.body_sha256, 'BINDING_ROOT_DIGEST');
ok(binding.required_workflow === WORKFLOW_PATH, 'BINDING_WORKFLOW');
ok(binding.required_service === 'kidults-public-portal-shadow', 'BINDING_SERVICE');
ok(binding.required_nonce === auth.issuance_binding.nonce, 'BINDING_NONCE');
ok(binding.required_expiry === auth.issuance_binding.expires_at, 'BINDING_EXPIRY');
ok(binding.executable_before_binding === false, 'BINDING_PREEXECUTION');

const scope = auth.authorized_scope || {};
ok(scope.workflow === WORKFLOW_PATH, 'SCOPE_WORKFLOW');
ok(scope.trigger === 'workflow_dispatch', 'SCOPE_TRIGGER');
ok(scope.source_ref === 'refs/heads/main', 'SCOPE_REF');
ok(scope.service === 'kidults-public-portal-shadow', 'SCOPE_SERVICE');
ok(scope.target === 'workers_dev_non_production_only', 'SCOPE_TARGET');
ok(scope.workflow_dispatch_count_max === 1, 'SCOPE_DISPATCH_COUNT');
ok(scope.provider_deployment_attempt_count_max === 1, 'SCOPE_PROVIDER_COUNT');
ok(scope.authorization_consumed_on === 'FIRST_VALID_V3_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION');
for (const key of [
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
]) ok(scope[key] === false, `SCOPE_FALSE:${key}`);
ok(auth.runtime_state?.authorization_consumed === false, 'AUTH_PRELANDING_CONSUMED');
ok(auth.runtime_state?.provider_deployment_attempt_count === 0, 'AUTH_PRELANDING_PROVIDER_COUNT');
ok(auth.runtime_state?.workers_dev_url === null, 'AUTH_PRELANDING_URL');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V3_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'AUTH_REPLAY');

ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(workflow), 'WORKFLOW_TRIGGER_AND_PERMISSIONS');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  workflow_run:', '\n  repository_dispatch:', '\n  schedule:']) {
  ok(!workflow.includes(forbiddenTrigger), `WORKFLOW_FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
}
ok(workflow.includes('group: kidults-cloudflare-workers-shadow-deploy-v3-one-shot'), 'WORKFLOW_CONCURRENCY');
ok(workflow.includes('cancel-in-progress: false'), 'WORKFLOW_NO_CANCEL');
ok(workflow.includes('  deploy-shadow-v3:'), 'WORKFLOW_JOB');
ok(workflow.includes('    environment: kidults-cloudflare-staging-deploy'), 'WORKFLOW_ENVIRONMENT');
ok(workflow.includes('    runs-on: ubuntu-24.04'), 'WORKFLOW_RUNNER');
ok(workflow.includes('Verify live main before provider credential resolution'), 'WORKFLOW_LIVE_MAIN_NAME');
for (const marker of [
  'GITHUB_TOKEN: ${{ github.token }}',
  'test "$GITHUB_REF" = "refs/heads/main"',
  'curl --fail-with-body --silent --show-error',
  '--connect-timeout 10',
  '--max-time 30',
  '--header "Authorization: Bearer $GITHUB_TOKEN"',
  '--header "Accept: application/vnd.github+json"',
  '--header "X-GitHub-Api-Version: 2022-11-28"',
  '"$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main"',
  '.get("commit",{}).get("sha","")',
  're.fullmatch(r"[0-9a-f]{40}",sha)',
  'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
]) ok(workflow.includes(marker), `WORKFLOW_LIVE_MAIN_MARKER:${marker}`);
ok((workflow.match(/\$\{\{\s*github\.token\s*\}\}/g) || []).length === 1, 'WORKFLOW_GITHUB_TOKEN_CARDINALITY');

ok(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'), 'WORKFLOW_CHECKOUT_PIN');
ok(workflow.includes('ref: ${{ github.sha }}'), 'WORKFLOW_EXACT_CHECKOUT');
ok(workflow.includes('persist-credentials: false'), 'WORKFLOW_NO_PERSISTED_CREDENTIALS');
ok(workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'WORKFLOW_NODE_PIN');
ok(workflow.includes("node-version: '24.19.0'"), 'WORKFLOW_NODE_VERSION');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'WORKFLOW_UPLOAD_PIN');

for (const marker of [
  'issues/comments/5487854388',
  'IC_kwDOTF-G-M8AAAABRxoDNA',
  'sha256:6b7f1e25850a0a05d193ef04b444d00cfaaf56b2f4fc37c6e884b907da2a3cce',
  'CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1_START',
  'EXECUTION_BINDING_MARKER_COUNT_',
  'landing_pr_number',
  'landing_exact_head_sha',
  'merge_commit_sha',
  'EXECUTION_BINDING_PR_NOT_MERGED_TO_RUNTIME_MAIN',
  'EXECUTION_BINDING_EXPIRED',
]) ok(workflow.includes(marker), `WORKFLOW_APPROVAL_MARKER:${marker}`);

ok(workflow.includes('actions/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml/runs?event=workflow_dispatch&branch=main&per_page=100'), 'WORKFLOW_DISPATCH_LEDGER');
ok(workflow.includes('V3_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN'), 'WORKFLOW_REPLAY_REJECTION');
ok(workflow.includes('authorization_consumed=true'), 'WORKFLOW_CONSUMPTION_MARKER');
ok(workflow.includes('UNIQUE_FIRST_V3_MAIN_DISPATCH_VERIFIED'), 'WORKFLOW_UNIQUE_DISPATCH_MARKER');
ok(workflow.includes('test "$GITHUB_RUN_ATTEMPT" = "1"'), 'WORKFLOW_RUN_ATTEMPT');

ok(workflow.includes('npm ci --ignore-scripts --no-audit --no-fund --prefix tooling/kidults-cloudflare-workers-shadow'), 'WORKFLOW_LOCKED_INSTALL');
ok(workflow.includes('4.127.1'), 'WORKFLOW_WRANGLER_VERSION');
ok(!workflow.includes('npx '), 'WORKFLOW_NPX_FORBIDDEN');
ok(workflow.includes('Prove locked Wrangler dry-run before provider attempt'), 'WORKFLOW_DRYRUN_STEP');
ok(workflow.includes('--dry-run'), 'WORKFLOW_DRYRUN_FLAG');
ok(workflow.includes('WRANGLER_SEND_METRICS'), 'WORKFLOW_METRICS_DISABLED');

const providerStepName = '      - name: Deploy one non-production Workers shadow v3';
const providerIndex = workflow.indexOf(providerStepName);
const dryRunIndex = workflow.indexOf('      - name: Prove locked Wrangler dry-run before provider attempt');
const markerIndex = workflow.indexOf('          : > "$MARKER"', providerIndex);
const providerCommandIndex = workflow.indexOf('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy', providerIndex);
const readbackIndex = workflow.indexOf('      - name: Verify workers.dev HTTPS read-back');
const finalizerIndex = workflow.indexOf('      - name: Finalize truthful terminal receipt');
const uploadIndex = workflow.indexOf('      - name: Upload exact v3 terminal receipt');
const verdictIndex = workflow.indexOf('      - name: Preserve exact v3 terminal verdict');
ok(providerIndex > 0, 'WORKFLOW_PROVIDER_STEP');
ok(dryRunIndex > 0 && dryRunIndex < providerIndex, 'WORKFLOW_DRYRUN_ORDER');
ok(markerIndex > providerIndex && providerCommandIndex > markerIndex, 'WORKFLOW_PROVIDER_MARKER_ORDER');
ok(readbackIndex > providerCommandIndex, 'WORKFLOW_READBACK_ORDER');
ok(finalizerIndex > readbackIndex && uploadIndex > finalizerIndex && verdictIndex > uploadIndex, 'WORKFLOW_TERMINAL_ORDER');

const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)]
  .map((match) => match[1])
  .sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'WORKFLOW_SECRET_SET');
ok(!workflow.slice(0, providerIndex).includes('${{ secrets.'), 'WORKFLOW_SECRET_BEFORE_PROVIDER');
const nextStepIndex = workflow.indexOf('\n      - name:', providerIndex + providerStepName.length);
const providerStepText = workflow.slice(providerIndex, nextStepIndex);
ok(providerStepText.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'WORKFLOW_TOKEN_STEP_SCOPE');
ok(providerStepText.includes('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}'), 'WORKFLOW_ACCOUNT_STEP_SCOPE');
ok(providerStepText.includes('provider_deployment_attempt_count=1'), 'WORKFLOW_PROVIDER_COUNT_ONE');
ok(providerStepText.includes('PIPESTATUS[0]'), 'WORKFLOW_PROVIDER_EXIT');
ok(workflow.includes('https://*.workers.dev'), 'WORKFLOW_READBACK_HOST');
ok(workflow.includes("'%{http_code}'"), 'WORKFLOW_READBACK_STATUS');
ok(workflow.includes('test -s "$BODY"'), 'WORKFLOW_READBACK_NONEMPTY');
ok(workflow.includes('VERIFIED_PASS_NON_PRODUCTION_WORKERS_DEV'), 'WORKFLOW_PASS_STATE');
ok(workflow.includes('Finalize truthful terminal receipt'), 'WORKFLOW_FINALIZER');
ok(workflow.includes('if: always()'), 'WORKFLOW_ALWAYS_FINALIZER');
ok(workflow.includes('if-no-files-found: error'), 'WORKFLOW_ARTIFACT_REQUIRED');
ok(workflow.includes('${{ runner.temp }}/kidults-cloudflare-workers-shadow-v3/receipt.json'), 'WORKFLOW_RUNNER_TEMP_RECEIPT');

for (const forbidden of [
  'api.cloudflare.com/client/v4/zones',
  '/workers/domains',
  'custom-domains',
  '--custom-domain',
  'pages/projects',
  'wrangler pages',
]) ok(!workflow.includes(forbidden), `WORKFLOW_FORBIDDEN_PROVIDER_SURFACE:${forbidden}`);

const allowedCustomDomainLines = new Set([
  'custom_domains:0,',
  'and .authorized_scope.custom_domains_allowed==false',
  '"custom_domains": 0,',
  '| .custom_domains=0',
]);
const customDomainLines = workflow
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('custom_domain'));
ok(customDomainLines.length === 4, 'WORKFLOW_CUSTOM_DOMAIN_ZERO_ASSERTION_COUNT');
for (const line of customDomainLines) {
  ok(allowedCustomDomainLines.has(line), `WORKFLOW_CUSTOM_DOMAIN_UNEXPECTED_CONTEXT:${line}`);
}

for (const [label, prior] of [['V1', v1Workflow], ['V2', v2Workflow]]) {
  ok(/^on: \[\]\n\npermissions:\n  contents: read\n/m.test(prior), `${label}_TRIGGER_NOT_REMOVED`);
  ok(!prior.includes('workflow_dispatch'), `${label}_DISPATCH_REINTRODUCED`);
  for (const forbidden of ['environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@', 'curl ', 'npm ', 'npx ', 'wrangler ', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    ok(!prior.includes(forbidden), `${label}_EXECUTABLE_AUTHORITY:${forbidden}`);
  }
  ok(prior.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), `${label}_TOMBSTONE_MARKER`);
  ok(prior.includes('Upload consumed authorization tombstone'), `${label}_TOMBSTONE_ARTIFACT`);
}

ok(config.name === 'kidults-public-portal-shadow', 'CONFIG_NAME');
ok(config.workers_dev === true, 'CONFIG_WORKERS_DEV');
ok(config.preview_urls === false, 'CONFIG_PREVIEW_URLS');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES');
ok(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'CONFIG_ASSET_DIRECTORY');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configRaw.includes(forbidden), `CONFIG_FORBIDDEN:${forbidden}`);
}
const resolvedAssets = path.resolve(path.dirname(path.resolve(CONFIG_PATH)), config.assets.directory);
const expectedAssets = path.resolve(PORTAL_PATH);
ok(resolvedAssets === expectedAssets, 'CONFIG_ASSET_RESOLUTION');
ok(fs.statSync(resolvedAssets).isDirectory(), 'CONFIG_ASSET_DIRECTORY_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'index.html')), 'CONFIG_INDEX_EXISTS');
ok(fs.existsSync(path.join(resolvedAssets, 'workspace.html')), 'CONFIG_WORKSPACE_EXISTS');
ok(!fs.existsSync(path.resolve(path.dirname(path.resolve(CONFIG_PATH)), 'apps/kidults-enterprise-staging/public/portal')), 'CONFIG_OLD_PATH_REJECTED');

ok(packageJson.name === 'kidults-cloudflare-workers-shadow-tooling', 'PACKAGE_NAME');
ok(packageJson.private === true, 'PACKAGE_PRIVATE');
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'PACKAGE_WRANGLER');
ok(packageLock.lockfileVersion === 3, 'LOCK_VERSION');
ok(packageLock.packages?.['']?.devDependencies?.wrangler === '4.127.1', 'LOCK_ROOT_WRANGLER');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCK_WRANGLER');

const v3Binding = registry.required_environment_bindings?.find((entry) => entry.workflow === WORKFLOW_PATH);
ok(registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'REGISTRY_STATUS');
ok(registry.issue === 974, 'REGISTRY_ISSUE');
ok(registry.registered_count === 23, 'REGISTRY_COUNT');
ok(registry.registered_workflows?.length === 23, 'REGISTRY_WORKFLOW_COUNT');
ok(registry.required_environment_bindings?.length === 23, 'REGISTRY_BINDING_COUNT');
ok(registry.registered_workflows.includes(WORKFLOW_PATH), 'REGISTRY_V3_MISSING');
ok(!registry.registered_workflows.includes(V1_WORKFLOW_PATH), 'REGISTRY_V1_PRESENT');
ok(!registry.registered_workflows.includes(V2_WORKFLOW_PATH), 'REGISTRY_V2_PRESENT');
ok(v3Binding?.job === 'deploy-shadow-v3', 'REGISTRY_V3_JOB');
ok(v3Binding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_V3_ENVIRONMENT');
ok(v3Binding?.required_secret_name_digest === 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978', 'REGISTRY_V3_SECRET_DIGEST');
ok(JSON.stringify(v3Binding?.required_secret_step_names) === JSON.stringify(['Deploy one non-production Workers shadow v3']), 'REGISTRY_V3_SECRET_STEP');
ok(JSON.stringify(v3Binding?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_V3_TRIGGER');
ok(v3Binding?.remote_mutation_class === 'REMOTE_STAGING_MUTATION', 'REGISTRY_V3_MUTATION_CLASS');
ok(registry.required_environment_count === 9, 'REGISTRY_ENVIRONMENT_COUNT');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0),
  0
);
ok(privilegedSteps === 26, 'REGISTRY_CALCULATED_PRIVILEGED_STEPS');
ok(registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_STEPS');
ok(registry.repository_containment?.consumed_cloudflare_workers_shadow_lanes?.secret_registry_membership === false, 'REGISTRY_CONSUMED_LANE_MEMBERSHIP');
ok(registry.repository_containment?.approved_cloudflare_workers_shadow_v3_lane?.approval_id === 'CF-WORKERS-SHADOW-20260901-03', 'REGISTRY_V3_APPROVAL');
ok(registry.repository_containment?.approved_cloudflare_workers_shadow_v3_lane?.execution_binding_required === true, 'REGISTRY_V3_BINDING');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v3-approval-ready-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  root_approval_comment_id: auth.root_approval_receipt.comment_id,
  root_approval_body_sha256: auth.root_approval_receipt.body_sha256,
  post_landing_execution_binding_required: true,
  authorization_consumed: false,
  workflow_dispatch_count_max: 1,
  provider_deployment_attempt_count_max: 1,
  exact_main_guarded: true,
  locked_wrangler_version: '4.127.1',
  locked_dry_run_required: true,
  workers_dev_readback_required: true,
  v1_v2_zero_executable_authority: true,
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
