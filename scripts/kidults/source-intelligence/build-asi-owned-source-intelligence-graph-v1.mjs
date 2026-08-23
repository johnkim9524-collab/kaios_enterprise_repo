#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  missionLedgerPath = '/tmp/p0/mission-consumption-ledger-v1.json',
  candidateIncrementPath = '/tmp/p0/source-candidate-increment-v1.json',
  hostPreflightPath = '/tmp/p1/candidate-host-preflight-ledger-v1.json',
  preflightAssignmentPath = '/tmp/p1/candidate-preflight-assignment-v1.json',
  admissionReadinessPath = '/tmp/p1/candidate-admission-readiness-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-contract-v1.json',
  outputDir = '/tmp/kidults-asi-owned-source-intelligence-graph-v1'
] = process.argv.slice(2);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const nodeId = (type, key) => `node:${type.toLowerCase()}:${crypto.createHash('sha256').update(`${type}::${key}`).digest('hex').slice(0, 32)}`;
const edgeId = (type, from, to, qualifier = '') => `edge:${type.toLowerCase()}:${crypto.createHash('sha256').update(`${type}::${from}::${to}::${qualifier}`).digest('hex').slice(0, 32)}`;
const unique = (values) => [...new Set(values)];

const missionLedger = await readJson(missionLedgerPath);
const candidateIncrement = await readJson(candidateIncrementPath);
const hostPreflight = await readJson(hostPreflightPath);
const preflightAssignments = await readJson(preflightAssignmentPath);
const admissionReadiness = await readJson(admissionReadinessPath);
const contract = await readJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

if (missionLedger.id !== 'kidults-asi-mission-consumption-ledger-v1' || missionLedger.mission_count !== 192) throw new Error('MISSION_LEDGER_INVALID');
if (candidateIncrement.id !== 'kidults-asi-source-candidate-increment-v1' || candidateIncrement.candidate_is_evidence !== false) throw new Error('CANDIDATE_INCREMENT_INVALID');
if (hostPreflight.id !== 'kidults-asi-candidate-host-preflight-ledger-v1') throw new Error('HOST_PREFLIGHT_INVALID');
if (preflightAssignments.id !== 'kidults-asi-candidate-preflight-assignment-v1') throw new Error('PREFLIGHT_ASSIGNMENT_INVALID');
if (admissionReadiness.id !== 'kidults-asi-candidate-admission-readiness-v1' || admissionReadiness.evidence_admitted !== 0) throw new Error('ADMISSION_READINESS_INVALID');
if (contract.id !== 'kidults-asi-owned-source-intelligence-graph-contract-v1' || contract.version !== '1.0.0') throw new Error('GRAPH_CONTRACT_INVALID');
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(principles)) throw new Error('GRAPH_PRINCIPLE_ORDER_INVALID');
if (contract.truth_boundary?.admits_evidence !== false || contract.truth_boundary?.creates_market_event !== false || contract.truth_boundary?.creates_snapshot_candidate !== false) throw new Error('GRAPH_TRUTH_BOUNDARY_INVALID');

await fs.mkdir(outputDir, { recursive: true });

const nodes = new Map();
const edges = new Map();

