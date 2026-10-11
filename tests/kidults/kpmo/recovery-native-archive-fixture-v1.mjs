import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
import {SPECS,evaluateHealth,allowedArtifactRedirect,assessProducerCohort,generationIdForProducers} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {COVERAGE_PUBLIC_RESULT_KEYS,REPOSITORY,stable,digest,readArchive,validateProducerContent,validateCoverageAliasClosure} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {validateSentinelObservation} from '../../../scripts/kidults/kpmo/validate-sentinel-observation-v1.mjs';
import {buildMaterialRegistry,materialRegistryDigest} from '../../../scripts/kidults/kpmo/material-defect-registry-v3.mjs';
import {MEMBERS,generationId} from '../../../scripts/kidults/kpmo/canonical-generation-v3-lib.mjs';
import {finalizeCoverageCanonicalLeader} from '../../../scripts/kidults/source-intelligence/resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs';
import {buildSemanticInputMaterial,AUTHORITATIVE_INPUT_FILE_KEYS,IMPLEMENTATION_FILES} from '../../../scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-semantic-input-v1.mjs';


// Synthetic native-contract bytes for integration tests only; never runtime evidence.
const sha='a'.repeat(40),observed='2026-09-05T12:00:00Z',d='sha256:'+'b'.repeat(64);
const text=x=>JSON.stringify(x,null,2)+'\n';

function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [name,value] of entries){
  const n=Buffer.from(name),raw=Buffer.from(value),compressed=deflateRawSync(raw);
  let crc=0xffffffff;for(const byte of raw){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  local.push(h,n,compressed);central.push(c,n);offset+=h.length+n.length+compressed.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.reduce((n,b)=>n+b.length,0),12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,end]);
}


function fixture(id,entries){
 const spec=SPECS.find(s=>s.id===id),n=SPECS.indexOf(spec)+10;
 const names={SHADOW:'KIDULTS ASI SHADOW Operating Evidence v1',REQUIREMENT:'KIDULTS ASI Requirement-to-Adapter Coverage v1',RESERVE:'KIDULTS ASI Sharded Source Reserve v1',CANONICAL_TRUTH:'KPMO Live Canonical Issue Truth V1'};
 const run={id:n,run_attempt:1,name:names[id],repository:{full_name:REPOSITORY},path:spec.path,head_branch:'main',head_sha:sha,event:spec.events[0],status:'completed',conclusion:'success',created_at:'2026-09-05T10:00:00Z',run_started_at:'2026-09-05T10:00:00Z',display_title:`KIDULTS Coverage / source-${sha}`};
 const bytes=zip(entries);const artifact={id:n+100,name:spec.artifactForRun?spec.artifactForRun(run):spec.artifacts[0],size_in_bytes:bytes.length,expired:false,digest:digest(bytes),created_at:'2026-09-05T10:01:00Z',expires_at:'2026-12-01T00:00:00Z',workflow_run:{id:n,head_sha:sha}};
 return {spec,run,artifact,bytes,entries};
}

function canonicalFixture(){
 const records=buildMaterialRegistry([{number:2015,state:'open',title:'[P1] SYNTHETIC material issue',labels:['P1']}]);
 const output={validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',version:'3.1.0',authority_model:'CANONICAL_GENERATION_V3_ONLY',generation_id:generationId(sha,123,1),aggregate_comment_id:456,canonical_issues:[...MEMBERS],active_baseline_trust_root_defects:[],canonical_main_policy:'EXACT_CURRENT_MAIN_COMMITTED_V3_GENERATION',dynamic_query_pagination_verified:true,dynamic_query_cardinality_verified:true,dynamic_query_incomplete_results_rejected:true,dynamic_new_defect_discovery_mutation_rejected:true,dynamic_defect_omission_mutation_rejected:true,canonical_main_ancestry_verified:true,legacy_v2_body_authority:false,state:'VERIFIED_PASS',protected_main_sha:sha,material_defect_count:1,material_defects:records,material_defect_registry_sha256:materialRegistryDigest(records),material_defect_query_cardinality:{P0:0,P1:1},empirical_promotion:false,whole_platform_closure:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 const receipt={receipt_id:'kpmo-live-canonical-issue-truth-receipt-v1',version:'1.1.0',state:'VERIFIED_PASS',validation_outcome:'success',failure_class:null,repository:REPOSITORY,head_sha:sha,run_id:13,run_attempt:1,event:'workflow_run',workflow_name:'KPMO Live Canonical Issue Truth V1',workflow_path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',validation_output_sha256:digest(text(output)),validation_output_state:'VERIFIED_PASS',validated_protected_main_sha:sha,material_defect_issue_numbers:[2015],material_defect_count:1,material_defect_registry_sha256:materialRegistryDigest(records),material_defect_query_cardinality:{P0:0,P1:1},promotion_eligible:false,production:'HOLD',public:'HOLD'};
 return fixture('CANONICAL_TRUTH',[['canonical-truth-receipt-v1.json',text(receipt)],['canonical-truth-validation-output-v1.json',text(output)]]);
}

