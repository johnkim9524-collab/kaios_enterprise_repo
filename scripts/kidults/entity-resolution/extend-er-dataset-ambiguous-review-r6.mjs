import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, outputPath='/tmp/er-real-world-r6.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-ambiguous-review-r6.mjs <r5.json> [r6.json]');
const timeoutMs=30000;
const WIKIDATA_RIGHTS_URL='https://www.wikidata.org/wiki/Wikidata:Licensing';
const digest=(value)=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const DOCUMENTED_P460_CANDIDATES=[
  ['Q7158737','Q8937'],
  ['Q26925','Q44047'],
  ['Q113159165','Q113159202']
];

function assertConstructedControlDataset(dataset, stage){
  const valid=dataset.dataset_class==='REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL'
    && dataset.synthetic===false
    && dataset.constructed_control===true
    && dataset.empirical_benchmark_eligible===false
    && dataset.independent_label_review_complete===false
    && dataset.label_adjudication_complete===false
    && dataset.holdout_sealed_before_modeling===false
    && Array.isArray(dataset.cases)
    && dataset.cases.every((item)=>item.blind_holdout!==true);
  if(!valid) throw new Error(`${stage}_CONSTRUCTED_CONTROL_DATASET_REQUIRED`);
}

async function fetchJson(url, attempts=4){
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
      if(attempt<attempts) await new Promise(r=>setTimeout(r,1000*(2**(attempt-1))));
    }finally{clearTimeout(timer);}
  }
  throw lastError;
}
function itemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
assertConstructedControlDataset(dataset,'R5');

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
  if(forward||reverse){selected={qa,qb,a,b,ja,jb,forward,reverse};break;}
}
if(!selected) throw new Error('Documented P460 candidates no longer validate in live EntityData; fail closed.');

const {qa,qb,a,b,ja,jb,forward,reverse}=selected;
const ambiguousCase={
  case_id:`wikidata-ambiguous-p460-${qa}-${qb}`,
  case_class:'AMBIGUOUS_REVIEW_REQUIRED',
  identity_boundary:'SOURCE_RECORD',
  scope_id:'diagnostic-wikidata-identity-ambiguity-not-final-poc',
  expected:'REVIEW',
  blind_holdout:false,
  constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{entity_id:qa,label:label(a),source:'wikidata-structured-data',evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  right:{entity_id:qb,label:label(b),source:'wikidata-structured-data',evidence_relation:'P460_SAID_TO_BE_THE_SAME_AS'},
  provenance_refs:[
    `wikidata:${qa}:P460:${qb}:${forward?'forward':'reverse-confirmed'}`,
    `wikidata:${qb}:P460:${qa}:${reverse?'reverse':'not-required'}`,
    'wikidata-property-talk:P460:documented-example',
    'wikidata-property:P460:uncertain-or-disputed-sameness'
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_A_WIKIDATA_P460_RELATION;_P460_SAMENESS_MAY_BE_UNCERTAIN_OR_DISPUTED_SO_THE_CONSTRUCTED_CONTROL_EXPECTS_REVIEW',
  source_evidence:[
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${qa}.json`,source_payload_sha256:digest(ja),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${qb}.json`,source_payload_sha256:digest(jb),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  claim_ceiling:'SOURCE_RECORD_IDENTITY_REVIEW_REQUIRED_NO_AUTO_MERGE'
};
if(dataset.cases.some(x=>x.case_id===ambiguousCase.case_id)) throw new Error('DUPLICATE_AMBIGUOUS_CASE');
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r6',
  dataset_scope:'INCREMENTAL_PARTIAL_R6_ALL_CASE_CLASSES_DIAGNOSTIC_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',
  synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  production:'HOLD',
  scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],
  source_families:[...new Set([...(dataset.source_families??[]),'wikidata-p460-ambiguous-identity'])],cases:[...dataset.cases,ambiguousCase],
  truth_boundary:'R6 adds a documented, live-source-derived P460 constructed control for AMBIGUOUS_REVIEW_REQUIRED. Required case classes may be diagnostically present, but labels are not independently reviewed, adjudicated, or blind; final approved PoC stratification, empirical promotion, #479 completion, and Production remain blocked.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
