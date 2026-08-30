import crypto from 'node:crypto';
import fs from 'node:fs';

export const CONTROL_CONTRACT_PATH = 'coordination/kidults/e2e/state-department-camera-lawful-control-chain-v1.json';
export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

export const ensure = (condition, code) => {
  if (!condition) throw new Error(code);
};

export const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;

export const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
export const hashValue = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
export const hashText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
export const same = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
export const strictTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && /Z$/.test(value);

export const exactKeys = (value, expected, code) => {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${code}_NOT_OBJECT`);
  ensure(same(Object.keys(value).sort(), [...expected].sort()), `${code}_FIELD_SET_INVALID`);
};

export const expectedIds = (contract, pairDigest = null) => {
  const sourceDigest = contract.authoritative_source.source_projection_sha256.slice(7);
  const result = {
    snapshotId: `control-snapshot-state-department-camera-${sourceDigest}`,
    evidencePackageId: `control-evidence-package-state-department-camera-${sourceDigest}`,
    evidenceId: `control-evidence-state-department-camera-${sourceDigest}`,
  };
  if (pairDigest) {
    const pairSuffix = pairDigest.slice(7);
    result.assessmentId = `control-track-b-contract-mock-${pairSuffix}`;
    result.controlRecordId = `control-no-projection-${pairSuffix}`;
  }
  return result;
};

export const candidatePayloadSha256 = (candidate) => hashValue(omit(candidate, ['candidate_payload_sha256', 'pair_digest']));
export const evidencePayloadSha256 = (evidence) => hashValue(omit(evidence, ['evidence_package_payload_sha256', 'pair_digest']));
export const pairDigestFor = (candidate, evidence) => hashValue({
  candidate_payload_sha256: candidatePayloadSha256(candidate),
  evidence_package_payload_sha256: evidencePayloadSha256(evidence),
});
export const assessmentPayloadSha256 = (assessment) => hashValue(omit(assessment, ['assessment_payload_sha256']));
export const controlPayloadSha256 = (projection) => hashValue(omit(projection, ['control_payload_sha256']));

const protectedFalseFields = [
  'canonical_handoff_eligible',
  'official_track_b_started',
  'promotable',
  'real_product_value_proof',
  'approved_projection',
];

const verifyProtectedHolds = (record, code) => {
  for (const field of protectedFalseFields) ensure(record[field] === false, `${code}_${field.toUpperCase()}_MUST_BE_FALSE`);
  ensure(record.public_release === 'HOLD' && record.production === 'HOLD' && record.g5 === 'HOLD', `${code}_PROTECTED_GATES_INVALID`);
};

export function validateControlContract(contract) {
  ensure(contract.id === 'kidults-state-department-camera-lawful-control-chain-v1', 'CONTROL_CONTRACT_ID_INVALID');
  ensure(contract.version === '1.0.0' && contract.status === 'ACTIVE_NON_PROMOTABLE_CONTROL_ONLY', 'CONTROL_CONTRACT_VERSION_OR_STATUS_INVALID');
  ensure(same(contract.platform_principles, ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']), 'CONTROL_CONTRACT_PRINCIPLES_INVALID');
  ensure(contract.authoritative_source.source_projection_sha256 === 'sha256:dcd433fa8d320a0e3e6a22c3425e72b70988815dfb5c69514517588e009f37b5', 'CONTROL_CONTRACT_SOURCE_DIGEST_INVALID');
  ensure(contract.authoritative_source.claim_ceiling_sha256 === 'sha256:038995eff8186d1c9090fcdaab935d16644f058285dd814d55dcf4646e02ca7c', 'CONTROL_CONTRACT_CLAIM_CEILING_DIGEST_INVALID');
  ensure(contract.authoritative_source.required_evidence_class === 'AUCTION_RESULT_REFERENCE' && contract.authoritative_source.required_price_type === 'BID', 'CONTROL_CONTRACT_EVIDENCE_CEILING_INVALID');
  ensure(same(contract.authoritative_source.required_rights, {
    collect: 'ALLOW',
    store: 'ALLOW',
    transform: 'ALLOW',
    display: 'UNKNOWN',
    redistribute: 'UNKNOWN',
    sell: 'UNKNOWN',
  }), 'CONTROL_CONTRACT_RIGHTS_INVALID');
  ensure(contract.track_a_control_pair.canonical_handoff_eligible === false, 'CONTROL_CONTRACT_CANONICAL_HANDOFF_OPEN');
  ensure(contract.track_b_contract_mock.official_track_b_started === false && contract.track_b_contract_mock.rankability_assessment_filename_forbidden === true, 'CONTROL_CONTRACT_TRACK_B_BOUNDARY_INVALID');
  ensure(contract.track_b_contract_mock.rankable === false && contract.track_b_contract_mock.promotable === false, 'CONTROL_CONTRACT_MOCK_PROMOTION_INVALID');
  ensure(contract.projection_control.projection_state === 'NO_PROJECTION' && contract.projection_control.source_facts_discarded === true && contract.projection_control.approved_projection === false, 'CONTROL_CONTRACT_PROJECTION_BOUNDARY_INVALID');
  for (const value of Object.values(contract.canonical_truth_preservation)) ensure(value === false, 'CONTROL_CONTRACT_CANONICAL_TRUTH_MUTATION_ENABLED');
  const truth = contract.truth_boundary;
  ensure(truth.canonical_candidate_created === false && truth.canonical_evidence_package_created === false && truth.canonical_handoff_eligible === false, 'CONTROL_CONTRACT_CANONICAL_PAIR_FALSE_PROMOTION');
  ensure(truth.official_track_b_started === false && truth.rankability_assessment_created === false && truth.real_product_value_proof === false && truth.approved_projection === false, 'CONTROL_CONTRACT_DOWNSTREAM_FALSE_PROMOTION');
  ensure(truth.live_approved_projection === 'NONE' && truth.public_release === 'HOLD' && truth.production === 'HOLD' && truth.g5 === 'HOLD', 'CONTROL_CONTRACT_RELEASE_BOUNDARY_INVALID');
  ensure(contract.required_negative_mutations.length === 12, 'CONTROL_CONTRACT_NEGATIVE_MUTATION_COUNT_INVALID');
  ensure(contract.validation.canonical_upstream_workflow_name === 'KIDULTS ASI State Department Camera Evidence v1', 'CONTROL_CONTRACT_UPSTREAM_WORKFLOW_NAME_INVALID');
  ensure(contract.validation.canonical_upstream_workflow_path === '.github/workflows/kidults-asi-state-department-camera-evidence-v1.yml', 'CONTROL_CONTRACT_UPSTREAM_WORKFLOW_PATH_INVALID');
  ensure(contract.validation.canonical_upstream_artifact_name === 'kidults-asi-state-department-camera-evidence-v1' && contract.validation.canonical_upstream_artifact_count === 1, 'CONTROL_CONTRACT_UPSTREAM_ARTIFACT_IDENTITY_INVALID');
  ensure(contract.validation.canonical_upstream_artifact_must_be_nonexpired === true && contract.validation.canonical_upstream_artifact_digest_reverification === 'GITHUB_ACTIONS_API_ARCHIVE_SHA256_EXACT_MATCH_PLUS_ACTION_DOWNLOAD_V4', 'CONTROL_CONTRACT_UPSTREAM_ARTIFACT_VERIFICATION_INVALID');
  ensure(Array.isArray(contract.required_upstream_lineage_negative_mutations) && contract.required_upstream_lineage_negative_mutations.length === 4, 'CONTROL_CONTRACT_UPSTREAM_NEGATIVE_MUTATION_COUNT_INVALID');
  return true;
}

export function validateUpstreamLineage(lineage, contract, { expectedSourceSha = null, requireCanonical = false } = {}) {
  validateControlContract(contract);
  exactKeys(lineage, [
    'id', 'version', 'state', 'mode', 'source_sha', 'upstream_workflow', 'upstream_artifact',
    'predecessor_receipts', 'source_facts_included', 'raw_source_payload_included',
    'canonical_candidate_created', 'official_track_b_started', 'real_product_value_proof',
    'approved_projection', 'public_release', 'production', 'g5',
  ], 'CONTROL_UPSTREAM_LINEAGE');
  ensure(lineage.id === 'kidults-state-department-camera-upstream-lineage-v1' && lineage.version === '1.0.0', 'CONTROL_UPSTREAM_LINEAGE_IDENTITY_INVALID');
  ensure(COMMIT_SHA_PATTERN.test(lineage.source_sha), 'CONTROL_UPSTREAM_LINEAGE_SOURCE_SHA_INVALID');
  if (expectedSourceSha) ensure(lineage.source_sha === expectedSourceSha, 'CONTROL_UPSTREAM_LINEAGE_SOURCE_SHA_REBINDING');
  exactKeys(lineage.upstream_workflow, ['name', 'path', 'run_id', 'head_sha', 'status', 'conclusion', 'head_branch'], 'CONTROL_UPSTREAM_WORKFLOW');
  exactKeys(lineage.upstream_artifact, [
    'name', 'artifact_id', 'artifact_count', 'archive_digest', 'expired', 'archive_digest_reverified',
    'digest_reverification', 'download_action_pin', 'extracted_content_tree_sha256',
  ], 'CONTROL_UPSTREAM_ARTIFACT');
  exactKeys(lineage.predecessor_receipts, [
    'evidence_manifest_path', 'evidence_manifest_sha256', 'evidence_validation_path',
    'evidence_validation_sha256', 'source_projection_sha256',
  ], 'CONTROL_UPSTREAM_PREDECESSOR_RECEIPTS');
  ensure(lineage.source_facts_included === false && lineage.raw_source_payload_included === false, 'CONTROL_UPSTREAM_LINEAGE_SOURCE_PAYLOAD_LEAKAGE');
  ensure(lineage.canonical_candidate_created === false && lineage.official_track_b_started === false && lineage.real_product_value_proof === false && lineage.approved_projection === false, 'CONTROL_UPSTREAM_LINEAGE_FALSE_PROMOTION');
  ensure(lineage.public_release === 'HOLD' && lineage.production === 'HOLD' && lineage.g5 === 'HOLD', 'CONTROL_UPSTREAM_LINEAGE_PROTECTED_GATES_INVALID');

  const canonical = lineage.mode === 'CANONICAL_WORKFLOW_RUN' || lineage.mode === 'MANUAL_RECOVERY';
  if (requireCanonical) ensure(canonical, 'CONTROL_UPSTREAM_CANONICAL_LINEAGE_REQUIRED');
  if (canonical) {
    ensure(lineage.state === 'VERIFIED_CANONICAL_UPSTREAM_ARTIFACT', 'CONTROL_UPSTREAM_LINEAGE_CANONICAL_STATE_INVALID');
    ensure(lineage.upstream_workflow.name === contract.validation.canonical_upstream_workflow_name && lineage.upstream_workflow.path === contract.validation.canonical_upstream_workflow_path, 'CONTROL_UPSTREAM_RUN_PATH_OR_NAME_REBINDING');
    ensure(Number.isInteger(lineage.upstream_workflow.run_id) && lineage.upstream_workflow.run_id > 0, 'CONTROL_UPSTREAM_RUN_ID_INVALID');
    ensure(lineage.upstream_workflow.head_sha === lineage.source_sha, 'CONTROL_UPSTREAM_RUN_HEAD_SHA_REBINDING');
    ensure(lineage.upstream_workflow.status === 'completed' && lineage.upstream_workflow.conclusion === 'success' && lineage.upstream_workflow.head_branch === 'main', 'CONTROL_UPSTREAM_RUN_NOT_SUCCESSFULLY_COMPLETED');
    ensure(lineage.upstream_artifact.name === contract.validation.canonical_upstream_artifact_name && lineage.upstream_artifact.artifact_count === 1, 'CONTROL_UPSTREAM_ARTIFACT_COUNT_OR_NAME_INVALID');
    ensure(Number.isInteger(lineage.upstream_artifact.artifact_id) && lineage.upstream_artifact.artifact_id > 0 && lineage.upstream_artifact.expired === false, 'CONTROL_UPSTREAM_ARTIFACT_ID_OR_EXPIRY_INVALID');
    ensure(SHA256_PATTERN.test(lineage.upstream_artifact.archive_digest) && SHA256_PATTERN.test(lineage.upstream_artifact.extracted_content_tree_sha256), 'CONTROL_UPSTREAM_ARTIFACT_DIGEST_INVALID');
    ensure(lineage.upstream_artifact.archive_digest_reverified === true && lineage.upstream_artifact.digest_reverification === contract.validation.canonical_upstream_artifact_digest_reverification, 'CONTROL_UPSTREAM_ARTIFACT_DIGEST_NOT_REVERIFIED');
    ensure(lineage.upstream_artifact.download_action_pin === 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093', 'CONTROL_UPSTREAM_DOWNLOAD_ACTION_PIN_INVALID');
    ensure(lineage.predecessor_receipts.evidence_manifest_path === 'kidults-state-department-camera-evidence-run-1/state-department-camera-evidence-manifest-v1.json', 'CONTROL_UPSTREAM_EVIDENCE_MANIFEST_PATH_INVALID');
    ensure(lineage.predecessor_receipts.evidence_validation_path === 'state-department-camera-evidence-final-validation-v1.json', 'CONTROL_UPSTREAM_EVIDENCE_VALIDATION_PATH_INVALID');
    ensure(SHA256_PATTERN.test(lineage.predecessor_receipts.evidence_manifest_sha256) && SHA256_PATTERN.test(lineage.predecessor_receipts.evidence_validation_sha256), 'CONTROL_UPSTREAM_PREDECESSOR_DIGEST_INVALID');
    ensure(lineage.predecessor_receipts.source_projection_sha256 === contract.authoritative_source.source_projection_sha256, 'CONTROL_UPSTREAM_SOURCE_PROJECTION_DIGEST_REBINDING');
  } else {
    ensure(lineage.state === 'VALIDATION_ONLY_NO_CANONICAL_UPSTREAM_ARTIFACT' && lineage.mode === 'PR_OR_LOCAL_VALIDATION_ONLY', 'CONTROL_UPSTREAM_LINEAGE_VALIDATION_ONLY_STATE_INVALID');
    for (const value of Object.values(lineage.upstream_workflow)) ensure(value === null, 'CONTROL_UPSTREAM_LINEAGE_VALIDATION_ONLY_RUN_PRESENT');
    ensure(lineage.upstream_artifact.name === null && lineage.upstream_artifact.artifact_id === null && lineage.upstream_artifact.artifact_count === 0 && lineage.upstream_artifact.archive_digest === null && lineage.upstream_artifact.expired === null, 'CONTROL_UPSTREAM_LINEAGE_VALIDATION_ONLY_ARTIFACT_PRESENT');
    ensure(lineage.upstream_artifact.archive_digest_reverified === false && lineage.upstream_artifact.digest_reverification === null && lineage.upstream_artifact.download_action_pin === null && lineage.upstream_artifact.extracted_content_tree_sha256 === null, 'CONTROL_UPSTREAM_LINEAGE_VALIDATION_ONLY_VERIFICATION_CLAIMED');
    for (const value of Object.values(lineage.predecessor_receipts)) ensure(value === null, 'CONTROL_UPSTREAM_LINEAGE_VALIDATION_ONLY_PREDECESSOR_PRESENT');
  }
  return { canonical, mode: lineage.mode, sourceSha: lineage.source_sha };
}

export function validateControlPair(candidate, evidence, contract) {
  validateControlContract(contract);
  exactKeys(candidate, [
    'record_type', 'schema_version', 'fixture_type', 'candidate_class', 'snapshot_id', 'snapshot_status', 'as_of',
    'source_observation', 'bound_evidence_package_id', 'evidence_state', 'canonical_handoff_eligible',
    'official_track_b_started', 'promotable', 'real_product_value_proof', 'approved_projection',
    'publication_authorized', 'production_authorized', 'public_release', 'production', 'g5', 'known_limitations',
    'candidate_payload_sha256', 'pair_digest',
  ], 'CONTROL_CANDIDATE');
  exactKeys(evidence, [
    'record_type', 'schema_version', 'fixture_type', 'evidence_package_id', 'package_status', 'as_of',
    'bound_snapshot_id', 'source_observation', 'rights', 'evidence_records', 'canonical_handoff_eligible',
    'official_track_b_started', 'promotable', 'real_product_value_proof', 'approved_projection',
    'publication_authorized', 'production_authorized', 'public_release', 'production', 'g5',
    'evidence_package_payload_sha256', 'pair_digest',
  ], 'CONTROL_EVIDENCE');
  ensure(candidate.record_type === contract.track_a_control_pair.candidate_record_type && evidence.record_type === contract.track_a_control_pair.evidence_record_type, 'CONTROL_PAIR_RECORD_TYPE_INVALID');
  ensure(candidate.schema_version === '1.0.0' && evidence.schema_version === '1.0.0', 'CONTROL_PAIR_SCHEMA_VERSION_INVALID');
  ensure(candidate.fixture_type === contract.track_a_control_pair.fixture_type && evidence.fixture_type === contract.track_a_control_pair.fixture_type, 'CONTROL_PAIR_FIXTURE_TYPE_INVALID');
  ensure(candidate.candidate_class === 'CONTROL_ONLY_NOT_CANONICAL_CANDIDATE' && candidate.snapshot_status === 'CONTROL_ONLY', 'CONTROL_CANDIDATE_CLASS_INVALID');
  ensure(evidence.package_status === 'CONTROL_CONTENT_ADDRESSED_NOT_CANONICAL_IMMUTABLE', 'CONTROL_EVIDENCE_PACKAGE_STATUS_INVALID');
  ensure(strictTimestamp(candidate.as_of) && candidate.as_of === evidence.as_of, 'CONTROL_PAIR_AS_OF_INVALID');
  const ids = expectedIds(contract);
  ensure(candidate.snapshot_id === ids.snapshotId && evidence.bound_snapshot_id === ids.snapshotId, 'CONTROL_PAIR_SNAPSHOT_ID_REBINDING');
  ensure(evidence.evidence_package_id === ids.evidencePackageId && candidate.bound_evidence_package_id === ids.evidencePackageId, 'CONTROL_PAIR_EVIDENCE_ID_REBINDING');
  exactKeys(candidate.source_observation, ['path', 'observation_id', 'source_id', 'source_projection_sha256'], 'CONTROL_CANDIDATE_SOURCE_OBSERVATION');
  exactKeys(evidence.source_observation, ['path', 'observation_id', 'source_id', 'source_projection_sha256'], 'CONTROL_EVIDENCE_SOURCE_OBSERVATION');
  const expectedSourceObservation = {
    path: contract.authoritative_source.observation_path,
    observation_id: contract.authoritative_source.observation_id,
    source_id: contract.authoritative_source.source_id,
    source_projection_sha256: contract.authoritative_source.source_projection_sha256,
  };
  ensure(same(candidate.source_observation, expectedSourceObservation) && same(evidence.source_observation, expectedSourceObservation), 'CONTROL_PAIR_SOURCE_OBSERVATION_BINDING_INVALID');
  ensure(candidate.evidence_state === 'REFERENCE_ONLY_CONTROL_INPUT', 'CONTROL_CANDIDATE_EVIDENCE_STATE_INVALID');
  ensure(candidate.publication_authorized === false && candidate.production_authorized === false && evidence.publication_authorized === false && evidence.production_authorized === false, 'CONTROL_PAIR_PREAUTHORIZATION_INVALID');
  verifyProtectedHolds(candidate, 'CONTROL_CANDIDATE');
  verifyProtectedHolds(evidence, 'CONTROL_EVIDENCE');
  ensure(Array.isArray(candidate.known_limitations) && candidate.known_limitations.length >= 6, 'CONTROL_CANDIDATE_LIMITATIONS_INCOMPLETE');

  exactKeys(evidence.rights, ['collect', 'store', 'transform', 'display', 'redistribute', 'sell', 'review_due_at', 'legal_conclusion_asserted', 'independent_legal_review_complete', 'evidence_refs'], 'CONTROL_EVIDENCE_RIGHTS');
  ensure(same({
    collect: evidence.rights.collect,
    store: evidence.rights.store,
    transform: evidence.rights.transform,
    display: evidence.rights.display,
    redistribute: evidence.rights.redistribute,
    sell: evidence.rights.sell,
  }, contract.authoritative_source.required_rights), 'CONTROL_EVIDENCE_RIGHTS_BOUNDARY_INVALID');
  ensure(strictTimestamp(evidence.rights.review_due_at) && Date.parse(evidence.rights.review_due_at) > Date.now(), 'CONTROL_EVIDENCE_RIGHTS_REVIEW_EXPIRED');
  ensure(evidence.rights.legal_conclusion_asserted === false && evidence.rights.independent_legal_review_complete === false, 'CONTROL_EVIDENCE_LEGAL_REVIEW_FALSE_PROMOTION');
  ensure(Array.isArray(evidence.rights.evidence_refs) && evidence.rights.evidence_refs.length === 3, 'CONTROL_EVIDENCE_RIGHTS_REFS_INVALID');
  ensure(Array.isArray(evidence.evidence_records) && evidence.evidence_records.length === 1, 'CONTROL_EVIDENCE_RECORD_COUNT_INVALID');
  const record = evidence.evidence_records[0];
  exactKeys(record, [
    'evidence_id', 'admission_state', 'evidence_class', 'source_id', 'source_owner_id', 'factual_origin_id',
    'scope_id', 'domain_id', 'internal_normalized_facts', 'price_role', 'semantic_boundary', 'provenance',
    'claim_ceiling', 'reference_only', 'signal_eligible', 'index_eligible', 'customer_claim_authorized',
  ], 'CONTROL_EVIDENCE_RECORD');
  ensure(record.evidence_id === ids.evidenceId && record.admission_state === 'ADMITTED_CONTROL_REFERENCE_ONLY', 'CONTROL_EVIDENCE_RECORD_ID_OR_STATE_INVALID');
  ensure(record.evidence_class === contract.authoritative_source.required_evidence_class && record.source_id === contract.authoritative_source.source_id, 'CONTROL_EVIDENCE_CLASS_OR_SOURCE_INVALID');
  ensure(record.source_owner_id === contract.authoritative_source.source_owner_id && record.factual_origin_id === contract.authoritative_source.factual_origin_id, 'CONTROL_EVIDENCE_OWNER_OR_ORIGIN_INVALID');
  ensure(record.scope_id === contract.authoritative_source.scope_id && record.domain_id === contract.authoritative_source.domain_id, 'CONTROL_EVIDENCE_SCOPE_INVALID');
  exactKeys(record.internal_normalized_facts, ['title', 'object_identifiers', 'camera_quantity', 'lot_quantity', 'condition', 'event_state', 'event_at', 'observed_at', 'terminal_display_amount', 'currency', 'bid_count'], 'CONTROL_EVIDENCE_INTERNAL_FACTS');
  ensure(record.internal_normalized_facts.event_state === 'SOLD' && record.internal_normalized_facts.lot_quantity === 1, 'CONTROL_EVIDENCE_INTERNAL_EVENT_INVALID');
  ensure(record.internal_normalized_facts.terminal_display_amount === 2110 && record.internal_normalized_facts.currency === 'QAR' && record.internal_normalized_facts.bid_count === 101, 'CONTROL_EVIDENCE_INTERNAL_PRICE_FACTS_INVALID');
  ensure(same(record.internal_normalized_facts.object_identifiers, ['Nikon D5600', 'Nikon D90']), 'CONTROL_EVIDENCE_OBJECT_IDENTIFIERS_INVALID');
  ensure(record.internal_normalized_facts.title === 'NIKON CAMERA' && record.internal_normalized_facts.camera_quantity === 2 && record.internal_normalized_facts.condition === 'Usable', 'CONTROL_EVIDENCE_INTERNAL_OBJECT_FACTS_INVALID');
  ensure(record.internal_normalized_facts.event_at === '2024-06-29T12:00:00Z' && record.internal_normalized_facts.observed_at === candidate.as_of, 'CONTROL_EVIDENCE_INTERNAL_TIME_FACTS_INVALID');
  ensure(record.price_role === 'TERMINAL_HIGHEST_BID_DISPLAY_AMOUNT_NOT_CONFIRMED_SETTLEMENT_OR_ALL_IN_REALIZED', 'CONTROL_EVIDENCE_PRICE_ROLE_INVALID');
  exactKeys(record.semantic_boundary, ['verified_sold_event', 'hammer_price_confirmed', 'settlement_confirmed', 'current_price', 'liquidity_or_time_to_sale', 'collector_market_representativeness_verified'], 'CONTROL_EVIDENCE_SEMANTIC_BOUNDARY');
  for (const value of Object.values(record.semantic_boundary)) ensure(value === false, 'CONTROL_EVIDENCE_CLAIM_INFLATION');
  exactKeys(record.provenance, ['source_url', 'source_projection_sha256', 'raw_live_source_snapshot_verified', 'lineage_digest_role', 'source_schema_version', 'source_event_id', 'source_lot_id'], 'CONTROL_EVIDENCE_PROVENANCE');
  ensure(record.provenance.source_projection_sha256 === contract.authoritative_source.source_projection_sha256 && record.provenance.raw_live_source_snapshot_verified === false, 'CONTROL_EVIDENCE_PROVENANCE_DIGEST_INVALID');
  ensure(record.provenance.lineage_digest_role === 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD', 'CONTROL_EVIDENCE_LINEAGE_ROLE_INVALID');
  ensure(record.provenance.source_url === 'https://online-auction.state.gov/en-US/Auction/Lot/fdc79e90-95ac-452e-8f9b-ac91aede6e3d?auctionId=13251474-ac4c-49d5-b3dc-9c9b0cb181e3' && record.provenance.source_schema_version === 'state-department-online-auction-fact-projection-v1', 'CONTROL_EVIDENCE_PROVENANCE_SOURCE_INVALID');
  ensure(record.provenance.source_event_id === '13251474-ac4c-49d5-b3dc-9c9b0cb181e3' && record.provenance.source_lot_id === 'fdc79e90-95ac-452e-8f9b-ac91aede6e3d', 'CONTROL_EVIDENCE_PROVENANCE_EVENT_OR_LOT_INVALID');
  exactKeys(record.claim_ceiling, ['allowed', 'forbidden'], 'CONTROL_EVIDENCE_CLAIM_CEILING');
  ensure(Array.isArray(record.claim_ceiling.allowed) && Array.isArray(record.claim_ceiling.forbidden) && record.claim_ceiling.forbidden.includes('CUSTOMER_FACING_MARKET_CLAIM'), 'CONTROL_EVIDENCE_CLAIM_CEILING_INVALID');
  ensure(hashValue(record.claim_ceiling) === contract.authoritative_source.claim_ceiling_sha256, 'CONTROL_EVIDENCE_CLAIM_CEILING_DIGEST_MISMATCH');
  ensure(record.reference_only === true && record.signal_eligible === false && record.index_eligible === false && record.customer_claim_authorized === false, 'CONTROL_EVIDENCE_ROUTING_INVALID');

  const candidateDigest = candidatePayloadSha256(candidate);
  const evidenceDigest = evidencePayloadSha256(evidence);
  const pairDigest = pairDigestFor(candidate, evidence);
  ensure(SHA256_PATTERN.test(candidate.candidate_payload_sha256) && candidate.candidate_payload_sha256 === candidateDigest, 'CONTROL_CANDIDATE_PAYLOAD_DIGEST_MISMATCH');
  ensure(SHA256_PATTERN.test(evidence.evidence_package_payload_sha256) && evidence.evidence_package_payload_sha256 === evidenceDigest, 'CONTROL_EVIDENCE_PAYLOAD_DIGEST_MISMATCH');
  ensure(SHA256_PATTERN.test(candidate.pair_digest) && candidate.pair_digest === pairDigest && evidence.pair_digest === pairDigest, 'CONTROL_PAIR_DIGEST_MISMATCH');
  return { candidateDigest, evidenceDigest, pairDigest, ids, record };
}

export function validateMockAssessment(assessment, candidate, evidence, contract) {
  const pair = validateControlPair(candidate, evidence, contract);
  exactKeys(assessment, [
    'record_type', 'schema_version', 'fixture_type', 'assessment_class', 'assessment_id', 'as_of', 'input_snapshot_id',
    'input_evidence_package_id', 'pair_digest', 'assessor_input_boundary', 'decision', 'canonical_handoff_state',
    'official_track_b_started', 'rankability_assessment_created', 'rankable', 'promotable', 'real_product_value_proof',
    'approved_projection', 'publication_eligible', 'production_authorized', 'blocking_dimensions', 'public_release',
    'production', 'g5', 'assessment_payload_sha256',
  ], 'CONTROL_MOCK_ASSESSMENT');
  const ids = expectedIds(contract, pair.pairDigest);
  ensure(assessment.record_type === contract.track_b_contract_mock.record_type && assessment.assessment_class === contract.track_b_contract_mock.assessment_class, 'CONTROL_MOCK_ASSESSMENT_TYPE_INVALID');
  ensure(assessment.schema_version === '1.0.0' && assessment.fixture_type === contract.track_a_control_pair.fixture_type, 'CONTROL_MOCK_ASSESSMENT_SCHEMA_OR_FIXTURE_INVALID');
  ensure(assessment.assessment_id === ids.assessmentId && assessment.input_snapshot_id === candidate.snapshot_id && assessment.input_evidence_package_id === evidence.evidence_package_id, 'CONTROL_MOCK_ASSESSMENT_INPUT_REBINDING');
  ensure(assessment.as_of === candidate.as_of && assessment.pair_digest === pair.pairDigest, 'CONTROL_MOCK_ASSESSMENT_PAIR_BINDING_INVALID');
  exactKeys(assessment.assessor_input_boundary, ['allowed_input_files', 'observation_input', 'portal_input', 'business_input', 'provider_input'], 'CONTROL_MOCK_ASSESSMENT_INPUT_BOUNDARY');
  ensure(same(assessment.assessor_input_boundary.allowed_input_files, contract.track_b_contract_mock.allowed_input_files), 'CONTROL_MOCK_ASSESSMENT_ALLOWED_INPUTS_INVALID');
  for (const field of ['observation_input', 'portal_input', 'business_input', 'provider_input']) ensure(assessment.assessor_input_boundary[field] === false, 'CONTROL_MOCK_ASSESSMENT_EXTERNAL_INPUT_INVALID');
  ensure(assessment.decision === 'CONTROL_CONTRACT_PASS' && assessment.canonical_handoff_state === 'BLOCKED_CONTROL_PAIR', 'CONTROL_MOCK_ASSESSMENT_DECISION_INVALID');
  ensure(assessment.official_track_b_started === false && assessment.rankability_assessment_created === false && assessment.rankable === false && assessment.promotable === false, 'CONTROL_MOCK_ASSESSMENT_FALSE_PROMOTION');
  ensure(assessment.real_product_value_proof === false && assessment.approved_projection === false && assessment.publication_eligible === false && assessment.production_authorized === false, 'CONTROL_MOCK_ASSESSMENT_AUTHORITY_EXPANSION');
  ensure(Array.isArray(assessment.blocking_dimensions) && same(assessment.blocking_dimensions, [
    'CANONICAL_HANDOFF_INELIGIBLE_CONTROL_PAIR',
    'CURRENT_MARKET_EVIDENCE_NOT_VERIFIED',
    'DISPLAY_REDISTRIBUTION_AND_SALE_RIGHTS_UNKNOWN',
    'IMMUTABLE_RAW_SOURCE_SNAPSHOT_NOT_VERIFIED',
    'LIQUIDITY_NOT_VERIFIED',
    'MARKET_REPRESENTATIVENESS_NOT_VERIFIED',
    'OFFICIAL_TRACK_B_NOT_STARTED',
  ]), 'CONTROL_MOCK_ASSESSMENT_BLOCKERS_INVALID');
  ensure(assessment.public_release === 'HOLD' && assessment.production === 'HOLD' && assessment.g5 === 'HOLD', 'CONTROL_MOCK_ASSESSMENT_PROTECTED_GATES_INVALID');
  ensure(SHA256_PATTERN.test(assessment.assessment_payload_sha256) && assessment.assessment_payload_sha256 === assessmentPayloadSha256(assessment), 'CONTROL_MOCK_ASSESSMENT_PAYLOAD_DIGEST_MISMATCH');
  return { ...pair, assessmentId: ids.assessmentId, assessmentDigest: assessment.assessment_payload_sha256 };
}

export function validateControlProjection(projection, candidate, evidence, assessment, contract) {
  const binding = validateMockAssessment(assessment, candidate, evidence, contract);
  exactKeys(projection, [
    'record_type', 'schema_version', 'fixture_type', 'input_data_class', 'control_record_id', 'projection', 'release',
    'audit', 'content_policy', 'official_track_b_started', 'canonical_handoff_eligible', 'real_product_value_proof',
    'approved_projection', 'public_release', 'production', 'g5', 'control_payload_sha256',
  ], 'CONTROL_PROJECTION');
  const ids = expectedIds(contract, binding.pairDigest);
  ensure(projection.record_type === contract.projection_control.record_type && projection.schema_version === contract.projection_control.schema_version && projection.fixture_type === contract.projection_control.fixture_type, 'CONTROL_PROJECTION_TYPE_INVALID');
  ensure(projection.input_data_class === contract.truth_boundary.underlying_input_data_class && projection.control_record_id === ids.controlRecordId, 'CONTROL_PROJECTION_ID_OR_INPUT_CLASS_INVALID');
  exactKeys(projection.projection, ['state', 'projection_id', 'replay_id', 'exact_pair_digest', 'as_of', 'assessment_id', 'rights_state', 'freshness', 'synthetic', 'promotable', 'production', 'public'], 'CONTROL_PROJECTION_STATE');
  ensure(projection.projection.state === 'NO_PROJECTION' && projection.projection.projection_id === null && projection.projection.replay_id === null && projection.projection.as_of === null, 'CONTROL_PROJECTION_FALSE_LIVE_STATE');
  ensure(projection.projection.exact_pair_digest === binding.pairDigest && projection.projection.assessment_id === assessment.assessment_id, 'CONTROL_PROJECTION_PAIR_OR_ASSESSMENT_REBINDING');
  ensure(projection.projection.rights_state === 'WAITING' && projection.projection.freshness === 'NOT_AVAILABLE' && projection.projection.synthetic === true, 'CONTROL_PROJECTION_STATE_BOUNDARY_INVALID');
  ensure(projection.projection.promotable === false && projection.projection.production === false && projection.projection.public === false, 'CONTROL_PROJECTION_PROMOTION_INVALID');
  exactKeys(projection.release, ['state'], 'CONTROL_PROJECTION_RELEASE');
  ensure(projection.release.state === 'HOLD', 'CONTROL_PROJECTION_RELEASE_INVALID');
  exactKeys(projection.audit, ['snapshot_id', 'evidence_package_id', 'assessment_id', 'exact_pair_digest', 'source_projection_sha256', 'correlation_id', 'reason_category'], 'CONTROL_PROJECTION_AUDIT');
  ensure(projection.audit.snapshot_id === candidate.snapshot_id && projection.audit.evidence_package_id === evidence.evidence_package_id && projection.audit.assessment_id === assessment.assessment_id, 'CONTROL_PROJECTION_AUDIT_ID_REBINDING');
  ensure(projection.audit.exact_pair_digest === binding.pairDigest && projection.audit.source_projection_sha256 === contract.authoritative_source.source_projection_sha256, 'CONTROL_PROJECTION_AUDIT_DIGEST_REBINDING');
  ensure(projection.audit.correlation_id === hashValue({ snapshot_id: candidate.snapshot_id, evidence_package_id: evidence.evidence_package_id, assessment_id: assessment.assessment_id, pair_digest: binding.pairDigest }), 'CONTROL_PROJECTION_CORRELATION_ID_INVALID');
  ensure(projection.audit.reason_category === 'LAWFUL_CONTROL_PLUMBING_ONLY_NO_GOVERNED_PROJECTION', 'CONTROL_PROJECTION_REASON_INVALID');
  exactKeys(projection.content_policy, ['source_facts_discarded', 'raw_provider_payload_included', 'object_identity_included', 'price_or_bid_included', 'portal_behavior'], 'CONTROL_PROJECTION_CONTENT_POLICY');
  ensure(projection.content_policy.source_facts_discarded === true && projection.content_policy.raw_provider_payload_included === false && projection.content_policy.object_identity_included === false && projection.content_policy.price_or_bid_included === false, 'CONTROL_PROJECTION_PAYLOAD_LEAKAGE');
  ensure(projection.content_policy.portal_behavior === contract.projection_control.portal_content_policy, 'CONTROL_PROJECTION_PORTAL_POLICY_INVALID');
  ensure(projection.official_track_b_started === false && projection.canonical_handoff_eligible === false && projection.real_product_value_proof === false && projection.approved_projection === false, 'CONTROL_PROJECTION_TRUTH_BOUNDARY_INVALID');
  ensure(projection.public_release === 'HOLD' && projection.production === 'HOLD' && projection.g5 === 'HOLD', 'CONTROL_PROJECTION_PROTECTED_GATES_INVALID');
  ensure(SHA256_PATTERN.test(projection.control_payload_sha256) && projection.control_payload_sha256 === controlPayloadSha256(projection), 'CONTROL_PROJECTION_PAYLOAD_DIGEST_MISMATCH');
  const serialized = JSON.stringify(projection);
  const facts = evidence.evidence_records[0].internal_normalized_facts;
  for (const forbidden of [
    facts.title,
    ...facts.object_identifiers,
    facts.currency,
    String(facts.terminal_display_amount),
    String(facts.bid_count),
    evidence.evidence_records[0].provenance.source_url,
    evidence.evidence_records[0].provenance.source_event_id,
    evidence.evidence_records[0].provenance.source_lot_id,
  ]) ensure(!serialized.includes(String(forbidden)), `CONTROL_PROJECTION_SOURCE_FACT_LEAKAGE:${forbidden}`);
  return binding;
}
