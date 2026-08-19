import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath = '/tmp/er-real-world-r7g.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7f-variant-minimums-r7g.mjs <r7f.json> <manifest.json> [r7g.json]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-variant-release-heavy';
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7f-vehicle-minimums';
const EXPECTED_INPUT_SCOPE = 'R7F_PARTIAL_APPROVED_STRATA_5_OF_7_VEHICLE_AND_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_INPUT_CASE_COUNT = 12;
const EXPECTED_TARGET_MISSING_CASE_CLASSES = ['CROSS_MARKET_ALIAS', 'HARD_NEGATIVE'];
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
  dataset.r7e_marketplace_observation_count === 0 && dataset.r7e_current_market_observation_count === 0 &&
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 &&
    item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7F_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7F_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

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
  throw new Error('R7F_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || [])
  .filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || [])
  .filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) ||
    !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7F_VARIANT_TARGET_DEFICIT_MISMATCH');
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
const entityUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const sourceEvidence = (qid, payload) => ({
  source_url:entityUrl(qid),
  source_payload_sha256:digest(payload),
  license_evidence_refs:[WIKIDATA_RIGHTS_URL],
});

const hardNegativeQuery = 'SELECT ?item ?modelNumber ?manufacturer WHERE { ?item wdt:P13351 ?modelNumber ; wdt:P176 ?manufacturer . } ORDER BY STR(?manufacturer) STR(?item) LIMIT 900';
const hardNegativeResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(hardNegativeQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const rawRows = (hardNegativeResult?.results?.bindings ?? []).map((row) => ({
  qid:String(row?.item?.value ?? '').match(/\/entity\/(Q\d+)$/)?.[1],
  maker:String(row?.manufacturer?.value ?? '').match(/\/entity\/(Q\d+)$/)?.[1],
  code:String(row?.modelNumber?.value ?? '').trim(),
})).filter((item) => item.qid && item.maker && item.code)
  .sort((left, right) => compareText(
    [left.maker, left.qid, left.code].join('\0'),
    [right.maker, right.qid, right.code].join('\0'),
  ));
const rows = [];
const seenMakerItem = new Set();
for (const item of rawRows) {
  const key = `${item.maker}\0${item.qid}`;
  if (!seenMakerItem.has(key)) {
    seenMakerItem.add(key);
    rows.push(item);
  }
}
const byMaker = new Map();
for (const item of rows) {
  const values = byMaker.get(item.maker) ?? [];
  if (!values.some((value) => value.qid === item.qid)) values.push(item);
  byMaker.set(item.maker, values);
}
let pair = null;
outer: for (const [maker, values] of [...byMaker.entries()].sort(([left], [right]) => compareText(left, right))) {
  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      if (values[leftIndex].qid !== values[rightIndex].qid && values[leftIndex].code !== values[rightIndex].code) {
        pair = {maker, left:values[leftIndex], right:values[rightIndex]};
        break outer;
      }
    }
  }
}
if (!pair) throw new Error('NO_VARIANT_STRUCTURED_ITEM_HARD_NEGATIVE_PAIR');

const [leftPayload, rightPayload] = await Promise.all([
  fetchJson(entityUrl(pair.left.qid)),
  fetchJson(entityUrl(pair.right.qid)),
]);
const left = leftPayload?.entities?.[pair.left.qid];
const right = rightPayload?.entities?.[pair.right.qid];
if (!left || !right) throw new Error('VARIANT_ENTITYDATA_MISSING');
if (!items(left, 'P176').includes(pair.maker) || !items(right, 'P176').includes(pair.maker) ||
    !strings(left, 'P13351').includes(pair.left.code) || !strings(right, 'P13351').includes(pair.right.code)) {
  throw new Error('VARIANT_SOURCE_PAYLOAD_REVALIDATION_FAILED');
}

