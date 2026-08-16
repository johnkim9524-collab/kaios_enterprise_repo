import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildDosV1 } from "./build-dos-v1.mjs";
import { buildScopeSourcePoolReadiness } from "../source-intelligence/build-scope-source-pool-readiness-v1.mjs";

const root = process.cwd();
const defaultOutput = path.join(root, "artifacts", "agci-os", "dos-asi-execution-v1");
const contractPath = path.join(root, "coordination", "kidults", "dos", "dos-asi-decision-gap-execution-contract-v1.json");
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

export function loadDosAsiExecutionInputs() {
  return {
    contract: readJson(contractPath),
    runtime: readJson(runtimePath),
    dos: buildDosV1(),
    sourcePool: buildScopeSourcePoolReadiness()
  };
}

function laneComparator(contract) {
  const roleCriticality = contract.priority_model.source_role_mission_criticality;
  return (left, right) => {
    const leftCriticality = roleCriticality[left.source_role] ?? 999;
    const rightCriticality = roleCriticality[right.source_role] ?? 999;
    return leftCriticality - rightCriticality ||
      right.customer_segment_count - left.customer_segment_count ||
      right.decision_scope_count - left.decision_scope_count ||
      right.value_scope_count - left.value_scope_count ||
      right.intelligence_product_count - left.intelligence_product_count ||
      right.role_specific_data_field_count - left.role_specific_data_field_count ||
      right.metric_count - left.metric_count ||
      left.scope_id.localeCompare(right.scope_id) ||
      left.source_role.localeCompare(right.source_role);
  };
}

function allocateRoundRobin(items, total, floor) {
  if (items.length === 0) throw new Error("Cannot allocate against an empty item set.");
  if (total < items.length * floor) throw new Error("Allocation target is below the required floor.");
  const allocation = new Map(items.map(item => [item.lane_id, floor]));
  let remaining = total - items.length * floor;
  let cursor = 0;
  while (remaining > 0) {
    const item = items[cursor % items.length];
    allocation.set(item.lane_id, allocation.get(item.lane_id) + 1);
    cursor += 1;
    remaining -= 1;
  }
  return allocation;
}

function selectWithGroupFloor(items, total, groupKey, requiredIds = new Set()) {
  if (total < requiredIds.size) throw new Error("Selection target is below the required item set.");
  const selected = new Set(requiredIds);
  const groups = new Map();
  for (const item of items) {
    const group = item[groupKey];
    const values = groups.get(group) ?? [];
    values.push(item);
    groups.set(group, values);
  }

  for (const group of [...groups.keys()].sort()) {
    const values = groups.get(group);
    if (!values.some(item => selected.has(item.lane_id))) selected.add(values[0].lane_id);
  }

  for (const item of items) {
    if (selected.size >= total) break;
    selected.add(item.lane_id);
  }

  if (selected.size !== total) {
    throw new Error(`Unable to select ${total} items; selected ${selected.size}.`);
  }
  return selected;
}

const SUPPLEMENTAL_ROLE_QUERY_TERMS = Object.freeze({
  AUCTION_PRIVATE_SALE: "auction results private sale lot archive",
  INDEPENDENT_VERIFICATION: "independent verification research dataset cross reference",
  MACRO_CONTEXT: "market report regulation insurance currency macro context"
});

function supplementalQueryTemplates(scope, role) {
  const roleTerms = SUPPLEMENTAL_ROLE_QUERY_TERMS[role] ?? role.toLowerCase().replaceAll("_", " ");
  return [
    `${scope.name} ${roleTerms} official API dataset`,
    `\"${scope.name}\" ${roleTerms} global`,
    `${scope.name} ${roleTerms} archive research`
  ];
}

