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
const TRACK_B_NON_OFFICIAL_INPUTS = [
  'PORTAL_RESULT',
  'BUSINESS_REQUEST',
  'PROVIDER_REQUIREMENT',
  'ESTIMATE',
  'VERBAL_EXPLANATION',
  'CHAT_ONLY_INFORMATION',
];
const TRACK_B_NON_OFFICIAL_ARTIFACT_LANES = [
  'reports/engineering-hardening',
  'reports/execution-control',
  'reports/runtime',
  'registry/runtime',
];
const TRACK_B_OUTPUT_MUST_NOT_GENERATE = [
  'snapshot-candidate.json',
  'PORTAL_RELEASE',
  'REGISTRY_CHANGE',
  'PRODUCTION_DECISION',
  'BUSINESS_RECOMMENDATION',
  'FINAL_RANKING',
];
const TRACK_B_REQUIRED_SEQUENCE = ['SNAPSHOT', 'EVIDENCE', 'ASSESSMENT'];
const TRACK_B_REQUIRED_ISOLATION_SEQUENCE = ['ONE_SNAPSHOT', 'ONE_ASSESSMENT', 'ONE_RECOMMENDATION'];
const TRACK_B_COMPLETION_REQUIREMENTS = [
  'SNAPSHOT_ID_VERIFIED',
  'EVIDENCE_PACKAGE_VERIFIED',
  'ASSESSMENT_CONTRACT_VALIDATION_PASSED',
  'REGISTRY_TRACEABILITY_COMPLETED',
];
const TRACK_B_REQUIRED_TRACEABILITY_FIELDS = [
  'assessment_id',
  'snapshot_id',
  'assessment_version',
  'registry_version',
  'methodology_version',
  'evidence_lineage_version',
  'generated_at',
  'assessment_status',
];
const TRACK_B_INSUFFICIENT_EVIDENCE_DISPOSITIONS = ['NOT_RANKABLE', 'BLOCKED'];
const TRACK_B_WAITING_STATES = [
  'WAITING_FOR_SNAPSHOT',
  'WAITING_FOR_EVIDENCE',
  'WAITING_FOR_REGISTRY',
  'WAITING_FOR_VALIDATION',
];
const TRACK_B_RECOMMENDATIONS = ['BLOCKED', 'CONDITIONAL', 'PUBLISHABLE'];
const TRACK_B_CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const TRACK_B_QUANTITATIVE_JUSTIFICATION_FIELDS = [
  'metric',
  'observed_value',
  'required_threshold',
  'comparison_result',
  'evidence_reference',
];
const TRACK_B_RECOMMENDATION_MAY_SPECIFY = ['REQUIRED_EVIDENCE', 'EXIT_CRITERIA', 'ADDITIONAL_VALIDATION'];
const TRACK_B_DECISION_BASIS = ['SNAPSHOT', 'EVIDENCE', 'ASSESSMENT'];
const TRACK_B_INDEPENDENCE_MUST_IGNORE = [
  'TRACK_A_SPEED',
  'PORTAL_SCHEDULE',
  'PROVIDER_CONTRACT_SCHEDULE',
  'BUSINESS_PRIORITY',
  'PRODUCTION_SCHEDULE',
];
const TRACK_B_ASSESSMENT_TRIGGER_CONDITIONS = [
  'SNAPSHOT_ID_EXISTS',
  'SNAPSHOT_REGISTRY_REGISTRATION_COMPLETED',
  'SNAPSHOT_CANDIDATE_AVAILABLE',
  'EVIDENCE_PACKAGE_AVAILABLE',
  'REGISTRY_VALIDATION_PASSED',
];
const TRACK_B_TRIGGER_WAITING_STATE_RESOLUTION = {
  snapshot_missing: 'WAITING_FOR_SNAPSHOT',
  evidence_missing: 'WAITING_FOR_EVIDENCE',
  registry_registration_missing: 'WAITING_FOR_REGISTRY',
  registry_or_contract_validation_pending: 'WAITING_FOR_VALIDATION',
};
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

function hasAmbiguousArtifactReferencePath(reference) {
  return reference.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0);
}

function isCanonicalRepositoryRelativeArtifactReference(reference) {
  if (typeof reference !== 'string' || reference.length === 0 || reference !== reference.trim()) return false;
  if (reference.includes('\\') || reference.includes('%') || reference.includes('?') || reference.includes('#')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)) return false;
  if (/[\u0000-\u001F\u007F]/.test(reference)) return false;
  return !hasAmbiguousArtifactReferencePath(reference);
}

function artifactReferenceMatches(reference, expected) {
  if (!isCanonicalRepositoryRelativeArtifactReference(reference)) return false;
  return reference === expected || reference.endsWith(`/${expected}`);
}

