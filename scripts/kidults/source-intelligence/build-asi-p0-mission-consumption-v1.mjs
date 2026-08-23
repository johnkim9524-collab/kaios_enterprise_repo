#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  missionQueuePath = '/tmp/kidults-asi-intelligence-preparation-wave-v1/autonomous-mission-queue-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-p0-mission-consumption-contract-v1.json',
  runtimeRegistryPath = 'services/kidults-autonomous-intelligence/src/asi/registry.ts',
  outputDir = '/tmp/kidults-asi-p0-mission-consumption-v1'
] = process.argv.slice(2);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256Ref = (value) => `sha256:${sha256Hex(value)}`;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const canonicalPayload = (value) => JSON.stringify(stableValue(value));
const deterministicId = (prefix, value) => `${prefix}_${sha256Hex(canonicalPayload(value)).slice(0, 32)}`;
const writeJson = async (name, value) => {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256Ref(content), bytes: Buffer.byteLength(content) };
};

const queue = await readJson(missionQueuePath);
const contract = await readJson(contractPath);
const registrySource = await fs.readFile(runtimeRegistryPath, 'utf8');
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const slots = contract.consumption_model?.lane_slots || [];

if (queue.id !== contract.input_queue.id || queue.state !== contract.input_queue.required_state) {
  throw new Error('MISSION_QUEUE_ID_OR_STATE_INVALID');
}
if (queue.mission_count !== contract.input_queue.required_mission_count || queue.missions?.length !== contract.input_queue.required_mission_count) {
  throw new Error(`MISSION_QUEUE_COUNT_INVALID:${queue.missions?.length || 0}`);
}
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) {
  throw new Error('MISSION_CONSUMPTION_PRINCIPLE_ORDER_INVALID');
}
if (JSON.stringify(slots) !== JSON.stringify([
  'PRIMARY_CANDIDATE_LANE',
  'INDEPENDENT_FALLBACK_LANE',
  'FACTUAL_ORIGIN_REPLACEMENT_LANE'
])) throw new Error('MISSION_CONSUMPTION_SLOT_ORDER_INVALID');
if (contract.truth_boundary?.executes_external_discovery_network_calls !== false ||
  contract.truth_boundary?.creates_source_candidates !== false ||
  contract.truth_boundary?.creates_collection_right !== false) {
  throw new Error('MISSION_CONSUMPTION_TRUTH_BOUNDARY_INVALID');
}

