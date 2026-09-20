import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  inspectD1Schema,
  inspectCanonicalClaimRuntime,
  inspectCommonControlFoundation,
  inspectCryptographicApprovalEnvelope,
  inspectCryptographicApprovalConsumption,
  inspectApprovalTrustRootLifecycle,
  inspectApprovalTrustRegistryCompiler,
  inspectTrustHandoffControlBundle,
  inspectApprovalTrustAtomicHead,
  inspectApprovalTrustRuntimeImports,
  inspectAutonomousTaskLifecycle,
  inspectAutonomousTaskLedgerRuntime,
  inspectAutonomousTaskScheduler,
  inspectAutonomousTaskWorker,
  inspectAutonomousAdmissionProofStore,
  inspectAutonomousSingleCycleRunner,
  inspectAutonomousControlTick,
  inspectAutonomousShadowSupervisor,
  inspectAutonomousSupervisorInvocationAdmission,
  inspectAutonomousLauncher,
  inspectAutonomousPostgresRuntimeClient,
  inspectLeaseCheckpointReconciliation,
  inspectAutonomousPostgresEvidence,
  inspectPostgresSchema,
  inspectWorkflowReceiptRelationTruth,
  inspectWorkflowReceiptRuntime,
  inspectRuntimeRegistrationLedgerAdmission,
  loadOrderedPostgresMigrations,
  validateBoundary,
} from './validate-boundary-v1.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const postgresMigrations = path.join(serviceRoot, 'migrations/postgres');

function postgresSql() {
  return loadOrderedPostgresMigrations(postgresMigrations).sql;
}

test('current repository establishes PostgreSQL authority and inventories every D1 writer', () => {
  const receipt = validateBoundary();
  assert.deepEqual(receipt.errors, []);
  assert.equal(receipt.system_of_record, 'POSTGRESQL');
  assert.equal(receipt.d1_role, 'READ_MODEL_ONLY');
  assert.deepEqual(receipt.permitted_normal_d1_writer, ['kpmo-d1-projector-v1']);
  assert.equal(receipt.deployed_governed_d1_writer_count, 0);
  assert.equal(receipt.remote_d1_mutation, false);
  assert.equal(receipt.production, 'HOLD');
  assert.equal(receipt.discovered_production_d1_writer_sources.some((file) => file.endsWith('.d.ts')), false);
  assert.deepEqual(receipt.postgres_migrations, [
    '0001_system_of_record.sql',
    '0002_workflow_run_receipts.sql',
    '0003_autonomous_task_ledger.sql',
    '0004_autonomous_admission_proofs.sql',
    '0005_autonomous_task_transition_pair.sql',
    '0006_autonomous_supervisor_invocation_admission.sql',
    '0007_cryptographic_approval_consumption.sql',
    '0008_approval_trust_root_lifecycle.sql',
    '0009_approval_trust_registry_snapshots.sql',
    '0010_approval_trust_current_heads.sql',
    '0011_autonomous_containment_fence_events.sql',
    '0012_protected_launch_manifest_consumptions.sql',
  ]);
  assert.equal(receipt.workflow_receipt_ledger, 'IMPLEMENTED_NOT_REMOTE_VERIFIED');
  assert.equal(receipt.workflow_receipt_remote_persistence, 'HOLD');
  assert.match(receipt.canonical_identity_classifier, /^IMPLEMENTED_.*_REMOTE_LEDGER_ACTIVATION_HOLD$/);
  assert.equal(receipt.canonical_dedupe_remote_ledger, 'REMOTE_LEDGER_ACTIVATION_HOLD');
  assert.equal(receipt.common_control_foundation, 'VERIFIED_PASS_LOCAL_CONTRACT_REMOTE_INTEGRATION_HOLD');
  assert.equal(receipt.common_control_scope, 'LOCAL_SYNTHETIC_SHADOW_ONLY');
  assert.equal(receipt.common_control_external_egress, false);
  assert.equal(receipt.cryptographic_approval_envelope,
    'LOCAL_SIGNATURE_VERIFIER_READY_TRUST_ROOTS_UNREGISTERED_HOLD');
  assert.equal(receipt.cryptographic_approval_trust_roots, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.cryptographic_approval_activation, false);
  assert.equal(receipt.cryptographic_approval_consumption,
    'LOCAL_APPEND_ONLY_CONSUMPTION_READY_TRUST_ROOTS_AND_WIRING_HOLD');
  assert.equal(receipt.cryptographic_approval_consumption_remote_postgresql, 'HOLD');
  assert.equal(receipt.approval_trust_root_lifecycle,
    'LOCAL_SYNTHETIC_LIFECYCLE_READY_REAL_KEYS_AND_WIRING_HOLD');
  assert.equal(receipt.approval_trust_root_verifier_wiring, 'NOT_WIRED_HOLD');
  assert.equal(receipt.approval_trust_registry_compiler,
    'LOCAL_SYNTHETIC_COMPILER_READY_EXPLICIT_CALLER_HANDOFF_ONLY');
  assert.equal(receipt.approval_trust_registry_automatic_wiring, 'NOT_WIRED_HOLD');
  assert.equal(receipt.approval_trust_handoff_control_bundle,
    'LOCAL_SYNTHETIC_EXACT_HANDOFF_FENCE_READY_NONATOMIC_GATEWAY_RETIRED');
  assert.equal(receipt.approval_trust_handoff_automatic_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.approval_trust_atomic_head,
    'LOCAL_SYNTHETIC_ATOMIC_CURRENT_HEAD_GATEWAY_READY_REMOTE_AND_REAL_KEYS_HOLD');
  assert.equal(receipt.approval_trust_atomic_head_concurrency, 'NOT_VERIFIED');
  assert.equal(receipt.autonomous_task_lifecycle, 'VERIFIED_PASS_LOCAL_SCHEMA_RUNTIME_REMOTE_POSTGRESQL_HOLD');
  assert.equal(receipt.autonomous_task_scope, 'LOCAL_DETERMINISTIC_STATE_MACHINE_AND_APPEND_ONLY_LEDGER_ADAPTER');
  assert.equal(receipt.autonomous_task_remote_worker_activation, 'HOLD');
  assert.equal(receipt.autonomous_task_durable_persistence, 'LOCAL_SCHEMA_AND_RUNTIME_READY_REMOTE_POSTGRESQL_HOLD');
  assert.equal(receipt.autonomous_task_scheduler, 'LOCAL_SCHEDULER_PRIMITIVE_READY_REMOTE_ACTIVATION_HOLD');
  assert.equal(receipt.autonomous_task_scheduler_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_task_worker, 'LOCAL_SYNTHETIC_EXECUTION_ENVELOPE_READY_REMOTE_ACTIVATION_HOLD');
  assert.equal(receipt.autonomous_task_worker_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_control_tick,
    'LOCAL_RECOVERY_FIRST_CONTROL_TICK_READY_REMOTE_ACTIVATION_HOLD');
  assert.equal(receipt.autonomous_control_tick_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_shadow_supervisor,
    'LOCAL_BOUNDED_SHADOW_SUPERVISOR_READY_TRIGGER_HOLD');
  assert.equal(receipt.autonomous_shadow_supervisor_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_supervisor_invocation_admission,
    'LOCAL_APPEND_ONLY_INVOCATION_ADMISSION_READY_AUTHENTICATED_APPROVAL_HOLD');
  assert.equal(receipt.autonomous_supervisor_invocation_automatic_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_launcher_verification_trigger,
    'PROTECTED_MAIN_PUSH_AND_DAILY_LOCAL_SYNTHETIC');
  assert.equal(receipt.autonomous_launcher_automatic_trigger, 'NOT_REGISTERED_HOLD');
  assert.equal(receipt.autonomous_postgres_runtime_client,
    'RUNTIME_CLIENT_IMPLEMENTED_LIVE_CONNECTION_NOT_VERIFIED');
  assert.equal(receipt.autonomous_postgres_runtime_live_connection, 'NOT_VERIFIED_HOLD');
});

