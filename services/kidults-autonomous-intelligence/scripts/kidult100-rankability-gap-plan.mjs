import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-ranking-policy.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_NON_MARKET_PREFLIGHT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-non-market-scoring-preflight-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-rankability-gap-latest.json');
const MARKET_PRIMITIVES = new Set(['TRANSACTION_PRICE_COMPARABLE', 'LIQUIDITY']);

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved)) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function classifyNonMarketPreflight(preflight, semanticRelevantCandidates) {
  if (!preflight) {
    return {
      available: false,
      state: 'UNAVAILABLE',
      disposition: null,
      productionScoringCertified: null,
    };
  }

  const errors = [];
  const structuralErrors = Array.isArray(preflight.structuralErrors) ? preflight.structuralErrors : null;
  if (preflight.mode !== 'KIDULT100_NON_MARKET_SCORING_PREFLIGHT') errors.push('MODE_MISMATCH');
  if (!structuralErrors) errors.push('STRUCTURAL_ERRORS_MISSING');
  else if (structuralErrors.length > 0) errors.push('STRUCTURAL_ERRORS_PRESENT');
  if (Number(preflight?.metrics?.structuralErrorCount) !== 0) errors.push('STRUCTURAL_ERROR_COUNT_NONZERO');
  if (Number(preflight?.metrics?.semanticRelevantCandidates) !== semanticRelevantCandidates) errors.push('CANDIDATE_COUNT_MISMATCH');

  let state = null;
  if (preflight.disposition === 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED') {
    state = 'METHODOLOGY_REQUIRED';
    if (preflight?.claims?.productionScoringCertified !== false) errors.push('METHODOLOGY_STATE_CERTIFICATION_MISMATCH');
  } else if (preflight.disposition === 'NON_MARKET_SCORING_CALIBRATION_REQUIRED') {
    state = 'CALIBRATION_REQUIRED';
    if (preflight?.claims?.methodologyDesignComplete !== true
      || preflight?.claims?.calibrationStillRequired !== true
      || preflight?.claims?.productionScoringCertified !== false) {
      errors.push('CALIBRATION_STATE_CLAIM_MISMATCH');
    }
  } else if (preflight.disposition === 'NON_MARKET_SCORING_CONTRACT_READY') {
    state = 'READY';
    if (preflight?.claims?.productionScoringCertified !== true) errors.push('READY_STATE_CERTIFICATION_MISMATCH');
  } else {
    errors.push('UNSUPPORTED_DISPOSITION');
  }

  if (errors.length > 0) throw new Error(`Invalid non-market scoring preflight: ${errors.join(',')}`);
  return {
    available: true,
    state,
    disposition: preflight.disposition,
    productionScoringCertified: preflight.claims.productionScoringCertified,
  };
}

