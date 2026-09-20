import {
  digestObject, requireDigest, requireExactRecord, requireIdentifier, requireInstant,
  requireValue, snapshotJson, verifySelfDigest,
} from '../common-control/canonical-v1.mjs';
import {
  verifyAndConsumeCurrentApprovalTrust, verifyCurrentApprovalEvidence,
} from '../common-control/approval-trust-runtime-v1.mjs';
import {
  verifyAutonomousPostgresEvidenceReceipt,
} from '../common-control/autonomous-postgres-evidence-receipt-v1.mjs';
import {
  runAdmittedShadowSupervisor, validateSupervisorInvocationConsumption,
  validateSupervisorInvocationDecision,
  validateSupervisorInvocationRequest, verifySupervisorInvocationExecutionReceipt,
} from './invocation-admission-v1.mjs';
import { verifyAutonomousControlTickReceipt } from './control-tick-v1.mjs';
import { verifyShadowSupervisorReceipt } from './shadow-supervisor-v1.mjs';
import { verifySingleCycleReceipt } from './task-runner-v1.mjs';
import { verifySyntheticExecutionReceipt } from './task-worker-v1.mjs';
import {
  persistAutonomousContainmentFenceInTransaction, resolveCurrentAutonomousContainmentFence,
} from './containment-fence-store-v1.mjs';
import { withAutonomousPostgresRuntime } from './postgres-runtime-client-v1.mjs';
import { consumeProtectedLaunchManifest } from './protected-launch-manifest-store-v1.mjs';

const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'commandId', 'requestId', 'requestDigest',
  'decisionDigest', 'authorityVerificationReceiptDigest',
  'authorityConsumptionReceiptDigest', 'invocationConsumptionReceiptDigest',
  'executionReceiptDigest', 'supervisorReceiptDigest', 'completedAt',
  'externalEgress', 'credentialResolution', 'remoteWorkerActivation',
  'production', 'publicRelease', 'g5', 'launcherId', 'receiptDigest',
]);
const EVIDENCE_KEYS = Object.freeze([
  'state', 'requestDigest', 'launcherReceiptDigest', 'supervisorReceiptDigest',
  'supervisorState', 'lastTickState', 'tickCount', 'executedTaskCount',
  'recoveryCount', 'quarantineCount', 'production', 'publicRelease', 'g5',
]);
const STATUS_KEYS = Object.freeze([
  'state', 'health', 'supervisorState', 'lastTickState', 'tickCount',
  'executedTaskCount', 'recoveryCount', 'quarantineCount', 'sourceEvidenceDigest',
  'authoritative', 'activationAuthority', 'automaticTrigger',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5',
]);
const OBSERVATION_KEYS = Object.freeze([
  'id', 'state', 'supervisorState', 'lastTickState', 'tickCount',
  'executedTaskCount', 'recoveryCount', 'quarantineCount', 'sourceEvidenceDigest',
  'surface', 'action', 'authoritative', 'activationAuthority', 'mutationAllowed',
  'production', 'publicRelease', 'g5',
]);
const CONTAINMENT_RECOMMENDATION_KEYS = Object.freeze([
  'state', 'recommendation', 'reason', 'sourceObservationId', 'sourceEvidenceDigest',
  'automaticActionTaken', 'authoritative', 'activationAuthority', 'mutationAllowed',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5',
]);
const CONTAINMENT_ACTION_PACKAGE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'action', 'reason', 'sourceObservationId',
  'sourceEvidenceDigest', 'recommendationDigest', 'authorityClass', 'subjectType',
  'subjectId', 'subjectDigest', 'requestedCapabilities', 'automaticActionTaken',
  'mutationAllowed', 'production', 'publicRelease', 'g5', 'packageDigest',
]);
const CONTAINMENT_CAPABILITY_KEYS = Object.freeze([
  'providerContact', 'spend', 'externalEgress', 'credentialAccess',
  'production', 'publicRelease', 'g5',
]);
const CONTAINMENT_APPROVAL_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'action', 'actionPackageDigest',
  'recommendationDigest', 'authorityVerificationReceiptDigest',
  'authorityConsumptionReceiptDigest', 'consumedAt', 'automaticActionTaken',
  'activationAuthorized', 'mutationAllowed', 'production', 'publicRelease', 'g5',
  'receiptDigest',
]);
const CONTAINMENT_RELEASE_PACKAGE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'action', 'reason', 'previousFenceDigest',
  'authorityClass', 'subjectType', 'subjectId', 'subjectDigest', 'requestedCapabilities',
  'automaticActionTaken', 'mutationAllowed', 'production', 'publicRelease', 'g5',
  'packageDigest',
]);
const CONTAINMENT_RELEASE_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'action', 'previousFenceDigest',
  'releasePackageDigest', 'authorityVerificationReceiptDigest',
  'authorityConsumptionReceiptDigest', 'consumedAt', 'automaticActionTaken',
  'activationAuthorized', 'mutationAllowed', 'production', 'publicRelease', 'g5',
  'receiptDigest',
]);
const CONTAINMENT_FENCE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'action', 'sourceEvidenceDigest',
  'actionPackageDigest', 'approvalReceiptDigest', 'previousFenceDigest', 'allowInvocation',
  'automaticActionTaken', 'mutationAllowed', 'production', 'publicRelease', 'g5',
  'fenceDigest',
]);
const TRIGGER_READINESS_KEYS = Object.freeze([
  'postgresEvidenceReceipt', 'expectedPostgresSourceSha', 'expectedPostgresMigrationDigest',
  'credentialInjectionEvidence', 'assessedAt', 'production', 'publicRelease', 'g5',
]);
const TRIGGER_READINESS_REQUIREMENTS = Object.freeze([
  ['currentTrustHead', 'CURRENT_TRUST_HEAD_VERIFIED'],
  ['remotePostgresql', 'REMOTE_POSTGRESQL_VERIFIED'],
  ['invocationConcurrency', 'SINGLE_USE_CONCURRENCY_VERIFIED'],
  ['protectedLauncher', 'PROTECTED_LAUNCHER_VERIFIED'],
  ['durableNonceStore', 'DURABLE_NONCE_STORE_VERIFIED'],
  ['credentialInjection', 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED'],
  ['containmentRecovery', 'CONTAINMENT_RECOVERY_VERIFIED'],
]);
const TRIGGER_READINESS_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'blockers', 'assessedAt', 'automaticTrigger',
  'activationAuthorized', 'remoteWorkerActivation', 'production', 'publicRelease',
  'g5', 'readinessDigest',
]);
const RUNTIME_EVIDENCE_BUNDLE_INPUT_KEYS = Object.freeze([
  'postgresEvidenceReceipt', 'credentialInjectionEvidence', 'expectedSourceSha',
  'expectedMigrationDigest', 'assembledAt', 'production', 'publicRelease', 'g5',
]);
const RUNTIME_EVIDENCE_BUNDLE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'postgresEvidenceReceipt',
  'credentialInjectionEvidence', 'sourceSha', 'migrationDigest', 'assembledAt',
  'providerIntegration', 'automaticTrigger', 'activationAuthorized',
  'production', 'publicRelease', 'g5', 'bundleDigest',
]);
const SHADOW_TRIGGER_DRY_RUN_INPUT_KEYS = Object.freeze([
  'evidenceBundle', 'assessedAt', 'production', 'publicRelease', 'g5',
]);
const SHADOW_TRIGGER_DRY_RUN_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'evidenceBundleDigest', 'readinessDigest',
  'assessedAt', 'automaticTrigger', 'activationAuthorized', 'externalMutation',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5', 'receiptDigest',
]);
const SHADOW_SOAK_INPUT_KEYS = Object.freeze([
  'dryRunReceipts', 'evaluatedAt', 'production', 'publicRelease', 'g5',
]);
const SHADOW_SOAK_VERDICT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sampleCount', 'evidenceBundleDigest',
  'firstAssessedAt', 'lastAssessedAt', 'evaluatedAt', 'containmentRecoveryVerified',
  'automaticTrigger', 'activationAuthorized', 'externalMutation',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5', 'verdictDigest',
]);
const TRIGGER_REGISTRATION_PACKAGE_INPUT_KEYS = Object.freeze([
  'evidenceBundle', 'soakVerdict', 'workflowPath', 'schedule', 'createdAt',
  'production', 'publicRelease', 'g5',
]);
const TRIGGER_REGISTRATION_PACKAGE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sourceSha', 'evidenceBundleDigest',
  'soakVerdictDigest', 'workflowPath', 'triggerClass', 'schedule', 'createdAt',
  'registrationPerformed', 'automaticTrigger', 'activationAuthorized',
  'production', 'publicRelease', 'g5', 'packageDigest',
]);
const EXTERNAL_TRIGGER_REGISTRATION_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sourceSha', 'registrationPackageDigest',
  'workflowPath', 'triggerClass', 'schedule', 'registeredAt', 'registrar',
  'externalRegistrationVerified', 'automaticTrigger', 'activationAuthorized',
  'production', 'publicRelease', 'g5', 'receiptDigest',
]);
const ACTIVATION_GATE_INPUT_KEYS = Object.freeze([
  'registrationPackage', 'registrationReceipt', 'assessedAt',
  'production', 'publicRelease', 'g5',
]);
const ACTIVATION_GATE_RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'blockers', 'registrationPackageDigest',
  'registrationReceiptDigest', 'assessedAt', 'governedCanaryEligible',
  'activationAuthorized', 'remoteWorkerActivation', 'production',
  'publicRelease', 'g5', 'gateDigest',
]);
const PROTECTED_LAUNCH_MANIFEST_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sourceSha', 'trust', 'request', 'decision',
  'controlState', 'issuedAt', 'expiresAt', 'activationMode', 'automaticTrigger',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5', 'manifestDigest',
]);
const CREDENTIAL_INJECTION_EVIDENCE_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sourceSha', 'manifestDigest', 'requestId',
  'applicationName', 'resolutionCount', 'manifestVerifiedBeforeResolution',
  'credentialMaterialRetained', 'rawProviderErrorExposed', 'providerIntegration',
  'observedAt', 'production', 'publicRelease', 'g5', 'receiptDigest',
]);

function protectedGates(record) {
  requireValue(record.externalEgress === false && record.credentialResolution === false
    && record.remoteWorkerActivation === 'HOLD' && record.production === 'HOLD'
    && record.publicRelease === 'HOLD' && record.g5 === 'HOLD',
  'AUTONOMOUS_LAUNCHER_PROTECTED_GATE_INVALID');
}

export function verifyBoundedCredentialInjectionEvidence(input, options = {}) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, CREDENTIAL_INJECTION_EVIDENCE_KEYS,
    'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-bounded-credential-injection-evidence-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'VERIFIED_BOUNDED_CREDENTIAL_INJECTION',
  'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(receipt.sourceSha)
    && (options.expectedSourceSha === undefined
      || receipt.sourceSha === options.expectedSourceSha),
  'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_SOURCE_INVALID');
  requireDigest(receipt.manifestDigest,
    'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_BINDING_INVALID');
  requireIdentifier(receipt.requestId,
    'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_BINDING_INVALID');
  requireInstant(receipt.observedAt, 'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_TIME_INVALID');
  requireValue(receipt.applicationName === 'kidults-autonomous-protected-launcher-v1'
    && receipt.resolutionCount === 1 && receipt.manifestVerifiedBeforeResolution === true
    && receipt.credentialMaterialRetained === false
    && receipt.rawProviderErrorExposed === false
    && receipt.providerIntegration === 'NOT_VERIFIED_HOLD'
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD'
    && receipt.g5 === 'HOLD',
  'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_BOUNDARY_INVALID');
  requireDigest(receipt.receiptDigest,
    'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest',
    'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_INTEGRITY_INVALID');
  return receipt;
}

