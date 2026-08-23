#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-openalex-gdelt-public-metadata-discovery-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-openalex-gdelt-public-metadata-discovery-v1'||x.status!=='SHADOW_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY_COMPLETE')fail('IDENTITY');
if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_restricted!==false)fail('UNIVERSE_NARROWED');
if(Number(x.scope_registry_total)!==32||Number(x.scope_rotation_count)!==4||Number(x.cycle_scope_count)!==8||!Number.isInteger(Number(x.scope_rotation_index))||Number(x.scope_rotation_index)<0||Number(x.scope_rotation_index)>3)fail('SCOPE_ROTATION');
if(!Array.isArray(x.cycle_scope_ids)||new Set(x.cycle_scope_ids).size!==8)fail('SCOPE_PARTITION');
if(!Array.isArray(x.lane_health)||x.lane_health.length!==2||Number(x.healthy_lane_count)<1)fail('LANE_HEALTH');
for(const id of ['OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA','GDELT_PUBLIC_DOMAIN_MENTION_METADATA'])if(!x.lane_health.find(l=>l.lane_id===id))fail(`LANE_MISSING:${id}`);
if(!Array.isArray(x.candidates)||x.candidates.length!==Number(x.candidate_count)||Number(x.candidate_count)<1||Number(x.live_external_candidate_count)!==Number(x.candidate_count))fail('EMPIRICAL_CANDIDATES');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
const r=x.rules||{};for(const k of ['multi_provider_fail_soft','discovery_metadata_only','target_site_body_traversal_forbidden','attention_is_not_demand','listing_is_not_sold','terminal_transaction_assertion_required','rights_never_promoted','admission_never_promoted'])if(r[k]!==true)fail(`RULE:${k}`);
const allowed=new Set(['OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA','GDELT_PUBLIC_DOMAIN_MENTION_METADATA']);const seen=new Set();
for(const c of x.candidates){
 if(!c.candidate_id||!c.endpoint_url||seen.has(c.endpoint_url))fail('CANDIDATE_IDENTITY_OR_DUPLICATE');seen.add(c.endpoint_url);
 for(const provider of c.discovery_providers||[c.discovery_provider])if(!allowed.has(provider))fail(`PROVIDER:${provider}`);
 if(!x.cycle_scope_ids.includes(c.scope_hint)&&!(c.scope_hints||[]).some(s=>x.cycle_scope_ids.includes(s)))fail('SCOPE_ESCAPE');
 if(c.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING'||c.evidence_state!=='DISCOVERY_METADATA_ONLY')fail('SELF_PROMOTION');
 if(c.acquisition_authorized!==false||c.target_site_body_crawled!==false||c.content_acquired!==false||c.provider_contacted!==false||c.account_created!==false||c.eula_accepted!==false||c.spend_authorized!==false||c.production!=='HOLD'||c.public_release!=='HOLD')fail('COMMITMENT_OR_PERMISSION_BOUNDARY');
}
const sum=Object.values(x.provider_counts||{}).reduce((a,b)=>a+Number(b||0),0);if(sum<Number(x.candidate_count))fail('PROVIDER_COUNTS');
console.log(JSON.stringify({status:'PASS',rotation:x.scope_rotation_index,scopes:x.cycle_scope_count,candidates:x.candidate_count,healthy_lanes:x.healthy_lane_count,production:'HOLD'}));
