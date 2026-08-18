#!/usr/bin/env node
import fs from 'node:fs';
const p='coordination/kidults/poc/poc-v2-challenger-discovery-policy-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const roles=['EMERGING_DYNAMIC_VERTICAL','REGIONAL','SCARCE_ILLIQUID','HIGH_LIQUIDITY_OR_ACTIVE_MARKET','EDGE_CASE'];
for(const r of roles) if(!x.roles[r]) throw new Error('MISSING_ROLE_'+r);
for(const f of ['GENERIC_GITHUB_REPOSITORY_SEARCH','RESTRICTED_SCRAPING','LISTING_AS_SOLD','ATTENTION_AS_DEMAND','AUTO_SCOPE_PROMOTION','AUTO_REPRESENTATIVE_QUALIFICATION']) if(!x.forbidden.includes(f)) throw new Error('MISSING_FORBIDDEN_'+f);
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('HOLD_REQUIRED');
console.log(JSON.stringify({status:'PASS',roles:roles.length,source_priority:x.source_priority.length,forbidden:x.forbidden.length},null,2));
