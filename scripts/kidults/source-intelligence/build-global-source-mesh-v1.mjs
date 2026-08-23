import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const [
  scopePath='coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json',
  contractPath='coordination/kidults/source-intelligence/global-source-mesh-contract-v1.json',
  output='/tmp/kidults-global-source-mesh-v1.json'
] = process.argv.slice(2);

const scopes = JSON.parse(await fs.readFile(scopePath,'utf8'));
const contract = JSON.parse(await fs.readFile(contractPath,'utf8'));

const requiredDirectionOrder=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
const expectedModel='FOUR_AXIS_HARD_FLOOR_THEN_EXPECTED_INTELLIGENCE_GAIN_PER_TOTAL_COST';

if (scopes.status !== 'CANDIDATE_FOR_CANONICAL' || scopes.scope_count !== 32 || scopes.scopes?.length !== 32) {
  throw new Error('SCOPE_MATRIX_BINDING_INVALID');
}
if (contract.production !== 'HOLD' || contract.public_release !== 'HOLD' || contract.evidence_classes?.length !== 8) {
  throw new Error('SOURCE_MESH_CONTRACT_INVALID');
}
if (JSON.stringify(contract.sourcing_direction_order) !== JSON.stringify(requiredDirectionOrder)) {
  throw new Error('SOURCING_DIRECTION_ORDER_INVALID');
}
if (contract.source_selection_model !== expectedModel) {
  throw new Error('SOURCE_SELECTION_MODEL_INVALID');
}
if (contract.source_count_is_not_goal !== true || contract.provider_first_selection_forbidden !== true || contract.numeric_site_count_is_not_completion !== true) {
  throw new Error('SOURCE_STRATEGY_BOUNDARY_INVALID');
}
if (contract.priority_score_is_tiebreaker_only !== true || contract.priority_score_cannot_create_rights_admission_or_claim !== true) {
  throw new Error('PRIORITY_SCORE_BOUNDARY_INVALID');
}

const unknownReductionByState={
  GAP_UNTIL_ADMITTED:5,
  DISCOVERY_ONLY_UNTIL_ADMITTED:4,
  SCREENING_REQUIRED:3
};

const directionKeys=['autonomous','global','irreplaceable_value','transparent'];
const cells=[];

for (const scope of scopes.scopes) {
  if (!Array.isArray(scope.regions) || scope.regions.length !== 3) {
    throw new Error(`REGION_SET_INVALID:${scope.scope_id}`);
  }
  for (const region of scope.regions) {
    for (const evidenceClass of contract.evidence_classes) {
      const t=contract.lane_templates[evidenceClass];
      if (!t) throw new Error(`MISSING_LANE_TEMPLATE:${evidenceClass}`);
      const vector={
        autonomous:Number(t.autonomy),
        global:Number(t.global_marginal_coverage),
        irreplaceable_value:Number(t.irreplaceable_value_gain),
        transparent:Number(t.transparency_readiness)
      };
      if (Object.values(vector).some(v=>!Number.isFinite(v)||v<1||v>5)) {
        throw new Error(`DIRECTION_VECTOR_INVALID:${evidenceClass}`);
      }
      const floorPass=directionKeys.every(k=>vector[k]>=Number(contract.minimum_each_direction));
      const unknownReduction=unknownReductionByState[t.default_state] ?? 1;
      const expectedIntelligenceGain=Number((t.decision_utility*t.evidence_strength*unknownReduction*t.decision_criticality).toFixed(3));
      const directionalValue=vector.global*vector.irreplaceable_value;
      const costAndRisk=Math.sqrt(Math.max(1,Number(t.expected_cost))*Math.max(1,Number(t.dependency_risk)));
      const priorityRaw=floorPass
        ? (expectedIntelligenceGain*directionalValue)/costAndRisk
        : 0;
      const blockedClaim=t.claim_ceiling.startsWith('NO_') ? t.claim_ceiling : null;
      const rationale=[
        `AUTONOMOUS_${vector.autonomous}_OF_5`,
        `GLOBAL_${vector.global}_OF_5`,
        `IRREPLACEABLE_VALUE_${vector.irreplaceable_value}_OF_5`,
        `TRANSPARENT_${vector.transparent}_OF_5`,
        `UNKNOWN_REDUCTION_${unknownReduction}_OF_5`,
        `RIGHTS_CLARITY_${t.rights_clarity}_OF_5`,
        `DEPENDENCY_RISK_${t.dependency_risk}_OF_5`,
        `EXPECTED_COST_${t.expected_cost}_OF_5`,
        `DECISION_CRITICALITY_${t.decision_criticality}_OF_5`
      ];

      cells.push({
        market_cell_id:`${scope.scope_id}::${region}::${evidenceClass}`,
        scope_id:scope.scope_id,
        scope_name:scope.name,
        domain:scope.domain,
        archetype:scope.archetype,
        region,
        language_rule:scope.language_rule,
        evidence_class:evidenceClass,
        source_lane_class:t.source_lane_class,
        source_lane_state:t.default_state,
        claim_ceiling:t.claim_ceiling,
        cannot_yet_claim:blockedClaim,
        freshness_days:evidenceClass==='IDENTITY_CANONICAL_REFERENCE'
          ? scope.freshness?.authority_days ?? null
          : scope.freshness?.market_days ?? null,
        sourcing_direction_vector:vector,
        direction_floor_pass:floorPass,
        expected_unknown_reduction_score:unknownReduction,
        expected_intelligence_gain_score:expectedIntelligenceGain,
        execution_priority_score:Number(priorityRaw.toFixed(3)),
        priority_model_role:'ADVISORY_TIEBREAKER_ONLY',
        priority_rationale:rationale,
        dependency_concentration_risk:t.dependency_risk,
        expected_cost:t.expected_cost,
        decision_criticality:t.decision_criticality,
        named_provider_selected:false,
        rights_admitted:false,
        evidence_admitted:false,
        collection_authorized:false,
        claim_authorized:false,
        public_release:'HOLD',
        production:'HOLD'
      });
    }
  }
}

