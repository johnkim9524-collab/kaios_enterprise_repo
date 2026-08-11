import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const VERTICALS = ['v1', 'v2'];

function contract() {
  return {
    policy: 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION',
    global: {
      requiredDimensions: ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'],
      requiredVerticals: VERTICALS,
    },
    dimensions: [
      { id: 'SCARCITY', primitive: 'SCARCITY', scoreField: 'normalizedScore', allowedRawSignalTypes: ['TOTAL_PRODUCED'] },
      { id: 'DEMAND_ATTENTION', primitive: 'DEMAND_ATTENTION', scoreField: 'normalizedScore', allowedRawSignalTypes: ['UNITS_SOLD_REFERENCE', 'CULTURAL_ATTENTION_PROXY'] },
      { id: 'CANON_CULTURAL_STRENGTH', primitive: 'CANON_CULTURAL_STRENGTH', scoreField: 'normalizedScore', allowedRawSignalTypes: ['INSTITUTIONAL_RECOGNITION'] },
    ],
  };
}

function sourcePlan() {
  return {
    stage2Gate: { minimumCandidatesPerVertical: 2 },
    coreVerticals: VERTICALS.map((id) => ({ id })),
  };
}

function record(primitive, signalType, overrides = {}) {
  return {
    primitive,
    sourceUrl: 'https://example.test/source',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00.000Z',
    payloadHash: `hash-${primitive}-${signalType}`,
    safety: { synthetic: false, estimated: false },
    value: { signalType },
    ...overrides,
  };
}

function candidate(key, vertical, primitives, evidence = []) {
  return {
    candidateKey: key,
    vertical,
    semanticRelevant: true,
    rightData: { primitives, evidence },
  };
}

function run({ c = contract(), s = sourcePlan(), candidates = [], useFiles = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-cal-shape-'));
  const out = path.join(temp, 'out.json');
  const env = { ...process.env, KIDULTS_CALIBRATION_EVIDENCE_SHAPE_OUTPUT: out };
  const rightData = { candidates };
  if (useFiles) {
    const contractPath = path.join(temp, 'contract.json');
    const sourcePath = path.join(temp, 'source.json');
    const rightDataPath = path.join(temp, 'right-data.json');
    fs.writeFileSync(contractPath, JSON.stringify(c));
    fs.writeFileSync(sourcePath, JSON.stringify(s));
    fs.writeFileSync(rightDataPath, JSON.stringify(rightData));
    env.KIDULTS_CALIBRATION_CONTRACT_JSON = contractPath;
    env.KIDULTS_CALIBRATION_SOURCE_PLAN_JSON = sourcePath;
    env.KIDULTS_CALIBRATION_RIGHT_DATA_JSON = rightDataPath;
  } else {
    env.KIDULTS_CALIBRATION_CONTRACT_JSON = JSON.stringify(c);
    env.KIDULTS_CALIBRATION_SOURCE_PLAN_JSON = JSON.stringify(s);
    env.KIDULTS_CALIBRATION_RIGHT_DATA_JSON = JSON.stringify(rightData);
  }
  const result = spawnSync(process.execPath, ['scripts/kidult100-calibration-evidence-shape-plan.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('planner separates primitive presence from explicit rights-qualified evidence', () => {
  const candidates = [
    candidate('a', 'v1', ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'], [
      record('SCARCITY', 'TOTAL_PRODUCED'),
      record('DEMAND_ATTENTION', 'CULTURAL_ATTENTION_PROXY', { rightsClass: '' }),
    ]),
    candidate('b', 'v1', ['SCARCITY'], [record('SCARCITY', 'UNKNOWN_SIGNAL')]),
    candidate('c', 'v2', ['DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'], [
      record('DEMAND_ATTENTION', 'UNITS_SOLD_REFERENCE'),
      record('CANON_CULTURAL_STRENGTH', 'INSTITUTIONAL_RECOGNITION'),
    ]),
  ];
  const { result, report } = run({ candidates, useFiles: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.dimensionVerticalCells, 6);
  assert.equal(report.metrics.dimensionsWithAnyEligibleSupply, 3);
  assert.equal(report.disposition, 'ELIGIBLE_EVIDENCE_SUPPLY_BELOW_OPERATIONAL_REFERENCE');

  const canonV1 = report.priorities.find((row) => row.dimension === 'CANON_CULTURAL_STRENGTH' && row.vertical === 'v1');
  assert.equal(canonV1.primitivePresentCandidates, 1);
  assert.equal(canonV1.rawEvidenceCandidates, 0);
  assert.equal(canonV1.primitiveOnlyCandidates, 1);
  assert.equal(canonV1.priority, 'EXPLICIT_EVIDENCE_RECORDIZATION');

  const demandV1 = report.priorities.find((row) => row.dimension === 'DEMAND_ATTENTION' && row.vertical === 'v1');
  assert.equal(demandV1.allowedSignalRecords, 1);
  assert.equal(demandV1.allowedSignalCandidates, 1);
  assert.equal(demandV1.calibrationEligibleCandidates, 0);
  assert.equal(demandV1.priority, 'RIGHTS_PROVENANCE_SAFETY_REPAIR');

  const scarcityV1 = report.priorities.find((row) => row.dimension === 'SCARCITY' && row.vertical === 'v1');
  assert.equal(scarcityV1.calibrationEligibleCandidates, 1);
  assert.equal(scarcityV1.allowedSignalCandidates, 1);
  assert.equal(scarcityV1.disallowedSignalRecords, 1);
  assert.equal(scarcityV1.priority, 'RAW_SIGNAL_CONTRACT_REPAIR');
  assert.equal(report.claims.operationalReferenceClaimedAsStatisticalSufficiency, false);
});

test('dimension with no explicit eligible evidence blocks method design without inventing a score', () => {
  const candidates = [
    candidate('a', 'v1', ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'], [
      record('SCARCITY', 'TOTAL_PRODUCED'),
      record('DEMAND_ATTENTION', 'CULTURAL_ATTENTION_PROXY'),
    ]),
    candidate('b', 'v2', ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'], [
      record('SCARCITY', 'TOTAL_PRODUCED'),
      record('DEMAND_ATTENTION', 'UNITS_SOLD_REFERENCE'),
    ]),
  ];
  const { result, report } = run({ candidates });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(report.metrics.dimensionsWithNoExplicitEligibleEvidence, ['CANON_CULTURAL_STRENGTH']);
  assert.equal(report.disposition, 'EXPLICIT_EVIDENCE_SHAPE_GAPS_BLOCK_METHOD_DESIGN');
  assert.equal(report.claims.normalizedScoresGenerated, false);
  assert.equal(report.claims.calibrationSufficiencyCertified, false);
});