function addNode(type, key, properties, sourceRefs = []) {
  if (!contract.graph_model.node_types.includes(type)) throw new Error(`NODE_TYPE_NOT_ALLOWED:${type}`);
  const id = nodeId(type, key);
  const value = {
    node_id: id,
    node_type: type,
    canonical_key: key,
    properties,
    source_refs: unique(sourceRefs).sort(),
    kidults_owned_graph_primitive: true,
    market_evidence_node: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
  const existing = nodes.get(id);
  if (existing && stableJson(existing) !== stableJson(value)) throw new Error(`NODE_IDEMPOTENCY_CONFLICT:${id}`);
  nodes.set(id, value);
  return id;
}

function addEdge(type, fromNodeId, toNodeId, properties = {}, sourceRefs = [], qualifier = '') {
  if (!contract.graph_model.edge_types.includes(type)) throw new Error(`EDGE_TYPE_NOT_ALLOWED:${type}`);
  const id = edgeId(type, fromNodeId, toNodeId, qualifier);
  const value = {
    edge_id: id,
    edge_type: type,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    qualifier,
    properties,
    source_refs: unique(sourceRefs).sort(),
    market_evidence_edge: false,
    public_release: 'HOLD',
    production: 'HOLD'
  };
  const existing = edges.get(id);
  if (existing && stableJson(existing) !== stableJson(value)) throw new Error(`EDGE_IDEMPOTENCY_CONFLICT:${id}`);
  edges.set(id, value);
  return id;
}

const scopeNodes = new Map();
const domainNodes = new Map();
const regionNodes = new Map();
const evidenceClassNodes = new Map();
const missionNodes = new Map();
const candidateNodes = new Map();
const hostNodes = new Map();
const laneNodes = new Map();
const originNodes = new Map();
const preflightNodes = new Map();
const readinessNodes = new Map();

for (const entry of missionLedger.entries) {
  if (!scopeNodes.has(entry.scope_id)) {
    scopeNodes.set(entry.scope_id, addNode('SCOPE', entry.scope_id, {
      scope_id: entry.scope_id,
      scope_name: entry.scope_name,
      archetype: entry.archetype
    }, [`mission-ledger:${missionLedger.version}`]));
  }
  if (!domainNodes.has(entry.domain)) {
    domainNodes.set(entry.domain, addNode('DOMAIN', entry.domain, { domain: entry.domain }, [`mission-ledger:${missionLedger.version}`]));
  }
  if (!regionNodes.has(entry.region)) {
    regionNodes.set(entry.region, addNode('REGION', entry.region, { region: entry.region }, [`mission-ledger:${missionLedger.version}`]));
  }
  if (!evidenceClassNodes.has(entry.evidence_class)) {
    evidenceClassNodes.set(entry.evidence_class, addNode('EVIDENCE_CLASS', entry.evidence_class, {
      evidence_class: entry.evidence_class,
      source_candidate_is_evidence: false
    }, [`mission-ledger:${missionLedger.version}`]));
  }
  const missionNode = addNode('MISSION', entry.mission_id, {
    mission_id: entry.mission_id,
    mission_sequence: entry.mission_sequence,
    consumption_state: entry.consumption_state,
    candidate_assignment_count: entry.candidate_assignment_count,
    candidate_slots_filled: entry.candidate_slots_filled,
    blockers: entry.blockers,
    next_action: entry.next_action,
    evidence_admission_state: entry.evidence_admission_state,
    market_claim_authorized: false
  }, [`mission-consumption:${entry.consumption_id}`]);
  missionNodes.set(entry.mission_id, missionNode);
  addEdge('MISSION_IN_SCOPE', missionNode, scopeNodes.get(entry.scope_id), {}, [`mission-consumption:${entry.consumption_id}`]);
  addEdge('MISSION_IN_REGION', missionNode, regionNodes.get(entry.region), {}, [`mission-consumption:${entry.consumption_id}`]);
  addEdge('MISSION_REQUIRES_EVIDENCE_CLASS', missionNode, evidenceClassNodes.get(entry.evidence_class), {
    evidence_admitted: false,
    market_claim_authorized: false
  }, [`mission-consumption:${entry.consumption_id}`]);
  addEdge('SCOPE_IN_DOMAIN', scopeNodes.get(entry.scope_id), domainNodes.get(entry.domain), {}, [`mission-consumption:${entry.consumption_id}`]);
}

for (const candidate of candidateIncrement.candidates) {
  const candidateNode = addNode('SOURCE_CANDIDATE', candidate.candidate_id, {
    candidate_id: candidate.candidate_id,
    canonical_url: candidate.canonical_url,
    canonical_host: candidate.canonical_host,
    scope_id: candidate.scope_id,
    domain: candidate.domain,
    archetype: candidate.archetype,
    evidence_class: candidate.evidence_class,
    discovery_lane_id: candidate.discovery_lane_id,
    discovery_semantics: candidate.discovery_semantics,
    semantic_signal_score: candidate.semantic_signal_score,
    region_match_state: candidate.region_match_state,
    observed_at: candidate.observed_at,
    rights_state: candidate.rights_state,
    admission_state: candidate.admission_state,
    candidate_is_evidence: false,
    candidate_is_sold_record: false,
    candidate_is_liquidity_measure: false
  }, candidate.evidence_refs || []);
  candidateNodes.set(candidate.candidate_id, candidateNode);

  if (!hostNodes.has(candidate.canonical_host)) {
    hostNodes.set(candidate.canonical_host, addNode('CANONICAL_HOST', candidate.canonical_host, {
      canonical_host: candidate.canonical_host,
      host_identity_is_factual_origin_proof: false
    }, candidate.evidence_refs || []));
  }
  if (!laneNodes.has(candidate.discovery_lane_id)) {
    laneNodes.set(candidate.discovery_lane_id, addNode('DISCOVERY_LANE', candidate.discovery_lane_id, {
      discovery_lane_id: candidate.discovery_lane_id,
      discovery_authority: candidate.discovery_authority,
      discovery_semantics: candidate.discovery_semantics,
      rights_created: false,
      admission_created: false
    }, candidate.evidence_refs || []));
  }
  if (!originNodes.has(candidate.factual_origin_candidate_id)) {
    originNodes.set(candidate.factual_origin_candidate_id, addNode('FACTUAL_ORIGIN_CANDIDATE', candidate.factual_origin_candidate_id, {
      factual_origin_candidate_id: candidate.factual_origin_candidate_id,
      factual_origin_state: candidate.factual_origin_state,
      verified_factual_origin: false
    }, candidate.evidence_refs || []));
  }
  addEdge('CANDIDATE_OBSERVED_ON_HOST', candidateNode, hostNodes.get(candidate.canonical_host), {
    canonical_url: candidate.canonical_url
  }, candidate.evidence_refs || []);
  addEdge('CANDIDATE_DISCOVERED_VIA_LANE', candidateNode, laneNodes.get(candidate.discovery_lane_id), {}, candidate.evidence_refs || []);
  addEdge('CANDIDATE_HAS_FACTUAL_ORIGIN_CANDIDATE', candidateNode, originNodes.get(candidate.factual_origin_candidate_id), {
    verified_factual_origin: false
  }, candidate.evidence_refs || []);
}

for (const assignment of candidateIncrement.mission_assignments) {
  const missionNode = missionNodes.get(assignment.mission_id);
  const candidateNode = candidateNodes.get(assignment.candidate_id);
  if (!missionNode || !candidateNode) throw new Error(`MISSION_CANDIDATE_LINK_MISSING:${assignment.mission_candidate_id}`);
  addEdge('MISSION_HAS_SOURCE_CANDIDATE', missionNode, candidateNode, {
    mission_candidate_id: assignment.mission_candidate_id,
    mission_region: assignment.mission_region,
    region_match_state: assignment.region_match_state,
    candidate_is_evidence: false
  }, assignment.evidence_refs || [], assignment.mission_candidate_id);
}

for (const entry of hostPreflight.entries) {
  const hostNode = hostNodes.get(entry.canonical_host);
  if (!hostNode) continue;
  const preflightNode = addNode('HOST_PREFLIGHT', entry.preflight_id, {
    preflight_id: entry.preflight_id,
    canonical_host: entry.canonical_host,
    preflight_state: entry.preflight_state,
    identity_state: entry.identity.state,
    technical_state: entry.technical.state,
    rights_state: entry.rights.state,
    observed_at: entry.observed_at,
    robots_disallow_all: entry.robots.disallow_all,
    terms_link_count: entry.root_metadata.terms_link_count,
    api_link_count: entry.root_metadata.api_link_count,
    market_records_collected: false,
    evidence_admitted: false
  }, [
    `host-preflight:${entry.preflight_id}`,
    entry.request_evidence.head.request_url_digest,
    entry.request_evidence.root.request_url_digest,
    entry.request_evidence.robots.request_url_digest
  ]);
  preflightNodes.set(entry.preflight_id, preflightNode);
  addEdge('HOST_HAS_PREFLIGHT', hostNode, preflightNode, {
    preflight_is_admission: false
  }, [`host-preflight:${entry.preflight_id}`]);
}

for (const readinessState of Object.keys(admissionReadiness.readiness_counts).sort()) {
  readinessNodes.set(readinessState, addNode('ADMISSION_READINESS_STATE', readinessState, {
    readiness_state: readinessState,
    admission_created: false
  }, [`admission-readiness:${admissionReadiness.version}`]));
}

for (const assignment of preflightAssignments.assignments) {
  const candidateNode = candidateNodes.get(assignment.candidate_id);
  if (!candidateNode) throw new Error(`PREFLIGHT_CANDIDATE_MISSING:${assignment.candidate_id}`);
  if (assignment.preflight_id !== null) {
    const preflightNode = preflightNodes.get(assignment.preflight_id);
    if (!preflightNode) throw new Error(`PREFLIGHT_NODE_MISSING:${assignment.preflight_id}`);
    addEdge('CANDIDATE_ASSIGNED_PREFLIGHT', candidateNode, preflightNode, {
      preflight_state: assignment.preflight_state,
      semantic_score: assignment.semantic_score,
      rights_state: assignment.rights_state,
      evidence_admitted: false
    }, [`candidate-preflight-assignment:${assignment.assignment_id}`]);
  }
  const readinessNode = readinessNodes.get(assignment.admission_readiness_state);
  if (!readinessNode) throw new Error(`READINESS_NODE_MISSING:${assignment.admission_readiness_state}`);
  addEdge('CANDIDATE_HAS_ADMISSION_READINESS', candidateNode, readinessNode, {
    preflight_state: assignment.preflight_state,
    admission_created: false
  }, [`candidate-preflight-assignment:${assignment.assignment_id}`]);
}

const sortedNodes = [...nodes.values()].sort((a, b) => a.node_type.localeCompare(b.node_type) || a.canonical_key.localeCompare(b.canonical_key));
const sortedEdges = [...edges.values()].sort((a, b) => a.edge_type.localeCompare(b.edge_type) || a.from_node_id.localeCompare(b.from_node_id) || a.to_node_id.localeCompare(b.to_node_id) || a.qualifier.localeCompare(b.qualifier));
const nodeIds = new Set(sortedNodes.map((node) => node.node_id));
if (sortedEdges.some((edge) => !nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id))) throw new Error('EDGE_NODE_REFERENCE_INVALID');

