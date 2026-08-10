import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-ranking-policy.json'), 'utf8'));
const SOURCE_PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const RIGHT_DATA_PATH = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-ranking');
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(RIGHT_DATA_PATH)) throw new Error(`Missing Right Data report: ${RIGHT_DATA_PATH}`);
const rightDataReport = JSON.parse(fs.readFileSync(RIGHT_DATA_PATH, 'utf8'));
const candidates = (rightDataReport.candidates || []).filter((candidate) => candidate.semanticRelevant);
const gate = POLICY.pocGate;
const weights = POLICY.scoring.weights;
const mapping = POLICY.scoring.evidenceMapping;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0 || number > 1) return null;
  return number;
}

function evidenceFor(candidate, primitive) {
  return (candidate.rightData?.evidence || []).filter((evidence) => evidence.primitive === primitive);
}

function extractEvidenceScore(candidate, dimension) {
  const rule = mapping[dimension];
  if (!rule) return null;
  const records = evidenceFor(candidate, rule.primitive);
  const scored = [];
  for (const record of records) {
    const value = record.value;
    const raw = value && typeof value === 'object' ? value[rule.scoreField] : null;
    const score = clamp01(raw);
    if (score !== null) scored.push(score);
  }
  if (!scored.length) return null;
  return scored.reduce((sum, value) => sum + value, 0) / scored.length;
}

function scoreCandidate(candidate) {
  const dimensions = {};
  let weighted = 0;
  let coveredWeight = 0;
  for (const [dimension, weight] of Object.entries(weights)) {
    const score = extractEvidenceScore(candidate, dimension);
    dimensions[dimension] = score;
    if (score !== null) {
      weighted += score * weight;
      coveredWeight += weight;
    }
  }
  const evidenceWeightCoverage = coveredWeight;
  if (evidenceWeightCoverage < POLICY.scoring.minimumEvidenceWeightCoverage) {
    return { rankable: false, score: null, evidenceWeightCoverage, dimensions };
  }
  return {
    rankable: true,
    score: Number(((weighted / coveredWeight) * 100).toFixed(4)),
    evidenceWeightCoverage,
    dimensions,
  };
}

function whyFor(scored) {
  const labels = {
    MARKET_TRANSACTION_STRENGTH: 'market transaction strength',
    SCARCITY: 'scarcity',
    DEMAND_ATTENTION: 'collector demand attention',
    LIQUIDITY: 'market liquidity',
    CANON_CULTURAL_STRENGTH: 'cultural canon strength',
    MOMENTUM: 'market momentum',
    RISK_CONFIDENCE: 'evidence confidence',
  };
  const strongest = Object.entries(scored.dimensions)
    .filter(([, value]) => value !== null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dimension]) => labels[dimension] || dimension);
  return strongest.length
    ? `Rank supported most strongly by ${strongest.join(', ')}. All displayed dimensions are evidence-backed; missing dimensions are not imputed.`
    : null;
}

const scoredCandidates = candidates.map((candidate) => ({ candidate, scored: scoreCandidate(candidate) }));
const rankable = scoredCandidates
  .filter(({ scored }) => scored.rankable)
  .map(({ candidate, scored }) => ({
    candidateKey: candidate.candidateKey,
    canonicalTitle: candidate.canonicalTitle,
    vertical: candidate.vertical,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    rightsClass: candidate.rightsClass,
    score: scored.score,
    evidenceWeightCoverage: scored.evidenceWeightCoverage,
    dimensions: scored.dimensions,
    rightDataCoverage: candidate.rightData?.requiredCoverage ?? 0,
    marketEvidencePresent: Boolean(candidate.rightData?.marketEvidencePresent),
    why: whyFor(scored),
    finalCertified: false,
  }))
  .sort((a, b) => b.score - a.score || a.candidateKey.localeCompare(b.candidateKey));

const uniqueKeys = new Set(candidates.map((candidate) => candidate.candidateKey));
const acceptedDuplicateContamination = candidates.length ? (candidates.length - uniqueKeys.size) / candidates.length : 0;
const byVertical = Object.fromEntries(SOURCE_PLAN.coreVerticals.map((vertical) => [
  vertical.id,
  candidates.filter((candidate) => candidate.vertical === vertical.id).length,
]));
const coveredVerticals = Object.values(byVertical).filter((count) => count > 0).length;
const provenanceCoverage = candidates.length
  ? candidates.filter((candidate) => candidate.sourceUrl && candidate.observedAt && candidate.payloadHash).length / candidates.length
  : 0;
