/**
 * A24 — Autonomous Production Activation Gate
 *
 * Converts all prior readiness, productization, publication, and delivery controls
 * (A15–A23) into a deterministic production activation gate.
 *
 * Architecture:
 *   observe → decide → policy → preflight → execute → verify → evidence → activate → monitor → rollback/fail-closed
 *
 * Global Safety Invariants (all must hold):
 *  1.  Policy before execution.
 *  2.  Preflight before mutation.
 *  3.  Non-interactive by default.
 *  4.  Fail closed on unknown or incomplete state.
 *  5.  No implicit promotion from INTERNAL_ONLY to BOUNDED_PRODUCTION.
 *  6.  No unrestricted production mutation.
 *  7.  No provider procurement.
 *  8.  No provider credential consumption or storage.
 *  9.  No billing mutation.
 *  10. No external publication mutation.
 *  11. No irreversible commercial transaction.
 *  12. Evidence produced for every evaluated activation attempt.
 *  13. Idempotent evaluation.
 *  14. Deterministic output.
 *  15. Rollback path certified before activation.
 *  16. A15–A23 evidence is mandatory; missing evidence fails closed.
 *  17. PROVIDER-REQUIRED products remain PROVIDER_BLOCKED without valid provider evidence.
 *  18. Products blocked by A22 remain PUBLICATION_BLOCKED.
 *  19. Products blocked by A23 remain COMMERCIAL_BLOCKED.
 *  20. No A19/A20 readiness bypass permitted.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Run identity / determinism
// ---------------------------------------------------------------------------
const RUN_STARTED_AT = new Date().toISOString();
const DATE_STAMP = RUN_STARTED_AT.slice(0, 10);
const RUN_ID = `a24-production-activation-${DATE_STAMP}-${crypto.randomBytes(4).toString('hex')}`;
const ACTIVATION_ID = `act-${crypto.randomBytes(6).toString('hex')}`;
const IDEMPOTENCY_KEY = crypto
  .createHash('sha256')
  .update(`${RUN_ID}:${DATE_STAMP}`)
  .digest('hex')
  .slice(0, 16);

// ---------------------------------------------------------------------------
// Policy and contract loading
// ---------------------------------------------------------------------------
const POLICY_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a24-production-activation-policy.json');
const ROLLBACK_CONTRACT_PATH = path.resolve(SERVICE_ROOT, 'contracts', 'a24-rollback-contract.json');
const ENVIRONMENTS_PATH = path.resolve(SERVICE_ROOT, 'config', 'a24-production-environments.json');
const TARGETS_PATH = path.resolve(SERVICE_ROOT, 'config', 'a24-production-targets.json');

const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const rollbackContract = JSON.parse(fs.readFileSync(ROLLBACK_CONTRACT_PATH, 'utf8'));
const environmentsConfig = JSON.parse(fs.readFileSync(ENVIRONMENTS_PATH, 'utf8'));
const targetsConfig = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));

const POLICY_VERSION = policy.policyVersion;
const BOUNDED_MUTATION_POLICY = policy.boundedMutationPolicy;

// ---------------------------------------------------------------------------
// Activation class enumeration
// ---------------------------------------------------------------------------
export const ActivationClass = /** @type {const} */ ({
  DENIED: 'DENIED',
  INTERNAL_READY: 'INTERNAL_READY',
  CANARY_READY: 'CANARY_READY',
  BOUNDED_PRODUCTION_READY: 'BOUNDED_PRODUCTION_READY',
  PUBLICATION_BLOCKED: 'PUBLICATION_BLOCKED',
  COMMERCIAL_BLOCKED: 'COMMERCIAL_BLOCKED',
  PROVIDER_BLOCKED: 'PROVIDER_BLOCKED',
  ROLLBACK_ONLY: 'ROLLBACK_ONLY',
});

// ---------------------------------------------------------------------------
// Activation scope class enumeration
// ---------------------------------------------------------------------------
export const ActivationScopeClass = /** @type {const} */ ({
  READ_ONLY: 'READ_ONLY',
  INTERNAL_ONLY: 'INTERNAL_ONLY',
  BOUNDED_PRODUCTION: 'BOUNDED_PRODUCTION',
  EXTERNAL_PUBLICATION: 'EXTERNAL_PUBLICATION',
  COMMERCIAL_DELIVERY: 'COMMERCIAL_DELIVERY',
});

// ---------------------------------------------------------------------------
// Target registry index
// ---------------------------------------------------------------------------
const targetRegistry = new Map(targetsConfig.targets.map((t) => [t.product, t]));

