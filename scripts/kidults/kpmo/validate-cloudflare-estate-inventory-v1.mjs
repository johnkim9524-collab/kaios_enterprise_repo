#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const files = {
  workflow: '.github/workflows/kidults-cloudflare-estate-inventory-v1.yml',
  approval: 'scripts/kidults/kpmo/verify-cloudflare-estate-inventory-approval-v1.mjs',
  inventory: 'scripts/kidults/kpmo/run-cloudflare-estate-inventory-v1.mjs',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  parser: 'scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs',
  policy: 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json',
  v1: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml',
  v2: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml',
  v3: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  credentialV1: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
};
for (const [key, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`CLOUDFLARE_ESTATE_VALIDATION_MISSING:${key}:${file}`);
}
const read = file => fs.readFileSync(file, 'utf8');
const parse = file => JSON.parse(read(file));
const fail = code => { throw new Error(`CLOUDFLARE_ESTATE_VALIDATION_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };

const workflow = read(files.workflow);
const approval = read(files.approval);
const inventory = read(files.inventory);
const parser = read(files.parser);
const registry = parse(files.registry);
const policy = parse(files.policy);
const workflowPath = files.workflow;
const secretDigest = `sha256:${crypto.createHash('sha256').update(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'].sort().join('\n')).digest('hex')}`;

ok(/^on:\n  issue_comment:\n    types: \[created\]/m.test(workflow), 'ISSUE_COMMENT_CREATED_TRIGGER');
ok(workflow.includes("github.event.issue.number == 1809"), 'APPROVAL_ISSUE');
ok(workflow.includes("github.event.comment.user.login == 'johnkim9524-collab'"), 'APPROVAL_OWNER');
ok(workflow.includes("github.event.comment.author_association == 'OWNER'"), 'APPROVAL_ASSOCIATION');
ok(workflow.includes("startsWith(github.event.comment.body, 'CF-CLOUDFLARE-ESTATE-INVENTORY-')"), 'APPROVAL_PREFIX');
ok(workflow.includes('environment: kidults-cloudflare-staging-deploy'), 'ENVIRONMENT');
ok(workflow.includes("node-version: '24.19.0'"), 'PINNED_NODE');
ok(workflow.includes('package-manager-cache: false'), 'NODE_CACHE_DISABLED');
ok(workflow.includes('cancel-in-progress: false'), 'NO_CONSUMPTION_CANCELLATION');
ok(workflow.includes('permissions:\n  contents: read'), 'MINIMUM_GITHUB_TOKEN_PERMISSION');
ok(!workflow.includes('issues: read') && !workflow.includes('actions: read'), 'EXTRA_GITHUB_TOKEN_PERMISSION');

const approvalIndex = workflow.indexOf('Verify exact Program Owner approval and consume one-shot authority');
const guardIndex = workflow.indexOf('Verify live main before provider credential resolution');
const providerIndex = workflow.indexOf('Execute bounded sanitized Cloudflare estate inventory');
ok(approvalIndex >= 0 && guardIndex > approvalIndex && providerIndex > guardIndex, 'APPROVAL_GUARD_PROVIDER_ORDER');
ok(workflow.indexOf('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}') > guardIndex, 'TOKEN_AFTER_GUARD');
ok(workflow.indexOf('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}') > guardIndex, 'ACCOUNT_AFTER_GUARD');
ok((workflow.match(/\$\{\{ secrets\./g) || []).length === 2, 'SECRET_REFERENCE_CARDINALITY');
ok(workflow.includes('if: always()'), 'TERMINAL_ARTIFACT_ALWAYS');
ok(workflow.includes('if-no-files-found: error'), 'TERMINAL_ARTIFACT_REQUIRED');
ok(workflow.includes('retention-days: 30'), 'TERMINAL_RETENTION');

for (const marker of [
  "process.env.GITHUB_EVENT_NAME === 'issue_comment'",
  "eventAction === 'created'",
  'CANONICAL_COMMENT_BODY_MISMATCH',
  'APPROVAL_ID_CARDINALITY_',
  'LIVE_MAIN_DRIFT_BEFORE_SECRET_RESOLUTION',
  'RERUN_FORBIDDEN',
  'APPROVED_ONE_SHOT_READ_ONLY',
  'max_cloudflare_get_requests',
  'worker_mutation_count',
  'pages_mutation_count',
  'route_mutation_count',
  'domain_mutation_count',
  'deployment_mutation_count',
  'secret_output_allowed',
  'raw_provider_response_persistence_allowed',
  'authorization_consumed: true',
  "public_github_read_mode: 'UNAUTHENTICATED_PUBLIC_FAIL_CLOSED'",
]) ok(approval.includes(marker), `APPROVAL_MARKER:${marker}`);
ok(!approval.includes('Authorization: `Bearer'), 'APPROVAL_PUBLIC_READ_MUST_NOT_USE_TOKEN');
ok(approval.includes('const MAX_REQUESTS = 25;'), 'APPROVAL_REQUEST_CEILING');
ok(approval.includes("const ISSUE_NUMBER = 1809;"), 'APPROVAL_ISSUE_CONSTANT');
ok(approval.includes(`const WORKFLOW_PATH = '${workflowPath}';`), 'APPROVAL_WORKFLOW_CONSTANT');

ok(inventory.includes("method: 'GET'"), 'PROVIDER_GET_ONLY_MARKER');
for (const forbidden of ["method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'"]) {
  ok(!inventory.includes(forbidden), `PROVIDER_MUTATION_SURFACE:${forbidden}`);
}
for (const marker of [
  "'/user/tokens/verify'", "'/workers/scripts'", "'/workers/domains'", "'/pages/projects'",
  "TARGET_PAGE_PROJECTS = ['kidults-workspace-staging', 'kidults-enterprise']",
  'requestCount <= maximumRequests', 'maximumRequests === 25',
  'raw_provider_responses_persisted: false', 'raw_provider_responses_uploaded: false',
  'authorization_header_persisted: false', 'cleanup_authorization_required: true',
  'deletion_allowed_now: false',
]) ok(inventory.includes(marker), `INVENTORY_MARKER:${marker}`);
for (const key of ['worker_mutation_count','pages_mutation_count','route_mutation_count','domain_mutation_count','deployment_mutation_count']) {
  ok(inventory.includes(`${key}: 0`), `ZERO_MUTATION:${key}`);
}

ok(parser.includes("'issue_comment'"), 'TRUSTED_REF_PARSER_ISSUE_COMMENT_SUPPORT');
ok(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_COUNT');
ok(registry.required_environment_bindings.length === registry.registered_count, 'REGISTRY_BINDING_COUNT');
ok(registry.registered_workflows.includes(workflowPath), 'REGISTRY_WORKFLOW');
const binding = registry.required_environment_bindings.find(value => value.workflow === workflowPath);
ok(Boolean(binding), 'REGISTRY_BINDING');
ok(binding.job === 'inventory', 'REGISTRY_JOB');
ok(binding.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_ENVIRONMENT');
ok(binding.required_secret_name_digest === secretDigest, 'REGISTRY_SECRET_DIGEST');
ok(JSON.stringify(binding.required_secret_step_names) === JSON.stringify(['Execute bounded sanitized Cloudflare estate inventory']), 'REGISTRY_SECRET_STEP');
ok(JSON.stringify(binding.allowed_trigger_classes) === JSON.stringify(['issue_comment']), 'REGISTRY_TRIGGER');
ok(binding.remote_mutation_class === 'READ_ONLY_CONTROL_PLANE', 'REGISTRY_CLASS');
ok(registry.repository_binding_state.environment_bound_secret_bearing_jobs === registry.registered_count, 'REGISTRY_ENV_COUNT');
ok(registry.repository_binding_state.exact_main_guarded_secret_bearing_jobs === registry.registered_count, 'REGISTRY_EXACT_MAIN_COUNT');
ok(registry.repository_binding_state.live_main_sha_guarded_secret_bearing_jobs === registry.registered_count, 'REGISTRY_LIVE_MAIN_COUNT');
ok(registry.repository_binding_state.step_scoped_secret_bearing_jobs === registry.registered_count, 'REGISTRY_STEP_SCOPE_COUNT');
const privilegedSteps = registry.required_environment_bindings.reduce((sum, item) => sum + item.required_secret_step_names.length, 0);
ok(registry.repository_binding_state.privileged_secret_steps === privilegedSteps, 'REGISTRY_PRIVILEGED_STEPS');

const tombstones = {
  v1: [read(files.v1), '__consumed-cloudflare-shadow-v1-never-execute__'],
  v2: [read(files.v2), '__consumed-cloudflare-shadow-v2-never-execute__'],
  v3: [read(files.v3), '__consumed-cloudflare-shadow-v3-never-execute__'],
  credentialV1: [read(files.credentialV1), '__exhausted-cloudflare-credential-v1-never-execute__'],
};
for (const [name, [text, branch]] of Object.entries(tombstones)) {
  ok(!/^on:\s*\[\]/m.test(text), `INVALID_ON_ARRAY_REMOVED:${name}`);
  ok(text.includes(`- '${branch}'`), `DORMANT_BRANCH:${name}`);
  ok(text.includes('if: ${{ false }}'), `FALSE_GUARD:${name}`);
  ok(!text.includes('workflow_dispatch'), `NO_REPLAY_DISPATCH:${name}`);
  ok(!text.includes('environment:'), `NO_ENVIRONMENT:${name}`);
  ok(!text.includes('${{ secrets.'), `NO_SECRETS:${name}`);
  ok(!text.includes('api.cloudflare.com'), `NO_PROVIDER_NETWORK:${name}`);
}

ok(policy.policy_id === 'KIDULTS_CLOUDFLARE_WORKER_ESTATE_POLICY_V1', 'POLICY_ID');
ok(policy.canonical_keep?.includes('kidults'), 'POLICY_CANONICAL_KIDULTS');
ok(policy.canonical_keep?.includes('kidults-autonomous-intelligence'), 'POLICY_CANONICAL_ASI');
ok(policy.temporary_staging_keep?.includes('kidults-workspace-staging'), 'POLICY_STAGING_KEEP');
ok(policy.migrate_then_retire?.includes('kidults-enterprise'), 'POLICY_ENTERPRISE_MIGRATE');
ok(policy.retirement_sequence?.includes('OBSERVE_24H') && policy.retirement_sequence?.includes('OBSERVE_72H') && policy.retirement_sequence?.includes('DELETE_RESOURCE'), 'POLICY_ENTERPRISE_DELETE_GUARD');
ok(policy.production_public_g5 === 'NO_CHANGE_WITHOUT_EXISTING_APPROVAL_GATE', 'POLICY_RELEASE_GATE');
ok(policy.d1_deletion === 'NOT_AUTHORIZED_BY_THIS_POLICY', 'POLICY_D1_DELETE_HOLD');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-estate-inventory-validation-v1',
  state: 'VERIFIED_PASS',
  approval_issue: 1809,
  trigger: 'issue_comment_created',
  exact_main_approval_required: true,
  maximum_cloudflare_get_requests: 25,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  historical_tombstones_valid_yaml_and_dormant: true,
  provider_mutation_count: 0,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, null, 2));
