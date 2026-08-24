#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildPurposeRightsIndex, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const [templateOutputDir='/tmp/kidults-asi-source-adapter-template-expansion-v1',testReceiptPath='/tmp/bonhams-cars-adapter-test-receipt-v1.json'] = process.argv.slice(2);
const files={
  adapterContract:'coordination/kidults/source-intelligence/asi-bonhams-cars-results-adapter-contract-v1.json',
  adapterRegistry:'coordination/kidults/source-intelligence/asi-bonhams-cars-results-adapter-registry-v1.json',
  templateContract:'coordination/kidults/source-intelligence/asi-source-adapter-template-expansion-contract-v1.json',
  runtimeContract:'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json',
  sourceFrontier:'coordination/kidults/source-intelligence/targeted-high-authority-source-expansion-v1.psv',
  rightsPreflight:'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json',
  rightsGate:'scripts/kidults/source-intelligence/lib/source-purpose-rights-gate-v1.mjs',
  adapterModule:'services/kidults-autonomous-intelligence/src/asi/source-adapters/bonhams-cars-results.ts',
  genericRuntime:'services/kidults-autonomous-intelligence/src/asi/market-adapter.ts',
  adapterTest:'services/kidults-autonomous-intelligence/scripts/asi-bonhams-cars-results-adapter-test.mjs',
  templateBuilder:'scripts/kidults/source-intelligence/build-asi-source-adapter-template-expansion-v1.mjs',
  validator:'scripts/kidults/source-intelligence/validate-asi-bonhams-cars-results-adapter-v1.mjs',
  workflow:'.github/workflows/kidults-asi-bonhams-cars-results-adapter-v1.yml',
  documentation:'docs/kidults/asi/asi-bonhams-cars-results-adapter-v1.md'
};
const fail=m=>{throw new Error(m)};const assert=(c,m)=>{if(!c)fail(m)};const read=p=>fs.readFileSync(p,'utf8');const json=p=>JSON.parse(read(p));
for(const [key,p] of Object.entries(files))assert(fs.existsSync(p),`MISSING_${key.toUpperCase()}:${p}`);
const adapter=json(files.adapterContract),registry=json(files.adapterRegistry),template=json(files.templateContract),runtime=json(files.runtimeContract),rightsPreflight=json(files.rightsPreflight);
const moduleSource=read(files.adapterModule),testSource=read(files.adapterTest),builderSource=read(files.templateBuilder),workflow=read(files.workflow),doc=read(files.documentation),frontier=read(files.sourceFrontier);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
assert(adapter.id==='kidults-asi-bonhams-cars-results-adapter-contract-v1'&&adapter.version==='1.0.0','ADAPTER_CONTRACT_ID');
assert(adapter.status==='IMPLEMENTED_FIXTURE_VERIFIED_NOT_RIGHTS_OR_LIVE_SCHEMA_VERIFIED','ADAPTER_STATUS');
assert(JSON.stringify(adapter.platform_principles)===JSON.stringify(principles),'ADAPTER_PRINCIPLES');
assert(adapter.source_profile.source_id===undefined||adapter.source_id==='bonhams-cars-results','ADAPTER_SOURCE_ID');
assert(adapter.source_profile.adapter_state==='IMPLEMENTED_NOT_RIGHTS_VERIFIED','ADAPTER_STATE');
assert(JSON.stringify(adapter.source_profile.implemented_claim_parsers)===JSON.stringify(['DATED_OBSERVED_SOLD_TRANSACTION']),'ADAPTER_IMPLEMENTED_CLAIMS');
assert(adapter.implementation_truth.source_specific_parser_implemented===true,'ADAPTER_PARSER_TRUTH');
assert(adapter.implementation_truth.deterministic_fixture_tests_implemented===true,'ADAPTER_TEST_TRUTH');
assert(adapter.implementation_truth.generic_market_adapter_runtime_bound===true,'ADAPTER_RUNTIME_BINDING');
assert(adapter.implementation_truth.live_source_snapshot_verified_count===0&&adapter.implementation_truth.field_purpose_rights_verified===false,'ADAPTER_EMPIRICAL_BOUNDARY');
assert(adapter.implementation_truth.adapter_activated===false&&adapter.implementation_truth.empirical_market_events_admitted===0,'ADAPTER_ACTIVATION_BOUNDARY');
assert(adapter.fixture_policy.fixtures_are_synthetic_control_only===true&&adapter.fixture_policy.fixtures_can_create_market_event_or_claim===false,'ADAPTER_FIXTURE_BOUNDARY');
assert(adapter.required_mutation_families.length===8,'ADAPTER_MUTATION_COUNT');

