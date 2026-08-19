import fs from 'node:fs/promises';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7d.json'] = process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7c-designer-maker-r7d.mjs <r7c.json> <manifest.json> [r7d.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-designer-maker-edition';
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true) throw new Error('R7C_REAL_WORLD_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION'||!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('DESIGNER_MAKER_STRATUM_NOT_APPROVED');

const timeoutMs=16000;
async function fetchJson(url,headers={},attempts=2){
  let last;
  for(let a=1;a<=attempts;a++){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});
      if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;if(a<attempts) await new Promise(x=>setTimeout(x,500*a));}
    finally{clearTimeout(t);}
  }
  throw last;
}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function stringValues(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

// Step 1: discover specific design/product-model entities carrying explicit designer,
// manufacturer and model-number claims. This deliberately excludes generic type/name matching.
const designQuery='SELECT ?design ?designer ?maker ?modelNumber WHERE { ?design wdt:P287 ?designer ; wdt:P176 ?maker ; wdt:P13351 ?modelNumber . } ORDER BY STR(?design) LIMIT 60';
const dq=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(designQuery)}&format=json`,{accept:'application/sparql-results+json'},3);
const designRows=dq?.results?.bindings??[];
if(designRows.length===0) throw new Error('NO_DESIGNER_MAKER_MODEL_CANDIDATES');

let selected=null;
for(const row of designRows){
  const design=String(row?.design?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const designer=String(row?.designer?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const maker=String(row?.maker?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const modelNumber=String(row?.modelNumber?.value??'').trim();
  if(!design||!designer||!maker||!modelNumber) continue;

  // Step 2: for each specific design, find two separately inventoried physical exemplars.
  // P217 inventory number is used as physical-object evidence rather than assuming every P31 instance is physical.
  const iq=`SELECT ?item ?inventory WHERE { ?item wdt:P31 wd:${design} ; wdt:P217 ?inventory . } ORDER BY STR(?item) LIMIT 4`;
  let ir;
  try{ir=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(iq)}&format=json`,{accept:'application/sparql-results+json'},2);}catch{continue;}
  const physical=[];
  for(const b of ir?.results?.bindings??[]){
    const qid=String(b?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
    const inventory=String(b?.inventory?.value??'').trim();
    if(qid&&inventory&&!physical.some(x=>x.qid===qid)) physical.push({qid,inventory});
  }
  if(physical.length>=2&&physical[0].qid!==physical[1].qid&&physical[0].inventory!==physical[1].inventory){selected={design,designer,maker,modelNumber,left:physical[0],right:physical[1]};break;}
}
if(!selected) throw new Error('NO_DESIGN_WITH_TWO_INVENTORIED_PHYSICAL_EXEMPLARS');

