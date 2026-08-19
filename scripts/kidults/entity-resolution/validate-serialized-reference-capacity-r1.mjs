import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [artifactPath, samplingPath] = process.argv.slice(2);
if (!artifactPath || !samplingPath) {
  throw new Error('usage: node validate-serialized-reference-capacity-r1.mjs <capacity.json> <sampling-plan.json>');
}

const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
const sampling = JSON.parse(await fs.readFile(samplingPath, 'utf8'));
const STRATUM_ID = 'er-stratum-serialized-reference';
const COMPLETE_STATUSES = new Set(['COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY', 'COMPLETE_SOURCE_CAPACITY_READY']);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const QID = /^Q\d+$/;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sortedUnique = (values) => [...new Set(values)].sort();
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  left.length === new Set(left).size && right.length === new Set(right).size &&
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const assert = (condition, code) => { if (!condition) throw new Error(code); };

assert(artifact.id === 'kidults-er-serialized-reference-live-capacity-r1', 'CAPACITY_ARTIFACT_ID_INVALID');
assert(artifact.version === '1.0.0', 'CAPACITY_ARTIFACT_VERSION_INVALID');
assert(artifact.stratum_id === STRATUM_ID, 'CAPACITY_STRATUM_INVALID');
assert(!Number.isNaN(Date.parse(artifact.generated_at)), 'CAPACITY_GENERATED_AT_INVALID');
assert(COMPLETE_STATUSES.has(artifact.probe_status) || artifact.probe_status === 'SOURCE_UNAVAILABLE_FAIL_CLOSED', 'CAPACITY_PROBE_STATUS_INVALID');
assert(artifact.environment_class === 'READ_ONLY_LIVE_CAPACITY_PREFLIGHT', 'READ_ONLY_ENVIRONMENT_CLASS_REQUIRED');
assert(artifact.request_boundary?.http_method === 'GET' && artifact.request_boundary?.authenticated === false &&
  artifact.request_boundary?.remote_mutation === false && artifact.request_boundary?.local_output_only === true,
  'READ_ONLY_REQUEST_BOUNDARY_REQUIRED');
assert(artifact.source_snapshot?.source_family === 'wikidata-cc0-structured-data' &&
  artifact.source_snapshot?.license === 'CC0-1.0' &&
  artifact.source_snapshot?.license_evidence_ref === 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  'WIKIDATA_CC0_SOURCE_BOUNDARY_REQUIRED');

const {integrity, ...unsealed} = artifact;
assert(SHA256.test(integrity?.canonical_payload_sha256 || ''), 'ARTIFACT_INTEGRITY_DIGEST_REQUIRED');
assert(integrity.canonical_payload_sha256 === digest(unsealed), 'ARTIFACT_INTEGRITY_DIGEST_MISMATCH');

const sample = (sampling.strata || []).find((row) => row.stratum_id === STRATUM_ID);
assert(sample?.cases === 120 && sample?.blind === 60, 'SERIALIZED_SAMPLING_120_60_REQUIRED');
assert(sample?.case_class_targets?.SAME_OBJECT_NORMALIZATION === 40 &&
  sample?.case_class_targets?.HARD_NEGATIVE === 40 &&
  sample?.case_class_targets?.CROSS_MARKET_ALIAS === 40,
  'SERIALIZED_SAMPLING_CLASS_40_40_40_REQUIRED');
assert(artifact.sampling_target?.cases === sample.cases && artifact.sampling_target?.blind === sample.blind,
  'CAPACITY_SAMPLING_TARGET_BINDING_INVALID');
assert(artifact.sampling_target?.per_class?.SAME_OBJECT_NORMALIZATION === 40 &&
  artifact.sampling_target?.per_class?.HARD_NEGATIVE === 40 &&
  artifact.sampling_target?.per_class?.CROSS_MARKET_ALIAS === 40,
  'CAPACITY_SAMPLING_CLASS_BINDING_INVALID');

const requiredGrammar = [
  'maker_or_manufacturer_p176',
  'product_model_or_reference_p31_with_path_to_q10929058',
  'manufacturer_serial_p2598',
  'inventory_reference_p217_qualified_by_collection_p195',
];
assert(sameSet(artifact.strict_record_grammar?.required, requiredGrammar), 'STRICT_RECORD_GRAMMAR_REQUIRED');
assert(artifact.source_admission?.met_accession_number_only_product_identifier_admitted === false &&
  artifact.source_admission?.met_accession_number_only_contribution_to_capacity === 0 &&
  artifact.metrics?.met_accession_number_only_case_capacity === 0,
  'MET_ACCESSION_NUMBER_ALONE_MUST_CONTRIBUTE_ZERO_CAPACITY');

