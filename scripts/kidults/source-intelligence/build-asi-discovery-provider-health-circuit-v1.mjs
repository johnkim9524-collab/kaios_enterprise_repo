#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const discoveryPath=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const previousPath=process.argv[3]||'/tmp/previous-asi-discovery-provider-health-circuit-v1.json';
const out=process.argv[4]||'/tmp/asi-discovery-provider-health-circuit-v1.json';
const d=JSON.parse(fs.readFileSync(discoveryPath,'utf8'));
let previous={};if(fs.existsSync(previousPath)){try{previous=JSON.parse(fs.readFileSync(previousPath,'utf8'))}catch{}}
const prior=new Map((previous.providers||[]).map(x=>[x.lane_id,x]));
const success=new Set(['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS']);
const neutral=new Set(['SKIPPED_NO_VALID_INTENT','SKIPPED_NO_GITHUB_DIRECTIVES','SKIPPED_NO_DATACITE_DIRECTIVES','SKIPPED_NOT_TARGETED']);
const classify=e=>{const t=String(e||'').toUpperCase();if(t.includes('HTTP_403'))return{kind:'AUTH_OR_RATE_POLICY_403',cooldown:4};if(t.includes('HTTP_429'))return{kind:'RATE_LIMIT_429',cooldown:2};if(t.includes('TIMEOUT')||t.includes('ABORT'))return{kind:'TRANSIENT_TIMEOUT',cooldown:1};if(t.includes('HTTP_5'))return{kind:'UPSTREAM_5XX',cooldown:1};return{kind:'OTHER_FAILURE',cooldown:1}};
const providers=[];
for(const lane of d.lane_health||[]){
 if(lane.lane_id==='CANONICAL_REGISTERED_FRONTIER_SEED')continue;
 const p=prior.get(lane.lane_id)||{};let state,action,cooldown=0,failureClass=null,reason;
 if(success.has(lane.status)){
  state='CLOSED_HEALTHY';action='FULL_DISCOVERY_BUDGET';reason='CURRENT_CYCLE_HEALTHY';
 }else if(neutral.has(lane.status)){
  state='CLOSED_ON_DEMAND';action='ON_DEMAND_ONLY';reason='NOT_SCHEDULED_OR_NOT_TARGETED';
 }else if(lane.status==='FAILED'){
  const f=classify(lane.error);failureClass=f.kind;
  if(p.state==='OPEN_COOLDOWN'&&Number(p.cooldown_cycles_remaining)>1){cooldown=Number(p.cooldown_cycles_remaining)-1;state='OPEN_COOLDOWN';action='SKIP_PROVIDER_NEXT_CYCLE';reason='EXISTING_COOLDOWN_DECREMENTED';}
  else if(p.state==='OPEN_COOLDOWN'&&Number(p.cooldown_cycles_remaining)===1){state='HALF_OPEN_PROBE';action='SINGLE_BOUNDED_PROBE';reason='COOLDOWN_EXPIRED_PROBE_ONLY';}
  else{cooldown=f.cooldown;state='OPEN_COOLDOWN';action='SKIP_PROVIDER_NEXT_CYCLE';reason=`CURRENT_FAILURE_${f.kind}`;}
 }else{
  state='CLOSED_ON_DEMAND';action='ON_DEMAND_ONLY';reason='UNRECOGNIZED_NON_FAILURE_STATE';
 }
 providers.push({lane_id:lane.lane_id,current_status:lane.status,current_error:lane.error||null,current_observed_candidates:Number(lane.observed_candidates||0),state,next_cycle_action:action,cooldown_cycles_remaining:cooldown,failure_class:failureClass,reason,discovery_only:true,rights_effect:'NONE',admission_effect:'NONE',production:'HOLD'});
}
const enabled=providers.filter(x=>['FULL_DISCOVERY_BUDGET','SINGLE_BOUNDED_PROBE','ON_DEMAND_ONLY'].includes(x.next_cycle_action));
const full=providers.filter(x=>x.next_cycle_action==='FULL_DISCOVERY_BUDGET');
const allOpen=providers.length>0&&providers.every(x=>x.next_cycle_action==='SKIP_PROVIDER_NEXT_CYCLE');
const output={id:'kidults-asi-discovery-provider-health-circuit-v1',version:'1.0.0',status:'SHADOW_PROVIDER_HEALTH_CIRCUIT_PLAN_READY',cycle_number:Number(previous.cycle_number||0)+1,input_discovery_id:d.id||null,input_candidate_count:Number(d.candidate_count||0),providers,summary:{managed_provider_count:providers.length,full_budget_provider_count:full.length,enabled_or_probe_provider_count:enabled.length,open_circuit_count:providers.filter(x=>x.state==='OPEN_COOLDOWN').length,half_open_probe_count:providers.filter(x=>x.state==='HALF_OPEN_PROBE').length,all_provider_circuits_open:allOpen},global_next_cycle:{mode:allOpen?'MINIMAL_INDEPENDENT_PROBE_RECOVERY':'NORMAL_WITH_PROVIDER_CIRCUITS',must_execute_at_least_one_independent_public_metadata_lane:true,canonical_registered_frontier_seed_unaffected:true,provider_failure_cannot_zero_global_discovery:true,discovery_may_fail_soft:true,rights_and_admission_remain_fail_closed:true},rules:{http_403_cooldown_cycles:4,http_429_cooldown_cycles:2,transient_failure_cooldown_cycles:1,half_open_probe_is_single_and_bounded:true,success_resets_circuit:true,provider_circuit_cannot_narrow_global_any_site_universe:true,provider_circuit_cannot_change_rights_or_admission:true,production_or_public_scope_cannot_expand:true},public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,cycle:output.cycle_number,summary:output.summary,mode:output.global_next_cycle.mode,production:'HOLD'}));
