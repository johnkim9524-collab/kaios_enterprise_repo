#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  outputDir = '/tmp/kidults-asi-owned-source-intelligence-graph-v1',
  missionLedgerPath = '/tmp/p0/mission-consumption-ledger-v1.json',
  candidateIncrementPath = '/tmp/p0/source-candidate-increment-v1.json',
  hostPreflightPath = '/tmp/p1/candidate-host-preflight-ledger-v1.json',
  preflightAssignmentPath = '/tmp/p1/candidate-preflight-assignment-v1.json',
  admissionReadinessPath = '/tmp/p1/candidate-admission-readiness-v1.json',
  contractPath = 'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-contract-v1.json'
] = process.argv.slice(2);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readFileJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readOutputText = (name) => fs.readFileSync(path.join(outputDir, name), 'utf8');
const readOutputJson = (name) => JSON.parse(readOutputText(name));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const unique = (values) => new Set(values).size === values.length;
const countBy = (values, key) => values.filter((value) => value === key).length;

const missionLedger = readFileJson(missionLedgerPath);
const candidateIncrement = readFileJson(candidateIncrementPath);
const hostPreflight = readFileJson(hostPreflightPath);
const preflightAssignments = readFileJson(preflightAssignmentPath);
const admissionReadiness = readFileJson(admissionReadinessPath);
const contract = readFileJson(contractPath);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-owned-source-intelligence-graph-contract-v1', 'CONTRACT_ID');
assert(contract.version === '1.0.0', 'CONTRACT_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(contract.owner === 'KPMO' && contract.priority === 'P2', 'CONTRACT_OWNER_PRIORITY');
assert(JSON.stringify(contract.platform_principles) === JSON.stringify(principles), 'CONTRACT_PRINCIPLE_ORDER');
assert(contract.graph_model?.node_types?.length === 11, 'CONTRACT_NODE_TYPE_COUNT');
assert(contract.graph_model?.edge_types?.length === 11, 'CONTRACT_EDGE_TYPE_COUNT');
assert(unique(contract.graph_model.node_types), 'CONTRACT_NODE_TYPE_DUPLICATE');
assert(unique(contract.graph_model.edge_types), 'CONTRACT_EDGE_TYPE_DUPLICATE');
assert(contract.graph_model.node_ids_deterministic === true && contract.graph_model.edge_ids_deterministic === true, 'CONTRACT_DETERMINISM');
assert(contract.graph_model.duplicate_nodes_allowed === false && contract.graph_model.duplicate_edges_allowed === false, 'CONTRACT_DUPLICATE_BOUNDARY');
assert(contract.graph_model.orphan_candidate_allowed === false && contract.graph_model.orphan_mission_allowed === false, 'CONTRACT_ORPHAN_BOUNDARY');
assert(contract.forbidden_node_types?.length >= 6 && contract.forbidden_edge_types?.length >= 6, 'CONTRACT_FORBIDDEN_TYPES');
assert(contract.required_outputs?.length === 5, 'CONTRACT_OUTPUT_COUNT');
assert(contract.truth_boundary?.creates_kidults_owned_source_intelligence === true, 'CONTRACT_OWNED_VALUE');
for (const [key, expected] of Object.entries({
  creates_market_event: false,
  creates_transaction: false,
  creates_price_observation: false,
  creates_liquidity_measure: false,
  admits_evidence: false,
  creates_snapshot_candidate: false,
  creates_market_claim: false,
  public_release: 'HOLD',
  production: 'HOLD'
})) assert(contract.truth_boundary?.[key] === expected, `CONTRACT_TRUTH_BOUNDARY:${key}`);

assert(missionLedger.id === 'kidults-asi-mission-consumption-ledger-v1' && missionLedger.entries?.length === 192, 'MISSION_LEDGER_INVALID');
assert(candidateIncrement.id === 'kidults-asi-source-candidate-increment-v1' && candidateIncrement.candidate_is_evidence === false, 'CANDIDATE_INCREMENT_INVALID');
assert(hostPreflight.id === 'kidults-asi-candidate-host-preflight-ledger-v1', 'HOST_PREFLIGHT_INVALID');
assert(preflightAssignments.id === 'kidults-asi-candidate-preflight-assignment-v1', 'PREFLIGHT_ASSIGNMENT_INVALID');
assert(admissionReadiness.id === 'kidults-asi-candidate-admission-readiness-v1' && admissionReadiness.evidence_admitted === 0, 'ADMISSION_READINESS_INVALID');
assert(preflightAssignments.candidate_count === candidateIncrement.candidates.length, 'PREFLIGHT_CANDIDATE_COUNT_MISMATCH');

for (const output of contract.required_outputs) {
  assert(fs.existsSync(path.join(outputDir, output)), `MISSING_OUTPUT:${output}`);
  JSON.parse(readOutputText(output));
}

const graph = readOutputJson('owned-source-intelligence-graph-v1.json');
const lineage = readOutputJson('owned-source-intelligence-lineage-v1.json');
const quality = readOutputJson('owned-source-intelligence-quality-v1.json');
const value = readOutputJson('owned-source-intelligence-value-receipt-v1.json');
const manifest = readOutputJson('owned-source-intelligence-manifest-v1.json');

assert(graph.id === 'kidults-owned-source-intelligence-graph-v1', 'GRAPH_ID');
assert(graph.version === '1.0.0' && graph.state === 'KIDULTS_OWNED_SOURCE_INTELLIGENCE_GRAPH_BUILT', 'GRAPH_METADATA');
assert(JSON.stringify(graph.platform_principles) === JSON.stringify(principles), 'GRAPH_PRINCIPLE_ORDER');
assert(Array.isArray(graph.nodes) && graph.node_count === graph.nodes.length && graph.node_count > 0, 'GRAPH_NODE_COUNT');
assert(Array.isArray(graph.edges) && graph.edge_count === graph.edges.length && graph.edge_count > 0, 'GRAPH_EDGE_COUNT');
assert(unique(graph.nodes.map((node) => node.node_id)), 'GRAPH_NODE_ID_DUPLICATE');
assert(unique(graph.edges.map((edge) => edge.edge_id)), 'GRAPH_EDGE_ID_DUPLICATE');
const nodeIds = new Set(graph.nodes.map((node) => node.node_id));
const nodeTypes = new Set(contract.graph_model.node_types);
const edgeTypes = new Set(contract.graph_model.edge_types);
for (const node of graph.nodes) {
  assert(nodeTypes.has(node.node_type), `GRAPH_NODE_TYPE:${node.node_id}`);
  assert(typeof node.node_id === 'string' && node.node_id.startsWith(`node:${node.node_type.toLowerCase()}:`), `GRAPH_NODE_ID_FORMAT:${node.node_id}`);
  assert(typeof node.canonical_key === 'string' && node.canonical_key.length > 0, `GRAPH_NODE_KEY:${node.node_id}`);
  assert(node.kidults_owned_graph_primitive === true && node.market_evidence_node === false, `GRAPH_NODE_BOUNDARY:${node.node_id}`);
  assert(Array.isArray(node.source_refs), `GRAPH_NODE_SOURCE_REFS:${node.node_id}`);
  assert(node.public_release === 'HOLD' && node.production === 'HOLD', `GRAPH_NODE_RELEASE:${node.node_id}`);
  assert(!contract.forbidden_node_types.includes(node.node_type), `GRAPH_FORBIDDEN_NODE:${node.node_id}`);
  if (node.node_type === 'SOURCE_CANDIDATE') {
    assert(node.properties?.candidate_is_evidence === false, `GRAPH_CANDIDATE_EVIDENCE:${node.node_id}`);
    assert(node.properties?.candidate_is_sold_record === false, `GRAPH_CANDIDATE_SOLD:${node.node_id}`);
    assert(node.properties?.candidate_is_liquidity_measure === false, `GRAPH_CANDIDATE_LIQUIDITY:${node.node_id}`);
    assert(node.properties?.admission_state === 'NOT_ADMITTED', `GRAPH_CANDIDATE_ADMISSION:${node.node_id}`);
  }
  if (node.node_type === 'CANONICAL_HOST') assert(node.properties?.host_identity_is_factual_origin_proof === false, `GRAPH_HOST_ORIGIN_PROOF:${node.node_id}`);
  if (node.node_type === 'FACTUAL_ORIGIN_CANDIDATE') assert(node.properties?.verified_factual_origin === false, `GRAPH_ORIGIN_VERIFIED:${node.node_id}`);
  if (node.node_type === 'HOST_PREFLIGHT') {
    assert(node.properties?.market_records_collected === false && node.properties?.evidence_admitted === false, `GRAPH_PREFLIGHT_PROMOTION:${node.node_id}`);
  }
  if (node.node_type === 'ADMISSION_READINESS_STATE') assert(node.properties?.admission_created === false, `GRAPH_READINESS_ADMISSION:${node.node_id}`);
}
for (const edge of graph.edges) {
  assert(edgeTypes.has(edge.edge_type), `GRAPH_EDGE_TYPE:${edge.edge_id}`);
  assert(typeof edge.edge_id === 'string' && edge.edge_id.startsWith(`edge:${edge.edge_type.toLowerCase()}:`), `GRAPH_EDGE_ID_FORMAT:${edge.edge_id}`);
  assert(nodeIds.has(edge.from_node_id) && nodeIds.has(edge.to_node_id), `GRAPH_EDGE_REFERENCE:${edge.edge_id}`);
  assert(edge.market_evidence_edge === false, `GRAPH_EDGE_EVIDENCE:${edge.edge_id}`);
  assert(Array.isArray(edge.source_refs), `GRAPH_EDGE_SOURCE_REFS:${edge.edge_id}`);
  assert(edge.public_release === 'HOLD' && edge.production === 'HOLD', `GRAPH_EDGE_RELEASE:${edge.edge_id}`);
  assert(!contract.forbidden_edge_types.includes(edge.edge_type), `GRAPH_FORBIDDEN_EDGE:${edge.edge_id}`);
  if (edge.edge_type === 'MISSION_HAS_SOURCE_CANDIDATE') assert(edge.properties?.candidate_is_evidence === false, `GRAPH_MISSION_CANDIDATE_EVIDENCE:${edge.edge_id}`);
  if (edge.edge_type === 'HOST_HAS_PREFLIGHT') assert(edge.properties?.preflight_is_admission === false, `GRAPH_PREFLIGHT_ADMISSION:${edge.edge_id}`);
  if (edge.edge_type === 'CANDIDATE_ASSIGNED_PREFLIGHT') assert(edge.properties?.evidence_admitted === false, `GRAPH_ASSIGNMENT_ADMISSION:${edge.edge_id}`);
  if (edge.edge_type === 'CANDIDATE_HAS_ADMISSION_READINESS') assert(edge.properties?.admission_created === false, `GRAPH_READINESS_EDGE_ADMISSION:${edge.edge_id}`);
}
assert(graph.market_evidence_nodes === 0 && graph.market_evidence_edges === 0, 'GRAPH_MARKET_EVIDENCE_OVERCLAIM');
assert(graph.evidence_admitted === 0 && graph.market_claims_created === 0, 'GRAPH_PROMOTION_OVERCLAIM');
assert(graph.public_release === 'HOLD' && graph.production === 'HOLD', 'GRAPH_RELEASE_BOUNDARY');

const expected = {
  MISSION: missionLedger.entries.length,
  SCOPE: new Set(missionLedger.entries.map((entry) => entry.scope_id)).size,
  DOMAIN: new Set(missionLedger.entries.map((entry) => entry.domain)).size,
  REGION: new Set(missionLedger.entries.map((entry) => entry.region)).size,
  EVIDENCE_CLASS: new Set(missionLedger.entries.map((entry) => entry.evidence_class)).size,
  SOURCE_CANDIDATE: candidateIncrement.candidates.length,
  CANONICAL_HOST: new Set(candidateIncrement.candidates.map((candidate) => candidate.canonical_host)).size,
  DISCOVERY_LANE: new Set(candidateIncrement.candidates.map((candidate) => candidate.discovery_lane_id)).size,
  FACTUAL_ORIGIN_CANDIDATE: new Set(candidateIncrement.candidates.map((candidate) => candidate.factual_origin_candidate_id)).size,
  HOST_PREFLIGHT: hostPreflight.entries.length,
  ADMISSION_READINESS_STATE: Object.keys(admissionReadiness.readiness_counts).length
};
for (const [type, count] of Object.entries(expected)) {
  assert(countBy(graph.nodes.map((node) => node.node_type), type) === count, `GRAPH_NODE_CARDINALITY:${type}`);
}

const expectedEdges = {
  MISSION_IN_SCOPE: missionLedger.entries.length,
  MISSION_IN_REGION: missionLedger.entries.length,
  MISSION_REQUIRES_EVIDENCE_CLASS: missionLedger.entries.length,
  SCOPE_IN_DOMAIN: expected.SCOPE,
  MISSION_HAS_SOURCE_CANDIDATE: candidateIncrement.mission_assignments.length,
  CANDIDATE_OBSERVED_ON_HOST: candidateIncrement.candidates.length,
  CANDIDATE_DISCOVERED_VIA_LANE: candidateIncrement.candidates.length,
  CANDIDATE_HAS_FACTUAL_ORIGIN_CANDIDATE: candidateIncrement.candidates.length,
  HOST_HAS_PREFLIGHT: hostPreflight.entries.filter((entry) => new Set(candidateIncrement.candidates.map((candidate) => candidate.canonical_host)).has(entry.canonical_host)).length,
  CANDIDATE_ASSIGNED_PREFLIGHT: preflightAssignments.assigned_to_completed_host_preflight,
  CANDIDATE_HAS_ADMISSION_READINESS: preflightAssignments.assignments.length
};
for (const [type, count] of Object.entries(expectedEdges)) {
  assert(countBy(graph.edges.map((edge) => edge.edge_type), type) === count, `GRAPH_EDGE_CARDINALITY:${type}`);
}

const outgoing = new Map(graph.nodes.map((node) => [node.node_id, 0]));
for (const edge of graph.edges) outgoing.set(edge.from_node_id, outgoing.get(edge.from_node_id) + 1);
assert(graph.nodes.filter((node) => node.node_type === 'MISSION').every((node) => outgoing.get(node.node_id) >= 3), 'GRAPH_ORPHAN_MISSION');
assert(graph.nodes.filter((node) => node.node_type === 'SOURCE_CANDIDATE').every((node) => outgoing.get(node.node_id) >= 4), 'GRAPH_ORPHAN_CANDIDATE');

assert(lineage.id === 'kidults-owned-source-intelligence-lineage-v1', 'LINEAGE_ID');
assert(lineage.state === 'IMMUTABLE_INPUT_AND_OUTPUT_DIGESTS_BOUND', 'LINEAGE_STATE');
assert(lineage.inputs?.length === 6, 'LINEAGE_INPUT_COUNT');
assert(unique(lineage.inputs.map((item) => item.id)), 'LINEAGE_INPUT_DUPLICATE');
for (const input of lineage.inputs) assert(/^sha256:[a-f0-9]{64}$/.test(input.digest), `LINEAGE_INPUT_DIGEST:${input.id}`);
assert(lineage.graph?.id === graph.id && lineage.graph?.node_count === graph.node_count && lineage.graph?.edge_count === graph.edge_count, 'LINEAGE_GRAPH_BINDING');
assert(lineage.graph?.digest === digest(stableJson(graph)), 'LINEAGE_GRAPH_DIGEST');
assert(lineage.transformations?.includes('MERGED_SOURCE_REFERENCE_LINEAGE'), 'LINEAGE_MERGED_REFS');
assert(lineage.public_release === 'HOLD' && lineage.production === 'HOLD', 'LINEAGE_RELEASE_BOUNDARY');

assert(quality.id === 'kidults-owned-source-intelligence-quality-v1', 'QUALITY_ID');
assert(quality.state === 'VERIFIED_GRAPH_INTEGRITY_READY', 'QUALITY_STATE');
assert(JSON.stringify(quality.node_type_counts) === JSON.stringify(Object.fromEntries(contract.graph_model.node_types.map((type) => [type, expected[type]]))), 'QUALITY_NODE_COUNTS');
assert(JSON.stringify(quality.edge_type_counts) === JSON.stringify(Object.fromEntries(contract.graph_model.edge_types.map((type) => [type, expectedEdges[type]]))), 'QUALITY_EDGE_COUNTS');
assert(quality.duplicate_node_ids === 0 && quality.duplicate_edge_ids === 0 && quality.invalid_edge_node_references === 0, 'QUALITY_GRAPH_INTEGRITY');
assert(quality.orphan_mission_nodes?.length === 0 && quality.orphan_source_candidate_nodes?.length === 0, 'QUALITY_ORPHANS');
assert(quality.candidates_without_completed_preflight === preflightAssignments.waiting_for_host_preflight, 'QUALITY_WAITING_COUNT');
assert(quality.forbidden_node_type_count === 0 && quality.forbidden_edge_type_count === 0, 'QUALITY_FORBIDDEN_TYPES');
assert(quality.evidence_admitted === 0 && quality.market_claims_created === 0, 'QUALITY_PROMOTION_OVERCLAIM');

assert(value.id === 'kidults-owned-source-intelligence-value-receipt-v1', 'VALUE_ID');
assert(value.state === 'KIDULTS_OWNED_VALUE_INCREMENT_VERIFIED', 'VALUE_STATE');
assert(value.graph_digest === lineage.graph.digest, 'VALUE_GRAPH_DIGEST');
assert(JSON.stringify(value.owned_value_assets) === JSON.stringify(contract.owned_value_assets), 'VALUE_ASSET_SET');
assert(value.mission_nodes === expected.MISSION && value.scope_nodes === expected.SCOPE && value.domain_nodes === expected.DOMAIN, 'VALUE_MISSION_SCOPE_DOMAIN');
assert(value.region_nodes === expected.REGION && value.evidence_class_nodes === expected.EVIDENCE_CLASS, 'VALUE_REGION_EVIDENCE');
assert(value.source_candidate_nodes === expected.SOURCE_CANDIDATE && value.canonical_host_nodes === expected.CANONICAL_HOST, 'VALUE_CANDIDATE_HOST');
assert(value.discovery_lane_nodes === expected.DISCOVERY_LANE && value.factual_origin_candidate_nodes === expected.FACTUAL_ORIGIN_CANDIDATE, 'VALUE_LANE_ORIGIN');
assert(value.host_preflight_nodes === expected.HOST_PREFLIGHT && value.readiness_state_nodes === expected.ADMISSION_READINESS_STATE, 'VALUE_PREFLIGHT_READINESS');
assert(value.mission_candidate_edges === expectedEdges.MISSION_HAS_SOURCE_CANDIDATE, 'VALUE_MISSION_CANDIDATE_EDGES');
assert(value.host_preflight_edges === expectedEdges.HOST_HAS_PREFLIGHT && value.candidate_readiness_edges === expectedEdges.CANDIDATE_HAS_ADMISSION_READINESS, 'VALUE_PREFLIGHT_READINESS_EDGES');
assert(value.provider_switching_primitives_created === expected.CANONICAL_HOST + expected.DISCOVERY_LANE + expected.FACTUAL_ORIGIN_CANDIDATE, 'VALUE_SWITCHING_PRIMITIVES');
assert(value.external_raw_data_is_owned_moat === false && value.source_intelligence_graph_is_market_evidence_graph === false, 'VALUE_BOUNDARY');

assert(manifest.id === 'kidults-owned-source-intelligence-manifest-v1', 'MANIFEST_ID');
assert(manifest.state === 'P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED', 'MANIFEST_STATE');
assert(JSON.stringify(manifest.platform_principles) === JSON.stringify(principles), 'MANIFEST_PRINCIPLE_ORDER');
assert(manifest.graph_digest === lineage.graph.digest, 'MANIFEST_GRAPH_DIGEST');
assert(manifest.results?.nodes === graph.node_count && manifest.results?.edges === graph.edge_count, 'MANIFEST_GRAPH_COUNTS');
assert(manifest.results?.missions === expected.MISSION && manifest.results?.source_candidates === expected.SOURCE_CANDIDATE, 'MANIFEST_CORE_COUNTS');
assert(manifest.results?.canonical_hosts === expected.CANONICAL_HOST && manifest.results?.completed_host_preflights === expected.HOST_PREFLIGHT, 'MANIFEST_HOST_COUNTS');
assert(manifest.results?.candidates_waiting_for_preflight === preflightAssignments.waiting_for_host_preflight, 'MANIFEST_WAITING');
assert(manifest.results?.forbidden_nodes === 0 && manifest.results?.forbidden_edges === 0, 'MANIFEST_FORBIDDEN');
assert(manifest.results?.evidence_admitted === 0 && manifest.results?.market_events_created === 0 && manifest.results?.snapshot_candidates_created === 0 && manifest.results?.market_claims_created === 0, 'MANIFEST_PROMOTION_OVERCLAIM');
assert(manifest.output_files?.length === 4, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of manifest.output_files) {
  const content = readOutputText(output.name);
  assert(output.sha256 === digest(content), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
  assert(output.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_BYTES:${output.name}`);
}
assert(manifest.public_release === 'HOLD' && manifest.production === 'HOLD', 'MANIFEST_RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id: 'kidults-asi-owned-source-intelligence-graph-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  graph_digest: manifest.graph_digest,
  nodes: graph.node_count,
  edges: graph.edge_count,
  node_type_counts: quality.node_type_counts,
  edge_type_counts: quality.edge_type_counts,
  mission_nodes: value.mission_nodes,
  source_candidate_nodes: value.source_candidate_nodes,
  canonical_host_nodes: value.canonical_host_nodes,
  host_preflight_nodes: value.host_preflight_nodes,
  candidates_waiting_for_preflight: quality.candidates_without_completed_preflight,
  provider_switching_primitives: value.provider_switching_primitives_created,
  duplicate_nodes: 0,
  duplicate_edges: 0,
  orphan_missions: 0,
  orphan_candidates: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  snapshot_candidates_created: 0,
  market_claims_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
