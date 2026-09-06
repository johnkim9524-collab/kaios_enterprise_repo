#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {buildMaterialRegistry,materialRegistryDigest,parityFailures} from './material-defect-registry-v3.mjs';
import {MEMBERS,BASELINE} from './canonical-generation-v3-lib.mjs';
import {AUTHORITATIVE_INPUT_FILE_KEYS,DOMAIN,IMPLEMENTATION_FILES,MANIFEST_ALLOWLIST,PROJECTION_VERSION,RECEIPT_ALLOWLIST,VOLATILE_PROVENANCE_EXCLUSIONS} from '../source-intelligence/build-asi-requirement-adapter-coverage-semantic-input-v1.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
export const MAX_ARCHIVE_BYTES=8*1024*1024;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const req=(ok,code)=>{if(!ok)throw new Error(code);};
export const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`:JSON.stringify(value);
export const digest=bytes=>`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const safeEnv=()=>({PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8'});
const hold=x=>{
  req(x.production==='HOLD','CONTENT_PRODUCTION_BOUNDARY');
  const publicFields=['public_release','public'].filter(k=>Object.hasOwn(x,k));
  req(publicFields.length>0&&publicFields.every(k=>x[k]==='HOLD'),'CONTENT_PUBLIC_BOUNDARY');
  if(Object.hasOwn(x,'g5'))req(['HOLD','EXPLICIT_APPROVAL_REQUIRED'].includes(x.g5),'CONTENT_G5_BOUNDARY');
};
const noAuthority=(x,fields)=>{for(const k of fields)req(x[k]===false,`CONTENT_AUTHORITY:${k}`);};
const rejectElevation=x=>{if(!x||typeof x!=='object')return;for(const [key,value] of Object.entries(x)){if(['production_authorized','promotion_eligible','promotion_authority','whole_platform_authority','database_authority','provider_authority','runtime_activation_authorized','empirical_authority','producer_health_authority','production_promotion_authorized'].includes(key))req(value===false,`CONTENT_AUTHORITY_ELEVATION:${key}`);rejectElevation(value);}};
const zero=(x,fields)=>{for(const k of fields)req(x[k]===0,`CONTENT_NONZERO:${k}`);};
const same=(a,b,code)=>req(isDeepStrictEqual(a,b),code);
const time=(value,observed)=>req(typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.parse(observed),'CONTENT_TIME_INVALID');
const selfDigest=x=>{const y={...x};delete y.observed_at;delete y.receipt_digest;req(x.receipt_digest===digest(stable(y)),'CONTENT_RECEIPT_DIGEST');};
const json=(packet,basename,optional=false)=>{
  const entries=packet.members.filter(m=>path.posix.basename(m.name)===basename);
  if(optional&&entries.length===0)return null;
  req(entries.length===1,`CONTENT_MEMBER_CARDINALITY:${basename}`);
  return {...entries[0],value:JSON.parse(entries[0].text),sha256:digest(entries[0].text)};
};
export function readArchive(bytes,expectedDigest){
  req(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_ARCHIVE_BYTES,'ARCHIVE_BYTES_REQUIRED');
  req(DIGEST.test(expectedDigest)&&digest(bytes)===expectedDigest,'ARCHIVE_DIGEST_MISMATCH');
  const child=spawnSync('python3',['-I',path.join(ROOT,'scripts/kidults/kpmo/read-sentinel-artifact-v1.py'),expectedDigest],{input:bytes,encoding:'utf8',env:safeEnv(),timeout:20000,maxBuffer:64*1024*1024});
  req(child.status===0,'ARCHIVE_CONTENT_REJECTED');
  const packet=JSON.parse(child.stdout);
  req(packet.archive_digest===expectedDigest&&packet.extraction_performed===false&&Array.isArray(packet.members),'ARCHIVE_READER_CONTRACT');
  return packet;
}
export function checkTransport(run,artifact,sourceSha,observedAt){
  req(run?.repository?.full_name===REPOSITORY&&run.head_branch==='main'&&run.head_sha===sourceSha,'CONTENT_RUN_REPOSITORY_SHA');
  req(positive(run.id)&&positive(run.run_attempt),'CONTENT_RUN_IDENTITY');
  req(run.status==='completed'&&run.conclusion==='success','CONTENT_RUN_NOT_SUCCESS');
  req(positive(artifact?.id)&&artifact.expired===false&&DIGEST.test(artifact.digest||''),'CONTENT_ARTIFACT_IDENTITY');
  req(artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===run.head_sha,'CONTENT_ARTIFACT_RUN_BINDING');
  req(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=MAX_ARCHIVE_BYTES,'CONTENT_ARTIFACT_SIZE');
  req(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>Date.parse(observedAt),'CONTENT_ARTIFACT_EXPIRED');
  time(run.created_at,observedAt);time(artifact.created_at,observedAt);
  req(Number.isFinite(Date.parse(run.run_started_at))&&Date.parse(artifact.created_at)>=Date.parse(run.run_started_at),'CONTENT_PREVIOUS_ATTEMPT_ARTIFACT');
}
function shadow(packet){
  const m=json(packet,'asi-shadow-operating-evidence-run-1.json');const x=m.value;
  req(x.id==='kidults-asi-shadow-operating-evidence-v1'&&x.version==='1.0.0'&&x.status==='LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED','SHADOW_CONTENT_STATE');
  const unsigned={...x};delete unsigned.evidence_fingerprint;
  req(x.evidence_fingerprint===digest(stable(unsigned)),'SHADOW_FINGERPRINT');
  // The native producer rebuilds twice and byte-compares this exact tracked source.
  // Compare all fields, not just an apparent status/count, retaining all limitations.
  const expected=JSON.parse(fs.readFileSync(path.join(ROOT,'artifacts/agci-os/asi-shadow-operating-evidence-v1.json'),'utf8'));
  same(x,expected,'SHADOW_EXACT_SOURCE_CONTENT_DRIFT');
  req(x.execution_truth.mode==='LOCAL_DETERMINISTIC_SHADOW','SHADOW_MODE');
  noAuthority(x.execution_truth,['full_platform_runtime_verified','remote_resources_verified','remote_deployment_verified']);
  zero(x.execution_truth,['deployed_runtime_count','network_requests_during_processor_e2e']);
  req(x.test_execution.required_suite_count>0&&x.test_execution.required_suite_pass_count===x.test_execution.required_suite_count,'SHADOW_SUITE_COUNT');
  req(x.test_execution.suites.every(s=>s.status==='PASS'),'SHADOW_SUITE_FAILED');
  return {state:'VERIFIED_PASS',semantic_scope:'SHADOW_CONTROL_ONLY_NOT_DEPLOYED',members:[m],inner_run_identity_present:false};
}
function canonical(packet,run,sourceSha){
  const m=json(packet,'canonical-truth-receipt-v1.json'),o=json(packet,'canonical-truth-validation-output-v1.json'),x=m.value,v=o.value;
  req(x.receipt_id==='kpmo-live-canonical-issue-truth-receipt-v1'&&x.version==='1.1.0'&&x.state==='VERIFIED_PASS'&&x.validation_outcome==='success'&&x.failure_class===null,'CANONICAL_CONTENT_STATE');
  req(x.repository===REPOSITORY&&x.head_sha===sourceSha&&x.run_id===run.id&&x.run_attempt===run.run_attempt&&x.event===run.event,'CANONICAL_CONTENT_IDENTITY');
  req(x.workflow_path===run.path&&x.workflow_name===run.name,'CANONICAL_WORKFLOW_IDENTITY');
  req(x.validation_output_sha256===o.sha256&&x.validation_output_state==='VERIFIED_PASS'&&v.state==='VERIFIED_PASS','CANONICAL_OUTPUT_DIGEST_STATE');
  req(x.validated_protected_main_sha===sourceSha&&v.protected_main_sha===sourceSha,'CANONICAL_PROTECTED_MAIN_BINDING');
  noAuthority(x,['promotion_eligible']);hold(x);noAuthority(v,['empirical_promotion','whole_platform_closure']);hold(v);
  // Consume the native V3 output contract, not a self-consistent pair of PASS
  // words. These checks cannot replace the producer's authenticated GitHub
  // reads or establish that its generation is still current at a later time.
  req(v.validator==='LIVE_CANONICAL_ISSUE_TRUTH_V1'&&v.version==='3.1.0','CANONICAL_OUTPUT_SCHEMA');
  req(v.authority_model==='CANONICAL_GENERATION_V3_ONLY'&&v.canonical_main_policy==='EXACT_CURRENT_MAIN_COMMITTED_V3_GENERATION','CANONICAL_OUTPUT_AUTHORITY_MODEL');
  const generation=/^kpmo-canonical-v3-([0-9a-f]{12})-([1-9][0-9]*)-([1-9][0-9]*)$/.exec(v.generation_id||'');
  req(generation&&generation[1]===sourceSha.slice(0,12)&&positive(Number(generation[2]))&&positive(Number(generation[3])),'CANONICAL_GENERATION_BINDING');
  req(positive(v.aggregate_comment_id),'CANONICAL_AGGREGATE_COMMIT_ID');
  same(v.canonical_issues,MEMBERS,'CANONICAL_BOARD_SET');
  req(Array.isArray(v.active_baseline_trust_root_defects)&&v.active_baseline_trust_root_defects.every(i=>positive(i)&&BASELINE.includes(i))&&new Set(v.active_baseline_trust_root_defects).size===v.active_baseline_trust_root_defects.length,'CANONICAL_BASELINE_SET');
  for(const key of ['dynamic_query_pagination_verified','dynamic_query_cardinality_verified','dynamic_query_incomplete_results_rejected','dynamic_new_defect_discovery_mutation_rejected','dynamic_defect_omission_mutation_rejected','canonical_main_ancestry_verified'])req(v[key]===true,`CANONICAL_PRODUCER_PROOF_INCOMPLETE:${key}`);
  req(v.legacy_v2_body_authority===false,'CANONICAL_LEGACY_BODY_AUTHORITY');
  req(Number.isSafeInteger(v.material_defect_count)&&v.material_defect_count>=0&&Array.isArray(v.material_defects)&&v.material_defects.length===v.material_defect_count,'CANONICAL_REGISTRY_CARDINALITY');
  const ids=v.material_defects.map(i=>i.issue_number);req(ids.every(positive)&&new Set(ids).size===ids.length,'CANONICAL_REGISTRY_IDENTITIES');
  req(DIGEST.test(v.material_defect_registry_sha256||''),'CANONICAL_REGISTRY_DIGEST');
  req(v.material_defects.every(r=>typeof r.title==='string'&&Array.isArray(r.labels)&&r.labels.every(label=>typeof label==='string')&&Array.isArray(r.declared_severity)),'CANONICAL_REGISTRY_RECORD_SCHEMA');
  const issues=v.material_defects.map(r=>({number:r.issue_number,state:'open',title:r.title,labels:r.labels}));
  req(issues.flatMap(parityFailures).length===0,'CANONICAL_REGISTRY_SEVERITY_PARITY');
  const nativeRegistry=buildMaterialRegistry(issues);
  same(v.material_defects,nativeRegistry,'CANONICAL_REGISTRY_NATIVE_RECONSTRUCTION');
  req(v.material_defect_registry_sha256===materialRegistryDigest(nativeRegistry),'CANONICAL_REGISTRY_RECOMPUTED_DIGEST');
  const queryCounts={P0:nativeRegistry.filter(r=>r.labels.includes('P0')).length,P1:nativeRegistry.filter(r=>r.labels.includes('P1')).length};
  // P0/P1 labels can overlap. Never require their sum to equal registry size.
  same(v.material_defect_query_cardinality,queryCounts,'CANONICAL_REGISTRY_RECOMPUTED_CARDINALITY');
  same(x.material_defect_issue_numbers,ids,'CANONICAL_REGISTRY_CONTENT');
  same(x.material_defect_count,v.material_defect_count,'CANONICAL_REGISTRY_COUNT');
  same(x.material_defect_registry_sha256,v.material_defect_registry_sha256,'CANONICAL_REGISTRY_BINDING');
  same(x.material_defect_query_cardinality,v.material_defect_query_cardinality,'CANONICAL_REGISTRY_QUERY_BINDING');
  return {state:'VERIFIED_PASS',semantic_scope:'CANONICAL_ISSUE_TRUTH_ONLY',members:[m,o],inner_run_identity_present:true};
}
function reserve(packet,run,sourceSha,waiting){
  const m=json(packet,waiting?'asi-sharded-source-reserve-waiting-receipt-v1.json':'asi-sharded-source-reserve-activation-receipt-v1.json'),x=m.value;
  req(x.trigger_event===run.event&&x.discovery_producer_head_sha===sourceSha,'RESERVE_SOURCE_EVENT_BINDING');hold(x);noAuthority(x,['content_acquisition_authorized','collection_right_created']);
  if(waiting){
    req(x.id==='kidults-asi-sharded-source-reserve-waiting-receipt-v1'&&x.state==='WAITING_FOR_EXACT_DISCOVERY_PRODUCER'&&x.exact_generation_bound===false&&x.artifact_cardinality===0,'RESERVE_WAITING_CONTENT');
    noAuthority(x,['promotion_eligible','completion_claim_allowed']);
    return {state:'VERIFIED_HOLD',failure_class:'RESERVE_WAITING_FOR_EXACT_DISCOVERY_PRODUCER',semantic_scope:'DISCOVERY_METADATA_ONLY',members:[m],inner_run_identity_present:false};
  }
  req(x.id==='kidults-asi-sharded-source-reserve-activation-receipt-v1'&&x.state==='VERIFIED_PASS'&&x.exact_generation_bound===true&&x.validation_only===false&&x.reserve_is_not_safe_pool===true,'RESERVE_CONTENT_STATE');
  noAuthority(x,['promotion_authority']);req(positive(x.discovery_producer_run_id)&&positive(x.discovery_artifact_id),'RESERVE_UPSTREAM_IDENTITY');
  const manifest=json(packet,'asi-sharded-source-reserve-manifest-v1.json');
  const v=manifest.value,dir=path.posix.dirname(manifest.name);
  for(const [a,b] of Object.entries({reserve_cycle:'cycle_number',reserve_unique_candidates:'unique_candidate_count',reserve_unique_hosts:'unique_host_count',reserve_new_candidates:'new_candidate_count',reserve_updated_candidates:'updated_candidate_count',reserve_nonempty_shards:'nonempty_shard_count',reserve_design_capacity:'design_capacity_minimum_candidates'}))same(x[a],v[b],`RESERVE_MANIFEST_PARITY:${a}`);
  req(Array.isArray(v.shards)&&v.shards.length===256,'RESERVE_SHARD_CARDINALITY');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-reserve-'));fs.chmodSync(tmp,0o700);
  try{
    fs.mkdirSync(path.join(tmp,'shards'),{mode:0o700});fs.writeFileSync(path.join(tmp,'asi-sharded-source-reserve-manifest-v1.json'),manifest.text,{mode:0o600});
    for(let i=0;i<256;i++){
      const name=`shards/${i.toString(16).padStart(2,'0')}.ndjson`;
      req(v.shards[i].path===name,'RESERVE_SHARD_PATH');
      const matches=packet.members.filter(r=>r.name===(dir==='.'?name:`${dir}/${name}`));req(matches.length===1,'RESERVE_SHARD_MEMBER_MISSING');
      fs.writeFileSync(path.join(tmp,name),matches[0].text,{mode:0o600});
    }
    // Run only the pinned repository validator. Archive code is never executed.
    const child=spawnSync(process.execPath,[path.join(ROOT,'scripts/kidults/source-intelligence/validate-asi-sharded-source-reserve-v1.mjs'),tmp],{env:safeEnv(),encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
    req(child.status===0,'RESERVE_NATIVE_CONTENT_VALIDATION_FAILED');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  return {state:'VERIFIED_PASS',semantic_scope:'DISCOVERY_METADATA_NOT_RIGHTS_OR_SAFE_POOL',members:[m,manifest],inner_run_identity_present:false};
}

// Reconstruct the nonvolatile producer contract from this exact checkout.
// Supplied material only selects values to compare, never filenames to read.
// The three upstream output digests are shape-checked, not substituted for a
// re-execution of ARL. That limitation remains explicit in the consumer result.
function coverageNativeMaterial(si,leader,sourceSha){
  const recordKeys=(value,keys,code)=>{
    req(value&&typeof value==='object'&&!Array.isArray(value),code);
    same(Object.keys(value).sort(),[...keys].sort(),code);
  };
  const material=si.material;
  recordKeys(material,['domain','source_sha','upstream_class','projection_version','projection_allowlist','arl_semantic_outputs','coverage_contract','authoritative_input_digests','authoritative_input_constants','implementation_digests','volatile_provenance_excluded_from_identity'],'COVERAGE_MATERIAL_FIELD_SET');
  req(material.domain===DOMAIN&&material.source_sha===sourceSha&&material.upstream_class==='ASI_AUTONOMOUS_RESOLUTION'&&material.projection_version===PROJECTION_VERSION,'COVERAGE_MATERIAL_IDENTITY');
  same(material.projection_allowlist,{manifest:MANIFEST_ALLOWLIST,receipt:RECEIPT_ALLOWLIST,replacement_queue:'FULL_DETERMINISTIC_OBJECT'},'COVERAGE_MATERIAL_PROJECTION_ALLOWLIST');
  same(material.volatile_provenance_excluded_from_identity,VOLATILE_PROVENANCE_EXCLUSIONS,'COVERAGE_MATERIAL_VOLATILE_EXCLUSIONS');
  req(si.exact_upstream_provenance_included_in_identity===false&&si.exact_upstream_provenance_required_in_observation_receipt===true,'COVERAGE_MATERIAL_PROVENANCE_BOUNDARY');
  recordKeys(material.arl_semantic_outputs,['replacement_queue_digest','manifest_digest','stable_receipt_digest'],'COVERAGE_ARL_PROJECTION_FIELD_SET');
  req(Object.values(material.arl_semantic_outputs).every(d=>typeof d==='string'&&DIGEST.test(d)),'COVERAGE_ARL_PROJECTION_DIGEST');
  const readSource=relative=>{
    req(typeof relative==='string'&&relative!==''&&!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.split('/').includes('..'),'COVERAGE_STATIC_SOURCE_PATH');
    const filename=path.join(ROOT,relative),stat=fs.lstatSync(filename);
    req(stat.isFile()&&!stat.isSymbolicLink()&&fs.realpathSync(filename)===filename,'COVERAGE_STATIC_SOURCE_NOT_REGULAR');
    return fs.readFileSync(filename);
  };
  const contractPath='coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json';
  const contractBytes=readSource(contractPath),contract=JSON.parse(contractBytes),contractDigest=digest(contractBytes);
  same(material.coverage_contract,{id:contract.id,version:contract.version,digest:contractDigest},'COVERAGE_NATIVE_CONTRACT_BINDING');
  req(leader.canonical_contract_digest===contractDigest,'COVERAGE_LEADER_NATIVE_CONTRACT_BINDING');
  // File keys and paths come from native exports/the committed contract only.
  const inputs=Object.fromEntries(AUTHORITATIVE_INPUT_FILE_KEYS.map(key=>{
    const relative=contract.authoritative_inputs[key];
    return [key,{path:relative,digest:digest(readSource(relative))}];
  }));
  const implementations=Object.fromEntries(IMPLEMENTATION_FILES.map(relative=>[relative,{path:relative,digest:digest(readSource(relative))}]));
  const constants=Object.fromEntries(Object.entries(contract.authoritative_inputs).filter(([key])=>!AUTHORITATIVE_INPUT_FILE_KEYS.includes(key)));
  same(material.authoritative_input_digests,inputs,'COVERAGE_NATIVE_STATIC_INPUT_BINDING');
  same(material.authoritative_input_constants,constants,'COVERAGE_NATIVE_CONSTANT_BINDING');
  same(material.implementation_digests,implementations,'COVERAGE_NATIVE_IMPLEMENTATION_BINDING');
  return {static_source_bindings_verified:true,verified_authoritative_input_count:AUTHORITATIVE_INPUT_FILE_KEYS.length,verified_implementation_count:IMPLEMENTATION_FILES.length,upstream_payload_recomputed:false};
}

function coverage(packet,run,sourceSha){
  const alias=json(packet,'coverage-canonical-alias-receipt-v1.json',true);
  if(alias){
    const a=alias.value;selfDigest(a);hold(a);
    req(a.id==='kidults-asi-requirement-adapter-coverage-canonical-alias-receipt-v1'&&a.version==='1.0.0'&&a.state==='VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE','COVERAGE_ALIAS_STATE');
    req(a.repository===REPOSITORY&&a.source_sha===sourceSha&&a.current_workflow_run_id===run.id&&a.current_workflow_run_attempt===run.run_attempt&&a.current_trigger_event===run.event&&a.current_coverage_consumer_sha===sourceSha&&a.current_coverage_run_head_sha===sourceSha,'COVERAGE_ALIAS_IDENTITY');
    noAuthority(a,['canonical_execution_claimed','durable_claim_created']);
    req(positive(a.canonical_artifact_id)&&positive(a.canonical_workflow_run_id)&&positive(a.canonical_workflow_run_attempt)&&DIGEST.test(a.canonical_artifact_digest||''),'COVERAGE_ALIAS_TARGET');
    return {state:'VERIFIED_HOLD',failure_class:'COVERAGE_ALIAS_LEADER_CONTENT_REQUIRED',semantic_scope:'COVERAGE_ALIAS_ONLY',members:[alias],alias:a,inner_run_identity_present:true};
  }
  const m=json(packet,'kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1.json'),l=json(packet,'coverage-canonical-leader-receipt-v1.json'),s=json(packet,'coverage-semantic-input-receipt-v1.json');
  const x=m.value,v=l.value,si=s.value;selfDigest(v);hold(x);hold(v);hold(si);
  req(x.id==='kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1'&&x.version==='1.3.0'&&x.state==='VERIFIED_PASS_INTERNAL_QUEUE_ACCOUNTABLE_EXTERNAL_ACTIVATION_HOLD','COVERAGE_CONTENT_STATE');
  req(x.source_sha===sourceSha&&x.consumer_sha===sourceSha&&Array.isArray(x.evidence_refs)&&x.evidence_refs.filter(r=>r===`workflow_run:${run.id}`).length===1,'COVERAGE_CONTENT_IDENTITY');
  req(v.id==='kidults-asi-requirement-adapter-coverage-canonical-leader-receipt-v1'&&v.version==='1.0.0'&&v.state==='VERIFIED_PASS_EPHEMERAL_CANONICAL_LEADER','COVERAGE_LEADER_STATE');
  req(v.repository===REPOSITORY&&v.source_sha===sourceSha&&v.canonical_workflow_run_id===run.id&&v.canonical_workflow_run_attempt===run.run_attempt&&v.coverage_run_head_sha===sourceSha&&v.coverage_consumer_sha===sourceSha&&v.trigger_event===run.event,'COVERAGE_LEADER_IDENTITY');
  req(v.coverage_run_display_title===run.display_title&&run.display_title===`KIDULTS Coverage / source-${sourceSha}`,'COVERAGE_DISPLAY_BINDING');
  req(v.coverage_kpmo_receipt_digest===m.sha256&&v.semantic_input_receipt_digest===s.sha256,'COVERAGE_MEMBER_DIGEST');
  req(si.id==='kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1'&&si.version==='1.0.0'&&si.state==='VERIFIED_PASS_SEMANTIC_INPUT_BOUND'&&si.canonical_input_digest===digest(stable(si.material))&&si.canonical_input_digest===v.canonical_input_digest,'COVERAGE_SEMANTIC_INPUT');
  const nativeBindings=coverageNativeMaterial(si,v,sourceSha);
  req(v.validations_complete===true&&v.negative_tests_complete===true&&v.final_revalidation_complete===true,'COVERAGE_VALIDATION_INCOMPLETE');
  noAuthority(v,['canonical_execution_claimed','durable_claim_created']);noAuthority(si,['canonical_execution_claimed']);noAuthority(x,['production_authorized']);
  zero(x,['live_source_requests_executed','provider_contacts_executed','rights_passes_created','adapters_activated','evidence_admitted','market_events_created','snapshot_candidates_created','track_b_results_created','projections_created']);
  req(v.runtime_dedupe_state==='REMOTE_LEDGER_ACTIVATION_HOLD'&&si.runtime_dedupe_state===v.runtime_dedupe_state,'COVERAGE_DURABILITY_BOUNDARY');
  req(v.canonical_run_key===`${sourceSha}:ASI_AUTONOMOUS_RESOLUTION`&&x.canonical_run_key===v.canonical_run_key,'COVERAGE_CANONICAL_KEY');
  const manifest=json(packet,'requirement-adapter-coverage-manifest-v1.json',true);
  if(manifest){req(manifest.sha256===v.coverage_manifest_digest&&manifest.sha256===x.manifest_digest,'COVERAGE_MANIFEST_DIGEST');same(x.results,manifest.value.results,'COVERAGE_MANIFEST_RESULTS');}
  // A canonical leader artifact intentionally contains no full output manifest.
  // Its raw KPMO payload and semantic material are still required and bound.
  const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json'),'utf8')).expected_current_main_baseline;
  for(const [key,value] of Object.entries(baseline))same(x.results[key],value,`COVERAGE_BASELINE:${key}`);
  req(x.results?.requirements_accounted_for===192,'COVERAGE_REQUIREMENT_CARDINALITY');
  return {...nativeBindings,state:'VERIFIED_PASS',semantic_scope:'COVERAGE_INTERNAL_CONTROL_EXTERNAL_ACTIVATION_HOLD',members:[m,l,s,...(manifest?[manifest]:[])],leader:v,inner_run_identity_present:true};
}
export function validateProducerContent(spec,run,artifact,bytes,sourceSha,observedAt){
  req(typeof sourceSha==='string'&&/^[0-9a-f]{40}$/.test(sourceSha),'CONTENT_SOURCE_SHA_INVALID');
  req(run.path===spec.path&&spec.events.includes(run.event),'CONTENT_WORKFLOW_PATH_EVENT');
  const names=spec.artifactForRun?[spec.artifactForRun(run)]:spec.artifacts;
  const canonicalName=`kidults-asi-requirement-adapter-coverage-canonical-${digest(`${sourceSha}:ASI_AUTONOMOUS_RESOLUTION`).slice(7)}`;
  req(names.includes(artifact.name)||(spec.id==='REQUIREMENT'&&artifact.name===canonicalName),'CONTENT_ARTIFACT_NAME');
  checkTransport(run,artifact,sourceSha,observedAt);
  req(bytes.length===artifact.size_in_bytes,'ARCHIVE_SIZE_BINDING');
  const packet=readArchive(bytes,artifact.digest);
  for(const member of packet.members)if(member.name.endsWith('.json'))rejectElevation(JSON.parse(member.text));
  let result;
  if(spec.id==='SHADOW')result=shadow(packet);
  else if(spec.id==='CANONICAL_TRUTH')result=canonical(packet,run,sourceSha);
  else if(spec.id==='RESERVE')result=reserve(packet,run,sourceSha,artifact.name===spec.waitingArtifact);
  else if(spec.id==='REQUIREMENT')result=coverage(packet,run,sourceSha);
  else throw new Error('PRODUCER_CONTENT_SPEC_UNKNOWN');
  for(const member of result.members){const x=member.value;if(x.observed_at)time(x.observed_at,observedAt);if(x.as_of)time(x.as_of,observedAt);}
  // Private member bytes are absent, not undefined: terminal digests must bind
  // the same JSON value that a downstream consumer actually reads from disk.
  const {members,...publicResult}=result;
  return {...publicResult,artifact_content_validated:true,artifact_transport_verified:true,archive_digest_verified:true,
    member_digests:members.map(m=>({member:m.name,sha256:m.sha256})),
    payload_identity_binding:result.inner_run_identity_present?'INNER_RECEIPT_AND_GITHUB_ARTIFACT_RUN':'GITHUB_ARTIFACT_RUN_AND_EXACT_SOURCE_CONTENT'};
}
export function validateCoverageAliasClosure(aliasProof,leaderProof,run,artifact){
  const a=aliasProof.alias,l=leaderProof.leader;
  req(a&&l&&leaderProof.state==='VERIFIED_PASS','COVERAGE_ALIAS_LEADER_REQUIRED');
  req(leaderProof.static_source_bindings_verified===true&&leaderProof.verified_authoritative_input_count===AUTHORITATIVE_INPUT_FILE_KEYS.length&&leaderProof.verified_implementation_count===IMPLEMENTATION_FILES.length&&leaderProof.upstream_payload_recomputed===false,'COVERAGE_ALIAS_NATIVE_PROOF_REQUIRED');
  req(a.canonical_workflow_run_id===run.id&&a.canonical_workflow_run_attempt===run.run_attempt&&a.canonical_artifact_id===artifact.id&&a.canonical_artifact_name===artifact.name&&a.canonical_artifact_digest===artifact.digest,'COVERAGE_ALIAS_TARGET_BINDING');
  req(a.canonical_receipt_digest===l.receipt_digest&&a.canonical_coverage_run_head_sha===run.head_sha&&a.canonical_coverage_consumer_sha===run.head_sha,'COVERAGE_ALIAS_LEADER_BINDING');
  for(const key of ['source_sha','repository','canonical_run_key','canonical_input_digest','canonical_contract_digest','semantic_input_receipt_digest'])same(a[key],l[key],`COVERAGE_ALIAS_DIVERGENCE:${key}`);
  req(artifact.name===`kidults-asi-requirement-adapter-coverage-canonical-${digest(a.canonical_run_key).slice(7)}`,'COVERAGE_ALIAS_ARTIFACT_NAME');
  const {alias,...publicAlias}=aliasProof;
  return {...publicAlias,state:'VERIFIED_PASS',failure_class:null,semantic_scope:'COVERAGE_CONTENT_BOUND_ALIAS_NOT_NEW_EXECUTION',
    static_source_bindings_verified:true,verified_authoritative_input_count:leaderProof.verified_authoritative_input_count,verified_implementation_count:leaderProof.verified_implementation_count,upstream_payload_recomputed:false,
    canonical_leader_run_id:run.id,canonical_leader_run_attempt:run.run_attempt,canonical_leader_artifact_id:artifact.id,canonical_leader_artifact_digest:artifact.digest,canonical_leader_member_digests:leaderProof.member_digests};
}