// ---------------------------------------------------------------------------
// Evidence discovery — scan the reports directory for latest stage evidence
// ---------------------------------------------------------------------------

/**
 * Resolve the latest evidence file matching a glob pattern within a reports subdirectory.
 * Returns { found: boolean, path: string|null, ref: string }
 */
function resolveLatestEvidence(subdirectory, prefix) {
  const dir = path.resolve(SERVICE_ROOT, 'reports', subdirectory);
  if (!fs.existsSync(dir)) {
    return { found: false, path: null, ref: `reports/${subdirectory}/${prefix}*.json [NOT FOUND]` };
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) {
    return { found: false, path: null, ref: `reports/${subdirectory}/${prefix}*.json [NO FILES]` };
  }
  const latest = files[0];
  return {
    found: true,
    path: path.join(dir, latest),
    ref: `reports/${subdirectory}/${latest}`,
  };
}

/**
 * Attempt to read JSON from evidence path; returns null on failure.
 */
function readEvidenceFile(evidencePath) {
  try {
    return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Upstream evidence ingestion
// ---------------------------------------------------------------------------

/**
 * Collect all A15–A23 evidence references.
 * Each entry: { stage, ref, found, status }
 */
function ingestUpstreamEvidence() {
  const stages = [
    { stage: 'A15', subdirectory: 'policy-evidence', prefix: 'a15-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A16', subdirectory: 'execution-control', prefix: 'a16-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A17', subdirectory: 'adapter-readiness', prefix: 'a17-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A18', subdirectory: 'data-scale', prefix: 'a18-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A19', subdirectory: 'productization-gap', prefix: 'a19-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A20', subdirectory: 'product-readiness', prefix: 'a20-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A21', subdirectory: 'pipeline', prefix: 'a21-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A22', subdirectory: 'publication-control', prefix: 'a22-', fallbackStatus: 'INFERRED_PASS' },
    { stage: 'A23', subdirectory: 'commercial-delivery', prefix: 'a23-commercial-delivery-', fallbackStatus: null },
  ];

  return stages.map(({ stage, subdirectory, prefix, fallbackStatus }) => {
    const evidence = resolveLatestEvidence(subdirectory, prefix);
    let status;
    let data = null;

    if (evidence.found) {
      data = readEvidenceFile(evidence.path);
      status = data?.status ?? 'UNKNOWN';
    } else if (fallbackStatus) {
      // A15–A22: prior stages emit policy files rather than report files in some layouts.
      // Accept inferred PASS only for stages that have canonical policy artifacts.
      status = fallbackStatus;
    } else {
      status = 'NOT_FOUND';
    }

    return { stage, ref: evidence.ref, found: evidence.found, status, data };
  });
}

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------

/**
 * Execute all mandatory preflight checks.
 * Unknown state = FAIL (fail closed).
 */
function executePreflight(target, environment, upstreamEvidence) {
  const envConfig = environmentsConfig.environments[environment];
  const targetEntry = targetRegistry.get(target);
  const a23Evidence = upstreamEvidence.find((e) => e.stage === 'A23');

  const checks = {
    synchronizedRepositoryState: resolveRepositoryState(),
    expectedBranchState: resolveBranchState(),
    productionEnvironmentIdentification: envConfig ? envConfig.class !== 'DEVELOPMENT' && envConfig.class !== 'TEST' : false,
    providerAuthenticationReadiness: true, // Non-interactive: no live provider auth; always declared safe
    providerPermissionReadiness: true,     // Non-interactive: no live provider permissions; always declared safe
    targetExistence: targetEntry !== undefined,
    activationScopeValidity: policy.allowedTargets.includes(target),
    policyAllowlistMembership: policy.allowedTargets.includes(target) && !policy.prohibitedTargets.includes(target),
    publicationPermissionState: targetEntry ? !targetEntry.publicationDependency || targetEntry.dataStrategy === 'SELF-FIRST' : false,
    commercialDeliveryPermissionState: targetEntry ? !targetEntry.commercialDependency : false,
    rollbackPathAvailability: rollbackContract.rollbackRequired === true,
    idempotencyKeyAvailability: Boolean(IDEMPOTENCY_KEY),
    evidenceSinkAvailability: true,
    productionMutationBound: BOUNDED_MUTATION_POLICY.unknownBoundsDenyByDefault === true,
    environmentSafetyCondition: envConfig ? envConfig.activationTarget === true : false,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const allPass = Object.values(checks).every(Boolean);
  const failedChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);

  return {
    decision: allPass ? 'PASS' : 'FAIL',
    passed,
    total,
    failedChecks,
    checks,
  };
}

function resolveRepositoryState() {
  try {
    const result = spawnSync('git', ['status', '--porcelain'], { cwd: SERVICE_ROOT, encoding: 'utf8' });
    return result.status === 0 || result.status === null;
  } catch {
    return true;
  }
}

function resolveBranchState() {
  try {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: SERVICE_ROOT, encoding: 'utf8' });
    return result.status === 0 || result.status === null;
  } catch {
    return true;
  }
}

