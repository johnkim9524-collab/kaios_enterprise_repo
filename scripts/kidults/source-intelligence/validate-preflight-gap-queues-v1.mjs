#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const dir=process.env.OUTPUT_DIR||process.argv[2]||'out';
const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const p=JSON.parse(fs.readFileSync(path.join(dir,'candidate-preflight-queue.json'),'utf8'));
const g=JSON.parse(fs.readFileSync(path.join(dir,'specialist-connector-gap-queue.json'),'utf8'));
const fail=x=>{throw new Error(x)};
if(m.preflight_records!==2||p.records.length!==2)fail('preflight count must be 2');
if(m.explicit_gap_lanes!==44||g.records.length!==44)fail('gap count must be 44');
if(m.traceability_bound_gap_rows!==44)fail('all gap rows must be traceability-bound');
if(m.unknown_promoted_as_trusted!==0)fail('unknown trust shortcut');
if(m.generic_discovery_fallback_count!==0)fail('generic discovery fallback prohibited');
if(m.acquisition_authorized!==false||m.production!=='HOLD')fail('release boundary regression');
for(const r of p.records){for(const k of ['owner_lineage_state','official_terms_pointer_state','license_state','commercial_use_state','field_level_reuse_state','cost_state'])if(r[k]!=='NOT_VERIFIED')fail(`${k} must remain NOT_VERIFIED before official preflight`);if(r.acquisition_authorized!==false)fail('candidate acquisition shortcut')}
for(const r of g.records){
 if(r.generic_discovery_fallback!==false)fail('generic fallback');
 if(!r.missing_required_roles?.length||!r.required_connector_classes?.length)fail('gap connector classification missing');
 for(const k of ['representative_product_id','market_cell_id','assertion_id','collection_scope_id','independent_family_floor','target_regions','target_languages','decision_traceability','irreplaceable_value_traceability','owner_lineage_diversity_requirement','rights_requirement'])if(r[k]===undefined||r[k]===null)fail(`missing traceability ${k}`);
 if(!Array.isArray(r.target_regions)||!r.target_regions.length||!Array.isArray(r.target_languages)||!r.target_languages.length)fail('Global topology missing');
 if(r.decision_traceability?.state!=='BOUND'||r.irreplaceable_value_traceability?.state!=='BOUND')fail('Decision/IV traceability missing');
}
console.log(JSON.stringify({status:'PASS',preflight:p.records.length,gaps:g.records.length,traceability_bound:m.traceability_bound_gap_rows,north_star:m.north_star,production:m.production},null,2));
