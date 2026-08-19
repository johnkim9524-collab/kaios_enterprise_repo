import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseJsonNoDuplicateKeys } from './parse-json-no-duplicate-keys.mjs';

const [artifactPath, samplingPath] = process.argv.slice(2);
if (!artifactPath || !samplingPath) {
  throw new Error('usage: node validate-vehicle-mechanical-asset-capacity-r1.mjs <capacity.json> <sampling-plan.json>');
}

const [artifactText, samplingText] = await Promise.all([
  fs.readFile(artifactPath, 'utf8'),
  fs.readFile(samplingPath, 'utf8'),
]);
const artifact = parseJsonNoDuplicateKeys(artifactText, artifactPath);
const sampling = parseJsonNoDuplicateKeys(samplingText, samplingPath);
const STRATUM_ID = 'er-stratum-vehicle-mechanical-asset';
const SOURCE_FAMILY = 'fr-ministry-culture-pop-palissy-mh-open-data';
const SEARCH_ENDPOINT = 'https://api.pop.culture.gouv.fr/search/simple';
const POP_CGU = 'https://pop.culture.gouv.fr/conditions-generales-utilisation';
const POP_OPEN_DATA = 'https://pop.culture.gouv.fr/donnees-ouvertes';
const ETALAB_LICENSE = 'https://github.com/etalab/licence-ouverte/blob/master/LO.md';
const LICENSE_REFS = [POP_CGU, POP_OPEN_DATA, ETALAB_LICENSE];
const COMPLETE_STATUSES = new Set(['COMPLETE_SOURCE_CAPACITY_READY', 'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY']);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ALLOWED_DENOMINATIONS = new Set(['voiture automobile', 'coupé automobile', 'décapotable', 'véhicule automobile']);
const FROZEN_COMPLETE_SEMANTIC_SHA256 = 'sha256:c4259b7ceff8e2cc74369b0f71e134ee8ecebd2b76b4f58122351c33f768e100';
const FROZEN_FAILURE_SEMANTIC_SHA256 = 'sha256:d1613a2e4b5ea26fb4e642cef751d845e2026a36b925a8d3c846e1bb8f79725b';
const COMPLETE_VOLATILE_SEMANTIC_PATHS = new Set(['generated_at', 'integrity', 'source_snapshot.accessed_at']);
const FAILURE_VOLATILE_SEMANTIC_PATHS = new Set(['generated_at', 'integrity']);
const FAILURE_TRUTH_BOUNDARY = 'The official live source probe did not complete. Observed capacity is zero for this run and all acquisition and downstream claims fail closed.';
const FAILURE_CODE = 'SOURCE_PROBE_UNAVAILABLE';

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(canonical(value)),
).digest('hex')}`;
const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const normalizedKey = (value) => normalize(value).toLocaleLowerCase('fr');
const asStrings = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(normalize).filter(Boolean);
const chassisKey = (value) => normalize(value).replace(/[^\p{L}\p{N}]/gu, '').toLocaleUpperCase('fr');
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  left.length === new Set(left).size && right.length === new Set(right).size &&
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const semanticProjection = (value, volatilePaths, path = []) => {
  if (Array.isArray(value)) return value.map((child, index) => semanticProjection(child, volatilePaths, [...path, String(index)]));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !volatilePaths.has([...path, key].join('.')))
      .map(([key, child]) => [key, semanticProjection(child, volatilePaths, [...path, key])]));
  }
  return value;
};
const isCanonicalTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function extractMaker(authors) {
  const matches = asStrings(authors).map((author) => {
    const match = author.match(/^(.+?)\s*\((usine|constructeur|fabricant)\)$/i);
    return match ? {value:normalize(match[1]), role:normalizedKey(match[2])} : null;
  }).filter(Boolean);
  const unique = [...new Map(matches.map((row) => [`${normalizedKey(row.value)}\0${row.role}`, row])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function extractModel(appellation) {
  const match = normalize(appellation).match(/^type\s+(.+?)\s*;\s*Collection Schlumpf$/i);
  const value = normalize(match?.[1]);
  return value && !value.includes('?') ? value : null;
}

function extractChassis(inscriptionDetails) {
  const match = normalize(inscriptionDetails)
    .match(/^Num[\u00e9e]ro de s[\u00e9e]rie\s*:\s*n[\u00b0\u00bao]\s*ch[a\u00e2]ssis\s+(.+)$/i);
  const value = normalize(match?.[1]);
  if (!value || /[?()]/.test(value) || /(?:^|\s)(?:ou|ex)(?:\s|$)/i.test(value)) return null;
  return value;
}

function validateRecord(record) {
  assert(sameSet(Object.keys(record || {}), [
    'chassis_identifier', 'grammar_complete', 'license_evidence_refs', 'maker', 'model',
    'official_record_identifier', 'record_id', 'rights_state', 'source_payload',
    'source_payload_sha256', 'source_reference', 'vehicle_scope',
  ]), `SOURCE_RECORD_SCHEMA_INVALID:${record?.record_id}`);
  assert(sameSet(Object.keys(record?.official_record_identifier || {}), ['authority', 'value']) &&
    sameSet(Object.keys(record?.maker || {}), ['role', 'source_field', 'value']) &&
    sameSet(Object.keys(record?.model || {}), ['semantics', 'source_field', 'value']) &&
    sameSet(Object.keys(record?.chassis_identifier || {}), ['semantics', 'source_field', 'value']),
  `SOURCE_RECORD_NESTED_SCHEMA_INVALID:${record?.record_id}`);
  const payload = record?.source_payload;
  const ref = normalize(payload?.REF);
  const maker = extractMaker(payload?.AUTR);
  const model = extractModel(payload?.APPL);
  const chassis = extractChassis(payload?.PINS);
  const denominations = asStrings(payload?.DENO);
  assert(sameSet(Object.keys(payload || {}), ['REF', 'BASE', 'DENO', 'TICO', 'APPL', 'AUTR', 'PINS', 'INSC', 'DATE', 'DMAJ']),
    `TEXT_ONLY_SOURCE_PAYLOAD_FIELDS_INVALID:${record?.record_id}`);
  assert(/^PM\d{8}$/.test(ref) && payload.BASE === 'Patrimoine mobilier (Palissy)',
    `PALISSY_MH_PM_REFERENCE_REQUIRED:${record?.record_id}`);
  assert(denominations.some((value) => ALLOWED_DENOMINATIONS.has(normalizedKey(value))),
    `PHYSICAL_COLLECTOR_CAR_DENOMINATION_REQUIRED:${record?.record_id}`);
  assert(asStrings(payload.INSC).some((value) => normalizedKey(value) === 'numéro de série'),
    `SOURCE_SERIAL_TYPE_ASSERTION_REQUIRED:${record?.record_id}`);
  assert(maker && model && chassis, `STRICT_MAKER_MODEL_CHASSIS_GRAMMAR_REQUIRED:${record?.record_id}`);
  assert(record.record_id === `pop-palissy-vehicle:${ref}` &&
    record.official_record_identifier?.authority === 'FR_MINISTRY_CULTURE_POP_PALISSY_MH' &&
    record.official_record_identifier?.value === ref,
  `OFFICIAL_RECORD_BINDING_INVALID:${record?.record_id}`);
  assert(record.vehicle_scope === 'COLLECTOR_CAR' && record.grammar_complete === true,
    `COLLECTOR_CAR_GRAMMAR_FLAG_REQUIRED:${record.record_id}`);
  assert(record.maker?.value === maker.value && record.maker?.role === maker.role && record.maker?.source_field === 'AUTR',
    `SOURCE_ASSERTED_MAKER_BINDING_INVALID:${record.record_id}`);
  assert(record.model?.value === model && record.model?.semantics === 'TYPE' && record.model?.source_field === 'APPL',
    `SOURCE_ASSERTED_MODEL_BINDING_INVALID:${record.record_id}`);
  assert(record.chassis_identifier?.value === chassis &&
    record.chassis_identifier?.semantics === 'SOURCE_ASSERTED_NUMERO_DE_SERIE_NUMERO_DE_CHASSIS' &&
    record.chassis_identifier?.source_field === 'PINS',
  `SOURCE_ASSERTED_CHASSIS_BINDING_INVALID:${record.record_id}`);
  assert(record.source_reference === `https://pop.culture.gouv.fr/notice/palissy/${ref}` &&
    SHA256.test(record.source_payload_sha256 || '') && record.source_payload_sha256 === digest(payload),
  `SOURCE_REFERENCE_OR_DIGEST_INVALID:${record.record_id}`);
  assert(record.rights_state === 'ALLOW' && sameSet(record.license_evidence_refs, LICENSE_REFS),
    `OPEN_LICENSE_EVIDENCE_REQUIRED:${record.record_id}`);
}