const asOfCandidates = [hostPreflight.cycle_completed_at, hostPreflight.cycle_started_at, ...hostPreflight.entries.map((entry) => entry.observed_at)]
  .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
  .sort();
const asOf = asOfCandidates.at(-1) || candidateIncrement.candidates.map((candidate) => candidate.observed_at).filter(Boolean).sort().at(-1) || '1970-01-01T00:00:00.000Z';

const graph = {
  id: 'kidults-owned-source-intelligence-graph-v1',
  version: '1.0.0',
  state: 'KIDULTS_OWNED_SOURCE_INTELLIGENCE_GRAPH_BUILT',
  as_of: asOf,
  platform_principles: principles,
  node_count: sortedNodes.length,
  edge_count: sortedEdges.length,
  nodes: sortedNodes,
  edges: sortedEdges,
  market_evidence_nodes: 0,
  market_evidence_edges: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};
const graphDigest = sha256(stableJson(graph));

const lineage = {
  id: 'kidults-owned-source-intelligence-lineage-v1',
  version: '1.0.0',
  state: 'IMMUTABLE_INPUT_AND_OUTPUT_DIGESTS_BOUND',
  as_of: asOf,
  inputs: [
    { id: missionLedger.id, version: missionLedger.version, digest: sha256(stableJson(missionLedger)) },
    { id: candidateIncrement.id, version: candidateIncrement.version, digest: sha256(stableJson(candidateIncrement)) },
    { id: hostPreflight.id, version: hostPreflight.version, digest: sha256(stableJson(hostPreflight)) },
    { id: preflightAssignments.id, version: preflightAssignments.version, digest: sha256(stableJson(preflightAssignments)) },
    { id: admissionReadiness.id, version: admissionReadiness.version, digest: sha256(stableJson(admissionReadiness)) },
    { id: contract.id, version: contract.version, digest: sha256(stableJson(contract)) }
  ],
  graph: {
    id: graph.id,
    version: graph.version,
    digest: graphDigest,
    node_count: graph.node_count,
    edge_count: graph.edge_count
  },
  transformations: [
    'CANONICAL_NODE_ID_DERIVATION',
    'CANONICAL_EDGE_ID_DERIVATION',
    'SOURCE_CANDIDATE_HOST_LANE_ORIGIN_BINDING',
    'MISSION_CANDIDATE_BINDING',
    'HOST_PREFLIGHT_BINDING',
    'CANDIDATE_READINESS_BINDING'
  ],
  public_release: 'HOLD',
  production: 'HOLD'
};