if (cells.length !== 32*3*8) throw new Error(`CELL_COUNT_INVALID:${cells.length}`);
const ids=new Set(cells.map(x=>x.market_cell_id));
if (ids.size !== cells.length) throw new Error('CELL_ID_COLLISION');
if (cells.some(x=>x.named_provider_selected || x.rights_admitted || x.evidence_admitted || x.collection_authorized || x.claim_authorized || x.public_release!=='HOLD' || x.production!=='HOLD')) {
  throw new Error('FAIL_CLOSED_DEFAULT_INVALID');
}

const evidenceSummary=Object.fromEntries(contract.evidence_classes.map(e=>{
  const subset=cells.filter(x=>x.evidence_class===e);
  const meanPriority=subset.reduce((a,b)=>a+b.execution_priority_score,0)/subset.length;
  return [e,{
    cells:subset.length,
    gap_cells:subset.filter(x=>/GAP|DISCOVERY_ONLY/.test(x.source_lane_state)).length,
    direction_floor_pass_cells:subset.filter(x=>x.direction_floor_pass).length,
    mean_execution_priority_score:Number(meanPriority.toFixed(3)),
    max_claim_ceiling:contract.lane_templates[e].claim_ceiling
  }];
}));

const rankedEvidenceClasses=[...contract.evidence_classes].sort((a,b)=>
  evidenceSummary[b].mean_execution_priority_score-evidenceSummary[a].mean_execution_priority_score
);

const directionSummary=Object.fromEntries(directionKeys.map(k=>[
  k,
  {
    minimum:Number(contract.minimum_each_direction),
    minimum_observed:Math.min(...cells.map(x=>x.sourcing_direction_vector[k])),
    maximum_observed:Math.max(...cells.map(x=>x.sourcing_direction_vector[k])),
    mean:Number((cells.reduce((a,b)=>a+b.sourcing_direction_vector[k],0)/cells.length).toFixed(3))
  }
]));

const report={
  id:'kidults-global-source-mesh-v1',
  version:'1.1.0',
  parent_issue:549,
  sourcing_direction_contract:contract.sourcing_direction_contract,
  sourcing_direction_order:contract.sourcing_direction_order,
  source_selection_model:contract.source_selection_model,
  source_universe_target:contract.source_universe_target,
  source_count_is_not_goal:true,
  provider_first_selection_forbidden:true,
  priority_score_is_tiebreaker_only:true,
  priority_score_cannot_create_rights_admission_or_claim:true,
  public_release:'HOLD',
  production:'HOLD',
  scope_matrix_status:scopes.status,
  scope_count:32,
  region_slots_per_scope:3,
  evidence_class_count:8,
  market_cell_count:cells.length,
  named_provider_global_selection:false,
  direction_floor_pass_count:cells.filter(x=>x.direction_floor_pass).length,
  direction_summary:directionSummary,
  market_cells:cells,
  evidence_class_summary:evidenceSummary,
  execution_wave_order:rankedEvidenceClasses,
  cannot_yet_claim_summary:[...new Set(cells.map(x=>x.cannot_yet_claim).filter(Boolean))].sort(),
  required_source_selection_receipt_fields:contract.required_source_selection_receipt_fields,
  rules:contract.hard_rules,
  source_hash_sha256:crypto.createHash('sha256').update(JSON.stringify({
    scope_version:scopes.version,
    contract_version:contract.version,
    sourcing_direction_order:contract.sourcing_direction_order,
    cells
  })).digest('hex'),
  truth_boundary:'This is a deterministic four-direction global market-cell/source-lane selection map. It does not admit a named provider or evidence source. Priority is advisory only. Every source must still pass field-by-purpose rights, technical validation, evidence sufficiency, independent reverification and entity-resolution admission before a claim can advance.'
};

await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(`Global Source Mesh PASS: ${report.market_cell_count} cells, ${report.direction_floor_pass_count} four-axis floor passes.`);
console.log(`Sourcing direction: ${report.sourcing_direction_order.join(' > ')}`);
console.log(`Execution waves: ${report.execution_wave_order.join(' > ')}`);
console.log(`Cannot-yet-claim classes: ${report.cannot_yet_claim_summary.join(' | ')}`);
