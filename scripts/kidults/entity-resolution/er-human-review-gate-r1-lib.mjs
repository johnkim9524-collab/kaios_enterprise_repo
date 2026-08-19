import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
export const HUMAN_LABELS = Object.freeze(['MATCH', 'NO_MATCH', 'REVIEW_REQUIRED']);
export const BENCHMARK_LABEL_MAPPING = Object.freeze({
  MATCH: 'MATCH',
  NO_MATCH: 'NO_MATCH',
  REVIEW_REQUIRED: 'REVIEW'
});

const PACKET_TOP_LEVEL_FIELDS = Object.freeze([
  'schema_version',
  'packet_id',
  'packet_state',
  'reviewer_slot',
  'reviewer_assignment_state',
  'case_count',
  'case_set_sha256',
  'cases',
  'packet_sha256'
]);

const REVIEW_RECORD_FIELDS = Object.freeze([
  'case_id',
  'reviewer_id',
  'packet_sha256',
  'case_evidence_binding_sha256',
  'reviewer_independence_attestation',
  'label',
  'label_reason_code',
  'evidence_refs_reviewed',
  'reviewed_at',
  'review_record_sha256'
]);

const ADJUDICATION_RECORD_FIELDS = Object.freeze([
  'case_id',
  'reviewer_a_label',
  'reviewer_b_label',
  'adjudicator_id',
  'adjudicator_identity_verification_ref',
  'final_label',
  'reason',
  'evidence_refs',
  'adjudicated_at',
  'record_sha256'
]);

const REVIEWER_REGISTRY_FIELDS = Object.freeze(['registry_state', 'reviewers']);
const REVIEWER_FIELDS = Object.freeze([
  'slot',
  'reviewer_id',
  'identity_source_type',
  'identity_verification_ref',
  'identity_attestation_sha256',
  'independence_attestation_sha256',
  'attested_at',
  'resolver_author',
  'model_operator',
  'other_reviewer_labels_seen'
]);
const REVIEW_FILE_FIELDS = Object.freeze(['review_state', 'records']);
const ADJUDICATION_FILE_FIELDS = Object.freeze(['adjudication_state', 'records']);

const PREFREEZE_PROHIBITED_KEYS = new Set([
  'expected',
  'expected_label',
  'gold_label',
  'label',
  'labels',
  'review_label',
  'reviewer_label',
  'adjudicated_label',
  'final_label',
  'benchmark_result',
  'blind_holdout',
  'holdout_label',
  'model_prediction',
  'model_predictions',
  'model_score',
  'model_scores',
  'model_output',
  'model_outputs',
  'resolver_prediction',
  'resolver_score',
  'resolver_output',
  'other_reviewer_label'
]);

const REVIEW_RECORD_PROHIBITED_KEYS = new Set([
  'model_prediction',
  'model_predictions',
  'model_score',
  'model_scores',
  'model_output',
  'model_outputs',
  'resolver_prediction',
  'resolver_score',
  'resolver_output',
  'other_reviewer_label',
  'adjudicated_label',
  'benchmark_result'
]);

const PLACEHOLDER_RE = /^(?:a|b|na|n\/a|none|null|unknown|pending|unassigned|not[-_ ]?assigned|tbd|todo|reviewer(?:[-_ ]?[ab12])?|reviewer[-_ ]?one|reviewer[-_ ]?two)$/i;
const PLACEHOLDER_FRAGMENT_RE = /(?:^|[:/_ .-])(?:placeholder|dummy|fake|test(?:er)?|example|sample|tbd|todo|unassigned|not[-_ ]?assigned)(?:$|[:/_ .-])/i;

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function recordDigest(record, digestField) {
  const material = { ...record };
  delete material[digestField];
  return digest(material);
}

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assertPlainObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
}

function assertExactKeys(value, allowedKeys, code) {
  assertPlainObject(value, code);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, key);
  for (const key of allowedKeys) if (!(key in value)) fail(code, `MISSING_${key}`);
}

function normalizedKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function findProhibitedKey(value, prohibited, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findProhibitedKey(value[index], prohibited, `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (prohibited.has(normalizedKey(key))) return childPath;
    const hit = findProhibitedKey(child, prohibited, childPath);
    if (hit) return hit;
  }
  return null;
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function uniqueSortedStrings(value, code) {
  if (!Array.isArray(value) || value.length === 0) fail(code);
  const result = value.map((entry) => requiredString(entry, code)).sort();
  if (new Set(result).size !== result.length) fail(`${code}_DUPLICATE`);
  return result;
}

function requireSha(value, code) {
  if (!SHA256_RE.test(value)) fail(code);
  return value;
}

function requireIsoTimestamp(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) fail(code);
  return value;
}

function countsBy(items, field) {
  const result = {};
  for (const item of items) result[item[field]] = (result[item[field]] || 0) + 1;
  return result;
}

function assertExactCounts(actual, expected, code) {
  const a = canonicalJson(actual);
  const e = canonicalJson(expected);
  if (a !== e) fail(code, `${a}!=${e}`);
}

export function validateOperationalContract(contract, samplingPlan, packetContract) {
  if (contract.id !== 'kidults-er-human-review-gate-operational-contract-r1') fail('OPERATIONAL_CONTRACT_ID_INVALID');
  if (contract.production !== 'HOLD' || contract.public_release !== 'HOLD') fail('RELEASE_BOUNDARY_WEAKENED');
  if (contract.boundary_sources?.sampling_allocation_pr !== 610 || contract.boundary_sources?.independent_review_packet_pr !== 612) fail('BOUNDARY_SOURCE_MISMATCH');
  if (contract.input?.total_cases_required !== 840 || contract.input?.cases_per_stratum_required !== 120) fail('OPERATING_840_120_REQUIRED');
  if (contract.holdout_commitment?.blind_case_count_required !== 420 || contract.holdout_commitment?.blind_cases_per_stratum_required !== 60) fail('HOLDOUT_420_60_REQUIRED');
  if (contract.human_completion?.required_review_records !== 1680 || contract.human_completion?.reviews_per_case !== 2 || contract.human_completion?.records_per_reviewer !== 840) fail('REVIEW_RECORD_1680_REQUIRED');
  if (contract.human_completion?.identity_verification_boundary !== 'EXTERNALLY_GOVERNED_REGISTRY_ASSERTION_STRUCTURAL_VALIDATION_ONLY') fail('IDENTITY_VERIFICATION_BOUNDARY_INVALID');
  if (canonicalJson(contract.human_completion?.benchmark_label_mapping) !== canonicalJson(BENCHMARK_LABEL_MAPPING)) fail('REVIEW_REQUIRED_MAPPING_INVALID');
  if (samplingPlan.dataset_target?.total_cases !== 840 || samplingPlan.dataset_target?.blind_holdout_cases !== 420) fail('SAMPLING_PLAN_840_420_REQUIRED');
  if (!Array.isArray(samplingPlan.strata) || samplingPlan.strata.length !== 7 || samplingPlan.strata.some((stratum) => stratum.cases !== 120 || stratum.blind !== 60)) fail('SAMPLING_STRATA_120_60_REQUIRED');
  if (packetContract.reviewer_requirements?.minimum_independent_reviewers !== 2 || packetContract.completion_state?.reviewer_a !== 'NOT_ASSIGNED' || packetContract.completion_state?.reviewer_b !== 'NOT_ASSIGNED') fail('PACKET_REVIEWER_BOUNDARY_INVALID');
  if (packetContract.completion_state?.labels !== 'NOT_COLLECTED' || packetContract.completion_state?.empirical_attestation !== 'NOT_CREATED' || packetContract.completion_state?.track_b !== 'NOT_STARTED') fail('PACKET_FALSE_COMPLETION_CLAIM');
  for (const field of packetContract.fields_prohibited_from_reviewer_packets || []) {
    if (!(contract.packet?.prohibited_fields || []).includes(field)) fail('PACKET_PROHIBITED_FIELD_NOT_CARRIED_FORWARD', field);
  }
  const expectedPacketFields = [...packetContract.packet_input_fields, 'case_evidence_binding_sha256'];
  if (canonicalJson(contract.packet?.case_fields) !== canonicalJson(expectedPacketFields)) fail('PACKET_FIELD_ALLOWLIST_DIVERGES_FROM_612');
  const claims = contract.completion_claims || {};
  if (Object.values(claims).some((value) => value !== false)) fail('PREFLIGHT_MUST_NOT_CLAIM_HUMAN_COMPLETION');
  return true;
}

export function normalizeEvidenceCases(dataset, samplingPlan, operationalContract, { allowContractTestFixture = false } = {}) {
  assertPlainObject(dataset, 'DATASET_REQUIRED');
  requiredString(dataset.id, 'DATASET_ID_REQUIRED');
  const fixture = dataset.fixture_classification === 'CONTRACT_TEST_FIXTURE_ONLY';
  if (fixture && !allowContractTestFixture) fail('CONTRACT_TEST_FIXTURE_NOT_ALLOWED');
  if (!fixture && dataset.dataset_class !== operationalContract.input.dataset_class_required) fail('REAL_WORLD_UNLABELED_DATASET_REQUIRED');
  if (dataset.production !== 'HOLD') fail('DATASET_PRODUCTION_MUST_HOLD');
  if (!Array.isArray(dataset.cases) || dataset.cases.length !== operationalContract.input.total_cases_required) fail('EXACT_840_CASES_REQUIRED');

  const planByStratum = new Map(samplingPlan.strata.map((stratum) => [stratum.stratum_id, stratum]));
  const observedIds = new Set();
  const observedEvidencePairs = new Set();
  const normalized = dataset.cases.map((raw, index) => {
    assertPlainObject(raw, `CASE_OBJECT_REQUIRED:${index}`);
    const prohibited = findProhibitedKey(raw, PREFREEZE_PROHIBITED_KEYS, `cases[${index}]`);
    if (prohibited) fail('PREFREEZE_LABEL_OR_MODEL_FIELD_PROHIBITED', prohibited);
    const caseId = requiredString(raw.case_id, `CASE_ID_REQUIRED:${index}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/.test(caseId)) fail('CASE_ID_FORMAT_INVALID', caseId);
    if (observedIds.has(caseId)) fail('DUPLICATE_CASE_ID', caseId);
    observedIds.add(caseId);
    const stratumId = requiredString(raw.stratum_id, `STRATUM_ID_REQUIRED:${caseId}`);
    const planStratum = planByStratum.get(stratumId);
    if (!planStratum) fail('UNKNOWN_STRATUM', stratumId);
    const caseClass = requiredString(raw.case_class, `CASE_CLASS_REQUIRED:${caseId}`);
    if (!(caseClass in planStratum.case_class_targets)) fail('CASE_CLASS_NOT_ALLOWED_FOR_STRATUM', `${stratumId}:${caseClass}`);
    const identityBoundary = requiredString(raw.identity_boundary, `IDENTITY_BOUNDARY_REQUIRED:${caseId}`);
    if (!(identityBoundary in planStratum.identity_boundary_targets)) fail('IDENTITY_BOUNDARY_NOT_ALLOWED_FOR_STRATUM', `${stratumId}:${identityBoundary}`);
    if (raw.rights_state !== operationalContract.input.rights_state_required) fail('RIGHTS_NOT_ALLOW', caseId);
    const base = {
      case_id: caseId,
      stratum_id: stratumId,
      case_class: caseClass,
      identity_boundary: identityBoundary,
      source_a_reference: requiredString(raw.source_a_reference, `SOURCE_A_REFERENCE_REQUIRED:${caseId}`),
      source_b_reference: requiredString(raw.source_b_reference, `SOURCE_B_REFERENCE_REQUIRED:${caseId}`),
      source_a_payload_sha256: requireSha(raw.source_a_payload_sha256, `SOURCE_A_SHA256_REQUIRED:${caseId}`),
      source_b_payload_sha256: requireSha(raw.source_b_payload_sha256, `SOURCE_B_SHA256_REQUIRED:${caseId}`),
      license_evidence_refs: uniqueSortedStrings(raw.license_evidence_refs, `LICENSE_EVIDENCE_REQUIRED:${caseId}`),
      rights_state: raw.rights_state,
      provenance_refs: uniqueSortedStrings(raw.provenance_refs, `PROVENANCE_REQUIRED:${caseId}`)
    };
    const evidenceSides = [
      { source_reference: base.source_a_reference, source_payload_sha256: base.source_a_payload_sha256 },
      { source_reference: base.source_b_reference, source_payload_sha256: base.source_b_payload_sha256 }
    ].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    if (canonicalJson(evidenceSides[0]) === canonicalJson(evidenceSides[1])) fail('SELF_EVIDENCE_PAIR_PROHIBITED', caseId);
    const evidencePair = digest(evidenceSides);
    if (observedEvidencePairs.has(evidencePair)) fail('DUPLICATE_EVIDENCE_PAIR_PADDING', caseId);
    observedEvidencePairs.add(evidencePair);
    const caseEvidenceBinding = digest(base);
    if (raw.case_evidence_binding_sha256 !== undefined && raw.case_evidence_binding_sha256 !== caseEvidenceBinding) fail('CASE_EVIDENCE_BINDING_MISMATCH', caseId);
    return { ...base, case_evidence_binding_sha256: caseEvidenceBinding };
  });

  for (const stratum of samplingPlan.strata) {
    const cases = normalized.filter((item) => item.stratum_id === stratum.stratum_id);
    if (cases.length !== stratum.cases) fail('STRATUM_CASE_COUNT_MISMATCH', stratum.stratum_id);
    assertExactCounts(countsBy(cases, 'case_class'), stratum.case_class_targets, `STRATUM_CASE_CLASS_ALLOCATION_MISMATCH:${stratum.stratum_id}`);
    assertExactCounts(countsBy(cases, 'identity_boundary'), stratum.identity_boundary_targets, `STRATUM_IDENTITY_BOUNDARY_ALLOCATION_MISMATCH:${stratum.stratum_id}`);
  }
  return normalized.sort((left, right) => left.stratum_id.localeCompare(right.stratum_id) || left.case_id.localeCompare(right.case_id));
}

