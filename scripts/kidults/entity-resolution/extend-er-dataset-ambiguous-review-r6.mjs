import fs from 'node:fs/promises';

const [inputPath, outputPath='/tmp/er-real-world-r6.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-ambiguous-review-r6.mjs <r5.json> [r6.json]');
const timeoutMs=10000;
const DOCUMENTED_P460_CANDIDATES=[
  ['Q7158737','Q8937'],
  ['Q26925','Q44047'],
  ['Q113159165','Q113159202']
];

async function fetchJson(url, attempts=2){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const res=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'},signal:controller.signal});
      if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.json();
    }catch(error){
      lastError=error;
      if(attempt<attempts) await new Promise(r=>setTimeout(r,400*attempt));
    }finally{clearTimeout(timer);}
  }
  throw lastError;
}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R5_REAL_WORLD_DATASET_REQUIRED');

let selected=null;
for(const [qa,qb] of DOCUMENTED_P460_CANDIDATES){
  let ja,jb;
  try{
    [ja,jb]=await Promise.all([
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qa}.json`),
      fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qb}.json`)
    ]);
  }catch{continue;}
  const a=ja?.entities?.[qa]; const b=jb?.entities?.[qb];
  if(!a||!b) continue;
  const forward=itemIds(a,'P460').includes(qb);
  const reverse=itemIds(b,'P460').includes(qa);
  if(forward||reverse){selected={qa,qb,a,b,forward,reverse};break;}
}
if(!selected) throw new Error('Documented P460 candidates no longer validate in live EntityData; fail closed.');

const {qa,qb,a,b,forward,reverse}=selected;
const ambiguousCase={
  case_id:`wikidata-ambiguous-p460-${qa}-${qb}`,
  case_class:'AMBIGUOUS_REVIEW_REQUIRED',
  identity_boundary:'SOURCE_RECORD',
  scope_id:'diagnostic-wikidata-identity-ambiguity-not-final-poc',
  expected:'REVIEW',
  blind_holdout:true,
  left:{entity_id:qa,label:label(a),source:'wikidata-structured-data',evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  right:{entity_id:qb,label:label(b),source:'wikidata-structured-data',evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  provenance_refs:[
    `wikidata:${qa}:P460:${qb}:${forward?'forward':'reverse-confirmed'}`,
    `wikidata:${qb}:P460:${qa}:${reverse?'reverse':'not-required'}`,
    'wikidata-property-talk:P460:documented-example',
    'wikidata-property:P460:uncertain-or-disputed-sameness'
  ],
  rights_state:'ALLOW',
  label_basis:'WIKIDATA_DOCUMENTED_P460_EXAMPLE_REVALIDATED_IN_LIVE_CC0_ENTITYDATA;_P460_SAMENESS_MAY_BE_UNCERTAIN_OR_DISPUTED_SO_AUTO_MATCH_OR_AUTO_NO_MATCH_IS_NOT_JUSTIFIED',
  claim_ceiling:'SOURCE_RECORD_IDENTITY_REVIEW_REQUIRED_NO_AUTO_MERGE'
};
if(dataset.cases.some(x=>x.case_id===ambiguousCase.case_id)) throw new Error('DUPLICATE_AMBIGUOUS_CASE');
const out={...dataset,id:'entity-resolution-real-world-dataset-increment-r6',dataset_scope:'INCREMENTAL_PARTIAL_R6_ALL_CASE_CLASSES_DIAGNOSTIC',scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],source_families:[...new Set([...(dataset.source_families??[]),'wikidata-p460-ambiguous-identity'])],cases:[...dataset.cases,ambiguousCase],truth_boundary:'R6 adds a documented and live-revalidated P460 uncertain/disputed source-record identity pair for AMBIGUOUS_REVIEW_REQUIRED. All required case classes may now be diagnostically present, but final approved PoC scope stratification remains incomplete and promotion must remain blocked.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