const fleetSection = registrySource.match(/export const ASI_FLEETS = \[([\s\S]*?)\] as const;/);
if (!fleetSection) throw new Error('RUNTIME_FLEET_REGISTRY_SECTION_MISSING');
const logicalEngineSection = registrySource.match(/export const ASI_FLEET_LOGICAL_ENGINE:[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!logicalEngineSection) throw new Error('RUNTIME_FLEET_LOGICAL_ENGINE_SECTION_MISSING');
const fleetLogicalEngines = new Map(
  [...logicalEngineSection[1].matchAll(/([A-Z0-9_]+):\s*'([A-Z0-9_]+)'/g)]
    .map((match) => [match[1], match[2]])
);
const fleetMatches = [...fleetSection[1].matchAll(
  /\{\s*id:\s*'([^']+)',\s*stage:\s*'([^']+)',\s*binding:\s*'([^']+)',\s*queue:\s*'([^']+)'\s*\}/g
)].map((match) => ({
  id: match[1],
  stage: match[2],
  logical_engine: fleetLogicalEngines.get(match[1]) || null,
  binding: match[3],
  queue: match[4]
}));
const fleetById = new Map(fleetMatches.map((fleet) => [fleet.id, fleet]));
const assignedFleetIds = [...new Set(Object.values(contract.discovery_fleet_pools).flat())];
const allDiscoveryFleetIds = [...assignedFleetIds, contract.licensed_gap_fill.fleet_id];
for (const fleetId of allDiscoveryFleetIds) {
  const fleet = fleetById.get(fleetId);
  if (!fleet) throw new Error(`RUNTIME_DISCOVERY_FLEET_NOT_REGISTERED:${fleetId}`);
  if (fleet.stage !== 'DISCOVERY' || fleet.logical_engine !== 'SOURCE_DISCOVERY_ENGINE') {
    throw new Error(`RUNTIME_DISCOVERY_FLEET_BINDING_INVALID:${fleetId}`);
  }
}
if (new Set(allDiscoveryFleetIds).size !== 12) throw new Error('DISCOVERY_FLEET_TAXONOMY_NOT_12');
if (contract.licensed_gap_fill.normal_autonomous_assignment_allowed !== false) throw new Error('LICENSED_GAP_FILL_AUTONOMY_BOUNDARY');

await fs.mkdir(outputDir, { recursive: true });
const queueInputContent = await fs.readFile(missionQueuePath, 'utf8');
const inputSnapshotRef = sha256Ref(queueInputContent);
const observedAt = contract.event_contract.event_clock;
const missionIds = new Set();
const taskIds = new Set();
const events = new Set();
const tasks = [];
const consumptionReceipts = [];

const sourceRoleFor = (evidenceClass) => evidenceClass === 'CURRENT_SOLD_TRANSACTION'
  ? 'SOLD_TRANSACTION'
  : evidenceClass === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'
    ? 'SOLD_TRANSACTION'
    : 'INDEPENDENT_VERIFICATION';

const sortedMissions = [...queue.missions].sort((a, b) => Number(a.sequence) - Number(b.sequence) || a.mission_id.localeCompare(b.mission_id));
for (const mission of sortedMissions) {
  if (missionIds.has(mission.mission_id)) throw new Error(`DUPLICATE_MISSION_ID:${mission.mission_id}`);
  missionIds.add(mission.mission_id);
  if (mission.state !== 'QUEUED_READY_FOR_BOUNDED_DISCOVERY_AND_PREFLIGHT' || mission.execution_mode !== 'BOUNDED_DISCOVERY_AND_PREFLIGHT_ONLY') {
    throw new Error(`MISSION_NOT_CONSUMABLE:${mission.mission_id}`);
  }
  if (!contract.input_queue.required_evidence_classes.includes(mission.evidence_class)) {
    throw new Error(`MISSION_EVIDENCE_CLASS_NOT_ALLOWED:${mission.mission_id}`);
  }
  if (mission.direction_floor_pass !== true || mission.collection_authorized !== false || mission.evidence_admitted !== false || mission.market_claim_authorized !== false) {
    throw new Error(`MISSION_PERMISSION_OR_DIRECTION_INVALID:${mission.mission_id}`);
  }

  const missionTaskIds = [];
  for (const [slotIndex, laneSlot] of slots.entries()) {
    const pool = contract.discovery_fleet_pools[laneSlot];
    if (!Array.isArray(pool) || pool.length < 2) throw new Error(`DISCOVERY_POOL_INVALID:${laneSlot}`);
    const selectedFleetId = pool[(Number(mission.sequence) - 1 + slotIndex) % pool.length];
    const fleet = fleetById.get(selectedFleetId);
    const sourceRole = sourceRoleFor(mission.evidence_class);
    const frontierDigest = sha256Hex(`${mission.mission_id}::${laneSlot}::${selectedFleetId}`);
    const payload = {
      mission_id: mission.mission_id,
      market_cell_id: mission.market_cell_id,
      lane_slot: laneSlot,
      discovery_objective: mission.objective,
      scope_id: mission.scope_id,
      scope_name: mission.scope_name,
      domain: mission.domain,
      archetype: mission.archetype,
      region: mission.region,
      language_rule: mission.language_rule,
      evidence_class: mission.evidence_class,
      source_role_demand: mission.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'
        ? ['SOLD_TRANSACTION', 'LISTING_SUPPLY']
        : ['SOLD_TRANSACTION'],
      claim_ceiling: mission.claim_ceiling,
      expected_unknown_reduction_score: mission.expected_unknown_reduction_score,
      expected_intelligence_gain_score: mission.expected_intelligence_gain_score,
      intelligence_roi_score: mission.intelligence_roi_score,
      dependency_concentration_risk: mission.dependency_concentration_risk,
      query_bundle: {
        scope_terms: [mission.scope_name, mission.scope_id, mission.archetype],
        region_terms: [mission.region],
        language_rule: mission.language_rule,
        evidence_terms: mission.evidence_class === 'CURRENT_SOLD_TRANSACTION'
          ? ['sold', 'sale result', 'transaction', 'hammer price', 'realized price']
          : ['sold date', 'listing date', 'days on market', 'time to sale', 'exposure', 'sell through'],
        negative_semantic_controls: contract.negative_semantic_controls
      },
      four_principle_vector: mission.sourcing_direction_vector,
      provider_direct_to_truth: false,
      provider_direct_to_index: false,
      provider_direct_to_projection: false,
      external_raw_data_is_owned_moat: false,
      collection_authorized: false,
      evidence_admitted: false,
      market_claim_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
    const eventIdentity = {
      mission_id: mission.mission_id,
      lane_slot: laneSlot,
      selected_fleet_id: selectedFleetId,
      input_snapshot_ref: inputSnapshotRef,
      policy_version: contract.version
    };
    const eventId = deterministicId('evt', eventIdentity);
    const taskId = deterministicId('task', eventIdentity);
    const outboxId = deterministicId('outbox', eventIdentity);
    if (events.has(eventId) || taskIds.has(taskId)) throw new Error(`TASK_OR_EVENT_COLLISION:${mission.mission_id}:${laneSlot}`);
    events.add(eventId);
    taskIds.add(taskId);
    missionTaskIds.push(taskId);
    const event = {
      event_id: eventId,
      event_type: contract.event_contract.event_type,
      event_version: contract.event_contract.event_version,
      occurred_at: observedAt,
      observed_at: observedAt,
      producer_engine: contract.event_contract.producer_engine,
      producer_version: contract.event_contract.producer_version,
      correlation_id: deterministicId('corr', { mission_id: mission.mission_id }),
      causation_id: null,
      idempotency_key: `mission-consumption:v1:${taskId}`,
      partition: {
        channel: 'OPEN_MARKET',
        region: mission.region,
        language: 'MULTILINGUAL_LOCAL_REQUIRED',
        scope_id: mission.scope_id,
        source_role: sourceRole,
        canonical_host_hash: `frontier:v1:sha256:${frontierDigest}`
      },
      input_snapshot_ref: inputSnapshotRef,
      payload_hash: sha256Ref(canonicalPayload(payload)),
      rights_state: contract.event_contract.rights_state,
      freshness_state: contract.event_contract.freshness_state,
      assertion_purpose: contract.event_contract.assertion_purpose,
      decision: contract.event_contract.decision,
      reason_codes: [
        'AUTONOMOUS_MISSION_CONSUMED',
        `DISCOVERY_LANE_${laneSlot}`,
        'FOUR_PRINCIPLE_HARD_FLOOR_PASS',
        'DISCOVERY_ONLY_NO_COLLECTION',
        'NO_EVIDENCE_OR_CLAIM_PROMOTION'
      ],
      trace_refs: [
        `mission-queue:${queue.id}`,
        `mission:${mission.mission_id}`,
        `market-cell:${mission.market_cell_id}`,
        `policy:${contract.id}@${contract.version}`
      ],
      payload
    };
    tasks.push({
      task_id: taskId,
      outbox_id: outboxId,
      state: 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT',
      target_fleet: selectedFleetId,
      queue_binding: fleet.binding,
      queue_name: fleet.queue,
      mission_id: mission.mission_id,
      market_cell_id: mission.market_cell_id,
      lane_slot: laneSlot,
      event,
      external_network_call_executed: false,
      source_candidate_created: false,
      collection_authorized: false,
      evidence_admitted: false,
      market_claim_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD'
    });
  }
  consumptionReceipts.push({
    receipt_id: deterministicId('mission_receipt', { mission_id: mission.mission_id, input_snapshot_ref: inputSnapshotRef }),
    mission_id: mission.mission_id,
    market_cell_id: mission.market_cell_id,
    state: 'CONSUMED_TO_THREE_DISCOVERY_LANE_TASKS',
    consumed_at: observedAt,
    task_ids: missionTaskIds,
    lane_slots: slots,
    expected_task_count: 3,
    actual_task_count: missionTaskIds.length,
    source_candidates_created: 0,
    evidence_admitted: 0,
    market_claims_created: 0,
    public_release: 'HOLD',
    production: 'HOLD'
  });
}

if (consumptionReceipts.length !== contract.consumption_model.missions_consumed_required) {
  throw new Error(`MISSION_CONSUMPTION_COUNT_INVALID:${consumptionReceipts.length}`);
}
if (tasks.length !== contract.consumption_model.lane_tasks_required) {
  throw new Error(`DISCOVERY_TASK_COUNT_INVALID:${tasks.length}`);
}

const fleetSummary = assignedFleetIds.map((fleetId) => {
  const subset = tasks.filter((task) => task.target_fleet === fleetId);
  return {
    fleet_id: fleetId,
    task_count: subset.length,
    lane_slots: [...new Set(subset.map((task) => task.lane_slot))].sort(),
    scope_count: new Set(subset.map((task) => task.event.payload.scope_id)).size,
    region_count: new Set(subset.map((task) => task.event.payload.region)).size,
    evidence_classes: [...new Set(subset.map((task) => task.event.payload.evidence_class))].sort(),
    runtime_registered: true,
    external_network_call_executed: false
  };
}).sort((a, b) => a.fleet_id.localeCompare(b.fleet_id));
if (fleetSummary.some((item) => item.task_count === 0)) throw new Error('ASSIGNED_DISCOVERY_FLEET_WITHOUT_TASK');

const laneSummary = slots.map((laneSlot) => ({
  lane_slot: laneSlot,
  task_count: tasks.filter((task) => task.lane_slot === laneSlot).length,
  distinct_fleet_count: new Set(tasks.filter((task) => task.lane_slot === laneSlot).map((task) => task.target_fleet)).size,
  mission_count: new Set(tasks.filter((task) => task.lane_slot === laneSlot).map((task) => task.mission_id)).size
}));

const ledger = {
  id: 'kidults-asi-p0-mission-consumption-ledger-v1',
  version: '1.0.0',
  state: 'ALL_CURRENT_MISSIONS_CONSUMED_TO_DISCOVERY_TASKS',
  input_queue_id: queue.id,
  input_snapshot_ref: inputSnapshotRef,
  mission_count: consumptionReceipts.length,
  missions_consumed: consumptionReceipts.length,
  mission_consumption_percent: 100,
  receipts: consumptionReceipts,
  source_candidates_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const taskQueue = {
  id: 'kidults-asi-p0-source-discovery-task-queue-v1',
  version: '1.0.0',
  state: 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT',
  input_queue_id: queue.id,
  input_snapshot_ref: inputSnapshotRef,
  mission_count: consumptionReceipts.length,
  task_count: tasks.length,
  tasks,
  external_network_calls_executed: 0,
  source_candidates_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const routing = {
  id: 'kidults-asi-p0-discovery-fleet-routing-v1',
  version: '1.0.0',
  state: 'DETERMINISTIC_RUNTIME_REGISTERED_ROUTING',
  assigned_discovery_fleet_count: assignedFleetIds.length,
  total_discovery_fleet_count: allDiscoveryFleetIds.length,
  licensed_gap_fill: {
    fleet_id: contract.licensed_gap_fill.fleet_id,
    assigned_task_count: tasks.filter((task) => task.target_fleet === contract.licensed_gap_fill.fleet_id).length,
    state: contract.licensed_gap_fill.state
  },
  fleet_summary: fleetSummary,
  lane_summary: laneSummary,
  manual_routing_required: false,
  provider_lock_in_created: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const files = [];
files.push(await writeJson('p0-mission-consumption-ledger-v1.json', ledger));
files.push(await writeJson('p0-source-discovery-task-queue-v1.json', taskQueue));
files.push(await writeJson('p0-discovery-fleet-routing-v1.json', routing));

const manifest = {
  id: 'kidults-asi-p0-mission-consumption-manifest-v1',
  version: '1.0.0',
  state: 'P0_MISSIONS_CONSUMED_AND_DISCOVERY_TASKS_READY',
  platform_principles: principles,
  input_bindings: {
    mission_queue: {
      id: queue.id,
      state: queue.state,
      mission_count: queue.mission_count,
      input_snapshot_ref: inputSnapshotRef
    },
    contract: {
      id: contract.id,
      version: contract.version,
      sha256: sha256Ref(stableJson(contract))
    },
    runtime_registry: {
      path: runtimeRegistryPath,
      sha256: sha256Ref(registrySource),
      discovery_fleet_count: allDiscoveryFleetIds.length
    }
  },
  results: {
    missions_available: queue.mission_count,
    missions_consumed: consumptionReceipts.length,
    mission_consumption_percent: 100,
    discovery_lane_tasks_created: tasks.length,
    runtime_registered_fleets_assigned: assignedFleetIds.length,
    optional_licensed_fleet_tasks: 0,
    source_candidates_created: 0,
    external_network_calls_executed: 0,
    evidence_admitted: 0,
    market_claims_created: 0
  },
  output_files: files,
  autonomous_effect: 'POSITIVE_ALL_MISSIONS_CONSUMED_WITHOUT_MANUAL_ROUTING',
  global_effect: 'POSITIVE_ALL_32_SCOPES_THREE_REGIONS_AND_TWO_CRITICAL_EVIDENCE_CLASSES_ROUTED',
  irreplaceable_value_effect: 'POSITIVE_PROVIDER_OPTIONAL_THREE_LANE_DISCOVERY_DEMAND_AND_KIDULTS_OWNED_RECEIPTS',
  transparency_effect: 'POSITIVE_DETERMINISTIC_TASK_EVENT_LINEAGE_AND_EXPLICIT_ZERO_PROMOTION_BOUNDARIES',
  truth_boundary: 'This execution consumes missions and creates runtime-preflightable discovery tasks. It does not prove external discovery execution or create source candidates, evidence, rights, admission, or market claims.',
  public_release: 'HOLD',
  production: 'HOLD'
};
files.push(await writeJson('p0-mission-consumption-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  missions_consumed: manifest.results.missions_consumed,
  discovery_lane_tasks_created: manifest.results.discovery_lane_tasks_created,
  assigned_discovery_fleets: manifest.results.runtime_registered_fleets_assigned,
  source_candidates_created: 0,
  output_dir: outputDir,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
