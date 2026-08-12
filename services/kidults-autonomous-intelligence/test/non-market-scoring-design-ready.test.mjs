import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const DIMENSIONS = [
  ['SCARCITY', 'SCARCITY', 'normalizedScore'],
  ['DEMAND_ATTENTION', 'DEMAND_ATTENTION', 'normalizedScore'],
  ['CANON_CULTURAL_STRENGTH', 'CANON_CULTURAL_STRENGTH', 'normalizedScore'],
];
const VERTICALS = [
  'toys-models',
  'watches-jewelry',
  'automobiles-mobility',
  'fashion-accessories',
  'design-furniture',
  'technology-cameras',
  'gaming-music-screen',
  'cards-comics-memorabilia',
];

function designReadyContract() {
  return {
    policy: 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION',
    global: {
      requiredDimensions: DIMENSIONS.map(([id]) => id),
      requiredVerticals: VERTICALS,
      scoreRange: [0, 1],
      requiresVerticalSpecificNormalization: true,
      requiresVersionedMethodology: true,
      requiresCalibrationEvidence: true,
      requiresOutOfSampleValidation: true,
      requiresRightsClassifiedInputs: true,
      requiresProvenance: true,
      rawPrimitivePresenceMayBeCreditedAsScore: false,
      rawEvidenceMayBeCreditedWithoutRequiredScoreField: false,
      syntheticCalibrationMayActivateProductionScoring: false,
      automaticActivationAllowed: false,
    },
    dimensions: DIMENSIONS.map(([id, primitive, scoreField]) => ({
      id,
      primitive,
      scoreField,
      methodologyStatus: 'DESIGN_READY',
      methodologyVersion: 'design-v1',
      normalizationMethod: 'VERTICAL_SIGNAL_TYPE_EMPIRICAL_PERCENTILE_PENDING_CALIBRATION',
      calibrationEvidence: null,
      outOfSampleValidationEvidence: null,
      productionActivation: false,
    })),
    verticals: VERTICALS.map((id) => ({
      id,
      status: 'DESIGN_READY',
      normalizationMethod: 'WITHIN_VERTICAL_SIGNAL_TYPE_CALIBRATION_PENDING',
      calibrationEvidence: null,
      outOfSampleValidationEvidence: null,
    })),
  };
}

function ranking() {
  return {
    scoring: {
      evidenceMapping: Object.fromEntries(DIMENSIONS.map(([id, primitive, scoreField]) => [id, { primitive, scoreField }])),
    },
  };
}

function run(contract) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-design-ready-'));
  const out = path.join(tmp, 'out.json');
  const result = spawnSync(process.execPath, ['scripts/kidult100-non-market-scoring-preflight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_NON_MARKET_SCORING_CONTRACT_JSON: JSON.stringify(contract),
      KIDULTS_NON_MARKET_RANKING_POLICY_JSON: JSON.stringify(ranking()),
      KIDULTS_NON_MARKET_RIGHT_DATA_JSON: JSON.stringify({ candidates: [] }),
      KIDULTS_NON_MARKET_SCORING_PREFLIGHT_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('design-ready methodology moves the blocker to real calibration without activating scores', () => {
  const { result, report } = run(designReadyContract());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.disposition, 'NON_MARKET_SCORING_CALIBRATION_REQUIRED');
  assert.equal(report.metrics.designReadyDimensions, 3);
  assert.equal(report.metrics.designReadyVerticals, 8);
  assert.equal(report.metrics.activatedDimensions, 0);
  assert.equal(report.metrics.validatedVerticals, 0);
  assert.equal(report.claims.methodologyDesignComplete, true);
  assert.equal(report.claims.calibrationStillRequired, true);
  assert.equal(report.claims.productionScoringCertified, false);
  assert.equal(report.claims.normalizedScoresGeneratedByThisAudit, false);
});

test('design-ready methodology with missing version metadata fails closed', () => {
  const contract = designReadyContract();
  contract.dimensions[0].methodologyVersion = null;
  const { result, report } = run(contract);
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('SCARCITY:DESIGN_METADATA_INCOMPLETE'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_NON_MARKET_SCORING_STATE');
});

test('design-ready methodology cannot activate production scoring', () => {
  const contract = designReadyContract();
  contract.dimensions[0].productionActivation = true;
  const { result, report } = run(contract);
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('SCARCITY:ACTIVATION_WITHOUT_VALIDATED_METHODOLOGY'));
  assert.ok(report.structuralErrors.includes('SCARCITY:ACTIVATION_EVIDENCE_INCOMPLETE'));
  assert.equal(report.claims.productionScoringCertified, false);
});
