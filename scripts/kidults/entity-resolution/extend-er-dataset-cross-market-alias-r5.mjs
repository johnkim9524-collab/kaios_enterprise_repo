import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, outputPath='/tmp/er-real-world-r5.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-cross-market-alias-r5.mjs <r3.json> [r5.json]');
const timeoutMs=30000;
const WIKIDATA_RIGHTS_URL='https://www.wikidata.org/wiki/Wikidata:Licensing';
const DOCUMENTED_CROSSWALK_CANDIDATES=['Q100270451'];
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
function externalValues(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
assertConstructedControlDataset(dataset,'R3');

// Revalidate a previously observed authoritative Wikidata bridge directly from EntityData.
// This intentionally avoids Wikidata Query Service availability as a CI dependency while
// preserving the same CC0 source authority and fail-closed semantics.
let selected=null;
for(const qid of DOCUMENTED_CROSSWALK_CANDIDATES){
  let entityJson;
  try{entityJson=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);}catch{continue;}
  const entity=entityJson?.entities?.[qid];
  if(!entity) continue;
  const discogs=[...new Set(externalValues(entity,'P2206'))].sort();
  const musicbrainz=[...new Set(externalValues(entity,'P5813'))].sort();
  if(discogs.length&&musicbrainz.length){
    selected={qid,discogs:discogs[0],musicbrainz:musicbrainz[0],entityPayload:entityJson};
    break;
  }
}
if(!selected) throw new Error('Documented Wikidata crosswalk candidate no longer exposes both P2206 and P5813 in live EntityData; fail closed.');

const {qid,discogs,musicbrainz}=selected;
const entityUrl=`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const crosswalkAnchor=`wikidata-release-edition-crosswalk:${qid}`;
const aliasCase={
  case_id:`wikidata-cross-market-alias-${qid}-${discogs}-${musicbrainz}`,
  case_class:'CROSS_MARKET_ALIAS',identity_boundary:'SOURCE_RECORD',scope_id:'diagnostic-music-release-cross-market-not-final-poc',
  expected:'MATCH',blind_holdout:false,
  constructed_control:true,label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  left:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`discogs-release:${discogs}`},external_system:'Discogs',external_id:discogs,wikidata_bridge:qid},
  right:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`musicbrainz-release:${musicbrainz}`},external_system:'MusicBrainz',external_id:musicbrainz,wikidata_bridge:qid},
  provenance_refs:[`wikidata:${qid}:P2206:${discogs}`,`wikidata:${qid}:P5813:${musicbrainz}`,'wikidata-property:P2206:discogs-release-id','wikidata-property:P5813:musicbrainz-release-id'],
  rights_state:'ALLOW',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_WIKIDATA_CC0_ENTITYDATA_BINDING_DISCOGS_AND_MUSICBRAINZ_RELEASE_IDENTIFIERS_TO_THE_SAME_RELEASE_EDITION_ITEM',
  source_evidence:[
    {source_url:entityUrl,source_payload_sha256:digest(selected.entityPayload),license_evidence_refs:[WIKIDATA_RIGHTS_URL]}
  ],
  claim_ceiling:'EXTERNAL_RELEASE_IDENTIFIER_CROSSWALK_ONLY_NO_MARKET_PRICE_OR_SALES_DATA'
};
if(dataset.cases.some(x=>x.case_id===aliasCase.case_id)) throw new Error('DUPLICATE_CROSS_MARKET_ALIAS_CASE');
const out={
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r5',
  dataset_scope:'INCREMENTAL_PARTIAL_R5_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',
  synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  production:'HOLD',
  scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],
  source_families:[...new Set([...(dataset.source_families??[]),'wikidata-external-id-crosswalk'])],cases:[...dataset.cases,aliasCase],
  truth_boundary:'R5 adds a live-source-derived CC0 constructed control for a CROSS_MARKET_ALIAS external-ID crosswalk revalidated directly from authoritative Wikidata EntityData. The label is algorithmically derived, not independently reviewed, adjudicated, or blind; it admits no Discogs API or marketplace data and supports no current-market, empirical-promotion, or Production claim.'
};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
