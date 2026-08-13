import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const observedRunner = fs.readFileSync(path.join(ROOT, 'scripts', 'kidult100-poc-live-observed.mjs'), 'utf8');
const workflow = fs.readFileSync(path.resolve(ROOT, '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml'), 'utf8');

test('Stage 2 source progress telemetry is atomic, observational, and never production evidence', () => {
  assert.match(observedRunner, /stage2-source-progress-latest\.json/);
  assert.match(observedRunner, /observationalOnly:\s*true/);
  assert.match(observedRunner, /productionInput:\s*false/);
  assert.match(observedRunner, /partialEvidenceAccepted:\s*false/);
  assert.match(observedRunner, /REQUEST_STARTED/);
  assert.match(observedRunner, /REQUEST_COMPLETED/);
  assert.match(observedRunner, /REQUEST_FAILED/);
  assert.match(observedRunner, /fs\.renameSync\(TEMP_PROGRESS_PATH, PROGRESS_PATH\)/);
});

test('Stage 2 slow-request diagnostics stay bounded and observational', () => {
  assert.match(observedRunner, /SLOW_REQUEST_LIMIT = 5/);
  assert.match(observedRunner, /slowestRequests:/);
  assert.match(observedRunner, /slowRequests\.sort\(\(a, b\) => b\.elapsedMs - a\.elapsedMs\)/);
  assert.match(observedRunner, /slowRequests\.splice\(SLOW_REQUEST_LIMIT\)/);
  assert.match(observedRunner, /outcome: 'COMPLETED'/);
  assert.match(observedRunner, /outcome: 'FAILED'/);
  assert.doesNotMatch(observedRunner, /autoPrune|autoDisable|productionEligible/);
});

test('Stage 2 observed runner forwards fetch semantics and delegates candidate construction unchanged', () => {
  assert.match(observedRunner, /const response = await originalFetch\(input, init\)/);
  assert.match(observedRunner, /return response/);
  assert.match(observedRunner, /throw error/);
  assert.match(observedRunner, /await import\('\.\/kidult100-poc-live\.mjs'\)/);
  assert.doesNotMatch(observedRunner, /semanticRelevant/);
  assert.doesNotMatch(observedRunner, /rightsClass/);
  assert.doesNotMatch(observedRunner, /normalizedScore/);
});

test('P0 retains the 240 second hard fail-closed budget and uploads timeout progress diagnostics', () => {
  assert.match(workflow, /timeout --signal=TERM --kill-after=10s 240s node scripts\/kidult100-poc-live-observed\.mjs/);
  assert.match(workflow, /stage2-source-progress-latest\.json/);
  assert.match(workflow, /partialEvidenceAccepted:false/);
  assert.doesNotMatch(workflow, /Stage 2 normalized candidate universe build\n\s+continue-on-error:\s+true/);
  assert.match(workflow, /Production 300\+ decision-grade Right Data certification gate\n\s+run: node scripts\/kidult100-stage2-right-data-gate\.mjs/);
});
