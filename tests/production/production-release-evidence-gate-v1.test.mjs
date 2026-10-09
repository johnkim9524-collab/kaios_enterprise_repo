import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  consumptionSigningPayload,
  evidenceBundleDigest,
  releaseNonceStoreKey,
  sha256Object,
  stableStringify,
  validateProgramOwnerReceipt,
  validateProgramOwnerSignature,
  validateReadinessDecision,
  validateTechnicalEvidence,
  verifySealedRelease,
} from '../../scripts/production/validate-kidults-production-release-v1.mjs';

const root = process.cwd();
const policyPath = path.join(root, 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json');
const promotionContractPath = path.join(root, 'contracts/certification/kidults-controlled-production-promotion.v1.json');
const legacyReadinessContractPath = path.join(root, 'contracts/certification/kidults-production-readiness-execution.v0.1.json');
const legacyRuntimeAuditContractPath = path.join(root, 'contracts/certification/kidults-production-runtime-audit.v0.1.json');
const legacyRuntimeAuditRunbookPath = path.join(root, 'docs/operations/sprint-19-a2-kidults-production-runtime-audit.md');
const readinessFinalizerPath = path.join(root, 'scripts/production/finalize-kidults-production-readiness.py');
const evidenceComposerPath = path.join(root, 'scripts/production/compose-kidults-production-readiness-evidence-v1.mjs');
const sqliteSnapshotHelperPath = path.join(root, 'scripts/production/capture-kidults-sqlite-snapshot-v1.py');
const snapshotCapturePath = path.join(root, 'scripts/production/capture-kidults-predeployment-snapshot.sh');
const policyRaw = fs.readFileSync(policyPath);
const policy = JSON.parse(policyRaw.toString('utf8'));
const promotionContract = JSON.parse(fs.readFileSync(promotionContractPath, 'utf8'));
const legacyReadinessContract = JSON.parse(fs.readFileSync(legacyReadinessContractPath, 'utf8'));
const legacyRuntimeAuditContract = JSON.parse(fs.readFileSync(legacyRuntimeAuditContractPath, 'utf8'));
const legacyRuntimeAuditRunbook = fs.readFileSync(legacyRuntimeAuditRunbookPath, 'utf8');
const sourceSha = '9a09dbf65b44755138ba8ba15ceeb3483d95e98d';
const digest = (label) => `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
const policySha256 = `sha256:${crypto.createHash('sha256').update(policyRaw).digest('hex')}`;
const evidenceSha256 = digest('technical-evidence-file');

const auxiliarySpecs = [
  ['production-audit.json', 'KIDULTS_PRODUCTION_AUDIT_EVIDENCE_V1', 'KIDULTS_PRODUCTION_AUDIT_COLLECTOR_V1'],
  ['production-rollback-rehearsal.json', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_EVIDENCE_V1', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_V1'],
  ['production-mobile-320.json', 'KIDULTS_PRODUCTION_MOBILE_320_EVIDENCE_V1', 'KIDULTS_PRODUCTION_MOBILE_CERTIFIER_V1'],
  ['production-governance-trust.json', 'KIDULTS_PRODUCTION_GOVERNANCE_TRUST_EVIDENCE_V1', 'KIDULTS_PRODUCTION_GOVERNANCE_CERTIFIER_V1'],
  ['production-observability.json', 'KIDULTS_PRODUCTION_OBSERVABILITY_EVIDENCE_V1', 'KIDULTS_PRODUCTION_OBSERVABILITY_CERTIFIER_V1'],
  ['production-incident-response.json', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_EVIDENCE_V1', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_CERTIFIER_V1'],
  ['staging-production-delta.json', 'KIDULTS_STAGING_PRODUCTION_DELTA_EVIDENCE_V1', 'KIDULTS_STAGING_PRODUCTION_DELTA_CERTIFIER_V1'],
];
const supportProducers = {
  OBSERVATION_LEDGER: 'KIDULTS_NATURAL_RUN_LEDGER_V1',
  BETA_RELIABILITY: 'KIDULTS_BETA_RELIABILITY_EVALUATOR_V1',
  SLO_ERROR_BUDGET: 'KIDULTS_SLO_ERROR_BUDGET_EVALUATOR_V1',
  PITR: 'KIDULTS_PITR_VERIFIER_V1',
  ROLLBACK: 'KIDULTS_ROLLBACK_VERIFIER_V1',
  NATURAL_RUN: 'KIDULTS_NATURAL_RUN_EXECUTOR_V1',
};

const rawJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

const validAuxiliaryEvidence = (member) => ({
  'production-audit.json': {
    status: 'pass',
    production_root: '/opt/intelligence-holdings/kidults/app',
    production_database: '/opt/intelligence-holdings/kidults/data/kaios.db',
    database_integrity: 'ok',
    database_checksum: 'a'.repeat(64),
    schema_checksum: 'b'.repeat(64),
    health_http: 200,
    unauthenticated_collector_http: 401,
    portal_http: 200,
    latest_backup_manifest: '/mnt/ih_prod_01/backups/kidults/latest.manifest.json',
    backup_age_seconds: 60,
    backup_integrity: 'ok',
    publication_promotion_authorized: false,
    artfund_production_promotion_authorized: false,
  },
  'production-rollback-rehearsal.json': {
    status: 'pass',
    rollback_rehearsal_passed: true,
    snapshot_manifest_sha256: digest('rollback-snapshot-manifest'),
    recovery_receipt_sha256: digest('rollback-recovery-receipt'),
    production_change_executed: false,
    artfund_production_promotion_authorized: false,
  },
  'production-mobile-320.json': {
    status: 'pass', viewport_width: 320, mobile_320_passed: true,
    overflow_detected: false, visual_evidence_sha256: digest('mobile-320-visual'),
  },
  'production-governance-trust.json': {
    status: 'pass', governance_gate_passed: true, policy_sha256: policySha256,
    rights_census_state: 'PASS', schema_census_state: 'PASS',
    publication_promotion_authorized: false,
  },
  'production-observability.json': {
    status: 'pass', observability_passed: true, slo_state: 'PASS',
    error_budget_state: 'WITHIN_BUDGET',
    observability_receipt_sha256: digest('observability-receipt'),
  },
  'production-incident-response.json': {
    status: 'pass', incident_response_ready: true, rollback_escalation_ready: true,
    artfund_isolated: true, drill_receipt_sha256: digest('incident-drill-receipt'),
  },
  'staging-production-delta.json': {
    status: 'pass', destructive_schema_delta: false, viewer_export_exposed: false,
    restricted_rights_exposed: false, rollback_rehearsal_passed: true,
    mobile_320_passed: true, governance_gate_passed: true,
    observability_passed: true, incident_response_ready: true, critical_deltas: [],
  },
}[member]);

const makeAuxiliaryMembers = (boundSourceSha) => {
  const rawByMember = new Map();
  const auxiliaryBindings = auxiliarySpecs.map(([member, schemaId, producerId]) => {
    const raw = rawJson({
      id: schemaId,
      version: '1.0.0',
      producer_id: producerId,
      source_sha: boundSourceSha,
      observed_at: '2026-08-08T12:30:00Z',
      state: 'VERIFIED',
      evidence: validAuxiliaryEvidence(member),
    });
    rawByMember.set(member, raw);
    return {
      member,
      schema_id: schemaId,
      schema_version: '1.0.0',
      producer_id: producerId,
      source_sha: boundSourceSha,
      sha256: digest(raw),
    };
  });
  return { rawByMember, auxiliaryBindings };
};

const makeSupportMembers = (entries, boundSourceSha) => {
  const rawByMember = new Map();
  const supportBindings = entries.map(({ kind, subjectId, member, evidence }) => {
    const raw = rawJson({
      id: 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1',
      version: '1.0.0',
      producer_id: supportProducers[kind],
      source_sha: boundSourceSha,
      observed_at: '2026-08-08T12:30:00Z',
      state: 'VERIFIED',
      evidence_kind: kind,
      subject_id: subjectId,
      evidence,
    });
    rawByMember.set(member, raw);
    return {
      evidence_kind: kind,
      subject_id: subjectId,
      member,
      schema_id: 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1',
      schema_version: '1.0.0',
      producer_id: supportProducers[kind],
      source_sha: boundSourceSha,
      sha256: digest(raw),
    };
  });
  return { rawByMember, supportBindings };
};

const iso = (milliseconds) => new Date(milliseconds).toISOString().replace('.000Z', 'Z');

const makeEvidenceFixture = (boundSourceSha = sourceSha) => {
  const observationStarted = Date.parse('2026-08-01T00:00:00Z');
  const observationEnded = Date.parse('2026-08-08T12:00:00Z');
  const naturalRunIds = Array.from({ length: 30 }, (_, index) => `natural-run-${String(index + 1).padStart(2, '0')}`);
  const cohort = {
    cohort_sha256: digest('cohort'),
    rights_census_sha256: digest('rights'),
    schema_census_sha256: digest('schema'),
    rights_census_state: 'PASS',
    schema_census_state: 'PASS',
  };
  const pitrEvidence = {
    pitr_status: 'VERIFIED',
    pitr_source_system: 'POSTGRESQL_CANONICAL_SYSTEM_OF_RECORD',
    pitr_restore_target_is_isolated: true,
    pitr_verified_at: '2026-07-31T12:00:00Z',
    pitr_restore_point_at: '2026-07-31T11:45:00Z',
  };
  const rollbackEvidence = {
    rollback_status: 'VERIFIED',
    rollback_target: 'CONTROLLED_PRODUCTION_RUNTIME',
    rollback_verified_at: '2026-07-31T13:00:00Z',
  };
  const naturalRunEvidence = naturalRunIds.map((naturalRunId, index) => {
    const slot = observationStarted + index * 6 * 60 * 60 * 1000;
    return {
      natural_run_id: naturalRunId,
      workflow_run_id: String(100000 + index),
      run_attempt: 1,
      logical_schedule_slot: iso(slot),
      started_at: iso(slot + 60 * 1000),
      completed_at: iso(slot + 5 * 60 * 1000),
      trigger: 'schedule',
      conclusion: 'success',
      source_sha: boundSourceSha,
      policy_sha256: policySha256,
      cohort_sha256: cohort.cohort_sha256,
      rights_census_sha256: cohort.rights_census_sha256,
      schema_census_sha256: cohort.schema_census_sha256,
      rights_census_state: 'PASS',
      schema_census_state: 'PASS',
      slo_state: 'PASS',
      error_budget_state: 'WITHIN_BUDGET',
      pitr_receipt_sha256: null,
      rollback_receipt_sha256: null,
    };
  });
  const observationEvidence = {
    pre_registered_at: '2026-07-31T00:00:00Z',
    started_at: iso(observationStarted),
    ended_at: iso(observationEnded),
    selection_rule: 'ALL_ELIGIBLE_FIRST_ATTEMPT_SCHEDULED_RUNS_IN_PRE_REGISTERED_WINDOW',
    ledger_complete: true,
    eligible_run_count: naturalRunEvidence.length,
    failed_run_count: 0,
    retry_count: 0,
  };
  const betaEvidence = {
    tier: 'BETA_RELIABILITY',
    effective_n: 4603,
    critical_defects: 0,
    major_a_defects: 0,
    major_b_defects: 0,
    operational_defects: 0,
    track_b_decision: 'PASS',
    rights_census_state: 'PASS',
    schema_census_state: 'PASS',
    coverage_gate_state: 'PASS',
    concentration_gate_state: 'PASS',
    cohort_sha256: cohort.cohort_sha256,
    rights_census_sha256: cohort.rights_census_sha256,
    schema_census_sha256: cohort.schema_census_sha256,
  };
  const sloEvidence = {
    status: 'PASS',
    measurement_started_at: iso(observationStarted),
    measurement_ended_at: iso(observationEnded),
    minimum_sample_size_met: true,
    slo_target_ratio: 0.99,
    observed_availability_ratio: 0.999,
    error_budget_status: 'WITHIN_BUDGET',
    error_budget_remaining_ratio: 0.5,
    maximum_error_budget_burn_rate: 1,
    observed_error_budget_burn_rate: 0.5,
  };
  const placeholderPitr = digest('pitr-placeholder');
  const placeholderRollback = digest('rollback-placeholder');
  for (const run of naturalRunEvidence) {
    run.pitr_receipt_sha256 = placeholderPitr;
    run.rollback_receipt_sha256 = placeholderRollback;
  }
  const initialSupportEntries = [
    { kind: 'OBSERVATION_LEDGER', subjectId: 'observation_ledger', member: 'support/observation-ledger-receipt-v1.json', evidence: { observation_window: observationEvidence, natural_run_partition: naturalRunEvidence.map(({ natural_run_id, workflow_run_id, run_attempt, logical_schedule_slot }) => ({ natural_run_id, workflow_run_id, run_attempt, logical_schedule_slot })) } },
    { kind: 'BETA_RELIABILITY', subjectId: 'beta_reliability', member: 'support/beta-reliability-receipt-v1.json', evidence: betaEvidence },
    { kind: 'SLO_ERROR_BUDGET', subjectId: 'slo_error_budget', member: 'support/slo-error-budget-receipt-v1.json', evidence: sloEvidence },
    { kind: 'PITR', subjectId: 'pitr', member: 'support/pitr-receipt-v1.json', evidence: pitrEvidence },
    { kind: 'ROLLBACK', subjectId: 'rollback', member: 'support/rollback-receipt-v1.json', evidence: rollbackEvidence },
  ];
  const recoverySupport = makeSupportMembers(initialSupportEntries.slice(3), boundSourceSha);
  const supportDigestFrom = (fixture, kind, subjectId) => fixture.supportBindings.find((binding) => binding.evidence_kind === kind && binding.subject_id === subjectId).sha256;
  const pitrReceiptSha256 = supportDigestFrom(recoverySupport, 'PITR', 'pitr');
  const rollbackReceiptSha256 = supportDigestFrom(recoverySupport, 'ROLLBACK', 'rollback');
  for (const run of naturalRunEvidence) {
    run.pitr_receipt_sha256 = pitrReceiptSha256;
    run.rollback_receipt_sha256 = rollbackReceiptSha256;
  }
  initialSupportEntries[0].evidence.natural_run_partition = naturalRunEvidence.map(({ natural_run_id, workflow_run_id, run_attempt, logical_schedule_slot }) => ({ natural_run_id, workflow_run_id, run_attempt, logical_schedule_slot }));
  const supportEntries = [
    ...initialSupportEntries,
    ...naturalRunEvidence.map((run) => ({ kind: 'NATURAL_RUN', subjectId: run.natural_run_id, member: `support/natural-runs/${run.natural_run_id}.json`, evidence: run })),
  ];
  const supportFixture = makeSupportMembers(supportEntries, boundSourceSha);
  const supportDigest = (kind, subjectId) => supportDigestFrom(supportFixture, kind, subjectId);
  const naturalRuns = naturalRunEvidence.map((run) => ({ ...run, receipt_sha256: supportDigest('NATURAL_RUN', run.natural_run_id) }));
  const recovery = {
    ...pitrEvidence,
    pitr_receipt_sha256: pitrReceiptSha256,
    ...rollbackEvidence,
    rollback_receipt_sha256: rollbackReceiptSha256,
  };
  const auxiliaryFixture = makeAuxiliaryMembers(boundSourceSha);
  const evidence = {
    id: 'KIDULTS_PRODUCTION_READINESS_EVIDENCE_V1',
    version: '1.0.0',
    source_sha: boundSourceSha,
    policy_binding: {
      path: 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json',
      id: policy.id,
      version: policy.version,
      sha256: policySha256,
    },
    auxiliary_evidence_bindings: auxiliaryFixture.auxiliaryBindings,
    support_evidence_bindings: supportFixture.supportBindings,
    observation_window: {
      ...observationEvidence,
      ledger_receipt_sha256: supportDigest('OBSERVATION_LEDGER', 'observation_ledger'),
    },
    cohort_binding: cohort,
    beta_reliability: {
      ...betaEvidence,
      receipt_sha256: supportDigest('BETA_RELIABILITY', 'beta_reliability'),
    },
    natural_runs: naturalRuns,
    slo_error_budget: {
      ...sloEvidence,
      receipt_sha256: supportDigest('SLO_ERROR_BUDGET', 'slo_error_budget'),
    },
    recovery,
  };
  return { evidence, rawByMember: new Map([...auxiliaryFixture.rawByMember, ...supportFixture.rawByMember]) };
};

const makeEvidence = () => makeEvidenceFixture().evidence;

const writeEvidenceDirectory = (evidenceDir, fixture) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const [member, raw] of fixture.rawByMember) {
    const memberPath = path.join(evidenceDir, member);
    fs.mkdirSync(path.dirname(memberPath), { recursive: true });
    fs.writeFileSync(memberPath, raw);
  }
  fs.writeFileSync(path.join(evidenceDir, 'production-readiness-evidence-v1.json'), rawJson(fixture.evidence));
};

test('evidence composer derives delta and technical evidence from exact-SHA receipts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-evidence-composer-'));
  try {
    const fixture = makeEvidenceFixture();
    writeEvidenceDirectory(directory, fixture);
    const delta = JSON.parse(fixture.rawByMember.get('staging-production-delta.json'));
    fs.unlinkSync(path.join(directory, 'staging-production-delta.json'));
    fs.unlinkSync(path.join(directory, 'production-readiness-evidence-v1.json'));
    const result = spawnSync(process.execPath, [evidenceComposerPath, '--evidence-dir', directory, '--expected-source-sha', sourceSha], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /KIDULTS_EVIDENCE_COMPOSE_PASS/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'staging-production-delta.json'))), delta);
    const produced = JSON.parse(fs.readFileSync(path.join(directory, 'production-readiness-evidence-v1.json')));
    validateTechnicalEvidence(produced, { expectedSourceSha: sourceSha, policy, policySha256 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('evidence composer fails closed on mismatched source SHA without outputs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-evidence-composer-negative-'));
  try {
    const fixture = makeEvidenceFixture();
    writeEvidenceDirectory(directory, fixture);
    const delta = JSON.parse(fixture.rawByMember.get('staging-production-delta.json'));
    fs.unlinkSync(path.join(directory, 'staging-production-delta.json'));
    fs.unlinkSync(path.join(directory, 'production-readiness-evidence-v1.json'));
    const auditPath = path.join(directory, 'production-audit.json');
    const audit = JSON.parse(fs.readFileSync(auditPath));
    audit.source_sha = 'f'.repeat(40);
    fs.writeFileSync(auditPath, rawJson(audit));
    const result = spawnSync(process.execPath, [evidenceComposerPath, '--evidence-dir', directory, '--expected-source-sha', sourceSha], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AUXILIARY:production-audit.json:IDENTITY/);
    assert.equal(fs.existsSync(path.join(directory, 'staging-production-delta.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'production-readiness-evidence-v1.json')), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('evidence composer cannot convert an exposed unauthenticated boundary into passing delta evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-evidence-composer-fabrication-'));
  try {
    const fixture = makeEvidenceFixture();
    writeEvidenceDirectory(directory, fixture);
    fs.unlinkSync(path.join(directory, 'staging-production-delta.json'));
    fs.unlinkSync(path.join(directory, 'production-readiness-evidence-v1.json'));
    const auditPath = path.join(directory, 'production-audit.json');
    const audit = JSON.parse(fs.readFileSync(auditPath));
    audit.evidence.unauthenticated_collector_http = 200;
    fs.writeFileSync(auditPath, rawJson(audit));
    const result = spawnSync(process.execPath, [evidenceComposerPath, '--evidence-dir', directory, '--expected-source-sha', sourceSha], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STAGING_DELTA_NOT_PASS/);
    assert.equal(fs.existsSync(path.join(directory, 'staging-production-delta.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'production-readiness-evidence-v1.json')), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const setAuxiliaryEvidencePayload = (fixture, member, evidence) => {
  const envelope = JSON.parse(fixture.rawByMember.get(member).toString('utf8'));
  envelope.evidence = { ...validAuxiliaryEvidence(member), ...evidence };
  const raw = rawJson(envelope);
  fixture.rawByMember.set(member, raw);
  fixture.evidence.auxiliary_evidence_bindings.find((binding) => binding.member === member).sha256 = digest(raw);
};

const writeAuditAndDeltaEnvelopes = (evidenceDir, boundSourceSha, auditEvidence, deltaEvidence) => {
  const fixture = makeEvidenceFixture(boundSourceSha);
  setAuxiliaryEvidencePayload(fixture, 'production-audit.json', auditEvidence);
  setAuxiliaryEvidencePayload(fixture, 'staging-production-delta.json', deltaEvidence);
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const member of ['production-audit.json', 'staging-production-delta.json']) {
    fs.writeFileSync(path.join(evidenceDir, member), fixture.rawByMember.get(member));
  }
  return fixture;
};

const technicalSummary = (evidence) => validateTechnicalEvidence(evidence, {
  expectedSourceSha: sourceSha,
  policy,
  policySha256,
  evidenceSha256,
  expectedPolicyVersion: promotionContract.canonical_policy_version,
});

const makeReadiness = (summary) => {
  const readiness = {
    id: 'KIDULTS_PRODUCTION_READINESS_DECISION_V1',
    version: '1.0.0',
    decision: 'ready_for_program_owner_release',
    score: 100,
    maximum_score: 100,
    sections: {
      runtime_availability: 20,
      database_migration_safety: 15,
      backup_rollback: 15,
      authentication_rbac: 15,
      portal_mobile_quality: 10,
      governance_trust: 15,
      observability_incident: 10,
    },
    mandatory_gates_passed: true,
    hard_blockers: [],
    generated_at: '2026-08-08T13:00:00Z',
    source_sha: summary.source_sha,
    policy_sha256: summary.policy_sha256,
    readiness_evidence_sha256: summary.readiness_evidence_sha256,
    technical_evidence_summary: summary,
    explicit_program_owner_release_required: true,
    production_promotion_authorized: false,
    artfund_production_promotion_authorized: false,
  };
  readiness.checksum = sha256Object(readiness);
  return readiness;
};

const keyPair = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' });
const keyId = digest(keyPair.publicKey.export({ type: 'spki', format: 'der' }));
const executorKeyPair = crypto.generateKeyPairSync('ed25519');
const executorPublicKeyPem = executorKeyPair.publicKey.export({ type: 'spki', format: 'pem' });
const executorKeyId = digest(executorKeyPair.publicKey.export({ type: 'spki', format: 'der' }));
const defaultEvidenceBundleSha256 = digest('evidence-bundle');
const defaultTargetGatewayImageId = digest('gateway-image');
const defaultTargetSchedulerImageId = digest('scheduler-image');
const defaultDeploymentManifestSha256 = digest('deployment-manifest');
const defaultExecutionContext = Object.freeze({
  repository: 'intelligence-holdings/kaios',
  protected_environment: 'kidults-production-release',
  evidence_run_id: '700001',
  evidence_run_attempt: 1,
  artifact_id: '800001',
  artifact_name: 'kidults-production-release-evidence-test',
  artifact_sha256: digest('github-artifact'),
  executor_run_id: '900001',
  executor_run_attempt: 1,
  execution_mode: 'CERTIFICATION_ONLY',
  predeployment_snapshot_manifest_sha256: null,
  target_gateway_image_id: null,
  target_scheduler_image_id: null,
  deployment_manifest_sha256: null,
});
const nonceStoreReceiptRawByAttestation = new WeakMap();

const makeOwnerReceipt = (summary, readiness, {
  issuedAt = '2026-08-08T14:00:00Z',
  expiresAt = '2026-08-08T16:00:00Z',
  evidenceBundleSha256 = defaultEvidenceBundleSha256,
  executionContext = defaultExecutionContext,
} = {}) => {
  const receipt = {
    id: 'KIDULTS_PROGRAM_OWNER_PRODUCTION_RELEASE_RECEIPT_V1',
    version: '1.0.0',
    authority: 'PROGRAM_OWNER',
    decision: 'APPROVE_PRODUCTION_RELEASE',
    release_scope: 'KIDULTS_PRODUCTION',
    receipt_id: 'program-owner-release-20260808-001',
    issued_at: issuedAt,
    expires_at: expiresAt,
    source_sha: summary.source_sha,
    policy_sha256: summary.policy_sha256,
    readiness_evidence_sha256: summary.readiness_evidence_sha256,
    readiness_checksum: readiness.checksum,
    repository: executionContext.repository,
    protected_environment: executionContext.protected_environment,
    evidence_run_id: executionContext.evidence_run_id,
    evidence_run_attempt: executionContext.evidence_run_attempt,
    artifact_name: executionContext.artifact_name,
    evidence_bundle_sha256: evidenceBundleSha256,
    target_gateway_image_id: defaultTargetGatewayImageId,
    target_scheduler_image_id: defaultTargetSchedulerImageId,
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
    release_nonce: 'release-nonce-0123456789abcdef0123456789abcdef',
    key_id: keyId,
    signature_algorithm: 'ED25519',
    signature_base64: '',
  };
  const { signature_base64: _signature, ...unsigned } = receipt;
  receipt.signature_base64 = crypto.sign(null, Buffer.from(stableStringify(unsigned)), keyPair.privateKey).toString('base64');
  return receipt;
};

const makeConsumptionAttestation = (ownerReceipt, {
  ownerReceiptMemberSha256,
  archiveSha256 = digest('archive'),
  evidenceBundleSha256 = ownerReceipt.evidence_bundle_sha256,
  executionContext = defaultExecutionContext,
  consumedAt = '2026-08-08T14:30:00Z',
} = {}) => {
  const attestation = {
    id: 'KIDULTS_PROTECTED_EXECUTOR_RELEASE_CONSUMPTION_ATTESTATION_V1',
    version: '1.0.0',
    state: executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION'
      ? 'CONSUMED_EXACTLY_ONCE'
      : 'CERTIFIED_UNCONSUMED',
    protected_executor: 'KIDULTS_PRODUCTION_RELEASE_PROTECTED_EXECUTOR_V1',
    repository: executionContext.repository,
    protected_environment: executionContext.protected_environment,
    consumption_id: 'consumption-20260808-001',
    consumed_at: consumedAt,
    evidence_run_id: executionContext.evidence_run_id,
    evidence_run_attempt: executionContext.evidence_run_attempt,
    artifact_id: executionContext.artifact_id,
    artifact_name: executionContext.artifact_name,
    artifact_sha256: executionContext.artifact_sha256,
    archive_sha256: archiveSha256,
    source_sha: ownerReceipt.source_sha,
    execution_mode: executionContext.execution_mode,
    predeployment_snapshot_manifest_sha256: executionContext.predeployment_snapshot_manifest_sha256,
    target_gateway_image_id: executionContext.target_gateway_image_id,
    target_scheduler_image_id: executionContext.target_scheduler_image_id,
    deployment_manifest_sha256: executionContext.deployment_manifest_sha256,
    owner_receipt_id: ownerReceipt.receipt_id,
    owner_receipt_member_sha256: ownerReceiptMemberSha256,
    owner_receipt_canonical_sha256: sha256Object(ownerReceipt),
    release_nonce: ownerReceipt.release_nonce,
    evidence_bundle_sha256: evidenceBundleSha256,
    executor_run_id: executionContext.executor_run_id,
    executor_run_attempt: executionContext.executor_run_attempt,
    nonce_store_key: releaseNonceStoreKey(ownerReceipt),
    nonce_store_receipt_sha256: null,
    prior_consumption_count: 0,
    consumption_sequence: executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION' ? 1 : 0,
    key_id: executorKeyId,
    signature_algorithm: 'ED25519',
    signature_base64: '',
  };
  if (executionContext.execution_mode === 'CONTROLLED_PRODUCTION_PROMOTION') {
    attestation.consumption_id = attestation.nonce_store_key;
    const nonceStoreReceiptRaw = rawJson({
      id: 'KIDULTS_PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_V1',
      version: '1.0.0',
      state: 'CONSUMED_EXACTLY_ONCE',
      store_id: 'KIDULTS_PROTECTED_RELEASE_NONCE_STORE_V1',
      atomic_operation: 'CREATE_IF_ABSENT',
      nonce_store_key: attestation.nonce_store_key,
      consumption_id: attestation.consumption_id,
      consumed_at: attestation.consumed_at,
      prior_consumption_count: 0,
      consumption_sequence: 1,
      repository: attestation.repository,
      protected_environment: attestation.protected_environment,
      evidence_run_id: attestation.evidence_run_id,
      evidence_run_attempt: attestation.evidence_run_attempt,
      artifact_id: attestation.artifact_id,
      artifact_name: attestation.artifact_name,
      artifact_sha256: attestation.artifact_sha256,
      archive_sha256: attestation.archive_sha256,
      source_sha: attestation.source_sha,
      evidence_bundle_sha256: attestation.evidence_bundle_sha256,
      owner_receipt_id: attestation.owner_receipt_id,
      owner_receipt_canonical_sha256: attestation.owner_receipt_canonical_sha256,
      release_nonce: attestation.release_nonce,
      execution_mode: attestation.execution_mode,
      predeployment_snapshot_manifest_sha256: attestation.predeployment_snapshot_manifest_sha256,
      target_gateway_image_id: attestation.target_gateway_image_id,
      target_scheduler_image_id: attestation.target_scheduler_image_id,
      deployment_manifest_sha256: attestation.deployment_manifest_sha256,
      executor_run_id: attestation.executor_run_id,
      executor_run_attempt: attestation.executor_run_attempt,
    });
    attestation.nonce_store_receipt_sha256 = digest(nonceStoreReceiptRaw);
    nonceStoreReceiptRawByAttestation.set(attestation, nonceStoreReceiptRaw);
  }
  attestation.signature_base64 = crypto.sign(null, consumptionSigningPayload(attestation), executorKeyPair.privateKey).toString('base64');
  return attestation;
};

const validateFullOwnerReceipt = (receipt, summary, readiness, {
  evidenceBundleSha256 = receipt.evidence_bundle_sha256,
  executionContext = defaultExecutionContext,
  archiveSha256 = digest('archive'),
  now = new Date('2026-08-08T15:00:00Z'),
  expectedOwnerKeyId = keyId,
  expectedExecutorKeyId = executorKeyId,
  consumptionAttestation = null,
  nonceStoreReceiptRaw,
} = {}) => {
  const ownerReceiptMemberSha256 = digest(rawJson(receipt));
  const attestation = consumptionAttestation || makeConsumptionAttestation(receipt, {
    ownerReceiptMemberSha256,
    archiveSha256,
    evidenceBundleSha256,
    executionContext,
  });
  return validateProgramOwnerReceipt(receipt, {
    technicalSummary: summary,
    readiness,
    publicKeyPem,
    expectedKeyId: expectedOwnerKeyId,
    evidenceBundleSha256,
    executionContext,
    consumptionAttestation: attestation,
    consumptionPublicKeyPem: executorPublicKeyPem,
    expectedConsumptionKeyId: expectedExecutorKeyId,
    ownerReceiptMemberSha256,
    archiveSha256,
    nonceStoreReceiptRaw: nonceStoreReceiptRaw === undefined
      ? nonceStoreReceiptRawByAttestation.get(attestation) || null
      : nonceStoreReceiptRaw,
    now,
  });
};

test('accepts 30 unique first-attempt scheduled runs spanning seven days with all governed bindings', () => {
  const evidence = makeEvidence();
  const summary = technicalSummary(evidence);
  assert.equal(summary.state, 'TECHNICAL_READINESS_VERIFIED');
  assert.equal(summary.unique_natural_runs, 30);
  assert.equal(summary.production_release_authorized, false);
});

test('accepts policy v1.1 only when the contract selects it and every tier binds the dated-SOLD claim target', () => {
  const policyV11 = structuredClone(policy);
  policyV11.version = '1.1.0';
  policyV11.tiers.forEach((tier) => { tier.claim_target = 'DATED_OBSERVED_SOLD_TRANSACTION'; });
  const policyV11Raw = rawJson(policyV11);
  const policyV11Sha256 = digest(policyV11Raw);
  const evidence = makeEvidence();
  evidence.policy_binding.version = policyV11.version;
  evidence.policy_binding.sha256 = policyV11Sha256;
  evidence.natural_runs.forEach((run) => { run.policy_sha256 = policyV11Sha256; });
  const summary = validateTechnicalEvidence(evidence, {
    expectedSourceSha: sourceSha,
    policy: policyV11,
    policySha256: policyV11Sha256,
    evidenceSha256,
    expectedPolicyVersion: '1.1.0',
  });
  assert.equal(summary.state, 'TECHNICAL_READINESS_VERIFIED');
});

test('rejects stale, incomplete, or unsupported policy schemas selected by the promotion contract', () => {
  const policyV11 = structuredClone(policy);
  policyV11.version = '1.1.0';
  policyV11.tiers.forEach((tier) => { tier.claim_target = 'DATED_OBSERVED_SOLD_TRANSACTION'; });
  const policyV11Raw = rawJson(policyV11);
  const policyV11Sha256 = digest(policyV11Raw);
  const evidenceV11 = makeEvidence();
  evidenceV11.policy_binding.version = policyV11.version;
  evidenceV11.policy_binding.sha256 = policyV11Sha256;
  evidenceV11.natural_runs.forEach((run) => { run.policy_sha256 = policyV11Sha256; });

  const stalePolicy = structuredClone(policy);
  stalePolicy.version = '1.0.0';
  const stalePolicyRaw = rawJson(stalePolicy);
  const stalePolicySha256 = digest(stalePolicyRaw);
  const staleEvidence = makeEvidence();
  staleEvidence.policy_binding.version = stalePolicy.version;
  staleEvidence.policy_binding.sha256 = stalePolicySha256;
  staleEvidence.natural_runs.forEach((run) => { run.policy_sha256 = stalePolicySha256; });
  assert.throws(() => validateTechnicalEvidence(staleEvidence, {
    expectedSourceSha: sourceSha,
    policy: stalePolicy,
    policySha256: stalePolicySha256,
    evidenceSha256,
    expectedPolicyVersion: '1.1.0',
  }), /POLICY_VERSION/);

  const incompleteV11 = structuredClone(policyV11);
  delete incompleteV11.tiers[0].claim_target;
  const incompleteRaw = rawJson(incompleteV11);
  assert.throws(() => validateTechnicalEvidence(evidenceV11, {
    expectedSourceSha: sourceSha,
    policy: incompleteV11,
    policySha256: digest(incompleteRaw),
    evidenceSha256,
    expectedPolicyVersion: '1.1.0',
  }), /POLICY_TIER_CLAIM_TARGET/);

  assert.throws(() => validateTechnicalEvidence(evidenceV11, {
    expectedSourceSha: sourceSha,
    policy: policyV11,
    policySha256: policyV11Sha256,
    evidenceSha256,
    expectedPolicyVersion: '1.2.0',
  }), /CONTRACT_POLICY_VERSION_UNSUPPORTED/);
});

test('SQLite snapshot helper binds the actual SQLite connection to held source and target inodes', () => {
  const captureScript = fs.readFileSync(snapshotCapturePath, 'utf8');
  assert.match(captureScript, /database-metadata\.tsv"\)"/);
  assert.match(captureScript, /SQLite held-inode metadata receipt does not match helper output/);
  assert.doesNotMatch(captureScript, /stat --printf[^\n]+\$\{PROD_DB\}/);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-sqlite-inode-binding-'));
  try {
    const source = path.join(temp, 'source.db');
    const alternate = path.join(temp, 'alternate.db');
    const setup = spawnSync('python3', ['-I', '-c', [
      'import sqlite3,sys',
      'for index,path in enumerate(sys.argv[1:]):',
      '  with sqlite3.connect(path) as db:',
      '    db.execute("create table marker(value text)")',
      '    db.execute("insert into marker values (?)", (f"db-{index}",))',
    ].join('\n'), source, alternate], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);

    const target = path.join(temp, 'snapshot.db');
    const metadata = path.join(temp, 'snapshot-metadata.tsv');
    const sourceStat = fs.statSync(source);
    const sourceMode = (sourceStat.mode & 0o7777).toString(8).padStart(4, '0');
    const snapshot = spawnSync('python3', ['-I', sqliteSnapshotHelperPath, source, target, metadata], { encoding: 'utf8' });
    assert.equal(snapshot.status, 0, snapshot.stderr);
    assert.match(snapshot.stdout, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\t[0-9]+\t[0-9]+\t0[0-7]{3}\n$/);
    assert.equal(fs.readFileSync(metadata, 'utf8'), snapshot.stdout);
    const metadataFields = snapshot.stdout.trim().split('\t');
    assert.deepEqual(metadataFields.slice(1), [String(sourceStat.uid), String(sourceStat.gid), sourceMode]);
    const copied = spawnSync('python3', ['-I', '-c', 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select value from marker").fetchone()[0])', target], { encoding: 'utf8' });
    assert.equal(copied.stdout.trim(), 'db-0');

    const walSource = path.join(temp, 'wal-source.db');
    const walTarget = path.join(temp, 'wal-snapshot.db');
    const walMetadata = path.join(temp, 'wal-metadata.tsv');
    const walCapture = spawnSync('python3', ['-I', '-c', [
      'import json,os,sqlite3,subprocess,sys',
      'source,target,metadata,helper = sys.argv[1:]',
      'db = sqlite3.connect(source)',
      'db.execute("pragma journal_mode=WAL")',
      'db.execute("pragma wal_autocheckpoint=0")',
      'db.execute("create table marker(value text)")',
      'db.execute("insert into marker values (\'wal-live\')")',
      'db.commit()',
      'result = subprocess.run([sys.executable, "-I", helper, source, target, metadata], text=True, capture_output=True)',
      'print(json.dumps({"returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr, "wal_open": os.path.isfile(source + "-wal")}))',
      'db.close()',
    ].join('\n'), walSource, walTarget, walMetadata, sqliteSnapshotHelperPath], { encoding: 'utf8' });
    assert.equal(walCapture.status, 0, walCapture.stderr);
    const walResult = JSON.parse(walCapture.stdout);
    assert.equal(walResult.returncode, 0, walResult.stderr);
    assert.equal(walResult.wal_open, true);
    assert.equal(fs.readFileSync(walMetadata, 'utf8'), walResult.stdout);
    const walCopied = spawnSync('python3', ['-I', '-c', 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select value from marker").fetchone()[0])', walTarget], { encoding: 'utf8' });
    assert.equal(walCopied.stdout.trim(), 'wal-live');

    const substitutedTarget = path.join(temp, 'substituted-source-snapshot.db');
    const substitutedMetadata = path.join(temp, 'substituted-source-metadata.tsv');
    const substituted = spawnSync('python3', [
      '-I', sqliteSnapshotHelperPath, source, substitutedTarget, substitutedMetadata,
      '--test-source-connect-path', alternate,
    ], {
      encoding: 'utf8',
      env: { ...process.env, KIDULTS_SQLITE_SNAPSHOT_TEST_HOOKS: 'ENABLED_FAIL_CLOSED_ONLY' },
    });
    assert.notEqual(substituted.status, 0);
    assert.match(substituted.stderr, /SQLITE_SOURCE_CONNECTION_NOT_BOUND_TO_HELD_INODE/);

    const forbiddenHookTarget = path.join(temp, 'forbidden-hook-snapshot.db');
    const forbiddenHookMetadata = path.join(temp, 'forbidden-hook-metadata.tsv');
    const forbiddenHook = spawnSync('python3', [
      '-I', sqliteSnapshotHelperPath, source, forbiddenHookTarget, forbiddenHookMetadata,
      '--test-source-connect-path', alternate,
    ], { encoding: 'utf8' });
    assert.notEqual(forbiddenHook.status, 0);
    assert.match(forbiddenHook.stderr, /SQLITE_SNAPSHOT_TEST_HOOKS_FORBIDDEN/);

    const danglingTarget = path.join(temp, 'dangling-target.db');
    fs.symlinkSync(path.join(temp, 'missing-target.db'), danglingTarget);
    const dangling = spawnSync('python3', [
      '-I', sqliteSnapshotHelperPath, source, danglingTarget, path.join(temp, 'dangling-metadata.tsv'),
    ], { encoding: 'utf8' });
    assert.notEqual(dangling.status, 0);
    assert.match(dangling.stderr, /SQLITE_SNAPSHOT_TARGET_ALREADY_EXISTS/);

    const unsafeSource = path.join(temp, 'unsafe-source.db');
    fs.copyFileSync(source, unsafeSource);
    fs.chmodSync(unsafeSource, 0o4600);
    const unsafe = spawnSync('python3', [
      '-I', sqliteSnapshotHelperPath, unsafeSource, path.join(temp, 'unsafe-target.db'),
      path.join(temp, 'unsafe-metadata.tsv'),
    ], { encoding: 'utf8' });
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /SQLITE_SOURCE_METADATA_UNSAFE/);

    const fifoSource = path.join(temp, 'fifo-source.db');
    const fifoCreate = spawnSync('python3', ['-I', '-c', 'import os,sys; os.mkfifo(sys.argv[1], 0o600)', fifoSource], { encoding: 'utf8' });
    assert.equal(fifoCreate.status, 0, fifoCreate.stderr);
    const fifo = spawnSync('python3', [
      '-I', sqliteSnapshotHelperPath, fifoSource, path.join(temp, 'fifo-target.db'),
      path.join(temp, 'fifo-metadata.tsv'),
    ], { encoding: 'utf8', timeout: 2_000 });
    assert.notEqual(fifo.status, 0);
    assert.notEqual(fifo.signal, 'SIGTERM');
    assert.match(fifo.stderr, /SQLITE_SNAPSHOT_SOURCE_NOT_REGULAR/);
    assert.equal(fs.lstatSync(fifoSource).isFIFO(), true);

    const originalSource = path.join(temp, 'source-before-entry-swap.db');
    fs.chmodSync(alternate, 0o666);
    fs.renameSync(source, originalSource);
    fs.renameSync(alternate, source);
    const substitutedMode = (fs.statSync(source).mode & 0o7777).toString(8).padStart(4, '0');
    assert.equal(metadataFields[3], sourceMode);
    assert.notEqual(metadataFields[3], substitutedMode);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('technical command rejects an empty auxiliary member even after its digest is rebound', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-empty-auxiliary-'));
  try {
    const fixture = makeEvidenceFixture();
    const emptyRaw = Buffer.from('{}\n');
    fixture.rawByMember.set('production-audit.json', emptyRaw);
    fixture.evidence.auxiliary_evidence_bindings.find((binding) => binding.member === 'production-audit.json').sha256 = digest(emptyRaw);
    writeEvidenceDirectory(temp, fixture);
    const result = spawnSync('node', [
      'scripts/production/validate-kidults-production-release-v1.mjs', 'technical',
      '--evidence', path.join(temp, 'production-readiness-evidence-v1.json'),
      '--evidence-dir', temp,
      '--policy', policyPath,
      '--expected-source-sha', sourceSha,
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AUXILIARY_MEMBER:production-audit\.json:FIELD_SET/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('technical command rejects a FIFO evidence file without blocking', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-technical-evidence-fifo-'));
  try {
    const fixture = makeEvidenceFixture();
    writeEvidenceDirectory(temp, fixture);
    const evidencePath = path.join(temp, 'production-readiness-evidence-v1.json');
    fs.unlinkSync(evidencePath);
    const fifoCreation = spawnSync(
      'python3',
      ['-I', '-c', 'import os, sys; os.mkfifo(sys.argv[1], 0o600)', evidencePath],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(fifoCreation.status, 0, `${fifoCreation.stdout}\n${fifoCreation.stderr}`);
    const result = spawnSync('node', [
      'scripts/production/validate-kidults-production-release-v1.mjs', 'technical',
      '--evidence', evidencePath,
      '--evidence-dir', temp,
      '--policy', policyPath,
      '--expected-source-sha', sourceSha,
    ], { cwd: root, encoding: 'utf8', timeout: 2_000 });
    assert.notEqual(result.status, 0);
    assert.notEqual(result.signal, 'SIGTERM');
    assert.match(result.stderr, /TECHNICAL_EVIDENCE_FILE_INVALID/);
    assert.equal(fs.lstatSync(evidencePath).isFIFO(), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('sealed release verifier rejects a FIFO archive without blocking', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-sealed-archive-fifo-'));
  try {
    const archivePath = path.join(temp, 'sealed.tar.gz');
    const fifoCreation = spawnSync(
      'python3',
      ['-I', '-c', 'import os, sys; os.mkfifo(sys.argv[1], 0o600)', archivePath],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(fifoCreation.status, 0, `${fifoCreation.stdout}\n${fifoCreation.stderr}`);
    const probe = `
import { verifySealedRelease } from './scripts/production/validate-kidults-production-release-v1.mjs';
try {
  verifySealedRelease({ archivePath: process.argv[1] });
} catch (error) {
  if (error && error.code === 'SEALED_ARCHIVE_FILE_INVALID') process.exit(0);
  throw error;
}
process.exit(1);
`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe, archivePath], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.notEqual(result.signal, 'SIGTERM');
    assert.equal(fs.lstatSync(archivePath).isFIFO(), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('technical command rejects future-dated auxiliary evidence after digest rebinding', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-future-auxiliary-'));
  try {
    const fixture = makeEvidenceFixture();
    const member = 'production-audit.json';
    const envelope = JSON.parse(fixture.rawByMember.get(member).toString('utf8'));
    envelope.observed_at = '2099-01-01T00:00:00Z';
    const futureRaw = rawJson(envelope);
    fixture.rawByMember.set(member, futureRaw);
    fixture.evidence.auxiliary_evidence_bindings.find((binding) => binding.member === member).sha256 = digest(futureRaw);
    writeEvidenceDirectory(temp, fixture);
    const result = spawnSync('node', [
      'scripts/production/validate-kidults-production-release-v1.mjs', 'technical',
      '--evidence', path.join(temp, 'production-readiness-evidence-v1.json'),
      '--evidence-dir', temp,
      '--policy', policyPath,
      '--expected-source-sha', sourceSha,
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AUXILIARY_MEMBER:production-audit\.json:FROM_FUTURE/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('technical command enforces every auxiliary evidence kind schema after digest rebinding', () => {
  const mutations = new Map([
    ['production-audit.json', (evidence) => { evidence.status = 'fail'; }],
    ['production-rollback-rehearsal.json', (evidence) => { evidence.rollback_rehearsal_passed = false; }],
    ['production-mobile-320.json', (evidence) => { evidence.viewport_width = 375; }],
    ['production-governance-trust.json', (evidence) => { evidence.rights_census_state = 'HOLD'; }],
    ['production-observability.json', (evidence) => { evidence.error_budget_state = 'EXHAUSTED'; }],
    ['production-incident-response.json', (evidence) => { evidence.incident_response_ready = false; }],
    ['staging-production-delta.json', (evidence) => { evidence.critical_deltas = ['fabricated-clearance']; }],
  ]);
  for (const [member, mutate] of mutations) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-auxiliary-schema-'));
    try {
      const fixture = makeEvidenceFixture();
      const envelope = JSON.parse(fixture.rawByMember.get(member).toString('utf8'));
      mutate(envelope.evidence);
      const reboundRaw = rawJson(envelope);
      fixture.rawByMember.set(member, reboundRaw);
      fixture.evidence.auxiliary_evidence_bindings.find((binding) => binding.member === member).sha256 = digest(reboundRaw);
      writeEvidenceDirectory(temp, fixture);
      const result = spawnSync('node', [
        'scripts/production/validate-kidults-production-release-v1.mjs', 'technical',
        '--evidence', path.join(temp, 'production-readiness-evidence-v1.json'),
        '--evidence-dir', temp,
        '--policy', policyPath,
        '--expected-source-sha', sourceSha,
      ], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${member} semantic mutation was accepted`);
      assert.match(result.stderr, /AUXILIARY_/);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('technical command rejects a semantically fabricated run receipt after raw digest rebinding', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-fabricated-support-'));
  try {
    const fixture = makeEvidenceFixture();
    const run = fixture.evidence.natural_runs[0];
    const binding = fixture.evidence.support_evidence_bindings.find(
      (candidate) => candidate.evidence_kind === 'NATURAL_RUN' && candidate.subject_id === run.natural_run_id,
    );
    const original = JSON.parse(fixture.rawByMember.get(binding.member).toString('utf8'));
    original.evidence = { fabricated: true };
    const fabricatedRaw = rawJson(original);
    fixture.rawByMember.set(binding.member, fabricatedRaw);
    binding.sha256 = digest(fabricatedRaw);
    run.receipt_sha256 = binding.sha256;
    writeEvidenceDirectory(temp, fixture);
    const result = spawnSync('node', [
      'scripts/production/validate-kidults-production-release-v1.mjs', 'technical',
      '--evidence', path.join(temp, 'production-readiness-evidence-v1.json'),
      '--evidence-dir', temp,
      '--policy', policyPath,
      '--expected-source-sha', sourceSha,
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SUPPORT_MEMBER_SEMANTICS:NATURAL_RUN/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

for (const [name, mutate, code] of [
  ['duplicate workflow run IDs', (e) => { e.natural_runs[1].workflow_run_id = e.natural_runs[0].workflow_run_id; }, 'NATURAL_WORKFLOW_RUN_ID_DUPLICATE'],
  ['rerun attempts', (e) => { e.natural_runs[0].run_attempt = 2; }, 'NATURAL_RUN_ATTEMPT_NOT_FIRST'],
  ['manual triggers', (e) => { e.natural_runs[0].trigger = 'workflow_dispatch'; }, 'NATURAL_RUN_TRIGGER_NOT_SCHEDULE'],
  ['rights binding drift', (e) => { e.natural_runs[0].rights_census_sha256 = digest('different-rights'); }, 'NATURAL_RUN_BINDING:rights_census_sha256'],
  ['SLO failure', (e) => { e.slo_error_budget.status = 'FAIL'; }, 'SLO_NOT_PASS'],
  ['exhausted error budget', (e) => { e.slo_error_budget.error_budget_status = 'EXHAUSTED'; }, 'ERROR_BUDGET_NOT_WITHIN'],
  ['unverified PITR', (e) => { e.recovery.pitr_status = 'NOT_VERIFIED'; }, 'PITR_NOT_VERIFIED'],
  ['PITR restore point after verification', (e) => { e.recovery.pitr_restore_point_at = '2026-08-01T00:00:00Z'; }, 'PITR_RESTORE_POINT_AFTER_VERIFICATION'],
  ['unverified rollback', (e) => { e.recovery.rollback_status = 'NOT_VERIFIED'; }, 'ROLLBACK_NOT_VERIFIED'],
]) {
  test(`rejects ${name}`, () => {
    const evidence = makeEvidence();
    mutate(evidence);
    assert.throws(() => technicalSummary(evidence), new RegExp(code));
  });
}

test('rejects natural runs whose actual schedule-slot span is shorter than seven days', () => {
  const evidence = makeEvidence();
  const start = Date.parse(evidence.observation_window.started_at);
  evidence.natural_runs.forEach((run, index) => {
    const slot = start + index * 5 * 60 * 60 * 1000;
    run.logical_schedule_slot = iso(slot);
    run.started_at = iso(slot + 60 * 1000);
    run.completed_at = iso(slot + 5 * 60 * 1000);
  });
  assert.throws(() => technicalSummary(evidence), /NATURAL_RUN_SPAN_TOO_SHORT/);
});

test('rejects backfilled schedule slots when actual execution times do not span seven days', () => {
  const evidence = makeEvidence();
  const clusteredStart = Date.parse('2026-08-08T07:00:00Z');
  evidence.natural_runs.forEach((run, index) => {
    const started = clusteredStart + index * 60 * 1000;
    run.started_at = iso(started);
    run.completed_at = iso(started + 30 * 1000);
  });
  assert.throws(() => technicalSummary(evidence), /NATURAL_EXECUTION_SPAN_TOO_SHORT/);
});

test('technical finalization cannot self-authorize Production', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  readiness.production_promotion_authorized = true;
  readiness.checksum = sha256Object(Object.fromEntries(Object.entries(readiness).filter(([key]) => key !== 'checksum')));
  assert.throws(() => validateReadinessDecision(readiness, summary), /READINESS_SELF_AUTHORIZED/);
});

test('readiness cannot be generated before the observation window closes', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  readiness.generated_at = '2026-08-08T11:59:59Z';
  readiness.checksum = sha256Object(Object.fromEntries(Object.entries(readiness).filter(([key]) => key !== 'checksum')));
  assert.throws(() => validateReadinessDecision(readiness, summary), /READINESS_GENERATED_BEFORE_OBSERVATION_END/);
});

test('readiness cannot be generated in the verifier future', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  assert.throws(() => validateReadinessDecision(readiness, summary, {
    now: new Date('2026-08-08T12:50:00Z'),
  }), /READINESS_GENERATED_IN_FUTURE/);
});

test('Program Owner approval cannot predate the readiness decision', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness, {
    issuedAt: '2026-08-08T12:45:00Z',
    expiresAt: '2026-08-08T15:30:00Z',
  });
  assert.throws(() => validateProgramOwnerSignature(receipt, {
    technicalSummary: summary,
    readiness,
    publicKeyPem,
    expectedKeyId: keyId,
    evidenceBundleSha256: receipt.evidence_bundle_sha256,
    executionContext: defaultExecutionContext,
    now: new Date('2026-08-08T15:00:00Z'),
  }), /PROGRAM_OWNER_APPROVAL_BEFORE_READINESS/);
});

