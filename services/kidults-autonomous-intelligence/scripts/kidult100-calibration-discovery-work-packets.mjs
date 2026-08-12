import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_PRIORITY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-evidence-acquisition-priority-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_CONTRACT = path.join(ROOT, 'config', 'kidult100-non-market-scoring-contract.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-discovery-work-packets-latest.json');

const EXTERNAL_DISCOVERY_PRIORITIES = new Set([
  'ALLOWED_RAW_SIGNAL_ACQUISITION',
  'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION',
]);

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function provenanceComplete(record) {
  return nonEmpty(record?.sourceUrl)
    && String(record.sourceUrl).startsWith('https://')
    && nonEmpty(record?.payloadHash)
    && Number.isFinite(Date.parse(record?.observedAt || ''));
}

function safeRealEvidence(record) {
  return record?.safety?.synthetic !== true && record?.safety?.estimated !== true;
}

function hasEligibleEvidence(candidate, definition) {
  const allowedSignals = new Set(definition.allowedRawSignalTypes || []);
  return (candidate?.rightData?.evidence || []).some((record) => record?.primitive === definition.primitive
    && allowedSignals.has(record?.value?.signalType)
    && nonEmpty(record?.rightsClass)
    && provenanceComplete(record)
    && safeRealEvidence(record));
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

const priority = readJsonInput(process.env.KIDULTS_CALIBRATION_DISCOVERY_PRIORITY_JSON, DEFAULT_PRIORITY);
const rightData = readJsonInput(process.env.KIDULTS_CALIBRATION_DISCOVERY_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const contract = readJsonInput(process.env.KIDULTS_CALIBRATION_DISCOVERY_CONTRACT_JSON, DEFAULT_CONTRACT);
const outRaw = process.env.KIDULTS_CALIBRATION_DISCOVERY_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const structuralErrors = [];

if (priority?.mode !== 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY') structuralErrors.push('INVALID_ACQUISITION_PRIORITY_MODE');
if (Number(priority?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_ACQUISITION_PRIORITY_HAS_STRUCTURAL_ERRORS');
if (priority?.claims?.normalizedScoresGenerated !== false) structuralErrors.push('UPSTREAM_SCORE_GENERATION_STATE_UNSAFE');
if (priority?.claims?.syntheticOrEstimatedEvidenceCreated !== false) structuralErrors.push('UPSTREAM_SYNTHETIC_EVIDENCE_STATE_UNSAFE');
if (priority?.claims?.unauthorizedScrapingRequested !== false) structuralErrors.push('UPSTREAM_UNAUTHORIZED_SCRAPING_STATE_UNSAFE');
if (priority?.claims?.providerProcurementRequested !== false) structuralErrors.push('UPSTREAM_PROVIDER_PROCUREMENT_STATE_UNSAFE');
if (priority?.claims?.contractsOrPaidCommitmentsRequested !== false) structuralErrors.push('UPSTREAM_CONTRACT_STATE_UNSAFE');
if (priority?.claims?.rightsOrProvenanceRequirementsWeakened !== false) structuralErrors.push('UPSTREAM_RIGHTS_PROVENANCE_STATE_UNSAFE');
if (priority?.claims?.productionScoringActivated !== false) structuralErrors.push('UPSTREAM_PRODUCTION_SCORING_STATE_UNSAFE');
if (rightData?.mode !== 'KIDULT100_RIGHT_DATA_ENRICHMENT') structuralErrors.push('INVALID_RIGHT_DATA_MODE');
if (contract?.policy !== 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION') structuralErrors.push('INVALID_NON_MARKET_SCORING_POLICY');

const definitions = new Map((contract?.dimensions || []).filter((row) => row?.id).map((row) => [row.id, row]));
const cells = Array.isArray(priority?.priorities) ? priority.priorities : [];
const candidates = Array.isArray(rightData?.candidates) ? rightData.candidates : [];
if (cells.length === 0) structuralErrors.push('MISSING_ACQUISITION_PRIORITY_CELLS');
if (candidates.length === 0) structuralErrors.push('MISSING_RIGHT_DATA_CANDIDATES');

const packets = [];
const cellResults = [];
const packetIds = new Set();
let internalRepairFirstCells = 0;
let externalDiscoveryCells = 0;
let externalDiscoveryCellsWithPackets = 0;
let totalRequestedGap = 0;
let totalUnfilledCandidateSupplyGap = 0;

for (const cell of cells) {
  const key = `${cell?.dimension || ''}:${cell?.vertical || ''}`;
  const definition = definitions.get(cell?.dimension);
  const gap = integer(cell?.operationalReferenceGap);
  if (!cell?.dimension || !cell?.vertical || !definition) {
    structuralErrors.push(`INVALID_OR_UNKNOWN_CELL_IDENTITY:${key}`);
    continue;
  }
  if (definition.primitive !== cell?.primitive) {
    structuralErrors.push(`PRIMITIVE_MISMATCH:${key}`);
    continue;
  }
  if (gap == null) {
    structuralErrors.push(`INVALID_OPERATIONAL_REFERENCE_GAP:${key}`);
    continue;
  }

  const isExternalDiscovery = EXTERNAL_DISCOVERY_PRIORITIES.has(cell?.upstreamPriority) && gap > 0;
  if (!isExternalDiscovery) {
    if (gap > 0) internalRepairFirstCells += 1;
    cellResults.push({
      dimension: cell.dimension,
      vertical: cell.vertical,
      upstreamPriority: cell.upstreamPriority,
      operationalReferenceGap: gap,
      discoveryPacketCount: 0,
      unfilledCandidateSupplyGap: 0,
      disposition: gap > 0 ? 'EXISTING_EVIDENCE_REPAIR_OR_NON_DISCOVERY_ACTION_FIRST' : 'NO_DISCOVERY_REQUIRED',
    });
    continue;
  }

  externalDiscoveryCells += 1;
  totalRequestedGap += gap;
  const eligibleCandidates = candidates
    .filter((candidate) => candidate?.semanticRelevant === true
      && candidate?.vertical === cell.vertical
      && nonEmpty(candidate?.candidateKey)
      && !hasEligibleEvidence(candidate, definition))
    .sort((a, b) => String(a.candidateKey).localeCompare(String(b.candidateKey)));
  const selected = eligibleCandidates.slice(0, gap);
  const unfilledCandidateSupplyGap = Math.max(0, gap - selected.length);
  totalUnfilledCandidateSupplyGap += unfilledCandidateSupplyGap;
  if (selected.length > 0) externalDiscoveryCellsWithPackets += 1;

  for (const candidate of selected) {
    const packetId = `calibration:${cell.dimension}:${cell.vertical}:${candidate.candidateKey}`;
    if (packetIds.has(packetId)) {
      structuralErrors.push(`DUPLICATE_DISCOVERY_PACKET:${packetId}`);
      continue;
    }
    packetIds.add(packetId);
    packets.push({
      packetId,
      candidateKey: candidate.candidateKey,
      candidateTitle: candidate.title || candidate.label || null,
      dimension: cell.dimension,
      primitive: definition.primitive,
      vertical: cell.vertical,
      methodologyVersion: definition.methodologyVersion || null,
      allowedSignalTypes: [...(definition.allowedRawSignalTypes || [])].sort(),
      status: 'DISCOVERY_REQUIRED',
      sourceQualificationRequired: true,
      sourceFeasibilityClaimed: false,
      requiredEvidenceFields: ['candidateKey', 'primitive', 'sourceUrl', 'rightsClass', 'observedAt', 'payloadHash', 'evidenceClass', 'value.signalType'],
      requiredSafety: {
        httpsSourceUrl: true,
        explicitRightsClassification: true,
        provenanceComplete: true,
        syntheticAllowed: false,
        estimatedAllowed: false,
        normalizedScoreAllowedAtDiscovery: false,
      },
      allowedAcquisitionMethods: [
        'OFFICIAL_PUBLIC_API',
        'OFFICIAL_PUBLIC_DOWNLOAD',
        'EXPLICIT_OPEN_LICENSED_DATA',
        'MANUAL_SOURCE_REVIEW_WITH_RIGHTS_CLEARANCE',
      ],
      prohibitedActions: [
        'UNAUTHORIZED_SCRAPING',
        'PAID_PROVIDER_PROCUREMENT',
        'CONTRACT_EXECUTION',
        'AUTHORIZATION_BYPASS',
        'SYNTHETIC_EVIDENCE_CREATION',
        'ESTIMATED_EVIDENCE_SUBSTITUTION',
        'NORMALIZED_SCORE_FABRICATION',
      ],
      nextAction: 'DISCOVER_AND_ATTEST_RIGHTS_QUALIFIED_SOURCE_ONLY',
    });
  }

  cellResults.push({
    dimension: cell.dimension,
    vertical: cell.vertical,
    upstreamPriority: cell.upstreamPriority,
    operationalReferenceGap: gap,
    safeCandidateSupply: eligibleCandidates.length,
    discoveryPacketCount: selected.length,
    unfilledCandidateSupplyGap,
    disposition: selected.length === 0
      ? 'NO_SAFE_CANDIDATE_SUPPLY_FOR_DISCOVERY'
      : unfilledCandidateSupplyGap > 0
        ? 'DISCOVERY_PACKETS_READY_WITH_CANDIDATE_SUPPLY_SHORTFALL'
        : 'DISCOVERY_PACKETS_READY',
  });
}

packets.sort((a, b) => a.dimension.localeCompare(b.dimension)
  || a.vertical.localeCompare(b.vertical)
  || String(a.candidateKey).localeCompare(String(b.candidateKey)));
cellResults.sort((a, b) => a.dimension.localeCompare(b.dimension) || a.vertical.localeCompare(b.vertical));

const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_CALIBRATION_DISCOVERY_STATE'
  : externalDiscoveryCells === 0
    ? 'NO_EXTERNAL_CALIBRATION_DISCOVERY_REQUIRED'
    : packets.length === 0
      ? 'NO_SAFE_CANDIDATE_SUPPLY_FOR_CALIBRATION_DISCOVERY'
      : totalUnfilledCandidateSupplyGap > 0
        ? 'CALIBRATION_DISCOVERY_WORK_PACKETS_READY_WITH_CANDIDATE_SUPPLY_SHORTFALL'
        : 'CALIBRATION_DISCOVERY_WORK_PACKETS_READY_NO_SOURCE_FEASIBILITY_CLAIM';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CALIBRATION_DISCOVERY_WORK_PACKETS',
  generatedAt: new Date().toISOString(),
  metrics: {
    acquisitionPriorityCells: cells.length,
    internalRepairFirstCells,
    externalDiscoveryCells,
    externalDiscoveryCellsWithPackets,
    totalRequestedGap,
    discoveryPackets: packets.length,
    totalUnfilledCandidateSupplyGap,
    structuralErrorCount: structuralErrors.length,
  },
  cellResults,
  packets,
  structuralErrors,
  disposition,
  claims: {
    newEvidenceCreated: false,
    normalizedScoresGenerated: false,
    sourceQualificationImplied: false,
    sourceFeasibilityClaimed: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractsOrPaidCommitmentsRequested: false,
    authorizationBypassRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    productionScoringActivated: false,
    calibrationSufficiencyCertified: false,
    outOfSampleValidationCertified: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Calibration discovery packets: externalCells=${externalDiscoveryCells} packets=${packets.length} requestedGap=${totalRequestedGap} candidateSupplyShortfall=${totalUnfilledCandidateSupplyGap}`);
console.log(`internalRepairFirstCells=${internalRepairFirstCells} disposition=${disposition}`);

if (structuralErrors.length > 0) process.exitCode = 1;
