import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = path => readFile(resolve(root, path), 'utf8');
const parse = async path => JSON.parse(await read(path));
const assert = (condition, code) => { if (!condition) throw new Error(code); };

const paths = {
  psaRaci: 'coordination/kidults/provider/psa-live-execution-raci-v1.json',
  providerRaci: 'coordination/kidults/provider/provider-live-execution-raci-v1.json',
  state: 'coordination/kidults/provider/psa-activation-state-receipt-v1.json',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  runner: 'scripts/kidults/provider/run-psa-z1-private-runtime-v1.mjs',
  workflow: '.github/workflows/kidults-psa-z1-private-runtime-v1.yml',
};

const [psaRaci, providerRaci, state, registry, runner, workflow] = await Promise.all([
  parse(paths.psaRaci),
  parse(paths.providerRaci),
  parse(paths.state),
  parse(paths.registry),
  read(paths.runner),
  read(paths.workflow),
]);

assert(psaRaci.id === 'KIDULTS_PSA_LIVE_EXECUTION_RACI_V1', 'PSA_RACI_ID_INVALID');
assert(psaRaci.state === 'READY_BUT_NOT_ACTIVATED', 'PSA_RACI_STATE_INVALID');
assert(psaRaci.current_truth?.schema_probe_successes === 1, 'PSA_SCHEMA_PROBE_TRUTH_INVALID');
assert(psaRaci.current_truth?.acquisition_count === 0, 'PSA_ACQUISITION_TRUTH_INVALID');
assert(psaRaci.current_truth?.product_pipeline_admission_count === 0, 'PSA_ADMISSION_TRUTH_INVALID');
for (const role of ['TRACK_Z', 'KPMO', 'PROVIDER_ENGINEERING', 'TRACK_D', 'TRACK_B']) {
  assert(psaRaci.roles?.some(entry => entry.role === role), `PSA_RACI_ROLE_MISSING:${role}`);
}
assert(psaRaci.activation_bundle?.length === 3, 'PSA_EXTERNAL_ACTIVATION_BUNDLE_MUST_HAVE_THREE_INPUTS');
assert(psaRaci.execution_sequence?.includes('EXECUTE_WAVE_1_MAX_90'), 'PSA_WAVE_1_SEQUENCE_MISSING');
assert(psaRaci.execution_sequence?.includes('EXECUTE_WAVE_2_REMAINDER_30'), 'PSA_WAVE_2_SEQUENCE_MISSING');

assert(providerRaci.id === 'KIDULTS_PROVIDER_LIVE_EXECUTION_RACI_V1', 'PROVIDER_RACI_ID_INVALID');
assert(providerRaci.state === 'ACTIVE_CONTROL', 'PROVIDER_RACI_STATE_INVALID');
assert(providerRaci.provider_state_machine?.includes('PRODUCT_PIPELINE_ADMITTED'), 'PROVIDER_ADMISSION_STATE_MISSING');
assert(providerRaci.truth_language?.connected_definition === 'PRODUCT_PIPELINE_ADMITTED_WITH_LIVE_RECEIPT', 'PROVIDER_CONNECTED_DEFINITION_INVALID');

assert(state.id === 'KIDULTS_PSA_ACTIVATION_STATE_RECEIPT_V1', 'PSA_STATE_RECEIPT_ID_INVALID');
assert(state.state === 'READY_BUT_NOT_ACTIVATED', 'PSA_STATE_RECEIPT_INVALID');
assert(state.counts?.lawful_manifest_admitted === 0, 'PSA_MANIFEST_COUNT_INVALID');
assert(state.counts?.live_acquired === 0, 'PSA_LIVE_ACQUIRED_COUNT_INVALID');
assert(state.counts?.product_pipeline_admitted === 0, 'PSA_PRODUCT_ADMITTED_COUNT_INVALID');

