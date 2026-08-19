import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath = '/tmp/er-real-world-r7i.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7h-provenance-minimums-r7i.mjs <r7h.json> <manifest.json> [r7i.json]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-provenance-unique-object';
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7h-pressing-minimums';
const EXPECTED_INPUT_SCOPE = 'R7H_PARTIAL_APPROVED_STRATA_5_OF_7_FOUR_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_INPUT_CASE_COUNT = 16;
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_TARGET_MISSING_CASE_CLASSES = ['AMBIGUOUS_REVIEW_REQUIRED', 'HARD_NEGATIVE'];
const EXPECTED_TARGET_MISSING_BOUNDARIES = ['PHYSICAL_OBJECT'];
const HARD_CREATOR = 'Q5582';
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
if (!constructedControlInput) throw new Error('R7H_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7H_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

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
  throw new Error('R7H_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || [])
  .filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || [])
  .filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) ||
    !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7H_PROVENANCE_TARGET_DEFICIT_MISMATCH');
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

const objectRowsQuery = `SELECT ?item ?inventory WHERE { ?item wdt:P170 wd:${HARD_CREATOR} ; wdt:P217 ?inventory . } LIMIT 120`;
const objectRowsResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(objectRowsQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const rawRows = (objectRowsResult?.results?.bindings ?? []).map((row) => ({
  item:qidFromUri(row?.item?.value),
  creator:HARD_CREATOR,
  inventory:String(row?.inventory?.value ?? '').trim(),
})).filter((row) => row.item && row.inventory && !usedQids.has(row.item))
  .sort((left, right) => compareText([left.item, left.inventory].join('\0'), [right.item, right.inventory].join('\0')));
const rows = [];
const seenItems = new Set();
for (const row of rawRows) {
  if (!seenItems.has(row.item)) {
    seenItems.add(row.item);
    rows.push(row);
  }
}
const candidatePairs = [];
for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
    if (rows[leftIndex].item !== rows[rightIndex].item && rows[leftIndex].inventory !== rows[rightIndex].inventory) {
      candidatePairs.push({creator:HARD_CREATOR, left:rows[leftIndex], right:rows[rightIndex]});
    }
  }
}
candidatePairs.sort((left, right) => compareText(
  [left.left.item, left.right.item, left.left.inventory, left.right.inventory].join('\0'),
  [right.left.item, right.right.item, right.left.inventory, right.right.inventory].join('\0'),
));
if (candidatePairs.length === 0) throw new Error('NO_PROVENANCE_HARD_NEGATIVE_CANDIDATES');

let hardPair = null;
let hardLeftPayload = null;
let hardRightPayload = null;
let hardLeft = null;
let hardRight = null;
for (const candidate of candidatePairs.slice(0, 20)) {
  let leftPayload;
  let rightPayload;
  try {
    [leftPayload, rightPayload] = await Promise.all([
      fetchJson(entityUrl(candidate.left.item)),
      fetchJson(entityUrl(candidate.right.item)),
    ]);
  } catch {
    continue;
  }
  const leftEntity = leftPayload?.entities?.[candidate.left.item];
  const rightEntity = rightPayload?.entities?.[candidate.right.item];
  if (!leftEntity || !rightEntity) continue;
  const creatorValid = items(leftEntity, 'P170').includes(candidate.creator) &&
    items(rightEntity, 'P170').includes(candidate.creator);
  const inventoryValid = strings(leftEntity, 'P217').includes(candidate.left.inventory) &&
    strings(rightEntity, 'P217').includes(candidate.right.inventory);
  const ambiguityLink = items(leftEntity, 'P460').includes(candidate.right.item) ||
    items(rightEntity, 'P460').includes(candidate.left.item);
  if (creatorValid && inventoryValid && !ambiguityLink) {
    hardPair = candidate;
    hardLeftPayload = leftPayload;
    hardRightPayload = rightPayload;
    hardLeft = leftEntity;
    hardRight = rightEntity;
    break;
  }
}
if (!hardPair) throw new Error('NO_REVALIDATED_PROVENANCE_HARD_NEGATIVE_PAIR');