function unsignedRecord(record, digestField) {
  const copy = structuredClone(record);
  delete copy[digestField];
  return copy;
}

function buildPacket(slot, cases, datasetId) {
  const packetCases = cases.map((item) => ({ ...item }));
  const packet = {
    schema_version: '1.0.0',
    packet_id: `kidults-er-independent-review-packet-${slot.toLowerCase()}-r1:${datasetId}`,
    packet_state: 'UNASSIGNED_UNLABELED_BLINDED_TEMPLATE',
    reviewer_slot: slot,
    reviewer_assignment_state: 'NOT_ASSIGNED',
    case_count: packetCases.length,
    case_set_sha256: digest(packetCases.map((item) => ({ case_id: item.case_id, case_evidence_binding_sha256: item.case_evidence_binding_sha256 }))),
    cases: packetCases
  };
  return { ...packet, packet_sha256: digest(packet) };
}

function buildHoldoutCommitment(cases, dataset, samplingPlan, operationalContract) {
  const datasetCaseSetSha256 = digest(cases.map((item) => ({ case_id: item.case_id, case_evidence_binding_sha256: item.case_evidence_binding_sha256 })));
  const samplingPlanSha256 = digest(samplingPlan);
  const selected = [];
  const perStratum = [];
  for (const stratum of samplingPlan.strata) {
    const ranked = cases
      .filter((item) => item.stratum_id === stratum.stratum_id)
      .map((item) => ({
        case_id: item.case_id,
        stratum_id: item.stratum_id,
        case_evidence_binding_sha256: item.case_evidence_binding_sha256,
        selection_rank_sha256: digest({
          sampling_plan_sha256: samplingPlanSha256,
          dataset_case_set_sha256: datasetCaseSetSha256,
          stratum_id: item.stratum_id,
          case_id: item.case_id,
          case_evidence_binding_sha256: item.case_evidence_binding_sha256
        })
      }))
      .sort((left, right) => left.selection_rank_sha256.localeCompare(right.selection_rank_sha256) || left.case_id.localeCompare(right.case_id));
    const chosen = ranked.slice(0, stratum.blind).sort((left, right) => left.case_id.localeCompare(right.case_id));
    selected.push(...chosen);
    perStratum.push({ stratum_id: stratum.stratum_id, blind_case_count: chosen.length, blind_case_set_sha256: digest(chosen) });
  }
  const commitment = {
    schema_version: '1.0.0',
    commitment_id: `kidults-er-blind-holdout-commitment-r1:${dataset.id}`,
    commitment_state: 'GENERATED_NOT_GIT_COMMITTED_MODEL_NOT_FROZEN',
    selection_algorithm: operationalContract.holdout_commitment.selection_algorithm,
    dataset_id: dataset.id,
    dataset_case_set_sha256: datasetCaseSetSha256,
    sampling_plan_id: samplingPlan.id,
    sampling_plan_sha256: samplingPlanSha256,
    total_case_count: cases.length,
    blind_case_count: selected.length,
    per_stratum: perStratum,
    blind_cases: selected.sort((left, right) => left.stratum_id.localeCompare(right.stratum_id) || left.case_id.localeCompare(right.case_id)),
    holdout_partition_sha256: digest(selected.map((item) => ({ case_id: item.case_id, case_evidence_binding_sha256: item.case_evidence_binding_sha256 }))),
    labels_included: false,
    partition_commit_sha: null,
    model_freeze_sha: null,
    proof_partition_commit_precedes_model_freeze: false,
    production: 'HOLD'
  };
  return { ...commitment, commitment_sha256: digest(commitment) };
}

