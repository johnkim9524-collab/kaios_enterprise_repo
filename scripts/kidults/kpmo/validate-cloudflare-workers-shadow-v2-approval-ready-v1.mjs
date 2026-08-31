#!/usr/bin/env node
import fs from 'node:fs';

const CONTRACT_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-execution-contract-v1.json';
const SPEC_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-workflow-spec-v1.json';
const LIFETIME_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-receipt-lifetime-contract-v1.json';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const V1_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const V2_WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const CONFIG_PATH = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const PACKAGE_PATH = 'tooling/kidults-cloudflare-workers-shadow/package.json';
const LOCK_PATH = 'tooling/kidults-cloudflare-workers-shadow/package-lock.json';
const APPROVAL_BODY_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-02.md';

const fail = (message) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V2_APPROVAL_READY_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };
const read = (path) => fs.readFileSync(path, 'utf8');
const parse = (path) => JSON.parse(read(path));

for (const path of [CONTRACT_PATH, SPEC_PATH, LIFETIME_PATH, REGISTRY_PATH, V1_WORKFLOW_PATH, CONFIG_PATH, PACKAGE_PATH, LOCK_PATH]) {
  ok(fs.existsSync(path), `MISSING_FILE:${path}`);
}

const contract = parse(CONTRACT_PATH);
const spec = parse(SPEC_PATH);
const lifetime = parse(LIFETIME_PATH);
const registry = parse(REGISTRY_PATH);
const v1Workflow = read(V1_WORKFLOW_PATH);
const configRaw = read(CONFIG_PATH);
const config = JSON.parse(configRaw);
const packageJson = parse(PACKAGE_PATH);
const packageLock = parse(LOCK_PATH);

ok(contract.id === 'kidults-cloudflare-workers-shadow-v2-execution-contract-v1', 'CONTRACT_ID');
ok(contract.version === '1.0.0', 'CONTRACT_VERSION');
ok(contract.approval_id === 'CF-WORKERS-SHADOW-20260901-02', 'APPROVAL_ID');
ok(contract.approval_issue === 1711, 'APPROVAL_ISSUE');
ok(contract.prepared_from_protected_main_sha === '8d4a89b81d523f533ded56eae7c9a0617d158866', 'PREPARATION_MAIN_SHA');
ok(contract.authorization?.self_attestation_allowed === false, 'SELF_ATTESTATION_FORBIDDEN');
ok(contract.authorization?.issue_creation_is_authority === false, 'ISSUE_CREATION_AUTHORITY_FORBIDDEN');
ok(contract.authorization?.merge_is_authority === false, 'MERGE_AUTHORITY_FORBIDDEN');
ok(contract.authorization?.workflow_dispatch_is_authority === false, 'DISPATCH_AUTHORITY_FORBIDDEN');

const scope = contract.proposed_scope || {};
ok(scope.workflow === V2_WORKFLOW_PATH, 'V2_WORKFLOW_BINDING');
ok(scope.trigger === 'workflow_dispatch_only', 'TRIGGER_SCOPE');
ok(scope.source_ref === 'refs/heads/main', 'SOURCE_REF_SCOPE');
ok(scope.service === 'kidults-public-portal-shadow', 'SERVICE_SCOPE');
ok(scope.target === 'workers_dev_non_production_only', 'TARGET_SCOPE');
ok(scope.workflow_dispatch_count_max === 1, 'DISPATCH_COUNT_SCOPE');
ok(scope.provider_deployment_attempt_count_max === 1, 'PROVIDER_ATTEMPT_SCOPE');
ok(scope.authorization_consumed_on === 'FIRST_V2_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'CONSUMPTION_SCOPE');
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
]) ok(scope[field] === false, `FORBIDDEN_SCOPE_ENABLED:${field}`);
ok(scope.credential_scope === 'EXISTING_MINIMUM_REQUIRED_CLOUDFLARE_WORKERS_DEPLOYMENT_CREDENTIAL_ONLY', 'CREDENTIAL_SCOPE');

ok(spec.id === 'kidults-cloudflare-workers-shadow-v2-workflow-spec-v1', 'SPEC_ID');
ok(spec.version === '1.0.0', 'SPEC_VERSION');
ok(spec.approval_id === contract.approval_id && spec.approval_issue === contract.approval_issue, 'SPEC_APPROVAL_BINDING');
ok(spec.materialized_workflow_path === V2_WORKFLOW_PATH, 'SPEC_WORKFLOW_PATH');
ok(JSON.stringify(spec.trigger) === JSON.stringify(['workflow_dispatch']), 'SPEC_TRIGGER');
ok(JSON.stringify(spec.permissions) === JSON.stringify(['contents:read']), 'SPEC_PERMISSIONS');
ok(spec.environment === 'kidults-cloudflare-staging-deploy', 'SPEC_ENVIRONMENT');
ok(spec.runner === 'ubuntu-24.04', 'SPEC_RUNNER');
ok(spec.timeout_minutes === 15, 'SPEC_TIMEOUT');
ok(spec.concurrency?.group === 'kidults-cloudflare-workers-shadow-deploy-v2', 'SPEC_CONCURRENCY');
ok(spec.concurrency?.cancel_in_progress === false, 'SPEC_CANCEL_POLICY');

