import fs from 'node:fs/promises';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7h.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath) {
  throw new Error('Usage: node extend-er-r7g-pressing-minimums-r7h.mjs <dataset> <manifest> [out]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const STRATUM = 'er-stratum-pressing-edition-media';
if (!(manifest.required_strata_ids ?? []).includes(STRATUM)) throw new Error('PRESSING_STRATUM_REQUIRED');
if (dataset.dataset_class !== 'REAL_WORLD_LABELED' || dataset.synthetic === true || !Array.isArray(dataset.cases)) {
  throw new Error('R7G_REAL_WORLD_DATASET_REQUIRED');
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

const normalizationQuery = `
SELECT ?item ?mbid WHERE {
  ?item wdt:P5813 ?mbid .
}
ORDER BY STR(?item)
LIMIT 700`;
const normalizationJson = await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(normalizationQuery)}&format=json`);
let normalization = null;
for (const row of normalizationJson?.results?.bindings ?? []) {
  const qid = qidFromUri(row?.item?.value);
  const mbid = String(row?.mbid?.value ?? '').trim();
  if (qid && mbid && !usedQids.has(qid)) { normalization = {qid, mbid}; break; }
}
if (!normalization) throw new Error('NO_INDEPENDENT_PRESSING_NORMALIZATION_CANDIDATE');
const normalizationEntityJson = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${normalization.qid}.json`);
const normalizationEntity = normalizationEntityJson?.entities?.[normalization.qid];
if (!normalizationEntity || !strings(normalizationEntity, 'P5813').includes(normalization.mbid)) {
  throw new Error('PRESSING_NORMALIZATION_REVALIDATION_FAILED');
}
const normalizationAnchor = `wikidata-pressing-release:${normalization.qid}`;
const sameObject = {
  case_id: `wikidata-pressing-normalization-${normalization.qid}`,
  case_class: 'SAME_OBJECT_NORMALIZATION',
  identity_boundary: 'SOURCE_RECORD',
  scope_id: STRATUM,
  expected: 'MATCH',
  blind_holdout: true,
  left: {
    anchors: {SOURCE_RECORD: normalizationAnchor},
    unique_keys: {reference_id: `wikidata:${normalization.qid}`},
    external_system: 'Wikidata',
    external_id: normalization.qid,
    wikidata_bridge: normalization.qid,
    label: label(normalizationEntity),
    source: 'wikidata-structured-data'
  },
  right: {
    anchors: {SOURCE_RECORD: normalizationAnchor},
    unique_keys: {reference_id: `musicbrainz-release:${normalization.mbid}`},
    external_system: 'MusicBrainzReleaseID',
    external_id: normalization.mbid,
    wikidata_bridge: normalization.qid,
    label: label(normalizationEntity),
    source: 'wikidata-structured-data'
  },
  provenance_refs: [
    `wikidata:${normalization.qid}:entity-id`,
    `wikidata:${normalization.qid}:P5813:${normalization.mbid}`
  ],
  rights_state: 'ALLOW',
  label_basis: 'LIVE_WIKIDATA_CC0_BINDS_THE_WIKIDATA_RELEASE_RECORD_AND_MUSICBRAINZ_RELEASE_ID_TO_THE_SAME_RELEASE_EDITION_ITEM',
  claim_ceiling: 'RELEASE_SOURCE_RECORD_NORMALIZATION_ONLY_NO_COPY_LEVEL_OR_MARKET_INFERENCE'
};

const hardNegativeQuery = `
SELECT ?left ?right ?work ?leftRelease ?rightRelease WHERE {
  ?left wdt:P629 ?work ; wdt:P5813 ?leftRelease .
  ?right wdt:P629 ?work ; wdt:P5813 ?rightRelease .
  FILTER(STR(?left) < STR(?right))
  FILTER(?leftRelease != ?rightRelease)
}
ORDER BY STR(?work) STR(?left) STR(?right)
LIMIT 700`;
const hardJson = await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(hardNegativeQuery)}&format=json`);
let hardPair = null;
for (const row of hardJson?.results?.bindings ?? []) {
  const leftQid = qidFromUri(row?.left?.value);
  const rightQid = qidFromUri(row?.right?.value);
  const workQid = qidFromUri(row?.work?.value);
  const leftRelease = String(row?.leftRelease?.value ?? '').trim();
  const rightRelease = String(row?.rightRelease?.value ?? '').trim();
  if (leftQid && rightQid && workQid && leftRelease && rightRelease && leftQid !== rightQid && leftRelease !== rightRelease) {
    if (usedQids.has(leftQid) || usedQids.has(rightQid) || leftQid === normalization.qid || rightQid === normalization.qid) continue;
    hardPair = {leftQid, rightQid, workQid, leftRelease, rightRelease};
    break;
  }
}
if (!hardPair) throw new Error('NO_PRESSING_HARD_NEGATIVE_PAIR');
const [leftJson, rightJson] = await Promise.all([
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${hardPair.leftQid}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${hardPair.rightQid}.json`)
]);
const leftEntity = leftJson?.entities?.[hardPair.leftQid];
const rightEntity = rightJson?.entities?.[hardPair.rightQid];
if (!leftEntity || !rightEntity) throw new Error('PRESSING_HARD_NEGATIVE_ENTITYDATA_MISSING');
if (!items(leftEntity, 'P629').includes(hardPair.workQid) || !items(rightEntity, 'P629').includes(hardPair.workQid)) {
  throw new Error('PRESSING_SHARED_RELEASE_WORK_REVALIDATION_FAILED');
}
if (!strings(leftEntity, 'P5813').includes(hardPair.leftRelease) || !strings(rightEntity, 'P5813').includes(hardPair.rightRelease)) {
  throw new Error('PRESSING_DISTINCT_RELEASE_ID_REVALIDATION_FAILED');
}
const hardNegative = {
  case_id: `wikidata-pressing-hard-negative-${hardPair.leftQid}-${hardPair.rightQid}`,
  case_class: 'HARD_NEGATIVE',
  identity_boundary: 'PHYSICAL_OBJECT',
  scope_id: STRATUM,
  expected: 'NO_MATCH',
  blind_holdout: true,
  left: {
    anchors: {PHYSICAL_OBJECT: `music-release-manifestation:${hardPair.leftQid}:${hardPair.leftRelease}`},
    unique_keys: {object_id: hardPair.leftQid, reference_id: hardPair.leftRelease},
    release_work_id: hardPair.workQid,
    label: label(leftEntity),
    source: 'wikidata-structured-data'
  },
  right: {
    anchors: {PHYSICAL_OBJECT: `music-release-manifestation:${hardPair.rightQid}:${hardPair.rightRelease}`},
    unique_keys: {object_id: hardPair.rightQid, reference_id: hardPair.rightRelease},
    release_work_id: hardPair.workQid,
    label: label(rightEntity),
    source: 'wikidata-structured-data'
  },
  provenance_refs: [
    `wikidata:${hardPair.leftQid}:P629:${hardPair.workQid}`,
    `wikidata:${hardPair.rightQid}:P629:${hardPair.workQid}`,
    `wikidata:${hardPair.leftQid}:P5813:${hardPair.leftRelease}`,
    `wikidata:${hardPair.rightQid}:P5813:${hardPair.rightRelease}`
  ],
  rights_state: 'ALLOW',
  label_basis: 'LIVE_WIKIDATA_CC0_REVALIDATES_TWO_DISTINCT_RELEASE_EDITION_ITEMS_OF_THE_SAME_PARENT_WORK_WITH_DISTINCT_MUSICBRAINZ_RELEASE_IDS',
  claim_ceiling: 'PRESSING_RELEASE_MANIFESTATION_IDENTITY_ONLY_NOT_INDIVIDUAL_COPY_PROVENANCE_OR_MARKET_INFERENCE'
};

for (const c of [sameObject, hardNegative]) {
  if (dataset.cases.some(x => x.case_id === c.case_id)) throw new Error(`DUPLICATE_R7H_CASE:${c.case_id}`);
}
const out = {
  ...dataset,
  id: 'entity-resolution-real-world-dataset-r7h-pressing-minimums',
  dataset_scope: 'R7H_PRESSING_EDITION_MEDIA_MINIMUMS_COMPLETE',
  cases: [...dataset.cases, sameObject, hardNegative],
  truth_boundary: 'R7H adds independent live-revalidated release-record normalization and same-work/different-release hard-negative evidence for PRESSING_EDITION_MEDIA. The PHYSICAL_OBJECT boundary is limited to release/pressing manifestation identity, not individual-copy provenance. Final promotion remains blocked until all seven strata and Track B pass.'
};
await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({id:out.id, normalization, hard_negative:hardPair, production:'HOLD'}, null, 2));
