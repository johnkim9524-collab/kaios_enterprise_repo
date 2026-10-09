// SYNTHETIC TEST FIXTURES ONLY. Not runtime, staging, natural-run or release evidence.
// Derived from the unchanged production-release-evidence-gate-v1.test.mjs fixture factory.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const sourceSha = 'a'.repeat(40);
const policyRaw = fs.readFileSync('coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json');
const policy = JSON.parse(policyRaw);
const digest = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
const policySha256 = digest(policyRaw);
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

export const makeEvidenceFixture = (boundSourceSha = sourceSha) => {
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

export const writeEvidenceDirectory = (evidenceDir, fixture) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const [member, raw] of fixture.rawByMember) {
    const memberPath = path.join(evidenceDir, member);
    fs.mkdirSync(path.dirname(memberPath), { recursive: true });
    fs.writeFileSync(memberPath, raw);
  }
  fs.writeFileSync(path.join(evidenceDir, 'production-readiness-evidence-v1.json'), rawJson(fixture.evidence));
};

