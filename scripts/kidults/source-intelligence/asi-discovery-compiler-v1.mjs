import { fingerprint, hashId, normalizeUrl, unique } from "./asi-discovery-common-v1.mjs";

function contexts(bridge, dos) {
  const priority = bridge["dos-asi-priority-queue-v1.json"];
  const ledger = bridge["decision-source-requirement-ledger-v1.json"];
  return {
    priority,
    laneMap: new Map(ledger.records.map(record => [record.lane_id, record])),
    decisionMap: new Map(dos["decision-library-v1.json"].records.map(record => [record.decision_scope_id, record]))
  };
}

function rights(assertions) {
  const licenses = unique(assertions.map(value => value.metadata?.license_spdx_id));
  const datacite = assertions.flatMap(value => value.metadata?.rights_list ?? []);
  if (datacite.length) return {
    rights_state: "EXPLICIT_DATACITE_RIGHTS_METADATA_REVIEW_REQUIRED",
    commercial_use_state: "RIGHTS_METADATA_PRESENT_COMMERCIAL_SCOPE_REVIEW_REQUIRED",
    evidence: datacite
  };
  if (licenses.length) return {
    rights_state: `EXPLICIT_REPOSITORY_LICENSE_METADATA:${licenses.join(",")}`,
    commercial_use_state: "REPOSITORY_LICENSE_EXPLICIT_UNDERLYING_DATA_RIGHTS_NOT_VERIFIED",
    evidence: licenses
  };
  return {
    rights_state: "UNKNOWN_TERMS_AND_FIELD_LEVEL_RIGHTS_NOT_ASSESSED",
    commercial_use_state: "UNKNOWN_NOT_INFERRED",
    evidence: []
  };
}

