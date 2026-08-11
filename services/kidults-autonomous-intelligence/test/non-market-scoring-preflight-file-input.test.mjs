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
  'toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories',
  'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia',
];

function baselineContract() {
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
      id, primitive, scoreField,
      methodologyStatus: 'NOT_VALIDATED',
      methodologyVersion: null,
      normalizationMethod: null,
      calibrationEvidence: null,
      outOfSampleValidationEvidence: null,
      productionActivation: false,
    })),
    verticals: VERTICALS.map((id) => ({
      id,
      status: 'NOT_VALIDATED',
      normalizationMethod: null,
      calibrationEvidence: null,
      outOfSampleValidationEvidence: null,
    })),
  };
}

test('non-market preflight accepts repository-style JSON file inputs without changing readiness', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-non-market-files-'));
  const contractPath = path.join(tmp, 'contract.json');
  const rankingPath = path.join(tmp, 'ranking.json');
  const rightDataPath = path.join(tmp, 'right-data.json');
  const outPath = path.join(tmp, 'out.json');
  fs.writeFileSync(contractPath, JSON.stringify(baselineContract()));
  fs.writeFileSync(rankingPath, JSON.stringify({
    scoring: {
      evidenceMapping: Object.fromEntries(DIMENSIONS.map(([id, primitive, scoreField]) => [id, { primitive, scoreField }])),
    },
  }));
  fs.writeFileSync(rightDataPath, JSON.stringify({ candidates: [] }));
  const result = spawnSync(process.execPath, ['scripts/kidult100-non-market-scoring-preflight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_NON_MARKET_SCORING_CONTRACT_JSON: contractPath,
      KIDULTS_NON_MARKET_RANKING_POLICY_JSON: rankingPath,
      KIDULTS_NON_MARKET_RIGHT_DATA_JSON: rightDataPath,
      KIDULTS_NON_MARKET_SCORING_PREFLIGHT_OUTPUT: outPath,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.equal(report.disposition, 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED');
  assert.equal(report.metrics.structuralErrorCount, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});
