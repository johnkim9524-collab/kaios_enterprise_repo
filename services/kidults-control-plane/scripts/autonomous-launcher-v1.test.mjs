import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import { createApprovalEnvelopeSigningStatement } from '../src/common-control/approval-envelope-v1.mjs';
import { publishCurrentApprovalTrust } from '../src/common-control/approval-trust-runtime-v1.mjs';
import {
  AUTONOMOUS_POSTGRES_MIGRATIONS_V1,
} from '../src/common-control/autonomous-postgres-evidence-receipt-v1.mjs';
import { compileSyntheticApprovalTrustRegistry } from '../src/common-control/approval-trust-registry-compiler-v1.mjs';
import { recordCompiledTrustRegistrySnapshot } from '../src/common-control/approval-trust-registry-snapshot-v1.mjs';
import {
  createTrustRootCandidate, createTrustRootLifecycleEvent,
} from '../src/common-control/approval-trust-root-lifecycle-v1.mjs';
import {
  createSupervisorInvocationDecision, createSupervisorInvocationRequest,
  persistSupervisorInvocationDecision, persistSupervisorInvocationRequest,
} from '../src/autonomous-control/invocation-admission-v1.mjs';
import {
  assembleAutonomousRuntimeEvidenceBundle, assessAutonomousRuntimeActivationGate,
  assessAutonomousRuntimeTriggerReadiness,
  consumeAutonomousContainmentApproval, consumeAutonomousContainmentReleaseApproval,
  createAutonomousContainmentActionPackage, createAutonomousContainmentReleasePackage,
  createAutonomousContainmentFence, createAutonomousTriggerRegistrationPackage,
  createProtectedAutonomousLaunchManifest,
  projectAutonomousControlTowerObservation, projectAutonomousOperationalStatus,
  evaluateAutonomousRuntimeShadowSoak, recommendAutonomousContainment,
  runAutonomousLauncher, runAutonomousRuntimeShadowTriggerDryRun, runPostgresAutonomousLauncher,
  runCredentialInjectedProtectedPostgresLauncher, runProtectedPostgresAutonomousLauncher,
  verifyAutonomousContainmentActionPackage, verifyAutonomousContainmentRecommendation,
  verifyAutonomousContainmentApprovalReceipt, verifyAutonomousContainmentFence,
  verifyAutonomousContainmentReleasePackage, verifyAutonomousContainmentReleaseReceipt,
  verifyAutonomousControlTowerObservation, verifyAutonomousLauncherReceipt,
  verifyAutonomousOperationalEvidence, verifyAutonomousRuntimeActivationGate,
  verifyAutonomousRuntimeEvidenceBundle,
  verifyAutonomousRuntimeShadowSoakVerdict, verifyAutonomousRuntimeShadowTriggerDryRun,
  verifyAutonomousRuntimeTriggerReadiness, verifyAutonomousTriggerRegistrationPackage,
  verifyBoundedCredentialInjectionEvidence, verifyProtectedAutonomousLaunchManifest,
  verifyExternalAutonomousTriggerRegistrationReceipt,
} from '../src/autonomous-control/launcher-v1.mjs';
import { fakeAutonomousTaskClient } from './helpers/autonomous-task-ledger-fake-client.mjs';

const base = new Date('2026-09-19T04:02:00.000Z');
const POSTGRES_SOURCE_SHA = '8'.repeat(40);
const POSTGRES_MIGRATION_DIGEST = digestObject({ migrations: 'readiness' });

