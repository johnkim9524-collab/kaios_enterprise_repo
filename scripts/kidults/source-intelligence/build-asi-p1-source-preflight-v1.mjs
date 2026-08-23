#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  candidateRegistryPath = '/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1/p0b-source-candidate-registry-v1.json',
  bindingLedgerPath = '/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1/p0b-mission-candidate-binding-ledger-v1.json',
  gapRegisterPath = '/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1/p0b-candidate-gap-register-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-p1-source-classification-admission-preflight-contract-v1.json',
  runtimeRegistryPath = 'services/kidults-autonomous-intelligence/src/asi/registry.ts',
  outputDir = '/tmp/kidults-asi-p1-source-preflight-v1'
] = process.argv.slice(2);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256Ref = (value) => `sha256:${sha256Hex(value)}`;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const canonicalJson = (value) => JSON.stringify(stableValue(value));
const deterministicId = (prefix, value) => `${prefix}_${sha256Hex(canonicalJson(value)).slice(0, 32)}`;
const writeJson = async (name, value) => {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256Ref(content), bytes: Buffer.byteLength(content) };
};
const unique = (values) => new Set(values).size === values.length;

const candidates = await readJson(candidateRegistryPath);
const bindings = await readJson(bindingLedgerPath);
const gaps = await readJson(gapRegisterPath);
const contract = await readJson(contractPath);
const runtimeRegistrySource = await fs.readFile(runtimeRegistryPath, 'utf8');
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const eventClock = '2026-08-23T06:30:00.000Z';

if (candidates.id !== contract.input_requirements.candidate_registry_id || Number(candidates.canonical_candidate_count) < contract.input_requirements.minimum_observed_candidates) {
  throw new Error('P1_CANDIDATE_REGISTRY_INVALID');
}
if (bindings.id !== contract.input_requirements.binding_ledger_id || Number(bindings.missions_with_at_least_one_candidate) < contract.input_requirements.minimum_bound_missions) {
  throw new Error('P1_BINDING_LEDGER_INVALID');
}
if (gaps.id !== contract.input_requirements.candidate_gap_register_id) throw new Error('P1_GAP_REGISTER_INVALID');
if (contract.id !== 'kidults-asi-p1-source-classification-admission-preflight-contract-v1' || contract.version !== '1.0.0') throw new Error('P1_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('P1_PRINCIPLE_ORDER_INVALID');
if (contract.classification_fleets?.length !== 4 || contract.qualification_fleets?.length !== 7) throw new Error('P1_FLEET_COUNT_INVALID');
if (contract.truth_boundary?.performs_target_site_rights_or_access_probe !== false || contract.truth_boundary?.creates_collection_right !== false || contract.truth_boundary?.admits_evidence !== false) {
  throw new Error('P1_TRUTH_BOUNDARY_INVALID');
}

const fleetMatches = [...runtimeRegistrySource.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*stage:\s*'([^']+)'\s*,\s*binding:\s*'([^']+)'\s*,\s*queue:\s*'([^']+)'\s*\}/g)]
  .map((match) => ({ id: match[1], stage: match[2], binding: match[3], queue: match[4] }));
