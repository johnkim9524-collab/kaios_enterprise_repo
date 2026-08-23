#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [runtimeContractPath,frontierPath,referenceContractPath,templateContractPath,outputDir] = process.argv.slice(2);
if (![runtimeContractPath,frontierPath,referenceContractPath,templateContractPath,outputDir].every(Boolean)) throw new Error('SOURCE_ADAPTER_TEMPLATE_ARGUMENTS_REQUIRED');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const stableJson=v=>`${JSON.stringify(stable(v),null,2)}\n`;
const hash=v=>`sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const parsePsv=text=>{const lines=text.split(/\r?\n/).filter(x=>x.trim());const header=lines.shift().split('|');return lines.map(line=>{const values=line.split('|');return Object.fromEntries(header.map((key,index)=>[key,String(values[index]??'').trim()]));});};
const write=async(name,value)=>{const text=stableJson(value);await fs.writeFile(path.join(outputDir,name),text);return{name,sha256:hash(text),bytes:Buffer.byteLength(text)}};

const [runtime,reference,contract,frontierText]=await Promise.all([
  readJson(runtimeContractPath),readJson(referenceContractPath),readJson(templateContractPath),fs.readFile(frontierPath,'utf8')
]);
const frontier=parsePsv(frontierText),frontierById=new Map(frontier.map(record=>[record.source_id,record]));
const principles=['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT'];
if(runtime.id!=='kidults-asi-p1-market-event-adapter-runtime-contract-v1'||runtime.registered_source_profiles?.length!==16)throw new Error('RUNTIME_CONTRACT_INVALID');
if(reference.id!=='kidults-asi-bonhams-cars-results-adapter-contract-v1')throw new Error('REFERENCE_CONTRACT_INVALID');
if(contract.id!=='kidults-asi-source-adapter-template-expansion-contract-v1'||contract.required_profile_count!==16)throw new Error('TEMPLATE_CONTRACT_INVALID');
if(JSON.stringify(contract.platform_principles)!==JSON.stringify(principles))throw new Error('TEMPLATE_PRINCIPLES_INVALID');
await fs.mkdir(outputDir,{recursive:true});

function family(record){
  const roles=record.source_roles.split(';');
  if(record.channel_type.includes('API'))return 'STRUCTURED_API_MARKET_DATA';
  if(roles.includes('SOLD_TRANSACTION')&&record.channel_type.includes('AUCTION'))return 'PUBLIC_WEB_AUCTION_RESULTS';
  if(roles.includes('SOLD_TRANSACTION')||record.channel_type.includes('MARKETPLACE'))return 'PUBLIC_WEB_MARKETPLACE_RESULTS';
  return 'PUBLIC_WEB_RELEASE_OR_LISTING_SURFACE';
}
function claimState(sourceId,claim){
  if(sourceId==='bonhams-cars-results'&&claim==='DATED_OBSERVED_SOLD_TRANSACTION')return 'PARSER_IMPLEMENTED_FIXTURE_VERIFIED_RIGHTS_AND_LIVE_SCHEMA_HOLD';
  if(claim==='CURRENT_PRICE')return 'DERIVED_GATE_DEPENDS_ON_ADMITTED_DATED_SOLD';
  if(sourceId==='bonhams-cars-results'&&claim==='LIQUIDITY_OR_TIME_TO_SALE')return 'TEMPLATE_READY_EXPOSURE_DENOMINATOR_IMPLEMENTATION_PENDING';
  return 'TEMPLATE_READY_IMPLEMENTATION_PENDING';
}

const profiles=runtime.registered_source_profiles.map(([priorityRank,sourceId,verifiedAssignmentCount,targetClaims])=>{
  const source=frontierById.get(sourceId);if(!source)throw new Error(`SOURCE_NOT_IN_FRONTIER:${sourceId}`);
  const isReference=sourceId===contract.reference_adapter.source_id;
  return{
    priority_rank:priorityRank,source_id:sourceId,display_name:source.display_name,core_domain:source.core_domain,
    collection_scope_ids:source.collection_scope_ids.split(';').filter(Boolean),source_roles:source.source_roles.split(';').filter(Boolean),
    official_endpoint:source.official_endpoint,official_documentation_url:source.official_documentation_url,
    channel_type:source.channel_type,access_mode:source.access_mode,template_family:family(source),
    target_claims:targetClaims,verified_assignment_count:verifiedAssignmentCount,
    implementation_state:isReference?'REFERENCE_ADAPTER_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED':'TEMPLATE_GENERATED_IMPLEMENTATION_PENDING',
    source_specific_module:isReference?contract.reference_adapter.module:null,
    source_specific_test:isReference?contract.reference_adapter.test:null,
    claim_states:Object.fromEntries(targetClaims.map(claim=>[claim,claimState(sourceId,claim)])),
    required_controls:contract.required_template_controls,
    live_source_snapshot_verified_count:0,field_purpose_rights_verified:false,source_schema_empirically_verified:false,
    sold_semantics_empirically_verified:false,liquidity_semantics_empirically_verified:false,
    source_owner_verified:false,factual_origin_verified:false,adapter_activated:false,evidence_admitted:0,market_events_created:0,
    provider_direct_to_index_or_projection_allowed:false,public_release:'HOLD',production:'HOLD'
  };
});
if(profiles.length!==16||new Set(profiles.map(p=>p.source_id)).size!==16)throw new Error('PROFILE_COUNT_OR_DUPLICATE');

const registry={
  id:'kidults-asi-source-adapter-template-registry-v1',version:'1.0.0',state:'SIXTEEN_SOURCE_TEMPLATES_EXPANDED',
  platform_principles:principles,profile_count:profiles.length,reference_adapter_count:profiles.filter(p=>p.implementation_state.startsWith('REFERENCE')).length,
  template_pending_count:profiles.filter(p=>p.implementation_state==='TEMPLATE_GENERATED_IMPLEMENTATION_PENDING').length,
  template_family_counts:Object.fromEntries(contract.template_families.map(f=>[f,profiles.filter(p=>p.template_family===f).length])),
  profiles,source_specific_adapters_implemented:1,source_specific_adapters_activated:0,evidence_admitted:0,market_events_created:0,
  public_release:'HOLD',production:'HOLD'
};
const backlog={
  id:'kidults-asi-source-adapter-development-backlog-v1',version:'1.0.0',state:'PRIORITIZED_FROM_REGISTERED_PROFILE_IMPACT',
  backlog_count:profiles.length,items:profiles.map(p=>({
    rank:p.priority_rank,source_id:p.source_id,display_name:p.display_name,template_family:p.template_family,
    verified_assignment_count:p.verified_assignment_count,target_claims:p.target_claims,implementation_state:p.implementation_state,
    required_next_steps:p.implementation_state.startsWith('REFERENCE')?[
      'BOUNDED_LIVE_SCHEMA_PREFLIGHT','PURPOSE_SPECIFIC_RIGHTS_ADJUDICATION','SOURCE_OWNER_AND_FACTUAL_ORIGIN_VERIFICATION','EMPIRICAL_SEMANTICS_PROOF','ACTIVATION_GATE','FIRST_EVIDENCE_ADMISSION'
    ]:[
      'SOURCE_SPECIFIC_PARSER_IMPLEMENTATION','DETERMINISTIC_FIXTURE_AND_MUTATION_TESTS','GENERIC_RUNTIME_BINDING','BOUNDED_LIVE_SCHEMA_PREFLIGHT','PURPOSE_SPECIFIC_RIGHTS_ADJUDICATION','SOURCE_OWNER_AND_FACTUAL_ORIGIN_VERIFICATION','EMPIRICAL_SEMANTICS_PROOF','ACTIVATION_GATE'
    ],
    rights_state:'UNKNOWN',live_schema_state:'UNVERIFIED',adapter_activated:false,evidence_admitted:0,public_release:'HOLD',production:'HOLD'
  })).sort((a,b)=>a.rank-b.rank||a.source_id.localeCompare(b.source_id)),
  public_release:'HOLD',production:'HOLD'
};
const outputs=[];outputs.push(await write('source-adapter-template-registry-v1.json',registry));outputs.push(await write('source-adapter-development-backlog-v1.json',backlog));
const manifest={
  id:'kidults-asi-source-adapter-template-expansion-manifest-v1',version:'1.0.0',state:'VERIFIED_TEMPLATE_EXPANSION_READY_FOR_VALIDATION',
  input_bindings:{runtime_contract:{id:runtime.id,digest:hash(stableJson(runtime))},frontier:{records:frontier.length,digest:hash(frontierText)},reference_contract:{id:reference.id,digest:hash(stableJson(reference))},template_contract:{id:contract.id,digest:hash(stableJson(contract))}},
  results:{registered_profiles:profiles.length,reference_adapters_implemented:1,templates_generated:16,templates_pending_implementation:15,source_specific_adapters_activated:0,live_source_snapshots_verified:0,evidence_admitted:0,market_events_created:0},
  output_files:outputs,autonomous_effect:'POSITIVE_ONE_REFERENCE_TEMPLATE_EXPANDS_DETERMINISTICALLY_TO_ALL_REGISTERED_PROFILES',
  global_effect:'POSITIVE_ALL_REGISTERED_DOMAINS_AND_SOURCE_CHANNEL_FAMILIES_SHARE_ONE_NON_COMPENSATING_CONTROL_TEMPLATE',
  irreplaceable_value_effect:'POSITIVE_KIDULTS_OWNS_THE_ADAPTER_CONTROL_MODEL_AND_SOURCE_SWITCHING_BACKLOG',
  transparency_effect:'POSITIVE_IMPLEMENTED_TEMPLATE_PENDING_RIGHTS_SCHEMA_AND_ACTIVATION_STATES_ARE_SEPARATE',
  public_release:'HOLD',production:'HOLD'
};
outputs.push(await write('source-adapter-template-expansion-manifest-v1.json',manifest));
console.log(JSON.stringify({state:manifest.state,...manifest.results,public_release:'HOLD',production:'HOLD'},null,2));