test('Autonomous Launcher remains a minimal exact-authority execution path', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/autonomous-launcher-v1.json'), 'utf8'));
  const source = fs.readFileSync(
    path.join(serviceRoot, 'src/autonomous-control/launcher-v1.mjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(repositoryRoot,
    '.github/workflows/kidults-control-plane-autonomous-verification-v1.yml'), 'utf8');
  const runtimeWorkflow = fs.readFileSync(path.join(repositoryRoot,
    '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'), 'utf8');
  assert.deepEqual(inspectAutonomousLauncher(
    controlPlane, contract, source, workflow, runtimeWorkflow).errors, []);
  assert(inspectAutonomousLauncher(controlPlane, contract, source,
    workflow.replace('contents: read', 'contents: write')).errors.some(
    error => error.startsWith('AUTONOMOUS_LAUNCHER_VERIFICATION_TRIGGER_UNSAFE:')));
  assert(inspectAutonomousLauncher(controlPlane, contract, source, '').errors.some(
    error => error.startsWith('AUTONOMOUS_LAUNCHER_VERIFICATION_TRIGGER_MISSING:')));
  assert(inspectAutonomousLauncher(controlPlane, contract, source, workflow, '').errors.some(
    error => error.startsWith('AUTONOMOUS_RUNTIME_REGISTRATION_WORKFLOW_MISSING:')));
  assert(inspectAutonomousLauncher(controlPlane, contract, source, workflow,
    runtimeWorkflow.replace('actions/runs/$GITHUB_RUN_ID', 'actions/runs/unbound')).errors.some(
    error => error.startsWith('AUTONOMOUS_RUNTIME_REGISTRATION_WORKFLOW_MISSING:')));
  const activated = structuredClone(controlPlane);
  activated.autonomous_launcher.remote_worker_activation = 'ACTIVE';
  assert(inspectAutonomousLauncher(activated, contract, source).errors.includes(
    'AUTONOMOUS_LAUNCHER_CAPABILITY_ENABLED'));
  const expanded = structuredClone(contract);
  expanded.new_policy_engine = true;
  assert(inspectAutonomousLauncher(controlPlane, expanded, source).errors.includes(
    'AUTONOMOUS_LAUNCHER_CONTRACT_INVALID'));
});

test('lease checkpoint reconciliation reuses bounded append-only truth primitives', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-lease-checkpoint-reconciliation-v1.json'), 'utf8'));
  const sources = {
    lifecycle: fs.readFileSync(path.join(serviceRoot,
      'src/autonomous-control/task-lifecycle-v1.mjs'), 'utf8'),
    ledger: fs.readFileSync(path.join(serviceRoot,
      'src/autonomous-control/task-ledger-v1.mjs'), 'utf8'),
    scheduler: fs.readFileSync(path.join(serviceRoot,
      'src/autonomous-control/task-scheduler-v1.mjs'), 'utf8'),
  };
  assert.deepEqual(inspectLeaseCheckpointReconciliation(controlPlane, contract, sources).errors, []);
  const expanded = structuredClone(contract);
  expanded.new_runtime_module = true;
  assert(inspectLeaseCheckpointReconciliation(controlPlane, expanded, sources).errors.includes(
    'LEASE_CHECKPOINT_RECONCILIATION_CONTRACT_INVALID'));
});

