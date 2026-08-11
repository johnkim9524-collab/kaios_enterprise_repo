import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-discovery-triage-policy.json');
const DEFAULT_DISCOVERY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-discovery-plan-latest.json');
const DEFAULT_PRIORITY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-evidence-acquisition-priority-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-discovery-triage-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function boundedCoverage(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_DISCOVERY_TRIAGE_POLICY_JSON, DEFAULT_POLICY);
const discovery = readJsonInput(process.env.KIDULTS_SCARCITY_DISCOVERY_TRIAGE_DISCOVERY_JSON, DEFAULT_DISCOVERY);
const priority = readJsonInput(process.env.KIDULTS_SCARCITY_DISCOVERY_TRIAGE_PRIORITY_JSON, DEFAULT_PRIORITY);
const rightData = readJsonInput(process.env.KIDULTS_SCARCITY_DISCOVERY_TRIAGE_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const outputRaw = process.env.KIDULTS_SCARCITY_DISCOVERY_TRIAGE_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_DISCOVERY_TRIAGE') throw new Error('Invalid scarcity discovery triage policy');
if (discovery?.mode !== policy.requiredDiscoveryMode) throw new Error('Invalid scarcity discovery input mode');
if (priority?.mode !== policy.requiredPriorityMode) throw new Error('Invalid non-market priority input mode');
if (rightData?.mode !== policy.requiredRightDataMode) throw new Error('Invalid Right Data input mode');
if (policy?.requiredDimension !== 'SCARCITY') throw new Error('Scarcity discovery triage must require SCARCITY');
if (policy?.conditionalPrimitiveGainPerFullyVerifiedCandidate !== 1) throw new Error('Conditional primitive gain must remain exactly one per fully verified candidate');
for (const [field, value] of Object.entries(policy?.safety || {})) {
  if (value !== false) throw new Error(`Unsafe scarcity discovery triage policy: ${field}`);
}
for (const [field, value] of Object.entries(discovery?.safety || {})) {
  if (value !== false) throw new Error(`Unsafe upstream scarcity discovery state: ${field}`);
}
if (Number(priority?.metrics?.structuralErrorCount || 0) !== 0) throw new Error('Upstream non-market priority has structural errors');
if (priority?.claims?.syntheticOrEstimatedEvidenceCreated !== false || priority?.claims?.rightsOrProvenanceRequirementsWeakened !== false || priority?.claims?.productionScoringActivated !== false) {
  throw new Error('Unsafe upstream non-market priority state');
}
if (rightData?.claims?.syntheticMarketEvidenceUsed !== false || rightData?.claims?.estimatedTransactionEvidenceUsed !== false) throw new Error('Unsafe Right Data evidence state');

const structuralErrors = [];
const semanticRelevantCandidates = nonNegativeInteger(rightData?.metrics?.semanticRelevantCandidates);
const currentRequiredRightDataCoverage = boundedCoverage(rightData?.metrics?.requiredRightDataCoverage);
const requiredPrimitiveCount = Object.keys(rightData?.metrics?.primitiveCoverage || {}).length;
if (!(semanticRelevantCandidates > 0)) structuralErrors.push('INVALID_RIGHT_DATA_RELEVANT_CANDIDATE_COUNT');
if (currentRequiredRightDataCoverage == null) structuralErrors.push('INVALID_RIGHT_DATA_REQUIRED_COVERAGE');
if (!(requiredPrimitiveCount > 0)) structuralErrors.push('INVALID_RIGHT_DATA_REQUIRED_PRIMITIVE_COUNT');
const conditionalCoverageDeltaPerFullyVerifiedCandidate = semanticRelevantCandidates > 0 && requiredPrimitiveCount > 0
  ? 1 / (semanticRelevantCandidates * requiredPrimitiveCount)
  : 0;

const scarcityByVertical = new Map();
for (const cell of Array.isArray(priority?.priorities) ? priority.priorities : []) {
  if (cell?.dimension !== 'SCARCITY') continue;
  if (!cell?.vertical || scarcityByVertical.has(cell.vertical)) {
    structuralErrors.push(!cell?.vertical ? 'INVALID_SCARCITY_VERTICAL' : `DUPLICATE_SCARCITY_VERTICAL:${cell.vertical}`);
    continue;
  }
  const gap = nonNegativeInteger(cell.operationalReferenceGap);
  const eligible = nonNegativeInteger(cell.calibrationEligibleCandidates);
  if (gap == null || eligible == null) {
    structuralErrors.push(`INVALID_SCARCITY_CELL_METRICS:${cell.vertical}`);
    continue;
  }
  scarcityByVertical.set(cell.vertical, { operationalReferenceGap: gap, calibrationEligibleCandidates: eligible });
}

const rightDataByCandidate = new Map();
for (const candidate of Array.isArray(rightData?.candidates) ? rightData.candidates : []) {
  if (!candidate?.candidateKey || rightDataByCandidate.has(candidate.candidateKey)) {
    structuralErrors.push(!candidate?.candidateKey ? 'INVALID_RIGHT_DATA_CANDIDATE' : `DUPLICATE_RIGHT_DATA_CANDIDATE:${candidate.candidateKey}`);
    continue;
  }
  rightDataByCandidate.set(candidate.candidateKey, candidate);
}

const seenDiscovery = new Set();
const rows = [];
for (const packet of Array.isArray(discovery?.workPackets) ? discovery.workPackets : []) {
  if (!packet?.candidateKey || !packet?.vertical || seenDiscovery.has(packet.candidateKey)) {
    structuralErrors.push(seenDiscovery.has(packet?.candidateKey) ? `DUPLICATE_DISCOVERY_CANDIDATE:${packet.candidateKey}` : 'INVALID_DISCOVERY_PACKET');
    continue;
  }
  seenDiscovery.add(packet.candidateKey);
  const vertical = scarcityByVertical.get(packet.vertical);
  const candidate = rightDataByCandidate.get(packet.candidateKey);
  if (!vertical || !candidate) {
    structuralErrors.push(!vertical ? `MISSING_SCARCITY_VERTICAL:${packet.vertical}` : `MISSING_RIGHT_DATA_CANDIDATE:${packet.candidateKey}`);
    continue;
  }
  const primitives = new Set(candidate?.rightData?.primitives || []);
  if (primitives.has('SCARCITY')) {
    structuralErrors.push(`DISCOVERY_CANDIDATE_ALREADY_HAS_SCARCITY:${packet.candidateKey}`);
    continue;
  }
  const demandSupport = primitives.has('DEMAND_ATTENTION');
  const canonSupport = primitives.has('CANON_CULTURAL_STRENGTH');
  const referenceContext = Boolean(packet?.currentReference?.sourceClass && packet?.currentReference?.rightsClass && packet?.currentReference?.sourceUrl);
  rows.push({
    candidateKey: packet.candidateKey,
    canonicalTitle: packet.canonicalTitle || candidate.canonicalTitle || null,
    vertical: packet.vertical,
    verticalScarcityOperationalGap: vertical.operationalReferenceGap,
    currentVerticalScarcityEligibleSupply: vertical.calibrationEligibleCandidates,
    zeroEligibleScarcitySupply: vertical.calibrationEligibleCandidates === 0,
    existingSupport: { demandAttention: demandSupport, canonCulturalStrength: canonSupport, both: demandSupport && canonSupport },
    rightsClassifiedReferenceContextAvailable: referenceContext,
    sourceFeasibility: 'UNASSESSED_REQUIRES_RIGHTS_QUALIFIED_DISCOVERY',
    qualificationStatus: 'NOT_QUALIFIED',
    conditionalScarcityPrimitiveGainIfFullyVerified: 1,
    conditionalRequiredRightDataCoverageDeltaIfFullyVerified: conditionalCoverageDeltaPerFullyVerifiedCandidate,
    automaticQualificationAllowed: false,
  });
}

rows.sort((a, b) => Number(b.zeroEligibleScarcitySupply) - Number(a.zeroEligibleScarcitySupply)
  || b.verticalScarcityOperationalGap - a.verticalScarcityOperationalGap
  || Number(b.existingSupport.both) - Number(a.existingSupport.both)
  || Number(b.rightsClassifiedReferenceContextAvailable) - Number(a.rightsClassifiedReferenceContextAvailable)
  || a.candidateKey.localeCompare(b.candidateKey));
rows.forEach((row, index) => { row.triageRank = index + 1; });

const byVertical = {};
for (const row of rows) {
  if (!byVertical[row.vertical]) byVertical[row.vertical] = {
    prioritizedTargets: 0,
    verticalScarcityOperationalGap: row.verticalScarcityOperationalGap,
    currentVerticalScarcityEligibleSupply: row.currentVerticalScarcityEligibleSupply,
    zeroEligibleScarcitySupply: row.zeroEligibleScarcitySupply,
    demandAndCanonSupportedTargets: 0,
    conditionalMaxScarcityPrimitiveGain: 0,
    conditionalMaxRequiredRightDataCoverageDelta: 0,
  };
  byVertical[row.vertical].prioritizedTargets += 1;
  byVertical[row.vertical].demandAndCanonSupportedTargets += Number(row.existingSupport.both);
  byVertical[row.vertical].conditionalMaxScarcityPrimitiveGain += 1;
  byVertical[row.vertical].conditionalMaxRequiredRightDataCoverageDelta += conditionalCoverageDeltaPerFullyVerifiedCandidate;
}

const conditionalMaxRequiredRightDataCoverageDelta = rows.length * conditionalCoverageDeltaPerFullyVerifiedCandidate;
const conditionalMaxRequiredRightDataCoverage = currentRequiredRightDataCoverage == null
  ? null
  : Math.min(1, currentRequiredRightDataCoverage + conditionalMaxRequiredRightDataCoverageDelta);
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_SCARCITY_DISCOVERY_TRIAGE'
  : rows.length > 0
    ? 'DETERMINISTIC_DISCOVERY_TRIAGE_READY_NO_SOURCE_FEASIBILITY_CLAIM'
    : 'NO_DISCOVERY_READY_TARGETS';

const report = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_SCARCITY_DISCOVERY_TRIAGE',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    discoveryReadyTargets: Array.isArray(discovery?.workPackets) ? discovery.workPackets.length : 0,
    prioritizedTargets: rows.length,
    zeroEligibleSupplyTargets: rows.filter((row) => row.zeroEligibleScarcitySupply).length,
    demandAndCanonSupportedTargets: rows.filter((row) => row.existingSupport.both).length,
    rightsClassifiedReferenceContextTargets: rows.filter((row) => row.rightsClassifiedReferenceContextAvailable).length,
    conditionalMaxScarcityPrimitiveGain: rows.length,
    semanticRelevantCandidates,
    requiredPrimitiveCount,
    currentRequiredRightDataCoverage,
    conditionalRequiredRightDataCoverageDeltaPerFullyVerifiedCandidate: conditionalCoverageDeltaPerFullyVerifiedCandidate,
    conditionalMaxRequiredRightDataCoverageDelta,
    conditionalMaxRequiredRightDataCoverage,
    conditionalScarcityPacketsAloneCanReachNinetyPercentRightData: conditionalMaxRequiredRightDataCoverage == null ? false : conditionalMaxRequiredRightDataCoverage >= 0.9,
    structuralErrorCount: structuralErrors.length,
    byVertical,
  },
  priorityOrder: policy.priorityOrder,
  structuralErrors,
  disposition,
  claims: {
    sourceFeasibilityProbabilityEstimated: false,
    sourceDiscoveryPerformed: false,
    sourceQualificationPerformed: false,
    scarcityEvidenceCreated: false,
    syntheticOrEstimatedQuantityCreated: false,
    normalizedScoresGenerated: false,
    productionScoringActivated: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    conditionalGainIsNotEvidence: true,
    conditionalCoverageProjectionIsNotCertifiedRightData: true,
  },
  priorities: rows,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity discovery triage: ready=${report.metrics.discoveryReadyTargets} prioritized=${rows.length} zeroSupply=${report.metrics.zeroEligibleSupplyTargets} bothSupport=${report.metrics.demandAndCanonSupportedTargets} conditionalMaxGain=${report.metrics.conditionalMaxScarcityPrimitiveGain}`);
console.log(`conditionalRightDataDelta=${report.metrics.conditionalMaxRequiredRightDataCoverageDelta} conditionalRightDataMax=${report.metrics.conditionalMaxRequiredRightDataCoverage} canReach90=${report.metrics.conditionalScarcityPacketsAloneCanReachNinetyPercentRightData}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
