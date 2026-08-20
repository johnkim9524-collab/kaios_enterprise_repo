import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const admission=JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/wikidata-regional-vinyl-catalog-observation-admission-r1.json','utf8'));
const outPath=process.argv[2]||'/tmp/wikidata-regional-vinyl-catalog-observation-r1.json';
const timeoutMs=45000;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const retryable=new Set([429,500,502,503,504]);
const macroregion=c=>['US','CA','MX'].includes(c)?'NORTH_AMERICA':['GB','FR','DE','IT','ES','NL','BE','CH','AT','SE','NO','DK','FI','IE','PT','PL','CZ'].includes(c)?'EUROPE':c==='JP'?'JAPAN':c==='KR'?'KOREA':['CN','HK','MO','TW'].includes(c)?'GREATER_CHINA':['SG','MY','TH','ID','PH','VN'].includes(c)?'SOUTHEAST_ASIA':['AU','NZ'].includes(c)?'OCEANIA':'OTHER';

if(admission.production!=='HOLD'||admission.public_release!=='HOLD')throw new Error('RELEASE_BOUNDARY');
if(admission.admission_state!=='ADMITTED_BOUNDED_CC0_SHADOW'||admission.rights_state!=='ALLOW_CC0'||admission.transport_state!=='ALLOW_PUBLIC_SPARQL_READ_ONLY')throw new Error('ADMISSION_BOUNDARY');
if(admission.required_distribution_format_qid!=='Q178588')throw new Error('FORMAT_BOUNDARY');

const sparql=`SELECT ?item ?countryCode ?date WHERE {
  ?item wdt:P437 wd:Q178588 ;
        wdt:P495 ?country .
  ?country wdt:P297 ?countryCode .
  OPTIONAL { ?item wdt:P577 ?date . }
}
ORDER BY STR(?item)
LIMIT ${Number(admission.transport.bounded_query_limit||300)}`;
const endpoint=new URL(admission.transport.endpoint);
endpoint.searchParams.set('query',sparql);
endpoint.searchParams.set('format','json');

async function fetchBounded(){let last=null;const attempts=[];for(let i=0;i<5;i++){if(i>0)await sleep(Math.min(8000,1000*(2**(i-1))));const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(endpoint,{headers:{accept:'application/sparql-results+json','user-agent':'KIDULTS-ASI-WIKIDATA-REGIONAL-VINYL/1.0 (bounded CC0 shadow; contact via repository)'},signal:controller.signal});attempts.push({attempt:i+1,status:response.status});if(response.ok)return {body:await response.json(),attempts};if(!retryable.has(response.status))throw new Error(`WIKIDATA_HTTP_${response.status}`);last=new Error(`WIKIDATA_HTTP_${response.status}`);}catch(e){last=e;attempts.push({attempt:i+1,error:e?.name||'ERROR'});}finally{clearTimeout(timer);}}throw last||new Error('WIKIDATA_FETCH_FAILED');}

const {body,attempts}=await fetchBounded();
const rows=body?.results?.bindings||[];
const byKey=new Map();
for(const row of rows){
  const qid=String(row?.item?.value||'').match(/\/entity\/(Q\d+)$/)?.[1];
  const country=String(row?.countryCode?.value||'').toUpperCase();
  if(!qid||!/^[A-Z]{2}$/.test(country))continue;
  const region=macroregion(country);
  if(region==='OTHER')continue;
  const rawDate=String(row?.date?.value||'');
  const date=rawDate.match(/^(\d{4}(?:-\d{2}(?:-\d{2})?)?)/)?.[1]||null;
  const projected={wikidata_item_qid:qid,country_code:country,macroregion_id:region,publication_date:date,distribution_format_qid:'Q178588'};
  const key=`${qid}:${country}`;
  if(!byKey.has(key))byKey.set(key,{...projected,source_reference:`https://www.wikidata.org/wiki/${qid}`,source_projection_sha256:sha(projected),rights_state:'ALLOW_CC0',purpose:admission.purpose});
}
const observations=[...byKey.values()].sort((a,b)=>a.wikidata_item_qid.localeCompare(b.wikidata_item_qid)||a.country_code.localeCompare(b.country_code));
const macroregionCounts={};for(const x of observations)macroregionCounts[x.macroregion_id]=(macroregionCounts[x.macroregion_id]||0)+1;
const artifact={
  id:'kidults-asi-wikidata-regional-vinyl-catalog-observation-r1',version:'1.0.0',parent_issue:768,
  source_id:admission.source_id,source_owner_id:admission.source_owner_id,purpose:admission.purpose,category_scope:admission.category_scope,
  rights_state:admission.rights_state,transport_state:admission.transport_state,license_evidence_refs:admission.license_evidence_refs,
  query_reference:`${admission.transport.endpoint}?query=BOUNDED_VINYL_P437_Q178588_COUNTRY_P495_ISO_P297`,query_response_sha256:sha(body),transport_attempts:attempts,
  sampled_response_records:rows.length,region_bound_observation_count:observations.length,macroregion_counts:macroregionCounts,observations:observations.slice(0,120),
  factor_eligibility:'NOT_VERIFIED',market_scale_claim:false,market_maturity_claim:false,transaction_activity_claim:false,current_market_claim:false,global_weight_claim:false,
  public_release:'HOLD',production:'HOLD',
  truth_boundary:'Wikidata CC0 items explicitly carrying vinyl distribution format plus country-of-origin/ISO binding are bounded regional catalog observations only. They are not transactions, market size, maturity, demand, liquidity, sales or market-share evidence.'
};
if(artifact.region_bound_observation_count<2)throw new Error('INSUFFICIENT_REGION_BOUND_WIKIDATA_OBSERVATIONS');
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',region_bound_observation_count:artifact.region_bound_observation_count,macroregion_counts:artifact.macroregion_counts,rights_state:artifact.rights_state,market_scale_claim:false,transaction_activity_claim:false,production:'HOLD'}));
