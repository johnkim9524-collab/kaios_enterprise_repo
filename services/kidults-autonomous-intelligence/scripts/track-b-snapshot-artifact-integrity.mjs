import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const DEFAULT_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');
const COORDINATION_ROOT = path.resolve(process.env.KIDULTS_COORDINATION_ROOT || DEFAULT_COORDINATION_ROOT);
const OUTPUT_PATH = path.resolve(
  process.env.KIDULTS_TRACK_B_SNAPSHOT_INTEGRITY_OUTPUT
    || path.join(SERVICE_ROOT, 'reports', 'engineering-hardening', 'track-b-snapshot-artifact-integrity-latest.json'),
);
const SNAPSHOT_REGISTRY_PATH = path.join(COORDINATION_ROOT, 'registry', 'snapshot-registry.json');
const HANDOFF_REGISTRY_PATH = path.join(COORDINATION_ROOT, 'registry', 'handoff-registry.json');
const ACCEPTED_STATES = new Set(['accepted', 'completed']);
const TRACK_A_IDS = new Set(['A', 'track-a-120-intelligence-factory']);
const TRACK_B_IDS = new Set(['B', 'track-b-rankability-validation-gate']);
const SNAPSHOT_FILE = 'snapshot-candidate.json';

function readJson(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`MISSING_FILE:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonicalReference(reference) {
  if (typeof reference !== 'string' || reference.length === 0 || reference !== reference.trim()) return false;
  if (reference.includes('\\') || reference.includes('%') || reference.includes('?') || reference.includes('#')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)) return false;
  if (/[\u0000-\u001F\u007F]/.test(reference)) return false;
  const segments = reference.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function referenceMatchesSnapshot(reference) {
  return canonicalReference(reference) && (reference === SNAPSHOT_FILE || reference.endsWith(`/${SNAPSHOT_FILE}`));
}

function containedBy(root, target) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveMaterializedSnapshot(reference) {
  if (!referenceMatchesSnapshot(reference)) return null;
  const resolved = path.resolve(COORDINATION_ROOT, reference);
  if (!containedBy(COORDINATION_ROOT, resolved)) return null;
  try {
    if (!fs.existsSync(resolved)) return null;
    const stats = fs.lstatSync(resolved);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;
    const realRoot = fs.realpathSync(COORDINATION_ROOT);
    const realResolved = fs.realpathSync(resolved);
    if (!containedBy(realRoot, realResolved)) return null;
    return realResolved;
  } catch {
    return null;
  }
}

function acceptedSnapshotHandoffs(handoffs, snapshotId) {
  if (!snapshotId) return [];
  const entries = Array.isArray(handoffs?.entries) ? handoffs.entries : [];
  return entries.filter((row) =>
    row && typeof row === 'object'
    && row.snapshot_id === snapshotId
    && TRACK_A_IDS.has(row.from_track)
    && TRACK_B_IDS.has(row.to_track)
    && ACCEPTED_STATES.has(String(row.state ?? '').toLowerCase())
    && referenceMatchesSnapshot(row.artifact_reference)
    && resolveMaterializedSnapshot(row.artifact_reference) != null
  );
}

let status = 'WAITING';
let reason = 'CURRENT_SNAPSHOT_NOT_REGISTERED';
let currentSnapshotId = null;
let handoffId = null;
let artifactReference = null;
let artifactSnapshotId = null;
let artifactPath = null;
let exitCode = 0;

try {
  const snapshots = readJson(SNAPSHOT_REGISTRY_PATH);
  const handoffs = readJson(HANDOFF_REGISTRY_PATH);
  currentSnapshotId = snapshots?.current_candidate_snapshot_id ?? snapshots?.current_published_snapshot_id ?? null;

  if (currentSnapshotId) {
    const accepted = acceptedSnapshotHandoffs(handoffs, currentSnapshotId);
    if (accepted.length === 0) {
      reason = 'MATERIALIZED_CANONICAL_SNAPSHOT_HANDOFF_NOT_AVAILABLE';
    } else if (accepted.length > 1) {
      status = 'FAIL_CLOSED';
      reason = 'AMBIGUOUS_CANONICAL_SNAPSHOT_HANDOFF';
      exitCode = 1;
    } else {
      const handoff = accepted[0];
      handoffId = handoff.handoff_id ?? handoff.id ?? null;
      artifactReference = handoff.artifact_reference;
      artifactPath = resolveMaterializedSnapshot(artifactReference);
      try {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        artifactSnapshotId = artifact?.snapshot_id ?? null;
        if (typeof artifactSnapshotId !== 'string' || artifactSnapshotId.length === 0) {
          status = 'FAIL_CLOSED';
          reason = 'SNAPSHOT_ARTIFACT_ID_MISSING';
          exitCode = 1;
        } else if (artifactSnapshotId !== currentSnapshotId || artifactSnapshotId !== handoff.snapshot_id) {
          status = 'FAIL_CLOSED';
          reason = 'SNAPSHOT_ARTIFACT_ID_MISMATCH';
          exitCode = 1;
        } else {
          status = 'PASS';
          reason = 'SNAPSHOT_ARTIFACT_ID_EXACT_MATCH';
        }
      } catch {
        status = 'FAIL_CLOSED';
        reason = 'SNAPSHOT_ARTIFACT_JSON_INVALID';
        exitCode = 1;
      }
    }
  }
} catch (error) {
  status = 'FAIL_CLOSED';
  reason = error instanceof Error ? error.message : String(error);
  exitCode = 1;
}

const report = {
  schema_version: '1.0.0',
  mode: 'TRACK_B_SNAPSHOT_ARTIFACT_INTEGRITY_GUARD',
  generated_at: new Date().toISOString(),
  status,
  reason,
  current_snapshot_id: currentSnapshotId,
  canonical_snapshot_handoff_id: handoffId,
  artifact_reference: artifactReference,
  artifact_snapshot_id: artifactSnapshotId,
  artifact_path: artifactPath ? path.relative(REPO_ROOT, artifactPath) : null,
  claims: {
    observational_engineering_guard_only: true,
    creates_or_modifies_evidence: false,
    creates_snapshot: false,
    assessment_generated: false,
    production_gate_weakened: false,
    rights_or_provenance_weakened: false,
    registry_reference_alone_sufficient: false,
    materialized_snapshot_required: true,
    snapshot_artifact_json_required: true,
    internal_snapshot_id_exact_match_required: true,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Track B snapshot artifact integrity: ${status}; snapshot=${currentSnapshotId ?? 'null'}; reason=${reason}`);
if (exitCode !== 0) process.exitCode = exitCode;