const hardNegative = {
  case_id:`wikidata-variant-hard-negative-${pair.left.qid}-${pair.right.qid}`,
  case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'NO_MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  marketplace_evidence:false, current_market_evidence:false, physical_instance_evidence:false,
  left:{
    anchors:{PHYSICAL_OBJECT:`wikidata-product-item:${pair.left.qid}:${pair.left.code}`},
    unique_keys:{object_id:pair.left.qid, reference_id:pair.left.code}, label:label(left),
    manufacturer_id:pair.maker, source:'wikidata-structured-data',
  },
  right:{
    anchors:{PHYSICAL_OBJECT:`wikidata-product-item:${pair.right.qid}:${pair.right.code}`},
    unique_keys:{object_id:pair.right.qid, reference_id:pair.right.code}, label:label(right),
    manufacturer_id:pair.maker, source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${pair.left.qid}:P13351:${pair.left.code}`,
    `wikidata:${pair.right.qid}:P13351:${pair.right.code}`,
    `wikidata:${pair.left.qid}:P176:${pair.maker}`,
    `wikidata:${pair.right.qid}:P176:${pair.maker}`,
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_WIKIDATA_PRODUCT_ITEMS_WITH_DISTINCT_MANUFACTURER_MODEL_CODES',
  source_evidence:[
    sourceEvidence(pair.left.qid, leftPayload),
    sourceEvidence(pair.right.qid, rightPayload),
  ],
  claim_ceiling:'VARIANT_STRUCTURED_PRODUCT_ITEM_HARD_NEGATIVE_MECHANICS_ONLY_NO_PHYSICAL_INSTANCE_OR_MARKET_EVIDENCE',
};

const crossAuthorityQuery = 'SELECT ?item ?modelNumber ?gtin WHERE { ?item wdt:P13351 ?modelNumber ; wdt:P3962 ?gtin . } ORDER BY STR(?item) LIMIT 500';
const crossAuthorityResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(crossAuthorityQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const aliasCandidates = [];
for (const row of crossAuthorityResult?.results?.bindings ?? []) {
  const qid = String(row?.item?.value ?? '').match(/\/entity\/(Q\d+)$/)?.[1];
  const code = String(row?.modelNumber?.value ?? '').trim();
  const gtin = String(row?.gtin?.value ?? '').trim();
  if (qid && code && gtin) {
    aliasCandidates.push({qid, code, gtin});
  }
}
const alias = [...new Map(aliasCandidates
  .sort((left, right) => compareText(
    [left.qid, left.code, left.gtin].join('\0'),
    [right.qid, right.code, right.gtin].join('\0'),
  ))
  .map((item) => [[item.qid, item.code, item.gtin].join('\0'), item])).values()][0] || null;
if (!alias) throw new Error('NO_VARIANT_CROSS_AUTHORITY_IDENTIFIER_PAIR');
const aliasPayload = await fetchJson(entityUrl(alias.qid));
const aliasEntity = aliasPayload?.entities?.[alias.qid];
if (!aliasEntity || !strings(aliasEntity, 'P13351').includes(alias.code) || !strings(aliasEntity, 'P3962').includes(alias.gtin)) {
  throw new Error('VARIANT_CROSS_AUTHORITY_SOURCE_PAYLOAD_REVALIDATION_FAILED');
}

const anchor = `wikidata-variant-cross-authority:${alias.qid}`;
const crossAuthority = {
  case_id:`wikidata-variant-cross-authority-${alias.qid}`,
  case_class:'CROSS_MARKET_ALIAS', identity_boundary:'SOURCE_RECORD', scope_id:STRATUM,
  expected:'MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    anchors:{SOURCE_RECORD:anchor}, unique_keys:{reference_id:`model-number:${alias.code}`},
    external_system:'ManufacturerModelNumber', external_id:alias.code, wikidata_bridge:alias.qid,
    source:'wikidata-structured-data',
  },
  right:{
    anchors:{SOURCE_RECORD:anchor}, unique_keys:{reference_id:`gtin:${alias.gtin}`},
    external_system:'GTIN', external_id:alias.gtin, wikidata_bridge:alias.qid,
    source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${alias.qid}:P13351:${alias.code}`,
    `wikidata:${alias.qid}:P3962:${alias.gtin}`,
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_BINDING_MODEL_NUMBER_AND_GTIN_TO_ONE_STRUCTURED_PRODUCT_ITEM',
  source_evidence:[sourceEvidence(alias.qid, aliasPayload)],
  claim_ceiling:'CROSS_AUTHORITY_IDENTIFIER_ALIAS_ONLY_NO_MARKET_OR_CURRENT_MARKET_EVIDENCE',
};

for (const item of [hardNegative, crossAuthority]) {
  if (dataset.cases.some((existing) => existing.case_id === item.case_id)) {
    throw new Error(`DUPLICATE_R7G_CASE:${item.case_id}`);
  }
}
const cases = [...dataset.cases, hardNegative, crossAuthority];
const represented = sortedUnique(cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7G_VARIANT_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}
const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7g-variant-minimums',
  dataset_scope:'R7G_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_SERIALIZED_VEHICLE_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', synthetic:false, constructed_control:true,
  empirical_benchmark_eligible:false, independent_label_review_complete:false, label_adjudication_complete:false,
  holdout_sealed_before_modeling:false, track_b_independent_review_complete:false,
  pre_track_b_promotion_eligible:false, production_promotion_authorized:false, production:'HOLD',
  scope_stratification_status:'INCOMPLETE', approved_scope_ids:manifest.approved_strata_ids,
  required_scope_ids:manifest.required_strata_ids, approved_strata_manifest_id:manifest.id,
  represented_approved_strata_ids:represented, r7g_marketplace_observation_count:0,
  r7g_current_market_observation_count:0, cases, prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7G adds two live-source-derived, algorithmically labeled VARIANT_RELEASE_HEAVY constructed controls. The literal CROSS_MARKET_ALIAS class is only cross-authority identifier mechanics and contains no marketplace or current-market observation. The PHYSICAL_OBJECT hard-negative is structured-product-item mechanics without physical-instance evidence. Neither case is independently reviewed, adjudicated, or blind; empirical accuracy, missing strata grammar, Track B, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  hard_negative:pair,
  cross_authority:alias,
  represented_approved_strata_ids:represented,
  production:'HOLD',
}, null, 2));