test('approval consumption is append-only and replay-safe without runtime activation', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/approval-consumption-ledger-v1.json'), 'utf8'));
  const source = fs.readFileSync(
    path.join(serviceRoot, 'src/common-control/approval-consumption-v1.mjs'), 'utf8');
  const sql = postgresSql();
  assert.deepEqual(inspectCryptographicApprovalConsumption(
    controlPlane, contract, source, sql).errors, []);

  const activated = structuredClone(controlPlane);
  activated.cryptographic_approval_consumption.activation_authorized = true;
  assert(inspectCryptographicApprovalConsumption(activated, contract, source, sql).errors.includes(
    'APPROVAL_CONSUMPTION_CAPABILITY_ENABLED'
  ));

  const weakened = structuredClone(contract);
  weakened.consumption_boundary.unique_nonce_digest = false;
  assert(inspectCryptographicApprovalConsumption(controlPlane, weakened, source, sql).errors.includes(
    'APPROVAL_CONSUMPTION_FENCE_WEAKENED'
  ));

  assert(inspectCryptographicApprovalConsumption(controlPlane, contract, source,
    sql.replace('nonce_digest text NOT NULL UNIQUE', 'nonce_digest text NOT NULL')).errors.includes(
    'APPROVAL_CONSUMPTION_SCHEMA_CONTROL_MISSING:nonce_digest text NOT NULL UNIQUE'
  ));
});

test('trust-root lifecycle is public-key-only, append-only and not verifier wired', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/approval-trust-root-lifecycle-v1.json'), 'utf8'));
  const source = fs.readFileSync(
    path.join(serviceRoot, 'src/common-control/approval-trust-root-lifecycle-v1.mjs'), 'utf8');
  const sql = postgresSql();
  assert.deepEqual(inspectApprovalTrustRootLifecycle(controlPlane, contract, source, sql).errors, []);
  const activated = structuredClone(controlPlane);
  activated.approval_trust_root_lifecycle.verifier_wiring = 'ACTIVE';
  assert(inspectApprovalTrustRootLifecycle(activated, contract, source, sql).errors.includes(
    'TRUST_ROOT_LIFECYCLE_CAPABILITY_ENABLED'));
  const weakened = structuredClone(contract);
  weakened.controls.revocation_priority = 'REVERSIBLE';
  assert(inspectApprovalTrustRootLifecycle(controlPlane, weakened, source, sql).errors.includes(
    'TRUST_ROOT_LIFECYCLE_FENCE_WEAKENED'));
});

test('trust-registry compiler is deterministic, explicit and protected-gate HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/approval-trust-registry-compiler-v1.json'), 'utf8'));
  const source = fs.readFileSync(
    path.join(serviceRoot, 'src/common-control/approval-trust-registry-compiler-v1.mjs'), 'utf8');
  assert.deepEqual(inspectApprovalTrustRegistryCompiler(controlPlane, contract, source).errors, []);
  const wired = structuredClone(controlPlane);
  wired.approval_trust_registry_compiler.automatic_verifier_wiring = 'ACTIVE';
  assert(inspectApprovalTrustRegistryCompiler(wired, contract, source).errors.includes(
    'TRUST_REGISTRY_COMPILER_CAPABILITY_ENABLED'));
  const weakened = structuredClone(contract);
  weakened.controls.exact_registry_digest_pin_required = false;
  assert(inspectApprovalTrustRegistryCompiler(controlPlane, weakened, source).errors.includes(
    'TRUST_REGISTRY_COMPILER_FENCE_WEAKENED'));
});

test('trust handoff bundle preserves modular stale-state and activation fences', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/approval-trust-handoff-control-bundle-v1.json'), 'utf8'));
  const sources = Object.fromEntries([
    'approval-trust-registry-snapshot-v1.mjs', 'approval-trust-registry-resolver-v1.mjs',
    'approval-trust-registry-fence-v1.mjs', 'approval-trust-verification-gateway-v1.mjs',
  ].map(file => [file, fs.readFileSync(path.join(serviceRoot, 'src/common-control', file), 'utf8')]));
  assert.deepEqual(inspectTrustHandoffControlBundle(
    controlPlane, contract, sources, postgresSql()).errors, []);
  const weakened = structuredClone(contract);
  weakened.controls.fence_before_nonce_consumption = false;
  assert(inspectTrustHandoffControlBundle(controlPlane, weakened, sources, postgresSql()).errors
    .includes('TRUST_HANDOFF_BUNDLE_FENCE_WEAKENED'));
});

test('approval trust runtime import policy rejects retired and direct gateway bypasses', () => {
  assert.deepEqual(inspectApprovalTrustRuntimeImports({
    'services/kidults-control-plane/src/example.mjs':
      "import { x } from './approval-trust-verification-gateway-v1.mjs';",
  }).errors, [
    'TRUST_RUNTIME_RETIRED_GATEWAY_IMPORT:services/kidults-control-plane/src/example.mjs',
  ]);
  assert.deepEqual(inspectApprovalTrustRuntimeImports({
    'services/kidults-control-plane/src/example.mjs':
      "import { x } from './approval-trust-atomic-gateway-v1.mjs';",
  }).errors, [
    'TRUST_RUNTIME_ATOMIC_GATEWAY_BYPASS:services/kidults-control-plane/src/example.mjs',
  ]);
});

test('cryptographic approval verifier fixes exact role quorums without activating authority', () => {
  const controlPlane = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(
    path.join(serviceRoot, 'contracts/approval-authority-matrix-v1.json'), 'utf8'));
  const source = fs.readFileSync(
    path.join(serviceRoot, 'src/common-control/approval-envelope-v1.mjs'), 'utf8');
  assert.deepEqual(inspectCryptographicApprovalEnvelope(controlPlane, contract, source).errors, []);

  const activated = structuredClone(controlPlane);
  activated.cryptographic_approval_envelope.activation_authorized = true;
  assert(inspectCryptographicApprovalEnvelope(activated, contract, source).errors.includes(
    'CRYPTOGRAPHIC_APPROVAL_CAPABILITY_ENABLED'
  ));

  const weakened = structuredClone(contract);
  weakened.authority_classes.PROVIDER_PREFLIGHT_NO_FETCH.required_roles = ['KPMO', 'TRACK_A'];
  assert(inspectCryptographicApprovalEnvelope(controlPlane, weakened, source).errors.includes(
    'CRYPTOGRAPHIC_APPROVAL_AUTHORITY_CLASS_INVALID:PROVIDER_PREFLIGHT_NO_FETCH'
  ));

  const signingEnabled = `${source}\ngenerateKeyPair();`;
  assert(inspectCryptographicApprovalEnvelope(controlPlane, contract, signingEnabled).errors.some(
    error => error.startsWith('CRYPTOGRAPHIC_APPROVAL_PROHIBITED_CAPABILITY:')
  ));
});

