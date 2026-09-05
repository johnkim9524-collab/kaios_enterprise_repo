#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  approval: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01.md',
  terminal: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json',
  contract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  v2spec: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-v2-spec-v1.json',
  workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-byte-exact-v1.mjs',
  test: 'tests/kidults/kpmo/github-comment-body-byte-exact-v1.test.mjs',
};

const fail = code => { throw new Error(`CLOUDFLARE_CREDENTIAL_PREFLIGHT_V1_CLOSURE_FAIL:${code}`); };
const ok = (value, code) => { if (!value) fail(code); };
const read = file => fs.readFileSync(file, 'utf8');
const parse = file => JSON.parse(read(file));
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING:${file}`);

const auth = parse(P.auth);
const approval = read(P.approval);
const terminal = parse(P.terminal);
const contract = parse(P.contract);
const v2spec = parse(P.v2spec);
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
ok(result.workflow_run_id === 33478469222, 'RUN_ID');
ok(result.job_id === 99762628587, 'JOB_ID');
ok(result.source_sha === '4946a888f07d82d273fcc2b27c3408ad51181541', 'SOURCE_SHA');
ok(result.conclusion === 'FAIL_CLOSED_PREAUTHORIZATION', 'CONCLUSION');
ok(result.authorization_consumed === false, 'AUTH_CONSUMED');
ok(result.consume_step === 'SKIPPED', 'CONSUME_STEP');
ok(result.credential_probe_step === 'SKIPPED', 'PROBE_STEP');
ok(result.environment_secret_expressions_executed === false, 'SECRET_EXPRESSIONS');
ok(result.external_read_request_count === 0 && result.cloudflare_request_count === 0, 'EXTERNAL_REQUEST_COUNT');
ok(result.worker_mutation_count === 0 && result.pages_mutation_count === 0
  && result.route_mutation_count === 0 && result.domain_mutation_count === 0, 'MUTATION_COUNTS');
ok(result.failure_stage === 'ROOT_APPROVAL_BODY_BYTE_COMPARISON', 'FAILURE_STAGE');
ok(result.failure_code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'FAILURE_CODE');
ok(result.expected_body_terminal_lf_count === 1, 'EXPECTED_LF');
ok(result.github_comment_body_terminal_lf_count === 1, 'COMMENT_LF');
ok(result.jq_raw_output_record_separator_lf_count === 1, 'JQ_RECORD_SEPARATOR');
ok(result.actual_extracted_terminal_lf_count === 2, 'EXTRACTED_LF');
ok(result.artifact_id === 9789017392, 'ARTIFACT_ID');
ok(result.artifact_digest === 'sha256:98a76cea4abbaead3b2e3a6b2f85b8808b2438a7f945765dd5ffcbbb5d25567b', 'ARTIFACT_DIGEST');

ok(auth.authority_classification?.cryptographic_approval_consumed === false, 'CRYPTO_APPROVAL_CONSUMED');
ok(auth.authority_classification?.v1_dispatch_slot_used === true, 'DISPATCH_SLOT');
ok(auth.authority_classification?.v1_replay_allowed === false, 'V1_REPLAY');
ok(auth.authority_classification?.same_approval_transferable_to_new_workflow === false, 'APPROVAL_TRANSFER');
ok(auth.authority_classification?.same_approval_operationally_reusable === false, 'APPROVAL_REUSE');
ok(auth.tombstone?.zero_executable_authority === true, 'TOMBSTONE_AUTHORITY');
ok(auth.tombstone?.workflow_trigger_removed === true, 'TOMBSTONE_TRIGGER');
ok(auth.tombstone?.secret_registry_membership === false, 'TOMBSTONE_REGISTRY');
ok(auth.tombstone?.environment_bound === false, 'TOMBSTONE_ENVIRONMENT');
ok(auth.tombstone?.secret_references_present === false, 'TOMBSTONE_SECRET');
ok(auth.tombstone?.network_provider_step_present === false, 'TOMBSTONE_NETWORK');
ok(auth.future_execution?.new_versioned_workflow_required === true, 'NEW_VERSION_REQUIRED');
ok(auth.future_execution?.new_explicit_program_owner_approval_required === true, 'NEW_APPROVAL_REQUIRED');

ok(terminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'TERMINAL_STATE');
ok(terminal.workflow_run_id === 33478469222 && terminal.job_id === 99762628587, 'TERMINAL_RUN_JOB');
ok(terminal.authorization_consumed === false, 'TERMINAL_AUTH_CONSUMED');
ok(terminal.external_read_request_count === 0 && terminal.cloudflare_request_count === 0, 'TERMINAL_REQUESTS');
ok(terminal.environment_secret_expressions_executed === false, 'TERMINAL_SECRET_STEP');
ok(terminal.failure?.code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'TERMINAL_FAILURE');
ok(terminal.failure?.committed_receipt_terminal_lf_count === 1, 'TERMINAL_EXPECTED_LF');
ok(terminal.failure?.github_comment_body_terminal_lf_count === 1, 'TERMINAL_COMMENT_LF');
ok(terminal.failure?.implicit_record_separator_lf_count === 1, 'TERMINAL_SEPARATOR_LF');
ok(terminal.failure?.extracted_terminal_lf_count === 2, 'TERMINAL_ACTUAL_LF');
ok(terminal.failure?.binding_verifier_started === false, 'TERMINAL_BINDING_START');
ok(terminal.artifact?.id === 9789017392, 'TERMINAL_ARTIFACT');
ok(terminal.operational_authority?.v1_lane_exhausted === true, 'TERMINAL_LANE_EXHAUSTED');
ok(terminal.operational_authority?.rerun_authorized === false
  && terminal.operational_authority?.replay_authorized === false
  && terminal.operational_authority?.second_dispatch_authorized === false, 'TERMINAL_NO_REPLAY');
ok(terminal.operational_authority?.same_approval_reusable === false, 'TERMINAL_NO_REUSE');

const runtimeValidNoMatchPush = /^on:\n  push:\n    branches-ignore:\n      - '\*\*'\n    tags-ignore:\n      - '\*\*'\n\npermissions:\n  contents: read\n/m;
ok(runtimeValidNoMatchPush.test(workflow), 'WORKFLOW_RUNTIME_VALID_NO_MATCH_TRIGGER');
ok(!/^on:\s*\[\]\s*$/m.test(workflow), 'WORKFLOW_EMPTY_EVENT_LIST_REINTRODUCED');
ok(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH');
ok(!workflow.includes('pull_request:'), 'WORKFLOW_PR_TRIGGER');
ok(!workflow.includes('schedule:'), 'WORKFLOW_SCHEDULE');
ok(!workflow.includes('environment:'), 'WORKFLOW_ENVIRONMENT');
ok(!workflow.includes('${{ secrets.'), 'WORKFLOW_SECRET_EXPRESSION');
ok(!workflow.includes('actions/checkout@'), 'WORKFLOW_CHECKOUT');
ok(!workflow.includes('curl '), 'WORKFLOW_NETWORK');
ok(!workflow.includes('api.cloudflare.com'), 'WORKFLOW_PROVIDER_ENDPOINT');
ok(workflow.includes('PREAUTHORIZATION_FAILED_V1_LANE_EXHAUSTED_ZERO_EXECUTABLE_AUTHORITY'), 'WORKFLOW_TOMBSTONE_MARKER');
ok(workflow.includes('historical_workflow_run_id:33478469222'), 'WORKFLOW_RUN_TRUTH');
ok(workflow.includes('historical_external_read_request_count:0'), 'WORKFLOW_ZERO_REQUEST_TRUTH');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'WORKFLOW_UPLOAD_PIN');

ok(Number.isInteger(registry.registered_count) && registry.registered_count > 0, 'REGISTRY_COUNT');
ok(registry.registered_workflows?.length === registry.registered_count, 'REGISTRY_WORKFLOWS');
ok(registry.required_environment_bindings?.length === registry.registered_count, 'REGISTRY_BINDINGS');
ok(!registry.registered_workflows.includes(P.workflow), 'REGISTRY_V1_PRESENT');
ok(!registry.required_environment_bindings.some(value => value.workflow === P.workflow), 'REGISTRY_V1_BINDING');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings
  .reduce((sum, value) => sum + (value.required_secret_step_names?.length || 0), 0);
ok(Number.isInteger(privilegedSteps) && privilegedSteps > 0, 'REGISTRY_PRIVILEGED_CALCULATED');
ok(registry.repository_binding_state?.privileged_secret_steps === privilegedSteps, 'REGISTRY_PRIVILEGED_RECORDED');
const failed = registry.repository_containment?.failed_cloudflare_credential_identity_preflight_v1;
ok(failed?.workflow_run_id === 33478469222, 'REGISTRY_INCIDENT_RUN');
ok(failed?.authorization_consumed === false, 'REGISTRY_AUTH_CONSUMED');
ok(failed?.external_read_request_count === 0, 'REGISTRY_EXTERNAL_REQUESTS');
ok(failed?.secret_registry_membership === false && failed?.environment_binding === false, 'REGISTRY_ZERO_AUTHORITY');
ok(failed?.same_approval_reusable === false, 'REGISTRY_NO_REUSE');

ok(contract.status === 'V1_PREAUTHORIZATION_SERIALIZATION_FAILURE_CLOSED_V2_REQUIRED', 'CONTRACT_STATUS');
ok(contract.v1_terminal?.workflow_run_id === 33478469222, 'CONTRACT_RUN');
ok(contract.v1_terminal?.authorization_consumed === false, 'CONTRACT_AUTH_CONSUMED');
ok(contract.v1_terminal?.external_read_request_count === 0, 'CONTRACT_REQUESTS');
ok(contract.byte_exact_approval_body_contract?.required_extraction === 'NO_ADDED_RECORD_SEPARATOR', 'CONTRACT_EXTRACTOR');
ok(contract.byte_exact_approval_body_contract?.forbidden_implementation === "jq -r '.body' > file", 'CONTRACT_FORBIDDEN');
ok(contract.v2_gate?.new_versioned_workflow_required === true
  && contract.v2_gate?.new_explicit_program_owner_approval_required === true, 'CONTRACT_V2_GATE');

ok(v2spec.status === 'DESIGN_READY_EXTERNAL_AUTHORITY_ABSENT', 'V2_SPEC_STATUS');
ok(v2spec.materialized_workflow === false, 'V2_WORKFLOW_MATERIALIZED');
ok(v2spec.standing_authority === false, 'V2_STANDING_AUTHORITY');
ok(v2spec.new_explicit_program_owner_approval_required === true, 'V2_APPROVAL_REQUIRED');
ok(v2spec.required_controls?.includes('BYTE_EXACT_GITHUB_COMMENT_BODY_EXTRACTION_WITHOUT_RECORD_SEPARATOR'), 'V2_CONTROL_EXTRACTOR');
ok(v2spec.required_regressions?.includes('JQ_RAW_OUTPUT_NEGATIVE_CASE_ADDS_RECORD_SEPARATOR'), 'V2_NEGATIVE_TEST');

ok(extractor.includes('process.stdout.write(payload.body)'), 'EXTRACTOR_BYTE_EXACT');
ok(!extractor.includes('console.log(payload.body)'), 'EXTRACTOR_CONSOLE_LOG');
ok(test.includes("execFileSync('jq', ['-r', '.body', oneLfJson])"), 'TEST_JQ_RAW');
ok(test.includes("execFileSync('jq', ['-j', '.body', oneLfJson])"), 'TEST_JQ_JOIN');
ok(test.includes("Buffer.from('approval\\n\\n')"), 'TEST_EXTRA_LF');
ok(test.includes('one-terminal-lf'), 'TEST_ONE_LF');
ok(test.includes('two-terminal-lfs'), 'TEST_TWO_LF');

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
  workflow_runtime_valid_no_match_trigger: true,
  v1_zero_executable_authority: true,
  v2_new_approval_required: true,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  worker_pages_route_domain_mutation_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
