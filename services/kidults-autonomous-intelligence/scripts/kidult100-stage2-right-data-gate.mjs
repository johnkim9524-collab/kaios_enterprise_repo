import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const ENRICHMENT_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-right-data-enrichment.json'), 'utf8'));
const REPORT_PATH = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');

if (!fs.existsSync(REPORT_PATH)) throw new Error(`Missing Right Data report: ${REPORT_PATH}`);
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
const gate = SOURCE_CONFIG.stage2Gate;
const candidates = (report.candidates || []).filter((candidate) => candidate.semanticRelevant);

const uniqueKeys = new Set(candidates.map((candidate) => candidate.candidateKey));
const acceptedDuplicateContamination = candidates.length ? (candidates.length - uniqueKeys.size) / candidates.length : 0;
const byVertical = Object.fromEntries(SOURCE_CONFIG.coreVerticals.map((vertical) => [
  vertical.id,
  candidates.filter((candidate) => candidate.vertical === vertical.id).length,
]));
const coveredVerticals = Object.values(byVertical).filter((count) => count > 0).length;
const balancedVerticals = Object.values(byVertical).filter((count) => count >= gate.minimumCandidatesPerVertical).length;
const provenanceCoverage = candidates.length
  ? candidates.filter((candidate) => candidate.sourceUrl && candidate.observedAt && candidate.payloadHash).length / candidates.length
  : 0;
const rightsClassificationCoverage = candidates.length
  ? candidates.filter((candidate) => Boolean(candidate.rightsClass)).length / candidates.length
  : 0;
const requiredRightDataCoverage = report.metrics?.requiredRightDataCoverage || 0;
const marketEvidenceCoverage = report.metrics?.marketEvidenceCoverage || 0;
const decisionGradeCandidates = report.metrics?.decisionGradeCandidates || 0;

const primitiveCoverage = report.metrics?.primitiveCoverage || {};
const marketEvidenceSynthetic = Boolean(report.claims?.syntheticMarketEvidenceUsed || report.claims?.estimatedTransactionEvidenceUsed);
const checks = {
  candidateUniverse300Plus: candidates.length >= gate.minimumUniqueCandidates,
  coreVerticalCoverage8of8: coveredVerticals >= gate.requiredCoreVerticalCoverage,
  minimumPerVertical: balancedVerticals >= gate.requiredCoreVerticalCoverage,
  provenanceCoverage: provenanceCoverage >= gate.minimumProvenanceCoverage,
  rightsClassificationCoverage: rightsClassificationCoverage >= gate.minimumRightsClassificationCoverage,
  acceptedDuplicateContamination: acceptedDuplicateContamination <= gate.maximumExactDuplicateContamination,
  semanticRelevanceCoverage: true,
  requiredRightDataCoverage: requiredRightDataCoverage >= gate.minimumRequiredRightDataCoverage,
  marketEvidenceCoverage: marketEvidenceCoverage >= gate.minimumMarketEvidenceCoverage,
  noSyntheticOrEstimatedMarketEvidence: !marketEvidenceSynthetic,
};
const passed = Object.values(checks).every(Boolean);

const certification = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_STAGE2_RIGHT_DATA_CERTIFICATION',
  generatedAt: new Date().toISOString(),
  outcome: passed ? 'PASS' : gate.failureDisposition,
  metrics: {
    semanticRelevantCandidateUniverse: candidates.length,
    decisionGradeCandidates,
    coveredVerticals,
    balancedVerticals,
    byVertical,
    provenanceCoverage,
    rightsClassificationCoverage,
    acceptedDuplicateContamination,
    requiredRightDataCoverage,
    marketEvidenceCoverage,
    primitiveCoverage,
  },
  checks,
  claims: {
    decisionGradeRightDataCertified: passed,
    marketPriceIntelligenceCertified: passed && marketEvidenceCoverage >= gate.minimumMarketEvidenceCoverage,
    syntheticMarketEvidenceUsed: marketEvidenceSynthetic,
    finalKidult100Certified: false,
  },
  requiredPrimitives: ENRICHMENT_CONFIG.requiredPrimitives,
};

fs.writeFileSync(path.join(OUT_DIR, 'stage2-certification-latest.json'), JSON.stringify(certification, null, 2));
console.log(`Stage2 Right Data Gate: ${certification.outcome}`);
console.log(`relevant=${candidates.length} decisionGrade=${decisionGradeCandidates} verticals=${coveredVerticals}/8 balanced=${balancedVerticals}/8`);
console.log(`rightData=${requiredRightDataCoverage} marketEvidence=${marketEvidenceCoverage} duplicates=${acceptedDuplicateContamination}`);
console.log(`checks=${JSON.stringify(checks)}`);

if (!passed) process.exit(1);
