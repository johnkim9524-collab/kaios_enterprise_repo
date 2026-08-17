import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  readJson,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const defaultContractPath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "source-sufficiency-calculation-contract-v2.json"
);
const defaultProfilePath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "source-sufficiency-driver-profile-v1.json"
);
const defaultScopeRegistryPath = path.join(
  root,
  "coordination",
  "kidults",
  "data-scope",
  "collection-scope-registry-v1.json"
);
const defaultOutput = path.join(
  root,
  "artifacts",
  "agci-os",
  "source-sufficiency-calculation-v2"
);

function parseArgs(argv) {
  const config = {
    contract: defaultContractPath,
    profile: defaultProfilePath,
    scopeRegistry: defaultScopeRegistryPath,
    output: defaultOutput,
    write: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--contract") config.contract = path.resolve(argv[++index]);
    else if (argument === "--profile") config.profile = path.resolve(argv[++index]);
    else if (argument === "--scope-registry") config.scopeRegistry = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function deepClone(value) {
  return structuredClone(value);
}

function ceil(value) {
  return Math.ceil(value - Number.EPSILON);
}

function assertFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
}

function resolveAttrition(category, globalParameters) {
  const mode = category.attrition_mode ?? globalParameters.attrition_mode;
  if (mode === "TOTAL") {
    const attritionRate = category.total_attrition_rate ?? globalParameters.total_attrition_rate;
    if (!Number.isFinite(attritionRate) || attritionRate < 0 || attritionRate >= 1) {
      throw new Error(`${category.category_id}: total_attrition_rate must be in [0, 1).`);
    }
    return {
      mode,
      total_attrition_rate: attritionRate,
      survival_rate: 1 - attritionRate,
      stage_survival_rates: null
    };
  }
  if (mode === "STAGED") {
    const stageRates = category.stage_survival_rates ?? globalParameters.stage_survival_rates;
    if (!stageRates || typeof stageRates !== "object") {
      throw new Error(`${category.category_id}: stage_survival_rates are required in STAGED mode.`);
    }
    const values = Object.values(stageRates);
    if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0 || value > 1)) {
      throw new Error(`${category.category_id}: every stage survival rate must be in (0, 1].`);
    }
    const survivalRate = values.reduce((product, value) => product * value, 1);
    return {
      mode,
      total_attrition_rate: 1 - survivalRate,
      survival_rate: survivalRate,
      stage_survival_rates: stageRates
    };
  }
  throw new Error(`${category.category_id}: unsupported attrition mode ${mode}.`);
}

function resolveGlobalOrCategory(category, globalParameters, key) {
  return category[key] ?? globalParameters[key];
}

function dominantDriver(values) {
  const maximum = Math.max(...Object.values(values));
  return Object.entries(values)
    .filter(([, value]) => value === maximum)
    .map(([name]) => name)
    .sort();
}

