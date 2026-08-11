import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-source-qualification-policy.json');
const DEFAULT_QUEUE = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-latest.json');
const DEFAULT_POC = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-qualification-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesPhrase(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_POLICY_JSON, DEFAULT_POLICY);
const queue = readJsonInput(process.env.KIDULTS_SCARCITY_TARGET_QUEUE_JSON, DEFAULT_QUEUE);
const poc = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_POC_JSON, DEFAULT_POC);
const outputRaw = process.env.KIDULTS_SCARCITY_SOURCE_QUALIFICATION_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_SOURCE_QUALIFICATION_MATRIX') throw new Error('Invalid scarcity source qualification policy');
if (policy?.primitive !== 'SCARCITY' || policy?.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Scarcity source qualification must require TOTAL_PRODUCED');
for (const field of ['automaticSourceQualificationAllowed', 'existingReferenceSourceWithoutEligibleQuantityCountsAsQualified']) {
  if (policy?.sourceQualification?.[field] !== false) throw new Error(`Unsafe source qualification policy: ${field}`);
}
for (const field of ['syntheticAllowed', 'estimatedAllowed', 'inferredScarcityAllowed', 'listingOrMarketingLanguageAcceptedAsQuantity', 'unauthorizedScrapingAllowed', 'paidProviderProcurementAllowed', 'contractExecutionAllowed', 'automaticProductionScoringActivationAllowed']) {
  if (policy?.safety?.[field] !== false) throw new Error(`Unsafe scarcity source policy: ${field}`);
}
if (queue?.mode !== 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE' || Number(queue?.metrics?.targetShortfall || 0) !== 0) throw new Error('Unsafe or incomplete scarcity target queue');

const pocByKey = new Map((poc?.candidates || []).map((candidate) => [candidate?.candidateKey, candidate]));
const verticalSignals = policy?.verticalSignals || {};
const verticals = Object.keys(verticalSignals);
if (verticals.length !== 8) throw new Error(`Expected 8 vertical signal contracts; got ${verticals.length}`);

function scopeState(target, candidate) {
  const rules = verticalSignals[target.vertical];
  if (!rules) return { status: 'STRUCTURAL_ERROR_UNKNOWN_VERTICAL', positiveHits: [], hardBlockHits: [] };
  const text = `${target.canonicalTitle || ''} ${candidate?.description || ''} ${candidate?.creator || ''}`;
  const positiveHits = (rules.positive || []).filter((phrase) => includesPhrase(text, phrase));
  const hardBlockHits = (rules.hardBlock || []).filter((phrase) => includesPhrase(text, phrase));
  if (hardBlockHits.length > 0) return { status: 'OUT_OF_SCOPE_CLEAR_MISMATCH', positiveHits, hardBlockHits };
  if (positiveHits.length > 0) return { status: 'TARGET_SCOPE_READY', positiveHits, hardBlockHits };
  return { status: 'ENTITY_SCOPE_REVIEW_REQUIRED', positiveHits, hardBlockHits };
}

const matrix = [];
const byStatus = {};
const byVertical = Object.fromEntries(verticals.map((vertical) => [vertical, { targets: 0, scopeReady: 0, reviewRequired: 0, clearMismatch: 0 }]));
let structuralErrors = 0;

for (const target of queue.targets || []) {
  const candidate = pocByKey.get(target.candidateKey);
  if (!candidate) structuralErrors += 1;
  const scope = scopeState(target, candidate);
  if (scope.status.startsWith('STRUCTURAL_ERROR_')) structuralErrors += 1;

  const sourceEvidenceStatus = target.acquisitionStatus === 'RIGHTS_QUALIFIED_EXPLICIT_QUANTITY_REQUIRED'
    ? 'NO_ELIGIBLE_TOTAL_PRODUCED_IN_CURRENT_RIGHT_DATA'
    : 'STRUCTURAL_ERROR_UNKNOWN_ACQUISITION_STATUS';
  if (sourceEvidenceStatus.startsWith('STRUCTURAL_ERROR_')) structuralErrors += 1;

  const qualificationStatus = scope.status === 'TARGET_SCOPE_READY'
    ? 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED'
    : scope.status;
  byStatus[qualificationStatus] = (byStatus[qualificationStatus] || 0) + 1;
  const verticalMetric = byVertical[target.vertical];
  if (verticalMetric) {
    verticalMetric.targets += 1;
    if (scope.status === 'TARGET_SCOPE_READY') verticalMetric.scopeReady += 1;
    if (scope.status === 'ENTITY_SCOPE_REVIEW_REQUIRED') verticalMetric.reviewRequired += 1;
    if (scope.status === 'OUT_OF_SCOPE_CLEAR_MISMATCH') verticalMetric.clearMismatch += 1;
  }

  matrix.push({
    candidateKey: target.candidateKey,
    canonicalTitle: target.canonicalTitle || null,
    vertical: target.vertical,
    currentReferenceSource: target.source || null,
    currentReferenceSourceClass: target.sourceClass || null,
    currentReferenceRightsClass: target.rightsClass || null,
    currentReferenceSourceUrl: target.sourceUrl || null,
    description: candidate?.description || null,
    scopeStatus: scope.status,
    scopePositiveHits: scope.positiveHits,
    scopeHardBlockHits: scope.hardBlockHits,
    sourceEvidenceStatus,
    requiredSignalType: 'TOTAL_PRODUCED',
    qualificationStatus,
    qualifiedScarcitySource: false,
    nextAction: qualificationStatus === 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED'
      ? 'DISCOVER_OFFICIAL_OR_OPEN_RIGHTS_EXPLICIT_QUANTITY_SOURCE'
      : qualificationStatus === 'OUT_OF_SCOPE_CLEAR_MISMATCH'
        ? 'REMOVE_FROM_SCARCITY_ACQUISITION_CANDIDATE_POOL'
        : 'KEEP_BLOCKED_PENDING_ENTITY_SCOPE_EVIDENCE',
  });
}

const scopeReadyTargets = matrix.filter((row) => row.scopeStatus === 'TARGET_SCOPE_READY').length;
const reviewRequiredTargets = matrix.filter((row) => row.scopeStatus === 'ENTITY_SCOPE_REVIEW_REQUIRED').length;
const clearMismatchTargets = matrix.filter((row) => row.scopeStatus === 'OUT_OF_SCOPE_CLEAR_MISMATCH').length;
const disposition = structuralErrors > 0
  ? 'FAIL_CLOSED_STRUCTURAL_ERRORS'
  : clearMismatchTargets > 0
    ? 'TARGET_SCOPE_CONTAMINATION_REQUIRES_QUEUE_HARDENING'
    : scopeReadyTargets > 0
      ? 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED'
      : 'NO_SCOPE_READY_SCARCITY_TARGETS';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    targetCandidates: matrix.length,
    scopeReadyTargets,
    reviewRequiredTargets,
    clearMismatchTargets,
    automaticallyQualifiedSources: 0,
    structuralErrors,
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
  },
  disposition,
  matrix,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity source qualification: targets=${matrix.length} ready=${scopeReadyTargets} review=${reviewRequiredTargets} mismatch=${clearMismatchTargets} qualified=0 errors=${structuralErrors}`);
console.log(`disposition=${disposition}`);
if (structuralErrors > 0) process.exitCode = 1;
