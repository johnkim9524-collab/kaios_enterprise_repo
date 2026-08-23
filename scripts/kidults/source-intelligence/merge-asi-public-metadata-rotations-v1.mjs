#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
const out=args.length>4?args.pop():'/tmp/asi-public-metadata-source-fabric-v1.json';
const inputs=args.length?args:['/tmp/asi-public-metadata-r0.json','/tmp/asi-public-metadata-r1.json','/tmp/asi-public-metadata-r2.json','/tmp/asi-public-metadata-r3.json'];
const fail=m=>{throw new Error(m)};
const norm=u=>{const x=new URL(String(u));if(!/^https?:$/.test(x.protocol))fail('NON_HTTP_ENDPOINT');x.hash='';x.hostname=x.hostname.toLowerCase();if((x.protocol==='https:'&&x.port==='443')||(x.protocol==='http:'&&x.port==='80'))x.port='';return x.toString().replace(/\/$/,'')};
if(inputs.length!==4)fail(`FOUR_ROTATIONS_REQUIRED:${inputs.length}`);
const rotations=inputs.map(p=>JSON.parse(fs.readFileSync(p,'utf8'))).sort((a,b)=>Number(a.scope_rotation_index)-Number(b.scope_rotation_index));
const rotationIds=new Set();const scheduledScopeIds=new Set();const empiricalScopeIds=new Set();const byUrl=new Map();const laneAgg=new Map();
for(const x of rotations){
 if(x.id!=='kidults-asi-openalex-gdelt-public-metadata-discovery-v1'||x.status!=='SHADOW_MULTI_PROVIDER_PUBLIC_METADATA_DISCOVERY_COMPLETE')fail('ROTATION_IDENTITY');
 if(x.universe_target!=='GLOBAL_ANY_SITE_SOURCE_UNIVERSE'||x.universe_restricted!==false||x.production!=='HOLD'||x.public_release!=='HOLD'||x.acquisition_authorized!==false)fail('ROTATION_BOUNDARY');
 const r=Number(x.scope_rotation_index);if(!Number.isInteger(r)||r<0||r>3||rotationIds.has(r))fail('ROTATION_PARTITION');rotationIds.add(r);
 if(!Array.isArray(x.cycle_scope_ids)||x.cycle_scope_ids.length!==8)fail('ROTATION_SCOPE_COUNT');for(const s of x.cycle_scope_ids){if(scheduledScopeIds.has(s))fail(`SCOPE_OVERLAP:${s}`);scheduledScopeIds.add(s)}
 for(const lane of x.lane_health||[]){
  const a=laneAgg.get(lane.lane_id)||{lane_id:lane.lane_id,observed_candidates:0,successful_rotation_count:0,failed_rotation_count:0,zero_result_rotation_count:0,skipped_rotation_count:0,errors:[]};
  a.observed_candidates+=Number(lane.observed_candidates||0);
  if(lane.status==='SUCCESS_WITH_RESULTS')a.successful_rotation_count++;
  else if(lane.status==='SUCCESS_ZERO_RESULTS')a.zero_result_rotation_count++;
  else if(lane.status==='FAILED'){a.failed_rotation_count++;if(lane.error)a.errors.push(`R${r}:${lane.error}`)}
  else if(lane.status==='SKIPPED_PROVIDER_CIRCUIT_OPEN')a.skipped_rotation_count++;
  laneAgg.set(lane.lane_id,a);
 }
 for(const raw of x.candidates||[]){
  const endpoint=norm(raw.endpoint_url);const prior=byUrl.get(endpoint);
  const providers=[...new Set((raw.discovery_providers||[raw.discovery_provider]).filter(Boolean))];
  const scopes=[...new Set((raw.scope_hints||[raw.scope_hint]).filter(Boolean))];for(const s of scopes)empiricalScopeIds.add(s);
  const record={...raw,endpoint_url:endpoint,discovery_providers:providers.sort(),scope_hints:scopes.sort(),source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,public_release:'HOLD',production:'HOLD'};
  if(!prior)byUrl.set(endpoint,record);
  else byUrl.set(endpoint,{...prior,discovery_providers:[...new Set([...(prior.discovery_providers||[]),...providers])].sort(),scope_hints:[...new Set([...(prior.scope_hints||[]),...scopes])].sort()});
 }
}
if(rotationIds.size!==4||scheduledScopeIds.size!==32)fail(`FULL_SCOPE_SCHEDULE_REQUIRED:${rotationIds.size}:${scheduledScopeIds.size}`);
const laneHealth=[...laneAgg.values()].map(a=>{const anySuccess=a.successful_rotation_count+a.zero_result_rotation_count>0;const status=a.successful_rotation_count>0?'SUCCESS_WITH_RESULTS':a.zero_result_rotation_count>0?'SUCCESS_ZERO_RESULTS':a.failed_rotation_count>0?'FAILED':'SKIPPED_PROVIDER_CIRCUIT_OPEN';return{...a,status,error:a.errors.length?a.errors.join('|').slice(0,500):null,degraded:anySuccess&&(a.failed_rotation_count>0||a.skipped_rotation_count>0)};}).sort((a,b)=>a.lane_id.localeCompare(b.lane_id));
const candidates=[...byUrl.values()].sort((a,b)=>a.endpoint_url.localeCompare(b.endpoint_url));
const hosts=new Set(candidates.map(c=>new URL(c.endpoint_url).hostname.toLowerCase()));const providerCounts={};
for(const c of candidates)for(const p of c.discovery_providers||[c.discovery_provider].filter(Boolean))providerCounts[p]=(providerCounts[p]||0)+1;
const output={id:'kidults-asi-public-metadata-source-fabric-v1',version:'1.1.0',status:'SHADOW_PUBLIC_METADATA_SOURCE_FABRIC_INCREMENT_READY',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_restricted:false,rotation_count:4,scheduled_scope_count:scheduledScopeIds.size,scheduled_scope_ids:[...scheduledScopeIds].sort(),empirical_scope_count:empiricalScopeIds.size,empirical_scope_ids:[...empiricalScopeIds].sort(),lane_health:laneHealth,healthy_lane_count:laneHealth.filter(l=>['SUCCESS_WITH_RESULTS','SUCCESS_ZERO_RESULTS'].includes(l.status)).length,degraded_lane_count:laneHealth.filter(l=>l.degraded===true).length,candidate_count:candidates.length,live_external_candidate_count:candidates.length,unique_host_count:hosts.size,provider_counts:providerCounts,candidates,rules:{full_32_scope_schedule_attempted:true,empirical_coverage_reported_separately:true,multi_provider_fail_soft:true,discovery_metadata_only:true,attention_is_not_demand:true,listing_is_not_sold:true,terminal_transaction_assertion_required:true,reserve_is_not_safe_pool:true,rights_never_promoted:true,admission_never_promoted:true,target_site_body_traversal_forbidden:true,content_acquisition_forbidden:true},target_site_body_crawled:false,content_acquired:false,acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,rotations:4,scheduled_scopes:output.scheduled_scope_count,empirical_scopes:output.empirical_scope_count,candidates:output.candidate_count,hosts:output.unique_host_count,healthy_lanes:output.healthy_lane_count,degraded_lanes:output.degraded_lane_count,production:'HOLD'}));