const logicalEngineMapSource = runtimeRegistrySource.match(/export const ASI_FLEET_LOGICAL_ENGINE[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
if (!logicalEngineMapSource) throw new Error('P1_RUNTIME_LOGICAL_ENGINE_MAP_MISSING');
const logicalEngineByFleet = new Map(
  [...logicalEngineMapSource.matchAll(/^\s*([A-Z0-9_]+):\s*'([^']+)'\s*,?$/gm)]
    .map((match) => [match[1], match[2]])
);
const fleetById = new Map(fleetMatches.map((fleet) => [
  fleet.id,
  { ...fleet, logical_engine: logicalEngineByFleet.get(fleet.id) }
]));
if (fleetMatches.length === 0 || logicalEngineByFleet.size === 0) throw new Error('P1_RUNTIME_FLEET_REGISTRY_PARSE_FAILED');
for (const fleet of fleetById.values()) {
  if (!fleet.logical_engine) throw new Error(`P1_RUNTIME_LOGICAL_ENGINE_MISSING:${fleet.id}`);
}
for (const fleetId of contract.classification_fleets) {
  const fleet = fleetById.get(fleetId);
  if (!fleet || fleet.stage !== 'CLASSIFICATION' || fleet.logical_engine !== 'SOURCE_CLASSIFICATION_ENGINE') throw new Error(`P1_CLASSIFICATION_FLEET_INVALID:${fleetId}`);
}
const qualificationLogicalEngines = {
  SOURCE_UTILITY_VALUE_ANALYSIS: 'UTILITY_AND_VALUE_SCORING_ENGINE',
  SOURCE_RIGHTS_COMPLIANCE_ANALYSIS: 'RIGHTS_AND_COMPLIANCE_RISK_ENGINE',
  SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS: 'TECHNICAL_ACCESS_AND_SCHEMA_RISK_ENGINE',
  SOURCE_COVERAGE_BIAS_ANALYSIS: 'COVERAGE_AND_BIAS_ENGINE',
  SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS: 'INDEPENDENCE_AND_REDUNDANCY_ENGINE',
  SOURCE_FRESHNESS_STABILITY_ANALYSIS: 'FRESHNESS_AND_STABILITY_ENGINE',
  SOURCE_COST_ROI_ANALYSIS: 'COST_AND_ROI_ENGINE'
};
for (const fleetId of contract.qualification_fleets) {
  const fleet = fleetById.get(fleetId);
  if (!fleet || fleet.stage !== 'QUALIFICATION' || fleet.logical_engine !== qualificationLogicalEngines[fleetId]) throw new Error(`P1_QUALIFICATION_FLEET_INVALID:${fleetId}`);
}

await fs.mkdir(outputDir, { recursive: true });
const candidateContent = await fs.readFile(candidateRegistryPath, 'utf8');
const bindingContent = await fs.readFile(bindingLedgerPath, 'utf8');
const gapContent = await fs.readFile(gapRegisterPath, 'utf8');
const inputSnapshotRef = sha256Ref(canonicalJson({
  candidate_registry_digest: sha256Ref(candidateContent),
  binding_ledger_digest: sha256Ref(bindingContent),
  gap_register_digest: sha256Ref(gapContent),
  contract_version: contract.version
}));

const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.candidate_id, candidate]));
const grains = [];
const grainKeys = new Set();
for (const binding of bindings.bindings) {
  for (const slot of binding.slot_bindings) {
    if (!slot.candidate_id) continue;
    const candidate = candidateById.get(slot.candidate_id);
    if (!candidate) throw new Error(`P1_BINDING_CANDIDATE_MISSING:${slot.candidate_id}`);
    const grainKey = [candidate.candidate_id, binding.mission_id, binding.scope_id, binding.region, binding.evidence_class].join('::');
    if (grainKeys.has(grainKey)) continue;
    grainKeys.add(grainKey);
    grains.push({
      grain_id: deterministicId('grain', { candidate_id: candidate.candidate_id, mission_id: binding.mission_id }),
      candidate_id: candidate.candidate_id,
      mission_id: binding.mission_id,
      market_cell_id: binding.market_cell_id,
      lane_slot: slot.lane_slot,
      canonical_endpoint: candidate.canonical_endpoint,
      canonical_host: candidate.canonical_host,
      canonical_host_hash: candidate.canonical_host_hash,
      discovery_providers: candidate.discovery_providers,
      discovery_channels: candidate.discovery_channels,
      observed_at_values: candidate.observed_at_values,
      scope_id: binding.scope_id,
      scope_name: binding.scope_name,
      domain: binding.domain,
      archetype: binding.archetype,
      region: binding.region,
      evidence_class: binding.evidence_class,
      claim_ceiling: binding.claim_ceiling,
      region_match_state: slot.region_match_state,
      preliminary_source_state: candidate.state,
      target_collection_rights_state: 'UNKNOWN',
      evidence_state: 'DISCOVERY_METADATA_ONLY',
      admission_state: 'NOT_ADMITTED',
      public_release: 'HOLD',
      production: 'HOLD'
    });
  }
}
grains.sort((a, b) => a.grain_id.localeCompare(b.grain_id));
if (grains.length === 0) throw new Error('P1_NO_CANDIDATE_MISSION_GRAINS');
if (!unique(grains.map((grain) => grain.grain_id))) throw new Error('P1_GRAIN_ID_COLLISION');

