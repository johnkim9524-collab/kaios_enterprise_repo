import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b4');
const css = fs.readFileSync(path.join(root, 'assets/flagship.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'assets/shell.js'), 'utf8');
const pages = {
  overview: fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  benchmark: fs.readFileSync(path.join(root, 'kidult-100/index.html'), 'utf8'),
  research: fs.readFileSync(path.join(root, 'research/index.html'), 'utf8'),
  enterprise: fs.readFileSync(path.join(root, 'enterprise/index.html'), 'utf8')
};

test('B4 overview contains autonomous platform narrative', () => {
  for (const phrase of ['Global autonomous collectible intelligence','Autonomous intelligence system','Proprietary benchmark','Live market state','Intelligence output','Evidence and trust','Enterprise decision layer']) assert.ok(pages.overview.includes(phrase), phrase);
});

test('B4 flagship product pages contain deep visual proof objects', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(html.includes('class="hero"'), `${name}:hero`);
    assert.ok(html.includes('class="section'), `${name}:sections`);
    assert.ok(html.includes('data-global-footer'), `${name}:footer`);
  }
  for (const token of ['class="chart"','class="system-strip"','class="signal-board"','class="matrix"','class="research-grid"','class="trust"']) assert.ok(Object.values(pages).some(html => html.includes(token)), token);
});

test('B4 navigation is consolidated into four product layers', () => {
  for (const label of ['Intelligence','Kidult 100','Research','Enterprise']) assert.ok(shell.includes(label), label);
  assert.ok(!shell.includes('Canon</a>'));
  assert.ok(!shell.includes('Methodology</a>'));
});

test('B4 each flagship page has one global footer', () => {
  for (const [name, html] of Object.entries(pages)) assert.equal((html.match(/data-global-footer/g) || []).length, 1, name);
});

test('B4 responsive and premium design contracts exist', () => {
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
  assert.ok(css.includes('font-size:18px'));
  assert.ok(css.includes('--forest:#153f31'));
  assert.ok(!css.includes('.story.large{background:var(--forest)'));
});

test('B4 page-specific product narratives are present', () => {
  for (const phrase of ['The proprietary benchmark','Live ranking','Decomposition']) assert.ok(pages.benchmark.includes(phrase), phrase);
  for (const phrase of ['Autonomous intelligence output','Featured monthly intelligence','Research portfolio']) assert.ok(pages.research.includes(phrase), phrase);
  for (const phrase of ['Enterprise decision layer','Decision workflows','Enterprise evidence']) assert.ok(pages.enterprise.includes(phrase), phrase);
});