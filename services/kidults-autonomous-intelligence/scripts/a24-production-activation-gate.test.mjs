import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  digestJson,
  evaluateTarget,
  exactOneSidedCpUpper,
  loadGovernanceBindings,
  runGate,
  validateProductionReadinessEvidence,
} from './a24-production-activation-gate.mjs';
import {
  checkActivationEligibility,
  PRODUCTION_AUTHORITY_HARD_DISABLED_PENDING_SIGNED_ARCHIVE_CONSUMER,
} from './lib/autonomous-production-runtime.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceSha = 'a'.repeat(40);
const policy = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts', 'a24-production-activation-policy.json'), 'utf8'));
const rollbackContract = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts', 'a24-rollback-contract.json'), 'utf8'));

function syntheticBindings() {
  const bindings = structuredClone(loadGovernanceBindings());
  bindings.rightsManifest.value.production = 'AUTHORIZED';
  bindings.rightsManifest.value.live_authorized_fields = [{ source_id: 'TEST_PROVIDER', field: 'sold_price' }];
  bindings.rightsManifest.digest = digestJson(bindings.rightsManifest.value);
  bindings.providerRegistry.value.providers = [{
    provider_id: 'TEST_PROVIDER',
    adapter_state: 'ACTIVE',
    rights_state: 'RIGHTS_CLEAR',
    production: 'AUTHORIZED',
  }];
  bindings.providerRegistry.digest = digestJson(bindings.providerRegistry.value);
  return bindings;
}

function syntheticContext(bindings = syntheticBindings()) {
  return {
    bindings,
    sourceSha,
    repositoryState: {
      sourceSha,
      synchronizedRepositoryState: true,
      expectedBranchState: true,
      actualBranch: 'main',
      expectedBranch: 'main',
      dirtyPaths: [],
      errors: [],
    },
    stageEvidence: Array.from({ length: 9 }, (_, index) => ({
      stage: `A${index + 15}`,
      found: true,
      valid: true,
      status: 'PASS',
      sourceSha,
    })),
    policy,
    rollbackContract,
  };
}

function productionEvidence(context) {
  const firstStart = Date.parse('2026-08-01T00:00:00.000Z');
  const sevenDays = 7 * 86_400_000;
  const runs = Array.from({ length: 30 }, (_, index) => {
    const startedAt = firstStart + Math.round((sevenDays * index) / 29);
    return {
      run_id: `natural-run-${String(index + 1).padStart(2, '0')}`,
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date(startedAt + 3_600_000).toISOString(),
      source_sha: sourceSha,
      policy_digest: context.bindings.samplePolicy.digest,
      rights_digest: context.bindings.rightsManifest.digest,
      schema_digest: `sha256:${'1'.repeat(64)}`,
      cohort_digest: `sha256:${'2'.repeat(64)}`,
      pitr_receipt_id: `pitr-${index + 1}`,
      rollback_receipt_id: `rollback-${index + 1}`,
      slo_state: 'PASS',
      error_budget_state: 'WITHIN_BUDGET',
    };
  });
  const evidence = {
    id: 'KIDULTS_A24_PRODUCTION_READINESS_EVIDENCE_V1',
    version: '1.0.0',
    source_sha: sourceSha,
    requested_claim: 'PRODUCTION',
    approved_targets: ['entity-master'],
    sample_decision: {
      policy_id: context.bindings.samplePolicy.value.id,
      policy_version: context.bindings.samplePolicy.value.version,
      policy_digest: context.bindings.samplePolicy.digest,
      alignment_digest: context.bindings.sampleAlignment.digest,
      tier: 'BETA_RELIABILITY',
      effective_n: 4603,
      defect_counts: { CRITICAL: 0, MAJOR_A: 0, MAJOR_B: 0, OPERATIONAL: 0 },
      coverage_gate: 'PASS',
      concentration_gate: 'PASS',
      track_b_decision_receipt_id: 'track-b-beta-reliability-test-only',
      track_b_assessment_digest: `sha256:${'3'.repeat(64)}`,
    },
    rights_decision: {
      manifest_digest: context.bindings.rightsManifest.digest,
      census: 'PASS',
      every_event_admitted: true,
      admitted_event_count: 4603,
    },
    provider_decision: {
      registry_digest: context.bindings.providerRegistry.digest,
      provider_ids: ['TEST_PROVIDER'],
      active_adapter_count: 1,
      authentication_state: 'PASS',
      permission_state: 'PASS',
    },
    natural_runs: { count: runs.length, runs },
    slo_error_budget: {
      slo_state: 'PASS',
      error_budget_state: 'WITHIN_BUDGET',
      receipt_id: 'slo-error-budget-test-only',
    },
    recovery_decision: {
      pitr_state: 'PASS',
      rollback_state: 'PASS',
      pitr_receipt_id: 'pitr-summary-test-only',
      rollback_receipt_id: 'rollback-summary-test-only',
    },
    bounded_mutation: {
      max_rows_affected: 100,
      max_objects_affected: 10,
      max_provider_calls: 0,
      max_external_publications: 0,
      max_commercial_deliveries: 0,
    },
    program_owner_approval: {
      state: 'APPROVED',
      program_owner_id: 'TEST_ONLY_PROGRAM_OWNER',
      receipt_id: 'owner-approval-test-only',
      source_sha: sourceSha,
      approved_at: new Date(Math.max(...runs.map((run) => Date.parse(run.completed_at))) + 3_600_000).toISOString(),
    },
  };
  evidence.evidence_fingerprint = digestJson(evidence);
  return evidence;
}

