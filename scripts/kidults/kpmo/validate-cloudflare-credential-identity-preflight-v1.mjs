#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  approval: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01.md',
  terminal: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json',
  contract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  v2spec: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-v2-spec-v1.json',
  v2auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v2.json',
  v2workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v2.yml',
  workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs',
  test: 'tests/kidults/kpmo/github-comment-body-byte-exact-v1.test.mjs',
};

const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_PREFLIGHT_V1_CLOSURE_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING:${file}`);

const auth = parse(P.auth);
const approval = read(P.approval);
const terminal = parse(P.terminal);
const contract = parse(P.contract);
const v2spec = parse(P.v2spec);
const v2auth = parse(P.v2auth);
const v2workflow = read(P.v2workflow);
const workflow = read(P.workflow);
const registry = parse(P.registry);
const extractor = read(P.extractor);
const test = read(P.test);

ok(auth.id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01', 'AUTH_ID');
ok(auth.status === 'PREAUTHORIZATION_FAILED_NOT_CONSUMED_V1_LANE_EXHAUSTED_NO_EXTERNAL_CALL', 'AUTH_STATUS');
ok(auth.root_approval_receipt?.comment_id === 5489201610, 'ROOT_APPROVAL_COMMENT');
ok(auth.root_approval_receipt?.body_sha256 === 'sha256:05dfcc74062e14cc98d3866bf222dae6ea4b04749a35a8aabb259f1db73ea91d', 'ROOT_APPROVAL_DIGEST');
ok(sha256(approval) === auth.root_approval_receipt.body_sha256, 'APPROVAL_FILE_DIGEST');
ok(auth.post_landing_execution_binding_receipt?.comment_id === 5489902333, 'BINDING_COMMENT');
ok(auth.post_landing_execution_binding_receipt?.landing_pr_number === 1764, 'LANDING_PR');
ok(auth.post_landing_execution_binding_receipt?.landing_exact_head_sha === '8356485d12c33fbccaa21eb808b4fa4ce8cfa7d5', 'LANDING_HEAD');
ok(auth.post_landing_execution_binding_receipt?.landing_merge_sha === '4946a888f07d82d273fcc2b27c3408ad51181541', 'LANDING_MERGE');

const result = auth.terminal_result || {};
ok(result.workflow_run_id === 33478469222 && result.job_id === 99762628587, 'RUN_JOB');
ok(result.source_sha === '4946a888f07d82d273fcc2b27c3408ad51181541', 'SOURCE_SHA');
ok(result.conclusion === 'FAIL_CLOSED_PREAUTHORIZATION', 'CONCLUSION');
ok(result.authorization_consumed === false, 'AUTH_CONSUMED');
ok(result.consume_step === 'SKIPPED' && result.credential_probe_step === 'SKIPPED', 'SKIPPED_STEPS');
ok(result.environment_secret_expressions_executed === false, 'SECRET_EXPRESSIONS');
ok(result.external_read_request_count === 0 && result.cloudflare_request_count === 0, 'EXTERNAL_REQUESTS');
ok(result.worker_mutation_count === 0 && result.pages_mutation_count === 0
  && result.route_mutation_count === 0 && result.domain_mutation_count === 0, 'MUTATIONS');
ok(result.failure_stage === 'ROOT_APPROVAL_BODY_BYTE_COMPARISON', 'FAILURE_STAGE');
ok(result.failure_code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'FAILURE_CODE');
ok(result.expected_body_terminal_lf_count === 1
  && result.github_comment_body_terminal_lf_count === 1
  && result.jq_raw_output_record_separator_lf_count === 1
  && result.actual_extracted_terminal_lf_count === 2, 'LF_COUNTS');
ok(result.artifact_id === 9789017392, 'ARTIFACT_ID');
ok(result.artifact_digest === 'sha256:98a76cea4abbaead3b2e3a6b2f85b8808b2438a7f945765dd5ffcbbb5d25567b', 'ARTIFACT_DIGEST');
ok(auth.authority_classification?.v1_dispatch_slot_used === true, 'DISPATCH_SLOT');
ok(auth.authority_classification?.same_approval_operationally_reusable === false, 'APPROVAL_REUSE');
ok(auth.tombstone?.zero_executable_authority === true, 'TOMBSTONE_AUTHORITY');
ok(auth.future_execution?.new_versioned_workflow_required === true
  && auth.future_execution?.new_explicit_program_owner_approval_required === true, 'FUTURE_GATE');

ok(terminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33478469222 && terminal.job_id === 99762628587, 'TERMINAL_RUN_JOB');
ok(terminal.authorization_consumed === false, 'TERMINAL_CONSUMED');
ok(terminal.external_read_request_count === 0 && terminal.cloudflare_request_count === 0, 'TERMINAL_REQUESTS');
ok(terminal.environment_secret_expressions_executed === false, 'TERMINAL_SECRET_STEP');
ok(terminal.failure?.code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'TERMINAL_FAILURE');
ok(terminal.operational_authority?.v1_lane_exhausted === true, 'TERMINAL_EXHAUSTED');
ok(terminal.operational_authority?.same_approval_reusable === false, 'TERMINAL_NO_REUSE');
ok(terminal.operational_authority?.rerun_authorized === false
  && terminal.operational_authority?.replay_authorized === false
  && terminal.operational_authority?.second_dispatch_authorized === false, 'TERMINAL_NO_REPLAY');

ok(/^on:\s*\[\]\s*$/m.test(workflow), 'WORKFLOW_NO_TRIGGER');
ok(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH');
ok(!workflow.includes('environment:'), 'WORKFLOW_ENVIRONMENT');
ok(!workflow.includes('${{ secrets.'), 'WORKFLOW_SECRETS');
ok(!workflow.includes('api.cloudflare.com'), 'WORKFLOW_PROVIDER_ENDPOINT');
ok(workflow.includes('PREAUTHORIZATION_FAILED_V1_LANE_EXHAUSTED_ZERO_EXECUTABLE_AUTHORITY'), 'WORKFLOW_TOMBSTONE');
ok(workflow.includes('historical_workflow_run_id:33478469222'), 'WORKFLOW_RUN_TRUTH');
ok(workflow.includes('historical_external_read_request_count:0'), 'WORKFLOW_ZERO_REQUESTS');

ok(contract.status === 'V1_PREAUTHORIZATION_SERIALIZATION_FAILURE_CLOSED_V2_REQUIRED', 'CONTRACT_STATUS');
ok(contract.v1_terminal?.workflow_run_id === 33478469222, 'CONTRACT_RUN');
ok(contract.v1_terminal?.authorization_consumed === false, 'CONTRACT_CONSUMED');
ok(contract.v1_terminal?.external_read_request_count === 0, 'CONTRACT_REQUESTS');
ok(contract.byte_exact_approval_body_contract?.required_extraction === 'NO_ADDED_RECORD_SEPARATOR', 'CONTRACT_EXTRACTOR');
ok(contract.byte_exact_approval_body_contract?.forbidden_implementation === "jq -r '.body' > file", 'CONTRACT_FORBIDDEN');

ok(v2spec.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'V2_SPEC_STATUS');
ok(v2spec.materialized_workflow === true, 'V2_MATERIALIZED');
ok(v2spec.workflow === P.v2workflow, 'V2_WORKFLOW_PATH');
ok(v2spec.approval_id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-02', 'V2_APPROVAL_ID');
ok(v2spec.root_approval_comment_id === 5490553068, 'V2_ROOT_COMMENT');
ok(v2spec.standing_authority === false, 'V2_STANDING_AUTHORITY');
ok(v2spec.post_landing_exact_main_binding_required === true, 'V2_BINDING_REQUIRED');
ok(v2auth.id === v2spec.approval_id, 'V2_AUTH_ID');
ok(v2auth.status === 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING', 'V2_AUTH_STATUS');
ok(v2auth.root_approval_receipt?.comment_id === 5490553068, 'V2_AUTH_COMMENT');
ok(v2auth.runtime_state?.authorization_consumed === false, 'V2_AUTH_CONSUMED');
ok(/^on:\s*\n\s{2}workflow_dispatch:\s*$/m.test(v2workflow), 'V2_DISPATCH');
ok(v2workflow.includes('verify-cloudflare-credential-identity-preflight-v2-approval.mjs'), 'V2_APPROVAL_VERIFIER');
ok(v2workflow.includes('run-cloudflare-credential-identity-preflight-v2.mjs'), 'V2_PROBE_RUNNER');
ok(!v2workflow.includes("jq -r '.body'"), 'V2_JQ_RAW_FORBIDDEN');

ok(registry.registered_count === 23, 'REGISTRY_COUNT');
ok(registry.registered_workflows?.length === 23, 'REGISTRY_WORKFLOWS');
ok(registry.required_environment_bindings?.length === 23, 'REGISTRY_BINDINGS');
ok(!registry.registered_workflows.includes(P.workflow), 'REGISTRY_V1_PRESENT');
ok(registry.registered_workflows.includes(P.v2workflow), 'REGISTRY_V2_MISSING');
const v2Binding = registry.required_environment_bindings.find((entry) => entry.workflow === P.v2workflow);
ok(v2Binding?.job === 'verify-credential-identity-v2', 'REGISTRY_V2_JOB');
ok(v2Binding?.environment === 'kidults-cloudflare-staging-deploy', 'REGISTRY_V2_ENVIRONMENT');
for (const key of [
  'environment_bound_secret_bearing_jobs', 'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs', 'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === 23, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0), 0,
);
ok(privilegedSteps === 26, 'REGISTRY_PRIVILEGED_CALCULATED');
ok(registry.repository_binding_state?.privileged_secret_steps === 26, 'REGISTRY_PRIVILEGED_RECORDED');
const failed = registry.repository_containment?.failed_cloudflare_credential_identity_preflight_v1;
ok(failed?.workflow_run_id === 33478469222, 'REGISTRY_INCIDENT_RUN');
ok(failed?.authorization_consumed === false, 'REGISTRY_INCIDENT_CONSUMED');
ok(failed?.external_read_request_count === 0, 'REGISTRY_INCIDENT_REQUESTS');
ok(failed?.secret_registry_membership === false && failed?.environment_binding === false, 'REGISTRY_INCIDENT_AUTHORITY');
ok(failed?.same_approval_reusable === false, 'REGISTRY_INCIDENT_REUSE');
ok(registry.repository_containment?.approved_read_only_cloudflare_credential_identity_preflight_v2?.approval_id === v2auth.id, 'REGISTRY_V2_APPROVAL');

ok(extractor.includes('process.stdout.write(payload.body)'), 'EXTRACTOR_BYTE_EXACT');
ok(!extractor.includes('console.log(payload.body)'), 'EXTRACTOR_CONSOLE_LOG');
ok(test.includes("execFileSync('jq', ['-r', '.body', oneLfJson])"), 'TEST_JQ_RAW');
ok(test.includes("execFileSync('jq', ['-j', '.body', oneLfJson])"), 'TEST_JQ_JOIN');
ok(test.includes('one-terminal-lf') && test.includes('two-terminal-lfs'), 'TEST_LF_CASES');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-credential-identity-preflight-v1-closure-validation',
  state: 'VERIFIED_PASS',
  incident_issue: 1771,
  workflow_run_id: 33478469222,
  authorization_consumed: false,
  v1_lane_exhausted: true,
  external_read_request_count: 0,
  cloudflare_request_count: 0,
  secret_probe_step: 'SKIPPED',
  failure_code: 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF',
  byte_exact_extractor_regression: true,
  v1_zero_executable_authority: true,
  v2_approval_id: v2auth.id,
  v2_authorization_consumed: false,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  worker_pages_route_domain_mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
