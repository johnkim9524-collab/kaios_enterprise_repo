import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('coordination/kidults/products/global-market-intelligence-projection-contract-v1.json','utf8'));
if(p.projection_only!==true) throw new Error('projection_only required');
if(p.consumer_rules?.may_recompute_market_facts!==false) throw new Error('consumer recomputation prohibited');
for(const s of ['NOT_VERIFIED','NOT_VERIFIED_GLOBAL','STALE','RIGHTS_HOLD','ASSESSMENT_HOLD']) if(!p.fail_closed_states.includes(s)) throw new Error(`missing ${s}`);
for(const f of ['raw_provider_payload','provider_secret','bootstrap_share_as_market_share']) if(!p.forbidden_fields.includes(f)) throw new Error(`missing forbidden ${f}`);
if(p.public_release!=='HOLD'||p.production!=='HOLD') throw new Error('release must remain HOLD');
console.log('GLOBAL_MARKET_INTELLIGENCE_PROJECTION_CONTRACT_V1_PASS');
