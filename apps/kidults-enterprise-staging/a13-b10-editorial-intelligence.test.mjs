import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const stabilityCss = fs.readFileSync(path.join(root, 'hero-stability.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const allCss = `${css}\n${stabilityCss}`;

test('B10 is isolated from legacy B5 override layers', () => {
  assert.ok(!html.includes('/a13-b5/'));
  assert.ok(html.includes('/a13-b10/portal.css'));
  assert.ok(html.includes('/a13-b10/hero-stability.css'));
  assert.ok(html.includes('/a13-b10/portal.js'));
});

test('B10 preserves the approved collector intelligence hero', () => {
  assert.ok(html.includes('Collector Intelligence / Signal 001'));
  assert.ok(html.includes('Objects become'));
  assert.ok(html.includes('<em>CULTURE</em>'));
  assert.ok(html.includes('before consensus.'));
  assert.ok(html.includes('Scarcity, canon and market velocity'));
});

test('B10 includes the complete intelligence product flow', () => {
  for (const id of ['hero', 'index', 'signals', 'evidence', 'research']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  for (const token of ['Kidult 100', 'Signal queue', 'Evidence drawer', 'Watchlist', 'Research memory']) {
    assert.ok(html.includes(token), token);
  }
});

test('B10 locks the donut and premium number system', () => {
  assert.ok(stabilityCss.includes("--font-number: 'Bodoni Moda'"));
  assert.ok(stabilityCss.includes('transform: rotate(-90deg)'));
  assert.ok(stabilityCss.includes('stroke-dasharray: 94.8 100'));
  assert.ok(stabilityCss.includes('stroke-linecap: butt'));
  assert.ok(!js.includes('digit-nine-tail'));
  assert.ok(!js.includes('digit-tall'));
});

test('B10 locks 320px mobile layout without horizontal overflow', () => {
  assert.ok(allCss.includes('@media (max-width: 767px)'));
  assert.ok(allCss.includes('@media (max-width: 359px)'));
  assert.ok(allCss.includes('min-width: 320px'));
  assert.ok(allCss.includes('overflow-x: hidden'));
  assert.ok(allCss.includes('grid-template-columns: minmax(0, 1fr)'));
  assert.ok(allCss.includes('.hero h1 em'));
  assert.ok(allCss.includes('white-space: nowrap'));
  assert.ok(allCss.includes('.hero-proofline'));
  assert.ok(allCss.includes('.hero-index-ring'));
});

test('B10 supports benchmark, signal and navigation interactions', () => {
  assert.ok(js.includes('[data-category]'));
  assert.ok(js.includes('[data-horizon]'));
  assert.ok(js.includes('[data-signal]'));
  assert.ok(js.includes('scrollIntoView'));
  assert.ok(js.includes('requestAnimationFrame'));
  assert.ok(js.includes('setActiveNav'));
});
