#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/market-activity-feasibility-contract-v1.json';const x=JSON.parse(fs.readFileSync(p,'utf8'));
const ids=new Set(x.evidence_classes.map(v=>v.id));for(const r of ['PUBLIC_AVAILABILITY_LISTINGS','BID_ASK_DEPTH','AUCTION_RESULT_REFERENCE','VERIFIED_SOLD_EVENT_HISTORY','FAILED_SALE_OBSERVATION','TIME_TO_SALE']) if(!ids.has(r)) throw new Error('MISSING_'+r);
const guards=new Set(x.hard_guards||[]);for(const g of ['LISTING_NE_SOLD','BID_ASK_NE_TRANSACTION','MISSING_NE_ILLIQUIDITY','AUCTION_RESULT_REFERENCE_NE_VERIFIED_SOLD_UNTIL_VALIDATED','PROVIDER_NE_TRUTH']) if(!guards.has(g)) throw new Error('MISSING_GUARD_'+g);
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('GATE');
console.log(JSON.stringify({status:'PASS',evidence_classes:x.evidence_classes.length,guards:x.hard_guards.length,provider_contact:x.provider_contact,production:x.production},null,2));
