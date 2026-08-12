import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const dimensions = {
  MARKET_TRANSACTION_STRENGTH: [0.25, 'TRANSACTION_PRICE_COMPARABLE', 'normalizedScore'],
  SCARCITY: [0.20, 'SCARCITY', 'normalizedScore'],
  DEMAND_ATTENTION: [0.15, 'DEMAND_ATTENTION', 'normalizedScore'],
  LIQUIDITY: [0.15, 'LIQUIDITY', 'normalizedScore'],
  CANON_CULTURAL_STRENGTH: [0.15, 'CANON_CULTURAL_STRENGTH', 'normalizedScore'],
  MOMENTUM: [0.05, 'TRANSACTION_PRICE_COMPARABLE', 'momentumScore'],
  RISK_CONFIDENCE: [0.05, 'RISK_CONFIDENCE', 'score'],
};

function policy() {
  return {
    mode: 'TEST',
    pocGate: { minimumRankableCandidates: 1 },
    scoring: {
      minimumEvidenceWeightCoverage: 0.95,
      weights: Object.fromEntries(Object.entries(dimensions).map(([key, [weight]]) => [key, weight])),
      evidenceMapping: Object.fromEntries(Object.entries(dimensions).map(([key, [, primitive, scoreField]]) => [key, { primitive, scoreField }])),
    },
  };
}

function evidence(primitive, value) {
  return { primitive, value };
}

function candidate(key, rows = []) {
  return {
    candidateKey: key,
    vertical: 'toys-models',
    canonicalTitle: key,
    semanticRelevant: true,
    rightData: { evidence: rows },
  };
}

function nonMarketPreflight(disposition, semanticRelevantCandidates = 1) {
  return {
    mode: 'KIDULT100_NON_MARKET_SCORING_PREFLIGHT',
    metrics: {
      semanticRelevantCandidates,
      structuralErrorCount: 0,
    },
    structuralErrors: [],
    disposition,
    claims: {
      methodologyDesignComplete: disposition !== 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED',
      calibrationStillRequired: disposition === 'NON_MARKET_SCORING_CALIBRATION_REQUIRED',
      productionScoringCertified: disposition === 'NON_MARKET_SCORING_CONTRACT_READY',
    },
  };
}

