import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'scripts', 'kidult100-poc-live.mjs'), 'utf8');

test('Stage 2 source latency telemetry remains observational and cannot auto-prune evidence supply', () => {
  assert.match(source, /runtime\.attempts \+= 1/);
  assert.match(source, /runtime\.successfulAttempts \+= 1/);
  assert.match(source, /runtime\.failedAttempts \+= 1/);
  assert.match(source, /runtime\.elapsedMs \+= attemptElapsedMs/);
  assert.match(source, /runtime\.maxAttemptMs = Math\.max\(runtime\.maxAttemptMs, attemptElapsedMs\)/);
  assert.match(source, /metrics:\s*\{[\s\S]*sourceAccessRuntime/);

  assert.match(source, /const circuitReason = \/\^HTTP_\(401\|403\):\/\.test\(message\)[\s\S]*WIKIDATA_BACKPRESSURE_CIRCUIT_OPEN/);
  assert.match(source, /if \(circuitReason\) \{[\s\S]*blockedSources\.add\(collector\.id\)/);
  assert.doesNotMatch(source, /if\s*\([^)]*(?:elapsedMs|maxAttemptMs)/);
  assert.doesNotMatch(source, /blockedSources\.add\([^)]*\)[\s\S]{0,160}(?:elapsedMs|maxAttemptMs)/);
  assert.doesNotMatch(source, /Promise\.all\(collectors/);
});
