/**
 * A24 — fail-closed Production readiness evaluator.
 *
 * This evaluator never performs a Production, Public, provider, credential,
 * spend, or external mutation. It emits technical diagnostics only. Until a
 * signed, archive-verified Production authority consumer exists, no evidence
 * bundle can emit PRODUCTION_READY or grant execution authority.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SERVICE_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const ROOT = path.resolve(SERVICE_ROOT, '..', '..');

const POLICY_PATH = path.join(SERVICE_ROOT, 'contracts', 'a24-production-activation-policy.json');
const ROLLBACK_CONTRACT_PATH = path.join(SERVICE_ROOT, 'contracts', 'a24-rollback-contract.json');
const ENVIRONMENTS_PATH = path.join(SERVICE_ROOT, 'config', 'a24-production-environments.json');
const TARGETS_PATH = path.join(SERVICE_ROOT, 'config', 'a24-production-targets.json');
const SAMPLE_POLICY_PATH = path.join(ROOT, 'coordination', 'kidults', 'source-intelligence', 'current-sold-sample-governance-v1.json');
const SAMPLE_ALIGNMENT_PATH = path.join(ROOT, 'coordination', 'kidults', 'governance', 'current-sold-sample-governance-alignment-v1.json');
const RIGHTS_MANIFEST_PATH = path.join(ROOT, 'coordination', 'kidults', 'governance', 'field-level-rights-release-manifest-v1.json');
const PROVIDER_REGISTRY_PATH = path.join(ROOT, 'coordination', 'kidults', 'registry', 'provider', 'records', 'provider-operating-state-v1.json');
const PRODUCTION_AUTHORITY_BLOCKER = 'productionAuthorityHardDisabledPendingSignedArchiveConsumer';

const STAGE_EVIDENCE = [
  { stage: 'A15', subdirectory: 'policy', prefix: 'a15-policy-' },
  { stage: 'A16', subdirectory: 'execution-control', prefix: 'a16-execution-control-' },
  { stage: 'A17', subdirectory: 'execution-control', prefix: 'a17-bounded-live-' },
  { stage: 'A18', subdirectory: 'data-acquisition', prefix: 'a18-' },
  { stage: 'A19', subdirectory: 'productization', prefix: 'a19-gap-' },
  { stage: 'A20', subdirectory: 'product-readiness', prefix: 'a20-product-readiness-' },
  { stage: 'A21', subdirectory: 'product-pipeline', prefix: 'a21-pipeline-' },
  { stage: 'A22', subdirectory: 'publication-control', prefix: 'a22-publication-control-' },
  { stage: 'A23', subdirectory: 'commercial-delivery', prefix: 'a23-commercial-delivery-' },
];

export const ActivationClass = Object.freeze({
  DENIED: 'DENIED',
  PROVIDER_BLOCKED: 'PROVIDER_BLOCKED',
  PRODUCTION_READY: 'PRODUCTION_READY',
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function digestJson(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function integer(value) {
  return Number.isInteger(value);
}

function timestamp(value) {
  if (!nonempty(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function binding(filePath) {
  const value = readJson(filePath);
  return {
    path: path.relative(ROOT, filePath).split(path.sep).join('/'),
    id: value.id ?? value.contract_id ?? null,
    version: value.version ?? value.policyVersion ?? null,
    digest: digestJson(value),
    value,
  };
}

export function loadGovernanceBindings() {
  return {
    samplePolicy: binding(SAMPLE_POLICY_PATH),
    sampleAlignment: binding(SAMPLE_ALIGNMENT_PATH),
    rightsManifest: binding(RIGHTS_MANIFEST_PATH),
    providerRegistry: binding(PROVIDER_REGISTRY_PATH),
  };
}

function logGamma(value) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const adjusted = value - 1;
  let sum = 0.99999999999980993;
  for (let index = 0; index < coefficients.length; index += 1) {
    sum += coefficients[index] / (adjusted + index + 1);
  }
  const offset = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(offset) - offset + Math.log(sum);
}

function binomialCdf(defects, effectiveN, probability) {
  if (probability <= 0) return 1;
  if (probability >= 1) return defects >= effectiveN ? 1 : 0;
  const terms = [];
  for (let index = 0; index <= defects; index += 1) {
    terms.push(
      logGamma(effectiveN + 1) - logGamma(index + 1) - logGamma(effectiveN - index + 1)
      + index * Math.log(probability) + (effectiveN - index) * Math.log1p(-probability),
    );
  }
  const maximum = Math.max(...terms);
  return Math.exp(maximum) * terms.reduce((total, term) => total + Math.exp(term - maximum), 0);
}

export function exactOneSidedCpUpper(defects, effectiveN, confidence) {
  if (!integer(defects) || !integer(effectiveN) || effectiveN <= 0 || defects < 0 || defects > effectiveN) return null;
  if (!(Number.isFinite(confidence) && confidence > 0 && confidence < 1)) return null;
  if (defects === effectiveN) return 1;
  const alpha = 1 - confidence;
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (binomialCdf(defects, effectiveN, midpoint) > alpha) lower = midpoint;
    else upper = midpoint;
  }
  return upper;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

export function resolveRepositoryState(expectedBranch = 'main') {
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const githubContextBound = process.env.GITHUB_EVENT_NAME === 'push'
    && process.env.GITHUB_REF === `refs/heads/${expectedBranch}`
    && process.env.GITHUB_SHA === head.stdout
    && process.env.GITHUB_REPOSITORY === 'johnkim9524-collab/kaios_enterprise_repo';
  return {
    sourceSha: head.ok && /^[a-f0-9]{40}$/.test(head.stdout) ? head.stdout : null,
    synchronizedRepositoryState: head.ok && status.ok && status.stdout === '',
    expectedBranchState: (branch.ok && branch.stdout === expectedBranch) || githubContextBound,
    actualBranch: branch.ok ? branch.stdout : null,
    branchEvidence: branch.ok && branch.stdout === expectedBranch ? 'LOCAL_BRANCH' : githubContextBound ? 'GITHUB_CONTEXT_BOUND' : 'UNVERIFIED',
    expectedBranch,
    dirtyPaths: status.ok && status.stdout ? status.stdout.split('\n') : [],
    errors: [head, status, branch].filter((item) => !item.ok).map((item) => item.stderr || `git-status-${item.status}`),
  };
}

function resolveLatestEvidence(subdirectory, prefix, sourceSha) {
  const directory = path.join(SERVICE_ROOT, 'reports', subdirectory);
  const unresolved = `reports/${subdirectory}/${prefix}*.json`;
  if (!fs.existsSync(directory)) return { found: false, valid: false, ref: `${unresolved} [NOT FOUND]`, status: 'NOT_FOUND' };
  const files = fs.readdirSync(directory).filter((file) => file.startsWith(prefix) && file.endsWith('.json')).sort().reverse();
  if (files.length === 0) return { found: false, valid: false, ref: `${unresolved} [NO FILES]`, status: 'NOT_FOUND' };
  const filePath = path.join(directory, files[0]);
  try {
    const data = readJson(filePath);
    const evidenceSha = data.source_sha ?? data.sourceSha ?? data.git_sha ?? null;
    return {
      found: true,
      valid: data.status === 'PASS' && evidenceSha === sourceSha,
      ref: path.relative(SERVICE_ROOT, filePath).split(path.sep).join('/'),
      status: data.status ?? 'UNKNOWN',
      sourceSha: evidenceSha,
      data,
    };
  } catch (error) {
    return { found: true, valid: false, ref: path.relative(SERVICE_ROOT, filePath), status: 'INVALID_JSON', error: String(error) };
  }
}

function ingestStageEvidence(sourceSha) {
  return STAGE_EVIDENCE.map((entry) => ({
    stage: entry.stage,
    ...resolveLatestEvidence(entry.subdirectory, entry.prefix, sourceSha),
  }));
}

function loadLatestReadinessEvidence() {
  const exactPath = process.env.KIDULTS_A24_READINESS_EVIDENCE;
  if (exactPath) {
    const resolved = path.resolve(exactPath);
    try {
      return { found: true, ref: resolved, data: readJson(resolved) };
    } catch (error) {
      return { found: true, ref: resolved, data: null, error: String(error) };
    }
  }
  const directory = path.join(SERVICE_ROOT, 'reports', 'production-readiness');
  if (!fs.existsSync(directory)) return { found: false, ref: 'reports/production-readiness/a24-production-readiness-*.json', data: null };
  const files = fs.readdirSync(directory).filter((file) => file.startsWith('a24-production-readiness-') && file.endsWith('.json')).sort().reverse();
  if (files.length === 0) return { found: false, ref: 'reports/production-readiness/a24-production-readiness-*.json', data: null };
  const filePath = path.join(directory, files[0]);
  try {
    return { found: true, ref: path.relative(SERVICE_ROOT, filePath).split(path.sep).join('/'), data: readJson(filePath) };
  } catch (error) {
    return { found: true, ref: path.relative(SERVICE_ROOT, filePath), data: null, error: String(error) };
  }
}

function activeProviderIds(providerRegistry) {
  return new Set((providerRegistry.providers ?? [])
    .filter((provider) => provider.adapter_state === 'ACTIVE'
      && provider.production === 'AUTHORIZED'
      && provider.rights_state === 'RIGHTS_CLEAR')
    .map((provider) => provider.provider_id));
}

export function validateProductionReadinessEvidence(evidence, context) {
  const { bindings, sourceSha, repositoryState, stageEvidence, policy, rollbackContract } = context;
  const samplePolicy = bindings.samplePolicy.value;
  const betaTier = samplePolicy.tiers.find((tier) => tier.id === 'BETA_RELIABILITY');
  const productionRule = samplePolicy.promotion_matrix?.PRODUCTION_READINESS ?? {};
  const checks = {};

  checks.evidencePresent = Boolean(evidence && typeof evidence === 'object');
  const value = checks.evidencePresent ? evidence : {};
  checks.evidenceIdentity = value.id === 'KIDULTS_A24_PRODUCTION_READINESS_EVIDENCE_V1' && value.version === '1.0.0';
  checks.sourceShaBinding = value.source_sha === sourceSha && /^[a-f0-9]{40}$/.test(sourceSha ?? '');
  checks.requestedClaimProduction = value.requested_claim === 'PRODUCTION';
  checks.repositoryClean = repositoryState.synchronizedRepositoryState === true;
  checks.protectedMainBranch = repositoryState.expectedBranchState === true;
  checks.stageEvidenceExactHead = stageEvidence.length === 9 && stageEvidence.every((entry) => entry.valid === true);

  const sample = value.sample_decision ?? {};
  const defectCounts = sample.defect_counts ?? {};
  const cpUpperBound = exactOneSidedCpUpper(defectCounts.MAJOR_A, sample.effective_n, samplePolicy.statistical_method.confidence);
  checks.samplePolicyBinding = sample.policy_id === samplePolicy.id
    && sample.policy_version === samplePolicy.version
    && sample.policy_digest === bindings.samplePolicy.digest
    && sample.alignment_digest === bindings.sampleAlignment.digest;
  checks.betaTier = sample.tier === productionRule.required_tier && sample.tier === betaTier?.id;
  checks.effectiveN = integer(sample.effective_n) && sample.effective_n >= betaTier?.min_n && sample.effective_n <= betaTier?.max_n;
  checks.criticalDefectsZero = defectCounts.CRITICAL === 0;
  checks.exactCpUpperBound = cpUpperBound !== null && cpUpperBound <= betaTier?.defect_tolerance + 1e-15;
  checks.coverageAndConcentration = sample.coverage_gate === 'PASS' && sample.concentration_gate === 'PASS';
  checks.trackBDecisionBound = nonempty(sample.track_b_decision_receipt_id) && sha256(sample.track_b_assessment_digest);

  const rights = value.rights_decision ?? {};
  const canonicalRights = bindings.rightsManifest.value;
  checks.rightsManifestBinding = rights.manifest_digest === bindings.rightsManifest.digest;
  checks.rightsCanonicalAuthority = canonicalRights.production === 'AUTHORIZED'
    && Array.isArray(canonicalRights.live_authorized_fields)
    && canonicalRights.live_authorized_fields.length > 0;
  checks.rightsCensus = rights.census === 'PASS'
    && rights.every_event_admitted === true
    && integer(rights.admitted_event_count)
    && rights.admitted_event_count >= sample.effective_n;

  const providers = value.provider_decision ?? {};
  const providerIds = Array.isArray(providers.provider_ids) ? providers.provider_ids : [];
  const canonicalActive = activeProviderIds(bindings.providerRegistry.value);
  checks.providerRegistryBinding = providers.registry_digest === bindings.providerRegistry.digest;
  checks.providerAuthenticationReadiness = providers.authentication_state === 'PASS'
    && integer(providers.active_adapter_count)
    && providers.active_adapter_count === providerIds.length
    && providers.active_adapter_count > 0;
  checks.providerPermissionReadiness = providers.permission_state === 'PASS'
    && providerIds.length === new Set(providerIds).size
    && providerIds.every((providerId) => canonicalActive.has(providerId));

  const natural = value.natural_runs ?? {};
  const runs = Array.isArray(natural.runs) ? natural.runs : [];
  const runIds = runs.map((run) => run.run_id);
  const starts = runs.map((run) => timestamp(run.started_at));
  const completions = runs.map((run) => timestamp(run.completed_at));
  const runShapeValid = runs.every((run, index) => nonempty(run.run_id)
    && starts[index] !== null && completions[index] !== null && starts[index] <= completions[index]
    && run.source_sha === sourceSha
    && run.policy_digest === bindings.samplePolicy.digest
    && run.rights_digest === bindings.rightsManifest.digest
    && sha256(run.schema_digest)
    && sha256(run.cohort_digest)
    && nonempty(run.pitr_receipt_id)
    && nonempty(run.rollback_receipt_id)
    && run.slo_state === 'PASS'
    && run.error_budget_state === 'WITHIN_BUDGET');
  const observedWindowDays = runs.length > 0 && starts.every((item) => item !== null) && completions.every((item) => item !== null)
    ? (Math.max(...completions) - Math.min(...starts)) / 86_400_000
    : 0;
  checks.naturalRunCount = natural.count === runs.length
    && runs.length >= productionRule.required_natural_runs
    && new Set(runIds).size === runIds.length;
  checks.naturalRunWindow = observedWindowDays >= productionRule.required_window_days;
  checks.naturalRunReceipts = runShapeValid;

  const recovery = value.recovery_decision ?? {};
  checks.sloAndErrorBudget = value.slo_error_budget?.slo_state === 'PASS'
    && value.slo_error_budget?.error_budget_state === 'WITHIN_BUDGET'
    && nonempty(value.slo_error_budget?.receipt_id);
  checks.pitrAndRollback = recovery.pitr_state === 'PASS'
    && recovery.rollback_state === 'PASS'
    && nonempty(recovery.pitr_receipt_id)
    && nonempty(recovery.rollback_receipt_id)
    && rollbackContract.rollbackRequired === true;

  const bounds = value.bounded_mutation ?? {};
  const limit = policy.boundedMutationPolicy;
  checks.boundedMutation = integer(bounds.max_rows_affected) && bounds.max_rows_affected >= 0 && bounds.max_rows_affected <= limit.maxRowsAffected
    && integer(bounds.max_objects_affected) && bounds.max_objects_affected >= 0 && bounds.max_objects_affected <= limit.maxObjectsAffected
    && integer(bounds.max_provider_calls) && bounds.max_provider_calls >= 0 && bounds.max_provider_calls <= limit.maxProviderCalls
    && bounds.max_external_publications === 0 && bounds.max_commercial_deliveries === 0;

  const approval = value.program_owner_approval ?? {};
  const approvalTime = timestamp(approval.approved_at);
  const lastCompletion = completions.length > 0 && completions.every((item) => item !== null) ? Math.max(...completions) : null;
  checks.programOwnerApproval = approval.state === 'APPROVED'
    && nonempty(approval.program_owner_id)
    && nonempty(approval.receipt_id)
    && approval.source_sha === sourceSha
    && approvalTime !== null
    && lastCompletion !== null
    && approvalTime >= lastCompletion;

  const approvedTargets = Array.isArray(value.approved_targets) ? value.approved_targets : [];
  checks.approvedTargets = approvedTargets.length > 0 && approvedTargets.length === new Set(approvedTargets).size;
  checks.evidenceFingerprint = value.evidence_fingerprint === digestJson(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'evidence_fingerprint')),
  );
  checks.productionAuthorityContractHardDisable = policy.production_authority_hard_disabled_pending_signed_archive_consumer === true
    && policy.technical_readiness_is_not_production_authority === true
    && policy.invariants?.productionAuthorityHardDisabledPendingSignedArchiveConsumer === true
    && policy.invariants?.technicalReadinessNeverGrantsProductionAuthority === true;

  const failedChecks = Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name);
  return {
    decision: 'HOLD',
    technicalDecision: failedChecks.length === 0 ? 'PASS' : 'HOLD',
    authorityDecision: 'HOLD',
    authorityBlockers: [PRODUCTION_AUTHORITY_BLOCKER],
    checks,
    failedChecks,
    derived: {
      exactCpUpperBound: cpUpperBound,
      tierTolerance: betaTier?.defect_tolerance ?? null,
      effectiveN: sample.effective_n ?? null,
      observedNaturalRunCount: runs.length,
      observedWindowDays,
      activeCanonicalProviderIds: [...canonicalActive].sort(),
      approvedTargets,
    },
  };
}

function evidenceSinkAvailable(directory) {
  try {
    return fs.statSync(directory).isDirectory() && (fs.accessSync(directory, fs.constants.W_OK), true);
  } catch {
    return false;
  }
}

export function evaluateTarget(target, readiness, policy) {
  const approved = readiness.derived.approvedTargets.includes(target.product);
  const technicalReadinessPassed = readiness.technicalDecision === 'PASS' && approved && target.productionEligible === true;
  const authorityHardDisabled = true;
  const authorityContractBound = policy.production_authority_hard_disabled_pending_signed_archive_consumer === true;
  const activationAllowed = false;
  const providerBlocked = target.providerDependency === true
    && (readiness.checks.providerAuthenticationReadiness !== true || readiness.checks.providerPermissionReadiness !== true);
  const effectiveClass = providerBlocked ? ActivationClass.PROVIDER_BLOCKED : ActivationClass.DENIED;
  const reasons = [
    ...readiness.failedChecks,
    ...(approved ? [] : ['targetNotInApprovedProductionReceipt']),
    ...(target.productionEligible === true ? [] : ['targetConfigProductionIneligible']),
    PRODUCTION_AUTHORITY_BLOCKER,
  ];
  return {
    stage: 'A24',
    target: target.product,
    targetType: target.dimension,
    requestedActivationClass: ActivationClass.PRODUCTION_READY,
    effectiveActivationClass: effectiveClass,
    activationAllowed,
    productionEligible: false,
    technicalReadinessPassed,
    productionAuthorityHardDisabled: authorityHardDisabled,
    productionAuthorityContractBound: authorityContractBound,
    providerEvidencePresent: readiness.checks.providerPermissionReadiness === true,
    policyExplicitlyPermits: false,
    denialReasons: [...new Set(reasons)],
    gates: readiness.checks,
    status: activationAllowed ? 'PASS' : 'HOLD',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
}

export function runGate({
  repositoryState = resolveRepositoryState(process.env.KIDULTS_A24_EXPECTED_BRANCH ?? 'main'),
  bindings = loadGovernanceBindings(),
  readinessEvidence = loadLatestReadinessEvidence(),
  outputDirectory = process.env.KIDULTS_A24_OUTPUT_DIR
    ? path.resolve(process.env.KIDULTS_A24_OUTPUT_DIR)
    : path.join(SERVICE_ROOT, 'reports', 'production-activation'),
} = {}) {
  const policy = readJson(POLICY_PATH);
  const rollbackContract = readJson(ROLLBACK_CONTRACT_PATH);
  const environments = readJson(ENVIRONMENTS_PATH);
  const targets = readJson(TARGETS_PATH);
  const sourceSha = repositoryState.sourceSha;
  const stageEvidence = ingestStageEvidence(sourceSha);
  const readiness = validateProductionReadinessEvidence(readinessEvidence.data, {
    bindings,
    sourceSha,
    repositoryState,
    stageEvidence,
    policy,
    rollbackContract,
  });
  readiness.checks.productionEnvironmentIdentification = environments.environments?.production?.class === 'PRODUCTION'
    && environments.environments.production.activationTarget === true;
  readiness.checks.evidenceSinkAvailability = evidenceSinkAvailable(outputDirectory);
  readiness.failedChecks = Object.entries(readiness.checks).filter(([, passed]) => passed !== true).map(([name]) => name);
  readiness.technicalDecision = readiness.failedChecks.length === 0 ? 'PASS' : 'HOLD';
  readiness.decision = 'HOLD';
  readiness.authorityDecision = 'HOLD';
  readiness.authorityBlockers = [PRODUCTION_AUTHORITY_BLOCKER];

  const evaluations = targets.targets.map((target) => evaluateTarget(target, readiness, policy));
  const activationAllowedCount = evaluations.filter((entry) => entry.activationAllowed).length;
  const certificationGates = {
    canonicalTargetsEvaluated: evaluations.length === targets.targets.length && new Set(evaluations.map((entry) => entry.target)).size === targets.targets.length,
    noInferredEvidenceAccepted: stageEvidence.every((entry) => entry.status !== 'INFERRED_PASS'),
    missingEvidenceFailsClosed: readiness.decision === 'PASS' || evaluations.every((entry) => entry.activationAllowed === false),
    exactPolicyBindingsLoaded: Object.values(bindings).every((entry) => sha256(entry.digest)),
    noCanaryOrControlPromotion: evaluations.every((entry) => !['CANARY_READY', 'BOUNDED_PRODUCTION_READY'].includes(entry.effectiveActivationClass)),
    noPublicOrG5Preauthorization: evaluations.every((entry) => entry.public === 'HOLD' && entry.g5 === 'HOLD'),
    productionAuthorityHardDisableSealed: policy.production_authority_hard_disabled_pending_signed_archive_consumer === true
      && evaluations.every((entry) => entry.activationAllowed === false
        && entry.productionEligible === false
        && entry.policyExplicitlyPermits === false
        && entry.production === 'HOLD'),
  };
  const failedCertificationGates = Object.entries(certificationGates).filter(([, passed]) => !passed).map(([name]) => name);
  const status = activationAllowedCount > 0 ? 'PASS' : 'HOLD';
  const runStartedAt = new Date().toISOString();
  const runId = `a24-production-activation-${runStartedAt.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`;
  return {
    report: {
      stage: 'A24',
      mode: 'fail-closed-production-readiness-evaluator',
      runId,
      policyVersion: policy.policyVersion,
      startedAt: runStartedAt,
      completedAt: new Date().toISOString(),
      sourceSha,
      sourceScope: 'LOCAL_EXACT_HEAD_ONLY',
      repositoryState,
      governanceBindings: Object.fromEntries(Object.entries(bindings).map(([name, entry]) => [name, {
        path: entry.path, id: entry.id, version: entry.version, digest: entry.digest,
      }])),
      readinessEvidenceRef: readinessEvidence.ref,
      stageEvidence: stageEvidence.map(({ stage, ref, found, valid, status: evidenceStatus, sourceSha: evidenceSha }) => ({
        stage, ref, found, valid, status: evidenceStatus, sourceSha: evidenceSha ?? null,
      })),
      productionReadinessDecision: readiness,
      technicalReadinessStatus: readiness.technicalDecision,
      productionAuthority: {
        decision: 'HOLD',
        blocker: PRODUCTION_AUTHORITY_BLOCKER,
        signedArchiveVerifiedConsumerPresent: false,
      },
      canonicalTargetCount: targets.targets.length,
      evaluationCount: evaluations.length,
      activationAllowedCount,
      activationSummary: evaluations.reduce((summary, entry) => ({
        ...summary,
        [entry.effectiveActivationClass]: (summary[entry.effectiveActivationClass] ?? 0) + 1,
      }), {}),
      certificationGates,
      failedCertificationGates,
      evaluations,
      targets: evaluations.map((entry) => ({
        product: entry.target,
        activationDecision: entry.effectiveActivationClass,
        activationClass: entry.effectiveActivationClass,
        productionEligible: entry.productionEligible,
        providerEvidencePresent: entry.providerEvidencePresent,
        policyExplicitlyPermits: entry.policyExplicitlyPermits,
      })),
      status,
      production: 'HOLD',
      public: 'HOLD',
      g5: 'HOLD',
      authorityBoundary: 'DECISION_RECEIPT_ONLY_NO_PRODUCTION_PUBLIC_PROVIDER_CREDENTIAL_SPEND_OR_EXTERNAL_MUTATION',
      truthBoundary: {
        production_authority_hard_disabled_pending_signed_archive_consumer: true,
        technical_readiness_is_not_production_authority: true,
      },
      objective: 'Diagnose exact-head technical readiness without granting Production authority until a signed archive-verified authority consumer exists.',
    },
    gateIntegrityPassed: failedCertificationGates.length === 0,
    outputDirectory,
  };
}

function main() {
  const result = runGate();
  fs.mkdirSync(result.outputDirectory, { recursive: true });
  const outputPath = path.join(result.outputDirectory, `${result.report.runId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');
  console.log(`A24 report: ${outputPath}`);
  console.log(`A24 production readiness: ${result.report.status}`);
  if (!result.gateIntegrityPassed) {
    console.error('A24 evaluator integrity failed:', result.report.failedCertificationGates);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = main();
}
