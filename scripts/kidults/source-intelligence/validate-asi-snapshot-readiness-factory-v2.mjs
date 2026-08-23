#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args=process.argv.slice(2);
if(args.length!==14) throw new Error('P3_VALIDATION_ARGUMENTS_REQUIRED');
const [out,p0r,p0b,p0m,p1g,p1a,p1q,p1m,p2g,p2l,p2q,p2v,p2m,cp]=args;
const fail=m=>{throw new Error(m)};
const ok=(c,m)=>{if(!c)fail(m)};
const text=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(text(p));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const sha=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const f=n=>path.join(out,n);
const C=json(cp),I={p0r:json(p0r),p0b:json(p0b),p0m:json(p0m),p1g:json(p1g),p1a:json(p1a),p1q:json(p1q),p1m:json(p1m),p2g:json(p2g),p2l:json(p2l),p2q:json(p2q),p2v:json(p2v),p2m:json(p2m)};
const P=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];

ok(C.id==='kidults-asi-snapshot-readiness-factory-contract-v2'&&C.version==='2.0.0','CONTRACT_ID_VERSION');
ok(JSON.stringify(C.platform_principles)===JSON.stringify(P),'CONTRACT_PRINCIPLES');
ok(C.readiness_dimensions?.length===12&&C.required_outputs?.length===6,'CONTRACT_COUNTS');
ok(C.snapshot_creation_gate?.snapshot_candidate_may_be_generated_when_gate_fails===false,'CONTRACT_FAIL_CLOSED');
ok(C.snapshot_creation_gate?.blocker_package_may_be_called_evidence_package===false,'CONTRACT_BLOCKER_BOUNDARY');
ok(C.snapshot_creation_gate?.track_b_may_start_without_exact_immutable_pair===false,'CONTRACT_TRACK_B_BOUNDARY');
for(const n of C.required_outputs) ok(fs.existsSync(f(n)),`MISSING_OUTPUT:${n}`);
for(const n of C.forbidden_outputs_when_gate_fails) ok(!fs.existsSync(f(n)),`FORBIDDEN_OUTPUT_PRESENT:${n}`);

ok(I.p0r.id==='kidults-asi-p0b-source-candidate-registry-v1'&&I.p0r.canonical_candidate_count>0&&I.p0r.unique_host_count>0,'INPUT_P0_REGISTRY');
ok(I.p0b.id==='kidults-asi-p0b-mission-candidate-binding-ledger-v1'&&I.p0b.mission_count===192&&I.p0b.bindings?.length===192,'INPUT_P0_BINDINGS');
ok(I.p0m.id==='kidults-asi-p0b-bounded-discovery-manifest-v1','INPUT_P0_MANIFEST');
ok(I.p1g.id==='kidults-asi-p1-gate1-source-safety-decisions-v1'&&I.p1g.decision_count===576&&I.p1g.decisions?.length===576,'INPUT_P1_GATE');
ok(I.p1a.id==='kidults-asi-p1-evidence-admission-candidate-register-v1'&&I.p1a.candidate_count===576&&I.p1a.candidates?.length===576,'INPUT_P1_ADMISSION');
ok(I.p1q.id==='kidults-asi-p1-preflight-action-queue-v1'&&I.p1q.action_count===672&&I.p1q.actions?.length===672,'INPUT_P1_ACTIONS');
ok(I.p1m.id==='kidults-asi-p1-source-preflight-manifest-v1','INPUT_P1_MANIFEST');
ok(I.p2g.id==='kidults-owned-source-intelligence-graph-v2'&&I.p2g.node_count>0&&I.p2g.edge_count>0,'INPUT_P2_GRAPH');
ok(I.p2l.id==='kidults-owned-source-intelligence-lineage-v2'&&I.p2l.graph?.digest===sha(sj(I.p2g)),'INPUT_P2_LINEAGE');
ok(I.p2q.id==='kidults-owned-source-intelligence-quality-v2'&&I.p2q.state==='VERIFIED_GRAPH_INTEGRITY_READY','INPUT_P2_QUALITY');
ok(I.p2v.id==='kidults-owned-source-intelligence-value-receipt-v2'&&I.p2v.source_intelligence_graph_is_market_evidence_graph===false,'INPUT_P2_VALUE');
ok(I.p2m.id==='kidults-owned-source-intelligence-manifest-v2'&&I.p2m.graph_digest===I.p2l.graph.digest,'INPUT_P2_MANIFEST');
ok(I.p2m.results?.source_candidates===I.p0r.canonical_candidate_count,'INPUT_P0_P2_CANDIDATE_DRIFT');
ok(I.p2m.results?.canonical_hosts===I.p0r.unique_host_count,'INPUT_P0_P2_HOST_DRIFT');
ok(I.p2m.results?.nodes===I.p2g.node_count&&I.p2m.results?.edges===I.p2g.edge_count,'INPUT_P2_MANIFEST_COUNTS');

const R=json(f('snapshot-readiness-ledger-v2.json')),B=json(f('immutable-blocker-package-v2.json')),D=json(f('admission-demand-package-v2.json')),N=json(f('snapshot-non-generation-receipt-v2.json')),T=json(f('track-b-handoff-readiness-v2.json')),M=json(f('snapshot-readiness-manifest-v2.json'));