test('Common Control Foundation remains default-deny, no-egress and protected-gate HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const foundation = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/common-control-foundation-v1.json'), 'utf8'));
  const sources = Object.fromEntries([
    'canonical-v1.mjs', 'admission-v1.mjs', 'shadow-broker-v1.mjs',
  ].map((file) => [file, fs.readFileSync(path.join(serviceRoot, 'src/common-control', file), 'utf8')]));
  assert.deepEqual(inspectCommonControlFoundation(controlPlane, foundation, sources).errors, []);

  const unsafeBoundary = structuredClone(controlPlane);
  unsafeBoundary.common_control_foundation.broker_external_egress = true;
  assert(inspectCommonControlFoundation(unsafeBoundary, foundation, sources).errors.includes(
    'COMMON_CONTROL_BROKER_EXTERNAL_CAPABILITY_ENABLED'
  ));

  const unsafeSource = { ...sources, 'shadow-broker-v1.mjs': `${sources['shadow-broker-v1.mjs']}\nfetch('https://example.com')` };
  assert(inspectCommonControlFoundation(controlPlane, foundation, unsafeSource).errors.some(
    error => error.startsWith('COMMON_CONTROL_EXTERNAL_CAPABILITY_PROHIBITED:')
  ));

  const weakened = structuredClone(foundation);
  weakened.invariants = weakened.invariants.filter((value) => value !== 'RETRY_CANNOT_REUSE_CHANGED_OR_EXPIRED_AUTHORITY');
  assert(inspectCommonControlFoundation(controlPlane, weakened, sources).errors.includes(
    'COMMON_CONTROL_INVARIANT_MISSING:RETRY_CANNOT_REUSE_CHANGED_OR_EXPIRED_AUTHORITY'
  ));
});

test('Autonomous Task Lifecycle remains pure, lease-fenced and remote-activation HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const lifecycle = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/autonomous-task-lifecycle-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot, 'src/autonomous-control/task-lifecycle-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousTaskLifecycle(controlPlane, lifecycle, source).errors, []);

  const unsafeBoundary = structuredClone(controlPlane);
  unsafeBoundary.autonomous_task_lifecycle.remote_worker_activation = 'ACTIVE';
  assert(inspectAutonomousTaskLifecycle(unsafeBoundary, lifecycle, source).errors.includes(
    'AUTONOMOUS_TASK_REMOTE_AUTHORITY_ENABLED'
  ));

  assert(inspectAutonomousTaskLifecycle(controlPlane, lifecycle, `${source}\nfetch('https://example.com')`).errors.some(
    error => error.startsWith('AUTONOMOUS_TASK_EXTERNAL_CAPABILITY_PROHIBITED:')
  ));

  const weakened = structuredClone(lifecycle);
  weakened.invariants = weakened.invariants.filter((value) => value !== 'TERMINAL_TASKS_ARE_IMMUTABLE');
  assert(inspectAutonomousTaskLifecycle(controlPlane, weakened, source).errors.includes(
    'AUTONOMOUS_TASK_INVARIANT_MISSING:TERMINAL_TASKS_ARE_IMMUTABLE'
  ));
});

test('Autonomous Task Ledger runtime remains CAS-bound, append-only and remote HOLD', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'src/autonomous-control/task-ledger-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousTaskLedgerRuntime(source).errors, []);
  const weakened = inspectAutonomousTaskLedgerRuntime(source.replaceAll(
    'TASK_LEDGER_STALE_REVISION', 'TASK_LEDGER_STALE_ACCEPTED'
  ));
  assert(weakened.errors.some(error => error.includes('TASK_LEDGER_STALE_REVISION')));
});

test('Autonomous Task Scheduler remains bounded, synthetic-only and trigger HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const scheduler = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/autonomous-task-scheduler-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot, 'src/autonomous-control/task-scheduler-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousTaskScheduler(controlPlane, scheduler, source).errors, []);

  const unsafeBoundary = structuredClone(controlPlane);
  unsafeBoundary.autonomous_task_scheduler.trigger = 'SCHEDULED_ACTIVE';
  assert(inspectAutonomousTaskScheduler(unsafeBoundary, scheduler, source).errors.includes(
    'AUTONOMOUS_SCHEDULER_REMOTE_CAPABILITY_ENABLED'
  ));
  const weakened = structuredClone(scheduler);
  weakened.selection.candidate_batch_maximum = 1000;
  assert(inspectAutonomousTaskScheduler(controlPlane, weakened, source).errors.includes(
    'AUTONOMOUS_SCHEDULER_SELECTION_BOUNDARY_WEAKENED'
  ));
  assert(inspectAutonomousTaskScheduler(controlPlane, scheduler, `${source}\nfetch('https://example.com')`).errors.some(
    error => error.startsWith('AUTONOMOUS_SCHEDULER_PROHIBITED_CAPABILITY:')
  ));
});

