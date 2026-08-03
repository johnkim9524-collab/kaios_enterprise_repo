import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B19-BASELINE.md'), 'utf8');
const dossier = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-candidate-dossier.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b19-provider-shortlist.mjs'), 'utf8');

test('A13-B19 remains staging-only and production-safe', () => {
  assert.equal(dossier.release, 'A13-B19');
  assert.equal(dossier.environment, 'staging');
  assert.equal(dossier.productionPromotionAuthorized, false);
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B19 populates at least two candidates for every required role', () => {
  for (const role of dossier.requiredRoles) {
    assert.ok(dossier.candidates.filter(candidate => candidate.role === role).length >= 2);
  }
});

test('A13-B19 preserves unknown commercial and service-level values', () => {
  for (const candidate of dossier.candidates) {
    assert.equal(Object.hasOwn(candidate, 'monthlyPilotCostUsd'), false);
    assert.equal(Object.hasOwn(candidate, 'uptimePercent'), false);
    assert.equal(Object.hasOwn(candidate, 'p95LatencyMs'), false);
    assert.equal(Object.hasOwn(candidate, 'quotaPerDay'), false);
  }
  assert.equal(dossier.researchPolicy.unknownValuesRemainUnknown, true);
});

test('A13-B19 distinguishes restricted alpha paid and public access', () => {
  const statuses = dossier.candidates.map(candidate => candidate.accessStatus).join(' ');
  assert.match(statuses, /restricted/);
  assert.match(statuses, /alpha/);
  assert.match(statuses, /paid/);
  assert.match(statuses, /public-api/);
});

test('A13-B19 publishes a machine-readable shortlist and outreach plan', () => {
  assert.match(runner, /provider-shortlist\.json/);
  assert.match(runner, /candidate-shortlist-ready/);
  assert.match(runner, /outreachRequired/);
  assert.match(runner, /Production promotion authorized: false/);
});

test('A13-B19 does not approve a pilot without direct diligence', () => {
  assert.match(baseline, /Do not mark any provider as pilot-ready/i);
  assert.match(runner, /pilotApproval: 'blocked'/);
  assert.match(runner, /Explicit production release authorization remains false/);
});


test('A13-B19 renders the verified shortlist without invented commercial metrics', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="provider-shortlist"/);
  assert.match(html, /data-shortlist-roles-list/);
  assert.match(js, /provider-shortlist\.json/);
  assert.match(js, /outreachAction/);
  assert.match(css, /A13-B19 provider shortlist/);
  assert.doesNotMatch(js, /monthlyPilotCostUsd/);
});

test('A13-B19 UI keeps production blocked and exposes no credentials', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /API_KEY/);
  assert.doesNotMatch(js, /process\.env/);
});
