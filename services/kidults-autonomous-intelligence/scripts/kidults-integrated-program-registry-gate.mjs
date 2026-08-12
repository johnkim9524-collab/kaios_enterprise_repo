import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const DEFAULT_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');
const COORDINATION_ROOT = path.resolve(process.env.KIDULTS_COORDINATION_ROOT || DEFAULT_COORDINATION_ROOT);
const REGISTRY_DIR = path.join(COORDINATION_ROOT, 'registry');
const GOVERNANCE_PATH = path.join(COORDINATION_ROOT, 'governance', 'final-shared-operating-document-v1.json');
const OUTPUT_PATH = path.resolve(process.env.KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT || path.join(SERVICE_ROOT, 'reports', 'engineering-hardening', 'integrated-program-registry-gate-latest.json'));

const REQUIRED_REGISTRIES = [
  'program-registry.json',
  'people-ai-registry.json',
  'track-registry.json',
  'snapshot-registry.json',
  'evidence-registry.json',
  'decision-registry.json',
  'risk-registry.json',
  'handoff-registry.json',
  'object-registry.json',
  'asset-registry.json',
  'rights-registry.json',
  'signal-registry.json',
  'provider-registry.json',
  'release-registry.json',
];

const REQUIRED_RELEASE_GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];
const REQUIRED_PROGRAM_TRACKS = ['A', 'B', 'C', 'D'];
const REQUIRED_COMPATIBILITY_TRACKS = ['A', 'B', 'C'];
const TRACK_B_OFFICIAL_INPUTS = ['snapshot-candidate.json', 'EVIDENCE_PACKAGE'];
const TRACK_B_OFFICIAL_OUTPUT = 'rankability-assessment.json';
const REQUIRED_HANDOFF_FIELDS = [
  'handoff_id',
  'from_track',
  'to_track',
  'snapshot_id',
  'artifact_reference',
  'artifact_version',
  'requested_action',
  'deadline',
  'known_limitations',
  'acceptance_criteria',
  'state',
];
const ACCEPTED_HANDOFF_STATES = new Set(['accepted', 'completed']);
const TRACK_ALIASES = {
  A: new Set(['A', 'track-a-120-intelligence-factory']),
  B: new Set(['B', 'track-b-rankability-validation-gate']),
};
const REQUIRED_ARTIFACT_CHAIN = [
  'snapshot-candidate.json',
  'Evidence Package',
  'rankability-assessment.json',
  'portal-release-manifest.json',
  'runtime-readiness-record.json',
  'portal-qa-result.json',
  'production-decision.json',
  'published-snapshot.json',
  'production-release-record.json',
];

