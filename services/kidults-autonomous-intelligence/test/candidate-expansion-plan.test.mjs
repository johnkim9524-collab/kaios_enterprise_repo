import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-candidate-expansion-plan.mjs');

function sourcePlan(overrides = {}) {
  return {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    stage2Gate: {
      minimumUniqueCandidates: 10,
      requiredCoreVerticalCoverage: 2,
      minimumCandidatesPerVertical: 2,
    },
    coreVerticals: [
      { id: 'v1', discoveryQueries: ['q1', 'q2'] },
      { id: 'v2', discoveryQueries: ['q3'] },
    ],
    ...overrides,
  };
}

function candidate(key, vertical, relevant = true) {
  return { candidateKey: key, vertical, semanticRelevant: relevant };
}

function rightData(candidates, overrides = {}) {
  const relevant = candidates.filter((row) => row.semanticRelevant === true).length;
  return {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: { semanticRelevantCandidates: relevant },
    candidates,
    ...overrides,
  };
}

function safeClaims() {
  return {
    planningOnly: true,
    newEvidenceCreated: false,
    normalizedScoresGenerated: false,
    sourceQualificationFabricated: false,
    sourceFeasibilityCertificationFabricated: false,
    syntheticOrEstimatedEvidenceCreated: false,
    unauthorizedScrapingRequested: false,
    providerProcurementRequested: false,
    contractExecutionRequested: false,
    authorizationBypassRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    productionScoringActivated: false,
    calibrationSufficiencyCertified: false,
    outOfSampleValidationCertified: false,
    candidateExpansionCountClaimedAsObservedEvidence: false,
  };
}

function feasibility(relevantCandidates, lowerBounds = {}, overrides = {}) {
  const verticalLowerBound = Object.values(lowerBounds).reduce((sum, value) => sum + value, 0);
  const universeGap = Math.max(0, 10 - relevantCandidates);
  const shortfallByVertical = Object.fromEntries(Object.entries(lowerBounds).map(([vertical, value]) => [vertical, {
    byDimension: {},
    conditionalMinimumNetNewCandidates: value,
  }]));
  return {
    mode: 'KIDULT100_CALIBRATION_SOURCE_FEASIBILITY_ROUTER',
    metrics: {
      structuralErrorCount: 0,
      relevantCandidates,
      minimumCombinedNetNewRelevantCandidates: Math.max(universeGap, verticalLowerBound),
    },
    candidateExpansion: { shortfallByVertical },
    claims: safeClaims(),
    ...overrides,
  };
}

