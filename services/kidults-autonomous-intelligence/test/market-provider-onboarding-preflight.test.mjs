import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const OUT = path.join(process.cwd(), 'reports', 'kidult100-right-data', 'market-provider-onboarding-preflight-latest.json');

test('provider onboarding preflight is structurally valid and remains external dependency with zero approved providers', () => {
  const result = spawnSync(process.execPath, ['scripts/kidult100-market-provider-onboarding-preflight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /config=PASS/);
  const report = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.equal(report.metrics.coreVerticals, 8);
  assert.equal(report.metrics.requirementVerticals, 8);
  assert.equal(report.readiness.configurationValid, true);
  assert.equal(report.readiness.providerOnboardingReady, false);
  assert.equal(report.readiness.marketEvidenceAvailable, false);
  assert.equal(report.readiness.disposition, 'EXTERNAL_DEPENDENCY_NO_APPROVED_PROVIDER');
  assert.equal(report.claims.providerProcured, false);
  assert.equal(report.claims.contractExecuted, false);
  assert.equal(report.claims.liveMarketEvidenceCertified, false);
  for (const vertical of report.requirements.verticals) {
    assert.equal(vertical.minimumCoverage, 0.9);
    assert.ok(vertical.minimumCompletedTransactionsPerCandidate >= 2);
  }
});