function isPathContainedByRoot(root, target) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isMaterializedTrackBOfficialInput(reference, expected) {
  if (!artifactReferenceMatches(reference, expected)) return false;
  const resolved = path.resolve(COORDINATION_ROOT, reference);
  if (!isPathContainedByRoot(COORDINATION_ROOT, resolved)) return false;

  try {
    if (!fs.existsSync(resolved)) return false;
    const stats = fs.lstatSync(resolved);
    if (stats.isSymbolicLink()) return false;

    const realRoot = fs.realpathSync(COORDINATION_ROOT);
    const realResolved = fs.realpathSync(resolved);
    if (!isPathContainedByRoot(realRoot, realResolved)) return false;

    if (expected === TRACK_B_OFFICIAL_INPUTS[0]) return stats.isFile();
    return stats.isFile() || stats.isDirectory();
  } catch {
    return false;
  }
}

function isTrackBNonOfficialArtifactLane(reference) {
  if (typeof reference !== 'string') return false;
  const normalized = reference
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return TRACK_B_NON_OFFICIAL_ARTIFACT_LANES.some((lane) =>
    normalized === lane
    || normalized.startsWith(`${lane}/`)
    || normalized.includes(`/${lane}/`)
  );
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
    && isMaterializedTrackBOfficialInput(row?.artifact_reference, artifactReference)
    && !isTrackBNonOfficialArtifactLane(row?.artifact_reference)
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
  requireCondition(
    trackB?.input_boundary?.both_official_inputs_required_before_assessment === true
    && JSON.stringify(trackB?.input_boundary?.non_official_inputs) === JSON.stringify(TRACK_B_NON_OFFICIAL_INPUTS),
    'TRACK_B_INPUT_POLICY_INVALID',
    failures,
  );
  requireCondition(
    trackB?.output_boundary?.only_official_output === TRACK_B_OFFICIAL_OUTPUT
    && JSON.stringify(trackB?.output_boundary?.must_not_generate) === JSON.stringify(TRACK_B_OUTPUT_MUST_NOT_GENERATE),
    'TRACK_B_OUTPUT_POLICY_INVALID',
    failures,
  );
  requireCondition(
    trackB?.assessment_policy?.creates_snapshot === false
    && trackB?.assessment_policy?.creates_registry === false
    && trackB?.assessment_policy?.creates_portal_release === false
    && trackB?.assessment_policy?.creates_production_decision === false
    && trackB?.assessment_policy?.creates_business_decision === false
    && trackB?.assessment_policy?.creates_new_evidence === false
    && trackB?.assessment_policy?.evaluates_track_a_evidence_only === true,
    'TRACK_B_MUTATION_AND_EVIDENCE_BOUNDARY_INVALID',
    failures,
  );
  requireCondition(trackB?.snapshot_scope === 'EXACTLY_ONE_EXISTING_SNAPSHOT_ID', 'TRACK_B_SNAPSHOT_SCOPE_INVALID', failures);
  requireCondition(
    trackB?.snapshot_isolation?.one_snapshot_per_assessment === true
    && trackB?.snapshot_isolation?.combined_snapshot_assessment_allowed === false
    && trackB?.snapshot_isolation?.historical_current_merge_allowed === false,
    'TRACK_B_SNAPSHOT_ISOLATION_INVALID',
    failures,
  );
  requireCondition(JSON.stringify(trackB?.snapshot_isolation?.required_sequence) === JSON.stringify(TRACK_B_REQUIRED_ISOLATION_SEQUENCE), 'TRACK_B_SNAPSHOT_ISOLATION_SEQUENCE_INVALID', failures);
  requireCondition(JSON.stringify(trackB?.assessment_policy?.required_sequence) === JSON.stringify(TRACK_B_REQUIRED_SEQUENCE), 'TRACK_B_ASSESSMENT_SEQUENCE_INVALID', failures);
  requireCondition(JSON.stringify(trackB?.assessment_policy?.insufficient_evidence_dispositions) === JSON.stringify(TRACK_B_INSUFFICIENT_EVIDENCE_DISPOSITIONS), 'TRACK_B_INSUFFICIENT_EVIDENCE_POLICY_INVALID', failures);
  requireCondition(
    trackB?.assessment_policy?.reproducibility?.same_snapshot_and_same_evidence_must_produce_same_assessment === true
    && trackB?.assessment_policy?.reproducibility?.different_result_requires_recorded_cause === true,
    'TRACK_B_REPRODUCIBILITY_CONTRACT_INVALID',
    failures,
  );
  requireCondition(
    trackB?.assessment_policy?.immutable_after_issue === true
    && trackB?.assessment_policy?.revision_model === 'NEW_ASSESSMENT_NEW_ID_ARCHIVE_PRIOR',
    'TRACK_B_IMMUTABILITY_CONTRACT_INVALID',
    failures,
  );
  requireCondition(JSON.stringify(trackB?.assessment_policy?.required_traceability_fields) === JSON.stringify(TRACK_B_REQUIRED_TRACEABILITY_FIELDS), 'TRACK_B_TRACEABILITY_CONTRACT_INVALID', failures);
  requireCondition(
    JSON.stringify(trackB?.assessment_completion?.complete_requires_all) === JSON.stringify(TRACK_B_COMPLETION_REQUIREMENTS)
    && trackB?.assessment_completion?.when_all_true === 'COMPLETE'
    && trackB?.assessment_completion?.otherwise === 'INCOMPLETE',
    'TRACK_B_COMPLETION_CONTRACT_INVALID',
    failures,
  );
  requireCondition(JSON.stringify(trackB?.official_waiting_states) === JSON.stringify(TRACK_B_WAITING_STATES), 'TRACK_B_WAITING_STATE_CONTRACT_INVALID', failures);
  requireCondition(trackB?.temporary_or_estimated_assessment_allowed === false, 'TRACK_B_TEMPORARY_ASSESSMENT_POLICY_INVALID', failures);
  requireCondition(
    JSON.stringify(trackB?.recommendation_policy?.allowed) === JSON.stringify(TRACK_B_RECOMMENDATIONS)
    && trackB?.recommendation_policy?.must_include_confidence === true
    && JSON.stringify(trackB?.recommendation_policy?.confidence_levels) === JSON.stringify(TRACK_B_CONFIDENCE_LEVELS)
    && trackB?.recommendation_policy?.confidence_requires_assessment_evidence === true
    && trackB?.recommendation_policy?.must_include_quantitative_justification === true
    && JSON.stringify(trackB?.recommendation_policy?.quantitative_justification_fields) === JSON.stringify(TRACK_B_QUANTITATIVE_JUSTIFICATION_FIELDS)
    && trackB?.recommendation_policy?.opinion_only_recommendation_allowed === false
    && JSON.stringify(trackB?.recommendation_policy?.may_specify) === JSON.stringify(TRACK_B_RECOMMENDATION_MAY_SPECIFY),
    'TRACK_B_RECOMMENDATION_CONTRACT_INVALID',
    failures,
  );
  requireCondition(
    JSON.stringify(trackB?.independence_preservation?.decision_basis) === JSON.stringify(TRACK_B_DECISION_BASIS)
    && JSON.stringify(trackB?.independence_preservation?.must_ignore) === JSON.stringify(TRACK_B_INDEPENDENCE_MUST_IGNORE),
    'TRACK_B_INDEPENDENCE_CONTRACT_INVALID',
    failures,
  );
  requireCondition(
    JSON.stringify(trackB?.assessment_trigger?.required_conditions) === JSON.stringify(TRACK_B_ASSESSMENT_TRIGGER_CONDITIONS)
    && trackB?.assessment_trigger?.when_all_true === 'GENERATE_RANKABILITY_ASSESSMENT'
    && JSON.stringify(trackB?.assessment_trigger?.waiting_state_resolution) === JSON.stringify(TRACK_B_TRIGGER_WAITING_STATE_RESOLUTION),
    'TRACK_B_ASSESSMENT_TRIGGER_CONTRACT_INVALID',
    failures,
  );
  requireCondition(
    trackB?.archive_policy?.delete_assessment_allowed === false
    && trackB?.archive_policy?.modify_issued_assessment_allowed === false
    && trackB?.archive_policy?.new_assessment_required_for_changed_evaluation === true
    && trackB?.archive_policy?.prior_assessment_destination === 'ASSESSMENT_ARCHIVE_REGISTRY',
    'TRACK_B_ARCHIVE_CONTRACT_INVALID',
    failures,
  );
  requireCondition(
    trackB?.registry_access?.mode === 'READ_ONLY'
    && trackB?.registry_access?.may_request_assessment_registration === true
    && trackB?.registry_access?.assessment_registration_owner === 'ATLAS_KPMO'
    && trackB?.registry_access?.governance_owner === 'ATLAS_KPMO',
    'TRACK_B_REGISTRY_ACCESS_INVALID',
    failures,
  );
  requireCondition(
    trackB?.directive?.name === 'Track B Additional Operating Directive'
    && trackB?.directive?.version === 'v1.3'
    && trackB?.directive?.status === 'APPROVED'
    && trackB?.directive?.rule_status === 'FINAL_LOCKED'
    && trackB?.directive?.effective === 'IMMEDIATELY'
    && trackB?.directive?.prior_version === 'v1.2'
    && trackB?.directive?.future_operating_rule_expansion_allowed === false
    && trackB?.directive?.next_official_work === 'RECEIVE_SNAPSHOT_VALIDATE_EVIDENCE_GENERATE_ASSESSMENT_HANDOFF_TO_INTEGRATION_GATE',
    'TRACK_B_DIRECTIVE_CONTRACT_INVALID',
    failures,
  );
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
      non_official_artifact_lanes_rejected: true,
      ambiguous_artifact_reference_paths_rejected: true,
      plain_repository_relative_artifact_references_required: true,
      materialized_official_inputs_required: true,
      registry_reference_alone_cannot_unlock_assessment: true,
      symlinked_or_outside_root_official_inputs_rejected: true,
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
    operational_runtime_evidence_used_as_track_b_official_input: false,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Integrated Program registry gate: ${report.status}; registries=${report.loaded_registry_count}/${report.required_registry_count}; program=${report.program_registry_version ?? 'null'}; snapshot=${report.current_snapshot_id ?? 'null'}; trackB=${report.track_b_readiness.waiting_state}; failures=${failures.length}`);
if (failures.length > 0) process.exitCode = 1;