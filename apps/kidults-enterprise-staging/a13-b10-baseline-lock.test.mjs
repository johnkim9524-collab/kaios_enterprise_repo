import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const portalCss = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const stabilityCss = fs.readFileSync(path.join(root, 'hero-stability.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const baseline = fs.readFileSync(path.join(root, 'BASELINE-LOCK.md'), 'utf8');

test('A13-B10 keeps the approved editorial hero and explicit mobile line hooks', () => {
  assert.match(html, /Collector Intelligence \/ Signal 001/i);
  assert.match(html, /hero-line/);
  assert.match(html, /hero-culture/);
  assert.match(html, /before consensus\./i);
});

test('A13-B10 mobile baseline prevents overflow-prone fixed page width', () => {
  const combined = `${portalCss}\n${stabilityCss}`;
  assert.doesNotMatch(combined, /body\s*\{[^}]*min-width:\s*320px/s);
  assert.match(combined, /overflow-x:\s*hidden/);
  assert.match(combined, /min-width:\s*0/);
  assert.match(combined, /@media\s*\(max-width:\s*767px\)/);
});

test('A13-B10 score ring is stable and digits are not split by JavaScript', () => {
  const combined = `${portalCss}\n${stabilityCss}`;
  assert.match(combined, /rotate\(-90deg\)/);
  assert.match(combined, /stroke-linecap:\s*butt/);
  assert.doesNotMatch(js, /digit-nine-tail|digit-tall|stylizePremiumNumber/);
});

test('A13-B10 baseline documents the remaining merge gates', () => {
  assert.match(baseline, /STAGING · ILLUSTRATIVE DATA/);
  assert.match(baseline, /one HTML, one CSS and one JS/i);
  assert.match(baseline, /Production remains untouched/i);
});
