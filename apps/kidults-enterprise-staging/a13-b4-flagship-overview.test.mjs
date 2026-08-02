import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/kidults-enterprise-staging/public/a13-b4');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/flagship.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'assets/shell.js'), 'utf8');

test('B4 overview contains autonomous platform narrative', () => {
  for (const phrase of ['Global autonomous collectible intelligence','Autonomous intelligence system','Proprietary benchmark','Live market state','Intelligence output','Evidence and trust','Enterprise decision layer']) assert.ok(html.includes(phrase), phrase);
});

test('B4 major sections contain visual proof objects', () => {
  for (const token of ['class="chart"','class="system-strip"','class="signal-board"','class="matrix"','class="research-grid"','class="trust"']) assert.ok(html.includes(token), token);
});

test('B4 navigation is consolidated into four product layers', () => {
  for (const label of ['Intelligence','Kidult 100','Research','Enterprise']) assert.ok(shell.includes(label), label);
  assert.ok(!shell.includes('Canon</a>'));
  assert.ok(!shell.includes('Methodology</a>'));
});

test('B4 uses one global footer and responsive contracts', () => {
  assert.equal((html.match(/data-global-footer/g) || []).length, 1);
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('@media(max-width:380px)'));
});

test('B4 keeps green as restrained accent rather than large story panels', () => {
  assert.ok(css.includes('--forest:#153f31'));
  assert.ok(!css.includes('.story.large{background:var(--forest)'));
});