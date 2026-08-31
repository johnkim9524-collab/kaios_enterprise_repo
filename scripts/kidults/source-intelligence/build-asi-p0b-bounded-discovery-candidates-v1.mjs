#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  p0TaskQueuePath = '/tmp/kidults-asi-p0-mission-consumption-v1/p0-source-discovery-task-queue-v1.json',
  sourceFabricPath = '/tmp/asi-public-metadata-source-fabric-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-p0b-bounded-discovery-candidate-contract-v1.json',
  outputDir = '/tmp/kidults-asi-p0b-bounded-discovery-candidates-v1'
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
const deterministicId = (prefix, value) => `${prefix}_${sha256Hex(JSON.stringify(stableValue(value))).slice(0, 32)}`;
const writeJson = async (name, value) => {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256Ref(content), bytes: Buffer.byteLength(content) };
};
const toArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const strings = (value) => toArray(value).flatMap((item) => typeof item === 'string' ? [item.trim()] : []).filter(Boolean);
const firstString = (...values) => values.flatMap(strings)[0] || null;

const p0Queue = await readJson(p0TaskQueuePath);
const fabric = await readJson(sourceFabricPath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

if (p0Queue.id !== 'kidults-asi-p0-source-discovery-task-queue-v1' || p0Queue.state !== 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT') {
  throw new Error('P0_TASK_QUEUE_INVALID');
}
if (p0Queue.mission_count !== 192 || p0Queue.task_count !== 576 || p0Queue.tasks?.length !== 576) {
  throw new Error('P0_TASK_QUEUE_COUNTS_INVALID');
}
if (contract.id !== 'kidults-asi-p0b-bounded-discovery-candidate-contract-v1' || contract.version !== '1.1.0') {
  throw new Error('P0B_CONTRACT_INVALID');
}
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('P0B_PRINCIPLE_ORDER_INVALID');
if (contract.upstream_scope_rotation_count !== 4 || contract.upstream_bounded_live_lanes?.length !== 2 ||
  contract.truth_boundary?.executes_bounded_public_metadata_network_discovery !== false ||
  contract.truth_boundary?.consumes_exact_main_shared_source_fabric !== true ||
  contract.truth_boundary?.provider_requests_issued_by_p0b !== 0) {
  throw new Error('P0B_SHARED_PROVIDER_CONTRACT_INVALID');
}
if (contract.truth_boundary?.crawls_target_site_bodies !== false || contract.truth_boundary?.acquires_target_content !== false ||
  contract.truth_boundary?.creates_collection_right !== false || contract.truth_boundary?.admits_evidence !== false) {
  throw new Error('P0B_SIDE_EFFECT_BOUNDARY_INVALID');
}

const rawCandidates = Array.isArray(fabric.candidates) ? fabric.candidates
  : Array.isArray(fabric.discovery_candidates) ? fabric.discovery_candidates
    : Array.isArray(fabric.records) ? fabric.records : [];
if (rawCandidates.length === 0) throw new Error('P0B_SOURCE_FABRIC_NO_CANDIDATES');
const laneHealth = Array.isArray(fabric.lane_health) ? fabric.lane_health
  : Array.isArray(fabric.provider_health) ? fabric.provider_health
    : Array.isArray(fabric.discovery_lane_health) ? fabric.discovery_lane_health : [];
const successfulLaneObservations = laneHealth.filter((lane) => {
  const status = String(lane.status || lane.state || lane.result || '').toUpperCase();
  const observed = Number(lane.observed_candidates ?? lane.candidate_count ?? lane.results ?? 0);
  return (status.includes('SUCCESS') || status.includes('PASS')) && observed > 0;
});
if (successfulLaneObservations.length === 0) throw new Error('P0B_NO_SUCCESSFUL_LIVE_DISCOVERY_LANE_OBSERVATION');

await fs.mkdir(outputDir, { recursive: true });
const sourceFabricContent = await fs.readFile(sourceFabricPath, 'utf8');
const sourceFabricDigest = sha256Ref(sourceFabricContent);
const p0QueueContent = await fs.readFile(p0TaskQueuePath, 'utf8');
const p0QueueDigest = sha256Ref(p0QueueContent);

const canonicalEndpoint = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
};
const normalizedRegion = (value) => {
  const raw = String(value || '').trim();
  const v = raw.toLowerCase();
  if (!v || ['unknown', 'unclassified', 'none', 'null'].includes(v)) return 'UNKNOWN';
  if (v === 'global' || v === 'worldwide' || v === 'international') return 'GLOBAL_UNVERIFIED';
  if (v.includes('north america') || v === 'na' || v.includes('united states') || v === 'usa' || v === 'us' || v.includes('canada')) return 'North America';
  if (v.includes('europe') || v === 'eu' || v.includes('united kingdom') || v === 'uk' || v.includes('germany') || v.includes('france') || v.includes('italy')) return 'Europe';
  if (v.includes('east asia') || v.includes('japan') || v.includes('korea') || v.includes('china') || v.includes('hong kong') || v.includes('taiwan')) return 'East Asia';
  return `OTHER_UNVERIFIED:${raw}`;
};
const scopeHintsFor = (candidate) => [...new Set([
  ...strings(candidate.scope_hint),
  ...strings(candidate.scope_hints),
  ...strings(candidate.scope_id),
  ...strings(candidate.scope_ids),
  ...strings(candidate.query_scope_id),
  ...strings(candidate.target_scope),
  ...strings(candidate.target_scopes)
])].sort();
const regionHintsFor = (candidate) => [...new Set([
  ...strings(candidate.region_hint),
  ...strings(candidate.region_hints),
  ...strings(candidate.region),
  ...strings(candidate.regions),
  ...strings(candidate.query_region)
].map(normalizedRegion))].sort();
const rolesFor = (candidate) => [...new Set([
  ...strings(candidate.candidate_source_roles),
  ...strings(candidate.source_roles),
  ...strings(candidate.source_role),
  ...strings(candidate.source_family_hint)
])].sort();