function deriveCandidatePools(records) {
  const normalization = records.map((record) => ({
    candidate_id:`pop-palissy-vehicle-normalization:${record.official_record_identifier.value}`,
    case_class:'SAME_OBJECT_NORMALIZATION',
    source_record_id:record.record_id,
    official_record_identifier:record.official_record_identifier.value,
    chassis_identifier:record.chassis_identifier.value,
    maker:record.maker.value,
    model:record.model.value,
    candidate_basis:'ONE_OFFICIAL_RECORD_COASSERTS_POP_REFERENCE_AND_CHASSIS_TEXT',
    candidate_state:'UNLABELED_REVIEW_REQUIRED',
  }));
  const hardNegative = [];
  const sameDesignDifferentObject = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sameMaker = normalizedKey(left.maker.value) === normalizedKey(right.maker.value);
      const sameModel = normalizedKey(left.model.value) === normalizedKey(right.model.value);
      const leftChassis = chassisKey(left.chassis_identifier.value);
      const rightChassis = chassisKey(right.chassis_identifier.value);
      const distinctChassisText = Boolean(leftChassis && rightChassis && leftChassis !== rightChassis);
      if (sameMaker && sameModel && distinctChassisText) {
        sameDesignDifferentObject.push({
          candidate_id:`pop-palissy-vehicle-same-design:${left.official_record_identifier.value}:${right.official_record_identifier.value}`,
          case_class:'SAME_DESIGN_DIFFERENT_OBJECT',
          left_source_record_id:left.record_id,
          right_source_record_id:right.record_id,
          shared_maker:left.maker.value,
          shared_model:left.model.value,
          left_chassis_identifier:left.chassis_identifier.value,
          right_chassis_identifier:right.chassis_identifier.value,
          candidate_basis:'TWO_OFFICIAL_RECORDS_SHARE_EXACT_MAKER_AND_MODEL_TEXT_AND_ASSERT_DISTINCT_CHASSIS_TEXT',
          candidate_state:'UNLABELED_REVIEW_REQUIRED',
        });
      }
      if (sameMaker && !sameModel && distinctChassisText && leftChassis.length === rightChassis.length) {
        hardNegative.push({
          candidate_id:`pop-palissy-vehicle-hard-negative:${left.official_record_identifier.value}:${right.official_record_identifier.value}`,
          case_class:'HARD_NEGATIVE',
          left_source_record_id:left.record_id,
          right_source_record_id:right.record_id,
          shared_maker:left.maker.value,
          left_model:left.model.value,
          right_model:right.model.value,
          left_chassis_identifier:left.chassis_identifier.value,
          right_chassis_identifier:right.chassis_identifier.value,
          confusability_guard:'NORMALIZED_CHASSIS_TEXT_LENGTH_EQUAL',
          candidate_basis:'TWO_OFFICIAL_RECORDS_SHARE_MAKER_AND_CHASSIS_FORMAT_LENGTH_BUT ASSERT_DIFFERENT_MODEL_AND_CHASSIS_TEXT',
          candidate_state:'UNLABELED_REVIEW_REQUIRED',
        });
      }
    }
  }
  return {normalization, hardNegative, sameDesignDifferentObject};
}

