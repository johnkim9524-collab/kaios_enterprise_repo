import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  readJson,
  unique,
  writeJsonDirectory
} from "../source-intelligence/asi-discovery-common-v1.mjs";

const root = process.cwd();
const representativeRoot = path.join(root, "coordination", "kidults", "representative-products");
const indexPath = path.join(representativeRoot, "index.json");
const contractPath = path.join(representativeRoot, "representative-product-universe-contract-v1.json");
const evidencePolicyPath = path.join(representativeRoot, "representative-product-evidence-policy-v2.json");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const cadencePolicyPath = path.join(root, "coordination", "kidults", "source-intelligence", "autonomous-collection-cadence-policy-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "representative-product-foundation-v1");

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

function expandCompactRecord(schema, row) {
  if (!Array.isArray(row)) return structuredClone(row);
  if (row.length !== schema.length) {
    throw new Error(`Compact record length ${row.length} does not match schema length ${schema.length}.`);
  }
  return Object.fromEntries(schema.map((field, index) => [field, row[index]]));
}

function loadAnchors(index) {
  const sets = index.records.map(reference => {
    const set = readJson(path.join(representativeRoot, reference.path));
    const records = set.records.map(row => expandCompactRecord(set.schema, row));
    return { ...set, records };
  });
  return sets;
}

function addFingerprints(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    value.fingerprint = fingerprint(value);
  }
}

function scopeGapRecord(scope, products, floor) {
  const scopeProducts = products.filter(product => product.collection_scope_id === scope.scope_id);
  return {
    collection_scope_id: scope.scope_id,
    collection_scope_name: scope.name,
    category_id: scope.parent_core_domain,
    planning_representative_product_floor: floor,
    named_anchor_products: scopeProducts.length,
    canonical_identity_resolved_products: 0,
    evidence_eligible_products: 0,
    representative_qualified_products: 0,
    named_product_gap_to_floor: Math.max(0, floor - scopeProducts.length),
    qualified_product_gap_to_floor: floor,
    status: "NAMED_PRODUCT_AND_QUALIFICATION_GAP_ACTIVE",
    production: "HOLD"
  };
}

function engineAlignment(contract, evidencePolicy) {
  return [
    {
      engine: "DECISION_OPERATING_SYSTEM",
      required_input: "DECISION_DNA_AND_IRREPLACEABLE_VALUE_REQUIREMENT",
      product_rule: "Every product-level Decision must resolve to explicit representative_product_id records.",
      blocked_without_product_registry: true
    },
    {
      engine: "COLLECTION_SCOPE_ENGINE",
      required_input: "CATEGORY_AND_COLLECTION_SCOPE_REGISTRY",
      product_rule: "Every Representative Product must map to exactly one active Collection Scope while cross-scope relationships remain explicit.",
      blocked_without_product_registry: true
    },
    {
      engine: "AUTONOMOUS_SOURCE_INTELLIGENCE",
      required_input: "NAMED_PRODUCT_IDENTITY_AND_EVIDENCE_GAPS",
      product_rule: "Discovery priority is compiled from product, Scope, Source Role, region and language gaps rather than anonymous category counts.",
      blocked_without_product_registry: true
    },
    {
      engine: "CANONICAL_IDENTITY_ENGINE",
      required_input: "NAMED_ANCHOR_OR_DISCOVERED_PRODUCT_CANDIDATE",
      product_rule: "Resolve maker, family, model, reference, edition, region, year and variant before comparable or market aggregation.",
      blocked_without_product_registry: true
    },
    {
      engine: "EVIDENCE_ENGINE",
      required_input: "CANONICAL_PRODUCT_ID_AND_PRODUCT_LEVEL_EVIDENCE_PLAN",
      product_rule: evidencePolicy.governing_rule,
      blocked_without_product_registry: true
    },
    {
      engine: "MARKET_ENGINE",
      required_input: "CANONICAL_PRODUCT_ID_AND_SOURCE_QUALIFIED_MARKET_EVENT",
      product_rule: "Listings, sales and market snapshots are counted only after canonical product matching and duplicate control.",
      blocked_without_product_registry: true
    },
    {
      engine: "MEMORY_ENGINE",
      required_input: "PRODUCT_IDENTITY_AND_MARKET_STATE",
      product_rule: "Store product state append-only and bitemporally; never overwrite identity history.",
      blocked_without_product_registry: true
    },
    {
      engine: "PROVIDER_FUSION_ENGINE",
      required_input: "PROVIDER_RECORD_TO_REPRESENTATIVE_PRODUCT_MAPPING",
      product_rule: "Provider identifiers never become canonical product identifiers and Provider data never bypasses conflict and provenance gates.",
      blocked_without_product_registry: true
    },
    {
      engine: "ADAPTIVE_COLLECTION_CADENCE_ENGINE",
      required_input: "PRODUCT_MARKET_VELOCITY_EVIDENCE_GAP_AND_SOURCE_ROLE",
      product_rule: "Cadence is assigned per named product and Source Role after acquisition gates pass.",
      blocked_without_product_registry: true
    },
    {
      engine: "SOURCE_SUFFICIENCY_ENGINE",
      required_input: "NAMED_PRODUCT_FLOOR_EVIDENCE_TARGETS_SOURCE_PRODUCTIVITY_AND_ATTRITION",
      product_rule: "Required Source families and channels are recalculated whenever the named-product universe or Evidence targets change.",
      blocked_without_product_registry: true
    },
    {
      engine: "TRACK_B_VALIDATION",
      required_input: "PRODUCT_IDENTITY_REPRESENTATIVENESS_EVIDENCE_AND_SAMPLING_PACKAGE",
      product_rule: "Track B independently validates product inclusion, identity, bias and Evidence readiness before qualification.",
      blocked_without_product_registry: true
    },
    {
      engine: "INDEX_AND_PORTAL_PROJECTION",
      required_input: "REPRESENTATIVE_QUALIFIED_PRODUCT_PROJECTION",
      product_rule: "Anchors and unqualified product candidates never flow directly to KIDULT 500, KIDULT 100 or Portal.",
      blocked_without_product_registry: true
    }
  ].map(record => ({ ...record, production: "HOLD" }));
}

