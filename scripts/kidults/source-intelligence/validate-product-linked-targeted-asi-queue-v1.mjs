#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.OUTPUT_DIR || process.argv[2] || 'out';
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const fail = m => { throw new Error(m); };
if (manifest.named_products !== 160) fail('named_products must be 160 for current bootstrap');
if (manifest.demand_records !== 1280) fail('demand_records must be 1280');
if (manifest.bound_scopes !== 32) fail('all 32 Collection Scopes must have Global planning topology');
if (manifest.shards?.length !== 8) fail('must have 8 category shards');
if (manifest.discovery_active !== true) fail('targeted discovery must be ready after Global planning binding');
if (manifest.acquisition_authorized !== false) fail('acquisition must remain false');
if (manifest.production !== 'HOLD') fail('production must remain HOLD');
if (manifest.north_star?.autonomous !== 'PASS') fail('autonomous regression');
if (manifest.north_star?.irreplaceable_value !== 'PASS') fail('irreplaceable value regression');
if (manifest.north_star?.global !== 'PASS_PLANNING_TOPOLOGY_EMPIRICAL_PENDING') fail('Global planning topology regression');

let rows=0, decisionBound=0, valueBound=0, globalBound=0;
const scopes=new Set();
for (const s of manifest.shards) {
  const p=JSON.parse(fs.readFileSync(path.join(dir,s.file),'utf8'));
  if (p.record_count !== p.records.length) fail(`record_count mismatch ${s.file}`);
  for (const r of p.records) {
    rows++; scopes.add(r.collection_scope_id);
    for (const key of ['representative_product_id','market_cell_id','assertion_id','evidence_gap_class','required_source_roles','independent_family_floor','rights_requirement','owner_lineage_diversity_requirement','queue_state']) {
      if (r[key] === undefined || r[key] === null || r[key] === '') fail(`missing ${key}`);
    }
    if (r.decision_traceability?.state !== 'BOUND' || !r.decision_traceability.decisions?.length) fail('decision traceability missing');
    if (r.irreplaceable_value_traceability?.state !== 'BOUND' || !r.irreplaceable_value_traceability.value_products?.length) fail('irreplaceable value traceability missing');
    if (!Array.isArray(r.target_regions) || r.target_regions.length < 1) fail('region topology missing');
    if (!Array.isArray(r.target_languages) || r.target_languages.length < 1) fail('language topology missing');
    if (r.global_topology_state !== 'BOUND_SCOPE_PLANNING_TOPOLOGY') fail('Global topology state missing');
    if (r.empirical_global_coverage_state !== 'PENDING_DISCOVERY_AND_QUALIFICATION') fail('empirical Global coverage must remain pending');
    if (r.queue_state !== 'DISCOVERY_READY') fail('queue must be DISCOVERY_READY');
    if (r.acquisition_authorized !== false) fail('acquisition shortcut');
    decisionBound++; valueBound++; globalBound++;
  }
}
if (rows !== manifest.demand_records) fail(`row total mismatch ${rows}`);
if (scopes.size !== 32) fail(`scope coverage mismatch ${scopes.size}`);
if (decisionBound !== rows || valueBound !== rows || globalBound !== rows) fail('binding coverage must be 100%');
console.log(JSON.stringify({status:'PASS',rows,scopes:scopes.size,decisionBound,valueBound,globalBound,north_star:manifest.north_star,discovery_active:manifest.discovery_active,acquisition_authorized:manifest.acquisition_authorized,production:manifest.production},null,2));
