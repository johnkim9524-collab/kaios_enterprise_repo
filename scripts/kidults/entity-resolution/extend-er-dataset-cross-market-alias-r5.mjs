import fs from 'node:fs/promises';

const [inputPath, outputPath='/tmp/er-real-world-r5.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-cross-market-alias-r5.mjs <r3.json> [r5.json]');
const QID='Q57781481';
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
function externalValues(entity,pid){
  return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());
}
function label(entity){return entity?.labels?.en?.value??entity?.labels?.mul?.value??entity?.id??null;}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R3_REAL_WORLD_DATASET_REQUIRED');
const entity=await fetchEntity(QID);
const discogs=externalValues(entity,'P2206');
const musicbrainz=externalValues(entity,'P5813');
if(discogs.length===0) throw new Error(`${QID} has no Discogs release ID P2206; fail closed.`);
if(musicbrainz.length===0) throw new Error(`${QID} has no MusicBrainz release ID P5813; fail closed.`);
const crosswalkAnchor=`wikidata-release-edition-crosswalk:${QID}`;
const aliasCase={
  case_id:`wikidata-cross-market-alias-${QID}-${discogs[0]}-${musicbrainz[0]}`,
  case_class:'CROSS_MARKET_ALIAS',
  identity_boundary:'SOURCE_RECORD',
  scope_id:'diagnostic-music-release-cross-market-not-final-poc',
  expected:'MATCH',
  blind_holdout:true,
  left:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`discogs-release:${discogs[0]}`},external_system:'Discogs',external_id:discogs[0],wikidata_bridge:QID},
  right:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`musicbrainz-release:${musicbrainz[0]}`},external_system:'MusicBrainz',external_id:musicbrainz[0],wikidata_bridge:QID},
  provenance_refs:[`wikidata:${QID}:P2206:${discogs[0]}`,`wikidata:${QID}:P5813:${musicbrainz[0]}`,'wikidata-property:P2206:discogs-release-id','wikidata-property:P5813:musicbrainz-release-id'],
  rights_state:'ALLOW',
  label_basis:'WIKIDATA_CC0_STRUCTURED_DATA_BINDS_DISCOGS_AND_MUSICBRAINZ_RELEASE_IDENTIFIERS_TO_THE_SAME_RELEASE_EDITION_ITEM',
  claim_ceiling:'EXTERNAL_RELEASE_IDENTIFIER_CROSSWALK_ONLY_NO_MARKET_PRICE_OR_SALES_DATA'
};
if(dataset.cases.some(x=>x.case_id===aliasCase.case_id)) throw new Error('DUPLICATE_CROSS_MARKET_ALIAS_CASE');
const out={...dataset,id:'entity-resolution-real-world-dataset-increment-r5',dataset_scope:'INCREMENTAL_PARTIAL_R5',scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],source_families:[...new Set([...(dataset.source_families??[]),'wikidata-external-id-crosswalk'])],cases:[...dataset.cases,aliasCase],truth_boundary:'R5 adds a CC0 authoritative external-ID crosswalk for CROSS_MARKET_ALIAS. It does not admit Discogs marketplace data, current-market claims or final approved PoC scope coverage.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
