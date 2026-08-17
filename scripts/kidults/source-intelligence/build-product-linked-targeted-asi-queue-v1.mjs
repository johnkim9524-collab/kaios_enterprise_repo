#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const inputDir = process.env.INPUT_DIR || process.argv[2] || 'input';
const outputDir = process.env.OUTPUT_DIR || process.argv[3] || 'out';
const registryPath = path.join(inputDir, 'category-representative-product-registry-v1.json');
if (!fs.existsSync(registryPath)) throw new Error(`Missing registry: ${registryPath}`);
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
fs.mkdirSync(outputDir, { recursive: true });

const mappings = [
  ['IDENTITY', ['PRIMARY_AUTHORITY','CATALOG_REFERENCE'], 2],
  ['SPECIFICATION_OR_VARIANT', ['PRIMARY_AUTHORITY','CATALOG_REFERENCE','INDEPENDENT_VERIFICATION'], 2],
  ['AUTHENTICITY', ['AUTHENTICATION_CONDITION','PRIMARY_AUTHORITY','INDEPENDENT_VERIFICATION'], 3],
  ['PROVENANCE', ['PROVENANCE_HISTORY','PRIMARY_AUTHORITY','INDEPENDENT_VERIFICATION'], 3],
  ['CONDITION_OR_ORIGINALITY', ['AUTHENTICATION_CONDITION','CATALOG_REFERENCE','INDEPENDENT_VERIFICATION'], 2],
  ['SCARCITY_OR_PRODUCTION', ['PRIMARY_AUTHORITY','CATALOG_REFERENCE','LISTING_SUPPLY'], 2],
  ['SOLD_TRANSACTION', ['SOLD_TRANSACTION','AUCTION_PRIVATE_SALE'], 3],
  ['CULTURE_OR_CANON', ['CULTURE_ATTENTION','INDEPENDENT_VERIFICATION','CATALOG_REFERENCE'], 2]
];

const byCategory = new Map();
for (const p of registry.records || []) {
  for (const [gap, roles, floor] of mappings) {
    const rec = {
      demand_instance_id: `demand:${p.representative_product_id}:${gap.toLowerCase()}`,
      representative_product_id: p.representative_product_id,
      category_id: p.category_id,
      collection_scope_id: p.collection_scope_id,
      market_cell_id: `pmc:${p.representative_product_id}:global-planning-v1`,
      market_cell_state: 'PLANNING_PROVISIONAL_NOT_QUALIFIED',
      assertion_id: `assertion:${p.representative_product_id}:${gap.toLowerCase()}`,
      evidence_gap_class: gap,
      required_source_roles: roles,
      independent_family_floor: floor,
      target_regions: 'DERIVE_FROM_MARKET_CELL_AND_PRODUCT_EVIDENCE_POLICY',
      target_languages: 'DERIVE_FROM_REGION_AND_SOURCE_TOPOLOGY',
      rights_requirement: 'EXPLICIT_REQUIRED',
      owner_lineage_diversity_requirement: 'INDEPENDENT_FAMILY_COUNT_NO_ALIAS_INFLATION',
      freshness_requirement: 'ROLE_SPECIFIC_FROM_PRODUCT_POLICY',
      decision_traceability: 'REQUIRED_BEFORE_DISCOVERY_ACTIVE',
      irreplaceable_value_traceability: 'REQUIRED_BEFORE_DISCOVERY_ACTIVE',
      queue_state: 'DEMAND_COMPILED_TRACEABILITY_BINDING_REQUIRED',
      acquisition_authorized: false
    };
    if (!byCategory.has(p.category_id)) byCategory.set(p.category_id, []);
    byCategory.get(p.category_id).push(rec);
  }
}

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
let total = 0, roleAssignments = 0, floorSum = 0;
const shards = [];
for (const [categoryId, records] of [...byCategory.entries()].sort()) {
  const payload = {
    id: `product-linked-targeted-asi-queue-${categoryId}-v1`, version:'1.0.0', category_id: categoryId,
    status:'DEMAND_COMPILED_TRACEABILITY_BINDING_REQUIRED', record_count: records.length, records,
    acquisition_authorized:false, production:'HOLD'
  };
  const text = JSON.stringify(payload);
  const file = `${categoryId}.json`;
  fs.writeFileSync(path.join(outputDir, file), text);
  total += records.length;
  roleAssignments += records.reduce((n,r)=>n+r.required_source_roles.length,0);
  floorSum += records.reduce((n,r)=>n+r.independent_family_floor,0);
  shards.push({category_id:categoryId,file,record_count:records.length,sha256:sha(text)});
}

const expectedProducts = Number(registry.named_anchor_product_count || 0);
const expectedDemand = expectedProducts * mappings.length;
if (expectedProducts !== 160) throw new Error(`Expected 160 current bootstrap products, got ${expectedProducts}`);
if (total !== expectedDemand) throw new Error(`Demand mismatch: expected ${expectedDemand}, got ${total}`);
if (shards.length !== 8) throw new Error(`Expected 8 category shards, got ${shards.length}`);

const manifest = {
  id:'product-linked-targeted-asi-queue-bootstrap-manifest-v1', version:'1.0.0',
  status:'MATERIALIZED_DEMAND_COMPILED_TRACEABILITY_BINDING_REQUIRED',
  input_registry_id: registry.id, input_registry_fingerprint: registry.fingerprint,
  named_products: expectedProducts, planning_market_cells: expectedProducts,
  demand_records: total, required_source_role_assignments: roleAssignments,
  naive_independent_family_floor_sum_not_deduplicated: floorSum,
  note:'The family-floor sum is workload demand, not a Source target. One qualified independent family may satisfy multiple Product×Cell×Assertion demands.',
  north_star:{autonomous:'PASS',global:'AMBER_REGION_LANGUAGE_BINDING_REQUIRED',irreplaceable_value:'AMBER_DECISION_TRACEABILITY_BINDING_REQUIRED'},
  discovery_active:false, acquisition_authorized:false, production:'HOLD', shards
};
fs.writeFileSync(path.join(outputDir,'manifest.json'), JSON.stringify(manifest,null,2));
console.log(JSON.stringify({products:expectedProducts,demand_records:total,role_assignments:roleAssignments,family_floor_workload:floorSum,shards:shards.length},null,2));
