#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const dir=process.env.DISCOVERY_OUT||process.argv[2]||'discovery-out';
const p=JSON.parse(fs.readFileSync(path.join(dir,'bounded-live-discovery.json'),'utf8'));
const fail=m=>{throw new Error(m)};
if(p.pilot_products!==16)fail('pilot_products must be 16');
if(p.pilot_demand_lanes!==48)fail('pilot_demand_lanes must be 48');
if(p.generic_github_repository_discovery!==false)fail('generic GitHub discovery must be disabled');
if(p.coverage?.length!==48)fail('coverage must contain 48 lanes');
if(p.acquisition_authorized!==false)fail('acquisition must remain false');
if(p.production!=='HOLD')fail('Production must remain HOLD');
if(p.content_acquired!==false)fail('content acquisition prohibited');
if(p.north_star?.autonomous!=='PASS')fail('Autonomous regression');
if(p.north_star?.irreplaceable_value!=='PASS')fail('Irreplaceable Value regression');
for(const c of p.candidates||[]){
  for(const k of ['representative_product_id','market_cell_id','endpoint_url','discovery_provider','candidate_source_roles','demand_instance_ids','decision_traceability','irreplaceable_value_traceability'])if(c[k]===undefined||c[k]===null)fail(`candidate missing ${k}`);
  if(!c.demand_instance_ids.length)fail('orphan candidate');
  if(c.acquisition_authorized!==false)fail('candidate acquisition shortcut');
}
for(const r of p.coverage){if(!['CANDIDATES_OBSERVED_NOT_QUALIFIED','GAP_NO_CANDIDATE_OBSERVED'].includes(r.state))fail('invalid coverage state')}
console.log(JSON.stringify({status:'PASS',products:p.pilot_products,lanes:p.pilot_demand_lanes,candidates:p.candidate_count,lanes_with_candidates:p.lanes_with_candidates,lanes_with_no_candidates:p.lanes_with_no_candidates,errors:p.request_errors?.length||0,north_star:p.north_star,production:p.production},null,2));
