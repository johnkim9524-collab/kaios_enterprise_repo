#!/usr/bin/env node
import fs from 'node:fs';

const files={
  contract:'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-contract-v2.json',
  registry:'coordination/kidults/source-intelligence/asi-snapshot-readiness-factory-registry-v2.json',
  builder:'scripts/kidults/source-intelligence/build-asi-snapshot-readiness-factory-v2.mjs',
  validator:'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-v2.mjs',
  registryValidator:'scripts/kidults/source-intelligence/validate-asi-snapshot-readiness-factory-registry-v2.mjs',
  workflow:'.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml',
  doc:'docs/kidults/asi/asi-snapshot-readiness-factory-v2.md'
};
const fail=m=>{throw new Error(m)};
const assert=(c,m)=>{if(!c)fail(m)};
const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
for(const [k,p] of Object.entries(files)) assert(fs.existsSync(p),`MISSING_${k.toUpperCase()}:${p}`);
const contract=json(files.contract),registry=json(files.registry),workflow=read(files.workflow),doc=read(files.doc),builder=read(files.builder),validator=read(files.validator);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
assert(contract.id==='kidults-asi-snapshot-readiness-factory-contract-v2'&&contract.version==='2.0.0','CONTRACT_ID_VERSION');
assert(registry.id==='kidults-asi-snapshot-readiness-factory-registry-v2'&&registry.version==='2.0.0','REGISTRY_ID_VERSION');
assert(registry.owner==='KPMO'&&registry.priority==='P3','REGISTRY_OWNER_PRIORITY');
assert(JSON.stringify(contract.platform_principles)===JSON.stringify(principles),'CONTRACT_PRINCIPLES');
assert(JSON.stringify(registry.platform_principles)===JSON.stringify(principles),'REGISTRY_PRINCIPLES');
for(const [key,expected] of Object.entries({contract:files.contract,builder:files.builder,validator:files.validator,registry_validator:files.registryValidator,workflow:files.workflow,documentation:files.doc})) assert(registry.registered_assets?.[key]===expected,`REGISTRY_PATH:${key}`);
assert(JSON.stringify(registry.input_artifacts)===JSON.stringify(['kidults-asi-p0b-bounded-discovery-candidates-v1','kidults-asi-p1-source-preflight-v1','kidults-asi-owned-source-intelligence-graph-v2']),'REGISTRY_INPUT_ARTIFACTS');
assert(registry.automatic_activation?.main_push===false,'REGISTRY_MAIN_PUSH');
assert(registry.automatic_activation?.schedule==='UPSTREAM_WORKFLOW_ONLY','REGISTRY_SCHEDULE');
assert(registry.automatic_activation?.upstream_workflow==='KIDULTS ASI Owned Source Intelligence Graph v2','REGISTRY_UPSTREAM');
assert(registry.automatic_activation?.manual_dispatch_role==='RECOVERY_OR_EXPLICIT_REPLAY_ONLY','REGISTRY_MANUAL_ROLE');
assert(registry.release_semantics?.blocker_package_is_evidence_package===false,'REGISTRY_BLOCKER_BOUNDARY');
for(const marker of ['workflow_dispatch:','workflow_run:',"'KIDULTS ASI Owned Source Intelligence Graph v2'",'kidults-asi-p0b-bounded-discovery-candidates-v1','kidults-asi-p1-source-preflight-v1','kidults-asi-owned-source-intelligence-graph-v2','resolve_latest_ancestor_artifact','P2_EVENT_RUN_ID','Build current P3 readiness twice','Reject false snapshot candidate mutation','Reject false evidence admission mutation','Reject Track B start mutation','Reject missing blocker mutation','Reject blocker package as Evidence Package mutation','Reject manual-only activation mutation','Emit KPMO P3 receipt']) assert(workflow.includes(marker),`WORKFLOW_MARKER:${marker}`);
assert(!/^\s{2}(schedule|push|pull_request):/m.test(workflow),'WORKFLOW_UNBOUND_TRIGGER_FORBIDDEN');
assert(!workflow.includes('/actions/artifacts?per_page='),'WORKFLOW_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(workflow.includes('/actions/runs/${run_id}/artifacts?per_page=100')&&workflow.includes('/actions/runs/${P2_RUN_ID}/artifacts?per_page=100'),'WORKFLOW_EXACT_RUN_ARTIFACT_BINDING');
assert(workflow.includes('contents: read')&&!workflow.includes('contents: write'),'WORKFLOW_PERMISSION');
assert(workflow.includes('persist-credentials: false')&&!workflow.includes('git push'),'WORKFLOW_MUTATION_BOUNDARY');
for(const marker of ['kidults-asi-snapshot-readiness-ledger-v2','kidults-asi-immutable-blocker-package-v2','kidults-asi-admission-demand-package-v2','kidults-asi-snapshot-non-generation-receipt-v2','kidults-track-b-handoff-readiness-v2']) assert(builder.includes(marker),`BUILDER_MARKER:${marker}`);
for(const marker of ['READINESS_GATE1_COUNTS','BLOCKER_COUNT','DEMAND_ACTION_COUNTS','NON_GENERATION_FLAGS','TRACK_B_FLAGS','MANIFEST_OUTPUT_COUNTS']) assert(validator.includes(marker),`VALIDATOR_MARKER:${marker}`);
for(const marker of ['# KIDULTS ASI Snapshot Readiness Factory v2','Current P0B → P1 → P2 v2 chain','672','576','482','2,774','6,278','Blocker Package ≠ Evidence Package','Snapshot Readiness ≠ Snapshot Candidate']) assert(doc.includes(marker),`DOC_MARKER:${marker}`);
console.log(JSON.stringify({id:'kidults-asi-snapshot-readiness-factory-registry-validation-v2',state:'VERIFIED_PASS',input_artifacts:3,readiness_dimensions:contract.readiness_dimensions.length,required_outputs:contract.required_outputs.length,automatic_main_push:false,automatic_schedule:registry.automatic_activation.schedule,automatic_upstream_workflow:registry.automatic_activation.upstream_workflow,direct_repository_mutation:false,public_release:'HOLD',production:'HOLD'},null,2));