const z1WorkflowPath = '.github/workflows/kidults-psa-z1-private-runtime-v1.yml';
assert(registry.id === 'kidults-secret-bearing-workflow-dispatch-registry-v1', 'SECRET_REGISTRY_ID_INVALID');
assert(registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'SECRET_REGISTRY_STATUS_INVALID');
assert(registry.registered_workflows?.includes(z1WorkflowPath), 'PSA_Z1_SECRET_WORKFLOW_UNREGISTERED');
assert(registry.registered_count === registry.registered_workflows?.length, 'SECRET_REGISTRY_REGISTERED_COUNT_DRIFT');
assert(registry.required_environment_bindings?.length === registry.registered_count, 'SECRET_REGISTRY_BINDING_COUNT_DRIFT');
assert(registry.required_environment_count === 9, 'SECRET_REGISTRY_ENVIRONMENT_COUNT_DRIFT');
const z1Binding = registry.required_environment_bindings?.find(
  binding => binding.workflow === z1WorkflowPath && binding.job === 'z1-private-runtime',
);
assert(Boolean(z1Binding), 'PSA_Z1_SECRET_BINDING_MISSING');
assert(z1Binding.environment === 'kidults-psa-public-single-cert', 'PSA_Z1_ENVIRONMENT_BINDING_INVALID');
assert(
  z1Binding.required_secret_name_digest === 'sha256:3c734ad93be14445f6dab305280455af56b5a6fd4c841219c1511c50b3b97251',
  'PSA_Z1_SECRET_DIGEST_INVALID',
);
assert(
  JSON.stringify(z1Binding.required_secret_step_names) === JSON.stringify(['Execute encrypted private Z1 runtime and immediate deletion']),
  'PSA_Z1_SECRET_STEP_BINDING_INVALID',
);
assert(
  JSON.stringify(z1Binding.allowed_trigger_classes) === JSON.stringify(['workflow_dispatch']),
  'PSA_Z1_TRIGGER_BINDING_INVALID',
);
assert(z1Binding.remote_mutation_class === 'PROVIDER_BOUNDED_READ', 'PSA_Z1_MUTATION_CLASS_INVALID');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) {
  assert(registry.repository_binding_state?.[key] === registry.registered_count, `PSA_Z1_REGISTRY_COUNT_INVALID:${key}`);
}
assert(registry.repository_binding_state?.privileged_secret_steps === 24, 'PSA_Z1_PRIVILEGED_SECRET_STEP_COUNT_INVALID');

for (const marker of [
  'randomBytes(32)', 'buildPrivatePsaRecord', 'decryptPrivatePsaRecord', 'buildDeletionReceipt',
  'unlink(encryptedPath)', "acquisition_120_increment: 0", 'product_pipeline_admission_increment: 0',
]) {
  assert(runner.includes(marker), `PSA_PRIVATE_RUNNER_MARKER_MISSING:${marker}`);
}
assert(!runner.includes('console.log(payload)'), 'PSA_PRIVATE_RUNNER_RAW_LOG_FORBIDDEN');
assert(!runner.includes('console.log(token)'), 'PSA_PRIVATE_RUNNER_TOKEN_LOG_FORBIDDEN');

for (const marker of [
  'workflow_dispatch:', "if: github.ref == 'refs/heads/main'", 'environment: kidults-psa-public-single-cert',
  'PSA_PRIVATE_RUNTIME_MODE: EPHEMERAL_ENCRYPTED_IMMEDIATE_DELETE',
  'PSA_PUBLIC_API_TOKEN: ${{ secrets.PSA_PUBLIC_API_TOKEN }}',
  'Upload sanitized private-runtime receipt only', 'Enforce terminal cleanup',
]) {
  assert(workflow.includes(marker), `PSA_PRIVATE_WORKFLOW_MARKER_MISSING:${marker}`);
}
assert(!workflow.includes('pull_request_target:'), 'PSA_SECRET_WORKFLOW_PULL_REQUEST_TARGET_FORBIDDEN');
assert(!/workflow_dispatch:\s*\n\s+inputs:/m.test(workflow), 'PSA_SECRET_OR_CERT_WORKFLOW_INPUTS_FORBIDDEN');
assert(!workflow.includes('path: ${{ github.workspace }}'), 'PSA_WORKSPACE_ARTIFACT_UPLOAD_FORBIDDEN');

process.stdout.write(`${JSON.stringify({
  receipt_id: 'KIDULTS_PSA_LIVE_EXECUTION_CONTROL_VALIDATION_V1',
  state: 'VERIFIED_PASS',
  truth_state: state.state,
  secret_registry_state: 'REGISTERED_AND_BOUND',
  acquisition_count: state.counts.live_acquired,
  product_pipeline_admission_count: state.counts.product_pipeline_admitted,
})}\n`);
