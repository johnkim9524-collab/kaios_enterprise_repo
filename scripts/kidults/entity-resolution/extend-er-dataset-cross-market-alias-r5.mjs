import fs from 'node:fs/promises';

const [inputPath, outputPath='/tmp/er-real-world-r5.json'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node extend-er-dataset-cross-market-alias-r5.mjs <r3.json> [r5.json]');
const timeoutMs=20000;

async function fetchJson(url, headers={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{headers:{'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',...headers},signal:controller.signal});
    if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  }finally{clearTimeout(timer);}
}
function externalValues(entity,pid){return (entity?.claims?.[pid]??[]).map(c=>c?.mainsnak?.datavalue?.value).filter(v=>typeof v==='string'&&v.trim());}

const dataset=JSON.parse(await fs.readFile(inputPath,'utf8'));
if(dataset.dataset_class!=='REAL_WORLD_LABELED'||dataset.synthetic===true||!Array.isArray(dataset.cases)) throw new Error('R3_REAL_WORLD_DATASET_REQUIRED');

const sparql=`SELECT ?item ?discogs ?musicbrainz WHERE { ?item wdt:P2206 ?discogs ; wdt:P5813 ?musicbrainz . } ORDER BY STR(?item) STR(?discogs) STR(?musicbrainz) LIMIT 10`;
const queryUrl=`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
const query=await fetchJson(queryUrl,{accept:'application/sparql-results+json'});
const rows=query?.results?.bindings??[];
if(rows.length===0) throw new Error('No live Wikidata item with both P2206 and P5813 found; fail closed.');

let selected=null;
for(const row of rows){
  const match=String(row?.item?.value??'').match(/\/entity\/(Q\d+)$/);
  if(!match) continue;
  const qid=match[1];
  const entityJson=await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const entity=entityJson?.entities?.[qid];
  if(!entity) continue;
  const discogs=externalValues(entity,'P2206');
  const musicbrainz=externalValues(entity,'P5813');
  const rowDiscogs=String(row?.discogs?.value??'');
  const rowMusicbrainz=String(row?.musicbrainz?.value??'');
  if(discogs.includes(rowDiscogs)&&musicbrainz.includes(rowMusicbrainz)){
    selected={qid,discogs:rowDiscogs,musicbrainz:rowMusicbrainz};
    break;
  }
}
if(!selected) throw new Error('SPARQL crosswalk candidates could not be revalidated against live EntityData; fail closed.');

const {qid,discogs,musicbrainz}=selected;
const crosswalkAnchor=`wikidata-release-edition-crosswalk:${qid}`;
const aliasCase={
  case_id:`wikidata-cross-market-alias-${qid}-${discogs}-${musicbrainz}`,
  case_class:'CROSS_MARKET_ALIAS',identity_boundary:'SOURCE_RECORD',scope_id:'diagnostic-music-release-cross-market-not-final-poc',
  expected:'MATCH',blind_holdout:true,
  left:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`discogs-release:${discogs}`},external_system:'Discogs',external_id:discogs,wikidata_bridge:qid},
  right:{anchors:{SOURCE_RECORD:crosswalkAnchor},unique_keys:{reference_id:`musicbrainz-release:${musicbrainz}`},external_system:'MusicBrainz',external_id:musicbrainz,wikidata_bridge:qid},
  provenance_refs:[`wikidata:${qid}:P2206:${discogs}`,`wikidata:${qid}:P5813:${musicbrainz}`,'wikidata-query:P2206+P5813','wikidata-property:P2206:discogs-release-id','wikidata-property:P5813:musicbrainz-release-id'],
  rights_state:'ALLOW',
  label_basis:'WIKIDATA_CC0_STRUCTURED_DATA_BINDS_DISCOGS_AND_MUSICBRAINZ_RELEASE_IDENTIFIERS_TO_THE_SAME_RELEASE_EDITION_ITEM_AND_LIVE_ENTITYDATA_REVALIDATES_BOTH_VALUES',
  claim_ceiling:'EXTERNAL_RELEASE_IDENTIFIER_CROSSWALK_ONLY_NO_MARKET_PRICE_OR_SALES_DATA'
};
if(dataset.cases.some(x=>x.case_id===aliasCase.case_id)) throw new Error('DUPLICATE_CROSS_MARKET_ALIAS_CASE');
const out={...dataset,id:'entity-resolution-real-world-dataset-increment-r5',dataset_scope:'INCREMENTAL_PARTIAL_R5',scope_stratification_status:'INCOMPLETE',approved_scope_ids:[],required_scope_ids:[],source_families:[...new Set([...(dataset.source_families??[]),'wikidata-external-id-crosswalk'])],cases:[...dataset.cases,aliasCase],truth_boundary:'R5 adds a live-revalidated CC0 external-ID crosswalk for CROSS_MARKET_ALIAS. It does not admit Discogs marketplace data, current-market claims or final approved PoC scope coverage.'};
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
