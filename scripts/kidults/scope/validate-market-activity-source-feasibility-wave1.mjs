#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/market-activity-source-feasibility-wave1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.current_open_institutional_topology.market_activity_roles!==0) throw new Error('CURRENT_OPEN_TOPOLOGY_ACTIVITY_ROLE_EXPECTED_ZERO');
for(const g of ['LISTING_NE_SOLD','BID_ASK_NE_TRANSACTION','CREDENTIAL_ACCESS_NE_COMMERCIAL_REUSE_RIGHTS','PROVIDER_NE_TRUTH']) if(!x.hard_guards.includes(g)) throw new Error('MISSING_GUARD_'+g);
if(!String(x.evidence_class_disposition.VERIFIED_SOLD_EVENT_HISTORY).includes('SCOPE_DEPENDENT')) throw new Error('SOLD_HISTORY_MUST_BE_SCOPE_DEPENDENT');
const brick=x.sources.find(s=>s.id==='BRICKLINK_PRICE_GUIDE');if(!brick)throw new Error('MISSING_SCOPE_SPECIFIC_SOLD_CANDIDATE');if(brick.classification!=='SELF_COLLECTABLE_CREDENTIAL_REQUIRED_RIGHTS_PREFLIGHT')throw new Error('BRICKLINK_CLASSIFICATION');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('GATE');
if(!String(x.decision).includes('FINAL_RIGHTS_SAFE_AND_AUTHENTICATED_MARKET_SOURCE_DISCOVERY')) throw new Error('MUST_REQUIRE_FINAL_SELF_COLLECTION_DISCOVERY');
console.log(JSON.stringify({status:'PASS',sources:x.sources.length,open_activity_roles:x.current_open_institutional_topology.market_activity_roles,sold_history:x.evidence_class_disposition.VERIFIED_SOLD_EVENT_HISTORY,scope_specific_candidate:brick.id,decision:x.decision},null,2));
