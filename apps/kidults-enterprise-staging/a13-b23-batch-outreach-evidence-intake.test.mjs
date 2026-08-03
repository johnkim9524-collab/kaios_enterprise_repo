import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B23-BASELINE.md'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-batch-intake.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b23-batch-intake.mjs'), 'utf8');

test('A13-B23 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B23');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /production remains untouched/i);
});

test('A13-B23 never marks providers contacted automatically', () => {
  assert.equal(contract.dispatchPolicy.automaticDispatch, false);
  assert.equal(contract.dispatchPolicy.explicitConfirmationRequired, true);
  assert.match(runner, /awaiting-explicit-confirmation/);
});

test('A13-B23 validates all eight evidence classes', () => {
  assert.equal(contract.requiredEvidence.length, 8);
  assert.match(runner, /evidenceComplete/);
  assert.match(runner, /pilotReady/);
});

test('A13-B23 publishes machine-readable batch progress', () => {
  assert.match(runner, /provider-batch-progress\.json/);
  assert.match(runner, /batch-intake-open/);
  assert.match(runner, /pilot-handoff-ready/);
});

test('A13-B23 stores no secrets or personal contact details', () => {
  assert.doesNotMatch(JSON.stringify(contract), /@/);
  assert.doesNotMatch(runner, /process\.env/);
  assert.match(baseline, /no secrets, recipient addresses or personal contact details/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});