const incoming = new Map(sortedNodes.map((node) => [node.node_id, 0]));
const outgoing = new Map(sortedNodes.map((node) => [node.node_id, 0]));
for (const edge of sortedEdges) {
  incoming.set(edge.to_node_id, incoming.get(edge.to_node_id) + 1);
  outgoing.set(edge.from_node_id, outgoing.get(edge.from_node_id) + 1);
}
const orphanMissionNodes = sortedNodes.filter((node) => node.node_type === 'MISSION' && outgoing.get(node.node_id) < 3);
const orphanCandidateNodes = sortedNodes.filter((node) => node.node_type === 'SOURCE_CANDIDATE' && outgoing.get(node.node_id) < 4);
const quality = {
  id: 'kidults-owned-source-intelligence-quality-v1',
  version: '1.0.0',
  state: orphanMissionNodes.length === 0 && orphanCandidateNodes.length === 0 ? 'VERIFIED_GRAPH_INTEGRITY_READY' : 'GRAPH_INTEGRITY_FAIL',
  as_of: asOf,
  node_type_counts: Object.fromEntries(contract.graph_model.node_types.map((type) => [type, sortedNodes.filter((node) => node.node_type === type).length])),
  edge_type_counts: Object.fromEntries(contract.graph_model.edge_types.map((type) => [type, sortedEdges.filter((edge) => edge.edge_type === type).length])),
  duplicate_node_ids: sortedNodes.length - new Set(sortedNodes.map((node) => node.node_id)).size,
  duplicate_edge_ids: sortedEdges.length - new Set(sortedEdges.map((edge) => edge.edge_id)).size,
  invalid_edge_node_references: sortedEdges.filter((edge) => !nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id)).length,
  orphan_mission_nodes: orphanMissionNodes.map((node) => node.node_id),
  orphan_source_candidate_nodes: orphanCandidateNodes.map((node) => node.node_id),
  candidates_without_completed_preflight: preflightAssignments.waiting_for_host_preflight,
  forbidden_node_type_count: sortedNodes.filter((node) => contract.forbidden_node_types.includes(node.node_type)).length,
  forbidden_edge_type_count: sortedEdges.filter((edge) => contract.forbidden_edge_types.includes(edge.edge_type)).length,
  evidence_admitted: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
};

