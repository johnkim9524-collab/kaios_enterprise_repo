import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const RUNTIME = new URL('./public/public-enterprise-preview/b47-data-state-runtime.js', import.meta.url);
const BINDING = new URL('./public/public-enterprise-preview/b53-homepage-live-intelligence.js', import.meta.url);

test('homepage runtime loads governed intelligence binding', async () => {
  const source = await readFile(RUNTIME, 'utf8');
  assert.match(source, /b53-homepage-live-intelligence\.js/);
});

test('homepage binding consumes governed portal bridge API', async () => {
  const source = await readFile(BINDING, 'utf8');
  assert.match(source, /api\/v1\/governed-intelligence\.json/);
  assert.match(source, /kidults\.portal-bridge\.v1/);
});

test('homepage binding renders governed publication metrics', async () => {
  const source = await readFile(BINDING, 'utf8');
  for (const token of [
    'data-governed-publish',
    'data-governed-held',
    'data-governed-feed',
    'data-governed-production',
    'data-governed-updated'
  ]) {
    assert.match(source, new RegExp(token));
  }
});

test('homepage binding preserves human review boundary', async () => {
  const source = await readFile(BINDING, 'utf8');
  assert.match(source, /production_promotion_authorized === true/);
  assert.match(source, /authorized \? 'AUTHORIZED' : 'REVIEW'/);
});

test('homepage binding exposes governed state without personal data', async () => {
  const source = await readFile(BINDING, 'utf8');
  assert.match(source, /KIDULTS_GOVERNED_HOMEPAGE/);
  assert.doesNotMatch(source, /email|phone|address|recipient/i);
});
