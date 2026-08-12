import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_FEASIBILITY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-source-feasibility-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_SOURCE_PLAN = path.join(ROOT, 'config', 'kidult100-poc-source-plan.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-candidate-expansion-plan-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

const feasibility = readJsonInput(process.env.KIDULTS_CANDIDATE_EXPANSION_FEASIBILITY_JSON, DEFAULT_FEASIBILITY);
const rightData = readJsonInput(process.env.KIDULTS_CANDIDATE_EXPANSION_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const sourcePlan = readJsonInput(process.env.KIDULTS_CANDIDATE_EXPANSION_SOURCE_PLAN_JSON, DEFAULT_SOURCE_PLAN);
const outRaw = process.env.KIDULTS_CANDIDATE_EXPANSION_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const structuralErrors = [];

if (feasibility?.mode !== 'KIDULT100_CALIBRATION_SOURCE_FEASIBILITY_ROUTER') structuralErrors.push('INVALID_FEASIBILITY_MODE');
if (Number(feasibility?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_FEASIBILITY_HAS_STRUCTURAL_ERRORS');
for (const field of [
  'newEvidenceCreated',
  'normalizedScoresGenerated',
  'sourceQualificationFabricated',
  'sourceFeasibilityCertificationFabricated',
  'syntheticOrEstimatedEvidenceCreated',
  'unauthorizedScrapingRequested',
  'providerProcurementRequested',
  'contractExecutionRequested',
  'authorizationBypassRequested',
  'rightsOrProvenanceRequirementsWeakened',
  'productionScoringActivated',
  'calibrationSufficiencyCertified',
  'outOfSampleValidationCertified',
  'candidateExpansionCountClaimedAsObservedEvidence',
]) {
  if (feasibility?.claims?.[field] !== false) structuralErrors.push(`UNSAFE_FEASIBILITY_CLAIM:${field}`);
}
if (feasibility?.claims?.planningOnly !== true) structuralErrors.push('FEASIBILITY_NOT_PLANNING_ONLY');

if (rightData?.mode !== 'KIDULT100_RIGHT_DATA_ENRICHMENT') structuralErrors.push('INVALID_RIGHT_DATA_MODE');
if (sourcePlan?.mode !== 'KIDULT100_VALUE_BEFORE_DATA_POC') structuralErrors.push('INVALID_SOURCE_PLAN_MODE');

const gate = sourcePlan?.stage2Gate || {};
const minimumUniqueCandidates = integer(gate.minimumUniqueCandidates);
const minimumCandidatesPerVertical = integer(gate.minimumCandidatesPerVertical);
const requiredCoreVerticalCoverage = integer(gate.requiredCoreVerticalCoverage);
if (minimumUniqueCandidates == null || minimumUniqueCandidates <= 0) structuralErrors.push('INVALID_MINIMUM_UNIQUE_CANDIDATES');
if (minimumCandidatesPerVertical == null || minimumCandidatesPerVertical <= 0) structuralErrors.push('INVALID_MINIMUM_CANDIDATES_PER_VERTICAL');

const verticalRows = Array.isArray(sourcePlan?.coreVerticals) ? sourcePlan.coreVerticals : [];
const verticalIds = [];
const verticalConfig = new Map();
for (const row of verticalRows) {
  if (!row?.id || verticalConfig.has(row.id)) {
    structuralErrors.push(verticalConfig.has(row?.id) ? `DUPLICATE_VERTICAL:${row.id}` : 'INVALID_VERTICAL_IDENTITY');
    continue;
  }
  const discoveryQueries = Array.isArray(row.discoveryQueries) ? row.discoveryQueries.filter((query) => typeof query === 'string' && query.trim()) : [];
  if (discoveryQueries.length === 0) structuralErrors.push(`MISSING_DISCOVERY_QUERIES:${row.id}`);
  verticalIds.push(row.id);
  verticalConfig.set(row.id, { ...row, discoveryQueries });
}
if (verticalIds.length === 0) structuralErrors.push('MISSING_CORE_VERTICALS');
if (requiredCoreVerticalCoverage == null || requiredCoreVerticalCoverage !== verticalIds.length) structuralErrors.push('CORE_VERTICAL_COVERAGE_MISMATCH');

const candidates = Array.isArray(rightData?.candidates) ? rightData.candidates : [];
const relevant = candidates.filter((candidate) => candidate?.semanticRelevant === true);
const candidateKeys = new Set();
const currentByVertical = Object.fromEntries(verticalIds.map((id) => [id, 0]));
for (const candidate of relevant) {
  if (!candidate?.candidateKey || candidateKeys.has(candidate.candidateKey)) {
    structuralErrors.push(candidateKeys.has(candidate?.candidateKey) ? `DUPLICATE_RELEVANT_CANDIDATE:${candidate.candidateKey}` : 'MISSING_RELEVANT_CANDIDATE_KEY');
    continue;
  }
  candidateKeys.add(candidate.candidateKey);
  if (!verticalConfig.has(candidate.vertical)) {
    structuralErrors.push(`UNKNOWN_RELEVANT_VERTICAL:${candidate.vertical || 'MISSING'}`);
    continue;
  }
  currentByVertical[candidate.vertical] += 1;
}

const reportedRightDataRelevant = integer(rightData?.metrics?.semanticRelevantCandidates);
if (reportedRightDataRelevant == null || reportedRightDataRelevant !== relevant.length) {
  structuralErrors.push(`RIGHT_DATA_RELEVANT_COUNT_MISMATCH:${reportedRightDataRelevant}:${relevant.length}`);
}
const feasibilityRelevant = integer(feasibility?.metrics?.relevantCandidates);
if (feasibilityRelevant == null || feasibilityRelevant !== relevant.length) {
  structuralErrors.push(`FEASIBILITY_RELEVANT_COUNT_MISMATCH:${feasibilityRelevant}:${relevant.length}`);
}

const shortfallByVertical = feasibility?.candidateExpansion?.shortfallByVertical || {};
const targets = [];
let calibrationVerticalLowerBound = 0;
let minimumBalanceGapTotal = 0;
for (const vertical of verticalIds) {
  const calibrationLowerBound = integer(shortfallByVertical?.[vertical]?.conditionalMinimumNetNewCandidates ?? 0);
  if (calibrationLowerBound == null) {
    structuralErrors.push(`INVALID_CALIBRATION_VERTICAL_LOWER_BOUND:${vertical}`);
    continue;
  }
  const current = currentByVertical[vertical];
  const balanceGap = minimumCandidatesPerVertical == null ? 0 : Math.max(0, minimumCandidatesPerVertical - current);
  const mandatoryTarget = Math.max(balanceGap, calibrationLowerBound);
  calibrationVerticalLowerBound += calibrationLowerBound;
  minimumBalanceGapTotal += balanceGap;
  targets.push({
    vertical,
    currentRelevantCandidates: current,
    minimumPerVertical: minimumCandidatesPerVertical,
    minimumBalanceGap: balanceGap,
    calibrationConditionalLowerBound: calibrationLowerBound,
    mandatoryNetNewTarget: mandatoryTarget,
    additionalUniverseAllocation: 0,
    totalNetNewTarget: mandatoryTarget,
    projectedRelevantCandidates: current + mandatoryTarget,
    discoveryQueries: [...(verticalConfig.get(vertical)?.discoveryQueries || [])],
  });
}

const universeGap = minimumUniqueCandidates == null ? 0 : Math.max(0, minimumUniqueCandidates - relevant.length);
const mandatoryNetNewTotal = targets.reduce((sum, row) => sum + row.mandatoryNetNewTarget, 0);
const plannedNetNewTotal = Math.max(universeGap, mandatoryNetNewTotal);
let remaining = plannedNetNewTotal - mandatoryNetNewTotal;
while (remaining > 0 && targets.length > 0) {
  const selected = [...targets].sort((a, b) => a.projectedRelevantCandidates - b.projectedRelevantCandidates || a.vertical.localeCompare(b.vertical))[0];
  selected.additionalUniverseAllocation += 1;
  selected.totalNetNewTarget += 1;
  selected.projectedRelevantCandidates += 1;
  remaining -= 1;
}

targets.sort((a, b) => b.totalNetNewTarget - a.totalNetNewTarget || a.vertical.localeCompare(b.vertical));
const projectedUniverse = relevant.length + targets.reduce((sum, row) => sum + row.totalNetNewTarget, 0);
const projectedBalancedVerticals = targets.filter((row) => row.projectedRelevantCandidates >= minimumCandidatesPerVertical).length;
const feasibilityCombinedMinimum = integer(feasibility?.metrics?.minimumCombinedNetNewRelevantCandidates);
if (feasibilityCombinedMinimum == null || feasibilityCombinedMinimum !== Math.max(universeGap, calibrationVerticalLowerBound)) {
  structuralErrors.push(`FEASIBILITY_COMBINED_MINIMUM_MISMATCH:${feasibilityCombinedMinimum}:${Math.max(universeGap, calibrationVerticalLowerBound)}`);
}
if (plannedNetNewTotal < universeGap || plannedNetNewTotal < mandatoryNetNewTotal) structuralErrors.push('PLANNED_EXPANSION_BELOW_REQUIRED_FLOOR');

const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_CANDIDATE_EXPANSION_STATE'
  : plannedNetNewTotal === 0
    ? 'NO_CANDIDATE_EXPANSION_REQUIRED_FOR_CURRENT_GATES'
    : 'CANDIDATE_EXPANSION_PLAN_READY_NO_CANDIDATES_DISCOVERED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CANDIDATE_EXPANSION_PLAN',
  generatedAt: new Date().toISOString(),
  gate: {
    minimumUniqueCandidates,
    minimumCandidatesPerVertical,
    requiredCoreVerticalCoverage,
  },
  metrics: {
    currentRelevantCandidates: relevant.length,
    currentBalancedVerticals: verticalIds.filter((vertical) => currentByVertical[vertical] >= minimumCandidatesPerVertical).length,
    universeGap,
    minimumBalanceGapTotal,
    calibrationVerticalLowerBound,
    mandatoryNetNewTotal,
    plannedNetNewTotal,
    projectedRelevantCandidates: projectedUniverse,
    projectedBalancedVerticals,
    structuralErrorCount: structuralErrors.length,
  },
  targets,
  structuralErrors,
  disposition,
  claims: {
    planningOnly: true,
    candidatesDiscovered: false,
    semanticRelevanceFabricated: false,
    evidenceCreated: false,
    normalizedScoresGenerated: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractExecutionRequested: false,
    authorizationBypassRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    productionGateWeakened: false,
    productionReadinessCertified: false,
    projectedCountsClaimedAsObserved: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Candidate expansion plan: current=${relevant.length} universeGap=${universeGap} balanceGap=${minimumBalanceGapTotal} calibrationLowerBound=${calibrationVerticalLowerBound}`);
console.log(`mandatory=${mandatoryNetNewTotal} planned=${plannedNetNewTotal} projected=${projectedUniverse} balancedProjected=${projectedBalancedVerticals}/${verticalIds.length}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
