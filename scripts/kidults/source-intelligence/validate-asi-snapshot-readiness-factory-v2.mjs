#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [outputDir,p0RegistryPath,p0BindingsPath,p0ManifestPath,p1GatePath,p1AdmissionPath,p1ActionsPath,p1ManifestPath,p2GraphPath,p2LineagePath,p2QualityPath,p2ValuePath,p2ManifestPath,contractPath] = process.argv.slice(2);
if (![outputDir,p0RegistryPath,p0BindingsPath,p0ManifestPath,p1GatePath,p1AdmissionPath,p1ActionsPath,p1ManifestPath,p2GraphPath,p2LineagePath,p2QualityPath,p2ValuePath,p2ManifestPath,contractPath].every(Boolean)) throw new Error('P3_VALIDATION_ARGUMENTS_REQUIRED');
const fail=m=>{throw new Error(m)};
const assert=(c,m)=>{if(!c)fail(m)};
const readText=p=>fs.readFileSync(p,'utf8');
const readJson=p=>JSON.parse(readText(p));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const file=n=>path.join(outputDir,n);
const contract=readJson(contractPath);
const inputs={p0Registry:readJson(p0RegistryPath),p0Bindings:readJson(p0BindingsPath),p0Manifest:readJson(p0ManifestPath),p1Gate:readJson(p1GatePath),p1Admission:readJson(p1AdmissionPath),p1Actions:readJson(p1ActionsPath),p1Manifest:readJson(p1ManifestPath),p2Graph:readJson(p2GraphPath),p2Lineage:readJson(p2LineagePath),p2Quality:readJson(p2QualityPath),p2Value:readJson(p2ValuePath),p2Manifest:readJson(p2ManifestPath)};
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
assert(contract.id==='kidults-asi-snapshot-readiness-factory-contract-v2','CONTRACT_ID');
assert(contract.version==='2.0.0','CONTRACT_VERSION');
assert(JSON.stringify(contract.platform_principles)===JSON.stringify(principles),'CONTRACT_PRINCIPLES');
assert(contract.readiness_dimensions?.length===12,'CONTRACT_DIMENSION_COUNT');
assert(contract.required_outputs?.length===6,'CONTRACT_OUTPUT_COUNT');
assert(contract.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails===false,'CONTRACT_FAIL_CLOSED');
assert(contract.snapshot_creation_gate?.blocker_package_may_be_called_evidence_package===false,'CONTRACT_BLOCKER_BOUNDARY');
assert(contract.snapshot_creation_gate?.track_b_may_start_without_exact_immutable_pair===false,'CONTRACT_TRACK_B_BOUNDARY');
for(const name of contract.required_outputs) assert(fs.existsSync(file(name)),`MISSING_OUTPUT:${name}`);
for(const name of contract.forbidden_outputs_when_gate_fails) assert(!fs.existsSync(file(name)),`FORBIDDEN_OUTPUT_PRESENT:${name}`);

assert(inputs.p0Registry.id==='kidults-asi-p0b-source-candidate-registry-v1'&&inputs.p0Registry.canonical_candidate_count===482,'INPUT_P0_REGISTRY');
assert(inputs.p0Bindings.id==='kidults-asi-p0b-mission-candidate-binding-ledger-v1'&&inputs.p0Bindings.mission_count===192,'INPUT_P0_BINDINGS');
assert(inputs.p0Manifest.id==='kidults-asi-p0b-bounded-discovery-manifest-v1','INPUT_P0_MANIFEST');
assert(inputs.p1Gate.id==='kidults-asi-p1-gate1-source-safety-decisions-v1'&&inputs.p1Gate.decision_count===576,'INPUT_P1_GATE');
assert(inputs.p1Admission.id==='kidults-asi-p1-evidence-admission-candidate-register-v1'&&inputs.p1Admission.candidate_count===576,'INPUT_P1_ADMISSION');
assert(inputs.p1Actions.id==='kidults-asi-p1-preflight-action-queue-v1'&&inputs.p1Actions.action_count===672,'INPUT_P1_ACTIONS');
assert(inputs.p1Manifest.id==='kidults-asi-p1-source-preflight-manifest-v1','INPUT_P1_MANIFEST');
assert(inputs.p2Graph.id==='kidults-owned-source-intelligence-graph-v2'&&inputs.p2Graph.node_count===2774&&inputs.p2Graph.edge_count===6278,'INPUT_P2_GRAPH');
assert(inputs.p2Lineage.id==='kidults-owned-source-intelligence-lineage-v2'&&inputs.p2Lineage.graph?.digest===hash(stableJson(inputs.p2Graph)),'INPUT_P2_LINEAGE');
assert(inputs.p2Quality.id==='kidults-owned-source-intelligence-quality-v2'&&inputs.p2Quality.state==='VERIFIED_GRAPH_INTEGRITY_READY','INPUT_P2_QUALITY');
assert(inputs.p2Value.id==='kidults-owned-source-intelligence-value-receipt-v2'&&inputs.p2Value.source_intelligence_graph_is_market_evidence_graph===false,'INPUT_P2_VALUE');
assert(inputs.p2Manifest.id==='kidults-owned-source-intelligence-manifest-v2'&&inputs.p2Manifest.graph_digest===inputs.p2Lineage.graph.digest,'INPUT_P2_MANIFEST');

