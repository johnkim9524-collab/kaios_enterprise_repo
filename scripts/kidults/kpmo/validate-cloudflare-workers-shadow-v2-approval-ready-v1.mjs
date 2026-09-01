#!/usr/bin/env node
import fs from 'node:fs';

const authPath = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-authorization-20260901-v1.json';
const activeWorkflowPath = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const tombstonePath = 'coordination/kidults/governance/workflow-tombstones/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const registryPath = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const ok = (value, code) => { if (!value) throw new Error(code); };

ok(!fs.existsSync(activeWorkflowPath), 'ACTIVE_CONSUMED_WORKFLOW_MUST_BE_ABSENT');
ok(fs.existsSync(tombstonePath), 'ARCHIVED_TOMBSTONE_MISSING');
const workflow = fs.readFileSync(tombstonePath, 'utf8');

ok(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_PROCESS_INVOKED_NO_READBACK', 'AUTH_STATUS');
ok(auth.executable_authority === false, 'EXECUTABLE_AUTHORITY');
ok(auth.provider_activation_authority === false, 'PROVIDER_AUTHORITY');
ok(auth.credential_resolution_authority === false, 'CREDENTIAL_AUTHORITY');
ok(auth.tombstone?.zero_authority_dispatch_tombstone === true, 'TOMBSTONE_STATE');
ok(auth.tombstone?.secret_registry_membership === false, 'TOMBSTONE_REGISTRY_BOUNDARY');
ok(auth.replay.includes('FORBIDDEN_AFTER_FIRST'), 'REPLAY_RULE');
ok(auth.consumption_result?.workflow_run_id === 33417453349, 'HISTORICAL_RUN');
ok(auth.consumption_result?.provider_process_invoked === true, 'PROVIDER_PROCESS_TRUTH');
ok(auth.consumption_result?.provider_deployment_attempt_count === 1, 'HISTORICAL_PROVIDER_COUNT');
ok(auth.consumption_result?.provider_readback === 'SKIPPED', 'READBACK_TRUTH');
ok(auth.consumption_result?.remote_mutation_empirically_verified === false, 'REMOTE_TRUTH');
ok(auth.consumption_result?.artifact_id === 9767560816, 'ARTIFACT_ID');
ok(auth.consumption_result?.artifact_digest === 'sha256:71d36043dfc6ea863a9a5977059b5f45559c2d9fae8f5068fa85de3b0d21ed2c', 'ARTIFACT_DIGEST');
const contract = JSON.parse(fs.readFileSync('coordination/kidults/governance/cloudflare-workers-shadow-v2-execution-contract-v1.json', 'utf8'));
const spec = JSON.parse(fs.readFileSync('coordination/kidults/governance/cloudflare-workers-shadow-v2-workflow-spec-v1.json', 'utf8'));
ok(contract.authorization?.executable_authority === false, 'CONTRACT_AUTHORITY');
ok(contract.implementation_state?.secret_registry_mutated_for_v2 === false, 'CONTRACT_REGISTRY');
ok(spec.status === 'CONSUMED_ZERO_AUTHORITY_TOMBSTONE', 'SPEC_STATUS');
ok(spec.environment === null && spec.provider_step === null, 'SPEC_ZERO_AUTHORITY');

ok(/^on:\s*\[\]\n\npermissions:\n  contents: read\n/m.test(workflow), 'ARCHIVE_NO_TRIGGER_MARKER');
ok(!workflow.includes('workflow_dispatch'), 'MANUAL_DISPATCH_REINTRODUCED');
ok(workflow.includes('runs-on: ubuntu-24.04'), 'PINNED_RUNNER');
ok(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'DETERMINISTIC_RED');
ok(workflow.includes('if: ${{ always() }}'), 'ALWAYS_UPLOAD');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_PIN');
const uploadIndex = workflow.indexOf('Upload consumed authorization tombstone');
const redIndex = workflow.indexOf('Enforce consumed authorization no replay');
ok(uploadIndex >= 0 && redIndex > uploadIndex, 'UPLOAD_BEFORE_RED');
for (const forbidden of ['environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@', 'curl ', 'npm ', 'npx ', 'wrangler ', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'workers.dev shadow read-back', 'provider credential resolution']) {
  ok(!workflow.includes(forbidden), `FORBIDDEN_EXECUTION_AUTHORITY:${forbidden}`);
}

for (const path of [activeWorkflowPath, tombstonePath]) {
  ok(!registry.registered_workflows.includes(path), `SECRET_REGISTRY_WORKFLOW_PRESENT:${path}`);
  ok(!registry.required_environment_bindings.some(binding => binding.workflow === path), `SECRET_REGISTRY_BINDING_PRESENT:${path}`);
}
ok(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_COUNT');
ok(registry.required_environment_bindings.length === registry.registered_count, 'REGISTRY_BINDINGS');
for (const key of ['environment_bound_secret_bearing_jobs','exact_main_guarded_secret_bearing_jobs','live_main_sha_guarded_secret_bearing_jobs','step_scoped_secret_bearing_jobs']) {
  ok(registry.repository_binding_state[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
}
const privileged = registry.required_environment_bindings.reduce((sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state.privileged_secret_steps === privileged, 'PRIVILEGED_STEP_COUNT');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v2-consumed-zero-authority-validation-v2',
  state: 'VERIFIED_PASS',
  authorization_state: auth.status,
  active_workflow_present: false,
  archived_tombstone: tombstonePath,
  secret_registry_membership: false,
  environment_bound: false,
  manual_dispatch_present: false,
  credential_resolution_authorized: false,
  provider_activation_authorized: false,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privileged,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
