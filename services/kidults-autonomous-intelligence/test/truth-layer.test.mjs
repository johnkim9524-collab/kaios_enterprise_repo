import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateTruthDataset, fingerprintTruthDataset } from '../scripts/lib/truth-layer.mjs';

const fixtureUrl = new URL('../fixtures/truth-layer/golden-sample.json', import.meta.url);
const dataset = JSON.parse(await readFile(fixtureUrl, 'utf8'));

test('synthetic truth baseline passes the published quality thresholds', () => {
  const result = evaluateTruthDataset(dataset);
  assert.equal(result.passed, true);
  assert.equal(result.metrics.provenanceCoverage, 1);
  assert.equal(result.metrics.entityResolutionAccuracy, 1);
  assert.equal(result.metrics.duplicateContamination, 0);
  assert.equal(result.metrics.staleRejectionAccuracy, 1);
  assert.equal(result.metrics.criticalAssertionMismatchCount, 0);
  assert.equal(result.metrics.dispositionMismatchCount, 0);
});

test('truth dataset fingerprint is deterministic', () => {
  assert.equal(fingerprintTruthDataset(dataset), fingerprintTruthDataset(structuredClone(dataset)));
});

test('critical assertion mismatch fails closed', () => {
  const mutated = structuredClone(dataset);
  mutated.records[0].assertions[0].actual = 'KRW';
  const result = evaluateTruthDataset(mutated);
  assert.equal(result.passed, false);
  assert.equal(result.checks.criticalAssertions, false);
  assert.equal(result.metrics.criticalAssertionMismatchCount, 1);
});

test('stale record accepted by mistake fails closed', () => {
  const mutated = structuredClone(dataset);
  const stale = mutated.records.find((record) => record.expectedDisposition === 'REJECT_STALE');
  stale.actualDisposition = 'ACCEPT';
  const result = evaluateTruthDataset(mutated);
  assert.equal(result.passed, false);
  assert.equal(result.checks.staleRejection, false);
  assert.equal(result.checks.dispositions, false);
});

test('accepted duplicate violates contamination threshold', () => {
  const mutated = structuredClone(dataset);
  const duplicate = mutated.records.find((record) => record.duplicateOf);
  duplicate.expectedDisposition = 'ACCEPT';
  duplicate.actualDisposition = 'ACCEPT';
  const result = evaluateTruthDataset(mutated);
  assert.equal(result.passed, false);
  assert.equal(result.checks.duplicateContamination, false);
});