assert(registry.id==='kidults-asi-bonhams-cars-results-adapter-registry-v1','REGISTRY_ID');
assert(registry.implementation_state.source_specific_parsers_implemented===1&&registry.implementation_state.registered_source_profiles===16&&registry.implementation_state.adapter_templates_generated===16,'REGISTRY_COUNTS');
assert(registry.implementation_state.source_specific_adapters_activated===0&&registry.implementation_state.empirical_market_events_admitted===0,'REGISTRY_ACTIVATION_BOUNDARY');
assert(registry.next_execution?.fallback_execution?.includes('PURPOSE_RIGHTS_PREFLIGHT_ONLY') && registry.next_execution?.fallback_execution?.includes('ONLY_AFTER_RIGHTS_CLEAR'),'REGISTRY_RIGHTS_FIRST_FALLBACK');
assert(registry.automatic_activation.main_push===true&&registry.automatic_activation.schedule==='37 */3 * * *'&&registry.automatic_activation.upstream_workflows.length===2,'REGISTRY_AUTOMATION');
for(const [key,expected] of Object.entries({
  adapter_contract:files.adapterContract,template_contract:files.templateContract,runtime_contract:files.runtimeContract,source_frontier:files.sourceFrontier,purpose_rights_preflight:files.rightsPreflight,purpose_rights_gate:files.rightsGate,
  adapter_module:files.adapterModule,generic_runtime:files.genericRuntime,adapter_test:files.adapterTest,template_builder:files.templateBuilder,validator:files.validator,workflow:files.workflow,documentation:files.documentation
}))assert(registry.registered_assets[key]===expected,`REGISTRY_PATH:${key}`);

assert(template.id==='kidults-asi-source-adapter-template-expansion-contract-v1'&&template.required_profile_count===16,'TEMPLATE_CONTRACT');
assert(JSON.stringify(template.platform_principles)===JSON.stringify(principles),'TEMPLATE_PRINCIPLES');
assert(template.reference_adapter.source_id==='bonhams-cars-results','TEMPLATE_REFERENCE');
assert(template.implementation_gate?.required_decision==='RIGHTS_CLEAR_FOR_PURPOSE'&&template.implementation_gate?.discovery_metadata_is_not_rights_clearance===true,'TEMPLATE_RIGHTS_GATE');
assert(template.required_template_controls.length===19,'TEMPLATE_CONTROL_COUNT');
assert(template.truth_boundary.template_is_source_specific_adapter===false&&template.truth_boundary.evidence_admitted===0,'TEMPLATE_BOUNDARY');
assert(runtime.registered_source_profiles.length===16&&runtime.registered_source_profiles[0][1]==='bonhams-cars-results','RUNTIME_PROFILES');
assert(frontier.includes('bonhams-cars-results|Bonhams Cars Auction Results'),'FRONTIER_REFERENCE_SOURCE');
assert(rightsPreflight.id==='kidults-top16-empirical-activation-preflight-v1'&&rightsPreflight.rows?.length===16,'RIGHTS_PREFLIGHT_INPUT');
const rightsIndex=buildPurposeRightsIndex(rightsPreflight,runtime.registered_source_profiles.map((tuple)=>tuple[1]),'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION');

