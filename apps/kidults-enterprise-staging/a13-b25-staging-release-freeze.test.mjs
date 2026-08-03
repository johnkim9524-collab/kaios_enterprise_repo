import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B25-BASELINE.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, 'staging-release-freeze.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b25-staging-release-freeze.mjs'), 'utf8');

test('A13-B25 freezes the approved staging scope through B24', () => {
  assert.equal(manifest.release, 'A13-B25');
  assert.equal(manifest.environment, 'staging');
  assert.equal(manifest.frozenThrough, 'A13-B24');
  assert.equal(manifest.changePolicy.featureExpansionAllowed, false);
});

test('A13-B25 preserves production isolation and secret safety', () => {
  assert.equal(manifest.productionPromotionAuthorized, false);
  assert.equal(manifest.quality.productionUntouched, true);
  assert.equal(manifest.quality.secretSafe, true);
  assert.match(baseline, /production promotion remains blocked by default/i);
});

test('A13-B25 records only externally resolvable blockers', () => {
  assert.ok(manifest.openExternalDependencies.includes('manual-provider-dispatch'));
  assert.ok(manifest.openExternalDependencies.includes('legal-entity-review'));
  assert.ok(manifest.openExternalDependencies.includes('trademark-filing-review'));
  assert.ok(manifest.openExternalDependencies.includes('live-pilot-approval'));
});

test('A13-B25 permits only defects compliance gaps or approved provider integration', () => {
  assert.equal(manifest.changePolicy.verifiedDefectFixAllowed, true);
  assert.equal(manifest.changePolicy.confirmedComplianceFixAllowed, true);
  assert.equal(manifest.changePolicy.approvedProviderIntegrationAllowed, true);
  assert.match(baseline, /No additional staging feature expansion after B25/i);
});

test('A13-B25 publishes a machine-readable release freeze report', () => {
  assert.match(runner, /staging-release-freeze-status\.json/);
  assert.match(runner, /staging-release-frozen/);
  assert.match(runner, /Production promotion authorized: false/);
});
