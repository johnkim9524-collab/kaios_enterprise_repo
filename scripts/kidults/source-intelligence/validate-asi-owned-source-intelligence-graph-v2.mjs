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
assert(graph.node_count>0&&graph.edge_count>0,'GRAPH_EMPTY');
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
const edgeCounts=Object.fromEntries(contract.graph_model.edge_types.map(type=>[type,graph.edges.filter(edge=>edge.edge_type===type).length]));
assert(Object.values(counts).reduce((a,b)=>a+b,0)===graph.node_count,'NODE_TYPE_COUNT_SUM');
assert(Object.values(edgeCounts).reduce((a,b)=>a+b,0)===graph.edge_count,'EDGE_TYPE_COUNT_SUM');
assert(counts.MISSION===192,'MISSION_NODE_COUNT');
assert(counts.SCOPE===32&&counts.REGION===3&&counts.EVIDENCE_CLASS===2,'GLOBAL_DIMENSION_NODE_COUNT');
assert(counts.SOURCE_CANDIDATE>0&&counts.CANONICAL_HOST>0&&counts.DISCOVERY_PROVIDER>0&&counts.FACTUAL_ORIGIN_CANDIDATE>0,'SOURCE_PRIMITIVE_COUNT');
assert(counts.GATE1_DECISION===576,'GATE1_NODE_COUNT');
assert(counts.ADMISSION_CANDIDATE===576,'ADMISSION_NODE_COUNT');
assert(counts.PREFLIGHT_ACTION>0&&counts.ACTION_TYPE>0,'ACTION_NODE_COUNT');
assert(edgeCounts.MISSION_HAS_SOURCE_CANDIDATE===576,'MISSION_CANDIDATE_EDGE_COUNT');
assert(edgeCounts.CANDIDATE_HAS_GATE1_DECISION===576&&edgeCounts.MISSION_HAS_GATE1_DECISION===576,'GATE1_EDGE_COUNT');
assert(edgeCounts.CANDIDATE_HAS_ADMISSION_CANDIDATE===576&&edgeCounts.MISSION_HAS_ADMISSION_CANDIDATE===576,'ADMISSION_EDGE_COUNT');
assert(quality.state==='VERIFIED_GRAPH_INTEGRITY_READY'&&quality.duplicate_node_ids===0&&quality.duplicate_edge_ids===0&&quality.invalid_edge_node_references===0&&quality.forbidden_node_type_count===0&&quality.forbidden_edge_type_count===0,'QUALITY_INVALID');
for(const type of contract.graph_model.node_types)assert(quality.node_type_counts?.[type]===counts[type],`QUALITY_NODE_COUNTS:${type}`);
for(const type of contract.graph_model.edge_types)assert(quality.edge_type_counts?.[type]===edgeCounts[type],`QUALITY_EDGE_COUNTS:${type}`);
assert(lineage.graph.digest===hash(read('owned-source-intelligence-graph-v2.json'))&&lineage.inputs.length===6,'LINEAGE_INVALID');
assert(value.graph_digest===lineage.graph.digest,'VALUE_GRAPH_DIGEST');
assert(value.mission_nodes===counts.MISSION&&value.source_candidate_nodes===counts.SOURCE_CANDIDATE&&value.gate1_decision_nodes===counts.GATE1_DECISION&&value.admission_candidate_nodes===counts.ADMISSION_CANDIDATE&&value.preflight_action_nodes===counts.PREFLIGHT_ACTION,'VALUE_COUNTS');
assert(value.provider_switching_primitives_created===counts.CANONICAL_HOST+counts.DISCOVERY_PROVIDER+counts.FACTUAL_ORIGIN_CANDIDATE,'VALUE_SWITCHING_PRIMITIVES');
assert(value.external_raw_data_is_owned_moat===false&&value.source_intelligence_graph_is_market_evidence_graph===false,'VALUE_TRUTH_BOUNDARY');
assert(manifest.state==='P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED'&&manifest.graph_digest===lineage.graph.digest,'MANIFEST_STATE_OR_DIGEST');
assert(manifest.results.nodes===graph.node_count&&manifest.results.edges===graph.edge_count&&manifest.results.missions===192&&manifest.results.source_candidates===counts.SOURCE_CANDIDATE,'MANIFEST_COUNTS');
assert(manifest.results.gate1_decisions===576&&manifest.results.admission_candidates===576&&manifest.results.preflight_actions===counts.PREFLIGHT_ACTION,'MANIFEST_P1_COUNTS');
assert(manifest.results.provider_switching_primitives===value.provider_switching_primitives_created,'MANIFEST_SWITCHING_PRIMITIVES');
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
  missions:counts.MISSION,
  source_candidates:counts.SOURCE_CANDIDATE,
  canonical_hosts:counts.CANONICAL_HOST,
  discovery_providers:counts.DISCOVERY_PROVIDER,
  gate1_decisions:counts.GATE1_DECISION,
  admission_candidates:counts.ADMISSION_CANDIDATE,
  preflight_actions:counts.PREFLIGHT_ACTION,
  provider_switching_primitives:value.provider_switching_primitives_created,
  evidence_admitted:0,
  market_events_created:0,
  snapshot_candidates_created:0,
  public_release:'HOLD',
  production:'HOLD'
},null,2));
