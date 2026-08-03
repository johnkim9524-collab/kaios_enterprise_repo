import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');

test('B10 uses the consolidated portal architecture', () => {
  assert.ok(!html.includes('/a13-b5/'));
  assert.ok(html.includes('/a13-b10/portal.css'));
  assert.ok(html.includes('/a13-b10/portal.js'));
  assert.ok(!html.includes('hero-stability.css'));
  assert.ok(!html.includes('mobile-final.css'));
});

test('B10 preserves the approved collector intelligence hero', () => {
  assert.ok(html.includes('Collector Intelligence / Signal 001'));
  assert.ok(html.includes('Objects become'));
  assert.match(html, /<em[^>]*>CULTURE<\/em>/);
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

test('B10 keeps the premium number and chart system in portal.css', () => {
  assert.ok(css.includes('--font-number'));
  assert.ok(css.includes('transform: rotate(-90deg)'));
  assert.ok(css.includes('stroke-dasharray'));
  assert.ok(!js.includes('digit-nine-tail'));
  assert.ok(!js.includes('digit-tall'));
});

test('B10 locks mobile layout without horizontal overflow', () => {
  assert.ok(css.includes('@media (max-width: 767px)'));
  assert.ok(css.includes('overflow-x: hidden'));
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr)'));
  assert.ok(css.includes('.hero h1 em'));
});

test('B10 supports benchmark, signal and navigation interactions', () => {
  assert.ok(js.includes('[data-category]'));
  assert.ok(js.includes('[data-horizon]'));
  assert.ok(js.includes('[data-signal]'));
  assert.ok(js.includes('scrollIntoView'));
  assert.ok(js.includes('requestAnimationFrame'));
  assert.ok(js.includes('setActiveNav'));
});
