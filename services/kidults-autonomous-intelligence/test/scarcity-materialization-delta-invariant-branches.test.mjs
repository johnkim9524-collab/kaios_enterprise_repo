import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-materialization-delta-invariant.mjs');

const rules = {
  candidateUniverseMustRemainStable: true,
  semanticRelevanceMustRemainStable: true,
  materializedCandidatesMustBeSemanticRelevant: true,
  materializedCandidatesMustGainExactlyOneScarcityPrimitive: true,
  materializedEvidencePayloadMustMatchPostRightData: true,
  nonMaterializedCandidatesMayNotGainScarcity: true,
  existingScarcityMayNotDisappear: true,
  providerEvidenceAcceptedDeltaMustMatchMaterializedEvidence: true,
  providerEvidenceRejectedMustRemainStable: true,
  nonScarcityPrimitiveCoverageMustRemainStable: true,
  marketEvidenceCoverageMustRemainStable: true,
  requiredRightDataCoverageDeltaMustMatchMaterializedEvidence: true,
  decisionGradeDeltaMustMatchCandidateLevelTransition: true,
  normalizedScoreGenerationForbidden: true,
  productionScoringActivationForbidden: true,
  marketEvidenceCreationForbidden: true,
};

const policy = {
  policy: 'FAIL_CLOSED_SCARCITY_MATERIALIZATION_DELTA_INVARIANT',
  requiredPreMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
  requiredPostMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
  requiredMaterializationMode: 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE',
  requiredPrimitive: 'SCARCITY',
  requiredSignalType: 'TOTAL_PRODUCED',
  requiredEvidenceClass: 'INDEPENDENT_VERIFICATION',
  requiredMaterializationStatus: 'RAW_RIGHT_DATA_EVIDENCE_MATERIALIZED_NOT_SCORED',
  rules,
};

function metrics() {
  return {
    totalNormalizedCandidates: 0,
    semanticRelevantCandidates: 0,
    providerEvidenceAccepted: 0,
    providerEvidenceRejected: 0,
    requiredRightDataCoverage: 0,
    marketEvidenceCoverage: 0,
    decisionGradeCandidates: 0,
    primitiveCoverage: {
      IDENTITY: 0,
      SCARCITY: 0,
      TRANSACTION_PRICE_COMPARABLE: 0,
      LIQUIDITY: 0,
      DEMAND_ATTENTION: 0,
      CANON_CULTURAL_STRENGTH: 0,
      RISK_CONFIDENCE: 0,
    },
  };
}

function run(preCandidates, postCandidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-delta-branches-'));
  const out = path.join(dir, 'out.json');
  const pre = { mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT', metrics: metrics(), candidates: preCandidates };
  const post = { mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT', metrics: metrics(), candidates: postCandidates };
  const materialization = {
    mode: 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE',
    metrics: { materializedRightDataEvidence: 0, rejectedMaterializationRecords: 0, normalizedScoresGenerated: 0, qualifiedProductionScores: 0, marketEvidenceCreated: 0 },
    evidence: [],
    rejectedMaterializationRecords: [],
  };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_DELTA_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_SCARCITY_DELTA_PRE_RIGHT_DATA_JSON: JSON.stringify(pre),
      KIDULTS_SCARCITY_DELTA_MATERIALIZATION_JSON: JSON.stringify(materialization),
      KIDULTS_SCARCITY_DELTA_POST_RIGHT_DATA_JSON: JSON.stringify(post),
      KIDULTS_SCARCITY_DELTA_OUTPUT: out,
    },
  });
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('candidate indexing fails closed for non-array, missing-key, and duplicate-key inputs', () => {
  const first = run(null, []);
  assert.equal(first.result.status, 1);
  assert.ok(first.report.violations.includes('PRE_CANDIDATES_NOT_ARRAY'));

  const duplicateCandidate = {
    candidateKey: 'Q1',
    canonicalTitle: 'Q1',
    vertical: 'toys-models',
    semanticRelevant: false,
    rightData: { primitives: [], requiredCoverage: 0, marketEvidencePresent: false, evidence: [] },
  };
  const second = run([], [{}, duplicateCandidate, duplicateCandidate]);
  assert.equal(second.result.status, 1);
  assert.ok(second.report.violations.includes('POST_MISSING_CANDIDATE_KEY'));
  assert.ok(second.report.violations.includes('POST_DUPLICATE_CANDIDATE_KEY:Q1'));
});