const readiness=readJson(file('snapshot-readiness-ledger-v2.json'));
const blockers=readJson(file('immutable-blocker-package-v2.json'));
const demands=readJson(file('admission-demand-package-v2.json'));
const nonGeneration=readJson(file('snapshot-non-generation-receipt-v2.json'));
const trackB=readJson(file('track-b-handoff-readiness-v2.json'));
const manifest=readJson(file('snapshot-readiness-manifest-v2.json'));

assert(readiness.id==='kidults-asi-snapshot-readiness-ledger-v2'&&readiness.version==='2.0.0','READINESS_ID');
assert(readiness.state==='NOT_READY_EXACT_BLOCKERS_OPEN','READINESS_STATE');
assert(JSON.stringify(readiness.platform_principles)===JSON.stringify(principles),'READINESS_PRINCIPLES');
assert(readiness.source_graph_digest===inputs.p2Lineage.graph.digest,'READINESS_GRAPH_DIGEST');
assert(readiness.snapshot_creation_gate_pass===false&&readiness.all_dimensions_pass===false,'READINESS_GATE');
assert(readiness.dimensions?.length===12,'READINESS_DIMENSION_COUNT');
assert(JSON.stringify(readiness.dimensions.map(x=>x.dimension))===JSON.stringify(contract.readiness_dimensions),'READINESS_DIMENSION_ORDER');
assert(readiness.dimensions.filter(x=>x.state==='PASS').length===2,'READINESS_PASS_COUNT');
assert(readiness.dimensions.filter(x=>x.state==='FAIL').length===10,'READINESS_FAIL_COUNT');
assert(readiness.counts.missions===192&&readiness.counts.source_candidates===482&&readiness.counts.unique_hosts===111,'READINESS_P0_COUNTS');
assert(readiness.counts.gate1_pass===0&&readiness.counts.gate1_hold===576&&readiness.counts.gate1_reject===0,'READINESS_GATE1_COUNTS');
assert(readiness.counts.preflight_actions===672&&readiness.counts.preflight_actions_completed===0,'READINESS_ACTION_COUNTS');
assert(readiness.counts.rights_pass_candidates===0&&readiness.counts.semantic_verified_grains===0,'READINESS_RIGHTS_SEMANTIC_COUNTS');
assert(readiness.counts.regional_coverage_verified_missions===0&&readiness.counts.factual_origin_independence_verified_missions===0,'READINESS_INDEPENDENCE_COUNTS');
assert(readiness.counts.evidence_admitted===0&&readiness.counts.admitted_current_sold===0&&readiness.counts.admitted_liquidity===0,'READINESS_EVIDENCE_COUNTS');
assert(readiness.counts.market_events===0&&readiness.counts.immutable_evidence_packages===0&&readiness.counts.snapshot_candidates===0&&readiness.counts.track_b_input_pairs===0,'READINESS_DOWNSTREAM_COUNTS');
assert(readiness.snapshot_candidate_generated===false&&readiness.evidence_package_generated===false&&readiness.track_b_assessment_started===false,'READINESS_NON_GENERATION');

