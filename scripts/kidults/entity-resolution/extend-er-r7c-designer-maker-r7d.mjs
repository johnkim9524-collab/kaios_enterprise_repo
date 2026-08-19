import fs from 'node:fs/promises';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7d.json'] = process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7c-designer-maker-r7d.mjs <r7c.json> <manifest.json> [r7d.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-designer-maker-edition';
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true) throw new Error('R7C_REAL_WORLD_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION'||!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('DESIGNER_MAKER_STRATUM_NOT_APPROVED');

const timeoutMs=22000;
async function fetchJson(url,headers={},attempts=3){let last;for(let a=1;a<=attempts;a++){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:c.signal});if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);return await r.json();}catch(e){last=e;if(a<attempts) await new Promise(x=>setTimeout(x,600*a));}finally{clearTimeout(t);}}throw last;}
function itemIds(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function stringValues(e,p){return (e?.claims?.[p]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}
function label(e){return e?.labels?.en?.value??e?.labels?.mul?.value??e?.id??null;}

// Manifest grammar is designer_or_artist + maker + model_or_series. P287 (designed by)
// and P170 (creator) are both explicit attribution relations. Physical exemplar identity
// must still be established by an authoritative inventory number (P217) or serial number (P2598).
const query=`SELECT ?item ?design ?designer ?maker ?identifier ?idProp WHERE {
  ?item wdt:P31 ?design .
  ?design (wdt:P287|wdt:P170) ?designer ; wdt:P176 ?maker .
  { ?item wdt:P217 ?identifier . BIND("P217" AS ?idProp) }
  UNION
  { ?item wdt:P2598 ?identifier . BIND("P2598" AS ?idProp) }
} ORDER BY STR(?design) STR(?item) LIMIT 1800`;
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`,{accept:'application/sparql-results+json'});
const groups=new Map();
for(const row of q?.results?.bindings??[]){
  const item=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const design=String(row?.design?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const designer=String(row?.designer?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const maker=String(row?.maker?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const identifier=String(row?.identifier?.value??'').trim();
  const idProp=String(row?.idProp?.value??'').trim();
  if(!item||!design||!designer||!maker||!identifier||!['P217','P2598'].includes(idProp)) continue;
  const key=`${design}|${designer}|${maker}`; const arr=groups.get(key)??[];
  if(!arr.some(x=>x.qid===item)) arr.push({qid:item,identifier,idProp});
  groups.set(key,arr);
}
let selected=null;
for(const [key,arr] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  if(arr.length<2) continue;
  for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++){
    if(arr[i].qid!==arr[j].qid && `${arr[i].idProp}:${arr[i].identifier}`!==`${arr[j].idProp}:${arr[j].identifier}`){const [design,designer,maker]=key.split('|');selected={design,designer,maker,left:arr[i],right:arr[j]};break;}
    if(selected) break;
  }
  if(selected) break;
}
if(!selected) throw new Error('NO_DESIGNER_MAKER_DESIGN_WITH_TWO_EXPLICITLY_IDENTIFIED_PHYSICAL_EXEMPLARS');

const [jd,jl,jr]=await Promise.all([
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.design}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.left.qid}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${selected.right.qid}.json`)
]);
const design=jd?.entities?.[selected.design],left=jl?.entities?.[selected.left.qid],right=jr?.entities?.[selected.right.qid];
if(!design||!left||!right) throw new Error('DESIGNER_MAKER_ENTITYDATA_MISSING');
const attributionOk=itemIds(design,'P287').includes(selected.designer)||itemIds(design,'P170').includes(selected.designer);
if(!attributionOk||!itemIds(design,'P176').includes(selected.maker)) throw new Error('DESIGNER_ARTIST_OR_MAKER_REVALIDATION_FAILED');
if(!itemIds(left,'P31').includes(selected.design)||!itemIds(right,'P31').includes(selected.design)) throw new Error('DESIGN_INSTANCE_REVALIDATION_FAILED');
for(const x of [selected.left,selected.right]){
  const e=x.qid===selected.left.qid?left:right;
  if(!stringValues(e,x.idProp).includes(x.identifier)) throw new Error(`PHYSICAL_IDENTIFIER_REVALIDATION_FAILED:${x.qid}:${x.idProp}`);
}