const hardNegative = {
  case_id:`wikidata-provenance-hard-negative-${hardPair.left.item}-${hardPair.right.item}`,
  case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'NO_MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  independent_physical_inspection_complete:false, full_provenance_chain_verified:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    anchors:{PHYSICAL_OBJECT:`wikidata-inventoried-record:${hardPair.left.item}:${hardPair.left.inventory}`},
    unique_keys:{object_id:hardPair.left.item, accession_number:hardPair.left.inventory},
    creator_id:hardPair.creator, label:label(hardLeft), source:'wikidata-structured-data',
  },
  right:{
    anchors:{PHYSICAL_OBJECT:`wikidata-inventoried-record:${hardPair.right.item}:${hardPair.right.inventory}`},
    unique_keys:{object_id:hardPair.right.item, accession_number:hardPair.right.inventory},
    creator_id:hardPair.creator, label:label(hardRight), source:'wikidata-structured-data',
  },
  provenance_refs:[
    `wikidata:${hardPair.left.item}:P170:${hardPair.creator}`,
    `wikidata:${hardPair.right.item}:P170:${hardPair.creator}`,
    `wikidata:${hardPair.left.item}:P217:${hardPair.left.inventory}`,
    `wikidata:${hardPair.right.item}:P217:${hardPair.right.inventory}`,
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_WIKIDATA_INVENTORIED_RECORDS_WITH_ONE_CREATOR_AND_DISTINCT_ITEM_AND_INVENTORY_IDENTIFIERS',
  source_evidence:[
    sourceEvidence(hardPair.left.item, hardLeftPayload),
    sourceEvidence(hardPair.right.item, hardRightPayload),
  ],
  claim_ceiling:'PROVENANCE_INVENTORIED_RECORD_HARD_NEGATIVE_MECHANICS_ONLY_NO_INDEPENDENT_PHYSICAL_INSPECTION_FULL_PROVENANCE_OR_CURRENT_MARKET_EVIDENCE',
};

