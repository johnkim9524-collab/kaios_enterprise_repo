#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dir,contractPath]=process.argv.slice(2);
if(!dir||!contractPath) throw new Error('P2_VALIDATE_ARGS');
const read=n=>fs.readFileSync(path.join(dir,n),'utf8');
const json=n=>JSON.parse(read(n));
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
const graph=json('owned-source-intelligence-graph-v2.json');
const lineage=json('owned-source-intelligence-lineage-v2.json');
const quality=json('owned-source-intelligence-quality-v2.json');
const value=json('owned-source-intelligence-value-receipt-v2.json');
const manifest=json('owned-source-intelligence-manifest-v2.json');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

assert(contract.id==='kidults-asi-owned-source-intelligence-graph-contract-v2'&&contract.version==='2.0.0','CONTRACT_INVALID');
assert(JSON.stringify(contract.platform_principles)===JSON.stringify(principles),'PRINCIPLE_ORDER_INVALID');
assert(graph.id==='kidults-owned-source-intelligence-graph-v2'&&graph.node_count===graph.nodes.length&&graph.edge_count===graph.edges.length,'GRAPH_COUNTS_INVALID');
assert(graph.node_count===2784&&graph.edge_count===6290,'EXPECTED_CARDINALITY_INVALID');
const nodeIds=new Set(graph.nodes.map(node=>node.node_id));
const edgeIds=new Set(graph.edges.map(edge=>edge.edge_id));
assert(nodeIds.size===graph.nodes.length,'DUPLICATE_NODE_ID');
assert(edgeIds.size===graph.edges.length,'DUPLICATE_EDGE_ID');
assert(graph.edges.every(edge=>nodeIds.has(edge.from_node_id)&&nodeIds.has(edge.to_node_id)),'EDGE_REFERENCE_INVALID');
assert(graph.nodes.every(node=>contract.graph_model.node_types.includes(node.node_type)&&node.market_evidence_node===false&&node.public_release==='HOLD'&&node.production==='HOLD'),'NODE_BOUNDARY_INVALID');
assert(graph.edges.every(edge=>contract.graph_model.edge_types.includes(edge.edge_type)&&edge.market_evidence_edge===false&&edge.public_release==='HOLD'&&edge.production==='HOLD'),'EDGE_BOUNDARY_INVALID');
assert(!graph.nodes.some(node=>contract.forbidden_node_types.includes(node.node_type))&&!graph.edges.some(edge=>contract.forbidden_edge_types.includes(edge.edge_type)),'FORBIDDEN_GRAPH_SEMANTICS');
assert(graph.evidence_admitted===0&&graph.market_events_created===0&&graph.snapshot_candidates_created===0&&graph.market_claims_created===0,'GRAPH_PROMOTION_OVERCLAIM');
const counts=Object.fromEntries(contract.graph_model.node_types.map(type=>[type,graph.nodes.filter(node=>node.node_type===type).length]));
assert(counts.MISSION===192,'MISSION_NODE_COUNT');
assert(counts.SOURCE_CANDIDATE===486,'SOURCE_CANDIDATE_NODE_COUNT');
assert(counts.CANONICAL_HOST===114,'HOST_NODE_COUNT');
assert(counts.DISCOVERY_PROVIDER===2,'PROVIDER_NODE_COUNT');
assert(counts.GATE1_DECISION===576,'GATE1_NODE_COUNT');
assert(counts.ADMISSION_CANDIDATE===576,'ADMISSION_NODE_COUNT');
assert(counts.PREFLIGHT_ACTION===672,'ACTION_NODE_COUNT');
assert(quality.state==='VERIFIED_GRAPH_INTEGRITY_READY'&&quality.duplicate_node_ids===0&&quality.duplicate_edge_ids===0&&quality.invalid_edge_node_references===0&&quality.forbidden_node_type_count===0&&quality.forbidden_edge_type_count===0,'QUALITY_INVALID');
assert(lineage.graph.digest===hash(read('owned-source-intelligence-graph-v2.json'))&&lineage.inputs.length===6,'LINEAGE_INVALID');
assert(value.graph_digest===lineage.graph.digest&&value.provider_switching_primitives_created===230,'VALUE_RECEIPT_INVALID');
assert(manifest.state==='P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED'&&manifest.graph_digest===lineage.graph.digest,'MANIFEST_STATE_OR_DIGEST');
assert(manifest.results.nodes===2784&&manifest.results.edges===6290&&manifest.results.missions===192&&manifest.results.source_candidates===486,'MANIFEST_COUNTS');
assert(manifest.results.evidence_admitted===0&&manifest.results.market_events_created===0&&manifest.results.snapshot_candidates_created===0&&manifest.results.market_claims_created===0,'MANIFEST_PROMOTION_OVERCLAIM');
assert(manifest.output_files.length===4,'MANIFEST_OUTPUT_COUNT');
for(const file of manifest.output_files){
  assert(file.sha256===hash(read(file.name)),`OUTPUT_DIGEST:${file.name}`);
  assert(file.bytes===Buffer.byteLength(read(file.name)),`OUTPUT_BYTES:${file.name}`);
}
assert(manifest.public_release==='HOLD'&&manifest.production==='HOLD','RELEASE_BOUNDARY');

console.log(JSON.stringify({
  id:'kidults-asi-owned-source-intelligence-graph-validation-v2',
  state:'VERIFIED_PASS',
  nodes:graph.node_count,
  edges:graph.edge_count,
  missions:192,
  source_candidates:486,
  gate1_decisions:576,
  admission_candidates:576,
  preflight_actions:672,
  provider_switching_primitives:230,
  evidence_admitted:0,
  market_events_created:0,
  snapshot_candidates_created:0,
  public_release:'HOLD',
  production:'HOLD'
},null,2));
