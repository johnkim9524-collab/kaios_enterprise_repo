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
  authorizationBoundary: 'coordination/kidults/provider/psa-provider-operation-authorization-boundary-v1.json',
  remediation: 'coordination/kidults/provider/psa-z1-followup-trigger-remediation-v1.json',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  runner: 'scripts/kidults/provider/run-psa-z1-private-runtime-v1.mjs',
  workflow: '.github/workflows/kidults-psa-z1-private-runtime-v1.yml',
  orchestrator: '.github/workflows/kidults-psa-z1-post-merge-orchestrator-v1.yml',
};

const [
  psaRaci,
  providerRaci,
  state,
  authorizationBoundary,
  remediation,
  registry,
  runner,
  workflow,
  orchestrator,
] = await Promise.all([
  parse(paths.psaRaci),
  parse(paths.providerRaci),
  parse(paths.state),
  parse(paths.authorizationBoundary),
  parse(paths.remediation),
  parse(paths.registry),
  read(paths.runner),
  read(paths.workflow),
  read(paths.orchestrator),
]);

assert(psaRaci.id === 'KIDULTS_PSA_LIVE_EXECUTION_RACI_V1', 'PSA_RACI_ID_INVALID');
assert(psaRaci.state === 'READY_BUT_NOT_ACTIVATED_PROVIDER_AUTHORIZATION_BLOCKED', 'PSA_RACI_STATE_INVALID');
assert(psaRaci.current_truth?.schema_probe_successes === 1, 'PSA_SCHEMA_PROBE_TRUTH_INVALID');
assert(psaRaci.current_truth?.approved_private_runtime_probe_successes === 0, 'PSA_PRIVATE_RUNTIME_TRUTH_INVALID');
assert(psaRaci.current_truth?.acquisition_count === 0, 'PSA_ACQUISITION_TRUTH_INVALID');
assert(psaRaci.current_truth?.product_pipeline_admission_count === 0, 'PSA_ADMISSION_TRUTH_INVALID');
for (const role of [
  'TRACK_Z',
  'KPMO',
  'INDEPENDENT_PROVIDER_AUTHORIZATION_AUTHORITY',
  'PROVIDER_ENGINEERING',
  'TRACK_D',
  'TRACK_B',
]) {
  assert(psaRaci.roles?.some(entry => entry.role === role), `PSA_RACI_ROLE_MISSING:${role}`);
}
assert(psaRaci.activation_bundle?.length === 4, 'PSA_ACTIVATION_BUNDLE_MUST_HAVE_E0_TO_E3');
assert(psaRaci.activation_bundle?.[0]?.id === 'E0_PROVIDER_OPERATION_AUTHORIZATION', 'PSA_E0_AUTHORIZATION_GATE_MISSING');
assert(psaRaci.activation_bundle?.[0]?.availability === 'BLOCKED_NOT_PROVISIONED', 'PSA_E0_STATE_INVALID');
assert(psaRaci.execution_sequence?.[0] === 'MERGE_CONTROL_PR_TO_PROTECTED_MAIN_WITHOUT_PROVIDER_DISPATCH', 'PSA_CODE_LANDING_SEQUENCE_INVALID');
assert(psaRaci.execution_sequence?.includes('ISSUE_AND_ATOMICALLY_CONSUME_E0_FOR_EXACT_MAIN_RUN_PROVIDER_ENDPOINT_PURPOSE_QUOTA_AND_SUBJECT'), 'PSA_E0_CONSUMPTION_SEQUENCE_MISSING');
assert(psaRaci.gates?.provider_activation === 'HOLD', 'PSA_PROVIDER_ACTIVATION_GATE_NOT_HOLD');

assert(providerRaci.id === 'KIDULTS_PROVIDER_LIVE_EXECUTION_RACI_V1', 'PROVIDER_RACI_ID_INVALID');
assert(providerRaci.state === 'ACTIVE_CONTROL', 'PROVIDER_RACI_STATE_INVALID');
assert(providerRaci.provider_state_machine?.includes('PRODUCT_PIPELINE_ADMITTED'), 'PROVIDER_ADMISSION_STATE_MISSING');
assert(providerRaci.truth_language?.connected_definition === 'PRODUCT_PIPELINE_ADMITTED_WITH_LIVE_RECEIPT', 'PROVIDER_CONNECTED_DEFINITION_INVALID');

