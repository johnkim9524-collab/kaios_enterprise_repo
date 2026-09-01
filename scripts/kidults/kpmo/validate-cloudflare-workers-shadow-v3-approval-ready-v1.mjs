#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json',
  terminal: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03-terminal.json',
  approval: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03.md',
  workflow: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  credentialV1Contract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  credentialV1Auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  credentialV1Terminal: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json',
  credentialV1Workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  credentialV2Spec: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-v2-spec-v1.json',
  credentialV2Auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v2.json',
  credentialV2Workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs',
  extractorTest: 'tests/kidults/kpmo/github-comment-body-byte-exact-v1.test.mjs',
};

const fail = (code) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_V3_CONSUMED_VALIDATION_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING:${file}`);

const auth = parse(P.auth);
const terminal = parse(P.terminal);
const approval = read(P.approval);
const workflow = read(P.workflow);
const registry = parse(P.registry);
const credentialV1Contract = parse(P.credentialV1Contract);
const credentialV1Auth = parse(P.credentialV1Auth);
const credentialV1Terminal = parse(P.credentialV1Terminal);
const credentialV1Workflow = read(P.credentialV1Workflow);
const credentialV2Spec = parse(P.credentialV2Spec);
const credentialV2Auth = parse(P.credentialV2Auth);
const credentialV2Workflow = read(P.credentialV2Workflow);
const extractor = read(P.extractor);
const extractorTest = read(P.extractorTest);

ok(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
ok(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'AUTH_STATUS');
ok(auth.root_approval_receipt?.comment_id === 5487854388, 'ROOT_APPROVAL');
ok(auth.post_landing_execution_binding_receipt?.comment_id === 5488380368, 'POST_LANDING_BINDING');
ok(auth.post_landing_execution_binding_receipt?.landing_pr_number === 1749, 'LANDING_PR');
ok(auth.post_landing_execution_binding_receipt?.landing_exact_head_sha === '7cd46ac41dd6765fb628a954be6eb8677bb11faa', 'LANDING_HEAD');
ok(auth.post_landing_execution_binding_receipt?.landing_merge_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'LANDING_MERGE');

const consumed = auth.consumption_result || {};
ok(consumed.workflow_run_id === 33465807642 && consumed.job_id === 99725309548, 'CONSUMING_RUN_JOB');
ok(consumed.source_sha === 'b467787d358b85968ebfe7d993a538faa8b70e13', 'CONSUMING_SHA');
ok(consumed.authorization_consumed === true, 'AUTH_NOT_CONSUMED');
ok(consumed.unique_first_dispatch_verified === true, 'UNIQUE_FIRST_DISPATCH');
ok(consumed.locked_wrangler_version === '4.127.1', 'WRANGLER_VERSION');
ok(consumed.locked_wrangler_dry_run_verified === true && consumed.dry_run_asset_count === 128, 'DRY_RUN');
ok(consumed.provider_attempt_marker_written === true, 'PROVIDER_MARKER');
ok(consumed.provider_process_invoked === true && consumed.provider_deployment_attempt_count === 1, 'PROVIDER_ATTEMPT');
ok(consumed.provider_exit_code === 1 && consumed.cloudflare_error_code === 7003, 'PROVIDER_ERROR');
ok(consumed.root_cause_class === 'CLOUDFLARE_ACCOUNT_ID_OR_TOKEN_ACCOUNT_SCOPE_MISMATCH', 'ROOT_CAUSE');
ok(consumed.worker_deployment_success === false && consumed.workers_dev_url === null, 'DEPLOYMENT_TRUTH');
ok(consumed.readback_executed === false && consumed.remote_mutation_evidenced === false, 'READBACK_MUTATION_TRUTH');
ok(consumed.artifact_id === 9784793397, 'ARTIFACT_ID');
ok(consumed.artifact_digest === 'sha256:0ab4517f47cfbb2cdf3de1a81e03af981df2dd5285df403dc8b4f611c5267c05', 'ARTIFACT_DIGEST');
ok(auth.tombstone?.zero_executable_authority === true, 'TOMBSTONE_AUTHORITY');
ok(auth.future_execution?.current_approval_reusable === false, 'AUTH_REUSE');
ok(auth.future_execution?.rerun_authorized === false && auth.future_execution?.second_dispatch_authorized === false, 'AUTH_NO_REPLAY');
ok(auth.replay === 'FORBIDDEN_AFTER_FIRST_VALID_V3_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');
ok(sha256(approval) === auth.root_approval_receipt.body_sha256, 'APPROVAL_DIGEST');

ok(terminal.state === 'VERIFIED_FAIL_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33465807642 && terminal.job_id === 99725309548, 'TERMINAL_RUN');
ok(terminal.authorization_consumed === true, 'TERMINAL_CONSUMED');
ok(terminal.provider?.deployment_attempt_count === 1 && terminal.provider?.cloudflare_error_code === 7003, 'TERMINAL_PROVIDER');
ok(terminal.provider?.worker_deployment_success === false, 'TERMINAL_DEPLOYMENT');
ok(terminal.provider?.workers_dev_url === null && terminal.provider?.readback_executed === false, 'TERMINAL_READBACK');
ok(terminal.provider?.remote_mutation_evidenced === false, 'TERMINAL_MUTATION');
ok(terminal.artifact?.id === 9784793397 && terminal.artifact?.digest === consumed.artifact_digest, 'TERMINAL_ARTIFACT');
ok(terminal.terminal_controls?.rerun_authorized === false
  && terminal.terminal_controls?.replay_authorized === false
  && terminal.terminal_controls?.second_dispatch_authorized === false, 'TERMINAL_NO_REPLAY');

ok(/^on:\s*\[\]\s*$/m.test(workflow), 'WORKFLOW_NO_TRIGGER');
ok(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH');
ok(!workflow.includes('environment:'), 'WORKFLOW_ENVIRONMENT');
ok(!workflow.includes('${{ secrets.'), 'WORKFLOW_SECRETS');
ok(!workflow.includes('api.cloudflare.com'), 'WORKFLOW_PROVIDER_ENDPOINT');
ok(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'WORKFLOW_TOMBSTONE');
ok(workflow.includes('historical_cloudflare_error_code:7003'), 'WORKFLOW_ERROR_TRUTH');

ok(credentialV1Contract.status === 'V1_PREAUTHORIZATION_SERIALIZATION_FAILURE_CLOSED_V2_REQUIRED', 'CREDENTIAL_V1_CONTRACT');
ok(credentialV1Auth.status === 'PREAUTHORIZATION_FAILED_NOT_CONSUMED_V1_LANE_EXHAUSTED_NO_EXTERNAL_CALL', 'CREDENTIAL_V1_AUTH');
ok(credentialV1Auth.terminal_result?.external_read_request_count === 0, 'CREDENTIAL_V1_REQUESTS');
ok(credentialV1Terminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'CREDENTIAL_V1_TERMINAL');
ok(/^on:\s*\[\]\s*$/m.test(credentialV1Workflow), 'CREDENTIAL_V1_TOMBSTONE');
ok(!credentialV1Workflow.includes('workflow_dispatch')
  && !credentialV1Workflow.includes('${{ secrets.')
  && !credentialV1Workflow.includes('api.cloudflare.com'), 'CREDENTIAL_V1_ZERO_AUTHORITY');

ok(credentialV2Spec.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'CREDENTIAL_V2_SPEC_STATUS');
ok(credentialV2Spec.materialized_workflow === true, 'CREDENTIAL_V2_MATERIALIZED');
ok(credentialV2Spec.approval_id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02', 'CREDENTIAL_V2_APPROVAL');
ok(credentialV2Auth.id === credentialV2Spec.approval_id, 'CREDENTIAL_V2_AUTH_ID');
ok(credentialV2Auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'CREDENTIAL_V2_AUTH_STATUS');
ok(credentialV2Auth.runtime_state?.authorization_consumed === false, 'CREDENTIAL_V2_CONSUMED');
ok(/^on:\s*\n\s{2}workflow_dispatch:\s*$/m.test(credentialV2Workflow), 'CREDENTIAL_V2_DISPATCH');
ok(credentialV2Workflow.includes('verify-cloudflare-credential-identity-preflight-v2-approval.mjs'), 'CREDENTIAL_V2_APPROVAL_VERIFIER');
ok(credentialV2Workflow.includes('run-cloudflare-credential-identity-preflight-v2.mjs'), 'CREDENTIAL_V2_PROBE_RUNNER');
ok(!credentialV2Workflow.includes("jq -r '.body'"), 'CREDENTIAL_V2_JQ_RAW');

ok(!registry.registered_workflows?.includes(P.workflow), 'REGISTRY_V3_PRESENT');
ok(!registry.registered_workflows?.includes(P.credentialV1Workflow), 'REGISTRY_CREDENTIAL_V1_PRESENT');
ok(registry.registered_workflows?.includes(P.credentialV2Workflow), 'REGISTRY_CREDENTIAL_V2_MISSING');
ok(registry.registered_count === 23, 'REGISTRY_COUNT');
ok(registry.registered_count === registry.registered_workflows?.length, 'REGISTRY_WORKFLOW_COUNT');
ok(registry.registered_count === registry.required_environment_bindings?.length, 'REGISTRY_BINDING_COUNT');
for (const key of [
  'environment_bound_secret_bearing_jobs', 'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs', 'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0), 0,
);
ok(privilegedSteps === 26, 'REGISTRY_PRIVILEGED_CALCULATED');
ok(registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_RECORDED');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.approval_id === credentialV2Auth.id, 'REGISTRY_V2_APPROVAL');
ok(registry.repository_containment?.provider_activation === 'HOLD_EXCEPT_EXACT_ONE_SHOT_READ_ONLY_CREDENTIAL_PREFLIGHT_V2_APPROVAL', 'REGISTRY_PROVIDER_BOUNDARY');

ok(extractor.includes('process.stdout.write(payload.body)'), 'EXTRACTOR_BYTE_EXACT');
ok(!extractor.includes('console.log(payload.body)'), 'EXTRACTOR_CONSOLE_LOG');
ok(extractorTest.includes("execFileSync('jq', ['-r', '.body', oneLfJson])"), 'TEST_JQ_RAW');
ok(extractorTest.includes("execFileSync('jq', ['-j', '.body', oneLfJson])"), 'TEST_JQ_JOIN');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v3-consumed-7003-validation-v3',
  state: 'VERIFIED_PASS',
  approval_id: auth.id,
  workflow_run_id: terminal.workflow_run_id,
  provider_deployment_attempt_count: 1,
  cloudflare_error_code: 7003,
  worker_deployment_success: false,
  workers_dev_url: null,
  remote_mutation_evidenced: false,
  v3_zero_executable_authority: true,
  credential_preflight_v1_zero_executable_authority: true,
  credential_preflight_v2_approval_id: credentialV2Auth.id,
  credential_preflight_v2_authorization_consumed: false,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  production_routes: 0,
  custom_domains: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
