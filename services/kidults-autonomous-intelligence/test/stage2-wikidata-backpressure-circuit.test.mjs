import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-poc-live.mjs'),
  'utf8',
);

test('Stage2 opens a bounded Wikidata circuit only after repeated explicit backpressure', () => {
  assert.match(source, /const WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD = 3;/);
  assert.match(source, /if \(maxlag \|\| response\.status === 429\)/);
  assert.match(source, /consecutiveBackpressureSignals \+= 1/);
  assert.match(source, /consecutiveBackpressureSignals >= WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD/);
  assert.match(source, /WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN:/);
  assert.match(source, /wikidataRuntime\.consecutiveBackpressureSignals = 0;/);
  assert.doesNotMatch(source, /response\.status >= 500/);
});

test('Stage2 backpressure circuit is fail-closed missingness, not source-policy widening', () => {
  assert.match(source, /blockedSources\.add\(collector\.id\)/);
  assert.match(source, /WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN/);
  assert.match(source, /wikidataBackpressureCircuitBreaker: true/);
  assert.match(source, /wikidataBackpressureCircuitThreshold: WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD/);
  assert.match(source, /Missing source data remains missing/);
  assert.doesNotMatch(source, /decisionGradeRightDataCertified:\s*true/);
  assert.doesNotMatch(source, /finalKidult100Certified:\s*true/);
  assert.doesNotMatch(source, /Promise\.all\(collectors/);
});
