import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b5/assets');
const css = fs.readFileSync(path.join(root, 'readability-polish.css'), 'utf8');
const reflow = fs.readFileSync(path.join(root, 'benchmark-signal-reflow.css'), 'utf8');

test('B9 loads readability polish after benchmark reflow', () => {
  assert.ok(reflow.startsWith("@import url('/a13-b5/assets/readability-polish.css')"));
});

test('B9 enlarges non-hero interface typography', () => {
  for (const token of ['font-size:14px','.signal-name span{font-size:12.5px','.evidence-list div{font-size:13.5px']) assert.ok(css.includes(token), token);
});

test('B9 gives right panels a readable minimum width', () => {
  assert.ok(css.includes('minmax(390px,.72fr)'));
  assert.ok(css.includes('minmax(390px,.7fr)'));
});

test('B9 rebuilds Watchlist as aligned 2x2 analytical cards', () => {
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes("content:'+4.8%'"));
  assert.ok(css.includes("content:'−0.6%'"));
});

test('B9 preserves mobile readability and stacking', () => {
  assert.ok(css.includes('@media(max-width:820px)'));
  assert.ok(css.includes('grid-template-columns:1fr!important'));
});
