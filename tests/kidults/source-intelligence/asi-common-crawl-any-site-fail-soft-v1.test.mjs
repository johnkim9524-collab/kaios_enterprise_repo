import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const prefix='scripts/kidults/source-intelligence/';
const merger=prefix+'merge-asi-common-crawl-into-any-site-discovery-v1.mjs';
const validator=prefix+'validate-asi-common-crawl-any-site-gate-binding-v1.mjs';
const candidate={candidate_id:'baseline',endpoint_url:'https://example.org',discovery_provider:'BASELINE_METADATA',live_external_observation:true,source_family_hint:'UNCLASSIFIED_ANY_SITE_CANDIDATE',candidate_source_roles:['UNCLASSIFIED_PENDING_RELEVANCE'],candidate_purpose_intents:[],rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',gate_1_state:'PENDING',evidence_state:'DISCOVERY_METADATA_ONLY',acquisition_authorized:false,target_site_body_crawled:false,content_acquired:false,provider_contacted:false,account_created:false,eula_accepted:false,spend_authorized:false,production:'HOLD'};
const discovery={id:'kidults-asi-global-low-risk-discovery-v1',status:'SHADOW_GLOBAL_ANY_SITE_DISCOVERY_COMPLETE_NOT_RIGHTS_ADMITTED',primary_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_boundary:'ANY_PUBLICLY_DISCOVERABLE_SITE_OR_SOURCE_ENDPOINT',source_family_restriction:null,design_capacity_minimum_candidates:100000,discovery_strategy:'MULTI_LANE_FAIL_SOFT_DISCOVERY_FAIL_CLOSED_ADMISSION',baseline_discovery_executed:true,demand_rows:1280,source_x_purpose_partition_ready:true,rights_first_preflight_required:true,current_sold_purpose_candidate_count:0,context_only_excluded_from_current_sold_count:0,supplemental_query_count:0,gate_chain:['GATE_1_ASI_INGRESS_VERIFICATION','GATE_2_INDEPENDENT_LEGAL_COMMERCIAL_REVERIFICATION','GATE_3_ADMISSION_ACTIVATION_VERIFICATION'],candidate_count:1,candidates:[candidate],lane_health:['BASELINE_METADATA','GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA','GITHUB_SOURCE_FAMILY_GAP_SUPPLEMENT','DATACITE','OTHER'].map(lane_id=>({lane_id,status:lane_id==='BASELINE_METADATA'?'SUCCESS_WITH_RESULTS':'SUCCESS_ZERO_RESULTS'})),production:'HOLD',public_release:'HOLD',acquisition_authorized:false,content_acquired:false,target_site_body_crawled:false,listing_is_not_sold:true,terminal_transaction_assertion_required:true};
const expansion={id:'kidults-asi-common-crawl-host-expansion-v1',status:'SHADOW_COMMON_CRAWL_HOST_EXPANSION_ZERO_RESULTS',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',metadata_index_only:true,seed_host_count:1,seed_hosts:['example.org'],common_crawl_index_id:null,expanded_candidate_count:0,candidates:[],errors:['INDEX_CATALOG_HTTP_503'],rights_promoted:false,admission_promoted:false,production:'HOLD',public_release:'HOLD',acquisition_authorized:false,content_acquired:false,target_site_body_crawled:false};
function setup(t,modify=()=>{}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cc-fail-soft-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const e=structuredClone(expansion);modify(e);
 const d=path.join(dir,'discovery.json'),input=path.join(dir,'expansion.json'),out=path.join(dir,'merged.json');
 fs.writeFileSync(d,JSON.stringify(discovery));fs.writeFileSync(input,JSON.stringify(e));
 return {dir,d,input,out,e,run:(script,...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'})};
}
function merge(t,modify){const f=setup(t,modify);const r=f.run(merger,f.d,f.input,f.out);assert.equal(r.status,0,r.stderr);f.x=JSON.parse(fs.readFileSync(f.out));return f;}
function check(f,x=f.x){fs.writeFileSync(f.out,JSON.stringify(x));return f.run(validator,f.out);}
test('catalog outage preserves baseline and reaches Gate1 without a healthy Common Crawl claim',t=>{
 const f=merge(t);const lane=f.x.lane_health.at(-1);
 assert.equal(lane.status,'FAILED_FAIL_SOFT');assert.equal(lane.error,'INDEX_CATALOG_HTTP_503');assert.equal(f.x.healthy_live_lanes,1);assert.equal(f.x.candidate_count,1);assert.deepEqual(f.x.candidates,[candidate]);assert.equal(check(f).status,0);
 for(const script of ['validate-asi-global-low-risk-discovery-v1.mjs']){const r=f.run(prefix+script,f.out);assert.equal(r.status,0,r.stderr);}
 let input=f.out;
 for(const stage of ['gate1-safe-candidate-pool','gate2-independent-reverification','gate3-admission-runtime']){
  const out=path.join(f.dir,stage+'.json');const r=f.run(prefix+'build-asi-'+stage+'-v1.mjs',input,out);assert.equal(r.status,0,r.stderr);
  const v=f.run(prefix+'validate-asi-'+stage+'-v1.mjs',out);assert.equal(v.status,0,v.stderr);input=out;
 }
});
test('index-backed genuine zero results remains success',t=>{const f=merge(t,e=>{e.common_crawl_index_id='CC-MAIN-2026-40';e.errors=[];});assert.equal(f.x.lane_health.at(-1).status,'SUCCESS_ZERO_RESULTS');assert.equal(check(f).status,0);});
test('index-backed positive results remain unadmitted',t=>{
 const f=merge(t,e=>{e.status='SHADOW_COMMON_CRAWL_HOST_EXPANSION_COMPLETE';e.common_crawl_index_id='CC-MAIN-2026-40';e.errors=[];e.expanded_candidate_count=1;e.candidates=[{...candidate,candidate_id:'cc',endpoint_url:'https://sub.example.org',seed_host:'example.org',common_crawl_index_id:e.common_crawl_index_id,discovery_provider:'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION',discovery_channel:'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX'}];});
 assert.equal(f.x.candidate_count,2);assert.equal(check(f).status,0);assert.equal(f.x.candidates[1].rights_state,'UNASSESSED');
});
test('missing index without authenticated error evidence fails',t=>{const f=setup(t,e=>{e.errors=[];});const r=f.run(merger,f.d,f.input,f.out);assert.notEqual(r.status,0);assert.match(r.stderr,/EXPANSION_INDEX_EVIDENCE/);});
for(const [name,mutate] of [
 ['false zero success',x=>{x.lane_health.at(-1).status='SUCCESS_ZERO_RESULTS';}],
 ['missing failure cause',x=>{x.lane_health.at(-1).error=null;}],
 ['error count mismatch',x=>{x.lane_health.at(-1).error_count=0;}],
 ['failed lane with observations',x=>{x.common_crawl_observed_candidate_count=1;x.lane_health.at(-1).observed_candidates=1;}],
 ['index binding drift',x=>{x.lane_health.at(-1).common_crawl_index_id='OTHER';}],
 ['rights self-promotion',x=>{x.candidates[0].rights_state='ALLOW';}],
 ['release promotion',x=>{x.production='ACTIVE';}]
])test('reject '+name,t=>{const f=merge(t);mutate(f.x);assert.notEqual(check(f).status,0);});
