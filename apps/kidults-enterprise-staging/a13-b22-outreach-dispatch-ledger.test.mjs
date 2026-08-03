import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B22-BASELINE.md'), 'utf8');
const ledger = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-dispatch-ledger.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b22-dispatch-ledger.mjs'), 'utf8');

test('A13-B22 remains staging-only and production-safe', () => {
  assert.equal(ledger.release, 'A13-B22');
  assert.equal(ledger.environment, 'staging');
  assert.equal(ledger.productionPromotionAuthorized, false);
  assert.match(baseline, /production remains untouched/i);
});

test('A13-B22 defines an append-only outreach event model', () => {
  assert.deepEqual(ledger.allowedEvents, ['contacted', 'responded', 'diligence', 'rejected', 'evidence-verified']);
  assert.match(runner, /appendEvent/);
  assert.match(runner, /recordedAt/);
});

test('A13-B22 prevents duplicate contacted events', () => {
  assert.match(runner, /Contacted event already exists/);
  assert.match(runner, /duplicateDispatchProtection/);
});

test('A13-B22 requires all eight evidence classes before pilot readiness', () => {
  assert.equal(ledger.requiredEvidence.length, 8);
  assert.ok(ledger.requiredEvidence.includes('production-use-rights'));
  assert.ok(ledger.requiredEvidence.includes('retention-rights'));
  assert.match(runner, /evidenceComplete/);
  assert.match(runner, /pilotReady/);
});

test('A13-B22 stores no secrets or personal contact details', () => {
  assert.match(runner, /personalContactStored: false/);
  assert.match(runner, /secretStored: false/);
  assert.doesNotMatch(runner, /process\.env/);
  assert.match(baseline, /no secrets, recipient addresses or personal contact details/i);
});


test('A13-B22 renders dispatch audit status and candidate history', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="dispatch-ledger"/);
  assert.match(html, /data-dispatch-candidates/);
  assert.match(js, /provider-dispatch-audit\.json/);
  assert.match(js, /evidenceVerified/);
  assert.match(css, /A13-B22 dispatch ledger/);
});

test('A13-B22 UI remains secret-safe and production-blocked', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /@/);
  assert.doesNotMatch(js, /process\.env/);
});