function coverageMaterialFixture(){
 const contractPath='coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json';
 const contractBytes=fs.readFileSync(contractPath),contract=JSON.parse(contractBytes);
 const files=Object.fromEntries(AUTHORITATIVE_INPUT_FILE_KEYS.map(k=>[k,{path:contract.authoritative_inputs[k],digest:digest(fs.readFileSync(contract.authoritative_inputs[k]))}]));
 const implementations=Object.fromEntries(IMPLEMENTATION_FILES.map(file=>[file,{path:file,digest:digest(fs.readFileSync(file))}]));
 const results={replacement_missions:1,original_actions:2,terminal_actions:2,gate1_remaining_hold:0};
 const manifest={id:'kidults-asi-autonomous-resolution-manifest-v1',version:'1.0.0',results,input_bindings:{contract:{digest:d},adapter_contract:{digest:d,profiles:16},frontier:{digest:d,records:64},crosswalk:{digest:d,records:32}},output_files:[{name:'replacement-source-mission-queue-v1.json',bytes:123,sha256:d}]};
 const receipt={id:'kidults-asi-autonomous-resolution-layer-kpmo-receipt-v1',version:'1.1.0',state:'VERIFIED_PASS',source_sha:sha,trigger_event:'workflow_run',artifact_role:'AUTHORITATIVE_CONSUMABLE',authoritative_producer:true,downstream_consumable:true,p1_source_sha:sha,exact_generation_bound:true,exact_triggering_run_bound:true,validation_only:false,promotion_authority:false,artifact_cardinality:1,results,autonomous_effect:'SYNTHETIC_CONTROL',global_effect:'SYNTHETIC_CONTROL',irreplaceable_value_effect:'SYNTHETIC_CONTROL',transparency_effect:'SYNTHETIC_CONTROL',live_target_site_network_requests:0,rights_pass_created:0,evidence_admitted:0,market_events_created:0,snapshot_candidates_created:0,public_release:'HOLD',production:'HOLD'};
 return buildSemanticInputMaterial({sourceSha:sha,upstreamClass:'ASI_AUTONOMOUS_RESOLUTION',queue:{id:'kidults-asi-replacement-source-mission-queue-v1',version:'1.0.0',missions:[{mission_id:'SYNTHETIC_CONTROL'}]},manifest,receipt,coverageContract:contract,coverageContractBytes:contractBytes,authoritativeInputDigests:files,authoritativeInputConstants:Object.fromEntries(Object.entries(contract.authoritative_inputs).filter(([k])=>!AUTHORITATIVE_INPUT_FILE_KEYS.includes(k))),implementationDigests:implementations});
}


