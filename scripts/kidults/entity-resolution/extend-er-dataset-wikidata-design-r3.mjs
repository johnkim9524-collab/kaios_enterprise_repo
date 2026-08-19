import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, outputPath='/tmp/er-real-world-r3.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-wikidata-design-r3.mjs <r2.json> [r3.json]');
const LEFT='Q204424';
const RIGHT='Q697041';
const DESIGN='Q184870';
const timeoutMs=15000;
const WIKIDATA_RIGHTS_URL='https://www.wikidata.org/wiki/Wikidata:Licensing';
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
    return {entity,payload:json};
  }finally{clearTimeout(timer);}
}
function claimItemIds(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
assertConstructedControlDataset(dataset,'R2');
const [leftResponse,rightResponse,designResponse]=await Promise.all([fetchEntity(LEFT),fetchEntity(RIGHT),fetchEntity(DESIGN)]);
const {entity:left,payload:leftPayload}=leftResponse;
const {entity:right,payload:rightPayload}=rightResponse;
const {entity:design,payload:designPayload}=designResponse;
if(!claimItemIds(left,'P31').includes(DESIGN)) throw new Error(`${LEFT} is not explicitly instance of ${DESIGN}`);
if(!claimItemIds(right,'P31').includes(DESIGN)) throw new Error(`${RIGHT} is not explicitly instance of ${DESIGN}`);
if(LEFT===RIGHT) throw new Error('Distinct physical entities required.');

const designAnchor=`wikidata-canonical-design:${DESIGN}`;
const designCase={
  case_id:`wikidata-same-design-different-object-${LEFT}-${RIGHT}`,
  case_class:'SAME_DESIGN_DIFFERENT_OBJECT',identity_boundary:'CANONICAL_DESIGN',scope_id:'diagnostic-manufactured-vehicle-design-not-final-poc',
  expected:'MATCH',blind_holdout:false,
  constructed_control:true,label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:LEFT},entity_id:LEFT,label:label(left),source:'wikidata-structured-data'},
  right:{anchors:{CANONICAL_DESIGN:designAnchor},unique_keys:{object_id:RIGHT},entity_id:RIGHT,label:label(right),source:'wikidata-structured-data'},
  provenance_refs:[`wikidata:${LEFT}:P31:${DESIGN}`,`wikidata:${RIGHT}:P31:${DESIGN}`,`wikidata:${DESIGN}:canonical-design`],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_STRUCTURED_DATA_ASSERTING_BOTH_DISTINCT_PHYSICAL_ENTITIES_AS_INSTANCES_OF_THE_SAME_DESIGN_CLASS',
  source_evidence:[
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${LEFT}.json`,source_payload_sha256:digest(leftPayload),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${RIGHT}.json`,source_payload_sha256:digest(rightPayload),license_evidence_refs:[WIKIDATA_RIGHTS_URL]},
    {source_url:`https://www.wikidata.org/wiki/Special:EntityData/${DESIGN}.json`,source_payload_sha256:digest(designPayload),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  design_label:label(design),claim_ceiling:'CANONICAL_DESIGN_IDENTITY_DIAGNOSTIC_ONLY'
};
if(dataset.cases.some(x=>x.case_id===designCase.case_id)) throw new Error('DUPLICATE_DESIGN_CASE');
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r3',
  dataset_scope:'INCREMENTAL_PARTIAL_R3_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',
  synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  production:'HOLD',
  scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],
  source_families:[...new Set([...(dataset.source_families??[]),'wikidata-structured-data'])],cases:[...dataset.cases,designCase],
  truth_boundary:'R3 adds an official-source-derived CC0 constructed control for CANONICAL_DESIGN / SAME_DESIGN_DIFFERENT_OBJECT. The diagnostic pair is algorithmically derived from Wikidata statements, not independently reviewed, adjudicated, or blind; final approved PoC stratification, empirical promotion, and Production remain blocked.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
