import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_QUEUE = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-hardened-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-qualification-latest.json');

function resolvePath(value, fallback) {
  const raw = value == null || String(value).trim() === '' ? fallback : String(value).trim();
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

const queuePath = resolvePath(process.env.KIDULTS_SCARCITY_TARGET_QUEUE_JSON, DEFAULT_QUEUE);
const outPath = resolvePath(process.env.KIDULTS_SCARCITY_SOURCE_QUALIFICATION_OUTPUT, DEFAULT_OUT);
if (!fs.existsSync(queuePath) || !fs.statSync(queuePath).isFile()) throw new Error(`Missing hardened scarcity queue: ${queuePath}`);
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

if (queue?.mode !== 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE' || queue?.queueVersion !== 'HARDENED_SCOPE_V1') {
  throw new Error('Unsafe or non-hardened scarcity queue');
}

const shortfall = Number(queue?.metrics?.targetShortfall || 0);
if (!Number.isFinite(shortfall) || shortfall < 0) throw new Error('Invalid scarcity queue target shortfall');

if (shortfall === 0) {
  const child = spawnSync(process.execPath, ['scripts/kidult100-scarcity-source-qualification.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      KIDULTS_SCARCITY_TARGET_QUEUE_JSON: queuePath,
      KIDULTS_SCARCITY_SOURCE_QUALIFICATION_OUTPUT: outPath,
    },
    encoding: 'utf8',
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  process.exit(child.status ?? 1);
}

const safePartial = queue?.disposition === 'FAIL_CLOSED_INSUFFICIENT_SCOPE_SAFE_TARGET_SUPPLY'
  && queue?.hardeningContract?.clearScopeMismatchAllowed === false
  && queue?.hardeningContract?.ambiguousScopeAutomaticallyQualified === false
  && queue?.hardeningContract?.sourceQualificationPerformed === false
  && queue?.hardeningContract?.normalizedScoreGenerated === false
  && queue?.claims?.clearScopeMismatchRetained === false
  && queue?.claims?.ambiguousTargetAutomaticallyQualified === false
  && queue?.claims?.sourceAutomaticallyQualified === false
  && queue?.claims?.productionScoringActivated === false;
if (!safePartial) throw new Error('Unsafe partial scarcity queue');

const verticals = Object.keys(queue?.metrics?.byVertical || {});
const byVertical = Object.fromEntries(verticals.map((vertical) => [vertical, {
  targets: 0,
  scopeReady: 0,
  reviewRequired: 0,
  clearMismatch: 0,
  targetShortfall: Number(queue.metrics.byVertical[vertical]?.targetShortfall || 0),
}]));
const byStatus = {};
const matrix = [];
let structuralErrors = 0;

for (const target of queue.targets || []) {
  const verticalMetric = byVertical[target?.vertical];
  const scopeStatus = target?.scopeStatus;
  if (!target?.candidateKey || !verticalMetric || !['TARGET_SCOPE_READY', 'ENTITY_SCOPE_REVIEW_REQUIRED'].includes(scopeStatus)) {
    structuralErrors += 1;
    continue;
  }
  const qualificationStatus = scopeStatus === 'TARGET_SCOPE_READY'
    ? 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED'
    : 'ENTITY_SCOPE_REVIEW_REQUIRED';
  verticalMetric.targets += 1;
  if (scopeStatus === 'TARGET_SCOPE_READY') verticalMetric.scopeReady += 1;
  else verticalMetric.reviewRequired += 1;
  byStatus[qualificationStatus] = (byStatus[qualificationStatus] || 0) + 1;
  matrix.push({
    candidateKey: target.candidateKey,
    canonicalTitle: target.canonicalTitle || null,
    vertical: target.vertical,
    currentReferenceSource: target.source || null,
    currentReferenceSourceClass: target.sourceClass || null,
    currentReferenceRightsClass: target.rightsClass || null,
    currentReferenceSourceUrl: target.sourceUrl || null,
    scopeStatus,
    scopePositiveHits: target.scopePositiveHits || [],
    scopeHardBlockHits: [],
    sourceEvidenceStatus: 'NO_ELIGIBLE_TOTAL_PRODUCED_IN_CURRENT_RIGHT_DATA',
    requiredSignalType: 'TOTAL_PRODUCED',
    qualificationStatus,
    qualifiedScarcitySource: false,
    nextAction: scopeStatus === 'TARGET_SCOPE_READY'
      ? 'DISCOVER_OFFICIAL_OR_OPEN_RIGHTS_EXPLICIT_QUANTITY_SOURCE'
      : 'KEEP_BLOCKED_PENDING_ENTITY_SCOPE_EVIDENCE',
  });
}

const scopeReadyTargets = matrix.filter((row) => row.scopeStatus === 'TARGET_SCOPE_READY').length;
const reviewRequiredTargets = matrix.length - scopeReadyTargets;
const report = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
  generatedAt: new Date().toISOString(),
  analysisMode: 'PARTIAL_SCOPE_SAFE_QUEUE_ANALYSIS_ONLY',
  metrics: {
    targetCandidates: matrix.length,
    scopeReadyTargets,
    reviewRequiredTargets,
    clearMismatchTargets: 0,
    automaticallyQualifiedSources: 0,
    structuralErrors,
    queueTargetShortfall: shortfall,
    queueSupplyComplete: false,
    byStatus,
    byVertical,
  },
  sourceContract: {
    requiredPrimitive: 'SCARCITY',
    requiredSignalType: 'TOTAL_PRODUCED',
    explicitQuantityRequired: true,
    commercialReuseRightsRequired: true,
    provenanceRequired: true,
    automatedAccessDocumentationRequired: true,
    currentReferenceSourcePresenceIsNotQualification: true,
  },
  safety: {
    syntheticOrEstimatedEvidenceCreated: false,
    inferredScarcityCreated: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
    productionScoringActivated: false,
    sourceQualificationPerformed: false,
  },
  disposition: structuralErrors > 0
    ? 'FAIL_CLOSED_STRUCTURAL_ERRORS'
    : 'PARTIAL_SCOPE_SAFE_QUEUE_SOURCE_DISCOVERY_ANALYSIS_ONLY',
  matrix,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Scarcity partial source analysis: targets=${matrix.length} ready=${scopeReadyTargets} review=${reviewRequiredTargets} shortfall=${shortfall} qualified=0 errors=${structuralErrors}`);
console.log(`disposition=${report.disposition}`);
if (structuralErrors > 0) process.exitCode = 1;
