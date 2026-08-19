import fs from 'node:fs';
import { createHash } from 'node:crypto';

const artifactPath = process.argv[2] || '/tmp/provenance-source-corpus-r1.json';
const contractPath = process.argv[3] || 'coordination/kidults/entity-resolution/provenance-source-corpus-r1.json';
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const entityUrlPattern = /^https:\/\/data\.getty\.edu\/provenance\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const streamItemPattern = /^https:\/\/data\.getty\.edu\/provenance\/activity-stream\/[0-9a-f-]{36}$/i;
const streamPagePattern = /^https:\/\/data\.getty\.edu\/provenance\/activity-stream\/page\/[1-9][0-9]*$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function expectedPairId(activityReference, objectReference) {
  return `getty-activity-object:${createHash('sha256')
    .update(`${activityReference}\n${objectReference}`)
    .digest('hex')}`;
}

function sameStringSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every(value => actual.includes(value));
}

function rejectOutcomeMaterial(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectOutcomeMaterial(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    const allowedNegativeFlag = (normalized === 'labels_present' && child === false)
      || (normalized === 'model_predictions_present' && child === false);
    if (!allowedNegativeFlag && (normalized.includes('ground_truth') || normalized.includes('prediction') || normalized === 'label' || normalized === 'labels' || normalized.endsWith('_label'))) {
      throw new Error(`OUTCOME_MATERIAL_PROHIBITED:${path}.${key}`);
    }
    rejectOutcomeMaterial(child, `${path}.${key}`);
  }
}

assert(contract.status === 'ACQUISITION_EXECUTION_CONTRACT', 'CONTRACT_STATUS_INVALID');
assert(contract.target_pair_count === 120, 'CONTRACT_PAIR_TARGET_120_REQUIRED');
assert(contract.target_distinct_activity_count === 120, 'CONTRACT_DISTINCT_ACTIVITY_TARGET_120_REQUIRED');
assert(contract.target_distinct_object_count === 120, 'CONTRACT_DISTINCT_OBJECT_TARGET_120_REQUIRED');
assert(contract.target_entity_payload_digest_count === 240, 'CONTRACT_PAYLOAD_DIGEST_TARGET_240_REQUIRED');
assert(contract.required_activity_type === 'Activity', 'CONTRACT_ACTIVITY_TYPE_INVALID');
assert(contract.required_object_type === 'HumanMadeObject', 'CONTRACT_OBJECT_TYPE_INVALID');
assert(contract.required_explicit_link_predicate === 'part[*].transferred_title_of[*]', 'CONTRACT_LINK_PREDICATE_INVALID');
assert(contract.rights_basis_required === 'CC0-1.0', 'CONTRACT_RIGHTS_BASIS_INVALID');
assert(contract.labels_allowed === false && contract.model_predictions_allowed === false, 'CONTRACT_UNLABELED_BOUNDARY_REQUIRED');
assert(contract.production === 'HOLD' && contract.public_release === 'HOLD', 'CONTRACT_RELEASE_HOLD_REQUIRED');
assert(Array.isArray(contract.license_evidence_refs) && contract.license_evidence_refs.length >= 2, 'CONTRACT_RIGHTS_REFS_REQUIRED');

assert(artifact.id === contract.id, 'ARTIFACT_ID_INVALID');
assert(artifact.status === 'REAL_SOURCE_EXPLICITLY_LINKED_PAIR_CORPUS_UNLABELED', 'ARTIFACT_STATUS_INVALID');
assert(artifact.stratum_id === contract.stratum_id, 'STRATUM_INVALID');
assert(artifact.source_id === contract.source_id, 'SOURCE_ID_INVALID');
assert(artifact.pair_count === contract.target_pair_count, 'PAIR_COUNT_120_REQUIRED');
assert(Array.isArray(artifact.pairs) && artifact.pairs.length === contract.target_pair_count, 'PAIRS_LENGTH_120_REQUIRED');
assert(artifact.distinct_activity_count === contract.target_distinct_activity_count, 'DISTINCT_ACTIVITY_COUNT_INVALID');
assert(artifact.distinct_object_count === contract.target_distinct_object_count, 'DISTINCT_OBJECT_COUNT_INVALID');
assert(artifact.entity_payload_digest_count === contract.target_entity_payload_digest_count, 'ENTITY_PAYLOAD_DIGEST_COUNT_INVALID');
assert(artifact.explicit_link_predicate === contract.required_explicit_link_predicate, 'ARTIFACT_LINK_PREDICATE_INVALID');
assert(artifact.labels_present === false && artifact.model_predictions_present === false, 'UNLABELED_UNPREDICTED_BOUNDARY_REQUIRED');
assert(artifact.reviewer_assignment_required === true, 'REVIEWER_ASSIGNMENT_REQUIRED');
assert(artifact.production === 'HOLD' && artifact.public_release === 'HOLD', 'RELEASE_HOLD_REQUIRED');
assert(digestPattern.test(artifact.corpus_evidence_sha256), 'CORPUS_EVIDENCE_DIGEST_INVALID');
assert(artifact.corpus_evidence_sha256 === digest(artifact.pairs), 'CORPUS_EVIDENCE_DIGEST_MISMATCH');
rejectOutcomeMaterial(artifact);