assert(state.id === 'KIDULTS_PSA_ACTIVATION_STATE_RECEIPT_V1', 'PSA_STATE_RECEIPT_ID_INVALID');
assert(state.state === 'READY_BUT_NOT_ACTIVATED_PROVIDER_AUTHORIZATION_BLOCKED', 'PSA_STATE_RECEIPT_INVALID');
assert(state.provider_operation_authorization?.state === 'BLOCKED_NOT_PROVISIONED', 'PSA_PROVIDER_AUTHORIZATION_STATE_INVALID');
assert(state.provider_operation_authorization?.provider_secret_resolution_authorized === false, 'PSA_SECRET_AUTHORIZATION_FALSE_REQUIRED');
assert(state.counts?.approved_private_runtime_probe_successes === 0, 'PSA_APPROVED_PRIVATE_RUNTIME_COUNT_INVALID');
assert(state.counts?.lawful_manifest_admitted === 0, 'PSA_MANIFEST_COUNT_INVALID');
assert(state.counts?.live_acquired === 0, 'PSA_LIVE_ACQUIRED_COUNT_INVALID');
assert(state.counts?.product_pipeline_admitted === 0, 'PSA_PRODUCT_ADMITTED_COUNT_INVALID');

assert(authorizationBoundary.id === 'KIDULTS_PSA_PROVIDER_OPERATION_AUTHORIZATION_BOUNDARY_V1', 'PSA_AUTHORIZATION_BOUNDARY_ID_INVALID');
assert(authorizationBoundary.state === 'BLOCKED_NOT_PROVISIONED', 'PSA_AUTHORIZATION_BOUNDARY_STATE_INVALID');
assert(authorizationBoundary.authority_separation?.repository_landing_authorizes_provider_call === false, 'PSA_REPOSITORY_LANDING_PROVIDER_AUTHORITY_FORBIDDEN');
assert(authorizationBoundary.authority_separation?.atomic_landing_authorizes_provider_call === false, 'PSA_ATOMIC_LANDING_PROVIDER_AUTHORITY_FORBIDDEN');
assert(authorizationBoundary.authority_separation?.post_merge_workflow_may_dispatch_provider === false, 'PSA_POST_MERGE_PROVIDER_DISPATCH_FORBIDDEN');
assert(authorizationBoundary.authority_separation?.provider_secret_may_resolve_before_authorization_consumption === false, 'PSA_SECRET_PREAUTH_RESOLUTION_FORBIDDEN');
assert(authorizationBoundary.required_authorization?.consumption === 'ATOMIC_ONE_SHOT', 'PSA_ONE_SHOT_CONSUMPTION_REQUIRED');
assert(authorizationBoundary.required_authorization?.replay === 'REJECT', 'PSA_REPLAY_REJECTION_REQUIRED');
assert(authorizationBoundary.required_authorization?.self_authored_repository_receipt === 'REJECT', 'PSA_SELF_AUTHORED_RECEIPT_REJECTION_REQUIRED');
assert(authorizationBoundary.current_enforcement?.provider_calls_possible_from_landing === 0, 'PSA_LANDING_PROVIDER_CALLS_MUST_BE_ZERO');
assert(authorizationBoundary.current_enforcement?.provider_calls_possible_from_manual_dispatch === 0, 'PSA_MANUAL_PROVIDER_CALLS_MUST_BE_ZERO');
assert(authorizationBoundary.current_enforcement?.provider_secret_resolution_possible === false, 'PSA_SECRET_RESOLUTION_MUST_BE_IMPOSSIBLE');

