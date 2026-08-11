import fs from 'node:fs';
import path from 'node:path';
import { computeScarcityTargetCapacity } from './lib/scarcity-target-capacity.mjs';

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, 'config', 'kidult100-scarcity-target-policy.json');
const CONTRACT_PATH = path.join(ROOT, 'config', 'kidult100-non-market-scoring-contract.json');
const SOURCE_PLAN_PATH = path.join(ROOT, 'config', 'kidult100-poc-source-plan.json');
const RIGHT_DATA_PATH = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const SHAPE_PATH = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-evidence-shape-latest.json');
const OUT_PATH = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-target-queue-latest.json');

function readJson(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing JSON input: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

const policy = readJson(POLICY_PATH);
const contract = readJson(CONTRACT_PATH);
const sourcePlan = readJson(SOURCE_PLAN_PATH);
const rightData = readJson(RIGHT_DATA_PATH);
const shape = readJson(SHAPE_PATH);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_TOTAL_PRODUCED_TARGET_QUEUE') throw new Error('Invalid scarcity target policy');
if (policy?.primitive !== 'SCARCITY' || policy?.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Scarcity target policy must require explicit TOTAL_PRODUCED');
if (Object.values(policy?.evidenceRequirements || {}).some((value) => value === true) === false) throw new Error('Missing scarcity evidence requirements');
for (const field of ['syntheticAllowed', 'estimatedAllowed', 'inferredScarcityAllowed', 'listingOrMarketingLanguageAcceptedAsQuantity', 'unauthorizedScrapingAllowed', 'paidProviderProcurementAllowed', 'automaticProductionScoringActivationAllowed']) {
  if (policy.evidenceRequirements?.[field] !== false) throw new Error(`Unsafe scarcity policy: ${field}`);
}

const scarcityDefinition = (contract?.dimensions || []).find((row) => row?.id === 'SCARCITY');
if (!scarcityDefinition || scarcityDefinition.methodologyStatus !== 'NOT_VALIDATED' || scarcityDefinition.productionActivation !== false) throw new Error('Scarcity scoring must remain inactive');
if (JSON.stringify(scarcityDefinition.allowedRawSignalTypes) !== JSON.stringify(['TOTAL_PRODUCED'])) throw new Error('Scarcity raw signal contract changed');

const verticals = (sourcePlan?.coreVerticals || []).map((row) => row?.id).filter(Boolean);
const operationalReference = Number(sourcePlan?.stage2Gate?.minimumCandidatesPerVertical);
if (!Number.isInteger(operationalReference) || operationalReference <= 0 || verticals.length !== 8) throw new Error('Invalid source-plan operational reference');
if (shape?.mode !== 'KIDULT100_CALIBRATION_EVIDENCE_SHAPE_PLAN' || Number(shape?.metrics?.structuralErrorCount || 0) !== 0) throw new Error('Unsafe calibration evidence shape');

const scarcityCells = new Map((shape?.priorities || [])
  .filter((row) => row?.dimension === 'SCARCITY')
  .map((row) => [row.vertical, row]));
if (scarcityCells.size !== verticals.length) throw new Error('Missing scarcity calibration cells');

const relevant = (rightData?.candidates || []).filter((candidate) => candidate?.semanticRelevant === true && verticals.includes(candidate?.vertical));

function evidenceRows(candidate, primitive) {
  return (candidate?.rightData?.evidence || []).filter((row) => row?.primitive === primitive);
}

function eligibleScarcity(candidate) {
  return evidenceRows(candidate, 'SCARCITY').some((row) => row?.value?.signalType === 'TOTAL_PRODUCED'
    && nonEmpty(row?.rightsClass)
    && provenanceComplete(row)
    && safeEvidence(row));
}

function supportingState(candidate) {
  const demand = evidenceRows(candidate, 'DEMAND_ATTENTION').some((row) => nonEmpty(row?.value?.signalType)
    && nonEmpty(row?.rightsClass) && provenanceComplete(row) && safeEvidence(row));
  const canon = evidenceRows(candidate, 'CANON_CULTURAL_STRENGTH').some((row) => nonEmpty(row?.value?.signalType)
    && nonEmpty(row?.rightsClass) && provenanceComplete(row) && safeEvidence(row));
  return { demand, canon, supportCount: Number(demand) + Number(canon) };
}

const byVertical = {};
const targets = [];
let targetShortfall = 0;
let calibrationReferenceShortfall = 0;
let candidateSupplyBoundedVerticals = 0;

for (const vertical of verticals) {
  const cell = scarcityCells.get(vertical);
  const candidates = relevant
    .filter((candidate) => candidate.vertical === vertical && !eligibleScarcity(candidate))
    .map((candidate) => {
      const support = supportingState(candidate);
      return {
        candidateKey: candidate.candidateKey,
        canonicalTitle: candidate.canonicalTitle || null,
        vertical,
        source: candidate.source || null,
        sourceClass: candidate.sourceClass || null,
        sourceUrl: candidate.sourceUrl || null,
        rightsClass: candidate.rightsClass || null,
        semanticRelevanceScore: Number(candidate.semanticRelevanceScore || 0),
        demandEvidenceReady: support.demand,
        canonEvidenceReady: support.canon,
        supportingNonMarketSignals: support.supportCount,
        requiredScarcitySignalType: 'TOTAL_PRODUCED',
        acquisitionStatus: 'RIGHTS_QUALIFIED_EXPLICIT_QUANTITY_REQUIRED',
        normalizedScore: null,
      };
    })
    .sort((a, b) => b.supportingNonMarketSignals - a.supportingNonMarketSignals
      || Number(b.demandEvidenceReady) - Number(a.demandEvidenceReady)
      || b.semanticRelevanceScore - a.semanticRelevanceScore
      || String(a.candidateKey).localeCompare(String(b.candidateKey)));

  const capacity = computeScarcityTargetCapacity({
    operationalReference,
    currentEligible: Number(cell?.calibrationEligibleCandidates || 0),
    availableTargets: candidates.length,
  });
  const selected = candidates.slice(0, capacity.acquisitionTargetGap);
  const shortfall = Math.max(0, capacity.acquisitionTargetGap - selected.length);
  targetShortfall += shortfall;
  calibrationReferenceShortfall += capacity.calibrationReferenceShortfall;
  candidateSupplyBoundedVerticals += Number(capacity.candidateSupplyBounded);
  targets.push(...selected.map((row, index) => ({ ...row, verticalPriority: index + 1 })));
  byVertical[vertical] = {
    relevantCandidates: relevant.filter((candidate) => candidate.vertical === vertical).length,
    currentEligibleScarcity: Number(cell?.calibrationEligibleCandidates || 0),
    operationalReference,
    calibrationTargetGap: capacity.calibrationTargetGap,
    targetGap: capacity.acquisitionTargetGap,
    calibrationReferenceShortfall: capacity.calibrationReferenceShortfall,
    candidateSupplyBounded: capacity.candidateSupplyBounded,
    availableEligibleTargets: candidates.length,
    selectedTargets: selected.length,
    targetShortfall: shortfall,
  };
}

const disposition = targetShortfall > 0
  ? 'FAIL_CLOSED_INTERNAL_TARGET_SELECTION_SHORTFALL'
  : calibrationReferenceShortfall > 0
    ? 'SCARCITY_ACQUISITION_QUEUE_READY_CALIBRATION_REFERENCE_SHORTFALL_RETAINED'
    : targets.length === 0
      ? 'SCARCITY_OPERATIONAL_REFERENCE_FILLED_METHOD_VALIDATION_STILL_REQUIRED'
      : 'SCARCITY_RIGHTS_QUALIFIED_TOTAL_PRODUCED_ACQUISITION_QUEUE_READY';

const report = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  thresholds: {
    operationalReferencePerVertical: operationalReference,
    statisticalCalibrationThreshold: null,
  },
  metrics: {
    semanticRelevantCandidates: relevant.length,
    currentEligibleScarcityCandidates: [...scarcityCells.values()].reduce((sum, row) => sum + Number(row?.calibrationEligibleCandidates || 0), 0),
    targetCandidates: targets.length,
    targetShortfall,
    calibrationReferenceShortfall,
    candidateSupplyBoundedVerticals,
    verticals: verticals.length,
    byVertical,
  },
  acquisitionContract: {
    primitive: 'SCARCITY',
    signalType: 'TOTAL_PRODUCED',
    explicitQuantityRequired: true,
    rightsClassRequired: true,
    provenanceRequired: true,
    normalizedScoreGenerated: false,
    syntheticOrEstimatedAllowed: false,
    inferredScarcityAllowed: false,
    unauthorizedScrapingAllowed: false,
    paidProviderProcurementAllowed: false,
  },
  targets,
  disposition,
  claims: {
    normalizedScoresGenerated: false,
    scarcityInferredFromProxy: false,
    syntheticOrEstimatedEvidenceCreated: false,
    providerProcurementRequested: false,
    unauthorizedScrapingRequested: false,
    productionScoringActivated: false,
    operationalReferenceClaimedAsStatisticalSufficiency: false,
    calibrationReferenceSatisfied: calibrationReferenceShortfall === 0,
    calibrationReferenceShortfallPreserved: true,
  }
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(`Scarcity target queue: relevant=${relevant.length} currentEligible=${report.metrics.currentEligibleScarcityCandidates} targets=${targets.length} acquisitionShortfall=${targetShortfall} calibrationShortfall=${calibrationReferenceShortfall}`);
console.log(`disposition=${disposition}`);
if (targetShortfall > 0) process.exitCode = 1;
