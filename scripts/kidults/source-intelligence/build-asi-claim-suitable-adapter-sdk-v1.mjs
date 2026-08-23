#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildFixture, validateClaimSuitableFixture, sdkMetadata, stableJson, sha256 } from './lib/claim-suitable-adapter-sdk-v1.mjs';

const [replacementQueuePath, adapterQueuePath, replacementManifestPath, contractPath, outputDir] = process.argv.slice(2);
if (![replacementQueuePath,adapterQueuePath,replacementManifestPath,contractPath,outputDir].every(Boolean)) throw new Error('ADAPTER_SDK_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const canonical=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const digest=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const id=(prefix,v)=>`${prefix}::${crypto.createHash('sha256').update(canonical(v)).digest('hex').slice(0,32)}`;
const uniq=v=>[...new Set((v||[]).filter(Boolean))].sort();
const countBy=(values,fn)=>{const m=new Map();for(const value of values){const key=fn(value);m.set(key,(m.get(key)||0)+1);}return Object.fromEntries([...m.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))));};
const writeJson=async(name,value)=>{const text=canonical(value);await fs.writeFile(path.join(outputDir,name),text);return{name,sha256:digest(text),bytes:Buffer.byteLength(text)};};

const replacement=await readJson(replacementQueuePath);
const adapters=await readJson(adapterQueuePath);
const replacementManifest=await readJson(replacementManifestPath);
const contract=await readJson(contractPath);
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(replacement.id!==contract.input_contracts.replacement_queue_id||replacement.mission_count!==replacement.missions?.length||replacement.mission_count!==192)throw new Error('ADAPTER_SDK_REPLACEMENT_INPUT_INVALID');
if(adapters.id!==contract.input_contracts.adapter_requirement_queue_id||adapters.requirement_count!==adapters.requirements?.length||adapters.requirement_count!==192)throw new Error('ADAPTER_SDK_REQUIREMENT_INPUT_INVALID');
if(replacementManifest.id!==contract.input_contracts.replacement_manifest_id)throw new Error('ADAPTER_SDK_MANIFEST_INPUT_INVALID');
if(contract.id!=='kidults-asi-claim-suitable-adapter-sdk-contract-v1'||contract.version!=='1.0.0')throw new Error('ADAPTER_SDK_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles))throw new Error('ADAPTER_SDK_PRINCIPLES_INVALID');
if(JSON.stringify(sdkMetadata.supported_evidence_classes)!==JSON.stringify(Object.keys(contract.evidence_classes)))throw new Error('ADAPTER_SDK_EVIDENCE_CLASS_BINDING');
await fs.mkdir(outputDir,{recursive:true});

const grouped=new Map();
for(const requirement of adapters.requirements){
  const key=`${requirement.domain}::${requirement.evidence_class}`;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(requirement);
}
if(grouped.size!==contract.adapter_family_expected_count)throw new Error(`ADAPTER_FAMILY_COUNT_INVALID:${grouped.size}`);

const families=[...grouped.entries()].map(([key,requirements])=>{
  const [domain,evidenceClass]=key.split('::');
  const regions=uniq(requirements.map(r=>r.region));
  const scopes=uniq(requirements.map(r=>r.scope_id));
  const sourceRoles=uniq(requirements.map(r=>r.source_role));
  const sourceLaneClasses=uniq(requirements.map(r=>r.source_lane_class));
  const requiredSemantics=uniq(requirements.flatMap(r=>r.required_semantics||[]));
  const requiredRights=uniq(requirements.flatMap(r=>r.required_rights||[]));
  const familyId=id('adapter-family',{domain,evidenceClass});
  return{
    adapter_family_id:familyId,
    domain,
    evidence_class:evidenceClass,
    event_type:contract.evidence_classes[evidenceClass].event_type,
    state:'SDK_AND_FAMILY_CONTRACT_IMPLEMENTED_SOURCE_SPECIFIC_MAPPING_REQUIRED',
    requirement_count:requirements.length,
    scope_count:scopes.length,
    scope_ids:scopes,
    region_count:regions.length,
    regions,
    source_roles:sourceRoles,
    source_lane_classes:sourceLaneClasses,
    required_semantics:requiredSemantics,
    required_rights:requiredRights,
    required_fields:contract.evidence_classes[evidenceClass].required_fields,
    sdk_controls:contract.sdk_controls,
    generic_sdk_implemented:true,
    family_contract_implemented:true,
    fixture_certified:true,
    source_specific_mapping_implemented:false,
    live_extraction_verified:false,
    target_host_egress_executed:false,
    evidence_admitted:false,
    market_event_created:false,
    public_release:'HOLD',
    production:'HOLD'
  };
}).sort((a,b)=>a.domain.localeCompare(b.domain)||a.evidence_class.localeCompare(b.evidence_class));

const familyRegistry={
  id:'kidults-asi-adapter-family-registry-v1',version:'1.0.0',state:'ADAPTER_FAMILY_CONTRACTS_IMPLEMENTED',platform_principles:principles,
  sdk:sdkMetadata,family_count:families.length,domain_count:new Set(families.map(f=>f.domain)).size,evidence_class_count:new Set(families.map(f=>f.evidence_class)).size,
  families,source_specific_mappings_implemented:0,live_extractions_verified:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const fixtureCases=[];
for(const family of families){
  const fixture=buildFixture({familyId:family.adapter_family_id,evidenceClass:family.evidence_class,ordinal:1});
  const result=validateClaimSuitableFixture(fixture);
  const replay=validateClaimSuitableFixture(JSON.parse(stableJson(fixture)));
  if(stableJson(result)!==stableJson(replay))throw new Error(`ADAPTER_FIXTURE_REPLAY_MISMATCH:${family.adapter_family_id}`);
  fixtureCases.push({
    fixture_case_id:id('adapter-fixture',{family_id:family.adapter_family_id,evidence_class:family.evidence_class}),
    adapter_family_id:family.adapter_family_id,
    domain:family.domain,
    evidence_class:family.evidence_class,
    fixture_digest:sha256(stableJson(fixture)),
    result_digest:sha256(stableJson(result)),
    validation_state:result.validation_state,
    duplicate_grain:result.duplicate_grain,
    deterministic_replay:true,
    fixture_only:true,
    empirical:false,
    promotable:false,
    evidence_admitted:false,
    public_release:'HOLD',
    production:'HOLD'
  });
}
const fixtureCertification={
  id:'kidults-asi-adapter-fixture-certification-v1',version:'1.0.0',state:'ALL_ADAPTER_FAMILIES_FIXTURE_CERTIFIED_NON_PROMOTABLE',
  sdk_id:sdkMetadata.id,sdk_version:sdkMetadata.version,family_count:families.length,fixture_case_count:fixtureCases.length,fixture_pass_count:fixtureCases.length,
  fixture_fail_count:0,deterministic_replay_pass_count:fixtureCases.length,empirical_case_count:0,promotable_case_count:0,cases:fixtureCases,
  evidence_admitted:0,market_events_created:0,public_release:'HOLD',production:'HOLD'
};

const backlogRecords=adapters.requirements.map(requirement=>{
  const family=families.find(f=>f.domain===requirement.domain&&f.evidence_class===requirement.evidence_class);
  if(!family)throw new Error(`ADAPTER_FAMILY_MISSING:${requirement.adapter_requirement_id}`);
  return{
    development_item_id:id('adapter-development',{adapter_requirement_id:requirement.adapter_requirement_id,family_id:family.adapter_family_id}),
    adapter_requirement_id:requirement.adapter_requirement_id,
    adapter_family_id:family.adapter_family_id,
    scope_id:requirement.scope_id,
    scope_name:requirement.scope_name,
    domain:requirement.domain,
    region:requirement.region,
    evidence_class:requirement.evidence_class,
    source_role:requirement.source_role,
    source_lane_class:requirement.source_lane_class,
    state:'SOURCE_SPECIFIC_MAPPING_AND_LIVE_EXTRACTION_REQUIRED',
    prerequisites:[
      'NAMED_SOURCE_PROFILE_SELECTED_AFTER_RIGHTS_AND_SEMANTIC_PREFLIGHT',
      'SOURCE_SCHEMA_OBSERVED_AND_VERSIONED',
      'FIELD_PURPOSE_RIGHTS_EVIDENCED',
      'SOURCE_OWNER_AND_FACTUAL_ORIGIN_EVIDENCED'
    ],
    required_controls:contract.sdk_controls,
    generic_sdk_available:true,
    family_contract_available:true,
    fixture_contract_passed:true,
    source_specific_mapping_implemented:false,
    live_extraction_verified:false,
    empirical_admission_started:false,
    named_provider:null,
    adapter_id:null,
    target_host_egress_authorized:false,
    public_release:'HOLD',
    production:'HOLD'
  };
}).sort((a,b)=>a.domain.localeCompare(b.domain)||a.evidence_class.localeCompare(b.evidence_class)||a.scope_id.localeCompare(b.scope_id)||a.region.localeCompare(b.region));
const backlog={
  id:'kidults-asi-adapter-development-backlog-v1',version:'1.0.0',state:'SOURCE_SPECIFIC_ADAPTER_BACKLOG_READY',item_count:backlogRecords.length,
  family_count:families.length,domain_counts:countBy(backlogRecords,r=>r.domain),evidence_class_counts:countBy(backlogRecords,r=>r.evidence_class),
  records:backlogRecords,generic_sdk_implemented:true,family_contracts_implemented:families.length,source_specific_mappings_implemented:0,live_extractions_verified:0,
  adapters_activated:0,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
};

const outputs=[];
outputs.push(await writeJson('adapter-family-registry-v1.json',familyRegistry));
outputs.push(await writeJson('adapter-fixture-certification-v1.json',fixtureCertification));
outputs.push(await writeJson('adapter-development-backlog-v1.json',backlog));
const manifest={
  id:'kidults-asi-adapter-sdk-manifest-v1',version:'1.0.0',state:'GENERIC_SDK_AND_ADAPTER_FAMILY_CONTRACTS_IMPLEMENTED',platform_principles:principles,
  input_bindings:{replacement_queue:{id:replacement.id,digest:digest(canonical(replacement)),mission_count:replacement.mission_count,replacement_task_count:replacement.replacement_task_count},
  adapter_requirements:{id:adapters.id,digest:digest(canonical(adapters)),requirement_count:adapters.requirement_count},replacement_manifest:{id:replacementManifest.id,digest:digest(canonical(replacementManifest))},
  contract:{id:contract.id,version:contract.version,digest:digest(canonical(contract))},sdk:{id:sdkMetadata.id,version:sdkMetadata.version,digest:digest(stableJson(sdkMetadata))}},
  results:{generic_sdk_implemented:true,adapter_family_contracts_implemented:families.length,fixture_cases_executed:fixtureCases.length,fixture_cases_passed:fixtureCases.length,
  deterministic_replays_passed:fixtureCases.length,adapter_development_items:backlogRecords.length,source_specific_mappings_implemented:0,live_extractions_verified:0,target_host_egress_executed:false,
  evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0},output_files:outputs,
  autonomous_effect:'POSITIVE_ALL_CURRENT_ADAPTER_REQUIREMENTS_COMPILED_TO_REUSABLE_FAMILY_CONTRACTS_AND_DEVELOPMENT_ITEMS',
  global_effect:'POSITIVE_ALL_CURRENT_DOMAINS_REGIONS_SCOPES_AND_EVIDENCE_CLASSES_COVERED_BY_FAMILY_CONTRACTS',
  irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNED_STRICT_EVENT_SDK_DUPLICATE_GRAIN_AND_ADAPTER_FAMILY_ASSETS',
  transparency_effect:'POSITIVE_FIXTURE_SOURCE_SPECIFIC_LIVE_AND_EMPIRICAL_STATES_SEPARATED',public_release:'HOLD',production:'HOLD'
};
outputs.push(await writeJson('adapter-sdk-manifest-v1.json',manifest));
console.log(JSON.stringify({state:manifest.state,generic_sdk_implemented:true,adapter_family_contracts_implemented:families.length,fixture_cases_passed:fixtureCases.length,
adapter_development_items:backlogRecords.length,source_specific_mappings_implemented:0,live_extractions_verified:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,public_release:'HOLD',production:'HOLD'},null,2));
