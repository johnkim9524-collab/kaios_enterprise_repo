#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [p0RegistryPath,p0BindingsPath,p0ManifestPath,p1GatePath,p1AdmissionPath,p1ActionsPath,p1ManifestPath,p2GraphPath,p2LineagePath,p2QualityPath,p2ValuePath,p2ManifestPath,contractPath,outputDir] = process.argv.slice(2);
if (![p0RegistryPath,p0BindingsPath,p0ManifestPath,p1GatePath,p1AdmissionPath,p1ActionsPath,p1ManifestPath,p2GraphPath,p2LineagePath,p2QualityPath,p2ValuePath,p2ManifestPath,contractPath,outputDir].every(Boolean)) throw new Error('P3_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const idFor=(prefix,v)=>`${prefix}_${crypto.createHash('sha256').update(stableJson(v)).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const countBy=(arr,keyFn)=>Object.fromEntries([...arr.reduce((m,x)=>m.set(keyFn(x),(m.get(keyFn(x))||0)+1),new Map()).entries()].sort(([a],[b])=>String(a).localeCompare(String(b))));

const [p0Registry,p0Bindings,p0Manifest,p1Gate,p1Admission,p1Actions,p1Manifest,p2Graph,p2Lineage,p2Quality,p2Value,p2Manifest,contract] = await Promise.all([p0RegistryPath,p0BindingsPath,p0ManifestPath,p1GatePath,p1AdmissionPath,p1ActionsPath,p1ManifestPath,p2GraphPath,p2LineagePath,p2QualityPath,p2ValuePath,p2ManifestPath,contractPath].map(readJson));
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(p0Registry.id!=='kidults-asi-p0b-source-candidate-registry-v1'||p0Registry.canonical_candidate_count<=0) throw new Error('P0B_REGISTRY_INVALID');
if(p0Bindings.id!=='kidults-asi-p0b-mission-candidate-binding-ledger-v1'||p0Bindings.mission_count!==192||p0Bindings.bindings?.length!==192) throw new Error('P0B_BINDINGS_INVALID');
if(p0Manifest.id!=='kidults-asi-p0b-bounded-discovery-manifest-v1') throw new Error('P0B_MANIFEST_INVALID');
if(p1Gate.id!=='kidults-asi-p1-gate1-source-safety-decisions-v1'||p1Gate.decision_count!==576||p1Gate.decisions?.length!==576) throw new Error('P1_GATE_INVALID');
if(p1Admission.id!=='kidults-asi-p1-evidence-admission-candidate-register-v1'||p1Admission.candidate_count!==576||p1Admission.candidates?.length!==576) throw new Error('P1_ADMISSION_INVALID');
if(p1Actions.id!=='kidults-asi-p1-preflight-action-queue-v1'||p1Actions.action_count!==672||p1Actions.actions?.length!==672) throw new Error('P1_ACTIONS_INVALID');
if(p1Manifest.id!=='kidults-asi-p1-source-preflight-manifest-v1') throw new Error('P1_MANIFEST_INVALID');
if(p2Graph.id!=='kidults-owned-source-intelligence-graph-v2'||p2Graph.version!=='2.0.0') throw new Error('P2_GRAPH_INVALID');
if(p2Lineage.id!=='kidults-owned-source-intelligence-lineage-v2'||p2Lineage.graph?.digest!==hash(stableJson(p2Graph))) throw new Error('P2_LINEAGE_INVALID');
if(p2Quality.id!=='kidults-owned-source-intelligence-quality-v2'||p2Quality.state!=='VERIFIED_GRAPH_INTEGRITY_READY') throw new Error('P2_QUALITY_INVALID');
if(p2Value.id!=='kidults-owned-source-intelligence-value-receipt-v2'||p2Value.source_intelligence_graph_is_market_evidence_graph!==false) throw new Error('P2_VALUE_INVALID');
if(p2Manifest.id!=='kidults-owned-source-intelligence-manifest-v2'||p2Manifest.graph_digest!==p2Lineage.graph.digest) throw new Error('P2_MANIFEST_INVALID');
if(contract.id!=='kidults-asi-snapshot-readiness-factory-contract-v2'||contract.version!=='2.0.0'||JSON.stringify(contract.platform_principles)!==JSON.stringify(principles)) throw new Error('P3_CONTRACT_INVALID');
if(contract.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails!==false) throw new Error('P3_FAIL_CLOSED_INVALID');
await fs.mkdir(outputDir,{recursive:true});

const p2Results=p2Manifest.results||{};
const missionCount=p0Bindings.mission_count;
const candidateCount=p0Registry.canonical_candidate_count;
const uniqueHosts=p0Registry.unique_host_count;
const gatePass=p1Gate.pass_count||0, gateHold=p1Gate.hold_count||0, gateReject=p1Gate.reject_count||0;
const rightsPass=p1Admission.candidates.filter(x=>x.rights_state==='ALLOW'&&x.collection_authorized===true).length;
const semanticVerified=p1Gate.decisions.filter(x=>!x.reason_codes?.includes('MARKET_SEMANTICS_UNVERIFIED')&&x.decision==='PASS').length;
const factualOriginVerified=p0Bindings.bindings.filter(x=>x.factual_origin_independence_proven===true).length;
const regionalCoverageVerified=p0Bindings.bindings.filter(x=>x.regional_coverage_proven===true).length;
const completedActions=p1Actions.actions.filter(x=>['COMPLETED','PASS','VERIFIED_PASS'].includes(x.state)).length;
const admitted=p1Admission.candidates.filter(x=>x.evidence_admitted===true).length;
const admittedSold=p1Admission.candidates.filter(x=>x.evidence_admitted===true&&x.evidence_class==='CURRENT_SOLD_TRANSACTION').length;
const admittedLiquidity=p1Admission.candidates.filter(x=>x.evidence_admitted===true&&x.evidence_class==='LIQUIDITY_TIME_TO_SALE_EXPOSURE').length;
const marketEvents=p2Graph.market_events_created||0;
const currentSoldMissions=p0Bindings.bindings.filter(x=>x.evidence_class==='CURRENT_SOLD_TRANSACTION').length;
const liquidityMissions=p0Bindings.bindings.filter(x=>x.evidence_class==='LIQUIDITY_TIME_TO_SALE_EXPOSURE').length;

const dimensions=[
 {dimension:'MISSION_SOURCE_CANDIDATE_COVERAGE',state:p0Bindings.missions_with_at_least_one_candidate===missionCount?'PASS':'FAIL',current_value:p0Bindings.missions_with_at_least_one_candidate,required_value:missionCount,blockers:p0Bindings.missions_with_at_least_one_candidate===missionCount?[]:['MISSION_WITHOUT_SOURCE_CANDIDATE'],evidence_refs:[p0Registry.id,p0Bindings.id]},
 {dimension:'PRIMARY_FALLBACK_REPLACEMENT_COVERAGE',state:p0Bindings.missions_with_primary_and_fallback_candidates===missionCount&&p0Bindings.missions_with_three_candidate_hosts===missionCount?'PASS':'PARTIAL',current_value:{primary_and_fallback:p0Bindings.missions_with_primary_and_fallback_candidates,three_candidate_hosts:p0Bindings.missions_with_three_candidate_hosts},required_value:{primary_and_fallback:missionCount,three_candidate_hosts:missionCount},blockers:[],evidence_refs:[p0Bindings.id]},
 {dimension:'GATE1_SOURCE_SAFETY',state:gatePass>0&&gateHold===0&&gateReject===0?'PASS':'FAIL',current_value:{pass:gatePass,hold:gateHold,reject:gateReject},required_value:{pass:p1Gate.decision_count,hold:0},blockers:gateHold?['GATE1_HOLD_OPEN']:gateReject?['GATE1_REJECT_OPEN']:['GATE1_PASS_ZERO'],evidence_refs:[p1Gate.id]},
 {dimension:'PURPOSE_SPECIFIC_RIGHTS',state:rightsPass===p1Admission.candidate_count?'PASS':'FAIL',current_value:rightsPass,required_value:p1Admission.candidate_count,blockers:['PURPOSE_SPECIFIC_RIGHTS_UNKNOWN'],evidence_refs:[p1Admission.id]},
 {dimension:'MARKET_SEMANTIC_SUFFICIENCY',state:semanticVerified===p1Gate.decision_count?'PASS':'FAIL',current_value:semanticVerified,required_value:p1Gate.decision_count,blockers:['MARKET_SEMANTICS_UNVERIFIED'],evidence_refs:[p1Gate.id]},
 {dimension:'FACTUAL_ORIGIN_INDEPENDENCE',state:factualOriginVerified===missionCount?'PASS':'FAIL',current_value:factualOriginVerified,required_value:missionCount,blockers:['FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN'],evidence_refs:[p0Bindings.id,p2Graph.id]},
 {dimension:'EVIDENCE_ADMISSION',state:admitted>=contract.snapshot_creation_gate.admitted_evidence_minimum?'PASS':'FAIL',current_value:admitted,required_value:contract.snapshot_creation_gate.admitted_evidence_minimum,blockers:['EVIDENCE_ADMISSION_ZERO'],evidence_refs:[p1Admission.id,p2Graph.id]},
 {dimension:'CURRENT_SOLD_TRANSACTION_EVIDENCE',state:admittedSold>=contract.snapshot_creation_gate.admitted_current_sold_minimum?'PASS':'FAIL',current_value:admittedSold,required_value:contract.snapshot_creation_gate.admitted_current_sold_minimum,blockers:['CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO'],evidence_refs:[p1Admission.id]},
 {dimension:'LIQUIDITY_TIME_TO_SALE_EVIDENCE',state:admittedLiquidity>=contract.snapshot_creation_gate.admitted_liquidity_minimum?'PASS':'FAIL',current_value:admittedLiquidity,required_value:contract.snapshot_creation_gate.admitted_liquidity_minimum,blockers:['LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO'],evidence_refs:[p1Admission.id]},
 {dimension:'MARKET_EVENT_GRAPH',state:marketEvents>=contract.snapshot_creation_gate.market_event_graph_nodes_minimum?'PASS':'FAIL',current_value:marketEvents,required_value:contract.snapshot_creation_gate.market_event_graph_nodes_minimum,blockers:['MARKET_EVENT_GRAPH_ZERO'],evidence_refs:[p2Graph.id]},
 {dimension:'IMMUTABLE_EVIDENCE_PACKAGE',state:'FAIL',current_value:0,required_value:1,blockers:['IMMUTABLE_EVIDENCE_PACKAGE_MISSING'],evidence_refs:[p2Lineage.id]},
 {dimension:'TRACK_B_INPUT_PAIR',state:'FAIL',current_value:0,required_value:1,blockers:['TRACK_B_INPUT_PAIR_MISSING'],evidence_refs:[p2Lineage.id]}
];
if(JSON.stringify(dimensions.map(x=>x.dimension))!==JSON.stringify(contract.readiness_dimensions)) throw new Error('READINESS_DIMENSION_ORDER_INVALID');
const allPass=dimensions.every(x=>x.state==='PASS');
const snapshotGatePass=allPass&&admitted>0&&admittedSold>0&&admittedLiquidity>0&&marketEvents>0;
if(snapshotGatePass) throw new Error('UNEXPECTED_SNAPSHOT_GATE_PASS');

const blockers=[];
function block(blocker_class,severity,affected_count,unblock_condition,dependencies,evidence_refs){blockers.push({blocker_id:idFor('blocker',{blocker_class,dependencies,evidence_refs}),blocker_class,severity,state:'OPEN',affected_count,unblock_condition,dependencies,evidence_refs:uniq(evidence_refs),snapshot_gate_effect:'BLOCK',public_release:'HOLD',production:'HOLD'});}
if(gateHold) block('GATE1_HOLD_OPEN','P0',gateHold,'Execute and evidence every required preflight action, then recompute Gate 1 without metadata-only promotion.',['P1_PREFLIGHT_ACTION_EXECUTION'],[p1Gate.id,p1Actions.id]);
const rightsUnknown=p1Admission.candidates.filter(x=>x.rights_state!=='ALLOW').length;
if(rightsUnknown) block('PURPOSE_SPECIFIC_RIGHTS_UNKNOWN','P0',rightsUnknown,'Adjudicate collect, store, derive and display rights by source, field, evidence class and purpose.',['RIGHTS_AND_TERMS_PREFLIGHT'],[p1Admission.id]);
const semanticUnknown=p1Gate.decisions.filter(x=>x.reason_codes?.includes('MARKET_SEMANTICS_UNVERIFIED')).length;
if(semanticUnknown) block('MARKET_SEMANTICS_UNVERIFIED','P0',semanticUnknown,'Verify sold, transaction, exposure and liquidity semantics without Listing/Sold or Attention/Demand conflation.',['MARKET_SEMANTIC_PREFLIGHT'],[p1Gate.id]);
const queuedActions=p1Actions.actions.filter(x=>x.state==='QUEUED_NOT_EXECUTED').length;
if(queuedActions) block('PREFLIGHT_ACTIONS_UNEXECUTED','P0',queuedActions,'Consume the bounded P1 action queue and preserve per-action evidence or explicit failure.',['P1_ACTION_EXECUTOR'],[p1Actions.id]);
if(regionalCoverageVerified<missionCount) block('REGIONAL_RELEVANCE_UNPROVEN','P1',missionCount-regionalCoverageVerified,'Verify regional relevance and local-language materiality for every regional mission.',['REGION_LANGUAGE_PREFLIGHT'],[p0Bindings.id,p1Actions.id]);
if(factualOriginVerified<missionCount) block('FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN','P0',missionCount-factualOriginVerified,'Verify distinct underlying factual origins and source-removal resilience for all material missions.',['FACTUAL_ORIGIN_VERIFICATION'],[p0Bindings.id,p2Graph.id]);
if(admitted===0) block('EVIDENCE_ADMISSION_ZERO','P0',p1Admission.candidate_count,'Admit at least one rights-cleared, semantically sufficient, fresh and provenance-bound evidence record.',['P1_GATE1_PASS','P1_PURPOSE_ADMISSION'],[p1Admission.id,p2Graph.id]);
if(admittedSold===0) block('CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO','P0',currentSoldMissions,'Admit current dated SOLD transaction evidence for at least one bounded market surface.',['CURRENT_SOLD_ADAPTER','P1_EVIDENCE_ADMISSION'],[p1Admission.id]);
if(admittedLiquidity===0) block('LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO','P0',liquidityMissions,'Admit exposure-denominator and censoring-aware liquidity evidence for at least one bounded market surface.',['LIQUIDITY_ADAPTER','P1_EVIDENCE_ADMISSION'],[p1Admission.id]);
if(marketEvents===0) block('MARKET_EVENT_GRAPH_ZERO','P0',0,'Materialize admitted market events into the governed Market Event Graph with immutable lineage.',['P2_MARKET_EVENT_MATERIALIZER'],[p2Graph.id]);
block('IMMUTABLE_EVIDENCE_PACKAGE_MISSING','P0',1,'Compile an immutable Evidence Package only after admitted evidence and market-event lineage exist.',['P3_EVIDENCE_PACKAGE_COMPILER'],[p2Lineage.id]);
block('TRACK_B_INPUT_PAIR_MISSING','P0',1,'Generate the exact immutable snapshot-candidate.json plus Evidence Package pair before Track B starts.',['P3_SNAPSHOT_COMPILER','TRACK_B_HANDOFF'],[p2Lineage.id]);
blockers.sort((a,b)=>a.severity.localeCompare(b.severity)||a.blocker_class.localeCompare(b.blocker_class));

const actionTypeCounts=countBy(p1Actions.actions,x=>x.action_type);
const actionDemands=p1Actions.actions.map(a=>({action_id:a.action_id,action_type:a.action_type,state:a.state,candidate_id:a.candidate_id,canonical_host:a.canonical_host,expected_output:a.expected_output,impacted_grain_count:a.impacted_grain_ids?.length||0,impacted_mission_count:a.impacted_mission_ids?.length||0,network_probe_authorized:a.network_probe_authorized,collection_authorized:a.collection_authorized,evidence_admitted:a.evidence_admitted}));
const admissionDemand={id:'kidults-asi-admission-demand-package-v2',version:'2.0.0',state:'P1_ACTION_EXECUTION_REQUIRED',as_of:p2Graph.as_of,source_graph_digest:p2Lineage.graph.digest,action_count:p1Actions.action_count,queued_action_count:queuedActions,completed_action_count:completedActions,action_type_counts:actionTypeCounts,action_demands:actionDemands,gate1_hold_count:gateHold,rights_unknown_count:rightsUnknown,semantic_unknown_count:semanticUnknown,regional_coverage_unproven_missions:missionCount-regionalCoverageVerified,factual_origin_independence_unproven_missions:missionCount-factualOriginVerified,evidence_admitted:admitted,package_is_evidence_package:false,public_release:'HOLD',production:'HOLD'};
const readiness={id:'kidults-asi-snapshot-readiness-ledger-v2',version:'2.0.0',state:'NOT_READY_EXACT_BLOCKERS_OPEN',as_of:p2Graph.as_of,platform_principles:principles,source_graph_digest:p2Lineage.graph.digest,snapshot_creation_gate_pass:false,all_dimensions_pass:false,dimensions,counts:{missions:missionCount,source_candidates:candidateCount,unique_hosts:uniqueHosts,assigned_unique_candidates:p2Results.assigned_unique_candidates,gate1_pass:gatePass,gate1_hold:gateHold,gate1_reject:gateReject,preflight_actions:p1Actions.action_count,preflight_actions_completed:completedActions,rights_pass_candidates:rightsPass,semantic_verified_grains:semanticVerified,regional_coverage_verified_missions:regionalCoverageVerified,factual_origin_independence_verified_missions:factualOriginVerified,evidence_admitted:admitted,admitted_current_sold:admittedSold,admitted_liquidity:admittedLiquidity,market_events:marketEvents,immutable_evidence_packages:0,snapshot_candidates:0,track_b_input_pairs:0},snapshot_candidate_generated:false,evidence_package_generated:false,track_b_assessment_started:false,public_release:'HOLD',production:'HOLD'};
const blockerPackage={id:'kidults-asi-immutable-blocker-package-v2',version:'2.0.0',state:'OPEN_BLOCKERS_BOUND_TO_CURRENT_CHAIN',as_of:p2Graph.as_of,source_graph_digest:p2Lineage.graph.digest,blocker_count:blockers.length,p0_blocker_count:blockers.filter(x=>x.severity==='P0').length,p1_blocker_count:blockers.filter(x=>x.severity==='P1').length,blockers,package_is_evidence_package:false,package_is_snapshot_candidate:false,public_release:'HOLD',production:'HOLD'};

const write=async(name,value)=>{const content=stableJson(value);await fs.writeFile(path.join(outputDir,name),content);return {name,sha256:hash(content),bytes:Buffer.byteLength(content)};};
const outputs=[];
outputs.push(await write('snapshot-readiness-ledger-v2.json',readiness));
outputs.push(await write('immutable-blocker-package-v2.json',blockerPackage));
outputs.push(await write('admission-demand-package-v2.json',admissionDemand));
const nonGeneration={id:'kidults-asi-snapshot-non-generation-receipt-v2',version:'2.0.0',state:'VERIFIED_NOT_GENERATED_FAIL_CLOSED',as_of:p2Graph.as_of,source_graph_digest:p2Lineage.graph.digest,snapshot_creation_gate_pass:false,snapshot_candidate_generated:false,evidence_package_generated:false,rankability_assessment_generated:false,forbidden_output_absence_required:true,readiness_ledger_digest:outputs.find(x=>x.name==='snapshot-readiness-ledger-v2.json').sha256,blocker_package_digest:outputs.find(x=>x.name==='immutable-blocker-package-v2.json').sha256,admission_demand_digest:outputs.find(x=>x.name==='admission-demand-package-v2.json').sha256,public_release:'HOLD',production:'HOLD'};
outputs.push(await write('snapshot-non-generation-receipt-v2.json',nonGeneration));
const trackB={id:'kidults-track-b-handoff-readiness-v2',version:'2.0.0',state:'WAITING_FOR_EXACT_IMMUTABLE_PAIR',as_of:p2Graph.as_of,snapshot_candidate_present:false,evidence_package_present:false,exact_pair_digest_present:false,independent_assessment_started:false,blocker_package_is_not_track_b_input:true,required_inputs:['snapshot-candidate.json','Evidence Package'],blocking_classes:blockers.map(x=>x.blocker_class),public_release:'HOLD',production:'HOLD'};
outputs.push(await write('track-b-handoff-readiness-v2.json',trackB));
const manifest={id:'kidults-asi-snapshot-readiness-manifest-v2',version:'2.0.0',state:'P3_READINESS_ASSESSED_SNAPSHOT_NOT_GENERATED',as_of:p2Graph.as_of,platform_principles:principles,input_bindings:{p0b:{registry_id:p0Registry.id,binding_id:p0Bindings.id,manifest_id:p0Manifest.id,candidate_count:candidateCount,mission_count:missionCount},p1:{gate_id:p1Gate.id,admission_id:p1Admission.id,actions_id:p1Actions.id,manifest_id:p1Manifest.id,gate1_hold:gateHold,actions_queued:queuedActions},p2:{graph_id:p2Graph.id,graph_digest:p2Lineage.graph.digest,quality_id:p2Quality.id,value_id:p2Value.id,manifest_id:p2Manifest.id,node_count:p2Graph.node_count,edge_count:p2Graph.edge_count}},results:{readiness_dimensions:dimensions.length,dimensions_pass:dimensions.filter(x=>x.state==='PASS').length,dimensions_partial:dimensions.filter(x=>x.state==='PARTIAL').length,dimensions_fail:dimensions.filter(x=>x.state==='FAIL').length,open_blockers:blockers.length,p0_blockers:blockers.filter(x=>x.severity==='P0').length,p1_blockers:blockers.filter(x=>x.severity==='P1').length,preflight_actions_queued:queuedActions,evidence_admitted:admitted,market_events_created:marketEvents,snapshot_candidates_created:0,evidence_packages_created:0,track_b_input_pairs_created:0},output_files:outputs,autonomous_effect:'POSITIVE_CURRENT_P0B_P1_P2_CHAIN_AUTOMATICALLY_ASSESSED',global_effect:'NEUTRAL_NO_NEW_EMPIRICAL_COVERAGE_CLAIM',irreplaceable_value_effect:'POSITIVE_IMMUTABLE_BLOCKER_AND_ADMISSION_DEMAND_ASSETS',transparency_effect:'POSITIVE_EXACT_BLOCKERS_COUNTS_DIGESTS_AND_NON_GENERATION_RECEIPT',public_release:'HOLD',production:'HOLD'};
await write('snapshot-readiness-manifest-v2.json',manifest);

for(const forbidden of contract.forbidden_outputs_when_gate_fails){try{await fs.access(path.join(outputDir,forbidden));throw new Error(`FORBIDDEN_OUTPUT_CREATED:${forbidden}`);}catch(e){if(e.code!=='ENOENT') throw e;}}
console.log(JSON.stringify({state:'P3_SNAPSHOT_READINESS_ASSESSED',dimensions:{pass:manifest.results.dimensions_pass,partial:manifest.results.dimensions_partial,fail:manifest.results.dimensions_fail},open_blockers:blockers.length,p0_blockers:manifest.results.p0_blockers,p1_blockers:manifest.results.p1_blockers,preflight_actions_queued:queuedActions,evidence_admitted:admitted,market_events_created:marketEvents,snapshot_candidates_created:0,track_b_input_pairs_created:0,public_release:'HOLD',production:'HOLD'},null,2));
