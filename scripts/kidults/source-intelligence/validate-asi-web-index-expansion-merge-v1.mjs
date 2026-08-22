#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-global-any-site-web-index-expanded-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-global-low-risk-discovery-v1'||x.expanded_view_id!=='kidults-asi-global-any-site-web-index-expanded-v1')fail('IDENTITY');
if(x.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_boundary!=='ANY_PUBLICLY_DISCOVERABLE_SITE_OR_SOURCE_ENDPOINT'||x.source_family_restriction!==null)fail('UNIVERSE_NARROWED');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_OR_ACQUISITION_BOUNDARY');
if(x.listing_is_not_sold!==true||x.terminal_transaction_assertion_required!==true)fail('MARKET_SEMANTICS');
if(!Array.isArray(x.candidates)||x.candidates.length!==Number(x.candidate_count))fail('CANDIDATE_COUNT');
const w=x.web_index_expansion||{};
if(w.provider!=='COMMON_CRAWL_URL_INDEX'||w.metadata_index_only!==true||w.same_host_or_subdomain_only!==true||w.gate1_required!==true)fail('WEB_INDEX_CONTRACT');
if(w.ownership_asserted!==false||w.officiality_asserted!==false||w.rights_promoted!==false||w.admission_promoted!==false)fail('WEB_INDEX_SELF_PROMOTION');
if(Number(w.input_candidate_count)!==Number(w.inserted_candidate_count)+Number(w.deduplicated_candidate_count))fail('EXPANSION_PARTITION');
const lane=(x.lane_health||[]).find(y=>y.lane_id==='COMMON_CRAWL_URL_INDEX_HOST_EXPANSION');if(!lane)fail('LANE_MISSING');
const seen=new Set();let expansionObserved=0;
for(const c of x.candidates){
 if(!c.endpoint_url||seen.has(c.endpoint_url))fail('DUPLICATE_OR_MISSING_ENDPOINT');seen.add(c.endpoint_url);
 if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING')fail('CANDIDATE_SELF_PROMOTION');
 if(c.acquisition_authorized!==false||c.target_site_body_crawled!==false||c.production!=='HOLD')fail('CANDIDATE_PERMISSION_BOUNDARY');
 if(c.web_index_expansion_observed===true){
  expansionObserved++;
  if(!Array.isArray(c.web_index_expansion_lineage)||!c.web_index_expansion_lineage.length)fail('LINEAGE_MISSING');
  for(const l of c.web_index_expansion_lineage){
   if(l.kind!=='PUBLIC_WEB_INDEX_HOST_EXPANSION'||l.provider!=='COMMON_CRAWL_URL_INDEX'||l.rights_effect!=='NONE'||l.ownership_effect!=='NONE'||l.officiality_effect!=='NONE')fail('LINEAGE_BOUNDARY');
   const host=new URL(c.endpoint_url).hostname.toLowerCase(),seed=String(l.seed_host||'').toLowerCase();if(!seed||!(host===seed||host.endsWith(`.${seed}`)))fail('HOST_ESCAPE');
  }
 }
}
if(Number(w.input_candidate_count)>0&&expansionObserved<1)fail('EXPANSION_NOT_REPRESENTED');
for(const g of ['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'])if(!x.gate_chain?.includes(g))fail(`GATE_MISSING:${g}`);
console.log(JSON.stringify({status:'PASS',candidates:x.candidate_count,expansion_input:w.input_candidate_count,inserted:w.inserted_candidate_count,deduplicated:w.deduplicated_candidate_count,expansion_observed:expansionObserved,production:'HOLD'}));