function resign(evidence) {
  const clone = structuredClone(evidence);
  delete clone.evidence_fingerprint;
  clone.evidence_fingerprint = digestJson(clone);
  return clone;
}

const context = syntheticContext();
const valid = productionEvidence(context);
const positive = validateProductionReadinessEvidence(valid, context);
assert.equal(positive.technicalDecision, 'PASS');
assert.equal(positive.decision, 'HOLD');
assert.equal(positive.authorityDecision, 'HOLD');
assert.deepEqual(positive.authorityBlockers, ['productionAuthorityHardDisabledPendingSignedArchiveConsumer']);
assert.ok(positive.derived.exactCpUpperBound <= 0.001);
assert.ok(Math.abs(exactOneSidedCpUpper(0, 4603, 0.99) - (1 - 0.01 ** (1 / 4603))) < 1e-12);

// This is deliberately a complete, self-declared bundle whose integrity marker
// can be recomputed by its author.  It may pass technical diagnostics, but it
// cannot become Production authority without a signed archive-verified consumer.
const selfDeclaredEvaluation = evaluateTarget({
  product: 'entity-master',
  dimension: 'identity',
  providerDependency: false,
  productionEligible: true,
}, positive, policy);
assert.equal(selfDeclaredEvaluation.technicalReadinessPassed, true);
assert.equal(selfDeclaredEvaluation.activationAllowed, false);
assert.equal(selfDeclaredEvaluation.productionEligible, false);
assert.equal(selfDeclaredEvaluation.policyExplicitlyPermits, false);
assert.equal(selfDeclaredEvaluation.effectiveActivationClass, 'DENIED');
assert.equal(selfDeclaredEvaluation.production, 'HOLD');
assert.ok(selfDeclaredEvaluation.denialReasons.includes('productionAuthorityHardDisabledPendingSignedArchiveConsumer'));

const negatives = [
  ['missing-evidence', null, 'evidencePresent', context],
  ['critical-defect', resign({ ...valid, sample_decision: { ...valid.sample_decision, defect_counts: { ...valid.sample_decision.defect_counts, CRITICAL: 1 } } }), 'criticalDefectsZero', context],
  ['major-a-cp', resign({ ...valid, sample_decision: { ...valid.sample_decision, defect_counts: { ...valid.sample_decision.defect_counts, MAJOR_A: 1 } } }), 'exactCpUpperBound', context],
  ['below-beta-effective-n', resign({ ...valid, sample_decision: { ...valid.sample_decision, effective_n: 4602 } }), 'effectiveN', context],
  ['control-tier', resign({ ...valid, sample_decision: { ...valid.sample_decision, tier: 'CONTROL_ONLY_FUNCTIONAL' } }), 'betaTier', context],
  ['short-natural-run-count', resign({ ...valid, natural_runs: { count: 29, runs: valid.natural_runs.runs.slice(0, 29) } }), 'naturalRunCount', context],
  ['short-natural-run-window', resign({
    ...valid,
    natural_runs: {
      count: 30,
      runs: valid.natural_runs.runs.map((run, index) => ({
        ...run,
        started_at: new Date(Date.parse('2026-08-01T00:00:00.000Z') + index * 14_400_000).toISOString(),
        completed_at: new Date(Date.parse('2026-08-01T01:00:00.000Z') + index * 14_400_000).toISOString(),
      })),
    },
  }), 'naturalRunWindow', context],
  ['natural-run-rollback-receipt-missing', resign({
    ...valid,
    natural_runs: {
      count: 30,
      runs: valid.natural_runs.runs.map((run, index) => index === 0 ? { ...run, rollback_receipt_id: null } : run),
    },
  }), 'naturalRunReceipts', context],
  ['rights-digest-rebind', resign({ ...valid, rights_decision: { ...valid.rights_decision, manifest_digest: `sha256:${'f'.repeat(64)}` } }), 'rightsManifestBinding', context],
  ['provider-permission', resign({ ...valid, provider_decision: { ...valid.provider_decision, permission_state: 'HOLD' } }), 'providerPermissionReadiness', context],
  ['pitr-missing', resign({ ...valid, recovery_decision: { ...valid.recovery_decision, pitr_receipt_id: null } }), 'pitrAndRollback', context],
  ['owner-approval-missing', resign({ ...valid, program_owner_approval: { ...valid.program_owner_approval, state: 'HOLD' } }), 'programOwnerApproval', context],
  ['wrong-source-sha', resign({ ...valid, source_sha: 'b'.repeat(40) }), 'sourceShaBinding', context],
  ['dirty-repository', valid, 'repositoryClean', { ...context, repositoryState: { ...context.repositoryState, synchronizedRepositoryState: false } }],
  ['wrong-branch', valid, 'protectedMainBranch', { ...context, repositoryState: { ...context.repositoryState, expectedBranchState: false, actualBranch: 'feature' } }],
  ['stale-stage-evidence', valid, 'stageEvidenceExactHead', { ...context, stageEvidence: context.stageEvidence.map((entry, index) => index === 0 ? { ...entry, valid: false } : entry) }],
  ['authority-hard-disable-contract-removed', valid, 'productionAuthorityContractHardDisable', {
    ...context,
    policy: { ...context.policy, production_authority_hard_disabled_pending_signed_archive_consumer: false },
  }],
];