const pairIds = new Set();
const activityReferences = new Set();
const objectReferences = new Set();
const activityPayloadDigests = new Set();
const objectPayloadDigests = new Set();

for (const pair of artifact.pairs) {
  assert(pair.source_id === contract.source_id, `${pair.pair_id}:SOURCE_ID_INVALID`);
  assert(!pairIds.has(pair.pair_id), `${pair.pair_id}:DUPLICATE_PAIR_ID`);
  pairIds.add(pair.pair_id);

  const activityReference = pair.activity?.source_reference;
  const objectReference = pair.object?.source_reference;
  assert(entityUrlPattern.test(activityReference), `${pair.pair_id}:ACTIVITY_REFERENCE_INVALID`);
  assert(entityUrlPattern.test(objectReference), `${pair.pair_id}:OBJECT_REFERENCE_INVALID`);
  assert(pair.pair_id === expectedPairId(activityReference, objectReference), `${pair.pair_id}:PAIR_ID_BINDING_INVALID`);
  assert(pair.activity.source_type === contract.required_activity_type, `${pair.pair_id}:ACTIVITY_TYPE_INVALID`);
  assert(pair.object.source_type === contract.required_object_type, `${pair.pair_id}:OBJECT_TYPE_INVALID`);
  assert(pair.activity.source_record_id === activityReference.split('/').pop(), `${pair.pair_id}:ACTIVITY_RECORD_ID_INVALID`);
  assert(pair.object.source_record_id === objectReference.split('/').pop(), `${pair.pair_id}:OBJECT_RECORD_ID_INVALID`);
  assert(pair.activity.digest_scope === 'FULL_FETCHED_JSON_LD_RESPONSE', `${pair.pair_id}:ACTIVITY_DIGEST_SCOPE_INVALID`);
  assert(pair.object.digest_scope === 'FULL_FETCHED_JSON_LD_RESPONSE', `${pair.pair_id}:OBJECT_DIGEST_SCOPE_INVALID`);
  assert(digestPattern.test(pair.activity.source_payload_sha256), `${pair.pair_id}:ACTIVITY_PAYLOAD_DIGEST_INVALID`);
  assert(digestPattern.test(pair.object.source_payload_sha256), `${pair.pair_id}:OBJECT_PAYLOAD_DIGEST_INVALID`);
  assert(pair.activity.source_payload_sha256 !== pair.object.source_payload_sha256, `${pair.pair_id}:ENTITY_PAYLOAD_DIGEST_COLLISION`);

  assert(pair.explicit_source_link?.activity_reference === activityReference, `${pair.pair_id}:LINK_ACTIVITY_BINDING_INVALID`);
  assert(pair.explicit_source_link?.object_reference === objectReference, `${pair.pair_id}:LINK_OBJECT_BINDING_INVALID`);
  assert(pair.explicit_source_link?.predicate === 'transferred_title_of', `${pair.pair_id}:LINK_PREDICATE_INVALID`);
  assert(/^part\[[0-9]+\]\.transferred_title_of\[[0-9]+\]$/.test(pair.explicit_source_link?.source_path), `${pair.pair_id}:LINK_SOURCE_PATH_INVALID`);
  assert(pair.explicit_source_link?.verified_from_activity_payload === true, `${pair.pair_id}:ACTIVITY_PAYLOAD_LINK_VERIFICATION_REQUIRED`);
  assert(digestPattern.test(pair.explicit_source_link?.source_link_evidence_sha256), `${pair.pair_id}:LINK_EVIDENCE_DIGEST_INVALID`);
  const linkEvidence = pair.explicit_source_link?.link_evidence;
  assert(Number.isInteger(linkEvidence?.part_index) && linkEvidence.part_index >= 0, `${pair.pair_id}:LINK_PART_INDEX_INVALID`);
  assert(Number.isInteger(linkEvidence?.relation_index) && linkEvidence.relation_index >= 0, `${pair.pair_id}:LINK_RELATION_INDEX_INVALID`);
  assert(pair.explicit_source_link.source_path === `part[${linkEvidence.part_index}].transferred_title_of[${linkEvidence.relation_index}]`, `${pair.pair_id}:LINK_PATH_INDEX_BINDING_INVALID`);
  assert(Array.isArray(linkEvidence?.part_type) && linkEvidence.part_type.includes('Acquisition'), `${pair.pair_id}:ACQUISITION_PART_TYPE_REQUIRED`);
  assert(linkEvidence?.predicate === 'transferred_title_of', `${pair.pair_id}:LINK_EVIDENCE_PREDICATE_INVALID`);
  assert(linkEvidence?.referenced_object?.id === objectReference, `${pair.pair_id}:LINK_EVIDENCE_OBJECT_BINDING_INVALID`);
  assert(linkEvidence?.referenced_object?.type === 'HumanMadeObject', `${pair.pair_id}:LINK_EVIDENCE_OBJECT_TYPE_INVALID`);
  assert(pair.explicit_source_link.source_link_evidence_sha256 === digest(linkEvidence), `${pair.pair_id}:LINK_EVIDENCE_DIGEST_MISMATCH`);

  assert(pair.rights_state === contract.rights_state_required, `${pair.pair_id}:RIGHTS_ALLOW_REQUIRED`);
  assert(pair.rights_basis === contract.rights_basis_required, `${pair.pair_id}:RIGHTS_BASIS_INVALID`);
  assert(sameStringSet(pair.rights_refs, contract.license_evidence_refs), `${pair.pair_id}:RIGHTS_REFS_INVALID`);
  assert(sameStringSet(pair.license_evidence_refs, contract.license_evidence_refs), `${pair.pair_id}:LICENSE_EVIDENCE_REFS_INVALID`);
  assert(Array.isArray(pair.provenance_refs) && pair.provenance_refs.length === 4, `${pair.pair_id}:PROVENANCE_REFS_INVALID`);
  assert(streamPagePattern.test(pair.provenance_refs[0]), `${pair.pair_id}:STREAM_PAGE_PROVENANCE_INVALID`);
  assert(streamItemPattern.test(pair.provenance_refs[1]), `${pair.pair_id}:STREAM_ITEM_PROVENANCE_INVALID`);
  assert(pair.provenance_refs[2] === activityReference, `${pair.pair_id}:ACTIVITY_PROVENANCE_INVALID`);
  assert(pair.provenance_refs[3] === objectReference, `${pair.pair_id}:OBJECT_PROVENANCE_INVALID`);

  assert(!activityReferences.has(activityReference), `${pair.pair_id}:ACTIVITY_NOT_DISTINCT`);
  assert(!objectReferences.has(objectReference), `${pair.pair_id}:OBJECT_NOT_DISTINCT`);
  activityReferences.add(activityReference);
  objectReferences.add(objectReference);
  activityPayloadDigests.add(pair.activity.source_payload_sha256);
  objectPayloadDigests.add(pair.object.source_payload_sha256);
}

