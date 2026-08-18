#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/scope-depth-dynamic-vertical-contract-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const req=['MARKET_REGIME','GENERATIONAL_CANON','CULTURAL_MOMENTUM','AUTHENTICATION_CONDITION_RISK','CONDITION_ADJUSTED_COMPARABLE','REGIONAL_LIQUIDITY','OWNERSHIP_FRICTION'];
const ids=new Set(x.depth_layers.map(v=>v.id));
for(const r of req) if(!ids.has(r)) throw new Error('MISSING_DEPTH_'+r);
if(x.dynamic_vertical_policy.never_auto_promote!==true) throw new Error('AUTO_PROMOTION_PROHIBITED');
if(x.dynamic_vertical_policy.history_immutable!==true) throw new Error('HISTORY_MUST_BE_IMMUTABLE');
if((x.dynamic_vertical_candidates||[]).length<8) throw new Error('DYNAMIC_VERTICAL_WATCHLIST_TOO_SHALLOW');
if(x.category_governance.eight_core_categories!=='STABLE_BASELINE_NOT_FIXED_WEIGHT') throw new Error('CATEGORY_BASELINE_RULE');
if(x.provider_contact!=='HOLD_PENDING_GLOBAL_MARKET_EVIDENCE_POC_V2') throw new Error('PROVIDER_CONTACT_MUST_HOLD');
for(const k of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) if(!x.north_star[k]) throw new Error('MISSING_NORTH_STAR_'+k);
console.log(JSON.stringify({status:'PASS',depth_layers:x.depth_layers.length,dynamic_verticals:x.dynamic_vertical_candidates.length,category_policy:x.category_governance.eight_core_categories,provider_contact:x.provider_contact,production:x.production},null,2));
