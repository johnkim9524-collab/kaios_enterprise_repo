import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const dataRoot = path.join(publicRoot, 'data');
const sourceRoot = path.join(dataRoot, 'sources');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B14-INTEGRATED-BASELINE.md'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'integrated-activation.json'), 'utf8'));
const methodology = JSON.parse(fs.readFileSync(path.join(dataRoot, 'kidult-100-methodology.json'), 'utf8'));
const pipeline = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b14-integrated-pipeline.mjs'), 'utf8');
const sources = [
  JSON.parse(fs.readFileSync(path.join(sourceRoot, 'transactions.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(sourceRoot, 'supply.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(sourceRoot, 'cultural-demand.json'), 'utf8'))
];

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

test('A13-B14 registers all three source roles with rights and provenance', () => {
  assert.deepEqual(sources.map(source => source.role), ['transactions', 'supply', 'culturalDemand']);
  assert.equal(new Set(sources.map(source => source.family)).size, 3);
  for (const source of sources) {
    assert.equal(source.mode, 'illustrative');
    assert.equal(source.rights.status, 'staging-approved');
    assert.equal(source.rights.commercialUse, false);
    assert.equal(typeof source.provenance.provider, 'string');
    assert.ok(Array.isArray(source.records));
    assert.ok(source.records.length >= 3);
  }
});

test('A13-B14 methodology is deterministic and normalized', () => {
  assert.equal(methodology.engine, 'Kidult 100');
  assert.equal(methodology.methodVersion, 'K100-3.0');
  assert.equal(methodology.deterministic, true);
  assert.ok(methodology.minimumEvidenceRoles >= 2);
  const weightTotal = Object.values(methodology.weights).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(weightTotal - 1) < 0.000001);
  assert.ok(methodology.penalties.missingRole > 0);
  assert.ok(methodology.penalties.anomalyMultiplier > 0);
});

test('A13-B14 pipeline performs normalization reconciliation and scoring', () => {
  assert.match(pipeline, /const categories = \[\.\.\.new Set/);
  assert.match(pipeline, /Object\.assign\(\{\}, \.\.\.evidence/);
  assert.match(pipeline, /methodology\.weights/);
  assert.match(pipeline, /missingRoles\.length \* methodology\.penalties\.missingRole/);
  assert.match(pipeline, /anomalyRate \* methodology\.penalties\.anomalyMultiplier/);
  assert.match(pipeline, /sort\(\(a, b\) => b\.score - a\.score\)/);
});

test('A13-B14 pipeline generates index report archive and readiness outputs', () => {
  assert.match(pipeline, /generated', 'kidult-100\.json/);
  assert.match(pipeline, /generated', 'monthly-intelligence\.json/);
  assert.match(pipeline, /generated', 'readiness\.json/);
  assert.match(pipeline, /archive\.json/);
  assert.match(pipeline, /executiveSummary/);
  assert.match(pipeline, /categoryLeaders/);
  assert.match(pipeline, /riskWatch/);
});

test('A13-B14 keeps production promotion blocked by default', () => {
  assert.match(pipeline, /productionPromotionAuthorized: false/);
  assert.match(pipeline, /Production promotion requires explicit external source rights certification/);
  assert.ok(contract.workstreams.sourceOnboarding.minimumIndependentHealthyFamilies >= 2);
  assert.equal(contract.workstreams.sourceOnboarding.rightsMetadataRequired, true);
  assert.equal(contract.workstreams.sourceOnboarding.provenanceRequired, true);
});

test('A13-B14 retains mobile and deterministic quality gates', () => {
  assert.deepEqual(contract.workstreams.certification.mobileWidths, [320, 360, 390, 430]);
  assert.equal(contract.workstreams.scoring.minimumEvidenceThresholdRequired, true);
  assert.equal(contract.workstreams.scoring.confidencePenaltyRequired, true);
  assert.equal(contract.workstreams.scoring.anomalyControlRequired, true);
  assert.match(baseline, /one HTML, one physical CSS and one interaction JavaScript/i);
});


test('A13-B14 renders generated index monthly intelligence and readiness in the portal', () => {
  const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');
  assert.match(html, /id="integrated-activation"/);
  assert.match(html, /data-activation-score/);
  assert.match(html, /data-activation-gates/);
  assert.match(css, /\.activation-gates/);
  assert.match(css, /A13-B14 Integrated Intelligence Activation/);
  assert.match(js, /loadIntegratedActivation/);
  assert.match(js, /generated\/kidult-100\.json/);
  assert.match(js, /generated\/monthly-intelligence\.json/);
  assert.match(js, /generated\/readiness\.json/);
});

test('A13-B14 preserves fallback when generated activation outputs are unavailable', () => {
  const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');
  assert.match(js, /B12 fallback remains active/);
  assert.match(js, /activationReadiness/);
  assert.match(js, /production promotion remains blocked/i);
});
