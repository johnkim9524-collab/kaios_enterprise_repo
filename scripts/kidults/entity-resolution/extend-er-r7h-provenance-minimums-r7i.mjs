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

const usedQids = new Set();
for (const c of dataset.cases.filter(x => x.scope_id === STRATUM)) {
  for (const side of [c.left, c.right]) {
    for (const value of [side?.wikidata_bridge, side?.entity_id, side?.unique_keys?.object_id]) {
      if (typeof value === 'string' && /^Q\d+$/.test(value)) usedQids.add(value);
    }
  }
}

// These pairs were discovered and passed the empirical R7I run in PR #532.
// Benchmark execution freezes their identities but still revalidates every
// load-bearing Wikidata claim live. Any source drift therefore fails closed
// without relying on a broad SPARQL discovery query on every replay.
const hardPair = {
  creator: 'Q5582',
  left: {item:'Q5047026', inventory:'2007.68'},
  right: {item:'Q5047027', inventory:'KM 110.256'}
};
const ambiguousPair = {
  left: {item:'Q27928414', inventory:'M.Ob.209 MNW'},
  right: {item:'Q12418', inventory:'INV 779'}
};

for (const qid of [hardPair.left.item, hardPair.right.item, ambiguousPair.left.item, ambiguousPair.right.item]) {
  if (usedQids.has(qid)) throw new Error(`R7I_FROZEN_PAIR_COLLIDES_WITH_UPSTREAM_CASE:${qid}`);
}

const [hardLeftJson, hardRightJson, ambiguousLeftJson, ambiguousRightJson] = await Promise.all([
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${hardPair.left.item}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${hardPair.right.item}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${ambiguousPair.left.item}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${ambiguousPair.right.item}.json`)
]);

const hardLeft = hardLeftJson?.entities?.[hardPair.left.item];
const hardRight = hardRightJson?.entities?.[hardPair.right.item];
if (!hardLeft || !hardRight) throw new Error('R7I_HARD_NEGATIVE_ENTITYDATA_MISSING');
if (!items(hardLeft, 'P170').includes(hardPair.creator) || !items(hardRight, 'P170').includes(hardPair.creator)) {
  throw new Error('R7I_HARD_NEGATIVE_CREATOR_REVALIDATION_FAILED');
}
if (!strings(hardLeft, 'P217').includes(hardPair.left.inventory) || !strings(hardRight, 'P217').includes(hardPair.right.inventory)) {
  throw new Error('R7I_HARD_NEGATIVE_INVENTORY_REVALIDATION_FAILED');
}
if (hardPair.left.item === hardPair.right.item || hardPair.left.inventory === hardPair.right.inventory) {
  throw new Error('R7I_HARD_NEGATIVE_DISTINCTNESS_FAILED');
}
if (items(hardLeft, 'P460').includes(hardPair.right.item) || items(hardRight, 'P460').includes(hardPair.left.item)) {
  throw new Error('R7I_HARD_NEGATIVE_NOW_HAS_P460_SAMENESS_LINK');
}

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
    `wikidata:${hardPair.right.item}:P217:${hardPair.right.inventory}`,
    'empirical-r7i-pr532:frozen-evidence-pair'
  ],
  rights_state: 'ALLOW',
  label_basis: 'LIVE_WIKIDATA_CC0_REVALIDATES_TWO_DISTINCT_INVENTORIED_COLLECTION_OBJECTS_WITH_THE_SAME_CREATOR_BUT_DISTINCT_OBJECT_AND_ACCESSION_IDENTITIES_AND_NO_P460_SAMENESS_LINK',
  claim_ceiling: 'UNIQUE_COLLECTION_OBJECT_IDENTITY_ONLY_SHARED_CREATOR_DOES_NOT_IMPLY_SAME_OBJECT'
};

const ambiguousLeft = ambiguousLeftJson?.entities?.[ambiguousPair.left.item];
const ambiguousRight = ambiguousRightJson?.entities?.[ambiguousPair.right.item];
if (!ambiguousLeft || !ambiguousRight) throw new Error('R7I_AMBIGUOUS_ENTITYDATA_MISSING');
if (!strings(ambiguousLeft, 'P217').includes(ambiguousPair.left.inventory) || !strings(ambiguousRight, 'P217').includes(ambiguousPair.right.inventory)) {
  throw new Error('R7I_AMBIGUOUS_INVENTORY_REVALIDATION_FAILED');
}
const p460Forward = items(ambiguousLeft, 'P460').includes(ambiguousPair.right.item);
const p460Reverse = items(ambiguousRight, 'P460').includes(ambiguousPair.left.item);
if (!p460Forward && !p460Reverse) throw new Error('R7I_AMBIGUOUS_P460_REVALIDATION_FAILED');
if (ambiguousPair.left.item === ambiguousPair.right.item || ambiguousPair.left.inventory === ambiguousPair.right.inventory) {
  throw new Error('R7I_AMBIGUOUS_DISTINCT_RECORD_REVALIDATION_FAILED');
}

const ambiguousReview = {
  case_id: `wikidata-provenance-ambiguous-p460-${ambiguousPair.left.item}-${ambiguousPair.right.item}`,
  case_class: 'AMBIGUOUS_REVIEW_REQUIRED',
  identity_boundary: 'PHYSICAL_OBJECT',
  scope_id: STRATUM,
  expected: 'REVIEW',
  blind_holdout: true,
  left: {
    entity_id: ambiguousPair.left.item,
    candidate_inventory_number: ambiguousPair.left.inventory,
    label: label(ambiguousLeft),
    source: 'wikidata-structured-data',
    evidence_relation: 'P460_SAID_TO_BE_THE_SAME_AS'
  },
  right: {
    entity_id: ambiguousPair.right.item,
    candidate_inventory_number: ambiguousPair.right.inventory,
    label: label(ambiguousRight),
    source: 'wikidata-structured-data',
    evidence_relation: 'P460_SAID_TO_BE_THE_SAME_AS'
  },
  provenance_refs: [
    `wikidata:${ambiguousPair.left.item}:P460:${ambiguousPair.right.item}:revalidated:${p460Forward?'forward':'reverse'}`,
    `wikidata:${ambiguousPair.left.item}:P217:${ambiguousPair.left.inventory}`,
    `wikidata:${ambiguousPair.right.item}:P217:${ambiguousPair.right.inventory}`,
    'wikidata-property:P460:uncertain-or-disputed-sameness',
    'empirical-r7i-pr532:frozen-evidence-pair'
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
  truth_boundary: 'R7I reuses evidence pairs that already passed the empirical PR #532 benchmark and revalidates every load-bearing Wikidata EntityData claim live on each replay. Broad SPARQL rediscovery is deliberately removed from benchmark execution to eliminate a non-semantic availability flake. Existing Getty historical transaction-to-object evidence supplies the MARKET_EVENT minimum. No current-market, attribution-resolution or provenance-chain completeness claim is inferred. Final promotion remains blocked until all seven strata and Track B pass.'
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id:out.id,
  hard_negative:{creator:hardPair.creator,left:hardPair.left,right:hardPair.right},
  ambiguous_review:{left:ambiguousPair.left.item,right:ambiguousPair.right.item,leftInventory:ambiguousPair.left.inventory,rightInventory:ambiguousPair.right.inventory,p460Forward,p460Reverse},
  replay_model:'FROZEN_EVIDENCE_PAIR_PLUS_LIVE_ENTITYDATA_REVALIDATION',
  production:'HOLD'
}, null, 2));