assert(remediation.id === 'KIDULTS_PSA_Z1_FOLLOWUP_TRIGGER_REMEDIATION_V1', 'PSA_FOLLOWUP_REMEDIATION_ID_INVALID');
assert(remediation.version === '2.0.0', 'PSA_FOLLOWUP_REMEDIATION_VERSION_INVALID');
assert(remediation.state === 'LANDING_PROVIDER_SEPARATION_FIXED_PENDING_GOVERNED_LANDING', 'PSA_FOLLOWUP_REMEDIATION_STATE_INVALID');
assert(remediation.root_causes?.includes('REPOSITORY_LANDING_AUTHORIZATION_WAS_CONFLATED_WITH_EXTERNAL_PROVIDER_ACTIVATION'), 'PSA_AUTHORITY_CONFLATION_ROOT_CAUSE_MISSING');
assert(remediation.correction?.post_merge_effect === 'SANITIZED_CONTROL_RECEIPT_ONLY', 'PSA_POST_MERGE_CONTROL_ONLY_REQUIRED');
assert(remediation.correction?.post_merge_provider_dispatch === false, 'PSA_POST_MERGE_DISPATCH_FALSE_REQUIRED');
assert(remediation.correction?.post_merge_provider_calls === 0, 'PSA_POST_MERGE_CALLS_ZERO_REQUIRED');
assert(remediation.correction?.private_runtime_provider_job === 'LITERAL_IF_FALSE', 'PSA_PRIVATE_RUNTIME_LITERAL_HOLD_REQUIRED');
assert(remediation.counts?.approved_z1_private_runtime_successes === 0, 'PSA_FOLLOWUP_PRIVATE_RUNTIME_TRUTH_INVALID');
assert(remediation.counts?.live_acquisition === 0, 'PSA_FOLLOWUP_ACQUISITION_TRUTH_INVALID');
assert(remediation.counts?.product_pipeline_admission === 0, 'PSA_FOLLOWUP_ADMISSION_TRUTH_INVALID');

const z1WorkflowPath = '.github/workflows/kidults-psa-z1-private-runtime-v1.yml';
assert(registry.id === 'kidults-secret-bearing-workflow-dispatch-registry-v1', 'SECRET_REGISTRY_ID_INVALID');
assert(registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'SECRET_REGISTRY_STATUS_INVALID');
assert(registry.registered_workflows?.includes(z1WorkflowPath), 'PSA_Z1_SECRET_WORKFLOW_UNREGISTERED');
assert(registry.registered_count === registry.registered_workflows?.length, 'SECRET_REGISTRY_REGISTERED_COUNT_DRIFT');
assert(registry.required_environment_bindings?.length === registry.registered_count, 'SECRET_REGISTRY_BINDING_COUNT_DRIFT');
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

for (const marker of [
  'randomBytes(32)',
  'buildPrivatePsaRecord',
  'decryptPrivatePsaRecord',
  'buildDeletionReceipt',
  'unlink(encryptedPath)',
  'acquisition_120_increment: 0',
  'product_pipeline_admission_increment: 0',
]) {
  assert(runner.includes(marker), `PSA_PRIVATE_RUNNER_MARKER_MISSING:${marker}`);
}
assert(!runner.includes('console.log(payload)'), 'PSA_PRIVATE_RUNNER_RAW_LOG_FORBIDDEN');
assert(!runner.includes('console.log(token)'), 'PSA_PRIVATE_RUNNER_TOKEN_LOG_FORBIDDEN');

for (const marker of [
  'workflow_dispatch:',
  'authorization-hold:',
  "if: github.ref == 'refs/heads/main'",
  'Verify live main without resolving provider credentials',
  'BLOCKED_INDEPENDENT_PROVIDER_OPERATION_AUTHORIZATION_NOT_PROVISIONED',
  'provider_dispatch_performed: false',
  'provider_calls: 0',
  'provider_secret_resolution_authorized: false',
  'provider_secret_resolved: false',
  'authorization_receipt_consumed: false',
  'Upload sanitized provider-authorization HOLD receipt',
  'Fail closed before provider secret resolution',
  'z1-private-runtime:',
  'if: ${{ false }}',
  'environment: kidults-psa-public-single-cert',
  'PSA_PUBLIC_API_TOKEN: ${{ secrets.PSA_PUBLIC_API_TOKEN }}',
]) {
  assert(workflow.includes(marker), `PSA_PRIVATE_WORKFLOW_MARKER_MISSING:${marker}`);
}
assert(!workflow.includes('pull_request_target:'), 'PSA_SECRET_WORKFLOW_PULL_REQUEST_TARGET_FORBIDDEN');
assert(!/^\s{2}(?:push|pull_request|schedule|workflow_run):/m.test(workflow), 'PSA_SECRET_WORKFLOW_MUST_REMAIN_DISPATCH_ONLY');
assert(!/workflow_dispatch:\s*\n\s+inputs:/m.test(workflow), 'PSA_SECRET_OR_CERT_WORKFLOW_INPUTS_FORBIDDEN');
assert(!workflow.includes('if: github.ref == \'refs/heads/main\'\n    environment: kidults-psa-public-single-cert'), 'PSA_PROVIDER_JOB_MAIN_ONLY_WITHOUT_E0_FORBIDDEN');
assert(workflow.indexOf('authorization-hold:') < workflow.indexOf('z1-private-runtime:'), 'PSA_AUTHORIZATION_HOLD_MUST_PRECEDE_PROVIDER_JOB');
assert(workflow.indexOf('if: ${{ false }}') < workflow.indexOf('environment: kidults-psa-public-single-cert'), 'PSA_LITERAL_HOLD_MUST_PRECEDE_SECRET_ENVIRONMENT');
assert(!workflow.includes('path: ${{ github.workspace }}'), 'PSA_WORKSPACE_ARTIFACT_UPLOAD_FORBIDDEN');

