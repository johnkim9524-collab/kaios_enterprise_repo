import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const DEFAULT_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');
const COORDINATION_ROOT = path.resolve(process.env.KIDULTS_COORDINATION_ROOT || DEFAULT_COORDINATION_ROOT);
const OUTPUT_PATH = path.resolve(
  process.env.KIDULTS_TRACK_B_EVIDENCE_INTEGRITY_OUTPUT
    || path.join(SERVICE_ROOT, 'reports', 'engineering-hardening', 'track-b-evidence-package-registry-integrity-latest.json'),
);
const SNAPSHOT_REGISTRY_PATH = path.join(COORDINATION_ROOT, 'registry', 'snapshot-registry.json');
const HANDOFF_REGISTRY_PATH = path.join(COORDINATION_ROOT, 'registry', 'handoff-registry.json');
const EVIDENCE_INDEX_PATH = path.join(COORDINATION_ROOT, 'registry', 'evidence', 'index.json');
const ACCEPTED_STATES = new Set(['accepted', 'completed']);
const TRACK_A_IDS = new Set(['A', 'track-a-120-intelligence-factory']);
const TRACK_B_IDS = new Set(['B', 'track-b-rankability-validation-gate']);
const EVIDENCE_PACKAGE = 'EVIDENCE_PACKAGE';

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

function referenceMatchesEvidencePackage(reference) {
  return canonicalReference(reference) && (reference === EVIDENCE_PACKAGE || reference.endsWith(`/${EVIDENCE_PACKAGE}`));
}

function containedBy(root, target) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveMaterializedEvidencePackage(reference) {
  if (!referenceMatchesEvidencePackage(reference)) return null;
  const resolved = path.resolve(COORDINATION_ROOT, reference);
  if (!containedBy(COORDINATION_ROOT, resolved)) return null;
  if (!fs.existsSync(resolved)) return null;
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) return null;
  const realRoot = fs.realpathSync(COORDINATION_ROOT);
  const realResolved = fs.realpathSync(resolved);
  if (!containedBy(realRoot, realResolved)) return null;
  return realResolved;
}

function acceptedEvidenceHandoffs(handoffs, snapshotId) {
  if (!snapshotId) return [];
  const entries = Array.isArray(handoffs?.entries) ? handoffs.entries : [];
  return entries.filter((row) =>
    row && typeof row === 'object'
    && row.snapshot_id === snapshotId
    && TRACK_A_IDS.has(row.from_track)
    && TRACK_B_IDS.has(row.to_track)
    && ACCEPTED_STATES.has(String(row.state ?? '').toLowerCase())
    && referenceMatchesEvidencePackage(row.artifact_reference)
    && resolveMaterializedEvidencePackage(row.artifact_reference) != null
  );
}

function indexedRecordIds(index) {
  const records = Array.isArray(index?.records) ? index.records : [];
  return records.map((row) => {
    if (typeof row === 'string') return row;
    if (!row || typeof row !== 'object') return null;
    return row.id ?? row.evidence_package_id ?? null;
  }).filter((value) => typeof value === 'string' && value.length > 0);
}

let status = 'WAITING';
let reason = 'CURRENT_SNAPSHOT_NOT_REGISTERED';
let currentSnapshotId = null;
let handoffId = null;
let artifactReference = null;
let evidencePackageId = null;
let evidenceRecordSnapshotId = null;
let evidenceRecordPath = null;
let exitCode = 0;

