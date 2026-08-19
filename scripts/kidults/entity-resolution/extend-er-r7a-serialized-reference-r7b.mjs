import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, outputPath='/tmp/er-real-world-r7b.json'] = process.argv.slice(2);
if(!inputPath||!manifestPath) throw new Error('Usage: node extend-er-r7a-serialized-reference-r7b.mjs <r7a.json> <manifest.json> [r7b.json]');
const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const STRATUM='er-stratum-serialized-reference';
const constructedControlInput=dataset.dataset_class==='REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL'
  && dataset.synthetic===false
  && dataset.constructed_control===true
  && dataset.empirical_benchmark_eligible===false
  && dataset.independent_label_review_complete===false
  && dataset.label_adjudication_complete===false
  && dataset.holdout_sealed_before_modeling===false
  && Array.isArray(dataset.cases)
  && dataset.cases.every((item)=>item.blind_holdout!==true);
if(!constructedControlInput) throw new Error('R7A_CONSTRUCTED_CONTROL_DATASET_REQUIRED');
if(manifest.status!=='APPROVED_BOUNDED_POC_CALIBRATION'||!(manifest.required_strata_ids||[]).includes(STRATUM)) throw new Error('SERIALIZED_REFERENCE_STRATUM_NOT_APPROVED');

const timeoutMs=18000;
const WIKIDATA_RIGHTS_URL='https://www.wikidata.org/wiki/Wikidata:Licensing';
const digest=(value)=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
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

// Discovery is intentionally bounded and generic. P2598 is the Wikidata serial-number
// property for a specific object among the same product; P31 supplies the shared model/class.
const sparql='SELECT ?item ?serial ?model WHERE { ?item wdt:P2598 ?serial ; wdt:P31 ?model . } ORDER BY STR(?model) STR(?item) LIMIT 500';
const q=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'},3);
const rows=q?.results?.bindings??[];
if(rows.length===0) throw new Error('NO_SERIALIZED_REFERENCE_CANDIDATES');
const groups=new Map();
for(const row of rows){
  const qi=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const qm=String(row?.model?.value??'').match(/\/entity\/(Q\d+)$/)?.[1];
  const serial=String(row?.serial?.value??'').trim();
  if(!qi||!qm||!serial) continue;
  const arr=groups.get(qm)??[]; arr.push({qid:qi,serial,model:qm}); groups.set(qm,arr);
}
let candidate=null;
for(const [model,arr] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  const uniq=[]; const seen=new Set();
  for(const x of arr){if(!seen.has(x.qid)){seen.add(x.qid);uniq.push(x);}}
  for(let i=0;i<uniq.length;i++) for(let j=i+1;j<uniq.length;j++) if(uniq[i].serial!==uniq[j].serial){candidate={left:uniq[i],right:uniq[j],model};break;}
  if(candidate) break;
}
if(!candidate) throw new Error('NO_SHARED_MODEL_DISTINCT_SERIAL_PAIR');

const [jl,jr,jm]=await Promise.all([
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.left.qid}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.right.qid}.json`),
  fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.model}.json`)
]);
const left=jl?.entities?.[candidate.left.qid],right=jr?.entities?.[candidate.right.qid],model=jm?.entities?.[candidate.model];
if(!left||!right||!model) throw new Error('SERIALIZED_ENTITYDATA_MISSING');
const leftSerials=stringValues(left,'P2598'),rightSerials=stringValues(right,'P2598');
const leftModels=itemIds(left,'P31'),rightModels=itemIds(right,'P31');
if(!leftSerials.includes(candidate.left.serial)||!rightSerials.includes(candidate.right.serial)) throw new Error('SERIAL_REVALIDATION_FAILED');
if(!leftModels.includes(candidate.model)||!rightModels.includes(candidate.model)) throw new Error('SHARED_MODEL_REVALIDATION_FAILED');
if(candidate.left.qid===candidate.right.qid||candidate.left.serial===candidate.right.serial) throw new Error('DISTINCT_OBJECT_AND_SERIAL_REQUIRED');

