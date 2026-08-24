#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-discovery-provider-health-circuit-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.id!=='kidults-asi-discovery-provider-health-circuit-v1'||x.status!=='SHADOW_PROVIDER_HEALTH_CIRCUIT_PLAN_READY')fail('IDENTITY');
if(!Number.isInteger(Number(x.cycle_number))||Number(x.cycle_number)<1)fail('CYCLE');
if(x.production!=='HOLD'||x.public_release!=='HOLD')fail('RELEASE_BOUNDARY');
const g=x.global_next_cycle||{};if(g.must_execute_at_least_one_independent_public_metadata_lane!==true||g.canonical_registered_frontier_seed_unaffected!==true||g.provider_failure_cannot_zero_global_discovery!==true||g.discovery_may_fail_soft!==true||g.rights_and_admission_remain_fail_closed!==true)fail('GLOBAL_RECOVERY_BOUNDARY');
const r=x.rules||{};if(r.http_403_cooldown_cycles!==4||r.http_429_cooldown_cycles!==2||r.transient_failure_cooldown_cycles!==1||r.degraded_budget_multiplier!==0.5||r.half_open_probe_budget_multiplier!==0.1||r.half_open_probe_is_single_and_bounded!==true||r.success_resets_circuit!==true||r.provider_circuit_cannot_narrow_global_any_site_universe!==true||r.provider_circuit_cannot_change_rights_or_admission!==true||r.production_or_public_scope_cannot_expand!==true)fail('RULES');
if(!Array.isArray(x.providers)||x.providers.length!==Number(x.summary?.managed_provider_count)||!x.routing_directives||Object.keys(x.routing_directives).length!==x.providers.length)fail('PROVIDER_COUNT_OR_DIRECTIVES');
const actions=new Set(['FULL_DISCOVERY_BUDGET','REDUCED_DISCOVERY_BUDGET','SKIP_PROVIDER_NEXT_CYCLE','SINGLE_BOUNDED_PROBE','ON_DEMAND_ONLY']);const states=new Set(['CLOSED_HEALTHY','CLOSED_DEGRADED','OPEN_COOLDOWN','HALF_OPEN_PROBE','CLOSED_ON_DEMAND']);
let enabled=0;
for(const p of x.providers){
 if(!p.lane_id||p.lane_id==='CANONICAL_REGISTERED_FRONTIER_SEED'||!actions.has(p.next_cycle_action)||!states.has(p.state))fail('PROVIDER_CONTRACT');
 if(p.discovery_only!==true||p.rights_effect!=='NONE'||p.admission_effect!=='NONE'||p.acquisition_effect!=='NONE'||p.production!=='HOLD')fail('PROVIDER_PERMISSION_BOUNDARY');
 const b=Number(p.next_cycle_budget_multiplier);if(!Number.isFinite(b)||b<0||b>1)fail('BUDGET_MULTIPLIER');if(b>0)enabled++;
 const d=x.routing_directives[p.lane_id];if(!d||d.action!==p.next_cycle_action||Number(d.budget_multiplier)!==b||d.rights_effect!=='NONE'||d.admission_effect!=='NONE'||d.acquisition_effect!=='NONE')fail('ROUTING_DIRECTIVE_MISMATCH');
 if(p.current_status==='FAILED'&&['FULL_DISCOVERY_BUDGET','REDUCED_DISCOVERY_BUDGET'].includes(p.next_cycle_action))fail('FAILED_PROVIDER_BUDGET');
 if(String(p.current_error||'').includes('HTTP_403')&&p.state==='OPEN_COOLDOWN'&&Number(p.cooldown_cycles_remaining)>4)fail('HTTP_403_COOLDOWN');
 if(String(p.current_error||'').includes('HTTP_429')&&p.state==='OPEN_COOLDOWN'&&Number(p.cooldown_cycles_remaining)>2)fail('HTTP_429_COOLDOWN');
 if(['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS'].includes(p.current_status)&&Number(p.failed_rotation_count||0)===0&&(p.state!=='CLOSED_HEALTHY'||p.next_cycle_action!=='FULL_DISCOVERY_BUDGET'||b!==1||Number(p.cooldown_cycles_remaining)!==0))fail('SUCCESS_DID_NOT_RESET');
 if(Number(p.failed_rotation_count||0)>0&&['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS'].includes(p.current_status)&&(p.state!=='CLOSED_DEGRADED'||p.next_cycle_action!=='REDUCED_DISCOVERY_BUDGET'||b!==0.5))fail('DEGRADED_BUDGET');
 if(p.state==='HALF_OPEN_PROBE'&&(p.next_cycle_action!=='SINGLE_BOUNDED_PROBE'||b!==0.1))fail('HALF_OPEN_NOT_BOUNDED');
 if(p.state==='OPEN_COOLDOWN'&&(p.next_cycle_action!=='SKIP_PROVIDER_NEXT_CYCLE'||b!==0))fail('OPEN_CIRCUIT_BUDGET');
}
if(enabled<1)fail('AT_LEAST_ONE_INDEPENDENT_LANE_REQUIRED');
if(Number(x.summary?.enabled_or_probe_provider_count)!==enabled)fail('ENABLED_SUMMARY');
if(x.summary?.all_provider_circuits_open===true)fail('ALL_PROVIDER_CIRCUITS_CANNOT_REMAIN_OPEN');
console.log(JSON.stringify({status:'PASS',cycle:x.cycle_number,providers:x.providers.length,full:x.summary.full_budget_provider_count,reduced:x.summary.reduced_budget_provider_count,open:x.summary.open_circuit_count,half_open:x.summary.half_open_probe_count,mode:g.mode,production:'HOLD'}));
