import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-right-data-enrichment.json'), 'utf8'));
const POC_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(POC_PATH)) throw new Error(`Missing candidate build: ${POC_PATH}`);
const poc = JSON.parse(fs.readFileSync(POC_PATH, 'utf8'));

function parseEvidencePayload(value) {
  if (!value) return [];
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.evidence) ? parsed.evidence : [];
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(ROOT, trimmed);
  if (!fs.existsSync(resolved)) return [];
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.evidence) ? parsed.evidence : [];
}

function loadProviderEvidence() {
  const all = [];
  for (const file of CONFIG.providerEvidence.optionalSnapshotFiles || []) {
    const resolved = path.join(ROOT, file);
    if (fs.existsSync(resolved)) all.push(...parseEvidencePayload(resolved));
  }
  const envName = CONFIG.providerEvidence.environmentVariable;
  if (envName && process.env[envName]) all.push(...parseEvidencePayload(process.env[envName]));
  return all;
}

function validEvidence(record) {
  if (!record || typeof record !== 'object') return false;
  if (!CONFIG.providerEvidence.acceptedEvidenceClasses.includes(record.evidenceClass)) return false;
  if (!CONFIG.requiredPrimitives.includes(record.primitive)) return false;
  return CONFIG.providerEvidence.requiredFields.every((field) => Boolean(record[field]));
}

function freshnessScore(observedAt) {
  const observed = Date.parse(observedAt || '');
  if (!Number.isFinite(observed)) return 0;
  const ageDays = Math.max(0, (Date.now() - observed) / 86400000);
  if (ageDays <= 30) return 1;
  if (ageDays <= 180) return 0.8;
  if (ageDays <= 365) return 0.6;
  return 0.3;
}

function sourceClassScore(sourceClass) {
  if (sourceClass === 'INSTITUTION_ARCHIVE') return 1;
  if (sourceClass === 'REFERENCE_PUBLIC_DATA') return 0.9;
  if (sourceClass === 'MARKET_PROVIDER') return 0.9;
  return 0.6;
}

function deriveRiskConfidence(candidate) {
  const w = CONFIG.confidenceModel.weights;
  const provenance = candidate.sourceUrl && candidate.observedAt && candidate.payloadHash ? 1 : 0;
  const rights = candidate.rightsClass ? 1 : 0;
  const semantic = candidate.semanticRelevant ? 1 : 0;
  const source = sourceClassScore(candidate.sourceClass);
  const freshness = freshnessScore(candidate.observedAt);
  const score =
    provenance * w.provenance +
    rights * w.rightsClassification +
    semantic * w.semanticRelevance +
    source * w.sourceClass +
    freshness * w.freshness;
  return {
    score: Number(score.toFixed(4)),
    model: CONFIG.confidenceModel.version,
    inputs: { provenance, rights, semantic, sourceClass: source, freshness },
    derived: true,
  };
}

const rawEvidence = loadProviderEvidence();
const rejectedEvidence = rawEvidence.filter((record) => !validEvidence(record));
const providerEvidence = rawEvidence.filter(validEvidence);
const evidenceByCandidate = new Map();
for (const evidence of providerEvidence) {
  const list = evidenceByCandidate.get(evidence.candidateKey) || [];
  list.push(evidence);
  evidenceByCandidate.set(evidence.candidateKey, list);
}

function evidencePrimitiveSet(candidate, evidence) {
  const set = new Set(Array.isArray(candidate.intelligencePrimitives) ? candidate.intelligencePrimitives : []);
  for (const record of evidence) set.add(record.primitive);
  return set;
}

