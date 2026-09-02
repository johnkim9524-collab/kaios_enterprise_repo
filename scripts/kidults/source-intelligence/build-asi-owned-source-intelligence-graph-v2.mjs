#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,p1ContractPath,contractPath,outputDir] = process.argv.slice(2);
if (![candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,p1ContractPath,contractPath,outputDir].every(Boolean)) throw new Error('P2_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const short=(type,key)=>`${type.toLowerCase()}:${crypto.createHash('sha256').update(`${type}::${key}`).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();

const candidates=await readJson(candidateRegistryPath);
const bindings=await readJson(bindingLedgerPath);
const gate1=await readJson(gate1Path);
const admissions=await readJson(admissionPath);
const actions=await readJson(actionQueuePath);
const p1Contract=await readJson(p1ContractPath);
const contract=await readJson(contractPath);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

if(candidates.id!=='kidults-asi-p0b-source-candidate-registry-v1'||candidates.canonical_candidate_count===0||!Array.isArray(candidates.candidates)) throw new Error('P0B_CANDIDATE_REGISTRY_INVALID');
if(bindings.id!=='kidults-asi-p0b-mission-candidate-binding-ledger-v1'||bindings.mission_count!==192||bindings.bindings?.length!==192) throw new Error('P0B_BINDING_LEDGER_INVALID');
if(gate1.id!=='kidults-asi-p1-gate1-source-safety-decisions-v1'||gate1.decision_count!==576||gate1.decisions?.length!==576) throw new Error('P1_GATE1_INVALID');
if(admissions.id!=='kidults-asi-p1-evidence-admission-candidate-register-v1'||admissions.candidate_count!==576||admissions.candidates?.length!==576||admissions.admitted_count!==0) throw new Error('P1_ADMISSION_CANDIDATES_INVALID');
if(p1Contract.id!=='kidults-asi-p1-source-classification-admission-preflight-contract-v1'||p1Contract.version!=='1.0.0'||!Array.isArray(p1Contract.preflight_actions)||p1Contract.preflight_actions.length===0) throw new Error('P1_CONTRACT_INVALID');
if(contract.id!=='kidults-asi-owned-source-intelligence-graph-contract-v2'||contract.version!=='2.0.0') throw new Error('P2_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles)) throw new Error('P2_PRINCIPLE_ORDER_INVALID');
if(contract.truth_boundary?.creates_market_event!==false||contract.truth_boundary?.admits_evidence!==false||contract.truth_boundary?.creates_snapshot_candidate!==false) throw new Error('P2_TRUTH_BOUNDARY_INVALID');
const actionTypes=Array.isArray(actions.action_types)?actions.action_types:[];
if(actions.id!=='kidults-asi-p1-preflight-action-queue-v1'||actions.state!=='QUEUED_NOT_EXECUTED'||!Number.isInteger(actions.unique_candidate_count)||actions.unique_candidate_count<=0||!Array.isArray(actions.actions)||actions.action_count!==actions.actions.length||actionTypes.length===0||JSON.stringify(actionTypes)!==JSON.stringify(p1Contract.preflight_actions)||actions.action_count!==actions.unique_candidate_count*actionTypes.length) throw new Error('P1_ACTION_QUEUE_INVALID');
const actionIds=new Set();
const actionsByCandidate=new Map();
for(const action of actions.actions){
  if(!action?.action_id||actionIds.has(action.action_id)||!action?.candidate_id||!actionTypes.includes(action.action_type)||action.state!=='QUEUED_NOT_EXECUTED'||action.network_probe_authorized!==false||action.collection_authorized!==false||action.evidence_admitted!==false) throw new Error('P1_ACTION_QUEUE_INVALID');
  actionIds.add(action.action_id);
  if(!actionsByCandidate.has(action.candidate_id)) actionsByCandidate.set(action.candidate_id,[]);
  actionsByCandidate.get(action.candidate_id).push(action);
}
if(actionsByCandidate.size!==actions.unique_candidate_count) throw new Error('P1_ACTION_QUEUE_INVALID');
for(const candidateActions of actionsByCandidate.values()){
  if(candidateActions.length!==actionTypes.length||new Set(candidateActions.map(action=>action.action_type)).size!==actionTypes.length) throw new Error('P1_ACTION_QUEUE_INVALID');
}
await fs.mkdir(outputDir,{recursive:true});

const nodeMap=new Map(),edgeMap=new Map();
function addNode(type,key,props={},refs=[]){
  if(!contract.graph_model.node_types.includes(type)) throw new Error(`NODE_TYPE_FORBIDDEN:${type}`);
  const id=`node:${short(type,key)}`;
  const base={node_id:id,node_type:type,canonical_key:key,properties:stable(props),kidults_owned_graph_primitive:true,market_evidence_node:false,source_refs:uniq(refs),public_release:'HOLD',production:'HOLD'};
  const old=nodeMap.get(id);
  if(old&&stableJson({...old,source_refs:[]})!==stableJson({...base,source_refs:[]})) throw new Error(`NODE_CONFLICT:${id}`);
  if(old) old.source_refs=uniq([...old.source_refs,...refs]); else nodeMap.set(id,base);
  return id;
}
function addEdge(type,from,to,props={},refs=[],qualifier=''){
  if(!contract.graph_model.edge_types.includes(type)) throw new Error(`EDGE_TYPE_FORBIDDEN:${type}`);
  const id=`edge:${short(type,`${from}::${to}::${qualifier}`)}`;
  const base={edge_id:id,edge_type:type,from_node_id:from,to_node_id:to,qualifier,properties:stable(props),market_evidence_edge:false,source_refs:uniq(refs),public_release:'HOLD',production:'HOLD'};
  const old=edgeMap.get(id);
  if(old&&stableJson({...old,source_refs:[]})!==stableJson({...base,source_refs:[]})) throw new Error(`EDGE_CONFLICT:${id}`);
  if(old) old.source_refs=uniq([...old.source_refs,...refs]); else edgeMap.set(id,base);
  return id;
}

const idx={mission:new Map(),scope:new Map(),domain:new Map(),region:new Map(),evidence:new Map(),candidate:new Map(),host:new Map(),provider:new Map(),origin:new Map(),gate:new Map(),admission:new Map(),action:new Map(),actionType:new Map()};

for(const b of bindings.bindings){
  const ref=`binding:${b.binding_id}`;
  if(!idx.domain.has(b.domain)) idx.domain.set(b.domain,addNode('DOMAIN',b.domain,{domain:b.domain},[ref]));
  if(!idx.scope.has(b.scope_id)) idx.scope.set(b.scope_id,addNode('SCOPE',b.scope_id,{scope_id:b.scope_id,scope_name:b.scope_name,archetype:b.archetype},[ref]));
  else addNode('SCOPE',b.scope_id,{scope_id:b.scope_id,scope_name:b.scope_name,archetype:b.archetype},[ref]);
  if(!idx.region.has(b.region)) idx.region.set(b.region,addNode('REGION',b.region,{region:b.region},[ref]));
  if(!idx.evidence.has(b.evidence_class)) idx.evidence.set(b.evidence_class,addNode('EVIDENCE_CLASS',b.evidence_class,{evidence_class:b.evidence_class,claim_ceiling:b.claim_ceiling,source_candidate_is_evidence:false},[ref]));
  const m=addNode('MISSION',b.mission_id,{mission_id:b.mission_id,market_cell_id:b.market_cell_id,mission_candidate_state:b.mission_candidate_state,candidates_assigned:b.candidates_assigned,regional_coverage_proven:b.regional_coverage_proven,factual_origin_independence_proven:b.factual_origin_independence_proven,evidence_admitted:false,market_claim_authorized:false},[ref]);
  idx.mission.set(b.mission_id,m);
  addEdge('MISSION_IN_SCOPE',m,idx.scope.get(b.scope_id),{},[ref]);
  addEdge('MISSION_IN_REGION',m,idx.region.get(b.region),{},[ref]);
  addEdge('MISSION_REQUIRES_EVIDENCE_CLASS',m,idx.evidence.get(b.evidence_class),{claim_ceiling:b.claim_ceiling},[ref]);
  addEdge('SCOPE_IN_DOMAIN',idx.scope.get(b.scope_id),idx.domain.get(b.domain),{},[ref]);
}

for(const c of candidates.candidates){
  const refs=(c.raw_candidate_ids||[]).map(x=>`raw-candidate:${x}`);
  const cn=addNode('SOURCE_CANDIDATE',c.candidate_id,{candidate_id:c.candidate_id,canonical_endpoint:c.canonical_endpoint,canonical_host:c.canonical_host,scope_hints:c.scope_hints,region_hints:c.region_hints,candidate_source_roles:c.candidate_source_roles,discovery_channels:c.discovery_channels,discovery_providers:c.discovery_providers,rights_state_for_target_collection:c.rights_state_for_target_collection,admission_state:c.admission_state,evidence_state:c.evidence_state,factual_origin_independence_proven:false,candidate_is_evidence:false,target_content_acquired:false},refs);
  idx.candidate.set(c.candidate_id,cn);
  if(!idx.host.has(c.canonical_host)) idx.host.set(c.canonical_host,addNode('CANONICAL_HOST',c.canonical_host,{canonical_host:c.canonical_host,canonical_host_hash:c.canonical_host_hash,host_identity_is_factual_origin_proof:false},refs));
  addEdge('CANDIDATE_OBSERVED_ON_HOST',cn,idx.host.get(c.canonical_host),{canonical_endpoint:c.canonical_endpoint},refs);
  for(const p of c.discovery_providers||[]){
    if(!idx.provider.has(p)) idx.provider.set(p,addNode('DISCOVERY_PROVIDER',p,{provider_id:p,provider_is_source_of_truth:false},refs));
    addEdge('CANDIDATE_DISCOVERED_BY_PROVIDER',cn,idx.provider.get(p),{},refs,p);
  }
  const originKey=c.factual_origin_id||`unverified-origin::${c.canonical_host}`;
  if(!idx.origin.has(originKey)) idx.origin.set(originKey,addNode('FACTUAL_ORIGIN_CANDIDATE',originKey,{factual_origin_candidate_id:originKey,verified_factual_origin:false},refs));
  addEdge('CANDIDATE_HAS_FACTUAL_ORIGIN_CANDIDATE',cn,idx.origin.get(originKey),{verified_factual_origin:false},refs);
}

for(const b of bindings.bindings){
  const m=idx.mission.get(b.mission_id);
  for(const s of b.slot_bindings||[]){
    const c=idx.candidate.get(s.candidate_id);
    if(!c) throw new Error(`BOUND_CANDIDATE_MISSING:${s.candidate_id}`);
    addEdge('MISSION_HAS_SOURCE_CANDIDATE',m,c,{lane_slot:s.lane_slot,task_id:s.task_id,region_match_state:s.region_match_state,assignment_state:s.assignment_state,candidate_is_evidence:false},[`binding:${b.binding_id}`],`${s.lane_slot}::${s.candidate_id}`);
  }
}

for(const d of gate1.decisions){
  const ref=`gate1:${d.gate1_decision_id}`;
  const gn=addNode('GATE1_DECISION',d.gate1_decision_id,{gate1_decision_id:d.gate1_decision_id,grain_id:d.grain_id,decision:d.decision,rights_state:d.rights_state,classification_state:d.classification_state,qualification_state:d.qualification_state,reason_codes:d.reason_codes,unresolved_requirements:d.unresolved_requirements,target_site_probe_executed:false,evidence_admitted:false},[ref]);
  idx.gate.set(d.gate1_decision_id,gn);
  const c=idx.candidate.get(d.candidate_id),m=idx.mission.get(d.mission_id);
  if(!c||!m) throw new Error(`GATE1_LINK_MISSING:${d.grain_id}`);
  addEdge('CANDIDATE_HAS_GATE1_DECISION',c,gn,{grain_id:d.grain_id},[ref],d.grain_id);
  addEdge('MISSION_HAS_GATE1_DECISION',m,gn,{grain_id:d.grain_id},[ref],d.grain_id);
}

for(const a of admissions.candidates){
  const ref=`admission-candidate:${a.admission_candidate_id}`;
  const an=addNode('ADMISSION_CANDIDATE',a.admission_candidate_id,{admission_candidate_id:a.admission_candidate_id,grain_id:a.grain_id,state:a.state,gate1_decision:a.gate1_decision,rights_state:a.rights_state,required_next_actions:a.required_next_actions,evidence_admitted:false,admitted_evidence_id:null},[ref]);
  idx.admission.set(a.admission_candidate_id,an);
  const c=idx.candidate.get(a.candidate_id),m=idx.mission.get(a.mission_id);
  if(!c||!m) throw new Error(`ADMISSION_LINK_MISSING:${a.grain_id}`);
  addEdge('CANDIDATE_HAS_ADMISSION_CANDIDATE',c,an,{grain_id:a.grain_id},[ref],a.grain_id);
  addEdge('MISSION_HAS_ADMISSION_CANDIDATE',m,an,{grain_id:a.grain_id},[ref],a.grain_id);
}

for(const a of actions.actions){
  const ref=`preflight-action:${a.action_id}`;
  if(!idx.actionType.has(a.action_type)) idx.actionType.set(a.action_type,addNode('ACTION_TYPE',a.action_type,{action_type:a.action_type},[ref]));
  const an=addNode('PREFLIGHT_ACTION',a.action_id,{action_id:a.action_id,action_type:a.action_type,state:a.state,priority:a.priority,expected_output:a.expected_output,network_probe_authorized:false,evidence_admitted:false},[ref]);
  idx.action.set(a.action_id,an);
  const c=idx.candidate.get(a.candidate_id);
  if(!c) throw new Error(`ACTION_CANDIDATE_MISSING:${a.candidate_id}`);
  addEdge('CANDIDATE_REQUIRES_PREFLIGHT_ACTION',c,an,{impacted_grain_count:a.impacted_grain_ids.length,impacted_mission_count:a.impacted_mission_ids.length},[ref],a.action_id);
  addEdge('ACTION_IS_TYPE',an,idx.actionType.get(a.action_type),{},[ref]);
}

const nodes=[...nodeMap.values()].sort((a,b)=>a.node_type.localeCompare(b.node_type)||a.canonical_key.localeCompare(b.canonical_key));
const edges=[...edgeMap.values()].sort((a,b)=>a.edge_type.localeCompare(b.edge_type)||a.from_node_id.localeCompare(b.from_node_id)||a.to_node_id.localeCompare(b.to_node_id)||a.qualifier.localeCompare(b.qualifier));
const ids=new Set(nodes.map(x=>x.node_id));
if(ids.size!==nodes.length) throw new Error('DUPLICATE_NODE_IDS');
if(new Set(edges.map(x=>x.edge_id)).size!==edges.length) throw new Error('DUPLICATE_EDGE_IDS');
if(edges.some(e=>!ids.has(e.from_node_id)||!ids.has(e.to_node_id))) throw new Error('INVALID_EDGE_REFERENCE');

const times=candidates.candidates.flatMap(c=>c.observed_at_values||[]).filter(x=>Number.isFinite(Date.parse(x))).sort();
const asOf=times.at(-1)||'1970-01-01T00:00:00.000Z';
const graph={id:'kidults-owned-source-intelligence-graph-v2',version:'2.0.0',state:'P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_BUILT',as_of:asOf,platform_principles:principles,node_count:nodes.length,edge_count:edges.length,nodes,edges,market_evidence_nodes:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,market_claims_created:0,public_release:'HOLD',production:'HOLD'};
const graphDigest=hash(stableJson(graph));
const countType=(arr,key,type)=>arr.filter(x=>x[key]===type).length;
const assignedUnique=new Set(bindings.bindings.flatMap(b=>(b.slot_bindings||[]).map(s=>s.candidate_id))).size;
const quality={id:'kidults-owned-source-intelligence-quality-v2',version:'2.0.0',state:'VERIFIED_GRAPH_INTEGRITY_READY',as_of:asOf,node_type_counts:Object.fromEntries(contract.graph_model.node_types.map(t=>[t,countType(nodes,'node_type',t)])),edge_type_counts:Object.fromEntries(contract.graph_model.edge_types.map(t=>[t,countType(edges,'edge_type',t)])),duplicate_node_ids:0,duplicate_edge_ids:0,invalid_edge_node_references:0,forbidden_node_type_count:nodes.filter(n=>contract.forbidden_node_types.includes(n.node_type)).length,forbidden_edge_type_count:edges.filter(e=>contract.forbidden_edge_types.includes(e.edge_type)).length,unassigned_source_candidates:candidates.canonical_candidate_count-assignedUnique,evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'};
if(quality.forbidden_node_type_count||quality.forbidden_edge_type_count) throw new Error('FORBIDDEN_GRAPH_SEMANTICS');
const lineage={id:'kidults-owned-source-intelligence-lineage-v2',version:'2.0.0',state:'IMMUTABLE_INPUT_AND_OUTPUT_DIGESTS_BOUND',as_of:asOf,inputs:[candidates,bindings,gate1,admissions,actions,p1Contract,contract].map(x=>({id:x.id,version:x.version,digest:hash(stableJson(x))})),graph:{id:graph.id,version:graph.version,digest:graphDigest,node_count:graph.node_count,edge_count:graph.edge_count},public_release:'HOLD',production:'HOLD'};
const value={id:'kidults-owned-source-intelligence-value-receipt-v2',version:'2.0.0',state:'KIDULTS_OWNED_VALUE_INCREMENT_VERIFIED',as_of:asOf,graph_digest:graphDigest,mission_nodes:idx.mission.size,scope_nodes:idx.scope.size,domain_nodes:idx.domain.size,region_nodes:idx.region.size,evidence_class_nodes:idx.evidence.size,source_candidate_nodes:idx.candidate.size,canonical_host_nodes:idx.host.size,discovery_provider_nodes:idx.provider.size,factual_origin_candidate_nodes:idx.origin.size,gate1_decision_nodes:idx.gate.size,admission_candidate_nodes:idx.admission.size,preflight_action_nodes:idx.action.size,provider_switching_primitives_created:idx.host.size+idx.provider.size+idx.origin.size,external_raw_data_is_owned_moat:false,source_intelligence_graph_is_market_evidence_graph:false,public_release:'HOLD',production:'HOLD'};
async function write(name,value){const content=stableJson(value);await fs.writeFile(path.join(outputDir,name),content);return{name,sha256:hash(content),bytes:Buffer.byteLength(content)}}
const outputs=[];
outputs.push(await write('owned-source-intelligence-graph-v2.json',graph));
outputs.push(await write('owned-source-intelligence-lineage-v2.json',lineage));
outputs.push(await write('owned-source-intelligence-quality-v2.json',quality));
outputs.push(await write('owned-source-intelligence-value-receipt-v2.json',value));
const manifest={id:'kidults-owned-source-intelligence-manifest-v2',version:'2.0.0',state:'P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED',as_of:asOf,platform_principles:principles,graph_digest:graphDigest,results:{nodes:graph.node_count,edges:graph.edge_count,missions:idx.mission.size,source_candidates:idx.candidate.size,assigned_unique_candidates:assignedUnique,canonical_hosts:idx.host.size,discovery_providers:idx.provider.size,factual_origin_candidates:idx.origin.size,gate1_decisions:idx.gate.size,admission_candidates:idx.admission.size,preflight_actions:idx.action.size,provider_switching_primitives:value.provider_switching_primitives_created,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,market_claims_created:0},output_files:outputs,autonomous_effect:'POSITIVE_P0B_AND_P1_OUTPUTS_AUTO_COMPILED_TO_OWNED_GRAPH',global_effect:'POSITIVE_192_MISSION_SCOPE_REGION_EVIDENCE_STRUCTURE_PRESERVED',irreplaceable_value_effect:'POSITIVE_OWNED_IDENTITY_LINEAGE_PREFLIGHT_READINESS_AND_SWITCHING_PRIMITIVES_CREATED',transparency_effect:'POSITIVE_DIGEST_BOUND_NODE_EDGE_AND_INPUT_LINEAGE',public_release:'HOLD',production:'HOLD'};
outputs.push(await write('owned-source-intelligence-manifest-v2.json',manifest));
console.log(JSON.stringify({state:manifest.state,graph_digest:graphDigest,...manifest.results,output_dir:outputDir},null,2));