const SELECTION_POLICY = {
  order:['SAME_DESIGN_DIFFERENT_OBJECT', 'HARD_NEGATIVE', 'SAME_OBJECT_NORMALIZATION'],
  source_record_reuse_across_selected_cases:'PROHIBITED',
  blind_partition_constraint:'ALL_120_SELECTED_CASES_ARE_GLOBALLY_SOURCE_RECORD_DISJOINT_BEFORE_ANY_60_CASE_BLIND_PARTITION',
  boundary_assignment:{
    SAME_OBJECT_NORMALIZATION:{SOURCE_RECORD:35, PHYSICAL_OBJECT:5},
    HARD_NEGATIVE:{PHYSICAL_OBJECT:30, CANONICAL_DESIGN:10},
    SAME_DESIGN_DIFFERENT_OBJECT:{CANONICAL_DESIGN:40},
  },
};

function candidateSourceRecordIds(candidate) {
  return candidate.case_class === 'SAME_OBJECT_NORMALIZATION'
    ? [candidate.source_record_id]
    : [candidate.left_source_record_id, candidate.right_source_record_id];
}

function takeSourceRecordDisjoint(rows, count, used) {
  const selected = [];
  for (const row of rows) {
    const sourceRecordIds = candidateSourceRecordIds(row);
    if (sourceRecordIds.every((recordId) => recordId && !used.has(recordId))) {
      selected.push(row);
      for (const recordId of sourceRecordIds) used.add(recordId);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function assignBoundary(row, identityBoundary, boundaryAssignmentBasis) {
  return {
    ...row,
    source_record_ids:candidateSourceRecordIds(row),
    identity_boundary:identityBoundary,
    boundary_assignment_basis:boundaryAssignmentBasis,
  };
}

function selectCandidates(pools) {
  const used = new Set();
  const sameDesign = takeSourceRecordDisjoint(pools.sameDesignDifferentObject, 40, used);
  const hardNegative = takeSourceRecordDisjoint(pools.hardNegative, 40, used);
  const normalization = takeSourceRecordDisjoint(pools.normalization, 40, used);
  return {
    SAME_OBJECT_NORMALIZATION:normalization.map((row, index) => index < 35
      ? assignBoundary(row, 'SOURCE_RECORD', 'OFFICIAL_PM_RECORD_AND_NORMALIZED_CHASSIS_REFERENCE_PAIR')
      : assignBoundary(row, 'PHYSICAL_OBJECT', 'ONE_OFFICIAL_RECORD_COASSERTS_A_PHYSICAL_CHASSIS_REFERENCE')),
    HARD_NEGATIVE:hardNegative.map((row, index) => index < 30
      ? assignBoundary(row, 'PHYSICAL_OBJECT', 'DISTINCT_SOURCE_ASSERTED_CHASSIS_REFERENCES_REQUIRE_OBJECT_SEPARATION_REVIEW')
      : assignBoundary(row, 'CANONICAL_DESIGN', 'DISTINCT_SOURCE_ASSERTED_MODEL_TYPES_REQUIRE_DESIGN_SEPARATION_REVIEW')),
    SAME_DESIGN_DIFFERENT_OBJECT:sameDesign.map((row) => assignBoundary(
      row,
      'CANONICAL_DESIGN',
      'SHARED_SOURCE_ASSERTED_MAKER_AND_MODEL_WITH_DISTINCT_CHASSIS_REFERENCES',
    )),
  };
}

function selectedEvidence(selected) {
  const rows = Object.values(selected).flat();
  const sourceRecordIds = rows.flatMap((row) => row.source_record_ids || []);
  const boundaryCounts = rows.reduce((counts, row) => {
    counts[row.identity_boundary] = (counts[row.identity_boundary] || 0) + 1;
    return counts;
  }, {});
  return {
    selectedCount:rows.length,
    selectedSourceRecordCount:new Set(sourceRecordIds).size,
    selectedSourceRecordReuseCount:sourceRecordIds.length - new Set(sourceRecordIds).size,
    boundaryCounts,
    blindPartitionSourceRecordDisjointnessGuaranteed:
      rows.length > 0 && sourceRecordIds.length === new Set(sourceRecordIds).size,
  };
}

function rejectUnsanctionedClaims(value, path = []) {
  if (!value || typeof value !== 'object') return;
  const forbidden = new Set([
    'expected', 'label', 'labels', 'reviewer', 'reviewers', 'model_prediction',
    'ground_truth', 'attestation', 'labels_collected', 'reviewers_assigned',
    'reviewer_a', 'reviewer_b', 'empirical_attestation_created', 'empirical_cases_created',
    'human_review_assignment_created', 'independent_reviewers_assigned',
    'independent_label_review_complete', 'blind_holdout_sealed', 'empirical_benchmark_ready',
    'track_b_started', 'release_authority', 'publication', 'production',
    'market_claims_created', 'spend_authorized', 'ground_truth_created',
    'identity_conclusion', 'identity_decision', 'physical_identity_conclusion',
    'labels_created', 'human_reviewer', 'human_reviewers', 'review_complete',
  ]);
  const sanctioned = new Set([
    'downstream_claims.empirical_cases_created',
    'downstream_claims.labels_collected',
    'downstream_claims.reviewers_assigned',
    'downstream_claims.independent_label_review_complete',
    'downstream_claims.blind_holdout_sealed',
    'downstream_claims.market_claims_created',
    'downstream_claims.spend_authorized',
    'downstream_claims.empirical_benchmark_ready',
    'downstream_claims.track_b_started',
    'downstream_claims.publication',
    'downstream_claims.production',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join('.');
    assert(!forbidden.has(key) || sanctioned.has(pathText),
      `UNSANCTIONED_CASE_LABEL_REVIEW_OR_RELEASE_FIELD:${pathText}`);
    rejectUnsanctionedClaims(child, nextPath);
  }
}

assert(artifact.id === 'kidults-er-vehicle-mechanical-asset-live-capacity-r1', 'CAPACITY_ARTIFACT_ID_INVALID');
assert(sameSet(Object.keys(artifact), [
  'candidate_manifest', 'downstream_claims', 'environment_class', 'generated_at', 'id', 'integrity',
  'metrics', 'probe_status', 'readiness_gate', 'records', 'request_boundary', 'sampling_target',
  'source_admission', 'source_snapshot', 'stratum_id', 'strict_record_grammar', 'truth_boundary', 'version',
  ...(artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED' ? ['failure'] : []),
]), 'CAPACITY_TOP_LEVEL_SCHEMA_INVALID');
assert(artifact.version === '1.1.0', 'CAPACITY_ARTIFACT_VERSION_INVALID');
assert(artifact.stratum_id === STRATUM_ID, 'CAPACITY_STRATUM_INVALID');
assert(isCanonicalTimestamp(artifact.generated_at), 'CAPACITY_GENERATED_AT_INVALID');
assert(COMPLETE_STATUSES.has(artifact.probe_status) || artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED',
  'CAPACITY_PROBE_STATUS_INVALID');
assert(artifact.environment_class === 'READ_ONLY_LIVE_CAPACITY_PREFLIGHT', 'READ_ONLY_ENVIRONMENT_CLASS_REQUIRED');
assert(artifact.request_boundary?.http_method === 'GET' && artifact.request_boundary?.authenticated === false &&
  artifact.request_boundary?.remote_mutation === false && artifact.request_boundary?.local_output_only === true,
  'READ_ONLY_REQUEST_BOUNDARY_REQUIRED');

const {integrity, ...unsealed} = artifact;
assert(sameSet(Object.keys(integrity || {}), ['canonical_payload_sha256']), 'ARTIFACT_INTEGRITY_SCHEMA_INVALID');
assert(SHA256.test(integrity?.canonical_payload_sha256 || ''), 'ARTIFACT_INTEGRITY_DIGEST_REQUIRED');
assert(integrity.canonical_payload_sha256 === digest(unsealed), 'ARTIFACT_INTEGRITY_DIGEST_MISMATCH');
if (COMPLETE_STATUSES.has(artifact.probe_status)) {
  assert(artifact.source_snapshot?.accessed_at === artifact.generated_at,
    'COMPLETE_SOURCE_SNAPSHOT_TIMESTAMP_BINDING_REQUIRED');
  assert(digest(semanticProjection(artifact, COMPLETE_VOLATILE_SEMANTIC_PATHS)) === FROZEN_COMPLETE_SEMANTIC_SHA256,
    'FROZEN_COMPLETE_SEMANTIC_PROJECTION_MISMATCH');
} else {
  assert(sameSet(Object.keys(artifact.failure || {}), ['code']) && artifact.failure.code === FAILURE_CODE,
    'SOURCE_UNAVAILABLE_FAILURE_SCHEMA_INVALID');
  assert(artifact.truth_boundary === FAILURE_TRUTH_BOUNDARY,
    'SOURCE_UNAVAILABLE_TRUTH_BOUNDARY_INVALID');
  assert(digest(semanticProjection(artifact, FAILURE_VOLATILE_SEMANTIC_PATHS)) === FROZEN_FAILURE_SEMANTIC_SHA256,
    'FROZEN_FAILURE_SEMANTIC_PROJECTION_MISMATCH');
}
rejectUnsanctionedClaims(artifact);

assert(artifact.source_snapshot?.source_family === SOURCE_FAMILY &&
  artifact.source_snapshot?.publisher === 'Ministère de la Culture' &&
  artifact.source_snapshot?.database === 'Palissy MH - patrimoine mobilier' &&
  artifact.source_snapshot?.license === 'Licence Ouverte / Open Licence 2.0 (Etalab-2.0)' &&
  artifact.source_snapshot?.rights_scope === 'TEXTUAL_DESCRIPTIVE_NOTICE_DATA_ONLY_NO_IMAGES' &&
  sameSet(artifact.source_snapshot?.license_evidence_refs, LICENSE_REFS),
'OFFICIAL_POP_PALISSY_OPEN_TEXT_SOURCE_BOUNDARY_REQUIRED');
assert(artifact.source_admission?.image_or_media_payloads_admitted === false &&
  artifact.source_admission?.nhtsa_vpic_bulk_use_prohibited === true &&
  artifact.source_admission?.nhtsa_vpic_used === false &&
  artifact.source_admission?.nhtsa_vpic_contribution_to_capacity === 0 &&
  artifact.metrics?.nhtsa_vpic_case_capacity === 0,
'NHTSA_VPIC_ZERO_CAPACITY_AND_IMAGE_EXCLUSION_REQUIRED');

const sample = (sampling.strata || []).find((row) => row.stratum_id === STRATUM_ID);
assert(sample?.cases === 120 && sample?.blind === 60, 'VEHICLE_SAMPLING_120_60_REQUIRED');
assert(sample?.case_class_targets?.SAME_OBJECT_NORMALIZATION === 40 &&
  sample?.case_class_targets?.HARD_NEGATIVE === 40 &&
  sample?.case_class_targets?.SAME_DESIGN_DIFFERENT_OBJECT === 40,
'VEHICLE_SAMPLING_CLASS_40_40_40_REQUIRED');
assert(sample?.identity_boundary_targets?.SOURCE_RECORD === 35 &&
  sample?.identity_boundary_targets?.PHYSICAL_OBJECT === 35 &&
  sample?.identity_boundary_targets?.CANONICAL_DESIGN === 50,
'VEHICLE_SAMPLING_BOUNDARY_35_35_50_REQUIRED');
assert(artifact.sampling_target?.cases === 120 && artifact.sampling_target?.blind === 60 &&
  artifact.sampling_target?.per_class?.SAME_OBJECT_NORMALIZATION === 40 &&
  artifact.sampling_target?.per_class?.HARD_NEGATIVE === 40 &&
  artifact.sampling_target?.per_class?.SAME_DESIGN_DIFFERENT_OBJECT === 40 &&
  artifact.sampling_target?.per_boundary?.SOURCE_RECORD === 35 &&
  artifact.sampling_target?.per_boundary?.PHYSICAL_OBJECT === 35 &&
  artifact.sampling_target?.per_boundary?.CANONICAL_DESIGN === 50 &&
  artifact.sampling_target?.selected_source_record_count === 200,
'CAPACITY_SAMPLING_TARGET_BINDING_INVALID');

const requiredGrammar = [
  'official_palissy_mh_pm_reference',
  'physical_collector_car_denomination',
  'single_source_asserted_maker_with_usine_constructeur_or_fabricant_role',
  'source_asserted_type_model_in_collection_schlumpf_appellation',
  'source_asserted_numero_de_serie_numero_de_chassis',
];
assert(sameSet(artifact.strict_record_grammar?.required, requiredGrammar) &&
  artifact.strict_record_grammar?.no_physical_identity_inference === true &&
  artifact.strict_record_grammar?.candidate_classification_requires_independent_review === true,
'STRICT_SOURCE_GRAMMAR_AND_NO_INFERENCE_BOUNDARY_REQUIRED');

assert(Array.isArray(artifact.records), 'CAPACITY_RECORD_ARRAY_REQUIRED');
const refs = artifact.records.map((record) => record.official_record_identifier?.value);
const recordIds = artifact.records.map((record) => record.record_id);
assert(refs.length === new Set(refs).size && recordIds.length === new Set(recordIds).size,
  'CAPACITY_RECORD_REFERENCES_MUST_BE_UNIQUE');
assert(JSON.stringify(refs) === JSON.stringify([...refs].sort((left, right) => left.localeCompare(right))),
  'CAPACITY_RECORDS_MUST_BE_DETERMINISTICALLY_SORTED');
for (const record of artifact.records) validateRecord(record);

const pools = deriveCandidatePools(artifact.records);
const selectedExpected = selectCandidates(pools);
assert(artifact.candidate_manifest?.manifest_state === 'UNLABELED_SOURCE_EVIDENCE_CANDIDATES_ONLY' &&
  artifact.candidate_manifest?.labels_present === false &&
  artifact.candidate_manifest?.model_predictions_present === false &&
  JSON.stringify(artifact.candidate_manifest?.selection_policy) === JSON.stringify(SELECTION_POLICY),
'UNLABELED_CANDIDATE_MANIFEST_BOUNDARY_REQUIRED');
assert(JSON.stringify(artifact.candidate_manifest?.selected) === JSON.stringify(selectedExpected),
  'DETERMINISTIC_CANDIDATE_SELECTION_MISMATCH');
for (const rows of Object.values(selectedExpected)) {
  for (const row of rows) {
    assert(row.candidate_state === 'UNLABELED_REVIEW_REQUIRED' &&
      !Object.hasOwn(row, 'expected') && !Object.hasOwn(row, 'label') &&
      !Object.hasOwn(row, 'reviewer') && !Object.hasOwn(row, 'model_prediction'),
    `CANDIDATE_MUST_REMAIN_UNLABELED:${row.candidate_id}`);
  }
}

const evidence = selectedEvidence(selectedExpected);
const selectedCount = evidence.selectedCount;
const metrics = artifact.metrics || {};
assert(metrics.strict_grammar_complete_real_record_count === artifact.records.length &&
  metrics.same_object_normalization_candidate_count === pools.normalization.length &&
  metrics.hard_negative_candidate_pair_count === pools.hardNegative.length &&
  metrics.same_design_different_object_candidate_pair_count === pools.sameDesignDifferentObject.length &&
  metrics.selected_unlabeled_case_candidate_count === selectedCount &&
  metrics.selected_source_record_count === evidence.selectedSourceRecordCount &&
  metrics.selected_source_record_reuse_count === evidence.selectedSourceRecordReuseCount &&
  metrics.source_record_boundary_candidate_count === (evidence.boundaryCounts.SOURCE_RECORD || 0) &&
  metrics.physical_object_boundary_candidate_count === (evidence.boundaryCounts.PHYSICAL_OBJECT || 0) &&
  metrics.canonical_design_boundary_candidate_count === (evidence.boundaryCounts.CANONICAL_DESIGN || 0) &&
  metrics.blind_partition_source_record_disjointness_guaranteed === evidence.blindPartitionSourceRecordDisjointnessGuaranteed,
'SOURCE_CAPACITY_METRICS_DERIVATION_MISMATCH');
const conservativeCapacity = evidence.selectedSourceRecordReuseCount === 0 ? selectedCount : 0;
assert(metrics.conservative_case_capacity === conservativeCapacity, 'CONSERVATIVE_CASE_CAPACITY_MISMATCH');

const complete = COMPLETE_STATUSES.has(artifact.probe_status);
if (complete) {
  assert(artifact.source_admission?.pop_palissy_mh_open_text_admitted === true,
    'COMPLETE_PROBE_SOURCE_ADMISSION_REQUIRED');
  assert(Number.isInteger(metrics.live_search_total_hit_count) &&
    metrics.live_search_total_hit_count === metrics.live_search_returned_hit_count &&
    metrics.live_search_total_hit_count <= 1000,
  'COMPLETE_LIVE_SEARCH_CENSUS_REQUIRED');
  const query = artifact.source_snapshot?.search_query;
  assert(query?.endpoint === SEARCH_ENDPOINT && query?.http_method === 'GET' &&
    sameSet(query?.parameters?.bases, ['palissy']) && query?.parameters?.size === 1000 &&
    query?.parameters?.text === 'automobile' && query?.complete_census === true &&
    query?.total_hits === metrics.live_search_total_hit_count &&
    query?.returned_hits === metrics.live_search_returned_hit_count && SHA256.test(query?.response_sha256 || '') &&
    query?.response_digest_scope === 'CANONICAL_COMPLETE_SELECTION_INPUT_PROJECTION_ALL_RETURNED_HITS' &&
    query?.response_projection_hit_count === metrics.live_search_returned_hit_count &&
    query?.admitted_records_projection_sha256 === digest(artifact.records.map((record) => ({
      record_id:record.record_id,
      source_payload_sha256:record.source_payload_sha256,
    }))),
  'OFFICIAL_POP_COMPLETE_QUERY_SNAPSHOT_REQUIRED');
  assert(!/nhtsa|vpic/i.test(query.endpoint), 'NHTSA_VPIC_ENDPOINT_PROHIBITED');
  assert(artifact.source_snapshot?.license_snapshots?.conditions_general_use?.url === POP_CGU &&
    artifact.source_snapshot?.license_snapshots?.conditions_general_use?.required_marker === 'Licence etalab-2.0' &&
    SHA256.test(artifact.source_snapshot?.license_snapshots?.conditions_general_use?.response_sha256 || '') &&
    artifact.source_snapshot?.license_snapshots?.open_data_inventory?.url === POP_OPEN_DATA &&
    sameSet(artifact.source_snapshot?.license_snapshots?.open_data_inventory?.required_markers, ['Palissy MH', 'OpenData']) &&
    SHA256.test(artifact.source_snapshot?.license_snapshots?.open_data_inventory?.response_sha256 || ''),
  'LIVE_RIGHTS_SNAPSHOT_EVIDENCE_REQUIRED');
  assert(metrics.live_search_total_hit_count >= artifact.records.length, 'ELIGIBLE_RECORDS_EXCEED_SEARCH_CENSUS');
}

const requirements = artifact.readiness_gate?.requirements || {};
assert(requirements.strict_grammar_complete_record_floor === 120 &&
  requirements.same_object_normalization_candidate_floor === 40 &&
  requirements.hard_negative_candidate_floor === 40 &&
  requirements.same_design_different_object_candidate_floor === 40 &&
  requirements.selected_unlabeled_case_candidate_floor === 120 &&
  requirements.blind_source_record_capacity_floor === 60 &&
  requirements.selected_source_record_count_required === 200 &&
  requirements.selected_source_record_reuse_maximum === 0 &&
  requirements.source_record_boundary_candidate_count_required === 35 &&
  requirements.physical_object_boundary_candidate_count_required === 35 &&
  requirements.canonical_design_boundary_candidate_count_required === 50,
'READINESS_REQUIREMENT_FLOORS_INVALID');
const expectedChecks = {
  strict_grammar_complete_record_floor_met:artifact.records.length >= 120,
  same_object_normalization_candidate_floor_met:pools.normalization.length >= 40,
  hard_negative_candidate_floor_met:pools.hardNegative.length >= 40,
  same_design_different_object_candidate_floor_met:pools.sameDesignDifferentObject.length >= 40,
  selected_unlabeled_case_candidate_floor_met:selectedCount >= 120,
  blind_source_record_capacity_floor_met:evidence.selectedSourceRecordCount >= 60,
  selected_source_record_count_exact:evidence.selectedSourceRecordCount === 200,
  selected_source_record_reuse_prohibited:evidence.selectedSourceRecordReuseCount === 0,
  source_record_boundary_target_exact:(evidence.boundaryCounts.SOURCE_RECORD || 0) === 35,
  physical_object_boundary_target_exact:(evidence.boundaryCounts.PHYSICAL_OBJECT || 0) === 35,
  canonical_design_boundary_target_exact:(evidence.boundaryCounts.CANONICAL_DESIGN || 0) === 50,
  blind_partition_source_record_disjointness_guaranteed:evidence.blindPartitionSourceRecordDisjointnessGuaranteed === true,
  conservative_120_case_class_capacity_met:conservativeCapacity >= 120,
};
assert(JSON.stringify(artifact.readiness_gate?.checks) === JSON.stringify(expectedChecks),
  'READINESS_CHECK_DERIVATION_MISMATCH');
const expectedReady = complete && Object.values(expectedChecks).every(Boolean);
assert(artifact.readiness_gate?.source_capacity_ready_for_120_cases === expectedReady,
  'SOURCE_CAPACITY_120_READINESS_MISMATCH');
assert((expectedReady && artifact.probe_status === 'COMPLETE_SOURCE_CAPACITY_READY') ||
  (!expectedReady && artifact.probe_status !== 'COMPLETE_SOURCE_CAPACITY_READY'),
'PROBE_STATUS_READINESS_CONTRADICTION');
assert((expectedReady && artifact.readiness_gate?.acquisition_lane_state === 'START_READY_SOURCE_ACQUISITION_UNLABELED') ||
  (!expectedReady && artifact.readiness_gate?.acquisition_lane_state === 'SOURCE_FIT_REVALIDATION_REQUIRED'),
'ACQUISITION_LANE_STATE_MISMATCH');
assert(expectedReady || (Array.isArray(artifact.readiness_gate?.blockers) && artifact.readiness_gate.blockers.length > 0),
  'FAIL_CLOSED_EXACT_BLOCKERS_REQUIRED');

const downstream = artifact.downstream_claims || {};
assert(downstream.empirical_cases_created === 0 && downstream.labels_collected === 0 &&
  downstream.reviewers_assigned === 0 && downstream.independent_label_review_complete === false &&
  downstream.blind_holdout_sealed === false && downstream.market_claims_created === 0 &&
  downstream.spend_authorized === false && downstream.empirical_benchmark_ready === false &&
  downstream.track_b_started === false && downstream.publication === 'HOLD' && downstream.production === 'HOLD',
'DOWNSTREAM_FAIL_CLOSED_BOUNDARY_REQUIRED');

console.log(JSON.stringify({
  status:'PASS',
  artifact_id:artifact.id,
  probe_status:artifact.probe_status,
  strict_grammar_complete_real_record_count:artifact.records.length,
  same_object_normalization_candidate_count:pools.normalization.length,
  hard_negative_candidate_pair_count:pools.hardNegative.length,
  same_design_different_object_candidate_pair_count:pools.sameDesignDifferentObject.length,
  selected_unlabeled_case_candidate_count:selectedCount,
  selected_source_record_count:evidence.selectedSourceRecordCount,
  selected_source_record_reuse_count:evidence.selectedSourceRecordReuseCount,
  identity_boundary_counts:evidence.boundaryCounts,
  conservative_case_capacity:conservativeCapacity,
  source_capacity_ready_for_120_cases:expectedReady,
  production:'HOLD',
}, null, 2));
