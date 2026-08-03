import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B15-BASELINE.md'), 'utf8');
const contract = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'external-source-certification.json'), 'utf8')
);
const runner = fs.readFileSync(
  path.join(appRoot, 'scripts', 'run-a13-b15-certification.mjs'),
  'utf8'
);
const envTemplate = fs.readFileSync(
  path.join(appRoot, '.env.external-sources.example'),
  'utf8'
);

test('A13-B15 remains production-safe and secret-safe', () => {
  assert.equal(contract.release, 'A13-B15');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /Production remains untouched/i);
  assert.match(baseline, /No secret value is committed/i);
  assert.doesNotMatch(envTemplate, /=.+/);
});

test('A13-B15 registers all required external source roles', () => {
  assert.deepEqual(contract.requiredRoles, ['transactions', 'supply', 'culturalDemand']);
  const roles = new Set(contract.providers.map(provider => provider.role));
  for (const role of contract.requiredRoles) assert.ok(roles.has(role));
  assert.ok(contract.minimumIndependentCertifiedFamilies >= 2);
});

test('A13-B15 references credentials by environment variable name only', () => {
  for (const provider of contract.providers) {
    assert.match(provider.credentialEnv, /^KIDULTS_[A-Z_]+_API_KEY$/);
    assert.equal(provider.credentialPresent, false);
    assert.equal(provider.endpoint, null);
    assert.equal(provider.healthEndpoint, null);
  }
  assert.match(runner, /process\.env\[provider\.credentialEnv\]/);
});

test('A13-B15 keeps rights health and credentials as independent gates', () => {
  assert.match(runner, /credentialsPassed/);
  assert.match(runner, /rightsPassed/);
  assert.match(runner, /healthReady/);
  assert.match(runner, /independentFamilies/);
  assert.match(runner, /productionPromotionAuthorized/);
});

test('A13-B15 defines schedule and failure simulation certification', () => {
  assert.equal(contract.schedule.enabled, false);
  assert.equal(contract.failureSimulation.required, true);
  assert.ok(contract.failureSimulation.scenarios.length >= 4);
  assert.equal(contract.failureSimulation.status, 'pending');
  assert.match(runner, /schedulePassed/);
  assert.match(runner, /simulationPassed/);
});

test('A13-B15 certification output is deterministic and machine-readable', () => {
  assert.match(runner, /external-source-certification\.json/);
  assert.match(runner, /JSON\.stringify\(result, null, 2\)/);
  assert.match(runner, /status: productionPromotionAuthorized \? 'production-authorized' : 'blocked'/);
  assert.match(runner, /Explicit release authorization remains false/);
});

test('A13-B15 preserves mobile and release safety gates', () => {
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
  assert.match(baseline, /Illustrative fallback remains available/i);
  assert.match(baseline, /production promotion remains blocked by default/i);
});


test('A13-B15 renders external certification and promotion blockers', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="external-certification"/);
  assert.match(html, /data-certification-status/);
  assert.match(html, /data-provider-certification-list/);
  assert.match(css, /A13-B15 External Source Certification/);
  assert.match(js, /loadExternalCertification/);
  assert.match(js, /generated\/external-source-certification\.json/);
  assert.match(js, /productionAuthorized/);
});

test('A13-B15 UI never exposes credential values', () => {
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.doesNotMatch(js, /process\.env/);
  assert.match(js, /Credentials:/);
  assert.match(js, /Production promotion remains blocked/);
});