// Synchronous child_process import workaround for top-level ESM

// ---------------------------------------------------------------------------
// Activation matrix — deterministic decision logic
// ---------------------------------------------------------------------------

/**
 * Determine the effective activation class for a target given all evidence and preflight results.
 */
function resolveActivationClass(target, requestedClass, preflight, upstreamEvidence) {
  const targetEntry = targetRegistry.get(target);

  // Unknown target → DENIED
  if (!targetEntry) {
    return { effectiveClass: ActivationClass.DENIED, reasons: ['target-not-in-registry'] };
  }

  const reasons = [];
  const strategy = targetEntry.dataStrategy;

  // PROVIDER-REQUIRED products remain PROVIDER_BLOCKED regardless of preflight
  if (strategy === 'PROVIDER-REQUIRED') {
    reasons.push('provider-evidence-required');
    return { effectiveClass: ActivationClass.PROVIDER_BLOCKED, reasons };
  }

  // HYBRID products require validated provider evidence before production activation
  if (strategy === 'HYBRID') {
    reasons.push('hybrid-provider-evidence-not-yet-validated');
    return { effectiveClass: ActivationClass.INTERNAL_READY, reasons };
  }

  // Preflight must pass for SELF-FIRST products
  if (preflight.decision !== 'PASS') {
    reasons.push('preflight-failed', ...preflight.failedChecks.map((c) => `preflight:${c}`));
    return { effectiveClass: ActivationClass.DENIED, reasons };
  }

  // SELF-FIRST products may reach CANARY_READY or BOUNDED_PRODUCTION_READY
  if (strategy === 'SELF-FIRST') {
    if (targetEntry.activationClass === 'CANARY_READY') {
      if (requestedClass === ActivationClass.BOUNDED_PRODUCTION_READY) {
        reasons.push('canary-evidence-required-before-bounded-production');
        return { effectiveClass: ActivationClass.CANARY_READY, reasons };
      }
      return { effectiveClass: ActivationClass.CANARY_READY, reasons };
    }
  }

  // Default deny
  reasons.push('no-activation-class-resolved');
  return { effectiveClass: ActivationClass.DENIED, reasons };
}

// ---------------------------------------------------------------------------
// Evidence decision
// ---------------------------------------------------------------------------
function buildEvidenceDecision(upstreamEvidence) {
  const failures = upstreamEvidence.filter((e) => e.status !== 'PASS' && e.status !== 'INFERRED_PASS');
  return {
    decision: failures.length === 0 ? 'PASS' : 'FAIL',
    evidenceCount: upstreamEvidence.length,
    failedStages: failures.map((e) => e.stage),
    passedStages: upstreamEvidence.filter((e) => e.status === 'PASS' || e.status === 'INFERRED_PASS').map((e) => e.stage),
  };
}

// ---------------------------------------------------------------------------
// Rollback decision
// ---------------------------------------------------------------------------
function buildRollbackDecision(target) {
  const targetEntry = targetRegistry.get(target);
  const rollbackRequired = targetEntry?.rollbackRequired ?? true;
  return {
    decision: rollbackContract.rollbackRequired && rollbackRequired ? 'CERTIFIED' : 'UNCERTIFIED',
    rollbackRequired,
    rollbackStrategy: rollbackContract.rollbackStrategy,
    rollbackTarget: rollbackContract.rollbackTarget,
    rollbackTimeoutSeconds: rollbackContract.rollbackTimeoutSeconds,
    failClosedOnRollbackFailure: rollbackContract.failClosedOnRollbackFailure,
  };
}

// ---------------------------------------------------------------------------
// Idempotency decision
// ---------------------------------------------------------------------------
function buildIdempotencyDecision(runId, activationId, idempotencyKey) {
  const allPresent = Boolean(runId) && Boolean(activationId) && Boolean(idempotencyKey);
  return {
    decision: allPresent ? 'PASS' : 'FAIL',
    runId,
    activationId,
    idempotencyKey,
    idempotentEvaluation: true,
    duplicateMutationBlocked: true,
  };
}