assert(pairIds.size === 120, 'DISTINCT_PAIR_COUNT_120_REQUIRED');
assert(activityReferences.size === 120, 'DISTINCT_ACTIVITY_REFERENCE_COUNT_120_REQUIRED');
assert(objectReferences.size === 120, 'DISTINCT_OBJECT_REFERENCE_COUNT_120_REQUIRED');
assert(activityPayloadDigests.size === 120, 'DISTINCT_ACTIVITY_PAYLOAD_DIGEST_COUNT_120_REQUIRED');
assert(objectPayloadDigests.size === 120, 'DISTINCT_OBJECT_PAYLOAD_DIGEST_COUNT_120_REQUIRED');
assert(artifact.acquisition_metrics?.activity_stream_pages_scanned > 0, 'ACTIVITY_STREAM_SCAN_METRIC_REQUIRED');
assert(artifact.acquisition_metrics?.activity_payloads_fetched >= 120, 'ACTIVITY_FETCH_METRIC_INVALID');
assert(artifact.acquisition_metrics?.human_made_object_payloads_fetched >= 120, 'OBJECT_FETCH_METRIC_INVALID');
assert(artifact.acquisition_metrics?.explicit_transferred_title_of_links_observed >= 120, 'EXPLICIT_LINK_METRIC_INVALID');
assert(artifact.acquisition_metrics?.evidence_bound_pairs_selected === 120, 'SELECTED_PAIR_METRIC_INVALID');

console.log(JSON.stringify({
  status: 'PASS',
  pair_count: pairIds.size,
  distinct_activity_count: activityReferences.size,
  distinct_object_count: objectReferences.size,
  distinct_activity_payload_digest_count: activityPayloadDigests.size,
  distinct_object_payload_digest_count: objectPayloadDigests.size,
  explicit_link_predicate: contract.required_explicit_link_predicate,
  labels_present: false,
  model_predictions_present: false,
  production: 'HOLD',
  public_release: 'HOLD'
}));