const policy = readJsonInput(process.env.KIDULTS_RANKABILITY_POLICY_JSON, DEFAULT_POLICY);
const rightData = readJsonInput(process.env.KIDULTS_RANKABILITY_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const explicitNonMarketPreflight = String(process.env.KIDULTS_RANKABILITY_NON_MARKET_PREFLIGHT_JSON || '').trim();
const nonMarketPreflightInput = explicitNonMarketPreflight || (fs.existsSync(DEFAULT_NON_MARKET_PREFLIGHT) ? DEFAULT_NON_MARKET_PREFLIGHT : '');
const nonMarketPreflight = nonMarketPreflightInput ? readJsonInput(nonMarketPreflightInput, null) : null;
const outPath = process.env.KIDULTS_RANKABILITY_GAP_OUTPUT
  ? (path.isAbsolute(process.env.KIDULTS_RANKABILITY_GAP_OUTPUT)
      ? process.env.KIDULTS_RANKABILITY_GAP_OUTPUT
      : path.join(ROOT, process.env.KIDULTS_RANKABILITY_GAP_OUTPUT))
  : DEFAULT_OUT;

const weights = policy?.scoring?.weights;
const mapping = policy?.scoring?.evidenceMapping;
const minCoverage = Number(policy?.scoring?.minimumEvidenceWeightCoverage);
const minRankable = Number(policy?.pocGate?.minimumRankableCandidates ?? 100);
if (!weights || !mapping || !Number.isFinite(minCoverage) || minCoverage <= 0 || minCoverage > 1) {
  throw new Error('Invalid ranking policy scoring contract');
}
const dimensions = Object.keys(weights);
if (!dimensions.length) throw new Error('Ranking policy has no scoring dimensions');
const weightSum = dimensions.reduce((sum, dimension) => sum + Number(weights[dimension]), 0);
if (!dimensions.every((dimension) => Number(weights[dimension]) > 0 && mapping[dimension]?.primitive && mapping[dimension]?.scoreField)) {
  throw new Error('Invalid ranking policy dimension mapping');
}
if (Math.abs(weightSum - 1) > 1e-9) throw new Error(`Ranking weights must sum to 1; got ${weightSum}`);

function validScore(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function dimensionState(candidate, dimension) {
  const rule = mapping[dimension];
  const records = (candidate.rightData?.evidence || []).filter((row) => row?.primitive === rule.primitive);
  const scoredRecords = records.filter((row) => validScore(row?.value?.[rule.scoreField]));
  return {
    dimension,
    primitive: rule.primitive,
    scoreField: rule.scoreField,
    weight: Number(weights[dimension]),
    rawEvidencePresent: records.length > 0,
    scoreReady: scoredRecords.length > 0,
    evidenceRecords: records.length,
  };
}

const relevant = (rightData.candidates || []).filter((candidate) => candidate?.semanticRelevant === true);
const nonMarketScoringPreflight = classifyNonMarketPreflight(nonMarketPreflight, relevant.length);
const dimensionReadiness = Object.fromEntries(dimensions.map((dimension) => [dimension, {
  primitive: mapping[dimension].primitive,
  scoreField: mapping[dimension].scoreField,
  weight: Number(weights[dimension]),
  rawEvidenceCandidates: 0,
  scoreReadyCandidates: 0,
  rawButUnnormalizedCandidates: 0,
  missingPrimitiveEvidenceCandidates: 0,
}]));

const candidates = relevant.map((candidate) => {
  const states = dimensions.map((dimension) => dimensionState(candidate, dimension));
  let currentEvidenceWeightCoverage = 0;
  let marketOnlyPotentialCoverage = 0;
  let rawButUnnormalizedNonMarketWeight = 0;
  for (const state of states) {
    const aggregate = dimensionReadiness[state.dimension];
    if (state.rawEvidencePresent) aggregate.rawEvidenceCandidates += 1;
    else aggregate.missingPrimitiveEvidenceCandidates += 1;
    if (state.scoreReady) aggregate.scoreReadyCandidates += 1;
    else if (state.rawEvidencePresent) aggregate.rawButUnnormalizedCandidates += 1;

    if (state.scoreReady) currentEvidenceWeightCoverage += state.weight;
    if (state.scoreReady || MARKET_PRIMITIVES.has(state.primitive)) marketOnlyPotentialCoverage += state.weight;
    if (!MARKET_PRIMITIVES.has(state.primitive) && state.rawEvidencePresent && !state.scoreReady) {
      rawButUnnormalizedNonMarketWeight += state.weight;
    }
  }
  currentEvidenceWeightCoverage = Number(currentEvidenceWeightCoverage.toFixed(6));
  marketOnlyPotentialCoverage = Number(marketOnlyPotentialCoverage.toFixed(6));
  const missingScoringDimensions = states.filter((state) => !state.scoreReady).map((state) => ({
    dimension: state.dimension,
    primitive: state.primitive,
    scoreField: state.scoreField,
    reason: state.rawEvidencePresent ? 'MISSING_VALID_SCORE_FIELD' : 'MISSING_PRIMITIVE_EVIDENCE',
    weight: state.weight,
  }));
  return {
    candidateKey: candidate.candidateKey,
    vertical: candidate.vertical,
    canonicalTitle: candidate.canonicalTitle || null,
    currentEvidenceWeightCoverage,
    rankableNow: currentEvidenceWeightCoverage >= minCoverage,
    marketOnlyPotentialCoverage,
    marketOnlyCouldReachRankable: marketOnlyPotentialCoverage >= minCoverage,
    additionalNonMarketWeightRequiredAfterMarket: Number(Math.max(0, minCoverage - marketOnlyPotentialCoverage).toFixed(6)),
    rawButUnnormalizedNonMarketWeight: Number(rawButUnnormalizedNonMarketWeight.toFixed(6)),
    missingScoringDimensions,
  };
});

candidates.sort((a, b) =>
  Number(b.marketOnlyCouldReachRankable) - Number(a.marketOnlyCouldReachRankable)
  || a.additionalNonMarketWeightRequiredAfterMarket - b.additionalNonMarketWeightRequiredAfterMarket
  || b.currentEvidenceWeightCoverage - a.currentEvidenceWeightCoverage
  || b.rawButUnnormalizedNonMarketWeight - a.rawButUnnormalizedNonMarketWeight
  || String(a.candidateKey).localeCompare(String(b.candidateKey))
);

const currentRankableCandidates = candidates.filter((candidate) => candidate.rankableNow).length;
const marketOnlyCouldReachRankableCandidates = candidates.filter((candidate) => candidate.marketOnlyCouldReachRankable).length;
const marketDependentWeight = dimensions
  .filter((dimension) => MARKET_PRIMITIVES.has(mapping[dimension].primitive))
  .reduce((sum, dimension) => sum + Number(weights[dimension]), 0);
const minimumNonMarketWeightRequiredWithAllMarketDimensions = Math.max(0, minCoverage - marketDependentWeight);
const preflightBlocksProductionScoring = nonMarketScoringPreflight.available && nonMarketScoringPreflight.state !== 'READY';

const disposition = nonMarketScoringPreflight.state === 'CALIBRATION_REQUIRED'
  ? 'NON_MARKET_CALIBRATION_AND_VALIDATION_EVIDENCE_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET'
  : nonMarketScoringPreflight.state === 'METHODOLOGY_REQUIRED'
    ? 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET'
    : currentRankableCandidates >= minRankable && !preflightBlocksProductionScoring
      ? 'RANKABILITY_GATE_MET'
      : marketOnlyCouldReachRankableCandidates >= minRankable && !preflightBlocksProductionScoring
        ? 'MARKET_EVIDENCE_CAN_UNLOCK_RANKABILITY_TARGET_WITH_CURRENT_NON_MARKET_SCORING'
        : nonMarketScoringPreflight.state === 'READY'
          ? 'NON_MARKET_SCORING_EVIDENCE_COVERAGE_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET'
          : 'NON_MARKET_SCORING_CONTRACT_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET';

const rankabilityCertified = currentRankableCandidates >= minRankable && !preflightBlocksProductionScoring;
const report = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_RANKABILITY_GAP_PLAN',
  generatedAt: new Date().toISOString(),
  policyReference: policy.mode || null,
  thresholds: {
    minimumEvidenceWeightCoverage: minCoverage,
    minimumRankableCandidates: minRankable,
    marketDependentWeight: Number(marketDependentWeight.toFixed(6)),
    minimumNonMarketWeightRequiredWithAllMarketDimensions: Number(minimumNonMarketWeightRequiredWithAllMarketDimensions.toFixed(6)),
  },
  metrics: {
    semanticRelevantCandidates: candidates.length,
    currentRankableCandidates,
    marketOnlyCouldReachRankableCandidates,
    candidatesStillNeedingNonMarketScoringAfterFullMarketEvidence: candidates.filter((candidate) => !candidate.marketOnlyCouldReachRankable).length,
    dimensionReadiness,
    nonMarketScoringPreflight,
  },
  disposition,
  claims: {
    syntheticScoreUsed: false,
    estimatedMarketEvidenceUsed: false,
    hypotheticalMarketEvidenceCreditedAsCurrent: false,
    nonMarketCalibrationBypassed: false,
    rankabilityCertified,
  },
  candidatePriorities: candidates,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Rankability gap: relevant=${candidates.length} currentRankable=${currentRankableCandidates} marketOnlyPotential=${marketOnlyCouldReachRankableCandidates}`);
console.log(`marketWeight=${report.thresholds.marketDependentWeight} minimumNonMarketWeight=${report.thresholds.minimumNonMarketWeightRequiredWithAllMarketDimensions}`);
console.log(`nonMarketPreflight=${nonMarketScoringPreflight.state} disposition=${disposition}`);