const classificationAssertionPlan = {
  SOURCE_SITE_IDENTITY_OWNER_LINEAGE: [
    { assertion_type: 'CANONICAL_HOST', decision: 'PASS', state: 'CANONICALIZED_ENDPOINT_OBSERVED', rights_state: 'NOT_APPLICABLE', reason_codes: ['CANONICAL_HTTP_ENDPOINT_VALID', 'CANONICAL_HOST_HASH_PRESENT'] },
    { assertion_type: 'OWNER_LINEAGE', decision: 'HOLD', state: 'UNKNOWN_REQUIRES_AUTHORITATIVE_CLASSIFICATION', rights_state: 'UNKNOWN', reason_codes: ['OWNER_NOT_ESTABLISHED_FROM_DISCOVERY_METADATA', 'FACTUAL_ORIGIN_NOT_ESTABLISHED'] },
    { assertion_type: 'PROVENANCE', decision: 'HOLD', state: 'DISCOVERY_LINEAGE_ONLY_NOT_FACTUAL_ORIGIN', rights_state: 'UNKNOWN', reason_codes: ['DISCOVERY_PROVIDER_IS_NOT_FACTUAL_ORIGIN', 'TARGET_SOURCE_PROVENANCE_NOT_VERIFIED'] }
  ],
  SOURCE_SCOPE_ROLE_CLASSIFICATION: [
    { assertion_type: 'RELEVANCE', decision: 'HOLD', state: 'SCOPE_HINT_ONLY', rights_state: 'NOT_APPLICABLE', reason_codes: ['SCOPE_HINT_NOT_RELEVANCE_PASS'] },
    { assertion_type: 'SCOPE_ROLE', decision: 'HOLD', state: 'CANDIDATE_ROLE_HINT_ONLY', rights_state: 'NOT_APPLICABLE', reason_codes: ['SOURCE_ROLE_NOT_VERIFIED'] }
  ],
  SOURCE_REGION_LANGUAGE_CLASSIFICATION: [
    { assertion_type: 'REGION_LANGUAGE', decision: 'HOLD', state: 'REGION_HINT_NOT_COVERAGE', rights_state: 'NOT_APPLICABLE', reason_codes: ['REGION_HINT_NOT_REGIONAL_COVERAGE', 'LOCAL_LANGUAGE_RELEVANCE_NOT_VERIFIED'] }
  ],
  SOURCE_MARKET_SEMANTICS_CLASSIFICATION: [
    { assertion_type: 'MARKET_SEMANTICS', decision: 'HOLD', state: 'NOT_VERIFIED', rights_state: 'NOT_APPLICABLE', reason_codes: ['LISTING_NOT_SOLD', 'ATTENTION_NOT_DEMAND', 'MARKET_EVENT_SEMANTICS_NOT_VERIFIED'] }
  ]
};
const qualificationAssertionPlan = {
  SOURCE_UTILITY_VALUE_ANALYSIS: [
    { assertion_type: 'UTILITY_VALUE', decision: 'HOLD', state: 'ADVISORY_FROM_MISSION_PRIORITY_ONLY', rights_state: 'NOT_APPLICABLE', reason_codes: ['EXPECTED_GAIN_NOT_REALIZED_GAIN', 'PRIORITY_NOT_PERMISSION'] }
  ],
  SOURCE_RIGHTS_COMPLIANCE_ANALYSIS: [
    { assertion_type: 'COLLECT', decision: 'HOLD', state: 'RIGHTS_UNKNOWN', rights_state: 'UNKNOWN', reason_codes: ['TARGET_COLLECTION_RIGHTS_NOT_ASSESSED'] },
    { assertion_type: 'STORE', decision: 'HOLD', state: 'RIGHTS_UNKNOWN', rights_state: 'UNKNOWN', reason_codes: ['TARGET_STORAGE_RIGHTS_NOT_ASSESSED'] },
    { assertion_type: 'TRANSFORM', decision: 'HOLD', state: 'RIGHTS_UNKNOWN', rights_state: 'UNKNOWN', reason_codes: ['TARGET_TRANSFORM_RIGHTS_NOT_ASSESSED'] },
    { assertion_type: 'RETENTION', decision: 'HOLD', state: 'RIGHTS_UNKNOWN', rights_state: 'UNKNOWN', reason_codes: ['TARGET_RETENTION_RIGHTS_NOT_ASSESSED'] },
    { assertion_type: 'ROBOTS', decision: 'HOLD', state: 'NOT_PROBED', rights_state: 'UNKNOWN', reason_codes: ['TARGET_ROBOTS_NOT_PROBED'] }
  ],
  SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS: [
    { assertion_type: 'RATE_LIMIT', decision: 'HOLD', state: 'NOT_PROBED', rights_state: 'NOT_APPLICABLE', reason_codes: ['TARGET_RATE_LIMIT_NOT_PROBED'] },
    { assertion_type: 'SCHEMA', decision: 'HOLD', state: 'NOT_PROBED', rights_state: 'NOT_APPLICABLE', reason_codes: ['TARGET_SCHEMA_AND_IDENTIFIER_SURFACE_NOT_PROBED'] }
  ],
  SOURCE_COVERAGE_BIAS_ANALYSIS: [
    { assertion_type: 'COVERAGE_BIAS', decision: 'HOLD', state: 'NOT_MEASURED', rights_state: 'NOT_APPLICABLE', reason_codes: ['REGIONAL_COVERAGE_NOT_PROVEN', 'SAMPLING_BIAS_NOT_MEASURED'] }
  ],
  SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS: [
    { assertion_type: 'INDEPENDENCE_REDUNDANCY', decision: 'HOLD', state: 'FACTUAL_ORIGIN_UNKNOWN', rights_state: 'NOT_APPLICABLE', reason_codes: ['DISTINCT_HOST_NOT_DISTINCT_FACTUAL_ORIGIN', 'SOURCE_REMOVAL_CLUSTER_NOT_BUILT'] }
  ],
  SOURCE_FRESHNESS_STABILITY_ANALYSIS: [
    { assertion_type: 'FRESHNESS', decision: 'HOLD', state: 'DISCOVERY_OBSERVATION_CURRENT_TARGET_DATA_UNKNOWN', rights_state: 'NOT_APPLICABLE', reason_codes: ['DISCOVERY_TIME_NOT_TARGET_DATA_FRESHNESS'] }
  ],
  SOURCE_COST_ROI_ANALYSIS: [
    { assertion_type: 'COST_ROI', decision: 'HOLD', state: 'ADVISORY_ONLY', rights_state: 'NOT_APPLICABLE', reason_codes: ['ACTUAL_ACCESS_COST_NOT_OBSERVED', 'ROI_CANNOT_CREATE_PERMISSION'] }
  ]
};

