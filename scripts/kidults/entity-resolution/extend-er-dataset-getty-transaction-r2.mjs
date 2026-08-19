import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, outputPath='/tmp/er-real-world-r2.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-getty-transaction-r2.mjs <r1.json> [r2.json]');

const SALE_ID='fbc91494-294c-30a6-b6dc-885f3ea074ed';
const OBJECT_ID='09539ab1-416d-3870-810b-8a6b3b604368';
const SALE_URL=`https://data.getty.edu/provenance/${SALE_ID}`;
const OBJECT_URL=`https://data.getty.edu/provenance/${OBJECT_ID}`;
const RIGHTS_URL='https://data.getty.edu/provenance/docs/';
const timeoutMs=15000;
const digest=(value)=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

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

async function fetchJson(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{headers:{accept:'application/ld+json, application/json;q=0.9','user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0'},signal:controller.signal});
    if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  }finally{clearTimeout(timer);}
}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
assertConstructedControlDataset(dataset,'R1');
const sale=await fetchJson(SALE_URL);
const object=await fetchJson(OBJECT_URL);
const saleSerialized=JSON.stringify(sale).toLowerCase();
const objectSerialized=JSON.stringify(object).toLowerCase();
if(!saleSerialized.includes('activity')&&!saleSerialized.includes('sale')) throw new Error('Getty sale Activity semantics not verified.');
if(!objectSerialized.includes(OBJECT_ID.toLowerCase())&&!String(object.id??object['@id']??'').includes(OBJECT_ID)) throw new Error('Getty object record identity not verified.');

const relationAnchor=`getty-sale-object-link:${SALE_ID}:${OBJECT_ID}`;
const gettyCase={
  case_id:`getty-transaction-object-link-${SALE_ID}`,
  case_class:'TRANSACTION_TO_OBJECT_LINKAGE',
  identity_boundary:'MARKET_EVENT',
  scope_id:'poc-historical-transaction-linkage',
  expected:'MATCH',
  blind_holdout:false,
  constructed_control:true,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{
    anchors:{MARKET_EVENT:relationAnchor},
    unique_keys:{transaction_id:SALE_ID},
    record_id:SALE_ID,
    record_type:sale.type??null,
    source:'getty-provenance-index',
    semantic_role:'HISTORICAL_SALE_ACTIVITY'
  },
  right:{
    anchors:{MARKET_EVENT:relationAnchor},
    unique_keys:{transaction_id:SALE_ID,object_id:OBJECT_ID},
    record_id:OBJECT_ID,
    record_type:object.type??null,
    source:'getty-provenance-index',
    semantic_role:'SALE_OBJECT'
  },
  provenance_refs:[
    `getty-provenance:sale:${SALE_ID}:cc0`,
    `getty-provenance:object:${OBJECT_ID}:cc0`,
    'getty-docs:documented-sale-to-object-example'
  ],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_GETTY_OFFICIAL_API_DOCUMENTATION_LINKING_A_DOCUMENTED_SALE_ACTIVITY_TO_A_DOCUMENTED_OBJECT',
  rights_reference:RIGHTS_URL,
  source_evidence:[
    {source_url:SALE_URL,source_payload_sha256:digest(sale),license_evidence_refs:[RIGHTS_URL]},
    {source_url:OBJECT_URL,source_payload_sha256:digest(object),license_evidence_refs:[RIGHTS_URL]}
  ],
  claim_ceiling:'HISTORICAL_TRANSACTION_TO_OBJECT_LINKAGE_ONLY'
};

if(dataset.cases.some(x=>x.case_id===gettyCase.case_id)) throw new Error('DUPLICATE_GETTY_CASE');
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r2',
  dataset_scope:'INCREMENTAL_PARTIAL_R2_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',
  synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  production:'HOLD',
  source_families:[...new Set([...(dataset.source_families??[]),'getty-provenance-index'])],
  cases:[...dataset.cases,gettyCase],
  truth_boundary:'R2 adds an official-source-derived CC0 constructed control for historical transaction-to-object linkage and the MARKET_EVENT boundary. Its pair label is algorithmically derived, not independently reviewed, adjudicated, or blind; it cannot satisfy empirical 99%, current-market, Production, or #479 completion claims.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