test('Autonomous Task Worker preserves preflight, static handler and no-capability boundaries', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const worker = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/autonomous-task-worker-v1.json'), 'utf8'));
  const sources = {
    worker: fs.readFileSync(path.join(serviceRoot, 'src/autonomous-control/task-worker-v1.mjs'), 'utf8'),
    registry: fs.readFileSync(path.join(serviceRoot, 'src/autonomous-control/synthetic-handler-registry-v1.mjs'), 'utf8'),
  };
  assert.deepEqual(inspectAutonomousTaskWorker(controlPlane, worker, sources).errors, []);

  const unsafeBoundary = structuredClone(controlPlane);
  unsafeBoundary.autonomous_task_worker.trigger = 'SCHEDULED_ACTIVE';
  assert(inspectAutonomousTaskWorker(unsafeBoundary, worker, sources).errors.includes(
    'AUTONOMOUS_WORKER_CAPABILITY_BOUNDARY_WEAKENED'
  ));
  const falseSandbox = structuredClone(worker);
  falseSandbox.handler_boundary.untrusted_code_sandbox = true;
  assert(inspectAutonomousTaskWorker(controlPlane, falseSandbox, sources).errors.includes(
    'AUTONOMOUS_WORKER_CONTRACT_CAPABILITY_WEAKENED'
  ));
  const unsafeSource = { ...sources, registry: `${sources.registry}\nfetch('https://example.com')` };
  assert(inspectAutonomousTaskWorker(controlPlane, worker, unsafeSource).errors.some(
    error => error.startsWith('AUTONOMOUS_WORKER_PROHIBITED_CAPABILITY:')
  ));
});

test('Autonomous admission proof store remains append-only, synthetic-only and remote HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-admission-proof-store-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'src/autonomous-control/admission-proof-store-v1.mjs'), 'utf8');
  const sql = postgresSql();
  assert.deepEqual(inspectAutonomousAdmissionProofStore(controlPlane, contract, source, sql).errors, []);
  const unsafe = structuredClone(controlPlane);
  unsafe.autonomous_admission_proof_store.remote_postgresql = 'ACTIVE';
  assert(inspectAutonomousAdmissionProofStore(unsafe, contract, source, sql).errors.includes(
    'AUTONOMOUS_ADMISSION_PROOF_CAPABILITY_ENABLED'));
  assert(inspectAutonomousAdmissionProofStore(controlPlane, contract, source,
    sql.replace('autonomous_admission_proofs_append_only', 'autonomous_admission_proofs_mutable')).errors.some(
    error => error.includes('autonomous_admission_proofs_append_only')));
});

test('Autonomous runner remains single-cycle, proof-gated and trigger HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-single-cycle-runner-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'src/autonomous-control/task-runner-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousSingleCycleRunner(controlPlane, contract, source).errors, []);
  const unsafe = structuredClone(controlPlane);
  unsafe.autonomous_single_cycle_runner.trigger = 'SCHEDULED_ACTIVE';
  assert(inspectAutonomousSingleCycleRunner(unsafe, contract, source).errors.includes(
    'AUTONOMOUS_RUNNER_CAPABILITY_ENABLED'));
  assert(inspectAutonomousSingleCycleRunner(controlPlane, contract, `${source}\nsetInterval(() => {}, 1)`).errors.some(
    error => error.startsWith('AUTONOMOUS_RUNNER_PROHIBITED_CAPABILITY:')));
});

test('Autonomous control tick remains recovery-first, bounded and trigger HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-control-tick-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'src/autonomous-control/control-tick-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousControlTick(controlPlane, contract, source).errors, []);
  const unsafe = structuredClone(controlPlane);
  unsafe.autonomous_control_tick.trigger = 'SCHEDULED_ACTIVE';
  assert(inspectAutonomousControlTick(unsafe, contract, source).errors.includes(
    'AUTONOMOUS_CONTROL_TICK_CAPABILITY_ENABLED'));
  assert(inspectAutonomousControlTick(controlPlane, contract,
    `${source}\nwhile (true) {}`).errors.some(
    (error) => error.startsWith('AUTONOMOUS_CONTROL_TICK_PROHIBITED_CAPABILITY:')));
});

test('Autonomous shadow supervisor remains explicitly bounded and trigger HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-shadow-supervisor-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'src/autonomous-control/shadow-supervisor-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousShadowSupervisor(controlPlane, contract, source).errors, []);
  const unsafe = structuredClone(controlPlane);
  unsafe.autonomous_shadow_supervisor.maximum_ticks = 1000;
  assert(inspectAutonomousShadowSupervisor(unsafe, contract, source).errors.includes(
    'AUTONOMOUS_SHADOW_SUPERVISOR_CAPABILITY_ENABLED'));
  const weakened = structuredClone(contract);
  weakened.budgets.in_flight_database_call_hard_preemption = 'VERIFIED';
  assert(inspectAutonomousShadowSupervisor(controlPlane, weakened, source).errors.includes(
    'AUTONOMOUS_SHADOW_SUPERVISOR_BUDGET_WEAKENED'));
  assert(inspectAutonomousShadowSupervisor(controlPlane, contract,
    `${source}\nsetInterval(() => {}, 1)`).errors.some(
    (error) => error.startsWith('AUTONOMOUS_SHADOW_SUPERVISOR_PROHIBITED_CAPABILITY:')));
});

test('Autonomous supervisor invocation admission remains append-only, single-use and authority HOLD', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-supervisor-invocation-admission-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'src/autonomous-control/invocation-admission-v1.mjs'), 'utf8');
  const sql = postgresSql();
  assert.deepEqual(inspectAutonomousSupervisorInvocationAdmission(
    controlPlane, contract, source, sql).errors, []);
  const overclaimed = structuredClone(controlPlane);
  overclaimed.autonomous_supervisor_invocation_admission.program_owner_authority = true;
  assert(inspectAutonomousSupervisorInvocationAdmission(
    overclaimed, contract, source, sql).errors.includes(
    'AUTONOMOUS_INVOCATION_ADMISSION_CAPABILITY_ENABLED'));
  const weakened = structuredClone(contract);
  weakened.single_use_consumption.replay = 'REUSE_ALLOWED';
  assert(inspectAutonomousSupervisorInvocationAdmission(
    controlPlane, weakened, source, sql).errors.includes(
    'AUTONOMOUS_INVOCATION_ADMISSION_PERSISTENCE_WEAKENED'));
  assert(inspectAutonomousSupervisorInvocationAdmission(controlPlane, contract,
    `${source}\nfetch('https://example.com')`, sql).errors.some(
    (error) => error.startsWith('AUTONOMOUS_INVOCATION_ADMISSION_PROHIBITED_CAPABILITY:')));
});