ok(R.id==='kidults-asi-snapshot-readiness-ledger-v2'&&R.state==='NOT_READY_EXACT_BLOCKERS_OPEN','READINESS_ID_STATE');
ok(JSON.stringify(R.platform_principles)===JSON.stringify(P)&&R.source_graph_digest===I.p2l.graph.digest,'READINESS_BINDING');
ok(R.snapshot_creation_gate_pass===false&&R.all_dimensions_pass===false,'READINESS_GATE');
ok(R.dimensions?.length===12&&JSON.stringify(R.dimensions.map(x=>x.dimension))===JSON.stringify(C.readiness_dimensions),'READINESS_DIMENSIONS');
ok(R.dimensions.filter(x=>x.state==='PASS').length===2&&R.dimensions.filter(x=>x.state==='FAIL').length===10,'READINESS_PASS_FAIL_COUNTS');
ok(R.counts.missions===192&&R.counts.source_candidates===I.p0r.canonical_candidate_count&&R.counts.unique_hosts===I.p0r.unique_host_count,'READINESS_P0_COUNTS');
ok(R.counts.assigned_unique_candidates===I.p2m.results.assigned_unique_candidates,'READINESS_ASSIGNED_COUNT');
ok(R.counts.gate1_pass===I.p1g.pass_count&&R.counts.gate1_hold===I.p1g.hold_count&&R.counts.gate1_reject===I.p1g.reject_count,'READINESS_GATE1_COUNTS');
ok(R.counts.preflight_actions===672&&R.counts.preflight_actions_completed===I.p1q.actions.filter(x=>['COMPLETED','PASS','VERIFIED_PASS'].includes(x.state)).length,'READINESS_ACTION_COUNTS');
ok(R.counts.rights_pass_candidates===0&&R.counts.semantic_verified_grains===0,'READINESS_RIGHTS_SEMANTIC_COUNTS');
ok(R.counts.regional_coverage_verified_missions===I.p0b.missions_with_regional_coverage_proven&&R.counts.factual_origin_independence_verified_missions===I.p0b.missions_with_factual_origin_independence_proven,'READINESS_INDEPENDENCE_COUNTS');
ok(R.counts.evidence_admitted===0&&R.counts.admitted_current_sold===0&&R.counts.admitted_liquidity===0,'READINESS_EVIDENCE_COUNTS');
ok(R.counts.market_events===0&&R.counts.immutable_evidence_packages===0&&R.counts.snapshot_candidates===0&&R.counts.track_b_input_pairs===0,'READINESS_DOWNSTREAM_COUNTS');
ok(R.snapshot_candidate_generated===false&&R.evidence_package_generated===false&&R.track_b_assessment_started===false,'READINESS_NON_GENERATION');

ok(B.id==='kidults-asi-immutable-blocker-package-v2'&&B.state==='OPEN_BLOCKERS_BOUND_TO_CURRENT_CHAIN','BLOCKER_ID_STATE');
ok(B.source_graph_digest===I.p2l.graph.digest&&B.blocker_count===12&&B.blockers?.length===12,'BLOCKER_COUNT');
ok(B.p0_blocker_count===11&&B.p1_blocker_count===1,'BLOCKER_SEVERITY_COUNT');
ok(B.package_is_evidence_package===false&&B.package_is_snapshot_candidate===false,'BLOCKER_PACKAGE_BOUNDARY');
const classes=new Set(B.blockers.map(x=>x.blocker_class));
for(const c of ['GATE1_HOLD_OPEN','PURPOSE_SPECIFIC_RIGHTS_UNKNOWN','MARKET_SEMANTICS_UNVERIFIED','PREFLIGHT_ACTIONS_UNEXECUTED','REGIONAL_RELEVANCE_UNPROVEN','FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN','EVIDENCE_ADMISSION_ZERO','CURRENT_SOLD_TRANSACTION_EVIDENCE_ZERO','LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO','MARKET_EVENT_GRAPH_ZERO','IMMUTABLE_EVIDENCE_PACKAGE_MISSING','TRACK_B_INPUT_PAIR_MISSING']) ok(classes.has(c),`BLOCKER_MISSING:${c}`);
for(const b of B.blockers){ok(b.state==='OPEN'&&b.snapshot_gate_effect==='BLOCK','BLOCKER_STATE_OR_EFFECT');ok(typeof b.unblock_condition==='string'&&b.unblock_condition.length>30,'BLOCKER_UNBLOCK_CONDITION');ok(b.dependencies?.length>0&&b.evidence_refs?.length>0,'BLOCKER_BINDING');}