test('accepts a current Ed25519 Program Owner receipt bound to source, policy, evidence, and readiness', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  validateReadinessDecision(readiness, summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  const result = validateFullOwnerReceipt(receipt, summary, readiness);
  assert.equal(result.state, 'PROGRAM_OWNER_SIGNATURE_CERTIFIED_UNCONSUMED');
  assert.equal(result.consumption.state, 'PROTECTED_EXECUTOR_CERTIFICATION_VERIFIED_UNCONSUMED');
});

test('rejects a tampered Program Owner receipt', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  receipt.release_scope = 'KIDULTS_PRODUCTION_TAMPERED';
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness), /PROGRAM_OWNER_RELEASE_SCOPE/);
});

test('rejects an expired Program Owner receipt', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    now: new Date('2026-08-09T15:00:00Z'),
  }), /PROGRAM_OWNER_RECEIPT_TOO_OLD|PROGRAM_OWNER_RECEIPT_EXPIRED/);
});

test('preseal owner signature remains HOLD until a protected executor consumption attestation exists', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  const owner = validateProgramOwnerSignature(receipt, {
    technicalSummary: summary,
    readiness,
    publicKeyPem,
    expectedKeyId: keyId,
    evidenceBundleSha256: receipt.evidence_bundle_sha256,
    executionContext: defaultExecutionContext,
    now: new Date('2026-08-08T15:00:00Z'),
  });
  assert.equal(owner.state, 'PROGRAM_OWNER_SIGNATURE_VERIFIED_UNCONSUMED');
  assert.throws(() => validateProgramOwnerReceipt(receipt, {
    technicalSummary: summary,
    readiness,
    publicKeyPem,
    expectedKeyId: keyId,
    evidenceBundleSha256: receipt.evidence_bundle_sha256,
    executionContext: defaultExecutionContext,
    now: new Date('2026-08-08T15:00:00Z'),
  }), /PROTECTED_EXECUTOR_CONSUMPTION_ATTESTATION_REQUIRED/);
});