function readJson(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`MISSING_FILE:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireCondition(condition, code, failures) {
  if (!condition) failures.push(code);
}

function artifactReferenceMatches(reference, expected) {
  if (typeof reference !== 'string') return false;
  const normalized = reference.replaceAll('\\', '/').replace(/\/+$/, '');
  return normalized === expected || normalized.endsWith(`/${expected}`);
}

function trackMatches(value, trackId) {
  return typeof value === 'string' && TRACK_ALIASES[trackId]?.has(value);
}

function hasCanonicalHandoffFields(row) {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return false;
  if (!REQUIRED_HANDOFF_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(row, field))) return false;
  return typeof row.handoff_id === 'string' && row.handoff_id.trim().length > 0;
}

function findAcceptedHandoffs(handoffs, snapshotId, artifactReference) {
  if (!snapshotId) return [];
  const entries = Array.isArray(handoffs?.entries) ? handoffs.entries : [];
  return entries.filter((row) =>
    hasCanonicalHandoffFields(row)
    && row?.snapshot_id === snapshotId
    && trackMatches(row?.from_track, 'A')
    && trackMatches(row?.to_track, 'B')
    && artifactReferenceMatches(row?.artifact_reference, artifactReference)
    && ACCEPTED_HANDOFF_STATES.has(String(row?.state ?? '').toLowerCase())
  );
}

function handoffId(row) {
  return row?.handoff_id ?? row?.id ?? null;
}

const failures = [];
const registries = {};
let governance = null;
let trackB = null;

try {
  for (const fileName of REQUIRED_REGISTRIES) registries[fileName] = readJson(path.join(REGISTRY_DIR, fileName));
  governance = readJson(GOVERNANCE_PATH);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (governance && Object.keys(registries).length === REQUIRED_REGISTRIES.length) {
  const program = registries['program-registry.json'];
  const tracks = registries['track-registry.json'];
  const snapshots = registries['snapshot-registry.json'];
  const providers = registries['provider-registry.json'];
  const handoffs = registries['handoff-registry.json'];
  const releases = registries['release-registry.json'];
  const programTrackIds = Array.isArray(program?.tracks) ? program.tracks.map((row) => row?.track_id) : [];
  const trackRows = Array.isArray(tracks?.tracks) ? tracks.tracks : [];
  const trackRegistryIds = trackRows.map((row) => row?.track_id);
  trackB = trackRows.find((row) => row?.track_id === 'B') ?? null;
  const registeredSnapshotIds = new Set();
  if (snapshots?.baseline_snapshot_id) registeredSnapshotIds.add(snapshots.baseline_snapshot_id);
  const snapshotEntries = Array.isArray(snapshots?.entries) ? snapshots.entries : [];
  for (const row of snapshotEntries) {
    if (row?.snapshot_id) registeredSnapshotIds.add(row.snapshot_id);
  }
  const currentSnapshotId = snapshots?.current_candidate_snapshot_id ?? snapshots?.current_published_snapshot_id ?? null;

  requireCondition(governance.version === 'v1.0', 'GOVERNANCE_VERSION_MISMATCH', failures);
  requireCondition(governance.status === 'FINAL_SHARED_OPERATING_BASELINE_REGISTRY_BOOTSTRAPPING', 'GOVERNANCE_STATUS_INVALID', failures);
  requireCondition(governance.effective_at === '2026-08-12T12:00:00+09:00', 'GOVERNANCE_EFFECTIVE_TIME_INVALID', failures);
  requireCondition(governance.principle === 'One Program. One Language. One Registry. One Source of Truth.', 'PROGRAM_PRINCIPLE_MISMATCH', failures);
  requireCondition(program?.registry_version === '1.1.0' && program?.program?.status === 'active', 'PROGRAM_STATUS_INVALID', failures);
  requireCondition(program?.migration_note === 'Compatibility registry. Canonical target is registry/program/index.json plus immutable records.', 'PROGRAM_MIGRATION_CONTRACT_INVALID', failures);
  requireCondition(program?.program?.integration_conductor === 'Atlas', 'INTEGRATION_CONDUCTOR_INVALID', failures);
  requireCondition(JSON.stringify(programTrackIds) === JSON.stringify(REQUIRED_PROGRAM_TRACKS), 'PROGRAM_TRACK_TOPOLOGY_INVALID', failures);
  requireCondition(JSON.stringify(trackRegistryIds) === JSON.stringify(REQUIRED_COMPATIBILITY_TRACKS), 'TRACK_REGISTRY_TOPOLOGY_INVALID', failures);
  requireCondition(trackB?.operating_rules_status === 'FINAL_LOCKED_V1_3', 'TRACK_B_RULE_STATUS_INVALID', failures);
  requireCondition(JSON.stringify(trackB?.official_inputs) === JSON.stringify(TRACK_B_OFFICIAL_INPUTS), 'TRACK_B_INPUT_BOUNDARY_INVALID', failures);
  requireCondition(trackB?.official_output === TRACK_B_OFFICIAL_OUTPUT, 'TRACK_B_OUTPUT_BOUNDARY_INVALID', failures);
  requireCondition(trackB?.assessment_policy?.creates_new_evidence === false && trackB?.assessment_policy?.evaluates_track_a_evidence_only === true, 'TRACK_B_EVIDENCE_BOUNDARY_INVALID', failures);
  requireCondition(trackB?.input_boundary?.both_official_inputs_required_before_assessment === true, 'TRACK_B_BOTH_INPUTS_REQUIRED_INVALID', failures);
  requireCondition(trackB?.temporary_or_estimated_assessment_allowed === false, 'TRACK_B_TEMPORARY_ASSESSMENT_POLICY_INVALID', failures);
  requireCondition(trackB?.registry_access?.mode === 'READ_ONLY', 'TRACK_B_REGISTRY_ACCESS_INVALID', failures);
  requireCondition(JSON.stringify(handoffs?.required_fields) === JSON.stringify(REQUIRED_HANDOFF_FIELDS), 'HANDOFF_REQUIRED_FIELDS_INVALID', failures);
  requireCondition(JSON.stringify(program?.artifact_chain) === JSON.stringify(REQUIRED_ARTIFACT_CHAIN), 'ARTIFACT_CHAIN_INVALID', failures);
  requireCondition(Array.isArray(program?.official_books) && program.official_books.length === 3 && program.official_books.includes('Master Book') && program.official_books.includes('Baseline Book') && program.official_books.includes('Architecture Book'), 'OFFICIAL_BOOK_TOPOLOGY_INVALID', failures);
  requireCondition(currentSnapshotId == null || registeredSnapshotIds.has(currentSnapshotId), 'CURRENT_SNAPSHOT_NOT_REGISTERED', failures);
  requireCondition(Array.isArray(releases?.required_gate_sequence) && JSON.stringify(releases.required_gate_sequence) === JSON.stringify(REQUIRED_RELEASE_GATES), 'RELEASE_GATE_TOPOLOGY_INVALID', failures);
  requireCondition(releases?.current_production_release_id == null, 'UNAPPROVED_PRODUCTION_RELEASE_PRESENT', failures);
  requireCondition(providers?.policy === 'Proof before Procurement', 'PROVIDER_POLICY_INVALID', failures);
  requireCondition(providers?.safety?.auto_procurement === false && providers?.safety?.auto_contract_execution === false && providers?.safety?.unauthorized_scraping === false && providers?.safety?.baseline_overwrite === false, 'PROVIDER_SAFETY_BOUNDARY_INVALID', failures);
}

const currentSnapshotId = registries['snapshot-registry.json']?.current_candidate_snapshot_id ?? registries['snapshot-registry.json']?.current_published_snapshot_id ?? null;
const handoffs = registries['handoff-registry.json'];
const snapshotCandidateHandoffs = findAcceptedHandoffs(handoffs, currentSnapshotId, TRACK_B_OFFICIAL_INPUTS[0]);
const evidencePackageHandoffs = findAcceptedHandoffs(handoffs, currentSnapshotId, TRACK_B_OFFICIAL_INPUTS[1]);
const snapshotCandidateHandoff = snapshotCandidateHandoffs.length === 1 ? snapshotCandidateHandoffs[0] : null;
const evidencePackageHandoff = evidencePackageHandoffs.length === 1 ? evidencePackageHandoffs[0] : null;
const trackBBoundaryFailures = failures.filter((code) => String(code).startsWith('TRACK_B_'));
const officialInputHandoffAmbiguous = snapshotCandidateHandoffs.length > 1 || evidencePackageHandoffs.length > 1;
const bothOfficialInputsAccepted = snapshotCandidateHandoff != null && evidencePackageHandoff != null;
const trackBAssessmentPermitted = failures.length === 0 && currentSnapshotId != null && bothOfficialInputsAccepted && !officialInputHandoffAmbiguous;

let trackBWaitingState = 'WAITING_FOR_SNAPSHOT';
let trackBReadinessReason = 'OFFICIAL_SNAPSHOT_CANDIDATE_NOT_REGISTERED';
if (currentSnapshotId != null) {
  if (officialInputHandoffAmbiguous) {
    trackBWaitingState = 'WAITING_FOR_VALIDATION';
    trackBReadinessReason = 'OFFICIAL_INPUT_HANDOFF_AMBIGUOUS';
  } else if (snapshotCandidateHandoff == null) {
    trackBWaitingState = 'WAITING_FOR_SNAPSHOT';
    trackBReadinessReason = 'SNAPSHOT_CANDIDATE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF';
  } else if (evidencePackageHandoff == null) {
    trackBWaitingState = 'WAITING_FOR_EVIDENCE';
    trackBReadinessReason = 'EVIDENCE_PACKAGE_AVAILABILITY_NOT_PROVEN_BY_CANONICAL_HANDOFF';
  } else if (failures.length > 0) {
    trackBWaitingState = 'WAITING_FOR_VALIDATION';
    trackBReadinessReason = 'INTEGRATED_PROGRAM_GATE_NOT_CLEAN';
  } else {
    trackBWaitingState = 'READY_FOR_ASSESSMENT';
    trackBReadinessReason = 'BOTH_OFFICIAL_INPUTS_ACCEPTED_FOR_EXACT_SNAPSHOT';
  }
}

const report = {
  schema_version: '1.4.0',
  mode: 'KIDULTS_INTEGRATED_PROGRAM_REGISTRY_GATE',
  generated_at: new Date().toISOString(),
  status: failures.length === 0 ? 'PASS_BOOTSTRAPPING' : 'FAIL_CLOSED',
  coordination_root: path.relative(REPO_ROOT, COORDINATION_ROOT) || '.',
  required_registry_count: REQUIRED_REGISTRIES.length,
  loaded_registry_count: Object.keys(registries).length,
  program_registry_version: registries['program-registry.json']?.registry_version ?? null,
  current_snapshot_id: currentSnapshotId,
  track_b_readiness: {
    operating_rules_status: trackB?.operating_rules_status ?? null,
    official_inputs: trackB?.official_inputs ?? null,
    official_output: trackB?.official_output ?? null,
    boundary_validation_passed: trackBBoundaryFailures.length === 0 && trackB != null,
    assessment_permitted: trackBAssessmentPermitted,
    waiting_state: trackBWaitingState,
    reason: trackBReadinessReason,
    creates_or_modifies_evidence: false,
    registry_access_mode: trackB?.registry_access?.mode ?? null,
    canonical_handoff_proof: {
      snapshot_candidate_handoff_id: handoffId(snapshotCandidateHandoff),
      evidence_package_handoff_id: handoffId(evidencePackageHandoff),
      exact_snapshot_match_required: true,
      accepted_states: [...ACCEPTED_HANDOFF_STATES],
    },
  },
  failures,
  claims: {
    operating_baseline_loaded: failures.length === 0,
    registry_is_single_source_of_truth: failures.length === 0,
    track_b_final_locked_v1_3_verified: trackBBoundaryFailures.length === 0 && trackB != null,
    track_b_assessment_permitted: trackBAssessmentPermitted,
    track_b_assessment_started: false,
    production_ready: false,
    g0_g5_complete: false,
    snapshot_id_inferred_or_synthesized: false,
    provider_procured: false,
    contract_executed: false,
    unauthorized_scraping_used: false,
    rights_or_provenance_weakened: false,
    production_gate_weakened: false,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Integrated Program registry gate: ${report.status}; registries=${report.loaded_registry_count}/${report.required_registry_count}; program=${report.program_registry_version ?? 'null'}; snapshot=${report.current_snapshot_id ?? 'null'}; trackB=${report.track_b_readiness.waiting_state}; failures=${failures.length}`);
if (failures.length > 0) process.exitCode = 1;