function postgresEvidenceReceipt() {
  const unsigned = {
    id: 'kidults-autonomous-postgres-evidence-v1', version: '1.2.0',
    state: 'VERIFIED_PASS', exactSourceSha: POSTGRES_SOURCE_SHA,
    databaseName: 'kidults_ephemeral_readiness_01', serverVersionNum: '160003',
    migrationDigest: POSTGRES_MIGRATION_DIGEST,
    migrations: [...AUTONOMOUS_POSTGRES_MIGRATIONS_V1],
    checks: {
      freshEphemeralDatabase: true, roleIsolation: true, appendOnlyMutationDenied: true,
      proofExactReplay: true, rollback: true, deferredTransitionPair: true,
      invocationAdmissionLeastPrivilege: true, twoClientCas: true,
      snapshots: 2, transitions: 1, trustRevocationWinsTwoClientRace: true,
      trustConsumptionWinsTwoClientRace: true, trustCurrentHeads: 4,
      cryptographicApprovalConsumptions: 1,
      containmentStopFenceBlocks: true, containmentReleaseFenceAllows: true,
      containmentReleaseChainEnforced: true, containmentAppendOnlyMutationDenied: true,
      containmentMonotonicEventOrder: true, containmentFenceEvents: 2,
      protectedManifestLeastPrivilege: true, protectedManifestTwoClientSingleWinner: true,
      protectedManifestRestartReplayHeld: true,
      protectedManifestAppendOnlyMutationDenied: true, protectedManifestConsumptions: 1,
    },
    scope: 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY',
    runtimeRunnerDatabaseExecution: false, providerAuthority: false,
    externalEgress: false, credentialMaterialRetained: false,
    observedAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function postgresReadinessEvidence() {
  return { postgresEvidenceReceipt: postgresEvidenceReceipt(),
    expectedPostgresSourceSha: POSTGRES_SOURCE_SHA,
    expectedPostgresMigrationDigest: POSTGRES_MIGRATION_DIGEST };
}

function credentialInjectionEvidenceReceipt() {
  const unsigned = {
    contractId: 'kidults-bounded-credential-injection-evidence-v1', version: '1.0.0',
    state: 'VERIFIED_BOUNDED_CREDENTIAL_INJECTION', sourceSha: POSTGRES_SOURCE_SHA,
    manifestDigest: digestObject({ manifest: 'credential-readiness' }),
    requestId: 'credential-readiness-request',
    applicationName: 'kidults-autonomous-protected-launcher-v1', resolutionCount: 1,
    manifestVerifiedBeforeResolution: true, credentialMaterialRetained: false,
    rawProviderErrorExposed: false, providerIntegration: 'NOT_VERIFIED_HOLD',
    observedAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function control() {
  return { policyRevision: 1, policyDigest: digestObject({ policy: 1 }),
    registryRevision: 1, registryDigest: digestObject({ registry: 1 }), killEpoch: 1,
    globalKill: false, killedSourceFamilies: [], killedSources: [], externalEgress: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
}

function clock(start = base.getTime() + 60000) {
  let value = start;
  return () => { const result = new Date(value); value += 100; return result; };
}

async function fixture(commandId = 'supervisor-command:launcher-one', ttlSeconds = 300) {
  const client = fakeAutonomousTaskClient();
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const { privateKey: ownerPrivateKey, publicKey: ownerPublicKey } = generateKeyPairSync('ed25519');
  const candidate = createTrustRootCandidate({ keyId: 'kpmo-launcher-001', role: 'KPMO',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    proposedAt: base.toISOString() });
  const ownerCandidate = createTrustRootCandidate({ keyId: 'program-owner-launcher-001',
    role: 'PROGRAM_OWNER', publicKeyPem: ownerPublicKey.export({ type: 'spki', format: 'pem' }),
    proposedAt: base.toISOString() });
  const candidates = [candidate, ownerCandidate];
  const firstEvent = createTrustRootLifecycleEvent({ candidate, candidates, events: [],
    operation: 'ACTIVATE_SYNTHETIC_ONLY',
    observedAt: new Date(base.getTime() + 1000).toISOString() });
  const events = [firstEvent, createTrustRootLifecycleEvent({ candidate: ownerCandidate,
    candidates, events: [firstEvent], operation: 'ACTIVATE_SYNTHETIC_ONLY',
    observedAt: new Date(base.getTime() + 1500).toISOString() })];
  const compiled = compileSyntheticApprovalTrustRegistry({ candidates, events });
  await recordCompiledTrustRegistrySnapshot(client, { ...compiled, candidates, events,
    recordedAt: new Date(base.getTime() + 2000).toISOString() });
  const publication = await publishCurrentApprovalTrust(client, { candidates, events,
    observedAt: new Date(base.getTime() + 2000).toISOString() });
  const request = createSupervisorInvocationRequest({ commandId,
    requestedBy: 'kpmo-requester:launcher', workerId: 'synthetic-worker:launcher',
    maxTicks: 1, maxDurationMs: 1000, leaseSeconds: 120, controlState: control(),
    requestedAt: base.toISOString(), ttlSeconds });
  const decision = createSupervisorInvocationDecision(request, { decision: 'APPROVED',
    reviewerId: 'kpmo-reviewer:launcher',
    decidedAt: new Date(base.getTime() + 3000).toISOString() });
  await persistSupervisorInvocationRequest(client, request);
  await persistSupervisorInvocationDecision(client, request, decision);
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: 'LOCAL_SYNTHETIC_SHADOW', subjectType: 'SUPERVISOR_INVOCATION',
    subjectId: request.requestId, subjectDigest: request.requestDigest,
    requestedCapabilities: { providerContact: false, spend: false, externalEgress: false,
      credentialAccess: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' },
    issuedAt: base.toISOString(), expiresAt: new Date(base.getTime() + 300000).toISOString(),
    nonceDigest: digestObject({ commandId }), trustRegistryDigest: compiled.registry.registryDigest,
  });
  const envelope = { ...statement, signatures: [{ role: 'KPMO', keyId: candidate.keyId,
    algorithm: 'Ed25519', signatureBase64: sign(null,
      Buffer.from(canonicalJson(statement), 'utf8'), privateKey).toString('base64') }] };
  const trust = { registryId: compiled.registry.registryId,
    registryDigest: compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: publication.head.lifecycleStateDigest, envelope };
  return { client, request, decision, trust, compiled, publication,
    signingKeys: [{ candidate, privateKey }, { candidate: ownerCandidate, privateKey: ownerPrivateKey }] };
}

function protectedTrust(value, actionPackage, nonce = 'containment-approval') {
  const statement = createApprovalEnvelopeSigningStatement({
    authorityClass: actionPackage.authorityClass, subjectType: actionPackage.subjectType,
    subjectId: actionPackage.subjectId, subjectDigest: actionPackage.subjectDigest,
    requestedCapabilities: actionPackage.requestedCapabilities,
    issuedAt: new Date(base.getTime() + 4000).toISOString(),
    expiresAt: new Date(base.getTime() + 304000).toISOString(),
    nonceDigest: digestObject({ nonce }),
    trustRegistryDigest: value.compiled.registry.registryDigest,
  });
  const bytes = Buffer.from(canonicalJson(statement), 'utf8');
  const signatures = value.signingKeys.map(({ candidate, privateKey }) => ({
    role: candidate.role, keyId: candidate.keyId, algorithm: 'Ed25519',
    signatureBase64: sign(null, bytes, privateKey).toString('base64'),
  })).sort((left, right) => left.role.localeCompare(right.role)
    || left.keyId.localeCompare(right.keyId));
  return { registryId: value.compiled.registry.registryId,
    registryDigest: value.compiled.registry.registryDigest,
    expectedCurrentLifecycleStateDigest: value.publication.head.lifecycleStateDigest,
    envelope: { ...statement, signatures } };
}

test('runtime trigger readiness fails closed until every operating dependency is verified', () => {
  const held = assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: null, expectedPostgresSourceSha: null,
    expectedPostgresMigrationDigest: null, credentialInjectionEvidence: null,
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.equal(held.state, 'TRIGGER_REGISTRATION_HOLD');
  assert.deepEqual(held.blockers, [
    'currentTrustHead:CURRENT_TRUST_HEAD_VERIFIED',
    'remotePostgresql:REMOTE_POSTGRESQL_VERIFIED',
    'invocationConcurrency:SINGLE_USE_CONCURRENCY_VERIFIED',
    'protectedLauncher:PROTECTED_LAUNCHER_VERIFIED',
    'durableNonceStore:DURABLE_NONCE_STORE_VERIFIED',
    'credentialInjection:BOUNDED_CREDENTIAL_INJECTION_VERIFIED',
    'containmentRecovery:CONTAINMENT_RECOVERY_VERIFIED',
  ]);
  assert.equal(held.activationAuthorized, false);
  const ready = assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.equal(ready.state, 'READY_FOR_TRIGGER_REGISTRATION');
  assert.deepEqual(ready.blockers, []);
  assert.equal(ready.automaticTrigger, 'NOT_REGISTERED_HOLD');
  assert.equal(ready.activationAuthorized, false);
  verifyAutonomousRuntimeTriggerReadiness(ready);
  assert.throws(() => verifyAutonomousRuntimeTriggerReadiness({
    ...ready, activationAuthorized: true,
  }), /AUTONOMOUS_TRIGGER_READINESS_AUTHORITY_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    currentTrustHead: 'CURRENT_TRUST_HEAD_VERIFIED',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'ACTIVE', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_PROTECTED_GATE_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(), durableNonceStore: 'DURABLE_NONCE_STORE_VERIFIED',
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  const tamperedEvidence = postgresEvidenceReceipt();
  tamperedEvidence.checks.protectedManifestRestartReplayHeld = false;
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: tamperedEvidence, expectedPostgresSourceSha: POSTGRES_SOURCE_SHA,
    expectedPostgresMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_POSTGRES_RECEIPT_CHECK_NOT_PROVEN|INTEGRITY_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    currentTrustHead: 'CURRENT_TRUST_HEAD_VERIFIED',
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    remotePostgresql: 'REMOTE_POSTGRESQL_VERIFIED',
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  const trustTamperedEvidence = postgresEvidenceReceipt();
  trustTamperedEvidence.checks.trustConsumptionWinsTwoClientRace = false;
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: trustTamperedEvidence,
    expectedPostgresSourceSha: POSTGRES_SOURCE_SHA,
    expectedPostgresMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_POSTGRES_RECEIPT_CHECK_NOT_PROVEN|INTEGRITY_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    invocationConcurrency: 'SINGLE_USE_CONCURRENCY_VERIFIED',
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  const concurrencyTamperedEvidence = postgresEvidenceReceipt();
  concurrencyTamperedEvidence.checks.twoClientCas = false;
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: concurrencyTamperedEvidence,
    expectedPostgresSourceSha: POSTGRES_SOURCE_SHA,
    expectedPostgresMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_POSTGRES_RECEIPT_CHECK_NOT_PROVEN|INTEGRITY_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    protectedLauncher: 'PROTECTED_LAUNCHER_VERIFIED', ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    containmentRecovery: 'CONTAINMENT_RECOVERY_VERIFIED', assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  const containmentTamperedEvidence = postgresEvidenceReceipt();
  containmentTamperedEvidence.checks.containmentReleaseChainEnforced = false;
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    postgresEvidenceReceipt: containmentTamperedEvidence,
    expectedPostgresSourceSha: POSTGRES_SOURCE_SHA,
    expectedPostgresMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_POSTGRES_RECEIPT_CHECK_NOT_PROVEN|INTEGRITY_INVALID/);
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(),
    credentialInjection: 'BOUNDED_CREDENTIAL_INJECTION_VERIFIED',
    assessedAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_TRIGGER_READINESS_SHAPE_INVALID/);
  const tamperedCredentialEvidence = credentialInjectionEvidenceReceipt();
  tamperedCredentialEvidence.credentialMaterialRetained = true;
  assert.throws(() => assessAutonomousRuntimeTriggerReadiness({
    ...postgresReadinessEvidence(),
    credentialInjectionEvidence: tamperedCredentialEvidence, assessedAt: base.toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_BOUNDARY_INVALID|INTEGRITY_INVALID/);
});

test('runtime evidence bundle binds postgres and protected credential evidence exactly', () => {
  const bundle = assembleAutonomousRuntimeEvidenceBundle({
    postgresEvidenceReceipt: postgresEvidenceReceipt(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    expectedSourceSha: POSTGRES_SOURCE_SHA,
    expectedMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    assembledAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.equal(bundle.state, 'VERIFIED_RUNTIME_EVIDENCE_BUNDLE');
  assert.equal(bundle.sourceSha, POSTGRES_SOURCE_SHA);
  assert.equal(bundle.providerIntegration, 'NOT_VERIFIED_HOLD');
  assert.equal(bundle.activationAuthorized, false);
  verifyAutonomousRuntimeEvidenceBundle(bundle);
  assert.throws(() => assembleAutonomousRuntimeEvidenceBundle({
    postgresEvidenceReceipt: postgresEvidenceReceipt(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    expectedSourceSha: '9'.repeat(40), expectedMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    assembledAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_POSTGRES_RECEIPT_SOURCE_SHA_INVALID/);
  const substituted = credentialInjectionEvidenceReceipt();
  substituted.sourceSha = '7'.repeat(40);
  substituted.receiptDigest = digestObject(Object.fromEntries(Object.entries(substituted)
    .filter(([key]) => key !== 'receiptDigest')));
  assert.throws(() => assembleAutonomousRuntimeEvidenceBundle({
    postgresEvidenceReceipt: postgresEvidenceReceipt(), credentialInjectionEvidence: substituted,
    expectedSourceSha: POSTGRES_SOURCE_SHA,
    expectedMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    assembledAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /BOUNDED_CREDENTIAL_INJECTION_EVIDENCE_SOURCE_INVALID/);
});

test('shadow trigger dry-run and soak remain non-mutating and registration-held', () => {
  const bundle = assembleAutonomousRuntimeEvidenceBundle({
    postgresEvidenceReceipt: postgresEvidenceReceipt(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    expectedSourceSha: POSTGRES_SOURCE_SHA,
    expectedMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    assembledAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  const dryRuns = [1, 2, 3].map(offset => runAutonomousRuntimeShadowTriggerDryRun({
    evidenceBundle: bundle,
    assessedAt: new Date(base.getTime() + offset * 60000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }));
  assert.equal(dryRuns[0].state, 'SHADOW_TRIGGER_DRY_RUN_READY');
  assert.equal(dryRuns[0].externalMutation, false);
  assert.equal(dryRuns[0].automaticTrigger, 'NOT_REGISTERED_HOLD');
  verifyAutonomousRuntimeShadowTriggerDryRun(dryRuns[0]);
  const verdict = evaluateAutonomousRuntimeShadowSoak({ dryRunReceipts: dryRuns,
    evaluatedAt: new Date(base.getTime() + 240000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  assert.equal(verdict.state, 'SHADOW_SOAK_VERIFIED_REGISTRATION_HOLD');
  assert.equal(verdict.sampleCount, 3);
  assert.equal(verdict.containmentRecoveryVerified, true);
  assert.equal(verdict.activationAuthorized, false);
  verifyAutonomousRuntimeShadowSoakVerdict(verdict);
  assert.throws(() => evaluateAutonomousRuntimeShadowSoak({
    dryRunReceipts: dryRuns.slice(0, 2), evaluatedAt: verdict.evaluatedAt,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_SHADOW_SOAK_SAMPLE_COUNT_INVALID/);
  assert.throws(() => evaluateAutonomousRuntimeShadowSoak({
    dryRunReceipts: [dryRuns[0], dryRuns[0], dryRuns[2]], evaluatedAt: verdict.evaluatedAt,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /AUTONOMOUS_SHADOW_SOAK_TIME_ORDER_INVALID/);
  assert.throws(() => verifyAutonomousRuntimeShadowSoakVerdict({
    ...verdict, activationAuthorized: true,
  }), /AUTONOMOUS_SHADOW_SOAK_AUTHORITY_INVALID/);
});

test('registration package cannot self-register and activation gate requires external receipt', () => {
  const bundle = assembleAutonomousRuntimeEvidenceBundle({
    postgresEvidenceReceipt: postgresEvidenceReceipt(),
    credentialInjectionEvidence: credentialInjectionEvidenceReceipt(),
    expectedSourceSha: POSTGRES_SOURCE_SHA,
    expectedMigrationDigest: POSTGRES_MIGRATION_DIGEST,
    assembledAt: base.toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  const dryRuns = [1, 2, 3].map(offset => runAutonomousRuntimeShadowTriggerDryRun({
    evidenceBundle: bundle,
    assessedAt: new Date(base.getTime() + offset * 60000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }));
  const soakVerdict = evaluateAutonomousRuntimeShadowSoak({ dryRunReceipts: dryRuns,
    evaluatedAt: new Date(base.getTime() + 240000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  const registration = createAutonomousTriggerRegistrationPackage({
    evidenceBundle: bundle, soakVerdict,
    workflowPath: '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml',
    schedule: '17 3 * * *', createdAt: new Date(base.getTime() + 300000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.equal(registration.registrationPerformed, false);
  assert.equal(registration.automaticTrigger, 'NOT_REGISTERED_HOLD');
  verifyAutonomousTriggerRegistrationPackage(registration);
  const held = assessAutonomousRuntimeActivationGate({ registrationPackage: registration,
    registrationReceipt: null, assessedAt: new Date(base.getTime() + 360000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  assert.equal(held.state, 'ACTIVATION_HOLD');
  assert.deepEqual(held.blockers, ['EXTERNAL_TRIGGER_REGISTRATION_REQUIRED']);
  assert.equal(held.governedCanaryEligible, false);
  const externalUnsigned = {
    contractId: 'kidults-external-trigger-registration-receipt-v1', version: '1.0.0',
    state: 'EXTERNAL_REGISTRATION_VERIFIED', sourceSha: registration.sourceSha,
    registrationPackageDigest: registration.packageDigest,
    workflowPath: registration.workflowPath, triggerClass: registration.triggerClass,
    schedule: registration.schedule,
    registeredAt: new Date(base.getTime() + 330000).toISOString(),
    registrar: 'github-actions-control-plane', externalRegistrationVerified: true,
    automaticTrigger: 'REGISTERED_PROTECTED_HOLD', activationAuthorized: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const externalReceipt = { ...externalUnsigned,
    receiptDigest: digestObject(externalUnsigned) };
  verifyExternalAutonomousTriggerRegistrationReceipt(externalReceipt);
  const eligible = assessAutonomousRuntimeActivationGate({ registrationPackage: registration,
    registrationReceipt: externalReceipt,
    assessedAt: new Date(base.getTime() + 360000).toISOString(),
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' });
  assert.equal(eligible.state, 'ELIGIBLE_FOR_GOVERNED_CANARY');
  assert.equal(eligible.governedCanaryEligible, true);
  assert.equal(eligible.activationAuthorized, false);
  verifyAutonomousRuntimeActivationGate(eligible);
  assert.throws(() => assessAutonomousRuntimeActivationGate({
    registrationPackage: registration,
    registrationReceipt: { ...externalReceipt,
      registrationPackageDigest: digestObject({ substituted: true }) },
    assessedAt: eligible.assessedAt,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  }), /EXTERNAL_AUTONOMOUS_TRIGGER_REGISTRATION_RECEIPT_BINDING_INVALID|INTEGRITY_INVALID/);
});

test('launcher consumes exact current authority before existing admission and execution', async () => {
  const value = await fixture();
  const result = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  assert.equal(result.state, 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED');
  assert.equal(result.execution.state, 'ADMITTED_AND_EXECUTED');
  assert.equal(value.client.state.approvalConsumptions.length, 1);
  assert.equal(value.client.state.invocationConsumptions.length, 1);
  assert.equal(result.receipt.requestDigest, value.request.requestDigest);
  assert.deepEqual(result.evidence, {
    state: 'VERIFIED_LOCAL_OPERATIONAL_EVIDENCE_CHAIN',
    requestDigest: value.request.requestDigest,
    launcherReceiptDigest: result.receipt.receiptDigest,
    supervisorReceiptDigest: result.execution.supervisor.receipt.receiptDigest,
    supervisorState: 'IDLE_DRAINED', lastTickState: 'CYCLE_IDLE',
    tickCount: 1, executedTaskCount: 0, recoveryCount: 0, quarantineCount: 0,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.deepEqual(result.operationalStatus, {
    state: 'LOCAL_SYNTHETIC_OPERATIONAL_STATUS', health: 'HEALTHY',
    supervisorState: 'IDLE_DRAINED', lastTickState: 'CYCLE_IDLE',
    tickCount: 1, executedTaskCount: 0, recoveryCount: 0, quarantineCount: 0,
    sourceEvidenceDigest: result.receipt.receiptDigest,
    authoritative: false, activationAuthority: false,
    automaticTrigger: 'NOT_REGISTERED_HOLD', remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.deepEqual(result.controlTowerObservation, {
    id: 'autonomous-control-local-synthetic', state: 'HEALTHY',
    supervisorState: 'IDLE_DRAINED', lastTickState: 'CYCLE_IDLE',
    tickCount: 1, executedTaskCount: 0, recoveryCount: 0, quarantineCount: 0,
    sourceEvidenceDigest: result.receipt.receiptDigest,
    surface: 'CONTROL_TOWER_READ_ONLY_OBSERVATION', action: 'OBSERVE_ONLY',
    authoritative: false, activationAuthority: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.deepEqual(result.containmentRecommendation, {
    state: 'LOCAL_SYNTHETIC_CONTAINMENT_RECOMMENDATION',
    recommendation: 'CONTINUE', reason: 'VERIFIED_HEALTHY',
    sourceObservationId: 'autonomous-control-local-synthetic',
    sourceEvidenceDigest: result.receipt.receiptDigest,
    automaticActionTaken: false, authoritative: false, activationAuthority: false,
    mutationAllowed: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  assert.equal(result.containmentActionPackage, null);
  verifyAutonomousLauncherReceipt(result.receipt);
  assert.throws(() => verifyAutonomousLauncherReceipt({ ...result.receipt, production: 'ACTIVE' }),
    /AUTONOMOUS_LAUNCHER_PROTECTED_GATE_INVALID/);
  assert.throws(() => projectAutonomousOperationalStatus({
    ...result.evidence, production: 'ACTIVE',
  }), /AUTONOMOUS_STATUS_PROTECTED_GATE_INVALID/);
  assert.throws(() => projectAutonomousControlTowerObservation({
    ...result.operationalStatus, activationAuthority: true,
  }), /AUTONOMOUS_STATUS_AUTHORITY_INVALID/);
});

test('PostgreSQL launcher shares one bounded connection across the governed chain', async () => {
  const value = await fixture('supervisor-command:postgres-launcher');
  const events = [];
  const result = await runPostgresAutonomousLauncher({
    postgres: { opaque: 'connector-owned' }, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock(),
  }, { connect: async options => {
    events.push(['connect', options]);
    return {
      query: (...args) => value.client.query(...args),
      close: async () => { events.push(['close']); },
    };
  } });
  assert.equal(result.state, 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED');
  assert.equal(result.execution.state, 'ADMITTED_AND_EXECUTED');
  assert.equal(value.client.state.approvalConsumptions.length, 1);
  assert.equal(value.client.state.invocationConsumptions.length, 1);
  assert.deepEqual(events, [['connect', { opaque: 'connector-owned' }], ['close']]);
});

test('PostgreSQL launcher denies every caller client substitution before connecting', async () => {
  for (const key of ['authorityClient', 'admissionClient', 'taskClient', 'proofClient',
    'containmentClient']) {
    let connected = false;
    await assert.rejects(runPostgresAutonomousLauncher({
      postgres: {}, [key]: fakeAutonomousTaskClient(),
    }, { connect: async () => { connected = true; throw new Error('CONNECT_MUST_NOT_RUN'); } }),
    /AUTONOMOUS_LAUNCHER_POSTGRES_CLIENT_OVERRIDE_DENIED/);
    assert.equal(connected, false);
  }
});

test('protected entry admits one exact unexpired source-bound manifest', async () => {
  const value = await fixture('supervisor-command:protected-launcher');
  const sourceSha = '1'.repeat(40);
  const manifest = createProtectedAutonomousLaunchManifest({ sourceSha,
    trust: value.trust, request: value.request, decision: value.decision,
    controlState: control(), issuedAt: base.toISOString(),
    expiresAt: new Date(base.getTime() + 300000).toISOString() });
  verifyProtectedAutonomousLaunchManifest(manifest, new Date(base.getTime() + 1000));
  const events = [];
  const result = await runProtectedPostgresAutonomousLauncher({
    postgres: { opaque: 'protected-connector' }, manifest,
  }, { now: () => new Date(base.getTime() + 1000), currentSourceSha: async () => sourceSha,
    clock: clock(),
    connect: async options => {
      events.push(['connect', options]);
      return { query: (...args) => value.client.query(...args),
        close: async () => { events.push(['close']); } };
  } });
  assert.equal(result.state, 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED');
  assert.equal(events[0][0], 'connect');
  assert.equal(events[0][1].opaque, 'protected-connector');
  assert.deepEqual(events[1], ['close']);
});

test('protected entry rejects expired, substituted, or mismatched source before connecting', async () => {
  const value = await fixture('supervisor-command:protected-reject');
  const sourceSha = '2'.repeat(40);
  const manifest = createProtectedAutonomousLaunchManifest({ sourceSha,
    trust: value.trust, request: value.request, decision: value.decision,
    controlState: control(), issuedAt: base.toISOString(),
    expiresAt: new Date(base.getTime() + 300000).toISOString() });
  let connected = false;
  const dependencies = { now: () => new Date(base.getTime() + 1000),
    currentSourceSha: async () => '3'.repeat(40),
    connect: async () => { connected = true; throw new Error('CONNECT_MUST_NOT_RUN'); } };
  await assert.rejects(runProtectedPostgresAutonomousLauncher({ postgres: {}, manifest },
    dependencies), /PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_MISMATCH/);
  await assert.rejects(runProtectedPostgresAutonomousLauncher({ postgres: {}, manifest: {
    ...manifest, automaticTrigger: 'REGISTERED',
  } }, dependencies), /PROTECTED_AUTONOMOUS_LAUNCH_AUTHORITY_INVALID/);
  await assert.rejects(runProtectedPostgresAutonomousLauncher({ postgres: {}, manifest }, {
    ...dependencies, now: () => new Date(base.getTime() + 300000),
  }), /PROTECTED_AUTONOMOUS_LAUNCH_MANIFEST_EXPIRED/);
  assert.equal(connected, false);
});

test('credential-injected entry resolves PostgreSQL only after manifest and source verification', async () => {
  const value = await fixture('supervisor-command:credential-launcher');
  const sourceSha = '4'.repeat(40);
  const manifest = createProtectedAutonomousLaunchManifest({ sourceSha,
    trust: value.trust, request: value.request, decision: value.decision,
    controlState: control(), issuedAt: base.toISOString(),
    expiresAt: new Date(base.getTime() + 300000).toISOString() });
  assert.equal(JSON.stringify(manifest).includes('postgresql://'), false);
  const events = [];
  const result = await runCredentialInjectedProtectedPostgresLauncher({ manifest }, {
    now: () => new Date(base.getTime() + 1000), currentSourceSha: async () => sourceSha,
    clock: clock(), evidenceObservedAt: () => new Date(base.getTime() + 2000),
    resolvePostgresCredential: async request => {
      events.push(['resolve', request]);
      return { dsn: 'postgresql://user:secret@db.example/runtime?sslmode=verify-full',
        applicationName: request.applicationName, connectTimeoutMs: 5000,
        statementTimeoutMs: 10000 };
    }, connect: async options => {
      events.push(['connect', options.applicationName]);
      return { query: (...args) => value.client.query(...args),
        close: async () => { events.push(['close']); } };
    } });
  assert.equal(result.state, 'LOCAL_SYNTHETIC_EXECUTED_AUTHORITY_CONSUMED');
  assert.equal(result.manifestConsumption.state, 'CONSUMED_SINGLE_USE_MANIFEST');
  assert.equal(value.client.state.protectedLaunchManifestConsumptions.length, 1);
  assert.equal(events.filter(([event]) => event === 'resolve').length, 1);
  assert.deepEqual(events.slice(1), [
    ['connect', 'kidults-autonomous-protected-launcher-v1'], ['close'],
  ]);
  assert.equal(result.credentialInjectionEvidence.sourceSha, sourceSha);
  assert.equal(result.credentialInjectionEvidence.resolutionCount, 1);
  verifyBoundedCredentialInjectionEvidence(result.credentialInjectionEvidence, {
    expectedSourceSha: sourceSha,
  });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('credential-injected entry durably holds exact manifest replay before authority', async () => {
  const value = await fixture('supervisor-command:credential-replay');
  const sourceSha = '7'.repeat(40);
  const manifest = createProtectedAutonomousLaunchManifest({ sourceSha,
    trust: value.trust, request: value.request, decision: value.decision,
    controlState: control(), issuedAt: base.toISOString(),
    expiresAt: new Date(base.getTime() + 300000).toISOString() });
  const dependencies = { now: () => new Date(base.getTime() + 1000),
    currentSourceSha: async () => sourceSha, clock: clock(),
    resolvePostgresCredential: async () => ({
      dsn: 'postgresql://user:secret@db.example/runtime?sslmode=verify-full',
      applicationName: 'kidults-autonomous-protected-launcher-v1',
      connectTimeoutMs: 5000, statementTimeoutMs: 10000,
    }), connect: async () => ({ query: (...args) => value.client.query(...args),
      close: async () => {} }) };
  const first = await runCredentialInjectedProtectedPostgresLauncher({ manifest }, dependencies);
  const second = await runCredentialInjectedProtectedPostgresLauncher({ manifest }, dependencies);
  assert.equal(first.manifestConsumption.state, 'CONSUMED_SINGLE_USE_MANIFEST');
  assert.equal(second.state, 'MANIFEST_ALREADY_CONSUMED_HOLD');
  assert.equal(second.manifestConsumption.state, 'MANIFEST_ALREADY_CONSUMED_HOLD');
  assert.equal(second.authority, null);
  assert.equal(second.execution, null);
  assert.equal(value.client.state.protectedLaunchManifestConsumptions.length, 1);
  assert.equal(value.client.state.invocationConsumptions.length, 1);
});

test('credential resolution is skipped for invalid source and failures expose no raw secret', async () => {
  const value = await fixture('supervisor-command:credential-reject');
  const sourceSha = '5'.repeat(40);
  const manifest = createProtectedAutonomousLaunchManifest({ sourceSha,
    trust: value.trust, request: value.request, decision: value.decision,
    controlState: control(), issuedAt: base.toISOString(),
    expiresAt: new Date(base.getTime() + 300000).toISOString() });
  let resolutions = 0;
  await assert.rejects(runCredentialInjectedProtectedPostgresLauncher({ manifest }, {
    now: () => new Date(base.getTime() + 1000),
    currentSourceSha: async () => '6'.repeat(40),
    resolvePostgresCredential: async () => { resolutions += 1; return {}; },
  }), /PROTECTED_AUTONOMOUS_LAUNCH_SOURCE_MISMATCH/);
  assert.equal(resolutions, 0);
  const failure = await runCredentialInjectedProtectedPostgresLauncher({ manifest }, {
    now: () => new Date(base.getTime() + 1000), currentSourceSha: async () => sourceSha,
    resolvePostgresCredential: async () => {
      throw new Error('postgresql:\/\/user:raw-secret@db.example/runtime');
    },
  }).catch(error => error);
  assert.equal(failure.message, 'PROTECTED_AUTONOMOUS_CREDENTIAL_RESOLUTION_FAILED');
  assert.equal(failure.message.includes('raw-secret'), false);
});

test('containment recommendation is bounded to continue, quarantine, or stop', async () => {
  const value = await fixture('supervisor-command:launcher-containment');
  const result = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  const healthy = verifyAutonomousControlTowerObservation(result.controlTowerObservation);
  const continueRecommendation = recommendAutonomousContainment(healthy);
  const quarantineRecommendation = recommendAutonomousContainment({ ...healthy,
    state: 'QUARANTINED', quarantineCount: 1 });
  const stopRecommendation = recommendAutonomousContainment({ ...healthy,
    state: 'FAIL_CLOSED', supervisorState: 'FAIL_CLOSED_ERROR_STOP' });
  assert.equal(verifyAutonomousContainmentRecommendation(continueRecommendation).recommendation,
    'CONTINUE');
  assert.deepEqual(quarantineRecommendation, { ...result.containmentRecommendation,
    recommendation: 'QUARANTINE', reason: 'QUARANTINED_OUTPUT_PRESENT' });
  assert.deepEqual(stopRecommendation, { ...result.containmentRecommendation,
    recommendation: 'STOP', reason: 'FAIL_CLOSED_SUPERVISOR' });
  assert.equal(createAutonomousContainmentActionPackage(continueRecommendation), null);
  const quarantinePackage = createAutonomousContainmentActionPackage(quarantineRecommendation);
  assert.equal(quarantinePackage.action, 'QUARANTINE');
  assert.equal(quarantinePackage.authorityClass, 'PROTECTED_ACTION_PACKAGE');
  assert.equal(quarantinePackage.automaticActionTaken, false);
  assert.equal(quarantinePackage.mutationAllowed, false);
  const stopPackage = verifyAutonomousContainmentActionPackage(
    createAutonomousContainmentActionPackage(stopRecommendation),
    stopRecommendation,
  );
  assert.equal(stopPackage.action, 'STOP');
  assert.equal(stopPackage.subjectType, 'PROTECTED_ACTION_PACKAGE');
  assert.throws(() => recommendAutonomousContainment({ ...healthy, mutationAllowed: true }),
    /AUTONOMOUS_CONTROL_TOWER_OBSERVATION_AUTHORITY_INVALID/);
  assert.throws(() => recommendAutonomousContainment({ ...healthy, state: 'FAIL_CLOSED' }),
    /AUTONOMOUS_CONTROL_TOWER_OBSERVATION_STATE_BINDING_INVALID/);
  assert.throws(() => verifyAutonomousContainmentRecommendation({
    ...stopRecommendation, recommendation: 'CONTINUE',
  }), /AUTONOMOUS_CONTAINMENT_RECOMMENDATION_BINDING_INVALID/);
  assert.throws(() => verifyAutonomousContainmentActionPackage({
    ...stopPackage, mutationAllowed: true,
  }, stopRecommendation), /AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_AUTHORITY_INVALID/);
  assert.throws(() => verifyAutonomousContainmentActionPackage({
    ...stopPackage, subjectDigest: digestObject({ substituted: true }),
  }, stopRecommendation), /AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_BINDING_INVALID/);
  assert.throws(() => verifyAutonomousContainmentActionPackage(stopPackage,
    quarantineRecommendation), /AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_BINDING_INVALID/);
});

test('containment approval consumes exact KPMO and Program Owner authority once', async () => {
  const value = await fixture('supervisor-command:launcher-containment-approval');
  const result = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  const recommendation = recommendAutonomousContainment({ ...result.controlTowerObservation,
    state: 'FAIL_CLOSED', supervisorState: 'FAIL_CLOSED_ERROR_STOP' });
  const actionPackage = createAutonomousContainmentActionPackage(recommendation);
  const trust = protectedTrust(value, actionPackage);
  const approved = await consumeAutonomousContainmentApproval(value.client, {
    actionPackage, recommendation, trust, now: new Date(base.getTime() + 60000),
  });
  assert.equal(approved.state, 'APPROVAL_CONSUMED_NO_ACTION_TAKEN');
  assert.equal(approved.receipt.action, 'STOP');
  assert.equal(approved.receipt.automaticActionTaken, false);
  assert.equal(approved.receipt.activationAuthorized, false);
  verifyAutonomousContainmentApprovalReceipt(approved.receipt);
  const fence = approved.fence;
  assert.equal(verifyAutonomousContainmentFence(fence).allowInvocation, false);
  const approvalConsumptionsBeforeFence = value.client.state.approvalConsumptions.length;
  const invocationConsumptionsBeforeFence = value.client.state.invocationConsumptions.length;
  const blocked = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(),
    containmentFence: createAutonomousContainmentFence(), clock: clock() });
  assert.equal(blocked.state, 'CONTAINMENT_STOP_HOLD');
  assert.equal(blocked.execution, null);
  assert.equal(value.client.state.approvalConsumptions.length, approvalConsumptionsBeforeFence);
  assert.equal(value.client.state.invocationConsumptions.length, invocationConsumptionsBeforeFence);
  assert.equal(value.client.state.containmentFenceEvents.length, 1);
  assert.equal(value.client.state.approvalConsumptions.length, 2);
  const replay = await consumeAutonomousContainmentApproval(value.client, {
    actionPackage, recommendation, trust, now: new Date(base.getTime() + 60000),
  });
  assert.equal(replay.state, 'CONTAINMENT_APPROVAL_ALREADY_CONSUMED_HOLD');
  assert.equal(replay.receipt, null);
  assert.equal(value.client.state.approvalConsumptions.length, 2);
  await assert.rejects(consumeAutonomousContainmentApproval(value.client, {
    actionPackage: { ...actionPackage, subjectId: 'autonomous-containment:substituted' },
    recommendation, trust, now: new Date(base.getTime() + 60000),
  }), /AUTONOMOUS_CONTAINMENT_ACTION_PACKAGE_BINDING_INVALID/);
  await assert.rejects(consumeAutonomousContainmentApproval(value.client, {
    actionPackage, recommendation, trust, now: new Date(base.getTime() + 304000),
  }), /APPROVAL_ENVELOPE_EXPIRED_OR_NOT_YET_VALID/);
  assert.throws(() => verifyAutonomousContainmentFence({ ...fence, allowInvocation: true }),
    /AUTONOMOUS_CONTAINMENT_FENCE_BINDING_INVALID/);

  const releasePackage = createAutonomousContainmentReleasePackage(fence);
  const releaseTrust = protectedTrust(value, releasePackage, 'containment-release');
  const released = await consumeAutonomousContainmentReleaseApproval(value.client, {
    releasePackage, previousFence: fence, trust: releaseTrust,
    now: new Date(base.getTime() + 60000),
  });
  assert.equal(released.state, 'APPROVED_RELEASE_RECORDED');
  assert.equal(released.fence.state, 'APPROVED_CONTAINMENT_RELEASED');
  assert.equal(released.fence.allowInvocation, true);
  assert.equal(released.fence.previousFenceDigest, fence.fenceDigest);
  assert.deepEqual(value.client.state.containmentFenceEvents.map(row => row.event_sequence), [1, 2]);
  verifyAutonomousContainmentReleaseReceipt(released.receipt);
  assert.throws(() => verifyAutonomousContainmentReleaseReceipt({
    ...released.receipt, previousFenceDigest: digestObject({ substituted: true }),
  }), /AUTONOMOUS_CONTAINMENT_RELEASE_RECEIPT_INTEGRITY_INVALID/);
  assert.throws(() => verifyAutonomousContainmentReleasePackage({
    ...releasePackage,
    requestedCapabilities: { ...releasePackage.requestedCapabilities, providerContact: 'HOLD' },
  }, fence), /AUTONOMOUS_CONTAINMENT_RELEASE_PACKAGE_BINDING_INVALID/);
  const afterRelease = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  assert.equal(afterRelease.state, 'AUTHORITY_ALREADY_CONSUMED_HOLD');
  assert.equal(value.client.state.containmentFenceEvents.length, 2);

  const staleTrust = protectedTrust(value, releasePackage, 'containment-release-stale');
  await assert.rejects(consumeAutonomousContainmentReleaseApproval(value.client, {
    releasePackage, previousFence: fence, trust: staleTrust,
    now: new Date(base.getTime() + 60000),
  }), /AUTONOMOUS_CONTAINMENT_RELEASE_STALE_FENCE/);
  assert.equal(value.client.state.approvalConsumptions.length, 3);
});

test('containment approval and active fence persist atomically or both roll back', async () => {
  const value = await fixture('supervisor-command:launcher-containment-atomic');
  const result = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  const recommendation = recommendAutonomousContainment({ ...result.controlTowerObservation,
    state: 'FAIL_CLOSED', supervisorState: 'FAIL_CLOSED_ERROR_STOP' });
  const actionPackage = createAutonomousContainmentActionPackage(recommendation);
  const trust = protectedTrust(value, actionPackage, 'containment-atomic-failure');
  value.client.state.forceContainmentFenceInsertFailure = true;
  await assert.rejects(consumeAutonomousContainmentApproval(value.client, {
    actionPackage, recommendation, trust, now: new Date(base.getTime() + 60000),
  }), /FORCED_CONTAINMENT_FENCE_INSERT_FAILURE/);
  assert.equal(value.client.state.approvalConsumptions.length, 1);
  assert.equal(value.client.state.containmentFenceEvents.length, 0);
});

test('operational evidence rejects a substituted tick in the launcher chain', async () => {
  const value = await fixture('supervisor-command:launcher-evidence-tamper');
  const result = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  const tamperedSupervisor = structuredClone(result.execution.supervisor);
  tamperedSupervisor.ticks[0].receipt.receiptDigest = digestObject({ substituted: true });
  assert.throws(() => verifyAutonomousOperationalEvidence({ request: value.request,
    decision: value.decision, launcherReceipt: result.receipt,
    authorityVerificationReceipt: result.authority.verificationReceipt,
    authorityConsumptionReceipt: result.authority.consumptionReceipt,
    invocationConsumptionReceipt: result.execution.admissionReceipt,
    invocationExecutionReceipt: result.execution.executionReceipt,
    supervisor: tamperedSupervisor }), /CONTROL_TICK_RECEIPT_DIGEST_INVALID/);
});

test('launcher replay cannot create a second invocation or execute again', async () => {
  const value = await fixture('supervisor-command:launcher-replay');
  await runAutonomousLauncher({ authorityClient: value.client, admissionClient: value.client,
    taskClient: value.client, trust: value.trust, request: value.request,
    decision: value.decision, controlState: control(), clock: clock() });
  const replay = await runAutonomousLauncher({ authorityClient: value.client,
    admissionClient: value.client, taskClient: value.client, trust: value.trust,
    request: value.request, decision: value.decision, controlState: control(), clock: clock() });
  assert.equal(replay.state, 'AUTHORITY_ALREADY_CONSUMED_HOLD');
  assert.equal(replay.execution, null);
  assert.equal(value.client.state.approvalConsumptions.length, 1);
  assert.equal(value.client.state.invocationConsumptions.length, 1);
});

test('launcher rejects substituted subject and expired authority before invocation consumption', async () => {
  const substituted = await fixture('supervisor-command:launcher-substituted');
  const other = await fixture('supervisor-command:launcher-other');
  await assert.rejects(runAutonomousLauncher({ authorityClient: substituted.client,
    admissionClient: substituted.client, taskClient: substituted.client,
    trust: { ...substituted.trust, envelope: other.trust.envelope }, request: substituted.request,
    decision: substituted.decision, controlState: control(), clock: clock() }),
  /APPROVAL_CONSUMPTION_SUBJECT_BINDING_INVALID|APPROVAL_(TRUST_REGISTRY|ENVELOPE_TRUST_BINDING)/);
  assert.equal(substituted.client.state.invocationConsumptions.length, 0);

  const expired = await fixture('supervisor-command:launcher-expired');
  await assert.rejects(runAutonomousLauncher({ authorityClient: expired.client,
    admissionClient: expired.client, taskClient: expired.client, trust: expired.trust,
    request: expired.request, decision: expired.decision, controlState: control(),
    clock: clock(base.getTime() + 300000) }),
  /APPROVAL_ENVELOPE_EXPIRED/);
  assert.equal(expired.client.state.invocationConsumptions.length, 0);
});