const valueReceipt = {
  id: 'kidults-owned-source-intelligence-value-receipt-v1',
  version: '1.0.0',
  state: 'KIDULTS_OWNED_VALUE_INCREMENT_VERIFIED',
  as_of: asOf,
  graph_digest: graphDigest,
  owned_value_assets: contract.owned_value_assets,
  mission_nodes: missionNodes.size,
  scope_nodes: scopeNodes.size,
  domain_nodes: domainNodes.size,
  region_nodes: regionNodes.size,
  evidence_class_nodes: evidenceClassNodes.size,
  source_candidate_nodes: candidateNodes.size,
  canonical_host_nodes: hostNodes.size,
  discovery_lane_nodes: laneNodes.size,
  factual_origin_candidate_nodes: originNodes.size,
  host_preflight_nodes: preflightNodes.size,
  readiness_state_nodes: readinessNodes.size,
  mission_candidate_edges: sortedEdges.filter((edge) => edge.edge_type === 'MISSION_HAS_SOURCE_CANDIDATE').length,
  host_preflight_edges: sortedEdges.filter((edge) => edge.edge_type === 'HOST_HAS_PREFLIGHT').length,
  candidate_readiness_edges: sortedEdges.filter((edge) => edge.edge_type === 'CANDIDATE_HAS_ADMISSION_READINESS').length,
  provider_switching_primitives_created: originNodes.size + laneNodes.size + hostNodes.size,
  external_raw_data_is_owned_moat: false,
  source_intelligence_graph_is_market_evidence_graph: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

async function writeJson(name, value) {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256(content), bytes: Buffer.byteLength(content) };
}

