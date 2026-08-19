import fs from 'node:fs/promises';

const [datasetPath, manifestPath, outputPath='/tmp/er-real-world-r7a.json'] = process.argv.slice(2);
if (!datasetPath || !manifestPath) throw new Error('Usage: node promote-er-r6-to-approved-strata-r7a.mjs <r6.json> <strata-manifest.json> [r7a.json]');

const dataset=JSON.parse(await fs.readFile(datasetPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R6_REAL_WORLD_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION') throw new Error('APPROVED_CALIBRATION_MANIFEST_REQUIRED');

const required=new Set(manifest.required_strata_ids||[]);
const VEHICLE='er-stratum-vehicle-mechanical-asset';
const PRESSING='er-stratum-pressing-edition-media';
const UNIQUE='er-stratum-provenance-unique-object';
for(const id of [VEHICLE,PRESSING,UNIQUE]) if(!required.has(id)) throw new Error(`REQUIRED_STRATUM_MISSING:${id}`);

let vehiclePromoted=0, pressingPromoted=0, uniquePromoted=0;
const cases=dataset.cases.map((item)=>{
  const c=structuredClone(item);

  if(c.case_class==='SAME_DESIGN_DIFFERENT_OBJECT' && c.identity_boundary==='CANONICAL_DESIGN'){
    const p=Array.isArray(c.provenance_refs)?c.provenance_refs:[];
    const exactVehicleEvidence = c.expected==='MATCH'
      && c.left?.source==='wikidata-structured-data'
      && c.right?.source==='wikidata-structured-data'
      && c.left?.unique_keys?.object_id && c.right?.unique_keys?.object_id
      && c.left.unique_keys.object_id!==c.right.unique_keys.object_id
      && c.design_label==='Boeing B-29 Superfortress'
      && p.some(x=>String(x).includes('Q184870'))
      && c.claim_ceiling==='CANONICAL_DESIGN_IDENTITY_DIAGNOSTIC_ONLY';
    if(exactVehicleEvidence){ c.scope_id=VEHICLE; vehiclePromoted++; }
  }

  if(c.case_class==='CROSS_MARKET_ALIAS' && c.identity_boundary==='SOURCE_RECORD'){
    const systems=new Set([c.left?.external_system,c.right?.external_system]);
    const exactPressingEvidence = c.expected==='MATCH'
      && systems.has('Discogs') && systems.has('MusicBrainz')
      && c.left?.external_id && c.right?.external_id
      && c.left?.wikidata_bridge && c.left.wikidata_bridge===c.right?.wikidata_bridge
      && c.claim_ceiling==='EXTERNAL_RELEASE_IDENTIFIER_CROSSWALK_ONLY_NO_MARKET_PRICE_OR_SALES_DATA'
      && String(c.label_basis||'').includes('RELEASE_IDENTIFIERS');
    if(exactPressingEvidence){ c.scope_id=PRESSING; pressingPromoted++; }
  }

  if(c.case_class==='TRANSACTION_TO_OBJECT_LINKAGE' && c.identity_boundary==='MARKET_EVENT'){
    const exactUniqueEvidence = c.expected==='MATCH'
      && c.left?.source==='getty-provenance-index'
      && c.right?.source==='getty-provenance-index'
      && c.left?.record_type==='Activity'
      && c.right?.record_type==='HumanMadeObject'
      && c.left?.semantic_role==='HISTORICAL_SALE_ACTIVITY'
      && c.right?.semantic_role==='SALE_OBJECT'
      && c.claim_ceiling==='HISTORICAL_TRANSACTION_TO_OBJECT_LINKAGE_ONLY';
    if(exactUniqueEvidence){ c.scope_id=UNIQUE; uniquePromoted++; }
  }
  return c;
});

if(vehiclePromoted!==1) throw new Error(`VEHICLE_STRATUM_EXACTLY_ONE_PROMOTION_REQUIRED:${vehiclePromoted}`);
if(pressingPromoted!==1) throw new Error(`PRESSING_STRATUM_EXACTLY_ONE_PROMOTION_REQUIRED:${pressingPromoted}`);
if(uniquePromoted!==1) throw new Error(`PROVENANCE_UNIQUE_STRATUM_EXACTLY_ONE_PROMOTION_REQUIRED:${uniquePromoted}`);

const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>required.has(x)))].sort();
const out={
  ...dataset,
  id:'entity-resolution-real-world-dataset-r7a-approved-strata-partial',
  dataset_scope:'R7A_PARTIAL_APPROVED_STRATA_3_OF_7',
  scope_stratification_status:'INCOMPLETE',
  approved_scope_ids:manifest.approved_strata_ids,
  required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id,
  represented_approved_strata_ids:represented,
  cases,
  truth_boundary:'R7A semantically promotes only three real cases into approved calibration strata after structural evidence assertions. Four required strata remain unrepresented; diagnostic scope leakage remains; final scope stratification and promotion must stay blocked.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,represented_approved_strata_ids:represented,case_count:cases.length,production:'HOLD'},null,2));