test('rejects caller-selected Program Owner key substitution against the independent trust-anchor id', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    expectedOwnerKeyId: digest('different-protected-owner-key'),
  }), /PROGRAM_OWNER_TRUST_ANCHOR_MISMATCH/);
});

test('rejects reuse of one Ed25519 trust root for owner and protected executor authority', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const receipt = makeOwnerReceipt(summary, readiness);
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    expectedExecutorKeyId: keyId,
  }), /RELEASE_TRUST_ROOTS_NOT_INDEPENDENT/);
});

test('rejects replay of a consumed receipt in a different protected executor run', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  const ownerReceiptMemberSha256 = digest(rawJson(receipt));
  const attestation = makeConsumptionAttestation(receipt, { ownerReceiptMemberSha256, executionContext: promotionContext });
  const replayContext = { ...promotionContext, executor_run_id: '900002' };
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: replayContext,
    consumptionAttestation: attestation,
  }), /PROTECTED_EXECUTOR_CONTEXT_MISMATCH:executor_run_id/);
});

test('rejects a second consumption identity for the same Program Owner release nonce', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  const ownerReceiptMemberSha256 = digest(rawJson(receipt));
  const secondAttestation = makeConsumptionAttestation(receipt, {
    ownerReceiptMemberSha256,
    executionContext: promotionContext,
  });
  secondAttestation.consumption_id = 'second-consumption-for-same-owner-nonce';
  secondAttestation.signature_base64 = crypto.sign(null, consumptionSigningPayload(secondAttestation), executorKeyPair.privateKey).toString('base64');
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: promotionContext,
    consumptionAttestation: secondAttestation,
  }), /PROTECTED_EXECUTOR_CONSUMPTION_ID_NOT_NONCE_BOUND/);
});

