import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_QUEUE = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-latest.json');
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-source-qualification-policy.json');
const DEFAULT_POC = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-hardened-latest.json');

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

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function provenanceComplete(record) {
  return /^https:\/\//.test(String(record?.sourceUrl || ''))
    && nonEmpty(record?.payloadHash)
    && Number.isFinite(Date.parse(record?.observedAt || ''));
}

function safeEvidence(record) {
  return record?.safety?.synthetic !== true && record?.safety?.estimated !== true;
}

function evidenceRows(candidate, primitive) {
  return (candidate?.rightData?.evidence || []).filter((row) => row?.primitive === primitive);
}

function eligibleScarcity(candidate) {
  return evidenceRows(candidate, 'SCARCITY').some((row) => row?.value?.signalType === 'TOTAL_PRODUCED'
    && nonEmpty(row?.rightsClass) && provenanceComplete(row) && safeEvidence(row));
}

function supportingState(candidate) {
  const eligible = (primitive) => evidenceRows(candidate, primitive).some((row) => nonEmpty(row?.value?.signalType)
    && nonEmpty(row?.rightsClass) && provenanceComplete(row) && safeEvidence(row));
  const demand = eligible('DEMAND_ATTENTION');
  const canon = eligible('CANON_CULTURAL_STRENGTH');
  return { demand, canon, supportCount: Number(demand) + Number(canon) };
}

const queue = readJsonInput(process.env.KIDULTS_SCARCITY_HARDEN_QUEUE_JSON, DEFAULT_QUEUE);
const policy = readJsonInput(process.env.KIDULTS_SCARCITY_HARDEN_POLICY_JSON, DEFAULT_POLICY);
const poc = readJsonInput(process.env.KIDULTS_SCARCITY_HARDEN_POC_JSON, DEFAULT_POC);
const rightData = readJsonInput(process.env.KIDULTS_SCARCITY_HARDEN_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const outputRaw = process.env.KIDULTS_SCARCITY_HARDEN_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (queue?.mode !== 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE' || Number(queue?.metrics?.targetShortfall || 0) !== 0) {
  throw new Error('Unsafe or incomplete scarcity target queue');
}
if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_SOURCE_QUALIFICATION_MATRIX'
  || policy?.primitive !== 'SCARCITY'
  || policy?.requiredSignalType !== 'TOTAL_PRODUCED') {
  throw new Error('Invalid scarcity scope-hardening policy');
}
if (policy?.scope?.clearNonTargetEntitiesAutomaticallyQualified !== false
  || policy?.scope?.ambiguousTargetsAutomaticallyQualified !== false) {
  throw new Error('Unsafe scarcity scope-hardening policy');
}

const verticalSignals = policy.verticalSignals || {};
const verticals = Object.keys(verticalSignals);
if (verticals.length !== 8) throw new Error(`Expected 8 vertical signal contracts; got ${verticals.length}`);

const pocByKey = new Map();
for (const candidate of poc?.candidates || []) {
  if (!candidate?.candidateKey || pocByKey.has(candidate.candidateKey)) throw new Error('Invalid or duplicate POC candidate key');
  pocByKey.set(candidate.candidateKey, candidate);
}

const relevant = (rightData?.candidates || []).filter((candidate) => candidate?.semanticRelevant === true && verticals.includes(candidate?.vertical));
const relevantKeys = new Set();
for (const candidate of relevant) {
  if (!candidate?.candidateKey || relevantKeys.has(candidate.candidateKey)) throw new Error('Invalid or duplicate Right Data candidate key');
  relevantKeys.add(candidate.candidateKey);
}

function scopeState(candidate) {
  const rules = verticalSignals[candidate.vertical];
  const pocCandidate = pocByKey.get(candidate.candidateKey);
  const text = `${candidate.canonicalTitle || ''} ${pocCandidate?.description || candidate.description || ''} ${pocCandidate?.creator || candidate.creator || ''}`;
  const positiveHits = (rules.positive || []).filter((phrase) => includesPhrase(text, phrase));
  const hardBlockHits = (rules.hardBlock || []).filter((phrase) => includesPhrase(text, phrase));
  if (hardBlockHits.length > 0) return { status: 'OUT_OF_SCOPE_CLEAR_MISMATCH', positiveHits, hardBlockHits };
  if (positiveHits.length > 0) return { status: 'TARGET_SCOPE_READY', positiveHits, hardBlockHits };
  return { status: 'ENTITY_SCOPE_REVIEW_REQUIRED', positiveHits, hardBlockHits };
}

const originalByKey = new Map((queue.targets || []).map((target) => [target.candidateKey, target]));
const targets = [];
const byVertical = {};
let clearMismatchExcluded = 0;
let targetShortfall = 0;
let scopeReadySelected = 0;
let reviewRequiredSelected = 0;

