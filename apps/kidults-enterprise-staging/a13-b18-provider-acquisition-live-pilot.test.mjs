import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B18-BASELINE.md'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-acquisition.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b18-live-pilot-readiness.mjs'), 'utf8');

test('A13-B18 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B18');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B18 evaluates all required provider roles', () => {
  assert.deepEqual(contract.requiredRoles, ['transactions', 'supply', 'culturalDemand']);
  assert.ok(contract.minimumIndependentProviderFamilies >= 2);
  assert.match(runner, /selectedProviders/);
});

test('A13-B18 defines commercial technical and rights gates', () => {
  assert.equal(typeof contract.minimumPassingScore, 'number');
  assert.equal(typeof contract.pilotThresholds.maximumMonthlyPilotCostUsd, 'number');
  assert.match(runner, /rightsPassed/);
  assert.match(runner, /technicalPassed/);
  assert.match(runner, /commercialPassed/);
});

test('A13-B18 publishes machine-readable live pilot readiness', () => {
  assert.match(runner, /live-pilot-readiness\.json/);
  assert.match(runner, /live-pilot-ready/);
  assert.match(runner, /Explicit production release authorization remains false/);
});

test('A13-B18 blocks promotion until pilot approval and mobile gates remain', () => {
  assert.equal(contract.pilot.approved, false);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
  assert.match(baseline, /production promotion remains blocked by default/i);
});
