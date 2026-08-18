#!/usr/bin/env node
import fs from 'node:fs';
const f='coordination/kidults/poc/global-market-evidence-poc-v2-defect-framework.json';
const s='coordination/kidults/poc/global-market-evidence-poc-v2-defect-register-schema.json';
const x=JSON.parse(fs.readFileSync(f,'utf8'));
const y=JSON.parse(fs.readFileSync(s,'utf8'));
if(x.primary_purpose!=='FIND_DEFECTS_BEFORE_SCALE_OR_PROVIDER_CONTACT') throw new Error('PURPOSE_MUST_BE_DEFECT_FINDING');
if(x.scale.scopes!==32||x.scale.products_per_scope!==10||x.scale.products_total!==320) throw new Error('SCALE_MISMATCH');
const mix=Object.values(x.selection_mix).reduce((a,b)=>a+b,0); if(mix!==10) throw new Error('PRODUCT_MIX_MUST_EQUAL_10');
if(x.diagnostic_dimensions.length<18) throw new Error('DIAGNOSTIC_DEPTH_TOO_SHALLOW');
for(const g of ['NO_THRESHOLD_RELAXATION','NO_HIDING_GAPS','NO_PROVIDER_CONTACT','NO_PRODUCTION']) if(!x.guards.includes(g)) throw new Error('MISSING_GUARD_'+g);
for(const sev of ['P0','P1','P2','P3']) if(!x.severity[sev]) throw new Error('MISSING_SEVERITY_'+sev);
for(const r of ['defect_id','scope_id','product_id','severity','evidence_refs','remediation','owner_track','status']) if(!y.required_fields.includes(r)) throw new Error('DEFECT_SCHEMA_'+r);
console.log(JSON.stringify({status:'PASS',products:x.scale.products_total,diagnostics:x.diagnostic_dimensions.length,required_outputs:x.required_outputs.length,defect_fields:y.required_fields.length},null,2));