for (const vertical of verticals) {
  const desired = Number(queue?.metrics?.byVertical?.[vertical]?.targetGap || 0);
  if (!Number.isInteger(desired) || desired < 0) throw new Error(`Invalid target gap for ${vertical}`);

  const pool = relevant
    .filter((candidate) => candidate.vertical === vertical && !eligibleScarcity(candidate))
    .map((candidate) => {
      const scope = scopeState(candidate);
      const support = supportingState(candidate);
      const original = originalByKey.get(candidate.candidateKey);
      return {
        candidateKey: candidate.candidateKey,
        canonicalTitle: candidate.canonicalTitle || null,
        vertical,
        source: candidate.source || original?.source || null,
        sourceClass: candidate.sourceClass || original?.sourceClass || null,
        sourceUrl: candidate.sourceUrl || original?.sourceUrl || null,
        rightsClass: candidate.rightsClass || original?.rightsClass || null,
        semanticRelevanceScore: Number(candidate.semanticRelevanceScore || original?.semanticRelevanceScore || 0),
        demandEvidenceReady: support.demand,
        canonEvidenceReady: support.canon,
        supportingNonMarketSignals: support.supportCount,
        requiredScarcitySignalType: 'TOTAL_PRODUCED',
        acquisitionStatus: 'RIGHTS_QUALIFIED_EXPLICIT_QUANTITY_REQUIRED',
        normalizedScore: null,
        scopeStatus: scope.status,
        scopePositiveHits: scope.positiveHits,
        scopeHardBlockHits: scope.hardBlockHits,
        wasInOriginalQueue: originalByKey.has(candidate.candidateKey),
      };
    });

  const mismatches = pool.filter((row) => row.scopeStatus === 'OUT_OF_SCOPE_CLEAR_MISMATCH');
  clearMismatchExcluded += mismatches.length;
  const safePool = pool
    .filter((row) => row.scopeStatus !== 'OUT_OF_SCOPE_CLEAR_MISMATCH')
    .sort((a, b) => Number(b.scopeStatus === 'TARGET_SCOPE_READY') - Number(a.scopeStatus === 'TARGET_SCOPE_READY')
      || b.supportingNonMarketSignals - a.supportingNonMarketSignals
      || Number(b.demandEvidenceReady) - Number(a.demandEvidenceReady)
      || b.semanticRelevanceScore - a.semanticRelevanceScore
      || String(a.candidateKey).localeCompare(String(b.candidateKey)));

  const selected = safePool.slice(0, desired);
  const shortfall = Math.max(0, desired - selected.length);
  targetShortfall += shortfall;
  scopeReadySelected += selected.filter((row) => row.scopeStatus === 'TARGET_SCOPE_READY').length;
  reviewRequiredSelected += selected.filter((row) => row.scopeStatus === 'ENTITY_SCOPE_REVIEW_REQUIRED').length;
  targets.push(...selected.map((row, index) => ({ ...row, verticalPriority: index + 1 })));

  byVertical[vertical] = {
    targetGap: desired,
    candidatePool: pool.length,
    clearMismatchExcluded: mismatches.length,
    scopeReadyAvailable: safePool.filter((row) => row.scopeStatus === 'TARGET_SCOPE_READY').length,
    reviewRequiredAvailable: safePool.filter((row) => row.scopeStatus === 'ENTITY_SCOPE_REVIEW_REQUIRED').length,
    selectedTargets: selected.length,
    targetShortfall: shortfall,
  };
}

const disposition = targetShortfall > 0
  ? 'FAIL_CLOSED_INSUFFICIENT_SCOPE_SAFE_TARGET_SUPPLY'
  : reviewRequiredSelected > 0
    ? 'QUEUE_HARDENED_REVIEW_TARGETS_RETAINED_BLOCKED'
    : 'QUEUE_HARDENED_SCOPE_READY';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE',
  queueVersion: 'HARDENED_SCOPE_V1',
  generatedAt: new Date().toISOString(),
  policy: queue.policy || null,
  thresholds: queue.thresholds || {},
  metrics: {
    ...(queue.metrics || {}),
    targetCandidates: targets.length,
    targetShortfall,
    clearMismatchExcluded,
    scopeReadySelected,
    reviewRequiredSelected,
    byVertical,
  },
  acquisitionContract: queue.acquisitionContract || {},
  hardeningContract: {
    clearScopeMismatchAllowed: false,
    ambiguousScopeAutomaticallyQualified: false,
    scopeReadyPreferredBeforeReview: true,
    sourceQualificationPerformed: false,
    normalizedScoreGenerated: false,
  },
  targets,
  disposition,
  claims: {
    ...(queue.claims || {}),
    clearScopeMismatchRetained: false,
    ambiguousTargetAutomaticallyQualified: false,
    sourceAutomaticallyQualified: false,
    productionScoringActivated: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity queue hardening: targets=${targets.length} ready=${scopeReadySelected} review=${reviewRequiredSelected} excludedMismatch=${clearMismatchExcluded} shortfall=${targetShortfall}`);
console.log(`disposition=${disposition}`);
if (targetShortfall > 0) process.exitCode = 1;
