#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/market-activity-source-feasibility-wave1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.current_open_institutional_topology.market_activity_roles!==0) throw new Error('CURRENT_OPEN_TOPOLOGY_ACTIVITY_ROLE_EXPECTED_ZERO');
for(const g of ['LISTING_NE_SOLD','BID_ASK_NE_TRANSACTION','PROVIDER_NE_TRUTH']) if(!x.hard_guards.includes(g)) throw new Error('MISSING_GUARD_'+g);
if(x.evidence_class_disposition.VERIFIED_SOLD_EVENT_HISTORY!=='EXTERNAL_CAPABILITY_CANDIDATE_CURRENTLY_NO_RIGHTS_CLEAR_OPEN_CHANNEL') throw new Error('SOLD_HISTORY_BOUNDARY');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('GATE');
if(!String(x.decision).includes('FINAL_RIGHTS_SAFE_MARKET_SOURCE_DISCOVERY')) throw new Error('MUST_REQUIRE_FINAL_SELF_COLLECTION_DISCOVERY');
console.log(JSON.stringify({status:'PASS',sources:x.sources.length,open_activity_roles:x.current_open_institutional_topology.market_activity_roles,sold_history:x.evidence_class_disposition.VERIFIED_SOLD_EVENT_HISTORY,decision:x.decision},null,2));
