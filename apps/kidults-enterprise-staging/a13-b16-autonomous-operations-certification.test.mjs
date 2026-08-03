import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B16-BASELINE.md'), 'utf8');
const runbook = fs.readFileSync(path.join(appRoot, 'A13-B16-OPERATIONS-RUNBOOK.md'), 'utf8');
const contract = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'autonomous-operations.json'), 'utf8')
);
const runner = fs.readFileSync(
  path.join(appRoot, 'scripts', 'run-a13-b16-autonomous-operations.mjs'),
  'utf8'
);

test('A13-B16 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B16');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /Production remains untouched/i);
  assert.match(runner, /Production promotion authorized: false/);
});

test('A13-B16 defines one scheduled autonomous runner', () => {
  assert.equal(contract.schedule.enabled, true);
  assert.equal(contract.schedule.concurrency, 1);
  assert.ok(contract.schedule.maxRuntimeMinutes > 0);
  assert.match(contract.schedule.cadence, /^\d+ \d+ \* \* \*$/);
  assert.equal(contract.schedule.runner, 'run-a13-b16-autonomous-operations.mjs');
});

test('A13-B16 defines all required failure simulations', () => {
  const ids = contract.failureSimulation.scenarios.map(item => item.id);
  assert.deepEqual(ids, [
    'single-provider-timeout',
    'single-provider-schema-failure',
    'two-provider-partial-failure',
    'total-provider-failure-with-fallback'
  ]);
  assert.equal(contract.failureSimulation.scenarios.at(-1).fallbackExpected, true);
  assert.match(runner, /simulationResults\.every/);
});

test('A13-B16 reruns B14 and B15 before health certification', () => {
  assert.match(runner, /run-a13-b14-integrated-pipeline\.mjs/);
  assert.match(runner, /run-a13-b15-certification\.mjs/);
  assert.match(runner, /operations-health\.json/);
  assert.match(runner, /autonomous-operations\.json/);
});

test('A13-B16 certifies fallback and preserves partial failure', () => {
  assert.equal(contract.pipeline.continueOnPartialFailure, true);
  assert.equal(contract.pipeline.fallbackOnTotalFailure, true);
  assert.equal(contract.pipeline.fallbackDataset, '/a13-b10/data/intelligence-product.json');
  assert.match(runner, /total-provider-failure-with-fallback/);
  assert.match(runner, /verifiedBySimulation/);
});

test('A13-B16 publishes machine-readable gates and blockers', () => {
  assert.match(runner, /staging-operations-certified/);
  assert.match(runner, /productionPromotionAuthorized: false/);
  assert.match(runner, /Explicit production release authorization remains false/);
  assert.match(runner, /blockers:/);
});

test('A13-B16 documents executable recovery and rollback', () => {
  assert.match(runbook, /run-a13-b16-autonomous-operations\.mjs/);
  assert.match(runbook, /git reset --hard origin\/main/);
  assert.match(runbook, /Never commit `.env` files containing values/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});


test('A13-B16 renders autonomous operations and failure certification UI', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.js'), 'utf8');
  assert.match(html, /id="autonomous-operations"/);
  assert.match(html, /data-operations-simulations-list/);
  assert.match(css, /A13-B16 Autonomous Operations/);
  assert.match(js, /loadAutonomousOperations/);
  assert.match(js, /operations-health\.json/);
  assert.match(js, /autonomous-operations\.json/);
});

test('A13-B16 UI keeps production blocked and exposes no credentials', () => {
  const html = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(appRoot, 'public', 'a13-b10', 'portal.js'), 'utf8');
  assert.match(html, /data-operations-production>Blocked/);
  assert.doesNotMatch(html, /KIDULTS_[A-Z_]+_API_KEY/);
  assert.doesNotMatch(js, /process\.env/);
});
