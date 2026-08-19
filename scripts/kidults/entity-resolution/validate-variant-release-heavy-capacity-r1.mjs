import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseJsonNoDuplicateKeys } from './parse-json-no-duplicate-keys.mjs';

const [artifactPath, samplingPath] = process.argv.slice(2);
if (!artifactPath || !samplingPath) {
  throw new Error('usage: node validate-variant-release-heavy-capacity-r1.mjs <capacity.json> <sampling-plan.json>');
}

const [artifactText, samplingText] = await Promise.all([
  fs.readFile(artifactPath, 'utf8'),
  fs.readFile(samplingPath, 'utf8'),
]);
const artifact = parseJsonNoDuplicateKeys(artifactText, artifactPath);
const sampling = parseJsonNoDuplicateKeys(samplingText, samplingPath);
const STRATUM_ID = 'er-stratum-variant-release-heavy';
const COMPLETE_STATUSES = new Set(['COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY', 'COMPLETE_SOURCE_CAPACITY_READY']);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const QID = /^Q\d+$/;
const FROZEN_COMPLETE_SEMANTIC_SHA256 = 'sha256:a4553b2ad7774b89becc3a69f6fbd9561c65e27866925e806fd4e1c8fb231be7';
const FROZEN_FAILURE_SEMANTIC_SHA256 = 'sha256:11c16e74dc45a1118e60f13af2366edb6507035aacb686c25e065a01d1dc4d80';
const COMPLETE_VOLATILE_SEMANTIC_PATHS = new Set(['generated_at', 'integrity', 'source_snapshot.accessed_at']);
const FAILURE_VOLATILE_SEMANTIC_PATHS = new Set(['generated_at', 'integrity', 'source_snapshot.accessed_at']);
const FAILURE_TRUTH_BOUNDARY = 'The live source census did not complete, so every capacity and readiness claim fails closed. No inferred identity or downstream authority is created.';
const FAILURE_CODE = 'SOURCE_PROBE_UNAVAILABLE';
const SCOPE_CLASSES = {
  Q1929383:'sneakers',
  Q467505:'handbags',
  Q11460:'designer_garments_broad_clothing_anchor',
  Q5422874:'eyewear',
};
const EXCLUDED_CLASSES = {
  Q178794:'watch',
  Q26965868:'wristwatch',
  Q5362345:'smartwatch',
  Q125454714:'digital_watch',
};
const DETAIL_LIMIT = 1000;
const DETAIL_QUERY = `SELECT DISTINCT ?item ?scopeClass ?scopePath ?modelNumber ?excludedClass ?exclusionPath WHERE {
  ?item wdt:P13351 ?modelNumber .
  VALUES ?scopeClass { ${Object.keys(SCOPE_CLASSES).map((qid) => `wd:${qid}`).join(' ')} }
  {
    ?item wdt:P31/wdt:P279* ?scopeClass .
    BIND("P31_PATH" AS ?scopePath)
  }
  UNION
  {
    ?item wdt:P279+ ?scopeClass .
    BIND("P279_PATH" AS ?scopePath)
  }
  OPTIONAL {
    VALUES ?excludedClass { ${Object.keys(EXCLUDED_CLASSES).map((qid) => `wd:${qid}`).join(' ')} }
    {
      ?item wdt:P31/wdt:P279* ?excludedClass .
      BIND("P31_PATH" AS ?exclusionPath)
    }
    UNION
    {
      ?item wdt:P279+ ?excludedClass .
      BIND("P279_PATH" AS ?exclusionPath)
    }
  }
} ORDER BY ?item ?scopeClass ?scopePath ?modelNumber ?excludedClass ?exclusionPath LIMIT ${DETAIL_LIMIT}`;