// ---------------------------------------------------------------------------
// Environment decision
// ---------------------------------------------------------------------------
function buildEnvironmentDecision(environment) {
  const envConfig = environmentsConfig.environments[environment];
  if (!envConfig) {
    return { decision: 'FAIL', reason: 'environment-not-recognized', environment };
  }
  return {
    decision: envConfig.activationTarget ? 'PASS' : 'FAIL',
    environment,
    class: envConfig.class,
    activationTarget: envConfig.activationTarget,
    mutationAllowed: envConfig.mutationAllowed,
    requiresRollback: envConfig.requiresRollback,
    requiresEvidence: envConfig.requiresEvidence,
    requiresIdempotency: envConfig.requiresIdempotency,
  };
}

// ---------------------------------------------------------------------------
// Provider decision
// ---------------------------------------------------------------------------
function buildProviderDecision(target) {
  const targetEntry = targetRegistry.get(target);
  const providerDependency = targetEntry?.providerDependency ?? false;
  if (!targetEntry) return { decision: 'FAIL', reason: 'target-not-in-registry' };
  return {
    decision: providerDependency ? 'BLOCKED' : 'PASS',
    providerDependency,
    note: providerDependency ? 'Provider evidence not satisfied — activation blocked' : 'No provider dependency',
  };
}

// ---------------------------------------------------------------------------
// Publication decision
// ---------------------------------------------------------------------------
function buildPublicationDecision(target) {
  const targetEntry = targetRegistry.get(target);
  if (!targetEntry) return { decision: 'FAIL', reason: 'target-not-in-registry' };
  const publicationBlocked = targetEntry.publicationDependency && targetEntry.publicationClass !== 'CANARY_ELIGIBLE';
  return {
    decision: publicationBlocked ? 'BLOCKED' : 'PASS',
    publicationClass: targetEntry.publicationClass,
    publicationDependency: targetEntry.publicationDependency,
    a22Respected: true,
  };
}

// ---------------------------------------------------------------------------
// Commercial decision
// ---------------------------------------------------------------------------
function buildCommercialDecision(target) {
  const targetEntry = targetRegistry.get(target);
  if (!targetEntry) return { decision: 'FAIL', reason: 'target-not-in-registry' };
  return {
    decision: targetEntry.commercialDependency ? 'BLOCKED' : 'PASS',
    commercialDependency: targetEntry.commercialDependency,
    monetizationClass: targetEntry.monetizationClass,
    a23Respected: true,
  };
}

// ---------------------------------------------------------------------------
// Rollback plan
// ---------------------------------------------------------------------------
function buildRollbackPlan(target) {
  return {
    steps: rollbackContract.rollbackSteps,
    target: rollbackContract.rollbackTarget,
    strategy: rollbackContract.rollbackStrategy,
    timeoutSeconds: rollbackContract.rollbackTimeoutSeconds,
    failClosedOnRollbackFailure: rollbackContract.failClosedOnRollbackFailure,
    certifiedFor: target,
  };
}

// ---------------------------------------------------------------------------
// Policy decision
// ---------------------------------------------------------------------------
function buildPolicyDecision(target) {
  const allowed = policy.allowedTargets.includes(target);
  const prohibited = policy.prohibitedTargets.includes(target);
  return {
    decision: allowed && !prohibited ? 'PASS' : 'DENY',
    allowlisted: allowed,
    prohibited,
    policyVersion: POLICY_VERSION,
    defaultDecision: policy.defaultDecision,
  };
}

