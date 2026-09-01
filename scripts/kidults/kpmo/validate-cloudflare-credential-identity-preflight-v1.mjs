#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const PATHS = {
  auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  contract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  receipt: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01.md',
  workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  v3: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
};

const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_IDENTITY_PREFLIGHT_VALIDATION_FAIL:${code}`); };
const assert = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(PATHS)) assert(fs.existsSync(file), `MISSING_FILE:${file}`);

const auth = parse(PATHS.auth);
const contract = parse(PATHS.contract);
const receipt = read(PATHS.receipt);
const workflow = read(PATHS.workflow);
const v3 = read(PATHS.v3);
const registry = parse(PATHS.registry);

assert(auth.id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01', 'AUTH_ID');
assert(auth.version === '1.0.0', 'AUTH_VERSION');
assert(auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'AUTH_STATUS');
assert(auth.authorized_by?.github_login === 'johnkim9524-collab', 'AUTH_OWNER');
assert(auth.authorized_by?.author_association === 'OWNER', 'AUTH_ASSOCIATION');
assert(auth.root_approval_receipt?.issue_number === 1763, 'AUTH_ISSUE');
assert(auth.root_approval_receipt?.comment_id === 5489201610, 'AUTH_COMMENT_ID');
assert(auth.root_approval_receipt?.comment_node_id === 'IC_kwDOTF-G-M8AAAABRy6Ryg', 'AUTH_COMMENT_NODE');
assert(auth.root_approval_receipt?.created_at === '2026-09-01T05:09:16Z', 'AUTH_COMMENT_CREATED');
assert(auth.root_approval_receipt?.updated_at === '2026-09-01T05:09:16Z', 'AUTH_COMMENT_UPDATED');
assert(auth.root_approval_receipt?.performed_via_github_app === 'chatgpt-codex-connector', 'AUTH_APP');
assert(auth.root_approval_receipt?.body_sha256 === 'sha256:05dfcc74062e14cc98d3866bf222dae6ea4b04749a35a8aabb259f1db73ea91d', 'AUTH_BODY_HASH');
assert(sha256(receipt) === auth.root_approval_receipt.body_sha256, 'RECEIPT_HASH');
assert(receipt.endsWith('\n'), 'RECEIPT_FINAL_NEWLINE');

for (const required of [
  '**Approval ID:** `CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01`',
  '`kidults-cloudflare-staging-deploy`',
  'Cloudflare 읽기 전용 GET 요청을 최대 2회',
  'Worker·Pages·route·domain 변경은 0',
  'Secret 값은 출력·저장하지 않습니다.',
  '성공·실패와 관계없이 승인이 소진',
  'Public·Production·G5 HOLD',
]) assert(receipt.includes(required), `RECEIPT_SCOPE:${required}`);

assert(auth.issuance_binding?.protected_main_sha_at_receipt_issuance === '89da1efa67f252bae527fdebe207f4c763284081', 'ISSUANCE_MAIN');
assert(auth.issuance_binding?.nonce === 'cf43692776efd9f2c088d2030bd7764d38a71ac1e951dda5', 'AUTH_NONCE');
assert(auth.issuance_binding?.issued_at === '2026-09-01T05:08:00Z', 'AUTH_ISSUED');
assert(auth.issuance_binding?.expires_at === '2026-09-02T05:08:00Z', 'AUTH_EXPIRES');
assert(Date.parse(auth.issuance_binding.expires_at) > Date.parse(auth.issuance_binding.issued_at), 'AUTH_TIME_ORDER');

const binding = auth.post_landing_execution_binding || {};
assert(binding.required === true, 'BINDING_REQUIRED');
assert(binding.issue_number === 1763, 'BINDING_ISSUE');
assert(binding.marker_start === '<!-- CF_CREDENTIAL_IDENTITY_PREFLIGHT_EXECUTION_BINDING_V1_START -->', 'BINDING_START');
assert(binding.marker_end === '<!-- CF_CREDENTIAL_IDENTITY_PREFLIGHT_EXECUTION_BINDING_V1_END -->', 'BINDING_END');
assert(binding.schema === 'CF_CREDENTIAL_IDENTITY_PREFLIGHT_EXECUTION_BINDING_V1', 'BINDING_SCHEMA');
assert(binding.state === 'BOUND_TO_EXACT_POST_LANDING_MAIN', 'BINDING_STATE');
assert(binding.valid_binding_count_required === 1, 'BINDING_COUNT');
assert(binding.required_root_approval_comment_id === 5489201610, 'BINDING_ROOT_COMMENT');
assert(binding.required_root_approval_body_sha256 === auth.root_approval_receipt.body_sha256, 'BINDING_ROOT_HASH');
assert(binding.required_workflow === PATHS.workflow, 'BINDING_WORKFLOW');
assert(binding.required_environment === 'kidults-cloudflare-staging-deploy', 'BINDING_ENVIRONMENT');
assert(binding.required_nonce === auth.issuance_binding.nonce, 'BINDING_NONCE');
assert(binding.required_expiry === auth.issuance_binding.expires_at, 'BINDING_EXPIRY');
assert(binding.landing_base_sha_required === true, 'BINDING_BASE_REQUIRED');
assert(binding.landing_base_sha_must_equal_issuance_main === true, 'BINDING_BASE_EQUALS_ISSUANCE');
assert(binding.landing_head_merge_base_must_equal_issuance_main === true, 'BINDING_HEAD_MERGE_BASE');
assert(binding.executable_before_binding === false, 'BINDING_PREEXECUTION');

const scope = auth.authorized_scope || {};
assert(scope.workflow === PATHS.workflow, 'SCOPE_WORKFLOW');
assert(scope.trigger === 'workflow_dispatch', 'SCOPE_TRIGGER');
assert(scope.source_ref === 'refs/heads/main', 'SCOPE_REF');
assert(scope.environment === 'kidults-cloudflare-staging-deploy', 'SCOPE_ENVIRONMENT');
assert(scope.workflow_dispatch_count_max === 1, 'SCOPE_DISPATCH_COUNT');
assert(scope.external_request_count_max === 2, 'SCOPE_REQUEST_COUNT');
assert(scope.authorization_consumed_on === 'FIRST_VALID_PREFLIGHT_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION');
assert(Array.isArray(scope.allowed_requests) && scope.allowed_requests.length === 2, 'SCOPE_REQUESTS');
assert(scope.allowed_requests[0]?.method === 'GET' && scope.allowed_requests[0]?.endpoint === 'https://api.cloudflare.com/client/v4/user/tokens/verify', 'SCOPE_TOKEN_VERIFY');
assert(scope.allowed_requests[1]?.method === 'GET' && scope.allowed_requests[1]?.endpoint_template === 'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/scripts', 'SCOPE_WORKERS_LIST');
for (const key of [
  'worker_mutation_count_max',
  'pages_mutation_count_max',
  'route_mutation_count_max',
  'domain_mutation_count_max',
]) assert(scope[key] === 0, `SCOPE_ZERO:${key}`);
for (const key of [
  'secret_output_allowed',
  'secret_persistence_allowed',
  'external_spend_allowed',
  'contract_change_allowed',
  'new_credential_creation_allowed',
  'credential_scope_expansion_allowed',
]) assert(scope[key] === false, `SCOPE_FALSE:${key}`);
assert(auth.runtime_state?.authorization_consumed === false, 'AUTH_PREEXECUTION_CONSUMED');
assert(auth.runtime_state?.external_request_count === 0, 'AUTH_PREEXECUTION_REQUESTS');
assert(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_PREFLIGHT_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'AUTH_REPLAY');

assert(contract.id === 'kidults-cloudflare-workers-shadow-credential-identity-preflight-v1', 'CONTRACT_ID');
assert(contract.version === '1.1.0', 'CONTRACT_VERSION');
assert(contract.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'CONTRACT_STATUS');
assert(contract.approval_gate_issue === 1763, 'CONTRACT_ISSUE');
assert(contract.approval_id === auth.id, 'CONTRACT_APPROVAL');
assert(contract.authorization_record === PATHS.auth, 'CONTRACT_AUTH_PATH');
assert(contract.authorized_workflow === PATHS.workflow, 'CONTRACT_WORKFLOW');
assert(contract.authority?.standing_execution_authority === false, 'CONTRACT_STANDING_AUTHORITY');
assert(contract.authority?.explicit_program_owner_approval_present === true, 'CONTRACT_APPROVAL_PRESENT');
assert(contract.authority?.post_landing_exact_main_binding_required === true, 'CONTRACT_BINDING_REQUIRED');
assert(contract.authority?.read_only_external_calls_only === true, 'CONTRACT_READ_ONLY');
assert(contract.authority?.worker_mutation_allowed === false, 'CONTRACT_WORKER_MUTATION');
assert(contract.authority?.pages_mutation_allowed === false, 'CONTRACT_PAGES_MUTATION');
assert(contract.authority?.routes_or_domains_allowed === false, 'CONTRACT_TOPOLOGY_MUTATION');
assert(contract.github_secret_boundary?.environment === 'kidults-cloudflare-staging-deploy', 'CONTRACT_ENVIRONMENT');
assert(JSON.stringify(contract.github_secret_boundary?.required_secret_names) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']), 'CONTRACT_SECRET_NAMES');
assert(contract.github_secret_boundary?.secret_references_step_scoped_only === true, 'CONTRACT_STEP_SCOPE');
assert(contract.maximum_external_read_requests === 2, 'CONTRACT_REQUEST_COUNT');
assert(contract.required_preflight_sequence?.length === 3, 'CONTRACT_SEQUENCE');
assert(contract.required_preflight_sequence?.filter((step) => step.external_call).length === 2, 'CONTRACT_EXTERNAL_SEQUENCE');
assert(contract.required_preflight_sequence?.every((step, index) => step.order === index + 1), 'CONTRACT_SEQUENCE_ORDER');
assert(contract.pass_condition?.cloudflare_error_7003_observed === false, 'CONTRACT_7003');
assert(contract.pass_condition?.worker_mutation_count === 0, 'CONTRACT_ZERO_WORKER');
assert(contract.pass_condition?.pages_mutation_count === 0, 'CONTRACT_ZERO_PAGES');
assert(contract.pass_condition?.route_mutation_count === 0, 'CONTRACT_ZERO_ROUTE');
assert(contract.pass_condition?.domain_mutation_count === 0, 'CONTRACT_ZERO_DOMAIN');

assert(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(workflow), 'WORKFLOW_TRIGGER_PERMISSIONS');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  workflow_run:', '\n  repository_dispatch:', '\n  schedule:']) {
  assert(!workflow.includes(forbiddenTrigger), `WORKFLOW_FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
}
for (const required of [
  'group: kidults-cloudflare-credential-identity-preflight-v1-one-shot',
  'cancel-in-progress: false',
  '  verify-credential-identity:',
  '    environment: kidults-cloudflare-staging-deploy',
  '    runs-on: ubuntu-24.04',
  'Verify live main before provider credential resolution',
  'GITHUB_TOKEN: ${{ github.token }}',
  '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main',
  'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'ref: ${{ github.sha }}',
  'persist-credentials: false',
  'issues/comments/5489201610',
  'post_landing_execution_binding"]["marker_start"]',
  'EXECUTION_BINDING_MARKER_COUNT_',
  'landing_pr_number',
  'landing_exact_head_sha',
  '"landing_base_sha": auth["issuance_binding"]["protected_main_sha_at_receipt_issuance"]',
  'EXECUTION_BINDING_BASE_SHA_DRIFT',
  'merge_base_commit',
  'EXECUTION_BINDING_HEAD_MERGE_BASE_DRIFT',
  'EXECUTION_BINDING_HEAD_NOT_DESCENDED_FROM_ISSUANCE_MAIN',
  'EXECUTION_BINDING_PR_NOT_MERGED_TO_RUNTIME_MAIN',
  'EXECUTION_BINDING_EXPIRED',
  'actions/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml/runs?event=workflow_dispatch&branch=main&per_page=100',
  'PREFLIGHT_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN',
  '.authorization_consumed=true',
  'UNIQUE_FIRST_PREFLIGHT_MAIN_DISPATCH_VERIFIED',
  'Execute approved read-only Cloudflare credential identity preflight',
  'https://api.cloudflare.com/client/v4/user/tokens/verify',
  'https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts',
  'Finalize truthful terminal receipt',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  '${{ runner.temp }}/kidults-cloudflare-credential-identity-preflight-v1/receipt.json',
  'if-no-files-found: error',
  'Preserve exact credential identity terminal verdict',
]) assert(workflow.includes(required), `WORKFLOW_REQUIRED:${required}`);
assert((workflow.match(/\$\{\{\s*github\.token\s*\}\}/g) || []).length === 1, 'WORKFLOW_GITHUB_TOKEN_COUNT');

