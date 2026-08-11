import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_SHAPE = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-evidence-shape-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-evidence-acquisition-priority-latest.json');

const PRIORITY_ORDER = new Map([
  ['EXPLICIT_EVIDENCE_RECORDIZATION', 0],
  ['RAW_SIGNAL_CONTRACT_REPAIR', 1],
  ['RIGHTS_PROVENANCE_SAFETY_REPAIR', 2],
  ['ALLOWED_RAW_SIGNAL_ACQUISITION', 3],
  ['ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION', 4],
  ['METHOD_DESIGN_HOLD', 5],
]);

const ACTION_CLASS = {
  EXPLICIT_EVIDENCE_RECORDIZATION: 'USE_EXISTING_RIGHTS_CLASSIFIED_METADATA',
  RAW_SIGNAL_CONTRACT_REPAIR: 'REVIEW_EXISTING_RAW_EVIDENCE_SHAPE',
  RIGHTS_PROVENANCE_SAFETY_REPAIR: 'REPAIR_EXISTING_EVIDENCE_ATTESTATION',
  ALLOWED_RAW_SIGNAL_ACQUISITION: 'ACQUIRE_ONLY_RIGHTS_QUALIFIED_ALLOWED_SIGNALS',
  ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION: 'EXPAND_RIGHTS_QUALIFIED_ELIGIBLE_SUPPLY',
  METHOD_DESIGN_HOLD: 'NO_ACQUISITION_ACTION_REQUIRED_FOR_OPERATIONAL_REFERENCE',
};

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

const shape = readJsonInput(process.env.KIDULTS_NON_MARKET_ACQUISITION_SHAPE_JSON, DEFAULT_SHAPE);
const outRaw = process.env.KIDULTS_NON_MARKET_ACQUISITION_PRIORITY_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const structuralErrors = [];

