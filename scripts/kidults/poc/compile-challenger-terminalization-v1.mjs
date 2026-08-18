#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const matrixPath=process.argv[2]||'coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
const policyPath=process.argv[3]||'coordination/kidults/poc/challenger-role-terminalization-policy-v1.json';
const migrationPath='coordination/kidults/scope-data/scope-evolution-watches-v1.2.json';
const outDir=process.argv[4]||'tmp/challenger-terminalization-v1';fs.mkdirSync(outDir,{recursive:true});
const matrix=JSON.parse(fs.readFileSync(matrixPath,'utf8')),policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));let alias={};if(fs.existsSync(migrationPath)){const m=JSON.parse(fs.readFileSync(migrationPath,'utf8'));alias=m?.historical_preservation?.alias||{}}
const roles=Object.keys(policy.roles);const slots=[];
for(const s of matrix.scopes||[]){const scope_id=alias[s.scope_id]||s.scope_id;for(const role of roles){const p=policy.roles[role];slots.push({slot_id:`${scope_id}::${role}`,scope_id,domain:s.domain,role,terminal_state:p.terminal_state,reason:p.reason,evidence_refs:p.evidence_refs,remediation:p.remediation});}}
const counts={};for(const x of slots)counts[x.terminal_state]=(counts[x.terminal_state]||0)+1;const selected=counts.SELECTED||0;
const out={id:'kidults-challenger-terminalization-v1',status:'TERMINALIZED_FAIL_CLOSED',scope_count:new Set(slots.map(x=>x.scope_id)).size,roles_per_scope:roles.length,slot_count:slots.length,selected_slots:selected,state_counts:counts,poc_320_readiness:selected===slots.length?'READY':'BLOCKED',slots,truth_guards:policy.truth_guards,provider_contact:'HOLD',production:'HOLD'};
if(out.scope_count!==32)throw new Error(`EXPECTED_32_SCOPES_GOT_${out.scope_count}`);if(out.slot_count!==160)throw new Error(`EXPECTED_160_SLOTS_GOT_${out.slot_count}`);if(out.selected_slots!==0)throw new Error('CURRENT_EMPIRICAL_BASELINE_MUST_NOT_AUTO_SELECT');
fs.writeFileSync(path.join(outDir,'challenger-terminalization-v1.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({status:out.status,scopes:out.scope_count,slots:out.slot_count,selected:out.selected_slots,state_counts:out.state_counts,poc_320_readiness:out.poc_320_readiness},null,2));
