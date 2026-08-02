import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const portalCss = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const stabilityCss = fs.readFileSync(path.join(root, 'hero-stability.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'mobile-final.css'), 'utf8');
const bundleCss = fs.readFileSync(path.join(root, 'portal-bundle.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const baseline = fs.readFileSync(path.join(root, 'BASELINE-LOCK.md'), 'utf8');

const combined = `${portalCss}\n${stabilityCss}\n${mobileCss}`;

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
  assert.match(stylesheetLinks[0], /\/a13-b10\/portal-bundle\.css/);
  assert.doesNotMatch(html, /hero-stability\.css/);
  assert.doesNotMatch(html, /mobile-final\.css/);
  assert.match(bundleCss, /portal\.css/);
  assert.match(bundleCss, /hero-stability\.css/);
  assert.match(bundleCss, /mobile-final\.css/);
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
  assert.match(mobileCss, /grid-template-areas:\s*\n\s*"priority score"/);
  assert.match(mobileCss, /\.research-grid\s*\{[^}]*display:\s*block/s);
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
