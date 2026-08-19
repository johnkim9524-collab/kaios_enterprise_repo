import fs from 'node:fs/promises';

const [inputPath, outputPath='/tmp/er-real-world-r3.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-wikidata-design-r3.mjs <r2.json> [r3.json]');
const LEFT='Q204424';
const RIGHT='Q697041';
const DESIGN='Q184870';
const timeoutMs=15000;

async function fetchEntity(qid){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const url=`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const res=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'},signal:controller.signal});
    if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const json=await res.json();
    const entity=json?.entities?.[qid];
    if(!entity) throw new Error(`Wikidata entity missing: ${qid}`);
    return entity;
  }finally{clearTimeout(timer);}
}
function claimItemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R2_REAL_WORLD_DATASET_REQUIRED');
const [left,right,design]=await Promise.all([fetchEntity(LEFT),fetchEntity(RIGHT),fetchEntity(DESIGN)]);
if(!claimItemIds(left,'P31').includes(DESIGN)) throw new Error(`${LEFT} is not explicitly instance of ${DESIGN}`);
if(!claimItemIds(right,'P31').includes(DESIGN)) throw new Error(`${RIGHT} is not explicitly instance of ${DESIGN}`);
if(LEFT===RIGHT) throw new Error('Distinct physical entities required.');

const designAnchor=`wikidata-canonical-design:${DESIGN}`;
const designCase={
  case_id:`wikidata-same-design-different-object-${LEFT}-${RIGHT}`,
  case_class:'SAME_DESIGN_DIFFERENT_OBJECT',identity_boundary:'CANONICAL_DESIGN',scope_id:'diagnostic-manufactured-vehicle-design-not-final-poc',
  expected:'MATCH',blind_holdout:false,
  left:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:LEFT},entity_id:LEFT,label:label(left),source:'wikidata-structured-data'},
  right:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:RIGHT},entity_id:RIGHT,label:label(right),source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${LEFT}:P31:${DESIGN}`,`wikidata:${RIGHT}:P31:${DESIGN}`,`wikidata:${DESIGN}:canonical-design`],
  rights_state:'ALLOW',
  label_basis:'WIKIDATA_STRUCTURED_DATA_EXPLICITLY_ASSERTS_BOTH_DISTINCT_PHYSICAL_ENTITIES_AS_INSTANCES_OF_THE_SAME_DESIGN_CLASS',
  design_label:label(design),claim_ceiling:'CANONICAL_DESIGN_IDENTITY_DIAGNOSTIC_ONLY'
};
if(dataset.cases.some(x=>x.case_id===designCase.case_id)) throw new Error('DUPLICATE_DESIGN_CASE');
const out={...dataset,id:'entity-resolution-real-world-dataset-increment-r3',dataset_scope:'INCREMENTAL_PARTIAL_R3',scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],source_families:[...new Set([...(dataset.source_families??[]),'wikidata-structured-data'])],cases:[...dataset.cases,designCase],truth_boundary:'R3 adds real CC0 CANONICAL_DESIGN / SAME_DESIGN_DIFFERENT_OBJECT evidence. This diagnostic manufactured-vehicle scope is not final approved PoC scope stratification and must not enable promotion.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