const [jd,jl,jr]=await Promise.all([
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.design}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.left.qid}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.right.qid}.json`)
]);
const design=jd?.entities?.[selected.design],left=jl?.entities?.[selected.left.qid],right=jr?.entities?.[selected.right.qid];
if(!design||!left||!right) throw new Error('DESIGNER_MAKER_ENTITYDATA_MISSING');
if(!itemIds(design,'P287').includes(selected.designer)) throw new Error('DESIGNER_REVALIDATION_FAILED');
if(!itemIds(design,'P176').includes(selected.maker)) throw new Error('MAKER_REVALIDATION_FAILED');
if(!stringValues(design,'P13351').includes(selected.modelNumber)) throw new Error('MODEL_NUMBER_REVALIDATION_FAILED');
if(!itemIds(left,'P31').includes(selected.design)||!itemIds(right,'P31').includes(selected.design)) throw new Error('DESIGN_INSTANCE_REVALIDATION_FAILED');
if(!stringValues(left,'P217').includes(selected.left.inventory)||!stringValues(right,'P217').includes(selected.right.inventory)) throw new Error('INVENTORY_REVALIDATION_FAILED');

const sourceAnchor=`wikidata-designer-maker-source:${selected.left.qid}:${selected.left.inventory}`;
const designAnchor=`wikidata-designer-maker-design:${selected.design}:${selected.modelNumber}`;
const normalization={
  case_id:`wikidata-designer-maker-normalization-${selected.left.qid}`,
  case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:false,
  left:{anchors:{SOURCE_RECORD:sourceAnchor},unique_keys:{object_id:selected.left.qid,accession_number:selected.left.inventory},entity_id:selected.left.qid,design_id:selected.design,designer_id:selected.designer,maker_id:selected.maker,model_number:selected.modelNumber,label:label(left),source:'wikidata-structured-data'},
  right:{anchors:{SOURCE_RECORD:sourceAnchor},unique_keys:{object_id:selected.left.qid,accession_number:selected.left.inventory},entity_id:selected.left.qid,design_id:selected.design,designer_id:selected.designer,maker_id:selected.maker,model_number:selected.modelNumber,label:String(label(left)).toLowerCase(),source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.design}:P287:${selected.designer}`,`wikidata:${selected.design}:P176:${selected.maker}`,`wikidata:${selected.design}:P13351:${selected.modelNumber}`,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.left.qid}:P217:${selected.left.inventory}`],rights_state:'ALLOW',label_basis:'LIVE_WIKIDATA_REVALIDATES_ONE_INVENTORIED_PHYSICAL_EXEMPLAR_OF_AN_EXPLICIT_DESIGNER_MAKER_MODEL',claim_ceiling:'DESIGNER_MAKER_SOURCE_RECORD_IDENTITY_ONLY'
};
const sameDesign={
  case_id:`wikidata-designer-maker-same-design-${selected.left.qid}-${selected.right.qid}`,
  case_class:'SAME_DESIGN_DIFFERENT_OBJECT',identity_boundary:'CANONICAL_DESIGN',scope_id:STRATUM,expected:'MATCH',blind_holdout:true,
  left:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:selected.left.qid,accession_number:selected.left.inventory},entity_id:selected.left.qid,design_id:selected.design,inventory_number:selected.left.inventory,source:'wikidata-structured-data'},
  right:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:selected.right.qid,accession_number:selected.right.inventory},entity_id:selected.right.qid,design_id:selected.design,inventory_number:selected.right.inventory,source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.design}:P287:${selected.designer}`,`wikidata:${selected.design}:P176:${selected.maker}`,`wikidata:${selected.design}:P13351:${selected.modelNumber}`,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.right.qid}:P31:${selected.design}`],rights_state:'ALLOW',label_basis:'TWO_DISTINCT_INVENTORIED_PHYSICAL_EXEMPLARS_ARE_LIVE_REVALIDATED_AS_INSTANCES_OF_THE_SAME_EXPLICIT_DESIGNER_MAKER_MODEL',claim_ceiling:'DESIGNER_MAKER_CANONICAL_DESIGN_IDENTITY_ONLY'
};
const hardNegative={
  case_id:`wikidata-designer-maker-physical-negative-${selected.left.qid}-${selected.right.qid}`,
  case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',scope_id:STRATUM,expected:'NO_MATCH',blind_holdout:true,
  left:{anchors:{PHYSICAL_OBJECT:`wikidata-inventory:${selected.left.qid}:${selected.left.inventory}`},unique_keys:{object_id:selected.left.qid,accession_number:selected.left.inventory},entity_id:selected.left.qid,design_id:selected.design,source:'wikidata-structured-data'},
  right:{anchors:{PHYSICAL_OBJECT:`wikidata-inventory:${selected.right.qid}:${selected.right.inventory}`},unique_keys:{object_id:selected.right.qid,accession_number:selected.right.inventory},entity_id:selected.right.qid,design_id:selected.design,source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${selected.left.qid}:P217:${selected.left.inventory}`,`wikidata:${selected.right.qid}:P217:${selected.right.inventory}`,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.right.qid}:P31:${selected.design}`],rights_state:'ALLOW',label_basis:'DISTINCT_WIKIDATA_ENTITIES_WITH_DISTINCT_INVENTORY_NUMBERS_ARE_DIFFERENT_PHYSICAL_OBJECTS_EVEN_WHEN_THEY_SHARE_THE_SAME_DESIGN',claim_ceiling:'DESIGNER_MAKER_PHYSICAL_OBJECT_IDENTITY_ONLY'
};
for(const c of [normalization,sameDesign,hardNegative]) if(dataset.cases.some(x=>x.case_id===c.case_id)) throw new Error(`DUPLICATE_R7D_CASE:${c.case_id}`);
const cases=[...dataset.cases,normalization,sameDesign,hardNegative];
const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>(manifest.required_strata_ids||[]).includes(x)))].sort();
const out={...dataset,id:'entity-resolution-real-world-dataset-r7d-approved-strata-partial',dataset_scope:'R7D_PARTIAL_APPROVED_STRATA_6_OF_7_DESIGNER_MAKER_COMPLETE',scope_stratification_status:'INCOMPLETE',approved_scope_ids:manifest.approved_strata_ids,required_scope_ids:manifest.required_strata_ids,approved_strata_manifest_id:manifest.id,represented_approved_strata_ids:represented,cases,truth_boundary:'R7D adds all declared DESIGNER_MAKER_EDITION minimum case classes and boundaries using an explicit designer+manufacturer+model design and two separately inventoried physical exemplars. GRADED_POPULATION remains unrepresented and other strata gaps still block final promotion.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,design_id:selected.design,designer_id:selected.designer,maker_id:selected.maker,model_number:selected.modelNumber,physical_exemplars:[selected.left,selected.right],represented_approved_strata_ids:represented,production:'HOLD'},null,2));