assert(Array.isArray(artifact.records) && Array.isArray(artifact.same_model_distinct_serial_hard_negative_pairs),
  'CAPACITY_RECORD_ARRAYS_REQUIRED');
const recordIds = artifact.records.map((record) => record.record_id);
const itemQids = artifact.records.map((record) => record.item_qid);
assert(recordIds.length === new Set(recordIds).size && itemQids.length === new Set(itemQids).size,
  'CAPACITY_RECORDS_MUST_BE_UNIQUE_BY_RECORD_AND_ITEM');

const globalAliasKeys = new Set();
for (const record of artifact.records) {
  assert(record.record_id === `wikidata-serialized-reference:${record.item_qid}` && QID.test(record.item_qid || ''),
    `RECORD_ID_OR_ITEM_QID_INVALID:${record.record_id}`);
  assert(typeof record.item_label === 'string' && record.item_label.trim(), `ITEM_LABEL_REQUIRED:${record.record_id}`);
  assert(record.grammar_complete === true, `GRAMMAR_COMPLETE_FLAG_REQUIRED:${record.record_id}`);
  assert(Array.isArray(record.makers) && record.makers.length > 0 && Array.isArray(record.models) && record.models.length > 0,
    `MAKER_AND_MODEL_REQUIRED:${record.record_id}`);
  assert(Array.isArray(record.manufacturer_serials_p2598) && record.manufacturer_serials_p2598.length > 0 &&
    record.manufacturer_serials_p2598.length === new Set(record.manufacturer_serials_p2598).size,
    `P2598_SERIALS_REQUIRED_AND_UNIQUE:${record.record_id}`);
  assert(Array.isArray(record.inventory_references_p217) && record.inventory_references_p217.length > 0 &&
    record.inventory_references_p217.length === new Set(record.inventory_references_p217).size,
    `P217_INVENTORIES_REQUIRED_AND_UNIQUE:${record.record_id}`);
  assert(Array.isArray(record.inventory_collections_p195) && record.inventory_collections_p195.length > 0,
    `P195_COLLECTION_REQUIRED:${record.record_id}`);
  const makerIds = record.makers.map((row) => row.qid);
  const modelIds = record.models.map((row) => row.qid);
  const collectionIds = record.inventory_collections_p195.map((row) => row.qid);
  assert(makerIds.every((qid) => QID.test(qid)) && makerIds.length === new Set(makerIds).size,
    `MAKER_QIDS_INVALID:${record.record_id}`);
  assert(modelIds.every((qid) => QID.test(qid)) && modelIds.length === new Set(modelIds).size,
    `MODEL_QIDS_INVALID:${record.record_id}`);
  assert(collectionIds.every((qid) => QID.test(qid)) && collectionIds.length === new Set(collectionIds).size,
    `COLLECTION_QIDS_INVALID:${record.record_id}`);
  assert(record.makers.every((row) => typeof row.label === 'string' && row.label.trim() &&
    Array.isArray(row.paths) && row.paths.length > 0 && row.paths.every((value) => ['ITEM_P176', 'MODEL_P176'].includes(value))),
    `MAKER_PATH_OR_LABEL_INVALID:${record.record_id}`);
  assert(record.models.every((row) => typeof row.label === 'string' && row.label.trim() &&
    row.classification_basis === 'WDQS_PATH_TO_PRODUCT_MODEL_CLASS_Q10929058'),
    `STRICT_PRODUCT_MODEL_CLASSIFICATION_REQUIRED:${record.record_id}`);
  assert(record.inventory_collections_p195.every((row) => typeof row.label === 'string' && row.label.trim()),
    `P195_COLLECTION_LABEL_REQUIRED:${record.record_id}`);
  assert(Array.isArray(record.alias_pairs) && record.alias_pairs.length > 0, `ALIAS_PAIRS_REQUIRED:${record.record_id}`);
  const localAliasKeys = new Set();
  for (const pair of record.alias_pairs) {
    assert(typeof pair.manufacturer_serial_p2598 === 'string' && pair.manufacturer_serial_p2598.trim() &&
      typeof pair.inventory_reference_p217 === 'string' && pair.inventory_reference_p217.trim() &&
      pair.manufacturer_serial_p2598 !== pair.inventory_reference_p217,
      `DISTINCT_P2598_P217_PAIR_REQUIRED:${record.record_id}`);
    assert(record.manufacturer_serials_p2598.includes(pair.manufacturer_serial_p2598) &&
      record.inventory_references_p217.includes(pair.inventory_reference_p217) &&
      collectionIds.includes(pair.inventory_collection_p195) && modelIds.includes(pair.model_qid) &&
      makerIds.includes(pair.maker_qid) && ['ITEM_P176', 'MODEL_P176'].includes(pair.maker_path),
      `ALIAS_PAIR_CONTEXT_INVALID:${record.record_id}`);
    const key = [record.item_qid, pair.manufacturer_serial_p2598, pair.inventory_reference_p217,
      pair.inventory_collection_p195].join('\0');
    assert(!localAliasKeys.has(key) && !globalAliasKeys.has(key), `DUPLICATE_ALIAS_PAIR:${record.record_id}`);
    localAliasKeys.add(key);
    globalAliasKeys.add(key);
  }
  assert(Array.isArray(record.source_evidence) && record.source_evidence.length > 0,
    `SOURCE_EVIDENCE_REQUIRED:${record.record_id}`);
  const evidenceIds = new Set(record.source_evidence.map((row) => row.entity_id));
  for (const qid of [record.item_qid, ...makerIds, ...modelIds, ...collectionIds]) {
    assert(evidenceIds.has(qid), `SOURCE_EVIDENCE_ENTITY_MISSING:${record.record_id}:${qid}`);
  }
  assert(record.source_evidence.every((row) => QID.test(row.entity_id || '') &&
    row.source_url === `https://www.wikidata.org/wiki/Special:EntityData/${row.entity_id}.json` &&
    SHA256.test(row.source_payload_sha256 || '') &&
    sameSet(row.license_evidence_refs, ['https://www.wikidata.org/wiki/Wikidata:Licensing'])),
    `SOURCE_EVIDENCE_INVALID:${record.record_id}`);
}