function buildLane({ queueItem, scope, sourceRole, mandatory, decisionRecords, globalDecisionRecords, fieldRoleMap, contract }) {
  const scopedRecords = decisionRecords.filter(record =>
    record.required_collection_scopes.includes(scope.scope_id) && record.required_source_roles.includes(sourceRole));
  const globalRecords = globalDecisionRecords.filter(record => record.required_source_roles.includes(sourceRole));
  const relevantRecords = [...scopedRecords, ...globalRecords];
  const roleSpecificFields = unique(relevantRecords.flatMap(record =>
    record.required_data_fields.filter(field => fieldRoleMap.get(field)?.has(sourceRole))));
  const metrics = unique(relevantRecords.flatMap(record => record.required_metrics));
  const valueScopes = unique(relevantRecords.flatMap(record => record.irreplaceable_value_scope_ids));
  const products = unique(relevantRecords.flatMap(record => record.intelligence_product_ids));
  const segments = unique(relevantRecords.map(record => record.customer_segment));
  const laneId = mandatory
    ? queueItem.queue_id
    : `supplemental:${scope.scope_id}:${sourceRole.toLowerCase()}`;

  return {
    lane_id: laneId,
    lane_class: mandatory ? "MANDATORY_BATCH_1" : "SUPPLEMENTAL_VALUE_TRACEABLE_BACKLOG",
    scope_id: scope.scope_id,
    scope_name: scope.name,
    parent_core_domain: scope.parent_core_domain,
    source_role: sourceRole,
    source_role_mission_criticality: contract.priority_model.source_role_mission_criticality[sourceRole] ?? 999,
    decision_scope_ids: unique(relevantRecords.map(record => record.decision_scope_id)),
    decision_scope_count: relevantRecords.length,
    scoped_decision_count: scopedRecords.length,
    global_program_decision_count: globalRecords.length,
    customer_segments: segments,
    customer_segment_count: segments.length,
    value_scope_ids: valueScopes,
    value_scope_count: valueScopes.length,
    intelligence_product_ids: products,
    intelligence_product_count: products.length,
    metric_ids: metrics,
    metric_count: metrics.length,
    role_specific_data_fields: roleSpecificFields,
    role_specific_data_field_count: roleSpecificFields.length,
    minimum_independent_source_families: relevantRecords.length
      ? Math.max(...relevantRecords.map(record => record.minimum_independent_source_families))
      : 0,
    known_risks_and_limitations: unique(relevantRecords.flatMap(record => record.risk_and_limitations)),
    query_templates: mandatory ? queueItem.query_templates : supplementalQueryTemplates(scope, sourceRole),
    known_domain_seed_hints: mandatory ? (queueItem.known_domain_seed_hints ?? []) : [],
    structural_priority_state: "STRUCTURAL_ONLY_EMPIRICAL_VALUE_NOT_CALIBRATED",
    actual_source_candidates: null,
    actual_source_candidates_status: "NOT_MEASURED",
    actual_utility: null,
    actual_utility_status: "NOT_MEASURED",
    actual_risk: null,
    actual_risk_status: "NOT_ASSESSED",
    actual_cost: null,
    actual_cost_status: "NOT_MEASURED",
    acquisition_authorized: false,
    public_projection: false,
    production_eligible: false
  };
}

