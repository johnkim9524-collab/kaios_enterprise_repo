import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B17-BASELINE.md'), 'utf8');
const contract = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'provider-injection.json'), 'utf8')
);
const runner = fs.readFileSync(
  path.join(appRoot, 'scripts', 'run-a13-b17-provider-injection.mjs'),
  'utf8'
);
const rightsTemplate = JSON.parse(
  fs.readFileSync(path.join(appRoot, 'provider-rights', 'TEMPLATE.json'), 'utf8')
);

test('A13-B17 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B17');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /Production remains untouched/i);
  assert.match(runner, /Production promotion authorized: false/);
});

test('A13-B17 registers secure injection variables for all provider roles', () => {
  assert.deepEqual(contract.requiredRoles, ['transactions', 'supply', 'culturalDemand']);
  for (const provider of contract.providers) {
    assert.match(provider.endpointEnv, /^KIDULTS_[A-Z_]+_ENDPOINT$/);
    assert.match(provider.healthEndpointEnv, /^KIDULTS_[A-Z_]+_HEALTH_ENDPOINT$/);
    assert.match(provider.credentialEnv, /^KIDULTS_[A-Z_]+_API_KEY$/);
  }
});

test('A13-B17 never exposes or persists secret values', () => {
  assert.match(runner, /credentialPresent/);
  assert.match(runner, /secretValueExposed: false/);
  assert.doesNotMatch(runner, /console\.log\(process\.env/);
});

test('A13-B17 validates endpoint health credentials and rights independently', () => {
  assert.match(runner, /endpointConfigured/);
  assert.match(runner, /healthEndpointConfigured/);
  assert.match(runner, /credentialPresent/);
  assert.match(runner, /rightsApproved/);
  assert.match(runner, /provider-injection-ready/);
});

test('A13-B17 publishes a provider rights approval template', () => {
  assert.equal(rightsTemplate.status, 'pending');
  assert.equal(rightsTemplate.productionUseApproved, false);
  assert.equal(rightsTemplate.evidenceRetentionApproved, false);
  assert.equal(rightsTemplate.redistributionApproved, false);
});

test('A13-B17 blocks production until explicit authorization', () => {
  assert.match(runner, /productionPromotionAuthorized: false/);
  assert.match(runner, /Explicit production release authorization remains false/);
  assert.match(baseline, /production promotion remains blocked by default/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});
