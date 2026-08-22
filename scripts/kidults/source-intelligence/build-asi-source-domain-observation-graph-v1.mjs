#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const discoveryPath = process.argv[2] || 'discovery-out/global-low-risk-discovery.json';
const poolPath = process.argv[3] || '/tmp/asi-proactive-source-pool-v1.json';
const outPath = process.argv[4] || '/tmp/asi-source-domain-observation-graph-v1.json';

const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
const fail = message => { throw new Error(message); };
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))].sort();
const normalizeUrl = value => {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) fail('UNSUPPORTED_URL_PROTOCOL');
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
};
const nodeId = (type, value) => `${type.toLowerCase()}:${sha(value).slice(0, 24)}`;
const edgeId = (type, from, to, discriminator = '') => `edge:${sha(`${type}|${from}|${to}|${discriminator}`).slice(0, 24)}`;

if (discovery.id !== 'kidults-asi-global-low-risk-discovery-v1' || discovery.primary_target !== 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE') fail('DISCOVERY_INPUT');
if (discovery.production !== 'HOLD' || discovery.public_release !== 'HOLD' || discovery.acquisition_authorized !== false || discovery.content_acquired !== false) fail('DISCOVERY_BOUNDARY');
if (!Array.isArray(discovery.candidates) || discovery.candidates.length !== Number(discovery.candidate_count)) fail('DISCOVERY_COUNT');
if (pool.id !== 'kidults-asi-proactive-source-pool-v1' || pool.version !== '1.1.0' || pool.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') fail('POOL_INPUT');
if (pool.lineage_policy !== 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE' || pool.provider_switching_preserves_source_candidate_identity !== true) fail('POOL_LINEAGE');
if (pool.production !== 'HOLD' || pool.public_release !== 'HOLD' || pool.acquisition_authorized !== false || pool.content_acquired !== false) fail('POOL_BOUNDARY');

const nodes = new Map();
const edges = new Map();
const addNode = node => {
  const prior = nodes.get(node.node_id);
  if (prior && JSON.stringify(prior) !== JSON.stringify(node)) fail(`NODE_COLLISION:${node.node_id}`);
  nodes.set(node.node_id, node);
};
const addEdge = edge => {
  const prior = edges.get(edge.edge_id);
  if (prior && JSON.stringify(prior) !== JSON.stringify(edge)) fail(`EDGE_COLLISION:${edge.edge_id}`);
  edges.set(edge.edge_id, edge);
};

const discoveryByLocator = new Map();
for (const candidate of discovery.candidates) {
  const locator = normalizeUrl(candidate.endpoint_url);
  const list = discoveryByLocator.get(locator) || [];
  list.push(candidate);
  discoveryByLocator.set(locator, list);
}

let poolBoundEndpointCount = 0;
for (const candidate of pool.candidates || []) {
  const locator = normalizeUrl(candidate.canonical_locator);
  const host = new URL(locator).hostname;
  const candidateNodeId = `source_candidate:${candidate.source_candidate_key.replace(/^src-cand:/, '')}`;
  const endpointNodeId = nodeId('endpoint', locator);
  const hostNodeId = nodeId('host', host);
  addNode({
    node_id: candidateNodeId,
    node_type: 'SOURCE_CANDIDATE',
    source_candidate_key: candidate.source_candidate_key,
    canonical_locator: locator,
    source_name: candidate.source_name,
    discovery_providers: unique(candidate.discovery_providers || []),
    source_family_hints: unique(candidate.source_family_hints || []),
    candidate_source_roles: unique(candidate.candidate_source_roles || []),
    provider_switchable_identity: true,
    rights_state: 'UNASSESSED',
    admission_state: 'NOT_ADMITTED',
    source_pool_state: 'CANDIDATE_ONLY',
    evidence_state: 'DISCOVERY_METADATA_ONLY',
    acquisition_authorized: false,
    public_projection: false,
    production: 'HOLD'
  });
  addNode({
    node_id: endpointNodeId,
    node_type: 'SOURCE_ENDPOINT',
    canonical_locator: locator,
    hostname: host,
    identity_effect: 'ENDPOINT_IDENTITY_ONLY',
    organization_identity_effect: 'NONE',
    rights_effect: 'NONE',
    admission_effect: 'NONE'
  });
  addNode({
    node_id: hostNodeId,
    node_type: 'OBSERVED_HOST',
    hostname: host,
    registrable_domain_inferred: false,
    legal_owner_inferred: false,
    organization_identity_effect: 'NONE'
  });
  addEdge({
    edge_id: edgeId('CANONICAL_LOCATOR', candidateNodeId, endpointNodeId),
    edge_type: 'CANONICAL_LOCATOR',
    from_node_id: candidateNodeId,
    to_node_id: endpointNodeId,
    assertion_state: 'OBSERVED',
    claim_effect: 'IDENTITY_LINK_ONLY'
  });
  addEdge({
    edge_id: edgeId('LOCATED_AT_HOST', endpointNodeId, hostNodeId),
    edge_type: 'LOCATED_AT_HOST',
    from_node_id: endpointNodeId,
    to_node_id: hostNodeId,
    assertion_state: 'DERIVED_FROM_URL_PARSE',
    claim_effect: 'HOST_TOPOLOGY_ONLY'
  });
  for (const provider of unique(candidate.discovery_providers || [])) {
    const providerNodeId = nodeId('provider', provider);
    addNode({
      node_id: providerNodeId,
      node_type: 'DISCOVERY_PROVIDER',
      provider_id: provider,
      provider_is_source_of_truth: false,
      provider_is_mandatory_bottleneck: false,
      rights_effect: 'NONE'
    });
    addEdge({
      edge_id: edgeId('OBSERVED_BY_PROVIDER', candidateNodeId, providerNodeId, provider),
      edge_type: 'OBSERVED_BY_PROVIDER',
      from_node_id: candidateNodeId,
      to_node_id: providerNodeId,
      assertion_state: 'PROVENANCE_RECORDED',
      claim_effect: 'DISCOVERY_PROVENANCE_ONLY'
    });
  }
  if (discoveryByLocator.has(locator)) poolBoundEndpointCount++;
}

let commonCrawlEdgeCount = 0;
let authorityReferenceCount = 0;
let registeredFrontierReferenceCount = 0;
for (const [locator, observations] of discoveryByLocator.entries()) {
  const endpointNodeId = nodeId('endpoint', locator);
  const host = new URL(locator).hostname;
  const hostNodeId = nodeId('host', host);
  if (!nodes.has(endpointNodeId)) {
    addNode({
      node_id: endpointNodeId,
      node_type: 'SOURCE_ENDPOINT',
      canonical_locator: locator,
      hostname: host,
      identity_effect: 'ENDPOINT_IDENTITY_ONLY',
      organization_identity_effect: 'NONE',
      rights_effect: 'NONE',
      admission_effect: 'NONE'
    });
    addNode({
      node_id: hostNodeId,
      node_type: 'OBSERVED_HOST',
      hostname: host,
      registrable_domain_inferred: false,
      legal_owner_inferred: false,
      organization_identity_effect: 'NONE'
    });
    addEdge({
      edge_id: edgeId('LOCATED_AT_HOST', endpointNodeId, hostNodeId),
      edge_type: 'LOCATED_AT_HOST',
      from_node_id: endpointNodeId,
      to_node_id: hostNodeId,
      assertion_state: 'DERIVED_FROM_URL_PARSE',
      claim_effect: 'HOST_TOPOLOGY_ONLY'
    });
  }

  for (const observation of observations) {
    const providers = unique([...(observation.discovery_providers || []), observation.discovery_provider]);
    for (const provider of providers) {
      const providerNodeId = nodeId('provider', provider);
      addNode({
        node_id: providerNodeId,
        node_type: 'DISCOVERY_PROVIDER',
        provider_id: provider,
        provider_is_source_of_truth: false,
        provider_is_mandatory_bottleneck: false,
        rights_effect: 'NONE'
      });
      addEdge({
        edge_id: edgeId('ENDPOINT_OBSERVED_BY_PROVIDER', endpointNodeId, providerNodeId, `${provider}|${observation.provider_record_id || ''}`),
        edge_type: 'ENDPOINT_OBSERVED_BY_PROVIDER',
        from_node_id: endpointNodeId,
        to_node_id: providerNodeId,
        provider_record_id: observation.provider_record_id || null,
        assertion_state: 'PROVENANCE_RECORDED',
        claim_effect: 'DISCOVERY_PROVENANCE_ONLY'
      });
    }

    if (observation.discovery_provider === 'COMMON_CRAWL_URL_INDEX_HOST_EXPANSION') {
      const seedHost = String(observation.seed_host || '').toLowerCase();
      if (!seedHost || !(host === seedHost || host.endsWith(`.${seedHost}`))) fail('COMMON_CRAWL_HOST_ESCAPE');
      const seedHostNodeId = nodeId('host', seedHost);
      addNode({
        node_id: seedHostNodeId,
        node_type: 'OBSERVED_HOST',
        hostname: seedHost,
        registrable_domain_inferred: false,
        legal_owner_inferred: false,
        organization_identity_effect: 'NONE'
      });
      addEdge({
        edge_id: edgeId('COMMON_CRAWL_EXPANDED_FROM_SEED_HOST', endpointNodeId, seedHostNodeId, observation.provider_record_id || locator),
        edge_type: 'COMMON_CRAWL_EXPANDED_FROM_SEED_HOST',
        from_node_id: endpointNodeId,
        to_node_id: seedHostNodeId,
        common_crawl_index_id: observation.common_crawl_index_id || null,
        assertion_state: 'PUBLIC_INDEX_METADATA_OBSERVED',
        claim_effect: 'SAME_HOST_OR_SUBDOMAIN_TOPOLOGY_ONLY',
        legal_owner_effect: 'NONE',
        organization_identity_effect: 'NONE'
      });
      commonCrawlEdgeCount++;
    }

    if (observation.discovery_provider === 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH' && observation.provider_record_id) {
      const referenceId = String(observation.provider_record_id);
      const referenceNodeId = nodeId('authority_reference', referenceId);
      addNode({
        node_id: referenceNodeId,
        node_type: 'AUTHORITY_IDENTITY_REFERENCE_CANDIDATE',
        authority_provider: 'WIKIDATA_OFFICIAL_WEBSITE_GRAPH',
        authority_record_id: referenceId,
        reference_state: 'OFFICIAL_WEBSITE_ASSERTION_CANDIDATE',
        legal_entity_identity_verified: false,
        legal_owner_verified: false,
        rights_effect: 'NONE'
      });
      addEdge({
        edge_id: edgeId('OFFICIAL_WEBSITE_ASSERTION_CANDIDATE', referenceNodeId, endpointNodeId, referenceId),
        edge_type: 'OFFICIAL_WEBSITE_ASSERTION_CANDIDATE',
        from_node_id: referenceNodeId,
        to_node_id: endpointNodeId,
        assertion_state: 'PUBLIC_GRAPH_ASSERTION_OBSERVED',
        claim_effect: 'AUTHORITY_REFERENCE_CANDIDATE_ONLY',
        legal_owner_effect: 'NONE'
      });
      authorityReferenceCount++;
    }

    if (observation.discovery_provider === 'CANONICAL_REGISTERED_FRONTIER_SEED' && observation.provider_record_id) {
      const referenceId = String(observation.provider_record_id);
      const referenceNodeId = nodeId('registered_frontier_reference', referenceId);
      addNode({
        node_id: referenceNodeId,
        node_type: 'REGISTERED_FRONTIER_SOURCE_REFERENCE',
        source_reference_id: referenceId,
        reference_state: 'REGISTERED_ENDPOINT_CANDIDATE_NOT_LIVE_VERIFIED',
        legal_entity_identity_verified: false,
        legal_owner_verified: false,
        rights_effect: 'NONE'
      });
      addEdge({
        edge_id: edgeId('REGISTERED_FRONTIER_LOCATOR_CANDIDATE', referenceNodeId, endpointNodeId, referenceId),
        edge_type: 'REGISTERED_FRONTIER_LOCATOR_CANDIDATE',
        from_node_id: referenceNodeId,
        to_node_id: endpointNodeId,
        assertion_state: 'INTERNAL_REGISTRY_REFERENCE',
        claim_effect: 'SOURCE_REFERENCE_CANDIDATE_ONLY',
        legal_owner_effect: 'NONE'
      });
      registeredFrontierReferenceCount++;
    }
  }
}

const sortedNodes = [...nodes.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
const sortedEdges = [...edges.values()].sort((a, b) => a.edge_id.localeCompare(b.edge_id));
const nodeTypeCounts = {};
const edgeTypeCounts = {};
for (const node of sortedNodes) nodeTypeCounts[node.node_type] = (nodeTypeCounts[node.node_type] || 0) + 1;
for (const edge of sortedEdges) edgeTypeCounts[edge.edge_type] = (edgeTypeCounts[edge.edge_type] || 0) + 1;
const providerIds = sortedNodes.filter(node => node.node_type === 'DISCOVERY_PROVIDER').map(node => node.provider_id);
const hostCount = nodeTypeCounts.OBSERVED_HOST || 0;
const endpointCount = nodeTypeCounts.SOURCE_ENDPOINT || 0;
const sourceCandidateCount = nodeTypeCounts.SOURCE_CANDIDATE || 0;
const graphDigest = `sha256:${sha(JSON.stringify({ nodes: sortedNodes, edges: sortedEdges }))}`;

const output = {
  id: 'kidults-asi-source-domain-observation-graph-v1',
  version: '1.0.0',
  status: 'SHADOW_SOURCE_DOMAIN_OBSERVATION_GRAPH_COMPLETE',
  generated_at: new Date().toISOString(),
  universe_target: 'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',
  graph_semantics: 'OBSERVED_ENDPOINT_HOST_PROVIDER_AND_BOUNDED_AUTHORITY_REFERENCE_TOPOLOGY',
  organization_resolution_state: 'UNRESOLVED_EXCEPT_BOUNDED_AUTHORITY_REFERENCE_CANDIDATES',
  cross_domain_organization_merge_authorized: false,
  registrable_domain_inference_authorized: false,
  legal_owner_inference_authorized: false,
  same_organization_claim_authorized: false,
  source_candidate_identity_policy: pool.lineage_policy,
  provider_switching_preserves_source_candidate_identity: true,
  input_receipt: {
    discovery_id: discovery.id,
    discovery_candidate_count: discovery.candidate_count,
    discovery_version: discovery.version || null,
    pool_id: pool.id,
    pool_version: pool.version,
    pool_cycle_count: pool.cycle_count,
    pool_candidate_count: pool.candidate_count
  },
  coverage: {
    source_candidate_nodes: sourceCandidateCount,
    endpoint_nodes: endpointCount,
    host_nodes: hostCount,
    provider_nodes: providerIds.length,
    provider_ids: providerIds,
    pool_candidates_bound_to_current_discovery_endpoints: poolBoundEndpointCount,
    common_crawl_topology_edges: commonCrawlEdgeCount,
    authority_reference_candidates: authorityReferenceCount,
    registered_frontier_reference_candidates: registeredFrontierReferenceCount,
    node_type_counts: nodeTypeCounts,
    edge_type_counts: edgeTypeCounts
  },
  forbidden_edge_types: ['SAME_ORGANIZATION', 'OWNS_DOMAIN', 'LEGAL_OWNER_OF_ENDPOINT', 'RIGHTS_GRANTED_BY_TOPOLOGY'],
  rules: {
    endpoint_or_host_co_observation_does_not_prove_same_organization: true,
    same_domain_or_subdomain_does_not_prove_legal_ownership: true,
    authority_reference_candidate_does_not_prove_legal_entity_identity: true,
    graph_cannot_create_rights_or_admission: true,
    listing_is_not_sold: true,
    provider_is_not_source_of_truth: true
  },
  nodes: sortedNodes,
  edges: sortedEdges,
  graph_digest: graphDigest,
  target_site_body_crawled: false,
  content_acquired: false,
  rights_promoted: false,
  admission_promoted: false,
  acquisition_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD'
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const tempPath = `${outPath}.tmp-${process.pid}`;
fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`);
fs.renameSync(tempPath, outPath);
console.log(JSON.stringify({
  status: output.status,
  source_candidates: sourceCandidateCount,
  endpoints: endpointCount,
  hosts: hostCount,
  providers: providerIds.length,
  common_crawl_edges: commonCrawlEdgeCount,
  authority_references: authorityReferenceCount,
  registered_frontier_references: registeredFrontierReferenceCount,
  graph_digest: graphDigest,
  production: 'HOLD'
}));
