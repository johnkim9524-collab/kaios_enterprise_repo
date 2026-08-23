#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const resolve=p=>path.isAbsolute(p)?p:path.join(root,p);
const readText=p=>fs.readFileSync(resolve(p),'utf8');
const readJson=p=>JSON.parse(readText(p));
const fail=m=>{throw new Error(m)};
const assert=(c,m)=>{if(!c)fail(m)};

const files={
  direction:'coordination/kidults/source-intelligence/asi-sourcing-direction-contract-v2.json',
  platform:'coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json',
  mesh:'coordination/kidults/source-intelligence/global-source-mesh-contract-v1.json',
  registry:'coordination/kidults/source-intelligence/asi-sourcing-direction-registry-v2.json',
  doc:'docs/kidults/asi/asi-sourcing-direction-v2.md',
  meshWorkflow:'.github/workflows/kidults-global-source-mesh-v1.yml',
  scaleWorkflow:'.github/workflows/kidults-asi-source-fabric-scale-pi1.yml'
};

for(const [name,p] of Object.entries(files)){
  assert(fs.existsSync(resolve(p)),`MISSING_${name.toUpperCase()}:${p}`);
}

const direction=readJson(files.direction);
const platform=readJson(files.platform);
const mesh=readJson(files.mesh);
const registry=readJson(files.registry);
const doc=readText(files.doc);
const meshWorkflow=readText(files.meshWorkflow);
const scaleWorkflow=readText(files.scaleWorkflow);

const order=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
const expectedModel='FOUR_AXIS_HARD_FLOOR_THEN_EXPECTED_INTELLIGENCE_GAIN_PER_TOTAL_COST';

assert(direction.id==='kidults-asi-sourcing-direction-contract-v2','DIRECTION_ID');
assert(direction.version==='2.0.0','DIRECTION_VERSION');
assert(direction.status==='ACTIVE_MANDATORY_FAIL_CLOSED','DIRECTION_STATUS');
assert(direction.owner==='KPMO','DIRECTION_OWNER');
assert(direction.precedence==='ASI_SOURCING_DIRECTION_AUTHORITY','DIRECTION_PRECEDENCE');
assert(JSON.stringify(direction.platform_constitution?.ordered_principles)===JSON.stringify(order),'DIRECTION_ORDER');
assert(direction.platform_constitution?.child_rule_can_weaken_or_reorder===false,'DIRECTION_CHILD_WEAKENING');
assert(direction.platform_constitution?.self_exemption_allowed===false,'DIRECTION_SELF_EXEMPTION');
assert(direction.program_binding?.directional_precedence===true,'PROGRAM_BINDING_PRECEDENCE');

assert(JSON.stringify(platform.constitutional_order)===JSON.stringify(order),'PLATFORM_ORDER');
assert(platform.precedence==='HIGHEST_PLATFORM_OPERATING_PRINCIPLES','PLATFORM_PRECEDENCE');
assert(platform.autonomous_activation_rule?.manual_only_normal_activation_forbidden===true,'PLATFORM_AUTONOMOUS_TRIGGER');

assert(JSON.stringify(Object.keys(direction.directional_pillars))===JSON.stringify(order),'PILLAR_KEYS_OR_ORDER');
for(const p of order){
  const pillar=direction.directional_pillars[p];
  assert(typeof pillar.objective==='string'&&pillar.objective.length>40,`WEAK_PILLAR_OBJECTIVE:${p}`);
}

assert(direction.sourcing_target?.universe==='GLOBAL_ANY_LAWFUL_PUBLIC_OR_AUTHORIZED_SOURCE','GLOBAL_TARGET');
assert(direction.sourcing_target?.whitelist_is_not_the_universe===true,'WHITELIST_BOUNDARY');
assert(direction.sourcing_target?.provider_list_is_not_the_strategy===true,'PROVIDER_LIST_BOUNDARY');
assert(direction.sourcing_target?.numeric_site_count_is_not_completion===true,'SITE_COUNT_BOUNDARY');
assert(direction.sourcing_target?.record_count_is_not_intelligence===true,'RECORD_COUNT_BOUNDARY');

