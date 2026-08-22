#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const queueDir=process.env.QUEUE_DIR||process.argv[2]||'queue';
const outputDir=process.env.DISCOVERY_OUT||process.argv[3]||'discovery-out';
fs.mkdirSync(outputDir,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(queueDir,'manifest.json'),'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const clean=s=>String(s||'').toLowerCase().replace(/<[^>]+>/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const norm=u=>{try{const x=new URL(u);if(!/^https?:$/.test(x.protocol))return null;x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
async function fetchJson(url,opts={},attempt=0){const c=new AbortController();const t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(url,{...opts,signal:c.signal});if((r.status===429||r.status>=500)&&attempt<2){await sleep(800*(2**attempt));return fetchJson(url,opts,attempt+1)}if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json()}finally{clearTimeout(t)}}

const rows=[];
for(const shard of manifest.shards){const x=JSON.parse(fs.readFileSync(path.join(queueDir,shard.file),'utf8'));for(const r of x.records||[])rows.push({...r,category_id:x.category_id});}
if(!rows.length)throw new Error('No queue rows');
const byProduct=new Map();for(const r of rows){if(!byProduct.has(r.representative_product_id))byProduct.set(r.representative_product_id,[]);byProduct.get(r.representative_product_id).push(r)}
const products=[...byProduct.entries()].map(([id,rs])=>({id,rows:rs,category_id:rs[0].category_id||'UNKNOWN',maker:rs[0].maker_or_brand||'',name:rs[0].product_name||id}));
const cycleLimit=Math.max(16,Math.min(Number(process.env.ASI_GLOBAL_PRODUCT_LIMIT||64),160));
const selected=products.slice(0,cycleLimit);
const macroregions=['NORTH_AMERICA','EUROPE','JAPAN','KOREA','GREATER_CHINA','SOUTHEAST_ASIA','OCEANIA','LATAM_MEA'];
const regionTerms={NORTH_AMERICA:'United States Canada',EUROPE:'Europe UK France Germany Italy',JAPAN:'Japan',KOREA:'South Korea',GREATER_CHINA:'China Hong Kong Taiwan',SOUTHEAST_ASIA:'Singapore Thailand Malaysia Indonesia',OCEANIA:'Australia New Zealand',LATAM_MEA:'Mexico Brazil UAE South Africa'};
const candidates=[],errors=[];
function add(c,rs){const ids=rs.map(r=>r.demand_instance_id).filter(Boolean);if(!ids.length)return;candidates.push({...c,demand_instance_ids:[...new Set(ids)],representative_product_id:rs[0].representative_product_id,market_cell_id:rs[0].market_cell_id||null,target_regions:rs[0].target_regions||[],target_languages:rs[0].target_languages||[],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,production:'HOLD'})}