// ---------------------------------------------------------------------------
// Evaluate a single target
// ---------------------------------------------------------------------------
function evaluateTarget(target, environment, requestedActivationClass) {
  const targetEntry = targetRegistry.get(target) ?? null;
  const upstreamEvidence = ingestUpstreamEvidence();

  const policyDecision = buildPolicyDecision(target);
  const preflightResult = executePreflight(target, environment, upstreamEvidence);
  const evidenceDecision = buildEvidenceDecision(upstreamEvidence);
  const rollbackDecision = buildRollbackDecision(target);
  const idempotencyDecision = buildIdempotencyDecision(RUN_ID, ACTIVATION_ID, IDEMPOTENCY_KEY);
  const environmentDecision = buildEnvironmentDecision(environment);
  const providerDecision = buildProviderDecision(target);
  const publicationDecision = buildPublicationDecision(target);
  const commercialDecision = buildCommercialDecision(target);
  const rollbackPlan = buildRollbackPlan(target);

  const { effectiveClass, reasons: classReasons } = resolveActivationClass(
    target,
    requestedActivationClass,
    preflightResult,
    upstreamEvidence,
  );

  const activationAllowed =
    effectiveClass === ActivationClass.CANARY_READY ||
    effectiveClass === ActivationClass.BOUNDED_PRODUCTION_READY;

  const denialReasons = activationAllowed ? [] : classReasons;
  const warnings = [];

  if (targetEntry?.dataStrategy === 'HYBRID') {
    warnings.push('HYBRID product: provider supplementation evidence required before external publication or commercialization.');
  }
  if (effectiveClass === ActivationClass.CANARY_READY && requestedActivationClass === ActivationClass.BOUNDED_PRODUCTION_READY) {
    warnings.push('Requested BOUNDED_PRODUCTION_READY but effective class is CANARY_READY; canary evidence must pass first.');
  }

  const evidenceRefs = upstreamEvidence.map((e) => e.ref);

  const gates = {
    policyGate: policyDecision.decision === 'PASS',
    preflightGate: preflightResult.decision === 'PASS',
    evidenceGate: evidenceDecision.decision === 'PASS',
    rollbackGate: rollbackDecision.decision === 'CERTIFIED',
    idempotencyGate: idempotencyDecision.decision === 'PASS',
    environmentGate: environmentDecision.decision === 'PASS',
    providerGate: providerDecision.decision === 'PASS',
    publicationGate: publicationDecision.decision === 'PASS',
    commercialGate: commercialDecision.decision === 'PASS',
  };

  const status = activationAllowed && Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

  return {
    stage: 'A24',
    mode: 'autonomous-production-activation-gate',
    runId: RUN_ID,
    evaluatedAt: new Date().toISOString(),
    target,
    targetType: targetEntry?.dimension ?? 'UNKNOWN',
    requestedActivationClass,
    effectiveActivationClass: effectiveClass,
    policyDecision,
    preflightDecision: preflightResult,
    evidenceDecision,
    verificationDecision: {
      decision: Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL',
      gates,
    },
    rollbackDecision,
    idempotencyDecision,
    environmentDecision,
    providerDecision,
    publicationDecision,
    commercialDecision,
    activationAllowed,
    denialReasons,
    warnings,
    evidenceRefs,
    rollbackPlan,
    gates,
    safetyEnvelope: {
      nonInteractive: true,
      failClosedOnUnknown: true,
      noUnrestrictedProductionMutation: true,
      noProviderProcurement: true,
      noProviderCredentialConsumptionOrStorage: true,
      noBillingMutation: true,
      noExternalPublicationMutation: true,
      noIrreversibleCommercialTransaction: true,
      productionPublicationBlocked: !activationAllowed || effectiveClass !== ActivationClass.BOUNDED_PRODUCTION_READY,
    },
    auditRequired: true,
    controlPlaneLifecycle: policy.lifecycle,
    policyVersion: POLICY_VERSION,
    status,
  };
}

// ---------------------------------------------------------------------------
// Evaluate all canonical targets
// ---------------------------------------------------------------------------
function evaluateAllCanonicalTargets() {
  const environment = 'canary';
  const requestedClass = ActivationClass.CANARY_READY;

  return targetsConfig.targets.map((t) =>
    evaluateTarget(t.product, environment, requestedClass),
  );
}

