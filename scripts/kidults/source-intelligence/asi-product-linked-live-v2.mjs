#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const queueDir = process.env.QUEUE_DIR || process.argv[2] || 'queue';
const outputDir = process.env.DISCOVERY_OUT || process.argv[3] || 'discovery-out';
fs.mkdirSync(outputDir,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(queueDir,'manifest.json'),'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=u=>{try{const x=new URL(u);x.hash='';return x.toString().replace(/\/$/,'')}catch{return null}};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
async function fetchJson(url,opts={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{...opts,signal:c.signal});if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.json()}finally{clearTimeout(t)}}

const wanted=new Set(['IDENTITY','AUTHENTICITY','SOLD_TRANSACTION']);
const products=[];
for(const shard of manifest.shards){
  const p=JSON.parse(fs.readFileSync(path.join(queueDir,shard.file),'utf8'));
  const byProduct=new Map();
  for(const r of p.records){if(wanted.has(r.evidence_gap_class)){if(!byProduct.has(r.representative_product_id))byProduct.set(r.representative_product_id,[]);byProduct.get(r.representative_product_id).push(r)}}
  const chosen=[...byProduct.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(0,2);
  for(const [id,rows] of chosen) products.push({id,category_id:p.category_id,rows:rows.sort((a,b)=>a.evidence_gap_class.localeCompare(b.evidence_gap_class))});
}
if(products.length!==16)throw new Error(`Expected 16 products, got ${products.length}`);
const lanes=products.flatMap(x=>x.rows);
if(lanes.length!==48)throw new Error(`Expected 48 demand lanes, got ${lanes.length}`);

const candidates=[];const errors=[];
function attach(productRows, candidate){
  const roles=new Set(candidate.candidate_source_roles);
  const demandRows=productRows.filter(r=>r.required_source_roles.some(role=>roles.has(role)));
  if(!demandRows.length)return;
  candidates.push({...candidate,demand_instance_ids:demandRows.map(r=>r.demand_instance_id),representative_product_id:demandRows[0].representative_product_id,market_cell_id:demandRows[0].market_cell_id,target_regions:demandRows[0].target_regions,target_languages:demandRows[0].target_languages,decision_traceability:demandRows.map(r=>({demand_instance_id:r.demand_instance_id,...r.decision_traceability})),irreplaceable_value_traceability:demandRows.map(r=>({demand_instance_id:r.demand_instance_id,...r.irreplaceable_value_traceability})),acquisition_authorized:false,production:'HOLD'});
}

for(const product of products){
  const r=product.rows[0]; const query=`${r.maker_or_brand} ${r.product_name}`.trim(); const observed_at=new Date().toISOString();
  try{
    const u=new URL('https://www.wikidata.org/w/api.php');
    for(const [k,v] of Object.entries({action:'wbsearchentities',search:query,language:'en',uselang:'en',limit:'3',format:'json',origin:'*'}))u.searchParams.set(k,v);
    const s=await fetchJson(u,{headers:{'User-Agent':'KIDULTS-AGCI-OS-Product-Discovery-v2'}}); const ids=(s.search||[]).map(x=>x.id).filter(Boolean);
    if(ids.length){
      const e=new URL('https://www.wikidata.org/w/api.php');
      for(const [k,v] of Object.entries({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|claims',languages:'en',format:'json',origin:'*'}))e.searchParams.set(k,v);
      const d=await fetchJson(e,{headers:{'User-Agent':'KIDULTS-AGCI-OS-Product-Discovery-v2'}});
      for(const id of ids){const ent=d.entities?.[id];if(!ent)continue;const label=ent.labels?.en?.value||id;const desc=ent.descriptions?.en?.value||'';attach(product.rows,{candidate_id:`cand-wd-${hash(product.id+id)}`,discovery_provider:'WIKIDATA_ACTION_API',observed_at,query,provider_record_id:id,endpoint_url:`https://www.wikidata.org/wiki/${id}`,source_name:label,owner:'Wikidata',source_family_hint:'WIKIDATA_KNOWLEDGE_GRAPH',channel_type_hint:'WIKIDATA_ENTITY_RECORD',candidate_source_roles:['CATALOG_REFERENCE','INDEPENDENT_VERIFICATION'],metadata:{description:desc}});for(const claim of ent.claims?.P856||[]){const url=norm(claim.mainsnak?.datavalue?.value);if(url)attach(product.rows,{candidate_id:`cand-wdsite-${hash(product.id+url)}`,discovery_provider:'WIKIDATA_OFFICIAL_WEBSITE_CLAIM',observed_at,query,provider_record_id:`${id}:P856`,endpoint_url:url,source_name:`${label} official website candidate`,owner:label,source_family_hint:`OFFICIAL_ENTITY:${id}`,channel_type_hint:'OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA',candidate_source_roles:['PRIMARY_AUTHORITY'],metadata:{wikidata_id:id}})}}
    }
  }catch(e){errors.push({provider:'WIKIDATA',representative_product_id:product.id,error:e.message})}
  await sleep(120);
  try{
    const u=new URL('https://api.datacite.org/dois');u.searchParams.set('query',query);u.searchParams.set('page[size]','5');
    const d=await fetchJson(u,{headers:{Accept:'application/vnd.api+json','User-Agent':'KIDULTS-AGCI-OS-Product-Discovery-v2'}});
    for(const item of d.data||[]){const a=item.attributes||{};const url=norm(a.url||`https://doi.org/${a.doi||item.id}`);if(!url)continue;attach(product.rows,{candidate_id:`cand-dc-${hash(product.id+(a.doi||item.id))}`,discovery_provider:'DATACITE_DOI_METADATA',observed_at,query,provider_record_id:a.doi||item.id,endpoint_url:url,source_name:a.titles?.[0]?.title||a.doi||item.id,owner:a.publisher||a.clientId||'UNKNOWN',source_family_hint:`DATACITE_CLIENT:${a.clientId||a.publisher||'UNKNOWN'}`,channel_type_hint:'DATACITE_RESEARCH_OR_DATASET',candidate_source_roles:['CATALOG_REFERENCE','INDEPENDENT_VERIFICATION'],metadata:{publisher:a.publisher||null,rights_list:a.rightsList||[],publication_year:a.publicationYear||null}})}
  }catch(e){errors.push({provider:'DATACITE',representative_product_id:product.id,error:e.message})}
  await sleep(120);
}

const unique=new Map();for(const c of candidates){const k=`${c.endpoint_url}|${c.representative_product_id}`;const prev=unique.get(k);if(!prev)unique.set(k,c);else{prev.demand_instance_ids=[...new Set([...prev.demand_instance_ids,...c.demand_instance_ids])];prev.candidate_source_roles=[...new Set([...prev.candidate_source_roles,...c.candidate_source_roles])]}}
const final=[...unique.values()].sort((a,b)=>a.representative_product_id.localeCompare(b.representative_product_id)||a.endpoint_url.localeCompare(b.endpoint_url));
const coverage=lanes.map(r=>{const cs=final.filter(c=>c.demand_instance_ids.includes(r.demand_instance_id));const roles=[...new Set(cs.flatMap(c=>c.candidate_source_roles))];return{demand_instance_id:r.demand_instance_id,representative_product_id:r.representative_product_id,evidence_gap_class:r.evidence_gap_class,required_source_roles:r.required_source_roles,candidate_count:cs.length,candidate_roles_observed:roles,missing_required_roles:r.required_source_roles.filter(x=>!roles.includes(x)),state:cs.length?'CANDIDATES_OBSERVED_NOT_QUALIFIED':'GAP_NO_CANDIDATE_OBSERVED'}});
const output={id:'kidults-product-linked-bounded-live-discovery-pilot-v2',version:'2.0.0',status:'BOUNDED_LIVE_DISCOVERY_COMPLETE_NOT_QUALIFIED',pilot_products:16,pilot_demand_lanes:48,generic_github_repository_discovery:false,provider_counts:Object.fromEntries([...new Set(final.map(x=>x.discovery_provider))].map(p=>[p,final.filter(x=>x.discovery_provider===p).length])),candidate_count:final.length,lanes_with_candidates:coverage.filter(x=>x.candidate_count>0).length,lanes_with_no_candidates:coverage.filter(x=>x.candidate_count===0).length,request_errors:errors,candidates:final,coverage,north_star:{autonomous:'PASS',global_empirical:'PENDING_CANDIDATE_COVERAGE_AND_QUALIFICATION',irreplaceable_value:'PASS'},content_acquired:false,acquisition_authorized:false,production:'HOLD'};
fs.writeFileSync(path.join(outputDir,'bounded-live-discovery.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({products:16,lanes:48,candidates:final.length,lanes_with_candidates:output.lanes_with_candidates,lanes_with_no_candidates:output.lanes_with_no_candidates,provider_counts:output.provider_counts,errors:errors.length,north_star:output.north_star},null,2));
