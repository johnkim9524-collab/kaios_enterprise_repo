import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const HANDOFF_REGISTRY_PATH = path.join(REPO_ROOT, 'coordination', 'kidults', 'registry', 'handoff-registry.json');

function duplicateHandoffIds(entries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of entries) {
    const handoffId = typeof row?.handoff_id === 'string' ? row.handoff_id.trim() : '';
    if (!handoffId) continue;
    if (seen.has(handoffId)) duplicates.add(handoffId);
    seen.add(handoffId);
  }
  return [...duplicates].sort();
}

test('canonical handoff registry keeps handoff identities unique before Track B assessment', () => {
  const registry = JSON.parse(fs.readFileSync(HANDOFF_REGISTRY_PATH, 'utf8'));
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  assert.deepEqual(duplicateHandoffIds(entries), []);
});

test('cross-artifact duplicate handoff identity is detected as an unsafe Track B input collision', () => {
  const entries = [
    {
      handoff_id: 'HO-FIXTURE-SHARED',
      from_track: 'A',
      to_track: 'B',
      snapshot_id: 'fixture-candidate',
      artifact_reference: 'snapshot-candidate.json',
      state: 'accepted',
    },
    {
      handoff_id: 'HO-FIXTURE-SHARED',
      from_track: 'A',
      to_track: 'B',
      snapshot_id: 'fixture-candidate',
      artifact_reference: 'EVIDENCE_PACKAGE',
      state: 'accepted',
    },
    {
      handoff_id: null,
      artifact_reference: 'ignored-noncanonical-row',
    },
  ];

  assert.deepEqual(duplicateHandoffIds(entries), ['HO-FIXTURE-SHARED']);
});
