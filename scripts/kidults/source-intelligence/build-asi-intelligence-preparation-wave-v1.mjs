#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  meshPath = '/tmp/kidults-global-source-mesh-v1.json',
  baselinePath = 'coordination/kidults/kpmo/verified-intelligence-surface-baseline-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-intelligence-preparation-wave-v1.json',
  outputDir = '/tmp/kidults-asi-intelligence-preparation-wave-v1'
] = process.argv.slice(2);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const writeJson = async (name, value) => {
  const content = stableJson(value);
  const filePath = path.join(outputDir, name);
  await fs.writeFile(filePath, content);
  return { name, path: filePath, sha256: sha256(content), bytes: Buffer.byteLength(content) };
};
const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);
const groupBy = (values, keyFn) => {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
};

const mesh = await readJson(meshPath);
const baseline = await readJson(baselinePath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

if (mesh.id !== 'kidults-global-source-mesh-v1' || mesh.version !== '1.1.0') throw new Error('GLOBAL_SOURCE_MESH_VERSION_INVALID');
if (mesh.market_cell_count !== 768 || mesh.market_cells?.length !== 768) throw new Error('GLOBAL_SOURCE_MESH_CELL_COUNT_INVALID');
if (mesh.direction_floor_pass_count !== 768) throw new Error('GLOBAL_SOURCE_MESH_DIRECTION_FLOOR_INCOMPLETE');
if (JSON.stringify(mesh.sourcing_direction_order) !== JSON.stringify(principles)) throw new Error('GLOBAL_SOURCE_MESH_PRINCIPLE_ORDER_INVALID');
if (baseline.id !== 'kidults-verified-intelligence-surface-baseline-v1') throw new Error('VERIFIED_SURFACE_BASELINE_INVALID');
if (contract.id !== 'kidults-asi-intelligence-preparation-wave-v1' || contract.version !== '1.0.0') throw new Error('PREPARATION_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('PREPARATION_PRINCIPLE_ORDER_INVALID');
if (contract.modules?.length !== 8 || contract.required_outputs?.length !== 9) throw new Error('PREPARATION_MODULE_OR_OUTPUT_COUNT_INVALID');
if (contract.truth_boundary?.executes_external_collection !== false || contract.truth_boundary?.creates_collection_right !== false) throw new Error('PREPARATION_SIDE_EFFECT_BOUNDARY_INVALID');

await fs.mkdir(outputDir, { recursive: true });

const criticalEvidenceClasses = new Set([
  'CURRENT_SOLD_TRANSACTION',
  'LIQUIDITY_TIME_TO_SALE_EXPOSURE'
]);
const independenceSensitive = new Set([
  'CURRENT_SOLD_TRANSACTION',
  'LIQUIDITY_TIME_TO_SALE_EXPOSURE',
  'SCARCITY_POPULATION_SUPPLY',
  'HISTORICAL_TRANSACTION_PROVENANCE'
]);
const marketSemanticSensitive = new Set([
  'CURRENT_SOLD_TRANSACTION',
  'LIQUIDITY_TIME_TO_SALE_EXPOSURE',
  'LISTING_AVAILABILITY',
  'SCARCITY_POPULATION_SUPPLY',
  'SENTIMENT_ATTENTION_CONTEXT'
]);
const sortedCells = [...mesh.market_cells].sort((a, b) => a.market_cell_id.localeCompare(b.market_cell_id));

const unknownRecords = sortedCells.map((cell) => {
  const unknownTypes = [];
  if (!cell.rights_admitted) unknownTypes.push('RIGHTS_UNKNOWN');
  if (!cell.evidence_admitted) unknownTypes.push('EVIDENCE_MISSING');
  if (!cell.named_provider_selected) unknownTypes.push('SOURCE_ORIGIN_UNKNOWN');
  if (!cell.evidence_admitted) unknownTypes.push('FRESHNESS_UNKNOWN');
  if (!cell.evidence_admitted) unknownTypes.push('REPRESENTATIVENESS_UNKNOWN');
  if (independenceSensitive.has(cell.evidence_class)) unknownTypes.push('INDEPENDENCE_UNKNOWN');
  if (marketSemanticSensitive.has(cell.evidence_class)) unknownTypes.push('SEMANTIC_UNKNOWN');
  if (/GAP|DISCOVERY_ONLY|SCREENING_REQUIRED/.test(cell.source_lane_state)) unknownTypes.push('COVERAGE_UNKNOWN');
  const weightedDebt = round(
    Number(cell.expected_intelligence_gain_score) *
    (1 + Number(cell.dependency_concentration_risk) / 5) *
    (1 + Number(cell.decision_criticality) / 10)
  );
  return {
    unknown_id: `unknown::${cell.market_cell_id}`,
    market_cell_id: cell.market_cell_id,
    state: 'OPEN',
    scope_id: cell.scope_id,
    scope_name: cell.scope_name,
    domain: cell.domain,
    archetype: cell.archetype,
    region: cell.region,
    language_rule: cell.language_rule,
    evidence_class: cell.evidence_class,
    source_lane_class: cell.source_lane_class,
    source_lane_state: cell.source_lane_state,
    unknown_types: [...new Set(unknownTypes)].sort(),
    weighted_unknown_debt: weightedDebt,
    expected_unknown_reduction_score: cell.expected_unknown_reduction_score,
    expected_intelligence_gain_score: cell.expected_intelligence_gain_score,
    dependency_concentration_risk: cell.dependency_concentration_risk,
    decision_criticality: cell.decision_criticality,
    claim_ceiling: cell.claim_ceiling,
    blocked_claim: cell.cannot_yet_claim,
    sourcing_direction_vector: cell.sourcing_direction_vector,
    direction_floor_pass: cell.direction_floor_pass,
    evidence_refs: [`global-source-mesh:${mesh.source_hash_sha256}`],
    missing_is_zero: false,
    collection_authorized: false,
    evidence_admitted: false,
    claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
});

const unknownRegistry = {
  id: 'kidults-asi-unknown-registry-v1',
  version: '1.0.0',
  state: 'ACTIVE_OPEN_UNKNOWN_DEBT',
  platform_principles: principles,
  source_mesh_hash: mesh.source_hash_sha256,
  unknown_record_count: unknownRecords.length,
  total_weighted_unknown_debt: round(sum(unknownRecords.map((item) => item.weighted_unknown_debt))),
  open_unknown_count: unknownRecords.filter((item) => item.state === 'OPEN').length,
  missing_to_zero_count: 0,
  records: unknownRecords,
  truth_boundary: 'Every entry is an unresolved evidence demand. No entry is a negative fact, zero observation, admitted evidence, or market claim.',
  public_release: 'HOLD',
  production: 'HOLD'
};

const summarizeGap = (groups, dimension) => [...groups.entries()]
  .map(([key, records]) => ({
    [dimension]: key,
    unknown_cells: records.length,
    weighted_unknown_debt: round(sum(records.map((item) => item.weighted_unknown_debt))),
    critical_cells: records.filter((item) => criticalEvidenceClasses.has(item.evidence_class)).length,
    top_evidence_classes: [...groupBy(records, (item) => item.evidence_class).entries()]
      .map(([evidenceClass, subset]) => ({
        evidence_class: evidenceClass,
        unknown_cells: subset.length,
        weighted_unknown_debt: round(sum(subset.map((item) => item.weighted_unknown_debt)))
      }))
      .sort((a, b) => b.weighted_unknown_debt - a.weighted_unknown_debt || a.evidence_class.localeCompare(b.evidence_class))
      .slice(0, 3)
  }))
  .sort((a, b) => b.weighted_unknown_debt - a.weighted_unknown_debt || String(a[dimension]).localeCompare(String(b[dimension])));

const intelligenceGapMap = {
  id: 'kidults-asi-intelligence-gap-map-v1',
  version: '1.0.0',
  state: 'ACTIVE_GAP_MAP',
  source_unknown_registry: unknownRegistry.id,
  current_empirical_truth: baseline.current_empirical_truth,
  total_unknown_cells: unknownRecords.length,
  total_weighted_unknown_debt: unknownRegistry.total_weighted_unknown_debt,
  by_evidence_class: summarizeGap(groupBy(unknownRecords, (item) => item.evidence_class), 'evidence_class'),
  by_scope: summarizeGap(groupBy(unknownRecords, (item) => item.scope_id), 'scope_id'),
  by_region: summarizeGap(groupBy(unknownRecords, (item) => item.region), 'region'),
  by_domain: summarizeGap(groupBy(unknownRecords, (item) => item.domain), 'domain'),
  by_archetype: summarizeGap(groupBy(unknownRecords, (item) => item.archetype), 'archetype'),
  top_gap_cells: [...unknownRecords]
    .sort((a, b) => b.weighted_unknown_debt - a.weighted_unknown_debt || a.market_cell_id.localeCompare(b.market_cell_id))
    .slice(0, 64)
    .map((item) => ({
      market_cell_id: item.market_cell_id,
      weighted_unknown_debt: item.weighted_unknown_debt,
      evidence_class: item.evidence_class,
      scope_id: item.scope_id,
      region: item.region,
      blocked_claim: item.blocked_claim
    })),
  collection_computable_cells: Number(baseline.current_empirical_truth?.collection_computable_cells || 0),
  analytical_computable_cells: Number(baseline.current_empirical_truth?.analytical_computable_cells || 0),
  active_market_claim: baseline.current_empirical_truth?.active_market_claim || 'NONE',
  public_release: 'HOLD',
  production: 'HOLD'
};

const missionEvidenceOrder = new Map(contract.mission_policy.top_evidence_classes.map((value, index) => [value, index + 1]));
const missionCells = sortedCells
  .filter((cell) => missionEvidenceOrder.has(cell.evidence_class) && cell.direction_floor_pass)
  .sort((a, b) => {
    const wave = missionEvidenceOrder.get(a.evidence_class) - missionEvidenceOrder.get(b.evidence_class);
    if (wave !== 0) return wave;
    if (b.execution_priority_score !== a.execution_priority_score) return b.execution_priority_score - a.execution_priority_score;
    return a.market_cell_id.localeCompare(b.market_cell_id);
  });
if (missionCells.length !== contract.mission_policy.expected_mission_count) {
  throw new Error(`MISSION_COUNT_INVALID:${missionCells.length}`);
}

const missions = missionCells.map((cell, index) => {
  const roi = round(Number(cell.expected_intelligence_gain_score) /
    (Math.max(1, Number(cell.expected_cost)) * (1 + Number(cell.dependency_concentration_risk) / 5)), 6);
  return {
    mission_id: `mission::${cell.market_cell_id}`,
    sequence: index + 1,
    state: 'QUEUED_READY_FOR_BOUNDED_DISCOVERY_AND_PREFLIGHT',
    execution_mode: 'BOUNDED_DISCOVERY_AND_PREFLIGHT_ONLY',
    priority_wave: missionEvidenceOrder.get(cell.evidence_class),
    market_cell_id: cell.market_cell_id,
    scope_id: cell.scope_id,
    scope_name: cell.scope_name,
    domain: cell.domain,
    archetype: cell.archetype,
    region: cell.region,
    language_rule: cell.language_rule,
    evidence_class: cell.evidence_class,
    source_lane_class: cell.source_lane_class,
    source_lane_state: cell.source_lane_state,
    objective: `Reduce decision-relevant unknown debt for ${cell.scope_name} / ${cell.region} / ${cell.evidence_class}`,
    engine_route: [
      'SOURCE_DISCOVERY_ENGINE',
      'SOURCE_CLASSIFICATION_ENGINE',
      'RIGHTS_AND_COMPLIANCE_RISK_ENGINE',
      'TECHNICAL_ACCESS_AND_SCHEMA_RISK_ENGINE',
      'INDEPENDENCE_AND_REDUNDANCY_ENGINE',
      'ACQUISITION_PLANNER'
    ],
    required_actions: [
      'DISCOVER_PRIMARY_CANDIDATE_LANE',
      'DISCOVER_INDEPENDENT_FALLBACK_LANE',
      'IDENTIFY_FACTUAL_ORIGIN_REPLACEMENT_LANE',
      'RUN_RIGHTS_SEMANTICS_TECHNICAL_PREFLIGHT',
      'EMIT_TRANSPARENT_SOURCE_SELECTION_RECEIPT'
    ],
    required_gates: [
      'GATE1_SOURCE_SAFETY',
      'GATE2_INDEPENDENT_REVERIFICATION',
      'GATE3_PURPOSE_SPECIFIC_ADMISSION'
    ],
    sourcing_direction_vector: cell.sourcing_direction_vector,
    direction_floor_pass: cell.direction_floor_pass,
    expected_unknown_reduction_score: cell.expected_unknown_reduction_score,
    expected_intelligence_gain_score: cell.expected_intelligence_gain_score,
    intelligence_roi_score: roi,
    dependency_concentration_risk: cell.dependency_concentration_risk,
    expected_cost: cell.expected_cost,
    decision_criticality: cell.decision_criticality,
    priority_rationale: cell.priority_rationale,
    claim_ceiling: cell.claim_ceiling,
    collection_authorized: false,
    evidence_admitted: false,
    market_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
});

const autonomousMissionQueue = {
  id: 'kidults-asi-autonomous-mission-queue-v1',
  version: '1.0.0',
  state: 'READY_FOR_AUTOMATIC_BOUNDED_DISCOVERY_AND_PREFLIGHT',
  generation_mode: 'DETERMINISTIC_FROM_CURRENT_GLOBAL_GAP_MAP',
  normal_manual_orchestration_required: false,
  mission_count: missions.length,
  mission_count_by_wave: Object.fromEntries([...missionEvidenceOrder.entries()].map(([evidenceClass, wave]) => [
    String(wave),
    { evidence_class: evidenceClass, mission_count: missions.filter((mission) => mission.priority_wave === wave).length }
  ])),
  missions,
  external_collection_executed: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const factualOriginMinimum = (evidenceClass) => independenceSensitive.has(evidenceClass) ? 3 : 2;
const replacementPlans = missions.map((mission) => ({
  replacement_plan_id: `replaceability::${mission.market_cell_id}`,
  mission_id: mission.mission_id,
  market_cell_id: mission.market_cell_id,
  evidence_class: mission.evidence_class,
  region: mission.region,
  required_operational_slots: [
    {
      slot: 'PRIMARY_CANDIDATE_LANE',
      state: 'UNFILLED_DISCOVERY_REQUIRED',
      named_provider: null,
      source_lane_class: mission.source_lane_class
    },
    {
      slot: 'INDEPENDENT_FALLBACK_LANE',
      state: 'UNFILLED_DISCOVERY_REQUIRED',
      named_provider: null,
      source_lane_class: 'INDEPENDENT_SAME_EVIDENCE_CLASS_ALTERNATIVE'
    },
    {
      slot: 'FACTUAL_ORIGIN_REPLACEMENT_LANE',
      state: 'UNFILLED_DISCOVERY_REQUIRED',
      named_provider: null,
      source_lane_class: 'DISTINCT_FACTUAL_ORIGIN_REPLACEMENT'
    }
  ],
  minimum_independent_factual_origins: factualOriginMinimum(mission.evidence_class),
  dependency_concentration_risk: mission.dependency_concentration_risk,
  replaceability_state: 'REQUIRED_NOT_YET_PROVEN',
  single_provider_mandatory_bottleneck_allowed: false,
  provider_direct_to_truth_index_or_projection_allowed: false,
  external_raw_data_is_owned_moat: false,
  collection_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}));

const providerReplaceabilityPlan = {
  id: 'kidults-asi-provider-replaceability-plan-v1',
  version: '1.0.0',
  state: 'ACTIVE_REPLACEABILITY_REQUIREMENTS',
  mission_count: missions.length,
  required_slots_per_mission: contract.provider_replaceability_policy.minimum_operational_slots_per_mission,
  total_required_operational_slots: replacementPlans.length * contract.provider_replaceability_policy.minimum_operational_slots_per_mission,
  plans: replacementPlans,
  named_provider_selected_count: 0,
  provider_lock_in_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const roiItems = [...missions]
  .sort((a, b) => b.intelligence_roi_score - a.intelligence_roi_score || a.mission_id.localeCompare(b.mission_id))
  .map((mission, index) => ({
    rank: index + 1,
    mission_id: mission.mission_id,
    market_cell_id: mission.market_cell_id,
    scope_id: mission.scope_id,
    domain: mission.domain,
    region: mission.region,
    evidence_class: mission.evidence_class,
    expected_unknown_reduction_score: mission.expected_unknown_reduction_score,
    expected_intelligence_gain_score: mission.expected_intelligence_gain_score,
    expected_cost: mission.expected_cost,
    dependency_concentration_risk: mission.dependency_concentration_risk,
    intelligence_roi_score: mission.intelligence_roi_score,
    score_role: 'ADVISORY_AFTER_HARD_FLOORS_ONLY',
    rights_or_admission_created: false
  }));

const intelligenceRoiPortfolio = {
  id: 'kidults-asi-intelligence-roi-portfolio-v1',
  version: '1.0.0',
  state: 'RANKED_ADVISORY_PORTFOLIO',
  model: contract.roi_model.name,
  formula: contract.roi_model.formula,
  mission_count: roiItems.length,
  top_32: roiItems.slice(0, 32),
  ranked_missions: roiItems,
  hard_floor_applied_before_ranking: true,
  score_can_create_rights_admission_or_claim: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const crossCategoryGroups = groupBy(unknownRecords, (item) => `${item.region}::${item.evidence_class}`);
const crossCategoryHypotheses = [...crossCategoryGroups.entries()]
  .map(([key, records]) => {
    const [region, evidenceClass] = key.split('::');
    const domains = [...new Set(records.map((item) => item.domain))].sort();
    const scopes = [...new Set(records.map((item) => item.scope_id))].sort();
    return {
      hypothesis_id: `cross-category::${region}::${evidenceClass}`,
      state: 'UNVERIFIED_EVIDENCE_DEMAND',
      region,
      evidence_class: evidenceClass,
      distinct_domain_count: domains.length,
      domains,
      scope_count: scopes.length,
      scopes,
      weighted_unknown_debt: round(sum(records.map((item) => item.weighted_unknown_debt))),
      hypothesis: `Test whether comparable ${evidenceClass} evidence patterns across distinct collectible domains in ${region} reveal a shared capital-flow, collector-behavior, or market-structure signal.`,
      required_evidence: [
        'RIGHTS_ADMITTED_EMPIRICAL_EVIDENCE_PER_DOMAIN',
        'TEMPORAL_COHERENCE',
        'DISTINCT_FACTUAL_ORIGINS',
        'SOURCE_REMOVAL_SENSITIVITY',
        'CONFOUNDING_AND_REGIME_TESTS'
      ],
      correlation_is_causation: false,
      hypothesis_is_fact: false,
      market_claim_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
  })
  .sort((a, b) => a.region.localeCompare(b.region) || a.evidence_class.localeCompare(b.evidence_class));

const crossCategoryIntelligenceMap = {
  id: 'kidults-asi-cross-category-intelligence-map-v1',
  version: '1.0.0',
  state: 'HYPOTHESIS_AND_EVIDENCE_DEMAND_ONLY',
  hypothesis_count: crossCategoryHypotheses.length,
  hypotheses: crossCategoryHypotheses,
  verified_cross_category_market_claims: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const domainGroups = groupBy(unknownRecords, (item) => item.domain);
const portfolioDomains = [...domainGroups.entries()]
  .map(([domain, records]) => {
    const domainMissions = missions.filter((mission) => mission.domain === domain);
    const scopeIds = [...new Set(records.map((item) => item.scope_id))].sort();
    const evidenceDebt = [...groupBy(records, (item) => item.evidence_class).entries()]
      .map(([evidenceClass, subset]) => ({
        evidence_class: evidenceClass,
        unknown_cells: subset.length,
        weighted_unknown_debt: round(sum(subset.map((item) => item.weighted_unknown_debt)))
      }))
      .sort((a, b) => b.weighted_unknown_debt - a.weighted_unknown_debt || a.evidence_class.localeCompare(b.evidence_class));
    return {
      domain,
      scope_count: scopeIds.length,
      scope_ids: scopeIds,
      unknown_cells: records.length,
      weighted_unknown_debt: round(sum(records.map((item) => item.weighted_unknown_debt))),
      queued_critical_missions: domainMissions.length,
      top_evidence_gaps: evidenceDebt.slice(0, 3),
      readiness_state: 'NOT_COMPUTABLE_EVIDENCE_GAPS_OPEN',
      portfolio_index_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
  })
  .sort((a, b) => b.weighted_unknown_debt - a.weighted_unknown_debt || a.domain.localeCompare(b.domain));

const portfolioIntelligenceMap = {
  id: 'kidults-asi-portfolio-intelligence-map-v1',
  version: '1.0.0',
  state: 'PORTFOLIO_PREPARATION_NOT_INDEX',
  domain_count: portfolioDomains.length,
  scope_count: 32,
  unknown_cells: unknownRecords.length,
  queued_critical_missions: missions.length,
  domains: portfolioDomains,
  cross_domain_concentration_state: 'UNKNOWN_PENDING_EMPIRICAL_EVIDENCE',
  kidult_500_computed: false,
  kidult_100_computed: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const calibrationObligations = missions.map((mission) => ({
  calibration_id: `calibration::${mission.mission_id}`,
  mission_id: mission.mission_id,
  prediction_version: '1.0.0',
  predicted: {
    unknown_reduction_score: mission.expected_unknown_reduction_score,
    intelligence_gain_score: mission.expected_intelligence_gain_score,
    intelligence_roi_score: mission.intelligence_roi_score,
    global_coverage_gain_cells: 1,
    owned_value_gain_state: 'EXPECTED_IF_CANONICAL_GRAPH_BINDING_SUCCEEDS'
  },
  realized: {
    state: 'WAITING_FOR_EVIDENCE',
    unknown_reduction_score: null,
    intelligence_gain_score: null,
    cost_variance: null,
    source_replacement_resilience: null,
    decision_utility: null,
    evidence_refs: []
  },
  calibration_state: 'PENDING_EXECUTION_AND_EVIDENCE',
  silent_prediction_rewrite_allowed: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}));

const selfCalibrationPlan = {
  id: 'kidults-asi-self-calibration-plan-v1',
  version: '1.0.0',
  state: 'ACTIVE_PREDICTION_OBLIGATIONS_WAITING_FOR_EVIDENCE',
  calibration_dimensions: contract.self_calibration_policy.calibration_dimensions,
  obligation_count: calibrationObligations.length,
  obligations: calibrationObligations,
  realized_results_without_evidence: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const outputs = [];
outputs.push(await writeJson('unknown-registry-v1.json', unknownRegistry));
outputs.push(await writeJson('intelligence-gap-map-v1.json', intelligenceGapMap));
outputs.push(await writeJson('autonomous-mission-queue-v1.json', autonomousMissionQueue));
outputs.push(await writeJson('provider-replaceability-plan-v1.json', providerReplaceabilityPlan));
outputs.push(await writeJson('intelligence-roi-portfolio-v1.json', intelligenceRoiPortfolio));
outputs.push(await writeJson('cross-category-intelligence-map-v1.json', crossCategoryIntelligenceMap));
outputs.push(await writeJson('portfolio-intelligence-map-v1.json', portfolioIntelligenceMap));
outputs.push(await writeJson('self-calibration-plan-v1.json', selfCalibrationPlan));

const manifest = {
  id: 'kidults-asi-intelligence-preparation-manifest-v1',
  version: '1.0.0',
  state: 'PREPARATION_OUTPUTS_GENERATED_AND_READY_FOR_VALIDATION',
  platform_principles: principles,
  canonical_execution_order: contract.canonical_execution_order,
  input_bindings: {
    global_source_mesh: {
      id: mesh.id,
      version: mesh.version,
      source_hash_sha256: mesh.source_hash_sha256,
      market_cell_count: mesh.market_cell_count
    },
    verified_surface_baseline: {
      id: baseline.id,
      version: baseline.version,
      current_empirical_truth: baseline.current_empirical_truth
    },
    contract: {
      id: contract.id,
      version: contract.version,
      sha256: sha256(stableJson(contract))
    }
  },
  results: {
    unknown_records: unknownRecords.length,
    total_weighted_unknown_debt: unknownRegistry.total_weighted_unknown_debt,
    autonomous_missions: missions.length,
    mission_wave_1_current_sold: missions.filter((mission) => mission.priority_wave === 1).length,
    mission_wave_2_liquidity: missions.filter((mission) => mission.priority_wave === 2).length,
    provider_replacement_plans: replacementPlans.length,
    provider_replacement_slots: providerReplaceabilityPlan.total_required_operational_slots,
    roi_ranked_missions: roiItems.length,
    cross_category_hypotheses: crossCategoryHypotheses.length,
    portfolio_domains: portfolioDomains.length,
    calibration_obligations: calibrationObligations.length,
    external_collection_executed: false,
    evidence_admitted: 0,
    market_claims_created: 0
  },
  output_files: outputs,
  autonomous_effect: 'POSITIVE_AUTOMATIC_GAP_TO_MISSION_GENERATION',
  global_effect: 'POSITIVE_768_CELL_AND_ALL_SCOPE_REGION_CRITICAL_MISSION_COVERAGE',
  irreplaceable_value_effect: 'POSITIVE_OWNED_UNKNOWN_GAP_MISSION_REPLACEMENT_ROI_AND_CALIBRATION_ASSETS',
  transparency_effect: 'POSITIVE_DETERMINISTIC_LINEAGE_AND_EXPLICIT_TRUTH_BOUNDARIES',
  public_release: 'HOLD',
  production: 'HOLD'
};
outputs.push(await writeJson('asi-intelligence-preparation-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: 'PREPARATION_WAVE_BUILT',
  unknown_records: unknownRecords.length,
  autonomous_missions: missions.length,
  provider_replacement_slots: providerReplaceabilityPlan.total_required_operational_slots,
  cross_category_hypotheses: crossCategoryHypotheses.length,
  portfolio_domains: portfolioDomains.length,
  calibration_obligations: calibrationObligations.length,
  output_dir: outputDir,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
