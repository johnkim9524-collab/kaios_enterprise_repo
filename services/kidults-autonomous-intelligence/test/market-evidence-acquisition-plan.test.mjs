import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

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

function requirements(overrides = {}) {
  return {
    policy: 'TEST_FAIL_CLOSED',
    global: { minimumCandidateCoverage: 0.9, minimumCompletedTransactionsForLiquidity: 2 },
    verticals: VERTICALS.map((id) => ({ id, minimumCoverage: 0.9, minimumCompletedTransactionsPerCandidate: 2 })),
    ...overrides,
  };
}

function poc(perVertical = 10) {
  const candidates = [];
  for (const vertical of VERTICALS) {
    for (let i = 0; i < perVertical; i += 1) {
      candidates.push({ candidateKey: `${vertical}:${i}`, vertical, semanticRelevant: true });
    }
    candidates.push({ candidateKey: `${vertical}:irrelevant`, vertical, semanticRelevant: false });
  }
  candidates.push({ candidateKey: 'unknown:1', vertical: 'unknown', semanticRelevant: true });
  return { candidates };
}

function evidenceFor(candidateKey, { transaction = true, liquidity = true, ids = ['tx-1', 'tx-2'] } = {}) {
  const rows = [];
  if (transaction) rows.push({
    candidateKey,
    primitive: 'TRANSACTION_PRICE_COMPARABLE',
    value: { transactionId: ids[0] },
  });
  if (liquidity) rows.push({
    candidateKey,
    primitive: 'LIQUIDITY',
    value: { supportingTransactionIds: ids },
  });
  return rows;
}

function run({ req = requirements(), candidateReport = poc(), evidence = [], useFiles = false, outputPath = null } = {}) {
  const env = { ...process.env };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-acquisition-'));
  if (useFiles) {
    const reqPath = path.join(temp, 'requirements.json');
    const pocPath = path.join(temp, 'poc.json');
    const evidencePath = path.join(temp, 'evidence.json');
    fs.writeFileSync(reqPath, JSON.stringify(req));
    fs.writeFileSync(pocPath, JSON.stringify(candidateReport));
    fs.writeFileSync(evidencePath, JSON.stringify({ evidence }));
    env.KIDULTS_ACQUISITION_REQUIREMENTS_JSON = reqPath;
    env.KIDULTS_ACQUISITION_POC_JSON = pocPath;
    env.KIDULTS_ACQUISITION_VALIDATED_EVIDENCE_JSON = evidencePath;
  } else {
    env.KIDULTS_ACQUISITION_REQUIREMENTS_JSON = JSON.stringify(req);
    env.KIDULTS_ACQUISITION_POC_JSON = JSON.stringify(candidateReport);
    env.KIDULTS_ACQUISITION_VALIDATED_EVIDENCE_JSON = JSON.stringify({ evidence });
  }
  const out = outputPath || path.join(temp, 'out.json');
  env.KIDULTS_MARKET_ACQUISITION_PLAN_OUTPUT = out;
  const result = spawnSync(process.execPath, ['scripts/kidult100-market-evidence-acquisition-plan.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('empty validated evidence produces exact vertical acquisition floors without inventing evidence', () => {
  const { result, report } = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.totals.relevantCandidates, 80);
  assert.equal(report.totals.targetCandidates, 72);
  assert.equal(report.totals.completedTransactionFloor, 144);
  assert.equal(report.totals.remainingCompletedTransactionFloor, 144);
  assert.equal(report.totals.remainingLiquidityObservationFloor, 72);
  assert.equal(report.disposition, 'EXTERNAL_MARKET_EVIDENCE_REQUIRED');
  assert.equal(report.claims.marketEvidenceCertified, false);
  assert.equal(report.claims.syntheticEvidenceUsed, false);
  assert.ok(report.verticalPlans.every((row) => row.targetCandidates === 9 && row.candidateCoverageGap === 9));
});

test('validated market evidence is credited only to matching relevant candidates and selected acquisition target', () => {
  const evidence = [
    ...evidenceFor('toys-models:0'),
    ...evidenceFor('toys-models:1', { liquidity: false }),
    ...evidenceFor('toys-models:2', { transaction: false }),
    ...evidenceFor('unknown:1'),
  ];
  const { result, report } = run({ evidence, useFiles: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const toys = report.verticalPlans.find((row) => row.vertical === 'toys-models');
  assert.equal(toys.currentMarketCoveredCandidates, 1);
  assert.equal(toys.currentTransactionComparableCandidates, 2);
  assert.equal(toys.currentLiquidityCandidates, 2);
  assert.equal(toys.candidateCoverageGap, 8);
  assert.equal(toys.verifiedTransactionsInTargetSet, 4);
  assert.equal(toys.remainingCompletedTransactionFloor, 14);
  assert.equal(toys.remainingLiquidityObservationFloor, 7);
});

test('fully supported 90 percent target reports acquisition floor met', () => {
  const candidateReport = poc(1);
  const evidence = VERTICALS.flatMap((vertical) => evidenceFor(`${vertical}:0`, { ids: [`${vertical}-1`, `${vertical}-2`] }));
  const { result, report } = run({ candidateReport, evidence });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.totals.targetCandidates, 8);
  assert.equal(report.totals.currentMarketCoveredCandidates, 8);
  assert.equal(report.totals.remainingCompletedTransactionFloor, 0);
  assert.equal(report.totals.remainingLiquidityObservationFloor, 0);
  assert.equal(report.disposition, 'ACQUISITION_FLOOR_MET');
  assert.equal(report.claims.marketEvidenceCertified, false);
});

test('invalid requirement topology and thresholds fail closed', () => {
  const missingVertical = requirements({ verticals: requirements().verticals.slice(0, 7) });
  const first = run({ req: missingVertical });
  assert.notEqual(first.result.status, 0);
  assert.match(first.result.stderr, /Expected 8 market-evidence vertical requirements/);

  const invalidCoverage = requirements();
  invalidCoverage.verticals[0].minimumCoverage = 0;
  const second = run({ req: invalidCoverage });
  assert.notEqual(second.result.status, 0);
  assert.match(second.result.stderr, /Invalid minimumCoverage/);

  const invalidTransactions = requirements();
  invalidTransactions.verticals[0].minimumCompletedTransactionsPerCandidate = 1;
  const third = run({ req: invalidTransactions });
  assert.notEqual(third.result.status, 0);
  assert.match(third.result.stderr, /Invalid minimumCompletedTransactionsPerCandidate/);
});
