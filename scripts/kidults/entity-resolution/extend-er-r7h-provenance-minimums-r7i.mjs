import fs from 'node:fs/promises';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7i.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7h-provenance-minimums-r7i.mjs <dataset> <manifest> [out]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-provenance-unique-object';
if (!(manifest.required_strata_ids ?? []).includes(STRATUM)) throw new Error('PROVENANCE_STRATUM_REQUIRED');
if (dataset.dataset_class !== 'REAL_WORLD_LABELED' || dataset.synthetic === true || !Array.isArray(dataset.cases)) {
  throw new Error('R7H_REAL_WORLD_DATASET_REQUIRED');
}

const timeoutMs = 18000;
async function fetchJson(url, attempts=3) {
  let last;
  for (let attempt=1; attempt<=attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0','accept':'application/json'},
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 600 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

function strings(entity, pid) {
  return (entity?.claims?.[pid] ?? [])
    .map(claim => claim?.mainsnak?.datavalue?.value)
    .filter(value => typeof value === 'string' && value.trim());
}
function items(entity, pid) {
  return (entity?.claims?.[pid] ?? [])
    .map(claim => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}
function label(entity) {
  return entity?.labels?.en?.value ?? entity?.labels?.mul?.value ?? entity?.id ?? null;
}
function qidFromUri(value) {
  return String(value ?? '').match(/\/entity\/(Q\d+)$/)?.[1] ?? null;
}

const usedQids = new Set();
for (const c of dataset.cases.filter(x => x.scope_id === STRATUM)) {
  for (const side of [c.left, c.right]) {
    for (const value of [side?.wikidata_bridge, side?.entity_id, side?.unique_keys?.object_id]) {
      if (typeof value === 'string' && /^Q\d+$/.test(value)) usedQids.add(value);
    }
  }
}

const HARD_CREATOR = 'Q5582';
const objectRowsQuery = `
SELECT ?item ?inventory WHERE {
  ?item wdt:P170 wd:${HARD_CREATOR} ; wdt:P217 ?inventory .
}
LIMIT 120`;
const rowsJson = await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(objectRowsQuery)}&format=json`);
const rows = (rowsJson?.results?.bindings ?? [])
  .map(row => ({
    item: qidFromUri(row?.item?.value),
    creator: HARD_CREATOR,
    inventory: String(row?.inventory?.value ?? '').trim()
  }))
  .filter(row => row.item && row.inventory && !usedQids.has(row.item));

const candidatePairs = [];
for (let i=0; i<rows.length; i++) {
  for (let j=i+1; j<rows.length; j++) {
    if (rows[i].item !== rows[j].item && rows[i].inventory !== rows[j].inventory) {
      candidatePairs.push({creator:HARD_CREATOR,left:rows[i],right:rows[j]});
      if (candidatePairs.length >= 20) break;
    }
  }
  if (candidatePairs.length >= 20) break;
}
if (candidatePairs.length === 0) throw new Error('NO_PROVENANCE_HARD_NEGATIVE_CANDIDATES');

let hardPair = null;
let hardLeft = null;
let hardRight = null;
for (const candidate of candidatePairs) {
  let leftJson, rightJson;
  try {
    [leftJson, rightJson] = await Promise.all([
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.left.item}.json`),
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.right.item}.json`)
    ]);
  } catch {
    continue;
  }
  const leftEntity = leftJson?.entities?.[candidate.left.item];
  const rightEntity = rightJson?.entities?.[candidate.right.item];
  if (!leftEntity || !rightEntity) continue;
  const creatorValid = items(leftEntity, 'P170').includes(candidate.creator) && items(rightEntity, 'P170').includes(candidate.creator);
  const inventoryValid = strings(leftEntity, 'P217').includes(candidate.left.inventory) && strings(rightEntity, 'P217').includes(candidate.right.inventory);
  const ambiguityLink = items(leftEntity, 'P460').includes(candidate.right.item) || items(rightEntity, 'P460').includes(candidate.left.item);
  if (creatorValid && inventoryValid && !ambiguityLink) {
    hardPair = candidate;
    hardLeft = leftEntity;
    hardRight = rightEntity;
    break;
  }
}
if (!hardPair) throw new Error('NO_REVALIDATED_PROVENANCE_HARD_NEGATIVE_PAIR');

const hardNegative = {
  case_id: `wikidata-provenance-hard-negative-${hardPair.left.item}-${hardPair.right.item}`,
  case_class: 'HARD_NEGATIVE',
  identity_boundary: 'PHYSICAL_OBJECT',
  scope_id: STRATUM,
  expected: 'NO_MATCH',
  blind_holdout: true,
  left: {
    anchors: {PHYSICAL_OBJECT: `wikidata-collection-object:${hardPair.left.item}:${hardPair.left.inventory}`},
    unique_keys: {object_id: hardPair.left.item, accession_number: hardPair.left.inventory},
    creator_id: hardPair.creator,
    label: label(hardLeft),
    source: 'wikidata-structured-data'
  },
  right: {
    anchors: {PHYSICAL_OBJECT: `wikidata-collection-object:${hardPair.right.item}:${hardPair.right.inventory}`},
    unique_keys: {object_id: hardPair.right.item, accession_number: hardPair.right.inventory},
    creator_id: hardPair.creator,
    label: label(hardRight),
    source: 'wikidata-structured-data'
  },
  provenance_refs: [
    `wikidata:${hardPair.left.item}:P170:${hardPair.creator}`,
    `wikidata:${hardPair.right.item}:P170:${hardPair.creator}`,
    `wikidata:${hardPair.left.item}:P217:${hardPair.left.inventory}`,
    `wikidata:${hardPair.right.item}:P217:${hardPair.right.inventory}`
  ],
  rights_state: 'ALLOW',
  label_basis: 'LIVE_WIKIDATA_CC0_REVALIDATES_TWO_DISTINCT_INVENTORIED_COLLECTION_OBJECTS_WITH_THE_SAME_CREATOR_BUT_DISTINCT_OBJECT_AND_ACCESSION_IDENTITIES_AND_NO_P460_SAMENESS_LINK',
  claim_ceiling: 'UNIQUE_COLLECTION_OBJECT_IDENTITY_ONLY_SHARED_CREATOR_DOES_NOT_IMPLY_SAME_OBJECT'
};

const ambiguousQuery = `
SELECT ?left ?right ?leftInventory ?rightInventory WHERE {
  ?left wdt:P460 ?right ; wdt:P217 ?leftInventory .
  ?right wdt:P217 ?rightInventory .
  FILTER(?left != ?right)
  FILTER(?leftInventory != ?rightInventory)
}
LIMIT 120`;
const ambiguousJson = await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(ambiguousQuery)}&format=json`);
let ambiguous = null;
for (const row of ambiguousJson?.results?.bindings ?? []) {
  const left = qidFromUri(row?.left?.value);
  const right = qidFromUri(row?.right?.value);
  const leftInventory = String(row?.leftInventory?.value ?? '').trim();
  const rightInventory = String(row?.rightInventory?.value ?? '').trim();
  if (!left || !right || !leftInventory || !rightInventory || left === right) continue;
  if (usedQids.has(left) || usedQids.has(right) || left === hardPair.left.item || left === hardPair.right.item || right === hardPair.left.item || right === hardPair.right.item) continue;
  let leftJson, rightJson;
  try {
    [leftJson, rightJson] = await Promise.all([
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${left}.json`),
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${right}.json`)
    ]);
  } catch {
    continue;
  }
  const leftEntity = leftJson?.entities?.[left];
  const rightEntity = rightJson?.entities?.[right];
  if (!leftEntity || !rightEntity) continue;
  const p460 = items(leftEntity, 'P460').includes(right) || items(rightEntity, 'P460').includes(left);
  const inventories = strings(leftEntity, 'P217').includes(leftInventory) && strings(rightEntity, 'P217').includes(rightInventory);
  if (p460 && inventories) {
    ambiguous = {left, right, leftInventory, rightInventory, leftEntity, rightEntity};
    break;
  }
}
if (!ambiguous) throw new Error('NO_REVALIDATED_PROVENANCE_AMBIGUOUS_PAIR');