assert(direction.source_selection_model?.model===expectedModel,'SELECTION_MODEL');
assert(JSON.stringify(direction.source_selection_model?.four_axis_vector)===JSON.stringify(order),'SELECTION_VECTOR');
assert(direction.source_selection_model?.single_composite_score_can_override_hard_floor===false,'COMPOSITE_OVERRIDE');
assert(direction.source_selection_model?.minimum_each_direction>=1,'DIRECTION_FLOOR');
assert(direction.source_selection_model?.priority_score_is_advisory_only===true,'PRIORITY_ADVISORY');
assert(direction.source_selection_model?.priority_score_cannot_create_rights_admission_or_claim===true,'PRIORITY_PERMISSION_BOUNDARY');
assert(direction.source_selection_model?.bounded_exploration?.cannot_bypass_four_axis_floor_or_rights===true,'EXPLORATION_BOUNDARY');

const requiredCycle=[
  'CUSTOMER_OR_EXECUTIVE_DECISION_DEMAND',
  'INTELLIGENCE_QUESTION',
  'CLAIM_AND_UNKNOWN_REGISTRY',
  'EVIDENCE_REQUIREMENT',
  'GLOBAL_GAP_MAP',
  'GLOBAL_SOURCE_UNIVERSE_GENERATION',
  'FOUR_AXIS_SCREENING',
  'RIGHTS_SEMANTICS_AND_TECHNICAL_PREFLIGHT',
  'EXPECTED_INTELLIGENCE_GAIN_AND_COST_PRIORITY',
  'GOVERNED_DISCOVERY_OR_COLLECTION',
  'GATE1_SOURCE_SAFETY',
  'GATE2_INDEPENDENT_REVERIFICATION',
  'GATE3_PURPOSE_SPECIFIC_ADMISSION',
  'CANONICAL_GRAPH_BINDING',
  'UNKNOWN_REDUCTION_AND_VALUE_GAIN_MEASUREMENT',
  'FEEDBACK_REPRIORITIZATION_REPLACEMENT_OR_RETIREMENT'
];
assert(JSON.stringify(direction.canonical_sourcing_cycle)===JSON.stringify(requiredCycle),'CANONICAL_CYCLE');

const requiredReceiptFields=[
  'SOURCE_IDENTITY',
  'OWNER_AND_FACTUAL_ORIGIN',
  'DISCOVERY_METHOD',
  'SELECTION_REASON',
  'EVIDENCE_CLASS_AND_SOURCE_ROLE',
  'RIGHTS_BY_PURPOSE',
  'ACCESS_AND_COST_STATE',
  'FRESHNESS_AND_TIME_SEMANTICS',
  'PROVENANCE_AND_LINEAGE',
  'CLAIM_CEILING',
  'CONFIDENCE_AND_UNCERTAINTY',
  'TRANSFORMATIONS_AND_DEPENDENCIES',
  'PROVIDER_HEALTH',
  'DECISION_AND_REPLACEMENT_RATIONALE',
  'EVIDENCE_REFS'
];
const receiptFields=direction.directional_pillars.TRANSPARENT.required_source_receipt_fields;
assert(JSON.stringify(receiptFields)===JSON.stringify(requiredReceiptFields),'TRANSPARENT_RECEIPT_FIELDS');

assert(direction.rights_and_semantic_boundaries?.unknown_rights_behavior==='BLOCK_COLLECTION_DERIVATION_DISPLAY_AND_REDISTRIBUTION','UNKNOWN_RIGHTS_BOUNDARY');
for(const [k,v] of Object.entries({
  discovery_is_not_collection:true,
  collection_is_not_admission:true,
  admission_is_not_claim:true,
  source_count_is_not_coverage:true,
  listing_is_not_sold:true,
  attention_is_not_demand:true,
  scarcity_is_not_liquidity:true,
  historical_is_not_current:true,
  field_and_purpose_specific_rights_required:true
})){
  assert(direction.rights_and_semantic_boundaries?.[k]===v,`RIGHTS_SEMANTIC_BOUNDARY:${k}`);
}

for(const p of order){
  assert(Array.isArray(direction.required_metrics?.[p])&&direction.required_metrics[p].length>=4,`MISSING_METRICS:${p}`);
}
for(const nonGoal of [
  'MAXIMIZE_SOURCE_COUNT',
  'MAXIMIZE_PROVIDER_COUNT',
  'MAXIMIZE_RAW_RECORD_COUNT',
  'COPY_EXTERNAL_DATA_AS_THE_MOAT',
  'SELECT_A_SINGLE_GLOBAL_TRUTH_PROVIDER',
  'TREAT_SYNTHETIC_CAPACITY_AS_EMPIRICAL_COMPLETION',
  'USE_A_STATIC_SOURCE_LIST_AS_THE_GLOBAL_UNIVERSE'
]){
  assert(direction.non_goals?.includes(nonGoal),`MISSING_NON_GOAL:${nonGoal}`);
}
assert(direction.public_release==='HOLD'&&direction.production==='HOLD','DIRECTION_RELEASE_BOUNDARY');