function coverageFixture(){
 const baseline=JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json')).expected_current_main_baseline;
 const semantic={id:'kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1',version:'1.0.0',state:'VERIFIED_PASS_SEMANTIC_INPUT_BOUND',material:coverageMaterialFixture(),exact_upstream_provenance_included_in_identity:false,exact_upstream_provenance_required_in_observation_receipt:true,runtime_dedupe_state:'REMOTE_LEDGER_ACTIVATION_HOLD',canonical_execution_claimed:false,public:'HOLD',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'};semantic.canonical_input_digest=digest(stable(semantic.material));
 const results={
  accountable_gap_records:153,acknowledgement_count:0,adapters_activated:0,claim_parser_not_implemented_requirements:138,
  context_only_requirements:15,dead_letter_queue_count:0,duplicate_requirements:0,duplicate_sdk_or_runtime_introduced:0,
  durable_consumer_implemented:false,evidence_admitted:0,family_count:16,first_admission_count:0,
  gap_record_to_work_unit_memberships:189,gap_records_with_generic_fallback:153,gap_records_with_idempotency_key:153,
  gap_records_with_sla:153,gap_work_units:52,gate1_remaining_hold:0,implemented_source_adapters:16,
  internal_unbound_execution_queue_count:0,legacy_v2_adapter_requirement_ids_synthesized:0,live_source_requests_executed:0,
  market_events_created:0,original_preflight_actions:2,projections_created:0,provider_contacts_executed:0,
  registered_source_profiles:16,replacement_missions_with_rights_clear_profiles:0,replacement_source_slots_filled:0,
  requirements_accounted_for:192,retry_count:0,rights_clear_gate:'RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION',
  rights_clear_registered_profiles:0,rights_hold_registered_profiles:16,rights_passes_created:0,rights_preflight_queue_items:16,
  rights_schema_activation_hold_requirements:192,schema_bound_claim_parser_requirements:33,schema_bound_source_claim_work_units:10,
  silently_dropped_requirements:0,snapshot_candidates_created:0,software_implemented_requirements:39,
  source_discovery_or_schema_activation_hold_requirements:153,source_discovery_work_units:42,
  source_profile_discovery_requirements:120,terminal_preflight_actions:2,track_b_results_created:0,
  unique_rights_clear_profiles_selected:0,unresolved_preflight_actions:0,
 };
 assert.deepEqual(Object.keys(results).sort(),COVERAGE_PUBLIC_RESULT_KEYS);
 for(const key of COVERAGE_PUBLIC_RESULT_KEYS.filter(key=>Object.hasOwn(baseline,key)))assert.equal(results[key],baseline[key]);
 const receipt={id:'kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1',version:'1.3.0',state:'VERIFIED_PASS_INTERNAL_QUEUE_ACCOUNTABLE_EXTERNAL_ACTIVATION_HOLD',source_sha:sha,consumer_sha:sha,evidence_refs:['workflow_run:11'],canonical_run_key:`${sha}:ASI_AUTONOMOUS_RESOLUTION`,production_authorized:false,results,public_release:'HOLD',production:'HOLD',g5:'HOLD'};
 for(const k of ['live_source_requests_executed','provider_contacts_executed','rights_passes_created','adapters_activated','evidence_admitted','market_events_created','snapshot_candidates_created','track_b_results_created','projections_created'])receipt[k]=0;
 const leader=finalizeCoverageCanonicalLeader({repository:REPOSITORY,source_sha:sha,trigger_event:'workflow_run',run_id:11,run_attempt:1,upstream_class:'ASI_AUTONOMOUS_RESOLUTION',canonical_run_key:receipt.canonical_run_key,canonical_input_digest:semantic.canonical_input_digest,semantic_input_receipt_digest:digest(text(semantic)),canonical_contract_digest:semantic.material.coverage_contract.digest,upstream_binding_digest:d,upstream_workflow_run_id:500,upstream_artifact_id:600,upstream_artifact_digest:d,coverage_consumer_sha:sha,coverage_run_head_sha:sha,coverage_run_display_title:`KIDULTS Coverage / source-${sha}`,observed_at:'2026-09-05T10:01:00Z',coverage_manifest_digest:d,coverage_kpmo_receipt_digest:digest(text(receipt)),archive_validation_receipt_digest:d,guard_receipt_digest:d});
 return fixture('REQUIREMENT',[['kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1.json',text(receipt)],['coverage-canonical-leader-receipt-v1.json',text(leader)],['coverage-semantic-input-receipt-v1.json',text(semantic)]]);
}

function reserveFixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-reserve-fixture-'));
 try{
  fs.writeFileSync(path.join(tmp,'input.json'),text({candidates:[{endpoint_url:'https://synthetic.example.invalid/item',observed_at:'2026-09-05T10:00:00Z',discovery_provider:'SYNTHETIC_CONTROL'}]}));
  const out=path.join(tmp,'out');const child=spawnSync(process.execPath,['scripts/kidults/source-intelligence/build-asi-sharded-source-reserve-v1.mjs',path.join(tmp,'input.json'),path.join(tmp,'absent'),out],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});assert.equal(child.status,0,child.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'asi-sharded-source-reserve-manifest-v1.json')));
  const r={id:'kidults-asi-sharded-source-reserve-activation-receipt-v1',state:'VERIFIED_PASS',trigger_event:'repository_dispatch',discovery_producer_run_id:500,discovery_producer_head_sha:sha,discovery_artifact_id:600,exact_generation_bound:true,validation_only:false,promotion_authority:false,reserve_is_not_safe_pool:true,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD'};
  for(const [a,b] of Object.entries({reserve_cycle:'cycle_number',reserve_unique_candidates:'unique_candidate_count',reserve_unique_hosts:'unique_host_count',reserve_new_candidates:'new_candidate_count',reserve_updated_candidates:'updated_candidate_count',reserve_nonempty_shards:'nonempty_shard_count',reserve_design_capacity:'design_capacity_minimum_candidates'}))r[a]=manifest[b];
  return fixture('RESERVE',[['asi-sharded-source-reserve-activation-receipt-v1.json',text(r)],['reserve/asi-sharded-source-reserve-manifest-v1.json',text(manifest)],...manifest.shards.map(s=>[`reserve/${s.path}`,fs.readFileSync(path.join(out,s.path),'utf8')])]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

export function producerFixtures(){return [fixture('SHADOW',[['asi-shadow-operating-evidence-run-1.json',fs.readFileSync('artifacts/agci-os/asi-shadow-operating-evidence-v1.json','utf8')]]),coverageFixture(),reserveFixture(),canonicalFixture()];}
export {zip,text};
