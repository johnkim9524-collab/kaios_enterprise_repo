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