const sameAnchor=`wikidata-serialized-record:${candidate.left.qid}:${candidate.left.serial}`;
const normalization={
  case_id:`wikidata-serialized-normalization-${candidate.left.qid}`,
  case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',scope_id:STRATUM,expected:'MATCH',blind_holdout:false,
  constructed_control:true,label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{SOURCE_RECORD:sameAnchor},unique_keys:{serial:candidate.left.serial,object_id:candidate.left.qid},label:label(left),model_id:candidate.model,source:'wikidata-structured-data'},
  right:{anchors:{SOURCE_RECORD:sameAnchor},unique_keys:{serial:candidate.left.serial,object_id:candidate.left.qid},label:String(label(left)).toLowerCase(),model_id:candidate.model,source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${candidate.left.qid}:P2598:${candidate.left.serial}`,`wikidata:${candidate.left.qid}:P31:${candidate.model}`,'wikidata-property:P2598:serial-number'],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_FOR_THE_SAME_SPECIFIC_OBJECT_SERIAL_AND_MODEL_CLASS',
  source_evidence:[
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${candidate.left.qid}.json`,source_payload_sha256:digest(jl),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${candidate.model}.json`,source_payload_sha256:digest(jm),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  claim_ceiling:'SERIALIZED_REFERENCE_IDENTITY_ONLY'
};
const hardNegative={
  case_id:`wikidata-serialized-hard-negative-${candidate.left.qid}-${candidate.right.qid}`,
  case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',scope_id:STRATUM,expected:'NO_MATCH',blind_holdout:false,
  constructed_control:true,label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{PHYSICAL_OBJECT:`wikidata-physical:${candidate.left.qid}:${candidate.left.serial}`},unique_keys:{serial:candidate.left.serial,object_id:candidate.left.qid},label:label(left),model_id:candidate.model,source:'wikidata-structured-data'},
  right:{anchors:{PHYSICAL_OBJECT:`wikidata-physical:${candidate.right.qid}:${candidate.right.serial}`},unique_keys:{serial:candidate.right.serial,object_id:candidate.right.qid},label:label(right),model_id:candidate.model,source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${candidate.left.qid}:P2598:${candidate.left.serial}`,`wikidata:${candidate.right.qid}:P2598:${candidate.right.serial}`,`wikidata:${candidate.left.qid}:P31:${candidate.model}`,`wikidata:${candidate.right.qid}:P31:${candidate.model}`,'wikidata-property:P2598:serial-number'],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_ENTITYDATA_FOR_TWO_DISTINCT_SPECIFIC_OBJECTS_IN_THE_SAME_MODEL_CLASS_WITH_DISTINCT_SERIAL_NUMBERS',
  source_evidence:[
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${candidate.left.qid}.json`,source_payload_sha256:digest(jl),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${candidate.right.qid}.json`,source_payload_sha256:digest(jr),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${candidate.model}.json`,source_payload_sha256:digest(jm),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  claim_ceiling:'SERIALIZED_REFERENCE_PHYSICAL_OBJECT_IDENTITY_ONLY'
};
for(const c of [normalization,hardNegative]) if(dataset.cases.some(x=>x.case_id===c.case_id)) throw new Error(`DUPLICATE_R7B_CASE:${c.case_id}`);
const cases=[...dataset.cases,normalization,hardNegative];
const represented=[...new Set(cases.map(x=>x.scope_id).filter(x=>(manifest.required_strata_ids||[]).includes(x)))].sort();
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7b-strata-mapped-partial',
  dataset_scope:'R7B_PARTIAL_APPROVED_STRATA_4_OF_7_SERIALIZED_2_OF_3_CLASSES_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',synthetic:false,constructed_control:true,
  empirical_benchmark_eligible:false,independent_label_review_complete:false,label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,production:'HOLD',
  scope_stratification_status:'INCOMPLETE',approved_scope_ids:manifest.approved_strata_ids,required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id,represented_approved_strata_ids:represented,cases,
  truth_boundary:'R7B adds live-source-derived SERIALIZED_REFERENCE normalization and hard-negative constructed controls from Wikidata serial numbers and a shared model class. These labels are algorithmically derived, not independently reviewed, adjudicated, or blind. CROSS_MARKET_ALIAS remains missing in this stratum, three required strata remain unrepresented, and empirical promotion and Production remain blocked.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify({id:out.id,evidence_class:out.dataset_class,constructed_control:true,empirical_benchmark_eligible:false,model_id:candidate.model,model_label:label(model),serial_pair:[candidate.left.serial,candidate.right.serial],represented_approved_strata_ids:represented,production:'HOLD'},null,2));