if (shape?.mode !== 'KIDULT100_CALIBRATION_EVIDENCE_SHAPE_PLAN') structuralErrors.push('INVALID_CALIBRATION_SHAPE_MODE');
if (Number(shape?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_CALIBRATION_SHAPE_HAS_STRUCTURAL_ERRORS');
if (shape?.claims?.normalizedScoresGenerated !== false) structuralErrors.push('UPSTREAM_SCORE_GENERATION_STATE_UNSAFE');
if (shape?.claims?.syntheticOrEstimatedEvidenceCountedEligible !== false) structuralErrors.push('UPSTREAM_SYNTHETIC_ELIGIBILITY_STATE_UNSAFE');
if (shape?.claims?.calibrationSufficiencyCertified !== false) structuralErrors.push('UNEXPECTED_CALIBRATION_CERTIFICATION');

const reference = integer(shape?.operationalReference?.minimumCandidatesPerVertical);
if (reference == null || reference <= 0) structuralErrors.push('INVALID_OPERATIONAL_REFERENCE');
const inputCells = Array.isArray(shape?.priorities) ? shape.priorities : [];
if (inputCells.length === 0) structuralErrors.push('MISSING_DIMENSION_VERTICAL_CELLS');

const seen = new Set();
const cells = [];
for (const cell of inputCells) {
  const key = `${cell?.dimension || ''}:${cell?.vertical || ''}`;
  if (!cell?.dimension || !cell?.vertical || seen.has(key)) {
    structuralErrors.push(seen.has(key) ? `DUPLICATE_CELL:${key}` : `INVALID_CELL_IDENTITY:${key}`);
    continue;
  }
  seen.add(key);

  const relevantCandidates = integer(cell?.relevantCandidates);
  const eligible = integer(cell?.calibrationEligibleCandidates);
  const rawEvidence = integer(cell?.rawEvidenceCandidates);
  const primitivePresent = integer(cell?.primitivePresentCandidates);
  const gap = integer(cell?.operationalReferenceGap);
  if ([relevantCandidates, eligible, rawEvidence, primitivePresent, gap].some((value) => value == null)) {
    structuralErrors.push(`INVALID_CELL_METRICS:${key}`);
    continue;
  }
  if (!PRIORITY_ORDER.has(cell?.priority)) {
    structuralErrors.push(`UNKNOWN_CELL_PRIORITY:${key}:${cell?.priority || 'MISSING'}`);
    continue;
  }
  const expectedGap = Math.max(0, reference - eligible);
  if (gap !== expectedGap) structuralErrors.push(`INCONSISTENT_OPERATIONAL_GAP:${key}:${gap}:${expectedGap}`);

  cells.push({
    dimension: cell.dimension,
    primitive: cell.primitive || null,
    vertical: cell.vertical,
    relevantCandidates,
    primitivePresentCandidates: primitivePresent,
    rawEvidenceCandidates: rawEvidence,
    calibrationEligibleCandidates: eligible,
    operationalReferenceGap: expectedGap,
    meetsOperationalReference: expectedGap === 0,
    upstreamPriority: cell.priority,
    actionClass: ACTION_CLASS[cell.priority],
    acquisitionNeeded: expectedGap > 0,
    zeroEligibleSupply: eligible === 0,
    existingEvidenceLeverage: Math.max(0, rawEvidence - eligible),
  });
}

cells.sort((a, b) => Number(b.zeroEligibleSupply) - Number(a.zeroEligibleSupply)
  || PRIORITY_ORDER.get(a.upstreamPriority) - PRIORITY_ORDER.get(b.upstreamPriority)
  || b.operationalReferenceGap - a.operationalReferenceGap
  || b.existingEvidenceLeverage - a.existingEvidenceLeverage
  || a.dimension.localeCompare(b.dimension)
  || a.vertical.localeCompare(b.vertical));

function summarize(field) {
  const result = {};
  for (const cell of cells) {
    const id = cell[field];
    if (!result[id]) result[id] = {
      cells: 0,
      cellsBelowOperationalReference: 0,
      zeroEligibleCells: 0,
      eligibleCandidates: 0,
      operationalReferenceGap: 0,
    };
    const row = result[id];
    row.cells += 1;
    row.cellsBelowOperationalReference += Number(cell.operationalReferenceGap > 0);
    row.zeroEligibleCells += Number(cell.zeroEligibleSupply);
    row.eligibleCandidates += cell.calibrationEligibleCandidates;
    row.operationalReferenceGap += cell.operationalReferenceGap;
  }
  return result;
}

const cellsBelowOperationalReference = cells.filter((cell) => cell.operationalReferenceGap > 0).length;
const zeroEligibleCells = cells.filter((cell) => cell.zeroEligibleSupply).length;
const totalOperationalReferenceGap = cells.reduce((sum, cell) => sum + cell.operationalReferenceGap, 0);
const existingEvidenceRepairCells = cells.filter((cell) => ['EXPLICIT_EVIDENCE_RECORDIZATION', 'RAW_SIGNAL_CONTRACT_REPAIR', 'RIGHTS_PROVENANCE_SAFETY_REPAIR'].includes(cell.upstreamPriority)).length;
const externalSignalAcquisitionCells = cells.filter((cell) => ['ALLOWED_RAW_SIGNAL_ACQUISITION', 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'].includes(cell.upstreamPriority) && cell.operationalReferenceGap > 0).length;

const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_NON_MARKET_ACQUISITION_PLAN'
  : cellsBelowOperationalReference === 0
    ? 'OPERATIONAL_REFERENCE_FILLED_METHOD_VALIDATION_STILL_REQUIRED'
    : existingEvidenceRepairCells > 0
      ? 'USE_EXISTING_RIGHTS_QUALIFIED_EVIDENCE_BEFORE_NEW_ACQUISITION'
      : 'RIGHTS_QUALIFIED_EVIDENCE_EXPANSION_REQUIRED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY',
  generatedAt: new Date().toISOString(),
  operationalReference: {
    minimumCandidatesPerVertical: reference,
    statisticalCalibrationThreshold: null,
    note: 'Gap counts are against the existing operational reference only. They do not certify statistical calibration sufficiency.',
  },
  metrics: {
    dimensionVerticalCells: cells.length,
    cellsBelowOperationalReference,
    zeroEligibleCells,
    totalOperationalReferenceGap,
    existingEvidenceRepairCells,
    externalSignalAcquisitionCells,
    structuralErrorCount: structuralErrors.length,
    byDimension: summarize('dimension'),
    byVertical: summarize('vertical'),
  },
  priorities: cells,
  structuralErrors,
  disposition,
  claims: {
    normalizedScoresGenerated: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractsOrPaidCommitmentsRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    operationalReferenceClaimedAsStatisticalSufficiency: false,
    productionScoringActivated: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Non-market acquisition priority: cells=${cells.length} belowReference=${cellsBelowOperationalReference} zeroEligible=${zeroEligibleCells} totalGap=${totalOperationalReferenceGap}`);
console.log(`existingRepairCells=${existingEvidenceRepairCells} externalAcquisitionCells=${externalSignalAcquisitionCells} disposition=${disposition}`);

if (structuralErrors.length > 0) process.exitCode = 1;