function deriveHardNegativePairs(records) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sharedModels = left.models.map((row) => row.qid).filter((qid) => right.models.some((row) => row.qid === qid));
      const sharedMakers = left.makers.map((row) => row.qid).filter((qid) => right.makers.some((row) => row.qid === qid));
      const leftSerial = left.manufacturer_serials_p2598.find((serial) => !right.manufacturer_serials_p2598.includes(serial));
      const rightSerial = right.manufacturer_serials_p2598.find((serial) => serial !== leftSerial);
      if (sharedModels.length && sharedMakers.length && leftSerial && rightSerial) {
        pairs.push({
          left_record_id:left.record_id,
          right_record_id:right.record_id,
          shared_model_qid:[...sharedModels].sort()[0],
          shared_maker_qid:[...sharedMakers].sort()[0],
          left_manufacturer_serial_p2598:leftSerial,
          right_manufacturer_serial_p2598:rightSerial,
        });
      }
    }
  }
  return pairs;
}

const derivedHardNegativePairs = deriveHardNegativePairs(artifact.records);
assert(JSON.stringify(artifact.same_model_distinct_serial_hard_negative_pairs) === JSON.stringify(derivedHardNegativePairs),
  'HARD_NEGATIVE_PAIR_DERIVATION_MISMATCH');
const metrics = artifact.metrics || {};
const complete = COMPLETE_STATUSES.has(artifact.probe_status);
assert(metrics.source_revalidated_unique_item_count === artifact.records.length &&
  metrics.grammar_complete_real_record_count === artifact.records.length &&
  metrics.normalization_candidate_capacity === artifact.records.length,
  'RECORD_CAPACITY_METRICS_MISMATCH');
assert(metrics.cross_authority_alias_pair_count === globalAliasKeys.size,
  'ALIAS_PAIR_CAPACITY_METRIC_MISMATCH');
assert(metrics.same_model_distinct_serial_hard_negative_pair_count === derivedHardNegativePairs.length,
  'HARD_NEGATIVE_CAPACITY_METRIC_MISMATCH');
const expectedConservativeCapacity = Math.min(40, artifact.records.length) +
  Math.min(40, derivedHardNegativePairs.length) + Math.min(40, globalAliasKeys.size);
assert(metrics.conservative_case_capacity === expectedConservativeCapacity,
  'CONSERVATIVE_CASE_CAPACITY_METRIC_MISMATCH');
