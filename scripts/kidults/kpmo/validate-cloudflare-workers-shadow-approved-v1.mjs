#!/usr/bin/env node
import fs from 'node:fs';

const AUTH_PATH = 'coordination/kidults/governance/cloudflare-workers-shadow-one-shot-authorization-20260831-v1.json';
const CONTROL_PATH = 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260831-01-consumption-control.json';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const REGISTRY_PATH = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const APPROVAL_ID = 'CF-WORKERS-SHADOW-20260831-01';
const CONSUMING_RUN_ID = 33410598558;
const CONSUMING_SHA = 'e5efb9435e4a8847927791ae4fc9b580b75506c1';

const fail = (message) => { throw new Error(`CLOUDFLARE_WORKERS_SHADOW_CONSUMED_FAIL:${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };

for (const file of [AUTH_PATH, CONTROL_PATH, WORKFLOW_PATH, REGISTRY_PATH]) {
  ok(fs.existsSync(file), `MISSING_FILE:${file}`);
}
const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
const control = JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8'));
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

function validateAuthorization(value) {
  ok(value.id === APPROVAL_ID, 'APPROVAL_ID');
  ok(value.version === '1.1.0', 'APPROVAL_VERSION');
  ok(value.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_NOT_ATTEMPTED', 'APPROVAL_STATUS');
  ok(value.authorized_by?.github_login === 'johnkim9524-collab', 'APPROVAL_AUTHOR_LOGIN');
  ok(value.authorization_receipt?.comment_id === 5480203136, 'APPROVAL_COMMENT');
  ok(value.authorized_scope?.dispatch_count_max === 1, 'DISPATCH_BOUND');
  ok(value.authorized_scope?.provider_deployment_attempt_count_max === 1, 'HISTORICAL_PROVIDER_BOUND');
  ok(value.authorized_scope?.authorization_consumed_on === 'FIRST_WORKFLOW_DISPATCH_PASS_OR_FAIL', 'CONSUMPTION_RULE');
  ok(value.authorized_scope?.executable_authority === false, 'EXECUTABLE_AUTHORITY_NOT_REVOKED');
  ok(value.authorized_scope?.provider_activation_allowed === false, 'PROVIDER_AUTHORITY_NOT_REVOKED');
  ok(value.authorized_scope?.credential_resolution_allowed === false, 'CREDENTIAL_AUTHORITY_NOT_REVOKED');
  ok(value.replay === 'FORBIDDEN_AFTER_FIRST_WORKFLOW_DISPATCH_REGARDLESS_OF_TERMINAL_STATE', 'REPLAY_RULE');
  const c = value.consumption || {};
  ok(c.state === 'VERIFIED_FAIL_PREFLIGHT_RECEIPT_DELETED_BY_CHECKOUT', 'CONSUMPTION_STATE');
  ok(c.run_id === CONSUMING_RUN_ID && c.run_attempt === 1, 'CONSUMING_RUN');
  ok(c.source_sha === CONSUMING_SHA && c.event === 'workflow_dispatch', 'CONSUMING_PROVENANCE');
  ok(c.authorization_consumed === true, 'AUTHORIZATION_NOT_CONSUMED');
  ok(c.provider_mutation_attempted === false, 'PROVIDER_MUTATION_CLAIM');
  ok(c.provider_deployment_attempt_count === 0, 'PROVIDER_ATTEMPT_COUNT');
  ok(c.provider_step === 'SKIPPED' && c.readback_step === 'SKIPPED', 'PROVIDER_OR_READBACK_STEP');
  ok(c.terminal_artifact_count === 0, 'HISTORICAL_ARTIFACT_FALSE_CLAIM');
  ok(c.failure_reason === 'WORKSPACE_RECEIPT_DELETED_BY_CHECKOUT', 'ROOT_CAUSE');
  ok(c.replay === 'FORBIDDEN', 'CONSUMPTION_REPLAY');
  ok(c.historical_terminal_artifact_reconstructable === false, 'ARTIFACT_RECONSTRUCTION_CLAIM');
  ok(value.current_execution_boundary?.workflow_state === 'CONSUMED_AUTHORIZATION_TOMBSTONE_ONLY', 'TOMBSTONE_STATE');
  for (const field of ['environment_binding','secret_resolution','provider_execution','network_execution']) {
    ok(value.current_execution_boundary?.[field] === false, `EXECUTION_BOUNDARY:${field}`);
  }
}

function validateControl(value) {
  ok(value.id === `${APPROVAL_ID}-consumption-control`, 'CONTROL_ID');
  ok(value.evidence_class === 'POST_HOC_CONTROL_RECORD_NOT_EXECUTION_ARTIFACT', 'CONTROL_EVIDENCE_CLASS');
  ok(value.promotable === false && value.empirical_evidence === false, 'CONTROL_PROMOTION_BOUNDARY');
  ok(value.reconstructed_terminal_artifact === false, 'CONTROL_RECONSTRUCTION_BOUNDARY');
  ok(value.source?.workflow_run_id === CONSUMING_RUN_ID && value.source?.source_sha === CONSUMING_SHA, 'CONTROL_PROVENANCE');
  ok(value.observed?.authorization_consumed === true, 'CONTROL_CONSUMPTION');
  ok(value.observed?.provider_deploy_step === 'SKIPPED', 'CONTROL_PROVIDER_STEP');
  ok(value.observed?.readback_step === 'SKIPPED', 'CONTROL_READBACK_STEP');
  ok(value.observed?.upload_terminal_receipt_step === 'FAILURE', 'CONTROL_UPLOAD_STEP');
  ok(value.observed?.terminal_artifact_count === 0, 'CONTROL_ARTIFACT_COUNT');
  ok(value.observed?.provider_mutation_attempted === false, 'CONTROL_PROVIDER_MUTATION');
  ok(value.observed?.provider_deployment_attempt_count === 0, 'CONTROL_PROVIDER_COUNT');
  ok(value.containment?.authorization_replay === 'FORBIDDEN', 'CONTROL_REPLAY');
}

function validateWorkflow(value) {
  ok(/^on:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/m.test(value), 'MANUAL_TRIGGER_PERMISSION');
  for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  pull_request_target:', '\n  schedule:', '\n  workflow_run:', '\n  repository_dispatch:']) {
    ok(!value.includes(forbiddenTrigger), `FORBIDDEN_TRIGGER:${forbiddenTrigger.trim()}`);
  }
  for (const forbidden of ['environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@', 'wrangler', 'npm ci', 'curl ', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    ok(!value.includes(forbidden), `TOMBSTONE_HAS_EXECUTION_AUTHORITY:${forbidden}`);
  }
  ok(value.includes('RECEIPT="${RUNNER_TEMP}/kidults-cloudflare-workers-shadow-consumed-tombstone.json"'), 'RUNNER_TEMP_RECEIPT');
  ok(value.includes('provider_mutation_attempted:false'), 'NO_PROVIDER_MUTATION_RECEIPT');
  ok(value.includes('provider_deployment_attempt_count:0'), 'ZERO_PROVIDER_ATTEMPT_RECEIPT');
  ok(value.includes('network_request_attempted:false'), 'ZERO_NETWORK_RECEIPT');
  ok(value.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_PIN');
  ok(value.includes('path: ${{ runner.temp }}/kidults-cloudflare-workers-shadow-consumed-tombstone.json'), 'UPLOAD_RUNNER_TEMP');
  const upload = value.indexOf('Upload consumed-authorization terminal tombstone');
  const terminal = value.indexOf('Preserve deterministic RED after terminal receipt');
  ok(upload >= 0 && terminal > upload, 'UPLOAD_BEFORE_TERMINAL_RED');
  ok((value.match(/if: \$\{\{ always\(\) \}\}/g) || []).length === 2, 'ALWAYS_GUARD_COUNT');
  ok(value.includes("exit 78"), 'DETERMINISTIC_RED');
}

function validateRegistry(value) {
  ok(!value.registered_workflows.includes(WORKFLOW_PATH), 'TOMBSTONE_REGISTERED_AS_SECRET_BEARING');
  ok(!value.required_environment_bindings.some((x) => x.workflow === WORKFLOW_PATH), 'TOMBSTONE_HAS_SECRET_BINDING');
  ok(value.registered_count === value.registered_workflows.length, 'REGISTRY_COUNT');
  ok(value.repository_binding_state.environment_bound_secret_bearing_jobs === value.required_environment_bindings.length, 'ENV_JOB_COUNT');
  ok(value.repository_binding_state.exact_main_guarded_secret_bearing_jobs === value.required_environment_bindings.length, 'EXACT_MAIN_COUNT');
  ok(value.repository_binding_state.live_main_sha_guarded_secret_bearing_jobs === value.required_environment_bindings.length, 'LIVE_MAIN_COUNT');
  ok(value.repository_binding_state.step_scoped_secret_bearing_jobs === value.required_environment_bindings.length, 'STEP_SCOPE_COUNT');
  const steps = value.required_environment_bindings.reduce((n, x) => n + (x.required_secret_step_names?.length || 0), 0);
  ok(value.repository_binding_state.privileged_secret_steps === steps, 'PRIVILEGED_STEP_COUNT');
}

validateAuthorization(auth);
validateControl(control);
validateWorkflow(workflow);
validateRegistry(registry);

const authMutations = [
  (x) => { x.status = 'AUTHORIZED_ONE_SHOT_NON_PRODUCTION_WORKERS_DEV_ONLY'; },
  (x) => { x.authorized_scope.executable_authority = true; },
  (x) => { x.consumption.authorization_consumed = false; },
  (x) => { x.consumption.provider_mutation_attempted = true; },
  (x) => { x.consumption.provider_deployment_attempt_count = 1; },
  (x) => { x.consumption.replay = 'ALLOWED'; },
  (x) => { x.consumption.terminal_artifact_count = 1; }
];
for (const mutate of authMutations) {
  const candidate = structuredClone(auth);
  mutate(candidate);
  let rejected = false;
  try { validateAuthorization(candidate); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_AUTHORIZATION_MUTATION_ACCEPTED');
}

const workflowMutations = [
  (x) => x + '\n# environment:\n',
  (x) => x + '\n# ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
  (x) => x + '\n# wrangler deploy\n',
  (x) => x.replace('if: ${{ always() }}', 'if: ${{ success() }}'),
  (x) => x.replace('exit 78', 'exit 0'),
  (x) => x.replace('${RUNNER_TEMP}/kidults-cloudflare-workers-shadow-consumed-tombstone.json', 'artifacts/cloudflare-workers-shadow/receipt.json')
];
for (const mutate of workflowMutations) {
  const candidate = mutate(workflow);
  let rejected = false;
  try { validateWorkflow(candidate); } catch { rejected = true; }
  ok(rejected, 'NEGATIVE_WORKFLOW_MUTATION_ACCEPTED');
}

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-consumed-validation-v1',
  state: 'VERIFIED_PASS',
  approval_id: APPROVAL_ID,
  authorization_consumed: true,
  consuming_run_id: CONSUMING_RUN_ID,
  provider_mutation_attempted: false,
  provider_deployment_attempt_count: 0,
  terminal_artifact_count_historical: 0,
  workflow_state: 'CONSUMED_AUTHORIZATION_TOMBSTONE_ONLY',
  secret_bearing_registry_member: false,
  negative_authorization_mutations_rejected: authMutations.length,
  negative_workflow_mutations_rejected: workflowMutations.length,
  evidence_class: control.evidence_class,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
