#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-openalex-gdelt-public-metadata-discovery-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
const source=fs.readFileSync('scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs','utf8');
const attempts=Number(source.match(/const MAX_FETCH_ATTEMPTS=(\d+)/)?.[1]||0);
const oaPacing=Number(source.match(/const OPENALEX_PACING_MS=(\d+)/)?.[1]||0);
const gdeltPacing=Number(source.match(/const GDELT_PACING_MS=(\d+)/)?.[1]||0);
const p0bDiagnostic=process.argv.includes('--allow-provider-unavailability')||process.env.GITHUB_WORKFLOW==='KIDULTS ASI P0B Bounded Discovery Candidates v1';
if(attempts<4)fail('RESILIENCE_FETCH_ATTEMPTS');
if(oaPacing<500||gdeltPacing<400)fail('RESILIENCE_PROVIDER_PACING');
if(!source.includes("headers?.get?.('retry-after')")||!source.includes('r.status===408||r.status===429||r.status>=500'))fail('RESILIENCE_HTTP_RETRY');
if(!/catch\(error\)\{[\s\S]*attempt<MAX_FETCH_ATTEMPTS-1[\s\S]*fetchJson\(url,opts,attempt\+1\)/.test(source))fail('RESILIENCE_TRANSPORT_RETRY');
if(!source.includes("GITHUB_WORKFLOW==='KIDULTS ASI P0B Bounded Discovery Candidates v1'")||!source.includes('provider_health_circuit_writeback:true')||!source.includes('failed_provider_full_budget_forbidden:true'))fail('P0B_PROVIDER_CIRCUIT_REGRESSION');
if(x.id!=='kidults-asi-openalex-gdelt-public-metadata-discovery-v1'||x.status!=='SHADOW_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY_COMPLETE')fail('IDENTITY');
if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_restricted!==false)fail('UNIVERSE_NARROWED');
if(Number(x.scope_registry_total)!==32||Number(x.scope_rotation_count)!==4||Number(x.cycle_scope_count)!==8||!Number.isInteger(Number(x.scope_rotation_index))||Number(x.scope_rotation_index)<0||Number(x.scope_rotation_index)>3)fail('SCOPE_ROTATION');
if(!Array.isArray(x.cycle_scope_ids)||new Set(x.cycle_scope_ids).size!==8)fail('SCOPE_PARTITION');
if(!Array.isArray(x.lane_health)||x.lane_health.length!==2||!Number.isInteger(Number(x.healthy_lane_count))||Number(x.healthy_lane_count)<0||Number(x.healthy_lane_count)>2)fail('LANE_HEALTH_SHAPE');
if(!p0bDiagnostic&&Number(x.healthy_lane_count)<1)fail('LANE_HEALTH');
const ids=['OPENALEX_PUBLIC_WORK_AND_SOURCE_METADATA','GDELT_PUBLIC_DOMAIN_MENTION_METADATA'];for(const id of ids)if(!x.lane_health.find(l=>l.lane_id===id))fail(`LANE_MISSING:${id}`);
if(!x.provider_budget_actions||Object.keys(x.provider_budget_actions).length!==2)fail('BUDGET_ACTIONS');
const actions=new Set(['FULL_DISCOVERY_BUDGET','REDUCED_DISCOVERY_BUDGET','SKIP_PROVIDER_NEXT_CYCLE','SINGLE_BOUNDED_PROBE','ON_DEMAND_ONLY']);let enabled=0;
for(const id of ids){const a=x.provider_budget_actions[id];if(!a||!actions.has(a.action)||Number(a.budget_multiplier)<0||Number(a.budget_multiplier)>1||a.rights_effect!=='NONE'||a.admission_effect!=='NONE'||a.acquisition_effect!=='NONE')fail(`BUDGET_BOUNDARY:${id}`);if(Number(a.budget_multiplier)>0)enabled++;const lane=x.lane_health.find(l=>l.lane_id===id);if(lane.budget_action!==a.action||Number(lane.budget_multiplier)!==Number(a.budget_multiplier))fail(`LANE_BUDGET_MISMATCH:${id}`);if(a.action==='SKIP_PROVIDER_NEXT_CYCLE'&&lane.status!=='SKIPPED_PROVIDER_CIRCUIT_OPEN')fail(`SKIP_NOT_APPLIED:${id}`);}
if(enabled<1)fail('AT_LEAST_ONE_INDEPENDENT_LANE_REQUIRED');
if(!Array.isArray(x.candidates)||x.candidates.length!==Number(x.candidate_count)||Number(x.candidate_count)<0||Number(x.live_external_candidate_count)!==Number(x.candidate_count))fail('CANDIDATE_SHAPE');
if(!p0bDiagnostic&&Number(x.candidate_count)<1)fail('EMPIRICAL_CANDIDATES');
if(Number(x.candidate_count)>0&&Number(x.healthy_lane_count)<1)fail('CANDIDATE_WITHOUT_HEALTHY_LANE');
if(x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false||x.content_acquired!==false||x.target_site_body_crawled!==false)fail('RELEASE_BOUNDARY');
const r=x.rules||{};for(const k of ['multi_provider_fail_soft','at_least_one_independent_lane_executes','provider_health_controls_budget_only','provider_health_circuit_writeback','transient_network_retry','retry_after_honored','provider_request_pacing','discovery_metadata_only','target_site_body_traversal_forbidden','attention_is_not_demand','listing_is_not_sold','terminal_transaction_assertion_required','rights_never_promoted','admission_never_promoted'])if(r[k]!==true)fail(`RULE:${k}`);
if(p0bDiagnostic){
 if(x.provider_circuit_writeback_applied!==true)fail('P0B_CIRCUIT_WRITEBACK_NOT_APPLIED');
 if(!x.next_provider_budget_actions||Object.keys(x.next_provider_budget_actions).length!==2)fail('P0B_NEXT_BUDGET_ACTIONS');
 let nextEnabled=0;
 for(const id of ids){
  const n=x.next_provider_budget_actions[id];const lane=x.lane_health.find(l=>l.lane_id===id);
  if(!n||!actions.has(n.action)||Number(n.budget_multiplier)<0||Number(n.budget_multiplier)>1||n.rights_effect!=='NONE'||n.admission_effect!=='NONE'||n.acquisition_effect!=='NONE')fail(`P0B_NEXT_BUDGET_BOUNDARY:${id}`);
  if(Number(n.budget_multiplier)>0)nextEnabled++;
  if(lane.status==='FAILED'&&['FULL_DISCOVERY_BUDGET','REDUCED_DISCOVERY_BUDGET'].includes(n.action))fail(`P0B_FAILED_PROVIDER_FULL_BUDGET:${id}`);
  if(String(lane.error||'').includes('HTTP_429')&&n.action==='SKIP_PROVIDER_NEXT_CYCLE'&&Number(n.cooldown_cycles_remaining)>2)fail(`P0B_429_COOLDOWN:${id}`);
  if(String(lane.error||'').includes('HTTP_403')&&n.action==='SKIP_PROVIDER_NEXT_CYCLE'&&Number(n.cooldown_cycles_remaining)>4)fail(`P0B_403_COOLDOWN:${id}`);
 }
 if(nextEnabled<1)fail('P0B_BOUNDED_RECOVERY_PROBE_MISSING');
}
const allowed=new Set(ids);const seen=new Set();
for(const c of x.candidates){
 if(!c.candidate_id||!c.endpoint_url||seen.has(c.endpoint_url))fail('CANDIDATE_IDENTITY_OR_DUPLICATE');seen.add(c.endpoint_url);
 for(const provider of c.discovery_providers||[c.discovery_provider])if(!allowed.has(provider))fail(`PROVIDER:${provider}`);
 if(!x.cycle_scope_ids.includes(c.scope_hint)&&!(c.scope_hints||[]).some(s=>x.cycle_scope_ids.includes(s)))fail('SCOPE_ESCAPE');
 if(c.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE'||c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.gate_1_state!=='PENDING'||c.evidence_state!=='DISCOVERY_METADATA_ONLY')fail('SELF_PROMOTION');
 if(c.acquisition_authorized!==false||c.target_site_body_crawled!==false||c.content_acquired!==false||c.provider_contacted!==false||c.account_created!==false||c.eula_accepted!==false||c.spend_authorized!==false||c.production!=='HOLD'||c.public_release!=='HOLD')fail('COMMITMENT_OR_PERMISSION_BOUNDARY');
}
const sum=Object.values(x.provider_counts||{}).reduce((a,b)=>a+Number(b||0),0);if(sum<Number(x.candidate_count))fail('PROVIDER_COUNTS');
const diagnosticOnly=p0bDiagnostic&&(Number(x.healthy_lane_count)<1||Number(x.candidate_count)<1);
console.log(JSON.stringify({status:diagnosticOnly?'PASS_STRUCTURAL_PROVIDER_UNAVAILABLE':'PASS',promotion_eligible:!diagnosticOnly,rotation:x.scope_rotation_index,scopes:x.cycle_scope_count,candidates:x.candidate_count,healthy_lanes:x.healthy_lane_count,circuit_applied:x.provider_circuit_applied,circuit_writeback:x.provider_circuit_writeback_applied,evidence_admission:'NONE',public_release:'HOLD',production:'HOLD'}));
