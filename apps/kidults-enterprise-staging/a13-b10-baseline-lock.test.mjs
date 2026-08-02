import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const portalCss = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const coreCssPath = path.join(root, 'portal-core.css');
const coreCss = fs.existsSync(coreCssPath)
  ? fs.readFileSync(coreCssPath, 'utf8')
  : '';
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const baseline = fs.readFileSync(path.join(root, 'BASELINE-LOCK.md'), 'utf8');
const combined = `${coreCss}\n${portalCss}`;

test('A13-B10 keeps the approved editorial hero and explicit mobile line hooks', () => {
  assert.match(html, /Collector Intelligence \/ Signal 001/i);
  assert.match(html, /hero-line/);
  assert.match(html, /hero-line-culture/);
  assert.match(html, /before consensus\./i);
});

test('A13-B10 visibly discloses illustrative staging data', () => {
  assert.match(html, /Staging · Illustrative data/i);
});

test('A13-B10 uses one browser CSS entrypoint', () => {
  const stylesheetLinks = html.match(/<link\s+rel="stylesheet"[^>]*>/g) ?? [];
  assert.equal(stylesheetLinks.length, 1);
  assert.match(stylesheetLinks[0], /\/a13-b10\/portal\.css/);
  assert.doesNotMatch(html, /hero-stability\.css/);
  assert.doesNotMatch(html, /mobile-final\.css/);
});

test('A13-B10 mobile baseline prevents overflow-prone fixed page width', () => {
  assert.doesNotMatch(combined, /body\s*\{[^}]*min-width:\s*320px/s);
  assert.match(combined, /overflow-x:\s*(hidden|clip)/);
  assert.match(combined, /min-width:\s*0/);
  assert.match(combined, /@media\s*\(max-width:\s*767px\)/);
});

test('A13-B10 score ring is stable and digits are not split by JavaScript', () => {
  assert.match(combined, /rotate\(-90deg\)/);
  assert.match(combined, /stroke-linecap:\s*butt/);
  assert.doesNotMatch(js, /digit-nine-tail|digit-tall|stylizePremiumNumber/);
});

test('A13-B10 mobile signal and research layouts remain connected', () => {
  assert.match(combined, /grid-template-areas:\s*\n\s*"priority score"/);
  assert.match(combined, /\.research-grid\s*\{[^}]*display:\s*block/s);
});

test('A13-B10 does not inject stylesheets at runtime', () => {
  assert.doesNotMatch(js, /createElement\(['"]link['"]\)/);
  assert.doesNotMatch(js, /mobile-final\.css/);
});

test('A13-B10 synchronizes wide editorial panels to the benchmark width', () => {
  assert.match(js, /getBoundingClientRect\(\)\.width/);
  assert.match(js, /#signals/);
  assert.match(js, /#research/);
  assert.match(js, /1201/);
});

test('A13-B10 baseline documents the remaining merge gates', () => {
  assert.match(baseline, /STAGING · ILLUSTRATIVE DATA/);
  assert.match(baseline, /one HTML, one CSS and one JS/i);
  assert.match(baseline, /Production remains untouched/i);
});
