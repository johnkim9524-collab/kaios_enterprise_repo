#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const queueDir=process.env.QUEUE_DIR||process.argv[2]||'queue';
const outputDir=process.env.DISCOVERY_OUT||process.argv[3]||'discovery-out';
fs.mkdirSync(outputDir,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(queueDir,'manifest.json'),'utf8'));
const scopeRegistry=JSON.parse(fs.readFileSync('coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json','utf8'));
const seedPath='coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const norm=u=>{try{const x=new URL(String(u||''));if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
async function fetchJson(url,opts={},attempt=0){const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);try{const r=await fetch(url,{...opts,signal:c.signal});if((r.status===429||r.status>=500)&&attempt<2){await sleep(700*(2**attempt));return fetchJson(url,opts,attempt+1)}if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.json()}finally{clearTimeout(t)}}

const rows=[];
for(const shard of manifest.shards){const x=JSON.parse(fs.readFileSync(path.join(queueDir,shard.file),'utf8'));for(const r of x.records||[])rows.push({...r,category_id:x.category_id})}
if(!rows.length)throw new Error('No governed queue rows');
const demandIds=[...new Set(rows.map(r=>r.demand_instance_id).filter(Boolean))];
const macroregions=['NORTH_AMERICA','EUROPE','JAPAN','KOREA','GREATER_CHINA','SOUTHEAST_ASIA','OCEANIA','LATAM_MEA'];
const scopeNames=(scopeRegistry.scopes||[]).map(s=>({id:s.scope_id,name:s.name,domain:s.domain})).filter(s=>s.id&&s.name);
const candidates=[],laneHealth=[];
function add(c){const url=norm(c.endpoint_url);if(!url)return;candidates.push({...c,endpoint_url:url,source_family_hint:c.source_family_hint||'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:c.candidate_source_roles||['UNCLASSIFIED_PENDING_RELEVANCE'],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,production:'HOLD'})}
function lane(id,status,observed,error=null){laneHealth.push({lane_id:id,status,observed_candidates:observed,error})}

// Lane 0: canonical registered frontier seeds. Bootstrap only; never treated as live verification or rights clearance.
try{
 const lines=fs.readFileSync(seedPath,'utf8').trim().split(/\r?\n/);const header=lines.shift().split('|');let n=0;
 for(const line of lines){const vals=line.split('|');const r=Object.fromEntries(header.map((h,i)=>[h,vals[i]||'']));const url=norm(r.official_endpoint);if(!url)continue;add({candidate_id:`cand-seed-${hash(r.source_id+url)}`,discovery_provider:'CANONICAL_REGISTERED_FRONTIER_SEED',discovery_channel:'APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER',observed_at:new Date().toISOString(),endpoint_url:url,source_name:r.display_name||r.source_id,source_owner_hint:r.display_name||'UNKNOWN',provider_record_id:r.source_id,scope_hint:r.collection_scope_ids||null,source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:(r.source_roles||'').split(';').filter(Boolean),bootstrap_seed_only:true,live_external_observation:false,metadata:{authority_basis:r.authority_basis||null,channel_type:r.channel_type||null,access_mode:r.access_mode||null,documentation_url:r.official_documentation_url||null}});n++}
 lane('CANONICAL_REGISTERED_FRONTIER_SEED','SUCCESS_WITH_RESULTS',n);
}catch(e){lane('CANONICAL_REGISTERED_FRONTIER_SEED','FAILED',0,e.message)}

// Lane 1: GitHub public repository metadata. Homepage URLs become any-site candidates; repository content is not used as market truth.
try{
 let n=0;const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
 for(const s of scopeNames.slice(0,16)){
  const u=new URL('https://api.github.com/search/repositories');u.searchParams.set('q',`${s.name} collectibles`);u.searchParams.set('per_page','8');
  const headers={'Accept':'application/vnd.github+json','User-Agent':'KIDULTS-ASI-Any-Site-Discovery-v2','X-GitHub-Api-Version':'2022-11-28'};if(token)headers.Authorization=`Bearer ${token}`;
  const d=await fetchJson(u,{headers});
  for(const item of d.items||[]){const site=norm(item.homepage);if(!site)continue;add({candidate_id:`cand-gh-${hash(item.id+site)}`,discovery_provider:'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',discovery_channel:'OPEN_STRUCTURED_DATA',observed_at:new Date().toISOString(),endpoint_url:site,source_name:item.full_name||site,source_owner_hint:item.owner?.login||'UNKNOWN',provider_record_id:String(item.id),scope_hint:s.id,universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',live_external_observation:true,metadata:{repository_url:item.html_url||null,description:item.description||null,scope_name:s.name}});n++}
  await sleep(80);
 }
 lane('GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',n?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',n);
}catch(e){lane('GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA','FAILED',0,e.message)}

// Lane 2: DataCite open metadata. Landing URLs are candidate endpoints only.
try{
 let n=0;
 for(const s of scopeNames.slice(0,16)){
  const u=new URL('https://api.datacite.org/dois');u.searchParams.set('query',s.name);u.searchParams.set('page[size]','8');
  const d=await fetchJson(u,{headers:{Accept:'application/vnd.api+json','User-Agent':'KIDULTS-ASI-Any-Site-Discovery-v2'}});
  for(const item of d.data||[]){const a=item.attributes||{};const site=norm(a.url||`https://doi.org/${a.doi||item.id}`);if(!site)continue;add({candidate_id:`cand-dc-${hash((a.doi||item.id)+site)}`,discovery_provider:'DATACITE_OPEN_RESEARCH_METADATA',discovery_channel:'OPEN_STRUCTURED_DATA',observed_at:new Date().toISOString(),endpoint_url:site,source_name:a.titles?.[0]?.title||a.doi||item.id,source_owner_hint:a.publisher||a.clientId||'UNKNOWN',provider_record_id:a.doi||item.id,scope_hint:s.id,universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',live_external_observation:true,metadata:{publisher:a.publisher||null,rights_list:a.rightsList||[],scope_name:s.name}});n++}
  await sleep(70);
 }
 lane('DATACITE_OPEN_RESEARCH_METADATA',n?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',n);
}catch(e){lane('DATACITE_OPEN_RESEARCH_METADATA','FAILED',0,e.message)}

// Lane 3: Wikidata official website graph with simple scope-name queries, not region-heavy keyword combinations.
try{
 let n=0;
 for(const s of scopeNames){
  const u=new URL('https://www.wikidata.org/w/api.php');for(const[k,v]of Object.entries({action:'wbsearchentities',search:s.name,language:'en',uselang:'en',limit:'6',format:'json',origin:'*'}))u.searchParams.set(k,v);
  const sr=await fetchJson(u,{headers:{'User-Agent':'KIDULTS-ASI-Any-Site-Discovery-v2'}});const ids=(sr.search||[]).map(x=>x.id).filter(Boolean);if(!ids.length)continue;
  const e=new URL('https://www.wikidata.org/w/api.php');for(const[k,v]of Object.entries({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|claims',languages:'en',format:'json',origin:'*'}))e.searchParams.set(k,v);
  const d=await fetchJson(e,{headers:{'User-Agent':'KIDULTS-ASI-Any-Site-Discovery-v2'}});
  for(const id of ids){const ent=d.entities?.[id];if(!ent)continue;for(const claim of ent.claims?.P856||[]){const site=norm(claim.mainsnak?.datavalue?.value);if(!site)continue;add({candidate_id:`cand-wd-${hash(id+site)}`,discovery_provider:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',discovery_channel:'OPEN_STRUCTURED_DATA',observed_at:new Date().toISOString(),endpoint_url:site,source_name:ent.labels?.en?.value||id,source_owner_hint:ent.labels?.en?.value||'UNKNOWN',provider_record_id:`${id}:P856`,scope_hint:s.id,universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',live_external_observation:true,metadata:{wikidata_id:id,description:ent.descriptions?.en?.value||null,scope_name:s.name}});n++}}
  await sleep(80);
 }
 lane('WIKIDATA_OFFICIAL_WEBSITE_GRAPH',n?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS',n);
}catch(e){lane('WIKIDATA_OFFICIAL_WEBSITE_GRAPH','FAILED',0,e.message)}

const unique=new Map();for(const c of candidates){const key=c.endpoint_url;const prev=unique.get(key);if(!prev)unique.set(key,c);else{prev.discovery_providers=[...new Set([...(prev.discovery_providers||[prev.discovery_provider]),c.discovery_provider])];prev.scope_hints=[...new Set([...(prev.scope_hints||[prev.scope_hint]).filter(Boolean),c.scope_hint].filter(Boolean))];prev.live_external_observation=Boolean(prev.live_external_observation||c.live_external_observation)}}
const final=[...unique.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
const liveFinal=final.filter(c=>c.live_external_observation===true);
const providerCounts={};for(const c of final){for(const p of c.discovery_providers||[c.discovery_provider])providerCounts[p]=(providerCounts[p]||0)+1}
const healthyLiveLanes=laneHealth.filter(x=>x.status==='SUCCESS_WITH_RESULTS'&&x.lane_id!=='CANONICAL_REGISTERED_FRONTIER_SEED').length;
const output={id:'kidults-asi-global-low-risk-discovery-v1',version:'3.0.0',status:'SHADOW_GLOBAL_ANY_SITE_DISCOVERY_COMPLETE_NOT_RIGHTS_ADMITTED',primary_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_boundary:'ANY_PUBLICLY_DISCOVERABLE_SITE_OR_SOURCE_ENDPOINT',source_family_restriction:null,design_capacity_minimum_candidates:100000,scope_count:scopeNames.length,macroregions,discovery_strategy:'MULTI_LANE_FAIL_SOFT_DISCOVERY_FAIL_CLOSED_ADMISSION',lane_health:laneHealth,healthy_live_lanes:healthyLiveLanes,candidate_count:final.length,live_external_candidate_count:liveFinal.length,provider_counts:providerCounts,candidates:final,demand_rows:demandIds.length,listing_is_not_sold:true,terminal_transaction_assertion_required:true,legal_commercial_gate_required:true,gate_chain:['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'],target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.writeFileSync(path.join(outputDir,'global-low-risk-discovery.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,target:output.primary_target,candidates:output.candidate_count,live_external_candidates:output.live_external_candidate_count,healthy_live_lanes:output.healthy_live_lanes,lane_health:laneHealth,production:'HOLD'},null,2));
