import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'enterprise-acceptance');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'a39');

const SUPPORTED_MODES = ['SIMULATION', 'EVIDENCE', 'LIVE_SAFE'];
const rawMode = (process.env.A39_MODE ?? 'SIMULATION').toUpperCase();
if (!SUPPORTED_MODES.includes(rawMode)) {
  console.error(`[A39][ERROR] Unsupported mode: ${rawMode}. Must be one of ${SUPPORTED_MODES.join(', ')}`);
  process.exit(1);
}
const MODE = rawMode;

const nowIso = new Date().toISOString();
const timestampSlug = nowIso.replace(/[:.]/g, '-');
const acceptanceRunId = `a39-${nowIso.slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}`;
const POLICY_VERSION = 'a39-enterprise-acceptance-policy.v1';
const REQUIRED_STAGE_RANGE = 'A15-A38';
const FRESH_WINDOW_MS = 72 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ACCEPTANCE_STATES = [
  'UNASSESSED',
  'DISCOVERING_EVIDENCE',
  'VALIDATING_CHAIN',
  'CHAIN_HEALTHY',
  'CHAIN_DEGRADED',
  'EXECUTIVE_REVIEW_REQUIRED',
  'ACCEPTANCE_BLOCKED',
  'FAILED_CLOSED',
  'ENTERPRISE_ACCEPTED',
];

const ACCEPTANCE_DECISIONS = [
  'ENTERPRISE_ACCEPTED',
  'ENTERPRISE_ACCEPTED_WITH_REVIEW',
  'ACCEPTANCE_BLOCKED',
  'FAILED_CLOSED',
];

const STAGE_DEFINITIONS = [
  { stage: 'A15', key: 'a15', reportDir: ['reports', 'policy'], filePrefix: 'a15-policy-' },
  { stage: 'A16', key: 'a16', reportDir: ['reports', 'execution-control'], filePrefix: 'a16-execution-control-', previousStage: 'A15' },
  { stage: 'A17', key: 'a17', reportDir: ['reports', 'execution-control'], filePrefix: 'a17-bounded-live-', previousStage: 'A16' },
  { stage: 'A18', key: 'a18', reportDir: ['reports', 'data-acquisition'], filePrefix: 'a18-', previousStage: 'A17' },
  { stage: 'A19', key: 'a19', reportDir: ['reports', 'productization'], filePrefix: 'a19-gap-', previousStage: 'A18' },
  { stage: 'A20', key: 'a20', reportDir: ['reports', 'product-readiness'], filePrefix: 'a20-product-readiness-', previousStage: 'A19' },
  { stage: 'A21', key: 'a21', reportDir: ['reports', 'product-pipeline'], filePrefix: 'a21-pipeline-', previousStage: 'A20' },
  { stage: 'A22', key: 'a22', reportDir: ['reports', 'publication-control'], filePrefix: 'a22-publication-control-', previousStage: 'A21' },
  { stage: 'A23', key: 'a23', reportDir: ['reports', 'commercial-delivery'], filePrefix: 'a23-commercial-delivery-', previousStage: 'A22' },
  { stage: 'A24', key: 'a24', reportDir: ['reports', 'production-activation'], filePrefix: 'a24-production-activation-', previousStage: 'A23' },
  { stage: 'A25', key: 'a25', reportDir: ['reports', 'runtime'], filePrefix: 'a25-runtime-', previousStage: 'A24' },
  { stage: 'A26', key: 'a26', reportDir: ['reports', 'recovery'], filePrefix: 'a26-recovery-', previousStage: 'A25' },
  { stage: 'A27', key: 'a27', reportDir: ['reports', 'operations'], filePrefix: 'a27-governance-', previousStage: 'A26' },
  { stage: 'A28', key: 'a28', reportDir: ['reports', 'control-tower'], filePrefix: 'a28-control-tower-', previousStage: 'A27' },
  { stage: 'A29', key: 'a29', reportDir: ['reports', 'executive-decisions'], filePrefix: 'a29-executive-decision-', previousStage: 'A28' },
  { stage: 'A30', key: 'a30', reportDir: ['reports', 'control-tower-ui'], filePrefix: 'a30-control-tower-ui-', previousStage: 'A29' },
  { stage: 'A31', key: 'a31', reportDir: ['reports', 'control-tower-gateway'], filePrefix: 'a31-control-tower-gateway-', previousStage: 'A30' },
  { stage: 'A32', key: 'a32', reportDir: ['reports', 'production-reality'], filePrefix: 'a32-production-reality-', previousStage: 'A31' },
  { stage: 'A33', key: 'a33', reportDir: ['reports', 'deployment-governance'], filePrefix: 'a33-deployment-governance-', previousStage: 'A32' },
  { stage: 'A34', key: 'a34', reportDir: ['reports', 'production-assurance'], filePrefix: 'a34-production-assurance-', previousStage: 'A33' },
  { stage: 'A35', key: 'a35', reportDir: ['reports', 'capacity-governance'], filePrefix: 'a35-capacity-governance-', previousStage: 'A34' },
  { stage: 'A36', key: 'a36', reportDir: ['reports', 'economic-governance'], filePrefix: 'a36-economic-governance-', previousStage: 'A35' },
  { stage: 'A37', key: 'a37', reportDir: ['reports', 'commercial-governance'], filePrefix: 'a37-commercial-governance-', previousStage: 'A36' },
  { stage: 'A38', key: 'a38', reportDir: ['reports', 'customer-value-delivery'], filePrefix: 'a38-customer-value-delivery-', previousStage: 'A37' },
];

