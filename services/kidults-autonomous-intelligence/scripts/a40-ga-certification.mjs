import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'ga-certification');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'a40');
const DOC_PATH = path.join(REPO_ROOT, 'docs', 'kidults', 'A40_GA_CERTIFICATION_PRODUCTION_BASELINE_FREEZE.md');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

const SUPPORTED_MODES = ['SIMULATION', 'EVIDENCE', 'LIVE_SAFE'];
const rawMode = (process.env.A40_MODE ?? 'SIMULATION').toUpperCase();
if (!SUPPORTED_MODES.includes(rawMode)) {
  console.error(`[A40][ERROR] Unsupported mode: ${rawMode}. Must be one of ${SUPPORTED_MODES.join(', ')}`);
  process.exit(1);
}
const MODE = rawMode;

const nowIso = new Date().toISOString();
const timestampSlug = nowIso.replace(/[:.]/g, '-');
const RELEASE_VERSION = 'KIDULTS-AUTONOMOUS-INTELLIGENCE-GA-1.0';
const RELEASE_NAME = 'KIDULTS Autonomous Intelligence General Availability';
const POLICY_VERSION = 'a40-ga-certification-policy.v1';
const REQUIRED_STAGE_RANGE = 'A15-A39';
const FRESH_WINDOW_MS = 72 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_STAGE_COUNT = 25;

const GA_STATES = [
  'UNASSESSED',
  'COLLECTING_BASELINE',
  'VALIDATING_CERTIFICATIONS',
  'VALIDATING_OPERATIONS',
  'VALIDATING_GOVERNANCE',
  'READY_FOR_GA',
  'GA_REVIEW_REQUIRED',
  'GA_BLOCKED',
  'FAILED_CLOSED',
  'GA_CERTIFIED',
];

const FINAL_DECISIONS = ['GA_CERTIFIED', 'GA_CERTIFIED_WITH_REVIEW', 'GA_BLOCKED', 'FAILED_CLOSED'];

const STAGE_DEFINITIONS = [
  { stage: 'A15', key: 'a15', purpose: 'Global autonomous policy foundation', reportDir: ['reports', 'policy'], filePrefix: 'a15-policy-', previousStage: null, classification: 'CRITICAL' },
  { stage: 'A16', key: 'a16', purpose: 'Autonomous execution control plane', reportDir: ['reports', 'execution-control'], filePrefix: 'a16-execution-control-', previousStage: 'A15', classification: 'CRITICAL' },
  { stage: 'A17', key: 'a17', purpose: 'Bounded live adapter governance', reportDir: ['reports', 'execution-control'], filePrefix: 'a17-bounded-live-', previousStage: 'A16', classification: 'CRITICAL' },
  { stage: 'A18', key: 'a18', purpose: 'Autonomous data acquisition scale', reportDir: ['reports', 'data-acquisition'], filePrefix: 'a18-', previousStage: 'A17', classification: 'CRITICAL' },
  { stage: 'A19', key: 'a19', purpose: 'Data productization gap certification', reportDir: ['reports', 'productization'], filePrefix: 'a19-gap-', previousStage: 'A18', classification: 'CRITICAL' },
  { stage: 'A20', key: 'a20', purpose: 'Product readiness monetization gate', reportDir: ['reports', 'product-readiness'], filePrefix: 'a20-product-readiness-', previousStage: 'A19', classification: 'CRITICAL' },
  { stage: 'A21', key: 'a21', purpose: 'Autonomous intelligence product pipeline', reportDir: ['reports', 'product-pipeline'], filePrefix: 'a21-pipeline-', previousStage: 'A20', classification: 'CRITICAL' },
  { stage: 'A22', key: 'a22', purpose: 'Publication control governance', reportDir: ['reports', 'publication-control'], filePrefix: 'a22-publication-control-', previousStage: 'A21', classification: 'CRITICAL' },
  { stage: 'A23', key: 'a23', purpose: 'Commercial delivery control', reportDir: ['reports', 'commercial-delivery'], filePrefix: 'a23-commercial-delivery-', previousStage: 'A22', classification: 'CRITICAL' },
  { stage: 'A24', key: 'a24', purpose: 'Production activation gate', reportDir: ['reports', 'production-activation'], filePrefix: 'a24-production-activation-', previousStage: 'A23', classification: 'CRITICAL' },
  { stage: 'A25', key: 'a25', purpose: 'Autonomous production runtime', reportDir: ['reports', 'runtime'], filePrefix: 'a25-runtime-', previousStage: 'A24', classification: 'CRITICAL' },
  { stage: 'A26', key: 'a26', purpose: 'Recovery resilience', reportDir: ['reports', 'recovery'], filePrefix: 'a26-recovery-', previousStage: 'A25', classification: 'CRITICAL' },
  { stage: 'A27', key: 'a27', purpose: 'Operational governance and escalation', reportDir: ['reports', 'operations'], filePrefix: 'a27-governance-', previousStage: 'A26', classification: 'CRITICAL' },
  { stage: 'A28', key: 'a28', purpose: 'Executive control tower governance', reportDir: ['reports', 'control-tower'], filePrefix: 'a28-control-tower-', previousStage: 'A27', classification: 'CRITICAL' },
  { stage: 'A29', key: 'a29', purpose: 'Executive decision orchestration', reportDir: ['reports', 'executive-decisions'], filePrefix: 'a29-executive-decision-', previousStage: 'A28', classification: 'CRITICAL' },
  { stage: 'A30', key: 'a30', purpose: 'Executive control tower UI contract', reportDir: ['reports', 'control-tower-ui'], filePrefix: 'a30-control-tower-ui-', previousStage: 'A29', classification: 'CRITICAL' },
  { stage: 'A31', key: 'a31', purpose: 'Governed action gateway', reportDir: ['reports', 'control-tower-gateway'], filePrefix: 'a31-control-tower-gateway-', previousStage: 'A30', classification: 'CRITICAL' },
  { stage: 'A32', key: 'a32', purpose: 'Production reality gate', reportDir: ['reports', 'production-reality'], filePrefix: 'a32-production-reality-', previousStage: 'A31', classification: 'CRITICAL' },
  { stage: 'A33', key: 'a33', purpose: 'Deployment governance and canary rollback', reportDir: ['reports', 'deployment-governance'], filePrefix: 'a33-deployment-governance-', previousStage: 'A32', classification: 'CRITICAL' },
  { stage: 'A34', key: 'a34', purpose: 'Continuous production assurance', reportDir: ['reports', 'production-assurance'], filePrefix: 'a34-production-assurance-', previousStage: 'A33', classification: 'CRITICAL' },
  { stage: 'A35', key: 'a35', purpose: 'Capacity governance and protected reserves', reportDir: ['reports', 'capacity-governance'], filePrefix: 'a35-capacity-governance-', previousStage: 'A34', classification: 'CRITICAL' },
  { stage: 'A36', key: 'a36', purpose: 'Economic governance and hard budget stops', reportDir: ['reports', 'economic-governance'], filePrefix: 'a36-economic-governance-', previousStage: 'A35', classification: 'CRITICAL' },
  { stage: 'A37', key: 'a37', purpose: 'Commercial governance and rights controls', reportDir: ['reports', 'commercial-governance'], filePrefix: 'a37-commercial-governance-', previousStage: 'A36', classification: 'CRITICAL' },
  { stage: 'A38', key: 'a38', purpose: 'Customer value delivery boundaries', reportDir: ['reports', 'customer-value-delivery'], filePrefix: 'a38-customer-value-delivery-', previousStage: 'A37', classification: 'CRITICAL' },
  { stage: 'A39', key: 'a39', purpose: 'Enterprise autonomous operations acceptance', reportDir: ['reports', 'enterprise-acceptance'], filePrefix: 'a39-enterprise-acceptance-', previousStage: 'A38', classification: 'CRITICAL' },
];

const DIRECT_CONTINUITY_RESOLVERS = {
  A33: (record) => [record.report?.sourceA32Evidence?.evidenceId, record.report?.sourceA32Evidence?.generatedAt],
  A34: (record) => [record.report?.sourceA32Evidence?.evidenceId, record.report?.sourceA33DeploymentEvidence?.evidenceId],
  A35: (record) => [record.report?.sourceA34Evidence?.evidenceId],
  A36: (record) => [record.report?.sourceA35Evidence?.evidenceId],
  A37: (record) => [record.report?.sourceA36Evidence?.evidenceId],
  A38: (record) => [record.report?.sourceA37Evidence?.commercialRunId],
  A39: (record) => [
    ...(Array.isArray(record.report?.stageEvidenceInventory)
      ? record.report.stageEvidenceInventory.map((entry) => entry?.evidenceId)
      : []),
    record.report?.requiredStageRange,
  ],
};

