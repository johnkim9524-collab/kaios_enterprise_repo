import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath = '/tmp/er-real-world-r7h.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7g-pressing-minimums-r7h.mjs <r7g.json> <manifest.json> [r7h.json]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-pressing-edition-media';
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7g-variant-minimums';
const EXPECTED_INPUT_SCOPE = 'R7G_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_SERIALIZED_VEHICLE_COMPLETE_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_INPUT_CASE_COUNT = 14;
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_TARGET_MISSING_CASE_CLASSES = ['HARD_NEGATIVE', 'SAME_OBJECT_NORMALIZATION'];
const EXPECTED_TARGET_MISSING_BOUNDARIES = ['PHYSICAL_OBJECT'];
const WIKIDATA_RIGHTS_URL = 'https://www.wikidata.org/wiki/Wikidata:Licensing';

const sortedUnique = (values) => [...new Set(values)].sort();
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sameStrings = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  new Set(left).size === left.length && new Set(right).size === right.length &&
  JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const validSourceEvidence = (evidence) =>
  typeof evidence?.source_url === 'string' && /^https:\/\//.test(evidence.source_url) &&
  /^sha256:[a-f0-9]{64}$/.test(evidence?.source_payload_sha256 || '') &&
  Array.isArray(evidence?.license_evidence_refs) && evidence.license_evidence_refs.length > 0 &&
  evidence.license_evidence_refs.every((ref) => typeof ref === 'string' && /^https:\/\//.test(ref));

const constructedControlInput = dataset.id === EXPECTED_INPUT_ID && dataset.dataset_scope === EXPECTED_INPUT_SCOPE &&
  dataset.dataset_class === 'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL' && dataset.synthetic === false &&
  dataset.constructed_control === true && dataset.empirical_benchmark_eligible === false &&
  dataset.independent_label_review_complete === false && dataset.label_adjudication_complete === false &&
  dataset.holdout_sealed_before_modeling === false && dataset.track_b_independent_review_complete === false &&
  dataset.pre_track_b_promotion_eligible === false && dataset.production_promotion_authorized === false &&
  dataset.production === 'HOLD' && /^sha256:[a-f0-9]{64}$/.test(dataset.prior_input_sha256 || '') &&
  dataset.prior_input_sha256_role === 'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE' &&
  dataset.scope_stratification_status === 'INCOMPLETE' && Array.isArray(dataset.cases) &&
  dataset.cases.length === EXPECTED_INPUT_CASE_COUNT && new Set(dataset.cases.map((item) => item.case_id)).size === dataset.cases.length &&
  dataset.cases.every((item) => typeof item.case_id === 'string' && item.case_id.trim()) &&
  sameStrings(dataset.represented_approved_strata_ids, EXPECTED_REPRESENTED_STRATA) &&
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 &&
    item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7G_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7G_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

const manifestByStratum = new Map((manifest.strata || []).map((row) => [row.stratum_id, row]));
const representedFromCases = sortedUnique(dataset.cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const representedGrammarValid = EXPECTED_REPRESENTED_STRATA.every((stratumId) => {
  const row = manifestByStratum.get(stratumId);
  const rows = dataset.cases.filter((item) => item.scope_id === stratumId);
  const allowedClasses = new Set(row?.minimum_case_classes || []);
  const allowedBoundaries = new Set(row?.minimum_boundaries || []);
  return rows.length >= 1 && rows.every((item) =>
    allowedClasses.has(item.case_class) && allowedBoundaries.has(item.identity_boundary));
});
if (!sameStrings(representedFromCases, EXPECTED_REPRESENTED_STRATA) ||
    !sameStrings(representedFromCases, dataset.represented_approved_strata_ids) || !representedGrammarValid) {
  throw new Error('R7G_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || [])
  .filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || [])
  .filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) ||
    !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7G_PRESSING_TARGET_DEFICIT_MISMATCH');
}

const timeoutMs = 18000;
async function fetchJson(url, headers = {}, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0', ...headers},
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}
function strings(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => typeof value === 'string' && value.trim());
}
function items(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}
function label(entity) {
  return entity?.labels?.en?.value ?? entity?.labels?.mul?.value ?? entity?.id ?? null;
}
function qidFromUri(value) {
  return String(value ?? '').match(/\/entity\/(Q\d+)$/)?.[1] ?? null;
}
const entityUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const sourceEvidence = (qid, payload) => ({
  source_url:entityUrl(qid),
  source_payload_sha256:digest(payload),
  license_evidence_refs:[WIKIDATA_RIGHTS_URL],
});

const usedQids = new Set();
for (const item of dataset.cases.filter((value) => value.scope_id === STRATUM)) {
  for (const side of [item.left, item.right]) {
    for (const value of [side?.wikidata_bridge, side?.entity_id, side?.unique_keys?.object_id]) {
      if (typeof value === 'string' && /^Q\d+$/.test(value)) usedQids.add(value);
    }
  }
}