test('Autonomous PostgreSQL evidence runner remains ephemeral-only and unexecuted', () => {
  const controlPlane = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot,
    'contracts/autonomous-postgres-evidence-v1.json'), 'utf8'));
  const source = fs.readFileSync(path.join(serviceRoot,
    'scripts/autonomous-postgres-evidence-v1.mjs'), 'utf8');
  const verifier = fs.readFileSync(path.join(serviceRoot,
    'src/common-control/autonomous-postgres-evidence-receipt-v1.mjs'), 'utf8');
  const independentVerifier = fs.readFileSync(path.join(serviceRoot,
    'scripts/verify-autonomous-postgres-evidence-v1.mjs'), 'utf8');
  const orchestrator = fs.readFileSync(path.join(serviceRoot,
    'scripts/run-autonomous-postgres-canary-v1.mjs'), 'utf8');
  assert.deepEqual(inspectAutonomousPostgresEvidence(
    controlPlane, contract, source, verifier, independentVerifier, orchestrator).errors, []);
  const overclaimed = structuredClone(controlPlane);
  overclaimed.autonomous_postgres_evidence.runtime_runner_database_execution = true;
  assert(inspectAutonomousPostgresEvidence(
    overclaimed, contract, source, verifier, independentVerifier, orchestrator).errors.includes(
    'AUTONOMOUS_POSTGRES_EVIDENCE_OVERCLAIMED'));
  assert(inspectAutonomousPostgresEvidence(controlPlane, contract,
    source.replace('AUTONOMOUS_POSTGRES_NONEMPTY_TARGET_DENIED', 'TARGET_REUSE_ALLOWED'),
    verifier, independentVerifier, orchestrator).errors.some(
    error => error.includes('AUTONOMOUS_POSTGRES_NONEMPTY_TARGET_DENIED')));
});

test('D1 schema rejects a canonical customer table', () => {
  const result = inspectD1Schema(`
    CREATE TABLE users (user_id TEXT PRIMARY KEY);
    CREATE TABLE projection_meta (projection_name TEXT PRIMARY KEY);
  `);
  assert(result.errors.includes('D1_CANONICAL_TABLE_PROHIBITED:users'));
});

test('D1 schema rejects an unregistered projection table', () => {
  const result = inspectD1Schema('CREATE TABLE shadow_truth (id TEXT PRIMARY KEY);');
  assert(result.errors.includes('D1_UNREGISTERED_READ_MODEL:shadow_truth'));
});

test('PostgreSQL schema rejects missing writer and append-only controls', () => {
  const result = inspectPostgresSchema('BEGIN; CREATE TABLE kidults_control.organizations(id uuid); COMMIT;');
  assert(result.errors.includes('POSTGRES_CONTROL_MISSING:assert_registered_writer'));
  assert(result.errors.includes('POSTGRES_CONTROL_MISSING:KIDULTS_APPEND_ONLY_MUTATION_DENIED'));
});

test('PostgreSQL source ledger requires canonical identity and immutable rights history', () => {
  const sql = postgresSql();
  const withoutCanonicalIdentity = inspectPostgresSchema(sql.replace('canonical_source_id text NOT NULL UNIQUE', 'canonical_source_id text'));
  assert(withoutCanonicalIdentity.errors.includes('POSTGRES_CONTROL_MISSING:canonical_source_id text NOT NULL UNIQUE'));
  const withoutRightsHistoryFence = inspectPostgresSchema(sql.replace('source_rights_decisions_append_only', 'source_rights_decisions_mutable'));
  assert(withoutRightsHistoryFence.errors.includes('POSTGRES_CONTROL_MISSING:source_rights_decisions_append_only'));
});

test('PostgreSQL source control snapshots fail closed when lawful current-SOLD is zero', () => {
  const sql = postgresSql();
  const mutated = inspectPostgresSchema(sql.replace(
    'CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)',
    'CHECK (activation_backlog_count >= 0)'
  ));
  assert(mutated.errors.includes('POSTGRES_CONTROL_MISSING:CHECK (rights_clear_collector_current_sold_count > 0 OR activation_backlog_count = 0)'));
});

test('PostgreSQL observability and projector receipts are immutable', () => {
  const sql = postgresSql();
  const mutableObservability = inspectPostgresSchema(sql.replace('observability_events_append_only', 'observability_events_mutable'));
  assert(mutableObservability.errors.includes('POSTGRES_CONTROL_MISSING:observability_events_append_only'));
  const mutableReceipts = inspectPostgresSchema(sql.replace('outbox_delivery_receipts_append_only', 'outbox_delivery_receipts_mutable'));
  assert(mutableReceipts.errors.includes('POSTGRES_CONTROL_MISSING:outbox_delivery_receipts_append_only'));
});

test('PostgreSQL writer identity is bound to a least-privilege database role', () => {
  const sql = postgresSql();
  const spoofable = inspectPostgresSchema(sql.replace('p.database_role = current_user', 'p.database_role IS NOT NULL'));
  assert(spoofable.errors.includes('POSTGRES_CONTROL_MISSING:p.database_role = current_user'));
  const missingProjector = inspectPostgresSchema(sql.replace("('kpmo-d1-projector-v1', 'kidults_control_projector'", "('removed-projector', 'removed-role'"));
  assert(missingProjector.errors.includes("POSTGRES_CONTROL_MISSING:('kpmo-d1-projector-v1', 'kidults_control_projector'"));
});

