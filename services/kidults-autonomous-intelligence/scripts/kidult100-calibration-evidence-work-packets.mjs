import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_PRIORITY = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-evidence-acquisition-priority-latest.json');
const DEFAULT_CONTRACT = path.join(ROOT, 'config', 'kidult100-non-market-scoring-contract.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-evidence-work-packets-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const priority = readJsonInput(process.env.KIDULTS_CALIBRATION_WORK_PRIORITY_JSON, DEFAULT_PRIORITY);
const contract = readJsonInput(process.env.KIDULTS_CALIBRATION_WORK_CONTRACT_JSON, DEFAULT_CONTRACT);
const outRaw = process.env.KIDULTS_CALIBRATION_WORK_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const structuralErrors = [];

if (priority?.mode !== 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY') structuralErrors.push('INVALID_PRIORITY_MODE');
if (Number(priority?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_PRIORITY_HAS_STRUCTURAL_ERRORS');
if (priority?.claims?.normalizedScoresGenerated !== false || priority?.claims?.productionScoringActivated !== false) structuralErrors.push('UPSTREAM_SCORING_STATE_UNSAFE');
if (priority?.claims?.syntheticOrEstimatedEvidenceCreated !== false || priority?.claims?.rightsOrProvenanceRequirementsWeakened !== false) structuralErrors.push('UPSTREAM_EVIDENCE_SAFETY_STATE_UNSAFE');
if (contract?.policy !== 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION') structuralErrors.push('INVALID_SCORING_CONTRACT_POLICY');
if (contract?.global?.requiresCalibrationEvidence !== true || contract?.global?.requiresOutOfSampleValidation !== true) structuralErrors.push('CALIBRATION_VALIDATION_REQUIREMENT_NOT_LOCKED');
if (contract?.global?.requiresRightsClassifiedInputs !== true || contract?.global?.requiresProvenance !== true) structuralErrors.push('RIGHTS_PROVENANCE_REQUIREMENT_NOT_LOCKED');
if (contract?.global?.syntheticCalibrationMayActivateProductionScoring !== false || contract?.global?.automaticActivationAllowed !== false) structuralErrors.push('SCORING_ACTIVATION_SAFETY_NOT_LOCKED');

const dimensions = Array.isArray(contract?.dimensions) ? contract.dimensions : [];
const dimensionById = new Map();
for (const dimension of dimensions) {
  if (!dimension?.id || dimensionById.has(dimension.id)) {
    structuralErrors.push(dimensionById.has(dimension?.id) ? `DUPLICATE_CONTRACT_DIMENSION:${dimension.id}` : 'INVALID_CONTRACT_DIMENSION');
    continue;
  }
  dimensionById.set(dimension.id, dimension);
}

const priorities = Array.isArray(priority?.priorities) ? priority.priorities : [];
const packets = [];
const seen = new Set();
for (const cell of priorities) {
  if (!(Number(cell?.operationalReferenceGap) > 0)) continue;
  const cellKey = `${cell?.dimension || ''}:${cell?.vertical || ''}`;
  if (!cell?.dimension || !cell?.vertical || seen.has(cellKey)) {
    structuralErrors.push(seen.has(cellKey) ? `DUPLICATE_PACKET_CELL:${cellKey}` : `INVALID_PACKET_CELL:${cellKey}`);
    continue;
  }
  seen.add(cellKey);
  const dimension = dimensionById.get(cell.dimension);
  if (!dimension) {
    structuralErrors.push(`MISSING_CONTRACT_DIMENSION:${cell.dimension}`);
    continue;
  }
  const allowedSignalTypes = Array.isArray(dimension.allowedRawSignalTypes) ? dimension.allowedRawSignalTypes.filter(Boolean) : [];
  if (dimension.methodologyStatus !== 'DESIGN_READY' || dimension.productionActivation !== false || allowedSignalTypes.length === 0) {
    structuralErrors.push(`UNSAFE_OR_INCOMPLETE_DIMENSION_METHOD:${cell.dimension}`);
    continue;
  }
  packets.push({
    packetId: `calibration:${cell.dimension}:${cell.vertical}`,
    dimension: cell.dimension,
    primitive: cell.primitive || dimension.primitive || null,
    vertical: cell.vertical,
    methodologyVersion: dimension.methodologyVersion || null,
    methodologyStatus: dimension.methodologyStatus,
    currentEligibleEvidence: Number(cell.calibrationEligibleCandidates || 0),
    operationalReferenceGap: Number(cell.operationalReferenceGap),
    zeroEligibleSupply: cell.calibrationEligibleCandidates === 0,
    actionClass: cell.actionClass || null,
    allowedRawSignalTypes: [...allowedSignalTypes],
    acquisitionBoundary: {
      rightsQualifiedInputsOnly: true,
      provenanceRequired: true,
      sourceUrlRequired: true,
      observedAtRequired: true,
      payloadSha256Required: true,
      syntheticOrEstimatedEvidenceAllowed: false,
      unauthorizedScrapingAllowed: false,
      providerProcurementAllowed: false,
      contractExecutionAllowed: false,
      authorizationRequestAllowed: false,
    },
    scoringBoundary: {
      normalizedScoreGenerationAllowed: false,
      productionActivationAllowed: false,
      operationalReferenceIsStatisticalCertification: false,
      independentOutOfSampleValidationRequired: true,
    },
    disposition: 'RIGHTS_QUALIFIED_CALIBRATION_EVIDENCE_REQUIRED',
  });
}

packets.sort((a, b) => Number(b.zeroEligibleSupply) - Number(a.zeroEligibleSupply)
  || b.operationalReferenceGap - a.operationalReferenceGap
  || a.dimension.localeCompare(b.dimension)
  || a.vertical.localeCompare(b.vertical));

const totalGap = packets.reduce((sum, packet) => sum + packet.operationalReferenceGap, 0);
const zeroEligiblePackets = packets.filter((packet) => packet.zeroEligibleSupply).length;
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_CALIBRATION_WORK_PACKET_INPUT'
  : packets.length === 0
    ? 'NO_CALIBRATION_EVIDENCE_WORK_PACKETS_REQUIRED_FOR_OPERATIONAL_REFERENCE'
    : 'CALIBRATION_EVIDENCE_WORK_PACKETS_READY';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CALIBRATION_EVIDENCE_WORK_PACKETS',
  generatedAt: new Date().toISOString(),
  methodologyDesignVersion: [...new Set(packets.map((packet) => packet.methodologyVersion).filter(Boolean))],
  metrics: {
    packets: packets.length,
    zeroEligiblePackets,
    totalOperationalReferenceGap: totalGap,
    structuralErrorCount: structuralErrors.length,
  },
  packets,
  structuralErrors,
  disposition,
  claims: {
    planningOnly: true,
    evidenceCreated: false,
    normalizedScoresGenerated: false,
    calibrationCertified: false,
    outOfSampleValidationCertified: false,
    productionScoringActivated: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractExecutionRequested: false,
    authorizationRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Calibration evidence work packets: packets=${packets.length} zeroEligible=${zeroEligiblePackets} totalGap=${totalGap} errors=${structuralErrors.length}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
