import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b5');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/workspace.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/workspace.js'), 'utf8');

test('B5 is a workspace rather than a long-form landing page', () => {
  for (const token of ['Command Center','Intelligence Canvas','Machine interpretation','Signal Queue','Evidence drawer','Recommended action']) assert.ok(html.includes(token), token);
  assert.ok(html.includes('class="workspace"'));
  assert.ok(html.includes('class="rail"'));
  assert.ok(html.includes('class="rightbar"'));
});

test('B5 visibly demonstrates autonomous state', () => {
  for (const token of ['System online','Evidence processed','Anomalies detected','Confidence engine','Pipeline health','Last cycle']) assert.ok(html.includes(token), token);
});

test('B5 contains proprietary intelligence objects', () => {
  for (const token of ['Market regime','Signal velocity','Liquidity integrity','Canon strength','Evidence confidence','confidence band','Regime marker']) assert.ok(html.includes(token), token);
});

test('B5 supports interaction and evidence drill-down', () => {
  for (const token of ['data-category','data-horizon','data-signal','data-evidence-body']) assert.ok(html.includes(token), token);
  assert.ok(js.includes('datasets'));
  assert.ok(js.includes('evidence'));
  assert.ok(js.includes('addEventListener'));
});

test('B5 supports desktop and compact mobile layouts', () => {
  assert.ok(css.includes('@media(max-width:1250px)'));
  assert.ok(css.includes('@media(max-width:820px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
  assert.ok(css.includes('overflow-x:hidden'));
});
