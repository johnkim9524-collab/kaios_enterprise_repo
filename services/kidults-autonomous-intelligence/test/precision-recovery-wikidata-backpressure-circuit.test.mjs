import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-precision-recovery-live.mjs'),
  'utf8',
);

test('precision recovery opens a bounded circuit only on repeated explicit Wikidata backpressure', () => {
  assert.match(source, /const WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD = 3;/);
  assert.match(source, /if \(maxlag \|\| response\.status === 429\)/);
  assert.match(source, /runtime\.consecutiveBackpressureSignals \+= 1/);
  assert.match(source, /runtime\.consecutiveBackpressureSignals >= WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD/);
  assert.match(source, /WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN:/);
  assert.match(source, /runtime\.consecutiveBackpressureSignals = 0;/);
  assert.doesNotMatch(source, /response\.status >= 500/);
});

test('precision recovery circuit stops further network calls without widening evidence policy', () => {
  assert.match(source, /if \(runtime\.backpressureCircuitOpened\)/);
  assert.match(source, /wikidataRetriesOnlyOnExplicitBackpressure: true/);
  assert.match(source, /wikidataBackpressureCircuitBreaker: true/);
  assert.match(source, /wikidataBackpressureCircuitThreshold: WIKIDATA_BACKPRESSURE_CIRCUIT_THRESHOLD/);
  assert.match(source, /latencyBasedSourcePruning: false/);
  assert.match(source, /missingSourceDataRemainsMissing: true/);
  assert.match(source, /partialEvidenceAccepted: false/);
  assert.match(source, /unauthorizedScrapingRequested: false/);
  assert.match(source, /paidProviderProcurementRequested: false/);
  assert.match(source, /syntheticEvidenceCreated: false/);
  assert.match(source, /marketEvidenceCreated: false/);
  assert.match(source, /productionGateRelaxed: false/);
  assert.doesNotMatch(source, /decisionGradeRightDataCertified:\s*true/);
  assert.doesNotMatch(source, /finalKidult100Certified:\s*true/);
});
