import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b5/assets');
const js = fs.readFileSync(path.join(root, 'workspace.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'holistic-tuning.css'), 'utf8');

test('B7 replaces the generic hero with category-defining positioning', () => {
  assert.ok(js.includes('The autonomous<br>intelligence layer<br>for global collectible markets.'));
  assert.ok(js.includes('proprietary benchmarks, signals and decision intelligence'));
});

test('B7 defines stable top-level section anchors', () => {
  for (const id of ['command','benchmark','signals','evidence','research']) assert.ok(js.includes(`'${id}'`), id);
  assert.ok(css.includes('scroll-padding-top'));
  assert.ok(css.includes('scroll-margin-top'));
});

test('B7 synchronizes top navigation and workspace navigation', () => {
  assert.ok(js.includes('data-scroll-target'));
  assert.ok(js.includes('IntersectionObserver'));
  assert.ok(js.includes('scrollIntoView'));
});

test('B7 adds a real Research Memory section', () => {
  assert.ok(js.includes("research.id = 'research'"));
  assert.ok(js.includes('Intelligence that compounds over time.'));
  assert.ok(css.includes('.research-memory__grid'));
});

test('B7 applies holistic desktop and mobile tuning', () => {
  assert.ok(css.includes('@media(max-width:1280px)'));
  assert.ok(css.includes('@media(max-width:1100px)'));
  assert.ok(css.includes('@media(max-width:820px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
});