const rightsClassificationCoverage = candidates.length
  ? candidates.filter((candidate) => Boolean(candidate.rightsClass)).length / candidates.length
  : 0;
const requiredRightDataCoverage = rightDataReport.metrics?.requiredRightDataCoverage || 0;
const marketEvidenceCoverage = rightDataReport.metrics?.marketEvidenceCoverage || 0;

const checks = {
  semanticRelevantCandidates120Plus: candidates.length >= gate.minimumSemanticRelevantCandidates,
  coreVerticalCoverage8of8: coveredVerticals >= gate.requiredCoreVerticalCoverage,
  provenanceCoverage: provenanceCoverage >= gate.minimumProvenanceCoverage,
  rightsClassificationCoverage: rightsClassificationCoverage >= gate.minimumRightsClassificationCoverage,
  acceptedDuplicateContamination: acceptedDuplicateContamination <= gate.maximumAcceptedDuplicateContamination,
  requiredRightDataCoverage: requiredRightDataCoverage >= gate.minimumRequiredRightDataCoverage,
  marketEvidenceCoverage: marketEvidenceCoverage >= gate.minimumMarketEvidenceCoverage,
  rankableCandidates100Plus: rankable.length >= gate.minimumRankableCandidates,
};
const pocPassed = Object.values(checks).every(Boolean);
const top100 = pocPassed ? rankable.slice(0, 100).map((item, index) => ({ ...item, rank: index + 1 })) : [];

const report = {
  schemaVersion: '1.0.0',
  mode: POLICY.mode,
  publicationLabel: POLICY.publicationLabel,
  generatedAt: new Date().toISOString(),
  outcome: pocPassed ? 'PASS' : gate.failureDisposition,
  metrics: {
    semanticRelevantCandidates: candidates.length,
    rankableCandidates: rankable.length,
    top100PublishedCount: top100.length,
    coveredVerticals,
    byVertical,
    provenanceCoverage,
    rightsClassificationCoverage,
    acceptedDuplicateContamination,
    requiredRightDataCoverage,
    marketEvidenceCoverage,
  },
  checks,
  claims: {
    liveExternalEvidenceOnly: true,
    syntheticScoreUsed: false,
    estimatedMarketPriceUsed: false,
    missingEvidenceScoreImputationUsed: false,
    experimentalKidult100Generated: pocPassed,
    finalKidult100Certified: false,
  },
  top100,
  rankableCandidates: rankable,
};

const gap = {
  schemaVersion: '1.0.0',
  generatedAt: report.generatedAt,
  outcome: report.outcome,
  failedChecks: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name),
  semanticRelevantCandidatesNeeded: Math.max(0, gate.minimumSemanticRelevantCandidates - candidates.length),
  rankableCandidatesNeeded: Math.max(0, gate.minimumRankableCandidates - rankable.length),
  rightDataCoverageGap: Math.max(0, gate.minimumRequiredRightDataCoverage - requiredRightDataCoverage),
  marketEvidenceCoverageGap: Math.max(0, gate.minimumMarketEvidenceCoverage - marketEvidenceCoverage),
  note: 'Top 100 is intentionally empty until the experimental live POC gate passes. No synthetic or estimated market evidence is used to fill missing ranks.',
};

fs.writeFileSync(path.join(OUT_DIR, 'kidult100-experimental-latest.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'kidult100-experimental-gap-latest.json'), JSON.stringify(gap, null, 2));
console.log(`Kidult100 experimental POC: ${report.outcome}`);
console.log(`relevant=${candidates.length} rankable=${rankable.length} top100=${top100.length} verticals=${coveredVerticals}/8`);
console.log(`rightData=${requiredRightDataCoverage} marketEvidence=${marketEvidenceCoverage} duplicates=${acceptedDuplicateContamination}`);
console.log(`checks=${JSON.stringify(checks)}`);

// This is a POC publication gate, not the production certification gate. Fail closed
// when evidence is insufficient, while always writing evidence/gap artifacts first.
if (!pocPassed) process.exit(1);
