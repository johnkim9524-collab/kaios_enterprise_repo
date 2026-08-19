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
const WIKIDATA_RIGHTS_URL = 'https://www.wikidata.org/wiki/Wikidata:Licensing';

// These exact records were previously discovered and repeatedly proven by the live R7I chain.
// Routine validation now revalidates the load-bearing EntityData records directly instead of
// rediscovering them through broad WDQS scans, eliminating external query-service flakiness
// without freezing source payloads or weakening any semantic assertion.
const HARD = {
  creator:'Q5582',
  left:{item:'Q18713070', inventory:'s0047V1962'},
  right:{item:'Q18713076', inventory:'1926.417'},
};
const AMBIGUOUS = {left:'Q100366760', right:'Q100366761'};

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
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 && item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7H_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7H_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

const manifestByStratum = new Map((manifest.strata || []).map((row) => [row.stratum_id, row]));
const representedFromCases = sortedUnique(dataset.cases.map((item) => item.scope_id).filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const representedGrammarValid = EXPECTED_REPRESENTED_STRATA.every((stratumId) => {
  const row = manifestByStratum.get(stratumId);
  const rows = dataset.cases.filter((item) => item.scope_id === stratumId);
  const allowedClasses = new Set(row?.minimum_case_classes || []);
  const allowedBoundaries = new Set(row?.minimum_boundaries || []);
  return rows.length >= 1 && rows.every((item) => allowedClasses.has(item.case_class) && allowedBoundaries.has(item.identity_boundary));
});
if (!sameStrings(representedFromCases, EXPECTED_REPRESENTED_STRATA) ||
    !sameStrings(representedFromCases, dataset.represented_approved_strata_ids) || !representedGrammarValid) {
  throw new Error('R7H_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || []).filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || []).filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) || !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES)) {
  throw new Error('R7H_PROVENANCE_TARGET_DEFICIT_MISMATCH');
}

const timeoutMs = 18000;
async function fetchJson(url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0', accept:'application/json'}, signal:controller.signal});
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
  return (entity?.claims?.[property] ?? []).map((claim) => claim?.mainsnak?.datavalue?.value).filter((value) => typeof value === 'string' && value.trim());
}
function items(entity, property) {
  return (entity?.claims?.[property] ?? []).map((claim) => claim?.mainsnak?.datavalue?.value?.id).filter(Boolean);
}
function label(entity) { return entity?.labels?.en?.value ?? entity?.labels?.mul?.value ?? entity?.id ?? null; }
const entityUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const sourceEvidence = (qid, payload) => ({source_url:entityUrl(qid), source_payload_sha256:digest(payload), license_evidence_refs:[WIKIDATA_RIGHTS_URL]});

const usedQids = new Set();
for (const item of dataset.cases.filter((value) => value.scope_id === STRATUM)) {
  for (const side of [item.left, item.right]) {
    for (const value of [side?.wikidata_bridge, side?.entity_id, side?.unique_keys?.object_id]) {
      if (typeof value === 'string' && /^Q\d+$/.test(value)) usedQids.add(value);
    }
  }
}
for (const qid of [HARD.left.item, HARD.right.item, AMBIGUOUS.left, AMBIGUOUS.right]) {
  if (usedQids.has(qid)) throw new Error(`R7I_FIXED_EVIDENCE_COLLIDES_WITH_PRIOR_CASE:${qid}`);
}

const [hardLeftPayload, hardRightPayload, ambiguousLeftPayload, ambiguousRightPayload] = await Promise.all([
  fetchJson(entityUrl(HARD.left.item)),
  fetchJson(entityUrl(HARD.right.item)),
  fetchJson(entityUrl(AMBIGUOUS.left)),
  fetchJson(entityUrl(AMBIGUOUS.right)),
]);
const hardLeft = hardLeftPayload?.entities?.[HARD.left.item];
const hardRight = hardRightPayload?.entities?.[HARD.right.item];
const ambiguousLeft = ambiguousLeftPayload?.entities?.[AMBIGUOUS.left];
const ambiguousRight = ambiguousRightPayload?.entities?.[AMBIGUOUS.right];
if (!hardLeft || !hardRight || !ambiguousLeft || !ambiguousRight) throw new Error('R7I_FIXED_ENTITYDATA_RECORD_REQUIRED');

if (!items(hardLeft, 'P170').includes(HARD.creator) || !items(hardRight, 'P170').includes(HARD.creator) ||
    !strings(hardLeft, 'P217').includes(HARD.left.inventory) || !strings(hardRight, 'P217').includes(HARD.right.inventory) ||
    items(hardLeft, 'P460').includes(HARD.right.item) || items(hardRight, 'P460').includes(HARD.left.item)) {
  throw new Error('R7I_FIXED_HARD_NEGATIVE_LIVE_REVALIDATION_FAILED');
}

const leftInventories = sortedUnique(strings(ambiguousLeft, 'P217'));
const rightInventories = sortedUnique(strings(ambiguousRight, 'P217'));
const p460Linked = items(ambiguousLeft, 'P460').includes(AMBIGUOUS.right) || items(ambiguousRight, 'P460').includes(AMBIGUOUS.left);
const ambiguousInventoryPair = leftInventories.flatMap((leftInventory) => rightInventories.map((rightInventory) => [leftInventory, rightInventory]))
  .find(([leftInventory, rightInventory]) => leftInventory !== rightInventory);
if (!p460Linked || !ambiguousInventoryPair) throw new Error('R7I_FIXED_AMBIGUOUS_LIVE_REVALIDATION_FAILED');
const [leftInventory, rightInventory] = ambiguousInventoryPair;

const hardPair = HARD;
const hardNegative = {
  case_id:`wikidata-provenance-hard-negative-${HARD.left.item}-${HARD.right.item}`,
  case_class:'HARD_NEGATIVE', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'NO_MATCH', blind_holdout:false, constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  independent_physical_inspection_complete:false, full_provenance_chain_verified:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{anchors:{PHYSICAL_OBJECT:`wikidata-inventoried-record:${HARD.left.item}:${HARD.left.inventory}`}, unique_keys:{object_id:HARD.left.item, accession_number:HARD.left.inventory}, creator_id:HARD.creator, label:label(hardLeft), source:'wikidata-structured-data'},
  right:{anchors:{PHYSICAL_OBJECT:`wikidata-inventoried-record:${HARD.right.item}:${HARD.right.inventory}`}, unique_keys:{object_id:HARD.right.item, accession_number:HARD.right.inventory}, creator_id:HARD.creator, label:label(hardRight), source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${HARD.left.item}:P170:${HARD.creator}`, `wikidata:${HARD.right.item}:P170:${HARD.creator}`, `wikidata:${HARD.left.item}:P217:${HARD.left.inventory}`, `wikidata:${HARD.right.item}:P217:${HARD.right.inventory}`],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_WIKIDATA_INVENTORIED_RECORDS_WITH_ONE_CREATOR_AND_DISTINCT_ITEM_AND_INVENTORY_IDENTIFIERS',
  source_evidence:[sourceEvidence(HARD.left.item, hardLeftPayload), sourceEvidence(HARD.right.item, hardRightPayload)],
  claim_ceiling:'PROVENANCE_INVENTORIED_RECORD_HARD_NEGATIVE_MECHANICS_ONLY_NO_INDEPENDENT_PHYSICAL_INSPECTION_FULL_PROVENANCE_OR_CURRENT_MARKET_EVIDENCE',
};

const ambiguous = {left:AMBIGUOUS.left, right:AMBIGUOUS.right, leftInventory, rightInventory, leftEntity:ambiguousLeft, rightEntity:ambiguousRight, leftPayload:ambiguousLeftPayload, rightPayload:ambiguousRightPayload};
const ambiguousReview = {
  case_id:`wikidata-provenance-ambiguous-p460-${AMBIGUOUS.left}-${AMBIGUOUS.right}`,
  case_class:'AMBIGUOUS_REVIEW_REQUIRED', identity_boundary:'PHYSICAL_OBJECT', scope_id:STRATUM,
  expected:'REVIEW', blind_holdout:false, constructed_control:true, auto_merge_allowed:false, auto_split_allowed:false,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  independent_physical_inspection_complete:false, full_provenance_chain_verified:false,
  marketplace_evidence:false, current_market_evidence:false,
  left:{entity_id:AMBIGUOUS.left, candidate_inventory_number:leftInventory, label:label(ambiguousLeft), source:'wikidata-structured-data', evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  right:{entity_id:AMBIGUOUS.right, candidate_inventory_number:rightInventory, label:label(ambiguousRight), source:'wikidata-structured-data', evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  provenance_refs:[`wikidata:${AMBIGUOUS.left}:P460:${AMBIGUOUS.right}:revalidated`, `wikidata:${AMBIGUOUS.left}:P217:${leftInventory}`, `wikidata:${AMBIGUOUS.right}:P217:${rightInventory}`, 'wikidata-property:P460:uncertain-or-disputed-sameness'],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_REVIEW_CASE_FROM_A_WIKIDATA_P460_RELATION_BETWEEN_TWO_SEPARATELY_INVENTORIED_RECORDS',
  source_evidence:[sourceEvidence(AMBIGUOUS.left, ambiguousLeftPayload), sourceEvidence(AMBIGUOUS.right, ambiguousRightPayload)],
  claim_ceiling:'PROVENANCE_INVENTORIED_RECORD_AMBIGUOUS_REVIEW_MECHANICS_ONLY_NO_AUTO_MERGE_AUTO_SPLIT_INDEPENDENT_PHYSICAL_INSPECTION_FULL_PROVENANCE_OR_CURRENT_MARKET_EVIDENCE',
};

for (const item of [hardNegative, ambiguousReview]) if (dataset.cases.some((existing) => existing.case_id === item.case_id)) throw new Error(`DUPLICATE_R7I_CASE:${item.case_id}`);
const cases = [...dataset.cases, hardNegative, ambiguousReview];
const represented = sortedUnique(cases.map((item) => item.scope_id).filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
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
  r7i_discovery_mode:'FIXED_PREVIOUSLY_PROVEN_PAIR_LIVE_ENTITYDATA_REVALIDATION',
  cases, prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7I revalidates two previously proven Wikidata evidence pairs directly through live EntityData, avoiding broad query-service rediscovery. The hard-negative and P460 ambiguity remain algorithmically labeled constructed controls without independent physical inspection, complete provenance-chain verification, marketplace/current-market evidence, independent labels, or blind status. Empirical accuracy, independent Track B, public claims, release, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  hard_negative:{creator:HARD.creator, left:HARD.left, right:HARD.right},
  ambiguous_review:{left:AMBIGUOUS.left, right:AMBIGUOUS.right},
  discovery_mode:out.r7i_discovery_mode,
  represented_approved_strata_ids:represented,
  public_claim_authorized:false,
  production:'HOLD',
}, null, 2));
