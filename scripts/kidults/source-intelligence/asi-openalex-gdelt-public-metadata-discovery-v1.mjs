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
const OPENALEX='OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA';
const GDELT='GDELT_PUBLIC_DOMAIN_MENTION_METADATA';
const allowedActions=new Set(['FULL_DISCOVERY_BUDGET','REDUCED_DISCOVERY_BUDGET','SKIP_PROVIDER_NEXT_CYCLE','SINGLE_BOUNDED_PROBE','ON_DEMAND_ONLY']);
let circuit=null;
const circuitPath=process.env.ASI_PROVIDER_CIRCUIT||'';
if(circuitPath&&fs.existsSync(circuitPath)){
 try{const x=JSON.parse(fs.readFileSync(circuitPath,'utf8'));if(x.id==='kidults-asi-discovery-provider-health-circuit-v1'&&x.status==='SHADOW_PROVIDER_HEALTH_CIRCUIT_PLAN_READY'&&x.production==='HOLD'&&x.public_release==='HOLD'&&x.routing_directives)circuit=x;}catch{}
}
const rawPlan=id=>{const p=circuit?.routing_directives?.[id];return p&&allowedActions.has(p.action)&&p.rights_effect==='NONE'&&p.admission_effect==='NONE'&&p.acquisition_effect==='NONE'?{action:p.action,budget_multiplier:Number(p.budget_multiplier)}:{action:'FULL_DISCOVERY_BUDGET',budget_multiplier:1}};
const plans={[OPENALEX]:rawPlan(OPENALEX),[GDELT]:rawPlan(GDELT)};
if(Object.values(plans).every(p=>p.action==='SKIP_PROVIDER_NEXT_CYCLE'||p.budget_multiplier===0))plans[OPENALEX]={action:'SINGLE_BOUNDED_PROBE',budget_multiplier:0.1,forced_recovery_probe:true};
const shape=(id)=>{const p=plans[id];if(p.action==='SKIP_PROVIDER_NEXT_CYCLE'||p.budget_multiplier===0)return{scopes:[],page:0};if(p.action==='SINGLE_BOUNDED_PROBE')return{scopes:cycleScopes.slice(0,1),page:2};if(p.action==='REDUCED_DISCOVERY_BUDGET')return{scopes:cycleScopes.slice(0,4),page:4};if(p.action==='ON_DEMAND_ONLY')return{scopes:cycleScopes.slice(0,2),page:2};return{scopes:cycleScopes,page:8}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MAX_FETCH_ATTEMPTS=4;
const MAX_RETRY_AFTER_MS=20000;
const OPENALEX_PACING_MS=500;
const GDELT_PACING_MS=400;
const retryDelayMs=(response,attempt)=>{
 const raw=response?.headers?.get?.('retry-after');
 if(raw){
  const seconds=Number(raw);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.max(1000,Math.min(MAX_RETRY_AFTER_MS,Math.round(seconds*1000)));
  const when=Date.parse(raw);
  if(Number.isFinite(when))return Math.max(1000,Math.min(MAX_RETRY_AFTER_MS,when-Date.now()));
 }
 return Math.min(MAX_RETRY_AFTER_MS,1200*(2**attempt));
};
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const norm=u=>{try{const x=new URL(String(u||''));if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
async function fetchJson(url,opts={},attempt=0){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  let r;
  try{r=await fetch(url,{...opts,signal:controller.signal});}
  catch(error){
   if(attempt<MAX_FETCH_ATTEMPTS-1){await sleep(Math.min(MAX_RETRY_AFTER_MS,1200*(2**attempt)));return fetchJson(url,opts,attempt+1);}
   throw error;
  }
  if((r.status===408||r.status===429||r.status>=500)&&attempt<MAX_FETCH_ATTEMPTS-1){await sleep(retryDelayMs(r,attempt));return fetchJson(url,opts,attempt+1)}
  if(!r.ok)throw new Error(`HTTP_${r.status}`);
  const type=r.headers.get('content-type')||'';
  if(!type.includes('json'))throw new Error(`NON_JSON_RESPONSE:${type.slice(0,40)}`);
  return await r.json();
 }finally{clearTimeout(timer)}
}
const candidates=[],laneHealth=[];
function add(raw){const endpoint=norm(raw.endpoint_url);if(!endpoint)return;candidates.push({...raw,endpoint_url:endpoint,source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',live_external_observation:true,acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,public_release:'HOLD',production:'HOLD'});}
function lane(id,status,count,error=null){laneHealth.push({lane_id:id,status,observed_candidates:count,error,budget_action:plans[id].action,budget_multiplier:plans[id].budget_multiplier,forced_recovery_probe:Boolean(plans[id].forced_recovery_probe)})}

const oa=shape(OPENALEX);
if(!oa.scopes.length)lane(OPENALEX,'SKIPPED_PROVIDER_CIRCUIT_OPEN',0);else try{
 let count=0;for(const s of oa.scopes){const u=new URL('https://api.openalex.org/works');u.searchParams.set('search',`${s.name} collectible`);u.searchParams.set('per-page',String(oa.page));const data=await fetchJson(u,{headers:{Accept:'application/json','User-Agent':'KIDULTS-ASI-Public-Metadata-Discovery-v1'}});for(const work of data.results||[]){const locs=[work.primary_location,work.best_oa_location,...(work.locations||[]).slice(0,2)].filter(Boolean);for(const loc of locs){const endpoint=norm(loc.landing_page_url||loc.pdf_url||loc.source?.homepage_url);if(!endpoint)continue;add({candidate_id:`cand-oa-${hash((work.id||'')+endpoint+s.id)}`,discovery_provider:OPENALEX,discovery_channel:'OPEN_RESEARCH_AND_REPOSITORY_METADATA',observed_at:new Date().toISOString(),endpoint_url:endpoint,source_name:loc.source?.display_name||work.display_name||endpoint,source_owner_hint:loc.source?.host_organization_name||loc.source?.display_name||'UNKNOWN',provider_record_id:String(work.id||endpoint),scope_hint:s.id,region_hint:'GLOBAL_UNRESOLVED',metadata:{work_id:work.id||null,doi:work.doi||null,work_title:work.display_name||null,source_id:loc.source?.id||null,source_type:loc.source?.type||null,scope_name:s.name,observation_purpose:'DISCOVERY_METADATA_INDEX_ONLY'}});count++;}}await sleep(OPENALEX_PACING_MS);}lane(OPENALEX,count?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',count);
}catch(e){lane(OPENALEX,'FAILED',0,String(e?.message||e).slice(0,120))}

const gd=shape(GDELT);
if(!gd.scopes.length)lane(GDELT,'SKIPPED_PROVIDER_CIRCUIT_OPEN',0);else try{
 let count=0;for(const s of gd.scopes){const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');u.searchParams.set('query',`"${s.name}" collectible`);u.searchParams.set('mode','ArtList');u.searchParams.set('maxrecords',String(Math.max(5,gd.page*2)));u.searchParams.set('format','json');u.searchParams.set('sort','HybridRel');const data=await fetchJson(u,{headers:{Accept:'application/json','User-Agent':'KIDULTS-ASI-Public-Metadata-Discovery-v1'}});for(const article of data.articles||[]){const endpoint=norm(article.url);if(!endpoint)continue;add({candidate_id:`cand-gdelt-${hash(endpoint+s.id)}`,discovery_provider:GDELT,discovery_channel:'GLOBAL_EVENT_AND_DOMAIN_MENTION_INDEX',observed_at:new Date().toISOString(),endpoint_url:endpoint,source_name:article.title||article.domain||endpoint,source_owner_hint:article.domain||'UNKNOWN',provider_record_id:hash(endpoint+(article.seendate||'')),scope_hint:s.id,region_hint:'GLOBAL_UNRESOLVED',metadata:{domain:article.domain||null,source_country:article.sourcecountry||null,language:article.language||null,seen_date:article.seendate||null,scope_name:s.name,observation_purpose:'DISCOVERY_METADATA_INDEX_ONLY',attention_is_not_demand:true}});count++;}await sleep(GDELT_PACING_MS);}lane(GDELT,count?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',count);
}catch(e){lane(GDELT,'FAILED',0,String(e?.message||e).slice(0,120))}

const unique=new Map();for(const c of candidates){const prior=unique.get(c.endpoint_url);if(!prior)unique.set(c.endpoint_url,c);else unique.set(c.endpoint_url,{...prior,discovery_providers:[...new Set([...(prior.discovery_providers||[prior.discovery_provider]),c.discovery_provider])],scope_hints:[...new Set([...(prior.scope_hints||[prior.scope_hint]).filter(Boolean),c.scope_hint].filter(Boolean))]});}
const final=[...unique.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
const providerCounts={};for(const c of final)for(const p of c.discovery_providers||[c.discovery_provider])providerCounts[p]=(providerCounts[p]||0)+1;
const healthy=laneHealth.filter(l=>['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS'].includes(l.status)).length;
const output={id:'kidults-asi-openalex-gdelt-public-metadata-discovery-v1',version:'1.1.0',status:'SHADOW_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY_COMPLETE',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_restricted:false,scope_registry_total:32,scope_rotation_count:4,scope_rotation_index:rotation,cycle_scope_count:cycleScopes.length,cycle_scope_ids:cycleScopes.map(s=>s.id),provider_circuit_applied:Boolean(circuit),provider_circuit_cycle:circuit?.cycle_number||null,provider_budget_actions:Object.fromEntries(Object.entries(plans).map(([k,v])=>[k,{action:v.action,budget_multiplier:v.budget_multiplier,forced_recovery_probe:Boolean(v.forced_recovery_probe),rights_effect:'NONE',admission_effect:'NONE',acquisition_effect:'NONE'}])),lane_health:laneHealth,healthy_lane_count:healthy,candidate_count:final.length,live_external_candidate_count:final.length,provider_counts:providerCounts,candidates:final,rules:{multi_provider_fail_soft:true,at_least_one_independent_lane_executes:true,provider_health_controls_budget_only:true,transient_network_retry:true,retry_after_honored:true,provider_request_pacing:true,discovery_metadata_only:true,target_site_body_traversal_forbidden:true,attention_is_not_demand:true,listing_is_not_sold:true,terminal_transaction_assertion_required:true,rights_never_promoted:true,admission_never_promoted:true},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,rotation,scopes:cycleScopes.length,candidates:final.length,healthy_lanes:healthy,circuit_applied:output.provider_circuit_applied,budgets:output.provider_budget_actions,lane_health:laneHealth,production:'HOLD'},null,2));
