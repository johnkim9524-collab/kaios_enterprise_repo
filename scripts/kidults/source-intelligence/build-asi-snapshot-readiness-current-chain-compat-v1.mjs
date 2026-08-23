#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [graphV2Path,lineageV2Path,qualityV2Path,valueV2Path,candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,outputRoot='/tmp/kidults-asi-snapshot-current-chain-compat-v1'] = process.argv.slice(2);
if (![graphV2Path,lineageV2Path,qualityV2Path,valueV2Path,candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath].every(Boolean)) throw new Error('CURRENT_CHAIN_COMPAT_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const digest=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const graphV2=await readJson(graphV2Path),lineageV2=await readJson(lineageV2Path),qualityV2=await readJson(qualityV2Path),valueV2=await readJson(valueV2Path),candidates=await readJson(candidateRegistryPath),bindings=await readJson(bindingLedgerPath),gate1=await readJson(gate1Path),admissions=await readJson(admissionPath),actions=await readJson(actionQueuePath);
if(graphV2.id!=='kidults-owned-source-intelligence-graph-v2'||graphV2.evidence_admitted!==0||graphV2.market_events_created!==0) throw new Error('CURRENT_P2_GRAPH_INVALID');
if(lineageV2.id!=='kidults-owned-source-intelligence-lineage-v2'||lineageV2.graph?.digest!==digest(stableJson(graphV2))) throw new Error('CURRENT_P2_LINEAGE_INVALID');
if(qualityV2.id!=='kidults-owned-source-intelligence-quality-v2'||qualityV2.state!=='VERIFIED_GRAPH_INTEGRITY_READY') throw new Error('CURRENT_P2_QUALITY_INVALID');
if(valueV2.id!=='kidults-owned-source-intelligence-value-receipt-v2'||valueV2.source_intelligence_graph_is_market_evidence_graph!==false) throw new Error('CURRENT_P2_VALUE_INVALID');
if(candidates.id!=='kidults-asi-p0b-source-candidate-registry-v1'||candidates.canonical_candidate_count!==482) throw new Error('CURRENT_P0B_CANDIDATES_INVALID');
if(bindings.id!=='kidults-asi-p0b-mission-candidate-binding-ledger-v1'||bindings.mission_count!==192||bindings.bindings?.length!==192) throw new Error('CURRENT_P0B_BINDINGS_INVALID');
if(gate1.id!=='kidults-asi-p1-gate1-source-safety-decisions-v1'||gate1.decision_count!==576||gate1.pass_count!==0) throw new Error('CURRENT_P1_GATE1_INVALID');
if(admissions.id!=='kidults-asi-p1-evidence-admission-candidate-register-v1'||admissions.candidate_count!==576||admissions.admitted_count!==0) throw new Error('CURRENT_P1_ADMISSIONS_INVALID');
if(actions.id!=='kidults-asi-p1-preflight-action-queue-v1'||actions.action_count!==672||actions.target_site_network_probes_executed!==0) throw new Error('CURRENT_P1_ACTIONS_INVALID');

const p2=path.join(outputRoot,'p2'),p1=path.join(outputRoot,'p1'),p0=path.join(outputRoot,'p0');
await Promise.all([fs.mkdir(p2,{recursive:true}),fs.mkdir(p1,{recursive:true}),fs.mkdir(p0,{recursive:true})]);
const nodeById=new Map(graphV2.nodes.map(n=>[n.node_id,n]));
const candidateClasses=new Map();
for(const b of bindings.bindings){for(const s of b.slot_bindings||[]){if(!candidateClasses.has(s.candidate_id))candidateClasses.set(s.candidate_id,new Set());candidateClasses.get(s.candidate_id).add(b.evidence_class)}}
const nodes=graphV2.nodes.filter(n=>['MISSION','SOURCE_CANDIDATE','FACTUAL_ORIGIN_CANDIDATE'].includes(n.node_type)).map(n=>{
  if(n.node_type!=='SOURCE_CANDIDATE') return n;
  const candidateId=n.properties?.candidate_id;
  const classes=uniq([...(candidateClasses.get(candidateId)||[])]);
  return {...n,properties:{...n.properties,evidence_class:classes[0]||null,evidence_classes:classes,candidate_is_evidence:false}};
});
const existingIds=new Set(nodes.map(n=>n.node_id));
const edges=graphV2.edges.filter(e=>e.edge_type==='MISSION_HAS_SOURCE_CANDIDATE'&&existingIds.has(e.from_node_id)&&existingIds.has(e.to_node_id)).map(e=>({...e,market_evidence_edge:false}));
const graphV1={id:'kidults-owned-source-intelligence-graph-v1',version:'1.0.0',state:'CURRENT_CHAIN_COMPAT_SOURCE_INTELLIGENCE_GRAPH',as_of:graphV2.as_of,platform_principles:['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'],node_count:nodes.length,edge_count:edges.length,nodes,edges,market_evidence_nodes:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,market_claims_created:0,public_release:'HOLD',production:'HOLD'};
const lineageV1={id:'kidults-owned-source-intelligence-lineage-v1',version:'1.0.0',state:'CURRENT_CHAIN_DIGEST_COMPATIBILITY_BOUND',as_of:graphV2.as_of,inputs:[{id:graphV2.id,version:graphV2.version,digest:lineageV2.graph.digest},{id:candidates.id,version:candidates.version,digest:digest(stableJson(candidates))},{id:bindings.id,version:bindings.version,digest:digest(stableJson(bindings))},{id:gate1.id,version:gate1.version,digest:digest(stableJson(gate1))},{id:admissions.id,version:admissions.version,digest:digest(stableJson(admissions))},{id:actions.id,version:actions.version,digest:digest(stableJson(actions))}],graph:{id:graphV1.id,version:graphV1.version,digest:digest(stableJson(graphV1)),node_count:graphV1.node_count,edge_count:graphV1.edge_count},public_release:'HOLD',production:'HOLD'};
const qualityV1={id:'kidults-owned-source-intelligence-quality-v1',version:'1.0.0',state:'VERIFIED_GRAPH_INTEGRITY_READY',as_of:graphV2.as_of,compatibility_source_graph_digest:lineageV2.graph.digest,duplicate_node_ids:0,duplicate_edge_ids:0,invalid_edge_node_references:0,evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'};
const valueV1={id:'kidults-owned-source-intelligence-value-receipt-v1',version:'1.0.0',state:'CURRENT_KIDULTS_OWNED_VALUE_BOUND',as_of:graphV2.as_of,canonical_host_nodes:valueV2.canonical_host_nodes,source_candidate_nodes:valueV2.source_candidate_nodes,factual_origin_candidate_nodes:valueV2.factual_origin_candidate_nodes,source_intelligence_graph_is_market_evidence_graph:false,public_release:'HOLD',production:'HOLD'};

const uniqueActionCandidates=uniq(actions.actions.map(a=>a.candidate_id));
const assignments=uniqueActionCandidates.map(candidateId=>({candidate_id:candidateId,admission_readiness_state:'NOT_READY_RIGHTS_UNKNOWN',evidence_admitted:false,automatic_admission_eligible:false,required_next_actions:uniq(actions.actions.filter(a=>a.candidate_id===candidateId).map(a=>a.action_type)),public_release:'HOLD',production:'HOLD'}));
const preflightAssignments={id:'kidults-asi-candidate-preflight-assignment-v1',version:'1.0.0',state:'CURRENT_P1_ACTION_QUEUE_COMPATIBILITY_VIEW',as_of:graphV2.as_of,candidate_count:assignments.length,assignments,evidence_admitted:0,public_release:'HOLD',production:'HOLD'};
const admissionReadiness={id:'kidults-asi-candidate-admission-readiness-v1',version:'1.0.0',state:'NOT_READY_RIGHTS_UNKNOWN',as_of:graphV2.as_of,candidate_count:assignments.length,automatic_admission_eligible:0,evidence_admitted:0,readiness_counts:{NOT_READY_RIGHTS_UNKNOWN:assignments.length,NOT_READY_SEMANTIC_INSUFFICIENT:0,NOT_READY_TECHNICAL_FAILURE:0,REJECTED_AUTOMATION_OR_ACCESS:0,WAITING_FOR_HOST_PREFLIGHT:0},public_release:'HOLD',production:'HOLD'};
const entries=bindings.bindings.map(b=>({mission_id:b.mission_id,evidence_class:b.evidence_class,candidate_slots_filled:Number(b.distinct_hosts_assigned||0),candidate_assignment_count:Number(b.candidates_assigned||0),public_release:'HOLD',production:'HOLD'}));
const missionLedger={id:'kidults-asi-mission-consumption-ledger-v1',version:'1.0.0',state:'CURRENT_P0B_BINDING_COMPATIBILITY_VIEW',as_of:graphV2.as_of,entries,no_candidate_missions:entries.filter(e=>e.candidate_assignment_count===0).length,partial_candidate_coverage_missions:entries.filter(e=>e.candidate_slots_filled>0&&e.candidate_slots_filled<3).length,complete_candidate_slot_coverage_missions:entries.filter(e=>e.candidate_slots_filled>=3).length,public_release:'HOLD',production:'HOLD'};
const laneCoverage={id:'kidults-asi-mission-lane-coverage-v1',version:'1.0.0',state:'CURRENT_P0B_LANE_COVERAGE_COMPATIBILITY_VIEW',as_of:graphV2.as_of,mission_count:192,missions_with_candidates:bindings.missions_with_at_least_one_candidate,missions_with_three_candidate_hosts:bindings.missions_with_three_candidate_hosts,regional_coverage_proven:bindings.missions_with_regional_coverage_proven,factual_origin_independence_proven:bindings.missions_with_factual_origin_independence_proven,public_release:'HOLD',production:'HOLD'};
async function write(dir,name,value){await fs.writeFile(path.join(dir,name),stableJson(value))}
await Promise.all([write(p2,'owned-source-intelligence-graph-v1.json',graphV1),write(p2,'owned-source-intelligence-lineage-v1.json',lineageV1),write(p2,'owned-source-intelligence-quality-v1.json',qualityV1),write(p2,'owned-source-intelligence-value-receipt-v1.json',valueV1),write(p1,'candidate-preflight-assignment-v1.json',preflightAssignments),write(p1,'candidate-admission-readiness-v1.json',admissionReadiness),write(p0,'mission-consumption-ledger-v1.json',missionLedger),write(p0,'mission-lane-coverage-v1.json',laneCoverage)]);
console.log(JSON.stringify({id:'kidults-asi-snapshot-readiness-current-chain-compat-v1',state:'VERIFIED_COMPATIBILITY_VIEW_BUILT',source_graph_v2_digest:lineageV2.graph.digest,source_candidates:candidates.canonical_candidate_count,mission_count:bindings.mission_count,gate1_decisions:gate1.decision_count,preflight_actions:actions.action_count,preflight_action_candidates:assignments.length,evidence_admitted:0,market_events:0,output_root:outputRoot,public_release:'HOLD',production:'HOLD'},null,2));
