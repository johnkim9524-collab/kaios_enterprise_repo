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


test('A13-B18 renders live pilot readiness and provider selection UI', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="live-pilot-readiness"/);
  assert.match(html, /data-pilot-role-list/);
  assert.match(css, /A13-B18 Provider Acquisition & Live Pilot/);
  assert.match(js, /renderLivePilotReadiness/);
  assert.match(js, /generated\/live-pilot-readiness\.json/);
});

test('A13-B18 UI exposes only evaluation state and keeps production blocked', () => {
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(js, /productionPromotionAuthorized/);
  assert.match(js, /Production blocked/);
  assert.doesNotMatch(js, /process\.env/);
  assert.doesNotMatch(js, /API_KEY=/);
});