test('synthetic estimated missing-signal and incomplete-provenance records are never calibration eligible', () => {
  const candidates = [
    candidate('a', 'v1', ['SCARCITY'], [
      record('SCARCITY', 'TOTAL_PRODUCED', { safety: { synthetic: true, estimated: false } }),
      record('SCARCITY', 'TOTAL_PRODUCED', { safety: { synthetic: false, estimated: true } }),
      record('SCARCITY', null),
      record('SCARCITY', 'TOTAL_PRODUCED', { payloadHash: '' }),
    ]),
  ];
  const { result, report } = run({ candidates });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const row = report.priorities.find((item) => item.dimension === 'SCARCITY' && item.vertical === 'v1');
  assert.equal(row.rawEvidenceCandidates, 1);
  assert.equal(row.missingSignalTypeRecords, 1);
  assert.equal(row.allowedSignalRecords, 3);
  assert.equal(row.safeRealAllowedRecords, 1);
  assert.equal(row.provenanceCompleteAllowedRecords, 2);
  assert.equal(row.calibrationEligibleCandidates, 0);
  assert.equal(report.claims.syntheticOrEstimatedEvidenceCountedEligible, false);
});

test('premature normalized score records fail closed', () => {
  const scored = record('SCARCITY', 'TOTAL_PRODUCED');
  scored.value.normalizedScore = 0.7;
  const { result, report } = run({ candidates: [candidate('a', 'v1', ['SCARCITY'], [scored])] });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.prematureScoreCandidates, 1);
  assert.ok(report.structuralErrors.includes('PREMATURE_NON_MARKET_SCORE_RECORDS_PRESENT'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CALIBRATION_EVIDENCE_STATE');
});

test('invalid topology and dimension contract fail closed', () => {
  const badTopology = sourcePlan();
  badTopology.coreVerticals = [{ id: 'v1' }];
  const first = run({ s: badTopology, candidates: [] });
  assert.notEqual(first.result.status, 0);
  assert.ok(first.report.structuralErrors.includes('VERTICAL_TOPOLOGY_MISMATCH'));

  const badContract = contract();
  badContract.dimensions[0].allowedRawSignalTypes = [];
  badContract.dimensions[1].scoreField = null;
  const second = run({ c: badContract, candidates: [] });
  assert.notEqual(second.result.status, 0);
  assert.ok(second.report.structuralErrors.some((error) => error.startsWith('MISSING_ALLOWED_SIGNAL_TYPES:SCARCITY')));
  assert.ok(second.report.structuralErrors.some((error) => error.startsWith('INVALID_DIMENSION_DEFINITION:DEMAND_ATTENTION')));
});

test('fully populated operational reference is reported as method-design ready but not calibration certified', () => {
  const candidates = [];
  for (const vertical of VERTICALS) {
    for (let i = 0; i < 2; i += 1) {
      candidates.push(candidate(`${vertical}-${i}`, vertical, ['SCARCITY', 'DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'], [
        record('SCARCITY', 'TOTAL_PRODUCED'),
        record('DEMAND_ATTENTION', i === 0 ? 'UNITS_SOLD_REFERENCE' : 'CULTURAL_ATTENTION_PROXY'),
        record('CANON_CULTURAL_STRENGTH', 'INSTITUTIONAL_RECOGNITION'),
      ]));
    }
  }
  const { result, report } = run({ candidates });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.cellsMeetingOperationalReference, 6);
  assert.equal(report.disposition, 'EVIDENCE_SHAPE_READY_FOR_METHOD_DESIGN_NOT_CERTIFICATION');
  assert.equal(report.claims.outOfSampleValidationCertified, false);
  assert.equal(report.claims.productionScoringActivated, false);
});