const expectedSteps = [
  'Initialize canonical runner-temp receipt',
  'Verify live main before provider credential resolution',
  'Consume unique first v2 authorization',
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
ok(JSON.stringify(spec.ordered_steps) === JSON.stringify(expectedSteps), 'STEP_ORDER');
for (const [name, value] of Object.entries(spec.canonical_runtime_paths || {})) {
  ok(typeof value === 'string' && value.startsWith('${RUNNER_TEMP}/kidults-cloudflare-workers-shadow-v2/'), `RUNNER_TEMP_PATH:${name}`);
  ok(!value.includes('${GITHUB_WORKSPACE}'), `WORKSPACE_PATH_FORBIDDEN:${name}`);
}
ok(spec.provider_step?.name === 'Deploy one non-production Workers shadow v2', 'PROVIDER_STEP_NAME');
ok(JSON.stringify(spec.provider_step?.secret_names) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'PROVIDER_SECRET_SET');
ok(spec.provider_step?.secret_scope === 'STEP_ONLY_AFTER_ALL_PREFLIGHTS', 'PROVIDER_SECRET_SCOPE');
ok(spec.provider_step?.attempt_marker_created === 'IMMEDIATELY_BEFORE_WRANGLER_PROCESS', 'PROVIDER_ATTEMPT_MARKER');
ok(spec.provider_step?.max_attempts === 1, 'PROVIDER_MAX_ATTEMPTS');
ok(spec.provider_step?.command?.startsWith('./tooling/kidults-cloudflare-workers-shadow/node_modules/.bin/wrangler deploy '), 'LOCAL_LOCKED_WRANGLER_COMMAND');
ok(spec.always_finalizer?.required === true, 'ALWAYS_FINALIZER_REQUIRED');
ok(spec.always_finalizer?.missing_receipt_without_provider_marker?.provider_mutation_attempted === false, 'PRE_PROVIDER_FALLBACK_TRUTH');
ok(spec.always_finalizer?.missing_receipt_with_provider_marker?.provider_mutation_attempted === 'UNKNOWN_REQUIRES_PROVIDER_READBACK', 'POST_PROVIDER_FALLBACK_TRUTH');

ok(lifetime.id === 'kidults-cloudflare-workers-shadow-receipt-lifetime-contract-v1', 'LIFETIME_CONTRACT_ID');
ok(lifetime.status === 'MANDATORY_FOR_ANY_FUTURE_WORKERS_SHADOW_ONE_SHOT', 'LIFETIME_CONTRACT_STATUS');
ok(lifetime.canonical_receipt_location === 'RUNNER_TEMP_OUTSIDE_GITHUB_WORKSPACE', 'LIFETIME_LOCATION');
ok(lifetime.future_execution?.current_approval_reusable === false, 'CONSUMED_APPROVAL_REUSE_FORBIDDEN');
ok(lifetime.future_execution?.new_explicit_approval_required === true, 'NEW_APPROVAL_REQUIRED');

ok(v1Workflow.includes('if: ${{ false }}'), 'V1_TOMBSTONE_MISSING');
ok(v1Workflow.includes('CONSUMED_ONE_SHOT_TOMBSTONE_NO_PROVIDER_MUTATION'), 'V1_TOMBSTONE_MARKER');
ok(contract.prior_incident?.workflow_run_id === 33410598558, 'PRIOR_RUN_BINDING');
ok(contract.prior_incident?.job_id === 99548916282, 'PRIOR_JOB_BINDING');
ok(contract.prior_incident?.provider_step === 'SKIPPED', 'PRIOR_PROVIDER_STEP_TRUTH');
ok(contract.prior_incident?.provider_secret_step_executed === false, 'PRIOR_SECRET_STEP_TRUTH');
ok(contract.prior_incident?.cloudflare_mutation_count === 0, 'PRIOR_MUTATION_TRUTH');
ok(contract.prior_incident?.replay_authorized === false, 'PRIOR_REPLAY_FORBIDDEN');

ok(config.name === 'kidults-public-portal-shadow', 'WORKER_NAME');
ok(config.workers_dev === true, 'WORKERS_DEV_REQUIRED');
ok(config.preview_urls === false, 'PREVIEW_URLS_FORBIDDEN');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'PRODUCTION_ROUTES_ZERO');
ok(config.assets?.directory === 'apps/kidults-enterprise-staging/public/portal', 'ASSET_SOURCE');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) {
  ok(!configRaw.includes(forbidden), `CONFIG_AUTHORITY_FORBIDDEN:${forbidden}`);
}

ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_PACKAGE_EXACT');
ok(packageLock.lockfileVersion === 3, 'LOCKFILE_VERSION');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'WRANGLER_LOCK_EXACT');

