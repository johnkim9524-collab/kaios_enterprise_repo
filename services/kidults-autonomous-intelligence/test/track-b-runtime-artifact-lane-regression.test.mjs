import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const GATE_SOURCE_PATH = path.join(
  SERVICE_ROOT,
  'scripts',
  'kidults-integrated-program-registry-gate.mjs',
);

const NON_OFFICIAL_ARTIFACT_LANES = [
  'reports/engineering-hardening',
  'reports/execution-control',
  'reports/runtime',
  'registry/runtime',
];

function isNonOfficialArtifactLane(reference) {
  if (typeof reference !== 'string') return false;
  const normalized = reference
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return NON_OFFICIAL_ARTIFACT_LANES.some((lane) =>
    normalized === lane
    || normalized.startsWith(`${lane}/`)
    || normalized.includes(`/${lane}/`)
  );
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
