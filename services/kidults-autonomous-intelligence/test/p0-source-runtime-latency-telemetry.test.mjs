import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'scripts', 'kidult100-poc-live.mjs'), 'utf8');

test('Stage 2 records per-source latency without widening source access or certification', () => {
  for (const token of [
    'successfulAttempts: 0',
    'failedAttempts: 0',
    'elapsedMs: 0',
    'maxAttemptMs: 0',
    'const attemptStarted = Date.now()',
    'runtime.successfulAttempts += 1',
    'runtime.failedAttempts += 1',
    'runtime.elapsedMs += attemptElapsedMs',
    'runtime.maxAttemptMs = Math.max(runtime.maxAttemptMs, attemptElapsedMs)',
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(source, /for \(const collector of collectors\)/);
  assert.match(source, /await collector\.run\(query, vertical\.id\)/);
  assert.match(source, /serialWikidataReadRequests: true/);
  assert.match(source, /serverDrivenBackpressure: true/);
  assert.match(source, /accessDenialCircuitBreaker: true/);
  assert.match(source, /decisionGradeRightDataCertified: false/);
  assert.match(source, /finalKidult100Certified: false/);
  assert.doesNotMatch(source, /Promise\.all\(collectors/);
});
