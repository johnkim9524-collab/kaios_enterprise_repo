import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('unsupported non-market preflight disposition fails closed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rank-gap-unsupported-'));
  const out = path.join(tmp, 'out.json');
  const policy = {
    mode: 'TEST',
    pocGate: { minimumRankableCandidates: 1 },
    scoring: {
      minimumEvidenceWeightCoverage: 0.95,
      weights: { RISK_CONFIDENCE: 1 },
      evidenceMapping: { RISK_CONFIDENCE: { primitive: 'RISK_CONFIDENCE', scoreField: 'score' } },
    },
  };
  const candidate = {
    candidateKey: 'unsupported-preflight',
    vertical: 'toys-models',
    semanticRelevant: true,
    rightData: { evidence: [] },
  };
  const preflight = {
    mode: 'KIDULT100_NON_MARKET_SCORING_PREFLIGHT',
    metrics: { semanticRelevantCandidates: 1, structuralErrorCount: 0 },
    structuralErrors: [],
    disposition: 'UNKNOWN_NON_MARKET_STATE',
    claims: { productionScoringCertified: false },
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-rankability-gap-plan.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_RANKABILITY_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_RANKABILITY_RIGHT_DATA_JSON: JSON.stringify({ candidates: [candidate] }),
      KIDULTS_RANKABILITY_NON_MARKET_PREFLIGHT_JSON: JSON.stringify(preflight),
      KIDULTS_RANKABILITY_GAP_OUTPUT: out,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UNSUPPORTED_DISPOSITION/);
  assert.equal(fs.existsSync(out), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});
