import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath = '/tmp/er-real-world-r7f.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) throw new Error('Usage: node extend-er-r7e-vehicle-minimums-r7f.mjs <r7e.json> <manifest.json> [r7f.json]');

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-vehicle-mechanical-asset';
const MODEL = 'Q1002954';
const DOCUMENTED_VEHICLE_CANDIDATES = [
  {qid:'Q29113160', serial:'n° châssis 18/913'},
  {qid:'Q29113161', serial:'n° châssis 24/949 (24/950 ?)'},
];
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7e-serialized-minimums';
const EXPECTED_INPUT_SCOPE = 'R7E_PARTIAL_APPROVED_STRATA_5_OF_7_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_INPUT_CASE_COUNT = 10;
const EXPECTED_TARGET_MISSING_CASE_CLASSES = ['HARD_NEGATIVE', 'SAME_OBJECT_NORMALIZATION'];
const EXPECTED_TARGET_MISSING_BOUNDARIES = ['PHYSICAL_OBJECT', 'SOURCE_RECORD'];
const WIKIDATA_RIGHTS_URL = 'https://www.wikidata.org/wiki/Wikidata:Licensing';

const sortedUnique = (values) => [...new Set(values)].sort();
const sameStrings = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  new Set(left).size === left.length && new Set(right).size === right.length &&
  JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
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
  dataset.cases.some((item) => item.case_id.startsWith('wikidata-serialized-cross-authority-') &&
    item.claim_ceiling === 'CROSS_AUTHORITY_IDENTIFIER_ALIAS_ONLY_NO_MARKET_OR_CURRENT_MARKET_EVIDENCE' &&
    item.marketplace_evidence === false && item.current_market_evidence === false) &&
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 && item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7E_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' && sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) && (manifest.approved_strata_ids || []).includes(STRATUM) &&
  (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7E_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

const manifestByStratum = new Map((manifest.strata || []).map((row) => [row.stratum_id, row]));
const representedFromCases = sortedUnique(dataset.cases.map((item) => item.scope_id).filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const representedGrammarValid = EXPECTED_REPRESENTED_STRATA.every((stratumId) => {
  const row = manifestByStratum.get(stratumId);
  const rows = dataset.cases.filter((item) => item.scope_id === stratumId);
  const allowedClasses = new Set(row?.minimum_case_classes || []);
  const allowedBoundaries = new Set(row?.minimum_boundaries || []);
  return rows.length >= 1 && rows.every((item) => allowedClasses.has(item.case_class) && allowedBoundaries.has(item.identity_boundary));
});
if (!sameStrings(representedFromCases, EXPECTED_REPRESENTED_STRATA) || !sameStrings(representedFromCases, dataset.represented_approved_strata_ids) || !representedGrammarValid) {
  throw new Error('R7E_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || []).filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || []).filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) || !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7E_VEHICLE_TARGET_DEFICIT_MISMATCH');
}

const timeoutMs = 30000;
async function fetchJson(url, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'}, signal:controller.signal});
      if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** (attempt - 1))));
    } finally { clearTimeout(timer); }
  }
  throw last;
}
function strings(entity, property) {
  return (entity?.claims?.[property] ?? []).map((claim) => claim?.mainsnak?.datavalue?.value).filter((value) => typeof value === 'string' && value.trim());
}
function items(entity, property) {
  return (entity?.claims?.[property] ?? []).map((claim) => claim?.mainsnak?.datavalue?.value?.id).filter(Boolean);
}
function label(entity) { return entity?.labels?.en?.value ?? entity?.labels?.mul?.value ?? entity?.id ?? null; }
const entityUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const sourceEvidence = (qid, payload) => ({source_url:entityUrl(qid), source_payload_sha256:digest(payload), license_evidence_refs:[WIKIDATA_RIGHTS_URL]});

const used = new Set();
for (const item of dataset.cases) {
  if (item.scope_id === 'er-stratum-serialized-reference') {
    for (const side of [item.left, item.right]) if (side?.unique_keys?.object_id) used.add(String(side.unique_keys.object_id));
  }
}

// Revalidate the two vehicle source records that previously passed R7F, directly from
// authoritative Wikidata EntityData. Query Service availability is intentionally removed
// from the CI dependency while source authority and fail-closed semantics are preserved.
const eligible = DOCUMENTED_VEHICLE_CANDIDATES.filter((candidate) => !used.has(candidate.qid));
if (eligible.length !== 2 || eligible[0].qid === eligible[1].qid || eligible[0].serial === eligible[1].serial) {
  throw new Error('DOCUMENTED_VEHICLE_CANDIDATES_NOT_INDEPENDENT_OF_SERIALIZED_REFERENCE');
}
const selected = {left:eligible[0], right:eligible[1]};
const [modelPayload, leftPayload, rightPayload] = await Promise.all([
  fetchJson(entityUrl(MODEL)),
  fetchJson(entityUrl(selected.left.qid)),
  fetchJson(entityUrl(selected.right.qid)),
]);
const model = modelPayload?.entities?.[MODEL];
const left = leftPayload?.entities?.[selected.left.qid];
const right = rightPayload?.entities?.[selected.right.qid];
if (!model || !left || !right) throw new Error('VEHICLE_ENTITYDATA_MISSING');
if (label(model) !== 'Formula One car') throw new Error(`EXPECTED_VEHICLE_CLASS_LABEL_MISMATCH:${label(model)}`);
if (!items(left, 'P31').includes(MODEL) || !items(right, 'P31').includes(MODEL)) throw new Error('VEHICLE_MODEL_SOURCE_PAYLOAD_REVALIDATION_FAILED');
if (!strings(left, 'P2598').includes(selected.left.serial) || !strings(right, 'P2598').includes(selected.right.serial)) throw new Error('VEHICLE_SERIAL_SOURCE_PAYLOAD_REVALIDATION_FAILED');