test('promotion consumption requires a digest-bound predeployment snapshot', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  const result = validateFullOwnerReceipt(receipt, summary, readiness, { executionContext: promotionContext });
  assert.equal(result.consumption.state, 'PROTECTED_EXECUTOR_CONSUMPTION_VERIFIED');
  const invalidContext = { ...promotionContext, predeployment_snapshot_manifest_sha256: null };
  const invalidReceipt = makeOwnerReceipt(summary, readiness, { executionContext: invalidContext });
  assert.throws(() => validateFullOwnerReceipt(invalidReceipt, summary, readiness, { executionContext: invalidContext }), /PROTECTED_EXECUTOR_SNAPSHOT_DIGEST/);
});

test('protected executor cannot substitute target image IDs outside the Program Owner receipt', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const ownerContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: defaultTargetGatewayImageId,
    target_scheduler_image_id: defaultTargetSchedulerImageId,
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: ownerContext });
  const substitutedContext = {
    ...ownerContext,
    target_gateway_image_id: digest('executor-substituted-gateway-image'),
  };
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: substitutedContext,
  }), /PROTECTED_EXECUTOR_OWNER_GATEWAY_IMAGE_ID/);
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: {
      ...ownerContext,
      deployment_manifest_sha256: digest('executor-substituted-deployment-manifest'),
    },
  }), /PROTECTED_EXECUTOR_OWNER_DEPLOYMENT_MANIFEST/);
});