const enrichedCandidates = (poc.candidates || []).map((candidate) => {
  const externalEvidence = evidenceByCandidate.get(candidate.candidateKey) || [];
  const riskConfidence = deriveRiskConfidence(candidate);
  const derivedEvidence = [];
  if (riskConfidence.score >= CONFIG.confidenceModel.minimumScoreToAssertPrimitive) {
    derivedEvidence.push({
      candidateKey: candidate.candidateKey,
      primitive: 'RISK_CONFIDENCE',
      source: 'KIDULTS_INTERNAL_MODEL',
      sourceUrl: candidate.sourceUrl,
      rightsClass: 'DERIVED_FROM_RIGHTS_CLASSIFIED_INPUTS',
      observedAt: new Date().toISOString(),
      payloadHash: candidate.payloadHash,
      evidenceClass: 'DERIVED_INTERNAL_CONFIDENCE',
      value: riskConfidence,
    });
  }
  const allEvidence = [...externalEvidence, ...derivedEvidence];
  const primitives = evidencePrimitiveSet(candidate, allEvidence);
  const requiredRightDataCoverage = CONFIG.requiredPrimitives.filter((primitive) => primitives.has(primitive)).length / CONFIG.requiredPrimitives.length;
  const marketEvidencePresent = CONFIG.marketEvidenceDefinition.requires.every((primitive) => primitives.has(primitive));
  const missingPrimitives = CONFIG.requiredPrimitives.filter((primitive) => !primitives.has(primitive));
  return {
    ...candidate,
    rightData: {
      primitives: [...primitives],
      requiredCoverage: requiredRightDataCoverage,
      marketEvidencePresent,
      missingPrimitives,
      evidence: allEvidence,
      riskConfidence,
    },
  };
});

const relevantCandidates = enrichedCandidates.filter((candidate) => candidate.semanticRelevant);
const primitiveCoverage = Object.fromEntries(CONFIG.requiredPrimitives.map((primitive) => [
  primitive,
  relevantCandidates.length
    ? relevantCandidates.filter((candidate) => candidate.rightData.primitives.includes(primitive)).length / relevantCandidates.length
    : 0,
]));
const requiredRightDataCoverage = relevantCandidates.length
  ? relevantCandidates.reduce((sum, candidate) => sum + candidate.rightData.requiredCoverage, 0) / relevantCandidates.length
  : 0;
const marketEvidenceCoverage = relevantCandidates.length
  ? relevantCandidates.filter((candidate) => candidate.rightData.marketEvidencePresent).length / relevantCandidates.length
  : 0;
const decisionGradeCandidates = relevantCandidates.filter((candidate) => candidate.rightData.requiredCoverage >= 0.9 && candidate.rightData.marketEvidencePresent);

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
  generatedAt: new Date().toISOString(),
  sourceCandidateReport: 'reports/kidult100-poc/kidult100-poc-latest.json',
  metrics: {
    totalNormalizedCandidates: enrichedCandidates.length,
    semanticRelevantCandidates: relevantCandidates.length,
    providerEvidenceAccepted: providerEvidence.length,
    providerEvidenceRejected: rejectedEvidence.length,
    requiredRightDataCoverage,
    marketEvidenceCoverage,
    decisionGradeCandidates: decisionGradeCandidates.length,
    primitiveCoverage,
  },
  claims: {
    syntheticMarketEvidenceUsed: false,
    estimatedTransactionEvidenceUsed: false,
    marketPriceIntelligenceCertified: false,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
  },
  candidates: enrichedCandidates,
};

const gapReport = {
  schemaVersion: '1.0.0',
  generatedAt: report.generatedAt,
  semanticRelevantCandidates: relevantCandidates.length,
  decisionGradeCandidates: decisionGradeCandidates.length,
  primitiveCoverage,
  requiredRightDataCoverage,
  marketEvidenceCoverage,
  missingEvidenceCounts: Object.fromEntries(CONFIG.requiredPrimitives.map((primitive) => [
    primitive,
    relevantCandidates.filter((candidate) => !candidate.rightData.primitives.includes(primitive)).length,
  ])),
  providerEvidenceAccepted: providerEvidence.length,
  providerEvidenceRejected: rejectedEvidence.length,
  nextRequiredEvidence: ['SCARCITY', 'TRANSACTION_PRICE_COMPARABLE', 'LIQUIDITY', 'DEMAND_ATTENTION'],
};

fs.writeFileSync(path.join(OUT_DIR, 'right-data-latest.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'right-data-gap-latest.json'), JSON.stringify(gapReport, null, 2));
console.log(`Right Data enrichment: normalized=${enrichedCandidates.length} relevant=${relevantCandidates.length} decisionGrade=${decisionGradeCandidates.length}`);
console.log(`providerEvidence accepted=${providerEvidence.length} rejected=${rejectedEvidence.length}`);
console.log(`rightData=${requiredRightDataCoverage} marketEvidence=${marketEvidenceCoverage}`);
console.log(`primitiveCoverage=${JSON.stringify(primitiveCoverage)}`);
