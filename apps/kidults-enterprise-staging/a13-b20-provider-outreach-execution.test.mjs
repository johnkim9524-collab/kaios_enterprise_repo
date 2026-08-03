import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B20-BASELINE.md'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b20-outreach-status.mjs'), 'utf8');

test('A13-B20 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B20');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /production promotion remains blocked by default/i);
});

test('A13-B20 queues primary and alternate candidates for every role', () => {
  for (const role of contract.requiredRoles) {
    assert.ok(contract.outreachQueue.filter(item => item.role === role).length >= 2);
  }
});

test('A13-B20 requires evidence before pilot approval', () => {
  assert.ok(contract.evidenceRequirements.includes('production-use-rights'));
  assert.ok(contract.evidenceRequirements.includes('retention-rights'));
  assert.match(runner, /evidenceComplete/);
  assert.match(runner, /pilotReady/);
});

test('A13-B20 publishes machine-readable outreach status', () => {
  assert.match(runner, /provider-outreach-status\.json/);
  assert.match(runner, /outreach-in-progress/);
  assert.match(runner, /pilot-handoff-ready/);
});

test('A13-B20 keeps personal details and secrets out of the repository', () => {
  assert.doesNotMatch(JSON.stringify(contract), /@/);
  assert.doesNotMatch(runner, /process\.env/);
  assert.match(baseline, /no secret values or personal contact details committed/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});


test('A13-B20 renders outreach progress evidence and blockers', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dataRoot, '..', 'portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /id="provider-outreach"/);
  assert.match(html, /data-outreach-queue/);
  assert.match(js, /provider-outreach-status\.json/);
  assert.match(js, /evidenceComplete/);
  assert.match(js, /pilotReady/);
  assert.match(css, /A13-B20 provider outreach/);
});

test('A13-B20 UI remains secret-safe and production-blocked', () => {
  const html = fs.readFileSync(path.join(dataRoot, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dataRoot, '..', 'portal.js'), 'utf8');
  assert.match(html, /Production blocked/i);
  assert.doesNotMatch(html, /API_KEY|@/);
  assert.doesNotMatch(js, /process\.env/);
});
