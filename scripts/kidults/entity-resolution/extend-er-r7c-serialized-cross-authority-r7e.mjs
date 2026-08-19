import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath = '/tmp/er-real-world-r7e.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7c-serialized-cross-authority-r7e.mjs <r7c.json> <manifest.json> [r7e.json]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-serialized-reference';
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7c-strata-mapped-partial';
const EXPECTED_INPUT_SCOPE = 'R7C_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_NORMALIZATION_ONLY_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_INPUT_CASE_COUNT = 9;
const EXPECTED_TARGET_MISSING_CASE_CLASSES = ['CROSS_MARKET_ALIAS'];
const EXPECTED_TARGET_MISSING_BOUNDARIES = [];
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
  dataset.holdout_sealed_before_modeling === false && dataset.production === 'HOLD' &&
  dataset.scope_stratification_status === 'INCOMPLETE' && Array.isArray(dataset.cases) &&
  dataset.cases.length === EXPECTED_INPUT_CASE_COUNT && new Set(dataset.cases.map((item) => item.case_id)).size === dataset.cases.length &&
  dataset.cases.every((item) => typeof item.case_id === 'string' && item.case_id.trim()) &&
  sameStrings(dataset.represented_approved_strata_ids, EXPECTED_REPRESENTED_STRATA) &&
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 &&
    item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7C_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7C_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

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
  throw new Error('R7C_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || [])
  .filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || [])
  .filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) ||
    !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7C_SERIALIZED_TARGET_DEFICIT_MISMATCH');
}

const timeoutMs = 18000;
async function fetchJson(url, headers = {}, attempts = 2) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0', ...headers},
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

const sparql = 'SELECT ?item ?serial ?inventory ?model WHERE { ?item wdt:P2598 ?serial ; wdt:P217 ?inventory ; wdt:P31 ?model . } ORDER BY STR(?item) LIMIT 100';
const queryResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
  {accept:'application/sparql-results+json'},
  3,
);
const candidates = [];
for (const row of queryResult?.results?.bindings ?? []) {
  const qid = String(row?.item?.value ?? '').match(/\/entity\/(Q\d+)$/)?.[1];
  const model = String(row?.model?.value ?? '').match(/\/entity\/(Q\d+)$/)?.[1];
  const serial = String(row?.serial?.value ?? '').trim();
  const inventory = String(row?.inventory?.value ?? '').trim();
  if (qid && model && serial && inventory && serial !== inventory) {
    candidates.push({qid, model, serial, inventory});
  }
}
const selected = [...new Map(candidates
  .sort((left, right) => compareText(
    [left.qid, left.model, left.serial, left.inventory].join('\0'),
    [right.qid, right.model, right.serial, right.inventory].join('\0'),
  ))
  .map((item) => [[item.qid, item.model, item.serial, item.inventory].join('\0'), item])).values()][0] || null;
if (!selected) throw new Error('NO_ITEM_WITH_SERIAL_AND_INVENTORY_CROSS_AUTHORITY');

const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${selected.qid}.json`;
const entityPayload = await fetchJson(entityUrl);
const entity = entityPayload?.entities?.[selected.qid];
if (!entity) throw new Error('ENTITYDATA_MISSING');
if (!strings(entity, 'P2598').includes(selected.serial) || !strings(entity, 'P217').includes(selected.inventory) ||
    !items(entity, 'P31').includes(selected.model)) {
  throw new Error('SOURCE_PAYLOAD_CROSS_AUTHORITY_REVALIDATION_FAILED');
}

const anchor = `wikidata-cross-authority:${selected.qid}`;
const alias = {
  case_id:`wikidata-serialized-cross-authority-${selected.qid}`,
  case_class:'CROSS_MARKET_ALIAS', identity_boundary:'SOURCE_RECORD', scope_id:STRATUM,
  expected:'MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    anchors:{SOURCE_RECORD:anchor}, unique_keys:{reference_id:`manufacturer-serial:${selected.serial}`},
    external_system:'MANUFACTURER_SERIAL', external_id:selected.serial, entity_id:selected.qid,
    model_id:selected.model, label:label(entity), source:'wikidata-structured-data',
  },
  right:{
    anchors:{SOURCE_RECORD:anchor}, unique_keys:{reference_id:`institutional-inventory:${selected.inventory}`},
    external_system:'INSTITUTIONAL_INVENTORY', external_id:selected.inventory, entity_id:selected.qid,
    model_id:selected.model, label:label(entity), source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${selected.qid}:P2598:${selected.serial}`,
    `wikidata:${selected.qid}:P217:${selected.inventory}`,
    `wikidata:${selected.qid}:P31:${selected.model}`,
    'wikidata-property:P2598:manufacturer-serial',
    'wikidata-property:P217:inventory-number',
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_BINDING_MANUFACTURER_SERIAL_AND_INSTITUTIONAL_INVENTORY_IDENTIFIERS_TO_ONE_SOURCE_ITEM',
  source_evidence:[{
    source_url:entityUrl,
    source_payload_sha256:digest(entityPayload),
    license_evidence_refs:[WIKIDATA_RIGHTS_URL],
  }],
  claim_ceiling:'CROSS_AUTHORITY_IDENTIFIER_ALIAS_ONLY_NO_MARKET_OR_CURRENT_MARKET_EVIDENCE',
};
if (dataset.cases.some((item) => item.case_id === alias.case_id)) throw new Error('DUPLICATE_R7E_CASE');

const cases = [...dataset.cases, alias];
const represented = sortedUnique(cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7E_SERIALIZED_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}
const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7e-serialized-minimums',
  dataset_scope:'R7E_PARTIAL_APPROVED_STRATA_5_OF_7_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', synthetic:false, constructed_control:true,
  empirical_benchmark_eligible:false, independent_label_review_complete:false, label_adjudication_complete:false,
  holdout_sealed_before_modeling:false, track_b_independent_review_complete:false,
  pre_track_b_promotion_eligible:false, production_promotion_authorized:false,
  production:'HOLD', scope_stratification_status:'INCOMPLETE',
  r7e_marketplace_observation_count:0, r7e_current_market_observation_count:0,
  approved_scope_ids:manifest.approved_strata_ids, required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id, represented_approved_strata_ids:represented, cases,
  prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7E adds one live-source-derived, algorithmically labeled SERIALIZED_REFERENCE cross-authority identifier constructed control. CROSS_MARKET_ALIAS is only the manifest mechanics class; no marketplace observation, market linkage, or current-market evidence is present. It is not independently reviewed, adjudicated, or blind. This may complete only the declared per-stratum case-class and boundary mechanics; empirical accuracy, global strata completion, Track B, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  item:selected,
  represented_approved_strata_ids:represented,
  production:'HOLD',
}, null, 2));
