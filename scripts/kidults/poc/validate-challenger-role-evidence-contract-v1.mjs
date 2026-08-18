#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/poc/challenger-role-evidence-contract-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const roles=['EMERGING_DYNAMIC_VERTICAL','REGIONAL','SCARCE_ILLIQUID','HIGH_LIQUIDITY_OR_ACTIVE_MARKET','EDGE_CASE'];
const got=new Set(x.roles.map(r=>r.role));
for(const r of roles)if(!got.has(r))throw new Error('MISSING_ROLE_'+r);
for(const r of x.roles){if(!r.minimum_evidence?.length)throw new Error('MISSING_MIN_EVIDENCE_'+r.role);if(!r.forbidden_substitutions?.length)throw new Error('MISSING_GUARD_'+r.role)}
if(x.selection_gate.independent_source_family_floor<2)throw new Error('SOURCE_FAMILY_FLOOR');
if(x.selection_gate.auto_select!==false)throw new Error('AUTO_SELECT_PROHIBITED');
if(x.selection_gate.track_b_required!==true)throw new Error('TRACK_B_REQUIRED');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD')throw new Error('GOVERNANCE_HOLD');
console.log(JSON.stringify({status:'PASS',roles:x.roles.length,source_classes:x.source_topology_classes.length,source_family_floor:x.selection_gate.independent_source_family_floor,provider_contact:x.provider_contact,production:x.production},null,2));
