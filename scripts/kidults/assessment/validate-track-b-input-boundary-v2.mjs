#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidateId = process.env.KIDULTS_CANDIDATE_ID || process.argv[2];
if (!candidateId || !/^[A-Za-z0-9._:-]{8,160}$/.test(candidateId)) {
  console.error('KIDULTS_CANDIDATE_ID_REQUIRED');
  process.exit(64);
}

const candidateDir = path.join(root, 'coordination', 'kidults', 'candidates', candidateId);
const candidatePath = path.join(candidateDir, 'snapshot-candidate.json');
const evidencePath = path.join(candidateDir, 'evidence-package.json');
const methodologyIndexPath = path.join(root, 'coordination', 'kidults', 'registry', 'methodology', 'index.json');
const lineageIndexPath = path.join(root, 'coordination', 'kidults', 'registry', 'evidence-lineage', 'index.json');
const snapshotIndexPath = path.join(root, 'coordination', 'kidults', 'registry', 'snapshot', 'index.json');

function readJson(file, code) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${code}:${error?.code || error?.name || 'READ_ERROR'}`);
    process.exit(65);
  }
}

const candidate = readJson(candidatePath, 'TRACK_B_CANDIDATE_UNREADABLE');
const evidence = readJson(evidencePath, 'TRACK_B_EVIDENCE_UNREADABLE');
const methodology = readJson(methodologyIndexPath, 'TRACK_B_METHODOLOGY_INDEX_UNREADABLE');
const lineage = readJson(lineageIndexPath, 'TRACK_B_LINEAGE_INDEX_UNREADABLE');
const snapshots = readJson(snapshotIndexPath, 'TRACK_B_SNAPSHOT_INDEX_UNREADABLE');

const findings = [];
const requireTrue = (condition, code) => { if (!condition) findings.push(code); };

requireTrue(candidate.snapshot_id === candidateId, 'CANDIDATE_ID_PATH_MISMATCH');
requireTrue(evidence.snapshot_id === candidateId, 'EVIDENCE_SNAPSHOT_ID_MISMATCH');
requireTrue(candidate.snapshot_id === evidence.snapshot_id, 'PAIR_SNAPSHOT_ID_MISMATCH');
requireTrue(typeof candidate.methodology_version === 'string' && candidate.methodology_version.length > 0, 'CANDIDATE_METHODOLOGY_MISSING');
requireTrue(candidate.methodology_version === methodology.current_record_id, 'METHODOLOGY_NOT_CURRENT');
requireTrue(typeof candidate.evidence_lineage_version === 'string' && candidate.evidence_lineage_version.length > 0, 'CANDIDATE_LINEAGE_MISSING');
requireTrue(candidate.evidence_lineage_version === lineage.current_record_id, 'EVIDENCE_LINEAGE_NOT_CURRENT');
requireTrue(snapshots.current_candidate_snapshot_id === candidateId, 'SNAPSHOT_REGISTRY_CURRENT_CANDIDATE_MISMATCH');
requireTrue(typeof evidence.evidence_package_id === 'string' && evidence.evidence_package_id.length > 0, 'EVIDENCE_PACKAGE_ID_MISSING');
requireTrue(Array.isArray(evidence.source_families) && evidence.source_families.length > 0, 'SOURCE_FAMILIES_MISSING');

for (const source of evidence.source_families ?? []) {
  requireTrue(typeof source?.rights_state === 'string' && source.rights_state.length > 0, `RIGHTS_STATE_MISSING:${source?.source_family_id || source?.id || 'UNKNOWN'}`);
}

const receipt = {
  gate: 'TRACK_B_INPUT_BOUNDARY_V2',
  status: findings.length === 0 ? 'PASS' : 'HOLD',
  candidate_id: candidateId,
  candidate_path: path.relative(root, candidatePath),
  evidence_path: path.relative(root, evidencePath),
  snapshot_id: candidate.snapshot_id ?? null,
  evidence_package_id: evidence.evidence_package_id ?? null,
  methodology_version: candidate.methodology_version ?? null,
  evidence_lineage_version: candidate.evidence_lineage_version ?? null,
  source_family_count: Array.isArray(evidence.source_families) ? evidence.source_families.length : 0,
  findings,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
};

console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exitCode = 1;
