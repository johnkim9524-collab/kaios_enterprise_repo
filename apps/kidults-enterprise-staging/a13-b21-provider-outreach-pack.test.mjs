import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B21-BASELINE.md'), 'utf8');
const pack = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach-pack.json'), 'utf8'));
const intake = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-response-intake.json'), 'utf8'));

test('A13-B21 remains staging-only and production-safe', () => {
  assert.equal(pack.release, 'A13-B21');
  assert.equal(pack.environment, 'staging');
  assert.equal(pack.productionPromotionAuthorized, false);
  assert.match(baseline, /production promotion remains blocked by default/i);
});

test('A13-B21 publishes outreach packs for all six B20 queue candidates', () => {
  assert.equal(pack.packs.length, 6);
  assert.deepEqual(new Set(pack.packs.map(item => item.role)), new Set(['transactions', 'supply', 'culturalDemand']));
});

test('A13-B21 requires complete commercial technical and rights evidence', () => {
  assert.deepEqual(pack.questionnaire, intake.requiredEvidence);
  assert.ok(intake.requiredEvidence.includes('production-use-rights'));
  assert.ok(intake.requiredEvidence.includes('retention-rights'));
});

test('A13-B21 stores no secrets or personal contact details', () => {
  const serialized = JSON.stringify({ pack, intake });
  assert.doesNotMatch(serialized, /API_KEY|secret|password/i);
  assert.doesNotMatch(serialized, /@/);
});

test('A13-B21 preserves responsive gates', () => {
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});
