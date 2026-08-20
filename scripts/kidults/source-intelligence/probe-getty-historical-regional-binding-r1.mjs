import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ACTIVITY_URL='https://data.getty.edu/provenance/fbc91494-294c-30a6-b6dc-885f3ea074ed';
const RIGHTS=['https://data.getty.edu/provenance/docs/','https://creativecommons.org/publicdomain/zero/1.0/'];
const outPath=process.argv[2]||'/tmp/getty-historical-regional-binding-r1.json';
const timeoutMs=20000;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const ref=v=>typeof v==='string'?v:String(v?.id||v?.['@id']||'');
const label=v=>String(v?._label||v?.label||v?.identified_by?.[0]?.content||'').trim();
const allowed=u=>/^https:\/\/data\.getty\.edu\/provenance\/[0-9a-f-]+$/i.test(u);
async function fetchJson(url){if(!allowed(url))throw new Error(`URL_NOT_ALLOWED:${url}`);let last;for(let a=0;a<3;a++){try{const r=await fetch(url,{headers:{accept:'application/ld+json, application/json;q=0.9','user-agent':'KIDULTS-ASI-REGIONAL-BINDING/1.0'},signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw new Error(`HTTP_${r.status}:${url}`);return await r.json();}catch(e){last=e;if(a<2)await new Promise(q=>setTimeout(q,500*(2**a)));}}throw last;}
const COUNTRY={
  'united states':'US','united states of america':'US','usa':'US','france':'FR','united kingdom':'GB','england':'GB','germany':'DE','italy':'IT','spain':'ES','netherlands':'NL','belgium':'BE','switzerland':'CH','austria':'AT','japan':'JP','south korea':'KR','republic of korea':'KR','china':'CN','hong kong':'HK','singapore':'SG','australia':'AU','canada':'CA'
};
const macroregion=cc=>['US','CA'].includes(cc)?'NORTH_AMERICA':['FR','GB','DE','IT','ES','NL','BE','CH','AT'].includes(cc)?'EUROPE':cc==='JP'?'JAPAN':cc==='KR'?'KOREA':['CN','HK'].includes(cc)?'GREATER_CHINA':cc==='SG'?'SOUTHEAST_ASIA':cc==='AU'?'OCEANIA':'OTHER';
function directPlaceRefs(activity){const keys=['took_place_at','place','carried_out_by'];const refs=[];for(const k of keys)for(const v of arr(activity?.[k])){const u=ref(v);if(allowed(u))refs.push({relation:k,url:u,inline_label:label(v)||null});}return refs;}
function timeEvidence(activity){const ts=activity?.timespan||activity?.time_span||activity?.timespan_of_the_activity||null;const candidates=[ts?.begin_of_the_begin,ts?.end_of_the_end,ts?._label,activity?.begin_of_the_begin,activity?.end_of_the_end].filter(Boolean).map(String);return candidates;}
const activity=await fetchJson(ACTIVITY_URL);
const activityHash=sha(activity);
const places=directPlaceRefs(activity);
const visited=new Set();const placeChain=[];let countryCode=null,countryEvidence=null;
async function walk(url,relation,depth){if(depth>5||visited.has(url)||countryCode)return;visited.add(url);const p=await fetchJson(url);const row={url,relation,depth,label:label(p)||null,payload_sha256:sha(p)};placeChain.push(row);const key=(row.label||'').toLowerCase().replace(/\s+/g,' ').trim();if(COUNTRY[key]){countryCode=COUNTRY[key];countryEvidence={url,label:row.label,payload_sha256:row.payload_sha256};return;}for(const parent of arr(p?.part_of)){const u=ref(parent);if(allowed(u))await walk(u,'part_of',depth+1);}}
for(const p of places)await walk(p.url,p.relation,0);
const times=timeEvidence(activity);
const result={
  id:'kidults-getty-historical-regional-binding-probe-r1',
  parent_issue:654,
  source_id:'getty-provenance-index',
  evidence_class:'HISTORICAL_TRANSACTION_PROVENANCE',
  rights_state:'ALLOW_CC0_METADATA',
  rights_evidence_refs:RIGHTS,
  observation_ref:ACTIVITY_URL,
  observation_payload_sha256:activityHash,
  observation_type:activity.type||null,
  place_reference_count:places.length,
  place_chain_count:placeChain.length,
  place_chain:placeChain,
  observed_time_candidates:times,
  country_code:countryCode,
  macroregion_id:countryCode?macroregion(countryCode):null,
  country_evidence:countryEvidence,
  local_market_or_venue:places[0]?.inline_label||placeChain[0]?.label||null,
  language:null,
  currency:null,
  region_binding_status:countryCode?'PARTIAL_EXPLICIT_COUNTRY_BINDING':'NOT_VERIFIED_NO_EXPLICIT_COUNTRY_CHAIN',
  factor_eligibility:'NOT_VERIFIED',
  market_scale_claim:false,
  current_market_claim:false,
  global_claim:false,
  production:'HOLD',
  public_release:'HOLD',
  truth_boundary:'Observation-level Getty historical provenance only. Country is accepted only when an explicit Getty place/part_of resource label exactly matches a conservative country vocabulary. Provider home country is never used. Missing language/currency/factor evidence remains UNKNOWN; no current-market, market-scale, quota, analytical-weight, GLOBAL, Public or Production claim.'
};
await fs.writeFile(outPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({region_binding_status:result.region_binding_status,country_code:result.country_code,macroregion_id:result.macroregion_id,place_reference_count:result.place_reference_count,place_chain_count:result.place_chain_count,observed_time_candidate_count:times.length,factor_eligibility:result.factor_eligibility,production:'HOLD'}));
