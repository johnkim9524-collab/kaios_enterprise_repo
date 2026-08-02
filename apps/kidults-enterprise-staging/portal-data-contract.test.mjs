import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contractUrl = new URL('./public/data/portal-data-contract.json', import.meta.url);
const qualityUrl = new URL('./public/data/quality-status.json', import.meta.url);

const requiredTabs = [
  'intelligence',
  'markets',
  'kidult_100',
  'archive',
  'methodology',
  'status',
  'access'
];

const requiredStatuses = [
  'operational',
  'degraded',
  'critical',
  'delayed',
  'under_review',
  'insufficient_evidence',
  'monitoring_pending'
];

async function loadJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('A9 portal contract defines every public tab', async () => {
  const contract = await loadJson(contractUrl);
  assert.equal(contract.environment, 'staging');
  assert.deepEqual(Object.keys(contract.tabs), requiredTabs);

  for (const tabName of requiredTabs) {
    const tab = contract.tabs[tabName];
    assert.ok(Array.isArray(tab.required));
    assert.ok(Array.isArray(tab.optional));
    assert.ok(tab.required.length > 0);
  }
});

test('A9 quality status enum and public labels are complete', async () => {
  const contract = await loadJson(contractUrl);
  assert.deepEqual(contract.quality_status.allowed, requiredStatuses);

  for (const status of requiredStatuses) {
    assert.equal(typeof contract.quality_status.public_labels[status], 'string');
    assert.ok(contract.quality_status.public_labels[status].length > 0);
  }
});

test('A9 contract blocks protected operational and personal fields', async () => {
  const contract = await loadJson(contractUrl);
  const forbidden = new Set(contract.public_field_policy.forbidden);

  for (const field of [
    'credentials',
    'tokens',
    'server_paths',
    'source_secrets',
    'personal_data',
    'private_exports',
    'internal_incident_notes'
  ]) {
    assert.ok(forbidden.has(field), `${field} must remain non-public`);
  }
});

test('A9 DOM hooks are unique and stable selectors', async () => {
  const contract = await loadJson(contractUrl);
  const hooks = Object.values(contract.dom_hooks);
  assert.equal(new Set(hooks).size, hooks.length);

  for (const selector of hooks) {
    assert.match(selector, /^\[data-[a-z0-9-]+\]$/);
  }
});

test('current quality status is compatible with the A9 enum', async () => {
  const [contract, quality] = await Promise.all([
    loadJson(contractUrl),
    loadJson(qualityUrl)
  ]);

  assert.ok(contract.quality_status.allowed.includes(quality.status));
  assert.equal(quality.environment, 'staging');
  assert.equal(quality.production_promotion_authorized, false);
});