function merge(snapshot, ctx) {
  const map = new Map();
  const invalid = [];
  for (const raw of snapshot.records) {
    const url = normalizeUrl(raw.endpoint_url);
    if (!url) {
      invalid.push({ provider: raw.discovery_provider, provider_record_id: raw.provider_record_id, endpoint_url: raw.endpoint_url });
      continue;
    }
    const item = map.get(url) ?? { url, assertions: [], laneIds: new Set(), owners: new Set(), families: new Set(), types: new Set() };
    item.assertions.push(raw);
    for (const laneId of unique([...(raw.lane_ids ?? []), raw.lane_id])) item.laneIds.add(laneId);
    if (raw.owner) item.owners.add(raw.owner);
    if (raw.source_family_hint) item.families.add(raw.source_family_hint);
    if (raw.channel_type_hint) item.types.add(raw.channel_type_hint);
    map.set(url, item);
  }

  const records = [...map.values()].map(item => {
    const lanes = unique([...item.laneIds]).map(id => ctx.laneMap.get(id)).filter(Boolean);
    const decisionIds = unique(lanes.flatMap(lane => lane.decision_scope_ids));
    const decisions = decisionIds.map(id => ctx.decisionMap.get(id)).filter(Boolean);
    const owners = unique([...item.owners]);
    const sourceRoles = unique(lanes.map(lane => lane.source_role));
    const timestamps = item.assertions.flatMap(value => [value.metadata?.updated_at, value.metadata?.pushed_at]).filter(Boolean).sort().reverse();
    const rightsState = rights(item.assertions);
    const record = {
      source_id: hashId("src", `${owners[0] ?? "UNKNOWN"}:${item.url}`),
      endpoint_id: hashId("ep", item.url),
      endpoint_url: item.url,
      normalized_endpoint_url: item.url,
      owner: owners.length === 1 ? owners[0] : "MULTIPLE_OWNER_ASSERTIONS",
      owner_assertions: owners,
      jurisdiction_state: "UNKNOWN_NOT_ASSESSED",
      source_family: unique([...item.families]).join("|") || "UNKNOWN",
      channel_type: unique([...item.types])[0] ?? "UNKNOWN",
      candidate_collection_scopes: unique(lanes.map(lane => lane.scope_id)),
      candidate_source_roles: sourceRoles,
      customer_decisions_supported: unique(decisions.map(value => `${value.customer_segment}:${value.decision_name}`)),
      decision_scope_ids: decisionIds,
      value_scope_ids: unique(decisions.flatMap(value => value.irreplaceable_value_scope_ids)),
      intelligence_product_ids: unique(decisions.flatMap(value => value.intelligence_product_ids)),
      required_data_fields_supported: unique(lanes.flatMap(lane => lane.role_specific_data_fields)),
      discovery_provenance: item.assertions.map(value => ({
        discovery_provider: value.discovery_provider,
        observed_at: value.observed_at,
        query: value.query,
        lane_ids: unique([...(value.lane_ids ?? []), value.lane_id]),
        provider_record_id: value.provider_record_id,
        result_rank: value.result_rank
      })),
      authority_state: sourceRoles.includes("PRIMARY_AUTHORITY") ? "AUTHORITY_CANDIDATE_NOT_VERIFIED" : "NOT_ASSESSED",
      independence_state: "NOT_ASSESSED_OWNER_AND_LINEAGE_VALIDATION_REQUIRED",
      rights_state: rightsState.rights_state,
      commercial_use_state: rightsState.commercial_use_state,
      rights_evidence: rightsState.evidence,
      access_state: "PUBLIC_METADATA_OBSERVED_CONTENT_ACQUISITION_NOT_AUTHORIZED",
      schema_state: "STRUCTURED_DISCOVERY_METADATA_SOURCE_SCHEMA_NOT_VERIFIED",
      freshness_state: timestamps.length ? "METADATA_TIMESTAMP_AVAILABLE_SOURCE_FRESHNESS_NOT_VERIFIED" : "UNKNOWN_NOT_ASSESSED",
      latest_metadata_timestamp: timestamps[0] ?? null,
      bias_risk: unique(item.assertions.map(value => `${value.discovery_provider}_DISCOVERY_BIAS`).concat([
        "SEARCH_RANKING_BIAS", "QUERY_MATCH_PRELIMINARY_NOT_VALIDATED"
      ])),
      continuity_risk: item.assertions.some(value => value.metadata?.archived) ? "ELEVATED_ARCHIVED_SOURCE" : "UNKNOWN_NOT_ASSESSED",
      cost_state: "DISCOVERY_METADATA_NO_INCREMENTAL_FEE_OBSERVED_DOWNSTREAM_COST_UNKNOWN",
      assessment_depth: "BASIC_CLASSIFICATION",
      next_gate: "DEEP_SCOPE_UTILITY_RIGHTS_ACCESS_BIAS_AND_CONTINUITY_ASSESSMENT",
      scope_relevance_state: "QUERY_MATCH_PRELIMINARY",
      acquisition_authorized: false,
      provider_direct_to_portal: false,
      provider_direct_to_index: false,
      public_projection: false,
      production: "HOLD"
    };
    record.classification_completeness = Object.values(record).some(value => value === undefined) ? 0 : 1;
    return record;
  }).sort((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));
  return { records, invalid };
}

function score(record) {
  const explicitRights = !record.rights_state.startsWith("UNKNOWN");
  return Math.min(100,
    10 + Math.min(record.candidate_collection_scopes.length, 5) * 5 +
    Math.min(record.candidate_source_roles.length, 5) * 7 +
    Math.min(record.value_scope_ids.length, 7) * 4 +
    Math.min(record.intelligence_product_ids.length, 8) * 3 +
    Math.min(record.required_data_fields_supported.length, 20) +
    (explicitRights ? 8 : 0) + (record.latest_metadata_timestamp ? 3 : 0));
}

function attach(outputs) {
  for (const value of Object.values(outputs)) {
    if (!value.snapshot_fingerprint) value.fingerprint = fingerprint(value);
  }
}