try {
  const snapshots = readJson(SNAPSHOT_REGISTRY_PATH);
  const handoffs = readJson(HANDOFF_REGISTRY_PATH);
  const evidenceIndex = readJson(EVIDENCE_INDEX_PATH);
  currentSnapshotId = snapshots?.current_candidate_snapshot_id ?? snapshots?.current_published_snapshot_id ?? null;

  if (currentSnapshotId) {
    const accepted = acceptedEvidenceHandoffs(handoffs, currentSnapshotId);
    if (accepted.length === 0) {
      reason = 'MATERIALIZED_CANONICAL_EVIDENCE_HANDOFF_NOT_AVAILABLE';
    } else if (accepted.length > 1) {
      status = 'FAIL_CLOSED';
      reason = 'AMBIGUOUS_CANONICAL_EVIDENCE_HANDOFF';
      exitCode = 1;
    } else {
      const handoff = accepted[0];
      handoffId = handoff.handoff_id ?? handoff.id ?? null;
      artifactReference = handoff.artifact_reference;
      evidencePackageId = evidenceIndex?.current_evidence_package_id ?? null;
      const recordDirectory = evidenceIndex?.record_directory ?? 'records';
      const ids = indexedRecordIds(evidenceIndex);

      if (typeof evidencePackageId !== 'string' || evidencePackageId.length === 0) {
        status = 'FAIL_CLOSED';
        reason = 'EVIDENCE_PACKAGE_REGISTRY_POINTER_MISSING';
        exitCode = 1;
      } else if (!ids.includes(evidencePackageId)) {
        status = 'FAIL_CLOSED';
        reason = 'EVIDENCE_PACKAGE_NOT_INDEXED';
        exitCode = 1;
      } else {
        const recordPath = path.join(path.dirname(EVIDENCE_INDEX_PATH), recordDirectory, `${evidencePackageId}.json`);
        evidenceRecordPath = recordPath;
        try {
          const record = readJson(recordPath);
          const recordId = record?.id ?? record?.evidence_package_id ?? null;
          evidenceRecordSnapshotId = record?.snapshot_id ?? null;
          if (recordId !== evidencePackageId) {
            status = 'FAIL_CLOSED';
            reason = 'EVIDENCE_PACKAGE_RECORD_ID_MISMATCH';
            exitCode = 1;
          } else if (typeof evidenceRecordSnapshotId !== 'string' || evidenceRecordSnapshotId.length === 0) {
            status = 'FAIL_CLOSED';
            reason = 'EVIDENCE_PACKAGE_SNAPSHOT_ID_MISSING';
            exitCode = 1;
          } else if (evidenceRecordSnapshotId !== currentSnapshotId || evidenceRecordSnapshotId !== handoff.snapshot_id) {
            status = 'FAIL_CLOSED';
            reason = 'EVIDENCE_PACKAGE_SNAPSHOT_ID_MISMATCH';
            exitCode = 1;
          } else {
            status = 'PASS';
            reason = 'EVIDENCE_PACKAGE_REGISTRY_TRACEABILITY_EXACT_MATCH';
          }
        } catch (error) {
          status = 'FAIL_CLOSED';
          reason = error instanceof SyntaxError
            ? 'EVIDENCE_PACKAGE_REGISTRY_RECORD_JSON_INVALID'
            : (error instanceof Error ? error.message : String(error));
          exitCode = 1;
        }
      }
    }
  }
} catch (error) {
  status = 'FAIL_CLOSED';
  reason = error instanceof SyntaxError
    ? 'EVIDENCE_PACKAGE_REGISTRY_INDEX_JSON_INVALID'
    : (error instanceof Error ? error.message : String(error));
  exitCode = 1;
}

const report = {
  schema_version: '1.0.0',
  mode: 'TRACK_B_EVIDENCE_PACKAGE_REGISTRY_INTEGRITY_GUARD',
  generated_at: new Date().toISOString(),
  status,
  reason,
  current_snapshot_id: currentSnapshotId,
  canonical_evidence_handoff_id: handoffId,
  artifact_reference: artifactReference,
  current_evidence_package_id: evidencePackageId,
  evidence_record_snapshot_id: evidenceRecordSnapshotId,
  evidence_record_path: evidenceRecordPath ? path.relative(REPO_ROOT, evidenceRecordPath) : null,
  claims: {
    observational_engineering_guard_only: true,
    creates_or_modifies_evidence: false,
    creates_snapshot: false,
    assessment_generated: false,
    production_gate_weakened: false,
    rights_or_provenance_weakened: false,
    registry_reference_alone_sufficient: false,
    materialized_evidence_package_required: true,
    evidence_registry_registration_required: true,
    evidence_record_snapshot_id_exact_match_required: true,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Track B evidence package registry integrity: ${status}; snapshot=${currentSnapshotId ?? 'null'}; reason=${reason}`);
if (exitCode !== 0) process.exitCode = exitCode;