for (const marker of [
  'name: KIDULTS PSA Z1 Post-Merge Orchestrator V1',
  'workflow_run:',
  'workflows: ["KIDULTS Atomic Governed Landing V1"]',
  'types: [completed]',
  'branches: [main]',
  'pull-requests: read',
  "github.event.workflow_run.event == 'workflow_dispatch'",
  "github.event.workflow_run.event == 'issue_comment'",
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.head_branch == 'main'",
  'Resolve exact atomic landing and record provider activation hold',
  'SOURCE_HEAD_SHA',
  'FIRST_PARENT_SHA',
  'test "$FIRST_PARENT_SHA" = "$SOURCE_HEAD_SHA"',
  '/commits/${LIVE_MAIN_SHA}/pulls',
  '/pulls/${LANDING_PR_NUMBER}/files?per_page=100',
  'CODE_LANDED_PROVIDER_ACTIVATION_HELD',
  'SKIPPED_NOT_PSA_RELEVANT',
  'provider_dispatch_performed: false',
  'provider_calls: 0',
  'provider_secret_resolution_authorized: false',
  'provider_secret_resolved: false',
  'independent_provider_operation_authorization_consumed: false',
  'INDEPENDENT_PROVIDER_OPERATION_AUTHORIZATION_REQUIRED',
  'KIDULTS_PSA_Z1_POST_MERGE_CONTROL_RECEIPT_V2',
  'Upload sanitized post-merge control receipt',
  'acquisition_120_increment: 0',
  'product_pipeline_admission_increment: 0',
]) {
  assert(orchestrator.includes(marker), `PSA_POST_MERGE_ORCHESTRATOR_MARKER_MISSING:${marker}`);
}
for (const forbidden of [
  'actions: write',
  'gh api -X POST',
  '/dispatches',
  'secrets.',
  'environment: kidults-psa',
  'workflow_dispatch:',
  'Dispatch or reuse and await exact-main Z1 private runtime',
  'DISPATCHED_NEW_EXACT_MAIN_RUN',
]) {
  assert(!orchestrator.includes(forbidden), `PSA_POST_MERGE_PROVIDER_ACTIVATION_PATH_FORBIDDEN:${forbidden}`);
}
assert(!orchestrator.includes('\n  push:'), 'PSA_POST_MERGE_PUSH_TRIGGER_FORBIDDEN');
assert(!orchestrator.includes('contents: write'), 'PSA_POST_MERGE_CONTENTS_WRITE_FORBIDDEN');
assert(!orchestrator.includes('pull_request_target:'), 'PSA_POST_MERGE_PULL_REQUEST_TARGET_FORBIDDEN');

process.stdout.write(`${JSON.stringify({
  receipt_id: 'KIDULTS_PSA_LIVE_EXECUTION_CONTROL_VALIDATION_V2',
  state: 'VERIFIED_PASS',
  truth_state: state.state,
  provider_authorization_state: authorizationBoundary.state,
  secret_registry_state: 'REGISTERED_AND_BOUND_PROVIDER_JOB_LITERAL_HOLD',
  post_merge_state: 'CONTROL_RECEIPT_ONLY_NO_PROVIDER_DISPATCH',
  private_runtime_state: 'FAIL_CLOSED_BEFORE_PROVIDER_SECRET_RESOLUTION',
  approved_private_runtime_count: state.counts.approved_private_runtime_probe_successes,
  acquisition_count: state.counts.live_acquired,
  product_pipeline_admission_count: state.counts.product_pipeline_admitted,
})}\n`);