// The probe deliberately stores only a digest of each full Special:EntityData
// response, not the response body. Keep the complete source observation bound
// offline by freezing both that full-payload digest and a digest of every
// source-derived field retained in the artifact. A source refresh must update
// this manifest and the committed observation together.
const FROZEN_COMPLETE_SOURCE_OBSERVATION = {
  wdqs_detail_binding_count:12,
  detail_query_response_sha256:'sha256:3d9dd4035fc04024cc9b09fe3c746c004f0effc7ce0fe3f7c5712fd5fada7c0d',
  rejected_records:{
    Q132158487:{
      source_payload_sha256:'sha256:b7e208e78f7b8e47d7ec09f86cba837f65f81921ec23c969b4122cabb5ff014e',
      source_projection_sha256:'sha256:03870c36a078c1d60c9dd3c735117f16bb78c9c9cfb6a31fa422cd68bcf3df4e',
    },
    Q30896835:{
      source_payload_sha256:'sha256:f040099fd4c66edf35a4cdd60470f47ff79df55978835f7c227418b4b0da1072',
      source_projection_sha256:'sha256:55812db9d835a55f27d999bbf0cede959df721bb4927c07a6ddefea4e951f151',
    },
    Q30898963:{
      source_payload_sha256:'sha256:cc3e5f51fac44b1106b2b92d48116a066464a7accae4095938af066ff3521e02',
      source_projection_sha256:'sha256:4802fb3bec108941e3423c7e63e967f93ff01555742d9963004a429ba83a3d89',
    },
  },
};

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sortedUnique = (values) => [...new Set(values)].sort();
const firstExclusive = (candidateValues, otherValues) => candidateValues.find((value) => !otherValues.includes(value));
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  left.length === new Set(left).size && right.length === new Set(right).size &&
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const assert = (condition, code) => { if (!condition) throw new Error(code); };
assert(firstExclusive(['shared', 'left-only'], ['shared', 'right-only']) === 'left-only' &&
  firstExclusive(['shared', 'right-only'], ['shared', 'left-only']) === 'right-only',
'SET_DIFFERENCE_SELECTION_REGRESSION');
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

function sourceDerivedProjection(record) {
  return {
    item_qid:record.item_qid,
    scope_class_qids:record.scope_class_qids,
    scope_paths:record.scope_paths,
    model_or_style_codes_p13351:record.model_or_style_codes_p13351,
    brand_or_maker_qids:record.brand_or_maker_qids,
    color_qids_p462:record.color_qids_p462,
    material_qids_p186:record.material_qids_p186,
    variant_discriminators:record.variant_discriminators,
    series_or_part_of_qids:record.series_or_part_of_qids,
    gtin_identifiers_p3962:record.gtin_identifiers_p3962,
    excluded_cross_stratum_class_qids:record.excluded_cross_stratum_class_qids,
    reject_reasons:record.reject_reasons,
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
    'nonclaims.empirical_cases_created',
    'nonclaims.ground_truth_created',
    'nonclaims.human_review_assignment_created',
    'nonclaims.blind_holdout_sealed',
    'nonclaims.empirical_benchmark_ready',
    'nonclaims.track_b_started',
    'nonclaims.release_authority',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join('.');
    assert(!forbidden.has(key) || sanctioned.has(pathText),
      `UNSANCTIONED_CASE_LABEL_REVIEW_OR_RELEASE_FIELD:${pathText}`);
    rejectUnsanctionedClaims(child, nextPath);
  }
}

function deriveHardNegativeCandidates(records) {
  const candidates = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sharedBrands = left.brand_or_maker_qids.filter((qid) => right.brand_or_maker_qids.includes(qid));
      const sharedSeries = left.series_or_part_of_qids.filter((qid) => right.series_or_part_of_qids.includes(qid));
      const sharedScopes = left.scope_class_qids.filter((qid) => right.scope_class_qids.includes(qid));
      const leftCode = firstExclusive(left.model_or_style_codes_p13351, right.model_or_style_codes_p13351);
      const rightCode = firstExclusive(right.model_or_style_codes_p13351, left.model_or_style_codes_p13351);
      const leftVariant = firstExclusive(left.variant_discriminators, right.variant_discriminators);
      const rightVariant = firstExclusive(right.variant_discriminators, left.variant_discriminators);
      if (sharedBrands.length && sharedSeries.length && sharedScopes.length && leftCode && rightCode && leftVariant && rightVariant) {
        candidates.push({
          left_record_id:left.record_id,
          right_record_id:right.record_id,
          shared_brand_or_maker_qid:sharedBrands.sort()[0],
          shared_series_or_part_of_qid:sharedSeries.sort()[0],
          shared_scope_class_qid:sharedScopes.sort()[0],
          left_model_or_style_code_p13351:leftCode,
          right_model_or_style_code_p13351:rightCode,
          left_variant_discriminator:leftVariant,
          right_variant_discriminator:rightVariant,
          disposition:'UNLABELED_REVIEW_CANDIDATE_ONLY',
        });
      }
    }
  }
  return candidates;
}

{
  const fixture = deriveHardNegativeCandidates([
    {record_id:'left', brand_or_maker_qids:['QBRAND'], series_or_part_of_qids:['QSERIES'], scope_class_qids:['QSCOPE'],
      model_or_style_codes_p13351:['shared-code', 'left-only-code'], variant_discriminators:['shared-variant', 'left-only-variant']},
    {record_id:'right', brand_or_maker_qids:['QBRAND'], series_or_part_of_qids:['QSERIES'], scope_class_qids:['QSCOPE'],
      model_or_style_codes_p13351:['shared-code', 'right-only-code'], variant_discriminators:['shared-variant', 'right-only-variant']},
  ]);
  assert(fixture.length === 1 && fixture[0].left_model_or_style_code_p13351 === 'left-only-code' &&
    fixture[0].right_model_or_style_code_p13351 === 'right-only-code' &&
    fixture[0].left_variant_discriminator === 'left-only-variant' &&
    fixture[0].right_variant_discriminator === 'right-only-variant',
  'HARD_NEGATIVE_CALL_SITE_SET_DIFFERENCE_REGRESSION');
}

