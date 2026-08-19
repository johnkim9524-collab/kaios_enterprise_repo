import fs from 'node:fs/promises';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7c.json'] = process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7b-variant-release-r7c.mjs <r7b.json> <manifest.json> [r7c.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-variant-release-heavy';
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true) throw new Error('R7B_REAL_WORLD_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION'||!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('VARIANT_RELEASE_STRATUM_NOT_APPROVED');

const timeoutMs=18000;
async function fetchJson(url,headers={},attempts=2){
  let last;
  for(let a=1;a<=attempts;a++){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});
      if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;if(a<attempts) await new Promise(x=>setTimeout(x,600*a));}
    finally{clearTimeout(t);}
  }
  throw last;
}
function stringValues(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

// Discover product models carrying more than one manufacturer/model code. P13351 is
// Wikidata's model-number property; P176 anchors an explicit manufacturer relationship.
const sparql='SELECT ?item ?modelNumber ?manufacturer WHERE { ?item wdt:P13351 ?modelNumber ; wdt:P176 ?manufacturer . } ORDER BY STR(?item) STR(?modelNumber) LIMIT 500';
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'},3);
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

const j=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.qid}.json`);
const entity=j?.entities?.[selected.qid];
if(!entity) throw new Error('VARIANT_ENTITYDATA_MISSING');
const liveCodes=stringValues(entity,'P13351'); const liveManufacturers=itemIds(entity,'P176');
if(!selected.codes.every(x=>liveCodes.includes(x))) throw new Error('MODEL_NUMBER_REVALIDATION_FAILED');
if(!liveManufacturers.includes(selected.manufacturer)) throw new Error('MANUFACTURER_REVALIDATION_FAILED');
if(selected.codes[0]===selected.codes[1]) throw new Error('DISTINCT_MODEL_NUMBERS_REQUIRED');

const anchor=`wikidata-product-model:${selected.qid}`;
const variantNormalization={
  case_id:`wikidata-variant-model-number-normalization-${selected.qid}`,
  case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:true,
  left:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`model-number:${selected.codes[0]}`},entity_id:selected.qid,model_number:selected.codes[0],manufacturer_id:selected.manufacturer,label:label(entity),source:'wikidata-structured-data'},
  right:{anchors:{SOURCE_RECORD:anchor},unique_keys:{reference_id:`model-number:${selected.codes[1]}`},entity_id:selected.qid,model_number:selected.codes[1],manufacturer_id:selected.manufacturer,label:String(label(entity)).toLowerCase(),source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.qid}:P13351:${selected.codes[0]}`,`wikidata:${selected.qid}:P13351:${selected.codes[1]}`,`wikidata:${selected.qid}:P176:${selected.manufacturer}`,'wikidata-property:P13351:model-number'],
  rights_state:'ALLOW',
  label_basis:'LIVE_WIKIDATA_ENTITYDATA_BINDS_TWO_DISTINCT_MANUFACTURER_MODEL_NUMBERS_TO_THE_SAME_PRODUCT_MODEL_ITEM',
  claim_ceiling:'VARIANT_RELEASE_PRODUCT_MODEL_NORMALIZATION_ONLY_NO_REGION_OR_MARKET_INFERENCE'
};
if(dataset.cases.some(x=>x.case_id===variantNormalization.case_id)) throw new Error('DUPLICATE_R7C_CASE');
const cases=[...dataset.cases,variantNormalization];
const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>(manifest.required_strata_ids||[]).includes(x)))].sort();
const out={...dataset,id:'entity-resolution-real-world-dataset-r7c-approved-strata-partial',dataset_scope:'R7C_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_NORMALIZATION_ONLY',scope_stratification_status:'INCOMPLETE',approved_scope_ids:manifest.approved_strata_ids,required_scope_ids:manifest.required_strata_ids,approved_strata_manifest_id:manifest.id,represented_approved_strata_ids:represented,cases,truth_boundary:'R7C adds a live-revalidated VARIANT_RELEASE_HEAVY SAME_OBJECT_NORMALIZATION case using two model numbers on one manufacturer product-model item. It does not infer regional or market equivalence; hard-negative and cross-market-alias cases remain missing for this stratum.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,entity_id:selected.qid,manufacturer_id:selected.manufacturer,model_numbers:selected.codes,represented_approved_strata_ids:represented,production:'HOLD'},null,2));