if (complete) {
  assert(metrics.wdqs_declared_distinct_item_count === artifact.records.length &&
    Number.isInteger(metrics.wdqs_detail_binding_count) && metrics.wdqs_detail_binding_count >= artifact.records.length,
    'LIVE_CENSUS_REVALIDATION_METRIC_MISMATCH');
  assert(artifact.source_snapshot?.product_model_class?.qid === 'Q10929058' &&
    artifact.source_snapshot?.count_query?.endpoint === 'https://query.wikidata.org/sparql' &&
    artifact.source_snapshot?.detail_query?.endpoint === 'https://query.wikidata.org/sparql' &&
    artifact.source_snapshot?.detail_query?.truncated === false &&
    SHA256.test(artifact.source_snapshot?.count_query?.response_sha256 || '') &&
    SHA256.test(artifact.source_snapshot?.detail_query?.response_sha256 || ''),
    'LIVE_WDQS_SNAPSHOT_EVIDENCE_REQUIRED');
  const queryText = `${artifact.source_snapshot.count_query.sparql}\n${artifact.source_snapshot.detail_query.sparql}`;
  for (const token of ['P2598', 'P217', 'P195', 'P176', 'P31', 'Q10929058']) {
    assert(queryText.includes(token), `STRICT_QUERY_TOKEN_REQUIRED:${token}`);
  }
}

const requirements = artifact.readiness_gate?.requirements || {};
assert(requirements.grammar_complete_record_floor === 120 && requirements.normalization_candidate_floor === 40 &&
  requirements.same_model_distinct_serial_hard_negative_pair_floor === 40 &&
  requirements.cross_authority_alias_pair_floor === 40 && requirements.blind_source_record_capacity_floor === 60,
  'READINESS_REQUIREMENT_FLOORS_INVALID');
const expectedChecks = {
  grammar_complete_record_floor_met:artifact.records.length >= 120,
  normalization_candidate_floor_met:artifact.records.length >= 40,
  same_model_distinct_serial_hard_negative_pair_floor_met:derivedHardNegativePairs.length >= 40,
  cross_authority_alias_pair_floor_met:globalAliasKeys.size >= 40,
  blind_source_record_capacity_floor_met:artifact.records.length >= 60,
  conservative_120_case_class_capacity_met:expectedConservativeCapacity >= 120,
};
assert(JSON.stringify(artifact.readiness_gate?.checks) === JSON.stringify(expectedChecks),
  'READINESS_CHECK_DERIVATION_MISMATCH');
const expectedReady = complete && Object.values(expectedChecks).every(Boolean);
assert(artifact.readiness_gate?.source_capacity_ready_for_120_cases === expectedReady,
  'SOURCE_CAPACITY_120_READINESS_MISMATCH');
assert((expectedReady && artifact.probe_status === 'COMPLETE_SOURCE_CAPACITY_READY') ||
  (!expectedReady && artifact.probe_status !== 'COMPLETE_SOURCE_CAPACITY_READY'),
  'PROBE_STATUS_READINESS_CONTRADICTION');
assert((expectedReady && artifact.readiness_gate?.acquisition_lane_state === 'SOURCE_CAPACITY_READY_REVIEW_REQUIRED') ||
  (!expectedReady && artifact.readiness_gate?.acquisition_lane_state === 'SOURCE_FIT_REVALIDATION_REQUIRED'),
  'ACQUISITION_LANE_STATE_MISMATCH');
assert(expectedReady || (Array.isArray(artifact.readiness_gate?.blockers) && artifact.readiness_gate.blockers.length > 0),
  'FAIL_CLOSED_BLOCKERS_REQUIRED');

assert(artifact.downstream_claims?.empirical_cases_created === 0 && artifact.downstream_claims?.labels_collected === 0 &&
  artifact.downstream_claims?.independent_label_review_complete === false &&
  artifact.downstream_claims?.blind_holdout_sealed === false &&
  artifact.downstream_claims?.empirical_benchmark_ready === false &&
  artifact.downstream_claims?.track_b_started === false &&
  artifact.downstream_claims?.public_release === 'HOLD' && artifact.downstream_claims?.production === 'HOLD',
  'DOWNSTREAM_FAIL_CLOSED_BOUNDARY_REQUIRED');

console.log(JSON.stringify({
  status:'PASS',
  artifact_id:artifact.id,
  probe_status:artifact.probe_status,
  grammar_complete_real_record_count:artifact.records.length,
  cross_authority_alias_pair_count:globalAliasKeys.size,
  same_model_distinct_serial_hard_negative_pair_count:derivedHardNegativePairs.length,
  conservative_case_capacity:expectedConservativeCapacity,
  source_capacity_ready_for_120_cases:expectedReady,
  production:'HOLD',
}, null, 2));