const normalizationQuery = 'SELECT ?item ?mbid WHERE { ?item wdt:P5813 ?mbid . } ORDER BY STR(?item) LIMIT 700';
const normalizationResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(normalizationQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const normalizationCandidates = [];
for (const row of normalizationResult?.results?.bindings ?? []) {
  const qid = qidFromUri(row?.item?.value);
  const mbid = String(row?.mbid?.value ?? '').trim();
  if (qid && mbid && !usedQids.has(qid)) normalizationCandidates.push({qid, mbid});
}
const normalization = [...new Map(normalizationCandidates
  .sort((left, right) => compareText([left.qid, left.mbid].join('\0'), [right.qid, right.mbid].join('\0')))
  .map((item) => [[item.qid, item.mbid].join('\0'), item])).values()][0] || null;
if (!normalization) throw new Error('NO_INDEPENDENT_PRESSING_NORMALIZATION_CANDIDATE');
const normalizationPayload = await fetchJson(entityUrl(normalization.qid));
const normalizationEntity = normalizationPayload?.entities?.[normalization.qid];
if (!normalizationEntity || !strings(normalizationEntity, 'P5813').includes(normalization.mbid)) {
  throw new Error('PRESSING_NORMALIZATION_SOURCE_PAYLOAD_REVALIDATION_FAILED');
}

const normalizationAnchor = `wikidata-pressing-release:${normalization.qid}`;
const sameObject = {
  case_id:`wikidata-pressing-normalization-${normalization.qid}`,
  case_class:'SAME_OBJECT_NORMALIZATION', identity_boundary:'SOURCE_RECORD', scope_id:STRATUM,
  expected:'MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  individual_copy_evidence:false, physical_instance_evidence:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    anchors:{SOURCE_RECORD:normalizationAnchor}, unique_keys:{reference_id:`wikidata:${normalization.qid}`},
    external_system:'Wikidata', external_id:normalization.qid, wikidata_bridge:normalization.qid,
    label:label(normalizationEntity), source:'wikidata-structured-data',
  },
  right:{
    anchors:{SOURCE_RECORD:normalizationAnchor}, unique_keys:{reference_id:`musicbrainz-release:${normalization.mbid}`},
    external_system:'MusicBrainzReleaseID', external_id:normalization.mbid, wikidata_bridge:normalization.qid,
    label:label(normalizationEntity), source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${normalization.qid}:entity-id`,
    `wikidata:${normalization.qid}:P5813:${normalization.mbid}`,
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_BINDING_ONE_RELEASE_ITEM_TO_ITS_MUSICBRAINZ_RELEASE_IDENTIFIER',
  source_evidence:[sourceEvidence(normalization.qid, normalizationPayload)],
  claim_ceiling:'PRESSING_RELEASE_SOURCE_RECORD_NORMALIZATION_MECHANICS_ONLY_NO_INDIVIDUAL_COPY_PHYSICAL_INSTANCE_OR_MARKET_EVIDENCE',
};

const hardNegativeQuery = 'SELECT ?left ?right ?work ?leftRelease ?rightRelease WHERE { ?left wdt:P629 ?work ; wdt:P5813 ?leftRelease . ?right wdt:P629 ?work ; wdt:P5813 ?rightRelease . FILTER(STR(?left) < STR(?right)) FILTER(?leftRelease != ?rightRelease) } ORDER BY STR(?work) STR(?left) STR(?right) LIMIT 700';
const hardNegativeResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(hardNegativeQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const hardCandidates = [];
for (const row of hardNegativeResult?.results?.bindings ?? []) {
  const leftQid = qidFromUri(row?.left?.value);
  const rightQid = qidFromUri(row?.right?.value);
  const workQid = qidFromUri(row?.work?.value);
  const leftRelease = String(row?.leftRelease?.value ?? '').trim();
  const rightRelease = String(row?.rightRelease?.value ?? '').trim();
  if (leftQid && rightQid && workQid && leftRelease && rightRelease && leftQid !== rightQid &&
      leftRelease !== rightRelease && !usedQids.has(leftQid) && !usedQids.has(rightQid) &&
      leftQid !== normalization.qid && rightQid !== normalization.qid) {
    hardCandidates.push({leftQid, rightQid, workQid, leftRelease, rightRelease});
  }
}
const hardPair = [...new Map(hardCandidates
  .sort((left, right) => compareText(
    [left.workQid, left.leftQid, left.rightQid, left.leftRelease, left.rightRelease].join('\0'),
    [right.workQid, right.leftQid, right.rightQid, right.leftRelease, right.rightRelease].join('\0'),
  ))
  .map((item) => [[item.leftQid, item.rightQid, item.workQid, item.leftRelease, item.rightRelease].join('\0'), item])).values()][0] || null;
if (!hardPair) throw new Error('NO_PRESSING_HARD_NEGATIVE_PAIR');

const [leftPayload, rightPayload] = await Promise.all([
  fetchJson(entityUrl(hardPair.leftQid)),
  fetchJson(entityUrl(hardPair.rightQid)),
]);
const leftEntity = leftPayload?.entities?.[hardPair.leftQid];
const rightEntity = rightPayload?.entities?.[hardPair.rightQid];
if (!leftEntity || !rightEntity) throw new Error('PRESSING_HARD_NEGATIVE_ENTITYDATA_MISSING');
if (!items(leftEntity, 'P629').includes(hardPair.workQid) || !items(rightEntity, 'P629').includes(hardPair.workQid)) {
  throw new Error('PRESSING_SHARED_RELEASE_WORK_SOURCE_PAYLOAD_REVALIDATION_FAILED');
}
if (!strings(leftEntity, 'P5813').includes(hardPair.leftRelease) ||
    !strings(rightEntity, 'P5813').includes(hardPair.rightRelease)) {
  throw new Error('PRESSING_DISTINCT_RELEASE_ID_SOURCE_PAYLOAD_REVALIDATION_FAILED');
}

const hardNegative = {
  case_id:`wikidata-pressing-hard-negative-${hardPair.leftQid}-${hardPair.rightQid}`,
  case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'NO_MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  individual_copy_evidence:false, physical_instance_evidence:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    anchors:{PHYSICAL_OBJECT:`music-release-manifestation:${hardPair.leftQid}:${hardPair.leftRelease}`},
    unique_keys:{object_id:hardPair.leftQid, reference_id:hardPair.leftRelease},
    release_work_id:hardPair.workQid, label:label(leftEntity), source:'wikidata-structured-data',
  },
  right:{
    anchors:{PHYSICAL_OBJECT:`music-release-manifestation:${hardPair.rightQid}:${hardPair.rightRelease}`},
    unique_keys:{object_id:hardPair.rightQid, reference_id:hardPair.rightRelease},
    release_work_id:hardPair.workQid, label:label(rightEntity), source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${hardPair.leftQid}:P629:${hardPair.workQid}`,
    `wikidata:${hardPair.rightQid}:P629:${hardPair.workQid}`,
    `wikidata:${hardPair.leftQid}:P5813:${hardPair.leftRelease}`,
    `wikidata:${hardPair.rightQid}:P5813:${hardPair.rightRelease}`,
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_WIKIDATA_RELEASE_ITEMS_OF_ONE_PARENT_WORK_WITH_DISTINCT_MUSICBRAINZ_RELEASE_IDENTIFIERS',
  source_evidence:[
    sourceEvidence(hardPair.leftQid, leftPayload),
    sourceEvidence(hardPair.rightQid, rightPayload),
  ],
  claim_ceiling:'PRESSING_RELEASE_MANIFESTATION_HARD_NEGATIVE_MECHANICS_ONLY_NO_INDIVIDUAL_COPY_PHYSICAL_INSTANCE_OR_CURRENT_MARKET_EVIDENCE',
};

for (const item of [sameObject, hardNegative]) {
  if (dataset.cases.some((existing) => existing.case_id === item.case_id)) {
    throw new Error(`DUPLICATE_R7H_CASE:${item.case_id}`);
  }
}
const cases = [...dataset.cases, sameObject, hardNegative];
const represented = sortedUnique(cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7H_PRESSING_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}

const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7h-pressing-minimums',
  dataset_scope:'R7H_PARTIAL_APPROVED_STRATA_5_OF_7_FOUR_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', synthetic:false, constructed_control:true,
  empirical_benchmark_eligible:false, independent_label_review_complete:false, label_adjudication_complete:false,
  holdout_sealed_before_modeling:false, track_b_independent_review_complete:false,
  pre_track_b_promotion_eligible:false, production_promotion_authorized:false, production:'HOLD',
  scope_stratification_status:'INCOMPLETE', approved_scope_ids:manifest.approved_strata_ids,
  required_scope_ids:manifest.required_strata_ids, approved_strata_manifest_id:manifest.id,
  represented_approved_strata_ids:represented, r7h_individual_copy_observation_count:0,
  r7h_physical_instance_observation_count:0, r7h_marketplace_observation_count:0,
  r7h_current_market_observation_count:0, cases, prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7H adds two live-source-derived, algorithmically labeled PRESSING_EDITION_MEDIA constructed controls. SOURCE_RECORD normalization is release-identifier mechanics. The literal PHYSICAL_OBJECT hard-negative is release-manifestation mechanics without individual-copy or physical-instance evidence. Neither case contains marketplace or current-market observations, independent review, adjudication, or blind holdout. Four of seven stratum grammars may be mechanically complete, but empirical accuracy, remaining strata, Track B, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  normalization,
  hard_negative:hardPair,
  represented_approved_strata_ids:represented,
  production:'HOLD',
}, null, 2));
