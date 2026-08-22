#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-global-low-risk-discovery-v1')fail('id mismatch');
if(x.status!=='SHADOW_GLOBAL_DISCOVERY_COMPLETE_NOT_RIGHTS_ADMITTED')fail('status mismatch');
if(Number(x.design_capacity_minimum_candidates)<100000)fail('design capacity below 100k');
if(!Array.isArray(x.macroregions)||x.macroregions.length!==8)fail('8 macroregions required');
for(const p of ['WIKIDATA_OFFICIAL_WEBSITE_GRAPH','OPENSTREETMAP_NOMINATIM_PUBLIC_METADATA'])if(!x.discovery_providers?.includes(p))fail(`provider missing ${p}`);
if(x.target_site_body_crawled!==false||x.content_acquired!==false||x.acquisition_authorized!==false)fail('discovery crossed acquisition boundary');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('Production/Public must HOLD');
const gates=['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'];
for(const g of gates)if(!x.gate_chain?.includes(g))fail(`gate missing ${g}`);
for(const c of x.candidates||[]){
 if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING')fail('candidate self-promoted');
 if(c.evidence_state!=='DISCOVERY_METADATA_ONLY'||c.acquisition_authorized!==false||c.target_site_body_crawled!==false)fail('candidate crossed evidence/acquisition boundary');
 if(c.provider_contacted!==false||c.account_created!==false||c.eula_accepted!==false||c.spend_authorized!==false)fail('external commitment occurred');
 if(!c.endpoint_url||!c.discovery_provider||!c.discovery_channel)fail('candidate provenance incomplete');
}
console.log(JSON.stringify({status:'PASS',candidates:x.candidate_count,providers:x.provider_counts,regions:x.region_counts,production:x.production},null,2));
