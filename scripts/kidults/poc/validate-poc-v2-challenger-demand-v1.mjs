#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'tmp/poc-v2-challenger-demand-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.scope_count!==32) throw new Error('EXPECTED_32_SCOPES');
if(x.challenger_rows!==160) throw new Error('EXPECTED_160_CHALLENGERS');
if(x.target_total_products!==320) throw new Error('EXPECTED_320_TOTAL');
const roles=['EMERGING_DYNAMIC_VERTICAL','REGIONAL','SCARCE_ILLIQUID','HIGH_LIQUIDITY_OR_ACTIVE_MARKET','EDGE_CASE'];
const by=new Map();
for(const r of x.rows){
  if(!roles.includes(r.challenger_role)) throw new Error('UNKNOWN_ROLE');
  const a=by.get(r.scope_id)||[];a.push(r);by.set(r.scope_id,a);
  if(r.state!=='DISCOVERY_REQUIRED') throw new Error('INITIAL_STATE_MUST_DISCOVERY_REQUIRED');
  if(r.rights_state!=='NOT_VERIFIED') throw new Error('INITIAL_RIGHTS_MUST_NOT_VERIFIED');
}
if(by.size!==32) throw new Error('EXPECTED_32_SCOPE_BUCKETS');
for(const [scope,rows] of by){
  if(rows.length!==5) throw new Error(`EXPECTED_5_CHALLENGER_ROWS_${scope}`);
  for(const role of roles) if(!rows.some(r=>r.challenger_role===role)) throw new Error(`MISSING_ROLE_${scope}_${role}`);
}
if(x.governance.provider_contact!=='HOLD'||x.governance.production!=='HOLD') throw new Error('GOVERNANCE_HOLD');
console.log(JSON.stringify({status:'PASS',scopes:by.size,challenger_rows:x.rows.length,roles:roles.length,target_total_products:x.target_total_products},null,2));
