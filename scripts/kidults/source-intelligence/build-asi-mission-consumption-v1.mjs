#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  missionQueuePath = '/tmp/kidults-asi-intelligence-preparation-wave-v1/autonomous-mission-queue-v1.json',
  productRegistryPath = '/tmp/kidults-anchor-foundation/category-representative-product-registry-v1.json',
  crosswalkPath = 'coordination/kidults/source-intelligence/scope-registry-v1-to-v2-crosswalk-v1.json',
  sourceFrontierPath = 'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  contractPath = 'coordination/kidults/source-intelligence/asi-mission-consumption-contract-v1.json',
  outputDir = '/tmp/kidults-asi-mission-consumption-v1'
] = process.argv.slice(2);

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256Ref = (value) => `sha256:${sha256Hex(value)}`;
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
};
const canonicalJson = (value, pretty = false) => JSON.stringify(canonicalValue(value), null, pretty ? 2 : 0);
const stableText = (value) => `${canonicalJson(value, true)}\n`;
const unique = (values) => [...new Set(values)];
const normalizeRegion = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const normalizeHost = (url) => {
  try {
    const parsed = new URL(String(url || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};
const normalizeUrl = (url) => {
  try {
    const parsed = new URL(String(url || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};
const assignmentPenalty = (migrationType) => {
  if (migrationType === 'ONE_TO_ONE' || migrationType === 'CONVERGES_TO_TARGET') return 0;
  if (migrationType === 'ONE_TO_ONE_SEMANTIC_REVIEW_REQUIRED') return 1;
  if (migrationType === 'SPLIT_TARGET_SPECIFIC_EVIDENCE_REQUIRED') return 2;
  return 9;
};
const accessPenalty = (accessMode) => {
  const value = String(accessMode || 'UNKNOWN');
  if (/^PUBLIC_(WEB|API|DATASET|GITHUB_DATASET)$/.test(value) || value === 'PUBLIC_WEB_AND_API') return 0;
  if (/API_KEY_OR_PUBLIC_API|PUBLIC_WEB_AND_API/.test(value)) return 1;
  if (/API_KEY|API_TOKEN|OAUTH|MEMBERSHIP|COMMERCIAL/.test(value)) return 3;
  return 2;
};
const rolePenalty = (matchedRoles) => {
  if (matchedRoles.includes('SOLD_TRANSACTION')) return 0;
  if (matchedRoles.includes('AUCTION_PRIVATE_SALE')) return 1;
  if (matchedRoles.includes('LISTING_SUPPLY')) return 2;
  return 5;
};
const slotOrder = ['PRIMARY_CANDIDATE_LANE', 'INDEPENDENT_FALLBACK_LANE', 'FACTUAL_ORIGIN_REPLACEMENT_LANE'];
const fixedClock = '2026-08-23T00:00:00.000Z';

const missionQueue = await readJson(missionQueuePath);
const productRegistry = await readJson(productRegistryPath);
const crosswalk = await readJson(crosswalkPath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

if (missionQueue.id !== 'kidults-asi-autonomous-mission-queue-v1' || missionQueue.mission_count !== 192 || missionQueue.missions?.length !== 192) {
  throw new Error('MISSION_QUEUE_INVALID');
}
if (missionQueue.missions.filter((mission) => mission.evidence_class === 'CURRENT_SOLD_TRANSACTION').length !== 96 ||
    missionQueue.missions.filter((mission) => mission.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE').length !== 96) {
  throw new Error('MISSION_EVIDENCE_CLASS_COUNTS_INVALID');
}
if (productRegistry.named_anchor_product_count !== 160 || productRegistry.records?.length !== 160) {
  throw new Error('REPRESENTATIVE_PRODUCT_REGISTRY_INVALID');
}
if (crosswalk.id !== 'scope-registry-v1-to-v2-crosswalk-v1' || crosswalk.records?.length !== 32) {
  throw new Error('SCOPE_CROSSWALK_INVALID');
}
if (contract.id !== 'kidults-asi-mission-consumption-contract-v1' || contract.version !== '1.0.0' ||
    JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) {
  throw new Error('MISSION_CONSUMPTION_CONTRACT_INVALID');
}
if (contract.truth_boundary?.external_source_content_collected !== false || contract.truth_boundary?.source_right_created !== false) {
  throw new Error('MISSION_CONSUMPTION_BOUNDARY_INVALID');
}

const sourceText = await fs.readFile(sourceFrontierPath, 'utf8');
const sourceLines = sourceText.trim().split(/\r?\n/);
const sourceHeader = sourceLines.shift().split('|');
const sourceRows = sourceLines.map((line) => {
  const values = line.split('|');
  const raw = Object.fromEntries(sourceHeader.map((key, index) => [key, String(values[index] || '').trim()]));
  const endpoint = normalizeUrl(raw.official_endpoint);
  const host = normalizeHost(raw.official_endpoint);
  return {
    ...raw,
    source_id: raw.source_id.trim(),
    endpoint,
    host,
    legacy_scope_ids: raw.collection_scope_ids.split(';').map((value) => value.trim()).filter(Boolean),
    source_roles: raw.source_roles.split(';').map((value) => value.trim()).filter(Boolean)
  };
}).filter((row) => row.source_id && row.endpoint && row.host);
if (sourceRows.length < 50) throw new Error(`REGISTERED_SOURCE_FRONTIER_TOO_SMALL:${sourceRows.length}`);

const missionById = new Map(missionQueue.missions.map((mission) => [mission.mission_id, mission]));
const sortedMissions = [...missionQueue.missions].sort((left, right) =>
  Number(left.priority_wave) - Number(right.priority_wave) ||
  Number(right.intelligence_roi_score) - Number(left.intelligence_roi_score) ||
  String(left.mission_id).localeCompare(String(right.mission_id))
);
const regions = unique(sortedMissions.map((mission) => mission.region)).sort();
const evidenceClasses = unique(sortedMissions.map((mission) => mission.evidence_class)).sort();
if (regions.length !== 3 || evidenceClasses.length !== 2) throw new Error('MISSION_DIMENSIONS_INVALID');

const mappingsByLegacy = new Map(crosswalk.records.map((record) => [record.legacy_scope_id, record]));
const mappingsByTarget = new Map();
for (const record of crosswalk.records) {
  for (const target of record.target_scope_ids || []) {
    if (!mappingsByTarget.has(target)) mappingsByTarget.set(target, []);
    mappingsByTarget.get(target).push(record);
  }
}

const productWorkItems = [];
for (const product of [...productRegistry.records].sort((a, b) => a.representative_product_id.localeCompare(b.representative_product_id))) {
  const mapping = mappingsByLegacy.get(product.collection_scope_id);
  if (!mapping) throw new Error(`PRODUCT_SCOPE_CROSSWALK_MISSING:${product.collection_scope_id}`);
  const targets = mapping.target_scope_ids || [];
  for (const region of regions) {
    for (const evidenceClass of evidenceClasses) {
      const candidateMissionIds = targets
        .map((target) => `mission::${target}::${region}::${evidenceClass}`)
        .filter((missionId) => missionById.has(missionId));
      const exactlyBound = targets.length === 1 && candidateMissionIds.length === 1;
      let state;
      if (targets.length === 0) state = 'RETIRED_SCOPE_DYNAMIC_REVIEW_REQUIRED';
      else if (targets.length > 1) state = 'SPLIT_TARGET_SPECIFIC_EVIDENCE_REQUIRED';
      else if (mapping.migration_type === 'ONE_TO_ONE_SEMANTIC_REVIEW_REQUIRED') state = 'MISSION_BOUND_SEMANTIC_REVIEW_REQUIRED';
      else state = 'MISSION_BOUND';
      productWorkItems.push({
        work_item_id: `mission-product::${product.representative_product_id}::${region}::${evidenceClass}`,
        state,
        mission_id: exactlyBound ? candidateMissionIds[0] : null,
        candidate_mission_ids: candidateMissionIds,
        representative_product_id: product.representative_product_id,
        display_name: product.display_name,
        maker_or_brand: product.maker_or_brand,
        product_name: product.product_name,
        identity_level: product.identity_level,
        release_or_era: product.release_or_era,
        legacy_scope_id: product.collection_scope_id,
        target_scope_ids: targets,
        migration_type: mapping.migration_type,
        region,
        evidence_class: evidenceClass,
        required_source_roles: contract.evidence_class_requirements[evidenceClass].required_source_roles,
        required_market_semantics: contract.evidence_class_requirements[evidenceClass].required_market_semantics,
        canonical_identity_state: product.canonical_identity_state,
        source_pool_promoted: false,
        collection_authorized: false,
        evidence_admitted: false,
        market_claim_authorized: false,
        public_release: 'HOLD',
        production: 'HOLD'
      });
    }
  }
}
if (productWorkItems.length !== contract.execution_model.expected_product_work_items) {
  throw new Error(`PRODUCT_WORK_ITEM_COUNT_INVALID:${productWorkItems.length}`);
}

const roleRequirements = contract.evidence_class_requirements;
const sourceLaneRecords = [];
const runtimeEvents = [];
const discoveryIntents = [];
const missionStates = [];

for (const mission of sortedMissions) {
  const targetMappings = mappingsByTarget.get(mission.scope_id) || [];
  const requiredRoles = roleRequirements[mission.evidence_class].required_source_roles;
  const candidateMap = new Map();
  for (const mapping of targetMappings) {
    for (const source of sourceRows) {
      if (!source.legacy_scope_ids.includes(mapping.legacy_scope_id)) continue;
      const matchedRoles = source.source_roles.filter((role) => requiredRoles.includes(role));
      if (matchedRoles.length === 0) continue;
      const candidate = {
        source_id: source.source_id,
        display_name: source.display_name,
        core_domain: source.core_domain,
        endpoint: source.endpoint,
        canonical_host: source.host,
        source_roles: source.source_roles,
        matched_roles: matchedRoles,
        official_documentation_url: normalizeUrl(source.official_documentation_url),
        authority_basis: source.authority_basis,
        channel_type: source.channel_type,
        access_mode: source.access_mode,
        legacy_scope_id: mapping.legacy_scope_id,
        target_scope_id: mission.scope_id,
        migration_type: mapping.migration_type,
        scope_mapping_note: mapping.note || null,
        mapping_penalty: assignmentPenalty(mapping.migration_type),
        role_penalty: rolePenalty(matchedRoles),
        access_penalty: accessPenalty(source.access_mode)
      };
      const existing = candidateMap.get(source.host);
      const score = candidate.mapping_penalty * 100 + candidate.role_penalty * 10 + candidate.access_penalty;
      const existingScore = existing
        ? existing.mapping_penalty * 100 + existing.role_penalty * 10 + existing.access_penalty
        : Number.POSITIVE_INFINITY;
      if (!existing || score < existingScore || (score === existingScore && candidate.source_id.localeCompare(existing.source_id) < 0)) {
        candidateMap.set(source.host, candidate);
      }
    }
  }
  const candidates = [...candidateMap.values()].sort((left, right) =>
    left.mapping_penalty - right.mapping_penalty ||
    left.role_penalty - right.role_penalty ||
    left.access_penalty - right.access_penalty ||
    left.source_id.localeCompare(right.source_id)
  );

  let filledSlots = 0;
  let runtimeEventCount = 0;
  for (let slotIndex = 0; slotIndex < slotOrder.length; slotIndex += 1) {
    const slot = slotOrder[slotIndex];
    const candidate = candidates[slotIndex] || null;
    const splitMapping = candidate?.migration_type === 'SPLIT_TARGET_SPECIFIC_EVIDENCE_REQUIRED';
    const semanticReview = candidate?.migration_type === 'ONE_TO_ONE_SEMANTIC_REVIEW_REQUIRED';
    let assignmentState = 'UNFILLED_DISCOVERY_REQUIRED';
    if (candidate && splitMapping) assignmentState = 'TARGET_SPECIFIC_SCOPE_EVIDENCE_REQUIRED';
    else if (candidate && semanticReview) assignmentState = 'REGISTERED_SCOPE_ROLE_MATCH_SEMANTIC_REVIEW_REQUIRED';
    else if (candidate) assignmentState = 'REGISTERED_SCOPE_ROLE_MATCH';
    if (candidate) filledSlots += 1;
    const eventEligible = Boolean(candidate && !splitMapping);
    const laneRecord = {
      lane_assignment_id: `mission-lane::${mission.mission_id}::${slot}`,
      mission_id: mission.mission_id,
      market_cell_id: mission.market_cell_id,
      scope_id: mission.scope_id,
      scope_name: mission.scope_name,
      domain: mission.domain,
      archetype: mission.archetype,
      region: mission.region,
      language_rule: mission.language_rule,
      evidence_class: mission.evidence_class,
      lane_slot: slot,
      assignment_state: assignmentState,
      registered_source: candidate ? {
        source_id: candidate.source_id,
        display_name: candidate.display_name,
        endpoint: candidate.endpoint,
        canonical_host: candidate.canonical_host,
        source_roles: candidate.source_roles,
        matched_roles: candidate.matched_roles,
        official_documentation_url: candidate.official_documentation_url,
        authority_basis: candidate.authority_basis,
        channel_type: candidate.channel_type,
        access_mode: candidate.access_mode,
        legacy_scope_id: candidate.legacy_scope_id,
        migration_type: candidate.migration_type,
        scope_mapping_note: candidate.scope_mapping_note
      } : null,
      distinct_host_required: slot !== 'PRIMARY_CANDIDATE_LANE',
      source_owner_independence_state: candidate ? 'UNVERIFIED' : 'MISSING',
      factual_origin_independence_state: candidate ? 'UNVERIFIED' : 'MISSING',
      runtime_event_eligible: eventEligible,
      rights_state: 'UNKNOWN',
      source_admitted: false,
      collection_authorized: false,
      evidence_admitted: false,
      market_claim_authorized: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
    sourceLaneRecords.push(laneRecord);

    if (!eventEligible) {
      const queryTerm = mission.evidence_class === 'CURRENT_SOLD_TRANSACTION'
        ? `${mission.scope_name} ${mission.region} auction sold results realized price`
        : `${mission.scope_name} ${mission.region} marketplace listing sold unsold withdrawn exposure`;
      discoveryIntents.push({
        discovery_intent_id: `mission-intent::${mission.mission_id}::${slot}`,
        state: 'READY_FOR_BOUNDED_PUBLIC_METADATA_DISCOVERY',
        mission_id: mission.mission_id,
        market_cell_id: mission.market_cell_id,
        lane_slot: slot,
        scope_id: mission.scope_id,
        scope_name: mission.scope_name,
        region: mission.region,
        evidence_class: mission.evidence_class,
        required_source_roles: requiredRoles,
        required_market_semantics: roleRequirements[mission.evidence_class].required_market_semantics,
        query_term: queryTerm,
        preferred_discovery_channels: [
          'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
          'APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER',
          'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',
          'GITHUB_PUBLIC_REPOSITORY_HOMEPAGE_METADATA',
          'DATACITE_AND_OPEN_RESEARCH_LANDING_METADATA',
          'OPTIONAL_LICENSED_SEARCH_OR_DATA_PROVIDER'
        ],
        target_site_body_traversal_authorized: false,
        rights_effect: 'NONE',
        admission_effect: 'NONE',
        collection_authorized: false,
        public_release: 'HOLD',
        production: 'HOLD'
      });
      continue;
    }

    const hostDigest = sha256Hex(candidate.canonical_host);
    const sourceRole = candidate.matched_roles[0];
    const payload = {
      mission_id: mission.mission_id,
      market_cell_id: mission.market_cell_id,
      lane_slot: slot,
      purpose: contract.runtime_bridge.purpose,
      source_id: candidate.source_id,
      source_role_demand: requiredRoles,
      required_market_semantics: roleRequirements[mission.evidence_class].required_market_semantics,
      claim_ceiling: roleRequirements[mission.evidence_class].claim_ceiling,
      discovery_seed: {
        source_id: candidate.source_id,
        canonical_site_id: `site-${hostDigest.slice(0, 32)}`,
        canonical_host: candidate.canonical_host,
        endpoint_url: candidate.endpoint,
        seed_ref: `registered-source-frontier:${candidate.source_id}`,
        discovery_rights_state: contract.runtime_bridge.source_seed_rights_state,
        registered_source_frontier_only: true
      },
      registered_source_context: {
        display_name: candidate.display_name,
        authority_basis: candidate.authority_basis,
        access_mode: candidate.access_mode,
        official_documentation_url: candidate.official_documentation_url,
        migration_type: candidate.migration_type,
        source_owner_independence_state: 'UNVERIFIED',
        factual_origin_independence_state: 'UNVERIFIED'
      },
      content_collection_authorized: false,
      external_collection_execution_authorized: false,
      public_projection_authorized: false,
      production_authorized: false
    };
    const payloadHash = sha256Ref(canonicalJson(payload));
    const eventIdentity = sha256Hex(canonicalJson({
      mission_id: mission.mission_id,
      lane_slot: slot,
      source_id: candidate.source_id,
      payload_hash: payloadHash
    }));
    const inputSnapshotRef = sha256Ref(canonicalJson({
      mission_queue_id: missionQueue.id,
      mission_queue_version: missionQueue.version,
      mission_id: mission.mission_id,
      registered_source_frontier_sha256: sha256Hex(sourceText)
    }));
    const reasonCodes = [
      'MISSION_BOUND_REGISTERED_SOURCE_PREFLIGHT_ONLY',
      'REGISTERED_SOURCE_IS_NOT_RIGHTS_ADMITTED',
      'SOURCE_OWNER_INDEPENDENCE_UNVERIFIED',
      'FACTUAL_ORIGIN_INDEPENDENCE_UNVERIFIED'
    ];
    if (semanticReview) reasonCodes.push('SCOPE_SEMANTIC_REVIEW_REQUIRED');
    const event = {
      event_id: `evt_mission_${eventIdentity.slice(0, 32)}`,
      event_type: contract.runtime_bridge.input_event_type,
      event_version: '1.0.0',
      occurred_at: fixedClock,
      observed_at: fixedClock,
      producer_engine: 'AUTONOMOUS_MISSION_GENERATOR',
      producer_version: 'mission-consumption-bridge-1.0.0',
      correlation_id: `mission:${sha256Hex(mission.mission_id).slice(0, 32)}`,
      causation_id: null,
      idempotency_key: `mission-discovery:${eventIdentity}`,
      partition: {
        channel: contract.runtime_bridge.canonical_discovery_channel,
        region: normalizeRegion(mission.region),
        language: 'en',
        scope_id: mission.scope_id,
        source_role: sourceRole,
        canonical_host_hash: `sha256:${hostDigest}`
      },
      input_snapshot_ref: inputSnapshotRef,
      payload_hash: payloadHash,
      rights_state: contract.runtime_bridge.rights_state,
      freshness_state: contract.runtime_bridge.freshness_state,
      assertion_purpose: contract.runtime_bridge.purpose,
      decision: contract.runtime_bridge.decision,
      reason_codes: unique(reasonCodes).sort(),
      trace_refs: [
        mission.mission_id,
        mission.market_cell_id,
        `mission-lane::${mission.mission_id}::${slot}`,
        `registered-source-frontier:${candidate.source_id}`,
        inputSnapshotRef
      ].sort(),
      payload
    };
    runtimeEvents.push(event);
    runtimeEventCount += 1;
  }

  const missionProductItems = productWorkItems.filter((item) => item.mission_id === mission.mission_id);
  const missionState = runtimeEventCount > 0
    ? 'RUNTIME_DISCOVERY_EVENT_EMITTED'
    : filledSlots > 0
      ? 'CONSUMED_SOURCE_LANES_PARTIAL'
      : 'CONSUMED_DISCOVERY_GAP_OPEN';
  missionStates.push({
    mission_id: mission.mission_id,
    market_cell_id: mission.market_cell_id,
    state: missionState,
    consumed: true,
    priority_wave: mission.priority_wave,
    intelligence_roi_score: mission.intelligence_roi_score,
    scope_id: mission.scope_id,
    region: mission.region,
    evidence_class: mission.evidence_class,
    product_work_items_bound: missionProductItems.length,
    source_lane_slots: slotOrder.length,
    filled_source_lane_slots: filledSlots,
    unfilled_or_target_review_slots: slotOrder.length - runtimeEventCount,
    runtime_discovery_events_emitted: runtimeEventCount,
    external_collection_executed: false,
    evidence_admitted: false,
    market_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  });
}

if (missionStates.length !== 192 || unique(missionStates.map((record) => record.mission_id)).length !== 192) {
  throw new Error('MISSION_CONSUMPTION_STATE_COUNT_INVALID');
}
if (sourceLaneRecords.length !== contract.execution_model.expected_source_lane_slots) {
  throw new Error(`SOURCE_LANE_SLOT_COUNT_INVALID:${sourceLaneRecords.length}`);
}
if (runtimeEvents.length === 0) throw new Error('NO_RUNTIME_DISCOVERY_EVENTS_EMITTED');

const missionConsumptionState = {
  id: 'kidults-asi-mission-consumption-state-v1',
  version: '1.0.0',
  state: 'ALL_GENERATED_MISSIONS_CONSUMED',
  source_mission_queue_id: missionQueue.id,
  source_mission_queue_version: missionQueue.version,
  mission_count: missionStates.length,
  missions_consumed_exactly_once: true,
  runtime_discovery_event_count: runtimeEvents.length,
  missions_with_runtime_events: missionStates.filter((record) => record.runtime_discovery_events_emitted > 0).length,
  missions_with_discovery_gaps: missionStates.filter((record) => record.runtime_discovery_events_emitted === 0).length,
  records: missionStates,
  external_collection_executed: false,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const missionProductOutput = {
  id: 'kidults-asi-mission-product-work-items-v1',
  version: '1.0.0',
  state: 'PRODUCT_WORK_OBLIGATIONS_MATERIALIZED',
  total_work_items: productWorkItems.length,
  mission_bound_work_items: productWorkItems.filter((item) => item.mission_id).length,
  split_scope_review_work_items: productWorkItems.filter((item) => item.state === 'SPLIT_TARGET_SPECIFIC_EVIDENCE_REQUIRED').length,
  retired_scope_review_work_items: productWorkItems.filter((item) => item.state === 'RETIRED_SCOPE_DYNAMIC_REVIEW_REQUIRED').length,
  semantic_review_work_items: productWorkItems.filter((item) => item.state === 'MISSION_BOUND_SEMANTIC_REVIEW_REQUIRED').length,
  work_items: productWorkItems,
  collection_authorized: false,
  evidence_admitted: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const sourceLaneOutput = {
  id: 'kidults-asi-mission-source-lane-assignments-v1',
  version: '1.0.0',
  state: 'SOURCE_LANE_OBLIGATIONS_MATERIALIZED',
  mission_count: 192,
  source_lane_slot_count: sourceLaneRecords.length,
  registered_source_assignment_count: sourceLaneRecords.filter((record) => record.registered_source).length,
  runtime_event_eligible_assignment_count: sourceLaneRecords.filter((record) => record.runtime_event_eligible).length,
  unfilled_discovery_required_count: sourceLaneRecords.filter((record) => !record.runtime_event_eligible).length,
  source_owner_independence_verified_count: 0,
  factual_origin_independence_verified_count: 0,
  assignments: sourceLaneRecords,
  source_right_created: false,
  evidence_admitted: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const discoveryIntentOutput = {
  id: 'kidults-asi-mission-discovery-intent-v1',
  version: '1.0.0',
  state: 'UNFILLED_OR_TARGET_REVIEW_LANES_READY_FOR_BOUNDED_DISCOVERY',
  intent_count: discoveryIntents.length,
  next_cycle_batch_size: Math.min(32, discoveryIntents.length),
  next_cycle_intents: discoveryIntents.slice(0, 32),
  intents: discoveryIntents,
  automatic_rotation_required: discoveryIntents.length > 32,
  target_site_body_traversal_authorized: false,
  collection_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

const runtimeEventOutput = {
  id: 'kidults-asi-mission-runtime-discovery-events-v1',
  version: '1.0.0',
  state: 'RUNTIME_COMPATIBLE_DISCOVERY_EVENTS_MATERIALIZED',
  event_count: runtimeEvents.length,
  input_event_type: contract.runtime_bridge.input_event_type,
  target_runtime_fleet: contract.runtime_bridge.target_runtime_fleet,
  expected_processor_output_type: contract.runtime_bridge.expected_processor_output_type,
  expected_processor_decision: contract.runtime_bridge.expected_processor_decision,
  events: runtimeEvents,
  external_collection_executed: false,
  collection_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

await fs.mkdir(outputDir, { recursive: true });
const files = [];
const writeOutput = async (name, value) => {
  const text = stableText(value);
  await fs.writeFile(path.join(outputDir, name), text);
  files.push({ name, sha256: sha256Ref(text), bytes: Buffer.byteLength(text) });
};
await writeOutput('mission-consumption-state-v1.json', missionConsumptionState);
await writeOutput('mission-product-work-items-v1.json', missionProductOutput);
await writeOutput('mission-source-lane-assignments-v1.json', sourceLaneOutput);
await writeOutput('mission-discovery-intent-v1.json', discoveryIntentOutput);
await writeOutput('mission-runtime-discovery-events-v1.json', runtimeEventOutput);

const manifest = {
  id: 'kidults-asi-mission-consumption-manifest-v1',
  version: '1.0.0',
  state: 'MISSION_CONSUMPTION_OUTPUTS_READY_FOR_VALIDATION_AND_RUNTIME_REPLAY',
  platform_principles: principles,
  input_bindings: {
    mission_queue: {
      id: missionQueue.id,
      version: missionQueue.version,
      mission_count: missionQueue.mission_count,
      sha256: sha256Ref(stableText(missionQueue))
    },
    representative_product_registry: {
      id: productRegistry.id,
      version: productRegistry.version,
      product_count: productRegistry.named_anchor_product_count,
      fingerprint: productRegistry.fingerprint
    },
    scope_crosswalk: {
      id: crosswalk.id,
      version: crosswalk.version,
      record_count: crosswalk.records.length
    },
    registered_source_frontier: {
      source_count: sourceRows.length,
      sha256: sha256Ref(sourceText)
    },
    contract: {
      id: contract.id,
      version: contract.version,
      sha256: sha256Ref(stableText(contract))
    }
  },
  results: {
    missions_consumed: missionStates.length,
    product_work_items: productWorkItems.length,
    mission_bound_product_work_items: missionProductOutput.mission_bound_work_items,
    unresolved_product_scope_work_items: productWorkItems.filter((item) => !item.mission_id).length,
    source_lane_slots: sourceLaneRecords.length,
    registered_source_assignments: sourceLaneOutput.registered_source_assignment_count,
    runtime_event_eligible_assignments: sourceLaneOutput.runtime_event_eligible_assignment_count,
    discovery_intents: discoveryIntents.length,
    runtime_discovery_events: runtimeEvents.length,
    external_collection_executed: false,
    evidence_admitted: 0,
    market_claims_created: 0
  },
  output_files: files,
  autonomous_effect: 'POSITIVE_GENERATED_MISSIONS_CONSUMED_INTO_MACHINE_WORK_AND_RUNTIME_EVENTS',
  global_effect: 'POSITIVE_ALL_192_SCOPE_REGION_EVIDENCE_MISSIONS_CONSUMED',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_MISSION_PRODUCT_SOURCE_LANE_AND_RUNTIME_LINEAGE',
  transparency_effect: 'POSITIVE_EXPLICIT_UNFILLED_LANES_SCOPE_AMBIGUITY_RIGHTS_HOLD_AND_EVENT_DIGESTS',
  public_release: 'HOLD',
  production: 'HOLD'
};
await writeOutput('mission-consumption-manifest-v1.json', manifest);

console.log(JSON.stringify({
  state: 'MISSION_CONSUMPTION_BUILT',
  missions_consumed: missionStates.length,
  product_work_items: productWorkItems.length,
  mission_bound_product_work_items: missionProductOutput.mission_bound_work_items,
  unresolved_product_scope_work_items: manifest.results.unresolved_product_scope_work_items,
  source_lane_slots: sourceLaneRecords.length,
  registered_source_assignments: sourceLaneOutput.registered_source_assignment_count,
  runtime_discovery_events: runtimeEvents.length,
  discovery_intents: discoveryIntents.length,
  external_collection_executed: false,
  output_dir: outputDir
}, null, 2));