const providerStepName = '      - name: Execute approved read-only Cloudflare credential identity preflight';
const providerIndex = workflow.indexOf(providerStepName);
const finalizerIndex = workflow.indexOf('      - name: Finalize truthful terminal receipt');
const uploadIndex = workflow.indexOf('      - name: Upload sanitized credential identity terminal receipt');
const verdictIndex = workflow.indexOf('      - name: Preserve exact credential identity terminal verdict');
assert(providerIndex > 0, 'WORKFLOW_PROVIDER_STEP');
assert(finalizerIndex > providerIndex && uploadIndex > finalizerIndex && verdictIndex > uploadIndex, 'WORKFLOW_TERMINAL_ORDER');

const secretRefs = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)].map((match) => match[1]).sort();
assert(JSON.stringify(secretRefs) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']), 'WORKFLOW_SECRET_SET');
assert(!workflow.slice(0, providerIndex).includes('${{ secrets.'), 'WORKFLOW_SECRET_BEFORE_PROVIDER');
const nextStepIndex = workflow.indexOf('\n      - name:', providerIndex + providerStepName.length);
const providerStep = workflow.slice(providerIndex, nextStepIndex);
assert(providerStep.includes('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}'), 'WORKFLOW_ACCOUNT_STEP_SCOPE');
assert(providerStep.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'WORKFLOW_TOKEN_STEP_SCOPE');
assert((providerStep.match(/https:\/\/api\.cloudflare\.com\/client\/v4\//g) || []).length === 2, 'WORKFLOW_CLOUDFLARE_REQUEST_CARDINALITY');
assert(providerStep.includes('external_read_request_count=1'), 'WORKFLOW_REQUEST_ONE');
assert(providerStep.includes('external_read_request_count=2'), 'WORKFLOW_REQUEST_TWO');
assert(providerStep.includes('cloudflare_error_7003_observed'), 'WORKFLOW_7003');
assert(providerStep.includes('rm -f "$TOKEN_RESPONSE" "$TOKEN_STDERR"'), 'WORKFLOW_TOKEN_RAW_DELETE');
assert(providerStep.includes('rm -f "$WORKERS_RESPONSE" "$WORKERS_STDERR"'), 'WORKFLOW_WORKERS_RAW_DELETE');

for (const forbidden of [
  '--request POST', '--request PUT', '--request PATCH', '--request DELETE',
  '-X POST', '-X PUT', '-X PATCH', '-X DELETE',
  '--data ', '--data-raw ', '--data-binary ', '--form ', '--upload-file ',
  'wrangler deploy', 'wrangler pages', '/workers/services/', '/pages/projects/',
]) assert(!providerStep.includes(forbidden), `WORKFLOW_MUTATION_SURFACE:${forbidden}`);
assert(!workflow.includes('echo "$CLOUDFLARE_ACCOUNT_ID"'), 'WORKFLOW_ACCOUNT_ECHO');
assert(!workflow.includes('echo "$CLOUDFLARE_API_TOKEN"'), 'WORKFLOW_TOKEN_ECHO');
assert(!workflow.includes('set -x'), 'WORKFLOW_XTRACE');
assert(!workflow.includes('::debug::'), 'WORKFLOW_DEBUG');
assert(!workflow.includes('token_id'), 'WORKFLOW_TOKEN_ID_PERSISTENCE');
assert(workflow.includes('.secret_values_logged=false'), 'WORKFLOW_SECRET_LOG_FALSE');
assert(workflow.includes('.secret_values_persisted=false'), 'WORKFLOW_SECRET_PERSIST_FALSE');
assert(workflow.includes('.raw_provider_responses_uploaded=false'), 'WORKFLOW_RAW_UPLOAD_FALSE');
assert(!workflow.slice(uploadIndex).includes('token-verify.raw.json'), 'WORKFLOW_TOKEN_RAW_UPLOAD');
assert(!workflow.slice(uploadIndex).includes('workers-list.raw.json'), 'WORKFLOW_WORKERS_RAW_UPLOAD');

assert(/^on:\s*\[\]\n\npermissions:\n  contents: read\n/m.test(v3), 'V3_NOT_TOMBSTONED');
assert(!v3.includes('workflow_dispatch'), 'V3_DISPATCH_REINTRODUCED');
for (const forbidden of ['environment:', '${{ secrets.', 'curl ', 'wrangler ', 'CLOUDFLARE_API_TOKEN:', 'CLOUDFLARE_ACCOUNT_ID:']) {
  assert(!v3.includes(forbidden), `V3_EXECUTABLE_AUTHORITY:${forbidden}`);
}

const registryWorkflow = PATHS.workflow;
const registryBinding = registry.required_environment_bindings?.find((entry) => entry.workflow === registryWorkflow);
assert(registry.status === 'EXTERNAL_APPROVAL_REQUIRED' && registry.issue === 974, 'REGISTRY_IDENTITY');
assert(registry.registered_count === 23, 'REGISTRY_COUNT');
assert(registry.registered_workflows?.length === 23, 'REGISTRY_WORKFLOW_COUNT');
assert(registry.required_environment_bindings?.length === 23, 'REGISTRY_BINDING_COUNT');
assert(registry.registered_workflows.includes(registryWorkflow), 'REGISTRY_WORKFLOW_MISSING');
assert(!registry.registered_workflows.includes(PATHS.v3), 'REGISTRY_V3_PRESENT');
assert(registryBinding?.job === 'verify-credential-identity', 'REGISTRY_JOB');
assert(registryBinding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_ENVIRONMENT');
assert(registryBinding?.required_secret_name_digest === 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978', 'REGISTRY_SECRET_DIGEST');
assert(JSON.stringify(registryBinding?.required_secret_step_names) === JSON.stringify(['Execute approved read-only Cloudflare credential identity preflight']), 'REGISTRY_SECRET_STEP');
assert(JSON.stringify(registryBinding?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_TRIGGER');
assert(registryBinding?.remote_mutation_class === 'READ_ONLY_CONTROL_PLANE', 'REGISTRY_CLASS');
assert(registry.required_environment_count === 9, 'REGISTRY_ENVIRONMENT_COUNT');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) assert(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0),
  0,
);
assert(privilegedSteps === 26, 'REGISTRY_PRIVILEGED_CALCULATED');
assert(registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_RECORDED');
assert(registry.inventory_evidence?.evidence_semantics === 'HISTORICAL_REGISTRATION_BASELINE_NOT_LIVE_EXTERNAL_POLICY_READBACK', 'REGISTRY_EVIDENCE_SEMANTICS');
assert(registry.repository_containment?.provider_activation === 'HOLD', 'REGISTRY_PROVIDER_HOLD');
assert(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight?.approval_id === auth.id, 'REGISTRY_APPROVAL');
assert(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight?.external_read_request_count_max === 2, 'REGISTRY_REQUEST_BOUND');
assert(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight?.worker_pages_route_domain_mutation_count === 0, 'REGISTRY_ZERO_MUTATION');

const approvalLineageFindings = (workflowText, authValue) => {
  const findings = [];
  const post = authValue.post_landing_execution_binding || {};
  if (post.landing_base_sha_required !== true) findings.push('BASE_SHA_NOT_REQUIRED');
  if (post.landing_base_sha_must_equal_issuance_main !== true) findings.push('BASE_SHA_NOT_BOUND_TO_ISSUANCE');
  if (post.landing_head_merge_base_must_equal_issuance_main !== true) findings.push('HEAD_MERGE_BASE_NOT_BOUND_TO_ISSUANCE');
  for (const marker of [
    '"landing_base_sha": auth["issuance_binding"]["protected_main_sha_at_receipt_issuance"]',
    'EXECUTION_BINDING_BASE_SHA_DRIFT',
    'comparison.get("merge_base_commit", {}).get("sha") != issuance_main',
    'EXECUTION_BINDING_HEAD_MERGE_BASE_DRIFT',
    'EXECUTION_BINDING_HEAD_NOT_DESCENDED_FROM_ISSUANCE_MAIN',
  ]) {
    if (!workflowText.includes(marker)) findings.push(`WORKFLOW_MARKER_MISSING:${marker}`);
  }
  return findings;
};
assert(approvalLineageFindings(workflow, auth).length === 0, 'APPROVAL_LINEAGE_INVARIANT');
const lineageMutations = [
  ['OMIT_BASE_REQUIREMENT', workflow, {...auth, post_landing_execution_binding: {...binding, landing_base_sha_required: false}}],
  ['ALLOW_BASE_DRIFT', workflow.replace('EXECUTION_BINDING_BASE_SHA_DRIFT', 'BASE_DRIFT_IGNORED'), auth],
  ['REMOVE_MERGE_BASE_COMPARE', workflow.replace('comparison.get("merge_base_commit", {}).get("sha") != issuance_main', 'False'), auth],
];
for (const [id, workflowText, authValue] of lineageMutations) {
  assert(approvalLineageFindings(workflowText, authValue).length > 0, `APPROVAL_LINEAGE_MUTATION_FALSE_GREEN:${id}`);
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-credential-identity-preflight-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  approval_lineage_issue: 1765,
  root_approval_comment_id: auth.root_approval_receipt.comment_id,
  post_landing_execution_binding_required: true,
  authorization_consumed: false,
  external_read_request_count_max: 2,
  worker_pages_route_domain_mutation_count: 0,
  secret_output_or_persistence: 'FORBIDDEN',
  v3_zero_executable_authority: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