assert(mesh.sourcing_direction_contract===files.direction,'MESH_DIRECTION_BINDING');
assert(JSON.stringify(mesh.sourcing_direction_order)===JSON.stringify(order),'MESH_DIRECTION_ORDER');
assert(mesh.source_selection_model===expectedModel,'MESH_SELECTION_MODEL');
assert(mesh.source_universe_target===direction.sourcing_target.universe,'MESH_GLOBAL_TARGET');
assert(mesh.source_count_is_not_goal===true,'MESH_SOURCE_COUNT_GOAL');
assert(mesh.provider_first_selection_forbidden===true,'MESH_PROVIDER_FIRST');
assert(mesh.priority_score_is_tiebreaker_only===true,'MESH_PRIORITY_ROLE');
assert(mesh.priority_score_cannot_create_rights_admission_or_claim===true,'MESH_PRIORITY_BOUNDARY');
assert(mesh.minimum_each_direction===direction.source_selection_model.minimum_each_direction,'MESH_FLOOR_MISMATCH');
assert(JSON.stringify(mesh.required_source_selection_receipt_fields)===JSON.stringify(requiredReceiptFields),'MESH_RECEIPT_FIELDS');

for(const [e,t] of Object.entries(mesh.lane_templates??{})){
  for(const k of ['autonomy','global_marginal_coverage','irreplaceable_value_gain','transparency_readiness','expected_cost','decision_criticality']){
    assert(Number.isFinite(Number(t[k])),`MESH_LANE_FIELD:${e}:${k}`);
  }
}
for(const rule of [
  'AUTONOMOUS_REQUIRES_REGISTERED_EXECUTION_PATH',
  'GLOBAL_REQUIRES_EMPIRICAL_MARGINAL_COVERAGE',
  'IRREPLACEABLE_VALUE_MUST_ACCRUE_TO_KIDULTS_OWNED_INTELLIGENCE_ASSETS',
  'TRANSPARENT_SOURCE_SELECTION_REQUIRES_REASON_AND_EVIDENCE_RECEIPT',
  'SOURCE_COUNT_IS_NOT_INTELLIGENCE',
  'PROVIDER_LIST_IS_NOT_SOURCE_STRATEGY',
  'WHITELIST_IS_NOT_THE_GLOBAL_UNIVERSE'
]){
  assert(mesh.hard_rules?.includes(rule),`MESH_MISSING_RULE:${rule}`);
}

assert(registry.id==='kidults-asi-sourcing-direction-registry-v2','REGISTRY_ID');
assert(registry.version==='2.0.0','REGISTRY_VERSION');
assert(registry.owner==='KPMO','REGISTRY_OWNER');
assert(JSON.stringify(registry.constitutional_order)===JSON.stringify(order),'REGISTRY_DIRECTION_ORDER');
assert(registry.registered_assets?.authoritative_contract===files.direction,'REGISTRY_CONTRACT_PATH');
assert(registry.registered_assets?.global_source_mesh_contract===files.mesh,'REGISTRY_MESH_PATH');
assert(registry.registered_assets?.human_policy===files.doc,'REGISTRY_DOC_PATH');
assert(registry.registered_assets?.validator==='scripts/kidults/source-intelligence/validate-asi-sourcing-direction-v2.mjs','REGISTRY_VALIDATOR_PATH');
assert(registry.registered_assets?.governance_workflow==='.github/workflows/kidults-asi-sourcing-direction-v2.yml','REGISTRY_GOVERNANCE_WORKFLOW');
assert(registry.registered_assets?.planning_workflow===files.meshWorkflow,'REGISTRY_PLANNING_WORKFLOW');
assert(registry.registered_assets?.scale_workflow===files.scaleWorkflow,'REGISTRY_SCALE_WORKFLOW');
assert(registry.mandatory_inheritance?.child_rule_can_weaken_or_reorder===false,'REGISTRY_CHILD_WEAKENING');
assert(registry.mandatory_inheritance?.self_exemption_allowed===false,'REGISTRY_SELF_EXEMPTION');
assert(registry.source_strategy_boundaries?.source_count_is_not_goal===true,'REGISTRY_SOURCE_COUNT');
assert(registry.source_strategy_boundaries?.provider_list_is_not_strategy===true,'REGISTRY_PROVIDER_LIST');
assert(registry.source_strategy_boundaries?.priority_score_is_not_permission===true,'REGISTRY_PRIORITY_PERMISSION');
assert(registry.public_release==='HOLD'&&registry.production==='HOLD','REGISTRY_RELEASE_BOUNDARY');