export function assessAutonomousRuntimeTriggerReadiness(input) {
  const readiness = snapshotJson(input);
  requireExactRecord(readiness, TRIGGER_READINESS_KEYS,
    'AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID');
  requireInstant(readiness.assessedAt, 'AUTONOMOUS_TRIGGER_READINESS_TIME_INVALID');
  requireValue(readiness.production === 'HOLD' && readiness.publicRelease === 'HOLD'
    && readiness.g5 === 'HOLD', 'AUTONOMOUS_TRIGGER_READINESS_PROTECTED_GATE_INVALID');
  let currentTrustHead = 'NOT_VERIFIED';
  let remotePostgresql = 'NOT_VERIFIED';
  let invocationConcurrency = 'NOT_VERIFIED';
  let protectedLauncher = 'NOT_VERIFIED';
  let durableNonceStore = 'NOT_VERIFIED';
  let containmentRecovery = 'NOT_VERIFIED';
  let credentialInjection = 'NOT_VERIFIED';
  if (readiness.postgresEvidenceReceipt === null) {
    requireValue(readiness.expectedPostgresSourceSha === null
      && readiness.expectedPostgresMigrationDigest === null,
    'AUTONOMOUS_TRIGGER_READINESS_POSTGRES_EVIDENCE_EXPECTATION_INVALID');
  } else {
    const evidence = verifyAutonomousPostgresEvidenceReceipt(readiness.postgresEvidenceReceipt, {
      expectedSourceSha: readiness.expectedPostgresSourceSha,
      expectedMigrationDigest: readiness.expectedPostgresMigrationDigest,
    });
    requireValue(evidence.checks.protectedManifestLeastPrivilege === true
      && evidence.checks.protectedManifestTwoClientSingleWinner === true
      && evidence.checks.protectedManifestRestartReplayHeld === true
      && evidence.checks.protectedManifestAppendOnlyMutationDenied === true
      && evidence.checks.protectedManifestConsumptions === 1
      && evidence.runtimeRunnerDatabaseExecution === false,
    'AUTONOMOUS_TRIGGER_READINESS_DURABLE_NONCE_EVIDENCE_INVALID');
    requireValue(evidence.checks.trustRevocationWinsTwoClientRace === true
      && evidence.checks.trustConsumptionWinsTwoClientRace === true
      && evidence.checks.trustCurrentHeads === 4
      && evidence.checks.cryptographicApprovalConsumptions === 1,
    'AUTONOMOUS_TRIGGER_READINESS_CURRENT_TRUST_EVIDENCE_INVALID');
    requireValue(evidence.checks.invocationAdmissionLeastPrivilege === true
      && evidence.checks.twoClientCas === true && evidence.checks.snapshots === 2
      && evidence.checks.transitions === 1,
    'AUTONOMOUS_TRIGGER_READINESS_INVOCATION_CONCURRENCY_EVIDENCE_INVALID');
    requireValue(evidence.checks.containmentStopFenceBlocks === true
      && evidence.checks.containmentReleaseFenceAllows === true
      && evidence.checks.containmentReleaseChainEnforced === true
      && evidence.checks.containmentAppendOnlyMutationDenied === true
      && evidence.checks.containmentMonotonicEventOrder === true
      && evidence.checks.containmentFenceEvents === 2,
    'AUTONOMOUS_TRIGGER_READINESS_CONTAINMENT_RECOVERY_EVIDENCE_INVALID');
    currentTrustHead = 'CURRENT_TRUST_HEAD_VERIFIED';
    remotePostgresql = 'REMOTE_POSTGRESQL_VERIFIED';
    invocationConcurrency = 'SINGLE_USE_CONCURRENCY_VERIFIED';
    protectedLauncher = 'PROTECTED_LAUNCHER_VERIFIED';
    durableNonceStore = 'DURABLE_NONCE_STORE_VERIFIED';
    containmentRecovery = 'CONTAINMENT_RECOVERY_VERIFIED';
  }
  if (readiness.credentialInjectionEvidence !== null) {
    verifyBoundedCredentialInjectionEvidence(readiness.credentialInjectionEvidence, {
      expectedSourceSha: readiness.expectedPostgresSourceSha,
    });
    credentialInjection = 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED';
  }
  const normalized = { ...readiness, currentTrustHead, remotePostgresql, invocationConcurrency,
    protectedLauncher, durableNonceStore, containmentRecovery, credentialInjection };
  const blockers = TRIGGER_READINESS_REQUIREMENTS
    .filter(([key, expected]) => normalized[key] !== expected)
    .map(([key, expected]) => `${key}:${expected}`);
  const unsigned = {
    contractId: 'kidults-autonomous-runtime-trigger-readiness-v1', version: '1.0.0',
    state: blockers.length === 0 ? 'READY_FOR_TRIGGER_REGISTRATION'
      : 'TRIGGER_REGISTRATION_HOLD',
    blockers, assessedAt: readiness.assessedAt,
    automaticTrigger: 'NOT_REGISTERED_HOLD', activationAuthorized: false,
    remoteWorkerActivation: 'HOLD', production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousRuntimeTriggerReadiness({
    ...unsigned, readinessDigest: digestObject(unsigned),
  });
}

export function verifyAutonomousRuntimeTriggerReadiness(input) {
  const receipt = snapshotJson(input);
  const blockerOrder = TRIGGER_READINESS_REQUIREMENTS
    .map(([key, expected]) => `${key}:${expected}`);
  requireExactRecord(receipt, TRIGGER_READINESS_RECEIPT_KEYS,
    'AUTONOMOUS_TRIGGER_READINESS_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-runtime-trigger-readiness-v1'
    && receipt.version === '1.0.0', 'AUTONOMOUS_TRIGGER_READINESS_RECEIPT_CONTRACT_INVALID');
  requireValue(Array.isArray(receipt.blockers)
    && receipt.blockers.every((blocker, index) => blockerOrder.includes(blocker)
      && (index === 0 || blockerOrder.indexOf(receipt.blockers[index - 1])
        < blockerOrder.indexOf(blocker))), 'AUTONOMOUS_TRIGGER_READINESS_BLOCKERS_INVALID');
  requireValue(receipt.state === (receipt.blockers.length === 0
    ? 'READY_FOR_TRIGGER_REGISTRATION' : 'TRIGGER_REGISTRATION_HOLD'),
  'AUTONOMOUS_TRIGGER_READINESS_STATE_INVALID');
  requireInstant(receipt.assessedAt, 'AUTONOMOUS_TRIGGER_READINESS_TIME_INVALID');
  requireValue(receipt.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && receipt.activationAuthorized === false && receipt.remoteWorkerActivation === 'HOLD'
    && receipt.production === 'HOLD' && receipt.publicRelease === 'HOLD'
    && receipt.g5 === 'HOLD', 'AUTONOMOUS_TRIGGER_READINESS_AUTHORITY_INVALID');
  requireDigest(receipt.readinessDigest, 'AUTONOMOUS_TRIGGER_READINESS_DIGEST_INVALID');
  verifySelfDigest(receipt, 'readinessDigest', 'AUTONOMOUS_TRIGGER_READINESS_INTEGRITY_INVALID');
  return receipt;
}

export function verifyAutonomousRuntimeEvidenceBundle(input) {
  const bundle = snapshotJson(input);
  requireExactRecord(bundle, RUNTIME_EVIDENCE_BUNDLE_KEYS,
    'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_SHAPE_INVALID');
  requireValue(bundle.contractId === 'kidults-autonomous-runtime-evidence-bundle-v1'
    && bundle.version === '1.0.0' && bundle.state === 'VERIFIED_RUNTIME_EVIDENCE_BUNDLE',
  'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(bundle.sourceSha),
    'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_SOURCE_INVALID');
  requireDigest(bundle.migrationDigest,
    'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_MIGRATION_INVALID');
  requireInstant(bundle.assembledAt, 'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_TIME_INVALID');
  verifyAutonomousPostgresEvidenceReceipt(bundle.postgresEvidenceReceipt, {
    expectedSourceSha: bundle.sourceSha, expectedMigrationDigest: bundle.migrationDigest,
  });
  verifyBoundedCredentialInjectionEvidence(bundle.credentialInjectionEvidence, {
    expectedSourceSha: bundle.sourceSha,
  });
  requireValue(bundle.providerIntegration === 'NOT_VERIFIED_HOLD'
    && bundle.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && bundle.activationAuthorized === false && bundle.production === 'HOLD'
    && bundle.publicRelease === 'HOLD' && bundle.g5 === 'HOLD',
  'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_AUTHORITY_INVALID');
  requireDigest(bundle.bundleDigest, 'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_DIGEST_INVALID');
  verifySelfDigest(bundle, 'bundleDigest',
    'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_INTEGRITY_INVALID');
  return bundle;
}

export function assembleAutonomousRuntimeEvidenceBundle(input) {
  const evidence = snapshotJson(input);
  requireExactRecord(evidence, RUNTIME_EVIDENCE_BUNDLE_INPUT_KEYS,
    'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_INPUT_INVALID');
  requireValue(evidence.production === 'HOLD' && evidence.publicRelease === 'HOLD'
    && evidence.g5 === 'HOLD', 'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_AUTHORITY_INVALID');
  requireInstant(evidence.assembledAt, 'AUTONOMOUS_RUNTIME_EVIDENCE_BUNDLE_TIME_INVALID');
  const postgres = verifyAutonomousPostgresEvidenceReceipt(evidence.postgresEvidenceReceipt, {
    expectedSourceSha: evidence.expectedSourceSha,
    expectedMigrationDigest: evidence.expectedMigrationDigest,
  });
  const credential = verifyBoundedCredentialInjectionEvidence(
    evidence.credentialInjectionEvidence, { expectedSourceSha: postgres.exactSourceSha },
  );
  const unsigned = {
    contractId: 'kidults-autonomous-runtime-evidence-bundle-v1', version: '1.0.0',
    state: 'VERIFIED_RUNTIME_EVIDENCE_BUNDLE', postgresEvidenceReceipt: postgres,
    credentialInjectionEvidence: credential, sourceSha: postgres.exactSourceSha,
    migrationDigest: postgres.migrationDigest, assembledAt: evidence.assembledAt,
    providerIntegration: 'NOT_VERIFIED_HOLD', automaticTrigger: 'NOT_REGISTERED_HOLD',
    activationAuthorized: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousRuntimeEvidenceBundle({
    ...unsigned, bundleDigest: digestObject(unsigned),
  });
}

export function verifyAutonomousRuntimeShadowTriggerDryRun(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, SHADOW_TRIGGER_DRY_RUN_RECEIPT_KEYS,
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-shadow-trigger-dry-run-v1'
    && receipt.version === '1.0.0' && receipt.state === 'SHADOW_TRIGGER_DRY_RUN_READY',
  'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_CONTRACT_INVALID');
  requireDigest(receipt.evidenceBundleDigest,
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_BINDING_INVALID');
  requireDigest(receipt.readinessDigest,
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_BINDING_INVALID');
  requireInstant(receipt.assessedAt, 'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_TIME_INVALID');
  requireValue(receipt.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && receipt.activationAuthorized === false && receipt.externalMutation === false
    && receipt.remoteWorkerActivation === 'HOLD' && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_AUTHORITY_INVALID');
  requireDigest(receipt.receiptDigest, 'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest',
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_INTEGRITY_INVALID');
  return receipt;
}

export function runAutonomousRuntimeShadowTriggerDryRun(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, SHADOW_TRIGGER_DRY_RUN_INPUT_KEYS,
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_INPUT_INVALID');
  requireValue(request.production === 'HOLD' && request.publicRelease === 'HOLD'
    && request.g5 === 'HOLD', 'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_AUTHORITY_INVALID');
  const bundle = verifyAutonomousRuntimeEvidenceBundle(request.evidenceBundle);
  const readiness = assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: bundle.postgresEvidenceReceipt,
    expectedPostgresSourceSha: bundle.sourceSha,
    expectedPostgresMigrationDigest: bundle.migrationDigest,
    credentialInjectionEvidence: bundle.credentialInjectionEvidence,
    assessedAt: request.assessedAt, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  requireValue(readiness.state === 'READY_FOR_TRIGGER_REGISTRATION',
    'AUTONOMOUS_SHADOW_TRIGGER_DRY_RUN_NOT_READY');
  const unsigned = {
    contractId: 'kidults-autonomous-shadow-trigger-dry-run-v1', version: '1.0.0',
    state: 'SHADOW_TRIGGER_DRY_RUN_READY', evidenceBundleDigest: bundle.bundleDigest,
    readinessDigest: readiness.readinessDigest, assessedAt: readiness.assessedAt,
    automaticTrigger: 'NOT_REGISTERED_HOLD', activationAuthorized: false,
    externalMutation: false, remoteWorkerActivation: 'HOLD', production: 'HOLD',
    publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousRuntimeShadowTriggerDryRun({
    ...unsigned, receiptDigest: digestObject(unsigned),
  });
}

export function verifyAutonomousRuntimeShadowSoakVerdict(input) {
  const verdict = snapshotJson(input);
  requireExactRecord(verdict, SHADOW_SOAK_VERDICT_KEYS,
    'AUTONOMOUS_SHADOW_SOAK_VERDICT_SHAPE_INVALID');
  requireValue(verdict.contractId === 'kidults-autonomous-shadow-soak-verdict-v1'
    && verdict.version === '1.0.0'
    && verdict.state === 'SHADOW_SOAK_VERIFIED_REGISTRATION_HOLD',
  'AUTONOMOUS_SHADOW_SOAK_VERDICT_CONTRACT_INVALID');
  requireValue(Number.isSafeInteger(verdict.sampleCount) && verdict.sampleCount >= 3,
    'AUTONOMOUS_SHADOW_SOAK_SAMPLE_COUNT_INVALID');
  requireDigest(verdict.evidenceBundleDigest, 'AUTONOMOUS_SHADOW_SOAK_BINDING_INVALID');
  for (const instant of [verdict.firstAssessedAt, verdict.lastAssessedAt, verdict.evaluatedAt]) {
    requireInstant(instant, 'AUTONOMOUS_SHADOW_SOAK_TIME_INVALID');
  }
  requireValue(new Date(verdict.firstAssessedAt).getTime()
    < new Date(verdict.lastAssessedAt).getTime()
    && new Date(verdict.lastAssessedAt).getTime() <= new Date(verdict.evaluatedAt).getTime(),
  'AUTONOMOUS_SHADOW_SOAK_TIME_ORDER_INVALID');
  requireValue(verdict.containmentRecoveryVerified === true
    && verdict.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && verdict.activationAuthorized === false && verdict.externalMutation === false
    && verdict.remoteWorkerActivation === 'HOLD' && verdict.production === 'HOLD'
    && verdict.publicRelease === 'HOLD' && verdict.g5 === 'HOLD',
  'AUTONOMOUS_SHADOW_SOAK_AUTHORITY_INVALID');
  requireDigest(verdict.verdictDigest, 'AUTONOMOUS_SHADOW_SOAK_DIGEST_INVALID');
  verifySelfDigest(verdict, 'verdictDigest', 'AUTONOMOUS_SHADOW_SOAK_INTEGRITY_INVALID');
  return verdict;
}

export function evaluateAutonomousRuntimeShadowSoak(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, SHADOW_SOAK_INPUT_KEYS,
    'AUTONOMOUS_SHADOW_SOAK_INPUT_INVALID');
  requireValue(request.production === 'HOLD' && request.publicRelease === 'HOLD'
    && request.g5 === 'HOLD', 'AUTONOMOUS_SHADOW_SOAK_AUTHORITY_INVALID');
  requireInstant(request.evaluatedAt, 'AUTONOMOUS_SHADOW_SOAK_TIME_INVALID');
  requireValue(Array.isArray(request.dryRunReceipts) && request.dryRunReceipts.length >= 3,
    'AUTONOMOUS_SHADOW_SOAK_SAMPLE_COUNT_INVALID');
  const receipts = request.dryRunReceipts.map(verifyAutonomousRuntimeShadowTriggerDryRun);
  const evidenceBundleDigest = receipts[0].evidenceBundleDigest;
  requireValue(receipts.every(receipt => receipt.evidenceBundleDigest === evidenceBundleDigest),
    'AUTONOMOUS_SHADOW_SOAK_EVIDENCE_SUBSTITUTION');
  const times = receipts.map(receipt => new Date(receipt.assessedAt).getTime());
  requireValue(times.every((time, index) => index === 0 || times[index - 1] < time),
    'AUTONOMOUS_SHADOW_SOAK_TIME_ORDER_INVALID');
  const unsigned = {
    contractId: 'kidults-autonomous-shadow-soak-verdict-v1', version: '1.0.0',
    state: 'SHADOW_SOAK_VERIFIED_REGISTRATION_HOLD', sampleCount: receipts.length,
    evidenceBundleDigest, firstAssessedAt: receipts[0].assessedAt,
    lastAssessedAt: receipts.at(-1).assessedAt, evaluatedAt: request.evaluatedAt,
    containmentRecoveryVerified: true, automaticTrigger: 'NOT_REGISTERED_HOLD',
    activationAuthorized: false, externalMutation: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousRuntimeShadowSoakVerdict({
    ...unsigned, verdictDigest: digestObject(unsigned),
  });
}

export function verifyAutonomousTriggerRegistrationPackage(input) {
  const registration = snapshotJson(input);
  requireExactRecord(registration, TRIGGER_REGISTRATION_PACKAGE_KEYS,
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_SHAPE_INVALID');
  requireValue(registration.contractId === 'kidults-autonomous-trigger-registration-package-v1'
    && registration.version === '1.0.0'
    && registration.state === 'READY_FOR_EXTERNAL_REGISTRATION_REVIEW_HOLD',
  'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(registration.sourceSha),
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_SOURCE_INVALID');
  for (const digest of [registration.evidenceBundleDigest,
    registration.soakVerdictDigest, registration.packageDigest]) {
    requireDigest(digest, 'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_DIGEST_INVALID');
  }
  requireValue(registration.workflowPath
    === '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    && registration.triggerClass === 'SCHEDULE'
    && /^([0-5]?\d|\*) ([01]?\d|2[0-3]|\*) \* \* \*$/.test(registration.schedule),
  'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_TRIGGER_INVALID');
  requireInstant(registration.createdAt,
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_TIME_INVALID');
  requireValue(registration.registrationPerformed === false
    && registration.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && registration.activationAuthorized === false && registration.production === 'HOLD'
    && registration.publicRelease === 'HOLD' && registration.g5 === 'HOLD',
  'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_AUTHORITY_INVALID');
  verifySelfDigest(registration, 'packageDigest',
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_INTEGRITY_INVALID');
  return registration;
}

export function createAutonomousTriggerRegistrationPackage(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, TRIGGER_REGISTRATION_PACKAGE_INPUT_KEYS,
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_INPUT_INVALID');
  requireValue(request.production === 'HOLD' && request.publicRelease === 'HOLD'
    && request.g5 === 'HOLD', 'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_AUTHORITY_INVALID');
  const bundle = verifyAutonomousRuntimeEvidenceBundle(request.evidenceBundle);
  const soak = verifyAutonomousRuntimeShadowSoakVerdict(request.soakVerdict);
  requireValue(soak.evidenceBundleDigest === bundle.bundleDigest,
    'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_EVIDENCE_SUBSTITUTION');
  requireInstant(request.createdAt, 'AUTONOMOUS_TRIGGER_REGISTRATION_PACKAGE_TIME_INVALID');
  const unsigned = {
    contractId: 'kidults-autonomous-trigger-registration-package-v1', version: '1.0.0',
    state: 'READY_FOR_EXTERNAL_REGISTRATION_REVIEW_HOLD', sourceSha: bundle.sourceSha,
    evidenceBundleDigest: bundle.bundleDigest, soakVerdictDigest: soak.verdictDigest,
    workflowPath: request.workflowPath, triggerClass: 'SCHEDULE', schedule: request.schedule,
    createdAt: request.createdAt, registrationPerformed: false,
    automaticTrigger: 'NOT_REGISTERED_HOLD', activationAuthorized: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousTriggerRegistrationPackage({
    ...unsigned, packageDigest: digestObject(unsigned),
  });
}

export function verifyExternalAutonomousTriggerRegistrationReceipt(input, options = {}) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, EXTERNAL_TRIGGER_REGISTRATION_RECEIPT_KEYS,
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-external-trigger-registration-receipt-v1'
    && receipt.version === '1.0.0' && receipt.state === 'EXTERNAL_REGISTRATION_VERIFIED',
  'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(receipt.sourceSha)
    && (options.expectedSourceSha === undefined
      || receipt.sourceSha === options.expectedSourceSha),
  'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_SOURCE_INVALID');
  requireDigest(receipt.registrationPackageDigest,
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_BINDING_INVALID');
  requireValue(options.expectedPackageDigest === undefined
    || receipt.registrationPackageDigest === options.expectedPackageDigest,
  'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_BINDING_INVALID');
  requireValue(receipt.workflowPath
    === '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    && receipt.triggerClass === 'SCHEDULE'
    && /^([0-5]?\d|\*) ([01]?\d|2[0-3]|\*) \* \* \*$/.test(receipt.schedule),
  'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_TRIGGER_INVALID');
  requireInstant(receipt.registeredAt,
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_TIME_INVALID');
  requireIdentifier(receipt.registrar,
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_REGISTRAR_INVALID');
  requireValue(receipt.externalRegistrationVerified === true
    && receipt.automaticTrigger === 'REGISTERED_PROTECTED_HOLD'
    && receipt.activationAuthorized === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_AUTHORITY_INVALID');
  requireDigest(receipt.receiptDigest,
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_DIGEST_INVALID');
  verifySelfDigest(receipt, 'receiptDigest',
    'EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_INTEGRITY_INVALID');
  return receipt;
}

export function verifyAutonomousRuntimeActivationGate(input) {
  const gate = snapshotJson(input);
  requireExactRecord(gate, ACTIVATION_GATE_RECEIPT_KEYS,
    'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_SHAPE_INVALID');
  requireValue(gate.contractId === 'kidults-autonomous-runtime-activation-gate-v1'
    && gate.version === '1.0.0', 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_CONTRACT_INVALID');
  requireValue(Array.isArray(gate.blockers)
    && gate.blockers.every(value => value === 'EXTERNAL_TRIGGER_REGISTRATION_REQUIRED')
    && gate.blockers.length <= 1,
  'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_BLOCKERS_INVALID');
  requireValue(gate.state === (gate.blockers.length === 0
    ? 'ELIGIBLE_FOR_GOVERNED_CANARY' : 'ACTIVATION_HOLD')
    && gate.governedCanaryEligible === (gate.blockers.length === 0),
  'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_STATE_INVALID');
  requireDigest(gate.registrationPackageDigest,
    'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_BINDING_INVALID');
  requireValue(gate.registrationReceiptDigest === null
    || /^sha256:[0-9a-f]{64}$/.test(gate.registrationReceiptDigest),
  'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_BINDING_INVALID');
  requireInstant(gate.assessedAt, 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_TIME_INVALID');
  requireValue(gate.activationAuthorized === false && gate.remoteWorkerActivation === 'HOLD'
    && gate.production === 'HOLD' && gate.publicRelease === 'HOLD' && gate.g5 === 'HOLD',
  'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_AUTHORITY_INVALID');
  requireDigest(gate.gateDigest, 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_DIGEST_INVALID');
  verifySelfDigest(gate, 'gateDigest', 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_INTEGRITY_INVALID');
  return gate;
}

export function assessAutonomousRuntimeActivationGate(input) {
  const request = snapshotJson(input);
  requireExactRecord(request, ACTIVATION_GATE_INPUT_KEYS,
    'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_INPUT_INVALID');
  requireValue(request.production === 'HOLD' && request.publicRelease === 'HOLD'
    && request.g5 === 'HOLD', 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_AUTHORITY_INVALID');
  const registration = verifyAutonomousTriggerRegistrationPackage(request.registrationPackage);
  requireInstant(request.assessedAt, 'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_TIME_INVALID');
  let receipt = null;
  if (request.registrationReceipt !== null) {
    receipt = verifyExternalAutonomousTriggerRegistrationReceipt(request.registrationReceipt, {
      expectedSourceSha: registration.sourceSha,
      expectedPackageDigest: registration.packageDigest,
    });
    requireValue(receipt.workflowPath === registration.workflowPath
      && receipt.schedule === registration.schedule,
    'AUTONOMOUS_RUNTIME_ACTIVATION_GATE_BINDING_INVALID');
  }
  const blockers = receipt === null ? ['EXTERNAL_TRIGGER_REGISTRATION_REQUIRED'] : [];
  const unsigned = {
    contractId: 'kidults-autonomous-runtime-activation-gate-v1', version: '1.0.0',
    state: blockers.length === 0 ? 'ELIGIBLE_FOR_GOVERNED_CANARY' : 'ACTIVATION_HOLD',
    blockers, registrationPackageDigest: registration.packageDigest,
    registrationReceiptDigest: receipt?.receiptDigest ?? null, assessedAt: request.assessedAt,
    governedCanaryEligible: blockers.length === 0, activationAuthorized: false,
    remoteWorkerActivation: 'HOLD', production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousRuntimeActivationGate({ ...unsigned, gateDigest: digestObject(unsigned) });
}

function launcherReceipt(request, decision, authority, execution) {
  const verifiedAuthority = verifyCurrentApprovalEvidence({
    verificationReceipt: authority.verificationReceipt,
    consumptionReceipt: authority.consumptionReceipt,
  });
  const verifiedExecution = verifySupervisorInvocationExecutionReceipt(execution.executionReceipt);
  const unsigned = {
    contractId: 'kidults-autonomous-launcher-receipt-v1', version: '1.0.0',
    state: 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED',
    commandId: request.commandId, requestId: request.requestId,
    requestDigest: request.requestDigest, decisionDigest: decision.decisionDigest,
    authorityVerificationReceiptDigest: verifiedAuthority.verificationReceipt.receiptDigest,
    authorityConsumptionReceiptDigest: verifiedAuthority.consumptionReceipt.receiptDigest,
    invocationConsumptionReceiptDigest: execution.admissionReceipt.receiptDigest,
    executionReceiptDigest: verifiedExecution.receiptDigest,
    supervisorReceiptDigest: verifiedExecution.supervisorReceiptDigest,
    completedAt: verifiedExecution.completedAt, externalEgress: false,
    credentialResolution: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const launcherId = `autonomous-launcher:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, launcherId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function verifyAutonomousLauncherReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'AUTONOMOUS_LAUNCHER_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-launcher-receipt-v1'
    && receipt.version === '1.0.0'
    && receipt.state === 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED',
  'AUTONOMOUS_LAUNCHER_RECEIPT_CONTRACT_INVALID');
  requireIdentifier(receipt.commandId, 'AUTONOMOUS_LAUNCHER_COMMAND_INVALID');
  requireIdentifier(receipt.requestId, 'AUTONOMOUS_LAUNCHER_REQUEST_INVALID');
  requireIdentifier(receipt.launcherId, 'AUTONOMOUS_LAUNCHER_ID_INVALID');
  for (const value of [receipt.requestDigest, receipt.decisionDigest,
    receipt.authorityVerificationReceiptDigest, receipt.authorityConsumptionReceiptDigest,
    receipt.invocationConsumptionReceiptDigest, receipt.executionReceiptDigest,
    receipt.supervisorReceiptDigest, receipt.receiptDigest]) {
    requireDigest(value, 'AUTONOMOUS_LAUNCHER_DIGEST_INVALID');
  }
  requireInstant(receipt.completedAt, 'AUTONOMOUS_LAUNCHER_TIME_INVALID');
  protectedGates(receipt);
  verifySelfDigest(receipt, 'receiptDigest', 'AUTONOMOUS_LAUNCHER_RECEIPT_INTEGRITY_INVALID');
  const unsigned = Object.fromEntries(Object.entries(receipt)
    .filter(([key]) => key !== 'launcherId' && key !== 'receiptDigest'));
  requireValue(receipt.launcherId === `autonomous-launcher:${digestObject(unsigned).slice(7)}`,
    'AUTONOMOUS_LAUNCHER_RECEIPT_INTEGRITY_INVALID');
  return receipt;
}

export function verifyAutonomousOperationalEvidence({
  request: requestInput, decision: decisionInput, launcherReceipt: launcherInput,
  authorityVerificationReceipt, authorityConsumptionReceipt,
  invocationConsumptionReceipt, invocationExecutionReceipt, supervisor,
}) {
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = validateSupervisorInvocationDecision(decisionInput, request);
  const launcher = verifyAutonomousLauncherReceipt(launcherInput);
  const authority = verifyCurrentApprovalEvidence({
    verificationReceipt: authorityVerificationReceipt,
    consumptionReceipt: authorityConsumptionReceipt,
  });
  const invocation = validateSupervisorInvocationConsumption(
    invocationConsumptionReceipt, request, decision,
  );
  const execution = verifySupervisorInvocationExecutionReceipt(invocationExecutionReceipt);
  const supervisorReceipt = verifyShadowSupervisorReceipt(supervisor?.receipt);
  requireValue(Array.isArray(supervisor?.ticks), 'AUTONOMOUS_EVIDENCE_TICKS_INVALID');
  requireValue(supervisor.ticks.length === supervisorReceipt.tickCount,
    'AUTONOMOUS_EVIDENCE_TICK_COUNT_INVALID');

  requireValue(authority.verificationReceipt.subjectId === request.requestId
    && authority.verificationReceipt.subjectDigest === request.requestDigest
    && authority.consumptionReceipt.subjectId === request.requestId
    && authority.consumptionReceipt.subjectDigest === request.requestDigest
    && authority.consumptionReceipt.approvalVerificationReceiptDigest
      === authority.verificationReceipt.receiptDigest,
  'AUTONOMOUS_EVIDENCE_AUTHORITY_BINDING_INVALID');
  requireValue(execution.commandId === request.commandId
    && execution.requestDigest === request.requestDigest
    && execution.decisionDigest === decision.decisionDigest
    && execution.consumptionReceiptDigest === invocation.receiptDigest
    && execution.supervisorReceiptDigest === supervisorReceipt.receiptDigest,
  'AUTONOMOUS_EVIDENCE_INVOCATION_BINDING_INVALID');
  requireValue(launcher.requestId === request.requestId
    && launcher.requestDigest === request.requestDigest
    && launcher.decisionDigest === decision.decisionDigest
    && launcher.authorityVerificationReceiptDigest === authority.verificationReceipt.receiptDigest
    && launcher.authorityConsumptionReceiptDigest === authority.consumptionReceipt.receiptDigest
    && launcher.invocationConsumptionReceiptDigest === invocation.receiptDigest
    && launcher.executionReceiptDigest === execution.receiptDigest
    && launcher.supervisorReceiptDigest === supervisorReceipt.receiptDigest,
  'AUTONOMOUS_EVIDENCE_LAUNCHER_BINDING_INVALID');

  let executedTaskCount = 0;
  let recoveryCount = 0;
  supervisor.ticks.forEach((tick, index) => {
    const tickReceipt = verifyAutonomousControlTickReceipt(tick?.receipt);
    requireValue(tickReceipt.receiptDigest === supervisorReceipt.tickReceiptDigests[index]
      && tickReceipt.state === supervisorReceipt.tickStates[index],
    'AUTONOMOUS_EVIDENCE_SUPERVISOR_TICK_BINDING_INVALID');
    if (tickReceipt.recoveryReceiptDigest !== null) {
      requireDigest(tick?.recovery?.receipt?.receiptDigest,
        'AUTONOMOUS_EVIDENCE_RECOVERY_RECEIPT_INVALID');
      requireValue(tick.recovery.receipt.receiptDigest === tickReceipt.recoveryReceiptDigest,
        'AUTONOMOUS_EVIDENCE_RECOVERY_BINDING_INVALID');
      if (tickReceipt.state === 'RECOVERY_APPLIED') recoveryCount += 1;
    }
    if (tickReceipt.cycleReceiptDigest !== null) {
      const cycle = verifySingleCycleReceipt(tick?.cycle?.receipt);
      requireValue(cycle.receiptDigest === tickReceipt.cycleReceiptDigest
        && cycle.state === tickReceipt.cycleState && cycle.taskId === tickReceipt.cycleTaskId,
      'AUTONOMOUS_EVIDENCE_CYCLE_BINDING_INVALID');
      if (cycle.executionReceiptDigest !== null) {
        const taskExecution = verifySyntheticExecutionReceipt(tick?.cycle?.executionReceipt);
        requireValue(taskExecution.receiptDigest === cycle.executionReceiptDigest
          && taskExecution.taskId === cycle.taskId,
        'AUTONOMOUS_EVIDENCE_TASK_EXECUTION_BINDING_INVALID');
        executedTaskCount += 1;
      }
    }
  });
  requireValue(executedTaskCount === supervisorReceipt.executedCount
    && recoveryCount === supervisorReceipt.recoveryCount,
  'AUTONOMOUS_EVIDENCE_SUMMARY_BINDING_INVALID');

  return {
    state: 'VERIFIED_LOCAL_OPERATIONAL_EVIDENCE_CHAIN',
    requestDigest: request.requestDigest, launcherReceiptDigest: launcher.receiptDigest,
    supervisorReceiptDigest: supervisorReceipt.receiptDigest,
    supervisorState: supervisorReceipt.state, lastTickState: supervisorReceipt.lastTickState,
    tickCount: supervisorReceipt.tickCount, executedTaskCount, recoveryCount,
    quarantineCount: supervisorReceipt.quarantineCount,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

export function projectAutonomousOperationalStatus(input) {
  const evidence = snapshotJson(input);
  requireExactRecord(evidence, EVIDENCE_KEYS, 'AUTONOMOUS_STATUS_EVIDENCE_SHAPE_INVALID');
  requireValue(evidence.state === 'VERIFIED_LOCAL_OPERATIONAL_EVIDENCE_CHAIN',
    'AUTONOMOUS_STATUS_EVIDENCE_STATE_INVALID');
  for (const digest of [evidence.requestDigest, evidence.launcherReceiptDigest,
    evidence.supervisorReceiptDigest]) {
    requireDigest(digest, 'AUTONOMOUS_STATUS_EVIDENCE_DIGEST_INVALID');
  }
  for (const count of [evidence.tickCount, evidence.executedTaskCount,
    evidence.recoveryCount, evidence.quarantineCount]) {
    requireValue(Number.isSafeInteger(count) && count >= 0 && count <= evidence.tickCount,
      'AUTONOMOUS_STATUS_EVIDENCE_COUNT_INVALID');
  }
  requireValue(typeof evidence.supervisorState === 'string'
    && (evidence.lastTickState === null || typeof evidence.lastTickState === 'string'),
  'AUTONOMOUS_STATUS_EVIDENCE_RUNTIME_STATE_INVALID');
  requireValue(evidence.production === 'HOLD' && evidence.publicRelease === 'HOLD'
    && evidence.g5 === 'HOLD', 'AUTONOMOUS_STATUS_PROTECTED_GATE_INVALID');
  const health = evidence.supervisorState === 'FAIL_CLOSED_ERROR_STOP'
    ? 'FAIL_CLOSED' : evidence.quarantineCount > 0 ? 'QUARANTINED' : 'HEALTHY';
  return verifyAutonomousOperationalStatus({
    state: 'LOCAL_SYNTHETIC_OPERATIONAL_STATUS', health,
    supervisorState: evidence.supervisorState, lastTickState: evidence.lastTickState,
    tickCount: evidence.tickCount, executedTaskCount: evidence.executedTaskCount,
    recoveryCount: evidence.recoveryCount, quarantineCount: evidence.quarantineCount,
    sourceEvidenceDigest: evidence.launcherReceiptDigest,
    authoritative: false, activationAuthority: false,
    automaticTrigger: 'NOT_REGISTERED_HOLD', remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

export function verifyAutonomousOperationalStatus(input) {
  const status = snapshotJson(input);
  requireExactRecord(status, STATUS_KEYS, 'AUTONOMOUS_STATUS_SHAPE_INVALID');
  requireValue(status.state === 'LOCAL_SYNTHETIC_OPERATIONAL_STATUS'
    && new Set(['HEALTHY', 'QUARANTINED', 'FAIL_CLOSED']).has(status.health),
  'AUTONOMOUS_STATUS_STATE_INVALID');
  requireDigest(status.sourceEvidenceDigest, 'AUTONOMOUS_STATUS_SOURCE_DIGEST_INVALID');
  requireValue(typeof status.supervisorState === 'string'
    && (status.lastTickState === null || typeof status.lastTickState === 'string'),
  'AUTONOMOUS_STATUS_RUNTIME_STATE_INVALID');
  for (const count of [status.tickCount, status.executedTaskCount,
    status.recoveryCount, status.quarantineCount]) {
    requireValue(Number.isSafeInteger(count) && count >= 0 && count <= status.tickCount,
      'AUTONOMOUS_STATUS_COUNT_INVALID');
  }
  const expectedHealth = status.supervisorState === 'FAIL_CLOSED_ERROR_STOP'
    ? 'FAIL_CLOSED' : status.quarantineCount > 0 ? 'QUARANTINED' : 'HEALTHY';
  requireValue(status.health === expectedHealth, 'AUTONOMOUS_STATUS_HEALTH_BINDING_INVALID');
  requireValue(status.authoritative === false && status.activationAuthority === false
    && status.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && status.remoteWorkerActivation === 'HOLD' && status.production === 'HOLD'
    && status.publicRelease === 'HOLD' && status.g5 === 'HOLD',
  'AUTONOMOUS_STATUS_AUTHORITY_INVALID');
  return { ...status };
}

export function projectAutonomousControlTowerObservation(input) {
  const status = verifyAutonomousOperationalStatus(input);
  return {
    id: 'autonomous-control-local-synthetic', state: status.health,
    supervisorState: status.supervisorState, lastTickState: status.lastTickState,
    tickCount: status.tickCount, executedTaskCount: status.executedTaskCount,
    recoveryCount: status.recoveryCount, quarantineCount: status.quarantineCount,
    sourceEvidenceDigest: status.sourceEvidenceDigest,
    surface: 'CONTROL_TOWER_READ_ONLY_OBSERVATION', action: 'OBSERVE_ONLY',
    authoritative: false, activationAuthority: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

export function verifyAutonomousControlTowerObservation(input) {
  const observation = snapshotJson(input);
  requireExactRecord(observation, OBSERVATION_KEYS,
    'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_SHAPE_INVALID');
  requireIdentifier(observation.id, 'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_ID_INVALID');
  requireValue(new Set(['HEALTHY', 'QUARANTINED', 'FAIL_CLOSED']).has(observation.state),
    'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_STATE_INVALID');
  requireValue(typeof observation.supervisorState === 'string'
    && (observation.lastTickState === null || typeof observation.lastTickState === 'string'),
  'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_RUNTIME_STATE_INVALID');
  for (const count of [observation.tickCount, observation.executedTaskCount,
    observation.recoveryCount, observation.quarantineCount]) {
    requireValue(Number.isSafeInteger(count) && count >= 0 && count <= observation.tickCount,
      'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_COUNT_INVALID');
  }
  requireDigest(observation.sourceEvidenceDigest,
    'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_SOURCE_DIGEST_INVALID');
  const expectedState = observation.supervisorState === 'FAIL_CLOSED_ERROR_STOP'
    ? 'FAIL_CLOSED' : observation.quarantineCount > 0 ? 'QUARANTINED' : 'HEALTHY';
  requireValue(observation.state === expectedState,
    'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_STATE_BINDING_INVALID');
  requireValue(observation.surface === 'CONTROL_TOWER_READ_ONLY_OBSERVATION'
    && observation.action === 'OBSERVE_ONLY' && observation.authoritative === false
    && observation.activationAuthority === false && observation.mutationAllowed === false
    && observation.production === 'HOLD' && observation.publicRelease === 'HOLD'
    && observation.g5 === 'HOLD', 'AUTONOMOUS_CONTROL_TOWER_OBSERVATION_AUTHORITY_INVALID');
  return observation;
}

export function recommendAutonomousContainment(input) {
  const observation = verifyAutonomousControlTowerObservation(input);
  const recommendation = observation.state === 'FAIL_CLOSED'
    ? 'STOP' : observation.state === 'QUARANTINED' ? 'QUARANTINE' : 'CONTINUE';
  const reason = recommendation === 'STOP' ? 'FAIL_CLOSED_SUPERVISOR'
    : recommendation === 'QUARANTINE' ? 'QUARANTINED_OUTPUT_PRESENT' : 'VERIFIED_HEALTHY';
  return {
    state: 'LOCAL_SYNTHETIC_CONTAINMENT_RECOMMENDATION', recommendation, reason,
    sourceObservationId: observation.id,
    sourceEvidenceDigest: observation.sourceEvidenceDigest,
    automaticActionTaken: false, authoritative: false, activationAuthority: false,
    mutationAllowed: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

export function verifyAutonomousContainmentRecommendation(input) {
  const recommendation = snapshotJson(input);
  requireExactRecord(recommendation, CONTAINMENT_RECOMMENDATION_KEYS,
    'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_SHAPE_INVALID');
  requireValue(recommendation.state === 'LOCAL_SYNTHETIC_CONTAINMENT_RECOMMENDATION',
    'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_STATE_INVALID');
  const reasons = {
    CONTINUE: 'VERIFIED_HEALTHY', QUARANTINE: 'QUARANTINED_OUTPUT_PRESENT',
    STOP: 'FAIL_CLOSED_SUPERVISOR',
  };
  requireValue(reasons[recommendation.recommendation] === recommendation.reason,
    'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_BINDING_INVALID');
  requireIdentifier(recommendation.sourceObservationId,
    'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_SOURCE_INVALID');
  requireDigest(recommendation.sourceEvidenceDigest,
    'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_SOURCE_INVALID');
  requireValue(recommendation.automaticActionTaken === false
    && recommendation.authoritative === false && recommendation.activationAuthority === false
    && recommendation.mutationAllowed === false
    && recommendation.remoteWorkerActivation === 'HOLD'
    && recommendation.production === 'HOLD' && recommendation.publicRelease === 'HOLD'
    && recommendation.g5 === 'HOLD', 'AUTONOMOUS_CONTAINMENT_RECOMMENDATION_AUTHORITY_INVALID');
  return recommendation;
}

export function createAutonomousContainmentActionPackage(input) {
  const recommendation = verifyAutonomousContainmentRecommendation(input);
  if (recommendation.recommendation === 'CONTINUE') return null;
  const recommendationDigest = digestObject(recommendation);
  const subjectMaterial = {
    action: recommendation.recommendation, reason: recommendation.reason,
    sourceObservationId: recommendation.sourceObservationId,
    sourceEvidenceDigest: recommendation.sourceEvidenceDigest, recommendationDigest,
  };
  const subjectDigest = digestObject(subjectMaterial);
  const unsigned = {
    contractId: 'kidults-autonomous-containment-action-package-v1', version: '1.0.0',
    state: 'OPERATOR_APPROVAL_REQUIRED_NO_ACTION_TAKEN',
    ...subjectMaterial, authorityClass: 'PROTECTED_ACTION_PACKAGE',
    subjectType: 'PROTECTED_ACTION_PACKAGE',
    subjectId: `autonomous-containment:${subjectDigest.slice(7)}`, subjectDigest,
    requestedCapabilities: { providerContact: false, spend: false, externalEgress: false,
      credentialAccess: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' },
    automaticActionTaken: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousContainmentActionPackage({
    ...unsigned, packageDigest: digestObject(unsigned),
  }, recommendation);
}

export function verifyAutonomousContainmentActionPackage(input, recommendationInput) {
  const actionPackage = snapshotJson(input);
  const recommendation = verifyAutonomousContainmentRecommendation(recommendationInput);
  requireExactRecord(actionPackage, CONTAINMENT_ACTION_PACKAGE_KEYS,
    'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_SHAPE_INVALID');
  requireValue(actionPackage.contractId === 'kidults-autonomous-containment-action-package-v1'
    && actionPackage.version === '1.0.0'
    && actionPackage.state === 'OPERATOR_APPROVAL_REQUIRED_NO_ACTION_TAKEN'
    && new Set(['QUARANTINE', 'STOP']).has(actionPackage.action),
  'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_STATE_INVALID');
  requireValue((actionPackage.action === 'STOP'
    ? 'FAIL_CLOSED_SUPERVISOR' : 'QUARANTINED_OUTPUT_PRESENT') === actionPackage.reason,
  'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_BINDING_INVALID');
  requireIdentifier(actionPackage.sourceObservationId,
    'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_SOURCE_INVALID');
  for (const digest of [actionPackage.sourceEvidenceDigest, actionPackage.recommendationDigest,
    actionPackage.subjectDigest, actionPackage.packageDigest]) {
    requireDigest(digest, 'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_DIGEST_INVALID');
  }
  requireValue(actionPackage.authorityClass === 'PROTECTED_ACTION_PACKAGE'
    && actionPackage.subjectType === 'PROTECTED_ACTION_PACKAGE',
  'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_AUTHORITY_INVALID');
  requireIdentifier(actionPackage.subjectId, 'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_SUBJECT_INVALID');
  const subjectMaterial = { action: actionPackage.action, reason: actionPackage.reason,
    sourceObservationId: actionPackage.sourceObservationId,
    sourceEvidenceDigest: actionPackage.sourceEvidenceDigest,
    recommendationDigest: actionPackage.recommendationDigest };
  const expectedSubjectDigest = digestObject(subjectMaterial);
  requireValue(recommendation.recommendation === actionPackage.action
    && recommendation.reason === actionPackage.reason
    && recommendation.sourceObservationId === actionPackage.sourceObservationId
    && recommendation.sourceEvidenceDigest === actionPackage.sourceEvidenceDigest
    && digestObject(recommendation) === actionPackage.recommendationDigest
    && actionPackage.subjectDigest === expectedSubjectDigest
    && actionPackage.subjectId === `autonomous-containment:${expectedSubjectDigest.slice(7)}`,
  'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_BINDING_INVALID');
  const capabilities = actionPackage.requestedCapabilities;
  requireExactRecord(capabilities, CONTAINMENT_CAPABILITY_KEYS,
    'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_CAPABILITY_SHAPE_INVALID');
  requireValue(capabilities.providerContact === false && capabilities.spend === false
    && capabilities.externalEgress === false && capabilities.credentialAccess === false
    && capabilities.production === 'HOLD' && capabilities.publicRelease === 'HOLD'
    && capabilities.g5 === 'HOLD' && actionPackage.automaticActionTaken === false
    && actionPackage.mutationAllowed === false && actionPackage.production === 'HOLD'
    && actionPackage.publicRelease === 'HOLD' && actionPackage.g5 === 'HOLD',
  'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_AUTHORITY_INVALID');
  verifySelfDigest(actionPackage, 'packageDigest',
    'AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_INTEGRITY_INVALID');
  return actionPackage;
}

export async function consumeAutonomousContainmentApproval(client, {
  actionPackage: packageInput, recommendation: recommendationInput, trust, now,
}) {
  const recommendation = verifyAutonomousContainmentRecommendation(recommendationInput);
  const actionPackage = verifyAutonomousContainmentActionPackage(packageInput, recommendation);
  requireValue(now instanceof Date && Number.isFinite(now.getTime()),
    'AUTONOMOUS_CONTAINMENT_APPROVAL_TIME_INVALID');
  const expectedSubject = {
    authorityClass: actionPackage.authorityClass, subjectType: actionPackage.subjectType,
    subjectId: actionPackage.subjectId, subjectDigest: actionPackage.subjectDigest,
  };
  const authority = await verifyAndConsumeCurrentApprovalTrust(client, {
    ...snapshotJson(trust), expectedSubject, now,
    beforeCommit: async ({ verificationReceipt: verification,
      consumptionReceipt: consumption }) => {
      const unsigned = {
        contractId: 'kidults-autonomous-containment-approval-receipt-v1', version: '1.0.0',
        state: 'APPROVAL_CONSUMED_NO_ACTION_TAKEN', action: actionPackage.action,
        actionPackageDigest: actionPackage.packageDigest,
        recommendationDigest: actionPackage.recommendationDigest,
        authorityVerificationReceiptDigest: verification.receiptDigest,
        authorityConsumptionReceiptDigest: consumption.receiptDigest,
        consumedAt: consumption.consumedAt, automaticActionTaken: false,
        activationAuthorized: false, mutationAllowed: false,
        production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
      };
      const receipt = verifyAutonomousContainmentApprovalReceipt({
        ...unsigned, receiptDigest: digestObject(unsigned),
      });
      const fence = createAutonomousContainmentFence({ recommendation, actionPackage,
        approvalReceipt: receipt, authorityVerificationReceipt: verification,
        authorityConsumptionReceipt: consumption });
      await persistAutonomousContainmentFenceInTransaction(
        client, fence, verifyAutonomousContainmentFence,
      );
      return { receipt, fence };
    },
  });
  if (authority.state !== 'CONSUMED_AUTHORITY_NOT_ACTIVATED') {
    return { state: 'CONTAINMENT_APPROVAL_ALREADY_CONSUMED_HOLD', actionPackage,
      recommendation, authority, receipt: null };
  }
  const verified = verifyCurrentApprovalEvidence(authority);
  const verification = verified.verificationReceipt;
  const consumption = verified.consumptionReceipt;
  requireValue(verification.authorityClass === actionPackage.authorityClass
    && verification.subjectType === actionPackage.subjectType
    && verification.subjectId === actionPackage.subjectId
    && verification.subjectDigest === actionPackage.subjectDigest
    && verification.requestedCapabilitiesDigest
      === digestObject(actionPackage.requestedCapabilities)
    && consumption.subjectId === actionPackage.subjectId
    && consumption.subjectDigest === actionPackage.subjectDigest
    && consumption.requestedCapabilitiesDigest === verification.requestedCapabilitiesDigest,
  'AUTONOMOUS_CONTAINMENT_APPROVAL_BINDING_INVALID');
  requireValue(authority.transactionResult !== null,
    'AUTONOMOUS_CONTAINMENT_FENCE_ATOMIC_PERSISTENCE_REQUIRED');
  const receipt = verifyAutonomousContainmentApprovalReceipt(authority.transactionResult.receipt);
  const fence = verifyAutonomousContainmentFence(authority.transactionResult.fence);
  return { state: receipt.state, actionPackage, recommendation, authority, receipt, fence };
}

export function verifyAutonomousContainmentApprovalReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, CONTAINMENT_APPROVAL_RECEIPT_KEYS,
    'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-containment-approval-receipt-v1'
    && receipt.version === '1.0.0' && receipt.state === 'APPROVAL_CONSUMED_NO_ACTION_TAKEN'
    && new Set(['QUARANTINE', 'STOP']).has(receipt.action),
  'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_STATE_INVALID');
  for (const digest of [receipt.actionPackageDigest, receipt.recommendationDigest,
    receipt.authorityVerificationReceiptDigest, receipt.authorityConsumptionReceiptDigest,
    receipt.receiptDigest]) {
    requireDigest(digest, 'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_DIGEST_INVALID');
  }
  requireInstant(receipt.consumedAt, 'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_TIME_INVALID');
  requireValue(receipt.automaticActionTaken === false && receipt.activationAuthorized === false
    && receipt.mutationAllowed === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_AUTHORITY_INVALID');
  verifySelfDigest(receipt, 'receiptDigest',
    'AUTONOMOUS_CONTAINMENT_APPROVAL_RECEIPT_INTEGRITY_INVALID');
  return receipt;
}

export function createAutonomousContainmentReleasePackage(input) {
  const fence = verifyAutonomousContainmentFence(input);
  requireValue(fence.state === 'APPROVED_CONTAINMENT_FENCE_ACTIVE',
    'AUTONOMOUS_CONTAINMENT_RELEASE_ACTIVE_FENCE_REQUIRED');
  const requestedCapabilities = { providerContact: false, spend: false,
    externalEgress: false, credentialAccess: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
  const subjectCore = { action: 'RELEASE', previousFenceDigest: fence.fenceDigest,
    requestedCapabilities };
  const subjectDigest = digestObject(subjectCore);
  const unsigned = {
    contractId: 'kidults-autonomous-containment-release-package-v1', version: '1.0.0',
    state: 'OPERATOR_APPROVAL_REQUIRED_NO_ACTION_TAKEN', action: 'RELEASE',
    reason: 'VERIFIED_RECOVERY_RELEASE', previousFenceDigest: fence.fenceDigest,
    authorityClass: 'PROTECTED_ACTION_PACKAGE', subjectType: 'PROTECTED_ACTION_PACKAGE',
    subjectId: `autonomous-containment-release:${subjectDigest.slice(7)}`, subjectDigest,
    requestedCapabilities, automaticActionTaken: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousContainmentReleasePackage({
    ...unsigned, packageDigest: digestObject(unsigned),
  }, fence);
}

export function verifyAutonomousContainmentReleasePackage(input, previousFenceInput) {
  const release = snapshotJson(input);
  const previousFence = verifyAutonomousContainmentFence(previousFenceInput);
  requireExactRecord(release, CONTAINMENT_RELEASE_PACKAGE_KEYS,
    'AUTONOMOUS_CONTAINMENT_RELEASE_PACKAGE_SHAPE_INVALID');
  const expectedSubjectDigest = digestObject({ action: 'RELEASE',
    previousFenceDigest: previousFence.fenceDigest,
    requestedCapabilities: release.requestedCapabilities });
  requireValue(previousFence.state === 'APPROVED_CONTAINMENT_FENCE_ACTIVE'
    && release.contractId === 'kidults-autonomous-containment-release-package-v1'
    && release.version === '1.0.0'
    && release.state === 'OPERATOR_APPROVAL_REQUIRED_NO_ACTION_TAKEN'
    && release.action === 'RELEASE' && release.reason === 'VERIFIED_RECOVERY_RELEASE'
    && release.previousFenceDigest === previousFence.fenceDigest
    && release.authorityClass === 'PROTECTED_ACTION_PACKAGE'
    && release.subjectType === 'PROTECTED_ACTION_PACKAGE'
    && release.subjectId === `autonomous-containment-release:${expectedSubjectDigest.slice(7)}`
    && release.subjectDigest === expectedSubjectDigest,
  'AUTONOMOUS_CONTAINMENT_RELEASE_PACKAGE_BINDING_INVALID');
  requireExactRecord(release.requestedCapabilities, CONTAINMENT_CAPABILITY_KEYS,
    'AUTONOMOUS_CONTAINMENT_CAPABILITY_SHAPE_INVALID');
  const capabilities = release.requestedCapabilities;
  requireValue(capabilities.providerContact === false && capabilities.spend === false
    && capabilities.externalEgress === false && capabilities.credentialAccess === false
    && capabilities.production === 'HOLD' && capabilities.publicRelease === 'HOLD'
    && capabilities.g5 === 'HOLD' && release.automaticActionTaken === false
    && release.mutationAllowed === false && release.production === 'HOLD'
    && release.publicRelease === 'HOLD' && release.g5 === 'HOLD',
  'AUTONOMOUS_CONTAINMENT_RELEASE_PACKAGE_AUTHORITY_INVALID');
  verifySelfDigest(release, 'packageDigest',
    'AUTONOMOUS_CONTAINMENT_RELEASE_PACKAGE_INTEGRITY_INVALID');
  return release;
}

export function verifyAutonomousContainmentReleaseReceipt(input) {
  const receipt = snapshotJson(input);
  requireExactRecord(receipt, CONTAINMENT_RELEASE_RECEIPT_KEYS,
    'AUTONOMOUS_CONTAINMENT_RELEASE_RECEIPT_SHAPE_INVALID');
  requireValue(receipt.contractId === 'kidults-autonomous-containment-release-receipt-v1'
    && receipt.version === '1.0.0' && receipt.state === 'APPROVED_RELEASE_RECORDED'
    && receipt.action === 'RELEASE', 'AUTONOMOUS_CONTAINMENT_RELEASE_RECEIPT_STATE_INVALID');
  for (const digest of [receipt.previousFenceDigest, receipt.releasePackageDigest,
    receipt.authorityVerificationReceiptDigest, receipt.authorityConsumptionReceiptDigest,
    receipt.receiptDigest]) requireDigest(digest, 'AUTONOMOUS_CONTAINMENT_RELEASE_DIGEST_INVALID');
  requireInstant(receipt.consumedAt, 'AUTONOMOUS_CONTAINMENT_RELEASE_TIME_INVALID');
  requireValue(receipt.automaticActionTaken === false && receipt.activationAuthorized === false
    && receipt.mutationAllowed === false && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'AUTONOMOUS_CONTAINMENT_RELEASE_RECEIPT_AUTHORITY_INVALID');
  verifySelfDigest(receipt, 'receiptDigest',
    'AUTONOMOUS_CONTAINMENT_RELEASE_RECEIPT_INTEGRITY_INVALID');
  return receipt;
}

export async function consumeAutonomousContainmentReleaseApproval(client, {
  releasePackage: packageInput, previousFence: fenceInput, trust, now,
}) {
  const previousFence = verifyAutonomousContainmentFence(fenceInput);
  const releasePackage = verifyAutonomousContainmentReleasePackage(packageInput, previousFence);
  requireValue(now instanceof Date && Number.isFinite(now.getTime()),
    'AUTONOMOUS_CONTAINMENT_RELEASE_TIME_INVALID');
  const expectedSubject = { authorityClass: releasePackage.authorityClass,
    subjectType: releasePackage.subjectType, subjectId: releasePackage.subjectId,
    subjectDigest: releasePackage.subjectDigest };
  const authority = await verifyAndConsumeCurrentApprovalTrust(client, {
    ...snapshotJson(trust), expectedSubject, now,
    beforeCommit: async ({ verificationReceipt: verification,
      consumptionReceipt: consumption }) => {
      const unsigned = {
        contractId: 'kidults-autonomous-containment-release-receipt-v1', version: '1.0.0',
        state: 'APPROVED_RELEASE_RECORDED', action: 'RELEASE',
        previousFenceDigest: previousFence.fenceDigest,
        releasePackageDigest: releasePackage.packageDigest,
        authorityVerificationReceiptDigest: verification.receiptDigest,
        authorityConsumptionReceiptDigest: consumption.receiptDigest,
        consumedAt: consumption.consumedAt, automaticActionTaken: false,
        activationAuthorized: false, mutationAllowed: false,
        production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
      };
      const receipt = verifyAutonomousContainmentReleaseReceipt({
        ...unsigned, receiptDigest: digestObject(unsigned),
      });
      const fenceUnsigned = {
        contractId: 'kidults-autonomous-containment-fence-v1', version: '1.0.0',
        state: 'APPROVED_CONTAINMENT_RELEASED', action: 'RELEASE',
        sourceEvidenceDigest: previousFence.fenceDigest,
        actionPackageDigest: releasePackage.packageDigest,
        approvalReceiptDigest: receipt.receiptDigest,
        previousFenceDigest: previousFence.fenceDigest, allowInvocation: true,
        automaticActionTaken: false, mutationAllowed: false,
        production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
      };
      const fence = verifyAutonomousContainmentFence({
        ...fenceUnsigned, fenceDigest: digestObject(fenceUnsigned),
      });
      await persistAutonomousContainmentFenceInTransaction(client, fence,
        verifyAutonomousContainmentFence, previousFence.fenceDigest);
      return { receipt, fence };
    },
  });
  if (authority.state !== 'CONSUMED_AUTHORITY_NOT_ACTIVATED') {
    return { state: 'CONTAINMENT_RELEASE_ALREADY_CONSUMED_HOLD', authority,
      previousFence, releasePackage, receipt: null, fence: null };
  }
  requireValue(authority.transactionResult !== null,
    'AUTONOMOUS_CONTAINMENT_RELEASE_ATOMIC_PERSISTENCE_REQUIRED');
  return { state: 'APPROVED_RELEASE_RECORDED', authority, previousFence, releasePackage,
    receipt: verifyAutonomousContainmentReleaseReceipt(authority.transactionResult.receipt),
    fence: verifyAutonomousContainmentFence(authority.transactionResult.fence) };
}

export function createAutonomousContainmentFence(input = null) {
  if (input === null) {
    const unsigned = {
      contractId: 'kidults-autonomous-containment-fence-v1', version: '1.0.0',
      state: 'CLEAR_NO_ACTIVE_CONTAINMENT', action: null, sourceEvidenceDigest: null,
      actionPackageDigest: null, approvalReceiptDigest: null, previousFenceDigest: null,
      allowInvocation: true,
      automaticActionTaken: false, mutationAllowed: false,
      production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
    };
    return verifyAutonomousContainmentFence({ ...unsigned, fenceDigest: digestObject(unsigned) });
  }
  const bounded = snapshotJson(input);
  requireExactRecord(bounded, ['recommendation', 'actionPackage', 'approvalReceipt',
    'authorityVerificationReceipt', 'authorityConsumptionReceipt'],
    'AUTONOMOUS_CONTAINMENT_FENCE_INPUT_SHAPE_INVALID');
  const recommendation = verifyAutonomousContainmentRecommendation(bounded.recommendation);
  const actionPackage = verifyAutonomousContainmentActionPackage(
    bounded.actionPackage, recommendation,
  );
  const approvalReceipt = verifyAutonomousContainmentApprovalReceipt(bounded.approvalReceipt);
  const authority = verifyCurrentApprovalEvidence({
    verificationReceipt: bounded.authorityVerificationReceipt,
    consumptionReceipt: bounded.authorityConsumptionReceipt,
  });
  requireValue(approvalReceipt.action === actionPackage.action
    && approvalReceipt.actionPackageDigest === actionPackage.packageDigest
    && approvalReceipt.recommendationDigest === actionPackage.recommendationDigest
    && approvalReceipt.authorityVerificationReceiptDigest
      === authority.verificationReceipt.receiptDigest
    && approvalReceipt.authorityConsumptionReceiptDigest
      === authority.consumptionReceipt.receiptDigest
    && authority.verificationReceipt.authorityClass === actionPackage.authorityClass
    && authority.verificationReceipt.subjectId === actionPackage.subjectId
    && authority.verificationReceipt.subjectDigest === actionPackage.subjectDigest
    && authority.consumptionReceipt.subjectId === actionPackage.subjectId
    && authority.consumptionReceipt.subjectDigest === actionPackage.subjectDigest,
  'AUTONOMOUS_CONTAINMENT_FENCE_APPROVAL_BINDING_INVALID');
  const unsigned = {
    contractId: 'kidults-autonomous-containment-fence-v1', version: '1.0.0',
    state: 'APPROVED_CONTAINMENT_FENCE_ACTIVE', action: actionPackage.action,
    sourceEvidenceDigest: actionPackage.sourceEvidenceDigest,
    actionPackageDigest: actionPackage.packageDigest,
    approvalReceiptDigest: approvalReceipt.receiptDigest, previousFenceDigest: null,
    allowInvocation: false,
    automaticActionTaken: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyAutonomousContainmentFence({ ...unsigned, fenceDigest: digestObject(unsigned) });
}

export function verifyAutonomousContainmentFence(input) {
  const fence = snapshotJson(input);
  requireExactRecord(fence, CONTAINMENT_FENCE_KEYS,
    'AUTONOMOUS_CONTAINMENT_FENCE_SHAPE_INVALID');
  requireValue(fence.contractId === 'kidults-autonomous-containment-fence-v1'
    && fence.version === '1.0.0'
    && new Set(['CLEAR_NO_ACTIVE_CONTAINMENT', 'APPROVED_CONTAINMENT_FENCE_ACTIVE',
      'APPROVED_CONTAINMENT_RELEASED'])
      .has(fence.state), 'AUTONOMOUS_CONTAINMENT_FENCE_STATE_INVALID');
  const clear = fence.state === 'CLEAR_NO_ACTIVE_CONTAINMENT';
  const released = fence.state === 'APPROVED_CONTAINMENT_RELEASED';
  requireValue(clear
    ? fence.action === null && fence.sourceEvidenceDigest === null
      && fence.actionPackageDigest === null && fence.approvalReceiptDigest === null
      && fence.previousFenceDigest === null && fence.allowInvocation === true
    : released ? fence.action === 'RELEASE' && fence.allowInvocation === true
      && fence.sourceEvidenceDigest === fence.previousFenceDigest
    : new Set(['QUARANTINE', 'STOP']).has(fence.action)
      && fence.previousFenceDigest === null && fence.allowInvocation === false,
  'AUTONOMOUS_CONTAINMENT_FENCE_BINDING_INVALID');
  if (!clear) {
    for (const digest of [fence.sourceEvidenceDigest, fence.actionPackageDigest,
      fence.approvalReceiptDigest, ...(released ? [fence.previousFenceDigest] : [])]) {
      requireDigest(digest, 'AUTONOMOUS_CONTAINMENT_FENCE_DIGEST_INVALID');
    }
  }
  requireDigest(fence.fenceDigest, 'AUTONOMOUS_CONTAINMENT_FENCE_DIGEST_INVALID');
  requireValue(fence.automaticActionTaken === false && fence.mutationAllowed === false
    && fence.production === 'HOLD' && fence.publicRelease === 'HOLD' && fence.g5 === 'HOLD',
  'AUTONOMOUS_CONTAINMENT_FENCE_AUTHORITY_INVALID');
  verifySelfDigest(fence, 'fenceDigest', 'AUTONOMOUS_CONTAINMENT_FENCE_INTEGRITY_INVALID');
  return fence;
}

export async function runAutonomousLauncher({
  authorityClient, admissionClient, taskClient, proofClient = taskClient,
  containmentClient = authorityClient,
  trust, request: requestInput, decision: decisionInput, controlState,
  clock = () => new Date(), monotonicClock,
}) {
  const containmentFence = await resolveCurrentAutonomousContainmentFence(containmentClient, {
    verifyFence: verifyAutonomousContainmentFence,
    createClearFence: createAutonomousContainmentFence,
  });
  if (!containmentFence.allowInvocation) {
    return { state: containmentFence.action === 'STOP'
      ? 'CONTAINMENT_STOP_HOLD' : 'CONTAINMENT_QUARANTINE_HOLD',
    containmentFence, authority: null, execution: null, receipt: null };
  }
  const request = validateSupervisorInvocationRequest(requestInput);
  const decision = validateSupervisorInvocationDecision(decisionInput, request);
  requireValue(decision.decision === 'APPROVED', 'AUTONOMOUS_LAUNCHER_DECISION_NOT_APPROVED');
  const now = clock();
  requireValue(now instanceof Date && Number.isFinite(now.getTime()),
    'AUTONOMOUS_LAUNCHER_TIME_INVALID');
  const expectedSubject = {
    authorityClass: decision.authorityClass, subjectType: decision.subjectType,
    subjectId: decision.subjectId, subjectDigest: decision.subjectDigest,
  };
  const authority = await verifyAndConsumeCurrentApprovalTrust(authorityClient, {
    ...snapshotJson(trust), expectedSubject, now,
  });
  if (authority.state !== 'CONSUMED_AUTHORITY_NOT_ACTIVATED') {
    return { state: 'AUTHORITY_ALREADY_CONSUMED_HOLD', authority,
      execution: null, receipt: null };
  }
  const verifiedAuthority = verifyCurrentApprovalEvidence(authority);
  requireValue(verifiedAuthority.verificationReceipt.subjectId === request.requestId
    && verifiedAuthority.verificationReceipt.subjectDigest === request.requestDigest,
  'AUTONOMOUS_LAUNCHER_AUTHORITY_BINDING_INVALID');
  const execution = await runAdmittedShadowSupervisor({ admissionClient, taskClient, proofClient,
    request, decision, controlState: snapshotJson(controlState), clock, monotonicClock });
  requireValue(execution.state === 'ADMITTED_AND_EXECUTED',
    'AUTONOMOUS_LAUNCHER_INVOCATION_NOT_EXECUTED');
  const receipt = launcherReceipt(request, decision, authority, execution);
  const verifiedReceipt = verifyAutonomousLauncherReceipt(receipt);
  const evidence = verifyAutonomousOperationalEvidence({ request, decision,
    launcherReceipt: verifiedReceipt,
    authorityVerificationReceipt: authority.verificationReceipt,
    authorityConsumptionReceipt: authority.consumptionReceipt,
    invocationConsumptionReceipt: execution.admissionReceipt,
    invocationExecutionReceipt: execution.executionReceipt,
    supervisor: execution.supervisor });
  const operationalStatus = projectAutonomousOperationalStatus(evidence);
  const controlTowerObservation = projectAutonomousControlTowerObservation(operationalStatus);
  const containmentRecommendation = recommendAutonomousContainment(controlTowerObservation);
  const containmentActionPackage = createAutonomousContainmentActionPackage(
    containmentRecommendation,
  );
  return { state: receipt.state, authority, execution, receipt: verifiedReceipt,
    evidence, operationalStatus, controlTowerObservation, containmentRecommendation,
    containmentActionPackage };
}

export async function runPostgresAutonomousLauncher(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'AUTONOMOUS_LAUNCHER_POSTGRES_INPUT_INVALID');
  const { postgres, ...launcherInput } = input;
  const clientKeys = [
    'authorityClient', 'admissionClient', 'taskClient', 'proofClient', 'containmentClient',
  ];
  requireValue(clientKeys.every(key => !Object.hasOwn(launcherInput, key)),
    'AUTONOMOUS_LAUNCHER_POSTGRES_CLIENT_OVERRIDE_DENIED');
  return withAutonomousPostgresRuntime(postgres, client => runAutonomousLauncher({
    ...launcherInput, authorityClient: client, admissionClient: client,
    taskClient: client, proofClient: client, containmentClient: client,
  }), dependencies);
}

export function createProtectedAutonomousLaunchManifest({
  sourceSha, trust, request, decision, controlState, issuedAt, expiresAt,
}) {
  const unsigned = {
    contractId: 'kidults-protected-autonomous-launch-manifest-v1', version: '1.0.0',
    state: 'BOUND_INVOCATION_READY_EXTERNAL_PROTECTED_LAUNCHER_HOLD', sourceSha,
    trust: snapshotJson(trust), request: snapshotJson(request), decision: snapshotJson(decision),
    controlState: snapshotJson(controlState), issuedAt, expiresAt,
    activationMode: 'EXACT_MANIFEST_ONLY', automaticTrigger: 'NOT_REGISTERED_HOLD',
    remoteWorkerActivation: 'HOLD', production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyProtectedAutonomousLaunchManifest({
    ...unsigned, manifestDigest: digestObject(unsigned),
  }, new Date(issuedAt));
}

export function verifyProtectedAutonomousLaunchManifest(input, now = new Date()) {
  const manifest = snapshotJson(input);
  requireExactRecord(manifest, PROTECTED_LAUNCH_MANIFEST_KEYS,
    'PROTECTED_AUTONOMOUS_LAUNCH_MANIFEST_SHAPE_INVALID');
  requireValue(manifest.contractId === 'kidults-protected-autonomous-launch-manifest-v1'
    && manifest.version === '1.0.0'
    && manifest.state === 'BOUND_INVOCATION_READY_EXTERNAL_PROTECTED_LAUNCHER_HOLD',
  'PROTECTED_AUTONOMOUS_LAUNCH_MANIFEST_CONTRACT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(manifest.sourceSha),
    'PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_SHA_INVALID');
  requireInstant(manifest.issuedAt, 'PROTECTED_AUTONOMOUS_LAUNCH_TIME_INVALID');
  requireInstant(manifest.expiresAt, 'PROTECTED_AUTONOMOUS_LAUNCH_TIME_INVALID');
  requireValue(now instanceof Date && Number.isFinite(now.getTime()),
    'PROTECTED_AUTONOMOUS_LAUNCH_TIME_INVALID');
  const issued = new Date(manifest.issuedAt).getTime();
  const expires = new Date(manifest.expiresAt).getTime();
  requireValue(issued <= now.getTime() && now.getTime() < expires && expires - issued <= 300000,
    'PROTECTED_AUTONOMOUS_LAUNCH_MANIFEST_EXPIRED');
  requireValue(manifest.activationMode === 'EXACT_MANIFEST_ONLY'
    && manifest.automaticTrigger === 'NOT_REGISTERED_HOLD'
    && manifest.remoteWorkerActivation === 'HOLD' && manifest.production === 'HOLD'
    && manifest.publicRelease === 'HOLD' && manifest.g5 === 'HOLD',
  'PROTECTED_AUTONOMOUS_LAUNCH_AUTHORITY_INVALID');
  requireDigest(manifest.manifestDigest, 'PROTECTED_AUTONOMOUS_LAUNCH_DIGEST_INVALID');
  verifySelfDigest(manifest, 'manifestDigest',
    'PROTECTED_AUTONOMOUS_LAUNCH_INTEGRITY_INVALID');
  return manifest;
}

async function resolveProtectedAutonomousLaunchManifest(manifestInput, dependencies) {
  const now = dependencies.now?.() ?? new Date();
  const manifest = verifyProtectedAutonomousLaunchManifest(manifestInput, now);
  requireValue(typeof dependencies.currentSourceSha === 'function',
    'PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_RESOLVER_REQUIRED');
  let currentSourceSha;
  try { currentSourceSha = await dependencies.currentSourceSha(); }
  catch { throw new Error('PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_RESOLUTION_FAILED'); }
  requireValue(currentSourceSha === manifest.sourceSha,
    'PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_MISMATCH');
  return manifest;
}

export async function runProtectedPostgresAutonomousLauncher(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'PROTECTED_AUTONOMOUS_LAUNCH_INPUT_INVALID');
  const bounded = snapshotJson(input);
  requireExactRecord(bounded, ['postgres', 'manifest'],
    'PROTECTED_AUTONOMOUS_LAUNCH_INPUT_INVALID');
  const manifest = await resolveProtectedAutonomousLaunchManifest(
    bounded.manifest, dependencies,
  );
  return runPostgresAutonomousLauncher({ postgres: bounded.postgres,
    trust: manifest.trust, request: manifest.request, decision: manifest.decision,
    controlState: manifest.controlState, clock: dependencies.clock ?? (() => new Date()),
    monotonicClock: dependencies.monotonicClock }, { connect: dependencies.connect });
}

function createBoundedCredentialInjectionEvidence(manifest, observedAt) {
  const unsigned = {
    contractId: 'kidults-bounded-credential-injection-evidence-v1', version: '1.0.0',
    state: 'VERIFIED_BOUNDED_CREDENTIAL_INJECTION', sourceSha: manifest.sourceSha,
    manifestDigest: manifest.manifestDigest, requestId: manifest.request.requestId,
    applicationName: 'kidults-autonomous-protected-launcher-v1', resolutionCount: 1,
    manifestVerifiedBeforeResolution: true, credentialMaterialRetained: false,
    rawProviderErrorExposed: false, providerIntegration: 'NOT_VERIFIED_HOLD', observedAt,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyBoundedCredentialInjectionEvidence({
    ...unsigned, receiptDigest: digestObject(unsigned),
  }, { expectedSourceSha: manifest.sourceSha });
}

export async function runCredentialInjectedProtectedPostgresLauncher(input, dependencies = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input),
    'PROTECTED_AUTONOMOUS_CREDENTIAL_INPUT_INVALID');
  const bounded = snapshotJson(input);
  requireExactRecord(bounded, ['manifest'], 'PROTECTED_AUTONOMOUS_CREDENTIAL_INPUT_INVALID');
  const manifest = await resolveProtectedAutonomousLaunchManifest(
    bounded.manifest, dependencies,
  );
  requireValue(typeof dependencies.resolvePostgresCredential === 'function',
    'PROTECTED_AUTONOMOUS_CREDENTIAL_RESOLVER_REQUIRED');
  const request = Object.freeze({ purpose: 'AUTONOMOUS_POSTGRES_LAUNCH',
    applicationName: 'kidults-autonomous-protected-launcher-v1',
    sourceSha: manifest.sourceSha, requestId: manifest.request.requestId,
    manifestDigest: manifest.manifestDigest });
  let postgres;
  try { postgres = await dependencies.resolvePostgresCredential(request); }
  catch { throw new Error('PROTECTED_AUTONOMOUS_CREDENTIAL_RESOLUTION_FAILED'); }
  try {
    requireExactRecord(postgres,
      ['dsn', 'applicationName', 'connectTimeoutMs', 'statementTimeoutMs'],
      'PROTECTED_AUTONOMOUS_CREDENTIAL_RESULT_INVALID');
    requireValue(postgres.applicationName === request.applicationName,
      'PROTECTED_AUTONOMOUS_CREDENTIAL_RESULT_INVALID');
    return await withAutonomousPostgresRuntime(postgres, async client => {
      const consumption = await consumeProtectedLaunchManifest(
        client, manifest, (dependencies.consumedAt?.() ?? new Date()).toISOString(),
      );
      if (consumption.state !== 'CONSUMED_SINGLE_USE_MANIFEST') {
        return { state: 'MANIFEST_ALREADY_CONSUMED_HOLD', manifestConsumption: consumption,
          authority: null, execution: null, receipt: null };
      }
      const result = await runAutonomousLauncher({ authorityClient: client,
        admissionClient: client, taskClient: client, proofClient: client,
        containmentClient: client, trust: manifest.trust, request: manifest.request,
        decision: manifest.decision, controlState: manifest.controlState,
        clock: dependencies.clock ?? (() => new Date()),
        monotonicClock: dependencies.monotonicClock });
      const evidenceObservedAt = dependencies.evidenceObservedAt?.() ?? new Date();
      requireValue(evidenceObservedAt instanceof Date
        && Number.isFinite(evidenceObservedAt.getTime()),
      'BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_TIME_INVALID');
      const credentialInjectionEvidence = createBoundedCredentialInjectionEvidence(
        manifest, evidenceObservedAt.toISOString(),
      );
      return { ...result, manifestConsumption: consumption, credentialInjectionEvidence };
    }, { connect: dependencies.connect });
  } finally {
    postgres = undefined;
  }
}
