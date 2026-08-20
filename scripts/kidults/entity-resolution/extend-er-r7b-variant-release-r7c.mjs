import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7c.json'] = process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7b-variant-release-r7c.mjs <r7b.json> <manifest.json> [r7c.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-variant-release-heavy';
const constructedControlInput=dataset.dataset_class==='REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL'
  && dataset.synthetic===false
  && dataset.constructed_control===true
  && dataset.empirical_benchmark_eligible===false
  && dataset.independent_label_review_complete===false
  && dataset.label_adjudication_complete===false
  && dataset.holdout_sealed_before_modeling===false
  && Array.isArray(dataset.cases)
  && dataset.cases.every((item)=>item.blind_holdout!==true);
if(!constructedControlInput) throw new Error('R7B_CONSTRUCTED_CONTROL_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION'||!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('VARIANT_RELEASE_STRATUM_NOT_APPROVED');

// WDQS can transiently exceed the former 18s ceiling. Keep this live-source and fail-closed,
// but give each bounded request enough time and retry transient transport/server failures.
const timeoutMs=45000;
const WIKIDATA_RIGHTS_URL='https://www.wikidata.org/wiki/Wikidata:Licensing';
const digest=(value)=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function fetchJson(url,headers={},attempts=3){
  let last;
  for(let a=1;a<=attempts;a++){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});
      if(!r.ok){
        const error=new Error(`${url} -> HTTP ${r.status}`);
        if(![429,500,502,503,504].includes(r.status)) throw error;
        last=error;
      } else {
        return await r.json();
      }
    }catch(e){last=e;}
    finally{clearTimeout(t);}
    if(a<attempts) await sleep(Math.min(8000,1200*(2**(a-1))));
  }
  throw last;
}
function stringValues(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

// Discover product models carrying more than one manufacturer/model code. P13351 is
// Wikidata's model-number property; P176 anchors an explicit manufacturer relationship.
const sparql='SELECT ?item ?modelNumber ?manufacturer WHERE { ?item wdt:P13351 ?modelNumber ; wdt:P176 ?manufacturer . } ORDER BY STR(?item) STR(?modelNumber) LIMIT 500';
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'},4);
const rows=q?.results?.bindings??[];
if(rows.length===0) throw new Error('NO_MODEL_NUMBER_CANDIDATES');
const groups=new Map();
for(const row of rows){
  const qid=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const manufacturer=String(row?.manufacturer?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const code=String(row?.modelNumber?.value??'').trim();
  if(!qid||!manufacturer||!code) continue;
  const key=`${qid}|${manufacturer}`; const arr=groups.get(key)??[]; arr.push(code); groups.set(key,arr);
}
let selected=null;
for(const [key,arr] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  const codes=[...new Set(arr)].sort();
  if(codes.length>=2){const [qid,manufacturer]=key.split('|'); selected={qid,manufacturer,codes:codes.slice(0,2)}; break;}
}
if(!selected) throw new Error('NO_SINGLE_PRODUCT_MODEL_WITH_TWO_DISTINCT_MODEL_NUMBERS');

const j=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.qid}.json`,{},3);
const entity=j?.entities?.[selected.qid];
if(!entity) throw new Error('VARIANT_ENTITYDATA_MISSING');
const liveCodes=stringValues(entity,'P13351'); const liveManufacturers=itemIds(entity,'P176');
if(!selected.codes.every(x=>liveCodes.includes(x))) throw new Error('MODEL_NUMBER_REVALIDATION_FAILED');
if(!liveManufacturers.includes(selected.manufacturer)) throw new Error('MANUFACTURER_REVALIDATION_FAILED');
if(selected.codes[0]===selected.codes[1]) throw new Error('DISTINCT_MODEL_NUMBERS_REQUIRED');

const anchor=`wikidata-product-model:${selected.qid}`;
const variantNormalization={
  case_id:`wikidata-variant-model-number-normalization-${selected.qid}`,
  case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:false,
  constructed_control:true,label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`model-number:${selected.codes[0]}`},entity_id:selected.qid,model_number:selected.codes[0],manufacturer_id:selected.manufacturer,label:label(entity),source:'wikidata-structured-data'},
  right:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`model-number:${selected.codes[1]}`},entity_id:selected.qid,model_number:selected.codes[1],manufacturer_id:selected.manufacturer,label:String(label(entity)).toLowerCase(),source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.qid}:P13351:${selected.codes[0]}`,`wikidata:${selected.qid}:P13351:${selected.codes[1]}`,`wikidata:${selected.qid}:P176:${selected.manufacturer}`,'wikidata-property:P13351:model-number'],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_BINDING_TWO_DISTINCT_MANUFACTURER_MODEL_NUMBERS_TO_THE_SAME_PRODUCT_MODEL_ITEM',
  source_evidence:[
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${selected.qid}.json`,source_payload_sha256:digest(j),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  claim_ceiling:'VARIANT_RELEASE_PRODUCT_MODEL_NORMALIZATION_ONLY_NO_REGION_OR_MARKET_INFERENCE'
};
if(dataset.cases.some(x=>x.case_id===variantNormalization.case_id)) throw new Error('DUPLICATE_R7C_CASE');
const cases=[...dataset.cases,variantNormalization];
const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>(manifest.required_strata_ids||[]).includes(x)))].sort();
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7c-strata-mapped-partial',
  dataset_scope:'R7C_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_NORMALIZATION_ONLY_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',synthetic:false,constructed_control:true,
  empirical_benchmark_eligible:false,independent_label_review_complete:false,label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,production:'HOLD',
  scope_stratification_status:'INCOMPLETE',approved_scope_ids:manifest.approved_strata_ids,required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id,represented_approved_strata_ids:represented,cases,
  truth_boundary:'R7C adds a live-source-derived VARIANT_RELEASE_HEAVY SAME_OBJECT_NORMALIZATION constructed control using two model numbers on one Wikidata product-model item. The label is algorithmically derived, not independently reviewed, adjudicated, or blind. No regional or market equivalence is inferred; missing stratum classes and empirical/Production gates remain blocked.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,evidence_class:out.dataset_class,constructed_control:true,empirical_benchmark_eligible:false,entity_id:selected.qid,manufacturer_id:selected.manufacturer,model_numbers:selected.codes,represented_approved_strata_ids:represented,production:'HOLD'},null,2));
