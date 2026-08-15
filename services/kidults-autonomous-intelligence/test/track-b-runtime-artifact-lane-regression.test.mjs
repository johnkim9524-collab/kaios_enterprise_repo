import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const GATE_SOURCE_PATH = path.join(
  SERVICE_ROOT,
  'scripts',
  'kidults-integrated-program-registry-gate.mjs',
);
const HANDOFF_REGISTRY_PATH = path.join(
  REPO_ROOT,
  'coordination',
  'kidults',
  'registry',
  'handoff-registry.json',
);

const NON_OFFICIAL_ARTIFACT_LANES = [
  'reports/engineering-hardening',
  'reports/execution-control',
  'reports/runtime',
  'registry/runtime',
];

function normalizeReference(reference) {
  return typeof reference === 'string'
    ? reference.replaceAll('\\', '/').replace(/\/+$/, '')
    : '';
}

function isNonOfficialArtifactLane(reference) {
  if (typeof reference !== 'string') return false;
  const normalized = normalizeReference(reference)
    .replace(/^\.\//, '')
    .toLowerCase();
  return NON_OFFICIAL_ARTIFACT_LANES.some((lane) =>
    normalized === lane
    || normalized.startsWith(`${lane}/`)
    || normalized.includes(`/${lane}/`)
  );
}

function hasAmbiguousPathSegments(reference) {
  const normalized = normalizeReference(reference);
  if (!normalized) return false;
  return normalized.split('/').some((segment) => segment === '.' || segment === '..');
}

function resemblesTrackBOfficialInput(reference) {
  const normalized = normalizeReference(reference);
  return normalized === 'snapshot-candidate.json'
    || normalized.endsWith('/snapshot-candidate.json')
    || normalized === 'EVIDENCE_PACKAGE'
    || normalized.endsWith('/EVIDENCE_PACKAGE');
}

test('DigitalOcean/runtime operational evidence cannot impersonate Track B official inputs', () => {
  const nonOfficialReferences = [
    'reports/runtime/digitalocean-staging/EVIDENCE_PACKAGE',
    'reports/execution-control/digitalocean/EVIDENCE_PACKAGE',
    'coordination/kidults/registry/runtime/records/EVIDENCE_PACKAGE',
    'repo/reports/engineering-hardening/snapshot-candidate.json',
  ];
  for (const reference of nonOfficialReferences) {
    assert.equal(isNonOfficialArtifactLane(reference), true, reference);
  }

  const canonicalReferences = [
    'EVIDENCE_PACKAGE',
    'evidence/candidate-p0-001/EVIDENCE_PACKAGE',
    'snapshots/candidate-p0-001/snapshot-candidate.json',
  ];
  for (const reference of canonicalReferences) {
    assert.equal(isNonOfficialArtifactLane(reference), false, reference);
  }
  assert.equal(isNonOfficialArtifactLane(null), false);
});

test('ambiguous dot-segment paths are not acceptable Track B handoff references', () => {
  const ambiguousReferences = [
    './EVIDENCE_PACKAGE',
    'evidence/../EVIDENCE_PACKAGE',
    'reports/./runtime/digitalocean-staging/EVIDENCE_PACKAGE',
    'snapshots/candidate-p0-001/../candidate-p0-002/snapshot-candidate.json',
  ];
  for (const reference of ambiguousReferences) {
    assert.equal(hasAmbiguousPathSegments(reference), true, reference);
  }

  const canonicalReferences = [
    'EVIDENCE_PACKAGE',
    'evidence/candidate-p0-001/EVIDENCE_PACKAGE',
    'snapshots/candidate-p0-001/snapshot-candidate.json',
  ];
  for (const reference of canonicalReferences) {
    assert.equal(hasAmbiguousPathSegments(reference), false, reference);
  }
  assert.equal(hasAmbiguousPathSegments(null), false);

  assert.equal(resemblesTrackBOfficialInput('snapshot-candidate.json'), true);
  assert.equal(resemblesTrackBOfficialInput('snapshots/candidate-p0-001/snapshot-candidate.json'), true);
  assert.equal(resemblesTrackBOfficialInput('EVIDENCE_PACKAGE'), true);
  assert.equal(resemblesTrackBOfficialInput('evidence/candidate-p0-001/EVIDENCE_PACKAGE'), true);
  assert.equal(resemblesTrackBOfficialInput('portal-release-manifest.json'), false);
  assert.equal(resemblesTrackBOfficialInput(null), false);
});

test('canonical handoff registry contains no accepted Track A to B official-input path ambiguity', () => {
  const registry = JSON.parse(fs.readFileSync(HANDOFF_REGISTRY_PATH, 'utf8'));
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  const syntheticControl = {
    handoff_id: '__coverage_control__',
    from_track: 'A',
    to_track: 'B',
    state: 'accepted',
    artifact_reference: 'evidence/candidate-control/EVIDENCE_PACKAGE',
  };
  let syntheticControlChecked = false;

  for (const row of [...entries, syntheticControl]) {
    const fromTrack = String(row?.from_track ?? '');
    const toTrack = String(row?.to_track ?? '');
    const state = String(row?.state ?? '').toLowerCase();
    const acceptedTrackBInput = (fromTrack === 'A' || fromTrack === 'track-a-120-intelligence-factory')
      && (toTrack === 'B' || toTrack === 'track-b-rankability-validation-gate')
      && (state === 'accepted' || state === 'completed')
      && resemblesTrackBOfficialInput(row?.artifact_reference);
    if (!acceptedTrackBInput) continue;

    assert.equal(hasAmbiguousPathSegments(row.artifact_reference), false, row.artifact_reference);
    assert.equal(isNonOfficialArtifactLane(row.artifact_reference), false, row.artifact_reference);
    if (row.handoff_id === syntheticControl.handoff_id) syntheticControlChecked = true;
  }

  assert.equal(syntheticControlChecked, true);
});

test('Integrated Program gate enforces the runtime-lane exclusion on accepted Track A to B handoffs', () => {
  const source = fs.readFileSync(GATE_SOURCE_PATH, 'utf8');

  assert.match(source, /const TRACK_B_NON_OFFICIAL_ARTIFACT_LANES = \[/);
  assert.match(source, /'reports\/runtime'/);
  assert.match(source, /'reports\/execution-control'/);
  assert.match(source, /'registry\/runtime'/);
  assert.match(source, /&& !isTrackBNonOfficialArtifactLane\(row\?\.artifact_reference\)/);
  assert.match(source, /operational_runtime_evidence_used_as_track_b_official_input: false/);
});
