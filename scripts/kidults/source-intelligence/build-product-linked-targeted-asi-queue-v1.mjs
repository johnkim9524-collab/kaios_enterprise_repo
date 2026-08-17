#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const inputDir = process.env.INPUT_DIR || process.argv[2] || 'input';
const outputDir = process.env.OUTPUT_DIR || process.argv[3] || 'out';
const registryPath = path.join(inputDir, 'category-representative-product-registry-v1.json');
const topologyPath = 'coordination/kidults/product/global-market-cell-region-language-topology-v1.json';
if (!fs.existsSync(registryPath)) throw new Error(`Missing registry: ${registryPath}`);
if (!fs.existsSync(topologyPath)) throw new Error(`Missing Global topology: ${topologyPath}`);
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const topology = JSON.parse(fs.readFileSync(topologyPath, 'utf8'));
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

const valueMap = {
  IDENTITY:{value_products:['OBJECT_INTELLIGENCE_PASSPORT'],decisions:['VERIFY_OBJECT','UNDERSTAND_EDITION_VARIANT']},
  SPECIFICATION_OR_VARIANT:{value_products:['OBJECT_INTELLIGENCE_PASSPORT','SCARCITY_AND_AVAILABILITY_VIEW'],decisions:['UNDERSTAND_EDITION_VARIANT','WHICH_VARIANT_MATTERS']},
  AUTHENTICITY:{value_products:['OBJECT_INTELLIGENCE_PASSPORT'],decisions:['VERIFY_OBJECT','ASSESS_PROVENANCE_AND_CONDITION']},
  PROVENANCE:{value_products:['OBJECT_INTELLIGENCE_PASSPORT'],decisions:['ASSESS_PROVENANCE_AND_CONDITION','VERIFY_OBJECT']},
  CONDITION_OR_ORIGINALITY:{value_products:['OBJECT_INTELLIGENCE_PASSPORT','COMPARABLE_MARKET_VIEW'],decisions:['ASSESS_PROVENANCE_AND_CONDITION','WHAT_IS_TRULY_COMPARABLE','HOW_MUCH_TO_PAY']},
  SCARCITY_OR_PRODUCTION:{value_products:['SCARCITY_AND_AVAILABILITY_VIEW'],decisions:['WHAT_IS_RARE','WHAT_IS_AVAILABLE','WHICH_VARIANT_MATTERS']},
  SOLD_TRANSACTION:{value_products:['COMPARABLE_MARKET_VIEW','LIQUIDITY_AND_EXIT_RISK'],decisions:['HOW_MUCH_TO_PAY','WHAT_IS_TRULY_COMPARABLE','BUY_OR_SELL','CAN_I_EXIT','HOW_LONG_WILL_IT_TAKE','WHAT_DISCOUNT_IS_REQUIRED']},
  CULTURE_OR_CANON:{value_products:['MARKET_MOMENTUM_AND_OPPORTUNITY','DYNAMIC_MARKET_STRUCTURE'],decisions:['WHAT_TO_FOLLOW','WHICH_MARKET_IS_EMERGING','WHICH_VERTICAL_EXISTS','WHAT_TO_SPLIT_OR_MERGE','WHICH_CATEGORY_TO_ENTER']}
};

const byCategory = new Map();
const scopeIds = new Set();
for (const p of registry.records || []) {
  const geo = topology.scopes?.[p.collection_scope_id];
  if (!geo || !Array.isArray(geo.regions) || geo.regions.length < 1 || !Array.isArray(geo.languages) || geo.languages.length < 1) {
    throw new Error(`Missing Global region/language binding for ${p.collection_scope_id}`);
  }
  scopeIds.add(p.collection_scope_id);
  for (const [gap, roles, floor] of mappings) {
    const trace = valueMap[gap];
    if (!trace) throw new Error(`Missing Irreplaceable Value mapping for ${gap}`);
    const rec = {
      demand_instance_id: `demand:${p.representative_product_id}:${gap.toLowerCase()}`,
      representative_product_id: p.representative_product_id,
      category_id: p.category_id,
      collection_scope_id: p.collection_scope_id,
      market_cell_id: `pmc:${p.representative_product_id}:global-planning-v1`,
      market_cell_state: 'PLANNING_TOPOLOGY_BOUND_NOT_QUALIFIED',
      assertion_id: `assertion:${p.representative_product_id}:${gap.toLowerCase()}`,
      evidence_gap_class: gap,
      required_source_roles: roles,
      independent_family_floor: floor,
      target_regions: geo.regions,
      target_languages: geo.languages,
      global_topology_state: 'BOUND_SCOPE_PLANNING_TOPOLOGY',
      empirical_global_coverage_state: 'PENDING_DISCOVERY_AND_QUALIFICATION',
      rights_requirement: 'EXPLICIT_REQUIRED',
      owner_lineage_diversity_requirement: 'INDEPENDENT_FAMILY_COUNT_NO_ALIAS_INFLATION',
      freshness_requirement: 'ROLE_SPECIFIC_FROM_PRODUCT_POLICY',
      decision_traceability: {state:'BOUND', decisions:trace.decisions},
      irreplaceable_value_traceability: {state:'BOUND', value_products:trace.value_products, source_contract:'irreplaceable-value-to-data-scope-contract-v2'},
      queue_state: 'DISCOVERY_READY',
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
    id: `product-linked-targeted-asi-queue-${categoryId}-v1`, version:'1.2.0', category_id: categoryId,
    status:'DISCOVERY_READY_GLOBAL_PLANNING_TOPOLOGY_BOUND', record_count: records.length, records,
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
if (scopeIds.size !== 32) throw new Error(`Expected 32 scope bindings, got ${scopeIds.size}`);

const manifest = {
  id:'product-linked-targeted-asi-queue-bootstrap-manifest-v1', version:'1.2.0',
  status:'MATERIALIZED_DISCOVERY_READY_GLOBAL_PLANNING_TOPOLOGY_BOUND',
  input_registry_id: registry.id, input_registry_fingerprint: registry.fingerprint,
  global_topology_id: topology.id,
  named_products: expectedProducts, planning_market_cells: expectedProducts, bound_scopes:scopeIds.size,
  demand_records: total, required_source_role_assignments: roleAssignments,
  naive_independent_family_floor_sum_not_deduplicated: floorSum,
  note:'The family-floor sum is workload demand, not a Source target. Empirical Global representativeness remains pending discovery and qualification.',
  north_star:{autonomous:'PASS',global:'PASS_PLANNING_TOPOLOGY_EMPIRICAL_PENDING',irreplaceable_value:'PASS'},
  decision_traceability_rows: total,
  irreplaceable_value_traceability_rows: total,
  region_language_bound_rows: total,
  discovery_active:true, acquisition_authorized:false, production:'HOLD', shards
};
fs.writeFileSync(path.join(outputDir,'manifest.json'), JSON.stringify(manifest,null,2));
console.log(JSON.stringify({products:expectedProducts,bound_scopes:scopeIds.size,demand_records:total,region_language_bound_rows:total,north_star:manifest.north_star,discovery_active:manifest.discovery_active,shards:shards.length},null,2));