test('PostgreSQL migrations are ordered, transactional and include the workflow receipt ledger', () => {
  const loaded = loadOrderedPostgresMigrations(postgresMigrations);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.files, [
    '0001_system_of_record.sql', '0002_workflow_run_receipts.sql',
    '0003_autonomous_task_ledger.sql', '0004_autonomous_admission_proofs.sql',
    '0005_autonomous_task_transition_pair.sql',
    '0006_autonomous_supervisor_invocation_admission.sql',
    '0007_cryptographic_approval_consumption.sql',
    '0008_approval_trust_root_lifecycle.sql',
    '0009_approval_trust_registry_snapshots.sql',
    '0010_approval_trust_current_heads.sql',
    '0011_autonomous_containment_fence_events.sql',
    '0012_protected_launch_manifest_consumptions.sql'
  ]);
  const missingReceiptTable = inspectPostgresSchema(loaded.sql.replace(
    'CREATE TABLE kidults_control.workflow_run_receipts',
    'CREATE TABLE kidults_control.workflow_receipts_removed'
  ));
  assert(missingReceiptTable.errors.includes('POSTGRES_CANONICAL_TABLE_MISSING:workflow_run_receipts'));
});

test('workflow receipt ledger requires least privilege, immutable rows and replay identity', () => {
  const sql = postgresSql();
  const mutable = inspectPostgresSchema(sql.replace(
    'workflow_run_receipts_append_only',
    'workflow_run_receipts_mutable'
  ));
  assert(mutable.errors.includes('POSTGRES_CONTROL_MISSING:workflow_run_receipts_append_only'));
  const replayable = inspectPostgresSchema(sql.replace(
    'UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type)',
    'UNIQUE (workflow_receipt_id)'
  ));
  assert(replayable.errors.includes('POSTGRES_CONTROL_MISSING:UNIQUE (repository, workflow_run_id, workflow_run_attempt, receipt_type)'));
  const excessiveGrant = inspectPostgresSchema(sql.replace(
    'GRANT SELECT, INSERT ON kidults_control.workflow_run_receipts',
    'GRANT SELECT, INSERT, UPDATE ON kidults_control.workflow_run_receipts'
  ));
  assert(excessiveGrant.errors.includes('POSTGRES_WORKFLOW_LEDGER_MUTATION_GRANT_PROHIBITED:workflow_run_receipts'));
  const excessiveClaimGrant = inspectPostgresSchema(sql.replace(
    'GRANT SELECT, INSERT ON kidults_control.workflow_canonical_run_claims',
    'GRANT SELECT, INSERT, DELETE ON kidults_control.workflow_canonical_run_claims'
  ));
  assert(excessiveClaimGrant.errors.includes('POSTGRES_WORKFLOW_LEDGER_MUTATION_GRANT_PROHIBITED:workflow_canonical_run_claims'));
  const truncatable = inspectPostgresSchema(sql.replace(
    'workflow_canonical_run_aliases_truncate_denied',
    'workflow_canonical_run_aliases_truncate_allowed'
  ));
  assert(truncatable.errors.includes('POSTGRES_CONTROL_MISSING:workflow_canonical_run_aliases_truncate_denied'));
});

test('autonomous task ledger binds JSON bodies, revisions and protected gates in PostgreSQL', () => {
  const sql = postgresSql();
  const mutable = inspectPostgresSchema(sql.replace(
    'autonomous_task_transitions_append_only', 'autonomous_task_transitions_mutable'
  ));
  assert(mutable.errors.includes('POSTGRES_CONTROL_MISSING:autonomous_task_transitions_append_only'));
  const unboundTask = inspectPostgresSchema(sql.replace(
    "CHECK (task_json->>'taskId' = task_id)", "CHECK (task_id IS NOT NULL)"
  ));
  assert(unboundTask.errors.includes("POSTGRES_CONTROL_MISSING:CHECK (task_json->>'taskId' = task_id)"));
  const productionEnabled = inspectPostgresSchema(sql.replace(
    "CHECK (receipt_json->>'production' = 'HOLD')", "CHECK (receipt_json->>'production' IS NOT NULL)"
  ));
  assert(productionEnabled.errors.includes("POSTGRES_CONTROL_MISSING:CHECK (receipt_json->>'production' = 'HOLD')"));
  const excessiveGrant = inspectPostgresSchema(sql.replace(
    'GRANT SELECT, INSERT ON kidults_control.autonomous_task_snapshots',
    'GRANT SELECT, INSERT, UPDATE ON kidults_control.autonomous_task_snapshots'
  ));
  assert(excessiveGrant.errors.includes(
    'POSTGRES_AUTONOMOUS_TASK_LEDGER_MUTATION_GRANT_PROHIBITED:autonomous_task_snapshots'
  ));
  const orphanable = inspectPostgresSchema(sql.replaceAll(
    'autonomous_task_snapshot_transition_pair', 'autonomous_task_snapshot_transition_unpaired'
  ));
  assert(orphanable.errors.includes('POSTGRES_CONTROL_MISSING:autonomous_task_snapshot_transition_pair'));
  const immediateOnly = inspectPostgresSchema(sql.replace(
    'DEFERRABLE INITIALLY DEFERRED', 'NOT DEFERRABLE'
  ));
  assert(immediateOnly.errors.includes('POSTGRES_CONTROL_MISSING:DEFERRABLE INITIALLY DEFERRED'));
});