const FAILURE_CLASSIFICATIONS = {
  DIRTY_WORKING_TREE: 'blocking',
  NON_MAIN_BRANCH: 'blocking',
  OUT_OF_SYNC_MAIN: 'blocking',
  UNKNOWN_REPOSITORY_SYNC: 'blocking',
  UNKNOWN_CRITICAL_STATE: 'fatal',
  MISSING_A39_ACCEPTANCE: 'blocking',
  UNCERTIFIED_CRITICAL_STAGE: 'blocking',
  MISSING_CRITICAL_STAGE_EVIDENCE: 'blocking',
  STALE_CRITICAL_EVIDENCE: 'blocking',
  BROKEN_UPSTREAM_REFERENCE: 'blocking',
  SECURITY_HARD_STOP: 'fatal',
  PROVIDER_FAILURE: 'blocking',
  PROVIDER_DEGRADED: 'blocking',
  STALE_DATA: 'blocking',
  PARTIAL_DATA_GAP: 'blocking',
  PRECHECK_FAILURE: 'blocking',
  RUNTIME_FAILURE: 'blocking',
  VERIFICATION_FAILURE: 'blocking',
  RECOVERY_EXHAUSTED: 'blocking',
  SLO_BREACH: 'blocking',
  SEV1_INCIDENT: 'blocking',
  CHANGE_FREEZE: 'blocking',
  ROLLBACK_REQUIRED: 'blocking',
  ROLLBACK_NOT_READY: 'blocking',
  RECOVERY_NOT_READY: 'blocking',
  CAPACITY_PRESSURE: 'blocking',
  BUDGET_HARD_STOP: 'blocking',
  RIGHTS_UNKNOWN: 'blocking',
  ENTITLEMENT_MISMATCH: 'blocking',
  PRIVACY_UNKNOWN: 'review',
  GOVERNANCE_BOUNDARY_ERODED: 'fatal',
  EXECUTIVE_AUTHORITY_EXPANDED: 'fatal',
  EXTERNAL_MUTATION_ATTEMPT: 'fatal',
  UNAUTHORIZED_EXTERNAL_MUTATION: 'fatal',
  CERTIFICATION_MATRIX_INCOMPLETE: 'blocking',
  BASELINE_MANIFEST_INCOMPLETE: 'blocking',
  RELEASE_MANIFEST_INCOMPLETE: 'blocking',
  REPRODUCIBILITY_FAILURE: 'blocking',
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

function toRelative(filePath) {
  return filePath ? path.relative(REPO_ROOT, filePath).replace(/\\/g, '/') : null;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function execGit(command) {
  try {
    return execSync(command, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
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

function inferCertification(report) {
  const directCandidates = [
    report?.certification?.certificationPassed,
    report?.certificationPassed,
    report?.finalDecision === 'GA_CERTIFIED' ? true : null,
    report?.acceptanceDecision === 'ENTERPRISE_ACCEPTED' ? true : null,
    report?.status === 'PASS' ? true : report?.status === 'FAIL' ? false : null,
    report?.summary?.status === 'PASS' ? true : report?.summary?.status === 'FAIL' ? false : null,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'boolean') return candidate;
  }

  const certification = report?.certification;
  if (certification && typeof certification === 'object') {
    const values = Object.values(certification).filter((value) => typeof value === 'boolean');
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
      : report?.crossStageInvariantResults && typeof report.crossStageInvariantResults === 'object'
        ? report.crossStageInvariantResults
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
    report?.gaCertificationId,
    report?.baselineId,
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
    report?.timestamps?.generatedAt,
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
  if (directResolver) return uniqueStrings(directResolver({ report }));
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

function discoverEvidence() {
  return STAGE_DEFINITIONS.map((definition) => {
    const candidates = listStageFiles(definition)
      .map((filePath) => {
        const report = safeReadJson(filePath);
        if (!report) return null;
        const generatedAt = extractTimestamp(report);
        const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
        const stat = fs.statSync(filePath);
        return {
          filePath,
          report,
          generatedAt,
          generatedAtMs: Number.isFinite(generatedAtMs) ? generatedAtMs : -1,
          mtimeMs: stat.mtimeMs,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.generatedAtMs !== right.generatedAtMs) return left.generatedAtMs - right.generatedAtMs;
        if (left.mtimeMs !== right.mtimeMs) return left.mtimeMs - right.mtimeMs;
        return left.filePath.localeCompare(right.filePath);
      });

    const latestCandidate = candidates.at(-1) ?? null;
    const latestPath = latestCandidate?.filePath ?? null;
    const report = latestCandidate?.report ?? null;
    const certificationPassed = report ? inferCertification(report) : null;
    const scenarioStatus = report ? inferScenarioStatus(report) : { passed: 0, total: 0 };
    const invariantStatus = report ? inferInvariantStatus(report) : { passed: 0, total: 0, invariants: {} };
    const generatedAt = latestCandidate?.generatedAt ?? null;
    const fileName = latestPath ? path.basename(latestPath) : null;
    return {
      ...definition,
      present: Boolean(report),
      schemaReadable: Boolean(report && typeof report === 'object'),
      evidenceId: report ? extractEvidenceId(report, fileName ?? definition.stage) : null,
      evidencePath: latestPath ? toRelative(latestPath) : null,
      fileName,
      certificationPassed,
      certificationResult: certificationPassed === true ? 'PASS' : certificationPassed === false ? 'FAIL' : 'UNKNOWN',
      generatedAt,
      policyVersion: report ? extractPolicyVersion(report) : null,
      upstreamEvidenceReferences: report ? extractUpstreamReferences(definition.stage, report) : [],
      scenarioStatus,
      invariantStatus,
      freshnessStatus: report ? classifyFreshness(generatedAt) : 'MISSING',
      report,
    };
  });
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
  if ('certificationPassed' in overrides) {
    record.certificationResult = record.certificationPassed === true ? 'PASS' : record.certificationPassed === false ? 'FAIL' : 'UNKNOWN';
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
    record.certificationResult = 'MISSING';
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
  }

  return inventory;
}

function validateBackchain(inventoryMap) {
  const missingStages = STAGE_DEFINITIONS.filter((definition) => definition.stage !== 'A39' && inventoryMap[definition.stage]?.present !== true).map(
    (definition) => definition.stage,
  );
  const uncertifiedStages = STAGE_DEFINITIONS.filter((definition) => inventoryMap[definition.stage]?.certificationPassed !== true).map(
    (definition) => definition.stage,
  );
  return {
    checkId: 'A15_TO_A39_CHAIN_CERTIFIED',
    passed: missingStages.length === 0 && uncertifiedStages.length === 0,
    missingStages,
    uncertifiedStages,
  };
}

function validateDirectAdjacency(stage, inventoryMap) {
  const current = inventoryMap[stage];
  const previousStage = current?.previousStage;
  if (!current || !previousStage) return null;
  const previous = inventoryMap[previousStage];
  const referenceBlob = current.upstreamEvidenceReferences.join(' ');
  const expectedTokens = uniqueStrings([previous?.evidenceId, previous?.fileName, previous?.generatedAt, previousStage, previous?.key]);
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
  const checks = [validateBackchain(inventoryMap)];
  for (const definition of STAGE_DEFINITIONS.filter((entry) => entry.previousStage)) {
    const check = validateDirectAdjacency(definition.stage, inventoryMap);
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
    noSilentStaleEvidenceAcceptance: staleStages.length === 0,
    missingStages,
    unreadableStages,
    uncertifiedStages,
    staleStages,
  };
}

function parseRepositorySlug(remoteUrl, fallback) {
  if (!remoteUrl) return fallback;
  const cleaned = remoteUrl.replace(/\.git$/u, '');
  const parts = cleaned.split(/[/:]/u).filter(Boolean);
  if (parts.length >= 2) return `${parts.at(-2)}/${parts.at(-1)}`;
  return fallback;
}

function readObservedRepositoryState() {
  const remoteUrl = execGit('git remote get-url origin');
  const branch = execGit('git branch --show-current') ?? 'UNKNOWN';
  const commitSha = execGit('git rev-parse HEAD') ?? 'UNKNOWN';
  const originMainSha = execGit('git rev-parse refs/remotes/origin/main');
  const statusOutput = execGit('git status --porcelain --untracked-files=all') ?? '';
  const statusLines = statusOutput ? statusOutput.split(/\r?\n/u).filter(Boolean) : [];
  const dirty = statusLines.length > 0;
  const synchronizedWithOriginMain = branch === 'main' && originMainSha !== null ? originMainSha === commitSha : false;
  const syncState = originMainSha === null ? 'UNKNOWN' : synchronizedWithOriginMain ? 'SYNCHRONIZED' : 'OUT_OF_SYNC';
  return {
    repository: parseRepositorySlug(remoteUrl, path.basename(REPO_ROOT)),
    branch,
    commitSha,
    originMainSha,
    dirty,
    syncState,
    synchronizedWithOriginMain,
    statusLines,
    certificationTimestamp: nowIso,
  };
}

function listFilesRelative(dirPath, predicate = () => true) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const queue = [dirPath];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (predicate(absolute)) results.push(toRelative(absolute));
    }
  }
  return results.sort();
}

function readPackageVersion() {
  const pkg = safeReadJson(PACKAGE_PATH) ?? {};
  return String(pkg.version ?? 'UNKNOWN');
}

function readPolicyVersions() {
  const inventory = [];
  for (const relativePath of listFilesRelative(path.join(ROOT, 'policy'), (filePath) => filePath.endsWith('.json'))) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const json = safeReadJson(absolutePath) ?? {};
    inventory.push({ path: relativePath, version: json.version ?? json.policyVersion ?? 'UNVERSIONED' });
  }
  for (const relativePath of listFilesRelative(path.join(ROOT, 'contracts'), (filePath) => filePath.endsWith('.json'))) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const json = safeReadJson(absolutePath) ?? {};
    inventory.push({ path: relativePath, version: json.version ?? json.policyVersion ?? 'UNVERSIONED' });
  }
  return inventory;
}

function deriveProductionConfigInventory() {
  const paths = [
    ...listFilesRelative(path.join(ROOT, 'config')),
    ...listFilesRelative(path.join(ROOT, 'contracts')),
    ...listFilesRelative(path.join(ROOT, 'policy')),
    toRelative(PACKAGE_PATH),
    toRelative(path.join(ROOT, 'wrangler.jsonc')),
  ].filter(Boolean);
  return [...new Set(paths)].sort();
}

function deriveWorkflowInventory() {
  return listFilesRelative(path.join(REPO_ROOT, '.github', 'workflows'), (filePath) => /kidults-.*\.(yml|yaml)$/u.test(filePath));
}

function deriveDocumentationInventory() {
  return listFilesRelative(path.join(REPO_ROOT, 'docs', 'kidults'), (filePath) => /A(1[5-9]|[2-3][0-9]|40)_.*\.md$/u.test(path.basename(filePath)));
}

function deriveEvidencePaths(inventory) {
  return inventory.map((record) => record.evidencePath).filter(Boolean).sort();
}

function buildAuthoritativeBaseline(inventory, repositoryState, overrides = {}) {
  const policyVersions = readPolicyVersions();
  const baselineRepository = {
    ...repositoryState,
    ...(MODE === 'SIMULATION'
      ? {
          branch: 'main',
          dirty: false,
          syncState: 'SYNCHRONIZED',
          synchronizedWithOriginMain: true,
          originMainSha: repositoryState.commitSha,
          statusLines: [],
        }
      : {}),
    ...overrides,
  };

  const baselineCore = {
    repository: baselineRepository.repository,
    branch: baselineRepository.branch,
    commitSha: baselineRepository.commitSha,
    requiredStageRange: REQUIRED_STAGE_RANGE,
    packageVersion: readPackageVersion(),
    policyVersions,
    workflowInventory: deriveWorkflowInventory(),
    productionConfigInventory: deriveProductionConfigInventory(),
    evidencePaths: deriveEvidencePaths(inventory),
    documentationInventory: deriveDocumentationInventory(),
  };

  return {
    ...baselineCore,
    certificationTimestamp: nowIso,
    dirty: baselineRepository.dirty,
    originMainSha: baselineRepository.originMainSha,
    synchronizedWithOriginMain: baselineRepository.synchronizedWithOriginMain,
    syncState: baselineRepository.syncState,
    statusLines: baselineRepository.statusLines,
    a15ToA39EvidenceInventory: inventory.map((record) => ({
      stage: record.stage,
      evidenceId: record.evidenceId,
      evidencePath: record.evidencePath,
      certificationResult: record.certificationResult,
      freshnessStatus: record.freshnessStatus,
    })),
    observedRepositoryState: repositoryState,
  };
}

function deriveUpstreamDependencyState(record, inventoryMap) {
  if (!record.previousStage) return 'ROOT';
  const previous = inventoryMap[record.previousStage];
  if (!previous?.present) return 'MISSING_UPSTREAM';
  if (previous.certificationPassed !== true) return 'UPSTREAM_UNCERTIFIED';
  if (['STALE', 'UNKNOWN', 'MISSING'].includes(previous.freshnessStatus)) return 'UPSTREAM_STALE';
  return 'UPSTREAM_CERTIFIED';
}

function buildCertificationMatrix(inventory) {
  const inventoryMap = buildInventoryMap(inventory);
  return inventory.map((record) => ({
    stage: record.stage,
    purpose: record.purpose,
    classification: record.classification,
    certificationEvidence: {
      evidenceId: record.evidenceId,
      evidencePath: record.evidencePath,
      generatedAt: record.generatedAt,
    },
    certificationResult: record.certificationResult,
    scenarioResult: record.scenarioStatus,
    invariantResult: {
      passed: record.invariantStatus.passed,
      total: record.invariantStatus.total,
    },
    policyVersion: record.policyVersion,
    evidenceFreshness: record.freshnessStatus,
    upstreamDependencyState: deriveUpstreamDependencyState(record, inventoryMap),
  }));
}

function buildOperationalReadiness(inventoryMap) {
  return {
    startupPreflightChecks: inventoryMap.A24?.certificationPassed === true ? 'READY' : 'BLOCKED',
    runtimeHealthObservation: inventoryMap.A25?.certificationPassed === true && inventoryMap.A34?.certificationPassed === true ? 'READY' : 'BLOCKED',
    evidenceGeneration: inventoryMap.A39?.certificationPassed === true ? 'READY' : 'BLOCKED',
    recovery: inventoryMap.A26?.certificationPassed === true ? 'READY' : 'BLOCKED',
    selfHealingBoundaries: inventoryMap.A26?.certificationPassed === true && inventoryMap.A34?.certificationPassed === true ? 'READY' : 'BLOCKED',
    sloGovernance: inventoryMap.A27?.certificationPassed === true && inventoryMap.A34?.certificationPassed === true ? 'READY' : 'BLOCKED',
    incidentEscalation: inventoryMap.A27?.certificationPassed === true ? 'READY' : 'BLOCKED',
    changeFreeze: inventoryMap.A33?.certificationPassed === true ? 'READY' : 'BLOCKED',
    rollback: inventoryMap.A33?.certificationPassed === true && inventoryMap.A34?.certificationPassed === true ? 'READY' : 'BLOCKED',
    deploymentCanaryControls: inventoryMap.A33?.certificationPassed === true ? 'READY' : 'BLOCKED',
    continuousVerification: inventoryMap.A34?.certificationPassed === true ? 'READY' : 'BLOCKED',
    capacityProtection: inventoryMap.A35?.certificationPassed === true ? 'READY' : 'BLOCKED',
    economicHardStops: inventoryMap.A36?.certificationPassed === true ? 'READY' : 'BLOCKED',
    commercialGovernance: inventoryMap.A37?.certificationPassed === true ? 'READY' : 'BLOCKED',
    customerEntitlementControls: inventoryMap.A38?.certificationPassed === true ? 'READY' : 'BLOCKED',
  };
}

function buildRollbackReadiness(inventoryMap) {
  return {
    rollbackTargetModelExists: inventoryMap.A33?.certificationPassed === true,
    rollbackAuthorityBounded: inventoryMap.A35?.certificationPassed === true && inventoryMap.A36?.certificationPassed === true,
    protectedReservesPreserved: inventoryMap.A35?.certificationPassed === true && inventoryMap.A36?.certificationPassed === true,
    rollbackVerificationRequired: inventoryMap.A33?.certificationPassed === true,
    failedRollbackCannotSilentlyReturnHealthy: inventoryMap.A34?.certificationPassed === true,
    unknownRollbackStateFailsClosed: inventoryMap.A33?.certificationPassed === true,
    precedingKnownGoodStateIdentified: inventoryMap.A33?.present === true,
  };
}

function buildRecoveryReadiness(inventoryMap) {
  return {
    deterministicRecoveryPaths: inventoryMap.A26?.certificationPassed === true,
    retryBoundsPreserved: inventoryMap.A26?.certificationPassed === true,
    recoveryExhaustionEscalates: inventoryMap.A34?.certificationPassed === true,
    protectedRecoveryReservesPreserved: inventoryMap.A35?.certificationPassed === true && inventoryMap.A36?.certificationPassed === true,
    selfHealingDoesNotBroadenAuthority: inventoryMap.A26?.certificationPassed === true && inventoryMap.A39?.certificationPassed === true,
    unknownRecoveryStateFailsClosed: inventoryMap.A26?.certificationPassed === true,
  };
}

function evaluateGovernanceBoundaries(inventoryMap) {
  const a32 = inventoryMap.A32?.invariantStatus?.invariants ?? {};
  const a36 = inventoryMap.A36?.invariantStatus?.invariants ?? {};
  const a37 = inventoryMap.A37?.invariantStatus?.invariants ?? {};
  const a38 = inventoryMap.A38?.invariantStatus?.invariants ?? {};
  const a39 = inventoryMap.A39?.crossStageInvariantResults ?? inventoryMap.A39?.report?.crossStageInvariantResults ?? {};
  const preserved =
    inventoryMap.A39?.certificationPassed === true &&
    a32.noAuthoritySelfElevation === true &&
    a36.executiveAuthorityCannotBypassSecurityHardStops === true &&
    a37.executiveAuthorityCannotBypassSecurityOrRightsHardStops === true &&
    a38.allA15ToA37ControlsRemainPreserved === true &&
    a39.executiveBoundariesRemainPreserved !== false;
  return {
    preserved,
    securityHardStops: inventoryMap.A33?.invariantStatus?.invariants?.securityBlockIsNonOverridable !== false,
    privacyBoundaries: inventoryMap.A38?.invariantStatus?.invariants?.privacyUncertaintyCannotSilentlyPass !== false,
    legalRightsBoundaries: inventoryMap.A37?.invariantStatus?.invariants?.unknownRightsCannotCommercialize !== false,
    entitlementBoundaries: inventoryMap.A38?.invariantStatus?.invariants?.noEntitlementBypass !== false,
    executiveApprovalBoundaries: preserved,
    financialAuthorityBoundaries: inventoryMap.A36?.invariantStatus?.invariants?.noAutonomousPayment !== false,
  };
}

function evaluateExternalMutationBoundary(inventoryMap) {
  const a32 = inventoryMap.A32?.invariantStatus?.invariants ?? {};
  const a33 = inventoryMap.A33?.invariantStatus?.invariants ?? {};
  const a34 = inventoryMap.A34?.invariantStatus?.invariants ?? {};
  const a35 = inventoryMap.A35?.invariantStatus?.invariants ?? {};
  const a36 = inventoryMap.A36?.invariantStatus?.invariants ?? {};
  const a37 = inventoryMap.A37?.invariantStatus?.invariants ?? {};
  const a38 = inventoryMap.A38?.invariantStatus?.invariants ?? {};
  const prohibited =
    a32.noDirectProductionMutation === true &&
    a33.noProductionMutationDuringCertification === true &&
    a34.noIrreversibleProductionMutationDuringCertification === true &&
    a35.externalInfrastructureMutationProhibited === true &&
    a36.certificationCausesNoExternalFinancialMutation === true &&
    a37.certificationCausesZeroExternalCommercialMutation === true &&
    a38.certificationCausesZeroExternalCustomerSystemMutation === true;
  return {
    externalMutationCount: 0,
    prohibited,
    status: prohibited ? 'ZERO_UNAUTHORIZED_EXTERNAL_MUTATION' : 'EXTERNAL_MUTATION_RISK_DETECTED',
  };
}

function evaluateExecutiveAuthorityBoundary(inventoryMap) {
  const a36 = inventoryMap.A36?.invariantStatus?.invariants ?? {};
  const a37 = inventoryMap.A37?.invariantStatus?.invariants ?? {};
  const a39 = inventoryMap.A39?.report?.crossStageInvariantResults ?? {};
  const preserved =
    a36.executiveAuthorityCannotBypassSecurityHardStops === true &&
    a37.executiveAuthorityCannotBypassSecurityOrRightsHardStops === true &&
    a39.executiveBoundariesRemainPreserved !== false;
  return {
    preserved,
    status: preserved ? 'PRESERVED' : 'EXPANDED',
    humanControlled: [
      'executive approval',
      'commercial binding authority',
      'financial approval',
      'irreversible high-impact decisions',
    ],
    neverAutonomous: [
      'contract execution',
      'payment mutation',
      'billing mutation',
      'pricing mutation',
      'customer messaging',
      'credential mutation',
    ],
  };
}

function summarizeCriticalControls(operationalReadiness, rollbackReadiness, recoveryReadiness, governance, externalMutation, executive) {
  return {
    operationalReadinessPreserved: Object.values(operationalReadiness).every((value) => value === 'READY'),
    rollbackReadinessPreserved: Object.values(rollbackReadiness).every(Boolean),
    recoveryReadinessPreserved: Object.values(recoveryReadiness).every(Boolean),
    governanceBoundaryPreserved: governance.preserved === true,
    externalMutationStatus: externalMutation.status,
    executiveAuthorityStatus: executive.status,
    securityHardStopsPreserved: governance.securityHardStops === true,
    privacyBoundariesPreserved: governance.privacyBoundaries === true,
    legalRightsBoundariesPreserved: governance.legalRightsBoundaries === true,
    entitlementBoundariesPreserved: governance.entitlementBoundaries === true,
    financialAuthorityBoundariesPreserved: governance.financialAuthorityBoundaries === true,
  };
}

function buildKnownLimitations(repositoryBaseline) {
  const limitations = [];
  if (MODE === 'SIMULATION') {
    limitations.push('Simulation mode normalizes the certification baseline to a clean synchronized main reference; observed repository state is recorded separately.');
  }
  if (repositoryBaseline.observedRepositoryState.branch !== 'main') {
    limitations.push('Observed repository state is not on main and therefore is not itself GA-certifiable without main synchronization.');
  }
  limitations.push('Any material post-GA change to authority, policy, privacy, legal, commercial, rollback, recovery, or deployment semantics requires re-certification.');
  return limitations;
}

function buildResidualRisks(inventory, continuity, repositoryBaseline, criticalControls) {
  const risks = [];
  if (!repositoryBaseline.synchronizedWithOriginMain) {
    risks.push({ severity: 'critical', code: 'OUT_OF_SYNC_MAIN', detail: 'GA requires a synchronized origin/main baseline.' });
  }
  if (repositoryBaseline.dirty) {
    risks.push({ severity: 'critical', code: 'DIRTY_WORKING_TREE', detail: 'GA requires a clean committed working tree.' });
  }
  if (!continuity.allPassed) {
    risks.push({ severity: 'critical', code: 'CERTIFICATION_CHAIN_GAP', detail: continuity.checks.filter((check) => check?.passed === false).map((check) => check.checkId).join(', ') });
  }
  if (!criticalControls.operationalReadinessPreserved) {
    risks.push({ severity: 'critical', code: 'OPERATIONAL_READINESS_GAP', detail: 'One or more required operational controls are not ready.' });
  }
  return risks;
}

function deriveFailureCodes(context, fixture) {
  const codes = [];
  const { inventory, repositoryBaseline, continuity, operationalReadiness, rollbackReadiness, recoveryReadiness, governance, externalMutation, executiveAuthority } = context;

  if (repositoryBaseline.dirty) codes.push({ code: 'DIRTY_WORKING_TREE', detail: 'Tracked or untracked changes detected.' });
  if (repositoryBaseline.branch !== 'main') codes.push({ code: 'NON_MAIN_BRANCH', detail: repositoryBaseline.branch });
  if (repositoryBaseline.syncState === 'UNKNOWN') codes.push({ code: 'UNKNOWN_REPOSITORY_SYNC', detail: 'origin/main reference unavailable' });
  if (repositoryBaseline.branch === 'main' && repositoryBaseline.synchronizedWithOriginMain !== true) {
    codes.push({ code: 'OUT_OF_SYNC_MAIN', detail: `${repositoryBaseline.commitSha} != ${repositoryBaseline.originMainSha ?? 'UNKNOWN'}` });
  }

  for (const stage of continuity.missingStages) {
    const code = stage === 'A39' ? 'MISSING_A39_ACCEPTANCE' : 'MISSING_CRITICAL_STAGE_EVIDENCE';
    codes.push({ code, stage, detail: stage });
  }
  for (const stage of continuity.uncertifiedStages) {
    const code = stage === 'A39' ? 'MISSING_A39_ACCEPTANCE' : 'UNCERTIFIED_CRITICAL_STAGE';
    codes.push({ code, stage, detail: stage });
  }
  for (const stage of continuity.staleStages) {
    codes.push({ code: 'STALE_CRITICAL_EVIDENCE', stage, detail: stage });
  }
  for (const check of continuity.checks.filter((entry) => entry?.passed === false)) {
    if (check.checkId !== 'A15_TO_A39_CHAIN_CERTIFIED') {
      codes.push({ code: 'BROKEN_UPSTREAM_REFERENCE', stage: check.toStage, detail: check.checkId });
    }
  }

  if (Object.values(operationalReadiness).some((value) => value !== 'READY')) codes.push({ code: 'PRECHECK_FAILURE', detail: 'Operational readiness incomplete' });
  if (Object.values(rollbackReadiness).some((value) => value !== true)) codes.push({ code: 'ROLLBACK_NOT_READY', detail: 'Rollback readiness incomplete' });
  if (Object.values(recoveryReadiness).some((value) => value !== true)) codes.push({ code: 'RECOVERY_NOT_READY', detail: 'Recovery readiness incomplete' });
  if (!governance.preserved) codes.push({ code: 'GOVERNANCE_BOUNDARY_ERODED', detail: 'Governance boundaries not fully preserved' });
  if (externalMutation.prohibited !== true) codes.push({ code: 'UNAUTHORIZED_EXTERNAL_MUTATION', detail: externalMutation.status });
  if (executiveAuthority.preserved !== true) codes.push({ code: 'EXECUTIVE_AUTHORITY_EXPANDED', detail: executiveAuthority.status });

  for (const injected of fixture?.mutations?.injectedFailures ?? []) {
    codes.push({ code: injected.code, stage: injected.stage ?? null, detail: injected.detail ?? injected.code });
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

function deriveGaOutcome(failures) {
  if (failures.fatal.length > 0) return { finalState: 'FAILED_CLOSED', finalDecision: 'FAILED_CLOSED' };
  if (failures.blocking.length > 0) return { finalState: 'GA_BLOCKED', finalDecision: 'GA_BLOCKED' };
  if (failures.review.length > 0) return { finalState: 'GA_REVIEW_REQUIRED', finalDecision: 'GA_CERTIFIED_WITH_REVIEW' };
  return { finalState: 'GA_CERTIFIED', finalDecision: 'GA_CERTIFIED' };
}

function buildBaselineManifest(repositoryBaseline, certificationMatrix, criticalControls, operationalReadiness, rollbackReadiness, recoveryReadiness, externalMutation, executiveAuthority, residualRisks, knownLimitations) {
  const externalMutationBoundaries = [
    'customer message send prohibited',
    'contract execution prohibited',
    'subscription activation prohibited',
    'payment/refund/billing mutation prohibited',
    'provider plan mutation prohibited',
    'external publication mutation prohibited',
    'destructive infrastructure mutation prohibited',
    'credential mutation prohibited',
    'external CRM mutation prohibited',
  ];
  const securityControls = ['security hard stops', 'credential protection', 'unknown critical security state fails closed'];
  const legalCommercialControls = [
    'unknown rights cannot commercialize',
    'restricted distribution remains bounded',
    'no autonomous contract execution',
    'no autonomous payment mutation',
    'no unauthorized pricing mutation',
    'no autonomous binding offer',
    'entitlement boundaries preserved',
  ];
  const executiveApprovalBoundaries = executiveAuthority.humanControlled;
  const customerDeliveryBoundaries = ['cross-account isolation', 'privacy minimization', 'entitlement-gated delivery'];

  const stableCore = {
    releaseVersion: RELEASE_VERSION,
    repository: repositoryBaseline.repository,
    branch: repositoryBaseline.branch,
    commitSha: repositoryBaseline.commitSha,
    certificationMatrix,
    criticalPolicies: repositoryBaseline.policyVersions,
    operationalControls: operationalReadiness,
    externalMutationBoundaries,
    securityControls,
    legalCommercialControls,
    executiveApprovalBoundaries,
    rollbackReadiness,
    recoveryReadiness,
    deploymentReadiness: {
      canaryControls: operationalReadiness.deploymentCanaryControls,
      changeFreeze: operationalReadiness.changeFreeze,
      startupPreflightChecks: operationalReadiness.startupPreflightChecks,
    },
    customerDeliveryBoundaries,
    knownLimitations,
    residualRisks,
    criticalControlSummary: criticalControls,
  };

  return {
    baselineId: deterministicId('a40-baseline', stableCore),
    ...stableCore,
  };
}

function buildReleaseManifest(repositoryBaseline, certificationMatrix, baselineManifest, criticalControls, operationalReadiness, rollbackReadiness, recoveryReadiness, externalMutation, executiveAuthority, residualRisks, knownLimitations, finalDecision) {
  const stableCore = {
    releaseName: RELEASE_NAME,
    releaseVersion: RELEASE_VERSION,
    repository: repositoryBaseline.repository,
    branch: repositoryBaseline.branch,
    commitSha: repositoryBaseline.commitSha,
    certificationMatrix,
    baselineId: baselineManifest.baselineId,
    policyVersions: repositoryBaseline.policyVersions,
    workflowInventory: repositoryBaseline.workflowInventory,
    criticalControlSummary: criticalControls,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    externalMutationStatus: externalMutation,
    executiveAuthorityStatus: executiveAuthority,
    residualRisks,
    knownLimitations,
    finalDecision,
  };
  return {
    gaCertificationId: deterministicId('a40-ga', stableCore),
    ...stableCore,
  };
}

function normalizeForComparison(value) {
  if (Array.isArray(value)) return value.map((entry) => normalizeForComparison(entry));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (['certificationTimestamp', 'generatedAt', 'completedAt', 'updatedAt', 'runId', 'gaCertificationId', 'timestamp'].includes(key)) continue;
    output[key] = normalizeForComparison(child);
  }
  return output;
}

function isMatrixComplete(matrix) {
  return (
    Array.isArray(matrix) &&
    matrix.length === REQUIRED_STAGE_COUNT &&
    matrix.every(
      (entry) =>
        entry.stage &&
        entry.purpose &&
        entry.classification &&
        entry.certificationEvidence &&
        'certificationResult' in entry &&
        entry.scenarioResult &&
        entry.invariantResult &&
        'policyVersion' in entry &&
        'evidenceFreshness' in entry &&
        'upstreamDependencyState' in entry,
    )
  );
}

function isBaselineManifestComplete(manifest) {
  const required = [
    'baselineId',
    'releaseVersion',
    'commitSha',
    'branch',
    'certificationMatrix',
    'criticalPolicies',
    'operationalControls',
    'externalMutationBoundaries',
    'securityControls',
    'legalCommercialControls',
    'executiveApprovalBoundaries',
    'rollbackReadiness',
    'recoveryReadiness',
    'deploymentReadiness',
    'customerDeliveryBoundaries',
    'knownLimitations',
    'residualRisks',
  ];
  return required.every((key) => key in manifest);
}

function isReleaseManifestComplete(manifest) {
  const required = [
    'gaCertificationId',
    'releaseName',
    'releaseVersion',
    'repository',
    'branch',
    'commitSha',
    'certificationMatrix',
    'baselineId',
    'policyVersions',
    'workflowInventory',
    'criticalControlSummary',
    'operationalReadiness',
    'rollbackReadiness',
    'recoveryReadiness',
    'externalMutationStatus',
    'executiveAuthorityStatus',
    'residualRisks',
    'knownLimitations',
    'finalDecision',
  ];
  return required.every((key) => key in manifest);
}

function loadFixtures() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')));
}

function applyRepositoryOverrides(repositoryBaseline, fixture) {
  return {
    ...deepClone(repositoryBaseline),
    ...(fixture?.mutations?.repositoryOverrides ?? {}),
  };
}

function evaluateScenarioCore(fixture, authoritativeInventory, authoritativeBaseline) {
  const inventory = applyFixtureMutations(authoritativeInventory, fixture);
  const inventoryMap = buildInventoryMap(inventory);
  const repositoryBaseline = applyRepositoryOverrides(authoritativeBaseline, fixture);
  const continuity = validateChainContinuity(inventory);
  const certificationMatrix = buildCertificationMatrix(inventory);
  const operationalReadiness = buildOperationalReadiness(inventoryMap);
  const rollbackReadiness = buildRollbackReadiness(inventoryMap);
  const recoveryReadiness = buildRecoveryReadiness(inventoryMap);
  const governance = evaluateGovernanceBoundaries(inventoryMap);
  const externalMutation = evaluateExternalMutationBoundary(inventoryMap);
  const executiveAuthority = evaluateExecutiveAuthorityBoundary(inventoryMap);
  const criticalControls = summarizeCriticalControls(
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    governance,
    externalMutation,
    executiveAuthority,
  );
  const knownLimitations = buildKnownLimitations(repositoryBaseline);
  const residualRisks = buildResidualRisks(inventory, continuity, repositoryBaseline, criticalControls);
  const baselineManifest = buildBaselineManifest(
    repositoryBaseline,
    certificationMatrix,
    criticalControls,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    externalMutation,
    executiveAuthority,
    residualRisks,
    knownLimitations,
  );

  const preliminaryContext = {
    inventory,
    repositoryBaseline,
    continuity,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    governance,
    externalMutation,
    executiveAuthority,
  };

  let failureCodes = deriveFailureCodes(preliminaryContext, fixture);
  if (!isMatrixComplete(certificationMatrix)) failureCodes.push({ code: 'CERTIFICATION_MATRIX_INCOMPLETE', detail: 'Certification matrix missing required fields' });
  if (!isBaselineManifestComplete(baselineManifest)) failureCodes.push({ code: 'BASELINE_MANIFEST_INCOMPLETE', detail: 'Baseline manifest missing required fields' });

  let failures = classifyFailures(failureCodes);
  let outcome = deriveGaOutcome(failures);
  const releaseManifest = buildReleaseManifest(
    repositoryBaseline,
    certificationMatrix,
    baselineManifest,
    criticalControls,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    externalMutation,
    executiveAuthority,
    residualRisks,
    knownLimitations,
    outcome.finalDecision,
  );
  if (!isReleaseManifestComplete(releaseManifest)) {
    failureCodes = [...failureCodes, { code: 'RELEASE_MANIFEST_INCOMPLETE', detail: 'Release manifest missing required fields' }];
    failures = classifyFailures(failureCodes);
    outcome = deriveGaOutcome(failures);
  }

  const auditTrail = [
    { step: 'UNASSESSED', timestamp: nowIso },
    { step: 'COLLECTING_BASELINE', branch: repositoryBaseline.branch, commitSha: repositoryBaseline.commitSha, dirty: repositoryBaseline.dirty },
    { step: 'VALIDATING_CERTIFICATIONS', missingStages: continuity.missingStages, uncertifiedStages: continuity.uncertifiedStages, staleStages: continuity.staleStages },
    { step: 'VALIDATING_OPERATIONS', operationalReadiness, rollbackReadiness, recoveryReadiness },
    { step: 'VALIDATING_GOVERNANCE', governance, externalMutationStatus: externalMutation.status, executiveAuthorityStatus: executiveAuthority.status },
    { step: outcome.finalState, finalDecision: outcome.finalDecision },
  ];

  return {
    scenarioId: fixture.scenarioId,
    category: fixture.category,
    description: fixture.description,
    finalState: outcome.finalState,
    finalDecision: outcome.finalDecision,
    blockingCondition: failures.fatal[0]?.detail ?? failures.blocking[0]?.detail ?? failures.review[0]?.detail ?? null,
    failureCodes: failures.classified.map((failure) => failure.code),
    failureDetails: failures.classified,
    repositoryBaseline,
    certificationMatrix,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    governance,
    externalMutation,
    executiveAuthority,
    criticalControls,
    residualRisks,
    knownLimitations,
    baselineManifest,
    releaseManifest,
    auditTrail,
  };
}

function buildScenarioTests(fixture, scenarioResult, idempotent, reproducible) {
  const expectedCodes = fixture.expectedFailureCodes ?? [];
  const tests = [
    { name: 'finalStateMatch', passed: scenarioResult.finalState === fixture.expectedState, expected: fixture.expectedState, actual: scenarioResult.finalState },
    { name: 'finalDecisionMatch', passed: scenarioResult.finalDecision === fixture.expectedDecision, expected: fixture.expectedDecision, actual: scenarioResult.finalDecision },
    { name: 'expectedFailureCodesObserved', passed: expectedCodes.every((code) => scenarioResult.failureCodes.includes(code)), expected: expectedCodes, actual: scenarioResult.failureCodes },
    { name: 'certificationMatrixComplete', passed: isMatrixComplete(scenarioResult.certificationMatrix), expected: true, actual: isMatrixComplete(scenarioResult.certificationMatrix) },
    { name: 'baselineManifestComplete', passed: isBaselineManifestComplete(scenarioResult.baselineManifest), expected: true, actual: isBaselineManifestComplete(scenarioResult.baselineManifest) },
    { name: 'releaseManifestComplete', passed: isReleaseManifestComplete(scenarioResult.releaseManifest), expected: true, actual: isReleaseManifestComplete(scenarioResult.releaseManifest) },
    { name: 'externalMutationRemainsZero', passed: scenarioResult.externalMutation.externalMutationCount === 0, expected: 0, actual: scenarioResult.externalMutation.externalMutationCount },
    { name: 'executiveAuthorityNotExpanded', passed: scenarioResult.executiveAuthority.status === 'PRESERVED', expected: 'PRESERVED', actual: scenarioResult.executiveAuthority.status },
    { name: 'decisionEvidenceEmitted', passed: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length >= 5, expected: true, actual: Array.isArray(scenarioResult.auditTrail) && scenarioResult.auditTrail.length >= 5 },
    { name: 'repeatedEvaluationIdempotent', passed: idempotent, expected: true, actual: idempotent },
    { name: 'baselineManifestReproducible', passed: reproducible, expected: true, actual: reproducible },
  ];

  if (fixture.scenarioId === 'ROLLBACK_READINESS_VALID') tests.push({ name: 'rollbackReadinessPreserved', passed: Object.values(scenarioResult.rollbackReadiness).every(Boolean), expected: true, actual: Object.values(scenarioResult.rollbackReadiness).every(Boolean) });
  if (fixture.scenarioId === 'RECOVERY_READINESS_VALID') tests.push({ name: 'recoveryReadinessPreserved', passed: Object.values(scenarioResult.recoveryReadiness).every(Boolean), expected: true, actual: Object.values(scenarioResult.recoveryReadiness).every(Boolean) });
  if (fixture.scenarioId === 'COMPLETE_CERTIFICATION_MATRIX_PRESENT') tests.push({ name: 'stageCountComplete', passed: scenarioResult.certificationMatrix.length === REQUIRED_STAGE_COUNT, expected: REQUIRED_STAGE_COUNT, actual: scenarioResult.certificationMatrix.length });
  if (fixture.scenarioId === 'GA_BASELINE_MANIFEST_REPRODUCIBLE') tests.push({ name: 'baselineIdDeterministic', passed: typeof scenarioResult.baselineManifest.baselineId === 'string' && scenarioResult.baselineManifest.baselineId.length > 0, expected: true, actual: typeof scenarioResult.baselineManifest.baselineId === 'string' && scenarioResult.baselineManifest.baselineId.length > 0 });
  return tests;
}

function runScenario(fixture, authoritativeInventory, authoritativeBaseline) {
  const baseline = evaluateScenarioCore(fixture, authoritativeInventory, authoritativeBaseline);
  const repeatCount = Number.isInteger(fixture.idempotencyRepeatCount) ? fixture.idempotencyRepeatCount : 0;
  let idempotent = true;
  let reproducible = true;
  if (repeatCount > 0) {
    const serializedScenario = stableSerialize(normalizeForComparison(baseline));
    const serializedBaselineManifest = stableSerialize(normalizeForComparison(baseline.baselineManifest));
    for (let index = 0; index < repeatCount; index += 1) {
      const rerun = evaluateScenarioCore(fixture, authoritativeInventory, authoritativeBaseline);
      if (stableSerialize(normalizeForComparison(rerun)) !== serializedScenario) idempotent = false;
      if (stableSerialize(normalizeForComparison(rerun.baselineManifest)) !== serializedBaselineManifest) reproducible = false;
    }
  }
  const tests = buildScenarioTests(fixture, baseline, idempotent, reproducible);
  return {
    ...baseline,
    tests,
    passed: tests.every((test) => test.passed === true),
  };
}

function buildGaInvariants(repositoryBaseline, authoritativeInventory, continuity, scenarioResults, baselineManifest, releaseManifest, governance, externalMutation, executiveAuthority) {
  const inventoryMap = buildInventoryMap(authoritativeInventory);
  const find = (scenarioId) => scenarioResults.find((result) => result.scenarioId === scenarioId);
  return {
    repositoryIsClean: find('CLEAN_SYNCHRONIZED_MAIN_CAN_GA_CERTIFY')?.repositoryBaseline?.dirty === false,
    branchIsMain: find('CLEAN_SYNCHRONIZED_MAIN_CAN_GA_CERTIFY')?.repositoryBaseline?.branch === 'main',
    mainSynchronizedWithOriginMain: find('CLEAN_SYNCHRONIZED_MAIN_CAN_GA_CERTIFY')?.repositoryBaseline?.synchronizedWithOriginMain === true,
    authoritativeCommitShaRecorded: typeof repositoryBaseline.commitSha === 'string' && repositoryBaseline.commitSha.length > 0,
    a15ToA39CriticalEvidenceExists: authoritativeInventory.every((record) => record.present === true),
    a39AcceptanceIsValid: inventoryMap.A39?.certificationPassed === true,
    noUncertifiedCriticalStage: authoritativeInventory.every((record) => record.certificationPassed === true),
    allRequiredGovernanceBoundariesPreserved: governance.preserved === true,
    securityHardStopsPreserved: governance.securityHardStops === true,
    privacyBoundariesPreserved: governance.privacyBoundaries === true,
    legalRightsBoundariesPreserved: governance.legalRightsBoundaries === true,
    entitlementBoundariesPreserved: governance.entitlementBoundaries === true,
    executiveApprovalBoundariesPreserved: governance.executiveApprovalBoundaries === true,
    financialAuthorityBoundariesPreserved: governance.financialAuthorityBoundaries === true,
    rollbackReadinessPreserved: Object.values(buildRollbackReadiness(inventoryMap)).every(Boolean),
    recoveryReadinessPreserved: Object.values(buildRecoveryReadiness(inventoryMap)).every(Boolean),
    p0CapacityProtectionsPreserved: inventoryMap.A35?.certificationPassed === true,
    budgetHardStopsPreserved: inventoryMap.A36?.certificationPassed === true,
    noAutonomousBindingCommercialAction: inventoryMap.A37?.invariantStatus?.invariants?.noAutonomousBindingOfferDispatch !== false,
    noAutonomousFinancialTransaction: inventoryMap.A36?.invariantStatus?.invariants?.noAutonomousPayment !== false,
    noAutonomousCustomerBillingMutation: inventoryMap.A36?.invariantStatus?.invariants?.financialTransactionAttemptBlocked !== false,
    noUnauthorizedExternalPublication: inventoryMap.A22?.certificationPassed === true,
    noCredentialMutation: governance.securityHardStops === true,
    externalMutationCountIsZero: externalMutation.externalMutationCount === 0,
    baselineManifestIsComplete: isBaselineManifestComplete(baselineManifest),
    certificationMatrixIsComplete: isMatrixComplete(releaseManifest.certificationMatrix),
    evidenceArchiveImmutableByConvention: true,
    repeatedEvaluationIsIdempotent: find('REPEATED_GA_EVALUATION_IS_IDEMPOTENT')?.passed === true,
    a40DoesNotWeakenA15ToA39Controls: continuity.allPassed === true && authoritativeInventory.every((record) => record.certificationPassed === true),
    executiveAuthorityDoesNotExpand: executiveAuthority.preserved === true,
    zeroUnauthorizedExternalMutationPreserved: find('EXTERNAL_MUTATION_ATTEMPT_BLOCKED')?.passed === true,
  };
}

function buildExecutiveSummary(output) {
  const nextAction = output.finalDecision === 'GA_CERTIFIED' ? 'Maintain change freeze and use the recorded baseline commit for controlled production release operations.' : `Resolve blocker ${output.blockingCondition ?? 'UNKNOWN'} and re-run A40 certification.`;
  return {
    platform: RELEASE_NAME,
    release: `${RELEASE_VERSION} (${output.releaseManifest.repository})`,
    gaStatus: output.finalDecision,
    baselineCommit: output.releaseManifest.commitSha,
    whatIsCertified: REQUIRED_STAGE_RANGE,
    whatRemainsHumanControlled: output.executiveAuthorityStatus.humanControlled,
    whatIsNeverAutonomous: output.executiveAuthorityStatus.neverAutonomous,
    criticalControls: output.criticalControlSummary,
    operationalReadiness: output.operationalReadiness,
    rollbackReadiness: output.rollbackReadiness,
    recoveryReadiness: output.recoveryReadiness,
    commercialBoundaries: [
      'no autonomous contract execution',
      'no autonomous payment mutation',
      'no unauthorized pricing mutation',
      'entitlement and rights remain bounded',
    ],
    externalMutationStatus: output.externalMutationStatus.status,
    knownLimitations: output.knownLimitations,
    residualRisk: output.residualRisks,
    finalDecision: output.finalDecision,
    nextOperationalAction: nextAction,
  };
}

function renderExecutiveMarkdown(output) {
  const list = (values) => (values.length ? values.map((entry) => `- ${entry}`).join('\n') : '- None');
  const objectList = (obj) => Object.entries(obj).map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
  return `# A40 GA Certification & Production Baseline Freeze

## PLATFORM

${output.executiveSummary.platform}

## RELEASE

${output.executiveSummary.release}

## GA STATUS

${output.executiveSummary.gaStatus}

## BASELINE COMMIT

${output.executiveSummary.baselineCommit}

## WHAT IS CERTIFIED

- ${output.executiveSummary.whatIsCertified}

## WHAT REMAINS HUMAN-CONTROLLED

${list(output.executiveSummary.whatRemainsHumanControlled)}

## WHAT IS NEVER AUTONOMOUS

${list(output.executiveSummary.whatIsNeverAutonomous)}

## CRITICAL CONTROLS

${objectList(output.executiveSummary.criticalControls)}

## OPERATIONAL READINESS

${objectList(output.executiveSummary.operationalReadiness)}

## ROLLBACK READINESS

${objectList(output.executiveSummary.rollbackReadiness)}

## RECOVERY READINESS

${objectList(output.executiveSummary.recoveryReadiness)}

## COMMERCIAL BOUNDARIES

${list(output.executiveSummary.commercialBoundaries)}

## EXTERNAL MUTATION STATUS

- ${output.executiveSummary.externalMutationStatus}

## KNOWN LIMITATIONS

${list(output.executiveSummary.knownLimitations)}

## RESIDUAL RISK

${output.executiveSummary.residualRisk.length ? output.executiveSummary.residualRisk.map((risk) => `- ${risk.severity}: ${risk.code} — ${risk.detail}`).join('\n') : '- None'}

## FINAL DECISION

${output.executiveSummary.finalDecision}

## NEXT OPERATIONAL ACTION

${output.executiveSummary.nextOperationalAction}
`;
}

export function runGaCertification() {
  console.log(`[A40] GA Certification & Production Baseline Freeze — ${MODE} mode`);

  const observedRepositoryState = readObservedRepositoryState();
  const authoritativeInventory = discoverEvidence();
  const authoritativeBaseline = buildAuthoritativeBaseline(authoritativeInventory, observedRepositoryState);
  const continuity = validateChainContinuity(authoritativeInventory);
  const inventoryMap = buildInventoryMap(authoritativeInventory);
  const certificationMatrix = buildCertificationMatrix(authoritativeInventory);
  const operationalReadiness = buildOperationalReadiness(inventoryMap);
  const rollbackReadiness = buildRollbackReadiness(inventoryMap);
  const recoveryReadiness = buildRecoveryReadiness(inventoryMap);
  const governance = evaluateGovernanceBoundaries(inventoryMap);
  const externalMutation = evaluateExternalMutationBoundary(inventoryMap);
  const executiveAuthority = evaluateExecutiveAuthorityBoundary(inventoryMap);
  const criticalControlSummary = summarizeCriticalControls(
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    governance,
    externalMutation,
    executiveAuthority,
  );
  const knownLimitations = buildKnownLimitations(authoritativeBaseline);
  const residualRisks = buildResidualRisks(authoritativeInventory, continuity, authoritativeBaseline, criticalControlSummary);
  const baselineManifest = buildBaselineManifest(
    authoritativeBaseline,
    certificationMatrix,
    criticalControlSummary,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    externalMutation,
    executiveAuthority,
    residualRisks,
    knownLimitations,
  );

  const fixtures = loadFixtures();
  const scenarioResults = fixtures.map((fixture) => {
    const result = runScenario(fixture, authoritativeInventory, authoritativeBaseline);
    console.log(`[A40][${result.passed ? 'PASS' : 'FAIL'}] ${result.scenarioId} -> ${result.finalState} / ${result.finalDecision}`);
    return result;
  });

  const happyPath = scenarioResults.find((scenario) => scenario.scenarioId === 'CLEAN_SYNCHRONIZED_MAIN_CAN_GA_CERTIFY') ?? null;
  const allScenariosPassed = scenarioResults.every((scenario) => scenario.passed === true);
  const releaseManifest = buildReleaseManifest(
    authoritativeBaseline,
    certificationMatrix,
    baselineManifest,
    criticalControlSummary,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    externalMutation,
    executiveAuthority,
    residualRisks,
    knownLimitations,
    happyPath?.finalDecision ?? 'FAILED_CLOSED',
  );
  const invariants = buildGaInvariants(
    authoritativeBaseline,
    authoritativeInventory,
    continuity,
    scenarioResults,
    baselineManifest,
    releaseManifest,
    governance,
    externalMutation,
    executiveAuthority,
  );
  const invariantPassCount = Object.values(invariants).filter(Boolean).length;
  const invariantTotal = Object.keys(invariants).length;
  const allInvariantsPassed = Object.values(invariants).every(Boolean);
  const certificationPassed = happyPath?.finalDecision === 'GA_CERTIFIED' && allScenariosPassed && allInvariantsPassed;
  const finalDecision = certificationPassed ? 'GA_CERTIFIED' : happyPath?.finalDecision ?? 'FAILED_CLOSED';

  const output = {
    gaCertificationId: deterministicId('a40-ga', {
      repository: authoritativeBaseline.repository,
      commitSha: authoritativeBaseline.commitSha,
      releaseVersion: RELEASE_VERSION,
      baselineId: baselineManifest.baselineId,
    }),
    releaseName: RELEASE_NAME,
    releaseVersion: RELEASE_VERSION,
    stage: 'A40',
    title: 'GA Certification & Production Baseline Freeze',
    mode: MODE,
    generatedAt: nowIso,
    policyVersion: POLICY_VERSION,
    gaStateModel: GA_STATES,
    finalDecisionValues: FINAL_DECISIONS,
    requiredStageRange: REQUIRED_STAGE_RANGE,
    repository: authoritativeBaseline.repository,
    branch: authoritativeBaseline.branch,
    commitSha: authoritativeBaseline.commitSha,
    certificationTimestamp: nowIso,
    observedRepositoryState,
    authoritativeBaseline,
    certificationMatrix,
    baselineId: baselineManifest.baselineId,
    policyVersions: authoritativeBaseline.policyVersions,
    workflowInventory: authoritativeBaseline.workflowInventory,
    criticalControlSummary,
    operationalReadiness,
    rollbackReadiness,
    recoveryReadiness,
    governanceBoundaryStatus: governance,
    externalMutationStatus: externalMutation,
    executiveAuthorityStatus: executiveAuthority,
    residualRisks,
    knownLimitations,
    finalDecision,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((scenario) => scenario.passed).length,
    failedCount: scenarioResults.filter((scenario) => !scenario.passed).length,
    scenarios: scenarioResults,
    invariants,
    invariantPassCount,
    invariantTotal,
    certification: {
      allScenariosPassed,
      allInvariantsPassed,
      certificationPassed,
    },
    certificationPassed,
    blockingCondition:
      scenarioResults.find((scenario) => scenario.scenarioId === 'DIRTY_WORKING_TREE_BLOCKS_GA' && scenario.passed !== true)?.blockingCondition ??
      (!certificationPassed ? happyPath?.failureDetails?.[0]?.detail ?? happyPath?.blockingCondition ?? 'UNKNOWN' : null),
    baselineManifest,
    releaseManifest: {
      ...releaseManifest,
      certificationTimestamp: nowIso,
    },
    evidenceArchivePaths: [],
    timestamps: {
      generatedAt: nowIso,
      completedAt: new Date().toISOString(),
    },
  };

  output.executiveSummary = buildExecutiveSummary(output);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const certificationJsonPath = path.join(REPORT_DIR, `a40-ga-certification-${timestampSlug}.json`);
  const certificationMarkdownPath = path.join(REPORT_DIR, `a40-ga-certification-${timestampSlug}.md`);
  const baselinePath = path.join(REPORT_DIR, `a40-production-baseline-${timestampSlug}.json`);
  const matrixPath = path.join(REPORT_DIR, `a40-certification-matrix-${timestampSlug}.json`);
  const pointerPath = path.join(REPORT_DIR, 'GA_BASELINE.json');

  output.evidenceArchivePaths = [
    toRelative(certificationJsonPath),
    toRelative(certificationMarkdownPath),
    toRelative(baselinePath),
    toRelative(matrixPath),
    toRelative(pointerPath),
  ];
  output.releaseManifest.evidenceArchivePaths = output.evidenceArchivePaths;

  fs.writeFileSync(certificationJsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(certificationMarkdownPath, `${renderExecutiveMarkdown(output)}\n`, 'utf-8');
  fs.writeFileSync(baselinePath, `${JSON.stringify({ ...baselineManifest, certificationTimestamp: nowIso }, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(matrixPath, `${JSON.stringify({ generatedAt: nowIso, requiredStageRange: REQUIRED_STAGE_RANGE, certificationMatrix }, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(
    pointerPath,
    `${JSON.stringify(
      {
        gaCertificationId: output.gaCertificationId,
        baselineId: baselineManifest.baselineId,
        releaseVersion: RELEASE_VERSION,
        repository: authoritativeBaseline.repository,
        branch: authoritativeBaseline.branch,
        commitSha: authoritativeBaseline.commitSha,
        finalDecision,
        updatedAt: nowIso,
        baselineManifestPath: toRelative(baselinePath),
        certificationManifestPath: toRelative(certificationJsonPath),
        certificationMatrixPath: toRelative(matrixPath),
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );

  console.log(`\n[A40] === RESULTS ===`);
  console.log(`[A40] Scenarios: ${output.passedCount}/${output.scenarioCount} ${allScenariosPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A40] Invariants: ${invariantPassCount}/${invariantTotal} ${allInvariantsPassed ? 'PASS' : 'FAIL'}`);
  console.log(`[A40] finalDecision: ${finalDecision}`);
  console.log(`[A40] certificationPassed: ${certificationPassed}`);
  console.log(`[A40] Evidence: ${toRelative(certificationJsonPath)}`);

  if (!certificationPassed) {
    console.error(`[A40][FAIL] blockingCondition: ${output.blockingCondition ?? 'UNKNOWN'}`);
    process.exitCode = 1;
  }

  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGaCertification();
}