const physicalToken=(x)=>`${x.idProp}:${x.identifier}`;
const sourceAnchor=`wikidata-designer-maker-source:${selected.left.qid}:${physicalToken(selected.left)}`;
const designAnchor=`wikidata-designer-maker-design:${selected.design}`;
const baseProv=[`wikidata:${selected.design}:designer-or-creator:${selected.designer}`,`wikidata:${selected.design}:P176:${selected.maker}`];
const normalization={case_id:`wikidata-designer-maker-normalization-${selected.left.qid}`,case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:false,left:{anchors:{SOURCE_RECORD:sourceAnchor},unique_keys:{object_id:selected.left.qid,reference_id:physicalToken(selected.left)},entity_id:selected.left.qid,design_id:selected.design,designer_or_artist_id:selected.designer,maker_id:selected.maker,label:label(left),source:'wikidata-structured-data'},right:{anchors:{SOURCE_RECORD:sourceAnchor},unique_keys:{object_id:selected.left.qid,reference_id:physicalToken(selected.left)},entity_id:selected.left.qid,design_id:selected.design,designer_or_artist_id:selected.designer,maker_id:selected.maker,label:String(label(left)).toLowerCase(),source:'wikidata-structured-data'},provenance_refs:[...baseProv,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.left.qid}:${selected.left.idProp}:${selected.left.identifier}`],rights_state:'ALLOW',label_basis:'LIVE_WIKIDATA_REVALIDATES_ONE_EXPLICITLY_IDENTIFIED_PHYSICAL_EXEMPLAR_OF_AN_ATTRIBUTED_DESIGNER_OR_ARTIST_AND_MAKER_DESIGN',claim_ceiling:'DESIGNER_MAKER_SOURCE_RECORD_IDENTITY_ONLY'};
const sameDesign={case_id:`wikidata-designer-maker-same-design-${selected.left.qid}-${selected.right.qid}`,case_class:'SAME_DESIGN_DIFFERENT_OBJECT',identity_boundary:'CANONICAL_DESIGN',scope_id:STRATUM,expected:'MATCH',blind_holdout:true,left:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:selected.left.qid,reference_id:physicalToken(selected.left)},entity_id:selected.left.qid,design_id:selected.design,source:'wikidata-structured-data'},right:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:selected.right.qid,reference_id:physicalToken(selected.right)},entity_id:selected.right.qid,design_id:selected.design,source:'wikidata-structured-data'},provenance_refs:[...baseProv,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.right.qid}:P31:${selected.design}`],rights_state:'ALLOW',label_basis:'TWO_DISTINCT_EXPLICITLY_IDENTIFIED_PHYSICAL_EXEMPLARS_ARE_INSTANCES_OF_THE_SAME_ATTRIBUTED_DESIGNER_OR_ARTIST_AND_MAKER_DESIGN',claim_ceiling:'DESIGNER_MAKER_CANONICAL_DESIGN_IDENTITY_ONLY'};
const hardNegative={case_id:`wikidata-designer-maker-physical-negative-${selected.left.qid}-${selected.right.qid}`,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',scope_id:STRATUM,expected:'NO_MATCH',blind_holdout:true,left:{anchors:{PHYSICAL_OBJECT:`wikidata-physical:${selected.left.qid}:${physicalToken(selected.left)}`},unique_keys:{object_id:selected.left.qid,reference_id:physicalToken(selected.left)},entity_id:selected.left.qid,design_id:selected.design,source:'wikidata-structured-data'},right:{anchors:{PHYSICAL_OBJECT:`wikidata-physical:${selected.right.qid}:${physicalToken(selected.right)}`},unique_keys:{object_id:selected.right.qid,reference_id:physicalToken(selected.right)},entity_id:selected.right.qid,design_id:selected.design,source:'wikidata-structured-data'},provenance_refs:[`wikidata:${selected.left.qid}:${selected.left.idProp}:${selected.left.identifier}`,`wikidata:${selected.right.qid}:${selected.right.idProp}:${selected.right.identifier}`,`wikidata:${selected.left.qid}:P31:${selected.design}`,`wikidata:${selected.right.qid}:P31:${selected.design}`],rights_state:'ALLOW',label_basis:'DISTINCT_ENTITY_PLUS_DISTINCT_INVENTORY_OR_SERIAL_IDENTIFIERS_ESTABLISH_DIFFERENT_PHYSICAL_EXEMPLARS_DESPITE_SHARED_CANONICAL_DESIGN',claim_ceiling:'DESIGNER_MAKER_PHYSICAL_OBJECT_IDENTITY_ONLY'};
for(const c of [normalization,sameDesign,hardNegative]) if(dataset.cases.some(x=>x.case_id===c.case_id)) throw new Error(`DUPLICATE_R7D_CASE:${c.case_id}`);
const cases=[...dataset.cases,normalization,sameDesign,hardNegative];
const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>(manifest.required_strata_ids||[]).includes(x)))].sort();
const out={...dataset,id:'entity-resolution-real-world-dataset-r7d-approved-strata-partial',dataset_scope:'R7D_PARTIAL_APPROVED_STRATA_6_OF_7_DESIGNER_MAKER_COMPLETE',scope_stratification_status:'INCOMPLETE',approved_scope_ids:manifest.approved_strata_ids,required_scope_ids:manifest.required_strata_ids,approved_strata_manifest_id:manifest.id,represented_approved_strata_ids:represented,cases,truth_boundary:'R7D requires explicit designer-or-artist attribution plus maker on a canonical design and two distinct physical exemplars each carrying an authoritative inventory or serial identifier. GRADED_POPULATION and other per-stratum gaps still block final promotion.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,design_id:selected.design,design_label:label(design),designer_or_artist_id:selected.designer,maker_id:selected.maker,physical_exemplars:[selected.left,selected.right],represented_approved_strata_ids:represented,production:'HOLD'},null,2));