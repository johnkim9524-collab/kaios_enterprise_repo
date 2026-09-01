#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json',
  body: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03.md',
  workflow: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  v1: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml',
  v2: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  config: 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc',
  package: 'tooling/kidults-cloudflare-workers-shadow/package.json',
  lock: 'tooling/kidults-cloudflare-workers-shadow/package-lock.json',
  portal: 'apps/kidults-enterprise-staging/public/portal',
};
const fail = code => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V3_APPROVAL_READY_FAIL:${code}`); };
const ok = (value, code) => { if (!value) fail(code); };
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P).filter(value => value !== P.portal)) ok(fs.existsSync(file), `MISSING:${file}`);
ok(fs.existsSync(P.portal), 'PORTAL_MISSING');

const auth = json(P.auth);
const body = read(P.body);
const workflow = read(P.workflow);
const registry = json(P.registry);
const configText = read(P.config);
const config = JSON.parse(configText);
const pkg = json(P.package);
const lock = json(P.lock);

ok(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
ok(auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'AUTH_STATUS');
ok(auth.authorized_by?.github_login === 'johnkim9524-collab' && auth.authorized_by?.author_association === 'OWNER', 'AUTH_OWNER');
ok(auth.root_approval_receipt?.issue_number === 1743, 'AUTH_ISSUE');
ok(auth.root_approval_receipt?.comment_id === 5487854388, 'AUTH_COMMENT');
ok(auth.root_approval_receipt?.comment_node_id === 'IC_kwDOTF-G-M8AAAABRxoDNA', 'AUTH_COMMENT_NODE');
ok(auth.root_approval_receipt?.created_at === '2026-09-01T02:24:14Z', 'AUTH_COMMENT_TIME');
ok(auth.root_approval_receipt?.created_at === auth.root_approval_receipt?.updated_at, 'AUTH_COMMENT_EDITED');
ok(auth.root_approval_receipt?.performed_via_github_app === 'chatgpt-codex-connector', 'AUTH_APP');
ok(auth.root_approval_receipt?.body_sha256 === 'sha256:6b7f1e25850a0a05d193ef04b444d00cfaaf56b2f4fc37c6e884b907da2a3cce', 'AUTH_BODY_HASH');
ok(sha256(body) === auth.root_approval_receipt.body_sha256, 'BODY_HASH');
ok(body.endsWith('\n'), 'BODY_NEWLINE');
for (const value of [
  'CF-WORKERS-SHADOW-20260901-03',
  'kidults-public-portal-shadow v3',
  'non-Production workers.dev only',
  'Production route 0, custom domain 0',
  'Public·Production·G5 HOLD',
  'rerun·replay·두 번째 dispatch는 승인하지 않습니다.',
]) ok(body.includes(value), `BODY_SCOPE:${value}`);

ok(auth.issuance_binding?.protected_main_sha_at_receipt_issuance === '0f71b08aae471b03e39528c1bfbb3e243134d09d', 'AUTH_ISSUANCE_MAIN');
ok(auth.issuance_binding?.nonce === '8a780e2bed4c518380cf0729778a50601637dd48d2e582b5', 'AUTH_NONCE');
ok(auth.issuance_binding?.issued_at === '2026-09-01T02:23:41Z', 'AUTH_ISSUED');
ok(auth.issuance_binding?.expires_at === '2026-09-02T02:23:41Z', 'AUTH_EXPIRES');
ok(Date.parse(auth.issuance_binding.expires_at) > Date.parse(auth.issuance_binding.issued_at), 'AUTH_TIME_ORDER');

const binding = auth.post_landing_execution_binding || {};
ok(binding.required === true && binding.valid_binding_count_required === 1, 'BINDING_CARDINALITY');
ok(binding.issue_number === 1743, 'BINDING_ISSUE');
ok(binding.marker_start === '<!-- CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1_START -->', 'BINDING_START');
ok(binding.marker_end === '<!-- CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1_END -->', 'BINDING_END');
ok(binding.schema === 'CF_WORKERS_SHADOW_V3_EXECUTION_BINDING_V1', 'BINDING_SCHEMA');
ok(binding.state === 'BOUND_TO_EXACT_POST_LANDING_MAIN', 'BINDING_STATE');
ok(binding.required_root_approval_comment_id === 5487854388, 'BINDING_ROOT');
ok(binding.required_root_approval_body_sha256 === auth.root_approval_receipt.body_sha256, 'BINDING_ROOT_HASH');
ok(binding.required_workflow === P.workflow, 'BINDING_WORKFLOW');
ok(binding.required_service === 'kidults-public-portal-shadow', 'BINDING_SERVICE');
ok(binding.required_nonce === auth.issuance_binding.nonce && binding.required_expiry === auth.issuance_binding.expires_at, 'BINDING_NONCE_EXPIRY');
ok(binding.executable_before_binding === false, 'BINDING_PREEXECUTION');

const scope = auth.authorized_scope || {};
ok(scope.workflow === P.workflow && scope.trigger === 'workflow_dispatch' && scope.source_ref === 'refs/heads/main', 'SCOPE_SOURCE');
ok(scope.service === 'kidults-public-portal-shadow' && scope.target === 'workers_dev_non_production_only', 'SCOPE_TARGET');
ok(scope.workflow_dispatch_count_max === 1 && scope.provider_deployment_attempt_count_max === 1, 'SCOPE_COUNTS');
ok(scope.authorization_consumed_on === 'FIRST_VALID_V3_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION');
for (const key of [
  'production_routes_allowed','custom_domains_allowed','pages_delete_allowed','pages_domain_detach_allowed',
  'public_promotion_allowed','production_promotion_allowed','g5_promotion_allowed','external_spend_allowed',
  'contract_change_allowed','new_credential_creation_allowed','credential_scope_expansion_allowed',
]) ok(scope[key] === false, `SCOPE_FALSE:${key}`);
ok(auth.runtime_state?.authorization_consumed === false && auth.runtime_state?.provider_deployment_attempt_count === 0, 'RUNTIME_PRELANDING');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V3_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY');

ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(workflow), 'WORKFLOW_TRIGGER_PERMISSIONS');
for (const value of ['\n  push:','\n  pull_request:','\n  pull_request_target:','\n  workflow_run:','\n  repository_dispatch:','\n  schedule:']) {
  ok(!workflow.includes(value), `FORBIDDEN_TRIGGER:${value.trim()}`);
}
for (const value of [
  'group: kidults-cloudflare-workers-shadow-deploy-v3-one-shot',
  'cancel-in-progress: false',
  '  deploy-shadow-v3:',
  '    environment: kidults-cloudflare-staging-deploy',
  '    runs-on: ubuntu-24.04',
  'Verify live main before provider credential resolution',
  'GITHUB_TOKEN: ${{ github.token }}',
  '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main',
  'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'ref: ${{ github.sha }}',
  'persist-credentials: false',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  "node-version: '24.19.0'",
  'issues/comments/5487854388',
  'EXECUTION_BINDING_MARKER_COUNT_',
  'landing_pr_number',
  'landing_exact_head_sha',
  'EXECUTION_BINDING_PR_NOT_MERGED_TO_RUNTIME_MAIN',
  'EXECUTION_BINDING_EXPIRED',
  'actions/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml/runs?event=workflow_dispatch&branch=main&per_page=100',
  'V3_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN',
  '.authorization_consumed=true',
  'UNIQUE_FIRST_V3_MAIN_DISPATCH_VERIFIED',
  'npm ci --ignore-scripts --no-audit --no-fund --prefix tooling/kidults-cloudflare-workers-shadow',
  'Prove locked Wrangler dry-run before provider attempt',
  '--dry-run',
  'WRANGLER_SEND_METRICS',
  'Finalize truthful terminal receipt',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'if-no-files-found: error',
  '${{ runner.temp }}/kidults-cloudflare-workers-shadow-v3/receipt.json',
  'Preserve exact v3 terminal verdict',
]) ok(workflow.includes(value), `WORKFLOW_REQUIRED:${value}`);
ok((workflow.match(/\$\{\{\s*github\.token\s*\}\}/g) || []).length === 1, 'GITHUB_TOKEN_COUNT');
ok(!workflow.includes('npx '), 'NPX_FORBIDDEN');
ok(!workflow.includes('wrangler pages'), 'PAGES_COMMAND_FORBIDDEN');
ok(!workflow.includes('/client/v4/zones'), 'ZONE_API_FORBIDDEN');
ok(!workflow.includes('/pages/projects'), 'PAGES_API_FORBIDDEN');

const providerName = '      - name: Deploy one non-production Workers shadow v3';
const provider = workflow.indexOf(providerName);
const dry = workflow.indexOf('      - name: Prove locked Wrangler dry-run before provider attempt');
const attempt = workflow.indexOf('          : > "$MARKER"', provider);
const command = workflow.indexOf('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy', provider);
const readback = workflow.indexOf('      - name: Verify workers.dev HTTPS read-back');
const finalizer = workflow.indexOf('      - name: Finalize truthful terminal receipt');
const upload = workflow.indexOf('      - name: Upload exact v3 terminal receipt');
const verdict = workflow.indexOf('      - name: Preserve exact v3 terminal verdict');
ok(provider > 0 && dry > 0 && dry < provider, 'DRYRUN_ORDER');
ok(attempt > provider && command > attempt, 'PROVIDER_ATTEMPT_ORDER');
ok(readback > command && finalizer > readback && upload > finalizer && verdict > upload, 'TERMINAL_ORDER');

const secrets = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)].map(match => match[1]).sort();
ok(JSON.stringify(secrets) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']), 'SECRET_SET');
ok(!workflow.slice(0, provider).includes('${{ secrets.'), 'SECRET_BEFORE_PROVIDER');
const next = workflow.indexOf('\n      - name:', provider + providerName.length);
const providerText = workflow.slice(provider, next);
ok(providerText.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'TOKEN_STEP_SCOPE');
ok(providerText.includes('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}'), 'ACCOUNT_STEP_SCOPE');
ok(providerText.includes('.provider_deployment_attempt_count=1'), 'PROVIDER_COUNT_ONE');
ok(providerText.includes('PIPESTATUS[0]'), 'PROVIDER_EXIT_CAPTURE');
for (const value of ['https://*.workers.dev', "'%{http_code}'", 'test -s "$BODY"', 'VERIFIED_PASS_NON_PRODUCTION_WORKERS_DEV']) {
  ok(workflow.includes(value), `READBACK:${value}`);
}

for (const [label,file] of [['V1',P.v1],['V2',P.v2]]) {
  const prior = read(file);
  ok(/^on: \[\]\n\npermissions:\n  contents: read\n/m.test(prior), `${label}_TRIGGER`);
  ok(!prior.includes('workflow_dispatch'), `${label}_DISPATCH`);
  for (const value of ['environment:','${{ secrets.','actions/checkout@','actions/setup-node@','curl ','npm ','npx ','wrangler ','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']) {
    ok(!prior.includes(value), `${label}_AUTHORITY:${value}`);
  }
  ok(prior.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), `${label}_TOMBSTONE`);
}

ok(config.name === 'kidults-public-portal-shadow' && config.workers_dev === true && config.preview_urls === false, 'CONFIG_IDENTITY');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES');
ok(config.assets?.directory === '../../../../apps/kidults-enterprise-staging/public/portal', 'CONFIG_ASSET_VALUE');
for (const value of ['account_id','api_token','zone_id','custom_domain']) ok(!configText.includes(value), `CONFIG_AUTHORITY:${value}`);
const resolved = path.resolve(path.dirname(path.resolve(P.config)), config.assets.directory);
ok(resolved === path.resolve(P.portal), 'CONFIG_ASSET_RESOLUTION');
ok(fs.existsSync(path.join(resolved,'index.html')) && fs.existsSync(path.join(resolved,'workspace.html')), 'PORTAL_ENTRYPOINTS');
ok(!fs.existsSync(path.resolve(path.dirname(path.resolve(P.config)), 'apps/kidults-enterprise-staging/public/portal')), 'LEGACY_BAD_PATH');

ok(pkg.name === 'kidults-cloudflare-workers-shadow-tooling' && pkg.private === true, 'PACKAGE');
ok(pkg.devDependencies?.wrangler === '4.127.1', 'PACKAGE_WRANGLER');
ok(lock.lockfileVersion === 3, 'LOCK_VERSION');
ok(lock.packages?.['']?.devDependencies?.wrangler === '4.127.1', 'LOCK_ROOT');
ok(lock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCK_WRANGLER');

const v3 = registry.required_environment_bindings?.find(value => value.workflow === P.workflow);
ok(registry.status === 'EXTERNAL_APPROVAL_REQUIRED' && registry.issue === 974, 'REGISTRY_IDENTITY');
ok(registry.registered_count === 23 && registry.registered_workflows?.length === 23 && registry.required_environment_bindings?.length === 23, 'REGISTRY_COUNTS');
ok(registry.registered_workflows.includes(P.workflow), 'REGISTRY_V3');
ok(!registry.registered_workflows.includes(P.v1) && !registry.registered_workflows.includes(P.v2), 'REGISTRY_CONSUMED');
ok(v3?.job === 'deploy-shadow-v3' && v3?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_V3_BINDING');
ok(v3?.required_secret_name_digest === 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978', 'REGISTRY_SECRET_DIGEST');
ok(JSON.stringify(v3?.required_secret_step_names) === JSON.stringify(['Deploy one non-production Workers shadow v3']), 'REGISTRY_SECRET_STEP');
ok(JSON.stringify(v3?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_TRIGGER');
ok(v3?.remote_mutation_class === 'REMOTE_STAGING_MUTATION', 'REGISTRY_MUTATION');
ok(registry.required_environment_count === 9, 'REGISTRY_ENV_COUNT');
for (const key of ['environment_bound_secret_bearing_jobs','exact_main_guarded_secret_bearing_jobs','live_main_sha_guarded_secret_bearing_jobs','step_scoped_secret_bearing_jobs']) {
  ok(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
}
const privileged = registry.required_environment_bindings.reduce((sum,value) => sum + (value.required_secret_step_names?.length || 0), 0);
ok(privileged === 26 && registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_STEPS');
ok(registry.inventory_evidence?.evidence_semantics === 'HISTORICAL_REGISTRATION_BASELINE_NOT_LIVE_EXTERNAL_POLICY_READBACK', 'REGISTRY_EVIDENCE_SEMANTICS');
ok(registry.repository_containment?.consumed_cloudflare_workers_shadow_lanes?.secret_registry_membership === false, 'REGISTRY_CONSUMED_BOUNDARY');
ok(registry.repository_containment?.approved_cloudflare_workers_shadow_v3_lane?.approval_id === auth.id, 'REGISTRY_APPROVAL');
ok(registry.repository_containment?.approved_cloudflare_workers_shadow_v3_lane?.execution_binding_required === true, 'REGISTRY_BINDING_REQUIRED');

console.log(JSON.stringify({
  id:'kidults-cloudflare-workers-shadow-v3-approval-ready-validation-v1',
  state:'VERIFIED_PASS',
  approval_id:auth.id,
  root_approval_comment_id:5487854388,
  post_landing_execution_binding_required:true,
  authorization_consumed:false,
  workflow_dispatch_count_max:1,
  provider_deployment_attempt_count_max:1,
  v1_v2_zero_executable_authority:true,
  registered_secret_bearing_lanes:23,
  privileged_secret_steps:26,
  locked_wrangler_version:'4.127.1',
  workers_dev_readback_required:true,
  production_routes:0,
  custom_domains:0,
  pages_delete:'FORBIDDEN',
  pages_domain_detach:'FORBIDDEN',
  public:'HOLD',
  production:'HOLD',
  g5:'HOLD',
},null,2));