const ambiguousReview = {
  case_id: `wikidata-provenance-ambiguous-p460-${ambiguous.left}-${ambiguous.right}`,
  case_class: 'AMBIGUOUS_REVIEW_REQUIRED',
  identity_boundary: 'PHYSICAL_OBJECT',
  scope_id: STRATUM,
  expected: 'REVIEW',
  blind_holdout: true,
  left: {
    entity_id: ambiguous.left,
    candidate_inventory_number: ambiguous.leftInventory,
    label: label(ambiguous.leftEntity),
    source: 'wikidata-structured-data',
    evidence_relation: 'P460_SAID_TO_BE_THE_SAME_AS'
  },
  right: {
    entity_id: ambiguous.right,
    candidate_inventory_number: ambiguous.rightInventory,
    label: label(ambiguous.rightEntity),
    source: 'wikidata-structured-data',
    evidence_relation: 'P460_SAID_TO_BE_THE_SAME_AS'
  },
  provenance_refs: [
    `wikidata:${ambiguous.left}:P460:${ambiguous.right}:revalidated`,
    `wikidata:${ambiguous.left}:P217:${ambiguous.leftInventory}`,
    `wikidata:${ambiguous.right}:P217:${ambiguous.rightInventory}`,
    'wikidata-property:P460:uncertain-or-disputed-sameness'
  ],
  rights_state: 'ALLOW',
  label_basis: 'LIVE_WIKIDATA_CC0_REVALIDATES_A_P460_SAID_TO_BE_THE_SAME_AS_RELATION_BETWEEN_TWO_SEPARATELY_INVENTORIED_RECORDS;_P460_MAY_EXPRESS_UNCERTAIN_OR_DISPUTED_SAMENESS_SO_PHYSICAL_OBJECT_IDENTITY_REQUIRES_REVIEW',
  claim_ceiling: 'PROVENANCE_UNIQUE_OBJECT_REVIEW_REQUIRED_NO_AUTO_MERGE_OR_AUTO_SPLIT'
};

for (const c of [hardNegative, ambiguousReview]) {
  if (dataset.cases.some(x => x.case_id === c.case_id)) throw new Error(`DUPLICATE_R7I_CASE:${c.case_id}`);
}
const out = {
  ...dataset,
  id: 'entity-resolution-real-world-dataset-r7i-provenance-minimums',
  dataset_scope: 'R7I_PROVENANCE_UNIQUE_OBJECT_MINIMUMS_COMPLETE',
  cases: [...dataset.cases, hardNegative, ambiguousReview],
  truth_boundary: 'R7I adds a creator-shared but accession-distinct physical-object hard negative plus a separately inventoried P460 uncertain/disputed sameness review case. Existing Getty historical transaction-to-object evidence supplies the MARKET_EVENT minimum. No current-market, attribution-resolution or provenance-chain completeness claim is inferred. Final promotion remains blocked until all seven strata and Track B pass.'
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({id:out.id, hard_negative:{creator:hardPair.creator,left:hardPair.left,right:hardPair.right}, ambiguous_review:{left:ambiguous.left,right:ambiguous.right,leftInventory:ambiguous.leftInventory,rightInventory:ambiguous.rightInventory}, production:'HOLD'}, null, 2));
