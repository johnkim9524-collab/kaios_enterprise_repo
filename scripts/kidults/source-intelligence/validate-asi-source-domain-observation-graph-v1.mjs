#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const filePath = process.argv[2] || '/tmp/asi-source-domain-observation-graph-v1.json';
const graph = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

if (graph.id !== 'kidults-asi-source-domain-observation-graph-v1' || graph.version !== '1.0.0') fail('IDENTITY');
if (graph.status !== 'SHADOW_SOURCE_DOMAIN_OBSERVATION_GRAPH_COMPLETE') fail('STATUS');
if (graph.universe_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') fail('UNIVERSE');
if (graph.graph_semantics !== 'OBSERVED_ENDPOINT_HOST_PROVIDER_AND_BOUNDED_AUTHORITY_REFERENCE_TOPOLOGY') fail('SEMANTICS');
if (graph.organization_resolution_state !== 'UNRESOLVED_EXCEPT_BOUNDED_AUTHORITY_REFERENCE_CANDIDATES') fail('ORGANIZATION_STATE');
if (graph.cross_domain_organization_merge_authorized !== false || graph.registrable_domain_inference_authorized !== false || graph.legal_owner_inference_authorized !== false || graph.same_organization_claim_authorized !== false) fail('ORGANIZATION_INFERENCE_BOUNDARY');
if (graph.source_candidate_identity_policy !== 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE' || graph.provider_switching_preserves_source_candidate_identity !== true) fail('SOURCE_IDENTITY_POLICY');
if (graph.target_site_body_crawled !== false || graph.content_acquired !== false || graph.rights_promoted !== false || graph.admission_promoted !== false || graph.acquisition_authorized !== false) fail('ACQUISITION_BOUNDARY');
if (graph.production !== 'HOLD' || graph.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('GRAPH_ARRAYS');
if (!graph.rules?.endpoint_or_host_co_observation_does_not_prove_same_organization || !graph.rules?.same_domain_or_subdomain_does_not_prove_legal_ownership || !graph.rules?.authority_reference_candidate_does_not_prove_legal_entity_identity || !graph.rules?.graph_cannot_create_rights_or_admission || !graph.rules?.listing_is_not_sold || !graph.rules?.provider_is_not_source_of_truth) fail('RULES');

const nodeIds = new Set();
const nodes = new Map();
for (const node of graph.nodes) {
  if (!node.node_id || !node.node_type || nodeIds.has(node.node_id)) fail(`NODE_ID:${node.node_id}`);
  nodeIds.add(node.node_id);
  nodes.set(node.node_id, node);
  if (node.node_type === 'SOURCE_CANDIDATE') {
    if (node.provider_switchable_identity !== true) fail(`SOURCE_PROVIDER_SWITCHING:${node.node_id}`);
    if (node.rights_state !== 'UNASSESSED' || node.admission_state !== 'NOT_ADMITTED' || node.source_pool_state !== 'CANDIDATE_ONLY' || node.evidence_state !== 'DISCOVERY_METADATA_ONLY') fail(`SOURCE_PROMOTION:${node.node_id}`);
    if (node.acquisition_authorized !== false || node.public_projection !== false || node.production !== 'HOLD') fail(`SOURCE_BOUNDARY:${node.node_id}`);
    if (!Array.isArray(node.discovery_providers) || node.discovery_providers.length < 1 || new Set(node.discovery_providers).size !== node.discovery_providers.length) fail(`SOURCE_PROVIDERS:${node.node_id}`);
  }
  if (node.node_type === 'SOURCE_ENDPOINT') {
    let parsed;
    try { parsed = new URL(node.canonical_locator); } catch { fail(`ENDPOINT_URL:${node.node_id}`); }
    if (parsed.hostname !== node.hostname || node.organization_identity_effect !== 'NONE' || node.rights_effect !== 'NONE' || node.admission_effect !== 'NONE') fail(`ENDPOINT_BOUNDARY:${node.node_id}`);
  }
  if (node.node_type === 'OBSERVED_HOST') {
    if (!node.hostname || node.registrable_domain_inferred !== false || node.legal_owner_inferred !== false || node.organization_identity_effect !== 'NONE') fail(`HOST_BOUNDARY:${node.node_id}`);
  }
  if (node.node_type === 'DISCOVERY_PROVIDER') {
    if (!node.provider_id || node.provider_is_source_of_truth !== false || node.provider_is_mandatory_bottleneck !== false || node.rights_effect !== 'NONE') fail(`PROVIDER_BOUNDARY:${node.node_id}`);
  }
  if (node.node_type === 'AUTHORITY_IDENTITY_REFERENCE_CANDIDATE') {
    if (node.authority_provider !== 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH' || node.reference_state !== 'OFFICIAL_WEBSITE_ASSERTION_CANDIDATE' || node.legal_entity_identity_verified !== false || node.legal_owner_verified !== false || node.rights_effect !== 'NONE') fail(`AUTHORITY_BOUNDARY:${node.node_id}`);
  }
  if (node.node_type === 'REGISTERED_FRONTIER_SOURCE_REFERENCE') {
    if (node.reference_state !== 'REGISTERED_ENDPOINT_CANDIDATE_NOT_LIVE_VERIFIED' || node.legal_entity_identity_verified !== false || node.legal_owner_verified !== false || node.rights_effect !== 'NONE') fail(`FRONTIER_BOUNDARY:${node.node_id}`);
  }
}

const forbidden = new Set(graph.forbidden_edge_types || []);
for (const required of ['SAME_ORGANIZATION', 'OWNS_DOMAIN', 'LEGAL_OWNER_OF_ENDPOINT', 'RIGHTS_GRANTED_BY_TOPOLOGY']) if (!forbidden.has(required)) fail(`FORBIDDEN_EDGE_NOT_DECLARED:${required}`);
const edgeIds = new Set();
let commonCrawlEdges = 0;
for (const edge of graph.edges) {
  if (!edge.edge_id || !edge.edge_type || edgeIds.has(edge.edge_id)) fail(`EDGE_ID:${edge.edge_id}`);
  edgeIds.add(edge.edge_id);
  if (!nodes.has(edge.from_node_id) || !nodes.has(edge.to_node_id)) fail(`EDGE_ORPHAN:${edge.edge_id}`);
  if (forbidden.has(edge.edge_type)) fail(`FORBIDDEN_EDGE_PRESENT:${edge.edge_type}`);
  if (edge.edge_type === 'COMMON_CRAWL_EXPANDED_FROM_SEED_HOST') {
    const endpoint = nodes.get(edge.from_node_id);
    const seedHost = nodes.get(edge.to_node_id);
    if (endpoint?.node_type !== 'SOURCE_ENDPOINT' || seedHost?.node_type !== 'OBSERVED_HOST') fail(`COMMON_CRAWL_NODE_TYPES:${edge.edge_id}`);
    if (!(endpoint.hostname === seedHost.hostname || endpoint.hostname.endsWith(`.${seedHost.hostname}`))) fail(`COMMON_CRAWL_HOST_ESCAPE:${edge.edge_id}`);
    if (edge.assertion_state !== 'PUBLIC_INDEX_METADATA_OBSERVED' || edge.claim_effect !== 'SAME_HOST_OR_SUBDOMAIN_TOPOLOGY_ONLY' || edge.legal_owner_effect !== 'NONE' || edge.organization_identity_effect !== 'NONE') fail(`COMMON_CRAWL_BOUNDARY:${edge.edge_id}`);
    commonCrawlEdges++;
  }
  if (edge.edge_type === 'OFFICIAL_WEBSITE_ASSERTION_CANDIDATE') {
    if (nodes.get(edge.from_node_id)?.node_type !== 'AUTHORITY_IDENTITY_REFERENCE_CANDIDATE' || nodes.get(edge.to_node_id)?.node_type !== 'SOURCE_ENDPOINT') fail(`AUTHORITY_EDGE_TYPES:${edge.edge_id}`);
    if (edge.claim_effect !== 'AUTHORITY_REFERENCE_CANDIDATE_ONLY' || edge.legal_owner_effect !== 'NONE') fail(`AUTHORITY_EDGE_BOUNDARY:${edge.edge_id}`);
  }
  if (edge.edge_type === 'REGISTERED_FRONTIER_LOCATOR_CANDIDATE') {
    if (nodes.get(edge.from_node_id)?.node_type !== 'REGISTERED_FRONTIER_SOURCE_REFERENCE' || nodes.get(edge.to_node_id)?.node_type !== 'SOURCE_ENDPOINT') fail(`FRONTIER_EDGE_TYPES:${edge.edge_id}`);
    if (edge.claim_effect !== 'SOURCE_REFERENCE_CANDIDATE_ONLY' || edge.legal_owner_effect !== 'NONE') fail(`FRONTIER_EDGE_BOUNDARY:${edge.edge_id}`);
  }
}

const nodeTypeCounts = {};
const edgeTypeCounts = {};
for (const node of graph.nodes) nodeTypeCounts[node.node_type] = (nodeTypeCounts[node.node_type] || 0) + 1;
for (const edge of graph.edges) edgeTypeCounts[edge.edge_type] = (edgeTypeCounts[edge.edge_type] || 0) + 1;
if (JSON.stringify(nodeTypeCounts) !== JSON.stringify(graph.coverage?.node_type_counts || {})) fail('NODE_TYPE_COUNTS');
if (JSON.stringify(edgeTypeCounts) !== JSON.stringify(graph.coverage?.edge_type_counts || {})) fail('EDGE_TYPE_COUNTS');
if (Number(graph.coverage?.source_candidate_nodes) !== Number(graph.input_receipt?.pool_candidate_count)) fail('SOURCE_CANDIDATE_COVERAGE');
if (Number(graph.coverage?.common_crawl_topology_edges) !== commonCrawlEdges) fail('COMMON_CRAWL_EDGE_COUNT');
if (Number(graph.coverage?.endpoint_nodes || 0) < Number(graph.input_receipt?.discovery_candidate_count || 0)) fail('ENDPOINT_COVERAGE');
if (Number(graph.coverage?.provider_nodes || 0) < 1) fail('PROVIDER_COVERAGE');

const expectedDigest = `sha256:${sha(JSON.stringify({ nodes: graph.nodes, edges: graph.edges }))}`;
if (graph.graph_digest !== expectedDigest) fail('GRAPH_DIGEST');

console.log(JSON.stringify({
  status: 'PASS',
  nodes: graph.nodes.length,
  edges: graph.edges.length,
  source_candidates: graph.coverage.source_candidate_nodes,
  endpoints: graph.coverage.endpoint_nodes,
  hosts: graph.coverage.host_nodes,
  providers: graph.coverage.provider_nodes,
  common_crawl_edges: commonCrawlEdges,
  authority_references: graph.coverage.authority_reference_candidates,
  registered_frontier_references: graph.coverage.registered_frontier_reference_candidates,
  production: 'HOLD'
}));