const classificationRecords = [];
const qualificationRecords = [];
const tasks = [];
const taskIds = new Set();
const eventIds = new Set();

const sourceRoleFor = (evidenceClass) => ['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'].includes(evidenceClass) ? 'SOLD_TRANSACTION' : 'INDEPENDENT_VERIFICATION';
const buildEvent = (grain, fleetId, stage, assertions) => {
  const fleet = fleetById.get(fleetId);
  const identity = { grain_id: grain.grain_id, fleet_id: fleetId, stage, input_snapshot_ref: inputSnapshotRef };
  const taskId = deterministicId('task', identity);
  const eventId = deterministicId('evt', identity);
  if (taskIds.has(taskId) || eventIds.has(eventId)) throw new Error(`P1_TASK_OR_EVENT_COLLISION:${grain.grain_id}:${fleetId}`);
  taskIds.add(taskId);
  eventIds.add(eventId);
  const payload = {
    source_id: grain.candidate_id,
    candidate_id: grain.candidate_id,
    grain_id: grain.grain_id,
    mission_id: grain.mission_id,
    market_cell_id: grain.market_cell_id,
    purpose: 'SOURCE_CLASSIFICATION_AND_ADMISSION_PREFLIGHT',
    canonical_site_id: `site_${grain.canonical_host_hash.replace(/^sha256:/, '').slice(0, 32)}`,
    canonical_endpoint: grain.canonical_endpoint,
    canonical_host: grain.canonical_host,
    discovery_providers: grain.discovery_providers,
    discovery_channels: grain.discovery_channels,
    scope_id: grain.scope_id,
    scope_name: grain.scope_name,
    domain: grain.domain,
    archetype: grain.archetype,
    region: grain.region,
    evidence_class: grain.evidence_class,
    lane_slot: grain.lane_slot,
    claim_ceiling: grain.claim_ceiling,
    region_match_state: grain.region_match_state,
    preliminary_assertion_types: assertions.map((assertion) => assertion.assertion_type),
    preliminary_decision: 'HOLD',
    provider_direct_to_truth: false,
    provider_direct_to_index: false,
    provider_direct_to_projection: false,
    external_raw_data_is_owned_moat: false,
    acquisition_planning_authorized: false,
    collection_execution_authorized: false,
    evidence_admission_authorized: false,
    public_projection_authorized: false,
    production_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
  const event = {
    event_id: eventId,
    event_type: stage === 'CLASSIFICATION' ? 'SOURCE_IDENTIFIED' : 'SOURCE_CLASSIFICATION_ASSERTED',
    event_version: '1.0.0',
    occurred_at: eventClock,
    observed_at: eventClock,
    producer_engine: 'P1_SOURCE_PREFLIGHT_ORCHESTRATOR',
    producer_version: 'kidults-asi-p1-source-preflight-v1@1.0.0',
    correlation_id: deterministicId('corr', { grain_id: grain.grain_id }),
    causation_id: null,
    idempotency_key: `p1-source-preflight:v1:${taskId}`,
    partition: {
      channel: 'OPEN_MARKET',
      region: grain.region,
      language: 'MULTILINGUAL_LOCAL_REQUIRED',
      scope_id: grain.scope_id,
      source_role: sourceRoleFor(grain.evidence_class),
      canonical_host_hash: grain.canonical_host_hash
    },
    input_snapshot_ref: inputSnapshotRef,
    payload_hash: sha256Ref(canonicalJson(payload)),
    rights_state: 'UNKNOWN',
    freshness_state: 'CURRENT',
    assertion_purpose: 'SOURCE_CLASSIFICATION_AND_ADMISSION_PREFLIGHT',
    decision: 'HOLD',
    reason_codes: [
      'P1_PRELIMINARY_ASSERTION_TASK',
      `${stage}_FLEET_${fleetId}`,
      'METADATA_HINTS_CANNOT_PASS_GATE1',
      'UNKNOWN_REMAINS_HOLD',
      'NO_EVIDENCE_OR_CLAIM_PROMOTION'
    ],
    trace_refs: [
      `candidate:${grain.candidate_id}`,
      `mission:${grain.mission_id}`,
      `market-cell:${grain.market_cell_id}`,
      `grain:${grain.grain_id}`,
      `policy:${contract.id}@${contract.version}`
    ],
    payload
  };
  return {
    task_id: taskId,
    outbox_id: deterministicId('outbox', identity),
    state: 'READY_FOR_SHADOW_RUNTIME_ALIGNMENT_PREFLIGHT',
    stage,
    target_fleet: fleetId,
    logical_engine: fleet.logical_engine,
    queue_binding: fleet.binding,
    queue_name: fleet.queue,
    grain_id: grain.grain_id,
    candidate_id: grain.candidate_id,
    mission_id: grain.mission_id,
    assertion_types: assertions.map((assertion) => assertion.assertion_type),
    event,
    target_site_probe_executed: false,
    collection_authorized: false,
    evidence_admitted: false,
    market_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
};

for (const grain of grains) {
  for (const fleetId of contract.classification_fleets) {
    const assertions = classificationAssertionPlan[fleetId];
    classificationRecords.push(...assertions.map((assertion) => ({
      assertion_id: deterministicId('assertion', { grain_id: grain.grain_id, fleet_id: fleetId, assertion_type: assertion.assertion_type }),
      grain_id: grain.grain_id,
      candidate_id: grain.candidate_id,
      mission_id: grain.mission_id,
      market_cell_id: grain.market_cell_id,
      engine_fleet: fleetId,
      assertion_type: assertion.assertion_type,
      decision: assertion.decision,
      state: assertion.state,
      rights_state: assertion.rights_state,
      reason_codes: assertion.reason_codes,
      evidence_refs: [
        `candidate-registry:${candidates.source_fabric_digest}`,
        `candidate:${grain.candidate_id}`,
        `mission:${grain.mission_id}`
      ],
      observed_fact_ceiling: assertion.assertion_type === 'CANONICAL_HOST' ? 'CANONICAL_ENDPOINT_AND_HOST_ONLY' : 'NO_POSITIVE_CLASSIFICATION_FACT',
      public_release: 'HOLD',
      production: 'HOLD'
    })));
    tasks.push(buildEvent(grain, fleetId, 'CLASSIFICATION', assertions));
  }
  for (const fleetId of contract.qualification_fleets) {
    const assertions = qualificationAssertionPlan[fleetId];
    qualificationRecords.push(...assertions.map((assertion) => ({
      assertion_id: deterministicId('assertion', { grain_id: grain.grain_id, fleet_id: fleetId, assertion_type: assertion.assertion_type }),
      grain_id: grain.grain_id,
      candidate_id: grain.candidate_id,
      mission_id: grain.mission_id,
      market_cell_id: grain.market_cell_id,
      engine_fleet: fleetId,
      assertion_type: assertion.assertion_type,
      decision: assertion.decision,
      state: assertion.state,
      rights_state: assertion.rights_state,
      reason_codes: assertion.reason_codes,
      evidence_refs: [
        `candidate-registry:${candidates.source_fabric_digest}`,
        `candidate:${grain.candidate_id}`,
        `mission:${grain.mission_id}`
      ],
      advisory_only: ['UTILITY_VALUE', 'COST_ROI'].includes(assertion.assertion_type),
      target_site_probe_executed: false,
      public_release: 'HOLD',
      production: 'HOLD'
    })));
    tasks.push(buildEvent(grain, fleetId, 'QUALIFICATION', assertions));
  }
}

const expectedTaskCount = grains.length * 11;
if (tasks.length !== expectedTaskCount) throw new Error(`P1_TASK_COUNT_INVALID:${tasks.length}:${expectedTaskCount}`);
if (!unique(tasks.map((task) => task.task_id)) || !unique(tasks.map((task) => task.event.event_id))) throw new Error('P1_TASK_OR_EVENT_ID_DUPLICATE');

const gateDecisions = grains.map((grain) => ({
  gate1_decision_id: deterministicId('gate1', { grain_id: grain.grain_id, input_snapshot_ref: inputSnapshotRef }),
  grain_id: grain.grain_id,
  candidate_id: grain.candidate_id,
  mission_id: grain.mission_id,
  market_cell_id: grain.market_cell_id,
  decision: 'HOLD',
  rights_state: 'UNKNOWN',
  classification_state: 'PARTIAL_CANONICAL_HOST_ONLY',
  qualification_state: 'PREFLIGHT_REQUIRED',
  passed_requirements: ['CANONICAL_SOURCE_IDENTITY_PASS', 'NO_PROVIDER_DIRECT_PATH'],
  unresolved_requirements: contract.gate1_source_safety.pass_requires.filter((requirement) => !['CANONICAL_SOURCE_IDENTITY_PASS', 'NO_PROVIDER_DIRECT_PATH'].includes(requirement)),
  rejection_reasons: [],
  reason_codes: [
    'OWNER_AND_FACTUAL_ORIGIN_UNKNOWN',
    'PURPOSE_SPECIFIC_RIGHTS_UNKNOWN',
    'MARKET_SEMANTICS_UNVERIFIED',
    'TECHNICAL_ACCESS_AND_SCHEMA_UNPROBED',
    'REGIONAL_RELEVANCE_UNVERIFIED',
    'INDEPENDENCE_AND_SOURCE_REMOVAL_CLUSTER_UNBUILT'
  ],
  metadata_hint_alone_can_pass: false,
  target_site_probe_executed: false,
  collection_authorized: false,
  evidence_admitted: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}));

const evidenceAdmissionCandidates = gateDecisions.map((gate) => ({
  admission_candidate_id: deterministicId('admission_candidate', { gate1_decision_id: gate.gate1_decision_id }),
  grain_id: gate.grain_id,
  candidate_id: gate.candidate_id,
  mission_id: gate.mission_id,
  market_cell_id: gate.market_cell_id,
  state: 'NOT_READY_GATE1_HOLD',
  gate1_decision: gate.decision,
  rights_state: gate.rights_state,
  evidence_class: grains.find((grain) => grain.grain_id === gate.grain_id)?.evidence_class,
  output_class: 'INTERNAL_PREFLIGHT_ONLY',
  required_next_actions: contract.preflight_actions,
  admitted_evidence_id: null,
  evidence_admitted: false,
  collection_authorized: false,
  market_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
}));

const impactedByCandidate = new Map();
for (const grain of grains) {
  if (!impactedByCandidate.has(grain.candidate_id)) impactedByCandidate.set(grain.candidate_id, []);
  impactedByCandidate.get(grain.candidate_id).push(grain);
}
const preflightActions = [];
for (const [candidateId, candidateGrains] of [...impactedByCandidate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const candidate = candidateById.get(candidateId);
  for (const [actionIndex, actionType] of contract.preflight_actions.entries()) {
    preflightActions.push({
      action_id: deterministicId('preflight_action', { candidate_id: candidateId, action_type: actionType }),
      sequence: preflightActions.length + 1,
      candidate_id: candidateId,
      canonical_endpoint: candidate.canonical_endpoint,
      canonical_host: candidate.canonical_host,
      action_type: actionType,
      state: 'QUEUED_NOT_EXECUTED',
      priority: actionIndex <= 2 ? 'P0_SOURCE_SAFETY' : 'P1_ADMISSION_PREFLIGHT',
      impacted_grain_ids: candidateGrains.map((grain) => grain.grain_id).sort(),
      impacted_mission_ids: [...new Set(candidateGrains.map((grain) => grain.mission_id))].sort(),
      expected_output: actionType === 'SOURCE_OWNER_AND_FACTUAL_ORIGIN_CLASSIFICATION' ? 'OWNER_AND_FACTUAL_ORIGIN_ASSERTION'
        : actionType === 'PURPOSE_SPECIFIC_RIGHTS_AND_TERMS_PREFLIGHT' ? 'RIGHTS_BY_PURPOSE_ASSERTION'
          : actionType === 'ROBOTS_RATE_LIMIT_AND_ACCESS_PREFLIGHT' ? 'TECHNICAL_ACCESS_ASSERTION'
            : actionType === 'MARKET_SEMANTIC_AND_SOURCE_ROLE_VERIFICATION' ? 'MARKET_SEMANTIC_ASSERTION'
              : actionType === 'REGIONAL_RELEVANCE_AND_LANGUAGE_VERIFICATION' ? 'REGIONAL_RELEVANCE_ASSERTION'
                : actionType === 'SCHEMA_AND_IDENTIFIER_SURFACE_PREFLIGHT' ? 'SCHEMA_AND_IDENTITY_SURFACE_ASSERTION'
                  : 'FACTUAL_ORIGIN_CLUSTER_AND_SOURCE_REMOVAL_ASSERTION',
      network_probe_authorized: false,
      collection_authorized: false,
      evidence_admitted: false,
      public_release: 'HOLD',
      production: 'HOLD'
    });
  }
}

const classificationLedger = {
  id: 'kidults-asi-p1-source-classification-ledger-v1',
  version: '1.0.0',
  state: 'PRELIMINARY_CLASSIFICATION_CANONICAL_HOST_PASS_ALL_OTHER_CRITICAL_FIELDS_HOLD',
  input_snapshot_ref: inputSnapshotRef,
  grain_count: grains.length,
  assertion_count: classificationRecords.length,
  canonical_host_pass_count: classificationRecords.filter((record) => record.assertion_type === 'CANONICAL_HOST' && record.decision === 'PASS').length,
  owner_lineage_pass_count: 0,
  market_semantics_pass_count: 0,
  regional_coverage_pass_count: 0,
  records: classificationRecords,
  public_release: 'HOLD',
  production: 'HOLD'
};
const qualificationLedger = {
  id: 'kidults-asi-p1-source-qualification-ledger-v1',
  version: '1.0.0',
  state: 'PRELIMINARY_QUALIFICATION_ALL_CRITICAL_REQUIREMENTS_HOLD',
  input_snapshot_ref: inputSnapshotRef,
  grain_count: grains.length,
  assertion_count: qualificationRecords.length,
  rights_allow_count: 0,
  technical_access_pass_count: 0,
  independence_pass_count: 0,
  records: qualificationRecords,
  public_release: 'HOLD',
  production: 'HOLD'
};
const taskQueue = {
  id: 'kidults-asi-p1-source-preflight-task-queue-v1',
  version: '1.0.0',
  state: 'READY_FOR_SHADOW_RUNTIME_ALIGNMENT_PREFLIGHT',
  input_snapshot_ref: inputSnapshotRef,
  grain_count: grains.length,
  classification_fleet_count: contract.classification_fleets.length,
  qualification_fleet_count: contract.qualification_fleets.length,
  task_count: tasks.length,
  tasks,
  target_site_probes_executed: 0,
  collection_rights_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};
const gate1 = {
  id: 'kidults-asi-p1-gate1-source-safety-decisions-v1',
  version: '1.0.0',
  state: 'ALL_CURRENT_GRAINS_HOLD_PENDING_PREFLIGHT',
  decision_count: gateDecisions.length,
  pass_count: 0,
  hold_count: gateDecisions.length,
  reject_count: 0,
  metadata_hint_pass_count: 0,
  decisions: gateDecisions,
  public_release: 'HOLD',
  production: 'HOLD'
};
const admissionRegister = {
  id: 'kidults-asi-p1-evidence-admission-candidate-register-v1',
  version: '1.0.0',
  state: 'CANDIDATES_REGISTERED_NONE_READY_OR_ADMITTED',
  candidate_count: evidenceAdmissionCandidates.length,
  ready_count: 0,
  admitted_count: 0,
  candidates: evidenceAdmissionCandidates,
  public_release: 'HOLD',
  production: 'HOLD'
};
const actionQueue = {
  id: 'kidults-asi-p1-preflight-action-queue-v1',
  version: '1.0.0',
  state: 'QUEUED_NOT_EXECUTED',
  unique_candidate_count: impactedByCandidate.size,
  action_types: contract.preflight_actions,
  action_count: preflightActions.length,
  actions: preflightActions,
  target_site_network_probes_executed: 0,
  collection_rights_created: 0,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const outputFiles = [];
outputFiles.push(await writeJson('p1-source-classification-ledger-v1.json', classificationLedger));
outputFiles.push(await writeJson('p1-source-qualification-ledger-v1.json', qualificationLedger));
outputFiles.push(await writeJson('p1-source-preflight-task-queue-v1.json', taskQueue));
outputFiles.push(await writeJson('p1-gate1-source-safety-decisions-v1.json', gate1));
outputFiles.push(await writeJson('p1-evidence-admission-candidate-register-v1.json', admissionRegister));
outputFiles.push(await writeJson('p1-preflight-action-queue-v1.json', actionQueue));

const manifest = {
  id: 'kidults-asi-p1-source-preflight-manifest-v1',
  version: '1.0.0',
  state: 'P1_CLASSIFICATION_QUALIFICATION_AND_GATE1_PREFLIGHT_PREPARED',
  platform_principles: principles,
  input_bindings: {
    candidate_registry: { id: candidates.id, digest: sha256Ref(candidateContent), candidates: candidates.canonical_candidate_count },
    binding_ledger: { id: bindings.id, digest: sha256Ref(bindingContent), bound_missions: bindings.missions_with_at_least_one_candidate },
    gap_register: { id: gaps.id, digest: sha256Ref(gapContent), records: gaps.records.length },
    contract: { id: contract.id, version: contract.version, digest: sha256Ref(stableJson(contract)) },
    runtime_registry: { path: runtimeRegistryPath, digest: sha256Ref(runtimeRegistrySource) }
  },
  results: {
    candidate_mission_grains: grains.length,
    unique_candidates: impactedByCandidate.size,
    preliminary_classification_assertions: classificationRecords.length,
    preliminary_qualification_assertions: qualificationRecords.length,
    runtime_preflight_tasks: tasks.length,
    classification_tasks: tasks.filter((task) => task.stage === 'CLASSIFICATION').length,
    qualification_tasks: tasks.filter((task) => task.stage === 'QUALIFICATION').length,
    gate1_pass: 0,
    gate1_hold: gateDecisions.length,
    gate1_reject: 0,
    evidence_admission_candidates: evidenceAdmissionCandidates.length,
    evidence_admission_ready: 0,
    evidence_admitted: 0,
    preflight_actions_queued: preflightActions.length,
    target_site_network_probes_executed: 0,
    collection_rights_created: 0,
    market_claims_created: 0
  },
  output_files: outputFiles,
  autonomous_effect: 'POSITIVE_ALL_BOUND_CANDIDATES_COMPILED_TO_REGISTERED_CLASSIFICATION_AND_QUALIFICATION_FLEETS',
  global_effect: 'POSITIVE_REGION_LANGUAGE_AND_COVERAGE_REQUIREMENTS_REMAIN_EXPLICIT_PER_GRAIN',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_SOURCE_GRAINS_ASSERTIONS_GATE_DECISIONS_AND_ACTION_QUEUE',
  transparency_effect: 'POSITIVE_ALL_UNKNOWN_RIGHTS_OWNER_ORIGIN_SEMANTICS_AND_ACCESS_STATES_REMAIN_HOLD',
  truth_boundary: 'This stage creates preliminary assertions, runtime-preflight tasks, Gate 1 HOLD decisions, and a non-executed preflight action queue. It does not probe target sites, create rights, pass Gate 1 from metadata hints, admit evidence, or create market claims.',
  public_release: 'HOLD',
  production: 'HOLD'
};
outputFiles.push(await writeJson('p1-source-preflight-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  candidate_mission_grains: manifest.results.candidate_mission_grains,
  unique_candidates: manifest.results.unique_candidates,
  runtime_preflight_tasks: manifest.results.runtime_preflight_tasks,
  gate1_pass: 0,
  gate1_hold: manifest.results.gate1_hold,
  evidence_admitted: 0,
  preflight_actions_queued: manifest.results.preflight_actions_queued,
  output_dir: outputDir,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