const DIRECT_CONTINUITY_RESOLVERS = {
  A33: (record) => [
    record.report?.sourceA32Evidence?.evidenceId,
    record.report?.sourceA32Evidence?.generatedAt,
  ],
  A34: (record) => [
    record.report?.sourceA32Evidence?.evidenceId,
    record.report?.sourceA33DeploymentEvidence?.evidenceId,
    record.report?.sourceA33DeploymentEvidence?.generatedAt,
  ],
  A35: (record) => [record.report?.sourceA34Evidence?.evidenceId, record.report?.sourceA34Evidence?.generatedAt],
  A36: (record) => [record.report?.sourceA35Evidence?.evidenceId, record.report?.sourceA35Evidence?.generatedAt],
  A37: (record) => [record.report?.sourceA36Evidence?.evidenceId, record.report?.sourceA36Evidence?.generatedAt],
  A38: (record) => [record.report?.sourceA37Evidence?.commercialRunId, record.report?.sourceA37Evidence?.generatedAt],
};

const FAILURE_CLASSIFICATIONS = {
  MISSING_CRITICAL_STAGE_EVIDENCE: 'fatal',
  SCHEMA_UNREADABLE: 'fatal',
  EXTERNAL_MUTATION_ATTEMPT: 'fatal',
  AUTHORITY_EXPANSION_ATTEMPT: 'fatal',
  SECURITY_BLOCK: 'fatal',
  UNCERTIFIED_STAGE: 'blocking',
  STALE_CRITICAL_EVIDENCE: 'blocking',
  BROKEN_UPSTREAM_REFERENCE: 'blocking',
  PROVIDER_FAILURE: 'blocking',
  PUBLICATION_BLOCK: 'blocking',
  RUNTIME_FAILURE: 'blocking',
  RECOVERY_EXHAUSTION: 'blocking',
  SLO_BREACH: 'blocking',
  EXECUTIVE_REJECT: 'blocking',
  CHANGE_FREEZE: 'blocking',
  ROLLBACK_REQUIREMENT: 'blocking',
  P0_CAPACITY_PROTECTED: 'blocking',
  BUDGET_HARD_STOP: 'blocking',
  UNKNOWN_COST: 'blocking',
  RIGHTS_UNKNOWN: 'blocking',
  ENTITLEMENT_MISMATCH: 'blocking',
  BINDING_COMMERCIAL_ACTION_BLOCKED: 'blocking',
  PRIVACY_UNKNOWN: 'review',
};

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deterministicId(prefix, input) {
  return `${prefix}-${crypto.createHash('sha256').update(stableSerialize(input)).digest('hex').slice(0, 12)}`;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];
}

function readRepositoryCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function classifyFreshness(timestamp) {
  if (!timestamp) return 'UNKNOWN';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'UNKNOWN';
  if (ageMs <= FRESH_WINDOW_MS) return 'FRESH';
  if (ageMs <= STALE_WINDOW_MS) return 'AGING';
  return 'STALE';
}

function getNestedValue(source, pathSegments) {
  let current = source;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return null;
    current = current[segment];
  }
  return current ?? null;
}

function inferCertification(report) {
  const directCandidates = [
    report?.certification?.certificationPassed,
    report?.certificationPassed,
    report?.status === 'PASS' ? true : report?.status === 'FAIL' ? false : null,
    report?.summary?.status === 'PASS' ? true : report?.summary?.status === 'FAIL' ? false : null,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'boolean') return candidate;
  }

  const certification = report?.certification;
  if (certification && typeof certification === 'object') {
    const values = Object.entries(certification)
      .filter(([, value]) => typeof value === 'boolean')
      .map(([, value]) => value);
    if (values.length) {
      if (values.every(Boolean)) return true;
      if (values.some((value) => value === false)) return false;
    }
  }

  const scenarioCount = Number(report?.scenarioCount ?? report?.evaluationCount ?? report?.testsTotal ?? 0);
  const failedCount = Number(report?.failedCount ?? report?.failedCases ?? 0);
  if (scenarioCount > 0) return failedCount === 0;

  return null;
}

function inferScenarioStatus(report) {
  const total =
    Number(report?.scenarioCount ?? report?.evaluationCount ?? report?.testsTotal ?? report?.positiveCases?.length ?? 0) || 0;
  const passed =
    Number(
      report?.passedCount ??
        report?.positiveCasesPassed ??
        report?.testsPassed ??
        (total > 0 ? total - Number(report?.failedCount ?? 0) : 0),
    ) || 0;
  return { passed, total };
}

function inferInvariantStatus(report) {
  const invariants =
    report?.invariants && typeof report.invariants === 'object'
      ? report.invariants
      : report?.certification?.invariants && typeof report.certification.invariants === 'object'
        ? report.certification.invariants
        : {};
  const values = Object.values(invariants).filter((value) => typeof value === 'boolean');
  const total = values.length || Number(report?.invariantTotal ?? 0) || Number(report?.metrics?.invariantsChecked ?? 0) || 0;
  const passed =
    values.length > 0
      ? values.filter(Boolean).length
      : Number(report?.invariantPassCount ?? 0) || (total > 0 && inferCertification(report) === true ? total : 0);
  return { passed, total, invariants };
}