export function compileDiscovery(snapshot, contract, bridge, dos) {
  const ctx = contexts(bridge, dos);
  const { records, invalid } = merge(snapshot, ctx);
  const scored = records.map(record => ({
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    provisional_utility_score: score(record),
    scoring_basis: "STRUCTURAL_DECISION_VALUE_AND_METADATA_COMPLETENESS_NOT_EMPIRICAL_MARKET_UTILITY",
    scope_count: record.candidate_collection_scopes.length,
    source_role_count: record.candidate_source_roles.length,
    value_scope_count: record.value_scope_ids.length,
    data_field_count: record.required_data_fields_supported.length,
    rights_state: record.rights_state,
    acquisition_authorized: false
  })).sort((a, b) => b.provisional_utility_score - a.provisional_utility_score || a.endpoint_id.localeCompare(b.endpoint_id));
  const byId = new Map(records.map(record => [record.endpoint_id, record]));
  const deep = scored.slice(0, contract.targets.deep_assessments_minimum).map((item, index) => {
    const source = byId.get(item.endpoint_id);
    return {
      assessment_id: `deep-${String(index + 1).padStart(4, "0")}`,
      endpoint_id: item.endpoint_id,
      source_id: item.source_id,
      endpoint_url: item.endpoint_url,
      utility_score_provisional: item.provisional_utility_score,
      value_scope_ids: source.value_scope_ids,
      source_roles: source.candidate_source_roles,
      rights_state: source.rights_state,
      authority_state: source.authority_state,
      independence_state: source.independence_state,
      bias_risk: source.bias_risk,
      continuity_risk: source.continuity_risk,
      source_removal_sensitivity: "NOT_EXECUTED",
      state: "AUTOMATED_PRELIMINARY_DEEP_REVIEW_OFFICIAL_TERMS_AND_HUMAN_REVIEW_REQUIRED",
      acquisition_authorized: false,
      production: "HOLD"
    };
  });
  const preflight = [...deep].sort((a, b) => Number(a.rights_state.startsWith("UNKNOWN")) - Number(b.rights_state.startsWith("UNKNOWN")) ||
    b.utility_score_provisional - a.utility_score_provisional)
    .slice(0, contract.targets.rights_access_cost_preflights_minimum)
    .map((item, index) => ({
      preflight_id: `preflight-${String(index + 1).padStart(3, "0")}`,
      endpoint_id: item.endpoint_id,
      source_id: item.source_id,
      endpoint_url: item.endpoint_url,
      terms_state: "NOT_REVIEWED_IN_METADATA_DISCOVERY",
      commercial_use_state: byId.get(item.endpoint_id).commercial_use_state,
      robots_access_state: "NOT_REVIEWED",
      field_level_rights_state: item.rights_state,
      rate_limit_state: "TARGET_SOURCE_RATE_LIMIT_UNKNOWN",
      cost_state: "DOWNSTREAM_COST_UNKNOWN",
      preflight_state: "RECORDED_NOT_PASSED",
      acquisition_authorized: false,
      production: "HOLD"
    }));

  const categories = unique(ctx.priority.items.map(item => item.parent_core_domain));
  const preflightIds = new Set(preflight.map(item => item.endpoint_id));
  const adapterCandidates = categories.map(category => {
    const scopeIds = new Set(ctx.priority.items.filter(item => item.parent_core_domain === category).map(item => item.scope_id));
    const candidate = scored
      .filter(item => byId.get(item.endpoint_id).candidate_collection_scopes.some(scope => scopeIds.has(scope)))
      .sort((left, right) => Number(preflightIds.has(right.endpoint_id)) - Number(preflightIds.has(left.endpoint_id)) ||
        right.provisional_utility_score - left.provisional_utility_score || left.endpoint_id.localeCompare(right.endpoint_id))[0];
    return candidate ? {
      adapter_contract_candidate_id: `adapter-candidate-${category}`,
      core_domain_id: category,
      endpoint_id: candidate.endpoint_id,
      source_id: candidate.source_id,
      endpoint_url: candidate.endpoint_url,
      contract_state: preflightIds.has(candidate.endpoint_id)
        ? "BOUNDED_ADAPTER_CONTRACT_CANDIDATE_PREFLIGHT_NOT_PASSED"
        : "BLOCKED_NO_PREFLIGHT_RECORD",
      request_budget: 0,
      schema_contract: "NOT_VERIFIED",
      field_allowlist: [],
      raw_quarantine_first: true,
      fail_closed: true,
      acquisition_authorized: false,
      provider_direct_to_portal: false,
      provider_direct_to_index: false,
      public_projection: false,
      production: "HOLD"
    } : null;
  }).filter(Boolean);

  const lanes = ctx.priority.items.map(lane => {
    const endpointIds = unique(records.filter(record => record.discovery_provenance.some(value => value.lane_ids.includes(lane.queue_id)))
      .map(record => record.endpoint_id));
    return {
      lane_id: lane.queue_id,
      scope_id: lane.scope_id,
      scope_name: lane.scope_name,
      parent_core_domain: lane.parent_core_domain,
      source_role: lane.source_role,
      target_unique_source_endpoints: lane.batch_1_targets.unique_source_endpoints,
      discovered_unique_endpoint_count: endpointIds.length,
      endpoint_ids: endpointIds,
      coverage_state: endpointIds.length ? "CANDIDATE_COVERAGE_PRESENT_NOT_VALIDATED" : "GAP_NO_CANDIDATE_DISCOVERED"
    };
  });

  const universe = {
    id: "kidults-global-source-universe-batch-001",
    record_type: "global_source_universe_batch",
    version: "1.0.0",
    status: records.length >= contract.targets.unique_source_endpoints_minimum
      ? "DISCOVERY_TARGET_REACHED_CLASSIFICATION_PRELIMINARY" : "DISCOVERY_PARTIAL_TARGET_NOT_REACHED",
    observed_at: snapshot.observed_at,
    raw_record_count: snapshot.raw_record_count,
    unique_endpoint_count: records.length,
    basic_classification_coverage: records.length ? records.filter(record => record.classification_completeness === 1).length / records.length : 0,
    records,
    content_acquired: false,
    acquisition_authorized: false,
    public_projection: false,
    production: "HOLD"
  };
  const dedup = {
    id: "kidults-endpoint-deduplication-report-batch-001",
    record_type: "endpoint_deduplication_report",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    raw_record_count: snapshot.raw_record_count,
    invalid_endpoint_count: invalid.length,
    invalid_endpoints: invalid,
    unique_normalized_endpoint_count: records.length,
    merged_duplicate_assertion_count: Math.max(0, snapshot.raw_record_count - invalid.length - records.length),
    final_duplicate_endpoint_id_count: records.length - new Set(records.map(record => record.endpoint_id)).size,
    final_duplicate_normalized_url_count: records.length - new Set(records.map(record => record.normalized_endpoint_url)).size,
    owner_and_lineage_independence_not_inferred: true,
    production: "HOLD"
  };
  const classification = {
    id: "kidults-source-classification-report-batch-001",
    record_type: "source_classification_report",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    required_fields: contract.classification_required_fields,
    record_count: records.length,
    complete_record_count: records.filter(record => record.classification_completeness === 1).length,
    classification_coverage: universe.basic_classification_coverage,
    unknown_risk_coerced_to_low: 0,
    records,
    production: "HOLD"
  };
  const coverage = {
    id: "kidults-scope-role-coverage-matrix-batch-001",
    record_type: "scope_role_coverage_matrix",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    mandatory_lane_count: lanes.length,
    lanes_with_candidate_coverage: lanes.filter(item => item.discovered_unique_endpoint_count > 0).length,
    lanes_without_candidate_coverage: lanes.filter(item => item.discovered_unique_endpoint_count === 0).length,
    records: lanes,
    scope_relevance_validated: false,
    source_pools_ready: 0,
    production: "HOLD"
  };
  const utility = {
    id: "kidults-source-utility-scorecard-batch-001",
    record_type: "source_utility_scorecard",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    empirical_market_utility_calibrated: false,
    records: scored,
    deep_assessments: deep,
    production: "HOLD"
  };
  const risk = {
    id: "kidults-source-risk-register-batch-001",
    record_type: "source_risk_register",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    unknown_risk_coerced_to_low: 0,
    records: records.map(record => ({
      endpoint_id: record.endpoint_id,
      rights_state: record.rights_state,
      commercial_use_state: record.commercial_use_state,
      bias_risk: record.bias_risk,
      continuity_risk: record.continuity_risk,
      risk_classification: record.continuity_risk.startsWith("ELEVATED") ? "ELEVATED" : "UNKNOWN_NOT_ASSESSED"
    })),
    production: "HOLD"
  };
  const preflightOutput = {
    id: "kidults-rights-access-cost-preflight-batch-001",
    record_type: "rights_access_cost_preflight",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    preflight_record_count: preflight.length,
    preflight_pass_count: 0,
    records: preflight,
    acquisition_authorized: false,
    production: "HOLD"
  };
  const adapterQueue = {
    id: "kidults-adapter-contract-queue-batch-001",
    record_type: "bounded_adapter_contract_queue",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    candidate_count: adapterCandidates.length,
    implemented_adapter_count: 0,
    records: adapterCandidates,
    acquisition_authorized: false,
    production: "HOLD"
  };
  const priority = {
    id: "kidults-acquisition-priority-plan-batch-001",
    record_type: "acquisition_priority_plan",
    version: "1.0.0",
    observed_at: snapshot.observed_at,
    state: "DISCOVERY_RESULTS_AVAILABLE_ACQUISITION_BLOCKED",
    lane_priorities: [...lanes].sort((a, b) => a.discovered_unique_endpoint_count - b.discovered_unique_endpoint_count || a.lane_id.localeCompare(b.lane_id)),
    acquisition_authorized: false,
    market_claim_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "raw-discovery-snapshot.json": snapshot,
    "global-source-universe-batch-001.json": universe,
    "endpoint-deduplication-report.json": dedup,
    "source-classification-report.json": classification,
    "scope-role-coverage-matrix.json": coverage,
    "source-utility-scorecard.json": utility,
    "source-risk-register.json": risk,
    "rights-access-cost-preflight.json": preflightOutput,
    "adapter-contract-queue.json": adapterQueue,
    "acquisition-priority-plan.json": priority
  };
  attach(outputs);

  const passed = records.length >= contract.targets.unique_source_endpoints_minimum &&
    universe.basic_classification_coverage === 1 &&
    coverage.lanes_with_candidate_coverage === contract.targets.mandatory_scope_source_role_lanes &&
    deep.length >= contract.targets.deep_assessments_minimum &&
    preflight.length >= contract.targets.rights_access_cost_preflights_minimum &&
    adapterCandidates.length >= contract.targets.bounded_adapter_contract_candidates_minimum &&
    dedup.final_duplicate_normalized_url_count === 0;
  const manifest = {
    id: "kidults-asi-discovery-batch-001-run-manifest",
    record_type: "asi_live_discovery_run",
    version: "1.0.0",
    status: passed ? "ASI_DISCOVERY_BATCH_001_TARGET_PASS" : "ASI_DISCOVERY_BATCH_001_PARTIAL",
    observed_at: snapshot.observed_at,
    inputs: {
      raw_snapshot: snapshot.snapshot_fingerprint,
      dos_asi_bridge: bridge["run-manifest.json"].run_fingerprint,
      dos: dos["run-manifest.json"].run_fingerprint
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.snapshot_fingerprint ?? value.fingerprint])),
    raw_records: snapshot.raw_record_count,
    unique_source_endpoints: records.length,
    basic_classification_coverage: universe.basic_classification_coverage,
    mandatory_lanes_with_candidate_coverage: coverage.lanes_with_candidate_coverage,
    mandatory_lane_count: coverage.mandatory_lane_count,
    deep_assessments: deep.length,
    preflight_records: preflight.length,
    preflight_passes: 0,
    adapter_contract_candidates: adapterCandidates.length,
    implemented_adapters: 0,
    provider_errors: snapshot.request_or_provider_errors.length,
    discovery_executed: true,
    content_acquired: false,
    acquisition_authorized: false,
    market_claims_created: 0,
    candidate_r2_created: false,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["batch-run-manifest.json"] = manifest;
  return outputs;
}