test('promotion fails closed without the actual external atomic nonce-store receipt bytes', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: promotionContext,
    nonceStoreReceiptRaw: null,
  }), /PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_REQUIRED/);
});

test('promotion rejects a rehashed CAS receipt that does not prove first atomic consumption', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  const ownerReceiptMemberSha256 = digest(rawJson(receipt));
  const attestation = makeConsumptionAttestation(receipt, { ownerReceiptMemberSha256, executionContext: promotionContext });
  const fabricatedStoreReceipt = JSON.parse(nonceStoreReceiptRawByAttestation.get(attestation).toString('utf8'));
  fabricatedStoreReceipt.prior_consumption_count = 1;
  const fabricatedStoreReceiptRaw = rawJson(fabricatedStoreReceipt);
  attestation.nonce_store_receipt_sha256 = digest(fabricatedStoreReceiptRaw);
  attestation.signature_base64 = crypto.sign(null, consumptionSigningPayload(attestation), executorKeyPair.privateKey).toString('base64');
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: promotionContext,
    consumptionAttestation: attestation,
    nonceStoreReceiptRaw: fabricatedStoreReceiptRaw,
  }), /PROTECTED_EXECUTOR_NONCE_STORE_NOT_FIRST_CONSUMPTION/);
});

test('promotion rejects nonce-store receipt bytes whose digest differs from the signed attestation', () => {
  const summary = technicalSummary(makeEvidence());
  const readiness = makeReadiness(summary);
  const promotionContext = {
    ...defaultExecutionContext,
    execution_mode: 'CONTROLLED_PRODUCTION_PROMOTION',
    predeployment_snapshot_manifest_sha256: digest('snapshot-manifest'),
    target_gateway_image_id: digest('gateway-image'),
    target_scheduler_image_id: digest('scheduler-image'),
    deployment_manifest_sha256: defaultDeploymentManifestSha256,
  };
  const receipt = makeOwnerReceipt(summary, readiness, { executionContext: promotionContext });
  const ownerReceiptMemberSha256 = digest(rawJson(receipt));
  const attestation = makeConsumptionAttestation(receipt, { ownerReceiptMemberSha256, executionContext: promotionContext });
  const differentRawBytes = Buffer.concat([nonceStoreReceiptRawByAttestation.get(attestation), Buffer.from('\n')]);
  assert.throws(() => validateFullOwnerReceipt(receipt, summary, readiness, {
    executionContext: promotionContext,
    consumptionAttestation: attestation,
    nonceStoreReceiptRaw: differentRawBytes,
  }), /PROTECTED_EXECUTOR_NONCE_STORE_RECEIPT_DIGEST/);
});

