#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v2.json',
  approval: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02.md',
  spec: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-v2-spec-v1.json',
  workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml',
  v1Workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs',
  extractorTest: 'tests/kidults/kpmo/github-comment-body-byte-exact-v1.test.mjs',
  approvalVerifier: 'scripts/kidults/kpmo/verify-cloudflare-credential-identity-preflight-v2-approval.mjs',
  probeRunner: 'scripts/kidults/kpmo/run-cloudflare-credential-identity-preflight-v2.mjs',
};

const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_PREFLIGHT_V2_APPROVAL_READY_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const activeText = (text) => text
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('#'))
  .map((line) => line.replace(/\s+#.*$/, ''))
  .join('\n');

for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING:${file}`);

const auth = parse(P.auth);
const approval = read(P.approval);
const spec = parse(P.spec);
const workflow = read(P.workflow);
const active = activeText(workflow);
const v1Workflow = read(P.v1Workflow);
const registry = parse(P.registry);
const extractor = read(P.extractor);
const extractorTest = read(P.extractorTest);
const approvalVerifier = read(P.approvalVerifier);
const probeRunner = read(P.probeRunner);

ok(auth.id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02', 'AUTH_ID');
ok(auth.version === '1.0.0', 'AUTH_VERSION');
ok(auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'AUTH_STATUS');
ok(auth.authorized_by?.github_login === 'johnkim9524-collab', 'AUTH_OWNER');
ok(auth.authorized_by?.author_association === 'OWNER', 'AUTH_ASSOCIATION');
ok(auth.root_approval_receipt?.issue_number === 1774, 'AUTH_ISSUE');
ok(auth.root_approval_receipt?.comment_id === 5490553068, 'AUTH_COMMENT');
ok(auth.root_approval_receipt?.comment_node_id === 'IC_kwDOTF-G-M8AAAABR0Mw7A', 'AUTH_COMMENT_NODE');
ok(auth.root_approval_receipt?.created_at === '2026-09-01T07:36:59Z', 'AUTH_CREATED');
ok(auth.root_approval_receipt?.updated_at === auth.root_approval_receipt?.created_at, 'AUTH_COMMENT_EDITED');
ok(auth.root_approval_receipt?.performed_via_github_app === 'chatgpt-codex-connector', 'AUTH_APP');
ok(auth.root_approval_receipt?.body_sha256 === 'sha256:3d6ea6b4c95d9abe7e3328c0402a6ae9a7b12013d2d4e34ce0cba3c18aaeccf6', 'AUTH_BODY_DIGEST');
ok(sha256(approval) === auth.root_approval_receipt.body_sha256, 'APPROVAL_BODY_DIGEST');
ok(approval.endsWith('\n'), 'APPROVAL_FINAL_LF');
for (const marker of [
  'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02',
  'Cloudflare Credential Identity Preflight v2',
  '읽기 전용 GET 요청을 최대 2회',
  'Worker·Pages·route·domain 변경은 모두 0',
  'rerun·replay·두 번째 dispatch는 승인하지 않습니다.',
  'Public·Production·G5 HOLD',
]) ok(approval.includes(marker), `APPROVAL_SCOPE:${marker}`);

ok(auth.issuance_binding?.protected_main_sha_at_receipt_issuance === 'ecfa2fd2b6d24d3e8d977544411cf590d84d48ee', 'ISSUANCE_MAIN');
ok(auth.issuance_binding?.nonce === '4e47ac299e26f983d9773efdf913c7619b587978d2ab2e3b', 'AUTH_NONCE');
ok(auth.issuance_binding?.issued_at === '2026-09-01T07:36:40Z', 'AUTH_ISSUED');
ok(auth.issuance_binding?.expires_at === '2026-09-02T07:36:40Z', 'AUTH_EXPIRY');
ok(Date.parse(auth.issuance_binding.expires_at) > Date.parse(auth.issuance_binding.issued_at), 'AUTH_TIME_ORDER');

const binding = auth.post_landing_execution_binding || {};
ok(binding.required === true && binding.valid_binding_count_required === 1, 'BINDING_CARDINALITY');
ok(binding.issue_number === 1774, 'BINDING_ISSUE');
ok(binding.marker_start === '<!-- CF_CREDENTIAL_IDENTITY_PREFLIGHT_V2_EXECUTION_BINDING_V1_START -->', 'BINDING_START');
ok(binding.marker_end === '<!-- CF_CREDENTIAL_IDENTITY_PREFLIGHT_V2_EXECUTION_BINDING_V1_END -->', 'BINDING_END');
ok(binding.schema === 'CF_CREDENTIAL_IDENTITY_PREFLIGHT_V2_EXECUTION_BINDING_V1', 'BINDING_SCHEMA');
ok(binding.state === 'BOUND_TO_EXACT_POST_LANDING_MAIN', 'BINDING_STATE');
ok(binding.required_root_approval_comment_id === 5490553068, 'BINDING_ROOT_COMMENT');
ok(binding.required_root_approval_body_sha256 === auth.root_approval_receipt.body_sha256, 'BINDING_ROOT_DIGEST');
ok(binding.required_workflow === P.workflow, 'BINDING_WORKFLOW');
ok(binding.required_environment === 'kidults-cloudflare-staging-deploy', 'BINDING_ENVIRONMENT');
ok(binding.required_nonce === auth.issuance_binding.nonce, 'BINDING_NONCE');
ok(binding.required_expiry === auth.issuance_binding.expires_at, 'BINDING_EXPIRY');
ok(binding.executable_before_binding === false, 'BINDING_PREEXECUTION');

const scope = auth.authorized_scope || {};
ok(scope.workflow === P.workflow, 'SCOPE_WORKFLOW');
ok(scope.trigger === 'workflow_dispatch' && scope.source_ref === 'refs/heads/main', 'SCOPE_TRIGGER_REF');
ok(scope.environment === 'kidults-cloudflare-staging-deploy', 'SCOPE_ENVIRONMENT');
ok(scope.workflow_dispatch_count_max === 1 && scope.external_request_count_max === 2, 'SCOPE_COUNTS');
ok(scope.authorization_consumed_on === 'FIRST_VALID_V2_PREFLIGHT_DISPATCH_PASS_OR_FAIL', 'SCOPE_CONSUMPTION');
ok(Array.isArray(scope.allowed_requests) && scope.allowed_requests.length === 2, 'SCOPE_REQUEST_LIST');
ok(scope.allowed_requests[0]?.method === 'GET'
  && scope.allowed_requests[0]?.endpoint === 'https://api.cloudflare.com/client/v4/user/tokens/verify', 'SCOPE_REQUEST_ONE');
ok(scope.allowed_requests[1]?.method === 'GET'
  && scope.allowed_requests[1]?.endpoint_template === 'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/scripts', 'SCOPE_REQUEST_TWO');
for (const key of [
  'worker_mutation_count_max', 'pages_mutation_count_max',
  'route_mutation_count_max', 'domain_mutation_count_max',
]) ok(scope[key] === 0, `SCOPE_ZERO:${key}`);
for (const key of [
  'secret_output_allowed', 'secret_persistence_allowed',
  'authorization_header_output_allowed', 'raw_provider_response_output_or_persistence_allowed',
  'external_spend_allowed', 'contract_change_allowed',
  'new_credential_creation_allowed', 'credential_scope_expansion_allowed',
]) ok(scope[key] === false, `SCOPE_FALSE:${key}`);
ok(auth.execution_controls?.github_token_permissions?.join(',') === 'actions:read,contents:read', 'AUTH_GITHUB_TOKEN_PERMISSIONS');
ok(auth.execution_controls?.provider_response_handling === 'IN_MEMORY_SANITIZED_FIELDS_ONLY', 'AUTH_RESPONSE_HANDLING');
ok(auth.execution_controls?.raw_provider_responses_persisted === false, 'AUTH_RAW_RESPONSE_PERSISTENCE');
ok(auth.runtime_state?.authorization_consumed === false, 'AUTH_PREEXECUTION_CONSUMED');
ok(auth.runtime_state?.external_read_request_count === 0, 'AUTH_PREEXECUTION_REQUESTS');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V2_PREFLIGHT_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'AUTH_REPLAY');
ok(auth.release_boundary?.production_routes === 0 && auth.release_boundary?.custom_domains === 0, 'AUTH_TOPOLOGY');
ok(auth.release_boundary?.public === 'HOLD'
  && auth.release_boundary?.production === 'HOLD'
  && auth.release_boundary?.g5 === 'HOLD', 'AUTH_HOLD');

ok(spec.id === 'kidults-cloudflare-credential-identity-preflight-v2-spec-v1', 'SPEC_ID');
ok(spec.version === '1.1.0', 'SPEC_VERSION');
ok(spec.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'SPEC_STATUS');
ok(spec.materialized_workflow === true && spec.workflow === P.workflow, 'SPEC_MATERIALIZED');
ok(spec.standing_authority === false, 'SPEC_STANDING_AUTHORITY');
ok(spec.explicit_program_owner_approval_present === true, 'SPEC_APPROVAL');
ok(spec.post_landing_exact_main_binding_required === true, 'SPEC_BINDING');
ok(spec.workflow_dispatch_count_max === 1 && spec.external_read_request_count_max === 2, 'SPEC_COUNTS');
for (const required of [
  'BYTE_EXACT_GITHUB_COMMENT_BODY_EXTRACTION_WITHOUT_RECORD_SEPARATOR',
  'EXACT_POST_LANDING_MAIN_BINDING',
  'UNIQUE_FIRST_V2_DISPATCH_LEDGER',
  'ENVIRONMENT_SECRETS_STEP_SCOPED_AFTER_ALL_PREAUTHORIZATION_GATES',
  'MAXIMUM_TWO_READ_ONLY_CLOUDFLARE_GET_REQUESTS',
  'RAW_PROVIDER_RESPONSES_NEVER_PERSISTED',
  'ZERO_WORKER_PAGES_ROUTE_DOMAIN_MUTATION',
]) ok(spec.required_controls?.includes(required), `SPEC_CONTROL:${required}`);

ok(/^on:\s*\n\s{2}workflow_dispatch:\s*$/m.test(active), 'WORKFLOW_DISPATCH_ONLY');
for (const forbiddenTrigger of ['push:', 'pull_request:', 'pull_request_target:', 'workflow_run:', 'repository_dispatch:', 'schedule:']) {
  ok(!new RegExp(`^\\s{2}${forbiddenTrigger.replace(':', '\\:')}`, 'm').test(active), `WORKFLOW_FORBIDDEN_TRIGGER:${forbiddenTrigger}`);
}
ok(/^permissions:\s*\n\s{2}actions:\s*read\s*\n\s{2}contents:\s*read\s*$/m.test(active), 'WORKFLOW_PERMISSIONS');
ok(active.includes('group: kidults-cloudflare-credential-identity-preflight-v2-one-shot'), 'WORKFLOW_CONCURRENCY');
ok(active.includes('cancel-in-progress: false'), 'WORKFLOW_NO_CANCEL');
ok(active.includes('  verify-credential-identity-v2:'), 'WORKFLOW_JOB');
ok(active.includes('    environment: kidults-cloudflare-staging-deploy'), 'WORKFLOW_ENVIRONMENT');
ok(active.includes('    runs-on: ubuntu-24.04'), 'WORKFLOW_RUNNER');
ok(active.includes('Verify live main before provider credential resolution'), 'WORKFLOW_LIVE_MAIN_NAME');
for (const marker of [
  'GITHUB_TOKEN: ${{ github.token }}',
  'test "$GITHUB_REF" = "refs/heads/main"',
  'curl --fail-with-body --silent --show-error',
  '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/branches/main',
  'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
]) ok(active.includes(marker), `WORKFLOW_LIVE_MAIN:${marker}`);
ok((active.match(/\$\{\{\s*github\.token\s*\}\}/g) || []).length === 2, 'WORKFLOW_GITHUB_TOKEN_COUNT');
ok(active.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'), 'WORKFLOW_CHECKOUT_PIN');
ok(active.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'WORKFLOW_NODE_PIN');
ok(active.includes("node-version: '24.19.0'"), 'WORKFLOW_NODE_VERSION');
ok(active.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'WORKFLOW_UPLOAD_PIN');

const approvalStepName = '      - name: Verify exact Program Owner approval, binding and unique first dispatch';
const approvalStepIndex = active.indexOf(approvalStepName);
const secretStepName = '      - name: Execute approved read-only Cloudflare credential identity preflight v2';
const secretStepIndex = active.indexOf(secretStepName);
ok(approvalStepIndex > 0 && secretStepIndex > approvalStepIndex, 'WORKFLOW_PREAUTHORIZATION_ORDER');
ok(active.includes('verify-cloudflare-credential-identity-preflight-v2-approval.mjs'), 'WORKFLOW_APPROVAL_VERIFIER');
ok(active.includes('run-cloudflare-credential-identity-preflight-v2.mjs'), 'WORKFLOW_PROBE_RUNNER');
ok(!active.slice(0, secretStepIndex).includes('${{ secrets.'), 'WORKFLOW_SECRET_BEFORE_PROBE');
const secretNames = [...active.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/g)].map((match) => match[1]).sort();
ok(JSON.stringify(secretNames) === JSON.stringify(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']), 'WORKFLOW_SECRET_SET');
const nextStepIndex = active.indexOf('\n      - name:', secretStepIndex + secretStepName.length);
const secretStep = active.slice(secretStepIndex, nextStepIndex);
ok(secretStep.includes('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}'), 'WORKFLOW_ACCOUNT_STEP_SCOPE');
ok(secretStep.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'WORKFLOW_TOKEN_STEP_SCOPE');
ok(active.includes('Finalize truthful terminal receipt'), 'WORKFLOW_FINALIZER');
ok(active.includes('if: always()'), 'WORKFLOW_ALWAYS_FINALIZER');
ok(active.includes('provider_response_handling="IN_MEMORY_SANITIZED_FIELDS_ONLY"'), 'WORKFLOW_RESPONSE_HANDLING');
ok(active.includes('raw_provider_responses_persisted=false'), 'WORKFLOW_RAW_NOT_PERSISTED');
ok(active.includes('if-no-files-found: error'), 'WORKFLOW_ARTIFACT_REQUIRED');
ok(active.includes('${{ runner.temp }}/kidults-cloudflare-credential-identity-preflight-v2/receipt.json'), 'WORKFLOW_RUNNER_TEMP_RECEIPT');
ok(active.includes('Preserve exact credential identity terminal verdict'), 'WORKFLOW_TERMINAL_VERDICT');

for (const marker of [
  'issues/comments/${ROOT_COMMENT_ID}',
  'execFileSync(process.execPath, [EXTRACTOR_PATH, commentJsonPath]',
  'ROOT_COMMENT_BODY_BYTE_EXACT',
  'CF_CREDENTIAL_IDENTITY_PREFLIGHT_V2_EXECUTION_BINDING_V1',
  'EXECUTION_BINDING_MARKER_COUNT_',
  'landing_pr_number',
  'landing_exact_head_sha',
  'EXECUTION_BINDING_PR_NOT_MERGED_TO_RUNTIME_MAIN',
  'EXECUTION_BINDING_EXPIRED',
  'actions/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml/runs?event=workflow_dispatch&branch=main&per_page=100',
  'V2_PREFLIGHT_ONE_SHOT_REPLAY_OR_CONCURRENT_DISPATCH_FORBIDDEN',
  'UNIQUE_FIRST_V2_PREFLIGHT_MAIN_DISPATCH_VERIFIED',
  'authorization_consumed: true',
]) ok(approvalVerifier.includes(marker), `APPROVAL_VERIFIER:${marker}`);
ok(!approvalVerifier.includes("jq -r '.body'"), 'APPROVAL_VERIFIER_JQ_RAW');
ok(!approvalVerifier.includes('console.log(rootComment.body)'), 'APPROVAL_VERIFIER_BODY_LOG');

ok((probeRunner.match(/https:\/\/api\.cloudflare\.com\/client\/v4\//g) || []).length === 2, 'PROBE_ENDPOINT_COUNT');
ok(probeRunner.includes('https://api.cloudflare.com/client/v4/user/tokens/verify'), 'PROBE_TOKEN_ENDPOINT');
ok(probeRunner.includes('https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts'), 'PROBE_WORKERS_ENDPOINT');
ok((probeRunner.match(/method:\s*'GET'/g) || []).length === 1, 'PROBE_METHOD_GET');
ok(!/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/.test(probeRunner), 'PROBE_MUTATING_METHOD');
ok(!/(?:--request|-X)\s+(?:POST|PUT|PATCH|DELETE)/.test(probeRunner), 'PROBE_MUTATING_CURL_METHOD');
for (const forbidden of ['/workers/services/', '/pages/projects/', '/zones/']) {
  ok(!probeRunner.includes(forbidden), `PROBE_MUTATING_SURFACE:${forbidden}`);
}
ok(probeRunner.includes('IN_MEMORY_SANITIZED_FIELDS_ONLY'), 'PROBE_RESPONSE_HANDLING');
ok(!probeRunner.includes('.raw.json'), 'PROBE_RAW_FILE');
ok(!probeRunner.includes('response.text()'), 'PROBE_RAW_TEXT');
ok(!/\bconsole\.(?:log|error)\([^)]*(?:accountId|apiToken|payload)/.test(probeRunner), 'PROBE_SECRET_OR_RAW_LOG');
ok(probeRunner.includes('external_read_request_count: requestNumber'), 'PROBE_REQUEST_LEDGER');
ok(probeRunner.includes('cloudflare_error_7003_observed'), 'PROBE_7003');
ok(probeRunner.includes('worker_mutation_count: 0'), 'PROBE_ZERO_WORKER');
ok(probeRunner.includes('pages_mutation_count: 0'), 'PROBE_ZERO_PAGES');
ok(probeRunner.includes('route_mutation_count: 0'), 'PROBE_ZERO_ROUTE');
ok(probeRunner.includes('domain_mutation_count: 0'), 'PROBE_ZERO_DOMAIN');

ok(/^on:\s*\[\]\s*$/m.test(v1Workflow), 'V1_TOMBSTONE_TRIGGER');
ok(!v1Workflow.includes('workflow_dispatch'), 'V1_DISPATCH_REINTRODUCED');
ok(!v1Workflow.includes('environment:'), 'V1_ENVIRONMENT_REINTRODUCED');
ok(!v1Workflow.includes('${{ secrets.'), 'V1_SECRETS_REINTRODUCED');
ok(!v1Workflow.includes('api.cloudflare.com'), 'V1_NETWORK_REINTRODUCED');

const v2Binding = registry.required_environment_bindings?.find((entry) => entry.workflow === P.workflow);
ok(registry.registered_count === 23, 'REGISTRY_COUNT');
ok(registry.registered_workflows?.length === 23, 'REGISTRY_WORKFLOW_COUNT');
ok(registry.required_environment_bindings?.length === 23, 'REGISTRY_BINDING_COUNT');
ok(registry.registered_workflows.includes(P.workflow), 'REGISTRY_V2_MISSING');
ok(!registry.registered_workflows.includes(P.v1Workflow), 'REGISTRY_V1_PRESENT');
ok(v2Binding?.job === 'verify-credential-identity-v2', 'REGISTRY_V2_JOB');
ok(v2Binding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_V2_ENVIRONMENT');
ok(v2Binding?.required_secret_name_digest === 'sha256:9d106dc2b7f97ab70b18b83662808f580c0e9068f2d207b4c40e741cacd14978', 'REGISTRY_V2_SECRET_DIGEST');
ok(JSON.stringify(v2Binding?.required_secret_step_names) === JSON.stringify(['Execute approved read-only Cloudflare credential identity preflight v2']), 'REGISTRY_V2_SECRET_STEP');
ok(JSON.stringify(v2Binding?.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']), 'REGISTRY_V2_TRIGGER');
ok(v2Binding?.remote_mutation_class === 'READ_ONLY_CONTROL_PLANE', 'REGISTRY_V2_CLASS');
ok(JSON.stringify(v2Binding?.required_github_token_permissions) === JSON.stringify(['actions:read', 'contents:read']), 'REGISTRY_V2_TOKEN_PERMISSIONS');
ok(JSON.stringify(v2Binding?.required_github_token_step_names) === JSON.stringify([
  'Verify exact Program Owner approval, binding and unique first dispatch',
  'Verify live main before provider credential resolution',
]), 'REGISTRY_V2_TOKEN_STEPS');
for (const key of [
  'environment_bound_secret_bearing_jobs', 'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs', 'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0), 0,
);
ok(privilegedSteps === 26, 'REGISTRY_PRIVILEGED_CALCULATED');
ok(registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_RECORDED');
ok(registry.repository_containment?.provider_activation === 'HOLD_EXCEPT_EXACT_ONE_SHOT_READ_ONLY_CREDENTIAL_PREFLIGHT_V2_APPROVAL', 'REGISTRY_PROVIDER_BOUNDARY');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.approval_id === auth.id, 'REGISTRY_V2_APPROVAL');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.execution_binding_required === true, 'REGISTRY_V2_BINDING');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.external_read_request_count_max === 2, 'REGISTRY_V2_REQUESTS');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.raw_provider_responses_persisted === false, 'REGISTRY_V2_RAW_RESPONSE');

ok(extractor.includes('process.stdout.write(payload.body)'), 'EXTRACTOR_BYTE_EXACT');
ok(!extractor.includes('console.log(payload.body)'), 'EXTRACTOR_CONSOLE_LOG');
ok(extractorTest.includes("execFileSync('jq', ['-r', '.body', oneLfJson])"), 'TEST_JQ_RAW');
ok(extractorTest.includes("execFileSync('jq', ['-j', '.body', oneLfJson])"), 'TEST_JQ_JOIN');
ok(extractorTest.includes('one-terminal-lf') && extractorTest.includes('two-terminal-lfs'), 'TEST_LF_CASES');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-credential-identity-preflight-v2-approval-ready-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  approval_issue: 1774,
  root_approval_comment_id: 5490553068,
  root_approval_body_sha256: auth.root_approval_receipt.body_sha256,
  post_landing_execution_binding_required: true,
  authorization_consumed: false,
  workflow_dispatch_count_max: 1,
  external_read_request_count_max: 2,
  provider_response_handling: 'IN_MEMORY_SANITIZED_FIELDS_ONLY',
  byte_exact_comment_body_extraction: true,
  v1_zero_executable_authority: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  worker_pages_route_domain_mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
