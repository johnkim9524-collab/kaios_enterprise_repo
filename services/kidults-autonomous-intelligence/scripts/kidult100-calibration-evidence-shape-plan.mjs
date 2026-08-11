import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_CONTRACT = path.join(ROOT, 'config', 'kidult100-non-market-scoring-contract.json');
const DEFAULT_SOURCE_PLAN = path.join(ROOT, 'config', 'kidult100-poc-source-plan.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-calibration-evidence-shape-latest.json');

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

function validScore(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

function provenanceComplete(record) {
  return nonEmpty(record?.sourceUrl)
    && nonEmpty(record?.payloadHash)
    && Number.isFinite(Date.parse(record?.observedAt || ''));
}

function safeRealEvidence(record) {
  return record?.safety?.synthetic !== true && record?.safety?.estimated !== true;
}

const contract = readJsonInput(process.env.KIDULTS_CALIBRATION_CONTRACT_JSON, DEFAULT_CONTRACT);
const sourcePlan = readJsonInput(process.env.KIDULTS_CALIBRATION_SOURCE_PLAN_JSON, DEFAULT_SOURCE_PLAN);
const rightData = readJsonInput(process.env.KIDULTS_CALIBRATION_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const outRaw = process.env.KIDULTS_CALIBRATION_EVIDENCE_SHAPE_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);

const structuralErrors = [];
const requiredDimensions = Array.isArray(contract?.global?.requiredDimensions) ? contract.global.requiredDimensions : [];
const requiredVerticals = Array.isArray(contract?.global?.requiredVerticals) ? contract.global.requiredVerticals : [];
const dimensionDefs = Array.isArray(contract?.dimensions) ? contract.dimensions : [];
const sourceVerticals = Array.isArray(sourcePlan?.coreVerticals) ? sourcePlan.coreVerticals.map((row) => row?.id).filter(Boolean) : [];
const operationalReferencePerVertical = Number(sourcePlan?.stage2Gate?.minimumCandidatesPerVertical);

if (contract?.policy !== 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION') structuralErrors.push('INVALID_NON_MARKET_POLICY');
if (!Number.isInteger(operationalReferencePerVertical) || operationalReferencePerVertical <= 0) structuralErrors.push('INVALID_OPERATIONAL_REFERENCE_PER_VERTICAL');
if (JSON.stringify([...new Set(requiredVerticals)].sort()) !== JSON.stringify([...new Set(sourceVerticals)].sort())) structuralErrors.push('VERTICAL_TOPOLOGY_MISMATCH');
const dimensionIds = dimensionDefs.map((row) => row?.id).filter(Boolean);
if (JSON.stringify([...new Set(requiredDimensions)].sort()) !== JSON.stringify([...new Set(dimensionIds)].sort())) structuralErrors.push('DIMENSION_TOPOLOGY_MISMATCH');
for (const definition of dimensionDefs) {
  if (!definition?.id || !definition?.primitive || !definition?.scoreField) structuralErrors.push(`INVALID_DIMENSION_DEFINITION:${definition?.id || 'UNKNOWN'}`);
  if (!Array.isArray(definition?.allowedRawSignalTypes) || definition.allowedRawSignalTypes.length === 0) structuralErrors.push(`MISSING_ALLOWED_SIGNAL_TYPES:${definition?.id || 'UNKNOWN'}`);
}

const relevant = (rightData?.candidates || []).filter((candidate) => candidate?.semanticRelevant === true && requiredVerticals.includes(candidate?.vertical));
const cells = [];
const dimensionSummary = {};
let totalPrematureScoreCandidates = 0;

for (const definition of dimensionDefs) {
  const allowedSignals = new Set(definition.allowedRawSignalTypes || []);
  const dimensionCandidatesWithEligibleEvidence = new Set();
  const dimensionCandidatesWithRawEvidence = new Set();
  const dimensionSignalTypes = new Set();
  let dimensionScoreReadyCandidates = 0;

  for (const vertical of requiredVerticals) {
    const candidates = relevant.filter((candidate) => candidate.vertical === vertical);
    let primitivePresentCandidates = 0;
    let rawEvidenceCandidates = 0;
    let allowedSignalCandidates = 0;
    let calibrationEligibleCandidates = 0;
    let scoreReadyCandidates = 0;
    let allowedSignalRecords = 0;
    let disallowedSignalRecords = 0;
    let missingSignalTypeRecords = 0;
    let rightsClassifiedAllowedRecords = 0;
    let provenanceCompleteAllowedRecords = 0;
    let safeRealAllowedRecords = 0;
    const signalTypes = new Set();

    for (const candidate of candidates) {
      const primitives = new Set(candidate?.rightData?.primitives || []);
      if (primitives.has(definition.primitive)) primitivePresentCandidates += 1;
      const records = (candidate?.rightData?.evidence || []).filter((row) => row?.primitive === definition.primitive);
      if (records.length > 0) {
        rawEvidenceCandidates += 1;
        dimensionCandidatesWithRawEvidence.add(candidate.candidateKey);
      }
      if (records.some((row) => validScore(row?.value?.[definition.scoreField]))) scoreReadyCandidates += 1;

      let candidateAllowed = false;
      let candidateEligible = false;
      for (const record of records) {
        const signalType = record?.value?.signalType;
        if (!signalType) {
          missingSignalTypeRecords += 1;
          continue;
        }
        if (!allowedSignals.has(signalType)) {
          disallowedSignalRecords += 1;
          continue;
        }
        candidateAllowed = true;
        allowedSignalRecords += 1;
        signalTypes.add(signalType);
        dimensionSignalTypes.add(signalType);
        const rightsOk = nonEmpty(record?.rightsClass);
        const provenanceOk = provenanceComplete(record);
        const safeReal = safeRealEvidence(record);
        if (rightsOk) rightsClassifiedAllowedRecords += 1;
        if (provenanceOk) provenanceCompleteAllowedRecords += 1;
        if (safeReal) safeRealAllowedRecords += 1;
        if (rightsOk && provenanceOk && safeReal) candidateEligible = true;
      }
      if (candidateAllowed) allowedSignalCandidates += 1;
      if (candidateEligible) {
        calibrationEligibleCandidates += 1;
        dimensionCandidatesWithEligibleEvidence.add(candidate.candidateKey);
      }
    }

    totalPrematureScoreCandidates += scoreReadyCandidates;
    dimensionScoreReadyCandidates += scoreReadyCandidates;
    const primitiveOnlyCandidates = Math.max(0, primitivePresentCandidates - rawEvidenceCandidates);
    const operationalReferenceGap = Math.max(0, operationalReferencePerVertical - calibrationEligibleCandidates);
    let priority = 'METHOD_DESIGN_HOLD';
    if (primitivePresentCandidates > 0 && rawEvidenceCandidates === 0) priority = 'EXPLICIT_EVIDENCE_RECORDIZATION';
    else if (allowedSignalRecords === 0) priority = 'ALLOWED_RAW_SIGNAL_ACQUISITION';
    else if (allowedSignalCandidates < rawEvidenceCandidates) priority = 'RAW_SIGNAL_CONTRACT_REPAIR';
    else if (calibrationEligibleCandidates < allowedSignalCandidates) priority = 'RIGHTS_PROVENANCE_SAFETY_REPAIR';
    else if (operationalReferenceGap > 0) priority = 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION';

    cells.push({
      dimension: definition.id,
      primitive: definition.primitive,
      vertical,
      relevantCandidates: candidates.length,
      primitivePresentCandidates,
      rawEvidenceCandidates,
      allowedSignalCandidates,
      primitiveOnlyCandidates,
      calibrationEligibleCandidates,
      scoreReadyCandidates,
      allowedSignalRecords,
      disallowedSignalRecords,
      missingSignalTypeRecords,
      rightsClassifiedAllowedRecords,
      provenanceCompleteAllowedRecords,
      safeRealAllowedRecords,
      uniqueAllowedSignalTypes: [...signalTypes].sort(),
      operationalReferencePerVertical,
      operationalReferenceGap,
      meetsOperationalReference: calibrationEligibleCandidates >= operationalReferencePerVertical,
      priority,
    });
  }

  dimensionSummary[definition.id] = {
    primitive: definition.primitive,
    rawEvidenceCandidates: dimensionCandidatesWithRawEvidence.size,
    calibrationEligibleCandidates: dimensionCandidatesWithEligibleEvidence.size,
    scoreReadyCandidates: dimensionScoreReadyCandidates,
    uniqueAllowedSignalTypesObserved: [...dimensionSignalTypes].sort(),
  };
}

cells.sort((a, b) => a.calibrationEligibleCandidates - b.calibrationEligibleCandidates
  || b.primitiveOnlyCandidates - a.primitiveOnlyCandidates
  || a.dimension.localeCompare(b.dimension)
  || a.vertical.localeCompare(b.vertical));

const cellsWithEligibleSupply = cells.filter((cell) => cell.calibrationEligibleCandidates > 0).length;
const cellsMeetingOperationalReference = cells.filter((cell) => cell.meetsOperationalReference).length;
const dimensionsWithAnyEligibleSupply = Object.values(dimensionSummary).filter((row) => row.calibrationEligibleCandidates > 0).length;
const dimensionsWithNoExplicitEligibleEvidence = Object.entries(dimensionSummary).filter(([, row]) => row.calibrationEligibleCandidates === 0).map(([id]) => id);

if (totalPrematureScoreCandidates > 0) structuralErrors.push('PREMATURE_NON_MARKET_SCORE_RECORDS_PRESENT');
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_CALIBRATION_EVIDENCE_STATE'
  : dimensionsWithNoExplicitEligibleEvidence.length > 0
    ? 'EXPLICIT_EVIDENCE_SHAPE_GAPS_BLOCK_METHOD_DESIGN'
    : cellsMeetingOperationalReference < cells.length
      ? 'ELIGIBLE_EVIDENCE_SUPPLY_BELOW_OPERATIONAL_REFERENCE'
      : 'EVIDENCE_SHAPE_READY_FOR_METHOD_DESIGN_NOT_CERTIFICATION';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CALIBRATION_EVIDENCE_SHAPE_PLAN',
  generatedAt: new Date().toISOString(),
  policy: contract?.policy || null,
  operationalReference: {
    source: 'stage2Gate.minimumCandidatesPerVertical',
    minimumCandidatesPerVertical: operationalReferencePerVertical,
    statisticalCalibrationThreshold: null,
    note: 'The per-vertical value is an existing production-universe operating reference only. It is not asserted to be statistically sufficient for calibration or out-of-sample validation.',
  },
  metrics: {
    semanticRelevantCandidates: relevant.length,
    dimensions: requiredDimensions.length,
    verticals: requiredVerticals.length,
    dimensionVerticalCells: cells.length,
    cellsWithEligibleSupply,
    cellsMeetingOperationalReference,
    dimensionsWithAnyEligibleSupply,
    dimensionsWithNoExplicitEligibleEvidence,
    prematureScoreCandidates: totalPrematureScoreCandidates,
    structuralErrorCount: structuralErrors.length,
    dimensionSummary,
  },
  priorities: cells,
  structuralErrors,
  disposition,
  claims: {
    normalizedScoresGenerated: false,
    rawPrimitivePresenceCreditedAsCalibrationEvidence: false,
    syntheticOrEstimatedEvidenceCountedEligible: false,
    operationalReferenceClaimedAsStatisticalSufficiency: false,
    calibrationSufficiencyCertified: false,
    outOfSampleValidationCertified: false,
    productionScoringActivated: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Calibration evidence shape: relevant=${relevant.length} cells=${cellsWithEligibleSupply}/${cells.length} operationalReference=${cellsMeetingOperationalReference}/${cells.length}`);
console.log(`dimensionsWithEligibleSupply=${dimensionsWithAnyEligibleSupply}/${requiredDimensions.length} noExplicit=${JSON.stringify(dimensionsWithNoExplicitEligibleEvidence)}`);
console.log(`prematureScores=${totalPrematureScoreCandidates} structuralErrors=${structuralErrors.length} disposition=${disposition}`);

if (structuralErrors.length > 0) process.exitCode = 1;