export function generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, options = {}) {
  validateOperationalContract(operationalContract, samplingPlan, packetContract);
  const cases = normalizeEvidenceCases(dataset, samplingPlan, operationalContract, options);
  const packetA = buildPacket('A', cases, dataset.id);
  const packetB = buildPacket('B', cases, dataset.id);
  const holdoutCommitment = buildHoldoutCommitment(cases, dataset, samplingPlan, operationalContract);
  const manifest = {
    schema_version: '1.0.0',
    preflight_id: `kidults-er-human-review-preflight-r1:${dataset.id}`,
    state: 'PACKETS_AND_HOLDOUT_COMMITMENT_READY_REVIEWERS_UNASSIGNED_LABELS_NOT_COLLECTED',
    dataset_id: dataset.id,
    dataset_case_set_sha256: holdoutCommitment.dataset_case_set_sha256,
    total_case_count: 840,
    blind_case_count: 420,
    required_review_record_count: 1680,
    packet_a_sha256: packetA.packet_sha256,
    packet_b_sha256: packetB.packet_sha256,
    holdout_commitment_sha256: holdoutCommitment.commitment_sha256,
    reviewer_a: 'NOT_ASSIGNED',
    reviewer_b: 'NOT_ASSIGNED',
    labels: 'NOT_COLLECTED',
    holdout_partition_committed: false,
    model_frozen: false,
    empirical_attestation: 'NOT_CREATED',
    track_b: 'NOT_STARTED',
    production: 'HOLD'
  };
  return { packetA, packetB, holdoutCommitment, manifest: { ...manifest, preflight_sha256: digest(manifest) } };
}

function assertPacket(packet, expectedSlot, operationalContract) {
  assertExactKeys(packet, PACKET_TOP_LEVEL_FIELDS, 'PACKET_TOP_LEVEL_FIELD_INVALID');
  if (packet.schema_version !== '1.0.0' || !packet.packet_id.startsWith(`kidults-er-independent-review-packet-${expectedSlot.toLowerCase()}-r1:`)) fail('PACKET_ID_OR_SCHEMA_INVALID', expectedSlot);
  if (packet.reviewer_slot !== expectedSlot || packet.reviewer_assignment_state !== 'NOT_ASSIGNED' || packet.packet_state !== 'UNASSIGNED_UNLABELED_BLINDED_TEMPLATE') fail('PACKET_FALSE_REVIEWER_OR_LABEL_STATE', expectedSlot);
  if (packet.case_count !== 840 || !Array.isArray(packet.cases) || packet.cases.length !== 840) fail('PACKET_EXACT_840_CASES_REQUIRED', expectedSlot);
  if (recordDigest(packet, 'packet_sha256') !== packet.packet_sha256) fail('PACKET_SHA256_MISMATCH', expectedSlot);
  const allowedCaseKeys = operationalContract.packet.case_fields;
  const prohibited = new Set(operationalContract.packet.prohibited_fields.map(normalizedKey));
  const caseIds = new Set();
  for (const item of packet.cases) {
    assertExactKeys(item, allowedCaseKeys, `PACKET_CASE_FIELD_INVALID:${item?.case_id || 'UNKNOWN'}`);
    const hit = findProhibitedKey(item, prohibited, `packet_${expectedSlot}.${item.case_id}`);
    if (hit) fail('PROHIBITED_FIELD_IN_REVIEWER_PACKET', hit);
    if (caseIds.has(item.case_id)) fail('DUPLICATE_CASE_ID_IN_PACKET', item.case_id);
    caseIds.add(item.case_id);
    if (digest(unsignedRecord(item, 'case_evidence_binding_sha256')) !== item.case_evidence_binding_sha256) fail('PACKET_CASE_BINDING_MISMATCH', item.case_id);
  }
  const sorted = [...packet.cases].sort((left, right) => left.stratum_id.localeCompare(right.stratum_id) || left.case_id.localeCompare(right.case_id));
  if (canonicalJson(sorted) !== canonicalJson(packet.cases)) fail('PACKET_CASE_ORDER_NOT_DETERMINISTIC', expectedSlot);
  const caseSet = packet.cases.map((item) => ({ case_id: item.case_id, case_evidence_binding_sha256: item.case_evidence_binding_sha256 }));
  if (digest(caseSet) !== packet.case_set_sha256) fail('PACKET_CASE_SET_SHA256_MISMATCH', expectedSlot);
}

export function verifyHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, actual, options = {}) {
  const expected = generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, options);
  assertPacket(actual.packetA, 'A', operationalContract);
  assertPacket(actual.packetB, 'B', operationalContract);
  if (canonicalJson(actual.packetA.cases) !== canonicalJson(actual.packetB.cases)) fail('A_B_PACKET_CASE_CONTENT_DIVERGES');
  for (const key of ['packetA', 'packetB', 'holdoutCommitment', 'manifest']) {
    if (canonicalJson(actual[key]) !== canonicalJson(expected[key])) fail('PREFLIGHT_ARTIFACT_NOT_DETERMINISTIC', key);
  }
  return { status: 'PASS_PREFLIGHT_ONLY', total_cases: 840, blind_cases: 420, reviewers: 'NOT_ASSIGNED', labels: 'NOT_COLLECTED', production: 'HOLD' };
}

export function verifyHoldoutCommitment(dataset, samplingPlan, packetContract, operationalContract, commitment, options = {}) {
  const expected = generateHumanReviewPreflight(dataset, samplingPlan, packetContract, operationalContract, options).holdoutCommitment;
  if (canonicalJson(commitment) !== canonicalJson(expected)) fail('HOLDOUT_COMMITMENT_RECOMPUTE_MISMATCH');
  if (commitment.blind_case_count !== 420 || commitment.blind_cases.length !== 420) fail('HOLDOUT_EXACT_420_REQUIRED');
  if (commitment.per_stratum.length !== 7 || commitment.per_stratum.some((item) => item.blind_case_count !== 60)) fail('HOLDOUT_EXACT_60_PER_STRATUM_REQUIRED');
  if (commitment.labels_included !== false || commitment.partition_commit_sha !== null || commitment.model_freeze_sha !== null || commitment.proof_partition_commit_precedes_model_freeze !== false) fail('HOLDOUT_GENERATOR_MUST_NOT_CLAIM_FREEZE_OR_LABELS');
  return { status: 'PASS_COMMITMENT_CONTENT_ONLY', holdout_count: 420, per_stratum: 60, model_freeze: 'NOT_CLAIMED' };
}