const sameAnchor = `wikidata-vehicle-record:${selected.left.qid}:${selected.left.serial}`;
const normalization = {
  case_id:`wikidata-vehicle-normalization-${selected.left.qid}`, case_class:'SAME_OBJECT_NORMALIZATION', identity_boundary:'SOURCE_RECORD', scope_id:STRATUM,
  expected:'MATCH', blind_holdout:false, constructed_control:true, label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{SOURCE_RECORD:sameAnchor}, unique_keys:{object_id:selected.left.qid, serial:selected.left.serial}, entity_id:selected.left.qid, model_id:MODEL, vehicle_class:label(model), source:'wikidata-structured-data'},
  right:{anchors:{SOURCE_RECORD:sameAnchor}, unique_keys:{object_id:selected.left.qid, serial:selected.left.serial}, entity_id:selected.left.qid, model_id:MODEL, vehicle_class:label(model), source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.left.qid}:P31:${MODEL}`, `wikidata:${selected.left.qid}:P2598:${selected.left.serial}`, 'wikidata:Q1002954:Formula-One-car'],
  rights_state:'ALLOW', label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_FOR_ONE_SERIALIZED_FORMULA_ONE_CAR_SOURCE_ITEM',
  source_evidence:[sourceEvidence(selected.left.qid, leftPayload), sourceEvidence(MODEL, modelPayload)],
  claim_ceiling:'VEHICLE_MECHANICAL_SOURCE_RECORD_IDENTITY_ONLY_NO_MARKET_EVIDENCE',
};
const hardNegative = {
  case_id:`wikidata-vehicle-hard-negative-${selected.left.qid}-${selected.right.qid}`, case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'NO_MATCH', blind_holdout:false, constructed_control:true, label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{PHYSICAL_OBJECT:`wikidata-vehicle:${selected.left.qid}:${selected.left.serial}`}, unique_keys:{object_id:selected.left.qid, serial:selected.left.serial}, entity_id:selected.left.qid, model_id:MODEL, source:'wikidata-structured-data'},
  right:{anchors:{PHYSICAL_OBJECT:`wikidata-vehicle:${selected.right.qid}:${selected.right.serial}`}, unique_keys:{object_id:selected.right.qid, serial:selected.right.serial}, entity_id:selected.right.qid, model_id:MODEL, source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.left.qid}:P2598:${selected.left.serial}`, `wikidata:${selected.right.qid}:P2598:${selected.right.serial}`, `wikidata:${selected.left.qid}:P31:${MODEL}`, `wikidata:${selected.right.qid}:P31:${MODEL}`],
  rights_state:'ALLOW', label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_FOR_TWO_DISTINCT_FORMULA_ONE_CAR_SOURCE_ITEMS_WITH_DISTINCT_SERIALS',
  source_evidence:[sourceEvidence(selected.left.qid, leftPayload), sourceEvidence(selected.right.qid, rightPayload), sourceEvidence(MODEL, modelPayload)],
  claim_ceiling:'VEHICLE_MECHANICAL_PHYSICAL_OBJECT_IDENTITY_ONLY_NO_MARKET_EVIDENCE',
};
for (const item of [normalization, hardNegative]) if (dataset.cases.some((existing) => existing.case_id === item.case_id)) throw new Error(`DUPLICATE_R7F_CASE:${item.case_id}`);

const cases = [...dataset.cases, normalization, hardNegative];
const represented = sortedUnique(cases.map((item) => item.scope_id).filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7F_VEHICLE_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}
const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7f-vehicle-minimums',
  dataset_scope:'R7F_PARTIAL_APPROVED_STRATA_5_OF_7_VEHICLE_AND_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', synthetic:false, constructed_control:true,
  empirical_benchmark_eligible:false, independent_label_review_complete:false, label_adjudication_complete:false,
  holdout_sealed_before_modeling:false, track_b_independent_review_complete:false, pre_track_b_promotion_eligible:false,
  production_promotion_authorized:false, production:'HOLD', scope_stratification_status:'INCOMPLETE',
  r7e_marketplace_observation_count:0, r7e_current_market_observation_count:0,
  approved_scope_ids:manifest.approved_strata_ids, required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id, represented_approved_strata_ids:represented, cases,
  prior_input_sha256:digest(dataset), prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7F live-revalidates two previously successful, independent Formula One car source items directly from Wikidata EntityData and adds two algorithmically labeled VEHICLE_MECHANICAL_ASSET constructed controls. They are not independently reviewed, adjudicated, or blind. No Query Service, market evidence, empirical promotion, Track B, or Production claim is created.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({id:out.id, evidence_class:out.dataset_class, constructed_control:true, empirical_benchmark_eligible:false, blind_holdout_count:0, model_id:MODEL, model_label:label(model), excluded_prior_objects:sortedUnique([...used]), selected, represented_approved_strata_ids:represented, production:'HOLD'}, null, 2));