for(const marker of [
  'parseBonhamsCarsSoldSnapshot','getBonhamsCarsReferenceAdapterProfile','SOURCE_PAYLOAD_HASH_MISMATCH','LISTING_ESTIMATE_BID_OFFER_OR_RESERVE_IS_NOT_SOLD',
  'AMBIGUOUS_DOLLAR_CURRENCY','SOLD_WITHOUT_EXPLICIT_REALIZED_PRICE','SOURCE_HOST_NOT_ALLOWED','SOURCE_SCHEME_NOT_HTTPS',
  "adapter_state: 'IMPLEMENTED_NOT_RIGHTS_VERIFIED'",'normalizeDatedSoldTransaction','evidence_admitted: false','market_event_created: false'
])assert(moduleSource.includes(marker),`MODULE_MARKER:${marker}`);
for(const marker of [
  'BONHAMS_REFERENCE_ADAPTER_REPLAY_NOT_DETERMINISTIC','estimate-is-not-sold','ambiguous-dollar-rejected','sold-without-price-rejected','script-only-sold-is-not-semantic-proof',
  'SOURCE_PAYLOAD_HASH_MISMATCH','SOURCE_HOST_NOT_ALLOWED','SOURCE_SCHEME_NOT_HTTPS','negative_fixture_mutations_rejected'
])assert(testSource.includes(marker),`TEST_MARKER:${marker}`);
for(const marker of ['SIXTEEN_SOURCE_TEMPLATES_EXPANDED','REFERENCE_ADAPTER_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED','TEMPLATE_GENERATED_IMPLEMENTATION_PENDING','source-adapter-development-backlog-v1.json','RIGHTS_CLEAR_FOR_PURPOSE','RIGHTS_GATED_NO_ELIGIBLE_PROFILE'])assert(builderSource.includes(marker),`BUILDER_MARKER:${marker}`);
assert(builderSource.includes('buildPurposeRightsIndex') && builderSource.includes('CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'),'BUILDER_PURPOSE_RIGHTS_GATE');
for(const marker of [
  'workflow_dispatch:','schedule:',"cron: '37 */3 * * *'",'push:','pull_request:','workflow_run:',"'KIDULTS ASI Autonomous Resolution Layer v1'",'Run Bonhams Cars reference adapter fixture and mutation proof',
  'Build all 16 source adapter templates twice','Reject fixture promotion mutation','Reject template-as-adapter mutation','Emit KPMO reference-adapter receipt'
])assert(workflow.includes(marker),`WORKFLOW_MARKER:${marker}`);
assert(workflow.includes('contents: read')&&!workflow.includes('contents: write')&&workflow.includes('persist-credentials: false')&&!workflow.includes('git push'),'WORKFLOW_MUTATION_BOUNDARY');
for(const marker of ['# KIDULTS ASI Bonhams Cars Results Reference Adapter v1','Reference Adapter','16-Source Template Expansion','First Evidence Admission','0 admitted Evidence'])assert(doc.includes(marker),`DOC_MARKER:${marker}`);

for(const name of template.required_outputs)assert(fs.existsSync(path.join(templateOutputDir,name)),`TEMPLATE_OUTPUT_MISSING:${name}`);
assert(fs.existsSync(testReceiptPath),'TEST_RECEIPT_MISSING');
const testReceipt=json(testReceiptPath),templateRegistry=json(path.join(templateOutputDir,'source-adapter-template-registry-v1.json')),
  backlog=json(path.join(templateOutputDir,'source-adapter-development-backlog-v1.json')),manifest=json(path.join(templateOutputDir,'source-adapter-template-expansion-manifest-v1.json'));
