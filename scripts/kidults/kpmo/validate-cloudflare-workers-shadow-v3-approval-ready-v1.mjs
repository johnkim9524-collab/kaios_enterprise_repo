#!/usr/bin/env node
import fs from 'node:fs';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-workers-shadow-v3-authorization-20260901-v1.json',
  terminal: 'coordination/kidults/governance/receipts/CF-WORKERS-SHADOW-20260901-03-terminal.json',
  workflow: '.github/workflows/kidults-cloudflare-workers-shadow-deploy-v3.yml',
  credentialAuth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  credentialTerminal: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01-terminal.json',
  credentialWorkflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  config: 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc',
  package: 'tooling/kidults-cloudflare-workers-shadow/package.json',
  lock: 'tooling/kidults-cloudflare-workers-shadow/package-lock.json',
};
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const ok = (value, code) => { if (!value) throw new Error(`CLOUDFLARE_V3_TOMBSTONE_VALIDATION_FAIL:${code}`); };
for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING:${file}`);

const auth = json(P.auth);
const terminal = json(P.terminal);
const workflow = read(P.workflow);
const credentialAuth = json(P.credentialAuth);
const credentialTerminal = json(P.credentialTerminal);
const credentialWorkflow = read(P.credentialWorkflow);
const registry = json(P.registry);
const configText = read(P.config);
const config = JSON.parse(configText);
const packageJson = json(P.package);
const packageLock = json(P.lock);

ok(auth.id === 'CF-WORKERS-SHADOW-20260901-03', 'AUTH_ID');
ok(auth.status === 'CONSUMED_FAIL_CLOSED_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'AUTH_STATUS');
ok(auth.consumption_result?.workflow_run_id === 33465807642, 'RUN_ID');
ok(auth.consumption_result?.provider_deployment_attempt_count === 1, 'PROVIDER_ATTEMPT');
ok(auth.consumption_result?.cloudflare_error_code === 7003, 'ERROR_7003');
ok(auth.consumption_result?.worker_deployment_success === false, 'DEPLOYMENT_TRUTH');
ok(auth.consumption_result?.remote_mutation_evidenced === false, 'MUTATION_TRUTH');
ok(auth.tombstone?.zero_executable_authority === true, 'ZERO_AUTHORITY');
ok(auth.future_execution?.current_approval_reusable === false, 'NO_REUSE');
ok(auth.future_execution?.rerun_authorized === false, 'NO_RERUN');
ok(auth.future_execution?.second_dispatch_authorized === false, 'NO_SECOND_DISPATCH');
ok(terminal.state === 'VERIFIED_FAIL_PROVIDER_API_7003_NO_DEPLOYMENT_READBACK', 'TERMINAL_STATE');
ok(terminal.provider?.cloudflare_error_code === 7003, 'TERMINAL_7003');
ok(terminal.provider?.remote_mutation_evidenced === false, 'TERMINAL_MUTATION');

ok(workflow.includes("- '__consumed-cloudflare-shadow-v3-never-execute__'"), 'DORMANT_BRANCH_FILTER');
ok(workflow.includes('if: ${{ false }}'), 'JOB_FALSE_GUARD');
ok(!workflow.includes('workflow_dispatch'), 'DISPATCH_REINTRODUCED');
ok(workflow.includes('CONSUMED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY'), 'TOMBSTONE_MARKER');
ok(workflow.includes('historical_cloudflare_error_code:7003'), 'HISTORICAL_ERROR_TRUTH');
for (const forbidden of ['environment:', '${{ secrets.', 'actions/checkout@', 'actions/setup-node@', 'curl ', 'npm ', 'npx ', 'node_modules/.bin/wrangler']) {
  ok(!workflow.includes(forbidden), `V3_EXECUTABLE_AUTHORITY:${forbidden}`);
}

ok(credentialAuth.status === 'PREAUTHORIZATION_FAILED_NOT_CONSUMED_V1_LANE_EXHAUSTED_NO_EXTERNAL_CALL', 'CREDENTIAL_AUTH_STATUS');
ok(credentialAuth.terminal_result?.workflow_run_id === 33478469222, 'CREDENTIAL_RUN');
ok(credentialAuth.terminal_result?.authorization_consumed === false, 'CREDENTIAL_NOT_CONSUMED');
ok(credentialAuth.terminal_result?.external_read_request_count === 0, 'CREDENTIAL_ZERO_REQUESTS');
ok(credentialTerminal.state === 'VERIFIED_FAIL_PREAUTHORIZATION_NO_EXTERNAL_CALL', 'CREDENTIAL_TERMINAL');
ok(credentialWorkflow.includes("- '__exhausted-cloudflare-credential-v1-never-execute__'"), 'CREDENTIAL_DORMANT_BRANCH');
ok(credentialWorkflow.includes('if: ${{ false }}'), 'CREDENTIAL_FALSE_GUARD');
ok(!credentialWorkflow.includes('workflow_dispatch'), 'CREDENTIAL_DISPATCH_REINTRODUCED');
ok(!credentialWorkflow.includes('environment:'), 'CREDENTIAL_ENVIRONMENT');
ok(!credentialWorkflow.includes('${{ secrets.'), 'CREDENTIAL_SECRETS');
ok(!credentialWorkflow.includes('curl '), 'CREDENTIAL_NETWORK');

for (const dormantPath of [P.workflow, P.credentialWorkflow]) {
  ok(!registry.registered_workflows.includes(dormantPath), `REGISTRY_WORKFLOW:${dormantPath}`);
  ok(!registry.required_environment_bindings.some(value => value.workflow === dormantPath), `REGISTRY_BINDING:${dormantPath}`);
}
ok(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_COUNT');
ok(registry.required_environment_bindings.length === registry.registered_count, 'REGISTRY_BINDINGS');
for (const key of ['environment_bound_secret_bearing_jobs','exact_main_guarded_secret_bearing_jobs','live_main_sha_guarded_secret_bearing_jobs','step_scoped_secret_bearing_jobs']) {
  ok(registry.repository_binding_state[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
}
const privilegedSteps = registry.required_environment_bindings.reduce((sum, binding) => sum + (binding.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state.privileged_secret_steps === privilegedSteps, 'PRIVILEGED_STEPS');

ok(config.name === 'kidults-public-portal-shadow', 'CONFIG_NAME');
ok(config.workers_dev === true && config.preview_urls === false, 'CONFIG_WORKERS_DEV');
ok(Array.isArray(config.routes) && config.routes.length === 0, 'CONFIG_ROUTES');
for (const forbidden of ['account_id', 'api_token', 'zone_id', 'custom_domain']) ok(!configText.includes(forbidden), `CONFIG_FORBIDDEN:${forbidden}`);
ok(packageJson.devDependencies?.wrangler === '4.127.1', 'WRANGLER_VERSION');
ok(packageLock.packages?.['node_modules/wrangler']?.version === '4.127.1', 'LOCKED_WRANGLER');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-v3-dormant-7003-validation-v4',
  state: 'VERIFIED_PASS',
  historical_v3_run_id: 33465807642,
  historical_error_code: 7003,
  historical_remote_mutation: false,
  v3_dormant_branch_filter: true,
  v3_job_false_guard: true,
  credential_v1_dormant_branch_filter: true,
  credential_v1_external_request_count: 0,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  production_routes: 0,
  custom_domains: 0,
  public: 'HOLD', production: 'HOLD', g5: 'HOLD'
}, null, 2));
