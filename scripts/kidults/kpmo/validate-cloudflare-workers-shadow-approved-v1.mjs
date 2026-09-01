#!/usr/bin/env node
import fs from 'node:fs';

const authPath = 'coordination/kidults/governance/cloudflare-workers-shadow-one-shot-authorization-20260831-v1.json';
const activeWorkflowPath = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const tombstonePath = 'coordination/kidults/governance/workflow-tombstones/kidults-cloudflare-workers-shadow-deploy-v1.yml';
const registryPath = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const ok = (value, code) => { if (!value) throw new Error(code); };

ok(!fs.existsSync(activeWorkflowPath), 'ACTIVE_CONSUMED_WORKFLOW_MUST_BE_ABSENT');
ok(fs.existsSync(tombstonePath), 'ARCHIVED_TOMBSTONE_MISSING');
const workflow = fs.readFileSync(tombstonePath, 'utf8');

ok(auth.status === 'CONSUMED_ZERO_EXECUTABLE_AUTHORITY', 'AUTH_STATUS');
ok(auth.executable_authority === false, 'EXECUTABLE_AUTHORITY');
ok(auth.provider_activation_authority === false, 'PROVIDER_AUTHORITY');
ok(auth.credential_resolution_authority === false, 'CREDENTIAL_AUTHORITY');
ok(auth.tombstone?.zero_authority_dispatch_tombstone === true, 'TOMBSTONE_STATE');
ok(auth.tombstone?.secret_registry_membership === false, 'TOMBSTONE_REGISTRY_BOUNDARY');
ok(auth.replay.includes('FORBIDDEN_AFTER_FIRST'), 'REPLAY_RULE');
ok(auth.consumption_result?.workflow_run_id === 33410598558, 'HISTORICAL_RUN');
ok(auth.consumption_result?.provider_deployment_attempt_count === 0, 'HISTORICAL_PROVIDER_COUNT');
ok(auth.consumption_result?.artifact_count === 0, 'HISTORICAL_ARTIFACT_COUNT');
const historical = JSON.parse(fs.readFileSync('coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260831-01-terminal.json', 'utf8'));
ok(historical.evidence_class === 'POST_HOC_CONTROL_RECORD_NOT_EXECUTION_ARTIFACT', 'HISTORICAL_EVIDENCE_CLASS');
ok(historical.run_artifact_present === false && historical.empirical_evidence === false, 'HISTORICAL_FALSE_EVIDENCE');

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
  id: 'kidults-cloudflare-workers-shadow-v1-consumed-zero-authority-validation-v2',
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