assert(testReceipt.id==='kidults-asi-bonhams-cars-results-adapter-test-receipt-v1'&&testReceipt.state==='VERIFIED_PASS','TEST_RECEIPT_STATE');
assert(testReceipt.source_specific_parser_implemented===true&&testReceipt.generic_market_adapter_runtime_bound===true&&testReceipt.deterministic_replay_verified===true,'TEST_RECEIPT_IMPLEMENTATION');
assert(testReceipt.positive_fixture_candidates_parsed===1&&testReceipt.negative_fixture_mutations_rejected===8,'TEST_RECEIPT_COUNTS');
assert(testReceipt.live_source_snapshots_verified===0&&testReceipt.field_purpose_rights_verified===false&&testReceipt.adapter_activated===false&&testReceipt.evidence_admitted===0,'TEST_RECEIPT_BOUNDARY');
assert(templateRegistry.id==='kidults-asi-source-adapter-template-registry-v1'&&templateRegistry.profile_count===16,'TEMPLATE_REGISTRY_COUNT');
assert(templateRegistry.reference_adapter_count===1&&templateRegistry.template_pending_count===15,'TEMPLATE_IMPLEMENTATION_PARTITION');
const expectedRightsClear=[...rightsIndex.values()].filter((value)=>value.decision===RIGHTS_CLEAR).length;
assert(templateRegistry.rights_clear_profile_count===expectedRightsClear&&templateRegistry.rights_hold_profile_count===16-expectedRightsClear,'TEMPLATE_RIGHTS_COUNTS');
assert(templateRegistry.adapter_backlog_eligible_profile_count===expectedRightsClear,'TEMPLATE_BACKLOG_ELIGIBILITY_COUNT');
assert(templateRegistry.source_specific_adapters_implemented===1&&templateRegistry.source_specific_adapters_activated===0&&templateRegistry.evidence_admitted===0,'TEMPLATE_ACTIVATION_BOUNDARY');
assert(new Set(templateRegistry.profiles.map(p=>p.source_id)).size===16,'TEMPLATE_PROFILE_DUPLICATE');
const expectedIds=new Set(runtime.registered_source_profiles.map(tuple=>tuple[1]));assert(templateRegistry.profiles.every(p=>expectedIds.has(p.source_id)),'TEMPLATE_PROFILE_BINDING');
const referenceProfile=templateRegistry.profiles.find(p=>p.source_id==='bonhams-cars-results');assert(referenceProfile.implementation_state==='REFERENCE_ADAPTER_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED','REFERENCE_PROFILE_STATE');
assert(referenceProfile.claim_states.DATED_OBSERVED_SOLD_TRANSACTION==='PARSER_IMPLEMENTED_FIXTURE_VERIFIED_RIGHTS_AND_LIVE_SCHEMA_HOLD','REFERENCE_CLAIM_STATE');
assert(templateRegistry.profiles.filter(p=>p.source_id!=='bonhams-cars-results').every(p=>p.implementation_state==='TEMPLATE_GENERATED_IMPLEMENTATION_PENDING'),'PENDING_PROFILE_STATE');
assert(templateRegistry.profiles.every(p=>p.field_purpose_rights_verified===false&&p.adapter_activated===false&&p.evidence_admitted===0&&p.provider_direct_to_index_or_projection_allowed===false),'PROFILE_PROMOTION_BOUNDARY');
for(const profile of templateRegistry.profiles){const expected=rightsIndex.get(profile.source_id);assert(profile.rights_eligibility_state===expected.decision&&profile.rights_eligibility_reason_codes.join('|')===expected.reason_codes.join('|'),'PROFILE_RIGHTS_BINDING');assert(profile.eligible_for_acquisition_or_adapter_backlog===(expected.decision===RIGHTS_CLEAR),'PROFILE_RIGHTS_ELIGIBILITY');}
assert(backlog.backlog_count===expectedRightsClear&&backlog.items.length===expectedRightsClear&&backlog.rights_preflight_queue_count===16-expectedRightsClear,'BACKLOG_RIGHTS_COUNTS');
assert(backlog.implementation_priority_rule==='RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_ACQUISITION_PRIORITY','BACKLOG_RIGHTS_RULE');
assert(backlog.rights_preflight_queue.every((item)=>rightsIndex.get(item.source_id)?.decision!==RIGHTS_CLEAR),'RIGHTS_QUEUE_ONLY_HOLD');
assert(manifest.results.registered_profiles===16&&manifest.results.reference_adapters_implemented===1&&manifest.results.templates_generated===16&&manifest.results.templates_pending_implementation===15&&manifest.results.rights_clear_profiles===expectedRightsClear&&manifest.results.adapter_backlog_eligible_profiles===expectedRightsClear,'MANIFEST_COUNTS');
assert(manifest.results.source_specific_adapters_activated===0&&manifest.results.live_source_snapshots_verified===0&&manifest.results.evidence_admitted===0&&manifest.results.market_events_created===0,'MANIFEST_BOUNDARY');
assert(manifest.output_files.length===2,'MANIFEST_OUTPUT_DIGEST_COUNT');
for(const output of manifest.output_files){const raw=read(path.join(templateOutputDir,output.name));const digest=`sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;assert(output.sha256===digest&&output.bytes===Buffer.byteLength(raw),`MANIFEST_OUTPUT_DIGEST:${output.name}`);}

console.log(JSON.stringify({
  id:'kidults-asi-bonhams-cars-results-adapter-validation-v1',version:'1.0.0',state:'VERIFIED_PASS',
  reference_adapters_implemented:1,reference_adapter_fixture_verified:true,registered_source_profiles:16,adapter_templates_generated:16,templates_pending_source_implementation:15,
  live_source_snapshots_verified:0,field_purpose_rights_verified_sources:0,source_specific_adapters_activated:0,evidence_admitted:0,market_events_created:0,
  first_evidence_admission_state:'BLOCKED_PENDING_EMPIRICAL_RIGHTS_SCHEMA_SEMANTICS_OWNER_ORIGIN_AND_ACTIVATION',public_release:'HOLD',production:'HOLD'
},null,2));
