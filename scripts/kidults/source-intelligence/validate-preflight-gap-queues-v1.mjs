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
if(m.unknown_promoted_as_trusted!==0)fail('unknown trust shortcut');
if(m.generic_discovery_fallback_count!==0)fail('generic discovery fallback prohibited');
if(m.acquisition_authorized!==false||m.production!=='HOLD')fail('release boundary regression');
for(const r of p.records){for(const k of ['owner_lineage_state','official_terms_pointer_state','license_state','commercial_use_state','field_level_reuse_state','cost_state'])if(r[k]!=='NOT_VERIFIED')fail(`${k} must remain NOT_VERIFIED before official preflight`);if(r.acquisition_authorized!==false)fail('candidate acquisition shortcut')}
for(const r of g.records){if(r.generic_discovery_fallback!==false)fail('generic fallback');if(!r.missing_required_roles?.length||!r.required_connector_classes?.length)fail('gap connector classification missing')}
console.log(JSON.stringify({status:'PASS',preflight:p.records.length,gaps:g.records.length,north_star:m.north_star,production:m.production},null,2));
