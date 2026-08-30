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
  runner: 'scripts/kidults/provider/run-psa-z1-private-runtime-v1.mjs',
  workflow: '.github/workflows/kidults-psa-z1-private-runtime-v1.yml',
};

const [psaRaci, providerRaci, state, runner, workflow] = await Promise.all([
  parse(paths.psaRaci), parse(paths.providerRaci), parse(paths.state), read(paths.runner), read(paths.workflow),
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
  acquisition_count: state.counts.live_acquired,
  product_pipeline_admission_count: state.counts.product_pipeline_admitted,
})}\n`);