for (const [label, evidence, expectedCheck, negativeContext] of negatives) {
  const decision = validateProductionReadinessEvidence(evidence, negativeContext);
  assert.equal(decision.decision, 'HOLD', label);
  assert.equal(decision.technicalDecision, 'HOLD', label);
  assert.ok(decision.failedChecks.includes(expectedCheck), `${label}:${decision.failedChecks.join(',')}`);
}

assert.equal(checkActivationEligibility({ activationClass: 'CANARY_READY', dataStrategy: 'SELF-FIRST', productionEligible: true }).permitted, false, 'legacy canary class reached runtime');
assert.equal(checkActivationEligibility({ activationClass: 'BOUNDED_PRODUCTION_READY', dataStrategy: 'SELF-FIRST', productionEligible: true }).permitted, false, 'legacy bounded class reached runtime');
assert.equal(checkActivationEligibility({ activationClass: 'PRODUCTION_READY', dataStrategy: 'SELF-FIRST', productionEligible: true, policyExplicitlyPermits: false }).permitted, false);
assert.equal(PRODUCTION_AUTHORITY_HARD_DISABLED_PENDING_SIGNED_ARCHIVE_CONSUMER, true);
const forgedRuntimeAuthority = checkActivationEligibility({
  activationClass: 'PRODUCTION_READY',
  dataStrategy: 'SELF-FIRST',
  productionEligible: true,
  policyExplicitlyPermits: true,
});
assert.equal(forgedRuntimeAuthority.permitted, false);
assert.equal(forgedRuntimeAuthority.reason, 'production-authority-hard-disabled-pending-signed-archive-consumer');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-a24-test-'));
try {
  const currentTruth = runGate({ outputDirectory: temporary, readinessEvidence: { found: false, ref: 'TEST_ONLY/MISSING', data: null } });
  assert.equal(currentTruth.report.status, 'HOLD');
  assert.equal(currentTruth.report.activationAllowedCount, 0);
  assert.ok(currentTruth.report.evaluations.every((entry) => entry.activationAllowed === false));
  assert.ok(currentTruth.report.evaluations.every((entry) => entry.productionEligible === false && entry.policyExplicitlyPermits === false));
  assert.equal(currentTruth.report.productionAuthority.decision, 'HOLD');
  assert.equal(currentTruth.report.truthBoundary.production_authority_hard_disabled_pending_signed_archive_consumer, true);
  assert.equal(currentTruth.report.certificationGates.productionAuthorityHardDisableSealed, true);
  assert.ok(currentTruth.report.stageEvidence.every((entry) => entry.status !== 'INFERRED_PASS'));
  assert.equal(currentTruth.gateIntegrityPassed, true);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  suite: 'A24_PRODUCTION_ACTIVATION_FAIL_CLOSED_V2',
  result: 'PASS',
  positive_hypothetical_technical_diagnostic_test: 1,
  self_declared_bundle_authority_rejection_test: 1,
  negative_tests: negatives.length + 6,
  current_repository_truth: 'HOLD',
  production_execution: 'NOT_RUN',
  public: 'HOLD',
  g5: 'HOLD',
}, null, 2));
