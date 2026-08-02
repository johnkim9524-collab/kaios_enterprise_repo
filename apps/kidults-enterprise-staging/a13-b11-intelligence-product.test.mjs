import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B11-BASELINE.md'), 'utf8');
const product = JSON.parse(
  fs.readFileSync(path.join(publicRoot, 'data', 'intelligence-product.json'), 'utf8')
);

test('A13-B11 keeps staging and illustrative data explicit', () => {
  assert.equal(product.meta.release, 'A13-B11');
  assert.equal(product.meta.status, 'staging');
  assert.equal(product.meta.dataMode, 'illustrative');
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B11 defines the required category intelligence matrix', () => {
  assert.ok(Array.isArray(product.categoryMatrix));
  assert.ok(product.categoryMatrix.length >= 4);

  for (const item of product.categoryMatrix) {
    assert.equal(typeof item.category, 'string');
    assert.equal(typeof item.index, 'number');
    assert.equal(typeof item.velocity, 'number');
    assert.equal(typeof item.liquidity, 'number');
    assert.equal(typeof item.canonStrength, 'number');
    assert.equal(typeof item.culturalDurability, 'number');
    assert.equal(typeof item.scarcityIntegrity, 'number');
    assert.equal(typeof item.confidence, 'number');
    assert.equal(typeof item.regime, 'string');
  }
});

test('A13-B11 canon contract exposes four explainable dimensions', () => {
  assert.match(product.canon.headline, /Cultural durability/i);
  assert.equal(product.canon.dimensions.length, 4);

  const keys = product.canon.dimensions.map(item => item.key);
  assert.deepEqual(keys, ['memory', 'licensing', 'community', 'crossBorder']);

  for (const item of product.canon.dimensions) {
    assert.equal(typeof item.score, 'number');
    assert.ok(item.definition.length > 20);
  }
});

test('A13-B11 Method & Trust contract publishes evidence principles', () => {
  assert.equal(product.method.sourceFamilies, 42);
  assert.equal(product.method.brandsCovered, 500);
  assert.equal(product.method.categoriesCovered, 12);
  assert.equal(product.method.principles.length, 4);
  assert.match(product.method.confidenceModel, /Source diversity/i);
});

test('A13-B11 time-series contract supports all categories and horizons', () => {
  assert.deepEqual(product.timeSeries.horizons, ['1M', '3M', '6M', '1Y']);

  for (const key of ['all', 'character', 'cards', 'art']) {
    const series = product.timeSeries.series[key];
    assert.ok(Array.isArray(series));
    assert.equal(series.length, 12);
    assert.ok(series.every(value => typeof value === 'number'));
  }
});

test('A13-B11 architecture remains one HTML, one CSS and one JS', () => {
  assert.match(baseline, /one HTML file, one physical CSS file and one interaction JavaScript file/i);
  assert.match(baseline, /Do not inject stylesheets at runtime/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
});