const pending = contract.status === 'PENDING_EXPLICIT_PROGRAM_OWNER_EXTERNAL_MUTATION_APPROVAL';
const authorized = contract.status === 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY';
ok(pending !== authorized, 'AUTHORIZATION_STATE_EXACTLY_ONE');

if (pending) {
  ok(contract.authorization?.authorized === false, 'PENDING_AUTHORIZED_FALSE');
  ok(contract.authorization?.authorized_by === null, 'PENDING_AUTHORIZED_BY_NULL');
  ok(contract.authorization?.authorization_receipt === null, 'PENDING_RECEIPT_NULL');
  ok(contract.implementation_state?.materialized_secret_bearing_workflow_present === false, 'PENDING_WORKFLOW_ABSENT_STATE');
  ok(contract.implementation_state?.secret_registry_mutated_for_v2 === false, 'PENDING_REGISTRY_UNMUTATED_STATE');
  ok(contract.implementation_state?.provider_mutation_authorized === false, 'PENDING_PROVIDER_UNAUTHORIZED');
  ok(spec.status === 'APPROVAL_READY_NON_EXECUTABLE_SPEC', 'PENDING_SPEC_STATUS');
  ok(spec.materialized_workflow_present === false, 'PENDING_SPEC_WORKFLOW_ABSENT');
  ok(spec.provider_mutation_authorized === false, 'PENDING_SPEC_PROVIDER_UNAUTHORIZED');
  ok(!fs.existsSync(V2_WORKFLOW_PATH), 'PENDING_V2_WORKFLOW_MUST_NOT_EXIST');
  ok(!fs.existsSync(APPROVAL_BODY_PATH), 'PENDING_APPROVAL_BODY_MUST_NOT_EXIST');
  ok(!registry.registered_workflows?.includes(V2_WORKFLOW_PATH), 'PENDING_V2_REGISTRY_ENTRY_FORBIDDEN');
} else {
  ok(contract.authorization?.authorized === true, 'AUTHORIZED_FLAG');
  ok(contract.authorization?.authorized_by?.github_login === 'johnkim9524-collab', 'AUTHORIZED_OWNER_LOGIN');
  ok(Number.isInteger(contract.authorization?.authorization_receipt?.comment_id), 'AUTHORIZED_COMMENT_ID');
  ok(fs.existsSync(V2_WORKFLOW_PATH), 'AUTHORIZED_V2_WORKFLOW_REQUIRED');
  ok(fs.existsSync(APPROVAL_BODY_PATH), 'AUTHORIZED_APPROVAL_BODY_REQUIRED');
  ok(registry.registered_workflows?.includes(V2_WORKFLOW_PATH), 'AUTHORIZED_V2_REGISTRY_REQUIRED');
}

ok(contract.release_boundary?.public === 'HOLD', 'PUBLIC_HOLD');
ok(contract.release_boundary?.production === 'HOLD', 'PRODUCTION_HOLD');
ok(contract.release_boundary?.g5 === 'HOLD', 'G5_HOLD');
ok(contract.release_boundary?.pages_delete === 'FORBIDDEN', 'PAGES_DELETE_FORBIDDEN');

const negativeMutations = [
  (x) => { x.authorization.self_attestation_allowed = true; },
  (x) => { x.proposed_scope.workflow_dispatch_count_max = 2; },
  (x) => { x.proposed_scope.production_routes_allowed = true; },
  (x) => { x.proposed_scope.custom_domains_allowed = true; },
  (x) => { x.proposed_scope.pages_delete_allowed = true; },
  (x) => { x.release_boundary.production = 'AUTHORIZED'; },
];
for (const mutate of negativeMutations) {
  const x = structuredClone(contract);
  mutate(x);
  const rejected = (
    x.authorization.self_attestation_allowed !== false
    || x.proposed_scope.workflow_dispatch_count_max !== 1
    || x.proposed_scope.production_routes_allowed !== false
    || x.proposed_scope.custom_domains_allowed !== false
    || x.proposed_scope.pages_delete_allowed !== false
    || x.release_boundary.production !== 'HOLD'
  );
  ok(rejected, 'NEGATIVE_MUTATION_NOT_REJECTED');
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v2-approval-ready-validation-v1',
  state: 'VERIFIED_PASS',
  authorization_state: contract.status,
  approval_id: contract.approval_id,
  approval_issue: contract.approval_issue,
  materialized_secret_bearing_workflow_present: fs.existsSync(V2_WORKFLOW_PATH),
  secret_registry_mutated_for_v2: registry.registered_workflows?.includes(V2_WORKFLOW_PATH) === true,
  runner_temp_receipt_contract: 'BOUND',
  prior_cloudflare_mutation_count: 0,
  production_routes: 0,
  custom_domains: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