const files = [];
files.push(await writeJson('owned-source-intelligence-graph-v1.json', graph));
files.push(await writeJson('owned-source-intelligence-lineage-v1.json', lineage));
files.push(await writeJson('owned-source-intelligence-quality-v1.json', quality));
files.push(await writeJson('owned-source-intelligence-value-receipt-v1.json', valueReceipt));

const manifest = {
  id: 'kidults-owned-source-intelligence-manifest-v1',
  version: '1.0.0',
  state: quality.state === 'VERIFIED_GRAPH_INTEGRITY_READY' ? 'P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED' : 'P2_GRAPH_INTEGRITY_FAIL',
  as_of: asOf,
  platform_principles: principles,
  graph_digest: graphDigest,
  results: {
    nodes: graph.node_count,
    edges: graph.edge_count,
    missions: missionNodes.size,
    source_candidates: candidateNodes.size,
    canonical_hosts: hostNodes.size,
    discovery_lanes: laneNodes.size,
    factual_origin_candidates: originNodes.size,
    completed_host_preflights: preflightNodes.size,
    candidates_waiting_for_preflight: preflightAssignments.waiting_for_host_preflight,
    mission_candidate_edges: valueReceipt.mission_candidate_edges,
    candidate_readiness_edges: valueReceipt.candidate_readiness_edges,
    forbidden_nodes: quality.forbidden_node_type_count,
    forbidden_edges: quality.forbidden_edge_type_count,
    evidence_admitted: 0,
    market_events_created: 0,
    snapshot_candidates_created: 0,
    market_claims_created: 0
  },
  output_files: files,
  autonomous_effect: 'POSITIVE_P0_AND_P1_ARTIFACTS_AUTOMATICALLY_COMPILED_INTO_A_CANONICAL_GRAPH',
  global_effect: 'POSITIVE_ALL_MISSION_SCOPE_REGION_AND_EVIDENCE_DIMENSIONS_PRESERVED',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_IDENTITY_LINEAGE_REPLACEABILITY_PREFLIGHT_AND_READINESS_GRAPH_CREATED',
  transparency_effect: 'POSITIVE_IMMUTABLE_INPUT_OUTPUT_DIGESTS_NODE_EDGE_LINEAGE_AND_TRUTH_BOUNDARIES_PRESERVED',
  public_release: 'HOLD',
  production: 'HOLD'
};
files.push(await writeJson('owned-source-intelligence-manifest-v1.json', manifest));

console.log(JSON.stringify({
  state: manifest.state,
  graph_digest: graphDigest,
  nodes: manifest.results.nodes,
  edges: manifest.results.edges,
  missions: manifest.results.missions,
  source_candidates: manifest.results.source_candidates,
  canonical_hosts: manifest.results.canonical_hosts,
  completed_host_preflights: manifest.results.completed_host_preflights,
  candidates_waiting_for_preflight: manifest.results.candidates_waiting_for_preflight,
  mission_candidate_edges: manifest.results.mission_candidate_edges,
  candidate_readiness_edges: manifest.results.candidate_readiness_edges,
  evidence_admitted: 0,
  market_events_created: 0,
  snapshot_candidates_created: 0,
  output_dir: outputDir
}, null, 2));
