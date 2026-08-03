import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B12-BASELINE.md'), 'utf8');
const adapter = JSON.parse(
  fs.readFileSync(path.join(publicRoot, 'data', 'data-adapter.json'), 'utf8')
);

test('A13-B12 keeps production untouched and fallback explicit', () => {
  assert.equal(adapter.release, 'A13-B12');
  assert.equal(adapter.mode, 'fallback');
  assert.equal(adapter.fallback, '/a13-b10/data/intelligence-product.json');
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B12 adapter publishes freshness and provenance', () => {
  assert.equal(typeof adapter.freshness.generatedAt, 'string');
  assert.equal(typeof adapter.freshness.maxAgeMinutes, 'number');
  assert.equal(adapter.freshness.status, 'illustrative');
  assert.equal(adapter.provenance.sourceFamilies, 42);
  assert.equal(adapter.provenance.brandsCovered, 500);
  assert.equal(adapter.provenance.categoriesCovered, 12);
  assert.match(adapter.provenance.confidenceModel, /Source diversity/i);
});

test('A13-B12 adapter fails safely', () => {
  assert.equal(adapter.safety.requireExplicitMode, true);
  assert.equal(adapter.safety.allowLiveWithoutProvenance, false);
  assert.equal(adapter.safety.fallbackOnFetchError, true);
  assert.equal(adapter.safety.fallbackOnSchemaError, true);
});

test('A13-B12 retains the approved architecture and mobile gates', () => {
  assert.match(baseline, /one HTML file, one physical CSS file and one interaction JavaScript file/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
  assert.match(baseline, /No runtime stylesheet injection/i);
});
