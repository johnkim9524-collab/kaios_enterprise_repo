import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function universe(rows) {
  return { constituents: rows };
}

function record(id, hash = `hash-${id}`) {
  return {
    source: 'TEST',
    sourceRecordId: id,
    payloadHash: hash,
  };
}

function market(ids = []) {
  return {
    evidence: ids.flatMap((id) => [
      { primitive: 'TRANSACTION_PRICE_COMPARABLE', value: { transactionId: id } },
      { primitive: 'TRANSACTION_PRICE_COMPARABLE', value: { transactionId: id } },
      { primitive: 'LIQUIDITY', value: { supportingTransactionIds: [id] } },
    ]),
  };
}

function rightData(decisionGradeCandidates) {
  return { metrics: { decisionGradeCandidates } };
}

function run({ current, previous = null, currentMarket = null, previousMarket = null, currentRightData = null, previousRightData = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-delta-kpi-'));
  const out = path.join(tmp, 'out.json');
  const env = {
    ...process.env,
    KIDULTS_CURRENT_UNIVERSE_JSON: JSON.stringify(current),
    KIDULTS_COLLECTION_DELTA_KPI_OUTPUT: out,
  };
  if (previous) env.KIDULTS_PREVIOUS_UNIVERSE_JSON = JSON.stringify(previous);
  if (currentMarket) env.KIDULTS_CURRENT_VALIDATED_MARKET_JSON = JSON.stringify(currentMarket);
  if (previousMarket) env.KIDULTS_PREVIOUS_VALIDATED_MARKET_JSON = JSON.stringify(previousMarket);
  if (currentRightData) env.KIDULTS_CURRENT_RIGHT_DATA_JSON = JSON.stringify(currentRightData);
  if (previousRightData) env.KIDULTS_PREVIOUS_RIGHT_DATA_JSON = JSON.stringify(previousRightData);
  const result = spawnSync(process.execPath, ['scripts/live-open-data-delta-kpi.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('first snapshot is baseline and is never misreported as net-new', () => {
  const { result, report } = run({ current: universe([record('1'), record('2')]) });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.deltaMode, 'BASELINE_NO_PRIOR_SNAPSHOT');
  assert.equal(report.metrics.observed, 2);
  assert.equal(report.metrics.new, null);
  assert.equal(report.metrics.changed, null);
  assert.equal(report.metrics.unchanged, null);
  assert.equal(report.claims.baselineSnapshotClaimedAsNetNew, false);
});

test('same identities and hashes count only as unchanged reobservations', () => {
  const rows = [record('1'), record('2')];
  const { result, report } = run({ current: universe(rows), previous: universe(rows) });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.new, 0);
  assert.equal(report.metrics.changed, 0);
  assert.equal(report.metrics.unchanged, 2);
  assert.equal(report.metrics.reobserved, 2);
  assert.equal(report.metrics.removed, 0);
});

test('new changed unchanged and removed records are separated deterministically', () => {
  const previous = universe([record('1', 'a'), record('2', 'b'), record('3', 'c')]);
  const current = universe([record('1', 'a'), record('2', 'b2'), record('4', 'd')]);
  const { result, report } = run({ current, previous });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual({
    new: report.metrics.new,
    changed: report.metrics.changed,
    unchanged: report.metrics.unchanged,
    reobserved: report.metrics.reobserved,
    removed: report.metrics.removed,
  }, { new: 1, changed: 1, unchanged: 1, reobserved: 2, removed: 1 });
});

test('transaction IDs are deduplicated and gains use unique IDs only', () => {
  const { result, report } = run({
    current: universe([record('1')]),
    previous: universe([record('1')]),
    currentMarket: market(['tx-1', 'tx-2']),
    previousMarket: market(['tx-1']),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.uniqueTransactions, 2);
  assert.equal(report.metrics.uniqueTransactionGain, 1);
  assert.equal(report.claims.repeatedTransactionIdCountedMoreThanOnce, false);
});

test('decision-grade gain is reported only when both snapshots exist', () => {
  const first = run({ current: universe([record('1')]), currentRightData: rightData(3) });
  assert.equal(first.result.status, 0, first.result.stderr || first.result.stdout);
  assert.equal(first.report.metrics.decisionGradeCandidates, 3);
  assert.equal(first.report.metrics.decisionGradeGain, null);
  assert.equal(first.report.evaluation.decisionGradeGainEvaluated, false);

  const second = run({
    current: universe([record('1')]),
    previous: universe([record('1')]),
    currentRightData: rightData(5),
    previousRightData: rightData(3),
  });
  assert.equal(second.result.status, 0, second.result.stderr || second.result.stdout);
  assert.equal(second.report.metrics.decisionGradeGain, 2);
});

test('decision-grade fallback counts only relevant fully-covered market-evidence candidates', () => {
  const candidateRightData = {
    candidates: [
      { semanticRelevant: true, rightData: { requiredCoverage: 1, marketEvidencePresent: true } },
      { semanticRelevant: true, rightData: { requiredCoverage: 0.89, marketEvidencePresent: true } },
      { semanticRelevant: false, rightData: { requiredCoverage: 1, marketEvidencePresent: true } },
      { semanticRelevant: true, rightData: { requiredCoverage: 1, marketEvidencePresent: false } },
    ],
  };
  const { result, report } = run({ current: universe([record('1')]), currentRightData: candidateRightData });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.decisionGradeCandidates, 1);
});

test('invalid or duplicate constituent identities fail closed', () => {
  const missingHash = run({ current: universe([{ source: 'TEST', sourceRecordId: '1' }]) });
  assert.notEqual(missingHash.result.status, 0);
  assert.match(missingHash.result.stderr, /without identity\/payloadHash/);

  const missingIdentity = run({ current: universe([null, { sourceRecordId: '2', payloadHash: 'h' }, { source: 'TEST', payloadHash: 'h2' }]) });
  assert.notEqual(missingIdentity.result.status, 0);
  assert.match(missingIdentity.result.stderr, /without identity\/payloadHash/);

  const duplicate = run({ current: universe([record('1'), record('1')]) });
  assert.notEqual(duplicate.result.status, 0);
  assert.match(duplicate.result.stderr, /Duplicate constituent identity/);
});

test('required JSON input that resolves to a directory fails closed before parsing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-delta-dir-'));
  const out = path.join(tmp, 'out.json');
  const result = spawnSync(process.execPath, ['scripts/live-open-data-delta-kpi.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CURRENT_UNIVERSE_JSON: tmp,
      KIDULTS_COLLECTION_DELTA_KPI_OUTPUT: out,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JSON input is not a file/);
});
