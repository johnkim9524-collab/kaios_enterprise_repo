#!/usr/bin/env node
import fs from 'node:fs';

const authPath = 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json';
const terminalPath = 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json';
const workflowPath = '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml';
const registryPath = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const terminal = JSON.parse(fs.readFileSync(terminalPath, 'utf8'));
const workflow = fs.readFileSync(workflowPath, 'utf8');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const ok = (value, code) => { if (!value) throw new Error(code); };

ok(auth.id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01', 'AUTH_ID');
ok(auth.status === 'PREAUTHORIZATION_FAILED_NOT_CONSUMED_V1_LANE_EXHAUSTED_NO_EXTERNAL_CALL', 'AUTH_STATUS');
ok(auth.terminal_result?.workflow_run_id === 33478469222, 'HISTORICAL_RUN');
ok(auth.terminal_result?.authorization_consumed === false, 'AUTH_CONSUMED');
ok(auth.terminal_result?.external_read_request_count === 0, 'REQUEST_COUNT');
ok(auth.terminal_result?.environment_secret_expressions_executed === false, 'SECRET_STEP');
ok(auth.terminal_result?.failure_code === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'FAILURE_CODE');
ok(auth.authority_classification?.v1_dispatch_slot_used === true, 'DISPATCH_SLOT');
ok(auth.authority_classification?.v1_replay_allowed === false, 'NO_REPLAY');
ok(auth.authority_classification?.same_approval_operationally_reusable === false, 'NO_REUSE');
ok(terminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'TERMINAL_STATE');
ok(terminal.external_read_request_count === 0 && terminal.cloudflare_request_count === 0, 'TERMINAL_REQUESTS');

ok(workflow.includes("- '__exhausted-cloudflare-credential-v1-never-execute__'"), 'DORMANT_BRANCH_FILTER');
ok(workflow.includes('if: ${{ false }}'), 'JOB_FALSE_GUARD');
ok(!workflow.includes('workflow_dispatch'), 'WORKFLOW_DISPATCH');
ok(!workflow.includes('environment:'), 'WORKFLOW_ENVIRONMENT');
ok(!workflow.includes('${{ secrets.'), 'WORKFLOW_SECRET_EXPRESSION');
ok(!workflow.includes('actions/checkout@'), 'WORKFLOW_CHECKOUT');
ok(!workflow.includes('curl '), 'WORKFLOW_NETWORK');
ok(!workflow.includes('api.cloudflare.com'), 'WORKFLOW_PROVIDER_ENDPOINT');
ok(workflow.includes('PREAUTHORIZATION_FAILED_V1_LANE_EXHAUSTED_ZERO_EXECUTABLE_AUTHORITY'), 'TOMBSTONE_MARKER');
ok(workflow.includes('historical_workflow_run_id:33478469222'), 'RUN_TRUTH');
ok(workflow.includes('historical_external_read_request_count:0'), 'ZERO_REQUEST_TRUTH');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_PIN');

ok(!registry.registered_workflows.includes(workflowPath), 'REGISTRY_V1_PRESENT');
ok(!registry.required_environment_bindings.some(value => value.workflow === workflowPath), 'REGISTRY_V1_BINDING');
ok(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_COUNT');
ok(registry.required_environment_bindings.length === registry.registered_count, 'REGISTRY_BINDINGS');
for (const key of ['environment_bound_secret_bearing_jobs','exact_main_guarded_secret_bearing_jobs','live_main_sha_guarded_secret_bearing_jobs','step_scoped_secret_bearing_jobs']) {
  ok(registry.repository_binding_state[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
}
const privileged = registry.required_environment_bindings.reduce((sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state.privileged_secret_steps === privileged, 'PRIVILEGED_STEP_COUNT');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-credential-identity-preflight-v1-dormant-tombstone-validation-v2',
  state: 'VERIFIED_PASS',
  historical_run_id: 33478469222,
  authorization_consumed: false,
  external_read_request_count: 0,
  dormant_branch_filter: true,
  job_false_guard: true,
  secret_registry_membership: false,
  registered_secret_bearing_lanes: registry.registered_count,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD'
}, null, 2));