const ambiguousQuery = 'SELECT ?left ?right ?leftInventory ?rightInventory WHERE { ?left wdt:P460 ?right ; wdt:P217 ?leftInventory . ?right wdt:P217 ?rightInventory . FILTER(?left != ?right) FILTER(?leftInventory != ?rightInventory) } LIMIT 120';
const ambiguousResult = await fetchJson(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(ambiguousQuery)}&format=json`,
  {accept:'application/sparql-results+json'},
);
const ambiguousCandidates = (ambiguousResult?.results?.bindings ?? []).map((row) => ({
  left:qidFromUri(row?.left?.value),
  right:qidFromUri(row?.right?.value),
  leftInventory:String(row?.leftInventory?.value ?? '').trim(),
  rightInventory:String(row?.rightInventory?.value ?? '').trim(),
})).filter((candidate) => candidate.left && candidate.right && candidate.leftInventory && candidate.rightInventory &&
  candidate.left !== candidate.right && !usedQids.has(candidate.left) && !usedQids.has(candidate.right) &&
  ![hardPair.left.item, hardPair.right.item].includes(candidate.left) &&
  ![hardPair.left.item, hardPair.right.item].includes(candidate.right))
  .sort((left, right) => compareText(
    [left.left, left.right, left.leftInventory, left.rightInventory].join('\0'),
    [right.left, right.right, right.leftInventory, right.rightInventory].join('\0'),
  ));

let ambiguous = null;
for (const candidate of [...new Map(ambiguousCandidates.map((item) => [
  [item.left, item.right, item.leftInventory, item.rightInventory].join('\0'), item,
])).values()]) {
  let leftPayload;
  let rightPayload;
  try {
    [leftPayload, rightPayload] = await Promise.all([
      fetchJson(entityUrl(candidate.left)),
      fetchJson(entityUrl(candidate.right)),
    ]);
  } catch {
    continue;
  }
  const leftEntity = leftPayload?.entities?.[candidate.left];
  const rightEntity = rightPayload?.entities?.[candidate.right];
  if (!leftEntity || !rightEntity) continue;
  const p460 = items(leftEntity, 'P460').includes(candidate.right) || items(rightEntity, 'P460').includes(candidate.left);
  const inventories = strings(leftEntity, 'P217').includes(candidate.leftInventory) &&
    strings(rightEntity, 'P217').includes(candidate.rightInventory);
  if (p460 && inventories) {
    ambiguous = {...candidate, leftEntity, rightEntity, leftPayload, rightPayload};
    break;
  }
}
if (!ambiguous) throw new Error('NO_REVALIDATED_PROVENANCE_AMBIGUOUS_PAIR');

const ambiguousReview = {
  case_id:`wikidata-provenance-ambiguous-p460-${ambiguous.left}-${ambiguous.right}`,
  case_class:'AMBIGUOUS_REVIEW_REQUIRED', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'REVIEW', blind_holdout:false, constructed_control:true, auto_merge_allowed:false, auto_split_allowed:false,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  independent_physical_inspection_complete:false, full_provenance_chain_verified:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{
    entity_id:ambiguous.left, candidate_inventory_number:ambiguous.leftInventory,
    label:label(ambiguous.leftEntity), source:'wikidata-structured-data',
    evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS',
  },
  right:{
    entity_id:ambiguous.right, candidate_inventory_number:ambiguous.rightInventory,
    label:label(ambiguous.rightEntity), source:'wikidata-structured-data',
    evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS',
  },
  provenance_refs:[
    `wikidata:${ambiguous.left}:P460:${ambiguous.right}:revalidated`,
    `wikidata:${ambiguous.left}:P217:${ambiguous.leftInventory}`,
    `wikidata:${ambiguous.right}:P217:${ambiguous.rightInventory}`,
    'wikidata-property:P460:uncertain-or-disputed-sameness',
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_REVIEW_CASE_FROM_A_WIKIDATA_P460_RELATION_BETWEEN_TWO_SEPARATELY_INVENTORIED_RECORDS',
  source_evidence:[
    sourceEvidence(ambiguous.left, ambiguous.leftPayload),
    sourceEvidence(ambiguous.right, ambiguous.rightPayload),
  ],
  claim_ceiling:'PROVENANCE_INVENTORIED_RECORD_AMBIGUOUS_REVIEW_MECHANICS_ONLY_NO_AUTO_MERGE_AUTO_SPLIT_INDEPENDENT_PHYSICAL_INSPECTION_FULL_PROVENANCE_OR_CURRENT_MARKET_EVIDENCE',
};

for (const item of [hardNegative, ambiguousReview]) {
  if (dataset.cases.some((existing) => existing.case_id === item.case_id)) {
    throw new Error(`DUPLICATE_R7I_CASE:${item.case_id}`);
  }
}
const cases = [...dataset.cases, hardNegative, ambiguousReview];
const represented = sortedUnique(cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7I_PROVENANCE_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}

const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7i-provenance-minimums',
  dataset_scope:'R7I_PARTIAL_APPROVED_STRATA_5_OF_7_FIVE_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL', synthetic:false, constructed_control:true,
  empirical_benchmark_eligible:false, independent_label_review_complete:false, label_adjudication_complete:false,
  holdout_sealed_before_modeling:false, track_b_independent_review_complete:false,
  pre_track_b_promotion_eligible:false, public_claim_authorized:false, public_release_authorized:false,
  production_promotion_authorized:false, production:'HOLD', scope_stratification_status:'INCOMPLETE',
  approved_scope_ids:manifest.approved_strata_ids, required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id, represented_approved_strata_ids:represented,
  r7i_independent_physical_inspection_count:0, r7i_full_provenance_chain_verification_count:0,
  r7i_marketplace_observation_count:0, r7i_current_market_observation_count:0,
  cases, prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7I adds two live-source-derived, algorithmically labeled PROVENANCE_UNIQUE_OBJECT constructed controls. The hard-negative and P460 ambiguity are inventoried-record mechanics without independent physical inspection, complete provenance-chain verification, or marketplace/current-market evidence. The ambiguous case remains REVIEW with auto-merge and auto-split prohibited. Five of seven stratum grammars may be mechanically complete, but empirical accuracy, remaining strata, independent Track B, public claims, release, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  hard_negative:{creator:hardPair.creator, left:hardPair.left, right:hardPair.right},
  ambiguous_review:{left:ambiguous.left, right:ambiguous.right},
  represented_approved_strata_ids:represented,
  public_claim_authorized:false,
  production:'HOLD',
}, null, 2));
