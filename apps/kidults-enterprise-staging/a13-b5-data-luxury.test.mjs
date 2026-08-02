import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b5');
const js = fs.readFileSync(path.join(root, 'assets/workspace.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/data-luxury.css'), 'utf8');

test('B5 loads the data luxury visual system', () => {
  assert.ok(js.includes('/a13-b5/assets/data-luxury.css'));
  assert.ok(css.includes('font-variant-numeric:lining-nums tabular-nums'));
});

test('B5 analytical chart exposes both axes and labels', () => {
  for (const token of ['axis-line','axis-tick','axis-label','INDEX','2026']) assert.ok(js.includes(token), token);
});

test('B5 separates analytical charts from watchlist sparklines', () => {
  assert.ok(js.includes('30D normalized trend'));
  assert.ok(css.includes('.spark-meta'));
});

test('B5 aligns metric card content using fixed row structures', () => {
  assert.ok(css.includes('grid-template-rows:18px 52px 20px'));
  assert.ok(css.includes('grid-template-rows:18px 34px'));
});

test('B5 preserves mobile responsive behavior', () => {
  assert.ok(css.includes('@media(max-width:820px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
});