for(const p of selected){const base=`${p.maker} ${p.name}`.trim();const observed_at=new Date().toISOString();
  try{const u=new URL('https://www.wikidata.org/w/api.php');for(const[k,v]of Object.entries({action:'wbsearchentities',search:base,language:'en',uselang:'en',limit:'10',format:'json',origin:'*'}))u.searchParams.set(k,v);const s=await fetchJson(u,{headers:{'User-Agent':'KIDULTS-ASI-Global-Discovery-v1'}});const ids=(s.search||[]).map(x=>x.id).filter(Boolean);if(ids.length){const e=new URL('https://www.wikidata.org/w/api.php');for(const[k,v]of Object.entries({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|claims',languages:'en',format:'json',origin:'*'}))e.searchParams.set(k,v);const d=await fetchJson(e,{headers:{'User-Agent':'KIDULTS-ASI-Global-Discovery-v1'}});for(const id of ids){const ent=d.entities?.[id];if(!ent)continue;const label=ent.labels?.en?.value||id;for(const claim of ent.claims?.P856||[]){const url=norm(claim.mainsnak?.datavalue?.value);if(url)add({candidate_id:`cand-wdsite-${hash(p.id+url)}`,discovery_provider:'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',discovery_channel:'OFFICIAL_AUTHORITY',observed_at,endpoint_url:url,source_name:label,source_owner_hint:label,provider_record_id:`${id}:P856`,category_hint:p.category_id,macroregion_hint:'UNKNOWN',legal_risk_tier:'LOW_METADATA_ONLY',commercial_risk_tier:'LOW_METADATA_ONLY',metadata:{wikidata_id:id,description:ent.descriptions?.en?.value||null}},p.rows)}}}}
  }catch(e){errors.push({provider:'WIKIDATA',product:p.id,error:e.message})}
  await sleep(120);
}

const categorySeeds=[...new Map(selected.map(p=>[p.category_id,p])).values()];
for(const p of categorySeeds){for(const region of macroregions){const q=`${p.category_id.replace(/[_-]+/g,' ')} collectibles auction dealer ${regionTerms[region]}`;try{const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',q);u.searchParams.set('format','jsonv2');u.searchParams.set('limit','5');u.searchParams.set('extratags','1');u.searchParams.set('addressdetails','1');const d=await fetchJson(u,{headers:{'User-Agent':'KIDULTS-ASI-Global-Discovery-v1 contact=operations@kidults.com','Accept-Language':'en'}});for(const item of d||[]){const site=norm(item.extratags?.website||item.extratags?.['contact:website']);if(!site)continue;const rs=p.rows;add({candidate_id:`cand-osm-${hash(region+site)}`,discovery_provider:'OPENSTREETMAP_NOMINATIM_PUBLIC_METADATA',discovery_channel:'REGIONAL_INSTITUTION_EVENT_VENUE',observed_at:new Date().toISOString(),endpoint_url:site,source_name:item.display_name||site,source_owner_hint:item.name||item.display_name||'UNKNOWN',provider_record_id:`${item.osm_type||'x'}:${item.osm_id||hash(site)}`,category_hint:p.category_id,macroregion_hint:region,legal_risk_tier:'LOW_METADATA_ONLY',commercial_risk_tier:'LOW_METADATA_ONLY',metadata:{osm_type:item.osm_type||null,osm_id:item.osm_id||null,place_rank:item.place_rank||null,country_code:item.address?.country_code||null}},rs)} }catch(e){errors.push({provider:'OPENSTREETMAP',category:p.category_id,region,error:e.message})}await sleep(1100)}}

const unique=new Map();for(const c of candidates){const key=`${c.endpoint_url}|${c.representative_product_id}`;const prev=unique.get(key);if(!prev)unique.set(key,c);else{prev.demand_instance_ids=[...new Set([...prev.demand_instance_ids,...c.demand_instance_ids])];if(prev.macroregion_hint==='UNKNOWN'&&c.macroregion_hint!=='UNKNOWN')prev.macroregion_hint=c.macroregion_hint}}
const final=[...unique.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url)||a.representative_product_id.localeCompare(b.representative_product_id));
const provider_counts=Object.fromEntries([...new Set(final.map(x=>x.discovery_provider))].map(p=>[p,final.filter(x=>x.discovery_provider===p).length]));
const region_counts=Object.fromEntries(macroregions.map(r=>[r,final.filter(x=>x.macroregion_hint===r).length]));
const category_counts=Object.fromEntries([...new Set(final.map(x=>x.category_hint))].map(c=>[c,final.filter(x=>x.category_hint===c).length]));
const output={id:'kidults-asi-global-low-risk-discovery-v1',version:'1.0.0',status:'SHADOW_GLOBAL_DISCOVERY_COMPLETE_NOT_RIGHTS_ADMITTED',design_capacity_minimum_candidates:100000,cycle_product_limit:cycleLimit,selected_products:selected.length,macroregions,discovery_providers:['WIKIDATA_OFFICIAL_WEBSITE_GRAPH','OPENSTREETMAP_NOMINATIM_PUBLIC_METADATA'],candidate_count:final.length,provider_counts,region_counts,category_counts,request_errors:errors,candidates:final,legal_commercial_gate_required:true,gate_chain:['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'],target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.writeFileSync(path.join(outputDir,'global-low-risk-discovery.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({status:output.status,products:selected.length,candidates:final.length,provider_counts,region_counts,errors:errors.length,production:'HOLD'},null,2));