for(const marker of [
  '# KIDULTS ASI Sourcing Direction v2',
  '**Autonomous**',
  '**Global**',
  '**Irreplaceable Value**',
  '**Transparent**',
  'Source count ≠ Coverage',
  'Provider count ≠ Global',
  'Expected decision-relevant unknown reduction'
]){
  assert(doc.includes(marker),`DOC_MISSING_MARKER:${marker}`);
}

for(const marker of [
  'validate-asi-sourcing-direction-v2.mjs',
  'asi-sourcing-direction-contract-v2.json',
  'build-global-source-mesh-v1.mjs',
  'Emit KPMO sourcing direction receipt'
]){
  assert(meshWorkflow.includes(marker),`MESH_WORKFLOW_MISSING:${marker}`);
}
for(const marker of ['workflow_dispatch:','schedule:','push:']){
  assert(scaleWorkflow.includes(marker),`SCALE_WORKFLOW_AUTONOMY:${marker}`);
}
for(const marker of ['autonomous_effect','global_effect','irreplaceable_value_effect','transparency_effect']){
  assert(scaleWorkflow.includes(marker),`SCALE_RECEIPT_MISSING:${marker}`);
}

const meshArg=process.argv.indexOf('--mesh');
let meshValidation=null;
if(meshArg>=0){
  const meshPath=process.argv[meshArg+1];
  assert(meshPath,'MESH_PATH_REQUIRED');
  const out=readJson(meshPath);
  assert(out.id==='kidults-global-source-mesh-v1','OUTPUT_ID');
  assert(out.version==='1.1.0','OUTPUT_VERSION');
  assert(JSON.stringify(out.sourcing_direction_order)===JSON.stringify(order),'OUTPUT_DIRECTION_ORDER');
  assert(out.source_selection_model===expectedModel,'OUTPUT_SELECTION_MODEL');
  assert(out.source_count_is_not_goal===true&&out.provider_first_selection_forbidden===true,'OUTPUT_STRATEGY_BOUNDARY');
  assert(out.market_cell_count===768&&out.scope_count===32&&out.evidence_class_count===8,'OUTPUT_COVERAGE');
  assert(out.direction_floor_pass_count===out.market_cell_count,'OUTPUT_DIRECTION_FLOOR');
  assert(Array.isArray(out.market_cells)&&out.market_cells.length===768,'OUTPUT_CELLS');
  for(const cell of out.market_cells){
    const v=cell.sourcing_direction_vector;
    assert(v&&Object.keys(v).length===4,'OUTPUT_VECTOR');
    for(const k of ['autonomous','global','irreplaceable_value','transparent']){
      assert(Number(v[k])>=Number(direction.source_selection_model.minimum_each_direction),`OUTPUT_VECTOR_FLOOR:${cell.market_cell_id}:${k}`);
    }
    assert(cell.direction_floor_pass===true,'OUTPUT_FLOOR_PASS');
    assert(cell.priority_model_role==='ADVISORY_TIEBREAKER_ONLY','OUTPUT_PRIORITY_ROLE');
    assert(Array.isArray(cell.priority_rationale)&&cell.priority_rationale.length>=9,'OUTPUT_RATIONALE');
    assert(cell.named_provider_selected===false,'OUTPUT_PROVIDER_SELECTION');
    assert(cell.rights_admitted===false&&cell.evidence_admitted===false&&cell.collection_authorized===false&&cell.claim_authorized===false,'OUTPUT_PERMISSION_PROMOTION');
    assert(cell.public_release==='HOLD'&&cell.production==='HOLD','OUTPUT_RELEASE_BOUNDARY');
  }
  meshValidation={
    market_cells:out.market_cell_count,
    direction_floor_pass_count:out.direction_floor_pass_count,
    source_hash_sha256:out.source_hash_sha256
  };
}

console.log(JSON.stringify({
  id:'kidults-asi-sourcing-direction-validation-v2',
  version:'2.0.0',
  state:'VERIFIED_PASS',
  sourcing_direction_order:order,
  source_selection_model:expectedModel,
  global_source_universe:direction.sourcing_target.universe,
  source_count_is_not_goal:true,
  provider_first_selection_forbidden:true,
  manual_only_normal_activation_forbidden:true,
  transparent_receipt_field_count:requiredReceiptFields.length,
  mesh_validation:meshValidation,
  public_release:'HOLD',
  production:'HOLD'
},null,2));
