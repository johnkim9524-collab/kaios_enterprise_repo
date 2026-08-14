import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const observedSource = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'kidult100-poc-live-observed.mjs'),
  'utf8',
);

test('Stage 2 fails closed when active Wikidata is blocked before any successful source attempt', () => {
  assert.match(observedSource, /configuredActive && blockedForRun && successfulAttempts === 0/);
  assert.match(observedSource, /FAIL_CLOSED_CORE_SOURCE_UNAVAILABLE/);
  assert.match(observedSource, /STAGE2_CORE_REFERENCE_SOURCE_UNAVAILABLE/);
  assert.match(observedSource, /enforceCoreSourceReadiness\(\);/);
});

test('core-source readiness diagnostic cannot become evidence or authorize fallback', () => {
  assert.match(observedSource, /partialEvidenceAccepted: false/);
  assert.match(observedSource, /productionInput: false/);
  assert.match(observedSource, /syntheticFallbackAllowed: false/);
  assert.match(observedSource, /staleFallbackAllowed: false/);
  assert.match(observedSource, /productionGateWeakened: false/);
  assert.doesNotMatch(observedSource, /continueOnError\s*:\s*true/);
});
