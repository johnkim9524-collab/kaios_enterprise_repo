import fs from 'node:fs/promises';

const [inputPath,manifestPath,outputPath='/tmp/er-real-world-r7f.json']=process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7e-vehicle-minimums-r7f.mjs <r7e.json> <manifest.json> [r7f.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-vehicle-mechanical-asset';
const MODEL='Q1002954'; // Formula One car; previously live-observed as a serial-bearing vehicle class.
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true) throw new Error('R7E_REAL_WORLD_DATASET_REQUIRED');
if(!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('VEHICLE_STRATUM_REQUIRED');

const timeoutMs=16000;
async function fetchJson(url,headers={},attempts=2){let last;for(let a=1;a<=attempts;a++){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);return await r.json();}catch(e){last=e;if(a<attempts) await new Promise(x=>setTimeout(x,500*a));}finally{clearTimeout(t);}}throw last;}
function strings(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function items(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(e){return e?.labels?.en?.value??e?.labels?.mul?.value??e?.id??null;}

// Exclude every physical object already used by existing serialized-reference cases so
// vehicle calibration adds independent observations rather than duplicating scored pairs.
const used=new Set();
for(const c of dataset.cases){
  if(c.scope_id==='er-stratum-serialized-reference'){
    for(const side of [c.left,c.right]) if(side?.unique_keys?.object_id) used.add(String(side.unique_keys.object_id));
  }
}
const sparql=`SELECT ?item ?serial WHERE { ?item wdt:P31 wd:${MODEL} ; wdt:P2598 ?serial . } ORDER BY STR(?item) LIMIT 100`;
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'},3);
const candidates=[];
for(const row of q?.results?.bindings??[]){const qid=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1],serial=String(row?.serial?.value??'').trim();if(qid&&serial&&!used.has(qid)&&!candidates.some(x=>x.qid===qid)) candidates.push({qid,serial});}
if(candidates.length<2) throw new Error(`INSUFFICIENT_INDEPENDENT_SERIALIZED_VEHICLE_OBJECTS:${candidates.length}`);
let selected=null;
for(let i=0;i<candidates.length;i++) for(let j=i+1;j<candidates.length;j++) if(candidates[i].serial!==candidates[j].serial){selected={left:candidates[i],right:candidates[j]};break;}
if(!selected) throw new Error('DISTINCT_VEHICLE_SERIAL_PAIR_REQUIRED');
const [jm,jl,jr]=await Promise.all([fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${MODEL}.json`),fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.left.qid}.json`),fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.right.qid}.json`)]);
const model=jm?.entities?.[MODEL],left=jl?.entities?.[selected.left.qid],right=jr?.entities?.[selected.right.qid];
if(!model||!left||!right) throw new Error('VEHICLE_ENTITYDATA_MISSING');
if(label(model)!=='Formula One car') throw new Error(`EXPECTED_VEHICLE_CLASS_LABEL_MISMATCH:${label(model)}`);
if(!items(left,'P31').includes(MODEL)||!items(right,'P31').includes(MODEL)) throw new Error('VEHICLE_MODEL_REVALIDATION_FAILED');
if(!strings(left,'P2598').includes(selected.left.serial)||!strings(right,'P2598').includes(selected.right.serial)) throw new Error('VEHICLE_SERIAL_REVALIDATION_FAILED');

const sameAnchor=`wikidata-vehicle-record:${selected.left.qid}:${selected.left.serial}`;
const normalization={case_id:`wikidata-vehicle-normalization-${selected.left.qid}`,case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:false,left:{anchors:{SOURCE_RECORD:sameAnchor},unique_keys:{object_id:selected.left.qid,serial:selected.left.serial},entity_id:selected.left.qid,model_id:MODEL,vehicle_class:label(model),source:'wikidata-structured-data'},right:{anchors:{SOURCE_RECORD:sameAnchor},unique_keys:{object_id:selected.left.qid,serial:selected.left.serial},entity_id:selected.left.qid,model_id:MODEL,vehicle_class:label(model),source:'wikidata-structured-data'},provenance_refs:[`wikidata:${selected.left.qid}:P31:${MODEL}`,`wikidata:${selected.left.qid}:P2598:${selected.left.serial}`,'wikidata:Q1002954:Formula-One-car'],rights_state:'ALLOW',label_basis:'LIVE_WIKIDATA_REVALIDATES_THE_SAME_SERIALIZED_FORMULA_ONE_CAR_OBJECT',claim_ceiling:'VEHICLE_MECHANICAL_SOURCE_RECORD_IDENTITY_ONLY'};
const hardNegative={case_id:`wikidata-vehicle-hard-negative-${selected.left.qid}-${selected.right.qid}`,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',scope_id:STRATUM,expected:'NO_MATCH',blind_holdout:true,left:{anchors:{PHYSICAL_OBJECT:`wikidata-vehicle:${selected.left.qid}:${selected.left.serial}`},unique_keys:{object_id:selected.left.qid,serial:selected.left.serial},entity_id:selected.left.qid,model_id:MODEL,source:'wikidata-structured-data'},right:{anchors:{PHYSICAL_OBJECT:`wikidata-vehicle:${selected.right.qid}:${selected.right.serial}`},unique_keys:{object_id:selected.right.qid,serial:selected.right.serial},entity_id:selected.right.qid,model_id:MODEL,source:'wikidata-structured-data'},provenance_refs:[`wikidata:${selected.left.qid}:P2598:${selected.left.serial}`,`wikidata:${selected.right.qid}:P2598:${selected.right.serial}`,`wikidata:${selected.left.qid}:P31:${MODEL}`,`wikidata:${selected.right.qid}:P31:${MODEL}`],rights_state:'ALLOW',label_basis:'TWO_INDEPENDENT_FORMULA_ONE_CAR_ENTITIES_WITH_DISTINCT_CHASSIS_SERIALS_ARE_DISTINCT_PHYSICAL_VEHICLES',claim_ceiling:'VEHICLE_MECHANICAL_PHYSICAL_OBJECT_IDENTITY_ONLY'};
for(const c of [normalization,hardNegative]) if(dataset.cases.some(x=>x.case_id===c.case_id)) throw new Error(`DUPLICATE_R7F_CASE:${c.case_id}`);
const out={...dataset,id:'entity-resolution-real-world-dataset-r7f-vehicle-minimums',dataset_scope:'R7F_VEHICLE_MECHANICAL_MINIMUMS_COMPLETE',scope_stratification_status:'INCOMPLETE',cases:[...dataset.cases,normalization,hardNegative],truth_boundary:'R7F adds independent serialed Formula One car observations, excluding objects already scored in SERIALIZED_REFERENCE. Combined with the existing B-29 canonical-design case, VEHICLE_MECHANICAL_ASSET declared minimums may complete; final global promotion remains blocked.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,model_id:MODEL,model_label:label(model),excluded_prior_objects:[...used],selected,production:'HOLD'},null,2));