function run(p = policy(), candidates = [], preflight = null) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rank-gap-'));
  const out = path.join(tmp, 'out.json');
  const env = {
    ...process.env,
    KIDULTS_RANKABILITY_POLICY_JSON: JSON.stringify(p),
    KIDULTS_RANKABILITY_RIGHT_DATA_JSON: JSON.stringify({ candidates }),
    KIDULTS_RANKABILITY_GAP_OUTPUT: out,
    ...(preflight ? { KIDULTS_RANKABILITY_NON_MARKET_PREFLIGHT_JSON: JSON.stringify(preflight) } : {}),
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-rankability-gap-plan.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

function runWithFiles(p, candidates) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rank-gap-files-'));
  const policyPath = path.join(tmp, 'policy.json');
  const dataPath = path.join(tmp, 'right-data.json');
  const out = path.join(tmp, 'out.json');
  fs.writeFileSync(policyPath, JSON.stringify(p));
  fs.writeFileSync(dataPath, JSON.stringify({ candidates }));
  const env = {
    ...process.env,
    KIDULTS_RANKABILITY_POLICY_JSON: policyPath,
    KIDULTS_RANKABILITY_RIGHT_DATA_JSON: dataPath,
    KIDULTS_RANKABILITY_GAP_OUTPUT: out,
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-rankability-gap-plan.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('market-only acquisition cannot unlock a risk-only candidate under 95 percent scoring coverage', () => {
  const rows = [evidence('RISK_CONFIDENCE', { score: 0.9 })];
  const { result, report } = run(policy(), [candidate('risk-only', rows)]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const row = report.candidatePriorities[0];
  assert.equal(row.currentEvidenceWeightCoverage, 0.05);
  assert.equal(row.marketOnlyPotentialCoverage, 0.5);
  assert.equal(row.additionalNonMarketWeightRequiredAfterMarket, 0.45);
  assert.equal(row.marketOnlyCouldReachRankable, false);
  assert.equal(report.disposition, 'NON_MARKET_SCORING_CONTRACT_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET');
  assert.equal(report.claims.hypotheticalMarketEvidenceCreditedAsCurrent, false);
});

test('design-ready non-market methodology routes to real calibration and validation evidence instead of a missing contract', () => {
  const rows = [
    evidence('SCARCITY', { totalProduced: 1000 }),
    evidence('DEMAND_ATTENTION', { sitelinkCount: 20 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const preflight = nonMarketPreflight('NON_MARKET_SCORING_CALIBRATION_REQUIRED');
  const { result, report } = run(policy(), [candidate('calibration-needed', rows)], preflight);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.nonMarketScoringPreflight.state, 'CALIBRATION_REQUIRED');
  assert.equal(report.disposition, 'NON_MARKET_CALIBRATION_AND_VALIDATION_EVIDENCE_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET');
  assert.equal(report.claims.nonMarketCalibrationBypassed, false);
  assert.equal(report.claims.rankabilityCertified, false);
});

test('methodology-required preflight stays fail-closed before market-only acquisition', () => {
  const rows = [evidence('RISK_CONFIDENCE', { score: 0.9 })];
  const preflight = nonMarketPreflight('NON_MARKET_SCORING_METHODOLOGY_REQUIRED');
  const { result, report } = run(policy(), [candidate('methodology-needed', rows)], preflight);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.nonMarketScoringPreflight.state, 'METHODOLOGY_REQUIRED');
  assert.equal(report.disposition, 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED_BEFORE_MARKET_ONLY_ACQUISITION_CAN_UNLOCK_TARGET');
  assert.equal(report.claims.rankabilityCertified, false);
});

test('production-certified preflight permits existing score readiness logic without inventing evidence', () => {
  const rows = [
    evidence('SCARCITY', { normalizedScore: 0.7 }),
    evidence('DEMAND_ATTENTION', { normalizedScore: 0.6 }),
    evidence('CANON_CULTURAL_STRENGTH', { normalizedScore: 0.8 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const preflight = nonMarketPreflight('NON_MARKET_SCORING_CONTRACT_READY');
  const { result, report } = run(policy(), [candidate('ready-with-preflight', rows)], preflight);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.nonMarketScoringPreflight.state, 'READY');
  assert.equal(report.disposition, 'MARKET_EVIDENCE_CAN_UNLOCK_RANKABILITY_TARGET_WITH_CURRENT_NON_MARKET_SCORING');
  assert.equal(report.claims.rankabilityCertified, false);
});

test('stale or mismatched non-market preflight fails closed', () => {
  const preflight = nonMarketPreflight('NON_MARKET_SCORING_CALIBRATION_REQUIRED', 2);
  const { result, report } = run(policy(), [candidate('one-candidate')], preflight);
  assert.notEqual(result.status, 0);
  assert.equal(report, null);
  assert.match(result.stderr, /Invalid non-market scoring preflight: CANDIDATE_COUNT_MISMATCH/);
});

test('inconsistent calibration and ready preflight claims fail closed', () => {
  const calibration = nonMarketPreflight('NON_MARKET_SCORING_CALIBRATION_REQUIRED');
  calibration.claims.calibrationStillRequired = false;
  const first = run(policy(), [candidate('calibration-claim-mismatch')], calibration);
  assert.notEqual(first.result.status, 0);
  assert.equal(first.report, null);
  assert.match(first.result.stderr, /CALIBRATION_STATE_CLAIM_MISMATCH/);

  const ready = nonMarketPreflight('NON_MARKET_SCORING_CONTRACT_READY');
  ready.claims.productionScoringCertified = false;
  const second = run(policy(), [candidate('ready-claim-mismatch')], ready);
  assert.notEqual(second.result.status, 0);
  assert.equal(second.report, null);
  assert.match(second.result.stderr, /READY_STATE_CERTIFICATION_MISMATCH/);
});

test('candidate with scoring-ready scarcity demand canon and risk can be unlocked by compliant market scoring', () => {
  const rows = [
    evidence('SCARCITY', { normalizedScore: 0.7 }),
    evidence('DEMAND_ATTENTION', { normalizedScore: 0.6 }),
    evidence('CANON_CULTURAL_STRENGTH', { normalizedScore: 0.8 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const { result, report } = run(policy(), [candidate('ready-for-market', rows)]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const row = report.candidatePriorities[0];
  assert.equal(row.currentEvidenceWeightCoverage, 0.55);
  assert.equal(row.marketOnlyPotentialCoverage, 1);
  assert.equal(row.marketOnlyCouldReachRankable, true);
  assert.equal(report.disposition, 'MARKET_EVIDENCE_CAN_UNLOCK_RANKABILITY_TARGET_WITH_CURRENT_NON_MARKET_SCORING');
});

test('raw primitive evidence without required score fields is measured but never credited as scoring coverage', () => {
  const rows = [
    evidence('SCARCITY', { totalProduced: 1000 }),
    evidence('DEMAND_ATTENTION', { sitelinkCount: 20 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const { result, report } = run(policy(), [candidate('raw-only', rows)]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.dimensionReadiness.SCARCITY.rawEvidenceCandidates, 1);
  assert.equal(report.metrics.dimensionReadiness.SCARCITY.scoreReadyCandidates, 0);
  assert.equal(report.metrics.dimensionReadiness.SCARCITY.rawButUnnormalizedCandidates, 1);
  assert.equal(report.metrics.dimensionReadiness.DEMAND_ATTENTION.rawButUnnormalizedCandidates, 1);
  assert.equal(report.candidatePriorities[0].currentEvidenceWeightCoverage, 0.05);
  assert.ok(report.candidatePriorities[0].missingScoringDimensions.some((row) => row.reason === 'MISSING_VALID_SCORE_FIELD'));
});

test('already rankable candidate is reported without changing the gate', () => {
  const rows = [
    evidence('TRANSACTION_PRICE_COMPARABLE', { normalizedScore: 0.8, momentumScore: 0.7 }),
    evidence('SCARCITY', { normalizedScore: 0.7 }),
    evidence('DEMAND_ATTENTION', { normalizedScore: 0.6 }),
    evidence('LIQUIDITY', { normalizedScore: 0.5 }),
    evidence('CANON_CULTURAL_STRENGTH', { normalizedScore: 0.8 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const { result, report } = run(policy(), [candidate('rankable', rows)]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.currentRankableCandidates, 1);
  assert.equal(report.disposition, 'RANKABILITY_GATE_MET');
  assert.equal(report.claims.rankabilityCertified, true);
});

test('file inputs and deterministic priority sorting cover every non-market gap comparison', () => {
  const fullyNonMarketReady = [
    evidence('SCARCITY', { normalizedScore: 0.7 }),
    evidence('DEMAND_ATTENTION', { normalizedScore: 0.6 }),
    evidence('CANON_CULTURAL_STRENGTH', { normalizedScore: 0.8 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const rawHeavy = [
    evidence('SCARCITY', { totalProduced: 1000 }),
    evidence('DEMAND_ATTENTION', { sitelinkCount: 20 }),
    evidence('RISK_CONFIDENCE', { score: 0.9 }),
  ];
  const riskOnly = [evidence('RISK_CONFIDENCE', { score: 0.9 })];
  const rows = [
    candidate('z-risk', riskOnly),
    candidate('a-market-ready', fullyNonMarketReady),
    candidate('b-raw-heavy', rawHeavy),
    candidate('a-risk', riskOnly),
    candidate('no-risk', []),
  ];
  const { result, report } = runWithFiles(policy(), rows);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(report.candidatePriorities.map((row) => row.candidateKey), [
    'a-market-ready',
    'b-raw-heavy',
    'a-risk',
    'z-risk',
    'no-risk',
  ]);
});

test('invalid scoring policy fails closed', () => {
  const badCoverage = policy();
  badCoverage.scoring.minimumEvidenceWeightCoverage = 0;
  const first = run(badCoverage, []);
  assert.notEqual(first.result.status, 0);
  assert.match(first.result.stderr, /Invalid ranking policy scoring contract/);

  const badMapping = policy();
  delete badMapping.scoring.evidenceMapping.SCARCITY.scoreField;
  const second = run(badMapping, []);
  assert.notEqual(second.result.status, 0);
  assert.match(second.result.stderr, /Invalid ranking policy dimension mapping/);

  const badWeights = policy();
  badWeights.scoring.weights.SCARCITY = 0.1;
  const third = run(badWeights, []);
  assert.notEqual(third.result.status, 0);
  assert.match(third.result.stderr, /Ranking weights must sum to 1/);
});