function deriveNormalizationCandidates(records) {
  return records.map((record) => ({
    record_id:record.record_id,
    wikidata_entity_id:record.item_qid,
    model_or_style_code_p13351:record.model_or_style_codes_p13351[0],
    disposition:'SOURCE_REPRESENTATION_UNLABELED_REVIEW_CANDIDATE_ONLY',
  }));
}

function deriveCrossAuthorityCandidates(records) {
  const candidates = [];
  for (const record of records) {
    for (const code of record.model_or_style_codes_p13351) {
      for (const gtin of record.gtin_identifiers_p3962) {
        candidates.push({
          record_id:record.record_id,
          wikidata_entity_id:record.item_qid,
          model_or_style_code_p13351:code,
          gtin_p3962:gtin,
          disposition:'CROSS_AUTHORITY_UNLABELED_REVIEW_CANDIDATE_ONLY',
        });
      }
    }
  }
  return candidates;
}

function assertSortedUniqueStrings(values, code, allowEmpty = true) {
  assert(Array.isArray(values) && (allowEmpty || values.length > 0) &&
    values.every((value) => typeof value === 'string' && value.trim()) &&
    values.length === new Set(values).size && JSON.stringify(values) === JSON.stringify([...values].sort()), code);
}

assert(artifact.id === 'kidults-er-variant-release-heavy-live-capacity-r1', 'CAPACITY_ARTIFACT_ID_INVALID');
assert(sameSet(Object.keys(artifact), [
  'candidate_records', 'collectibles_only_scope', 'cross_authority_alias_candidates', 'environment_class',
  'explicit_variant_hard_negative_candidates', 'generated_at', 'id', 'integrity', 'metrics', 'nonclaims',
  'probe_status', 'readiness_gate', 'rejected_records', 'request_boundary', 'rights_boundary',
  'same_object_normalization_candidates', 'sampling_target', 'source_snapshot', 'stratum_id',
  'strict_record_grammar', 'truth_boundary', 'version',
  ...(artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED' ? ['failure'] : []),
]), 'CAPACITY_TOP_LEVEL_SCHEMA_INVALID');
assert(artifact.version === '1.0.0', 'CAPACITY_ARTIFACT_VERSION_INVALID');
assert(artifact.stratum_id === STRATUM_ID, 'CAPACITY_STRATUM_INVALID');
assert(isCanonicalTimestamp(artifact.generated_at), 'CAPACITY_GENERATED_AT_INVALID');
assert(COMPLETE_STATUSES.has(artifact.probe_status) || artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED',
  'CAPACITY_PROBE_STATUS_INVALID');
assert(artifact.environment_class === 'READ_ONLY_LIVE_CAPACITY_PREFLIGHT', 'READ_ONLY_ENVIRONMENT_CLASS_REQUIRED');
assert(artifact.request_boundary?.http_method === 'GET' && artifact.request_boundary?.authenticated === false &&
  artifact.request_boundary?.remote_mutation === false && artifact.request_boundary?.local_output_only === true,
  'READ_ONLY_REQUEST_BOUNDARY_REQUIRED');
assert(artifact.rights_boundary?.source_family === 'wikidata-cc0-structured-data' &&
  artifact.rights_boundary?.license === 'CC0-1.0' &&
  artifact.rights_boundary?.license_evidence_ref === 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  'WIKIDATA_CC0_RIGHTS_BOUNDARY_REQUIRED');
assert(sameSet(artifact.rights_boundary?.admitted_data, ['WDQS_STRUCTURED_BINDINGS', 'SPECIAL_ENTITY_DATA_STRUCTURED_CLAIMS']),
  'STRUCTURED_SOURCE_DATA_ONLY_REQUIRED');
for (const exclusion of ['IMAGES', 'FREE_TEXT_MINED_VARIANT_IDENTITY', 'MARKETPLACE_OBSERVATIONS', 'CURRENT_PRICE', 'RETAILER_ASSERTIONS']) {
  assert(artifact.rights_boundary?.excluded_data?.includes(exclusion), `EXCLUDED_DATA_BOUNDARY_REQUIRED:${exclusion}`);
}
assert(JSON.stringify(artifact.collectibles_only_scope?.admitted_scope_class_qids) === JSON.stringify(SCOPE_CLASSES),
  'COLLECTIBLES_SCOPE_CLASSES_EXACT_BINDING_REQUIRED');
assert(JSON.stringify(artifact.collectibles_only_scope?.cross_stratum_exclusion_class_qids) === JSON.stringify(EXCLUDED_CLASSES),
  'WATCH_SCOPE_LEAKAGE_EXCLUSIONS_EXACT_BINDING_REQUIRED');

const {integrity, ...unsealed} = artifact;
assert(sameSet(Object.keys(integrity || {}), ['canonical_payload_sha256']), 'ARTIFACT_INTEGRITY_SCHEMA_INVALID');
assert(SHA256.test(integrity?.canonical_payload_sha256 || ''), 'ARTIFACT_INTEGRITY_DIGEST_REQUIRED');
assert(integrity.canonical_payload_sha256 === digest(unsealed), 'ARTIFACT_INTEGRITY_DIGEST_MISMATCH');
if (COMPLETE_STATUSES.has(artifact.probe_status)) {
  assert(digest(semanticProjection(artifact, COMPLETE_VOLATILE_SEMANTIC_PATHS)) === FROZEN_COMPLETE_SEMANTIC_SHA256,
    'FROZEN_COMPLETE_SEMANTIC_PROJECTION_MISMATCH');
} else {
  assert(artifact.source_snapshot?.accessed_at === artifact.generated_at,
    'SOURCE_UNAVAILABLE_SNAPSHOT_TIMESTAMP_BINDING_REQUIRED');
  assert(sameSet(Object.keys(artifact.failure || {}), ['code']) && artifact.failure.code === FAILURE_CODE,
    'SOURCE_UNAVAILABLE_FAILURE_SCHEMA_INVALID');
  assert(artifact.truth_boundary === FAILURE_TRUTH_BOUNDARY,
    'SOURCE_UNAVAILABLE_TRUTH_BOUNDARY_INVALID');
  assert(digest(semanticProjection(artifact, FAILURE_VOLATILE_SEMANTIC_PATHS)) === FROZEN_FAILURE_SEMANTIC_SHA256,
    'FROZEN_FAILURE_SEMANTIC_PROJECTION_MISMATCH');
}
rejectUnsanctionedClaims(artifact);

const sample = (sampling.strata || []).find((row) => row.stratum_id === STRATUM_ID);
assert(sample?.cases === 120 && sample?.blind === 60, 'VARIANT_SAMPLING_120_60_REQUIRED');
assert(sample?.case_class_targets?.HARD_NEGATIVE === 40 &&
  sample?.case_class_targets?.CROSS_MARKET_ALIAS === 40 &&
  sample?.case_class_targets?.SAME_OBJECT_NORMALIZATION === 40,
  'VARIANT_SAMPLING_CLASS_40_40_40_REQUIRED');
assert(artifact.sampling_target?.cases === sample.cases && artifact.sampling_target?.blind === sample.blind &&
  artifact.sampling_target?.per_class?.HARD_NEGATIVE === 40 &&
  artifact.sampling_target?.per_class?.CROSS_MARKET_ALIAS === 40 &&
  artifact.sampling_target?.per_class?.SAME_OBJECT_NORMALIZATION === 40,
  'CAPACITY_SAMPLING_TARGET_BINDING_INVALID');

assert(sameSet(artifact.strict_record_grammar?.required, [
  'collectibles_only_fashion_scope_path',
  'brand_or_maker_p176_or_p1716',
  'model_or_style_code_p13351',
  'explicit_color_p462_or_material_p186',
]), 'STRICT_VARIANT_RECORD_GRAMMAR_REQUIRED');
for (const disallowed of ['INFERRED_VARIANT_IDENTITY', 'TEXT_MINED_STYLE_COLOR_SIZE_OR_SEASON',
  'GENERIC_CLOTHING_ITEM_WITH_CROSS_STRATUM_WATCH_PATH', 'MARKETPLACE_OR_RETAIL_LISTING_ID',
  'CURRENT_PRICE_OR_AVAILABILITY', 'MUSEUM_ACCESSION_NUMBER_ALONE_AS_STYLE_CODE']) {
  assert(artifact.strict_record_grammar?.disallowed_substitutions?.includes(disallowed),
    `DISALLOWED_SUBSTITUTION_REQUIRED:${disallowed}`);
}

assert(Array.isArray(artifact.candidate_records) && Array.isArray(artifact.rejected_records) &&
  Array.isArray(artifact.same_object_normalization_candidates) &&
  Array.isArray(artifact.explicit_variant_hard_negative_candidates) &&
  Array.isArray(artifact.cross_authority_alias_candidates), 'CAPACITY_ARRAYS_REQUIRED');
const allRecords = [...artifact.candidate_records, ...artifact.rejected_records];
const recordIds = allRecords.map((record) => record.record_id);
const itemQids = allRecords.map((record) => record.item_qid);
const complete = COMPLETE_STATUSES.has(artifact.probe_status);
const candidateRecordIds = new Set(artifact.candidate_records.map((record) => record.record_id));
assert(recordIds.length === new Set(recordIds).size && itemQids.length === new Set(itemQids).size,
  'CAPACITY_RECORDS_MUST_BE_UNIQUE');

for (const record of allRecords) {
  const baseRecordKeys = [
    'brand_or_maker_qids', 'color_qids_p462', 'gtin_identifiers_p3962', 'item_qid',
    'material_qids_p186', 'model_or_style_codes_p13351', 'record_id', 'scope_class_qids',
    'scope_paths', 'series_or_part_of_qids', 'source_evidence', 'variant_discriminators',
  ];
  const shapeKeys = candidateRecordIds.has(record.record_id)
    ? [...baseRecordKeys, 'disposition', 'grammar_complete']
    : [...baseRecordKeys, 'excluded_cross_stratum_class_qids', 'reject_reasons'];
  assert(sameSet(Object.keys(record), shapeKeys), `CAPACITY_RECORD_SCHEMA_INVALID:${record.record_id}`);
  assert(record.record_id === `wikidata-variant-release:${record.item_qid}` && QID.test(record.item_qid || ''),
    `RECORD_ID_OR_ITEM_QID_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.scope_class_qids, `SCOPE_CLASSES_INVALID:${record.record_id}`, false);
  assert(record.scope_class_qids.every((qid) => Object.hasOwn(SCOPE_CLASSES, qid)),
    `OUTSIDE_COLLECTIBLES_SCOPE_CLASS:${record.record_id}`);
  assertSortedUniqueStrings(record.scope_paths, `SCOPE_PATHS_INVALID:${record.record_id}`, false);
  assert(record.scope_paths.every((value) => /^(P31_PATH|P279_PATH):Q\d+$/.test(value) &&
    Object.hasOwn(SCOPE_CLASSES, value.split(':')[1])), `SCOPE_PATH_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.model_or_style_codes_p13351, `MODEL_STYLE_CODES_INVALID:${record.record_id}`, false);
  assertSortedUniqueStrings(record.brand_or_maker_qids, `BRAND_MAKER_QIDS_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.color_qids_p462, `COLOR_QIDS_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.material_qids_p186, `MATERIAL_QIDS_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.variant_discriminators, `VARIANT_DISCRIMINATORS_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.series_or_part_of_qids, `SERIES_PART_OF_INVALID:${record.record_id}`);
  assertSortedUniqueStrings(record.gtin_identifiers_p3962, `GTIN_IDENTIFIERS_INVALID:${record.record_id}`);
  assert(record.brand_or_maker_qids.every((qid) => QID.test(qid)) &&
    record.color_qids_p462.every((qid) => QID.test(qid)) &&
    record.material_qids_p186.every((qid) => QID.test(qid)) &&
    record.series_or_part_of_qids.every((qid) => QID.test(qid)), `RELATED_QID_INVALID:${record.record_id}`);
  const expectedVariants = sortedUnique([
    ...record.color_qids_p462.map((qid) => `P462:${qid}`),
    ...record.material_qids_p186.map((qid) => `P186:${qid}`),
  ]);
  assert(JSON.stringify(record.variant_discriminators) === JSON.stringify(expectedVariants),
    `VARIANT_DISCRIMINATOR_DERIVATION_INVALID:${record.record_id}`);
  assert(Array.isArray(record.source_evidence) && record.source_evidence.length === 1,
    `SINGLE_ITEM_SOURCE_EVIDENCE_REQUIRED:${record.record_id}`);
  const evidence = record.source_evidence[0];
  assert(sameSet(Object.keys(evidence), ['entity_id', 'license_evidence_refs', 'source_payload_sha256', 'source_url']),
    `SOURCE_EVIDENCE_SCHEMA_INVALID:${record.record_id}`);
  assert(evidence.entity_id === record.item_qid && evidence.source_url ===
    `https://www.wikidata.org/wiki/Special:EntityData/${record.item_qid}.json` &&
    SHA256.test(evidence.source_payload_sha256 || '') &&
    sameSet(evidence.license_evidence_refs, ['https://www.wikidata.org/wiki/Wikidata:Licensing']),
    `SOURCE_EVIDENCE_INVALID:${record.record_id}`);
  for (const forbidden of ['case_class', 'expected', 'identity_boundary', 'label_basis', 'label_review_status',
    'model_prediction', 'marketplace_evidence', 'current_price']) {
    assert(!Object.hasOwn(record, forbidden), `FORBIDDEN_INFERRED_OR_DOWNSTREAM_FIELD:${record.record_id}:${forbidden}`);
  }
}

for (const record of artifact.candidate_records) {
  assert(record.grammar_complete === true && record.disposition === 'UNLABELED_SOURCE_RECORD_CANDIDATE_ONLY',
    `CANDIDATE_DISPOSITION_INVALID:${record.record_id}`);
  assert(record.brand_or_maker_qids.length > 0 && record.model_or_style_codes_p13351.length > 0 &&
    record.variant_discriminators.length > 0, `CANDIDATE_STRICT_GRAMMAR_INCOMPLETE:${record.record_id}`);
  assert(!Object.hasOwn(record, 'excluded_cross_stratum_class_qids') && !Object.hasOwn(record, 'reject_reasons'),
    `ADMITTED_RECORD_HAS_REJECTION_DATA:${record.record_id}`);
}
for (const record of artifact.rejected_records) {
  assertSortedUniqueStrings(record.excluded_cross_stratum_class_qids,
    `EXCLUDED_CLASS_QIDS_INVALID:${record.record_id}`);
  assert(record.excluded_cross_stratum_class_qids.every((qid) => Object.hasOwn(EXCLUDED_CLASSES, qid)),
    `UNKNOWN_EXCLUDED_CLASS:${record.record_id}`);
  assert(Array.isArray(record.reject_reasons) && record.reject_reasons.length > 0 &&
    record.reject_reasons.length === new Set(record.reject_reasons).size,
    `REJECT_REASONS_REQUIRED:${record.record_id}`);
  const expectedReasons = [];
  if (record.excluded_cross_stratum_class_qids.length) expectedReasons.push('CROSS_STRATUM_WATCH_CLASSIFICATION_PATH');
  if (record.brand_or_maker_qids.length === 0) expectedReasons.push('BRAND_OR_MAKER_P176_P1716_MISSING');
  if (record.model_or_style_codes_p13351.length === 0) expectedReasons.push('MODEL_OR_STYLE_CODE_P13351_MISSING');
  if (record.variant_discriminators.length === 0) expectedReasons.push('EXPLICIT_COLOR_P462_OR_MATERIAL_P186_MISSING');
  assert(JSON.stringify(record.reject_reasons) === JSON.stringify(expectedReasons),
    `REJECT_REASON_DERIVATION_INVALID:${record.record_id}`);
}

if (complete) {
  const frozenQids = Object.keys(FROZEN_COMPLETE_SOURCE_OBSERVATION.rejected_records);
  assert(artifact.candidate_records.length === 0 && sameSet(itemQids, frozenQids),
    'FROZEN_COMPLETE_ENTITY_CENSUS_BINDING_MISMATCH');
  for (const record of artifact.rejected_records) {
    const expected = FROZEN_COMPLETE_SOURCE_OBSERVATION.rejected_records[record.item_qid];
    const evidence = record.source_evidence[0];
    assert(expected && evidence.source_payload_sha256 === expected.source_payload_sha256,
      `FROZEN_ENTITY_PAYLOAD_DIGEST_MISMATCH:${record.item_qid}`);
    assert(digest(sourceDerivedProjection(record)) === expected.source_projection_sha256,
      `FROZEN_ENTITY_SOURCE_PROJECTION_MISMATCH:${record.item_qid}`);
  }
}

const derivedNormalization = deriveNormalizationCandidates(artifact.candidate_records);
const derivedHard = deriveHardNegativeCandidates(artifact.candidate_records);
const derivedAlias = deriveCrossAuthorityCandidates(artifact.candidate_records);
assert(JSON.stringify(artifact.same_object_normalization_candidates) === JSON.stringify(derivedNormalization),
  'NORMALIZATION_CANDIDATE_DERIVATION_MISMATCH');
assert(JSON.stringify(artifact.explicit_variant_hard_negative_candidates) === JSON.stringify(derivedHard),
  'HARD_NEGATIVE_CANDIDATE_DERIVATION_MISMATCH');
assert(JSON.stringify(artifact.cross_authority_alias_candidates) === JSON.stringify(derivedAlias),
  'CROSS_AUTHORITY_CANDIDATE_DERIVATION_MISMATCH');

const metrics = artifact.metrics || {};
if (complete) {
  assert(metrics.wdqs_detail_binding_count === FROZEN_COMPLETE_SOURCE_OBSERVATION.wdqs_detail_binding_count,
    'WDQS_BINDING_COUNT_INVALID');
  assert(metrics.broad_model_code_candidate_count === allRecords.length,
    'BROAD_CANDIDATE_COUNT_MISMATCH');
  assert(metrics.scope_leakage_rejected_item_count === artifact.rejected_records.filter((record) =>
    record.reject_reasons.includes('CROSS_STRATUM_WATCH_CLASSIFICATION_PATH')).length,
  'SCOPE_LEAKAGE_COUNT_MISMATCH');
  assert(metrics.collectibles_scope_admitted_item_count === artifact.candidate_records.length &&
    metrics.grammar_complete_collectibles_record_count === artifact.candidate_records.length &&
    metrics.same_object_normalization_candidate_count === derivedNormalization.length,
  'ADMITTED_RECORD_CAPACITY_METRICS_MISMATCH');
  assert(metrics.explicit_variant_hard_negative_candidate_count === derivedHard.length &&
    metrics.cross_authority_alias_candidate_count === derivedAlias.length,
  'PAIR_CAPACITY_METRICS_MISMATCH');
  assert(artifact.source_snapshot?.source_family === 'wikidata-cc0-fashion-product-model-structured-data' &&
    artifact.source_snapshot?.accessed_at === artifact.generated_at &&
    artifact.source_snapshot?.detail_query?.endpoint === 'https://query.wikidata.org/sparql' &&
    artifact.source_snapshot?.detail_query?.sparql === DETAIL_QUERY &&
    artifact.source_snapshot?.detail_query?.limit === DETAIL_LIMIT &&
    artifact.source_snapshot?.detail_query?.truncated === false &&
    artifact.source_snapshot?.detail_query?.response_sha256 ===
      FROZEN_COMPLETE_SOURCE_OBSERVATION.detail_query_response_sha256,
  'COMPLETE_LIVE_SOURCE_SNAPSHOT_REQUIRED');
  assert(metrics.wdqs_detail_binding_count < artifact.source_snapshot.detail_query.limit,
    'WDQS_DETAIL_LIMIT_MUST_NOT_BE_REACHED');
  const query = artifact.source_snapshot.detail_query.sparql;
  for (const token of ['P13351', 'P31', 'P279', ...Object.keys(SCOPE_CLASSES), ...Object.keys(EXCLUDED_CLASSES)]) {
    assert(query.includes(token), `STRICT_QUERY_TOKEN_REQUIRED:${token}`);
  }
} else {
  assert(artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED' && allRecords.length === 0 &&
    derivedNormalization.length === 0 && derivedHard.length === 0 && derivedAlias.length === 0,
  'SOURCE_UNAVAILABLE_MUST_HAVE_ZERO_OBSERVED_RECORDS');
  for (const value of Object.values(metrics)) assert(value === null, 'SOURCE_UNAVAILABLE_METRICS_MUST_BE_NULL');
}

const expectedConservativeCapacity = complete ?
  Math.min(40, derivedNormalization.length) + Math.min(40, derivedHard.length) + Math.min(40, derivedAlias.length) : null;
assert(metrics.conservative_case_capacity === expectedConservativeCapacity,
  'CONSERVATIVE_CASE_CAPACITY_MISMATCH');
const requirements = artifact.readiness_gate?.requirements || {};
assert(requirements.grammar_complete_collectibles_record_floor === 120 &&
  requirements.same_object_normalization_candidate_floor === 40 &&
  requirements.explicit_variant_hard_negative_candidate_floor === 40 &&
  requirements.cross_authority_alias_candidate_floor === 40 &&
  requirements.blind_source_record_capacity_floor === 60,
  'READINESS_REQUIREMENT_FLOORS_INVALID');
const expectedChecks = {
  complete_live_census:complete,
  grammar_complete_collectibles_record_floor_met:complete && artifact.candidate_records.length >= 120,
  same_object_normalization_candidate_floor_met:complete && derivedNormalization.length >= 40,
  explicit_variant_hard_negative_candidate_floor_met:complete && derivedHard.length >= 40,
  cross_authority_alias_candidate_floor_met:complete && derivedAlias.length >= 40,
  blind_source_record_capacity_floor_met:complete && artifact.candidate_records.length >= 60,
  conservative_120_case_class_capacity_met:complete && expectedConservativeCapacity >= 120,
};
assert(JSON.stringify(artifact.readiness_gate?.checks) === JSON.stringify(expectedChecks),
  'READINESS_CHECK_DERIVATION_MISMATCH');
const expectedReady = Object.values(expectedChecks).every(Boolean);
assert(artifact.readiness_gate?.source_capacity_ready_for_120_cases === expectedReady,
  'SOURCE_CAPACITY_READINESS_MISMATCH');
assert((expectedReady && artifact.probe_status === 'COMPLETE_SOURCE_CAPACITY_READY') ||
  (!expectedReady && artifact.probe_status !== 'COMPLETE_SOURCE_CAPACITY_READY'),
  'PROBE_STATUS_READINESS_CONTRADICTION');
assert(artifact.readiness_gate?.acquisition_lane_state ===
  (expectedReady ? 'SOURCE_CAPACITY_READY_HUMAN_PROCESS_REQUIRED' : 'SOURCE_FIT_REVALIDATION_REQUIRED'),
  'ACQUISITION_LANE_STATE_MISMATCH');
const expectedBlockers = [];
if (!expectedChecks.complete_live_census) expectedBlockers.push('COMPLETE_LIVE_CENSUS_REQUIRED');
if (!expectedChecks.grammar_complete_collectibles_record_floor_met) expectedBlockers.push(`GRAMMAR_COMPLETE_COLLECTIBLES_RECORDS_${complete ? artifact.candidate_records.length : 'UNKNOWN'}_OF_120`);
if (!expectedChecks.same_object_normalization_candidate_floor_met) expectedBlockers.push(`SAME_OBJECT_NORMALIZATION_CANDIDATES_${complete ? derivedNormalization.length : 'UNKNOWN'}_OF_40`);
if (!expectedChecks.explicit_variant_hard_negative_candidate_floor_met) expectedBlockers.push(`EXPLICIT_VARIANT_HARD_NEGATIVE_CANDIDATES_${complete ? derivedHard.length : 'UNKNOWN'}_OF_40`);
if (!expectedChecks.cross_authority_alias_candidate_floor_met) expectedBlockers.push(`CROSS_AUTHORITY_ALIAS_CANDIDATES_${complete ? derivedAlias.length : 'UNKNOWN'}_OF_40`);
if (!expectedChecks.blind_source_record_capacity_floor_met) expectedBlockers.push(`BLIND_SOURCE_RECORD_CAPACITY_${complete ? artifact.candidate_records.length : 'UNKNOWN'}_OF_60`);
if (!expectedChecks.conservative_120_case_class_capacity_met) expectedBlockers.push(`CONSERVATIVE_CASE_CAPACITY_${complete ? expectedConservativeCapacity : 'UNKNOWN'}_OF_120`);
if (complete && metrics.scope_leakage_rejected_item_count > 0 && artifact.candidate_records.length === 0) {
  expectedBlockers.push(`BROAD_CLOTHING_MODEL_CODE_CANDIDATES_${allRecords.length}_ALL_REJECTED_AS_CROSS_STRATUM_WATCH_LEAKAGE`);
}
const actualBlockers = artifact.readiness_gate?.blockers;
assert(Array.isArray(actualBlockers), 'FAIL_CLOSED_BLOCKERS_ARRAY_REQUIRED');
if (complete) {
  assert(JSON.stringify(actualBlockers) === JSON.stringify(expectedBlockers), 'READINESS_BLOCKERS_DERIVATION_MISMATCH');
} else {
  assert(JSON.stringify(actualBlockers.slice(0, expectedBlockers.length)) === JSON.stringify(expectedBlockers) &&
    actualBlockers.length === expectedBlockers.length + 1 && actualBlockers.at(-1) === 'LIVE_SOURCE_PROBE_UNAVAILABLE',
  'SOURCE_UNAVAILABLE_BLOCKERS_DERIVATION_MISMATCH');
}

assert(artifact.nonclaims?.empirical_cases_created === 0 && artifact.nonclaims?.ground_truth_created === false &&
  artifact.nonclaims?.human_review_assignment_created === false && artifact.nonclaims?.blind_holdout_sealed === false &&
  artifact.nonclaims?.empirical_benchmark_ready === false && artifact.nonclaims?.track_b_started === false &&
  artifact.nonclaims?.release_authority === 'NONE', 'DOWNSTREAM_NONCLAIMS_REQUIRED');

console.log(JSON.stringify({
  status:'PASS',
  artifact_id:artifact.id,
  probe_status:artifact.probe_status,
  broad_model_code_candidate_count:complete ? allRecords.length : null,
  scope_leakage_rejected_item_count:metrics.scope_leakage_rejected_item_count,
  grammar_complete_collectibles_record_count:complete ? artifact.candidate_records.length : null,
  same_object_normalization_candidate_count:complete ? derivedNormalization.length : null,
  explicit_variant_hard_negative_candidate_count:complete ? derivedHard.length : null,
  cross_authority_alias_candidate_count:complete ? derivedAlias.length : null,
  conservative_case_capacity:expectedConservativeCapacity,
  source_capacity_ready_for_120_cases:expectedReady,
}, null, 2));