ok(D.id==='kidults-asi-admission-demand-package-v2'&&D.state==='P1_ACTION_EXECUTION_REQUIRED','DEMAND_ID_STATE');
ok(D.source_graph_digest===I.p2l.graph.digest&&D.action_count===672&&D.queued_action_count===672&&D.completed_action_count===0,'DEMAND_ACTION_COUNTS');
ok(D.action_demands?.length===672&&Object.values(D.action_type_counts).reduce((a,b)=>a+b,0)===672,'DEMAND_ACTION_BINDING');
ok(D.gate1_hold_count===576&&D.rights_unknown_count===576&&D.semantic_unknown_count===576,'DEMAND_GATE_COUNTS');
ok(D.regional_coverage_unproven_missions===192&&D.factual_origin_independence_unproven_missions===192,'DEMAND_COVERAGE_COUNTS');
ok(D.evidence_admitted===0&&D.package_is_evidence_package===false,'DEMAND_BOUNDARY');
for(const a of D.action_demands) ok(a.state==='QUEUED_NOT_EXECUTED'&&a.network_probe_authorized===false&&a.collection_authorized===false&&a.evidence_admitted===false,'DEMAND_ACTION_PERMISSION');

ok(N.id==='kidults-asi-snapshot-non-generation-receipt-v2'&&N.state==='VERIFIED_NOT_GENERATED_FAIL_CLOSED','NON_GENERATION_ID_STATE');
ok(N.source_graph_digest===I.p2l.graph.digest&&N.snapshot_creation_gate_pass===false,'NON_GENERATION_GRAPH_GATE');
ok(N.snapshot_candidate_generated===false&&N.evidence_package_generated===false&&N.rankability_assessment_generated===false&&N.forbidden_output_absence_required===true,'NON_GENERATION_FLAGS');
ok(N.readiness_ledger_digest===sha(text(f('snapshot-readiness-ledger-v2.json'))),'NON_GENERATION_READINESS_DIGEST');
ok(N.blocker_package_digest===sha(text(f('immutable-blocker-package-v2.json'))),'NON_GENERATION_BLOCKER_DIGEST');
ok(N.admission_demand_digest===sha(text(f('admission-demand-package-v2.json'))),'NON_GENERATION_DEMAND_DIGEST');

ok(T.id==='kidults-track-b-handoff-readiness-v2'&&T.state==='WAITING_FOR_EXACT_IMMUTABLE_PAIR','TRACK_B_ID_STATE');
ok(T.snapshot_candidate_present===false&&T.evidence_package_present===false&&T.exact_pair_digest_present===false&&T.independent_assessment_started===false,'TRACK_B_FLAGS');
ok(T.blocker_package_is_not_track_b_input===true&&T.required_inputs?.length===2&&T.blocking_classes?.length===12,'TRACK_B_BOUNDARY');

ok(M.id==='kidults-asi-snapshot-readiness-manifest-v2'&&M.state==='P3_READINESS_ASSESSED_SNAPSHOT_NOT_GENERATED','MANIFEST_ID_STATE');
ok(JSON.stringify(M.platform_principles)===JSON.stringify(P),'MANIFEST_PRINCIPLES');
ok(M.input_bindings.p0b.candidate_count===I.p0r.canonical_candidate_count&&M.input_bindings.p0b.mission_count===192,'MANIFEST_P0');
ok(M.input_bindings.p1.gate1_hold===576&&M.input_bindings.p1.actions_queued===672,'MANIFEST_P1');
ok(M.input_bindings.p2.graph_digest===I.p2l.graph.digest&&M.input_bindings.p2.node_count===I.p2g.node_count&&M.input_bindings.p2.edge_count===I.p2g.edge_count,'MANIFEST_P2');
ok(M.results.readiness_dimensions===12&&M.results.dimensions_pass===2&&M.results.dimensions_fail===10,'MANIFEST_DIMENSIONS');
ok(M.results.open_blockers===12&&M.results.p0_blockers===11&&M.results.p1_blockers===1,'MANIFEST_BLOCKERS');
ok(M.results.preflight_actions_queued===672&&M.results.evidence_admitted===0&&M.results.market_events_created===0,'MANIFEST_PIPELINE_COUNTS');
ok(M.results.snapshot_candidates_created===0&&M.results.evidence_packages_created===0&&M.results.track_b_input_pairs_created===0,'MANIFEST_OUTPUT_COUNTS');
ok(M.output_files?.length===5,'MANIFEST_OUTPUT_FILE_COUNT');
for(const o of M.output_files){ok(fs.existsSync(f(o.name)),`MANIFEST_FILE_MISSING:${o.name}`);const t=text(f(o.name));ok(o.sha256===sha(t)&&o.bytes===Buffer.byteLength(t),`MANIFEST_FILE_DIGEST:${o.name}`);}
ok(M.public_release==='HOLD'&&M.production==='HOLD','MANIFEST_BOUNDARY');

console.log(JSON.stringify({id:'kidults-asi-snapshot-readiness-factory-validation-v2',state:'VERIFIED_PASS',current_source_candidates:I.p0r.canonical_candidate_count,current_unique_hosts:I.p0r.unique_host_count,current_p2_nodes:I.p2g.node_count,current_p2_edges:I.p2g.edge_count,readiness_dimensions:12,dimensions_pass:2,dimensions_fail:10,open_blockers:12,p0_blockers:11,p1_blockers:1,preflight_actions_queued:672,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,track_b_input_pairs_created:0,forbidden_outputs_present:0,public_release:'HOLD',production:'HOLD'},null,2));