export function verifyGitFreezeOrder({ repoPath, commitmentPath, commitment, partitionCommitSha, modelFreezeSha }) {
  requiredString(repoPath, 'GIT_REPO_PATH_REQUIRED');
  requiredString(commitmentPath, 'COMMITMENT_REPO_PATH_REQUIRED');
  if (!/^[0-9a-f]{40}$/i.test(partitionCommitSha || '')) fail('PARTITION_COMMIT_SHA_INVALID');
  if (!/^[0-9a-f]{40}$/i.test(modelFreezeSha || '')) fail('MODEL_FREEZE_SHA_INVALID');
  if (partitionCommitSha === modelFreezeSha) fail('PARTITION_COMMIT_MUST_PRECEDE_NOT_EQUAL_MODEL_FREEZE');
  let committedText;
  try {
    committedText = execFileSync('git', ['-C', repoPath, 'show', `${partitionCommitSha}:${commitmentPath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail('COMMITMENT_NOT_PRESENT_AT_PARTITION_COMMIT');
  }
  let committed;
  try { committed = JSON.parse(committedText); } catch { fail('COMMITTED_COMMITMENT_JSON_INVALID'); }
  if (canonicalJson(committed) !== canonicalJson(commitment)) fail('COMMITTED_COMMITMENT_CONTENT_MISMATCH');
  try {
    execFileSync('git', ['-C', repoPath, 'merge-base', '--is-ancestor', partitionCommitSha, modelFreezeSha], { stdio: 'ignore' });
  } catch {
    fail('PARTITION_COMMIT_DOES_NOT_PRECEDE_MODEL_FREEZE');
  }
  return {
    status: 'PASS_PARTITION_COMMIT_PRECEDES_MODEL_FREEZE',
    holdout_partition_sha256: commitment.holdout_partition_sha256,
    partition_commit_sha: partitionCommitSha,
    model_freeze_sha: modelFreezeSha,
    proof_partition_commit_precedes_model_freeze: true
  };
}

function isPlaceholder(value) {
  if (typeof value !== 'string') return true;
  const normalized = value.trim();
  return normalized.length < 6 || PLACEHOLDER_RE.test(normalized) || PLACEHOLDER_FRAGMENT_RE.test(normalized);
}

function validateReviewerRegistry(registry, operationalContract, allowContractTestFixture) {
  assertPlainObject(registry, 'REVIEWER_REGISTRY_REQUIRED');
  const fixture = registry.fixture_classification === 'CONTRACT_TEST_FIXTURE_ONLY';
  if (fixture && !allowContractTestFixture) fail('CONTRACT_TEST_REVIEWER_FIXTURE_NOT_ALLOWED');
  assertExactKeys(registry, fixture ? ['fixture_classification', ...REVIEWER_REGISTRY_FIELDS] : REVIEWER_REGISTRY_FIELDS,
    'REVIEWER_REGISTRY_FIELD_INVALID');
  const requiredState = fixture ? 'CONTRACT_TEST_IDENTITY_SIMULATION_NOT_REVIEWER_EVIDENCE' : 'HUMAN_IDENTITIES_VERIFIED_AND_INDEPENDENCE_ATTESTED';
  if (registry.registry_state !== requiredState) fail('REVIEWER_REGISTRY_STATE_INVALID');
  if (!Array.isArray(registry.reviewers) || registry.reviewers.length !== 2) fail('EXACT_TWO_REVIEWERS_REQUIRED');
  const bySlot = new Map();
  const normalizedIds = new Set();
  for (const reviewer of registry.reviewers) {
    assertExactKeys(reviewer, REVIEWER_FIELDS, 'REVIEWER_FIELD_INVALID');
    if (!['A', 'B'].includes(reviewer.slot) || bySlot.has(reviewer.slot)) fail('REVIEWER_SLOT_DUPLICATE_OR_INVALID');
    const reviewerId = requiredString(reviewer.reviewer_id, 'REVIEWER_ID_REQUIRED');
    if (isPlaceholder(reviewerId)) fail('PLACEHOLDER_REVIEWER_REJECTED', reviewerId);
    const normalizedId = reviewerId.toLowerCase().replace(/\s+/g, '');
    if (normalizedIds.has(normalizedId)) fail('DUPLICATE_REVIEWER_REJECTED', reviewerId);
    normalizedIds.add(normalizedId);
    if (!operationalContract.human_completion.allowed_reviewer_identity_sources.includes(reviewer.identity_source_type)) fail('REVIEWER_IDENTITY_SOURCE_INVALID', reviewerId);
    if (isPlaceholder(reviewer.identity_verification_ref)) fail('REVIEWER_IDENTITY_VERIFICATION_REF_REQUIRED', reviewerId);
    requireSha(reviewer.identity_attestation_sha256, `REVIEWER_IDENTITY_ATTESTATION_REQUIRED:${reviewerId}`);
    requireSha(reviewer.independence_attestation_sha256, `REVIEWER_INDEPENDENCE_ATTESTATION_REQUIRED:${reviewerId}`);
    requireIsoTimestamp(reviewer.attested_at, `REVIEWER_ATTESTED_AT_REQUIRED:${reviewerId}`);
    if (reviewer.resolver_author !== false || reviewer.model_operator !== false || reviewer.other_reviewer_labels_seen !== false) fail('REVIEWER_INDEPENDENCE_ATTESTATION_FALSE', reviewerId);
    bySlot.set(reviewer.slot, reviewer);
  }
  if (!bySlot.has('A') || !bySlot.has('B')) fail('REVIEWER_A_B_REQUIRED');
  return { bySlot, fixture };
}

export function createReviewRecord(fields) {
  const record = {
    case_id: fields.case_id,
    reviewer_id: fields.reviewer_id,
    packet_sha256: fields.packet_sha256,
    case_evidence_binding_sha256: fields.case_evidence_binding_sha256,
    reviewer_independence_attestation: fields.reviewer_independence_attestation,
    label: fields.label,
    label_reason_code: fields.label_reason_code,
    evidence_refs_reviewed: [...fields.evidence_refs_reviewed].sort(),
    reviewed_at: fields.reviewed_at
  };
  return { ...record, review_record_sha256: digest(record) };
}

export function createAdjudicationRecord(fields) {
  const record = {
    case_id: fields.case_id,
    reviewer_a_label: fields.reviewer_a_label,
    reviewer_b_label: fields.reviewer_b_label,
    adjudicator_id: fields.adjudicator_id,
    adjudicator_identity_verification_ref: fields.adjudicator_identity_verification_ref,
    final_label: fields.final_label,
    reason: fields.reason,
    evidence_refs: [...fields.evidence_refs].sort(),
    adjudicated_at: fields.adjudicated_at
  };
  return { ...record, record_sha256: digest(record) };
}

function validateReviewRecords(reviewFile, packets, reviewersBySlot, operationalContract) {
  assertPlainObject(reviewFile, 'REVIEW_RECORD_FILE_REQUIRED');
  const fixture = reviewFile.fixture_classification === 'CONTRACT_TEST_FIXTURE_ONLY';
  assertExactKeys(reviewFile, fixture ? ['fixture_classification', ...REVIEW_FILE_FIELDS] : REVIEW_FILE_FIELDS,
    'REVIEW_RECORD_FILE_FIELD_INVALID');
  if (reviewFile.review_state !== 'HUMAN_REVIEWS_COLLECTED_NOT_EMPIRICALLY_ATTESTED') fail('REVIEW_RECORD_STATE_INVALID');
  if (!Array.isArray(reviewFile.records) || reviewFile.records.length !== operationalContract.human_completion.required_review_records) fail('EXACT_1680_REVIEW_RECORDS_REQUIRED');
  const packetByReviewer = new Map([
    [reviewersBySlot.get('A').reviewer_id, packets.packetA],
    [reviewersBySlot.get('B').reviewer_id, packets.packetB]
  ]);
  const reviewerById = new Map([...reviewersBySlot.values()].map((reviewer) => [reviewer.reviewer_id, reviewer]));
  const caseById = new Map(packets.packetA.cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  const byCase = new Map();
  const reviewerCounts = new Map([...packetByReviewer.keys()].map((id) => [id, 0]));
  for (const record of reviewFile.records) {
    assertExactKeys(record, REVIEW_RECORD_FIELDS, 'REVIEW_RECORD_FIELD_INVALID');
    const prohibited = findProhibitedKey(record, REVIEW_RECORD_PROHIBITED_KEYS, `review.${record.case_id || 'UNKNOWN'}`);
    if (prohibited) fail('MODEL_OR_OTHER_REVIEWER_DATA_IN_REVIEW_RECORD', prohibited);
    const packet = packetByReviewer.get(record.reviewer_id);
    if (!packet) fail('REVIEW_RECORD_UNKNOWN_REVIEWER', String(record.reviewer_id));
    const item = caseById.get(record.case_id);
    if (!item) fail('REVIEW_RECORD_UNKNOWN_CASE', String(record.case_id));
    const pairKey = `${record.case_id}\u0000${record.reviewer_id}`;
    if (seen.has(pairKey)) fail('DUPLICATE_REVIEW_RECORD', pairKey);
    seen.add(pairKey);
    if (record.packet_sha256 !== packet.packet_sha256) fail('REVIEW_PACKET_BINDING_MISMATCH', pairKey);
    if (record.case_evidence_binding_sha256 !== item.case_evidence_binding_sha256) fail('REVIEW_CASE_BINDING_MISMATCH', pairKey);
    if (record.reviewer_independence_attestation !== true) fail('REVIEW_INDEPENDENCE_ATTESTATION_REQUIRED', pairKey);
    if (!HUMAN_LABELS.includes(record.label)) fail('REVIEW_LABEL_INVALID', pairKey);
    requiredString(record.label_reason_code, `REVIEW_REASON_REQUIRED:${pairKey}`);
    requireIsoTimestamp(record.reviewed_at, `REVIEWED_AT_REQUIRED:${pairKey}`);
    if (Date.parse(record.reviewed_at) < Date.parse(reviewerById.get(record.reviewer_id).attested_at)) fail('REVIEW_PRECEDES_REVIEWER_ATTESTATION', pairKey);
    const expectedEvidenceRefs = [item.source_a_reference, item.source_b_reference].sort();
    if (canonicalJson(record.evidence_refs_reviewed) !== canonicalJson(expectedEvidenceRefs)) fail('REVIEW_EVIDENCE_REFS_INCOMPLETE', pairKey);
    if (recordDigest(record, 'review_record_sha256') !== record.review_record_sha256) fail('REVIEW_RECORD_SHA256_MISMATCH', pairKey);
    reviewerCounts.set(record.reviewer_id, reviewerCounts.get(record.reviewer_id) + 1);
    const entries = byCase.get(record.case_id) || [];
    entries.push(record);
    byCase.set(record.case_id, entries);
  }
  for (const [reviewerId, count] of reviewerCounts) if (count !== 840) fail('REVIEWER_EXACT_840_RECORDS_REQUIRED', `${reviewerId}:${count}`);
  for (const caseId of caseById.keys()) if ((byCase.get(caseId) || []).length !== 2) fail('CASE_EXACT_TWO_REVIEWS_REQUIRED', caseId);
  return byCase;
}

function validateAdjudications(adjudicationFile, reviewsByCase, packets, reviewersBySlot) {
  assertPlainObject(adjudicationFile, 'ADJUDICATION_FILE_REQUIRED');
  const fixture = adjudicationFile.fixture_classification === 'CONTRACT_TEST_FIXTURE_ONLY';
  assertExactKeys(adjudicationFile, fixture ? ['fixture_classification', ...ADJUDICATION_FILE_FIELDS] : ADJUDICATION_FILE_FIELDS,
    'ADJUDICATION_FILE_FIELD_INVALID');
  if (adjudicationFile.adjudication_state !== 'HUMAN_ADJUDICATIONS_COLLECTED_NOT_EMPIRICALLY_ATTESTED') fail('ADJUDICATION_STATE_INVALID');
  if (!Array.isArray(adjudicationFile.records)) fail('ADJUDICATION_RECORDS_REQUIRED');
  const caseById = new Map(packets.packetA.cases.map((item) => [item.case_id, item]));
  const reviewerAId = reviewersBySlot.get('A').reviewer_id;
  const reviewerBId = reviewersBySlot.get('B').reviewer_id;
  const requiredCases = new Set();
  for (const [caseId, records] of reviewsByCase) {
    const byReviewer = new Map(records.map((record) => [record.reviewer_id, record]));
    const a = byReviewer.get(reviewerAId);
    const b = byReviewer.get(reviewerBId);
    if (!a || !b) fail('A_B_REVIEW_PAIR_REQUIRED', caseId);
    if (a.label !== b.label || a.label === 'REVIEW_REQUIRED' || b.label === 'REVIEW_REQUIRED') requiredCases.add(caseId);
  }
  if (adjudicationFile.records.length !== requiredCases.size) fail('ADJUDICATION_EXACT_TRIGGER_COUNT_REQUIRED', `${adjudicationFile.records.length}!=${requiredCases.size}`);
  const byCase = new Map();
  for (const record of adjudicationFile.records) {
    assertExactKeys(record, ADJUDICATION_RECORD_FIELDS, 'ADJUDICATION_RECORD_FIELD_INVALID');
    if (!requiredCases.has(record.case_id)) fail('UNTRIGGERED_ADJUDICATION_PROHIBITED', String(record.case_id));
    if (byCase.has(record.case_id)) fail('DUPLICATE_ADJUDICATION', record.case_id);
    const item = caseById.get(record.case_id);
    const reviews = reviewsByCase.get(record.case_id);
    const byReviewer = new Map(reviews.map((review) => [review.reviewer_id, review]));
    if (record.reviewer_a_label !== byReviewer.get(reviewerAId).label || record.reviewer_b_label !== byReviewer.get(reviewerBId).label) fail('ADJUDICATION_REVIEW_LABEL_BINDING_MISMATCH', record.case_id);
    if (isPlaceholder(record.adjudicator_id)) fail('PLACEHOLDER_ADJUDICATOR_REJECTED', String(record.adjudicator_id));
    const normalizedAdjudicator = record.adjudicator_id.toLowerCase().replace(/\s+/g, '');
    if ([reviewerAId, reviewerBId].map((id) => id.toLowerCase().replace(/\s+/g, '')).includes(normalizedAdjudicator)) fail('ADJUDICATOR_MUST_DIFFER_FROM_REVIEWERS', record.case_id);
    if (isPlaceholder(record.adjudicator_identity_verification_ref)) fail('ADJUDICATOR_IDENTITY_VERIFICATION_REQUIRED', record.case_id);
    if (!HUMAN_LABELS.includes(record.final_label)) fail('ADJUDICATION_FINAL_LABEL_INVALID', record.case_id);
    requiredString(record.reason, `ADJUDICATION_REASON_REQUIRED:${record.case_id}`);
    requireIsoTimestamp(record.adjudicated_at, `ADJUDICATED_AT_REQUIRED:${record.case_id}`);
    const latestReviewTimestamp = Math.max(...reviews.map((review) => Date.parse(review.reviewed_at)));
    if (Date.parse(record.adjudicated_at) < latestReviewTimestamp) fail('ADJUDICATION_PRECEDES_REQUIRED_REVIEWS', record.case_id);
    const expectedRefs = [item.source_a_reference, item.source_b_reference].sort();
    if (canonicalJson(record.evidence_refs) !== canonicalJson(expectedRefs)) fail('ADJUDICATION_EVIDENCE_REFS_INCOMPLETE', record.case_id);
    if (recordDigest(record, 'record_sha256') !== record.record_sha256) fail('ADJUDICATION_RECORD_SHA256_MISMATCH', record.case_id);
    byCase.set(record.case_id, record);
  }
  for (const caseId of requiredCases) if (!byCase.has(caseId)) fail('MISSING_REQUIRED_ADJUDICATION', caseId);
  return byCase;
}

function validateCompletionHoldoutCommitment(commitment, packetA) {
  if (recordDigest(commitment, 'commitment_sha256') !== commitment.commitment_sha256) fail('HOLDOUT_COMMITMENT_SHA256_MISMATCH');
  if (commitment.blind_case_count !== 420 || commitment.blind_cases?.length !== 420 || commitment.labels_included !== false) fail('VALID_HOLDOUT_COMMITMENT_REQUIRED');
  if (commitment.partition_commit_sha !== null || commitment.model_freeze_sha !== null || commitment.proof_partition_commit_precedes_model_freeze !== false) fail('COMPLETION_INPUT_MUST_USE_UNALTERED_PREMODEL_COMMITMENT');
  const packetCases = new Map(packetA.cases.map((item) => [item.case_id, item]));
  const observed = new Set();
  const counts = {};
  for (const item of commitment.blind_cases) {
    if (observed.has(item.case_id)) fail('DUPLICATE_HOLDOUT_CASE_ID', item.case_id);
    observed.add(item.case_id);
    const packetCase = packetCases.get(item.case_id);
    if (!packetCase || packetCase.case_evidence_binding_sha256 !== item.case_evidence_binding_sha256 || packetCase.stratum_id !== item.stratum_id) fail('HOLDOUT_CASE_NOT_BOUND_TO_PACKET', item.case_id);
    counts[item.stratum_id] = (counts[item.stratum_id] || 0) + 1;
  }
  if (Object.keys(counts).length !== 7 || Object.values(counts).some((count) => count !== 60)) fail('HOLDOUT_60_PER_STRATUM_REQUIRED');
  const partitionMaterial = commitment.blind_cases.map((item) => ({ case_id: item.case_id, case_evidence_binding_sha256: item.case_evidence_binding_sha256 }));
  if (digest(partitionMaterial) !== commitment.holdout_partition_sha256) fail('HOLDOUT_PARTITION_SHA256_MISMATCH');
}

export function validateHumanReviewCompletion({ packetA, packetB, holdoutCommitment, reviewerRegistry, reviewFile, adjudicationFile, operationalContract, allowContractTestFixture = false }) {
  if (operationalContract.human_completion?.required_review_records !== 1680 || canonicalJson(operationalContract.human_completion?.benchmark_label_mapping) !== canonicalJson(BENCHMARK_LABEL_MAPPING)) fail('HUMAN_COMPLETION_CONTRACT_INVALID');
  assertPacket(packetA, 'A', operationalContract);
  assertPacket(packetB, 'B', operationalContract);
  if (canonicalJson(packetA.cases) !== canonicalJson(packetB.cases)) fail('A_B_PACKET_CASE_CONTENT_DIVERGES');
  validateCompletionHoldoutCommitment(holdoutCommitment, packetA);
  const reviewerValidation = validateReviewerRegistry(reviewerRegistry, operationalContract, allowContractTestFixture);
  const reviewersBySlot = reviewerValidation.bySlot;
  if (reviewerValidation.fixture) {
    if (reviewFile.fixture_classification !== 'CONTRACT_TEST_FIXTURE_ONLY' || adjudicationFile.fixture_classification !== 'CONTRACT_TEST_FIXTURE_ONLY') fail('CONTRACT_TEST_COMPLETION_FIXTURE_CLASSIFICATION_REQUIRED');
  } else if (reviewFile.fixture_classification !== undefined || adjudicationFile.fixture_classification !== undefined) {
    fail('MIXED_REAL_AND_CONTRACT_TEST_REVIEW_EVIDENCE_PROHIBITED');
  }
  const reviewsByCase = validateReviewRecords(reviewFile, { packetA, packetB }, reviewersBySlot, operationalContract);
  const adjudicationsByCase = validateAdjudications(adjudicationFile, reviewsByCase, { packetA, packetB }, reviewersBySlot);
  const reviewerAId = reviewersBySlot.get('A').reviewer_id;
  const reviewerBId = reviewersBySlot.get('B').reviewer_id;
  const holdoutIds = new Set(holdoutCommitment.blind_cases.map((item) => item.case_id));
  const benchmarkLabels = [];
  const reviewRequiredMappings = [];
  for (const item of packetA.cases) {
    const byReviewer = new Map(reviewsByCase.get(item.case_id).map((record) => [record.reviewer_id, record]));
    const adjudication = adjudicationsByCase.get(item.case_id);
    const humanFinalLabel = adjudication ? adjudication.final_label : byReviewer.get(reviewerAId).label;
    if (!adjudication && byReviewer.get(reviewerAId).label !== byReviewer.get(reviewerBId).label) fail('DISAGREEMENT_WITHOUT_ADJUDICATION', item.case_id);
    const benchmarkLabel = BENCHMARK_LABEL_MAPPING[humanFinalLabel];
    const labelSource = adjudication ? 'ADJUDICATION' : 'REVIEWER_CONSENSUS';
    benchmarkLabels.push({
      case_id: item.case_id,
      case_evidence_binding_sha256: item.case_evidence_binding_sha256,
      blind_holdout: holdoutIds.has(item.case_id),
      human_final_label: humanFinalLabel,
      benchmark_label: benchmarkLabel,
      label_source: labelSource
    });
    if (humanFinalLabel === 'REVIEW_REQUIRED') {
      reviewRequiredMappings.push({
        case_id: item.case_id,
        case_evidence_binding_sha256: item.case_evidence_binding_sha256,
        source_label: 'REVIEW_REQUIRED',
        benchmark_label: 'REVIEW',
        mapping_rule: 'EXPLICIT_HUMAN_ESCALATION_TO_BENCHMARK_REVIEW',
        label_source: labelSource
      });
    }
  }
  const audit = {
    schema_version: '1.0.0',
    audit_state: reviewerValidation.fixture ? 'CONTRACT_TEST_COMPLETENESS_VALIDATED_NOT_REVIEWER_EVIDENCE' : 'HUMAN_REVIEW_STRUCTURE_VALIDATED_IDENTITY_ATTESTATION_EXTERNALLY_GOVERNED_EMPIRICAL_ATTESTATION_NOT_CREATED',
    fixture_classification: reviewerValidation.fixture ? 'CONTRACT_TEST_FIXTURE_ONLY' : null,
    packet_a_sha256: packetA.packet_sha256,
    packet_b_sha256: packetB.packet_sha256,
    holdout_partition_sha256: holdoutCommitment.holdout_partition_sha256,
    reviewer_count: 2,
    review_record_count: reviewFile.records.length,
    adjudication_record_count: adjudicationFile.records.length,
    benchmark_label_count: benchmarkLabels.length,
    label_mapping_policy: { ...BENCHMARK_LABEL_MAPPING },
    review_required_mapping_count: reviewRequiredMappings.length,
    review_required_mapping_audit_sha256: digest(reviewRequiredMappings),
    review_required_mappings: reviewRequiredMappings,
    benchmark_labels_sha256: digest(benchmarkLabels),
    benchmark_labels: benchmarkLabels,
    identity_verification_boundary: 'REGISTRY_ASSERTION_STRUCTURALLY_VALIDATED_EXTERNAL_IDENTITY_PROOF_NOT_CRYPTOGRAPHICALLY_VERIFIED',
    use_boundary: 'EVALUATION_AND_ATTESTATION_INPUT_ONLY_PROHIBITED_FROM_MODEL_TUNING',
    empirical_attestation: 'NOT_CREATED',
    track_b: 'NOT_STARTED',
    production: 'HOLD'
  };
  return { ...audit, audit_sha256: digest(audit) };
}