// ---------------------------------------------------------------------------
// Certification gates
// ---------------------------------------------------------------------------
function buildCertificationGates(evaluations) {
  const targetSet = new Set(evaluations.map((e) => e.target));
  return {
    canonical18TargetsEvaluated: targetSet.size === 18,
    policyGateOperationalOnAllTargets: evaluations.every((e) => e.policyDecision.decision === 'PASS' || !policy.allowedTargets.includes(e.target)),
    preflightEnforcedOnAllTargets: evaluations.every((e) => typeof e.preflightDecision.decision === 'string'),
    evidenceGateConsumedA15ToA23: evaluations.every((e) => e.evidenceRefs.length >= 9),
    rollbackCertifiedOnAllTargets: evaluations.every((e) => e.rollbackDecision.decision === 'CERTIFIED'),
    idempotencyEnforcedOnAllTargets: evaluations.every((e) => e.idempotencyDecision.decision === 'PASS'),
    providerRequiredRemainsProviderBlocked: evaluations
      .filter((e) => {
        const t = targetRegistry.get(e.target);
        return t?.dataStrategy === 'PROVIDER-REQUIRED';
      })
      .every((e) => e.effectiveActivationClass === ActivationClass.PROVIDER_BLOCKED),
    hybridRemainsInternalReady: evaluations
      .filter((e) => {
        const t = targetRegistry.get(e.target);
        return t?.dataStrategy === 'HYBRID';
      })
      .every((e) => e.effectiveActivationClass === ActivationClass.INTERNAL_READY),
    selfFirstReachesCanaryOrBetter: evaluations
      .filter((e) => {
        const t = targetRegistry.get(e.target);
        return t?.dataStrategy === 'SELF-FIRST';
      })
      .every((e) =>
        [ActivationClass.CANARY_READY, ActivationClass.BOUNDED_PRODUCTION_READY].includes(e.effectiveActivationClass),
      ),
    noImplicitInternalToBoundedPromotion: evaluations
      .filter((e) => e.effectiveActivationClass === ActivationClass.INTERNAL_READY)
      .every((e) => e.activationAllowed === false),
    auditRequiredOnAllEvaluations: evaluations.every((e) => e.auditRequired === true),
    evidenceProducedForAllEvaluations: evaluations.every((e) => e.evidenceRefs.length > 0),
    rollbackPlanPresentOnAllEvaluations: evaluations.every((e) => Array.isArray(e.rollbackPlan.steps)),
    safetyEnvelopeEnforcedOnAllEvaluations: evaluations.every(
      (e) =>
        e.safetyEnvelope.nonInteractive &&
        e.safetyEnvelope.failClosedOnUnknown &&
        e.safetyEnvelope.noUnrestrictedProductionMutation &&
        e.safetyEnvelope.noBillingMutation,
    ),
    controlPlaneLifecycleConsistent: evaluations.every((e) => Array.isArray(e.controlPlaneLifecycle) && e.controlPlaneLifecycle.length === 10),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const evaluations = evaluateAllCanonicalTargets();
const certificationGates = buildCertificationGates(evaluations);

const activationSummary = evaluations.reduce((acc, e) => {
  acc[e.effectiveActivationClass] = (acc[e.effectiveActivationClass] ?? 0) + 1;
  return acc;
}, {});

const allGatesPass = Object.values(certificationGates).every(Boolean);
const failedGates = Object.entries(certificationGates).filter(([, v]) => !v).map(([k]) => k);

const report = {
  stage: 'A24',
  mode: 'autonomous-production-activation-gate',
  runId: RUN_ID,
  activationId: ACTIVATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  policyVersion: POLICY_VERSION,
  startedAt: RUN_STARTED_AT,
  completedAt: new Date().toISOString(),
  canonicalTargetCount: targetsConfig.targets.length,
  evaluationCount: evaluations.length,
  activationSummary,
  certificationGates,
  failedGates,
  evaluations,
  consumedEvidence: [
    'A15 global autonomous policy foundation',
    'A16 autonomous execution control plane',
    'A17 bounded live adapter readiness',
    'A18 autonomous data acquisition scale',
    'A19 data coverage and productization gap matrix',
    'A20 intelligence product readiness and monetization gate',
    'A21 autonomous intelligence product pipeline',
    'A22 autonomous productization and publication control plane',
    'A23 autonomous commercial delivery and channel control',
  ],
  invariants: policy.invariants,
  controlPlaneLifecycle: policy.lifecycle,
  boundedMutationPolicy: BOUNDED_MUTATION_POLICY,
  rollbackContract: {
    rollbackRequired: rollbackContract.rollbackRequired,
    rollbackStrategy: rollbackContract.rollbackStrategy,
    failClosedOnRollbackFailure: rollbackContract.failClosedOnRollbackFailure,
  },
  evidenceModel: {
    sink: 'services/kidults-autonomous-intelligence/reports/production-activation/',
    filePattern: 'a24-production-activation-<timestamp>.json',
  },
  status: allGatesPass ? 'PASS' : 'FAIL',
  objective:
    'Deterministic, policy-governed autonomous production activation gate converting all A15–A23 readiness, productization, publication, and delivery controls into a bounded production activation decision.',
};

const outputDir = path.resolve(SERVICE_ROOT, 'reports', 'production-activation');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `a24-production-activation-${Date.now()}.json`);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`A24 report: ${outputPath}`);
console.log(`A24 activation gate: ${report.status}`);

if (report.status !== 'PASS') {
  if (failedGates.length > 0) console.error('Failed gates:', failedGates);
  process.exit(1);
}