const quarantined = [];
const observationGroups = new Map();
for (const [index, raw] of rawCandidates.entries()) {
  const endpoint = canonicalEndpoint(firstString(raw.endpoint_url, raw.url, raw.source_url, raw.landing_url, raw.candidate_url, raw.homepage_url));
  if (!endpoint) {
    quarantined.push({
      quarantine_id: deterministicId('quarantine', { index, raw_candidate_id: raw.candidate_id || null }),
      state: 'INVALID_ENDPOINT_QUARANTINED',
      raw_candidate_id: raw.candidate_id || null,
      reason: 'HTTP_OR_HTTPS_ENDPOINT_REQUIRED'
    });
    continue;
  }
  if (!observationGroups.has(endpoint)) observationGroups.set(endpoint, []);
  observationGroups.get(endpoint).push({ index, raw });
}

const candidates = [];
for (const [endpoint, observations] of [...observationGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const url = new URL(endpoint);
  const providers = [...new Set(observations.flatMap(({ raw }) => strings(raw.discovery_provider ?? raw.provider_id ?? raw.provider)))].sort();
  const channels = [...new Set(observations.flatMap(({ raw }) => strings(raw.discovery_channel ?? raw.channel ?? raw.lane_id)))].sort();
  const scopeHints = [...new Set(observations.flatMap(({ raw }) => scopeHintsFor(raw)))].sort();
  const regionHints = [...new Set(observations.flatMap(({ raw }) => regionHintsFor(raw)))].sort();
  const sourceRoles = [...new Set(observations.flatMap(({ raw }) => rolesFor(raw)))].sort();
  const observedAts = observations.flatMap(({ raw }) => strings(raw.observed_at ?? raw.discovered_at ?? raw.collected_at)).sort();
  const rightsStates = [...new Set(observations.flatMap(({ raw }) => strings(raw.rights_state || 'UNASSESSED')))].sort();
  const admissionStates = [...new Set(observations.flatMap(({ raw }) => strings(raw.admission_state || 'NOT_ADMITTED')))].sort();
  const evidenceStates = [...new Set(observations.flatMap(({ raw }) => strings(raw.evidence_state || 'DISCOVERY_METADATA_ONLY')))].sort();
  const candidateId = deterministicId('candidate', { canonical_endpoint: endpoint });
  candidates.push({
    candidate_id: candidateId,
    state: scopeHints.length > 0 ? 'OBSERVED_PUBLIC_METADATA_DISCOVERY_CANDIDATE' : 'UNBOUND_SCOPE_HINT',
    canonical_endpoint: endpoint,
    canonical_host: url.hostname,
    canonical_host_hash: sha256Ref(url.hostname),
    observation_count: observations.length,
    superseded_duplicate_observation_count: Math.max(0, observations.length - 1),
    raw_candidate_ids: [...new Set(observations.flatMap(({ raw }) => strings(raw.candidate_id)))].sort(),
    discovery_providers: providers.length ? providers : ['UNKNOWN_DISCOVERY_PROVIDER'],
    discovery_channels: channels.length ? channels : ['UNKNOWN_DISCOVERY_CHANNEL'],
    observed_at_values: observedAts,
    scope_hints: scopeHints,
    region_hints: regionHints.length ? regionHints : ['UNKNOWN'],
    candidate_source_roles: sourceRoles,
    rights_states: rightsStates.length ? rightsStates : ['UNASSESSED'],
    admission_states: admissionStates.length ? admissionStates : ['NOT_ADMITTED'],
    evidence_states: evidenceStates.length ? evidenceStates : ['DISCOVERY_METADATA_ONLY'],
    rights_state_for_target_collection: 'UNASSESSED',
    admission_state: 'NOT_ADMITTED',
    evidence_state: 'DISCOVERY_METADATA_ONLY',
    target_site_body_crawled: false,
    target_content_acquired: false,
    collection_authorized: false,
    evidence_admitted: false,
    factual_origin_id: null,
    factual_origin_independence_proven: false,
    market_claim_authorized: false,
    source_fabric_digest: sourceFabricDigest,
    public_release: 'HOLD',
    production: 'HOLD'
  });
}
if (candidates.length === 0) throw new Error('P0B_NO_VALID_CANONICAL_CANDIDATES');

const missionById = new Map();
for (const task of p0Queue.tasks) {
  const p = task.event?.payload || {};
  if (!missionById.has(task.mission_id)) {
    missionById.set(task.mission_id, {
      mission_id: task.mission_id,
      market_cell_id: task.market_cell_id,
      scope_id: p.scope_id,
      scope_name: p.scope_name,
      domain: p.domain,
      archetype: p.archetype,
      region: p.region,
      language_rule: p.language_rule,
      evidence_class: p.evidence_class,
      claim_ceiling: p.claim_ceiling,
      lane_tasks: []
    });
  }
  missionById.get(task.mission_id).lane_tasks.push({
    task_id: task.task_id,
    lane_slot: task.lane_slot,
    target_fleet: task.target_fleet,
    event_id: task.event.event_id
  });
}
if (missionById.size !== 192) throw new Error(`P0B_MISSION_COUNT_INVALID:${missionById.size}`);

const regionMatchState = (candidate, missionRegion) => {
  if (candidate.region_hints.includes(missionRegion)) return 'REGION_HINT_EXACT';
  if (candidate.region_hints.includes('GLOBAL_UNVERIFIED') || candidate.region_hints.includes('UNKNOWN')) return 'REGION_HINT_UNVERIFIED';
  return 'REGION_HINT_OTHER_UNVERIFIED';
};
const candidateScore = (candidate, mission, usedHosts, usedProviders) => {
  const regionState = regionMatchState(candidate, mission.region);
  const regionScore = regionState === 'REGION_HINT_EXACT' ? 100 : regionState === 'REGION_HINT_UNVERIFIED' ? 20 : 5;
  const hostScore = usedHosts.has(candidate.canonical_host) ? 0 : 25;
  const providerScore = candidate.discovery_providers.some((provider) => !usedProviders.has(provider)) ? 15 : 0;
  const observationScore = Math.min(10, candidate.observation_count);
  return regionScore + hostScore + providerScore + observationScore;
};

const missionBindings = [];
const assignedCandidateIds = new Set();
for (const mission of [...missionById.values()].sort((a, b) => a.mission_id.localeCompare(b.mission_id))) {
  if (mission.lane_tasks.length !== 3 || new Set(mission.lane_tasks.map((task) => task.lane_slot)).size !== 3) {
    throw new Error(`P0B_MISSION_LANE_TASKS_INVALID:${mission.mission_id}`);
  }
  const pool = candidates.filter((candidate) => candidate.scope_hints.includes(mission.scope_id));
  const usedHosts = new Set();
  const usedProviders = new Set();
  const selected = [];
  const remaining = [...pool];
  while (selected.length < 3 && remaining.length > 0) {
    remaining.sort((a, b) => {
      const diff = candidateScore(b, mission, usedHosts, usedProviders) - candidateScore(a, mission, usedHosts, usedProviders);
      return diff || a.canonical_endpoint.localeCompare(b.canonical_endpoint);
    });
    const next = remaining.shift();
    if (usedHosts.has(next.canonical_host) && remaining.some((item) => !usedHosts.has(item.canonical_host))) continue;
    selected.push(next);
    usedHosts.add(next.canonical_host);
    for (const provider of next.discovery_providers) usedProviders.add(provider);
  }
  const slotNames = ['PRIMARY_CANDIDATE_LANE', 'INDEPENDENT_FALLBACK_LANE', 'FACTUAL_ORIGIN_REPLACEMENT_LANE'];
  const slotBindings = slotNames.map((slot, index) => {
    const candidate = selected[index] || null;
    if (candidate) assignedCandidateIds.add(candidate.candidate_id);
    const regionState = candidate ? regionMatchState(candidate, mission.region) : 'NO_CANDIDATE';
    return {
      lane_slot: slot,
      task_id: mission.lane_tasks.find((task) => task.lane_slot === slot)?.task_id || null,
      candidate_id: candidate?.candidate_id || null,
      canonical_endpoint: candidate?.canonical_endpoint || null,
      canonical_host: candidate?.canonical_host || null,
      discovery_providers: candidate?.discovery_providers || [],
      region_match_state: regionState,
      assignment_state: !candidate ? 'UNFILLED_NO_SCOPE_EXACT_CANDIDATE'
        : slot === 'FACTUAL_ORIGIN_REPLACEMENT_LANE' ? 'CANDIDATE_ASSIGNED_ORIGIN_INDEPENDENCE_UNVERIFIED'
          : regionState === 'REGION_HINT_EXACT' ? 'CANDIDATE_ASSIGNED_SCOPE_AND_REGION_HINT_EXACT'
            : 'CANDIDATE_ASSIGNED_SCOPE_EXACT_REGION_UNVERIFIED',
      scope_exact_match: Boolean(candidate),
      regional_coverage_proven: false,
      factual_origin_independence_proven: false,
      rights_state_for_target_collection: 'UNASSESSED',
      collection_authorized: false,
      evidence_admitted: false,
      market_claim_authorized: false
    };
  });
  const exactRegionCandidates = selected.filter((candidate) => regionMatchState(candidate, mission.region) === 'REGION_HINT_EXACT').length;
  missionBindings.push({
    binding_id: deterministicId('mission_binding', { mission_id: mission.mission_id, source_fabric_digest: sourceFabricDigest }),
    mission_id: mission.mission_id,
    market_cell_id: mission.market_cell_id,
    scope_id: mission.scope_id,
    scope_name: mission.scope_name,
    domain: mission.domain,
    archetype: mission.archetype,
    region: mission.region,
    evidence_class: mission.evidence_class,
    claim_ceiling: mission.claim_ceiling,
    scope_exact_candidate_pool_count: pool.length,
    candidates_assigned: selected.length,
    distinct_hosts_assigned: new Set(selected.map((candidate) => candidate.canonical_host)).size,
    distinct_discovery_providers_assigned: new Set(selected.flatMap((candidate) => candidate.discovery_providers)).size,
    exact_region_hint_candidates_assigned: exactRegionCandidates,
    region_unverified_candidates_assigned: selected.length - exactRegionCandidates,
    slot_bindings: slotBindings,
    mission_candidate_state: selected.length === 0 ? 'NO_SCOPE_EXACT_CANDIDATE'
      : selected.length === 1 ? 'PRIMARY_CANDIDATE_ONLY'
        : selected.length === 2 ? 'PRIMARY_AND_FALLBACK_CANDIDATES'
          : 'THREE_CANDIDATE_HOSTS_ORIGIN_INDEPENDENCE_UNVERIFIED',
    regional_coverage_proven: false,
    factual_origin_independence_proven: false,
    collection_authorized: false,
    evidence_admitted: false,
    market_claim_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD'
  });
}

const hostGroups = new Map();
for (const candidate of candidates) {
  if (!hostGroups.has(candidate.canonical_host)) hostGroups.set(candidate.canonical_host, []);
  hostGroups.get(candidate.canonical_host).push(candidate);
}
const providerCounts = new Map();
for (const candidate of candidates) {
  for (const provider of candidate.discovery_providers) providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
}
const hostCounts = [...hostGroups.entries()].map(([host, records]) => ({ host, candidate_count: records.length })).sort((a, b) => b.candidate_count - a.candidate_count || a.host.localeCompare(b.host));
const providerSummary = [...providerCounts.entries()].map(([provider, count]) => ({ discovery_provider: provider, candidate_count: count })).sort((a, b) => b.candidate_count - a.candidate_count || a.discovery_provider.localeCompare(b.discovery_provider));

const candidateRegistry = {
  id: 'kidults-asi-p0b-source-candidate-registry-v1',
  version: '1.0.0',
  state: 'EMPIRICAL_PUBLIC_METADATA_SOURCE_CANDIDATES_OBSERVED',
  source_fabric_digest: sourceFabricDigest,
  raw_candidate_observations: rawCandidates.length,
  canonical_candidate_count: candidates.length,
  unique_host_count: hostGroups.size,
  duplicate_observations_superseded: rawCandidates.length - candidates.length - quarantined.length,
  invalid_endpoint_quarantine_count: quarantined.length,
  assigned_candidate_count: assignedCandidateIds.size,
  candidates,
  quarantined,
  target_site_bodies_crawled: 0,
  target_content_records_acquired: 0,
  collection_authorized_count: 0,
  evidence_admitted_count: 0,
  market_claim_authorized_count: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const bindingLedger = {
  id: 'kidults-asi-p0b-mission-candidate-binding-ledger-v1',
  version: '1.0.0',
  state: 'MISSION_CANDIDATE_BINDING_COMPLETE_WITH_EXPLICIT_GAPS',
  p0_task_queue_digest: p0QueueDigest,
  source_fabric_digest: sourceFabricDigest,
  mission_count: missionBindings.length,
  missions_with_at_least_one_candidate: missionBindings.filter((item) => item.candidates_assigned >= 1).length,
  missions_with_primary_and_fallback_candidates: missionBindings.filter((item) => item.candidates_assigned >= 2).length,
  missions_with_three_candidate_hosts: missionBindings.filter((item) => item.candidates_assigned >= 3).length,
  missions_with_exact_region_hint_candidate: missionBindings.filter((item) => item.exact_region_hint_candidates_assigned >= 1).length,
  missions_with_regional_coverage_proven: 0,
  missions_with_factual_origin_independence_proven: 0,
  bindings: missionBindings,
  public_release: 'HOLD',
  production: 'HOLD'
};

const gapRecords = missionBindings.map((binding) => ({
  gap_id: deterministicId('candidate_gap', { mission_id: binding.mission_id, source_fabric_digest: sourceFabricDigest }),
  mission_id: binding.mission_id,
  market_cell_id: binding.market_cell_id,
  scope_id: binding.scope_id,
  region: binding.region,
  evidence_class: binding.evidence_class,
  candidate_gap_state: binding.candidates_assigned === 0 ? 'NO_SCOPE_EXACT_CANDIDATE'
    : binding.candidates_assigned === 1 ? 'INDEPENDENT_FALLBACK_AND_FACTUAL_ORIGIN_CANDIDATES_MISSING'
      : binding.candidates_assigned === 2 ? 'FACTUAL_ORIGIN_REPLACEMENT_CANDIDATE_MISSING'
        : 'CANDIDATE_HOSTS_PRESENT_FACTUAL_ORIGIN_INDEPENDENCE_UNVERIFIED',
  missing_candidate_slots: Math.max(0, 3 - binding.candidates_assigned),
  regional_coverage_proven: false,
  factual_origin_independence_proven: false,
  rights_for_target_collection_assessed: false,
  evidence_admitted: false,
  next_required_actions: [
    'SOURCE_OWNER_AND_FACTUAL_ORIGIN_CLASSIFICATION',
    'PURPOSE_SPECIFIC_RIGHTS_PREFLIGHT',
    'MARKET_SEMANTIC_RELEVANCE_PREFLIGHT',
    'REGIONAL_RELEVANCE_VERIFICATION',
    'GATE1_SOURCE_SAFETY'
  ]
}));
const gapRegister = {
  id: 'kidults-asi-p0b-candidate-gap-register-v1',
  version: '1.0.0',
  state: 'ACTIVE_POST_DISCOVERY_CANDIDATE_GAPS',
  mission_count: missionBindings.length,
  no_candidate_missions: gapRecords.filter((item) => item.candidate_gap_state === 'NO_SCOPE_EXACT_CANDIDATE').length,
  one_candidate_missions: missionBindings.filter((item) => item.candidates_assigned === 1).length,
  two_candidate_missions: missionBindings.filter((item) => item.candidates_assigned === 2).length,
  three_candidate_missions: missionBindings.filter((item) => item.candidates_assigned >= 3).length,
  factual_origin_independence_unresolved_missions: missionBindings.length,
  regional_coverage_unproven_missions: missionBindings.length,
  records: gapRecords,
  public_release: 'HOLD',
  production: 'HOLD'
};

const diversity = {
  id: 'kidults-asi-p0b-provider-host-diversity-v1',
  version: '1.0.0',
  state: 'DISCOVERY_DIVERSITY_OBSERVED_FACTUAL_ORIGIN_DIVERSITY_UNPROVEN',
  canonical_candidate_count: candidates.length,
  unique_host_count: hostGroups.size,
  discovery_provider_count: providerSummary.length,
  provider_summary: providerSummary,
  top_hosts: hostCounts.slice(0, 100),
  successful_live_discovery_lane_observations: successfulLaneObservations.length,
  live_lane_health: laneHealth,
  distinct_host_is_distinct_factual_origin: false,
  discovery_provider_is_factual_origin: false,
  factual_origin_independence_proven_count: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const files = [];
files.push(await writeJson('p0b-source-candidate-registry-v1.json', candidateRegistry));
files.push(await writeJson('p0b-mission-candidate-binding-ledger-v1.json', bindingLedger));
files.push(await writeJson('p0b-candidate-gap-register-v1.json', gapRegister));
files.push(await writeJson('p0b-provider-host-diversity-v1.json', diversity));

const manifest = {
  id: 'kidults-asi-p0b-bounded-discovery-manifest-v1',
  version: '1.0.0',
  state: 'SHARED_SOURCE_FABRIC_CONSUMED_SOURCE_CANDIDATES_OBSERVED',
  platform_principles: principles,
  input_bindings: {
    p0_task_queue: { id: p0Queue.id, digest: p0QueueDigest, missions: p0Queue.mission_count, tasks: p0Queue.task_count },
    public_metadata_source_fabric: {
      id: fabric.id || 'UNNAMED_PUBLIC_METADATA_SOURCE_FABRIC',
      digest: sourceFabricDigest,
      raw_candidates: rawCandidates.length,
      successful_live_lane_observations: successfulLaneObservations.length
    },
    contract: { id: contract.id, version: contract.version, digest: sha256Ref(stableJson(contract)) }
  },
  results: {
    bounded_public_metadata_network_discovery_executed: false,
    bounded_public_metadata_network_discovery_executed_by_p0b: false,
    shared_source_fabric_consumed: true,
    provider_requests_issued_by_p0b: 0,
    upstream_successful_live_discovery_lane_observations: successfulLaneObservations.length,
    successful_live_discovery_lane_observations: successfulLaneObservations.length,
    raw_candidate_observations: rawCandidates.length,
    canonical_source_candidates_observed: candidates.length,
    unique_hosts_observed: hostGroups.size,
    discovery_providers_observed: providerSummary.length,
    invalid_endpoint_quarantines: quarantined.length,
    missions_total: missionBindings.length,
    missions_with_candidate: bindingLedger.missions_with_at_least_one_candidate,
    missions_with_primary_and_fallback_candidates: bindingLedger.missions_with_primary_and_fallback_candidates,
    missions_with_three_candidate_hosts: bindingLedger.missions_with_three_candidate_hosts,
    missions_with_exact_region_hint_candidate: bindingLedger.missions_with_exact_region_hint_candidate,
    missions_with_regional_coverage_proven: 0,
    missions_with_factual_origin_independence_proven: 0,
    target_site_bodies_crawled: 0,
    target_content_records_acquired: 0,
    collection_rights_created: 0,
    evidence_admitted: 0,
    market_claims_created: 0
  },
  output_files: files,
  autonomous_effect: 'POSITIVE_P0_TASKS_CONSUME_ONE_SHARED_EXACT_MAIN_SOURCE_FABRIC_WITH_ZERO_DUPLICATE_PROVIDER_REQUESTS',
  global_effect: 'POSITIVE_SHARED_GLOBAL_SOURCE_FABRIC_CONSUMED_AND_MISSION_COVERAGE_GAPS_MEASURED',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_CANONICAL_CANDIDATE_BINDING_GAP_AND_DIVERSITY_ASSETS',
  transparency_effect: 'POSITIVE_EXACT_PRODUCER_LINEAGE_CANDIDATE_HOST_BINDING_AND_UNPROVEN_ORIGIN_BOUNDARIES',
  truth_boundary: 'P0B issued zero provider requests and consumed one exact-main shared Source Fabric. Observed public metadata endpoints are source candidates only. No target body was crawled, no content was acquired, no collection right was created, no evidence was admitted, and no factual-origin independence or market claim was proven.',
  public_release: 'HOLD',
  production: 'HOLD'
};
files.push(await writeJson('p0b-bounded-discovery-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  raw_candidate_observations: manifest.results.raw_candidate_observations,
  canonical_source_candidates_observed: manifest.results.canonical_source_candidates_observed,
  unique_hosts_observed: manifest.results.unique_hosts_observed,
  discovery_providers_observed: manifest.results.discovery_providers_observed,
  missions_with_candidate: manifest.results.missions_with_candidate,
  missions_with_primary_and_fallback_candidates: manifest.results.missions_with_primary_and_fallback_candidates,
  missions_with_three_candidate_hosts: manifest.results.missions_with_three_candidate_hosts,
  missions_with_regional_coverage_proven: 0,
  missions_with_factual_origin_independence_proven: 0,
  output_dir: outputDir,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
