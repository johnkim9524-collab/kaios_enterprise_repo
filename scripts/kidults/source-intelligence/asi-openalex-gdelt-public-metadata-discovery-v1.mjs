#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out=process.argv[2]||'/tmp/asi-openalex-gdelt-public-metadata-discovery-v1.json';
const registry=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json','utf8'));
const scopes=(registry.scopes||[]).map(s=>({id:s.scope_id,name:s.name||s.scope_id})).filter(s=>s.id&&s.name);
if(scopes.length!==32)throw new Error(`SCOPE_REGISTRY_NOT_32:${scopes.length}`);
const rotationRaw=process.env.ASI_SCOPE_ROTATION;
const rotation=rotationRaw===undefined?new Date().getUTCHours()%4:Number(rotationRaw);
if(!Number.isInteger(rotation)||rotation<0||rotation>3)throw new Error('ROTATION_INDEX');
const cycleScopes=scopes.slice(rotation*8,rotation*8+8);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const norm=u=>{try{const x=new URL(String(u||''));if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
async function fetchJson(url,opts={},attempt=0){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(url,{...opts,signal:controller.signal});
  if((r.status===429||r.status>=500)&&attempt<2){await sleep(900*(2**attempt));return fetchJson(url,opts,attempt+1)}
  if(!r.ok)throw new Error(`HTTP_${r.status}`);
  const type=r.headers.get('content-type')||'';if(!type.includes('json'))throw new Error(`NON_JSON_RESPONSE:${type.slice(0,40)}`);
  return await r.json();
 }finally{clearTimeout(timer)}
}
const candidates=[],laneHealth=[];
function add(raw){
 const endpoint=norm(raw.endpoint_url);if(!endpoint)return;
 candidates.push({...raw,endpoint_url:endpoint,source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',live_external_observation:true,acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,public_release:'HOLD',production:'HOLD'});
}
function lane(id,status,count,error=null){laneHealth.push({lane_id:id,status,observed_candidates:count,error})}

// OpenAlex public scholarly metadata. Landing URLs are discovery candidates only.
try{
 let count=0;
 for(const s of cycleScopes){
  const u=new URL('https://api.openalex.org/works');u.searchParams.set('search',`${s.name} collectible`);u.searchParams.set('per-page','8');
  const data=await fetchJson(u,{headers:{Accept:'application/json','User-Agent':'KIDULTS-ASI-Public-Metadata-Discovery-v1'}});
  for(const work of data.results||[]){
   const locs=[work.primary_location,work.best_oa_location,...(work.locations||[]).slice(0,2)].filter(Boolean);
   for(const loc of locs){
    const endpoint=norm(loc.landing_page_url||loc.pdf_url||loc.source?.homepage_url);if(!endpoint)continue;
    add({candidate_id:`cand-oa-${hash((work.id||'')+endpoint+s.id)}`,discovery_provider:'OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA',discovery_channel:'OPEN_RESEARCH_AND_REPOSITORY_METADATA',observed_at:new Date().toISOString(),endpoint_url:endpoint,source_name:loc.source?.display_name||work.display_name||endpoint,source_owner_hint:loc.source?.host_organization_name||loc.source?.display_name||'UNKNOWN',provider_record_id:String(work.id||endpoint),scope_hint:s.id,region_hint:'GLOBAL_UNRESOLVED',metadata:{work_id:work.id||null,doi:work.doi||null,work_title:work.display_name||null,source_id:loc.source?.id||null,source_type:loc.source?.type||null,scope_name:s.name,observation_purpose:'DISCOVERY_METADATA_INDEX_ONLY'}});count++;
   }
  }
  await sleep(120);
 }
 lane('OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA',count?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',count);
}catch(e){lane('OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA','FAILED',0,String(e?.message||e).slice(0,120))}

// GDELT DOC public article metadata. Article/domain URLs are attention/context discovery candidates, never demand or transaction evidence.
try{
 let count=0;
 for(const s of cycleScopes){
  const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');u.searchParams.set('query',`"${s.name}" collectible`);u.searchParams.set('mode','ArtList');u.searchParams.set('maxrecords','20');u.searchParams.set('format','json');u.searchParams.set('sort','HybridRel');
  const data=await fetchJson(u,{headers:{Accept:'application/json','User-Agent':'KIDULTS-ASI-Public-Metadata-Discovery-v1'}});
  for(const article of data.articles||[]){
   const endpoint=norm(article.url);if(!endpoint)continue;
   add({candidate_id:`cand-gdelt-${hash(endpoint+s.id)}`,discovery_provider:'GDELT_PUBLIC_DOMAIN_MENTION_METADATA',discovery_channel:'GLOBAL_EVENT_AND_DOMAIN_MENTION_INDEX',observed_at:new Date().toISOString(),endpoint_url:endpoint,source_name:article.title||article.domain||endpoint,source_owner_hint:article.domain||'UNKNOWN',provider_record_id:hash(endpoint+(article.seendate||'')),scope_hint:s.id,region_hint:'GLOBAL_UNRESOLVED',metadata:{domain:article.domain||null,source_country:article.sourcecountry||null,language:article.language||null,seen_date:article.seendate||null,scope_name:s.name,observation_purpose:'DISCOVERY_METADATA_INDEX_ONLY',attention_is_not_demand:true}});count++;
  }
  await sleep(180);
 }
 lane('GDELT_PUBLIC_DOMAIN_MENTION_METADATA',count?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',count);
}catch(e){lane('GDELT_PUBLIC_DOMAIN_MENTION_METADATA','FAILED',0,String(e?.message||e).slice(0,120))}

const unique=new Map();
for(const c of candidates){
 const prior=unique.get(c.endpoint_url);
 if(!prior)unique.set(c.endpoint_url,c);
 else unique.set(c.endpoint_url,{...prior,discovery_providers:[...new Set([...(prior.discovery_providers||[prior.discovery_provider]),c.discovery_provider])],scope_hints:[...new Set([...(prior.scope_hints||[prior.scope_hint]).filter(Boolean),c.scope_hint].filter(Boolean))]});
}
const final=[...unique.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
const providerCounts={};for(const c of final)for(const p of c.discovery_providers||[c.discovery_provider])providerCounts[p]=(providerCounts[p]||0)+1;
const healthy=laneHealth.filter(l=>l.status==='SUCCESS_WITH_RESULTS').length;
const output={id:'kidults-asi-openalex-gdelt-public-metadata-discovery-v1',version:'1.0.0',status:'SHADOW_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY_COMPLETE',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_restricted:false,scope_registry_total:32,scope_rotation_count:4,scope_rotation_index:rotation,cycle_scope_count:cycleScopes.length,cycle_scope_ids:cycleScopes.map(s=>s.id),lane_health:laneHealth,healthy_lane_count:healthy,candidate_count:final.length,live_external_candidate_count:final.length,provider_counts:providerCounts,candidates:final,rules:{multi_provider_fail_soft:true,discovery_metadata_only:true,target_site_body_traversal_forbidden:true,attention_is_not_demand:true,listing_is_not_sold:true,terminal_transaction_assertion_required:true,rights_never_promoted:true,admission_never_promoted:true},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,rotation,scopes:cycleScopes.length,candidates:final.length,healthy_lanes:healthy,lane_health:laneHealth,production:'HOLD'},null,2));
