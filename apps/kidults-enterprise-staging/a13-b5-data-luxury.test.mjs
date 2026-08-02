import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b5');
const js = fs.readFileSync(path.join(root, 'assets/workspace.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/data-luxury.css'), 'utf8');
const compact = fs.readFileSync(path.join(root, 'assets/compact-command.css'), 'utf8');

test('B5 loads the data luxury and compact command visual systems', () => {
  assert.ok(js.includes('/a13-b5/assets/data-luxury.css'));
  assert.ok(js.includes('/a13-b5/assets/compact-command.css'));
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

test('B6 removes the left rail and creates a compact command strip', () => {
  assert.ok(compact.includes('.rail{display:none!important}'));
  assert.ok(compact.includes('.command-strip'));
  assert.ok(js.includes("strip.className = 'command-strip'"));
  assert.ok(js.includes('rail.remove()'));
});

test('B6 reduces vertical whitespace and lifts lower intelligence panels', () => {
  assert.ok(compact.includes('.canvas{min-height:520px!important'));
  assert.ok(compact.includes('.lower{margin-top:14px!important'));
  assert.ok(compact.includes('.watchlist-inline{margin-top:14px!important'));
});

test('B5 preserves mobile responsive behavior', () => {
  assert.ok(css.includes('@media(max-width:820px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
  assert.ok(compact.includes('@media(max-width:820px)'));
  assert.ok(compact.includes('@media(max-width:380px)'));
});
