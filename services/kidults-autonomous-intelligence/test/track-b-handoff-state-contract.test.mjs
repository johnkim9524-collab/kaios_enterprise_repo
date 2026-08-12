import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const HANDOFF_REGISTRY = path.join(REPO_ROOT, 'coordination', 'kidults', 'registry', 'handoff-registry.json');

const CANONICAL_HANDOFF_STATES = [
  'requested',
  'accepted',
  'rejected',
  'correction_requested',
  'completed',
  'cancelled',
];

const REQUIRED_TRACK_B_HANDOFF_RULES = [
  'Silence is not acceptance.',
  'The receiver does not rewrite the producer artifact.',
  'A handoff without a snapshot_id is invalid.',
];

test('canonical handoff state contract remains stable for Track B readiness', () => {
  const registry = JSON.parse(fs.readFileSync(HANDOFF_REGISTRY, 'utf8'));

  assert.equal(registry.registry_version, '1.0.0');
  assert.deepEqual(registry.allowed_states, CANONICAL_HANDOFF_STATES);
  assert.ok(registry.allowed_states.includes('accepted'));
  assert.ok(registry.allowed_states.includes('completed'));
  assert.ok(registry.required_fields.includes('handoff_id'));
  assert.ok(registry.required_fields.includes('snapshot_id'));
  assert.ok(registry.required_fields.includes('state'));
});

test('canonical handoff safety rules preserve explicit acceptance and producer immutability', () => {
  const registry = JSON.parse(fs.readFileSync(HANDOFF_REGISTRY, 'utf8'));
  const rules = Array.isArray(registry.rules) ? registry.rules : [];

  for (const rule of REQUIRED_TRACK_B_HANDOFF_RULES) assert.ok(rules.includes(rule), `missing canonical handoff rule: ${rule}`);
});