function calculateCategory(category, globalParameters) {
  const attrition = resolveAttrition(category, globalParameters);
  const representativeProducts = category.representative_products;
  const evidenceRolesPerProduct = category.evidence_roles_per_product;
  const roleCoverageRatio = category.required_role_coverage_ratio;
  const evidenceTarget = category.target_validated_evidence_assertions;
  const marketTarget = category.target_market_observations;
  const productRoleYield = category.effective_product_role_units_per_active_family;
  const evidenceYield = category.effective_validated_evidence_assertions_per_active_family;
  const marketYield = category.effective_market_observations_per_active_family;
  const mandatoryRoles = category.mandatory_source_roles;
  const minimumFamiliesPerRole = category.minimum_independent_families_per_role;
  const complexityMultiplier = category.category_complexity_multiplier;
  const diversityReserve = resolveGlobalOrCategory(category, globalParameters, "diversity_reserve_multiplier");
  const continuityReserve = resolveGlobalOrCategory(category, globalParameters, "continuity_reserve_multiplier");
  const concentrationReserve = resolveGlobalOrCategory(category, globalParameters, "concentration_reserve_multiplier");
  const channelsPerFamilyMin = resolveGlobalOrCategory(category, globalParameters, "channels_per_independent_family_min");
  const channelsPerFamilyMax = resolveGlobalOrCategory(category, globalParameters, "channels_per_independent_family_max");

  for (const [name, value] of Object.entries({
    representativeProducts,
    evidenceRolesPerProduct,
    roleCoverageRatio,
    evidenceTarget,
    marketTarget,
    productRoleYield,
    evidenceYield,
    marketYield,
    mandatoryRoles,
    minimumFamiliesPerRole,
    complexityMultiplier,
    diversityReserve,
    continuityReserve,
    concentrationReserve,
    channelsPerFamilyMin,
    channelsPerFamilyMax
  })) assertFinitePositive(value, `${category.category_id}.${name}`);

  if (channelsPerFamilyMin > channelsPerFamilyMax) {
    throw new Error(`${category.category_id}: channels_per_independent_family_min exceeds maximum.`);
  }

  const productRoleDemandUnits = representativeProducts * evidenceRolesPerProduct * roleCoverageRatio;
  const activeByProductCoverage = ceil(productRoleDemandUnits / productRoleYield);
  const activeByEvidenceVolume = ceil(evidenceTarget / evidenceYield);
  const activeByMarketObservations = ceil(marketTarget / marketYield);
  const activeByRoleDiversity = ceil(mandatoryRoles * minimumFamiliesPerRole);
  const activeRequirements = {
    PRODUCT_ROLE_COVERAGE: activeByProductCoverage,
    VALIDATED_EVIDENCE_VOLUME: activeByEvidenceVolume,
    MARKET_OBSERVATION_VOLUME: activeByMarketObservations,
    SOURCE_ROLE_DIVERSITY_FLOOR: activeByRoleDiversity
  };
  const requiredActiveFamilies = Math.max(...Object.values(activeRequirements));
  const reserveProduct = diversityReserve * continuityReserve * concentrationReserve * complexityMultiplier;
  const requiredHighTrustFamilies = ceil(requiredActiveFamilies / attrition.survival_rate * reserveProduct);
  const requiredChannelsMin = ceil(requiredHighTrustFamilies * channelsPerFamilyMin);
  const requiredChannelsMax = ceil(requiredHighTrustFamilies * channelsPerFamilyMax);

  return {
    category_id: category.category_id,
    category_name: category.category_name,
    parameter_state: category.parameter_state,
    inputs: {
      representative_products: representativeProducts,
      evidence_roles_per_product: evidenceRolesPerProduct,
      required_role_coverage_ratio: roleCoverageRatio,
      target_validated_evidence_assertions: evidenceTarget,
      target_market_observations: marketTarget,
      effective_product_role_units_per_active_family: productRoleYield,
      effective_validated_evidence_assertions_per_active_family: evidenceYield,
      effective_market_observations_per_active_family: marketYield,
      mandatory_source_roles: mandatoryRoles,
      minimum_independent_families_per_role: minimumFamiliesPerRole,
      category_complexity_multiplier: complexityMultiplier,
      attrition,
      diversity_reserve_multiplier: diversityReserve,
      continuity_reserve_multiplier: continuityReserve,
      concentration_reserve_multiplier: concentrationReserve,
      channels_per_independent_family_min: channelsPerFamilyMin,
      channels_per_independent_family_max: channelsPerFamilyMax
    },
    demand: {
      product_role_demand_units: productRoleDemandUnits,
      target_validated_evidence_assertions: evidenceTarget,
      target_market_observations: marketTarget
    },
    active_family_requirements: {
      ...activeRequirements,
      required_active_independent_families: requiredActiveFamilies,
      dominant_requirement_driver: dominantDriver(activeRequirements)
    },
    reverse_calculated_requirement: {
      required_high_trust_independent_families: requiredHighTrustFamilies,
      required_verified_source_channels_min: requiredChannelsMin,
      required_verified_source_channels_max: requiredChannelsMax
    },
    output_state: "PLANNING_REQUIREMENT_NOT_QUALIFIED_SOURCE_COUNT",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function calculateProfile(profile) {
  const categoryResults = profile.categories
    .map(category => calculateCategory(category, profile.global_parameters))
    .sort((a, b) => a.category_id.localeCompare(b.category_id));
  const grossFamilies = categoryResults.reduce(
    (sum, category) => sum + category.reverse_calculated_requirement.required_high_trust_independent_families,
    0
  );
  const reuseRate = profile.global_parameters.cross_category_reuse_rate;
  if (!Number.isFinite(reuseRate) || reuseRate < 0 || reuseRate >= 1) {
    throw new Error("cross_category_reuse_rate must be in [0, 1). ");
  }
  const uniqueFamilies = ceil(grossFamilies * (1 - reuseRate));
  const channelMin = ceil(uniqueFamilies * profile.global_parameters.channels_per_independent_family_min);
  const channelMax = ceil(uniqueFamilies * profile.global_parameters.channels_per_independent_family_max);
  const discoverySurvival = profile.global_parameters.discovery_to_high_trust_survival_rate;
  const discoveryCandidates = discoverySurvival === null
    ? null
    : ceil(uniqueFamilies / discoverySurvival);

  return {
    profile_id: profile.id,
    active_scenario_id: profile.active_scenario_id,
    category_count: categoryResults.length,
    total_representative_products: categoryResults.reduce((sum, item) => sum + item.inputs.representative_products, 0),
    total_product_role_demand_units: categoryResults.reduce((sum, item) => sum + item.demand.product_role_demand_units, 0),
    total_target_validated_evidence_assertions: categoryResults.reduce((sum, item) => sum + item.demand.target_validated_evidence_assertions, 0),
    total_target_market_observations: categoryResults.reduce((sum, item) => sum + item.demand.target_market_observations, 0),
    gross_independent_family_requirement: grossFamilies,
    cross_category_reuse_rate: reuseRate,
    global_unique_independent_family_requirement: uniqueFamilies,
    global_verified_source_channels_min: channelMin,
    global_verified_source_channels_max: channelMax,
    discovery_to_high_trust_survival_rate: discoverySurvival,
    discovery_candidate_requirement: discoveryCandidates,
    categories: categoryResults
  };
}

function applyScenario(baseProfile, scenario) {
  const profile = deepClone(baseProfile);
  profile.active_scenario_id = scenario.scenario_id;
  const overrides = scenario.overrides ?? {};
  if (overrides.total_attrition_rate_delta) {
    profile.global_parameters.total_attrition_rate = Math.min(
      0.99,
      profile.global_parameters.total_attrition_rate + overrides.total_attrition_rate_delta
    );
  }
  for (const category of profile.categories) {
    if (overrides.evidence_roles_per_product) {
      category.evidence_roles_per_product = overrides.evidence_roles_per_product;
    }
    if (overrides.representative_products_multiplier) {
      category.representative_products = ceil(category.representative_products * overrides.representative_products_multiplier);
    }
    if (overrides.target_validated_evidence_assertions_multiplier) {
      category.target_validated_evidence_assertions = ceil(
        category.target_validated_evidence_assertions * overrides.target_validated_evidence_assertions_multiplier
      );
    }
    if (overrides.target_market_observations_multiplier) {
      category.target_market_observations = ceil(
        category.target_market_observations * overrides.target_market_observations_multiplier
      );
    }
  }
  return profile;
}

function addFingerprints(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    value.fingerprint = fingerprint(value);
  }
}

export function buildSourceSufficiencyCalculationV2({ contractPath = defaultContractPath, profilePath = defaultProfilePath, scopeRegistryPath = defaultScopeRegistryPath } = {}) {
  const contract = readJson(contractPath);
  const profile = readJson(profilePath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const registryDomains = unique(scopeRegistry.records.map(record => record.parent_core_domain));
  const profileDomains = unique(profile.categories.map(category => category.category_id));
  if (JSON.stringify(registryDomains) !== JSON.stringify(profileDomains)) {
    throw new Error(`Profile category IDs do not match Collection Scope parent domains. Registry=${registryDomains.join(",")} Profile=${profileDomains.join(",")}`);
  }

  const baseline = calculateProfile(profile);
  const sensitivityRecords = profile.sensitivity_scenarios.map(scenario => {
    const scenarioProfile = applyScenario(profile, scenario);
    const result = calculateProfile(scenarioProfile);
    return {
      scenario_id: scenario.scenario_id,
      description: scenario.description,
      overrides: scenario.overrides ?? {},
      category_count: result.category_count,
      total_representative_products: result.total_representative_products,
      total_target_validated_evidence_assertions: result.total_target_validated_evidence_assertions,
      total_target_market_observations: result.total_target_market_observations,
      global_unique_independent_family_requirement: result.global_unique_independent_family_requirement,
      global_verified_source_channels_min: result.global_verified_source_channels_min,
      global_verified_source_channels_max: result.global_verified_source_channels_max,
      delta_vs_baseline: {
        independent_families: result.global_unique_independent_family_requirement - baseline.global_unique_independent_family_requirement,
        verified_channels_min: result.global_verified_source_channels_min - baseline.global_verified_source_channels_min,
        verified_channels_max: result.global_verified_source_channels_max - baseline.global_verified_source_channels_max
      }
    };
  });

  const calculation = {
    id: "source-sufficiency-calculation-v2",
    record_type: "source_sufficiency_calculation",
    version: "2.0.0",
    status: "CALCULATED_FROM_LINKED_PLANNING_DRIVERS_EMPIRICAL_REPLACEMENT_REQUIRED",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    profile_id: profile.id,
    source_count_policy: contract.source_count_policy,
    baseline,
    interpretation: {
      primary_unit: contract.primary_counting_unit,
      derived_unit: contract.derived_counting_unit,
      calculated_requirement_is_fixed_global_target: false,
      calculated_requirement_is_empirical_measurement: false,
      recalculation_required_when_any_linked_driver_changes: true
    },
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };

  const categoryMatrix = {
    id: "category-source-requirement-matrix-v2",
    record_type: "category_source_requirement_matrix",
    version: "2.0.0",
    status: "LINKED_BASELINE_CALCULATED",
    generated_at: contract.effective_at,
    category_count: baseline.category_count,
    records: baseline.categories,
    totals: {
      representative_products: baseline.total_representative_products,
      product_role_demand_units: baseline.total_product_role_demand_units,
      target_validated_evidence_assertions: baseline.total_target_validated_evidence_assertions,
      target_market_observations: baseline.total_target_market_observations,
      gross_independent_family_requirement: baseline.gross_independent_family_requirement,
      global_unique_independent_family_requirement: baseline.global_unique_independent_family_requirement,
      verified_source_channels_min: baseline.global_verified_source_channels_min,
      verified_source_channels_max: baseline.global_verified_source_channels_max
    },
    production: "HOLD"
  };

  const linkage = {
    id: "source-sufficiency-driver-linkage-v2",
    record_type: "source_sufficiency_driver_linkage",
    version: "2.0.0",
    status: "ACTIVE_LINKED_RECALCULATION",
    generated_at: contract.effective_at,
    linked_drivers: contract.linked_drivers,
    automatic_recalculation_events: contract.automatic_recalculation_events,
    category_formula: contract.category_calculation,
    global_formula: contract.global_calculation,
    dependency_rule: "ANY_INPUT_CHANGE_REBUILDS_ALL_CATEGORY_AND_GLOBAL_OUTPUTS",
    production: "HOLD"
  };

  const sensitivity = {
    id: "source-sufficiency-sensitivity-v2",
    record_type: "source_sufficiency_sensitivity",
    version: "2.0.0",
    status: "CALCULATED",
    generated_at: contract.effective_at,
    baseline: {
      scenario_id: profile.active_scenario_id,
      global_unique_independent_family_requirement: baseline.global_unique_independent_family_requirement,
      global_verified_source_channels_min: baseline.global_verified_source_channels_min,
      global_verified_source_channels_max: baseline.global_verified_source_channels_max
    },
    records: sensitivityRecords,
    production: "HOLD"
  };

  const admission = {
    id: "global-source-sufficiency-admission-v2",
    record_type: "global_source_sufficiency_admission",
    version: "2.0.0",
    status: "PLANNING_REQUIREMENT_CALCULATED_EMPIRICAL_ASI_CALIBRATION_PENDING",
    generated_at: contract.effective_at,
    calculated_planning_requirement: {
      independent_source_families: baseline.global_unique_independent_family_requirement,
      verified_source_channels_min: baseline.global_verified_source_channels_min,
      verified_source_channels_max: baseline.global_verified_source_channels_max,
      discovery_candidate_requirement: baseline.discovery_candidate_requirement
    },
    empirical_requirements: {
      source_productivity_calibrated: false,
      attrition_calibrated: false,
      channels_per_family_calibrated: false,
      cross_category_reuse_calibrated: false,
      diversity_and_resilience_calibrated: false
    },
    global_market_poc_admitted: false,
    reason: "The linked reverse calculation is active, but the planning inputs have not yet been replaced by empirical ASI measurements and Track B validation.",
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const outputs = {
    "source-sufficiency-calculation-v2.json": calculation,
    "category-source-requirement-matrix-v2.json": categoryMatrix,
    "source-sufficiency-driver-linkage-v2.json": linkage,
    "source-sufficiency-sensitivity-v2.json": sensitivity,
    "global-source-sufficiency-admission-v2.json": admission
  };
  addFingerprints(outputs);

  const manifest = {
    id: "source-sufficiency-calculation-v2-run-manifest",
    record_type: "source_sufficiency_calculation_run_manifest",
    version: "2.0.0",
    status: "PASS_LINKED_REVERSE_CALCULATION_ACTIVE",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      profile: { id: profile.id, fingerprint: fingerprint(profile) },
      collection_scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) }
    },
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])
    ),
    category_count: baseline.category_count,
    total_representative_products: baseline.total_representative_products,
    total_target_validated_evidence_assertions: baseline.total_target_validated_evidence_assertions,
    total_target_market_observations: baseline.total_target_market_observations,
    calculated_independent_source_families: baseline.global_unique_independent_family_requirement,
    calculated_verified_source_channels_min: baseline.global_verified_source_channels_min,
    calculated_verified_source_channels_max: baseline.global_verified_source_channels_max,
    fixed_global_source_target: null,
    empirical_calibration_complete: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildSourceSufficiencyCalculationV2({
    contractPath: config.contract,
    profilePath: config.profile,
    scopeRegistryPath: config.scopeRegistry
  });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Source Sufficiency Calculation v2: PASS");
  console.log(`Categories / Representative Products: ${manifest.category_count} / ${manifest.total_representative_products}`);
  console.log(`Evidence / Market targets: ${manifest.total_target_validated_evidence_assertions} / ${manifest.total_target_market_observations}`);
  console.log(`Calculated independent families: ${manifest.calculated_independent_source_families}`);
  console.log(`Calculated verified channels: ${manifest.calculated_verified_source_channels_min}–${manifest.calculated_verified_source_channels_max}`);
  console.log("Any driver change triggers full recalculation; fixed global Source target: NONE.");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
