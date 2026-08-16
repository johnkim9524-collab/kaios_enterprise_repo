import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultOutput = path.join(root, "artifacts", "agci-os", "dos-v1");
const contractPath = path.join(root, "coordination", "kidults", "dos", "decision-operating-system-contract-v1.json");
const archetypePath = path.join(root, "coordination", "kidults", "dos", "decision-archetype-library-v1.json");
const collectionScopePath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const valueOperatingPath = path.join(root, "coordination", "kidults", "value", "irreplaceable-value-operating-contract-v1.json");
const runtimePath = path.join(root, "coordination", "kidults", "runtime", "digitalocean-irreplaceable-value-runtime-foundation-v1.json");

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

function unique(values) {
  return [...new Set(values)].sort();
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

export function loadDosInputs() {
  return {
    contract: readJson(contractPath),
    archetypes: readJson(archetypePath),
    collectionScopes: readJson(collectionScopePath),
    valueOperating: readJson(valueOperatingPath),
    runtime: readJson(runtimePath)
  };
}

function combineBlueprints(blueprints) {
  const metricFieldMap = {};
  const fieldSourceRoleMap = {};
  for (const blueprint of blueprints) {
    for (const [metric, fields] of Object.entries(blueprint.metric_field_map)) {
      metricFieldMap[metric] = unique([...(metricFieldMap[metric] ?? []), ...fields]);
    }
    for (const [field, roles] of Object.entries(blueprint.field_source_role_map)) {
      fieldSourceRoleMap[field] = unique([...(fieldSourceRoleMap[field] ?? []), ...roles]);
    }
  }

  const requiredMetrics = unique(Object.keys(metricFieldMap));
  const requiredDataFields = unique(requiredMetrics.flatMap(metric => metricFieldMap[metric]));
  const requiredSourceRoles = unique(requiredDataFields.flatMap(field => fieldSourceRoleMap[field] ?? []));
  const coverage = {
    regions_minimum: Math.max(...blueprints.map(item => item.coverage_requirements.regions_minimum)),
    time_depth_requirements: unique(blueprints.map(item => item.coverage_requirements.time_depth)),
    price_bands_minimum: Math.max(...blueprints.map(item => item.coverage_requirements.price_bands_minimum)),
    condition_bands_minimum: Math.max(...blueprints.map(item => item.coverage_requirements.condition_bands_minimum))
  };

  return {
    intelligence_products: unique(blueprints.flatMap(item => item.intelligence_products)),
    required_assertions: unique(blueprints.flatMap(item => item.required_assertions)),
    required_metrics: requiredMetrics,
    required_data_fields: requiredDataFields,
    required_source_roles: requiredSourceRoles,
    minimum_independent_source_families: Math.max(...blueprints.map(item => item.minimum_independent_source_families)),
    coverage_requirements: coverage,
    risk_and_limitations: unique(blueprints.flatMap(item => item.risk_and_limitations)),
    metric_field_map: metricFieldMap,
    field_source_role_map: fieldSourceRoleMap
  };
}

function buildDecisionRecord({ archetype, scope, blueprintMap, contract }) {
  const valueScopeIds = unique([
    archetype.primary_value_scope_id,
    ...(archetype.secondary_value_scope_ids ?? [])
  ]);
  const blueprints = valueScopeIds.map(id => blueprintMap.get(id));
  const combined = combineBlueprints(blueprints);
  const isGlobal = archetype.scope_mode === "GLOBAL_PROGRAM";
  const scopeSuffix = isGlobal ? "global-program" : scope.scope_id;
  const decisionScopeId = `ds-${slug(archetype.archetype_id)}-${slug(scopeSuffix)}`;

  return {
    decision_scope_id: decisionScopeId,
    record_type: "decision_dna",
    version: "1.0.0",
    state: "STRUCTURALLY_COMPILED_EVIDENCE_NOT_EVALUATED",
    customer_segment: archetype.customer_segment,
    decision_archetype_id: archetype.archetype_id,
    decision_name: archetype.decision_name,
    decision_context: isGlobal
      ? `${archetype.decision_name} across the AGCI-OS program.`
      : `${archetype.decision_name} for ${scope.name} (${scope.scope_id}).`,
    decision_consequence: archetype.decision_consequence,
    irreplaceable_value_scope_ids: valueScopeIds,
    intelligence_product_ids: combined.intelligence_products,
    required_assertions: combined.required_assertions,
    required_metrics: combined.required_metrics,
    required_data_fields: combined.required_data_fields,
    required_collection_scopes: isGlobal ? [] : [scope.scope_id],
    required_source_roles: combined.required_source_roles,
    minimum_independent_source_families: combined.minimum_independent_source_families,
    coverage_requirements: combined.coverage_requirements,
    confidence_model: contract.confidence_model,
    risk_and_limitations: combined.risk_and_limitations,
    single_source_substitution_test: "PASS_ONLY_WHEN_NO_SINGLE_SOURCE_CAN_REPRODUCE_EQUIVALENT_IDENTITY_COVERAGE_MEMORY_CONFIDENCE_AND_EXPLANATION",
    single_provider_substitution_test: "PASS_ONLY_WHEN_REMOVING_ANY_ONE_PROVIDER_REDUCES_COVERAGE_OR_LATENCY_BUT_NOT_PLATFORM_TRUTH_OR_DECISION_LOGIC",
    source_removal_behavior: "FAIL_CLOSED_OR_CONTINUE_WITH_EXPLICIT_COVERAGE_CONFIDENCE_AND_DEPENDENCY_DELTA",
    publication_gate: "TRACK_B_VALIDATION_AND_FOUNDER_AUTHORIZATION_REQUIRED",
    actual_evidence_readiness: null,
    actual_evidence_readiness_status: "NOT_MEASURED",
    actual_decision_accuracy: null,
    actual_decision_accuracy_status: "NOT_MEASURED",
    owner: archetype.owner,
    production: "HOLD"
  };
}

function buildValueScopeLibrary(contract, decisionRecords) {
  const records = contract.value_scope_blueprints.map(blueprint => ({
    value_scope_id: blueprint.value_scope_id,
    name: blueprint.name,
    intelligence_product_ids: blueprint.intelligence_products,
    required_assertions: blueprint.required_assertions,
    required_metrics: blueprint.required_metrics,
    required_data_fields: unique(Object.values(blueprint.metric_field_map).flat()),
    required_source_roles: unique(Object.values(blueprint.field_source_role_map).flat()),
    minimum_independent_source_families: blueprint.minimum_independent_source_families,
    coverage_requirements: blueprint.coverage_requirements,
    risk_and_limitations: blueprint.risk_and_limitations,
    decision_scope_count: decisionRecords.filter(record => record.irreplaceable_value_scope_ids.includes(blueprint.value_scope_id)).length,
    actual_value_performance: null,
    actual_value_performance_status: "NOT_MEASURED",
    publication: "PROHIBITED"
  }));
  return {
    id: "kidults-value-scope-library-v1",
    record_type: "value_scope_library",
    version: "1.0.0",
    status: "STRUCTURAL_TRACEABILITY_PASS_OPERATIONAL_EVIDENCE_PENDING",
    generated_at: contract.effective_at,
    value_scope_count: records.length,
    records,
    production: "HOLD"
  };
}

function buildProductLibrary(contract, decisionRecords) {
  const productMap = new Map();
  for (const blueprint of contract.value_scope_blueprints) {
    for (const productId of blueprint.intelligence_products) {
      const current = productMap.get(productId) ?? {
        intelligence_product_id: productId,
        value_scope_ids: [],
        required_assertions: [],
        required_metrics: [],
        required_data_fields: [],
        required_source_roles: []
      };
      current.value_scope_ids = unique([...current.value_scope_ids, blueprint.value_scope_id]);
      current.required_assertions = unique([...current.required_assertions, ...blueprint.required_assertions]);
      current.required_metrics = unique([...current.required_metrics, ...blueprint.required_metrics]);
      current.required_data_fields = unique([
        ...current.required_data_fields,
        ...Object.values(blueprint.metric_field_map).flat()
      ]);
      current.required_source_roles = unique([
        ...current.required_source_roles,
        ...Object.values(blueprint.field_source_role_map).flat()
      ]);
      productMap.set(productId, current);
    }
  }

  const records = [...productMap.values()]
    .sort((a, b) => a.intelligence_product_id.localeCompare(b.intelligence_product_id))
    .map(record => ({
      ...record,
      decision_scope_count: decisionRecords.filter(item => item.intelligence_product_ids.includes(record.intelligence_product_id)).length,
      product_state: "CONTRACT_READY_DATA_AND_OUTCOME_CALIBRATION_PENDING",
      actual_customer_value: null,
      actual_customer_value_status: "NOT_MEASURED",
      publication: "PROHIBITED"
    }));

  return {
    id: "kidults-intelligence-product-library-v1",
    record_type: "intelligence_product_library",
    version: "1.0.0",
    status: "STRUCTURAL_TRACEABILITY_PASS_OPERATIONAL_EVIDENCE_PENDING",
    generated_at: contract.effective_at,
    product_count: records.length,
    records,
    production: "HOLD"
  };
}

function buildTraceabilityMaps(contract) {
  const valueToMetric = contract.value_scope_blueprints.map(blueprint => ({
    value_scope_id: blueprint.value_scope_id,
    metrics: blueprint.required_metrics
  }));

  const metricRecords = [];
  const fieldRoleMap = new Map();
  for (const blueprint of contract.value_scope_blueprints) {
    for (const [metric, fields] of Object.entries(blueprint.metric_field_map)) {
      metricRecords.push({
        metric_id: metric,
        value_scope_id: blueprint.value_scope_id,
        data_fields: fields,
        evidence_required: true,
        unsupported_state: "NOT_VERIFIED"
      });
    }
    for (const [field, roles] of Object.entries(blueprint.field_source_role_map)) {
      const record = fieldRoleMap.get(field) ?? { data_field: field, value_scope_ids: [], source_roles: [] };
      record.value_scope_ids = unique([...record.value_scope_ids, blueprint.value_scope_id]);
      record.source_roles = unique([...record.source_roles, ...roles]);
      fieldRoleMap.set(field, record);
    }
  }

  return {
    valueToMetric: {
      id: "kidults-value-to-metric-map-v1",
      record_type: "value_to_metric_map",
      version: "1.0.0",
      generated_at: contract.effective_at,
      records: valueToMetric,
      production: "HOLD"
    },
    metricToField: {
      id: "kidults-metric-to-data-field-map-v1",
      record_type: "metric_to_data_field_map",
      version: "1.0.0",
      generated_at: contract.effective_at,
      records: metricRecords.sort((a, b) => `${a.value_scope_id}:${a.metric_id}`.localeCompare(`${b.value_scope_id}:${b.metric_id}`)),
      production: "HOLD"
    },
    fieldToRole: {
      id: "kidults-data-field-to-source-role-map-v1",
      record_type: "data_field_to_source_role_map",
      version: "1.0.0",
      generated_at: contract.effective_at,
      records: [...fieldRoleMap.values()].sort((a, b) => a.data_field.localeCompare(b.data_field)),
      production: "HOLD"
    }
  };
}

function buildCoverageMatrix(contract, collectionScopes, decisionRecords) {
  const records = collectionScopes.records.map(scope => {
    const scopedDecisions = decisionRecords.filter(record => record.required_collection_scopes.includes(scope.scope_id));
    return {
      scope_id: scope.scope_id,
      scope_name: scope.name,
      parent_core_domain: scope.parent_core_domain,
      decision_scope_count: scopedDecisions.length,
      customer_segments: unique(scopedDecisions.map(record => record.customer_segment)),
      value_scope_ids: unique(scopedDecisions.flatMap(record => record.irreplaceable_value_scope_ids)),
      intelligence_product_ids: unique(scopedDecisions.flatMap(record => record.intelligence_product_ids)),
      metric_ids: unique(scopedDecisions.flatMap(record => record.required_metrics)),
      data_fields: unique(scopedDecisions.flatMap(record => record.required_data_fields)),
      source_roles: unique(scopedDecisions.flatMap(record => record.required_source_roles)),
      structural_mapping_state: "PASS",
      source_pool_readiness: null,
      source_pool_readiness_status: "NOT_MEASURED",
      representative_sampling_readiness: null,
      representative_sampling_readiness_status: "NOT_MEASURED",
      actual_qualified_objects: null,
      actual_qualified_objects_status: "NOT_MEASURED"
    };
  });

  return {
    id: "kidults-collection-scope-value-coverage-matrix-v1",
    record_type: "collection_scope_value_coverage_matrix",
    version: "1.0.0",
    status: "STRUCTURAL_MAPPING_PASS_OPERATIONAL_READINESS_PENDING",
    generated_at: contract.effective_at,
    collection_scope_count: records.length,
    records,
    candidate_r2: "BLOCKED",
    production: "HOLD"
  };
}

function buildProcessMap(contract) {
  const owners = {
    CUSTOMER_DECISION: "KPMO / Track A",
    VALUE_SCOPE: "KPMO / Track A",
    INTELLIGENCE_PRODUCT: "Track A / Track C",
    ASSERTION_AND_METRIC: "Track A / Track B",
    DATA_SCOPE: "Track A",
    COLLECTION_SCOPE: "Track A",
    SOURCE_UNIVERSE_AND_POOL: "Track A",
    RISK_RIGHTS_COST_GATE: "Track A / Track B / KPMO",
    REPRESENTATIVE_ACQUISITION: "Track A / Track D",
    RAW_QUARANTINE: "Track A / Track D",
    CANONICAL_IDENTITY: "Track A",
    EVIDENCE_AND_MARKET_GRAPH: "Track A",
    BITEMPORAL_MEMORY: "Track A / Track D",
    PROVIDER_FUSION: "Track A / Track D",
    CONFIDENCE_AND_EXPLAINABILITY: "Track A / Track B / Track C",
    TRACK_B_VALIDATION: "Track B",
    GOVERNED_PROJECTION: "Track C",
    FOUNDER_AND_PRODUCTION_GATE: "Founder / KPMO / Track D"
  };

  const records = contract.process_stages.map((stage, index) => ({
    sequence: index + 1,
    stage,
    value_input: index === 0 ? "CUSTOMER_AND_INSTITUTIONAL_DECISION_NEED" : contract.process_stages[index - 1],
    value_output: stage,
    quality_gate: `GATE_${stage}`,
    failure_state: `HOLD_${stage}_NOT_READY`,
    audit_record: `AUDIT_${stage}`,
    owner: owners[stage] ?? "KPMO",
    bypass_allowed: false
  }));

  return {
    id: "kidults-dos-process-operating-map-v1",
    record_type: "dos_process_operating_map",
    version: "1.0.0",
    generated_at: contract.effective_at,
    process_stage_count: records.length,
    records,
    production: "HOLD"
  };
}

function buildGapRegister(contract, decisionRecords, coverageMatrix, runtime) {
  const structuralGaps = [];
  for (const segment of contract.customer_segments) {
    if (!decisionRecords.some(record => record.customer_segment === segment)) structuralGaps.push(`MISSING_SEGMENT:${segment}`);
  }
  for (const blueprint of contract.value_scope_blueprints) {
    if (!decisionRecords.some(record => record.irreplaceable_value_scope_ids.includes(blueprint.value_scope_id))) {
      structuralGaps.push(`MISSING_VALUE_SCOPE:${blueprint.value_scope_id}`);
    }
  }
  for (const scope of coverageMatrix.records) {
    if (scope.decision_scope_count === 0) structuralGaps.push(`UNMAPPED_COLLECTION_SCOPE:${scope.scope_id}`);
  }

  const operationalGaps = [
    "ACTUAL_DECISION_OUTCOME_CALIBRATION_NOT_AVAILABLE",
    "ACTUAL_EVIDENCE_READINESS_NOT_MEASURED",
    "SOURCE_POOL_READINESS_NOT_MEASURED",
    "REPRESENTATIVE_SAMPLING_NOT_EXECUTED",
    "CATEGORY_1000_MINIMUM_FLOOR_NOT_REACHED",
    "PROVIDER_FUSION_NOT_ACTIVATED",
    "CANDIDATE_R2_BLOCKED",
    "KIDULT_500_NOT_COMPUTED",
    "KIDULT_100_NOT_COMPUTED"
  ];
  if (runtime.commercial_relationship.technical_resource_binding !== "VERIFIED") {
    operationalGaps.push("DIGITALOCEAN_TECHNICAL_BINDING_NOT_VERIFIED");
  }

  return {
    id: "kidults-value-gap-register-v1",
    record_type: "value_gap_register",
    version: "1.0.0",
    status: structuralGaps.length === 0
      ? "STRUCTURAL_TRACEABILITY_PASS_OPERATIONAL_GAPS_ACTIVE"
      : "STRUCTURAL_TRACEABILITY_BLOCKED",
    generated_at: contract.effective_at,
    structural_gaps: structuralGaps,
    structural_gap_count: structuralGaps.length,
    operational_gaps: operationalGaps,
    operational_gap_count: operationalGaps.length,
    unknown_requirements_coerced_to_known: 0,
    default_unlinked_work_state: "HOLD_NOT_ALIGNED",
    production: "HOLD"
  };
}

export function buildDosV1(inputs = loadDosInputs()) {
  const { contract, archetypes, collectionScopes, valueOperating, runtime } = inputs;
  const blueprintMap = new Map(contract.value_scope_blueprints.map(item => [item.value_scope_id, item]));
  const decisionRecords = [];

  for (const archetype of archetypes.records) {
    if (archetype.scope_mode === "ALL_COLLECTION_SCOPES") {
      for (const scope of collectionScopes.records) {
        decisionRecords.push(buildDecisionRecord({ archetype, scope, blueprintMap, contract }));
      }
    } else if (archetype.scope_mode === "GLOBAL_PROGRAM") {
      decisionRecords.push(buildDecisionRecord({ archetype, scope: null, blueprintMap, contract }));
    } else {
      throw new Error(`Unsupported scope_mode: ${archetype.scope_mode}`);
    }
  }
  decisionRecords.sort((a, b) => a.decision_scope_id.localeCompare(b.decision_scope_id));

  const decisionLibrary = {
    id: "kidults-decision-library-v1",
    record_type: "decision_library",
    version: "1.0.0",
    status: "DOS_FOUNDATION_COMPILED_OPERATIONAL_EVIDENCE_PENDING",
    generated_at: contract.effective_at,
    dos_contract_id: contract.id,
    value_operating_contract_id: valueOperating.id,
    archetype_library_id: archetypes.id,
    customer_segment_count: unique(decisionRecords.map(record => record.customer_segment)).length,
    decision_archetype_count: archetypes.records.length,
    decision_scope_count: decisionRecords.length,
    collection_scope_count: collectionScopes.records.length,
    records: decisionRecords,
    actual_decision_accuracy: null,
    actual_decision_accuracy_status: "NOT_MEASURED",
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const valueScopeLibrary = buildValueScopeLibrary(contract, decisionRecords);
  const productLibrary = buildProductLibrary(contract, decisionRecords);
  const traceability = buildTraceabilityMaps(contract);
  const coverageMatrix = buildCoverageMatrix(contract, collectionScopes, decisionRecords);
  const processMap = buildProcessMap(contract);
  const gapRegister = buildGapRegister(contract, decisionRecords, coverageMatrix, runtime);

  const featureAdmissionPolicy = {
    id: "kidults-dos-feature-admission-policy-v1",
    record_type: "feature_admission_policy",
    version: "1.0.0",
    generated_at: contract.effective_at,
    required_fields: contract.decision_dna_contract.required_fields,
    pass_requirements: contract.feature_admission_gate.pass_when,
    default_state: contract.feature_admission_gate.default_state,
    unlinked_feature_state: "HOLD_NOT_ALIGNED",
    cosmetic_exception: contract.feature_admission_gate.cosmetic_exception,
    production: "HOLD"
  };

  const outputs = {
    "decision-library-v1.json": decisionLibrary,
    "value-scope-library-v1.json": valueScopeLibrary,
    "intelligence-product-library-v1.json": productLibrary,
    "value-to-metric-map-v1.json": traceability.valueToMetric,
    "metric-to-data-field-map-v1.json": traceability.metricToField,
    "data-field-to-source-role-map-v1.json": traceability.fieldToRole,
    "collection-scope-value-coverage-matrix-v1.json": coverageMatrix,
    "value-gap-register-v1.json": gapRegister,
    "process-operating-map-v1.json": processMap,
    "feature-admission-policy-v1.json": featureAdmissionPolicy
  };

  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);

  const manifest = {
    id: "kidults-dos-v1-run-manifest",
    record_type: "dos_compiler_run",
    version: "1.0.0",
    status: "DOS_FOUNDATION_PASS",
    generated_at: contract.effective_at,
    inputs: {
      dos_contract: { id: contract.id, fingerprint: fingerprint(contract) },
      archetype_library: { id: archetypes.id, fingerprint: fingerprint(archetypes) },
      collection_scope_registry: { id: collectionScopes.id, fingerprint: fingerprint(collectionScopes) },
      value_operating_contract: { id: valueOperating.id, fingerprint: fingerprint(valueOperating) },
      digitalocean_runtime_contract: { id: runtime.id, fingerprint: fingerprint(runtime) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    customer_segments: decisionLibrary.customer_segment_count,
    value_scopes: valueScopeLibrary.value_scope_count,
    intelligence_products: productLibrary.product_count,
    decision_archetypes: decisionLibrary.decision_archetype_count,
    decision_scopes: decisionLibrary.decision_scope_count,
    collection_scopes: decisionLibrary.collection_scope_count,
    process_stages: processMap.process_stage_count,
    structural_gap_count: gapRegister.structural_gap_count,
    operational_gap_count: gapRegister.operational_gap_count,
    unlinked_feature_default: featureAdmissionPolicy.default_state,
    digitalocean_commercial_state: runtime.commercial_relationship.state,
    digitalocean_technical_binding: runtime.commercial_relationship.technical_resource_binding,
    market_claims_created: 0,
    indexes_computed: 0,
    candidate_r2_created: false,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;

  return outputs;
}

function writeOutputs(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildDosV1();
  if (config.write) writeOutputs(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Decision Operating System v1: FOUNDATION PASS");
  console.log(`Customer segments: ${manifest.customer_segments}`);
  console.log(`Value scopes: ${manifest.value_scopes}`);
  console.log(`Intelligence products: ${manifest.intelligence_products}`);
  console.log(`Decision archetypes: ${manifest.decision_archetypes}`);
  console.log(`Decision DNA records: ${manifest.decision_scopes}`);
  console.log(`Collection Scopes: ${manifest.collection_scopes}`);
  console.log(`Process stages: ${manifest.process_stages}`);
  console.log(`DigitalOcean: ${manifest.digitalocean_commercial_state} / ${manifest.digitalocean_technical_binding}`);
  console.log("Candidate R2: BLOCKED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
