#!/usr/bin/env node
import fs from 'node:fs';

const authPath = 'coordination/kidults/governance/cloudflare-workers-shadow-v2-authorization-20260901-v1.json';
const workflowPath = '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v2.yml';
const registryPath = 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json';
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const workflow = fs.readFileSync(workflowPath, 'utf8');
const ok = (value, code) => { if (!value) throw new Error(code); };

ok(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_PROCESS_INVOKED_NO_READBACK', 'AUTH_STATUS');
ok(auth.executable_authority === false, 'EXECUTABLE_AUTHORITY');
ok(auth.provider_activation_authority === false, 'PROVIDER_AUTHORITY');
ok(auth.credential_resolution_authority === false, 'CREDENTIAL_AUTHORITY');
ok(auth.consumption_result?.workflow_run_id === 33417453349, 'HISTORICAL_RUN');
ok(auth.consumption_result?.provider_process_invoked === true, 'PROVIDER_PROCESS_TRUTH');
ok(auth.consumption_result?.provider_deployment_attempt_count === 1, 'HISTORICAL_PROVIDER_COUNT');
ok(auth.consumption_result?.provider_readback === 'SKIPPED', 'READBACK_TRUTH');
ok(auth.consumption_result?.remote_mutation_empirically_verified === false, 'REMOTE_TRUTH');
ok(auth.replay.includes('FORBIDDEN_AFTER_FIRST'), 'REPLAY_RULE');

ok(workflow.includes("- '__consumed-cloudflare-shadow-v2-never-execute__'"), 'DORMANT_BRANCH_FILTER');
ok(workflow.includes('if: ${{ false }}'), 'JOB_FALSE_GUARD');
ok(!workflow.includes('workflow_dispatch'), 'MANUAL_DISPATCH_REINTRODUCED');
ok(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'TOMBSTONE_MARKER');
ok(workflow.includes('historical_provider_deployment_attempt_count:1'), 'HISTORICAL_ATTEMPT_TRUTH');
ok(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'UPLOAD_PIN');
for (const forbidden of ['environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@', 'curl ', 'npm ', 'npx ', 'wrangler ', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  ok(!workflow.includes(forbidden), `FORBIDDEN_EXECUTION_AUTHORITY:${forbidden}`);
}

ok(!registry.registered_workflows.includes(workflowPath), 'SECRET_REGISTRY_WORKFLOW_PRESENT');
ok(!registry.required_environment_bindings.some(binding => binding.workflow === workflowPath), 'SECRET_REGISTRY_BINDING_PRESENT');
ok(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_COUNT');
ok(registry.required_environment_bindings.length === registry.registered_count, 'REGISTRY_BINDINGS');
for (const key of ['environment_bound_secret_bearing_jobs','exact_main_guarded_secret_bearing_jobs','live_main_sha_guarded_secret_bearing_jobs','step_scoped_secret_bearing_jobs']) {
  ok(registry.repository_binding_state[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
}
const privileged = registry.required_environment_bindings.reduce((sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state.privileged_secret_steps === privileged, 'PRIVILEGED_STEP_COUNT');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v2-dormant-tombstone-validation-v2',
  state: 'VERIFIED_PASS',
  historical_run_id: 33417453349,
  historical_provider_attempt_count: 1,
  dormant_branch_filter: true,
  job_false_guard: true,
  secret_registry_membership: false,
  provider_activation_authorized: false,
  registered_secret_bearing_lanes: registry.registered_count,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD'
}, null, 2));
