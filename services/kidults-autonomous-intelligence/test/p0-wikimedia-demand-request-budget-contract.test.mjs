import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, 'scripts', 'kidult100-wikimedia-demand-evidence.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');

function occurrences(value, pattern) {
  return value.split(pattern).length - 1;
}

test('Wikimedia demand evidence requests remain bounded, sequential, and fail-closed', () => {
  assert.match(source, /const MAX_RETRIES = 3;/);
  assert.ok(occurrences(source, 'AbortSignal.timeout(15000)') >= 1);
  assert.match(source, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(source, /transient && attempt < MAX_RETRIES/);
  assert.match(source, /Math\.min\(10000, retryAfter \* 1000\)/);
  assert.match(source, /Math\.min\(8000, 600 \* \(2 \*\* attempt\)\)/);
  assert.doesNotMatch(source, /Promise\.all\(/);
});

test('Wikimedia demand lane cannot widen rights or turn attention into market evidence', () => {
  assert.match(source, /source\.sequentialRequests !== true/);
  assert.match(source, /source\.unauthorizedScrapingAllowed !== false/);
  assert.match(source, /source\.paidProviderRequired !== false/);
  assert.match(source, /evidencePolicy\.normalizedScoreAllowed !== false/);
  assert.match(source, /evidencePolicy\.marketDemandClaimAllowed !== false/);
  assert.match(source, /normalizedScoresGenerated: false/);
  assert.match(source, /marketDemandClaimed: false/);
  assert.match(source, /transactionOrLiquidityClaimed: false/);
  assert.match(source, /syntheticOrEstimatedEvidenceUsed: false/);
  assert.match(source, /unauthorizedScrapingUsed: false/);
  assert.match(source, /paidProviderUsed: false/);
});