export function buildRepresentativeProductFoundationV1() {
  const index = readJson(indexPath);
  const contract = readJson(contractPath);
  const evidencePolicy = readJson(evidencePolicyPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const cadencePolicy = readJson(cadencePolicyPath);
  const anchorSets = loadAnchors(index);
  const scopeMap = new Map(scopeRegistry.records.map(scope => [scope.scope_id, scope]));
  const categoryTargetMap = new Map(evidencePolicy.category_targets.map(target => [target.category_id, target]));
  const cadenceMap = new Map(cadencePolicy.source_role_collection_cadence.map(record => [record.source_role, record]));

  const products = [];
  for (const anchorSet of anchorSets) {
    const evidenceTarget = categoryTargetMap.get(anchorSet.category_id);
    if (!evidenceTarget) throw new Error(`Missing Evidence target for ${anchorSet.category_id}.`);
    for (const anchor of anchorSet.records) {
      const scope = scopeMap.get(anchor.collection_scope_id);
      if (!scope) throw new Error(`${anchor.representative_product_id}: unknown Collection Scope ${anchor.collection_scope_id}.`);
      if (scope.parent_core_domain !== anchorSet.category_id) {
        throw new Error(`${anchor.representative_product_id}: Scope parent ${scope.parent_core_domain} does not match category ${anchorSet.category_id}.`);
      }
      products.push({
        representative_product_id: anchor.representative_product_id,
        category_id: anchorSet.category_id,
        category_name: anchorSet.category_name,
        collection_scope_id: anchor.collection_scope_id,
        collection_scope_name: scope.name,
        maker_or_brand: anchor.maker_or_brand,
        product_name: anchor.product_name,
        display_name: `${anchor.maker_or_brand} — ${anchor.product_name}`,
        identity_level: anchor.identity_level,
        release_or_era: anchor.release_or_era,
        selection_rationale: anchor.selection_rationale,
        selection_state: "ANCHOR_DEFINED",
        canonical_identity_state: "NOT_RESOLVED",
        evidence_eligibility_state: "HOLD_CANONICAL_IDENTITY_AND_SOURCE_COVERAGE_REQUIRED",
        representative_qualification_state: "NOT_STARTED",
        required_identity_fields: scope.identity_fields,
        known_scope_biases: scope.known_biases,
        minimum_validated_evidence_assertions: evidenceTarget.validated_evidence_assertions_per_product,
        minimum_market_observations: evidenceTarget.market_observations_per_product,
        minimum_time_depth_months: evidencePolicy.target_model.minimum_time_depth_months,
        minimum_regions: evidencePolicy.target_model.minimum_regions_per_product,
        minimum_independent_source_families: evidencePolicy.target_model.minimum_independent_source_families_per_representative_product,
        critical_assertion_independent_family_floor: evidencePolicy.target_model.minimum_independent_source_families_for_critical_assertion,
        required_source_roles: scopeRegistry.common_contract.required_source_roles,
        source_role_cadence_policy: scopeRegistry.common_contract.required_source_roles.map(role => ({
          source_role: role,
          cadence: cadenceMap.get(role) ?? null,
          assignment_state: "NOT_ASSIGNED_BEFORE_ACQUISITION_GATE"
        })),
        provider_id_is_canonical_id: false,
        source_pool_promoted: false,
        acquisition_authorized: false,
        index_eligible: false,
        portal_eligible: false,
        production: "HOLD"
      });
    }
  }
  products.sort((a, b) => a.representative_product_id.localeCompare(b.representative_product_id));

  const categoryRecords = index.records.map(reference => {
    const target = categoryTargetMap.get(reference.category_id);
    const categoryProducts = products.filter(product => product.category_id === reference.category_id);
    const scopes = scopeRegistry.records.filter(scope => scope.parent_core_domain === reference.category_id);
    return {
      category_id: reference.category_id,
      category_name: reference.category_name,
      named_anchor_products: categoryProducts.length,
      minimum_representative_product_floor: reference.minimum_floor,
      named_product_gap_to_floor: Math.max(0, reference.minimum_floor - categoryProducts.length),
      canonical_identity_resolved_products: 0,
      evidence_eligible_products: 0,
      representative_qualified_products: 0,
      full_floor_validated_evidence_target: target.planning_validated_evidence_target,
      full_floor_market_observation_target: target.planning_market_observation_target,
      current_anchor_validated_evidence_plan: categoryProducts.length * target.validated_evidence_assertions_per_product,
      current_anchor_market_observation_plan: categoryProducts.length * target.market_observations_per_product,
      collection_scopes: scopes.map(scope => scopeGapRecord(scope, products, scope.planning_object_target)),
      status: "ANCHOR_SEED_ACTIVE_FULL_REPRESENTATIVE_UNIVERSE_GAP_OPEN",
      production: "HOLD"
    };
  }).sort((a, b) => a.category_id.localeCompare(b.category_id));

  const productRegistry = {
    id: "category-representative-product-registry-v1",
    record_type: "category_representative_product_registry",
    version: "1.0.0",
    status: "NAMED_ANCHOR_FOUNDATION_ACTIVE_QUALIFICATION_PENDING",
    generated_at: evidencePolicy.effective_at,
    contract_id: contract.id,
    evidence_policy_id: evidencePolicy.id,
    category_count: categoryRecords.length,
    collection_scope_count: unique(products.map(product => product.collection_scope_id)).length,
    named_anchor_product_count: products.length,
    representative_qualified_product_count: 0,
    category_records: categoryRecords,
    records: products,
    anonymous_product_records: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };

  const gapMatrix = {
    id: "representative-product-gap-matrix-v1",
    record_type: "representative_product_gap_matrix",
    version: "1.0.0",
    status: "FULL_NAMED_PRODUCT_AND_QUALIFICATION_GAP_ACTIVE",
    generated_at: evidencePolicy.effective_at,
    total_minimum_representative_product_floor: categoryRecords.reduce((sum, record) => sum + record.minimum_representative_product_floor, 0),
    current_named_anchor_products: products.length,
    total_named_product_gap: categoryRecords.reduce((sum, record) => sum + record.named_product_gap_to_floor, 0),
    representative_qualified_products: 0,
    total_qualified_product_gap: categoryRecords.reduce((sum, record) => sum + record.minimum_representative_product_floor, 0),
    category_records: categoryRecords.map(record => ({
      category_id: record.category_id,
      category_name: record.category_name,
      minimum_floor: record.minimum_representative_product_floor,
      named_anchors: record.named_anchor_products,
      named_gap: record.named_product_gap_to_floor,
      qualified_products: record.representative_qualified_products,
      qualified_gap: record.minimum_representative_product_floor,
      scope_records: record.collection_scopes
    })),
    global_market_poc_product_gate: "FAIL",
    source_pool_promotions: 0,
    production: "HOLD"
  };

  const evidencePlan = {
    id: "representative-product-evidence-plan-v1",
    record_type: "representative_product_evidence_plan",
    version: "1.0.0",
    status: "PRODUCT_LINKED_PLANNING_COMPLETE_COLLECTION_BLOCKED",
    generated_at: evidencePolicy.effective_at,
    evidence_policy_id: evidencePolicy.id,
    named_product_count: products.length,
    planned_validated_evidence_assertions: products.reduce((sum, product) => sum + product.minimum_validated_evidence_assertions, 0),
    planned_market_observations: products.reduce((sum, product) => sum + product.minimum_market_observations, 0),
    executable_collection_work_items: 0,
    records: products.map(product => ({
      representative_product_id: product.representative_product_id,
      category_id: product.category_id,
      collection_scope_id: product.collection_scope_id,
      display_name: product.display_name,
      selection_state: product.selection_state,
      canonical_identity_state: product.canonical_identity_state,
      planned_validated_evidence_assertions: product.minimum_validated_evidence_assertions,
      planned_market_observations: product.minimum_market_observations,
      minimum_time_depth_months: product.minimum_time_depth_months,
      minimum_regions: product.minimum_regions,
      required_source_roles: product.required_source_roles,
      validated_assertion_dimensions: evidencePolicy.validated_assertion_dimensions,
      collection_state: "HOLD_CANONICAL_IDENTITY_SOURCE_AND_RIGHTS_GATES",
      evidence_counted_for_global_poc: false,
      production: "HOLD"
    })),
    planning_target_is_collected_evidence: false,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const expansionRecords = scopeRegistry.records.map(scope => {
    const scopeProducts = products.filter(product => product.collection_scope_id === scope.scope_id);
    const gap = Math.max(0, scope.planning_object_target - scopeProducts.length);
    return {
      work_item_id: `product-expansion:${scope.scope_id}`,
      category_id: scope.parent_core_domain,
      collection_scope_id: scope.scope_id,
      collection_scope_name: scope.name,
      current_named_anchors: scopeProducts.length,
      minimum_named_product_floor: scope.planning_object_target,
      named_product_gap: gap,
      sequential_waves: [
        { wave: 1, candidate_target: Math.min(80, gap) },
        { wave: 2, candidate_target: Math.min(80, Math.max(0, gap - 80)) },
        { wave: 3, candidate_target: Math.max(0, gap - 160) }
      ],
      anchor_makers: unique(scopeProducts.map(product => product.maker_or_brand)),
      anchor_products: scopeProducts.map(product => product.product_name),
      scope_definition: scope.definition,
      include: scope.include,
      exclude: scope.exclude,
      identity_fields: scope.identity_fields,
      known_biases: scope.known_biases,
      target_source_roles: ["PRIMARY_AUTHORITY", "CATALOG_REFERENCE", "LISTING_SUPPLY", "SOLD_TRANSACTION", "INDEPENDENT_VERIFICATION"],
      discovery_mode: "TARGETED_PRODUCT_MODEL_REFERENCE_AND_FAMILY_DISCOVERY",
      broad_generic_discovery: "CLOSED",
      required_candidate_fields: [
        "EXPLICIT_PRODUCT_NAME",
        "MAKER_OR_AUTHORITY",
        "MODEL_REFERENCE_FAMILY_OR_OBJECT_CLASS",
        "RELEASE_OR_ERA",
        "REGION",
        "SOURCE_AND_PROVENANCE",
        "COLLECTION_SCOPE",
        "SELECTION_SIGNAL"
      ],
      next_gate: "CANONICAL_IDENTITY_RESOLUTION_AND_REPRESENTATIVENESS_SCORING",
      source_pool_promotions: 0,
      acquisition_authorized: false,
      production: "HOLD"
    };
  }).sort((a, b) => a.collection_scope_id.localeCompare(b.collection_scope_id));

  const expansionQueue = {
    id: "representative-product-asi-expansion-queue-v1",
    record_type: "representative_product_asi_expansion_queue",
    version: "1.0.0",
    status: "READY_FOR_AUTONOMOUS_NAMED_PRODUCT_UNIVERSE_EXPANSION",
    generated_at: evidencePolicy.effective_at,
    scope_work_items: expansionRecords.length,
    current_named_anchors: products.length,
    total_named_product_gap: expansionRecords.reduce((sum, record) => sum + record.named_product_gap, 0),
    total_planned_candidate_slots: expansionRecords.reduce((sum, record) => sum + record.sequential_waves.reduce((waveSum, wave) => waveSum + wave.candidate_target, 0), 0),
    records: expansionRecords,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const alignment = {
    id: "representative-product-engine-alignment-v1",
    record_type: "representative_product_engine_alignment",
    version: "1.0.0",
    status: "MANDATORY_PRODUCT_FIRST_ALIGNMENT_ACTIVE",
    generated_at: evidencePolicy.effective_at,
    governing_contract: contract.id,
    evidence_policy: evidencePolicy.id,
    engines: engineAlignment(contract, evidencePolicy),
    canonical_process: contract.canonical_flow,
    fail_closed_rules: contract.fail_closed_rules,
    unaligned_engine_default: "HOLD_NO_REPRESENTATIVE_PRODUCT_LINKAGE",
    production: "HOLD"
  };

  const sourceDriver = {
    id: "representative-product-source-sufficiency-driver-v1",
    record_type: "representative_product_source_sufficiency_driver",
    version: "1.0.0",
    status: "PLANNING_DRIVER_READY_EMPIRICAL_REPLACEMENT_REQUIRED",
    generated_at: evidencePolicy.effective_at,
    evidence_policy_id: evidencePolicy.id,
    representative_product_registry_id: productRegistry.id,
    global_parameters: {
      total_attrition_rate: 0.6,
      diversity_reserve_multiplier: 1.25,
      continuity_reserve_multiplier: 1.0,
      concentration_reserve_multiplier: 1.0,
      channels_per_independent_family_min: 1.6,
      channels_per_independent_family_max: 2.0,
      effective_product_role_units_per_active_family: 20,
      effective_validated_evidence_assertions_per_active_family: 100,
      effective_market_observations_per_active_family: 250,
      parameter_state: "PLANNING_BASELINE_REPLACE_WITH_ASI_AND_ACTIVE_EVIDENCE_MEASUREMENTS"
    },
    categories: categoryRecords.map(record => {
      const target = categoryTargetMap.get(record.category_id);
      return {
        category_id: record.category_id,
        category_name: record.category_name,
        representative_product_floor: record.minimum_representative_product_floor,
        current_named_anchor_products: record.named_anchor_products,
        current_representative_qualified_products: 0,
        evidence_roles_per_product: 7,
        target_validated_evidence_assertions: target.planning_validated_evidence_target,
        target_market_observations: target.planning_market_observation_target,
        executable_named_anchor_evidence_plan: record.current_anchor_validated_evidence_plan,
        executable_named_anchor_market_plan: record.current_anchor_market_observation_plan,
        executable_collection_state: "BLOCKED_PENDING_CANONICAL_IDENTITY_SOURCE_RIGHTS_AND_ADAPTER_GATES",
        production: "HOLD"
      };
    }),
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "category-representative-product-registry-v1.json": productRegistry,
    "representative-product-gap-matrix-v1.json": gapMatrix,
    "representative-product-evidence-plan-v1.json": evidencePlan,
    "representative-product-asi-expansion-queue-v1.json": expansionQueue,
    "representative-product-engine-alignment-v1.json": alignment,
    "representative-product-source-sufficiency-driver-v1.json": sourceDriver
  };
  addFingerprints(outputs);

  const manifest = {
    id: "representative-product-foundation-v1-run-manifest",
    record_type: "representative_product_foundation_run_manifest",
    version: "1.0.0",
    status: "PASS_NAMED_PRODUCT_ANCHORS_EVIDENCE_AND_ENGINE_ALIGNMENT_ACTIVE",
    generated_at: evidencePolicy.effective_at,
    inputs: {
      index: { id: index.id, fingerprint: fingerprint(index) },
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      evidence_policy: { id: evidencePolicy.id, fingerprint: fingerprint(evidencePolicy) },
      collection_scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) },
      cadence_policy: { id: cadencePolicy.id, fingerprint: fingerprint(cadencePolicy) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    categories: categoryRecords.length,
    collection_scopes: unique(products.map(product => product.collection_scope_id)).length,
    named_anchor_products: products.length,
    named_product_gap_to_floor: gapMatrix.total_named_product_gap,
    representative_qualified_products: 0,
    planned_anchor_validated_evidence_assertions: evidencePlan.planned_validated_evidence_assertions,
    planned_anchor_market_observations: evidencePlan.planned_market_observations,
    full_floor_validated_evidence_assertions: evidencePolicy.current_eight_category_floor_projection.validated_evidence_assertions,
    full_floor_market_observations: evidencePolicy.current_eight_category_floor_projection.market_observations,
    anonymous_product_evidence_work_items: 0,
    engine_alignment_records: alignment.engines.length,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildRepresentativeProductFoundationV1();
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Representative Product Foundation v1: PASS");
  console.log(`Categories / Scopes / named anchors: ${manifest.categories} / ${manifest.collection_scopes} / ${manifest.named_anchor_products}`);
  console.log(`Named gap to current floor: ${manifest.named_product_gap_to_floor}`);
  console.log(`Anchor Evidence / Market plan: ${manifest.planned_anchor_validated_evidence_assertions} / ${manifest.planned_anchor_market_observations}`);
  console.log(`Full floor Evidence / Market target: ${manifest.full_floor_validated_evidence_assertions} / ${manifest.full_floor_market_observations}`);
  console.log("Representative qualified: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
