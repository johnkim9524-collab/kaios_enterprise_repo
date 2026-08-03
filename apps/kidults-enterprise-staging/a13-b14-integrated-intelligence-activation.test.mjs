import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B14-INTEGRATED-BASELINE.md'), 'utf8');
const contract = JSON.parse(
  fs.readFileSync(path.join(publicRoot, 'data', 'integrated-activation.json'), 'utf8')
);

test('A13-B14 is one integrated staging delivery', () => {
  assert.equal(contract.release, 'A13-B14');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /one integration branch/i);
  assert.match(baseline, /one pull request/i);
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B14 combines source onboarding aggregation scoring reporting and certification', () => {
  assert.deepEqual(contract.workstreams.sourceOnboarding.requiredRoles, [
    'transactions',
    'supply',
    'culturalDemand'
  ]);
  assert.equal(contract.workstreams.aggregation.allowPartialFailure, true);
  assert.equal(contract.workstreams.aggregation.fallbackOnTotalFailure, true);
  assert.equal(contract.workstreams.scoring.engine, 'Kidult 100');
  assert.equal(contract.workstreams.scoring.deterministic, true);
  assert.equal(contract.workstreams.monthlyIntelligence.archiveRegistrationRequired, true);
  assert.equal(contract.workstreams.certification.endToEndRequired, true);
});

test('A13-B14 blocks promotion until independent live evidence and release gates pass', () => {
  assert.ok(contract.workstreams.sourceOnboarding.minimumIndependentHealthyFamilies >= 2);
  assert.equal(contract.workstreams.sourceOnboarding.rightsMetadataRequired, true);
  assert.equal(contract.workstreams.sourceOnboarding.provenanceRequired, true);
  assert.ok(contract.gates.length >= 5);
  assert.ok(contract.gates.every(gate => gate.status === 'pending'));
});

test('A13-B14 retains mobile and deterministic quality gates', () => {
  assert.deepEqual(contract.workstreams.certification.mobileWidths, [320, 360, 390, 430]);
  assert.equal(contract.workstreams.scoring.minimumEvidenceThresholdRequired, true);
  assert.equal(contract.workstreams.scoring.confidencePenaltyRequired, true);
  assert.equal(contract.workstreams.scoring.anomalyControlRequired, true);
  assert.match(baseline, /one HTML, one physical CSS and one interaction JavaScript/i);
});
