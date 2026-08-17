#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.OUTPUT_DIR || process.argv[2] || 'out';
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const fail = m => { throw new Error(m); };
if (manifest.named_products !== 160) fail('named_products must be 160 for current bootstrap');
if (manifest.demand_records !== 1280) fail('demand_records must be 1280');
if (manifest.shards?.length !== 8) fail('must have 8 category shards');
if (manifest.discovery_active !== false) fail('discovery must remain inactive before Global binding');
if (manifest.acquisition_authorized !== false) fail('acquisition must remain false');
if (manifest.production !== 'HOLD') fail('production must remain HOLD');
if (manifest.north_star?.autonomous !== 'PASS') fail('autonomous contract regression');
if (manifest.north_star?.irreplaceable_value !== 'PASS') fail('irreplaceable value traceability regression');
if (manifest.north_star?.global !== 'AMBER_REGION_LANGUAGE_BINDING_REQUIRED') fail('Global state must remain truthfully AMBER until region/language binding');

let rows=0, decisionBound=0, valueBound=0;
for (const s of manifest.shards) {
  const p=JSON.parse(fs.readFileSync(path.join(dir,s.file),'utf8'));
  if (p.record_count !== p.records.length) fail(`record_count mismatch ${s.file}`);
  for (const r of p.records) {
    rows++;
    for (const key of ['representative_product_id','market_cell_id','assertion_id','evidence_gap_class','required_source_roles','independent_family_floor','rights_requirement','owner_lineage_diversity_requirement','queue_state']) {
      if (r[key] === undefined || r[key] === null || r[key] === '') fail(`missing ${key}`);
    }
    if (r.decision_traceability?.state !== 'BOUND' || !Array.isArray(r.decision_traceability.decisions) || r.decision_traceability.decisions.length < 1) fail('decision traceability missing');
    if (r.irreplaceable_value_traceability?.state !== 'BOUND' || !Array.isArray(r.irreplaceable_value_traceability.value_products) || r.irreplaceable_value_traceability.value_products.length < 1) fail('irreplaceable value traceability missing');
    decisionBound++;
    valueBound++;
    if (r.queue_state !== 'DEMAND_COMPILED_GLOBAL_BINDING_REQUIRED') fail('queue state must wait only for Global binding');
    if (r.acquisition_authorized !== false) fail('acquisition shortcut');
  }
}
if (rows !== manifest.demand_records) fail(`row total mismatch ${rows}`);
if (decisionBound !== rows || valueBound !== rows) fail('traceability coverage must be 100%');
console.log(JSON.stringify({status:'PASS',rows,decisionBound,valueBound,north_star:manifest.north_star,discovery_active:manifest.discovery_active,production:manifest.production},null,2));