assert(blockers.id==='kidults-asi-immutable-blocker-package-v2'&&blockers.version==='2.0.0','BLOCKER_ID');
assert(blockers.state==='OPEN_BLOCKERS_BOUND_TO_CURRENT_CHAIN','BLOCKER_STATE');
assert(blockers.source_graph_digest===inputs.p2Lineage.graph.digest,'BLOCKER_GRAPH_DIGEST');
assert(blockers.blocker_count===12&&blockers.blockers?.length===12,'BLOCKER_COUNT');
assert(blockers.p0_blocker_count===11&&blockers.p1_blocker_count===1,'BLOCKER_SEVERITY_COUNT');
assert(blockers.package_is_evidence_package===false&&blockers.package_is_snapshot_candidate===false,'BLOCKER_PACKAGE_BOUNDARY');
const classes=new Set(blockers.blockers.map(x=>x.blocker_class));
for(const cls of ['GATE1_HOLD_OPEN','PURPOSE_SPECIFIC_RIGHTS_UNKNOWN','MARKET_SEMANTICS_UNVERIFIED','PREFLIGHT_ACTIONS_UNEXECUTED','REGIONAL_RELEVANCE_UNPROVEN','FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN','EVIDENCE_ADMISSION_ZERO','CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO','LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO','MARKET_EVENT_GRAPH_ZERO','IMMUTABLE_EVIDENCE_PACKAGE_MISSING','TRACK_B_INPUT_PAIR_MISSING']) assert(classes.has(cls),`BLOCKER_MISSING:${cls}`);
for(const b of blockers.blockers){assert(b.state==='OPEN'&&b.snapshot_gate_effect==='BLOCK','BLOCKER_STATE_OR_EFFECT');assert(typeof b.unblock_condition==='string'&&b.unblock_condition.length>30,'BLOCKER_UNBLOCK_CONDITION');assert(Array.isArray(b.dependencies)&&b.dependencies.length>0,'BLOCKER_DEPENDENCIES');assert(Array.isArray(b.evidence_refs)&&b.evidence_refs.length>0,'BLOCKER_EVIDENCE');}

assert(demands.id==='kidults-asi-admission-demand-package-v2'&&demands.version==='2.0.0','DEMAND_ID');
assert(demands.state==='P1_ACTION_EXECUTION_REQUIRED','DEMAND_STATE');
assert(demands.source_graph_digest===inputs.p2Lineage.graph.digest,'DEMAND_GRAPH_DIGEST');
assert(demands.action_count===672&&demands.queued_action_count===672&&demands.completed_action_count===0,'DEMAND_ACTION_COUNTS');
assert(demands.action_demands?.length===672,'DEMAND_ACTION_LENGTH');
assert(Object.values(demands.action_type_counts).reduce((a,b)=>a+b,0)===672,'DEMAND_ACTION_TYPE_SUM');
assert(demands.gate1_hold_count===576&&demands.rights_unknown_count===576&&demands.semantic_unknown_count===576,'DEMAND_GATE_COUNTS');
assert(demands.regional_coverage_unproven_missions===192&&demands.factual_origin_independence_unproven_missions===192,'DEMAND_COVERAGE_COUNTS');
assert(demands.evidence_admitted===0&&demands.package_is_evidence_package===false,'DEMAND_BOUNDARY');
for(const a of demands.action_demands){assert(a.state==='QUEUED_NOT_EXECUTED','DEMAND_ACTION_STATE');assert(a.network_probe_authorized===false&&a.collection_authorized===false&&a.evidence_admitted===false,'DEMAND_ACTION_PERMISSION');}