export function buildDosAsiExecutionV1(inputs = loadDosAsiExecutionInputs()) {
  const { contract, runtime, dos, sourcePool } = inputs;
  const decisionLibrary = dos["decision-library-v1.json"];
  const fieldToRole = dos["data-field-to-source-role-map-v1.json"];
  const coverageMatrix = dos["collection-scope-value-coverage-matrix-v1.json"];
  const sourceQueue = sourcePool["acquisition-priority-queue.json"];
  const scopeReadiness = sourcePool["scope-source-pool-readiness.json"];
  const fieldRoleMap = new Map(fieldToRole.records.map(record => [record.data_field, new Set(record.source_roles)]));
  const queueMap = new Map(sourceQueue.items.map(item => [`${item.scope_id}:${item.source_role}`, item]));
  const globalDecisionRecords = decisionLibrary.records.filter(record => record.required_collection_scopes.length === 0);
  const scopedDecisionRecords = decisionLibrary.records.filter(record => record.required_collection_scopes.length > 0);
  const mandatoryRoles = unique(sourceQueue.items.map(item => item.source_role));
  const supplementalRoles = contract.lane_model.supplemental_roles;
  const mandatoryLanes = [];
  const supplementalLanes = [];

  for (const scope of scopeReadiness.scopes) {
    for (const sourceRole of mandatoryRoles) {
      const queueItem = queueMap.get(`${scope.scope_id}:${sourceRole}`);
      if (!queueItem) throw new Error(`Missing mandatory queue item for ${scope.scope_id}:${sourceRole}`);
      mandatoryLanes.push(buildLane({
        queueItem,
        scope,
        sourceRole,
        mandatory: true,
        decisionRecords: scopedDecisionRecords,
        globalDecisionRecords,
        fieldRoleMap,
        contract
      }));
    }
    for (const sourceRole of supplementalRoles) {
      supplementalLanes.push(buildLane({
        queueItem: null,
        scope,
        sourceRole,
        mandatory: false,
        decisionRecords: scopedDecisionRecords,
        globalDecisionRecords,
        fieldRoleMap,
        contract
      }));
    }
  }

  const compare = laneComparator(contract);
  mandatoryLanes.sort(compare);
  supplementalLanes.sort(compare);
  mandatoryLanes.forEach((lane, index) => { lane.structural_priority_rank = index + 1; });
  supplementalLanes.forEach((lane, index) => { lane.structural_priority_rank = index + 1; });

  const adapterIds = selectWithGroupFloor(
    mandatoryLanes,
    contract.asi_batch_1.bounded_adapter_contract_target,
    "parent_core_domain"
  );
  const preflightIds = selectWithGroupFloor(
    mandatoryLanes,
    contract.asi_batch_1.rights_access_cost_preflight_target,
    "parent_core_domain",
    adapterIds
  );
  const deepIds = selectWithGroupFloor(
    mandatoryLanes,
    contract.asi_batch_1.deep_assessment_target,
    "scope_id",
    preflightIds
  );
  const discoveryAllocation = allocateRoundRobin(
    mandatoryLanes,
    contract.asi_batch_1.unique_source_endpoint_discovery_target,
    contract.asi_batch_1.discovery_lane_floor
  );

  for (const lane of mandatoryLanes) {
    lane.batch_1_targets = {
      unique_source_endpoints: discoveryAllocation.get(lane.lane_id),
      deep_assessments: deepIds.has(lane.lane_id) ? 1 : 0,
      rights_access_cost_preflights: preflightIds.has(lane.lane_id) ? 1 : 0,
      bounded_adapter_contracts: adapterIds.has(lane.lane_id) ? 1 : 0
    };
    lane.execution_state = "PLAN_READY_DISCOVERY_NOT_EXECUTED";
  }
  for (const lane of supplementalLanes) {
    lane.batch_1_targets = {
      unique_source_endpoints: 0,
      deep_assessments: 0,
      rights_access_cost_preflights: 0,
      bounded_adapter_contracts: 0
    };
    lane.execution_state = contract.lane_model.supplemental_lane_state;
  }

  const allLanes = [...mandatoryLanes, ...supplementalLanes]
    .sort((left, right) => left.scope_id.localeCompare(right.scope_id) ||
      left.source_role_mission_criticality - right.source_role_mission_criticality ||
      left.source_role.localeCompare(right.source_role));
  const representedDecisionIds = new Set(allLanes.flatMap(lane => lane.decision_scope_ids));
  const uncoveredDecisionRecords = decisionLibrary.records.filter(record => !representedDecisionIds.has(record.decision_scope_id));

  const ledger = {
    id: "kidults-decision-source-requirement-ledger-v1",
    record_type: "decision_source_requirement_ledger",
    version: "1.0.0",
    status: uncoveredDecisionRecords.length === 0
      ? "DECISION_TO_SOURCE_ROLE_TRACEABILITY_PASS_EXECUTION_PENDING"
      : "DECISION_TO_SOURCE_ROLE_TRACEABILITY_GAP",
    generated_at: contract.effective_at,
    dos_contract_id: dos["run-manifest.json"].id,
    bridge_contract_id: contract.id,
    decision_dna_count: decisionLibrary.decision_scope_count,
    represented_decision_dna_count: representedDecisionIds.size,
    uncovered_decision_dna_count: uncoveredDecisionRecords.length,
    uncovered_decision_scope_ids: uncoveredDecisionRecords.map(record => record.decision_scope_id),
    collection_scope_count: coverageMatrix.collection_scope_count,
    mandatory_lane_count: mandatoryLanes.length,
    supplemental_lane_count: supplementalLanes.length,
    total_lane_count: allLanes.length,
    mandatory_source_roles: mandatoryRoles,
    supplemental_source_roles: supplementalRoles,
    records: allLanes,
    actual_source_readiness: null,
    actual_source_readiness_status: "NOT_MEASURED",
    acquisition_authorized: false,
    public_projection: false,
    production: "HOLD"
  };

  const priorityQueue = {
    id: "kidults-dos-asi-priority-queue-v1",
    record_type: "dos_asi_priority_queue",
    version: "1.0.0",
    status: "DECISION_WEIGHTED_STRUCTURAL_QUEUE_READY_DISCOVERY_NOT_EXECUTED",
    generated_at: contract.effective_at,
    priority_model: contract.priority_model,
    mandatory_work_item_count: mandatoryLanes.length,
    supplemental_backlog_count: supplementalLanes.length,
    items: mandatoryLanes.map(lane => ({
      queue_id: lane.lane_id,
      structural_priority_rank: lane.structural_priority_rank,
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      decision_scope_count: lane.decision_scope_count,
      customer_segment_count: lane.customer_segment_count,
      value_scope_count: lane.value_scope_count,
      intelligence_product_count: lane.intelligence_product_count,
      metric_count: lane.metric_count,
      role_specific_data_field_count: lane.role_specific_data_field_count,
      value_scope_ids: lane.value_scope_ids,
      intelligence_product_ids: lane.intelligence_product_ids,
      role_specific_data_fields: lane.role_specific_data_fields,
      query_templates: lane.query_templates,
      batch_1_targets: lane.batch_1_targets,
      required_next_gate: "DISCOVER_DEDUPLICATE_CLASSIFY_AND_ASSESS_SCOPE_RELEVANCE",
      queue_state: lane.execution_state,
      acquisition_authorized: false,
      production_eligible: false
    })),
    supplemental_backlog: supplementalLanes.map(lane => ({
      queue_id: lane.lane_id,
      structural_priority_rank: lane.structural_priority_rank,
      scope_id: lane.scope_id,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      decision_scope_count: lane.decision_scope_count,
      value_scope_ids: lane.value_scope_ids,
      intelligence_product_ids: lane.intelligence_product_ids,
      role_specific_data_fields: lane.role_specific_data_fields,
      query_templates: lane.query_templates,
      queue_state: lane.execution_state,
      acquisition_authorized: false,
      production_eligible: false
    })),
    empirical_priority_calibrated: false,
    acquisition_authorized: false,
    public_projection: false,
    production: "HOLD"
  };

  const categoryMap = new Map();
  const scopePlanMap = new Map();
  for (const lane of mandatoryLanes) {
    const category = categoryMap.get(lane.parent_core_domain) ?? {
      core_domain_id: lane.parent_core_domain,
      scope_ids: new Set(),
      discovery_target: 0,
      deep_assessment_target: 0,
      preflight_target: 0,
      adapter_target: 0
    };
    category.scope_ids.add(lane.scope_id);
    category.discovery_target += lane.batch_1_targets.unique_source_endpoints;
    category.deep_assessment_target += lane.batch_1_targets.deep_assessments;
    category.preflight_target += lane.batch_1_targets.rights_access_cost_preflights;
    category.adapter_target += lane.batch_1_targets.bounded_adapter_contracts;
    categoryMap.set(lane.parent_core_domain, category);

    const scopePlan = scopePlanMap.get(lane.scope_id) ?? {
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      lane_count: 0,
      discovery_target: 0,
      deep_assessment_target: 0,
      preflight_target: 0,
      adapter_target: 0
    };
    scopePlan.lane_count += 1;
    scopePlan.discovery_target += lane.batch_1_targets.unique_source_endpoints;
    scopePlan.deep_assessment_target += lane.batch_1_targets.deep_assessments;
    scopePlan.preflight_target += lane.batch_1_targets.rights_access_cost_preflights;
    scopePlan.adapter_target += lane.batch_1_targets.bounded_adapter_contracts;
    scopePlanMap.set(lane.scope_id, scopePlan);
  }

  const batchPlan = {
    id: "kidults-asi-batch-1-execution-plan-v1",
    record_type: "asi_batch_execution_plan",
    version: "1.0.0",
    status: "PLAN_READY_EXECUTION_NOT_STARTED",
    generated_at: contract.effective_at,
    bridge_contract_id: contract.id,
    targets: contract.asi_batch_1,
    actual: {
      unique_source_endpoints: null,
      deep_assessments: null,
      rights_access_cost_preflights: null,
      bounded_adapter_contracts: null,
      status: "NOT_EXECUTED"
    },
    category_allocations: [...categoryMap.values()]
      .sort((a, b) => a.core_domain_id.localeCompare(b.core_domain_id))
      .map(record => ({ ...record, scope_ids: [...record.scope_ids].sort() })),
    scope_allocations: [...scopePlanMap.values()].sort((a, b) => a.scope_id.localeCompare(b.scope_id)),
    mandatory_lane_count: mandatoryLanes.length,
    mandatory_lane_discovery_floor_pass: mandatoryLanes.every(lane => lane.batch_1_targets.unique_source_endpoints >= 1),
    every_scope_deep_assessment_floor_pass: [...scopePlanMap.values()].every(scope => scope.deep_assessment_target >= 1),
    every_category_preflight_floor_pass: [...categoryMap.values()].every(category => category.preflight_target >= 1),
    every_category_adapter_floor_pass: [...categoryMap.values()].every(category => category.adapter_target === 1),
    adapter_prerequisite_pass: mandatoryLanes
      .filter(lane => lane.batch_1_targets.bounded_adapter_contracts > 0)
      .every(lane => lane.batch_1_targets.deep_assessments > 0 && lane.batch_1_targets.rights_access_cost_preflights > 0),
    discovery_authorized: true,
    bulk_acquisition_authorized: false,
    market_claim_authorized: false,
    production: "HOLD"
  };

  const workloadEnvelope = {
    id: "kidults-digitalocean-asi-workload-envelope-v1",
    record_type: "digitalocean_asi_workload_envelope",
    version: "1.0.0",
    status: "WORKLOAD_DEFINED_TECHNICAL_BINDING_AND_SIZING_PENDING",
    generated_at: contract.effective_at,
    runtime_contract_id: runtime.id,
    digitalocean_commercial_state: runtime.commercial_relationship.state,
    digitalocean_technical_binding: runtime.commercial_relationship.technical_resource_binding,
    runtime_role: contract.digitalocean_handoff.runtime_role,
    workload: {
      mandatory_queue_items: mandatoryLanes.length,
      supplemental_backlog_items: supplementalLanes.length,
      source_discovery_operations: contract.asi_batch_1.unique_source_endpoint_discovery_target,
      deep_assessment_operations: contract.asi_batch_1.deep_assessment_target,
      preflight_operations: contract.asi_batch_1.rights_access_cost_preflight_target,
      adapter_contract_operations: contract.asi_batch_1.bounded_adapter_contract_target,
      collection_scopes: contract.asi_batch_1.collection_scopes,
      core_domain_categories: contract.asi_batch_1.core_domain_categories
    },
    sizing: {
      worker_concurrency: null,
      worker_concurrency_status: "NOT_MEASURED",
      queue_throughput: null,
      queue_throughput_status: "NOT_MEASURED",
      storage_growth_bytes: null,
      storage_growth_status: "NOT_MEASURED",
      latency_ms: null,
      latency_status: "NOT_MEASURED",
      retry_rate: null,
      retry_rate_status: "NOT_MEASURED",
      dead_letter_rate: null,
      dead_letter_rate_status: "NOT_MEASURED",
      cost_usd: null,
      cost_status: "NOT_REGISTERED",
      resource_sizing_without_measurement: false
    },
    required_runtime_components: runtime.runtime_components.map(component => component.component),
    required_metrics: contract.digitalocean_handoff.required_workload_metrics,
    next_gate: "VERIFY_READ_ONLY_BINDING_THEN_RUN_DEV_STAGING_CAPACITY_BASELINE",
    production_mutations_authorized: false,
    production: "HOLD"
  };

  const structuralGaps = [];
  if (mandatoryLanes.length !== contract.lane_model.mandatory_scope_source_role_lanes) {
    structuralGaps.push("MANDATORY_LANE_COUNT_MISMATCH");
  }
  if (supplementalLanes.length !== contract.lane_model.supplemental_scope_source_role_lanes) {
    structuralGaps.push("SUPPLEMENTAL_LANE_COUNT_MISMATCH");
  }
  if (uncoveredDecisionRecords.length) structuralGaps.push("DECISION_DNA_NOT_REPRESENTED_IN_SOURCE_ROLE_LANES");
  if (mandatoryLanes.some(lane => lane.decision_scope_count === 0)) structuralGaps.push("MANDATORY_LANE_WITHOUT_DECISION_DEMAND");
  if (mandatoryLanes.some(lane => lane.role_specific_data_field_count === 0)) structuralGaps.push("MANDATORY_LANE_WITHOUT_ROLE_SPECIFIC_DATA_FIELDS");

  const operationalGaps = [
    "ASI_BATCH_1_DISCOVERY_NOT_EXECUTED",
    "SOURCE_ENDPOINT_DEDUPLICATION_NOT_EXECUTED",
    "DEEP_SOURCE_ASSESSMENT_NOT_EXECUTED",
    "RIGHTS_ACCESS_COST_PREFLIGHT_NOT_EXECUTED",
    "BOUNDED_ADAPTER_CONTRACTS_NOT_BUILT",
    "SCOPE_SOURCE_POOLS_READY_0_OF_32",
    "REPRESENTATIVE_ACQUISITION_NOT_AUTHORIZED",
    "ACTUAL_DECISION_OUTCOMES_NOT_CALIBRATED"
  ];
  if (runtime.commercial_relationship.technical_resource_binding !== "VERIFIED") {
    operationalGaps.push("DIGITALOCEAN_TECHNICAL_BINDING_NOT_VERIFIED");
  }

  const gapRegister = {
    id: "kidults-dos-asi-gap-register-v1",
    record_type: "dos_asi_gap_register",
    version: "1.0.0",
    status: structuralGaps.length === 0
      ? "STRUCTURAL_BRIDGE_PASS_OPERATIONAL_EXECUTION_GAPS_ACTIVE"
      : "STRUCTURAL_BRIDGE_BLOCKED",
    generated_at: contract.effective_at,
    structural_gaps: structuralGaps,
    structural_gap_count: structuralGaps.length,
    operational_gaps: operationalGaps,
    operational_gap_count: operationalGaps.length,
    unknown_requirement_coerced_to_known: 0,
    unknown_risk_coerced_to_low: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const outputs = {
    "decision-source-requirement-ledger-v1.json": ledger,
    "dos-asi-priority-queue-v1.json": priorityQueue,
    "asi-batch-1-execution-plan-v1.json": batchPlan,
    "digitalocean-asi-workload-envelope-v1.json": workloadEnvelope,
    "dos-asi-gap-register-v1.json": gapRegister
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);

  const manifest = {
    id: "kidults-dos-asi-execution-v1-run-manifest",
    record_type: "dos_asi_execution_bridge_run",
    version: "1.0.0",
    status: structuralGaps.length === 0
      ? "DOS_TO_ASI_EXECUTION_BRIDGE_PASS"
      : "DOS_TO_ASI_EXECUTION_BRIDGE_BLOCKED",
    generated_at: contract.effective_at,
    inputs: {
      bridge_contract: { id: contract.id, fingerprint: fingerprint(contract) },
      dos_run: { id: dos["run-manifest.json"].id, fingerprint: dos["run-manifest.json"].run_fingerprint },
      source_pool_run: { id: sourcePool["run-manifest.json"].id, fingerprint: sourcePool["run-manifest.json"].run_fingerprint },
      digitalocean_runtime: { id: runtime.id, fingerprint: fingerprint(runtime) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    decision_dna_count: decisionLibrary.decision_scope_count,
    represented_decision_dna_count: representedDecisionIds.size,
    collection_scope_count: coverageMatrix.collection_scope_count,
    mandatory_lane_count: mandatoryLanes.length,
    supplemental_lane_count: supplementalLanes.length,
    batch_1_targets: {
      unique_source_endpoints: batchPlan.targets.unique_source_endpoint_discovery_target,
      deep_assessments: batchPlan.targets.deep_assessment_target,
      rights_access_cost_preflights: batchPlan.targets.rights_access_cost_preflight_target,
      bounded_adapter_contracts: batchPlan.targets.bounded_adapter_contract_target
    },
    digitalocean_commercial_state: workloadEnvelope.digitalocean_commercial_state,
    digitalocean_technical_binding: workloadEnvelope.digitalocean_technical_binding,
    structural_gap_count: structuralGaps.length,
    operational_gap_count: operationalGaps.length,
    discovery_executed: false,
    acquisition_authorized: false,
    market_claims_created: 0,
    candidate_r2_created: false,
    indexes_computed: 0,
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
  const outputs = buildDosAsiExecutionV1();
  if (config.write) writeOutputs(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS DOS-to-ASI Execution Bridge v1: PASS");
  console.log(`Decision DNA represented: ${manifest.represented_decision_dna_count} / ${manifest.decision_dna_count}`);
  console.log(`Collection Scopes: ${manifest.collection_scope_count}`);
  console.log(`Mandatory / supplemental lanes: ${manifest.mandatory_lane_count} / ${manifest.supplemental_lane_count}`);
  console.log(`Batch 1: ${manifest.batch_1_targets.unique_source_endpoints} discoveries / ${manifest.batch_1_targets.deep_assessments} deep / ${manifest.batch_1_targets.rights_access_cost_preflights} preflights / ${manifest.batch_1_targets.bounded_adapter_contracts} adapters`);
  console.log(`DigitalOcean: ${manifest.digitalocean_commercial_state} / ${manifest.digitalocean_technical_binding}`);
  console.log("Discovery: NOT_EXECUTED; Acquisition: BLOCKED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
