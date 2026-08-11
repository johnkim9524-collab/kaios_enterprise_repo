import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_CONTRACT = path.join(ROOT, 'config', 'kidult100-non-market-scoring-contract.json');
const DEFAULT_RANKING = path.join(ROOT, 'config', 'kidult100-ranking-policy.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-scoring-preflight-latest.json');
const ALLOWED_STATUS = new Set(['NOT_VALIDATED', 'VALIDATED']);

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function resolveEvidenceReference(value) {
  if (!value || typeof value !== 'string') return { valid: false, reason: 'MISSING_EVIDENCE_REFERENCE' };
  const resolved = path.isAbsolute(value) ? value : path.join(ROOT, value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return { valid: false, reason: 'EVIDENCE_FILE_NOT_FOUND' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch {
    return { valid: false, reason: 'INVALID_EVIDENCE_JSON' };
  }
  const mode = String(parsed?.mode || '');
  if (/SYNTHETIC|SIMULATION|FIXTURE/i.test(mode)) return { valid: false, reason: 'NON_PRODUCTION_EVIDENCE_MODE' };
  if (parsed?.claims?.rightsClassifiedInputs !== true) return { valid: false, reason: 'RIGHTS_CLASSIFICATION_NOT_ATTESTED' };
  if (parsed?.claims?.provenanceRecorded !== true) return { valid: false, reason: 'PROVENANCE_NOT_ATTESTED' };
  return { valid: true, reason: null, resolved };
}

function exactSet(values) {
  return [...new Set(values)].sort();
}

function scoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

const contract = readJsonInput(process.env.KIDULTS_NON_MARKET_SCORING_CONTRACT_JSON, DEFAULT_CONTRACT);
const ranking = readJsonInput(process.env.KIDULTS_NON_MARKET_RANKING_POLICY_JSON, DEFAULT_RANKING);
const rightData = readJsonInput(process.env.KIDULTS_NON_MARKET_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const outRaw = process.env.KIDULTS_NON_MARKET_SCORING_PREFLIGHT_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);

const structuralErrors = [];
const global = contract?.global || {};
const requiredDimensions = Array.isArray(global.requiredDimensions) ? global.requiredDimensions : [];
const requiredVerticals = Array.isArray(global.requiredVerticals) ? global.requiredVerticals : [];
const dimensions = Array.isArray(contract?.dimensions) ? contract.dimensions : [];
const verticals = Array.isArray(contract?.verticals) ? contract.verticals : [];

if (contract?.policy !== 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION') structuralErrors.push('INVALID_POLICY');
if (global.requiresVerticalSpecificNormalization !== true) structuralErrors.push('VERTICAL_NORMALIZATION_MUST_BE_REQUIRED');
if (global.requiresVersionedMethodology !== true) structuralErrors.push('VERSIONED_METHODOLOGY_MUST_BE_REQUIRED');
if (global.requiresCalibrationEvidence !== true) structuralErrors.push('CALIBRATION_EVIDENCE_MUST_BE_REQUIRED');
if (global.requiresOutOfSampleValidation !== true) structuralErrors.push('OUT_OF_SAMPLE_VALIDATION_MUST_BE_REQUIRED');
if (global.requiresRightsClassifiedInputs !== true) structuralErrors.push('RIGHTS_CLASSIFIED_INPUTS_MUST_BE_REQUIRED');
if (global.requiresProvenance !== true) structuralErrors.push('PROVENANCE_MUST_BE_REQUIRED');
if (global.rawPrimitivePresenceMayBeCreditedAsScore !== false) structuralErrors.push('RAW_PRIMITIVE_CANNOT_BE_SCORE');
if (global.rawEvidenceMayBeCreditedWithoutRequiredScoreField !== false) structuralErrors.push('RAW_EVIDENCE_WITHOUT_SCORE_FIELD_CANNOT_BE_SCORE');
if (global.syntheticCalibrationMayActivateProductionScoring !== false) structuralErrors.push('SYNTHETIC_CALIBRATION_CANNOT_ACTIVATE_PRODUCTION');
if (global.automaticActivationAllowed !== false) structuralErrors.push('AUTOMATIC_ACTIVATION_MUST_BE_DISABLED');
if (JSON.stringify(global.scoreRange) !== JSON.stringify([0, 1])) structuralErrors.push('INVALID_SCORE_RANGE');

const dimensionIds = dimensions.map((row) => row?.id).filter(Boolean);
if (JSON.stringify(exactSet(dimensionIds)) !== JSON.stringify(exactSet(requiredDimensions))) structuralErrors.push('DIMENSION_TOPOLOGY_MISMATCH');
const verticalIds = verticals.map((row) => row?.id).filter(Boolean);
if (JSON.stringify(exactSet(verticalIds)) !== JSON.stringify(exactSet(requiredVerticals))) structuralErrors.push('VERTICAL_TOPOLOGY_MISMATCH');

const rankingMapping = ranking?.scoring?.evidenceMapping || {};
const dimensionAudit = {};
for (const dimension of dimensions) {
  const id = dimension?.id;
  if (!id) continue;
  const mapping = rankingMapping[id];
  const errors = [];
  if (!mapping) errors.push('RANKING_MAPPING_MISSING');
  if (mapping && mapping.primitive !== dimension.primitive) errors.push('PRIMITIVE_MAPPING_MISMATCH');
  if (mapping && mapping.scoreField !== dimension.scoreField) errors.push('SCORE_FIELD_MAPPING_MISMATCH');
  if (!ALLOWED_STATUS.has(dimension.methodologyStatus)) errors.push('INVALID_METHODOLOGY_STATUS');
  if (dimension.productionActivation !== false && dimension.productionActivation !== true) errors.push('INVALID_PRODUCTION_ACTIVATION');
  if (dimension.productionActivation === true && dimension.methodologyStatus !== 'VALIDATED') errors.push('ACTIVATION_WITHOUT_VALIDATED_METHODOLOGY');

  const calibration = resolveEvidenceReference(dimension.calibrationEvidence);
  const validation = resolveEvidenceReference(dimension.outOfSampleValidationEvidence);
  const methodMetadataReady = dimension.methodologyStatus === 'VALIDATED'
    && typeof dimension.methodologyVersion === 'string' && dimension.methodologyVersion.length > 0
    && typeof dimension.normalizationMethod === 'string' && dimension.normalizationMethod.length > 0;
  const activationReady = methodMetadataReady && calibration.valid && validation.valid;
  if (dimension.productionActivation === true && !activationReady) errors.push('ACTIVATION_EVIDENCE_INCOMPLETE');
  if (errors.length) structuralErrors.push(...errors.map((error) => `${id}:${error}`));

  dimensionAudit[id] = {
    primitive: dimension.primitive,
    scoreField: dimension.scoreField,
    methodologyStatus: dimension.methodologyStatus,
    productionActivation: dimension.productionActivation,
    methodMetadataReady,
    calibrationEvidenceValid: calibration.valid,
    calibrationEvidenceReason: calibration.reason,
    outOfSampleValidationEvidenceValid: validation.valid,
    outOfSampleValidationEvidenceReason: validation.reason,
    activationReady,
  };
}

const verticalAudit = {};
for (const vertical of verticals) {
  const id = vertical?.id;
  if (!id) continue;
  const errors = [];
  if (!ALLOWED_STATUS.has(vertical.status)) errors.push('INVALID_VERTICAL_STATUS');
  const calibration = resolveEvidenceReference(vertical.calibrationEvidence);
  const validation = resolveEvidenceReference(vertical.outOfSampleValidationEvidence);
  const methodMetadataReady = vertical.status === 'VALIDATED'
    && typeof vertical.normalizationMethod === 'string' && vertical.normalizationMethod.length > 0;
  const ready = methodMetadataReady && calibration.valid && validation.valid;
  if (vertical.status === 'VALIDATED' && !ready) errors.push('VALIDATED_VERTICAL_EVIDENCE_INCOMPLETE');
  if (errors.length) structuralErrors.push(...errors.map((error) => `${id}:${error}`));
  verticalAudit[id] = {
    status: vertical.status,
    methodMetadataReady,
    calibrationEvidenceValid: calibration.valid,
    outOfSampleValidationEvidenceValid: validation.valid,
    ready,
  };
}

const relevant = (rightData?.candidates || []).filter((candidate) => candidate?.semanticRelevant === true);
const evidenceMetrics = {};
let prematureScoringCandidates = 0;
for (const dimension of dimensions) {
  const id = dimension.id;
  const primitive = dimension.primitive;
  const scoreField = dimension.scoreField;
  let primitivePresentCandidates = 0;
  let scoringEvidenceCandidates = 0;
  let validScoreFieldCandidates = 0;
  let rawButUnnormalizedCandidates = 0;
  const rawSignalTypes = {};

  for (const candidate of relevant) {
    const primitives = new Set(candidate?.rightData?.primitives || []);
    if (primitives.has(primitive)) primitivePresentCandidates += 1;
    const records = (candidate?.rightData?.evidence || []).filter((row) => row?.primitive === primitive);
    if (records.length > 0) scoringEvidenceCandidates += 1;
    const hasScore = records.some((row) => scoreValue(row?.value?.[scoreField]));
    if (hasScore) validScoreFieldCandidates += 1;
    else if (records.length > 0) rawButUnnormalizedCandidates += 1;
    for (const row of records) {
      const signalType = row?.value?.signalType;
      if (signalType) rawSignalTypes[signalType] = (rawSignalTypes[signalType] || 0) + 1;
    }
  }

  const activated = dimensionAudit[id]?.productionActivation === true && dimensionAudit[id]?.activationReady === true
    && Object.values(verticalAudit).every((row) => row.ready);
  if (!activated && validScoreFieldCandidates > 0) prematureScoringCandidates += validScoreFieldCandidates;
  evidenceMetrics[id] = {
    primitivePresentCandidates,
    scoringEvidenceCandidates,
    validScoreFieldCandidates,
    rawButUnnormalizedCandidates,
    rawSignalTypes,
    productionScoringActivated: activated,
  };
}

if (prematureScoringCandidates > 0) structuralErrors.push('UNVALIDATED_NON_MARKET_SCORE_RECORDS_PRESENT');
const activatedDimensions = Object.values(evidenceMetrics).filter((row) => row.productionScoringActivated).length;
const validatedVerticals = Object.values(verticalAudit).filter((row) => row.ready).length;
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_NON_MARKET_SCORING_STATE'
  : activatedDimensions === requiredDimensions.length && validatedVerticals === requiredVerticals.length
    ? 'NON_MARKET_SCORING_CONTRACT_READY'
    : 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_NON_MARKET_SCORING_PREFLIGHT',
  generatedAt: new Date().toISOString(),
  policy: contract?.policy || null,
  metrics: {
    semanticRelevantCandidates: relevant.length,
    requiredDimensions: requiredDimensions.length,
    activatedDimensions,
    requiredVerticals: requiredVerticals.length,
    validatedVerticals,
    prematureScoringCandidates,
    structuralErrorCount: structuralErrors.length,
    evidenceMetrics,
  },
  dimensionAudit,
  verticalAudit,
  structuralErrors,
  disposition,
  claims: {
    normalizedScoresGeneratedByThisAudit: false,
    rawEvidenceCreditedAsNormalizedScore: false,
    primitivePresenceCreditedAsNormalizedScore: false,
    syntheticCalibrationAcceptedForProduction: false,
    automaticProductionActivationPerformed: false,
    productionScoringCertified: disposition === 'NON_MARKET_SCORING_CONTRACT_READY',
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Non-market scoring preflight: relevant=${relevant.length} dimensions=${activatedDimensions}/${requiredDimensions.length} verticals=${validatedVerticals}/${requiredVerticals.length}`);
console.log(`prematureScores=${prematureScoringCandidates} structuralErrors=${structuralErrors.length} disposition=${disposition}`);

if (structuralErrors.length > 0) process.exitCode = 1;