function run({ feasibilityInput, rightDataInput, sourcePlanInput = sourcePlan(), rawFeasibility = null }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-expansion-plan-'));
  const out = path.join(temp, 'out.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CANDIDATE_EXPANSION_FEASIBILITY_JSON: rawFeasibility ?? JSON.stringify(feasibilityInput),
      KIDULTS_CANDIDATE_EXPANSION_RIGHT_DATA_JSON: JSON.stringify(rightDataInput),
      KIDULTS_CANDIDATE_EXPANSION_SOURCE_PLAN_JSON: JSON.stringify(sourcePlanInput),
      KIDULTS_CANDIDATE_EXPANSION_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('deterministically allocates net-new targets to satisfy calibration, balance and universe floors without discovering candidates', () => {
  const candidates = [
    candidate('a', 'v1'),
    candidate('b', 'v2'),
    candidate('c', 'v2'),
    candidate('d', 'v2'),
    candidate('e', 'v2'),
  ];
  const { result, report } = run({
    feasibilityInput: feasibility(5, { v1: 2, v2: 0 }),
    rightDataInput: rightData(candidates),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.currentRelevantCandidates, 5);
  assert.equal(report.metrics.universeGap, 5);
  assert.equal(report.metrics.minimumBalanceGapTotal, 1);
  assert.equal(report.metrics.calibrationVerticalLowerBound, 2);
  assert.equal(report.metrics.mandatoryNetNewTotal, 2);
  assert.equal(report.metrics.plannedNetNewTotal, 5);
  assert.equal(report.metrics.projectedRelevantCandidates, 10);
  assert.equal(report.metrics.projectedBalancedVerticals, 2);
  const v1 = report.targets.find((row) => row.vertical === 'v1');
  const v2 = report.targets.find((row) => row.vertical === 'v2');
  assert.equal(v1.totalNetNewTarget, 4);
  assert.equal(v2.totalNetNewTarget, 1);
  assert.deepEqual(v1.discoveryQueries, ['q1', 'q2']);
  assert.equal(report.claims.candidatesDiscovered, false);
  assert.equal(report.claims.evidenceCreated, false);
  assert.equal(report.disposition, 'CANDIDATE_EXPANSION_PLAN_READY_NO_CANDIDATES_DISCOVERED');
});

test('returns a safe no-expansion plan when current universe and vertical floors are already met', () => {
  const plan = sourcePlan({
    stage2Gate: { minimumUniqueCandidates: 4, requiredCoreVerticalCoverage: 2, minimumCandidatesPerVertical: 2 },
  });
  const candidates = [candidate('a', 'v1'), candidate('b', 'v1'), candidate('c', 'v2'), candidate('d', 'v2')];
  const safe = feasibility(4, { v1: 0, v2: 0 });
  safe.metrics.minimumCombinedNetNewRelevantCandidates = 0;
  const { result, report } = run({ feasibilityInput: safe, rightDataInput: rightData(candidates), sourcePlanInput: plan });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.plannedNetNewTotal, 0);
  assert.equal(report.metrics.projectedRelevantCandidates, 4);
  assert.equal(report.disposition, 'NO_CANDIDATE_EXPANSION_REQUIRED_FOR_CURRENT_GATES');
});

test('duplicate candidate identities and unknown relevant verticals fail closed', () => {
  const candidates = [candidate('dup', 'v1'), candidate('dup', 'v1'), candidate('x', 'unknown')];
  const { result, report } = run({
    feasibilityInput: feasibility(3, { v1: 0, v2: 0 }),
    rightDataInput: rightData(candidates),
  });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('DUPLICATE_RELEVANT_CANDIDATE:dup'));
  assert.ok(report.structuralErrors.includes('UNKNOWN_RELEVANT_VERTICAL:unknown'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CANDIDATE_EXPANSION_STATE');
});

test('unsafe upstream claims, count mismatches and malformed gate topology fail closed', () => {
  const candidates = [candidate('a', 'v1')];
  const unsafe = feasibility(1, { v1: 1, v2: 0 });
  unsafe.claims.unauthorizedScrapingRequested = true;
  unsafe.claims.planningOnly = false;
  unsafe.metrics.minimumCombinedNetNewRelevantCandidates = 999;
  const malformedPlan = sourcePlan({
    mode: 'WRONG',
    stage2Gate: { minimumUniqueCandidates: 0, requiredCoreVerticalCoverage: 1, minimumCandidatesPerVertical: 0 },
    coreVerticals: [{ id: 'v1', discoveryQueries: [] }, { id: 'v1', discoveryQueries: ['q'] }, { id: null, discoveryQueries: [] }],
  });
  const malformedRightData = rightData(candidates, { mode: 'WRONG', metrics: { semanticRelevantCandidates: 2 } });
  const { result, report } = run({ feasibilityInput: unsafe, rightDataInput: malformedRightData, sourcePlanInput: malformedPlan });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('UNSAFE_FEASIBILITY_CLAIM:unauthorizedScrapingRequested'));
  assert.ok(report.structuralErrors.includes('FEASIBILITY_NOT_PLANNING_ONLY'));
  assert.ok(report.structuralErrors.includes('INVALID_RIGHT_DATA_MODE'));
  assert.ok(report.structuralErrors.includes('INVALID_SOURCE_PLAN_MODE'));
  assert.ok(report.structuralErrors.includes('INVALID_MINIMUM_UNIQUE_CANDIDATES'));
  assert.ok(report.structuralErrors.includes('INVALID_MINIMUM_CANDIDATES_PER_VERTICAL'));
  assert.ok(report.structuralErrors.includes('DUPLICATE_VERTICAL:v1'));
  assert.ok(report.structuralErrors.includes('INVALID_VERTICAL_IDENTITY'));
  assert.ok(report.structuralErrors.some((row) => row.startsWith('RIGHT_DATA_RELEVANT_COUNT_MISMATCH:')));
  assert.ok(report.structuralErrors.some((row) => row.startsWith('FEASIBILITY_COMBINED_MINIMUM_MISMATCH:')));
});

test('invalid calibration lower bound fails closed instead of estimating a target', () => {
  const candidates = [candidate('a', 'v1'), candidate('b', 'v2')];
  const unsafe = feasibility(2, { v1: 0, v2: 0 });
  unsafe.candidateExpansion.shortfallByVertical.v1.conditionalMinimumNetNewCandidates = 'bad';
  const { result, report } = run({ feasibilityInput: unsafe, rightDataInput: rightData(candidates) });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('INVALID_CALIBRATION_VERTICAL_LOWER_BOUND:v1'));
  assert.equal(report.claims.projectedCountsClaimedAsObserved, false);
});

test('missing file input fails closed before expansion planning', () => {
  const missing = path.join(os.tmpdir(), `missing-expansion-${Date.now()}.json`);
  const { result, report } = run({
    feasibilityInput: feasibility(0, { v1: 0, v2: 0 }),
    rightDataInput: rightData([]),
    rawFeasibility: missing,
  });
  assert.notEqual(result.status, 0);
  assert.equal(report, null);
  assert.match(result.stderr, /Missing JSON input/);
});
