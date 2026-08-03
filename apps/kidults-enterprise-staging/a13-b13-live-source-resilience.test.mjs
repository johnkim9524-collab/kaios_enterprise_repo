import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const publicRoot = path.join(appRoot, 'public', 'a13-b10');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B13-BASELINE.md'), 'utf8');
const registry = JSON.parse(
  fs.readFileSync(path.join(publicRoot, 'data', 'source-registry.json'), 'utf8')
);
const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');
const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');

test('A13-B13 remains staging-only and production-safe', () => {
  assert.equal(registry.release, 'A13-B13');
  assert.equal(registry.environment, 'staging');
  assert.match(baseline, /Production remains untouched/i);
});

test('A13-B13 registry defines aggregate partial-failure behavior', () => {
  assert.equal(registry.aggregatePolicy.allowPartialFailure, true);
  assert.equal(registry.aggregatePolicy.fallbackOnTotalFailure, true);
  assert.equal(registry.aggregatePolicy.minimumHealthySources, 1);
  assert.equal(registry.aggregatePolicy.fallbackDataset, '/a13-b10/data/intelligence-product.json');
});

test('A13-B13 registry defines timeout retry and circuit breaker defaults', () => {
  assert.equal(typeof registry.defaults.timeoutMs, 'number');
  assert.ok(registry.defaults.timeoutMs > 0);
  assert.ok(registry.defaults.retry.maxAttempts >= 1);
  assert.ok(Array.isArray(registry.defaults.retry.retryOn));
  assert.ok(registry.defaults.circuitBreaker.failureThreshold >= 1);
  assert.ok(registry.defaults.circuitBreaker.openMs > 0);
});

test('A13-B13 registry publishes freshness and provenance per source', () => {
  assert.ok(Array.isArray(registry.sources));
  assert.ok(registry.sources.length >= 1);
  for (const source of registry.sources) {
    assert.equal(typeof source.id, 'string');
    assert.equal(typeof source.label, 'string');
    assert.equal(typeof source.enabled, 'boolean');
    assert.equal(typeof source.priority, 'number');
    assert.equal(typeof source.provenance.sourceFamilies, 'number');
    assert.equal(typeof source.provenance.brandsCovered, 'number');
    assert.equal(typeof source.provenance.confidenceModel, 'string');
  }
});

test('A13-B13 retains the approved architecture and mobile gates', () => {
  assert.match(baseline, /one HTML file/i);
  assert.match(baseline, /one physical CSS file/i);
  assert.match(baseline, /one interaction JavaScript file/i);
  assert.match(baseline, /320px, 360px, 390px and 430px/i);
  assert.match(baseline, /no runtime stylesheet injection/i);
});


test('A13-B13 renders operational health and source registry UI', () => {
  assert.match(html, /id="operational-health"/);
  assert.match(html, /data-registry-state/);
  assert.match(html, /data-source-health-list/);
  assert.match(css, /\.source-health-list/);
  assert.match(css, /\.source-health-status/);
});

test('A13-B13 loads and validates the source registry before product delivery', () => {
  assert.match(js, /fetchJson\('\/a13-b10\/data\/source-registry\.json'\)/);
  assert.match(js, /validateSourceRegistry/);
  assert.match(js, /loadSourceRegistry\(\)\.finally\(loadProductThroughAdapter\)/);
});

test('A13-B13 implements timeout retry and circuit breaker runtime controls', () => {
  assert.match(js, /AbortController/);
  assert.match(js, /fetchWithTimeout/);
  assert.match(js, /retry\.maxAttempts/);
  assert.match(js, /failureThreshold/);
  assert.match(js, /openMs/);
  assert.match(js, /half-open/);
});

test('A13-B13 publishes partial failure and fallback health states', () => {
  assert.match(js, /Partial failure allowed/);
  assert.match(js, /aggregate = healthy\.length >= minimum/);
  assert.match(js, /document\.body\.dataset\.registryHealth/);
  assert.match(js, /B12 fallback remains active/);
});
