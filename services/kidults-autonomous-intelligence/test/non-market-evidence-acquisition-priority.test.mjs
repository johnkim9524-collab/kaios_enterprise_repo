import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function cell(dimension, vertical, eligible, priority, overrides = {}) {
  return {
    dimension,
    primitive: `${dimension}_PRIMITIVE`,
    vertical,
    relevantCandidates: 30,
    primitivePresentCandidates: 30,
    rawEvidenceCandidates: eligible,
    calibrationEligibleCandidates: eligible,
    operationalReferenceGap: Math.max(0, 25 - eligible),
    priority,
    ...overrides,
  };
}

function shape(cells, overrides = {}) {
  return {
    mode: 'KIDULT100_CALIBRATION_EVIDENCE_SHAPE_PLAN',
    operationalReference: { minimumCandidatesPerVertical: 25 },
    metrics: { structuralErrorCount: 0 },
    claims: {
      normalizedScoresGenerated: false,
      syntheticOrEstimatedEvidenceCountedEligible: false,
      calibrationSufficiencyCertified: false,
    },
    priorities: cells,
    ...overrides,
  };
}

function run(input, { useFile = false, outputRelative = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-non-market-acq-'));
  const absoluteOut = path.join(temp, 'out.json');
  const relativeOut = `reports/non-market-acq-${path.basename(temp)}.json`;
  const env = { ...process.env };
  if (useFile) {
    const inputPath = path.join(temp, 'shape.json');
    fs.writeFileSync(inputPath, JSON.stringify(input));
    env.KIDULTS_NON_MARKET_ACQUISITION_SHAPE_JSON = inputPath;
  } else {
    env.KIDULTS_NON_MARKET_ACQUISITION_SHAPE_JSON = JSON.stringify(input);
  }
  env.KIDULTS_NON_MARKET_ACQUISITION_PRIORITY_OUTPUT = outputRelative ? relativeOut : absoluteOut;
  const result = spawnSync(process.execPath, ['scripts/kidult100-non-market-evidence-acquisition-priority.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const outputPath = outputRelative ? path.join(process.cwd(), relativeOut) : absoluteOut;
  const report = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  if (outputRelative) fs.rmSync(outputPath, { force: true });
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('prioritizes zero-supply and existing-evidence repairs before new supply expansion', () => {
  const input = shape([
    cell('CANON', 'toys', 25, 'METHOD_DESIGN_HOLD'),
    cell('SCARCITY', 'toys', 0, 'ALLOWED_RAW_SIGNAL_ACQUISITION', { rawEvidenceCandidates: 0 }),
    cell('DEMAND', 'toys', 10, 'RIGHTS_PROVENANCE_SAFETY_REPAIR', { rawEvidenceCandidates: 15 }),
    cell('CANON', 'watches', 20, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
    cell('SCARCITY', 'watches', 5, 'RAW_SIGNAL_CONTRACT_REPAIR', { rawEvidenceCandidates: 12 }),
    cell('DEMAND', 'watches', 5, 'EXPLICIT_EVIDENCE_RECORDIZATION', { rawEvidenceCandidates: 5 }),
  ]);
  const { result, report } = run(input, { useFile: true, outputRelative: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.dimensionVerticalCells, 6);
  assert.equal(report.metrics.cellsBelowOperationalReference, 5);
  assert.equal(report.metrics.zeroEligibleCells, 1);
  assert.equal(report.metrics.totalOperationalReferenceGap, 80);
  assert.equal(report.metrics.existingEvidenceRepairCells, 3);
  assert.equal(report.metrics.externalSignalAcquisitionCells, 2);
  assert.equal(report.disposition, 'USE_EXISTING_RIGHTS_QUALIFIED_EVIDENCE_BEFORE_NEW_ACQUISITION');
  assert.equal(report.priorities[0].dimension, 'SCARCITY');
  assert.equal(report.priorities[0].zeroEligibleSupply, true);
  assert.equal(report.priorities[1].upstreamPriority, 'EXPLICIT_EVIDENCE_RECORDIZATION');
  assert.equal(report.metrics.byDimension.CANON.cells, 2);
  assert.equal(report.metrics.byVertical.toys.cells, 3);
  assert.equal(report.claims.normalizedScoresGenerated, false);
  assert.equal(report.claims.unauthorizedScrapingRequested, false);
});

test('reports operational reference filled without claiming calibration sufficiency', () => {
  const { result, report } = run(shape([
    cell('CANON', 'toys', 25, 'METHOD_DESIGN_HOLD'),
    cell('DEMAND', 'toys', 30, 'METHOD_DESIGN_HOLD'),
  ]));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.cellsBelowOperationalReference, 0);
  assert.equal(report.metrics.totalOperationalReferenceGap, 0);
  assert.equal(report.disposition, 'OPERATIONAL_REFERENCE_FILLED_METHOD_VALIDATION_STILL_REQUIRED');
  assert.equal(report.claims.operationalReferenceClaimedAsStatisticalSufficiency, false);
});

test('requires rights-qualified expansion when no existing repair path remains', () => {
  const { result, report } = run(shape([
    cell('SCARCITY', 'toys', 2, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
    cell('DEMAND', 'toys', 4, 'ALLOWED_RAW_SIGNAL_ACQUISITION'),
  ]));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.existingEvidenceRepairCells, 0);
  assert.equal(report.metrics.externalSignalAcquisitionCells, 2);
  assert.equal(report.disposition, 'RIGHTS_QUALIFIED_EVIDENCE_EXPANSION_REQUIRED');
  assert.equal(report.claims.providerProcurementRequested, false);
  assert.equal(report.claims.rightsOrProvenanceRequirementsWeakened, false);
});

test('unsafe upstream state fails closed', () => {
  const unsafe = shape([cell('CANON', 'toys', 25, 'METHOD_DESIGN_HOLD')], {
    mode: 'WRONG',
    metrics: { structuralErrorCount: 2 },
    claims: {
      normalizedScoresGenerated: true,
      syntheticOrEstimatedEvidenceCountedEligible: true,
      calibrationSufficiencyCertified: true,
    },
    operationalReference: { minimumCandidatesPerVertical: 0 },
  });
  const { result, report } = run(unsafe);
  assert.notEqual(result.status, 0);
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_NON_MARKET_ACQUISITION_PLAN');
  assert.ok(report.structuralErrors.includes('INVALID_CALIBRATION_SHAPE_MODE'));
  assert.ok(report.structuralErrors.includes('UPSTREAM_CALIBRATION_SHAPE_HAS_STRUCTURAL_ERRORS'));
  assert.ok(report.structuralErrors.includes('UPSTREAM_SCORE_GENERATION_STATE_UNSAFE'));
  assert.ok(report.structuralErrors.includes('UPSTREAM_SYNTHETIC_ELIGIBILITY_STATE_UNSAFE'));
  assert.ok(report.structuralErrors.includes('UNEXPECTED_CALIBRATION_CERTIFICATION'));
  assert.ok(report.structuralErrors.includes('INVALID_OPERATIONAL_REFERENCE'));
});

test('malformed duplicate unknown and inconsistent cells are rejected deterministically', () => {
  const input = shape([
    cell('CANON', 'toys', 5, 'METHOD_DESIGN_HOLD', { operationalReferenceGap: 3 }),
    cell('CANON', 'toys', 5, 'METHOD_DESIGN_HOLD'),
    { dimension: '', vertical: 'watches' },
    cell('SCARCITY', 'watches', 5, 'UNKNOWN_PRIORITY'),
    cell('DEMAND', 'watches', 5, 'ALLOWED_RAW_SIGNAL_ACQUISITION', { relevantCandidates: 'bad' }),
  ]);
  const { result, report } = run(input);
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.some((row) => row.startsWith('INCONSISTENT_OPERATIONAL_GAP:CANON:toys')));
  assert.ok(report.structuralErrors.includes('DUPLICATE_CELL:CANON:toys'));
  assert.ok(report.structuralErrors.includes('INVALID_CELL_IDENTITY::watches'));
  assert.ok(report.structuralErrors.some((row) => row.startsWith('UNKNOWN_CELL_PRIORITY:SCARCITY:watches')));
  assert.ok(report.structuralErrors.includes('INVALID_CELL_METRICS:DEMAND:watches'));
});

test('missing cells and missing file input fail closed', () => {
  const noCells = run(shape([]));
  assert.notEqual(noCells.result.status, 0);
  assert.ok(noCells.report.structuralErrors.includes('MISSING_DIMENSION_VERTICAL_CELLS'));

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-non-market-acq-missing-'));
  const result = spawnSync(process.execPath, ['scripts/kidult100-non-market-evidence-acquisition-priority.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KIDULTS_NON_MARKET_ACQUISITION_SHAPE_JSON: path.join(temp, 'missing.json'),
      KIDULTS_NON_MARKET_ACQUISITION_PRIORITY_OUTPUT: path.join(temp, 'out.json'),
    },
    encoding: 'utf8',
  });
  fs.rmSync(temp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
