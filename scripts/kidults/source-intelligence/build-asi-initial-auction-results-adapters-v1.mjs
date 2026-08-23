#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildProfileFixture, mapAuctionResultFixture, adapterModuleMetadata } from './lib/initial-auction-results-adapters-v1.mjs';
import { stableJson, sha256, sdkMetadata } from './lib/claim-suitable-adapter-sdk-v1.mjs';

const [contractPath='coordination/kidults/source-intelligence/asi-initial-auction-results-adapter-contract-v1.json',outputDir='/tmp/kidults-asi-initial-auction-results-adapters-v1']=process.argv.slice(2);
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const canonical=v=>`${JSON.stringify(stable(v),null,2)}\n`;const digest=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const writeJson=async(name,value)=>{const text=canonical(value);await fs.writeFile(path.join(outputDir,name),text);return{name,sha256:digest(text),bytes:Buffer.byteLength(text)};};
const countBy=(values,fn)=>{const m=new Map();for(const value of values){const k=fn(value);m.set(k,(m.get(k)||0)+1);}return Object.fromEntries([...m.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))));};
const contract=await readJson(contractPath);const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(contract.id!=='kidults-asi-initial-auction-results-adapter-contract-v1'||contract.version!=='1.0.0')throw new Error('INITIAL_ADAPTER_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles))throw new Error('INITIAL_ADAPTER_PRINCIPLES_INVALID');
if(contract.source_profiles?.length!==6||contract.required_outputs?.length!==5)throw new Error('INITIAL_ADAPTER_PROFILE_OUTPUT_COUNT');
if(adapterModuleMetadata.mapping_count!==contract.source_profiles.length||sdkMetadata.id!==contract.sdk_binding.sdk_id)throw new Error('INITIAL_ADAPTER_MODULE_BINDING');
await fs.mkdir(outputDir,{recursive:true});

const adapterRecords=[];const fixtureCases=[];
for(const profile of contract.source_profiles){
  const fixture=buildProfileFixture(profile,1);const first=mapAuctionResultFixture(profile,fixture,{ordinal:1});const second=mapAuctionResultFixture(profile,JSON.parse(stableJson(fixture)),{ordinal:1});
  if(stableJson(first)!==stableJson(second))throw new Error(`INITIAL_ADAPTER_REPLAY_MISMATCH:${profile.profile_id}`);
  adapterRecords.push({
    adapter_id:`kidults-adapter::${profile.profile_id}`,profile_id:profile.profile_id,display_name:profile.display_name,domain:profile.domain,
    evidence_class:'CURRENT_SOLD_TRANSACTION',state:'SOURCE_SPECIFIC_MAPPING_IMPLEMENTED_FIXTURE_CERTIFIED',priority_assignment_count:profile.priority_assignment_count,
    terminal_status_fields:profile.terminal_status_fields,realized_price_fields:profile.realized_price_fields,event_time_fields:profile.event_time_fields,
    record_id_fields:profile.record_id_fields,title_fields:profile.title_fields,sdk_id:sdkMetadata.id,sdk_version:sdkMetadata.version,
    source_specific_mapping_implemented:true,fixture_certified:true,deterministic_replay:true,live_extraction_verified:false,target_host_egress_executed:false,
    rights_pass_created:false,evidence_admitted:false,market_event_created:false,public_release:'HOLD',production:'HOLD'
  });
  fixtureCases.push({
    fixture_case_id:`fixture::${profile.profile_id}`,profile_id:profile.profile_id,adapter_id:`kidults-adapter::${profile.profile_id}`,
    fixture_digest:sha256(stableJson(fixture)),mapped_event_digest:sha256(stableJson(first.event)),validation_digest:sha256(stableJson(first.validation)),
    duplicate_grain:first.validation.duplicate_grain,validation_state:first.validation.validation_state,deterministic_replay:true,fixture_only:true,
    empirical:false,promotable:false,evidence_admitted:false,market_event_created:false,public_release:'HOLD',production:'HOLD'
  });
}
const registry={
  id:'kidults-asi-source-specific-adapter-registry-v1',version:'1.0.0',state:'SIX_PRIORITY_SOURCE_MAPPINGS_IMPLEMENTED',platform_principles:principles,
  sdk:{id:sdkMetadata.id,version:sdkMetadata.version},module:adapterModuleMetadata,adapter_count:adapterRecords.length,domain_counts:countBy(adapterRecords,r=>r.domain),
  priority_assignment_coverage_count:adapterRecords.reduce((a,b)=>a+b.priority_assignment_count,0),adapters:adapterRecords,source_specific_mappings_implemented:adapterRecords.length,
  fixture_certified_adapters:adapterRecords.length,live_extractions_verified:0,target_host_egress_executed:false,evidence_admitted:0,market_events_created:0,
  public_release:'HOLD',production:'HOLD'
};
const certification={
  id:'kidults-asi-source-specific-adapter-fixture-certification-v1',version:'1.0.0',state:'ALL_INITIAL_SOURCE_MAPPINGS_FIXTURE_CERTIFIED_NON_PROMOTABLE',
  adapter_count:adapterRecords.length,fixture_case_count:fixtureCases.length,fixture_pass_count:fixtureCases.length,fixture_fail_count:0,
  deterministic_replay_pass_count:fixtureCases.length,empirical_case_count:0,promotable_case_count:0,cases:fixtureCases,evidence_admitted:0,
  market_events_created:0,public_release:'HOLD',production:'HOLD'
};
const assignmentCoverage={
  id:'kidults-asi-adapter-assignment-coverage-v1',version:'1.0.0',state:'INITIAL_PRIORITY_ASSIGNMENTS_HAVE_MAPPING_CONTRACTS',
  source_profile_count:adapterRecords.length,priority_assignment_coverage_count:registry.priority_assignment_coverage_count,
  by_profile:adapterRecords.map(r=>({profile_id:r.profile_id,display_name:r.display_name,domain:r.domain,priority_assignment_count:r.priority_assignment_count,
  mapping_implemented:true,fixture_certified:true,live_extraction_verified:false,empirical_admission_started:false})),
  by_domain:Object.fromEntries(Object.entries(countBy(contract.source_profiles.flatMap(p=>Array.from({length:p.priority_assignment_count},()=>p)),p=>p.domain))),
  source_specific_mappings_implemented:adapterRecords.length,live_extractions_verified:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};
const liveReadiness={
  id:'kidults-asi-live-extraction-readiness-v1',version:'1.0.0',state:'MAPPINGS_READY_LIVE_EXTRACTION_NOT_VERIFIED',profile_count:adapterRecords.length,
  ready_for_bounded_schema_observation_count:adapterRecords.length,live_extraction_verified_count:0,rights_pass_count:0,empirical_admission_count:0,
  profiles:adapterRecords.map(r=>({profile_id:r.profile_id,adapter_id:r.adapter_id,state:'BOUNDED_SCHEMA_OBSERVATION_REQUIRED',mapping_implemented:true,
  required_next_actions:['OBSERVE_OFFICIAL_SOURCE_SCHEMA_WITH_BOUNDED_SAFE_TRANSPORT','BIND_EXACT_SOURCE_URL_PATTERN','EVIDENCE_FIELD_PURPOSE_RIGHTS','VERIFY_TERMINAL_STATUS_AND_PRICE_SEMANTICS','VERIFY_SOURCE_OWNER_AND_FACTUAL_ORIGIN','RUN_NON_PROMOTABLE_LIVE_EXTRACTION_CANARY'],
  target_host_egress_authorized:false,rights_pass_created:false,live_extraction_verified:false,evidence_admitted:false,public_release:'HOLD',production:'HOLD'})),
  target_host_egress_executed:false,public_release:'HOLD',production:'HOLD'
};
const outputs=[];outputs.push(await writeJson('source-specific-adapter-registry-v1.json',registry));outputs.push(await writeJson('source-specific-adapter-fixture-certification-v1.json',certification));outputs.push(await writeJson('adapter-assignment-coverage-v1.json',assignmentCoverage));outputs.push(await writeJson('live-extraction-readiness-v1.json',liveReadiness));
const manifest={
  id:'kidults-asi-initial-auction-adapter-manifest-v1',version:'1.0.0',state:'SIX_SOURCE_SPECIFIC_MAPPINGS_IMPLEMENTED_AND_FIXTURE_CERTIFIED',platform_principles:principles,
  input_binding:{contract:{id:contract.id,version:contract.version,digest:digest(canonical(contract))},sdk:{id:sdkMetadata.id,version:sdkMetadata.version,digest:digest(stableJson(sdkMetadata))},module:{id:adapterModuleMetadata.id,version:adapterModuleMetadata.version,digest:digest(stableJson(adapterModuleMetadata))}},
  results:{source_profiles:adapterRecords.length,source_specific_mappings_implemented:adapterRecords.length,fixture_cases_executed:fixtureCases.length,
  fixture_cases_passed:fixtureCases.length,deterministic_replays_passed:fixtureCases.length,priority_assignment_coverage_count:registry.priority_assignment_coverage_count,
  live_extractions_verified:0,target_host_egress_executed:false,rights_pass_created:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0},
  output_files:outputs,autonomous_effect:'POSITIVE_FIRST_PRIORITY_SOURCE_MAPPINGS_AND_LIVE_READINESS_REQUIREMENTS_AUTOMATICALLY_CERTIFIED',
  global_effect:'POSITIVE_INITIAL_MAPPING_SET_SPANS_AUTOMOTIVE_AND_WATCH_DOMAINS_WITHOUT_CLAIMING_GLOBAL_COMPLETION',
  irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_SOURCE_FIELD_MAPPINGS_STRICT_NORMALIZATION_AND_DUPLICATE_GRAINS',
  transparency_effect:'POSITIVE_MAPPING_FIXTURE_LIVE_RIGHTS_AND_EMPIRICAL_STATES_EXPLICITLY_SEPARATED',public_release:'HOLD',production:'HOLD'
};outputs.push(await writeJson('initial-auction-adapter-manifest-v1.json',manifest));
console.log(JSON.stringify({state:manifest.state,source_profiles:adapterRecords.length,source_specific_mappings_implemented:adapterRecords.length,
fixture_cases_passed:fixtureCases.length,priority_assignment_coverage_count:registry.priority_assignment_coverage_count,live_extractions_verified:0,
target_host_egress_executed:false,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,public_release:'HOLD',production:'HOLD'},null,2));
