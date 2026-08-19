import fs from 'node:fs/promises';

const [inputPath, manifestPath, admissionPath, outputPath='/tmp/er-real-world-r7j.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath || !admissionPath) {
  throw new Error('Usage: node extend-er-r7i-designer-maker-minimums-r7j.mjs <dataset> <manifest> <admission> [out]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const admission = JSON.parse(await fs.readFile(admissionPath, 'utf8'));
const STRATUM = 'er-stratum-designer-maker-edition';
if (!(manifest.required_strata_ids ?? []).includes(STRATUM)) throw new Error('DESIGNER_MAKER_STRATUM_REQUIRED');
if (dataset.dataset_class !== 'REAL_WORLD_LABELED' || dataset.synthetic === true || !Array.isArray(dataset.cases)) throw new Error('R7I_REAL_WORLD_DATASET_REQUIRED');
if (admission.admission_scope !== 'DESIGNER_MAKER_EDITION_IDENTITY_CALIBRATION_ONLY' || admission.sources?.some(s=>s.admission_state!=='ADMITTED')) throw new Error('DESIGNER_MAKER_SOURCE_ADMISSION_REQUIRED');

const timeoutMs = 18000;
async function fetchText(url, attempts=3) {
  let last;
  for (let attempt=1; attempt<=attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0','accept':'application/json,text/plain,text/html'},signal:controller.signal});
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise(resolve=>setTimeout(resolve,600*attempt));
    } finally { clearTimeout(timer); }
  }
  throw last;
}
async function fetchJson(url){ return JSON.parse(await fetchText(url)); }

const moma1 = {work_id:'1611', object_number:'24.1997.1', url:'https://www.moma.org/collection/works/1611'};
const moma2 = {work_id:'103159', object_number:'24.1997.2', url:'https://www.moma.org/collection/works/103159'};
const modelToken = '3107';
const canonicalAnchor = 'designer-maker:arne-jacobsen:fritz-hansen:model-3107';

const [page1,page2,cooper] = await Promise.all([
  fetchText(moma1.url),
  fetchText(moma2.url),
  fetchJson('https://raw.githubusercontent.com/cooperhewitt/collection/master/objects/187/349/45/18734945.json')
]);
for (const [page,target] of [[page1,moma1],[page2,moma2]]) {
  if (!page.includes('Chair Series 7 (3107)') || !page.includes(target.object_number)) throw new Error(`MOMA_EXEMPLAR_REVALIDATION_FAILED:${target.object_number}`);
}
const roles = Object.fromEntries((cooper.participants ?? []).map(p=>[p.role_name,p.person_name]));
if (cooper.id !== '18734945' || cooper.accession_number !== '2009-26-1-a,b' || cooper.title_raw !== 'Model #3107') throw new Error('COOPER_CANONICAL_MODEL_REVALIDATION_FAILED');
if (roles.Designer !== 'Arne Jacobsen' || !String(roles.Manufacturer ?? '').startsWith('Fritz Hansen')) throw new Error('COOPER_DESIGNER_MAKER_REVALIDATION_FAILED');
if (!cooper.title_raw.includes(modelToken)) throw new Error('EXACT_MODEL_TOKEN_3107_REQUIRED');

const sameObject = {
  case_id: 'moma-designer-maker-normalization-1611-24.1997.1',
  case_class: 'SAME_OBJECT_NORMALIZATION',
  identity_boundary: 'SOURCE_RECORD',
  scope_id: STRATUM,
  expected: 'MATCH',
  blind_holdout: true,
  left: {
    anchors: {SOURCE_RECORD:'moma-collection-record:1611'},
    unique_keys: {reference_id:'moma-work:1611'},
    object_number:moma1.object_number,
    model_token:modelToken,
    designer:'Arne Jacobsen',
    source:'moma-collection-research-dataset'
  },
  right: {
    anchors: {SOURCE_RECORD:'moma-collection-record:1611'},
    unique_keys: {reference_id:'moma-object-number:24.1997.1'},
    object_number:moma1.object_number,
    model_token:modelToken,
    designer:'Arne Jacobsen',
    source:'moma-collection-research-dataset'
  },
  provenance_refs: [
    'moma:collection-work:1611',
    'moma:object-number:24.1997.1',
    'source-admission:designer-maker-moma-cooper-admission-r3'
  ],
  rights_state:'ALLOW',
  label_basis:'LIVE_MOMA_OFFICIAL_COLLECTION_RECORD_BINDS_WORK_1611_AND_OBJECT_NUMBER_24.1997.1_TO_THE_SAME_SERIES_7_MODEL_3107_COLLECTION_RECORD',
  claim_ceiling:'SOURCE_RECORD_NORMALIZATION_ONLY_NO_IMAGE_OR_MARKET_CLAIM'
};

const sameDesign = {
  case_id: 'moma-cooper-series7-3107-same-design-24.1997.1-24.1997.2',
  case_class: 'SAME_DESIGN_DIFFERENT_OBJECT',
  identity_boundary: 'CANONICAL_DESIGN',
  scope_id: STRATUM,
  expected: 'MATCH',
  blind_holdout: true,
  left: {
    anchors: {CANONICAL_DESIGN:canonicalAnchor},
    unique_keys: {object_id:'moma:1611',accession_number:moma1.object_number},
    model_token:modelToken,
    designer:'Arne Jacobsen',
    manufacturer:'Fritz Hansen',
    source:'moma-collection-research-dataset'
  },
  right: {
    anchors: {CANONICAL_DESIGN:canonicalAnchor},
    unique_keys: {object_id:'moma:103159',accession_number:moma2.object_number},
    model_token:modelToken,
    designer:'Arne Jacobsen',
    manufacturer:'Fritz Hansen',
    source:'moma-collection-research-dataset'
  },
  provenance_refs: [
    'moma:collection-work:1611:object-number:24.1997.1',
    'moma:collection-work:103159:object-number:24.1997.2',
    'cooper-hewitt:object:18734945:model-3107:designer-arne-jacobsen:manufacturer-fritz-hansen',
    'source-admission:designer-maker-moma-cooper-admission-r3'
  ],
  rights_state:'ALLOW',
  label_basis:'TWO_DISTINCT_MOMA_COLLECTION_OBJECT_NUMBERS_EXPLICITLY_SHARE_SERIES_7_MODEL_3107_AND_DESIGNER_ARNE_JACOBSEN;_COOPER_HEWITT_CC0_RECORD_INDEPENDENTLY_REVALIDATES_EXACT_MODEL_3107_DESIGNER_ARNE_JACOBSEN_AND_MANUFACTURER_FRITZ_HANSEN',
  claim_ceiling:'CANONICAL_DESIGN_IDENTITY_ONLY_DISTINCT_PHYSICAL_OBJECTS_REMAIN_DISTINCT'
};

const hardNegative = {
  case_id: 'moma-series7-3107-physical-hard-negative-24.1997.1-24.1997.2',
  case_class: 'HARD_NEGATIVE',
  identity_boundary: 'PHYSICAL_OBJECT',
  scope_id: STRATUM,
  expected: 'NO_MATCH',
  blind_holdout: true,
  left: {
    anchors: {PHYSICAL_OBJECT:'moma-physical-object:24.1997.1'},
    unique_keys: {object_id:'moma:1611',accession_number:moma1.object_number},
    canonical_design:canonicalAnchor,
    source:'moma-collection-research-dataset'
  },
  right: {
    anchors: {PHYSICAL_OBJECT:'moma-physical-object:24.1997.2'},
    unique_keys: {object_id:'moma:103159',accession_number:moma2.object_number},
    canonical_design:canonicalAnchor,
    source:'moma-collection-research-dataset'
  },
  provenance_refs: [
    'moma:collection-work:1611:object-number:24.1997.1',
    'moma:collection-work:103159:object-number:24.1997.2',
    'source-admission:designer-maker-moma-cooper-admission-r3'
  ],
  rights_state:'ALLOW',
  label_basis:'OFFICIAL_MOMA_RECORDS_EXPOSE_DISTINCT_OBJECT_NUMBERS_24.1997.1_AND_24.1997.2;_SHARED_MODEL_3107_DOES_NOT_COLLAPSE_PHYSICAL_OBJECT_IDENTITY',
  claim_ceiling:'PHYSICAL_COLLECTION_OBJECT_IDENTITY_ONLY_NO_PROVENANCE_OR_MARKET_CLAIM'
};

for (const c of [sameObject,sameDesign,hardNegative]) if (dataset.cases.some(x=>x.case_id===c.case_id)) throw new Error(`DUPLICATE_R7J_CASE:${c.case_id}`);
const out = {
  ...dataset,
  id:'entity-resolution-real-world-dataset-r7j-designer-maker-minimums',
  dataset_scope:'R7J_DESIGNER_MAKER_EDITION_MINIMUMS_COMPLETE',
  cases:[...dataset.cases,sameObject,sameDesign,hardNegative],
  truth_boundary:'R7J uses only rights-admitted museum metadata: two distinct MoMA Series 7 model 3107 collection objects plus independent Cooper Hewitt CC0 designer/manufacturer/model authority. Matching is exact model/authority based, not name or image similarity. Final promotion remains blocked by GRADED_POPULATION, diagnostic leakage/final freeze and Track B.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,designer:'Arne Jacobsen',manufacturer:'Fritz Hansen',model:modelToken,exemplars:[moma1,moma2],production:'HOLD'},null,2));
