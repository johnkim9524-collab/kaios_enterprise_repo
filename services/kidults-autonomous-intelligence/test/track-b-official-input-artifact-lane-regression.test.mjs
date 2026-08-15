import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const HANDOFF_REGISTRY_PATH = path.join(
  REPO_ROOT,
  'coordination',
  'kidults',
  'registry',
  'handoff-registry.json',
);

const ACCEPTED_STATES = new Set(['accepted', 'completed']);
const TRACK_A_IDS = new Set(['A', 'track-a-120-intelligence-factory']);
const TRACK_B_IDS = new Set(['B', 'track-b-rankability-validation-gate']);
const OFFICIAL_INPUT_NAMES = new Set(['snapshot-candidate.json', 'EVIDENCE_PACKAGE']);

function normalizeReference(reference) {
  return typeof reference === 'string'
    ? reference.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
    : '';
}

function officialInputName(reference) {
  const normalized = normalizeReference(reference);
  if (!normalized) return null;
  const basename = normalized.split('/').at(-1);
  return OFFICIAL_INPUT_NAMES.has(basename) ? basename : null;
}

function isEngineeringDiagnosticReference(reference) {
  const normalized = normalizeReference(reference).toLowerCase();
  return normalized === 'reports/engineering-hardening'
    || normalized.startsWith('reports/engineering-hardening/')
    || normalized.includes('/reports/engineering-hardening/');
}

function diagnosticOfficialInputHandoffs(entries) {
  return entries.filter((row) =>
    TRACK_A_IDS.has(row?.from_track)
    && TRACK_B_IDS.has(row?.to_track)
    && ACCEPTED_STATES.has(String(row?.state ?? '').toLowerCase())
    && officialInputName(row?.artifact_reference) != null
    && isEngineeringDiagnosticReference(row?.artifact_reference)
  );
}

test('canonical Track A to Track B accepted handoffs never source official inputs from engineering diagnostics', () => {
  const registry = JSON.parse(fs.readFileSync(HANDOFF_REGISTRY_PATH, 'utf8'));
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];

  assert.deepEqual(
    diagnosticOfficialInputHandoffs(entries),
    [],
    'reports/engineering-hardening must never satisfy a Track B official-input handoff',
  );
});

test('diagnostic-lane detector rejects official-input basename impersonation without rejecting canonical references', () => {
  const entries = [
    {
      handoff_id: 'HO-DIAGNOSTIC-SNAPSHOT',
      from_track: 'A',
      to_track: 'B',
      state: 'accepted',
      artifact_reference: 'reports/engineering-hardening/snapshot-candidate.json',
    },
    {
      handoff_id: 'HO-DIAGNOSTIC-EVIDENCE',
      from_track: 'track-a-120-intelligence-factory',
      to_track: 'track-b-rankability-validation-gate',
      state: 'completed',
      artifact_reference: 'repo/reports/engineering-hardening/EVIDENCE_PACKAGE',
    },
    {
      handoff_id: 'HO-CANONICAL-SNAPSHOT',
      from_track: 'A',
      to_track: 'B',
      state: 'accepted',
      artifact_reference: 'snapshots/fixture-candidate/snapshot-candidate.json',
    },
    {
      handoff_id: 'HO-CANONICAL-EVIDENCE',
      from_track: 'A',
      to_track: 'B',
      state: 'accepted',
      artifact_reference: 'EVIDENCE_PACKAGE',
    },
    {
      handoff_id: 'HO-DIAGNOSTIC-NOT-ACCEPTED',
      from_track: 'A',
      to_track: 'B',
      state: 'requested',
      artifact_reference: 'reports/engineering-hardening/EVIDENCE_PACKAGE',
    },
  ];

  assert.deepEqual(
    diagnosticOfficialInputHandoffs(entries).map((row) => row.handoff_id),
    ['HO-DIAGNOSTIC-SNAPSHOT', 'HO-DIAGNOSTIC-EVIDENCE'],
  );
  assert.equal(officialInputName('snapshots/fixture-candidate/snapshot-candidate.json'), 'snapshot-candidate.json');
  assert.equal(officialInputName('EVIDENCE_PACKAGE'), 'EVIDENCE_PACKAGE');
  assert.equal(isEngineeringDiagnosticReference('snapshots/fixture-candidate/snapshot-candidate.json'), false);
  assert.equal(isEngineeringDiagnosticReference('EVIDENCE_PACKAGE'), false);
});
