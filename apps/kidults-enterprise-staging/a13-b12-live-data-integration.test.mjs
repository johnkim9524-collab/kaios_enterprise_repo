import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B12-BASELINE.md'), 'utf8');
const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');
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

test('A13-B12 renders operational state and provenance visibly', () => {
  assert.match(html, /id="data-operations"/);
  assert.match(html, /Data Operations/i);
  assert.match(html, /data-adapter-status/);
  assert.match(html, /data-adapter-mode/);
  assert.match(html, /data-adapter-freshness/);
  assert.match(html, /data-adapter-source/);
  assert.match(html, /data-adapter-fallback/);
  assert.match(html, /data-adapter-model/);
});

test('A13-B12 loads the adapter before selecting a product source', () => {
  assert.match(js, /fetchJson\('\/a13-b10\/data\/data-adapter\.json'\)/);
  assert.match(js, /validateAdapter/);
  assert.match(js, /preferredSource/);
  assert.match(js, /adapter\.endpoint/);
  assert.match(js, /adapter\.fallback/);
});

test('A13-B12 validates product and live provenance schemas', () => {
  assert.match(js, /validateProduct/);
  assert.match(js, /validateAdapter/);
  assert.match(js, /Live mode requires an endpoint/);
  assert.match(js, /Live mode provenance is incomplete/);
  assert.match(js, /Missing time-series/);
});

test('A13-B12 activates safe fallback on fetch or schema failure', () => {
  assert.match(js, /fallbackOnFetchError/);
  assert.match(js, /fallbackOnSchemaError/);
  assert.match(js, /fallback activated/);
  assert.match(js, /Fallback unavailable/);
  assert.match(js, /state\.effectiveMode = 'fallback'/);
});

test('A13-B12 publishes data mode and freshness to the document', () => {
  assert.match(js, /document\.body\.dataset\.dataMode/);
  assert.match(js, /document\.body\.dataset\.freshness/);
  assert.match(js, /getFreshnessState/);
  assert.match(js, /formatTimestamp/);
});

test('A13-B12 retains the approved architecture and mobile gates', () => {
  const stylesheetLinks = html.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [];
  const scriptLinks = html.match(/<script[^>]+src="[^"]+"[^>]*><\/script>/g) || [];
  assert.equal(stylesheetLinks.length, 1);
  assert.equal(scriptLinks.length, 1);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.match(baseline, /one HTML file, one physical CSS file and one interaction JavaScript file/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
  assert.match(baseline, /No runtime stylesheet injection/i);
});
