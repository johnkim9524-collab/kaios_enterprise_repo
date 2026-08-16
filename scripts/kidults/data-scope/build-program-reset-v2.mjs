import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const strategyPath = path.join(root, "coordination", "kidults", "strategy", "agci-os-total-program-strategy-reset-v2.json");
const scalePath = path.join(root, "coordination", "kidults", "data-scope", "category-1000-scale-contract-v1.json");
const fusionPath = path.join(root, "coordination", "kidults", "data-scope", "provider-fusion-contract-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "program-reset-category-1000-v1");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function parseArgs(argv) {
  const config = { output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

export function loadProgramResetContracts() {
  return {
    strategy: readJson(strategyPath),
    scale: readJson(scalePath),
    fusion: readJson(fusionPath)
  };
}

export function buildProgramResetPlan(contracts = loadProgramResetContracts()) {
  const { strategy, scale, fusion } = contracts;
  const generatedAt = strategy.effective_at;

  const categoryPlans = scale.core_domains.map(domain => ({
    core_domain_id: domain.id,
    name: domain.name,
    qualified_object_target: domain.qualified_object_target,
    current_qualified_objects: null,
    current_qualified_objects_status: "NOT_MEASURED",
    minimum_evidence_assertions: domain.minimum_evidence_assertions,
    current_evidence_assertions: null,
    current_evidence_assertions_status: "NOT_MEASURED",
    minimum_market_observations: domain.minimum_market_observations,
    current_market_observations: null,
    current_market_observations_status: "NOT_MEASURED",
    source_pool_targets: {
      discovered_candidates: domain.minimum_source_candidates_discovered,
      deep_assessed_candidates: domain.minimum_source_candidates_deep_assessed,
      rights_access_preflight: scale.source_pool_floor.rights_access_preflight_per_category,
      bounded_live_adapters: scale.source_pool_floor.bounded_live_adapters_per_category,
      minimum_source_roles: domain.minimum_source_roles_covered
    },
    collection_scopes: domain.collection_scopes,
    collection_scope_allocation_mode: "DYNAMIC_PLANNING_ALLOCATION_NOT_INDEX_QUOTA",
    readiness_state: "HOLD_CATEGORY_SCALE_NOT_READY"
  }));

  const categoryScalePlan = {
    id: "category-1000-scale-plan-v1",
    record_type: "category_scale_plan",
    version: "1.0.0",
    status: "PLAN_READY_COLLECTION_NOT_STARTED",
    generated_at: generatedAt,
    strategy_id: strategy.id,
    contract_id: scale.id,
    governing_value: scale.governing_value,
    category_count: categoryPlans.length,
    total_qualified_object_target: categoryPlans.reduce((sum, item) => sum + item.qualified_object_target, 0),
    collection_scope_count: categoryPlans.reduce((sum, item) => sum + item.collection_scopes.length, 0),
    total_evidence_assertion_target: categoryPlans.reduce((sum, item) => sum + item.minimum_evidence_assertions, 0),
    total_market_observation_target: categoryPlans.reduce((sum, item) => sum + item.minimum_market_observations, 0),
    current_counts_are_not_zero: true,
    categories: categoryPlans,
    fixed_index_quota: false,
    dynamic_verticals_downstream: true,
    candidate_r2_authorized: false,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  categoryScalePlan.plan_fingerprint = fingerprint(categoryScalePlan);

  const sourceUniversePlan = {
    id: "global-source-universe-10k-plan-v1",
    record_type: "source_universe_plan",
    version: "1.0.0",
    status: "PLAN_READY_DISCOVERY_NOT_COMPLETE",
    generated_at: generatedAt,
    strategy_id: strategy.id,
    targets: {
      discovered: strategy.scale_targets.global_source_universe_discovery,
      deep_assessed: strategy.scale_targets.deep_source_assessments,
      rights_access_preflight: strategy.scale_targets.rights_access_preflights,
      bounded_live_adapters: strategy.scale_targets.bounded_live_adapters
    },
    current: {
      discovered: null,
      deep_assessed: null,
      rights_access_preflight: null,
      bounded_live_adapters: null,
      status: "NOT_REBASELINED_AFTER_STRATEGY_RESET"
    },
    classification_dimensions: [
      "CUSTOMER_VALUE_SUPPORTED",
      "SOURCE_ROLE",
      "CATEGORY_AND_COLLECTION_SCOPE",
      "AUTHORITY_AND_INDEPENDENCE",
      "RIGHTS_AND_COMMERCIAL_USE",
      "TECHNICAL_ACCESS_AND_SCHEMA",
      "COVERAGE_AND_BIAS",
      "FRESHNESS_AND_STABILITY",
      "COST_AND_ROI",
      "CONTINUITY_AND_REPLACEABILITY"
    ],
    discovery_does_not_authorize_acquisition: true,
    bulk_collection_authorized: false,
    production: "HOLD"
  };
  sourceUniversePlan.plan_fingerprint = fingerprint(sourceUniversePlan);

  const providerFusionReadiness = {
    id: "provider-fusion-readiness-plan-v1",
    record_type: "provider_fusion_readiness",
    version: "1.0.0",
    status: "CONTRACT_READY_PROVIDER_CONNECTION_NOT_AUTHORIZED",
    generated_at: generatedAt,
    contract_id: fusion.id,
    self_collected_data_role: scale.provider_contribution_rule.self_collected_data_role,
    provider_data_role: scale.provider_contribution_rule.provider_data_role,
    provider_arrival_actions: fusion.provider_arrival_behavior.automatic_actions,
    readiness_metrics: fusion.readiness_metrics,
    direct_provider_to_portal: false,
    direct_provider_to_index: false,
    provider_id_as_canonical_id: false,
    provider_overwrites_self_collected_truth: false,
    internal_fusion_authorizes_publication: false,
    production: "HOLD"
  };
  providerFusionReadiness.plan_fingerprint = fingerprint(providerFusionReadiness);

  const programRoadmap = {
    id: "agci-os-program-roadmap-reset-v2",
    record_type: "program_roadmap",
    version: "2.0.0",
    status: "ACTIVE",
    generated_at: generatedAt,
    strategy_id: strategy.id,
    critical_path: strategy.program_reset.critical_path,
    milestones: strategy.milestones.map((milestone, index) => ({
      sequence: index,
      ...milestone,
      status: milestone.id === "M0" ? "IMPLEMENTED_FOUNDATION_VALIDATION_PENDING" : "NOT_STARTED"
    })),
    track_mandates: strategy.track_mandates,
    current_official_state: strategy.current_official_state,
    production: "HOLD"
  };
  programRoadmap.plan_fingerprint = fingerprint(programRoadmap);

  const manifest = {
    id: "agci-os-program-reset-category-1000-run-v1",
    record_type: "strategy_reset_run",
    version: "1.0.0",
    status: "STRATEGY_AND_SCALE_FOUNDATION_READY",
    generated_at: generatedAt,
    inputs: {
      strategy: { id: strategy.id, fingerprint: fingerprint(strategy) },
      scale: { id: scale.id, fingerprint: fingerprint(scale) },
      provider_fusion: { id: fusion.id, fingerprint: fingerprint(fusion) }
    },
    outputs: {
      "category-scale-plan.json": categoryScalePlan.plan_fingerprint,
      "source-universe-plan.json": sourceUniversePlan.plan_fingerprint,
      "provider-fusion-readiness.json": providerFusionReadiness.plan_fingerprint,
      "program-roadmap.json": programRoadmap.plan_fingerprint
    },
    category_count: categoryScalePlan.category_count,
    collection_scope_count: categoryScalePlan.collection_scope_count,
    qualified_object_target: categoryScalePlan.total_qualified_object_target,
    source_universe_discovery_target: sourceUniversePlan.targets.discovered,
    current_data_claims_created: 0,
    indexes_computed: 0,
    candidate_r2_created: false,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);

  return {
    "category-scale-plan.json": categoryScalePlan,
    "source-universe-plan.json": sourceUniversePlan,
    "provider-fusion-readiness.json": providerFusionReadiness,
    "program-roadmap.json": programRoadmap,
    "run-manifest.json": manifest
  };
}

function writeOutputs(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildProgramResetPlan();
  if (config.write) writeOutputs(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("AGCI-OS Program Strategy Reset + Category 1000: FOUNDATION READY");
  console.log(`Categories / scopes: ${run.category_count} / ${run.collection_scope_count}`);
  console.log(`Qualified object target: ${run.qualified_object_target}`);
  console.log(`Global source discovery target: ${run.source_universe_discovery_target}`);
  console.log("Current counts: NOT MEASURED (never coerced to zero)");
  console.log("Provider fusion: CONTRACT READY / CONNECTION NOT AUTHORIZED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
