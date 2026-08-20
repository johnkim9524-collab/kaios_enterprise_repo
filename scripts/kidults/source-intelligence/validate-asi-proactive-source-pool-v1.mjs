#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'/tmp/asi-proactive-source-pool-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.status!=='ROLLING_DISCOVERY_CANDIDATE_POOL') fail('STATUS');
if(x.production!=='HOLD'||x.public_release!=='HOLD') fail('RELEASE_BOUNDARY');
if(x.acquisition_authorized!==false||x.rights_promoted_automatically!==false||x.admission_promoted_automatically!==false) fail('AUTOMATIC_PROMOTION_FORBIDDEN');
if(!Array.isArray(x.candidates)||!Array.isArray(x.rights_review_queue)) fail('ARRAYS');
const keys=new Set();
for(const c of x.candidates){
  if(keys.has(c.source_candidate_key)) fail(`DUPLICATE:${c.source_candidate_key}`);keys.add(c.source_candidate_key);
  for(const f of ['source_candidate_key','canonical_locator','source_name','first_seen_at','last_seen_at','observation_count','discovery_providers','source_family_hints','candidate_source_roles','representative_product_ids','demand_instance_ids','target_regions','target_languages','rights_state','admission_state','source_pool_state','evidence_state','next_action']) if(c[f]===undefined||c[f]===null) fail(`MISSING:${f}`);
  if(c.rights_state!=='UNASSESSED'||c.admission_state!=='NOT_ADMITTED'||c.source_pool_state!=='CANDIDATE_ONLY'||c.evidence_state!=='DISCOVERY_METADATA_ONLY') fail(`PROMOTION:${c.source_candidate_key}`);
  if(c.acquisition_authorized!==false||c.target_site_traversal_authorized!==false||c.market_claim_authorized!==false||c.public_projection!==false||c.production!=='HOLD') fail(`BOUNDARY:${c.source_candidate_key}`);
  if(Number(c.observation_count)<1) fail(`OBSCOUNT:${c.source_candidate_key}`);
}
if(x.candidate_count!==x.candidates.length) fail('COUNT');
if(x.rights_review_queue.length>64) fail('RIGHTS_QUEUE_LIMIT');
for(const r of x.rights_review_queue){if(r.rights_state!=='UNASSESSED'||r.admission_state!=='NOT_ADMITTED'||r.acquisition_authorized!==false)fail(`RIGHTS_PACKET_PROMOTION:${r.packet_id}`);if(!keys.has(r.source_candidate_key))fail(`RIGHTS_PACKET_ORPHAN:${r.packet_id}`)}
console.log(JSON.stringify({status:'PASS',cycle_count:x.cycle_count,candidate_count:x.candidate_count,new_candidate_count:x.new_candidate_count,reobserved_candidate_count:x.reobserved_candidate_count,rights_review_packets:x.rights_review_queue.length,production:x.production}));
