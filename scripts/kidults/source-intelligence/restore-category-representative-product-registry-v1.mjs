#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const anchorDir = process.argv[2] || 'coordination/kidults/representative-products/anchors';
const output = process.argv[3] || 'input/category-representative-product-registry-v1.json';
const files = fs.readdirSync(anchorDir).filter(name => name.endsWith('.json')).sort();
const records = [];
for (const file of files) {
  const value = JSON.parse(fs.readFileSync(path.join(anchorDir, file), 'utf8'));
  for (const raw of value.records || []) {
    // The approved anchor seed stores compact positional tuples:
    // [product id, scope id, brand, product name, identity level, era, thesis].
    // Materialize them into the named registry contract without inventing fields.
    const [
      representative_product_id,
      collection_scope_id,
      maker_or_brand,
      product_name,
      identity_level,
      release_or_era,
      description
    ] = raw;
    records.push({
      representative_product_id,
      collection_scope_id,
      maker_or_brand,
      product_name,
      display_name: product_name,
      identity_level,
      release_or_era,
      description,
      category_id: value.category_id,
      category_name: value.category_name,
      collection_scope_name: collection_scope_id
    });
  }
}
if (records.length !== 160) throw new Error(`RESTORED_ANCHOR_COUNT:${records.length}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
const registry = {
  id: 'category-representative-product-registry-v1',
  version: '1.0.0',
  status: 'RESTORED_FROM_APPROVED_ANCHOR_SEED_COMMIT_97EDB09B',
  named_anchor_product_count: records.length,
  record_count: records.length,
  source_commit: '97edb09b',
  records,
  production: 'HOLD',
  public_release: 'HOLD'
};
fs.writeFileSync(output, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', record_count: records.length, source_commit: registry.source_commit, output }, null, 2));
