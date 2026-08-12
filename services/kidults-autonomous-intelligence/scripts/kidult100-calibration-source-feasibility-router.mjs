import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_PACKETS = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-discovery-work-packets-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_SCARCITY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-qualification-latest.json');
const DEFAULT_DEMAND = path.join(ROOT, 'reports', 'kidult100-right-data', 'wikimedia-demand-evidence-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-source-feasibility-latest.json');
const PRODUCTION_UNIVERSE_FLOOR = 300;

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

const packetsReport = readJsonInput(process.env.KIDULTS_CALIBRATION_FEASIBILITY_PACKETS_JSON, DEFAULT_PACKETS);
const rightData = readJsonInput(process.env.KIDULTS_CALIBRATION_FEASIBILITY_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const scarcity = readJsonInput(process.env.KIDULTS_CALIBRATION_FEASIBILITY_SCARCITY_JSON, DEFAULT_SCARCITY);
const demand = readJsonInput(process.env.KIDULTS_CALIBRATION_FEASIBILITY_DEMAND_JSON, DEFAULT_DEMAND);
const outRaw = process.env.KIDULTS_CALIBRATION_FEASIBILITY_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const structuralErrors = [];

if (packetsReport?.mode !== 'KIDULT100_CALIBRATION_DISCOVERY_WORK_PACKETS') structuralErrors.push('INVALID_CALIBRATION_PACKET_MODE');
if (Number(packetsReport?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_CALIBRATION_PACKETS_HAVE_STRUCTURAL_ERRORS');
for (const [field, unsafe] of Object.entries({
  newEvidenceCreated: true,
  normalizedScoresGenerated: true,
  sourceQualificationImplied: true,
  sourceFeasibilityClaimed: true,
  syntheticOrEstimatedEvidenceCreated: true,
  unauthorizedScrapingRequested: true,
  providerProcurementRequested: true,
  contractsOrPaidCommitmentsRequested: true,
  authorizationBypassRequested: true,
  rightsOrProvenanceRequirementsWeakened: true,
  productionScoringActivated: true,
  calibrationSufficiencyCertified: true,
  outOfSampleValidationCertified: true,
})) {
  if (packetsReport?.claims?.[field] === unsafe) structuralErrors.push(`UNSAFE_UPSTREAM_PACKET_CLAIM:${field}`);
}

if (rightData?.mode !== 'KIDULT100_RIGHT_DATA_ENRICHMENT') structuralErrors.push('INVALID_RIGHT_DATA_MODE');
const relevantCandidates = integer(rightData?.metrics?.semanticRelevantCandidates);
if (relevantCandidates == null) structuralErrors.push('INVALID_RELEVANT_CANDIDATE_COUNT');

if (scarcity?.mode !== 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX') structuralErrors.push('INVALID_SCARCITY_QUALIFICATION_MODE');
if (Number(scarcity?.metrics?.structuralErrors || 0) !== 0) structuralErrors.push('UPSTREAM_SCARCITY_QUALIFICATION_HAS_STRUCTURAL_ERRORS');
if (scarcity?.sourceContract?.requiredSignalType !== 'TOTAL_PRODUCED'
  || scarcity?.sourceContract?.commercialReuseRightsRequired !== true
  || scarcity?.sourceContract?.provenanceRequired !== true
  || scarcity?.sourceContract?.automatedAccessDocumentationRequired !== true) {
  structuralErrors.push('SCARCITY_SOURCE_CONTRACT_NOT_FAIL_CLOSED');
}
for (const field of ['syntheticOrEstimatedEvidenceCreated', 'inferredScarcityCreated', 'unauthorizedScrapingRequested', 'paidProviderProcurementRequested', 'contractExecutionRequested', 'productionScoringActivated']) {
  if (scarcity?.safety?.[field] !== false) structuralErrors.push(`UNSAFE_SCARCITY_QUALIFICATION_STATE:${field}`);
}

if (demand?.mode !== 'KIDULT100_WIKIMEDIA_ANALYTICS_DEMAND_EVIDENCE') structuralErrors.push('INVALID_DEMAND_EVIDENCE_MODE');
if (demand?.source?.id !== 'wikimedia-analytics'
  || demand?.source?.license !== 'CC0-1.0'
  || demand?.source?.unauthorizedScrapingAllowed !== false
  || demand?.source?.paidProviderRequired !== false) {
  structuralErrors.push('DEMAND_OPEN_SOURCE_CONTRACT_NOT_FAIL_CLOSED');
}
if (demand?.claims?.rightsClassifiedInputs !== true || demand?.claims?.provenanceRecorded !== true) structuralErrors.push('DEMAND_RIGHTS_PROVENANCE_NOT_VERIFIED');
for (const field of ['normalizedScoresGenerated', 'marketDemandClaimed', 'transactionOrLiquidityClaimed', 'syntheticOrEstimatedEvidenceUsed', 'unauthorizedScrapingUsed', 'paidProviderUsed']) {
  if (demand?.claims?.[field] !== false) structuralErrors.push(`UNSAFE_DEMAND_EVIDENCE_STATE:${field}`);
}

const packets = Array.isArray(packetsReport?.packets) ? packetsReport.packets : [];
const cellResults = Array.isArray(packetsReport?.cellResults) ? packetsReport.cellResults : [];
if (packets.length === 0 && Number(packetsReport?.metrics?.discoveryPackets || 0) > 0) structuralErrors.push('MISSING_CALIBRATION_PACKETS');
if (cellResults.length === 0) structuralErrors.push('MISSING_CALIBRATION_CELL_RESULTS');

const currentDemandEvidence = new Set((Array.isArray(demand?.evidence) ? demand.evidence : [])
  .filter((row) => row?.primitive === 'DEMAND_ATTENTION' && row?.candidateKey)
  .map((row) => row.candidateKey));

const packetRoutes = [];
const seenPacketIds = new Set();
let scarcityPackets = 0;
let demandPackets = 0;
let currentQualifiedSourcePathPackets = 0;
let openPathCurrentSignalUnresolvedPackets = 0;
let rightsQualifiedSourceDiscoveryPackets = 0;
let unsupportedDimensionPackets = 0;

for (const packet of packets) {
  if (!packet?.packetId || !packet?.candidateKey || !packet?.dimension || seenPacketIds.has(packet.packetId)) {
    structuralErrors.push(seenPacketIds.has(packet?.packetId) ? `DUPLICATE_PACKET_ID:${packet.packetId}` : 'INVALID_PACKET_IDENTITY');
    continue;
  }
  seenPacketIds.add(packet.packetId);

  let sourceFeasibilityStatus;
  let nextSafeAction;
  let rationale;
  if (packet.dimension === 'SCARCITY') {
    scarcityPackets += 1;
    const qualifiedCount = integer(scarcity?.metrics?.automaticallyQualifiedSources);
    if (qualifiedCount == null) {
      structuralErrors.push('INVALID_SCARCITY_QUALIFIED_SOURCE_COUNT');
      sourceFeasibilityStatus = 'FAIL_CLOSED_INVALID_SCARCITY_SOURCE_STATE';
      nextSafeAction = 'REPAIR_SCARCITY_QUALIFICATION_STATE';
      rationale = 'Scarcity source qualification count is invalid.';
    } else if (qualifiedCount === 0) {
      rightsQualifiedSourceDiscoveryPackets += 1;
      sourceFeasibilityStatus = 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED';
      nextSafeAction = 'DISCOVER_OFFICIAL_OR_OPEN_RIGHTS_TOTAL_PRODUCED_SOURCE';
      rationale = 'Current scarcity qualification has zero automatically qualified sources; no packet may be treated as source-ready.';
    } else {
      sourceFeasibilityStatus = 'QUALIFIED_SCARCITY_SOURCE_EXISTS_PACKET_MATCH_UNPROVEN';
      nextSafeAction = 'MATCH_PACKET_TO_QUALIFIED_SOURCE_WITHOUT_CREATING_EVIDENCE';
      rationale = 'A qualified scarcity source exists globally, but candidate-level source applicability is not established by this router.';
    }
  } else if (packet.dimension === 'DEMAND_ATTENTION') {
    demandPackets += 1;
    if (currentDemandEvidence.has(packet.candidateKey)) {
      structuralErrors.push(`DEMAND_PACKET_ALREADY_HAS_CURRENT_ELIGIBLE_EVIDENCE:${packet.candidateKey}`);
      sourceFeasibilityStatus = 'FAIL_CLOSED_STALE_DEMAND_PACKET';
      nextSafeAction = 'REBUILD_CALIBRATION_PACKETS_FROM_CURRENT_RIGHT_DATA';
      rationale = 'Packet conflicts with current demand evidence and is stale.';
    } else {
      openPathCurrentSignalUnresolvedPackets += 1;
      sourceFeasibilityStatus = 'OFFICIAL_OPEN_PATH_AVAILABLE_CURRENT_SIGNAL_UNRESOLVED';
      nextSafeAction = 'DIAGNOSE_WIKIMEDIA_SIGNAL_AVAILABILITY_WITH_OFFICIAL_APIS_ONLY';
      rationale = 'Wikimedia Analytics is an allowed CC0 official API path, but the current run produced no eligible demand evidence for this packet.';
    }
  } else {
    unsupportedDimensionPackets += 1;
    structuralErrors.push(`UNSUPPORTED_DISCOVERY_PACKET_DIMENSION:${packet.dimension}`);
    sourceFeasibilityStatus = 'FAIL_CLOSED_UNSUPPORTED_DIMENSION';
    nextSafeAction = 'REPAIR_PACKET_ROUTING';
    rationale = 'No source-feasibility route is defined for this discovery packet dimension.';
  }

  packetRoutes.push({
    packetId: packet.packetId,
    candidateKey: packet.candidateKey,
    dimension: packet.dimension,
    vertical: packet.vertical,
    allowedSignalTypes: packet.allowedSignalTypes || [],
    sourceFeasibilityStatus,
    sourceQualifiedForEvidenceCollection: false,
    evidenceCreated: false,
    nextSafeAction,
    rationale,
  });
}

const shortfallByVertical = {};
let evidenceUnitCandidateSupplyShortfall = 0;
for (const cell of cellResults) {
  const gap = integer(cell?.unfilledCandidateSupplyGap);
  if (!cell?.vertical || !cell?.dimension || gap == null) {
    structuralErrors.push(`INVALID_CELL_SHORTFALL:${cell?.dimension || 'MISSING'}:${cell?.vertical || 'MISSING'}`);
    continue;
  }
  evidenceUnitCandidateSupplyShortfall += gap;
  if (!shortfallByVertical[cell.vertical]) shortfallByVertical[cell.vertical] = { byDimension: {}, conditionalMinimumNetNewCandidates: 0 };
  shortfallByVertical[cell.vertical].byDimension[cell.dimension] = gap;
  shortfallByVertical[cell.vertical].conditionalMinimumNetNewCandidates = Math.max(shortfallByVertical[cell.vertical].conditionalMinimumNetNewCandidates, gap);
}

const reportedSupplyShortfall = integer(packetsReport?.metrics?.totalUnfilledCandidateSupplyGap);
if (reportedSupplyShortfall == null || reportedSupplyShortfall !== evidenceUnitCandidateSupplyShortfall) {
  structuralErrors.push(`CANDIDATE_SUPPLY_SHORTFALL_MISMATCH:${reportedSupplyShortfall}:${evidenceUnitCandidateSupplyShortfall}`);
}
const conditionalMinimumNetNewForOperationalReference = Object.values(shortfallByVertical)
  .reduce((sum, row) => sum + row.conditionalMinimumNetNewCandidates, 0);
const minimumNetNewForProductionUniverse = relevantCandidates == null ? null : Math.max(0, PRODUCTION_UNIVERSE_FLOOR - relevantCandidates);
const minimumCombinedNetNewRelevantCandidates = minimumNetNewForProductionUniverse == null
  ? null
  : Math.max(minimumNetNewForProductionUniverse, conditionalMinimumNetNewForOperationalReference);
const additionalCandidatesBeyondVerticalFloor = minimumNetNewForProductionUniverse == null
  ? null
  : Math.max(0, minimumNetNewForProductionUniverse - conditionalMinimumNetNewForOperationalReference);

const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_CALIBRATION_SOURCE_FEASIBILITY_STATE'
  : minimumCombinedNetNewRelevantCandidates > 0
    ? 'SOURCE_FEASIBILITY_AND_CANDIDATE_UNIVERSE_EXPANSION_REQUIRED'
    : rightsQualifiedSourceDiscoveryPackets > 0 || openPathCurrentSignalUnresolvedPackets > 0
      ? 'SOURCE_FEASIBILITY_WORK_REMAINS_REQUIRED'
      : 'NO_OPEN_CALIBRATION_SOURCE_FEASIBILITY_GAP_DETECTED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CALIBRATION_SOURCE_FEASIBILITY_ROUTER',
  generatedAt: new Date().toISOString(),
  productionUniverseFloor: PRODUCTION_UNIVERSE_FLOOR,
  metrics: {
    relevantCandidates,
    packets: packetRoutes.length,
    scarcityPackets,
    demandPackets,
    currentQualifiedSourcePathPackets,
    openPathCurrentSignalUnresolvedPackets,
    rightsQualifiedSourceDiscoveryPackets,
    unsupportedDimensionPackets,
    evidenceUnitCandidateSupplyShortfall,
    conditionalMinimumNetNewForOperationalReference,
    minimumNetNewForProductionUniverse,
    minimumCombinedNetNewRelevantCandidates,
    additionalCandidatesBeyondVerticalFloor,
    structuralErrorCount: structuralErrors.length,
  },
  candidateExpansion: {
    shortfallByVertical,
    interpretation: 'conditionalMinimumNetNewCandidates is a lower bound only: it assumes each net-new semantic-relevant candidate can eventually supply every missing non-market dimension for its vertical. It is not evidence or calibration certification.',
  },
  packetRoutes,
  structuralErrors,
  disposition,
  claims: {
    planningOnly: true,
    newEvidenceCreated: false,
    normalizedScoresGenerated: false,
    sourceQualificationFabricated: false,
    sourceFeasibilityCertificationFabricated: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractExecutionRequested: false,
    authorizationBypassRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    productionScoringActivated: false,
    calibrationSufficiencyCertified: false,
    outOfSampleValidationCertified: false,
    candidateExpansionCountClaimedAsObservedEvidence: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Calibration feasibility: packets=${packetRoutes.length} scarcityDiscovery=${rightsQualifiedSourceDiscoveryPackets} demandOpenUnresolved=${openPathCurrentSignalUnresolvedPackets}`);
console.log(`candidateSupplyUnits=${evidenceUnitCandidateSupplyShortfall} verticalLowerBound=${conditionalMinimumNetNewForOperationalReference} universeGap=${minimumNetNewForProductionUniverse} combinedMin=${minimumCombinedNetNewRelevantCandidates}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
