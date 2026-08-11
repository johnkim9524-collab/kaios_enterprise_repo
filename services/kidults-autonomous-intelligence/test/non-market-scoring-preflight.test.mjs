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

function contract() {
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

function ranking() {
  return {
    scoring: {
      evidenceMapping: Object.fromEntries(DIMENSIONS.map(([id, primitive, scoreField]) => [id, { primitive, scoreField }])),
    },
  };
}

function candidate(key, { primitives = [], evidence = [] } = {}) {
  return {
    candidateKey: key,
    semanticRelevant: true,
    rightData: { primitives, evidence },
  };
}

function run({ c = contract(), r = ranking(), candidates = [], setup = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-non-market-preflight-'));
  const out = path.join(tmp, 'out.json');
  if (setup) setup(tmp, c);
  const env = {
    ...process.env,
    KIDULTS_NON_MARKET_SCORING_CONTRACT_JSON: JSON.stringify(c),
    KIDULTS_NON_MARKET_RANKING_POLICY_JSON: JSON.stringify(r),
    KIDULTS_NON_MARKET_RIGHT_DATA_JSON: JSON.stringify({ candidates }),
    KIDULTS_NON_MARKET_SCORING_PREFLIGHT_OUTPUT: out,
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-non-market-scoring-preflight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

function writeEvidence(tmp, name, overrides = {}) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({
    mode: 'METHODOLOGY_VALIDATION',
    claims: {
      rightsClassifiedInputs: true,
      provenanceRecorded: true,
    },
    ...overrides,
  }));
  return file;
}

test('baseline contract records raw evidence but never turns it into non-market scores', () => {
  const rows = [
    candidate('a', {
      primitives: ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'],
      evidence: [
        { primitive: 'SCARCITY', value: { signalType: 'TOTAL_PRODUCED', totalProduced: { amount: 1000 } } },
        { primitive: 'DEMAND_ATTENTION', value: { signalType: 'CULTURAL_ATTENTION_PROXY', sitelinkCount: 12 } },
      ],
    }),
    candidate('b', { primitives: ['CANON_CULTURAL_STRENGTH'] }),
    { candidateKey: 'irrelevant', semanticRelevant: false, rightData: { primitives: [], evidence: [] } },
  ];
  const { result, report } = run({ candidates: rows });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.disposition, 'NON_MARKET_SCORING_METHODOLOGY_REQUIRED');
  assert.equal(report.metrics.semanticRelevantCandidates, 2);
  assert.equal(report.metrics.activatedDimensions, 0);
  assert.equal(report.metrics.validatedVerticals, 0);
  assert.equal(report.metrics.evidenceMetrics.SCARCITY.primitivePresentCandidates, 1);
  assert.equal(report.metrics.evidenceMetrics.SCARCITY.rawButUnnormalizedCandidates, 1);
  assert.equal(report.metrics.evidenceMetrics.SCARCITY.rawSignalTypes.TOTAL_PRODUCED, 1);
  assert.equal(report.metrics.evidenceMetrics.CANON_CULTURAL_STRENGTH.scoringEvidenceCandidates, 0);
  assert.equal(report.claims.rawEvidenceCreditedAsNormalizedScore, false);
  assert.equal(report.claims.automaticProductionActivationPerformed, false);
});

test('premature normalized score fails closed while methodology is inactive', () => {
  const rows = [candidate('a', {
    primitives: ['SCARCITY'],
    evidence: [{ primitive: 'SCARCITY', value: { normalizedScore: 0.7 } }],
  })];
  const { result, report } = run({ candidates: rows });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.prematureScoringCandidates, 1);
  assert.ok(report.structuralErrors.includes('UNVALIDATED_NON_MARKET_SCORE_RECORDS_PRESENT'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_NON_MARKET_SCORING_STATE');
});

test('unsafe contract relaxations and ranking mismatches fail closed', () => {
  const c = contract();
  c.policy = 'RELAXED';
  c.global.requiresVerticalSpecificNormalization = false;
  c.global.requiresVersionedMethodology = false;
  c.global.requiresCalibrationEvidence = false;
  c.global.requiresOutOfSampleValidation = false;
  c.global.requiresRightsClassifiedInputs = false;
  c.global.requiresProvenance = false;
  c.global.rawPrimitivePresenceMayBeCreditedAsScore = true;
  c.global.rawEvidenceMayBeCreditedWithoutRequiredScoreField = true;
  c.global.syntheticCalibrationMayActivateProductionScoring = true;
  c.global.automaticActivationAllowed = true;
  c.global.scoreRange = [-1, 1];
  c.dimensions.pop();
  c.verticals.pop();
  c.dimensions[0].methodologyStatus = 'UNKNOWN';
  c.dimensions[0].productionActivation = 'yes';
  const r = ranking();
  r.scoring.evidenceMapping.SCARCITY.primitive = 'OTHER';
  r.scoring.evidenceMapping.DEMAND_ATTENTION.scoreField = 'otherScore';
  const { result, report } = run({ c, r });
  assert.notEqual(result.status, 0);
  assert.ok(report.metrics.structuralErrorCount >= 10);
  assert.ok(report.structuralErrors.includes('INVALID_POLICY'));
  assert.ok(report.structuralErrors.includes('DIMENSION_TOPOLOGY_MISMATCH'));
  assert.ok(report.structuralErrors.includes('VERTICAL_TOPOLOGY_MISMATCH'));
  assert.ok(report.structuralErrors.some((row) => row.includes('PRIMITIVE_MAPPING_MISMATCH')));
  assert.ok(report.structuralErrors.some((row) => row.includes('SCORE_FIELD_MAPPING_MISMATCH')));
});

test('activation request without validated evidence fails closed', () => {
  const c = contract();
  c.dimensions[0].methodologyStatus = 'VALIDATED';
  c.dimensions[0].methodologyVersion = 'v1';
  c.dimensions[0].normalizationMethod = 'VERTICAL_PERCENTILE_CALIBRATION';
  c.dimensions[0].productionActivation = true;
  c.dimensions[0].calibrationEvidence = '/definitely/missing/calibration.json';
  c.dimensions[0].outOfSampleValidationEvidence = '/definitely/missing/validation.json';
  c.verticals[0].status = 'VALIDATED';
  const { result, report } = run({ c });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('SCARCITY:ACTIVATION_EVIDENCE_INCOMPLETE'));
  assert.ok(report.structuralErrors.includes('toys-models:VALIDATED_VERTICAL_EVIDENCE_INCOMPLETE'));
});

test('evidence references reject invalid json, non-production modes and missing attestations', () => {
  const c = contract();
  const { result, report } = run({
    c,
    setup: (tmp, mutable) => {
      const invalid = path.join(tmp, 'invalid.json');
      fs.writeFileSync(invalid, '{not-json');
      const synthetic = writeEvidence(tmp, 'synthetic', { mode: 'SYNTHETIC_CALIBRATION' });
      const noRights = writeEvidence(tmp, 'no-rights', { claims: { rightsClassifiedInputs: false, provenanceRecorded: true } });
      const noProvenance = writeEvidence(tmp, 'no-provenance', { claims: { rightsClassifiedInputs: true, provenanceRecorded: false } });
      mutable.dimensions[0].calibrationEvidence = invalid;
      mutable.dimensions[0].outOfSampleValidationEvidence = synthetic;
      mutable.dimensions[1].calibrationEvidence = noRights;
      mutable.dimensions[1].outOfSampleValidationEvidence = noProvenance;
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.dimensionAudit.SCARCITY.calibrationEvidenceReason, 'INVALID_EVIDENCE_JSON');
  assert.equal(report.dimensionAudit.SCARCITY.outOfSampleValidationEvidenceReason, 'NON_PRODUCTION_EVIDENCE_MODE');
  assert.equal(report.dimensionAudit.DEMAND_ATTENTION.calibrationEvidenceReason, 'RIGHTS_CLASSIFICATION_NOT_ATTESTED');
  assert.equal(report.dimensionAudit.DEMAND_ATTENTION.outOfSampleValidationEvidenceReason, 'PROVENANCE_NOT_ATTESTED');
});

test('fully validated injected contract shape can become ready without generating scores', () => {
  const c = contract();
  const rows = [candidate('a', {
    primitives: DIMENSIONS.map(([, primitive]) => primitive),
    evidence: DIMENSIONS.map(([, primitive, scoreField]) => ({ primitive, value: { [scoreField]: 0.5 } })),
  })];
  const { result, report } = run({
    c,
    candidates: rows,
    setup: (tmp, mutable) => {
      const evidencePath = writeEvidence(tmp, 'validated');
      for (const dimension of mutable.dimensions) {
        dimension.methodologyStatus = 'VALIDATED';
        dimension.methodologyVersion = 'unit-shape-v1';
        dimension.normalizationMethod = 'VERTICAL_CALIBRATED_NORMALIZATION';
        dimension.calibrationEvidence = evidencePath;
        dimension.outOfSampleValidationEvidence = evidencePath;
        dimension.productionActivation = true;
      }
      for (const vertical of mutable.verticals) {
        vertical.status = 'VALIDATED';
        vertical.normalizationMethod = 'VERTICAL_CALIBRATED_NORMALIZATION';
        vertical.calibrationEvidence = evidencePath;
        vertical.outOfSampleValidationEvidence = evidencePath;
      }
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.disposition, 'NON_MARKET_SCORING_CONTRACT_READY');
  assert.equal(report.metrics.activatedDimensions, 3);
  assert.equal(report.metrics.validatedVerticals, 8);
  assert.equal(report.metrics.prematureScoringCandidates, 0);
  assert.equal(report.claims.normalizedScoresGeneratedByThisAudit, false);
  assert.equal(report.claims.productionScoringCertified, true);
});

test('validated status with missing methodology metadata fails closed', () => {
  const c = contract();
  c.dimensions[0].methodologyStatus = 'VALIDATED';
  c.dimensions[0].productionActivation = true;
  c.verticals[0].status = 'INVALID';
  const r = ranking();
  delete r.scoring.evidenceMapping.CANON_CULTURAL_STRENGTH;
  const { result, report } = run({ c, r });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('SCARCITY:ACTIVATION_WITHOUT_VALIDATED_METHODOLOGY') === false);
  assert.ok(report.structuralErrors.includes('SCARCITY:ACTIVATION_EVIDENCE_INCOMPLETE'));
  assert.ok(report.structuralErrors.includes('toys-models:INVALID_VERTICAL_STATUS'));
  assert.ok(report.structuralErrors.includes('CANON_CULTURAL_STRENGTH:RANKING_MAPPING_MISSING'));
});
