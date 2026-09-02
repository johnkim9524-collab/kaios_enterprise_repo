#!/usr/bin/env node
import fs from 'node:fs';

const files={
  contract:'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-contract-v2.json',
  registry:'coordination/kidults/source-intelligence/asi-owned-source-intelligence-graph-registry-v2.json',
  builder:'scripts/kidults/source-intelligence/build-asi-owned-source-intelligence-graph-v2.mjs',
  validator:'scripts/kidults/source-intelligence/validate-asi-owned-source-intelligence-graph-v2.mjs',
  registryValidator:'scripts/kidults/source-intelligence/validate-asi-owned-source-intelligence-graph-registry-v2.mjs',
  workflow:'.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml',
  doc:'docs/kidults/asi/asi-owned-source-intelligence-graph-v2.md'
};
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
for(const [key,p] of Object.entries(files))assert(fs.existsSync(p),`MISSING_${key.toUpperCase()}:${p}`);
const contract=json(files.contract),registry=json(files.registry),workflow=read(files.workflow),builder=read(files.builder),validator=read(files.validator),doc=read(files.doc);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
assert(contract.id==='kidults-asi-owned-source-intelligence-graph-contract-v2'&&contract.version==='2.0.0'&&contract.priority==='P2','CONTRACT_METADATA');
assert(registry.id==='kidults-asi-owned-source-intelligence-graph-registry-v2'&&registry.version==='2.0.0'&&registry.priority==='P2','REGISTRY_METADATA');
assert(JSON.stringify(contract.platform_principles)===JSON.stringify(principles)&&JSON.stringify(registry.platform_principles)===JSON.stringify(principles),'PRINCIPLE_ORDER');
assert(contract.graph_model.node_types.length===13&&new Set(contract.graph_model.node_types).size===13,'NODE_TYPES');
assert(contract.graph_model.edge_types.length===14&&new Set(contract.graph_model.edge_types).size===14,'EDGE_TYPES');
assert(contract.required_outputs.length===5&&JSON.stringify(registry.registered_outputs)===JSON.stringify(contract.required_outputs),'OUTPUTS');
for(const [key,expected] of Object.entries({contract:files.contract,builder:files.builder,validator:files.validator,registry_validator:files.registryValidator,workflow:files.workflow,human_readme:files.doc}))assert(registry.registered_assets?.[key]===expected,`REGISTRY_PATH:${key}`);
assert(registry.registered_inputs?.p0b_artifact===contract.authoritative_inputs.p0b_artifact,'P0B_ARTIFACT_BINDING');
assert(registry.registered_inputs?.p1_artifact===contract.authoritative_inputs.p1_artifact,'P1_ARTIFACT_BINDING');
assert(registry.automatic_activation?.main_push===false&&registry.automatic_activation?.schedule===null,'INDEPENDENT_ACTIVATION_FORBIDDEN');
assert(JSON.stringify(registry.automatic_activation?.upstream_workflows)===JSON.stringify(contract.automatic_activation.upstream_workflows),'UPSTREAM_WORKFLOWS');
assert(registry.automatic_activation?.transactional_input_binding==='P0B_AND_P1_ARTIFACTS_FROM_ONE_SUCCESSFUL_P1_RUN'&&registry.automatic_activation.transactional_input_binding===contract.automatic_activation.transactional_input_binding,'TRANSACTIONAL_INPUT_BINDING');
assert(registry.automatic_activation?.manual_dispatch_role==='RECOVERY_OR_EXPLICIT_REPLAY_ONLY','MANUAL_ROLE');
for(const [key,value] of Object.entries(contract.truth_boundary)){
  if(key==='creates_kidults_owned_source_intelligence')assert(value===true,`TRUTH:${key}`);
  else if(key==='public_release'||key==='production')assert(value==='HOLD',`TRUTH:${key}`);
  else assert(value===false,`TRUTH:${key}`);
}
for(const [key,value] of Object.entries(registry.truth_boundary)){
  if(key==='public_release'||key==='production')assert(value==='HOLD',`REGISTRY_TRUTH:${key}`);
  else assert(value===false,`REGISTRY_TRUTH:${key}`);
}
for(const marker of ['kidults-asi-p0b-source-candidate-registry-v1','kidults-asi-p0b-mission-candidate-binding-ledger-v1','kidults-asi-p1-gate1-source-safety-decisions-v1','kidults-asi-p1-evidence-admission-candidate-register-v1','kidults-asi-p1-preflight-action-queue-v1','P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED','market_evidence_node:false','evidence_admitted:0','snapshot_candidates_created:0'])assert(builder.includes(marker),`BUILDER_MARKER:${marker}`);
for(const marker of ['DUPLICATE_NODE_ID','EDGE_REFERENCE_INVALID','FORBIDDEN_GRAPH_SEMANTICS','GRAPH_PROMOTION_OVERCLAIM','OUTPUT_DIGEST','MANIFEST_PROMOTION_OVERCLAIM'])assert(validator.includes(marker),`VALIDATOR_MARKER:${marker}`);
for(const marker of ['workflow_dispatch:','pull_request:','workflow_run:',"'KIDULTS ASI P1 Source Preflight v1'",'validate-p2-lineage-pr:',"if: github.event_name == 'pull_request'",'P2_PR_CONTROL_ONLY_VALIDATION_PASS','authoritative_artifact_publish=false','Restore transactionally paired P0B and P1 inputs from one authoritative P1 run','/actions/runs/${P1_RUN_ID}/artifacts','P1_SOURCE_SHA="$CURRENT_SHA"','test "$P1_SOURCE_SHA" = "$CURRENT_SHA"','github.event.workflow_run.id','SAME_SUCCESSFUL_P1_WORKFLOW_RUN','.p0b_input_mode=="EXACT_TRIGGERING_WORKFLOW_RUN"','.trigger_event=="workflow_run"','P0B_ORIGIN_RUN_ID','Build owned source-intelligence graph twice','Reject source-candidate-as-evidence mutation','Reject market-event node mutation','Reject evidence-admission mutation','Reject orphan-edge mutation','Reject graph-digest mutation','Reject manual-only P2 activation mutation','Emit KPMO P2 owned-value receipt','Emit immutable P2 diagnostic receipt'])assert(workflow.includes(marker),`WORKFLOW_MARKER:${marker}`);
assert(workflow.includes("if: github.event_name != 'pull_request' && (github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success')"),'AUTHORITATIVE_P2_JOB_MUST_EXCLUDE_PULL_REQUEST');
assert(!workflow.includes('git merge-base --is-ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"'),'ANCESTOR_GENERATION_FALLBACK_FORBIDDEN');
assert(!/^\s{2}(schedule|push):/m.test(workflow),'INDEPENDENT_TRIGGER_FORBIDDEN');
assert(!workflow.includes('/actions/artifacts?per_page='),'GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(workflow.includes('contents: read')&&workflow.includes('actions: read')&&workflow.includes('persist-credentials: false'),'WORKFLOW_PERMISSIONS');
assert(!workflow.includes('contents: write')&&!workflow.includes('git push'),'WORKFLOW_MUTATION_FORBIDDEN');
for(const marker of ['# KIDULTS ASI Owned Source Intelligence Graph v2','P0B','P1','13 node types','14 edge types','Source Candidate ≠ Evidence','Admission Candidate ≠ Admitted Evidence','P2_OWNED_SOURCE_INTELLIGENCE_GRAPH_VERIFIED'])assert(doc.includes(marker),`DOC_MARKER:${marker}`);
console.log(JSON.stringify({id:'kidults-asi-owned-source-intelligence-graph-registry-validation-v2',state:'VERIFIED_PASS',principles,node_types:13,edge_types:14,outputs:5,automatic_main_push:false,automatic_schedule:null,automatic_upstream_workflows:1,transactional_input_binding:'P0B_AND_P1_ARTIFACTS_FROM_ONE_SUCCESSFUL_P1_RUN',exact_current_generation_required:true,ancestor_generation_fallback_allowed:false,pull_request_authoritative_artifact_publish:false,selected_p1_transitive_origin_enforced:true,direct_repository_mutation_from_workflow:false,public_release:'HOLD',production:'HOLD'},null,2));