assert(nonGeneration.id==='kidults-asi-snapshot-non-generation-receipt-v2'&&nonGeneration.state==='VERIFIED_NOT_GENERATED_FAIL_CLOSED','NON_GENERATION_ID_STATE');
assert(nonGeneration.source_graph_digest===inputs.p2Lineage.graph.digest,'NON_GENERATION_GRAPH');
assert(nonGeneration.snapshot_creation_gate_pass===false&&nonGeneration.snapshot_candidate_generated===false&&nonGeneration.evidence_package_generated===false&&nonGeneration.rankability_assessment_generated===false,'NON_GENERATION_FLAGS');
assert(nonGeneration.forbidden_output_absence_required===true,'NON_GENERATION_ABSENCE');
assert(nonGeneration.readiness_ledger_digest===hash(readText(file('snapshot-readiness-ledger-v2.json'))),'NON_GENERATION_READINESS_DIGEST');
assert(nonGeneration.blocker_package_digest===hash(readText(file('immutable-blocker-package-v2.json'))),'NON_GENERATION_BLOCKER_DIGEST');
assert(nonGeneration.admission_demand_digest===hash(readText(file('admission-demand-package-v2.json'))),'NON_GENERATION_DEMAND_DIGEST');

assert(trackB.id==='kidults-track-b-handoff-readiness-v2'&&trackB.state==='WAITING_FOR_EXACT_IMMUTABLE_PAIR','TRACK_B_ID_STATE');
assert(trackB.snapshot_candidate_present===false&&trackB.evidence_package_present===false&&trackB.exact_pair_digest_present===false&&trackB.independent_assessment_started===false,'TRACK_B_FLAGS');
assert(trackB.blocker_package_is_not_track_b_input===true,'TRACK_B_BLOCKER_BOUNDARY');
assert(trackB.required_inputs?.length===2,'TRACK_B_INPUT_COUNT');
assert(trackB.blocking_classes?.length===12,'TRACK_B_BLOCKING_CLASSES');

assert(manifest.id==='kidults-asi-snapshot-readiness-manifest-v2'&&manifest.state==='P3_READINESS_ASSESSED_SNAPSHOT_NOT_GENERATED','MANIFEST_ID_STATE');
assert(JSON.stringify(manifest.platform_principles)===JSON.stringify(principles),'MANIFEST_PRINCIPLES');
assert(manifest.input_bindings.p0b.candidate_count===482&&manifest.input_bindings.p0b.mission_count===192,'MANIFEST_P0');
assert(manifest.input_bindings.p1.gate1_hold===576&&manifest.input_bindings.p1.actions_queued===672,'MANIFEST_P1');
assert(manifest.input_bindings.p2.graph_digest===inputs.p2Lineage.graph.digest&&manifest.input_bindings.p2.node_count===2774&&manifest.input_bindings.p2.edge_count===6278,'MANIFEST_P2');
assert(manifest.results.readiness_dimensions===12&&manifest.results.dimensions_pass===2&&manifest.results.dimensions_fail===10,'MANIFEST_DIMENSIONS');
assert(manifest.results.open_blockers===12&&manifest.results.p0_blockers===11&&manifest.results.p1_blockers===1,'MANIFEST_BLOCKERS');
assert(manifest.results.preflight_actions_queued===672&&manifest.results.evidence_admitted===0&&manifest.results.market_events_created===0,'MANIFEST_PIPELINE_COUNTS');
assert(manifest.results.snapshot_candidates_created===0&&manifest.results.evidence_packages_created===0&&manifest.results.track_b_input_pairs_created===0,'MANIFEST_OUTPUT_COUNTS');
assert(manifest.output_files?.length===5,'MANIFEST_OUTPUT_FILE_COUNT');
for(const o of manifest.output_files){assert(fs.existsSync(file(o.name)),`MANIFEST_FILE_MISSING:${o.name}`);const text=readText(file(o.name));assert(o.sha256===hash(text),`MANIFEST_FILE_DIGEST:${o.name}`);assert(o.bytes===Buffer.byteLength(text),`MANIFEST_FILE_BYTES:${o.name}`);}
assert(manifest.public_release==='HOLD'&&manifest.production==='HOLD','MANIFEST_BOUNDARY');

console.log(JSON.stringify({id:'kidults-asi-snapshot-readiness-factory-validation-v2',state:'VERIFIED_PASS',readiness_dimensions:12,dimensions_pass:2,dimensions_fail:10,open_blockers:12,p0_blockers:11,p1_blockers:1,preflight_actions_queued:672,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,track_b_input_pairs_created:0,forbidden_outputs_present:0,public_release:'HOLD',production:'HOLD'},null,2));
