#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.env.DISCOVERY_JSON || process.argv[2] || 'bounded-live-discovery.json';
const outputDir = process.env.GAP_OUT || process.argv[3] || 'gap-out';
fs.mkdirSync(outputDir,{recursive:true});
const d = JSON.parse(fs.readFileSync(input,'utf8'));
if (d.pilot_demand_lanes !== 48) throw new Error('expected 48 pilot lanes');

const priorityWeight = {
  AUTHENTICATION_CONDITION: 5,
  SOLD_TRANSACTION: 5,
  AUCTION_PRIVATE_SALE: 5,
  PRIMARY_AUTHORITY: 4,
  CATALOG_REFERENCE: 3,
  INDEPENDENT_VERIFICATION: 3,
  PROVENANCE_HISTORY: 4,
  LISTING_SUPPLY: 2,
  CULTURE_ATTENTION: 2
};
const roleMap = new Map();
for (const row of d.coverage || []) {
  for (const role of row.missing_required_roles || []) {
    const rec = roleMap.get(role) || {source_role:role, gap_lane_count:0, products:new Set(), demand_instances:[], weighted_priority:0};
    rec.gap_lane_count += 1;
    rec.products.add(row.representative_product_id);
    rec.demand_instances.push(row.demand_instance_id);
    rec.weighted_priority += priorityWeight[role] || 1;
    roleMap.set(role,rec);
  }
}
const records=[...roleMap.values()].map(r=>({
  source_role:r.source_role,
  gap_lane_count:r.gap_lane_count,
  affected_product_count:r.products.size,
  affected_products:[...r.products].sort(),
  demand_instances:r.demand_instances.sort(),
  weighted_priority:r.weighted_priority,
  connector_strategy: r.source_role==='AUTHENTICATION_CONDITION' ? 'SPECIALIST_AUTHENTICATION_GRADING' :
    (r.source_role==='SOLD_TRANSACTION'||r.source_role==='AUCTION_PRIVATE_SALE') ? 'AUCTION_SOLD_RESULTS_AND_TRANSACTION_SPECIALIST' :
    r.source_role==='PRIMARY_AUTHORITY' ? 'MAKER_CREATOR_ARCHIVE_OFFICIAL' :
    r.source_role==='CATALOG_REFERENCE' ? 'REFERENCE_CATALOG_INSTITUTIONAL_DB' : 'SPECIALIST_INDEPENDENT_REFERENCE',
  next_state:'CONNECTOR_DISCOVERY_AND_RIGHTS_PREFLIGHT_REQUIRED'
})).sort((a,b)=>b.weighted_priority-a.weighted_priority||b.gap_lane_count-a.gap_lane_count||a.source_role.localeCompare(b.source_role));

const out={
  id:'kidults-product-linked-source-gap-priority-v1',
  version:'1.0.0',
  status:'COMPILED_FROM_BOUNDED_LIVE_V2',
  pilot_products:d.pilot_products,
  pilot_demand_lanes:d.pilot_demand_lanes,
  lanes_with_candidates:d.lanes_with_candidates,
  lanes_with_no_candidates:d.lanes_with_no_candidates,
  connector_priority:records,
  governing_rule:'Prioritize connectors by high-value missing Source roles tied to Product×MarketCell×Assertion demand; never by generic source availability.',
  north_star:{autonomous:'PASS',global:'PASS_PLANNING_EMPIRICAL_PENDING',irreplaceable_value:'PASS'},
  acquisition_authorized:false,
  production:'HOLD'
};
fs.writeFileSync(path.join(outputDir,'product-linked-source-gap-priority-v1.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify({roles:records.length,top:records.slice(0,5).map(x=>({role:x.source_role,gaps:x.gap_lane_count,priority:x.weighted_priority}))},null,2));