test('workflow receipt ledger requires database-enforced exact leader and alias relations', () => {
  const sql = postgresSql();
  for (const control of [
    'enforce_workflow_receipt_canonical_relation',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_LEADER_BINDING_INVALID',
    'KIDULTS_WORKFLOW_RECEIPT_CANONICAL_ALIAS_BINDING_INVALID',
    'c.canonical_claim_id = NEW.canonical_claim_id',
    'c.repository = NEW.repository',
    'c.leader_workflow_run_id = NEW.workflow_run_id',
    'c.leader_claim_binding_digest = NEW.canonical_binding_digest',
    'c.canonical_claim_id = a.canonical_claim_id',
    'a.canonical_claim_id = NEW.canonical_claim_id',
    'a.repository = NEW.repository',
    'a.alias_workflow_run_id = NEW.workflow_run_id',
    'a.alias_binding_digest = NEW.canonical_binding_digest',
    'workflow_run_receipts_writer_relation_guard',
  ]) {
    const weakened = inspectPostgresSchema(sql.replaceAll(control, 'REMOVED_RELATION_CONTROL'));
    assert(weakened.errors.includes(`POSTGRES_CONTROL_MISSING:${control}`), control);
  }
});

test('workflow receipt runtime requires fail-closed validation, idempotency and HOLD truth', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'src/workflow-receipt-ledger.mjs'), 'utf8');
  assert.deepEqual(inspectWorkflowReceiptRuntime(source).errors, []);
  const withoutReplayConflict = inspectWorkflowReceiptRuntime(source.replaceAll(
    'WORKFLOW_RECEIPT_REPLAY_CONFLICT',
    'WORKFLOW_RECEIPT_REPLAY_ACCEPTED'
  ));
  assert(withoutReplayConflict.errors.some((error) => error.includes('WORKFLOW_RECEIPT_REPLAY_CONFLICT')));
  const withoutRelationVerification = inspectWorkflowReceiptRuntime(source.replaceAll(
    'verifyCanonicalRelationBinding',
    'acceptCanonicalRelationWithoutVerification'
  ));
  assert(withoutRelationVerification.errors.some((error) => error.includes('verifyCanonicalRelationBinding')));
  const withoutAliasParentJoin = inspectWorkflowReceiptRuntime(source.replace(
    'JOIN kidults_control.workflow_canonical_run_claims c',
    'JOIN kidults_control.workflow_canonical_run_claims_removed c'
  ));
  assert(withoutAliasParentJoin.errors.some((error) => error.includes('JOIN kidults_control.workflow_canonical_run_claims c')));
  const updatePrivilegeLock = inspectWorkflowReceiptRuntime(`${source}\nSELECT 1 FOR SHARE;`);
  assert(updatePrivilegeLock.errors.includes('WORKFLOW_RECEIPT_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE'));
});

test('runtime registration ledger admission reuses the single writer and cannot self-activate', () => {
  const source = fs.readFileSync(path.join(serviceRoot,
    'scripts/runtime-registration-ledger-admission-v1.mjs'), 'utf8');
  assert.deepEqual(inspectRuntimeRegistrationLedgerAdmission(source).errors, []);
  assert(inspectRuntimeRegistrationLedgerAdmission(source.replace(
    'governedCanaryEligible: false', 'governedCanaryEligible: true')).errors.some(
    error => error.startsWith('RUNTIME_REGISTRATION_LEDGER_ADMISSION_CONTROL_MISSING:')));
  assert(inspectRuntimeRegistrationLedgerAdmission(`${source}\nnew Pool();`).errors.some(
    error => error.startsWith('RUNTIME_REGISTRATION_LEDGER_ADMISSION_BOUNDARY_VIOLATION:')));
});

test('workflow receipt contract and operator docs preserve exact-relation and activation HOLD truth', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/control-plane-v1.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(serviceRoot, 'README.md'), 'utf8');
  const runbook = fs.readFileSync(path.join(serviceRoot, 'ACTIVATION_RUNBOOK.md'), 'utf8');
  assert.deepEqual(inspectWorkflowReceiptRelationTruth(contract, readme, runbook).errors, []);

  const overprivileged = structuredClone(contract);
  overprivileged.workflow_receipt_ledger.database_privileges.push('UPDATE');
  assert(inspectWorkflowReceiptRelationTruth(overprivileged, readme, runbook).errors.includes(
    'WORKFLOW_RECEIPT_DATABASE_PRIVILEGES_NOT_SELECT_INSERT_ONLY'
  ));

  const weakened = structuredClone(contract);
  weakened.workflow_receipt_ledger.canonical_relation_binding.alias_match = ['canonical_claim_id'];
  assert(inspectWorkflowReceiptRelationTruth(weakened, readme, runbook).errors.includes(
    'WORKFLOW_RECEIPT_CANONICAL_ALIAS_MATCH_INCOMPLETE'
  ));

  assert(inspectWorkflowReceiptRelationTruth(
    contract,
    readme.replace('exact alias row and parent claim', 'unchecked alias relation'),
    runbook
  ).errors.some(error => error.startsWith('WORKFLOW_RECEIPT_README_TRUTH_MISSING:')));
  assert(inspectWorkflowReceiptRelationTruth(
    contract,
    readme,
    runbook.replace('remote receipt finalization remains `HOLD`', 'remote finalization is active')
  ).errors.some(error => error.startsWith('WORKFLOW_RECEIPT_RUNBOOK_TRUTH_MISSING:')));
});

test('canonical claim runtime requires trusted classification, explicit CAS and divergence HOLD', () => {
  const source = fs.readFileSync(path.join(serviceRoot, 'src/workflow-canonical-run-claims.mjs'), 'utf8');
  assert.deepEqual(inspectCanonicalClaimRuntime(source).errors, []);
  const unsafe = inspectCanonicalClaimRuntime(source.replace(
    'ON CONFLICT ON CONSTRAINT workflow_canonical_run_claims_key DO NOTHING',
    'ON CONFLICT DO NOTHING'
  ));
  assert(unsafe.errors.some((error) => error.includes('workflow_canonical_run_claims_key')));
  const updatePrivilegeLock = inspectCanonicalClaimRuntime(`${source}\nSELECT 1 FOR UPDATE;`);
  assert(updatePrivilegeLock.errors.includes('CANONICAL_CLAIM_RUNTIME_ROW_LOCK_REQUIRES_PROHIBITED_UPDATE_PRIVILEGE'));
});
