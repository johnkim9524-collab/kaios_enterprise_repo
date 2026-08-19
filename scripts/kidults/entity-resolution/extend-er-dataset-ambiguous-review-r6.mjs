import fs from 'node:fs/promises';

const [inputPath, outputPath='/tmp/er-real-world-r6.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-ambiguous-review-r6.mjs <r5.json> [r6.json]');
const timeoutMs=25000;

async function fetchJson(url, headers={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:controller.signal});
    if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  }finally{clearTimeout(timer);}
}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R5_REAL_WORLD_DATASET_REQUIRED');

// Find an actual collection/art-object pair whose relationship is explicitly modeled
// by Wikidata P460: "said to be the same as", a relation whose semantics are
// uncertain or disputed. P195 keeps this diagnostic search near collection objects.
const sparql=`SELECT ?a ?b WHERE {
  ?a wdt:P460 ?b ; wdt:P195 ?collectionA .
  ?b wdt:P195 ?collectionB .
  FILTER(?a != ?b)
} ORDER BY STR(?a) STR(?b) LIMIT 20`;
const query=await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,{accept:'application/sparql-results+json'});
const rows=query?.results?.bindings??[];
if(rows.length===0) throw new Error('No collection-object P460 candidate found; fail closed rather than fabricate ambiguity.');

let selected=null;
for(const row of rows){
  const ma=String(row?.a?.value??'').match(/\/entity\/(Q\d+)$/);
  const mb=String(row?.b?.value??'').match(/\/entity\/(Q\d+)$/);
  if(!ma||!mb||ma[1]===mb[1]) continue;
  const [qa,qb]=[ma[1],mb[1]];
  const [ja,jb]=await Promise.all([
    fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qa}.json`),
    fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qb}.json`)
  ]);
  const a=ja?.entities?.[qa]; const b=jb?.entities?.[qb];
  if(!a||!b) continue;
  const forward=itemIds(a,'P460').includes(qb);
  const reverse=itemIds(b,'P460').includes(qa);
  const collectionA=itemIds(a,'P195'); const collectionB=itemIds(b,'P195');
  if((forward||reverse)&&collectionA.length>0&&collectionB.length>0){selected={qa,qb,a,b,forward,reverse,collectionA,collectionB};break;}
}
if(!selected) throw new Error('P460 collection-object candidates failed live EntityData revalidation; fail closed.');

const {qa,qb,a,b,forward,reverse,collectionA,collectionB}=selected;
const ambiguousCase={
  case_id:`wikidata-ambiguous-p460-${qa}-${qb}`,
  case_class:'AMBIGUOUS_REVIEW_REQUIRED',
  identity_boundary:'PHYSICAL_OBJECT',
  scope_id:'diagnostic-collection-object-ambiguity-not-final-poc',
  expected:'REVIEW',
  blind_holdout:true,
  left:{entity_id:qa,label:label(a),source:'wikidata-structured-data',collection_ids:collectionA,evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  right:{entity_id:qb,label:label(b),source:'wikidata-structured-data',collection_ids:collectionB,evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  provenance_refs:[`wikidata:${qa}:P460:${qb}:${forward?'forward':'reverse-confirmed'}`,`wikidata:${qb}:P460:${qa}:${reverse?'reverse':'not-required'}`,'wikidata-property:P460:uncertain-or-disputed-sameness'],
  rights_state:'ALLOW',
  label_basis:'WIKIDATA_P460_EXPLICITLY_MODELS_THE_PAIR_AS_SAID_TO_BE_THE_SAME_WHILE_THE_PROPERTY_SEMANTICS_ALLOW_UNCERTAIN_OR_DISPUTED_IDENTITY;_AUTO_MATCH_OR_AUTO_NO_MATCH_IS_NOT_JUSTIFIED',
  claim_ceiling:'REVIEW_REQUIRED_IDENTITY_ONLY_NO_AUTO_MERGE'
};
if(dataset.cases.some(x=>x.case_id===ambiguousCase.case_id)) throw new Error('DUPLICATE_AMBIGUOUS_CASE');
const out={...dataset,id:'entity-resolution-real-world-dataset-increment-r6',dataset_scope:'INCREMENTAL_PARTIAL_R6_ALL_CASE_CLASSES_DIAGNOSTIC',scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],source_families:[...new Set([...(dataset.source_families??[]),'wikidata-p460-ambiguous-identity'])],cases:[...dataset.cases,ambiguousCase],truth_boundary:'R6 adds a genuine P460 uncertain/disputed identity pair for AMBIGUOUS_REVIEW_REQUIRED. All required case classes may now be diagnostically present, but final approved PoC scope stratification remains incomplete and promotion must remain blocked.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