test('revalidates the signed technical and owner evidence from the exact sealed archive', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-sealed-release-'));
  try {
    const evidenceDir = path.join(temp, 'evidence');
    fs.mkdirSync(evidenceDir);
    const fixture = makeEvidenceFixture();
    const evidence = fixture.evidence;
    for (const [member, raw] of fixture.rawByMember) {
      const memberPath = path.join(evidenceDir, member);
      fs.mkdirSync(path.dirname(memberPath), { recursive: true });
      fs.writeFileSync(memberPath, raw);
    }
    const technicalPath = path.join(evidenceDir, 'production-readiness-evidence-v1.json');
    fs.writeFileSync(technicalPath, `${JSON.stringify(evidence, null, 2)}\n`);
    const actualEvidenceDigest = digest(fs.readFileSync(technicalPath));
    const summary = validateTechnicalEvidence(evidence, {
      expectedSourceSha: sourceSha,
      policy,
      policySha256,
      evidenceSha256: actualEvidenceDigest,
      expectedPolicyVersion: promotionContract.canonical_policy_version,
    });
    const readiness = makeReadiness(summary);
    const readinessPath = path.join(evidenceDir, 'kidults-production-readiness.json');
    fs.writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`);
    const bundleMembers = new Map(fixture.rawByMember);
    bundleMembers.set('production-readiness-evidence-v1.json', fs.readFileSync(technicalPath));
    bundleMembers.set('kidults-production-readiness.json', fs.readFileSync(readinessPath));
    const evidenceBundleSha256 = evidenceBundleDigest(bundleMembers);
    const ownerReceipt = makeOwnerReceipt(summary, readiness, { evidenceBundleSha256 });
    const ownerPath = path.join(evidenceDir, 'program-owner-production-release-receipt-v1.json');
    fs.writeFileSync(ownerPath, `${JSON.stringify(ownerReceipt, null, 2)}\n`);

    const archivePath = path.join(temp, 'kidults-production-evidence.tar.gz');
    const members = [
      ...fixture.rawByMember.keys(),
      'production-readiness-evidence-v1.json',
      'kidults-production-readiness.json',
      'program-owner-production-release-receipt-v1.json',
    ];
    const tar = spawnSync('tar', ['-czf', archivePath, '-C', evidenceDir, ...members], { encoding: 'utf8' });
    assert.equal(tar.status, 0, tar.stderr);
    const publicKeyPath = path.join(temp, 'owner-public-key.pem');
    fs.writeFileSync(publicKeyPath, publicKeyPem);
    const executorPublicKeyPath = path.join(temp, 'executor-public-key.pem');
    fs.writeFileSync(executorPublicKeyPath, executorPublicKeyPem);
    const archiveSha256 = digest(fs.readFileSync(archivePath));
    const consumptionAttestation = makeConsumptionAttestation(ownerReceipt, {
      ownerReceiptMemberSha256: digest(fs.readFileSync(ownerPath)),
      archiveSha256,
      evidenceBundleSha256,
    });
    const consumptionAttestationPath = path.join(temp, 'protected-executor-consumption-attestation-v1.json');
    fs.writeFileSync(consumptionAttestationPath, `${JSON.stringify(consumptionAttestation, null, 2)}\n`);
    const manifest = {
      id: 'KIDULTS_SEALED_PRODUCTION_RELEASE_EVIDENCE_V1',
      version: '1.0.0',
      status: 'sealed_release_candidate',
      vertical: 'kidults',
      sealed_at: '2026-08-08T14:30:00Z',
      archive_sha256: archiveSha256,
      readiness_checksum: readiness.checksum,
      decision: readiness.decision,
      technical_readiness_verified: true,
      explicit_program_owner_release_verified: true,
      protected_executor_consumption_verified: false,
      owner_release_receipt_sha256: digest(fs.readFileSync(ownerPath)),
      owner_key_id: ownerReceipt.key_id,
      source_sha: sourceSha,
      policy_sha256: policySha256,
      readiness_evidence_sha256: actualEvidenceDigest,
      evidence_bundle_sha256: evidenceBundleSha256,
      repository: defaultExecutionContext.repository,
      protected_environment: defaultExecutionContext.protected_environment,
      evidence_run_id: defaultExecutionContext.evidence_run_id,
      evidence_run_attempt: defaultExecutionContext.evidence_run_attempt,
      artifact_name: defaultExecutionContext.artifact_name,
      production_change_executed: false,
      artfund_production_promotion_authorized: false,
    };
    const manifestPath = `${archivePath}.manifest.json`;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const verifyOptions = {
      archivePath,
      manifestPath,
      policyPath,
      publicKeyPath,
      expectedOwnerKeyId: keyId,
      consumptionAttestationPath,
      nonceStoreReceiptPath: null,
      executorPublicKeyPath,
      expectedExecutorKeyId: executorKeyId,
      executionContext: defaultExecutionContext,
      expectedSourceSha: sourceSha,
      now: new Date('2026-08-08T15:00:00Z'),
    };
    const result = verifySealedRelease(verifyOptions);
    assert.equal(result.state, 'SEALED_RELEASE_CANDIDATE_CERTIFIED_UNCONSUMED');
    assert.equal(result.program_owner_release.state, 'PROGRAM_OWNER_SIGNATURE_CERTIFIED_UNCONSUMED');
    manifest.sealed_at = '2026-08-08T14:30:01Z';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => verifySealedRelease(verifyOptions), /PROTECTED_EXECUTOR_ATTESTATION_BEFORE_SEAL/);
    manifest.sealed_at = '2026-08-08T13:59:59Z';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => verifySealedRelease(verifyOptions), /SEALED_MANIFEST_BEFORE_OWNER_APPROVAL/);
    manifest.sealed_at = '2026-08-08T15:10:01Z';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => verifySealedRelease(verifyOptions), /SEALED_MANIFEST_FROM_FUTURE/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

const prepareSealTestFixture = (prefix = 'kidults-production-seal-safe-') => {
  const anchor = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.chmodSync(anchor, 0o700);
  const archiveRoot = path.join(anchor, 'archive');
  const trustRoot = path.join(anchor, 'trust');
  const evidenceDir = path.join(anchor, 'evidence');
  for (const directory of [archiveRoot, trustRoot, evidenceDir]) {
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
  const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const fixture = makeEvidenceFixture(actualSourceSha);
  setAuxiliaryEvidencePayload(fixture, 'production-audit.json', {
    database_integrity: 'ok', health_http: 200, portal_http: 200,
    unauthenticated_collector_http: 401, backup_integrity: 'ok',
  });
  setAuxiliaryEvidencePayload(fixture, 'staging-production-delta.json', {
    destructive_schema_delta: false, viewer_export_exposed: false,
    restricted_rights_exposed: false, rollback_rehearsal_passed: true,
    mobile_320_passed: true, governance_gate_passed: true,
    observability_passed: true, incident_response_ready: true,
  });
  writeEvidenceDirectory(evidenceDir, fixture);
  const finalize = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, EVIDENCE_DIR: evidenceDir, EXPECTED_SOURCE_SHA: actualSourceSha },
  });
  assert.equal(finalize.status, 0, `${finalize.stdout}\n${finalize.stderr}`);
  const readinessPath = path.join(evidenceDir, 'kidults-production-readiness.json');
  const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
  const bundleMembers = new Map(fixture.rawByMember);
  bundleMembers.set('production-readiness-evidence-v1.json', fs.readFileSync(path.join(evidenceDir, 'production-readiness-evidence-v1.json')));
  bundleMembers.set('kidults-production-readiness.json', fs.readFileSync(readinessPath));
  const evidenceBundleSha256 = evidenceBundleDigest(bundleMembers);
  const issued = new Date(readiness.generated_at);
  const expires = new Date(issued.getTime() + 60 * 60 * 1000);
  const receipt = makeOwnerReceipt(readiness.technical_evidence_summary, readiness, {
    issuedAt: issued.toISOString(),
    expiresAt: expires.toISOString(),
    evidenceBundleSha256,
  });
  fs.writeFileSync(path.join(evidenceDir, 'program-owner-production-release-receipt-v1.json'), rawJson(receipt), { mode: 0o600 });
  fs.writeFileSync(path.join(trustRoot, 'program-owner-ed25519-public.pem'), publicKeyPem, { mode: 0o600 });
  fs.writeFileSync(path.join(trustRoot, 'program-owner-ed25519-key-id'), `${keyId}\n`, { mode: 0o600 });
  return { anchor, archiveRoot, trustRoot, evidenceDir, actualSourceSha, fixture, readiness, receipt };
};

const runSafeSeal = (prepared, timestamp, overrides = {}) => {
  const env = {
    ...process.env,
    EVIDENCE_DIR: prepared.evidenceDir,
    EXPECTED_SOURCE_SHA: prepared.actualSourceSha,
    KIDULTS_PRODUCTION_SEAL_TEST_MODE: 'ENABLED_ISOLATED_SAFE_TEST_ONLY',
    KIDULTS_PRODUCTION_SEAL_TEST_ROOT: prepared.anchor,
    KIDULTS_PRODUCTION_SEAL_TEST_NODE: process.execPath,
    TIMESTAMP: timestamp,
    ...overrides,
  };
  delete env.ARCHIVE_ROOT;
  delete env.ARCHIVE_FILE;
  return spawnSync('bash', ['scripts/production/seal-kidults-production-evidence.sh'], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
};

const sealOutputPaths = (prepared, timestamp) => {
  const archive = path.join(prepared.archiveRoot, `kidults-production-evidence-${timestamp}.tar.gz`);
  return { archive, checksum: `${archive}.sha256`, manifest: `${archive}.manifest.json` };
};

const runWithHeldDirectoryLock = (directory, executable, args, env) => spawnSync(
  'python3',
  [
    '-I',
    '-c',
    [
      'import fcntl, os, subprocess, sys',
      'descriptor = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)',
      'fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)',
      'result = subprocess.run([sys.argv[2], *sys.argv[3:]], cwd=os.getcwd(), env=os.environ, text=True, capture_output=True)',
      'sys.stdout.write(result.stdout)',
      'sys.stderr.write(result.stderr)',
      'os.close(descriptor)',
      'raise SystemExit(result.returncode)',
    ].join('; '),
    directory,
    executable,
    ...args,
  ],
  { cwd: root, encoding: 'utf8', env },
);

test('finalizer emits technical readiness without granting Production authorization', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-finalizer-ready-'));
  try {
    const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const fixture = makeEvidenceFixture(actualSourceSha);
    setAuxiliaryEvidencePayload(fixture, 'production-audit.json', {
      database_integrity: 'ok',
      health_http: 200,
      portal_http: 200,
      unauthenticated_collector_http: 401,
      backup_integrity: 'ok',
    });
    setAuxiliaryEvidencePayload(fixture, 'staging-production-delta.json', {
      destructive_schema_delta: false,
      viewer_export_exposed: false,
      restricted_rights_exposed: false,
      rollback_rehearsal_passed: true,
      mobile_320_passed: true,
      governance_gate_passed: true,
      observability_passed: true,
      incident_response_ready: true,
    });
    writeEvidenceDirectory(temp, fixture);
    const result = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const readiness = JSON.parse(fs.readFileSync(path.join(temp, 'kidults-production-readiness.json'), 'utf8'));
    const { checksum: readinessChecksum, ...readinessWithoutChecksum } = readiness;
    assert.equal(readinessChecksum, sha256Object(readinessWithoutChecksum));
    assert.equal(readiness.decision, 'ready_for_program_owner_release');
    assert.equal(readiness.production_promotion_authorized, false);
    assert.equal(readiness.explicit_program_owner_release_required, true);
    validateReadinessDecision(readiness, readiness.technical_evidence_summary);

    const secondRun = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.equal(secondRun.status, 0, `${secondRun.stdout}\n${secondRun.stderr}`);

    const outputPath = path.join(temp, 'kidults-production-readiness.json');
    const secondRunMetadata = fs.lstatSync(outputPath);
    assert.equal(secondRunMetadata.isFile(), true);
    assert.equal(secondRunMetadata.nlink, 1);
    assert.equal(secondRunMetadata.mode & 0o7777, 0o600);
    assert.equal(fs.readdirSync(temp).some((name) => name.startsWith('.kidults-production-readiness.')), false);
    const outsideSentinel = path.join(temp, 'readiness-outside-sentinel');
    fs.unlinkSync(outputPath);
    fs.writeFileSync(outsideSentinel, 'must-not-change\n', { mode: 0o600 });
    fs.symlinkSync(outsideSentinel, outputPath);
    const symlinkRun = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.notEqual(symlinkRun.status, 0);
    assert.equal(fs.readFileSync(outsideSentinel, 'utf8'), 'must-not-change\n');
    assert.equal(fs.lstatSync(outputPath).isSymbolicLink(), true);

    fs.unlinkSync(outputPath);
    fs.linkSync(outsideSentinel, outputPath);
    const hardlinkRun = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.notEqual(hardlinkRun.status, 0);
    assert.equal(fs.readFileSync(outsideSentinel, 'utf8'), 'must-not-change\n');
    assert.equal(fs.statSync(outputPath).nlink, 2);

    fs.unlinkSync(outputPath);
    const fifoCreation = spawnSync(
      'python3',
      ['-I', '-c', 'import os, sys; os.mkfifo(sys.argv[1], 0o600)', outputPath],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(fifoCreation.status, 0, `${fifoCreation.stdout}\n${fifoCreation.stderr}`);
    const fifoRun = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2_000,
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.notEqual(fifoRun.status, 0);
    assert.notEqual(fifoRun.signal, 'SIGTERM');
    assert.match(fifoRun.stderr, /READINESS_OUTPUT_EXISTING_UNSAFE/);
    assert.equal(fs.lstatSync(outputPath).isFIFO(), true);
    assert.equal(fs.readdirSync(temp).some((name) => name.startsWith('.kidults-production-readiness.')), false);

    fs.unlinkSync(outputPath);
    const interruptedTemp = path.join(temp, `.kidults-production-readiness.${'a'.repeat(64)}.tmp`);
    fs.writeFileSync(interruptedTemp, 'interrupted-private-bytes\n', { mode: 0o600 });
    const interruptedRun = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.notEqual(interruptedRun.status, 0);
    assert.match(interruptedRun.stderr, /READINESS_OUTPUT_STALE_TEMP_HOLD/);
    assert.equal(fs.readFileSync(interruptedTemp, 'utf8'), 'interrupted-private-bytes\n');
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('finalizer holds while another readiness publication owns the evidence directory lock', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-finalizer-concurrent-'));
  try {
    const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const fixture = makeEvidenceFixture(actualSourceSha);
    setAuxiliaryEvidencePayload(fixture, 'production-audit.json', {
      database_integrity: 'ok',
      health_http: 200,
      portal_http: 200,
      unauthenticated_collector_http: 401,
      backup_integrity: 'ok',
    });
    setAuxiliaryEvidencePayload(fixture, 'staging-production-delta.json', {
      destructive_schema_delta: false,
      viewer_export_exposed: false,
      restricted_rights_exposed: false,
      rollback_rehearsal_passed: true,
      mobile_320_passed: true,
      governance_gate_passed: true,
      observability_passed: true,
      incident_response_ready: true,
    });
    writeEvidenceDirectory(temp, fixture);
    const result = runWithHeldDirectoryLock(
      temp,
      'python3',
      ['scripts/production/finalize-kidults-production-readiness.py'],
      { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /READINESS_OUTPUT_CONCURRENT_ATTEMPT_HOLD/);
    assert.equal(fs.existsSync(path.join(temp, 'kidults-production-readiness.json')), false);
    assert.equal(fs.readdirSync(temp).some((name) => name.startsWith('.kidults-production-readiness.')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('finalizer rejects a legacy evidence FIFO without blocking', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-finalizer-input-fifo-'));
  try {
    const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const fixture = makeEvidenceFixture(actualSourceSha);
    writeEvidenceDirectory(temp, fixture);
    const auditPath = path.join(temp, 'production-audit.json');
    fs.unlinkSync(auditPath);
    const fifoCreation = spawnSync(
      'python3',
      ['-I', '-c', 'import os, sys; os.mkfifo(sys.argv[1], 0o600)', auditPath],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(fifoCreation.status, 0, `${fifoCreation.stdout}\n${fifoCreation.stderr}`);
    const result = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2_000,
      env: { ...process.env, EVIDENCE_DIR: temp, EXPECTED_SOURCE_SHA: actualSourceSha },
    });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.notEqual(result.signal, 'SIGTERM');
    assert.equal(fs.lstatSync(auditPath).isFIFO(), true);
    const readiness = JSON.parse(fs.readFileSync(path.join(temp, 'kidults-production-readiness.json'), 'utf8'));
    assert.equal(readiness.decision, 'hold');
    assert.deepEqual(readiness.hard_blockers, ['LEGACY_AUDIT_EVIDENCE_INVALID']);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('readiness publication revalidates the held parent against directory replacement and symlink substitution', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-readiness-parent-binding-'));
  const probe = String.raw`
import importlib.util
import os
import sys
from pathlib import Path

script = Path(sys.argv[1])
evidence = Path(sys.argv[2])
replacement_kind = sys.argv[3]
spec = importlib.util.spec_from_file_location("kidults_readiness_finalizer", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
descriptor = os.open(evidence, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
moved = evidence.with_name(evidence.name + ".held")
os.rename(evidence, moved)
if replacement_kind == "directory":
    os.mkdir(evidence, 0o700)
else:
    os.symlink(moved, evidence, target_is_directory=True)
try:
    module.verify_parent_identity(descriptor, evidence, "EXPECTED_PARENT_BINDING_FAILURE")
except ValueError as exc:
    if str(exc) != "EXPECTED_PARENT_BINDING_FAILURE":
        raise
else:
    raise SystemExit("PARENT_NAMESPACE_SUBSTITUTION_ACCEPTED")
finally:
    os.close(descriptor)
`;
  try {
    for (const replacementKind of ['directory', 'symlink']) {
      const caseRoot = path.join(temp, replacementKind);
      fs.mkdirSync(caseRoot);
      const evidenceDir = path.join(caseRoot, 'evidence');
      fs.mkdirSync(evidenceDir, { mode: 0o700 });
      const result = spawnSync('python3', ['-I', '-c', probe, readinessFinalizerPath, evidenceDir, replacementKind], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }

    const source = fs.readFileSync(readinessFinalizerPath, 'utf8');
    const beforePublish = source.indexOf('READINESS_OUTPUT_PARENT_IDENTITY_CHANGED_BEFORE_PUBLISH');
    const rerunPublish = source.indexOf('os.replace(', beforePublish);
    const firstPublish = source.indexOf('rename_noreplace(', beforePublish);
    const finalParentFsync = source.indexOf('os.fsync(parent_fd)', Math.max(rerunPublish, firstPublish));
    const afterFsync = source.indexOf('READINESS_OUTPUT_PARENT_IDENTITY_CHANGED_AFTER_FSYNC', finalParentFsync);
    assert.ok(beforePublish >= 0 && beforePublish < rerunPublish && beforePublish < firstPublish);
    assert.ok(finalParentFsync > rerunPublish && finalParentFsync > firstPublish && afterFsync > finalParentFsync);

    const persistence = promotionContract.safety.readiness_output_persistence;
    assert.equal(persistence.single_checksum_bearing_json_is_the_only_commit_record, true);
    assert.equal(persistence.secondary_completion_sentinel_forbidden, true);
    assert.equal(persistence.parent_path_to_held_fd_identity_revalidated_immediately_before_publish, true);
    assert.equal(persistence.parent_path_to_held_fd_identity_revalidated_after_final_fsync, true);
    assert.equal(persistence.parent_path_replacement_or_symlink_at_revalidation_is, 'HOLD');
    assert.equal(persistence.special_file_collision_is, 'NONBLOCKING_HOLD');
    assert.equal(persistence.successful_finalizer_return_attests_file_and_parent_fsync_completion, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('seal script dynamically seals only an exact immutable snapshot in safe test mode', () => {
  const prepared = prepareSealTestFixture();
  try {
    const timestamp = 'dynamic-success';
    const result = runSafeSeal(prepared, timestamp);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const outputs = sealOutputPaths(prepared, timestamp);
    for (const output of Object.values(outputs)) {
      const metadata = fs.lstatSync(output);
      assert.equal(metadata.isFile(), true);
      assert.equal(metadata.nlink, 1);
      assert.equal(metadata.mode & 0o777, 0o600);
    }
    const archiveRaw = fs.readFileSync(outputs.archive);
    const archiveDigest = crypto.createHash('sha256').update(archiveRaw).digest('hex');
    assert.equal(fs.readFileSync(outputs.checksum, 'utf8'), `${archiveDigest}  ${path.basename(outputs.archive)}\n`);
    const manifest = JSON.parse(fs.readFileSync(outputs.manifest, 'utf8'));
    assert.equal(manifest.archive_sha256, `sha256:${archiveDigest}`);
    assert.equal(manifest.protected_executor_consumption_verified, false);
    assert.equal(manifest.production_change_executed, false);
    assert.equal(manifest.artfund_production_promotion_authorized, false);
    const listing = spawnSync('tar', ['-tzf', outputs.archive], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    const actualMembers = listing.stdout.trim().split('\n').sort();
    const expectedMembers = [
      ...prepared.fixture.rawByMember.keys(),
      'production-readiness-evidence-v1.json',
      'kidults-production-readiness.json',
      'program-owner-production-release-receipt-v1.json',
    ].sort();
    assert.deepEqual(actualMembers, expectedMembers);
    assert.equal(fs.readdirSync(prepared.archiveRoot).some((name) => name.startsWith('.seal-')), false);
  } finally {
    fs.rmSync(prepared.anchor, { recursive: true, force: true });
  }
});

test('seal script holds while another sealing attempt owns the archive-root lock', () => {
  const prepared = prepareSealTestFixture('kidults-production-seal-concurrent-');
  try {
    const timestamp = 'concurrent-lock';
    const env = {
      ...process.env,
      EVIDENCE_DIR: prepared.evidenceDir,
      EXPECTED_SOURCE_SHA: prepared.actualSourceSha,
      KIDULTS_PRODUCTION_SEAL_TEST_MODE: 'ENABLED_ISOLATED_SAFE_TEST_ONLY',
      KIDULTS_PRODUCTION_SEAL_TEST_ROOT: prepared.anchor,
      KIDULTS_PRODUCTION_SEAL_TEST_NODE: process.execPath,
      TIMESTAMP: timestamp,
    };
    delete env.ARCHIVE_ROOT;
    delete env.ARCHIVE_FILE;
    const result = runWithHeldDirectoryLock(
      prepared.archiveRoot,
      'bash',
      ['scripts/production/seal-kidults-production-evidence.sh'],
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SEAL_CONCURRENT_ATTEMPT_HOLD/);
    assert.deepEqual(fs.readdirSync(prepared.archiveRoot), []);
  } finally {
    fs.rmSync(prepared.anchor, { recursive: true, force: true });
  }
});

test('seal archive uses captured bytes when the source member changes after snapshot', () => {
  const prepared = prepareSealTestFixture('kidults-production-seal-swap-');
  try {
    const originalAudit = Buffer.from(prepared.fixture.rawByMember.get('production-audit.json'));
    const timestamp = 'evidence-swap';
    const result = runSafeSeal(prepared, timestamp, {
      KIDULTS_PRODUCTION_SEAL_TEST_MUTATE_MEMBER_AFTER_SNAPSHOT: 'production-audit.json',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.notDeepEqual(fs.readFileSync(path.join(prepared.evidenceDir, 'production-audit.json')), originalAudit);
    const extracted = spawnSync('tar', ['-xOzf', sealOutputPaths(prepared, timestamp).archive, 'production-audit.json']);
    assert.equal(extracted.status, 0, extracted.stderr.toString());
    assert.deepEqual(extracted.stdout, originalAudit);
  } finally {
    fs.rmSync(prepared.anchor, { recursive: true, force: true });
  }
});

test('seal RENAME_NOREPLACE preserves every preexisting collision and external sentinel', () => {
  const prepared = prepareSealTestFixture('kidults-production-seal-collision-');
  try {
    const cases = ['archive', 'checksum', 'manifest'].flatMap((targetKind) => [
      { targetKind, collisionKind: 'symlink' },
      { targetKind, collisionKind: 'hardlink' },
    ]);
    for (const [index, { targetKind, collisionKind }] of cases.entries()) {
      const timestamp = `collision-${collisionKind}-${index}`;
      const outputs = sealOutputPaths(prepared, timestamp);
      const sentinel = path.join(prepared.anchor, `outside-sentinel-${index}`);
      fs.writeFileSync(sentinel, `sentinel-${index}\n`, { mode: 0o600 });
      if (collisionKind === 'symlink') fs.symlinkSync(sentinel, outputs[targetKind]);
      else fs.linkSync(sentinel, outputs[targetKind]);
      const result = runSafeSeal(prepared, timestamp);
      assert.notEqual(result.status, 0);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), `sentinel-${index}\n`);
      if (collisionKind === 'symlink') {
        assert.equal(fs.lstatSync(outputs[targetKind]).isSymbolicLink(), true);
      } else {
        assert.equal(fs.lstatSync(outputs[targetKind]).isFile(), true);
        assert.equal(fs.lstatSync(outputs[targetKind]).nlink, 2);
        assert.equal(fs.lstatSync(sentinel).ino, fs.lstatSync(outputs[targetKind]).ino);
      }
      for (const [kind, output] of Object.entries(outputs)) {
        if (kind !== targetKind) assert.equal(fs.existsSync(output), false);
      }
      assert.equal(fs.readdirSync(prepared.archiveRoot).some((name) => name.startsWith('.seal-')), false);
    }
  } finally {
    fs.rmSync(prepared.anchor, { recursive: true, force: true });
  }
});

test('seal crash stages remain HOLD and manifest is never published before archive and checksum durability', () => {
  const snapshotCrash = prepareSealTestFixture('kidults-production-seal-snapshot-crash-');
  try {
    const result = runSafeSeal(snapshotCrash, 'snapshot-crash', {
      KIDULTS_PRODUCTION_SEAL_TEST_FAILPOINT: 'AFTER_SNAPSHOT_FSYNC',
    });
    assert.equal(result.status, 86, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readdirSync(snapshotCrash.archiveRoot).some((name) => /^\.seal-.*\.snapshot\.tmp$/.test(name)), true);
    const retry = runSafeSeal(snapshotCrash, 'snapshot-crash-retry');
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /SEAL_STALE_STAGE_HOLD/);
  } finally {
    fs.rmSync(snapshotCrash.anchor, { recursive: true, force: true });
  }

  const publishCrash = prepareSealTestFixture('kidults-production-seal-publish-crash-');
  try {
    const timestamp = 'publish-crash';
    const result = runSafeSeal(publishCrash, timestamp, {
      KIDULTS_PRODUCTION_SEAL_TEST_FAILPOINT: 'AFTER_ARCHIVE_CHECKSUM_PUBLISH',
    });
    assert.equal(result.status, 87, `${result.stdout}\n${result.stderr}`);
    const outputs = sealOutputPaths(publishCrash, timestamp);
    assert.equal(fs.existsSync(outputs.archive), true);
    assert.equal(fs.existsSync(outputs.checksum), true);
    assert.equal(fs.existsSync(outputs.manifest), false);
    assert.equal(fs.readdirSync(publishCrash.archiveRoot).some((name) => /^\.seal-.*\.manifest\.tmp$/.test(name)), true);
    const retry = runSafeSeal(publishCrash, 'publish-crash-retry');
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /SEAL_STALE_STAGE_HOLD/);
  } finally {
    fs.rmSync(publishCrash.anchor, { recursive: true, force: true });
  }
});

test('seal safe test mode fails closed when its private Program Owner trust anchor is unavailable', () => {
  const prepared = prepareSealTestFixture('kidults-production-seal-missing-trust-');
  try {
    fs.rmSync(prepared.trustRoot, { recursive: true, force: true });
    const result = runSafeSeal(prepared, 'missing-trust');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SEAL_TEST_TRUST_ROOT|No such file or directory/);
    assert.deepEqual(fs.readdirSync(prepared.archiveRoot), []);
  } finally {
    fs.rmSync(prepared.anchor, { recursive: true, force: true });
  }
});

test('seal script rejects Production output redirection before creating any archive files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-seal-redirect-'));
  try {
    const archivePath = path.join(temp, 'kidults-production-evidence-test.tar.gz');
    const result = spawnSync('bash', ['scripts/production/seal-kidults-production-evidence.sh'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ARCHIVE_FILE: archivePath },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Production seal output redirection is forbidden/);
    assert.equal(fs.existsSync(archivePath), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('finalizer holds when the governed technical evidence bundle is absent', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-finalizer-'));
  try {
    const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    writeAuditAndDeltaEnvelopes(temp, actualSourceSha, {
      database_integrity: 'ok',
      health_http: 200,
      portal_http: 200,
      unauthenticated_collector_http: 401,
      backup_integrity: 'ok',
    }, {
      destructive_schema_delta: false,
      viewer_export_exposed: false,
      restricted_rights_exposed: false,
      rollback_rehearsal_passed: true,
      mobile_320_passed: true,
      governance_gate_passed: true,
      observability_passed: true,
      incident_response_ready: true,
    });
    const result = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EVIDENCE_DIR: temp },
    });
    assert.equal(result.status, 1);
    const readiness = JSON.parse(fs.readFileSync(path.join(temp, 'kidults-production-readiness.json'), 'utf8'));
    assert.equal(readiness.decision, 'hold');
    assert.equal(readiness.production_promotion_authorized, false);
    assert.deepEqual(readiness.hard_blockers, ['TECHNICAL_EVIDENCE_MISSING']);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('finalizer preserves rollback decision for an unsafe observed Production state', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-production-finalizer-rollback-'));
  try {
    const actualSourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    writeAuditAndDeltaEnvelopes(temp, actualSourceSha, {
      database_integrity: 'failed', health_http: 500, portal_http: 500,
      unauthenticated_collector_http: 200, backup_integrity: 'failed',
    }, {
      destructive_schema_delta: true, viewer_export_exposed: true,
      restricted_rights_exposed: true, rollback_rehearsal_passed: false,
      mobile_320_passed: false, governance_gate_passed: false,
      observability_passed: false, incident_response_ready: false,
    });
    const result = spawnSync('python3', ['scripts/production/finalize-kidults-production-readiness.py'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, EVIDENCE_DIR: temp },
    });
    assert.equal(result.status, 1);
    const readiness = JSON.parse(fs.readFileSync(path.join(temp, 'kidults-production-readiness.json'), 'utf8'));
    assert.equal(readiness.decision, 'rollback');
    assert.equal(readiness.production_promotion_authorized, false);
    assert.ok(readiness.hard_blockers.includes('database_integrity_failure'));
    assert.ok(readiness.hard_blockers.includes('TECHNICAL_EVIDENCE_MISSING'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Production workflow verifies exact-SHA signed evidence before resolving the admin token', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/production-release.yml'), 'utf8');
  const evidenceGate = workflow.indexOf('Verify current-SOLD Production gate and Program Owner receipt');
  const adminToken = workflow.indexOf('KAIOS_PRODUCTION_ADMIN_TOKEN:');
  assert.ok(evidenceGate >= 0 && adminToken > evidenceGate);
  assert.match(workflow, /kidults-production-release-evidence-\$GITHUB_SHA/);
  assert.match(workflow, /PROGRAM_OWNER_RELEASE_PUBLIC_KEY_PEM/);
  assert.match(workflow, /RELEASE_EXECUTOR_PUBLIC_KEY_PEM/);
  assert.match(workflow, /\.github\/workflows\/kidults-production-release-evidence-v1\.yml/);
  assert.match(workflow, /artifacts\/\$EVIDENCE_ARTIFACT_ID\/zip/);
  assert.match(workflow, /artifact_digest = artifact\.get\("digest"\)/);
  assert.match(workflow, /verify-sealed-release/);
  assert.match(workflow, /--deployment-manifest-sha256 null/);
  assert.match(workflow, /--expected-source-sha "\$GITHUB_SHA"/);
});

test('governed evidence producer remains hard-disabled until the root helper and evidence exist', () => {
  const producer = promotionContract.evidence_producer;
  assert.equal(producer.exact_workflow_path, '.github/workflows/kidults-production-release-evidence-v1.yml');
  assert.equal(producer.availability, 'IMPLEMENTED_FAIL_CLOSED_AWAITING_ROOT_HELPER_INSTALL_AND_EVIDENCE');
  assert.equal(producer.certification_state, 'HOLD');
  assert.equal(producer.production_authority, 'HARD_DISABLED');
  assert.equal(fs.existsSync(path.join(root, producer.exact_workflow_path)), true);

  const canonicalSuccessor = 'contracts/certification/kidults-controlled-production-promotion.v1.json';
  for (const legacyContract of [legacyReadinessContract, legacyRuntimeAuditContract]) {
    assert.equal(legacyContract.status, 'SUPERSEDED_FAIL_CLOSED');
    assert.equal(legacyContract.superseded_by, canonicalSuccessor);
  }
  assert.equal(legacyReadinessContract.minimum_go_score, 100);
  assert.match(legacyReadinessContract.decisions.go, /exactly 100\/100/);
  assert.equal(legacyRuntimeAuditContract.score.go_threshold, 100);
  assert.match(legacyRuntimeAuditContract.decision_rules.go, /exactly 100\/100/);
  assert.match(legacyRuntimeAuditRunbook, /superseded fail-closed/);
  assert.match(legacyRuntimeAuditRunbook, /score is exactly 100\/100/);
  assert.doesNotMatch(legacyRuntimeAuditRunbook, /score at least 90|score 70–89/);
});

test('governed evidence producer is exact-main, fixed-path, self-hosted, and non-promoting', () => {
  const workflow = fs.readFileSync(path.join(root, promotionContract.evidence_producer.exact_workflow_path), 'utf8');
  for (const required of [
    'workflow_dispatch:',
    'runs-on: [self-hosted, linux, x64, kidults-production-evidence]',
    'environment: kidults-production-evidence',
    'cancel-in-progress: false',
    'test "$GITHUB_REF" = refs/heads/main',
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"',
    'persist-credentials: false',
    'KIDULTS_EVIDENCE_INTAKE: /var/lib/kaios/kidults-production-release/evidence-intake',
    'KIDULTS_ARCHIVE_ROOT: /mnt/ih_prod_01/backups/production-certification',
    'sudo -n /usr/local/libexec/kidults-production-evidence-root-helper',
    'SEALED_EXPORT_EXACT_PAIR_REQUIRED',
    'manifest.get("source_sha") != str(source_sha)',
    'name: kidults-production-release-evidence-${{ github.sha }}',
    'overwrite: false',
    'Production/Public/G5 remain HOLD',
  ]) assert.ok(workflow.includes(required), `producer missing boundary: ${required}`);
  for (const forbidden of [
    'pull_request:',
    'pull_request_target:',
    'schedule:',
    'push:',
    'ubuntu-latest',
    'ubuntu-24.04',
    'docker compose up',
    'promote-kidults-controlled.sh',
    'KAIOS_PRODUCTION_ADMIN_TOKEN',
  ]) assert.ok(!workflow.includes(forbidden), `producer contains forbidden capability: ${forbidden}`);
  assert.ok(!workflow.includes('EVIDENCE_DIR="$KIDULTS_EVIDENCE_INTAKE" bash scripts/production/seal-kidults-production-evidence.sh'));
  assert.ok(!workflow.includes('os.stat(path, follow_symlinks=False)'), 'unprivileged workflow must not inspect root-only evidence paths');

  const mutations = [
    workflow.replace('test "$GITHUB_REF" = refs/heads/main', 'true'),
    workflow.replace('test "$GITHUB_RUN_ATTEMPT" = 1', 'true'),
    workflow.replace('persist-credentials: false', 'persist-credentials: true'),
    workflow.replace('runs-on: [self-hosted, linux, x64, kidults-production-evidence]', 'runs-on: ubuntu-24.04'),
    workflow.replace('overwrite: false', 'overwrite: true'),
  ];
  const guards = [
    'test "$GITHUB_REF" = refs/heads/main',
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'persist-credentials: false',
    'runs-on: [self-hosted, linux, x64, kidults-production-evidence]',
    'overwrite: false',
  ];
  mutations.forEach((value, index) => assert.ok(!value.includes(guards[index]), `producer mutation remained undetected: ${guards[index]}`));
});

test('Production evidence privilege bridge is fixed-command, digest-pinned, and fail-closed', () => {
  const helper = fs.readFileSync(path.join(root, 'scripts/production/kidults-production-evidence-root-helper'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'scripts/production/install-kidults-production-evidence-root-helper.sh'), 'utf8');
  for (const required of [
    '[[ "$#" -eq 0 ]] || fail ARGUMENTS_FORBIDDEN',
    '[[ "${SUDO_USER:-}" == kidults-runner ]] || fail CALLER_NOT_AUTHORIZED',
    'readonly WORKSPACE=/opt/actions-runner/_work/kaios_enterprise_repo/kaios_enterprise_repo',
    '[[ "$ACTUAL_SHA" == "$SOURCE_SHA" ]] || fail CHECKOUT_SHA_NOT_PINNED',
    'is_canonical_origin "$ACTUAL_ORIGIN" || fail ORIGIN_NOT_CANONICAL',
    'verify_file "$COMPOSER_REL" "$COMPOSER_SHA256"',
    'verify_file "$SEALER_REL" "$SEALER_SHA256"',
    'verify_file "$GATE_REL" "$GATE_SHA256"',
    'verify_file "$POLICY_REL" "$POLICY_SHA256"',
    'verify_file "$CONTRACT_REL" "$CONTRACT_SHA256"',
    'verify_protected_directory EVIDENCE_INTAKE "$EVIDENCE_INTAKE"',
    'verify_protected_directory ARCHIVE_ROOT "$ARCHIVE_ROOT"',
    '(( (8#${BASH_REMATCH[1]} & 8#022) == 0 )) || fail "${label}_WRITABLE"',
    '/usr/bin/env -i',
    '/usr/bin/node "$WORKSPACE/$COMPOSER_REL"',
  ]) assert.ok(helper.includes(required), `root helper missing boundary: ${required}`);
  for (const canonical of [
    'https://github.com/johnkim9524-collab/kaios_enterprise_repo',
    'https://github.com/johnkim9524-collab/kaios_enterprise_repo.git',
  ]) {
    assert.ok(helper.includes(canonical), `root helper missing canonical origin: ${canonical}`);
    assert.ok(installer.includes(canonical), `installer missing canonical origin: ${canonical}`);
  }
  for (const forbidden of ['eval ', 'bash -c', 'sh -c', '"$@"', '${@}']) {
    assert.ok(!helper.includes(forbidden), `root helper contains forbidden general execution: ${forbidden}`);
  }
  assert.ok(installer.includes('kidults-runner ALL=(root) NOPASSWD: /usr/local/libexec/kidults-production-evidence-root-helper'));
  assert.ok(installer.includes('visudo -cf "$sudoers_tmp"'));
  assert.ok(installer.includes('chmod 0440 "$sudoers_tmp"'));
  assert.ok(installer.includes('chmod 0600 "$config_tmp"'));
  assert.ok(installer.includes("printf 'COMPOSER_SHA256=%q\\n'"));
});

test('standalone promotion binds Owner-approved compose bytes and image IDs through the final mutation marker', () => {
  const promotion = fs.readFileSync(path.join(root, 'scripts/production/promote-kidults-controlled.sh'), 'utf8');
  const rollback = fs.readFileSync(path.join(root, 'scripts/production/rollback-kidults-controlled.sh'), 'utf8');
  assert.match(promotion, /attestation\.get\("deployment_manifest_sha256"\)/);
  assert.match(promotion, /--deployment-manifest-sha256 "\$\{DEPLOYMENT_MANIFEST_SHA256\}"/);
  assert.match(promotion, /sha256:\$\{current_prod_compose_sha256\}.*DEPLOYMENT_MANIFEST_SHA256/);
  assert.match(promotion, /"deployment_manifest_sha256": sys\.argv\[10\]/);
  assert.match(promotion, /os\.O_EXCL \| getattr\(os, "O_NOFOLLOW", 0\)/);
  assert.match(promotion, /os\.fsync\(descriptor\)/);
  assert.match(promotion, /"rollback_pin_root_identity": sys\.argv\[11\]/);
  assert.match(promotion, /"prepared_rollback_identity": sys\.argv\[12\]/);
  assert.match(promotion, /verify_protected_directory_fd "\$\{ROLLBACK_PIN_ROOT\}" 9/);
  assert.match(promotion, /verify_protected_directory_fd "\$\{PREPARED_ROLLBACK_DIR\}" 8/);
  assert.match(rollback, /payload\.get\("rollback_pin_root_identity"\) == sys\.argv\[5\]/);
  assert.match(rollback, /payload\.get\("prepared_rollback_identity"\) == sys\.argv\[6\]/);
  assert.match(rollback, /PREDEPLOYMENT_SNAPSHOT_DIR="\/proc\/self\/fd\/8"/);
});
