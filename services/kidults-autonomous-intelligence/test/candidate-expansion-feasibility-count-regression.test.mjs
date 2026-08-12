import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-candidate-expansion-plan.mjs');

const claims = {
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

test('feasibility relevant-candidate count mismatch fails closed explicitly', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-expansion-feasibility-count-'));
  const out = path.join(temp, 'out.json');
  const feasibility = {
    mode: 'KIDULT100_CALIBRATION_SOURCE_FEASIBILITY_ROUTER',
    metrics: {
      structuralErrorCount: 0,
      relevantCandidates: 2,
      minimumCombinedNetNewRelevantCandidates: 0,
    },
    candidateExpansion: {
      shortfallByVertical: {
        v1: { byDimension: {}, conditionalMinimumNetNewCandidates: 0 },
      },
    },
    claims,
  };
  const rightData = {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: { semanticRelevantCandidates: 1 },
    candidates: [{ candidateKey: 'c1', vertical: 'v1', semanticRelevant: true }],
  };
  const sourcePlan = {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    stage2Gate: {
      minimumUniqueCandidates: 1,
      requiredCoreVerticalCoverage: 1,
      minimumCandidatesPerVertical: 1,
    },
    coreVerticals: [{ id: 'v1', discoveryQueries: ['qualified product query'] }],
  };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CANDIDATE_EXPANSION_FEASIBILITY_JSON: JSON.stringify(feasibility),
      KIDULTS_CANDIDATE_EXPANSION_RIGHT_DATA_JSON: JSON.stringify(rightData),
      KIDULTS_CANDIDATE_EXPANSION_SOURCE_PLAN_JSON: JSON.stringify(sourcePlan),
      KIDULTS_CANDIDATE_EXPANSION_OUTPUT: out,
    },
  });
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(temp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('FEASIBILITY_RELEVANT_COUNT_MISMATCH:2:1'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CANDIDATE_EXPANSION_STATE');
  assert.equal(report.claims.candidatesDiscovered, false);
});
