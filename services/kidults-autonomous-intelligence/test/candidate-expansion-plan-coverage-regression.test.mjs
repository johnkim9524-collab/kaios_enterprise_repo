import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-candidate-expansion-plan.mjs');

const SAFE_CLAIMS = {
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

function sourcePlan() {
  return {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    stage2Gate: {
      minimumUniqueCandidates: 1,
      requiredCoreVerticalCoverage: 1,
      minimumCandidatesPerVertical: 1,
    },
    coreVerticals: [{ id: 'v1', discoveryQueries: ['qualified product query'] }],
  };
}

function feasibility() {
  return {
    mode: 'KIDULT100_CALIBRATION_SOURCE_FEASIBILITY_ROUTER',
    metrics: {
      structuralErrorCount: 0,
      relevantCandidates: 1,
      minimumCombinedNetNewRelevantCandidates: 0,
    },
    candidateExpansion: {
      shortfallByVertical: {
        v1: { byDimension: {}, conditionalMinimumNetNewCandidates: 0 },
      },
    },
    claims: SAFE_CLAIMS,
  };
}

function runWithFiles(rightData) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-expansion-coverage-'));
  const feasibilityPath = path.join(temp, 'feasibility.json');
  const rightDataPath = path.join(temp, 'right-data.json');
  const sourcePlanPath = path.join(temp, 'source-plan.json');
  const outputPath = path.join(temp, 'out.json');
  fs.writeFileSync(feasibilityPath, JSON.stringify(feasibility()));
  fs.writeFileSync(rightDataPath, JSON.stringify(rightData));
  fs.writeFileSync(sourcePlanPath, JSON.stringify(sourcePlan()));
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CANDIDATE_EXPANSION_FEASIBILITY_JSON: feasibilityPath,
      KIDULTS_CANDIDATE_EXPANSION_RIGHT_DATA_JSON: rightDataPath,
      KIDULTS_CANDIDATE_EXPANSION_SOURCE_PLAN_JSON: sourcePlanPath,
      KIDULTS_CANDIDATE_EXPANSION_OUTPUT: outputPath,
    },
  });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('successful repository-style file inputs exercise the filesystem read path without changing planning semantics', () => {
  const { result, report } = runWithFiles({
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: { semanticRelevantCandidates: 1 },
    candidates: [{ candidateKey: 'c1', vertical: 'v1', semanticRelevant: true }],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.currentRelevantCandidates, 1);
  assert.equal(report.metrics.plannedNetNewTotal, 0);
  assert.equal(report.claims.candidatesDiscovered, false);
});

test('missing relevant candidate identity is reported fail closed rather than silently counted', () => {
  const { result, report } = runWithFiles({
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: { semanticRelevantCandidates: 1 },
    candidates: [{ vertical: 'v1', semanticRelevant: true }],
  });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('MISSING_RELEVANT_CANDIDATE_KEY'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CANDIDATE_EXPANSION_STATE');
  assert.equal(report.claims.semanticRelevanceFabricated, false);
});
