#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2] || 'coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json';
const output = process.argv[3] || '/tmp/asi-official-anchor-pilot-queue';
const anchors = JSON.parse(fs.readFileSync(input, 'utf8')).records || [];
const selected = anchors.filter(x => x.representative_product_id).slice(0, 16);
if (selected.length !== 16) throw new Error(`OFFICIAL_ANCHOR_PILOT_REQUIRES_16:${selected.length}`);
const laneDefs = [
  ['IDENTITY', ['PRIMARY_AUTHORITY', 'CATALOG_REFERENCE']],
  ['AUTHENTICITY', ['AUTHENTICATION_CONDITION', 'PRIMARY_AUTHORITY', 'INDEPENDENT_VERIFICATION']],
  ['SOLD_TRANSACTION', ['SOLD_TRANSACTION', 'AUCTION_PRIVATE_SALE']]
];
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const shards = [];
for (let i = 0; i < 8; i += 1) {
  const records = selected.slice(i * 2, i * 2 + 2).flatMap(product => laneDefs.map(([gap, roles]) => ({
    demand_instance_id: `pilot:${product.representative_product_id}:${gap.toLowerCase()}`,
    representative_product_id: product.representative_product_id,
    maker_or_brand: product.display_name.split(' — ')[0] || product.display_name,
    product_name: product.display_name,
    display_name: product.display_name,
    release_or_era: 'UNKNOWN',
    category_id: product.target_scope_id,
    category_name: product.target_scope_id,
    collection_scope_id: product.target_scope_id,
    collection_scope_name: product.target_scope_id,
    market_cell_id: `pilot:${product.representative_product_id}`,
    evidence_gap_class: gap,
    required_source_roles: roles,
    target_regions: ['GLOBAL'],
    target_languages: ['en'],
    rights_requirement: 'EXPLICIT_REQUIRED',
    acquisition_authorized: false
  })));
  const file = `pilot-${i + 1}.json`;
  fs.writeFileSync(path.join(output, file), JSON.stringify({ id: `asi-official-anchor-pilot-shard-${i + 1}`, category_id: `pilot-${i + 1}`, record_count: records.length, records }, null, 2));
  shards.push({ file, record_count: records.length, category_id: `pilot-${i + 1}` });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
  id: 'asi-official-anchor-pilot-queue-v1', version: '1.0.0', status: 'READY_FOR_METADATA_ONLY_PILOT',
  source_registry: input, official_anchor_count: selected.length, demand_records: selected.length * laneDefs.length,
  shards, acquisition_authorized: false, content_acquired: false, production: 'HOLD'
}, null, 2));
console.log(JSON.stringify({ status: 'PASS', official_anchor_count: selected.length, demand_records: selected.length * laneDefs.length, output }, null, 2));
