import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const observedRunner = fs.readFileSync(path.join(ROOT, 'scripts', 'kidult100-poc-live-observed.mjs'), 'utf8');

test('Stage 2 request-volume telemetry remains observational and cannot alter evidence supply', () => {
  assert.match(observedRunner, /requestVolumeObservation:/);
  assert.match(observedRunner, /totalRequests:\s*requestSequence/);
  assert.match(observedRunner, /totalRawFetchElapsedMs/);
  assert.match(observedRunner, /estimatedNonFetchElapsedMs/);
  assert.match(observedRunner, /observedWikidataRetryGapTotalMs/);
  assert.match(observedRunner, /estimatedResidualNonFetchElapsedMs/);
  assert.match(observedRunner, /averageAttemptMs/);
  assert.match(observedRunner, /requestShare/);
  assert.match(observedRunner, /observationalOnly:\s*true/);
  assert.match(observedRunner, /productionInput:\s*false/);
  assert.match(observedRunner, /autoOptimizationAllowed:\s*false/);
  assert.match(observedRunner, /not evidence, a score, or authority to prune, parallelize, or disable a source/);
  assert.doesNotMatch(observedRunner, /requestVolumeObservation[^\n]*(?:semanticRelevant|rightsClass|normalizedScore|productionEligible)/i);
});

test('Stage 2 request-volume observation is derived from measured fetch attempts and observed retry gaps only', () => {
  assert.match(observedRunner, /Object\.values\(sourceRuntime\)[\s\S]*reduce\(\(sum, runtime\) => sum \+ runtime\.elapsedMs, 0\)/);
  assert.match(observedRunner, /runtime\.attempts > 0[\s\S]*runtime\.elapsedMs \/ runtime\.attempts/);
  assert.match(observedRunner, /runtime\.attempts \/ requestSequence/);
  assert.match(observedRunner, /estimatedNonFetchElapsedMs = Math\.max\(0, stageElapsedMs - totalRawFetchElapsedMs\)/);
  assert.match(observedRunner, /estimatedNonFetchElapsedMs - observedWikidataRetryGapTotalMs/);
  assert.match(observedRunner, /observedWikidataRetryGapCount \+= 1/);
  assert.match(observedRunner, /observedWikidataRetryGapTotalMs \+= gap\.gapMs/);
  assert.match(observedRunner, /observedWikidataRetryGapMaxMs = Math\.max\(observedWikidataRetryGapMaxMs, gap\.gapMs\)/);
});

test('Stage 2 retry-gap decomposition retains bounded examples but aggregates every observed gap', () => {
  assert.match(observedRunner, /retainedEventLimit:\s*RETRY_GAP_LIMIT/);
  assert.match(observedRunner, /observedCount:\s*observedWikidataRetryGapCount/);
  assert.match(observedRunner, /observedTotalMs:\s*observedWikidataRetryGapTotalMs/);
  assert.match(observedRunner, /observedMaxMs:\s*observedWikidataRetryGapMaxMs/);
  assert.match(observedRunner, /events:\s*wikidataRetryGaps\.map/);
});
