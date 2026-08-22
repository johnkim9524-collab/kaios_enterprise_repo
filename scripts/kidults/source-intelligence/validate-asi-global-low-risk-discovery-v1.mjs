#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-global-low-risk-discovery-v1')fail('id mismatch');
if(x.status!=='SHADOW_GLOBAL_ANY_SITE_DISCOVERY_COMPLETE_NOT_RIGHTS_ADMITTED')fail('status mismatch');
if(x.primary_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE')fail('primary target mismatch');
if(x.universe_boundary!=='ANY_PUBLICLY_DISCOVERABLE_SITE_OR_SOURCE_ENDPOINT')fail('universe boundary narrowed');
if(x.source_family_restriction!==null)fail('source family restriction must be null');
if(Number(x.design_capacity_minimum_candidates)<100000)fail('design capacity below 100k');
if(x.discovery_strategy!=='MULTI_LANE_FAIL_SOFT_DISCOVERY_FAIL_CLOSED_ADMISSION')fail('discovery/admission strategy mismatch');
if(x.baseline_discovery_executed!==true)fail('baseline discovery removed');
if(!Array.isArray(x.lane_health)||x.lane_health.length<5)fail('insufficient discovery lanes');
if(Number(x.candidate_count||0)<1)fail('no discovered candidates');
if(Number(x.live_external_candidate_count||0)<1)fail('no live external candidate observed');
if(Number(x.healthy_live_lanes||0)<1)fail('no live discovery lane produced candidates');
if(Number(x.demand_rows||0)<1280)fail('governed demand binding incomplete');
if(x.listing_is_not_sold!==true||x.terminal_transaction_assertion_required!==true)fail('market semantics weakened');
if(x.target_site_body_crawled!==false||x.content_acquired!==false||x.acquisition_authorized!==false)fail('discovery crossed acquisition boundary');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('Production/Public must HOLD');
const gates=['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'];for(const g of gates)if(!x.gate_chain?.includes(g))fail(`gate missing ${g}`);
if(!Number.isInteger(Number(x.supplemental_query_count))||Number(x.supplemental_query_count)<0||Number(x.supplemental_query_count)>12)fail('supplemental query budget');
if(x.source_family_gap_intent_applied===true){
 if(x.source_family_gap_intent_id!=='kidults-asi-source-family-discovery-intent-v1')fail('intent identity');
 if(Number(x.supplemental_query_count)<1)fail('intent marked applied without queries');
 if(!Array.isArray(x.source_family_gap_target_families)||x.source_family_gap_target_families.includes('UNCLASSIFIED_ANY_SITE_CANDIDATE'))fail('invalid family targets');
}
const baselineLane=x.lane_health.find(l=>l.lane_id==='GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA');if(!baselineLane)fail('baseline github lane missing');
const supplementLane=x.lane_health.find(l=>l.lane_id==='GITHUB_SOURCE_FAMILY_GAP_SUPPLEMENT');if(!supplementLane)fail('supplement lane missing');
for(const c of x.candidates||[]){
 if(c.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE')fail('candidate family narrowed before relevance classification');
 if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING')fail('candidate self-promoted');
 if(c.evidence_state!=='DISCOVERY_METADATA_ONLY'||c.acquisition_authorized!==false||c.target_site_body_crawled!==false)fail('candidate crossed acquisition boundary');
 if(c.provider_contacted!==false||c.account_created!==false||c.eula_accepted!==false||c.spend_authorized!==false)fail('external commitment occurred');
 if(!c.endpoint_url||!c.discovery_provider)fail('candidate provenance incomplete');
 if(c.supplemental_discovery_intent===true&&c.discovery_intent_family_hint==='UNCLASSIFIED_ANY_SITE_CANDIDATE')fail('unclassified targeted');
}
console.log(JSON.stringify({status:'PASS',target:x.primary_target,candidates:x.candidate_count,live_external_candidates:x.live_external_candidate_count,healthy_live_lanes:x.healthy_live_lanes,source_family_gap_intent_applied:x.source_family_gap_intent_applied,supplemental_query_count:x.supplemental_query_count,lane_health:x.lane_health,production:x.production},null,2));