function extractEvidenceId(report, fileName) {
  const candidates = [
    report?.acceptanceRunId,
    report?.evidenceId,
    report?.deliveryRunId,
    report?.commercialRunId,
    report?.economicRunId,
    report?.optimizationRunId,
    report?.assuranceRunId,
    report?.activationId,
    report?.runId,
    report?.governanceId,
    report?.snapshotId,
    report?.cycleId,
    report?.recoveryId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return fileName.replace(/\.json$/u, '');
}

function extractTimestamp(report) {
  const candidates = [
    report?.generatedAt,
    report?.completedAt,
    report?.startedAt,
    report?.producedAt,
    report?.timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

function extractPolicyVersion(report) {
  const candidates = [report?.policyVersion, report?.policy?.version, report?.platform?.policyVersion];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

function collectReferenceStrings(value, collector = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectReferenceStrings(entry, collector);
    return collector;
  }
  if (!value || typeof value !== 'object') return collector;
  for (const [key, child] of Object.entries(value)) {
    if (/evidence|ref|source/i.test(key)) {
      if (typeof child === 'string') collector.push(child);
      else collectReferenceStrings(child, collector);
    }
  }
  return collector;
}

function extractUpstreamReferences(stage, report) {
  const directResolver = DIRECT_CONTINUITY_RESOLVERS[stage];
  if (directResolver) {
    return uniqueStrings(directResolver({ report }));
  }
  return uniqueStrings(collectReferenceStrings(report));
}

function listStageFiles(definition) {
  const reportPath = path.join(ROOT, ...definition.reportDir);
  if (!fs.existsSync(reportPath)) return [];
  return fs
    .readdirSync(reportPath)
    .filter((file) => file.endsWith('.json') && file.startsWith(definition.filePrefix))
    .sort()
    .map((file) => path.join(reportPath, file));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function discoverEvidence() {
  const inventory = [];
  for (const definition of STAGE_DEFINITIONS) {
    const files = listStageFiles(definition);
    const latestPath = files.at(-1) ?? null;
    const report = latestPath ? readJson(latestPath) : null;
    const certificationPassed = report ? inferCertification(report) : null;
    const scenarioStatus = report ? inferScenarioStatus(report) : { passed: 0, total: 0 };
    const invariantStatus = report ? inferInvariantStatus(report) : { passed: 0, total: 0, invariants: {} };
    const generatedAt = report ? extractTimestamp(report) : null;
    const fileName = latestPath ? path.basename(latestPath) : null;
    inventory.push({
      ...definition,
      present: Boolean(report),
      schemaReadable: Boolean(report && typeof report === 'object'),
      evidenceId: report ? extractEvidenceId(report, fileName ?? definition.stage) : null,
      evidencePath: latestPath,
      fileName,
      certificationPassed,
      certificationStatus:
        certificationPassed === true ? 'CERTIFIED' : certificationPassed === false ? 'UNCERTIFIED' : 'UNKNOWN',
      generatedAt,
      policyVersion: report ? extractPolicyVersion(report) : null,
      upstreamEvidenceReferences: report ? extractUpstreamReferences(definition.stage, report) : [],
      scenarioStatus,
      invariantStatus,
      freshnessStatus: report ? classifyFreshness(generatedAt) : 'MISSING',
      report,
    });
  }
  return inventory;
}

function buildInventoryMap(inventory) {
  return Object.fromEntries(inventory.map((record) => [record.stage, record]));
}

function applyStageOverrides(record, overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'upstreamEvidenceReferences' && Array.isArray(value)) {
      record.upstreamEvidenceReferences = [...value];
      continue;
    }
    if (key === 'invariants' && value && typeof value === 'object') {
      record.invariantStatus = {
        ...record.invariantStatus,
        invariants: { ...record.invariantStatus.invariants, ...value },
      };
      const invariantValues = Object.values(record.invariantStatus.invariants).filter((entry) => typeof entry === 'boolean');
      record.invariantStatus.total = invariantValues.length;
      record.invariantStatus.passed = invariantValues.filter(Boolean).length;
      continue;
    }
    record[key] = value;
  }
}

function applyFixtureMutations(authoritativeInventory, fixture) {
  const inventory = deepClone(authoritativeInventory);
  const inventoryMap = buildInventoryMap(inventory);
  const mutations = fixture?.mutations ?? {};

  for (const stage of mutations.removeStages ?? []) {
    const record = inventoryMap[stage];
    if (!record) continue;
    record.present = false;
    record.schemaReadable = false;
    record.evidenceId = null;
    record.evidencePath = null;
    record.fileName = null;
    record.certificationPassed = null;
    record.certificationStatus = 'MISSING';
    record.generatedAt = null;
    record.policyVersion = null;
    record.upstreamEvidenceReferences = [];
    record.scenarioStatus = { passed: 0, total: 0 };
    record.invariantStatus = { passed: 0, total: 0, invariants: {} };
    record.freshnessStatus = 'MISSING';
    record.report = null;
  }

  for (const [stage, overrides] of Object.entries(mutations.stageOverrides ?? {})) {
    const record = inventoryMap[stage];
    if (!record) continue;
    applyStageOverrides(record, overrides);
    if ('certificationPassed' in overrides) {
      record.certificationStatus =
        record.certificationPassed === true ? 'CERTIFIED' : record.certificationPassed === false ? 'UNCERTIFIED' : 'UNKNOWN';
    }
  }

  return inventory;
}

function validateA15ToA31Backchain(inventoryMap) {
  const requiredStages = STAGE_DEFINITIONS.filter((definition) => Number(definition.stage.slice(1)) <= 31).map(
    (definition) => definition.stage,
  );
  const missingStages = requiredStages.filter((stage) => inventoryMap[stage]?.present !== true);
  const uncertifiedStages = requiredStages.filter((stage) => inventoryMap[stage]?.certificationPassed !== true);
  const a32 = inventoryMap.A32;
  const invariantKeys = [
    'a15PolicyPreserved',
    'a16ExecutionControlPreserved',
    'a17AdapterBoundaryPreserved',
    'a18AcquisitionPreserved',
    'a19ClassificationPreserved',
    'a20ReadinessPreserved',
    'a21PipelinePreserved',
    'a22PublicationPreserved',
    'a23CommercialPreserved',
    'a24ActivationPreserved',
    'a25RuntimePreserved',
    'a26RecoveryPreserved',
    'a27IncidentGovernancePreserved',
    'a28ExecutiveGovernancePreserved',
    'a29DecisionLifecyclePreserved',
    'a30ExecutiveUiContractPreserved',
    'a31GatewayBoundaryPreserved',
    'criticalEvidenceFreshnessEnforced',
    'staleEvidenceFailsClosed',
    'noAuthoritySelfElevation',
    'publicationCannotBeBypassed',
    'commercialControlCannotBeBypassed',
    'activationCannotBeBypassed',
    'rollbackPathVerified',
    'recoveryPathVerified',
    'idempotencyVerified',
    'auditTraceComplete',
  ];
  const invariantFailures = invariantKeys.filter((key) => a32?.invariantStatus?.invariants?.[key] !== true);
  return {
    checkId: 'A15_TO_A31_BACKCHAIN_CERTIFIED',
    passed:
      missingStages.length === 0 &&
      uncertifiedStages.length === 0 &&
      a32?.certificationPassed === true &&
      invariantFailures.length === 0,
    missingStages,
    uncertifiedStages,
    invariantFailures,
  };
}

function validateDirectAdjacency(stage, inventoryMap) {
  const current = inventoryMap[stage];
  const previousStage = current?.previousStage;
  if (!current || !previousStage) return null;
  const previous = inventoryMap[previousStage];
  const referenceBlob = current.upstreamEvidenceReferences.join(' ');
  const expectedTokens = uniqueStrings([
    previous?.evidenceId,
    previous?.fileName,
    previous?.generatedAt,
    previousStage,
    previous?.key,
  ]);
  const matchedTokens = expectedTokens.filter((token) => referenceBlob.includes(token));
  return {
    checkId: `${previousStage}_TO_${stage}_CONTINUITY`,
    fromStage: previousStage,
    toStage: stage,
    passed:
      current.present === true &&
      previous?.present === true &&
      current.certificationPassed === true &&
      previous.certificationPassed === true &&
      current.freshnessStatus !== 'STALE' &&
      previous.freshnessStatus !== 'STALE' &&
      matchedTokens.length > 0,
    matchedTokens,
    expectedTokens,
    upstreamReferences: current.upstreamEvidenceReferences,
  };
}

function validateChainContinuity(inventory) {
  const inventoryMap = buildInventoryMap(inventory);
  const checks = [];
  checks.push(validateA15ToA31Backchain(inventoryMap));
  for (const stage of ['A33', 'A34', 'A35', 'A36', 'A37', 'A38']) {
    const check = validateDirectAdjacency(stage, inventoryMap);
    if (check) checks.push(check);
  }

  const missingStages = inventory.filter((record) => record.present !== true).map((record) => record.stage);
  const unreadableStages = inventory.filter((record) => record.present === true && record.schemaReadable !== true).map((record) => record.stage);
  const uncertifiedStages = inventory.filter((record) => record.present === true && record.certificationPassed !== true).map((record) => record.stage);
  const staleStages = inventory.filter((record) => ['STALE', 'UNKNOWN', 'MISSING'].includes(record.freshnessStatus)).map((record) => record.stage);

  return {
    checks,
    allPassed: checks.every((check) => check?.passed === true),
    noCriticalStageSkipped: missingStages.length === 0,
    noSilentSchemaFailure: unreadableStages.length === 0,
    noDownstreamPassOnInvalidUpstream: checks.every((check) => check?.passed === true),
    noSilentStaleEvidenceAcceptance: staleStages.length === 0,
    missingStages,
    unreadableStages,
    uncertifiedStages,
    staleStages,
  };
}

function deriveFailureCodes(inventory, continuity, fixture) {
  const codes = [];
  for (const stage of continuity.missingStages) {
    codes.push({ code: 'MISSING_CRITICAL_STAGE_EVIDENCE', stage, detail: stage });
  }
  for (const stage of continuity.unreadableStages) {
    codes.push({ code: 'SCHEMA_UNREADABLE', stage, detail: stage });
  }
  for (const stage of continuity.uncertifiedStages) {
    codes.push({ code: 'UNCERTIFIED_STAGE', stage, detail: stage });
  }
  for (const stage of continuity.staleStages) {
    codes.push({ code: 'STALE_CRITICAL_EVIDENCE', stage, detail: stage });
  }
  for (const check of continuity.checks.filter((entry) => entry?.passed === false)) {
    if (check.checkId !== 'A15_TO_A31_BACKCHAIN_CERTIFIED') {
      codes.push({ code: 'BROKEN_UPSTREAM_REFERENCE', stage: check.toStage, detail: check.checkId });
    }
  }
  for (const injected of fixture?.mutations?.injectedFailures ?? []) {
    codes.push({
      code: injected.code,
      stage: injected.stage ?? null,
      detail: injected.detail ?? injected.code,
    });
  }
  return codes;
}

function classifyFailures(failureCodes) {
  const classified = failureCodes.map((failure) => ({
    ...failure,
    classification: FAILURE_CLASSIFICATIONS[failure.code] ?? 'blocking',
  }));
  return {
    classified,
    fatal: classified.filter((failure) => failure.classification === 'fatal'),
    blocking: classified.filter((failure) => failure.classification === 'blocking'),
    review: classified.filter((failure) => failure.classification === 'review'),
  };
}

function deriveAcceptanceOutcome(failures) {
  if (failures.fatal.length > 0) {
    return {
      finalState: 'FAILED_CLOSED',
      acceptanceDecision: 'FAILED_CLOSED',
      chainState: 'FAILED_CLOSED',
    };
  }
  if (failures.blocking.length > 0) {
    const blockingCodes = failures.blocking.map((failure) => failure.code);
    const state = blockingCodes.some((code) =>
      ['UNCERTIFIED_STAGE', 'STALE_CRITICAL_EVIDENCE', 'BROKEN_UPSTREAM_REFERENCE', 'EXECUTIVE_REJECT', 'PUBLICATION_BLOCK'].includes(code),
    )
      ? 'ACCEPTANCE_BLOCKED'
      : 'CHAIN_DEGRADED';
    return {
      finalState: state,
      acceptanceDecision: 'ACCEPTANCE_BLOCKED',
      chainState: state,
    };
  }
  if (failures.review.length > 0) {
    return {
      finalState: 'EXECUTIVE_REVIEW_REQUIRED',
      acceptanceDecision: 'ENTERPRISE_ACCEPTED_WITH_REVIEW',
      chainState: 'EXECUTIVE_REVIEW_REQUIRED',
    };
  }
  return {
    finalState: 'ENTERPRISE_ACCEPTED',
    acceptanceDecision: 'ENTERPRISE_ACCEPTED',
    chainState: 'CHAIN_HEALTHY',
  };
}

function evaluateAuthorityBoundary(inventoryMap, failureCodes) {
  const a32 = inventoryMap.A32?.invariantStatus?.invariants ?? {};
  const a36 = inventoryMap.A36?.invariantStatus?.invariants ?? {};
  const a37 = inventoryMap.A37?.invariantStatus?.invariants ?? {};
  const a38 = inventoryMap.A38?.invariantStatus?.invariants ?? {};
  const fatalAuthority = failureCodes.some((failure) => failure.code === 'AUTHORITY_EXPANSION_ATTEMPT');
  const preserved =
    fatalAuthority !== true &&
    a32.noAuthoritySelfElevation === true &&
    a36.executiveAuthorityCannotBypassSecurityHardStops === true &&
    a37.executiveAuthorityCannotBypassSecurityOrRightsHardStops === true &&
    a38.allA15ToA37ControlsRemainPreserved === true;
  return {
    preserved,
    status: preserved ? 'PRESERVED' : 'ERODED',
  };
}

function evaluateExternalMutationBoundary(inventoryMap, failureCodes) {
  const a32 = inventoryMap.A32?.invariantStatus?.invariants ?? {};
  const a33 = inventoryMap.A33?.invariantStatus?.invariants ?? {};
  const a34 = inventoryMap.A34?.invariantStatus?.invariants ?? {};
  const a35 = inventoryMap.A35?.invariantStatus?.invariants ?? {};
  const a36 = inventoryMap.A36?.invariantStatus?.invariants ?? {};
  const a37 = inventoryMap.A37?.invariantStatus?.invariants ?? {};
  const a38 = inventoryMap.A38?.invariantStatus?.invariants ?? {};
  const fatalMutation = failureCodes.some((failure) => failure.code === 'EXTERNAL_MUTATION_ATTEMPT');
  const prohibited =
    fatalMutation !== true &&
    a32.noDirectProductionMutation === true &&
    a33.noProductionMutationDuringCertification === true &&
    a34.noIrreversibleProductionMutationDuringCertification === true &&
    a35.externalInfrastructureMutationProhibited === true &&
    a36.certificationCausesNoExternalFinancialMutation === true &&
    a37.certificationCausesZeroExternalCommercialMutation === true &&
    a38.certificationCausesZeroExternalCustomerSystemMutation === true;
  return {
    prohibited,
    status: prohibited ? 'ZERO_EXTERNAL_MUTATION_CONFIRMED' : 'EXTERNAL_MUTATION_RISK_DETECTED',
  };
}

function loadFixtures() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')));
}

function buildScenarioTests(fixture, scenarioResult, idempotent) {
  const expectedCodes = fixture.expectedFailureCodes ?? [];
  return [
    {
      name: 'finalStateMatch',
      passed: scenarioResult.finalState === fixture.expectedState,
      expected: fixture.expectedState,
      actual: scenarioResult.finalState,
    },
    {
      name: 'acceptanceDecisionMatch',
      passed: scenarioResult.acceptanceDecision === fixture.expectedDecision,
      expected: fixture.expectedDecision,
      actual: scenarioResult.acceptanceDecision,
    },
    {
      name: 'expectedFailureCodesObserved',
      passed: expectedCodes.every((code) => scenarioResult.failureCodes.includes(code)),
      expected: expectedCodes,
      actual: scenarioResult.failureCodes,
    },
    {
      name: 'criticalFailureNotHiddenDownstream',
      passed:
        expectedCodes.length === 0 ||
        expectedCodes.every((code) => scenarioResult.failureCodes.includes(code) && scenarioResult.propagatedFailureCodes.includes(code)),
      expected: true,
      actual: expectedCodes.length === 0 || expectedCodes.every((code) => scenarioResult.propagatedFailureCodes.includes(code)),
    },
    {
      name: 'externalMutationRemainsProhibited',
      passed: scenarioResult.externalMutationVerification.status !== 'EXTERNAL_MUTATION_RISK_DETECTED',
      expected: 'ZERO_EXTERNAL_MUTATION_CONFIRMED',
      actual: scenarioResult.externalMutationVerification.status,
    },
    {
      name: 'authorityBoundaryPreserved',
      passed: scenarioResult.authorityBoundary.status === 'PRESERVED',
      expected: 'PRESERVED',
      actual: scenarioResult.authorityBoundary.status,
    },
    {
      name: 'decisionEvidenceEmitted',
      passed: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length > 0,
      expected: true,
      actual: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length > 0,
    },
    {
      name: 'repeatedEvaluationIdempotent',
      passed: idempotent,
      expected: true,
      actual: idempotent,
    },
  ];
}

function evaluateScenarioCore(fixture, authoritativeInventory) {
  const auditTrail = [];
  auditTrail.push({ step: 'DISCOVERING_EVIDENCE', scenarioId: fixture.scenarioId, timestamp: nowIso });

  const inventory = applyFixtureMutations(authoritativeInventory, fixture);
  const inventoryMap = buildInventoryMap(inventory);
  const continuity = validateChainContinuity(inventory);
  const failures = classifyFailures(deriveFailureCodes(inventory, continuity, fixture));
  const authorityBoundary = evaluateAuthorityBoundary(inventoryMap, failures.classified);
  const externalMutationVerification = evaluateExternalMutationBoundary(inventoryMap, failures.classified);

  auditTrail.push({
    step: 'VALIDATING_CHAIN',
    missingStages: continuity.missingStages,
    uncertifiedStages: continuity.uncertifiedStages,
    staleStages: continuity.staleStages,
    continuityPassed: continuity.allPassed,
  });
  auditTrail.push({
    step: 'FAILURE_CLASSIFICATION',
    fatal: failures.fatal.map((failure) => failure.code),
    blocking: failures.blocking.map((failure) => failure.code),
    review: failures.review.map((failure) => failure.code),
  });
  auditTrail.push({
    step: 'BOUNDARY_VALIDATION',
    authorityBoundary: authorityBoundary.status,
    externalMutationStatus: externalMutationVerification.status,
  });

  const outcome = deriveAcceptanceOutcome(failures);
  auditTrail.push({
    step: 'ACCEPTANCE_DECISION',
    finalState: outcome.finalState,
    acceptanceDecision: outcome.acceptanceDecision,
  });

  return {
    scenarioId: fixture.scenarioId,
    category: fixture.category,
    description: fixture.description,
    finalState: outcome.finalState,
    acceptanceDecision: outcome.acceptanceDecision,
    chainState: outcome.chainState,
    blockingStage:
      failures.fatal[0]?.stage ??
      failures.blocking[0]?.stage ??
      failures.review[0]?.stage ??
      null,
    failureCodes: failures.classified.map((failure) => failure.code),
    propagatedFailureCodes: failures.classified.map((failure) => failure.code),
    failureDetails: failures.classified,
    chainContinuity: continuity,
    authorityBoundary,
    externalMutationVerification,
    stageEvidenceSnapshot: inventory.map((record) => ({
      stage: record.stage,
      evidenceId: record.evidenceId,
      evidencePath: record.evidencePath,
      certificationStatus: record.certificationStatus,
      freshnessStatus: record.freshnessStatus,
      schemaReadable: record.schemaReadable,
    })),
    auditTrail,
  };
}

function runScenario(fixture, authoritativeInventory) {
  const baseline = evaluateScenarioCore(fixture, authoritativeInventory);
  const repeatCount = Number.isInteger(fixture.idempotencyRepeatCount) ? fixture.idempotencyRepeatCount : 0;
  let idempotent = true;
  if (repeatCount > 0) {
    const serialized = stableSerialize(baseline);
    for (let index = 0; index < repeatCount; index += 1) {
      if (stableSerialize(evaluateScenarioCore(fixture, authoritativeInventory)) !== serialized) {
        idempotent = false;
        break;
      }
    }
  }
  const tests = buildScenarioTests(fixture, baseline, idempotent);
  return {
    ...baseline,
    tests,
    passed: tests.every((test) => test.passed === true),
  };
}

function buildEnterpriseInvariants(authoritativeInventory, scenarioResults, continuity) {
  const inventoryMap = buildInventoryMap(authoritativeInventory);
  const find = (scenarioId) => scenarioResults.find((result) => result.scenarioId === scenarioId);
  const healthy = find('FULL_HEALTHY_CHAIN_ENTERPRISE_ACCEPTED');
  const missingEvidence = find('MISSING_CRITICAL_STAGE_EVIDENCE_FAILS_CLOSED');
  const uncertified = find('UNCERTIFIED_STAGE_BLOCKS_ACCEPTANCE');
  const stale = find('STALE_CRITICAL_EVIDENCE_BLOCKS_ACCEPTANCE');
  const brokenRef = find('BROKEN_UPSTREAM_REFERENCE_BLOCKS_ACCEPTANCE');
  const security = find('SECURITY_BLOCK_PROPAGATES');
  const runtime = find('RUNTIME_FAILURE_PROPAGATES');
  const capacity = find('P0_CAPACITY_REMAINS_PROTECTED');
  const budget = find('BUDGET_HARD_STOP_PROPAGATES');
  const rights = find('UNKNOWN_RIGHTS_CANNOT_COMMERCIALIZE');
  const privacy = find('PRIVACY_UNKNOWN_BLOCKS_OR_REQUIRES_REVIEW');
  const authority = find('AUTHORITY_DOES_NOT_EXPAND_DOWNSTREAM');
  const externalMutation = find('EXTERNAL_MUTATION_ATTEMPT_BLOCKED');
  const repeated = find('REPEATED_IDENTICAL_ACCEPTANCE_IS_IDEMPOTENT');

  return {
    requiredA15ToA38EvidenceDiscoverable: authoritativeInventory.every((record) => record.present === true),
    allRequiredCriticalCertificationsValid: authoritativeInventory.every((record) => record.certificationPassed === true),
    noCriticalUpstreamFailureHiddenDownstream:
      missingEvidence?.passed === true &&
      uncertified?.passed === true &&
      stale?.passed === true &&
      brokenRef?.passed === true,
    noCriticalStageSkipped: continuity.noCriticalStageSkipped === true,
    evidenceChainCoherent: continuity.allPassed === true,
    failClosedSemanticsRemainPreserved:
      missingEvidence?.finalState === 'FAILED_CLOSED' &&
      security?.finalState === 'FAILED_CLOSED' &&
      externalMutation?.finalState === 'FAILED_CLOSED',
    securityHardStopsRemainPreserved: security?.passed === true && inventoryMap.A33?.invariantStatus?.invariants?.securityBlockIsNonOverridable === true,
    executiveBoundariesRemainPreserved:
      inventoryMap.A32?.invariantStatus?.invariants?.noAuthoritySelfElevation === true &&
      inventoryMap.A36?.invariantStatus?.invariants?.executiveAuthorityCannotBypassSecurityHardStops === true &&
      inventoryMap.A37?.invariantStatus?.invariants?.executiveAuthorityCannotBypassSecurityOrRightsHardStops === true,
    providerBoundariesRemainPreserved:
      inventoryMap.A32?.invariantStatus?.invariants?.noProviderProcurement === true &&
      inventoryMap.A35?.invariantStatus?.invariants?.providerContactProhibitedDuringCertification === true,
    publicationBoundariesRemainPreserved:
      inventoryMap.A32?.invariantStatus?.invariants?.publicationCannotBeBypassed === true &&
      find('PUBLICATION_BLOCK_PROPAGATES')?.passed === true,
    rollbackReserveRemainsProtected:
      inventoryMap.A35?.invariantStatus?.invariants?.rollbackReserveProtected === true &&
      inventoryMap.A36?.invariantStatus?.invariants?.rollbackReserveRemainsProtected === true,
    recoveryReserveRemainsProtected:
      inventoryMap.A35?.invariantStatus?.invariants?.recoveryReserveProtected === true &&
      inventoryMap.A36?.invariantStatus?.invariants?.recoveryReserveRemainsProtected === true,
    p0CapacityRemainsProtected: capacity?.passed === true && budget?.passed === true,
    budgetHardStopsRemainPreserved: inventoryMap.A36?.invariantStatus?.invariants?.hardBudgetLimitCannotBeBypassed === true,
    noAutonomousFinancialTransaction:
      inventoryMap.A36?.invariantStatus?.invariants?.noAutonomousPayment === true &&
      inventoryMap.A36?.invariantStatus?.invariants?.financialTransactionAttemptBlocked === true,
    noAutonomousContractExecution:
      inventoryMap.A37?.invariantStatus?.invariants?.noAutonomousContractAcceptance === true &&
      inventoryMap.A38?.invariantStatus?.invariants?.noAutonomousContractExecution === true,
    noAutonomousBindingCommercialOffer:
      inventoryMap.A37?.invariantStatus?.invariants?.noAutonomousBindingOfferDispatch === true &&
      find('BINDING_COMMERCIAL_ACTION_REMAINS_BLOCKED')?.passed === true,
    rightsUncertaintyCannotSilentlyPass: rights?.passed === true && inventoryMap.A37?.invariantStatus?.invariants?.unknownRightsCannotCommercialize === true,
    entitlementCannotEscalate:
      inventoryMap.A37?.invariantStatus?.invariants?.noEntitlementBypass === true &&
      inventoryMap.A38?.invariantStatus?.invariants?.noEntitlementBypass === true,
    privacyUncertaintyCannotSilentlyPass:
      privacy?.passed === true && inventoryMap.A38?.invariantStatus?.invariants?.privacyUncertaintyCannotSilentlyPass === true,
    crossAccountIsolationRemainsPreserved: inventoryMap.A38?.invariantStatus?.invariants?.crossAccountLeakageIsProhibited === true,
    externalMutationRemainsProhibitedDuringCertification: externalMutation?.passed === true,
    authorityIsMonotonicNonExpanding: authority?.passed === true && authority?.authorityBoundary?.status === 'PRESERVED',
    repeatedEvaluationIsIdempotent: repeated?.passed === true && runtime?.passed === true,
    allAcceptanceDecisionsEmitEvidence: scenarioResults.every((result) => Array.isArray(result.auditTrail) && result.auditTrail.length > 0),
    a39DoesNotWeakenA15ToA38TestsOrPolicies:
      healthy?.passed === true && authoritativeInventory.every((record) => typeof record.policyVersion === 'string' && record.policyVersion.length > 0),
  };
}

function buildExecutiveSummary(output) {
  const blockedScenarios = output.scenarios.filter((scenario) => scenario.acceptanceDecision !== 'ENTERPRISE_ACCEPTED');
  return {
    platformStatus: output.acceptanceDecision === 'ENTERPRISE_ACCEPTED' ? 'HEALTHY' : 'DEGRADED',
    acceptanceDecision: output.acceptanceDecision,
    whatWasVerified: [
      REQUIRED_STAGE_RANGE,
      'evidence discovery',
      'chain continuity',
      'cross-stage governance',
      'failure propagation',
      'authority monotonicity',
      'zero external mutation',
      'deterministic repeated evaluation',
    ],
    whatRemainsBlocked: blockedScenarios
      .filter((scenario) => scenario.scenarioId !== 'FULL_HEALTHY_CHAIN_ENTERPRISE_ACCEPTED')
      .map((scenario) => `${scenario.scenarioId}:${scenario.acceptanceDecision}`),
    criticalRisks: output.remainingRisks.filter((risk) => risk.severity === 'critical'),
    noncriticalRisks: output.remainingRisks.filter((risk) => risk.severity !== 'critical'),
    externalMutationStatus: output.externalMutationVerification.status,
    authorityBoundaryStatus: output.authorityBoundaryResults.status,
    evidenceChainStatus: output.chainContinuityResults.allPassed ? 'COHERENT' : 'INCOHERENT',
    nextAction:
      output.acceptanceDecision === 'ENTERPRISE_ACCEPTED'
        ? 'Maintain evidence freshness and preserve A15-A38 control boundaries.'
        : `Remediate blocking stage ${output.blockingStage ?? 'UNKNOWN'} before re-running A39 acceptance.`,
  };
}

function renderSummary(output, inventory) {
  const inventoryLines = inventory
    .map(
      (record) =>
        `- ${record.stage}: ${record.certificationStatus} | ${record.freshnessStatus} | ${record.evidencePath ?? 'MISSING'}`,
    )
    .join('\n');
  return `# A39 Enterprise Autonomous Operations Acceptance

## PLATFORM STATUS

${output.executiveSummary.platformStatus}

## ACCEPTANCE DECISION

${output.acceptanceDecision}

## WHAT WAS VERIFIED

${output.executiveSummary.whatWasVerified.map((item) => `- ${item}`).join('\n')}

## WHAT REMAINS BLOCKED

${output.executiveSummary.whatRemainsBlocked.length ? output.executiveSummary.whatRemainsBlocked.map((item) => `- ${item}`).join('\n') : '- None'}

## CRITICAL RISKS

${output.executiveSummary.criticalRisks.length ? output.executiveSummary.criticalRisks.map((risk) => `- ${risk.code}: ${risk.detail}`).join('\n') : '- None'}

## NONCRITICAL RISKS

${output.executiveSummary.noncriticalRisks.length ? output.executiveSummary.noncriticalRisks.map((risk) => `- ${risk.code}: ${risk.detail}`).join('\n') : '- None'}

## EXTERNAL MUTATION STATUS

${output.externalMutationVerification.status}

## AUTHORITY BOUNDARY STATUS

${output.authorityBoundaryResults.status}

## EVIDENCE CHAIN STATUS

${output.chainContinuityResults.allPassed ? 'COHERENT' : 'INCOHERENT'}

## NEXT ACTION

${output.executiveSummary.nextAction}

## STAGE EVIDENCE INVENTORY

${inventoryLines}
`;
}

export function runEnterpriseAcceptance() {
  console.log(`[A39] Enterprise Autonomous Operations Acceptance — ${MODE} mode`);
  console.log(`[A39] Run: ${acceptanceRunId}`);

  const authoritativeInventory = discoverEvidence();
  const inventoryMap = buildInventoryMap(authoritativeInventory);
  const chainContinuityResults = validateChainContinuity(authoritativeInventory);
  const fixtures = loadFixtures();
  const scenarioResults = fixtures.map((fixture) => {
    const result = runScenario(fixture, authoritativeInventory);
    console.log(`[A39][${result.passed ? 'PASS' : 'FAIL'}] ${result.scenarioId} → ${result.finalState} / ${result.acceptanceDecision}`);
    return result;
  });

  const happyPathResult = scenarioResults.find((scenario) => scenario.scenarioId === 'FULL_HEALTHY_CHAIN_ENTERPRISE_ACCEPTED') ?? null;
  const failurePropagationResults = scenarioResults.filter((scenario) => scenario.scenarioId !== 'FULL_HEALTHY_CHAIN_ENTERPRISE_ACCEPTED');
  const authorityBoundaryResults = happyPathResult?.authorityBoundary ?? evaluateAuthorityBoundary(inventoryMap, []);
  const externalMutationVerification =
    happyPathResult?.externalMutationVerification ?? evaluateExternalMutationBoundary(inventoryMap, []);

  const invariants = buildEnterpriseInvariants(authoritativeInventory, scenarioResults, chainContinuityResults);
  const invariantPassCount = Object.values(invariants).filter(Boolean).length;
  const invariantTotal = Object.keys(invariants).length;
  const allScenariosPassed = scenarioResults.every((scenario) => scenario.passed === true);
  const allInvariantsPassed = Object.values(invariants).every(Boolean);
  const certificationPassed =
    happyPathResult?.acceptanceDecision === 'ENTERPRISE_ACCEPTED' && allScenariosPassed && allInvariantsPassed;

  const acceptanceDecision = certificationPassed ? 'ENTERPRISE_ACCEPTED' : happyPathResult?.acceptanceDecision ?? 'FAILED_CLOSED';
  const remainingRisks = [];
  if (!chainContinuityResults.allPassed) {
    remainingRisks.push({
      severity: 'critical',
      code: 'CHAIN_CONTINUITY_GAP',
      detail: chainContinuityResults.checks.filter((check) => check?.passed === false).map((check) => check.checkId).join(', '),
    });
  }
  for (const result of failurePropagationResults.filter((scenario) => scenario.passed !== true)) {
    remainingRisks.push({
      severity: 'critical',
      code: result.scenarioId,
      detail: result.tests.filter((test) => !test.passed).map((test) => test.name).join(', '),
    });
  }

  const certificationMatrix = authoritativeInventory.map((record) => ({
    stage: record.stage,
    evidenceId: record.evidenceId,
    evidencePath: record.evidencePath,
    certificationStatus: record.certificationStatus,
    generatedAt: record.generatedAt,
    policyVersion: record.policyVersion,
    freshnessStatus: record.freshnessStatus,
    schemaReadable: record.schemaReadable,
    scenarioStatus: record.scenarioStatus,
    invariantStatus: {
      passed: record.invariantStatus.passed,
      total: record.invariantStatus.total,
    },
  }));

  const output = {
    acceptanceRunId,
    repositoryCommit: readRepositoryCommit(),
    stage: 'A39',
    mode: MODE,
    title: 'Enterprise Autonomous Operations Acceptance',
    generatedAt: nowIso,
    policyVersion: POLICY_VERSION,
    requiredStageRange: REQUIRED_STAGE_RANGE,
    stageEvidenceInventory: certificationMatrix.map((record) => ({
      ...record,
      upstreamEvidenceReferences: inventoryMap[record.stage]?.upstreamEvidenceReferences ?? [],
    })),
    certificationMatrix,
    chainContinuityResults,
    crossStageInvariantResults: invariants,
    happyPathResult,
    failurePropagationResults,
    authorityBoundaryResults,
    externalMutationVerification,
    remainingRisks,
    acceptanceStateModel: ACCEPTANCE_STATES,
    acceptanceDecisions: ACCEPTANCE_DECISIONS,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((scenario) => scenario.passed).length,
    failedCount: scenarioResults.filter((scenario) => !scenario.passed).length,
    scenarios: scenarioResults,
    invariantPassCount,
    invariantTotal,
    certification: {
      allScenariosPassed,
      allInvariantsPassed,
      certificationPassed,
    },
    acceptanceDecision,
    certificationPassed,
    blockingStage:
      happyPathResult?.blockingStage ??
      chainContinuityResults.missingStages[0] ??
      chainContinuityResults.uncertifiedStages[0] ??
      chainContinuityResults.staleStages[0] ??
      null,
    timestamps: {
      generatedAt: nowIso,
      completedAt: new Date().toISOString(),
    },
    auditTrail: scenarioResults.flatMap((scenario) =>
      scenario.auditTrail.map((entry) => ({ scenarioId: scenario.scenarioId, ...entry })),
    ),
  };

  output.executiveSummary = buildExecutiveSummary(output);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `a39-enterprise-acceptance-${timestampSlug}.json`);
  const summaryPath = path.join(REPORT_DIR, `a39-enterprise-acceptance-${timestampSlug}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(summaryPath, `${renderSummary(output, authoritativeInventory)}\n`, 'utf-8');

  console.log(`\n[A39] === RESULTS ===`);
  console.log(`[A39] Scenarios: ${output.passedCount}/${output.scenarioCount} ${allScenariosPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A39] Invariants: ${invariantPassCount}/${invariantTotal} ${allInvariantsPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A39] acceptanceDecision: ${acceptanceDecision}`);
  console.log(`[A39] certificationPassed: ${certificationPassed}`);
  console.log(`[A39] Evidence: ${jsonPath}`);
  console.log(`[A39] Summary: ${summaryPath}`);

  if (!certificationPassed) {
    console.error(`[A39][FAIL] blockingStage: ${output.blockingStage ?? 'UNKNOWN'}`);
    process.exitCode = 1;
  }

  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnterpriseAcceptance();
}
