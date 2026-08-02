import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b10');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'portal.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');

test('B10 is isolated from legacy B5 override layers', () => {
  assert.ok(!html.includes('/a13-b5/'));
  assert.ok(html.includes('/a13-b10/portal.css'));
  assert.ok(html.includes('/a13-b10/portal.js'));
});

test('B10 preserves the approved collector intelligence hero', () => {
  assert.ok(html.includes('Collector Intelligence / Signal 001'));
  assert.ok(html.includes('Objects become'));
  assert.ok(html.includes('before consensus.'));
  assert.ok(html.includes('Scarcity, canon and market velocity'));
});

test('B10 includes the complete intelligence product flow', () => {
  for (const id of ['hero','index','signals','evidence','research']) assert.ok(html.includes(`id="${id}"`), id);
  for (const token of ['Kidult 100','Signal queue','Evidence drawer','Watchlist','Research memory']) assert.ok(html.includes(token), token);
});

test('B10 uses a single responsive editorial design system', () => {
  assert.ok(css.includes('--ivory'));
  assert.ok(css.includes('.hero-watermark'));
  assert.ok(css.includes('@media(max-width:1200px)'));
  assert.ok(css.includes('@media(max-width:900px)'));
  assert.ok(css.includes('@media(max-width:520px)'));
});

test('B10 supports benchmark, signal and navigation interactions', () => {
  assert.ok(js.includes('[data-category]'));
  assert.ok(js.includes('[data-horizon]'));
  assert.ok(js.includes('[data-signal]'));
  assert.ok(js.includes('IntersectionObserver'));
  assert.ok(js.includes('scrollIntoView'));
});