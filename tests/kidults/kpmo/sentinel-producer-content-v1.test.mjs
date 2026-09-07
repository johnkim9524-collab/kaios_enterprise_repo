import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
import {SPECS,evaluateHealth,allowedArtifactRedirect} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {REPOSITORY,stable,digest,readArchive,validateProducerContent,validateCoverageAliasClosure} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {buildMaterialRegistry,materialRegistryDigest} from '../../../scripts/kidults/kpmo/material-defect-registry-v3.mjs';
import {MEMBERS,generationId} from '../../../scripts/kidults/kpmo/canonical-generation-v3-lib.mjs';
import {finalizeCoverageCanonicalLeader} from '../../../scripts/kidults/source-intelligence/resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs';
import {buildSemanticInputMaterial,AUTHORITATIVE_INPUT_FILE_KEYS,IMPLEMENTATION_FILES} from '../../../scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-semantic-input-v1.mjs';

// All run/artifact metadata here is synthetic. Native fixture builders are reused;
// no fixture can substitute for a naturally produced exact-main GitHub artifact.
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
const check=f=>validateProducerContent(f.spec,f.run,f.artifact,f.bytes,sha,observed);
function replace(f,name,mutate){
 const entries=f.entries.map(([n,t])=>[n,t]);const i=entries.findIndex(([n])=>n===name);const x=JSON.parse(entries[i][1]);mutate(x);entries[i][1]=text(x);
 const bytes=zip(entries);return {...f,entries,bytes,artifact:{...f.artifact,digest:digest(bytes),size_in_bytes:bytes.length}};
}
const shadow=fixture('SHADOW',[['asi-shadow-operating-evidence-run-1.json',fs.readFileSync('artifacts/agci-os/asi-shadow-operating-evidence-v1.json','utf8')]]);
function canonicalFixture(){
 const records=buildMaterialRegistry([{number:2015,state:'open',title:'[P1] SYNTHETIC material issue',labels:['P1']}]);
 const output={validator:'LIVE_CANONICAL_ISSUE_TRUTH_V1',version:'3.1.0',authority_model:'CANONICAL_GENERATION_V3_ONLY',generation_id:generationId(sha,123,1),aggregate_comment_id:456,canonical_issues:[...MEMBERS],active_baseline_trust_root_defects:[],canonical_main_policy:'EXACT_CURRENT_MAIN_COMMITTED_V3_GENERATION',dynamic_query_pagination_verified:true,dynamic_query_cardinality_verified:true,dynamic_query_incomplete_results_rejected:true,dynamic_new_defect_discovery_mutation_rejected:true,dynamic_defect_omission_mutation_rejected:true,canonical_main_ancestry_verified:true,legacy_v2_body_authority:false,state:'VERIFIED_PASS',protected_main_sha:sha,material_defect_count:1,material_defects:records,material_defect_registry_sha256:materialRegistryDigest(records),material_defect_query_cardinality:{P0:0,P1:1},empirical_promotion:false,whole_platform_closure:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 const receipt={receipt_id:'kpmo-live-canonical-issue-truth-receipt-v1',version:'1.1.0',state:'VERIFIED_PASS',validation_outcome:'success',failure_class:null,repository:REPOSITORY,head_sha:sha,run_id:13,run_attempt:1,event:'push',workflow_name:'KPMO Live Canonical Issue Truth V1',workflow_path:'.github/workflows/kpmo-live-canonical-issue-truth-v1.yml',validation_output_sha256:digest(text(output)),validation_output_state:'VERIFIED_PASS',validated_protected_main_sha:sha,material_defect_issue_numbers:[2015],material_defect_count:1,material_defect_registry_sha256:materialRegistryDigest(records),material_defect_query_cardinality:{P0:0,P1:1},promotion_eligible:false,production:'HOLD',public:'HOLD'};
 return fixture('CANONICAL_TRUTH',[['canonical-truth-receipt-v1.json',text(receipt)],['canonical-truth-validation-output-v1.json',text(output)]]);
}
const canonical=canonicalFixture();

// Shape this positive fixture using the producer's actual projection builder,
// with fixed synthetic ARL outputs and real exact-checkout static source bytes.
// This is not an upstream execution attestation.
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
 const receipt={id:'kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1',version:'1.3.0',state:'VERIFIED_PASS_INTERNAL_QUEUE_ACCOUNTABLE_EXTERNAL_ACTIVATION_HOLD',source_sha:sha,consumer_sha:sha,evidence_refs:['workflow_run:11'],canonical_run_key:`${sha}:ASI_AUTONOMOUS_RESOLUTION`,production_authorized:false,results:{...baseline,requirements_accounted_for:192},public_release:'HOLD',production:'HOLD',g5:'HOLD'};
 for(const k of ['live_source_requests_executed','provider_contacts_executed','rights_passes_created','adapters_activated','evidence_admitted','market_events_created','snapshot_candidates_created','track_b_results_created','projections_created'])receipt[k]=0;
 const leader=finalizeCoverageCanonicalLeader({repository:REPOSITORY,source_sha:sha,trigger_event:'workflow_run',run_id:11,run_attempt:1,upstream_class:'ASI_AUTONOMOUS_RESOLUTION',canonical_run_key:receipt.canonical_run_key,canonical_input_digest:semantic.canonical_input_digest,semantic_input_receipt_digest:digest(text(semantic)),canonical_contract_digest:semantic.material.coverage_contract.digest,upstream_binding_digest:d,upstream_workflow_run_id:500,upstream_artifact_id:600,upstream_artifact_digest:d,coverage_consumer_sha:sha,coverage_run_head_sha:sha,coverage_run_display_title:`KIDULTS Coverage / source-${sha}`,observed_at:'2026-09-05T10:01:00Z',coverage_manifest_digest:d,coverage_kpmo_receipt_digest:digest(text(receipt)),archive_validation_receipt_digest:d,guard_receipt_digest:d});
 return fixture('REQUIREMENT',[['kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1.json',text(receipt)],['coverage-canonical-leader-receipt-v1.json',text(leader)],['coverage-semantic-input-receipt-v1.json',text(semantic)]]);
}
const coverage=coverageFixture();
function reserveFixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-reserve-fixture-'));
 try{
  fs.writeFileSync(path.join(tmp,'input.json'),text({candidates:[{endpoint_url:'https://synthetic.example.invalid/item',observed_at:'2026-09-05T10:00:00Z',discovery_provider:'SYNTHETIC_CONTROL'}]}));
  const out=path.join(tmp,'out');const child=spawnSync(process.execPath,['scripts/kidults/source-intelligence/build-asi-sharded-source-reserve-v1.mjs',path.join(tmp,'input.json'),path.join(tmp,'absent'),out],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});assert.equal(child.status,0,child.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'asi-sharded-source-reserve-manifest-v1.json')));
  const r={id:'kidults-asi-sharded-source-reserve-activation-receipt-v1',state:'VERIFIED_PASS',trigger_event:'workflow_run',discovery_producer_run_id:500,discovery_producer_head_sha:sha,discovery_artifact_id:600,exact_generation_bound:true,validation_only:false,promotion_authority:false,reserve_is_not_safe_pool:true,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD'};
  for(const [a,b] of Object.entries({reserve_cycle:'cycle_number',reserve_unique_candidates:'unique_candidate_count',reserve_unique_hosts:'unique_host_count',reserve_new_candidates:'new_candidate_count',reserve_updated_candidates:'updated_candidate_count',reserve_nonempty_shards:'nonempty_shard_count',reserve_design_capacity:'design_capacity_minimum_candidates'}))r[a]=manifest[b];
  return fixture('RESERVE',[['asi-sharded-source-reserve-activation-receipt-v1.json',text(r)],['reserve/asi-sharded-source-reserve-manifest-v1.json',text(manifest)],...manifest.shards.map(s=>[`reserve/${s.path}`,fs.readFileSync(path.join(out,s.path),'utf8')])]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
const reserve=reserveFixture();
for(const f of [shadow,canonical,coverage,reserve])test(`${f.spec.id}: native-contract shaped payload is content-verified with an explicit limited scope`,()=>{
 const x=check(f);assert.equal(x.state,'VERIFIED_PASS');assert.equal(x.artifact_content_validated,true);assert.equal(x.archive_digest_verified,true);assert.ok(x.member_digests.length>0);assert.equal(x.members,undefined);
});
for(const [name,mutate] of [
 ['wrong repository',f=>{f.run.repository.full_name='o/r';}],['wrong source',f=>{f.run.head_sha='b'.repeat(40);}],['run id zero',f=>{f.run.id=0;}],['missing attempt',f=>{delete f.run.run_attempt;}],['unsafe attempt',f=>{f.run.run_attempt=Number.MAX_SAFE_INTEGER+1;}],['expired',f=>{f.artifact.expired=true;}],['future artifact',f=>{f.artifact.created_at='2027-01-01T00:00:00Z';}],['prior attempt artifact',f=>{f.run.run_started_at='2026-09-05T11:00:00Z';}],['wrong artifact run',f=>{f.artifact.workflow_run.id=99;}],['digest mismatch',f=>{f.artifact.digest=d;}],['size mismatch',f=>{f.artifact.size_in_bytes++;}],['failure despite valid bytes',f=>{f.run.conclusion='failure';}],['expired timestamp',f=>{f.artifact.expires_at='2026-01-01T00:00:00Z';}]
])test(`transport rejects ${name}`,()=>{const f={...canonical,run:structuredClone(canonical.run),artifact:structuredClone(canonical.artifact)};mutate(f);assert.throws(()=>check(f));});
for(const [name,mutate] of [['HOLD',x=>{x.state='VERIFIED_HOLD';}],['wrong attempt',x=>{x.run_attempt=2;}],['wrong source',x=>{x.head_sha='b'.repeat(40);} ],['promotion',x=>{x.promotion_eligible=true;}],['output digest',x=>{x.validation_output_sha256=d;}],['wrong registry list',x=>{x.material_defect_issue_numbers=[2013];}]])test(`Canonical rejects rehashed ${name} payload`,()=>assert.throws(()=>check(replace(canonical,'canonical-truth-receipt-v1.json',mutate))));
test('SHADOW rejects rehashed false remote-runtime proof',()=>assert.throws(()=>check(replace(shadow,'asi-shadow-operating-evidence-run-1.json',x=>{x.execution_truth.full_platform_runtime_verified=true;const y={...x};delete y.evidence_fingerprint;x.evidence_fingerprint=digest(stable(y));}))));
test('Coverage rejects semantic material tamper',()=>assert.throws(()=>check(replace(coverage,'coverage-semantic-input-receipt-v1.json',x=>{x.material.injected=true;}))));
test('Coverage rejects KPMO payload even with valid leader metadata',()=>assert.throws(()=>check(replace(coverage,'kidults-asi-requirement-adapter-coverage-kpmo-receipt-v1.json',x=>{x.evidence_admitted=1;}))));
test('Reserve native validator rejects tampered shard bytes',()=>{const f={...reserve};f.entries=reserve.entries.map(([n,t])=>[n,n.endsWith('.ndjson')&&t?t.replace('UNASSESSED','ALLOW'):t]);f.bytes=zip(f.entries);f.artifact={...f.artifact,size_in_bytes:f.bytes.length,digest:digest(f.bytes)};assert.throws(()=>check(f),/RESERVE_NATIVE/);});
test('Reserve validates WAITING payload but never promotes it',()=>{
 const r={id:'kidults-asi-sharded-source-reserve-waiting-receipt-v1',state:'WAITING_FOR_EXACT_DISCOVERY_PRODUCER',trigger_event:'workflow_run',discovery_producer_head_sha:sha,exact_generation_bound:false,artifact_cardinality:0,promotion_eligible:false,completion_claim_allowed:false,content_acquisition_authorized:false,collection_right_created:false,public_release:'HOLD',production:'HOLD'};
 const f=fixture('RESERVE',[['asi-sharded-source-reserve-waiting-receipt-v1.json',text(r)]]);f.artifact.name=f.spec.waitingArtifact;assert.equal(check(f).state,'VERIFIED_HOLD');
});
for(const [name,entries] of [['traversal',[['../receipt.json','{}']]],['duplicate members',[['receipt.json','{}'],['receipt.json','{}']]],['duplicate JSON keys',[['receipt.json','{"state":"FAIL","state":"PASS"}']]],['nonfinite JSON',[['receipt.json','{"n":NaN}']]],['absolute',[['/tmp/x','x']]],['backslash',[['x\\x.json','{}']]],['member expansion',[['x.txt','0'.repeat(100000)]]]])test(`safe ZIP reader rejects ${name}`,()=>{const bytes=zip(entries);assert.throws(()=>readArchive(bytes,digest(bytes)));});
for(const url of ['http://x.blob.core.windows.net/x','https://evil.example/x','https://x.blob.core.windows.net.evil.example/x','https://user:secret@x.blob.core.windows.net/x','https://x.blob.core.windows.net:8443/x','https://api.github.com/x'])test(`artifact redirect rejects ${url.split('/')[2]}`,()=>assert.throws(()=>allowedArtifactRedirect(url)));
test('artifact redirect accepts HTTPS signed storage without credentials',()=>assert.equal(allowedArtifactRedirect('https://example.blob.core.windows.net/artifact?sig=test').hostname,'example.blob.core.windows.net'));
function healthInput(){const input={repository:REPOSITORY,source_sha:sha,observed_at:observed,observer_run_id:900,observer_run_attempt:1,runs:{},artifacts_by_run:{},archives_by_id:{}};for(const f of [shadow,coverage,reserve,canonical]){input.runs[f.spec.id]=[f.run];input.artifacts_by_run[f.run.id]=[f.artifact];input.archives_by_id[f.artifact.id]=f.bytes;}return input;}
test('four content-verified producers can reach bounded aggregate PASS',()=>{const x=evaluateHealth(healthInput());assert.equal(x.state,'VERIFIED_PASS');assert.equal(x.semantic_content_verified,true);assert.equal(x.runtime_health_proven,false);assert.equal(x.whole_platform_authority,false);assert.equal(x.promotion_eligible,false);assert.equal(x.observer_run_id,900);assert.ok(!JSON.stringify(x).includes('SYNTHETIC_CONTROL'));const wire=JSON.parse(JSON.stringify(x)),{receipt_digest,...unsigned}=wire;assert.equal(receipt_digest,digest(stable(unsigned)));});
test('metadata-only proof remains HOLD even when a caller asserts validation',()=>{const x=healthInput();delete x.archives_by_id;x.artifact_content_validated=true;assert.equal(evaluateHealth(x).state,'VERIFIED_HOLD');});
test('latest RED cannot fall back to old content PASS',()=>{const x=healthInput();x.runs.SHADOW=[shadow.run,{...shadow.run,id:77,created_at:'2026-09-05T11:00:00Z',conclusion:'failure'}];assert.equal(evaluateHealth(x).state,'VERIFIED_FAIL');});
test('new pending generation cannot reuse old content PASS',()=>{const x=healthInput();x.runs.SHADOW=[shadow.run,{...shadow.run,id:77,created_at:'2026-09-05T11:00:00Z',status:'in_progress',conclusion:null}];assert.equal(evaluateHealth(x).state,'VERIFIED_HOLD');});
test('unresolved Coverage alias cannot be promoted by its own PASS word',()=>{
 const leader=check(coverage).leader;const a={id:'kidults-asi-requirement-adapter-coverage-canonical-alias-receipt-v1',version:'1.0.0',state:'VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE',repository:REPOSITORY,source_sha:sha,current_workflow_run_id:11,current_workflow_run_attempt:1,current_trigger_event:'workflow_run',current_coverage_consumer_sha:sha,current_coverage_run_head_sha:sha,canonical_workflow_run_id:12,canonical_workflow_run_attempt:1,canonical_artifact_id:99,canonical_artifact_name:'canonical',canonical_artifact_digest:d,canonical_execution_claimed:false,durable_claim_created:false,public:'HOLD',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'};a.receipt_digest=digest(stable(a));a.observed_at='2026-09-05T10:01:00Z';const f=fixture('REQUIREMENT',[['coverage-canonical-alias-receipt-v1.json',text(a)]]);const p=check(f);assert.equal(p.state,'VERIFIED_HOLD');assert.throws(()=>validateCoverageAliasClosure(p,{state:'VERIFIED_PASS',leader},coverage.run,coverage.artifact));
});
test('workflow exercises content suite and checks content-bound terminal identity',()=>{const w=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');assert.ok(w.includes('node --test tests/kidults/kpmo/sentinel-producer-content-v1.test.mjs'));assert.ok(w.includes('.semantic_content_verified==true'));assert.ok(w.includes('.observer_run_attempt=='));assert.ok(w.includes('artifact_content_validated'));});

function aliasFixture(){
 const leader=check(coverage).leader;
 const artifact={...coverage.artifact,name:`kidults-asi-requirement-adapter-coverage-canonical-${digest(leader.canonical_run_key).slice(7)}`};
 const a={id:'kidults-asi-requirement-adapter-coverage-canonical-alias-receipt-v1',version:'1.0.0',state:'VERIFIED_PASS_EPHEMERAL_ALIAS_NO_FULL_COVERAGE',repository:REPOSITORY,source_sha:sha,current_workflow_run_id:21,current_workflow_run_attempt:1,current_trigger_event:'workflow_run',current_coverage_consumer_sha:sha,current_coverage_run_head_sha:sha,canonical_workflow_run_id:11,canonical_workflow_run_attempt:1,canonical_artifact_id:artifact.id,canonical_artifact_name:artifact.name,canonical_artifact_digest:artifact.digest,canonical_receipt_digest:leader.receipt_digest,canonical_coverage_run_head_sha:sha,canonical_coverage_consumer_sha:sha,canonical_execution_claimed:false,durable_claim_created:false,public:'HOLD',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'};
 for(const key of ['canonical_run_key','canonical_input_digest','canonical_contract_digest','semantic_input_receipt_digest'])a[key]=leader[key];
 a.receipt_digest=digest(stable(a));a.observed_at='2026-09-05T10:01:00Z';
 const f=fixture('REQUIREMENT',[['coverage-canonical-alias-receipt-v1.json',text(a)]]);f.run={...f.run,id:21};f.artifact={...f.artifact,id:121,workflow_run:{...f.artifact.workflow_run,id:21}};
 return {f,artifact};
}
test('same-source Coverage alias requires and consumes the exact leader archive content',()=>{
 const {f,artifact}=aliasFixture(),input=healthInput();input.runs.REQUIREMENT=[f.run];input.artifacts_by_run[f.run.id]=[f.artifact];input.archives_by_id[f.artifact.id]=f.bytes;
 assert.equal(evaluateHealth(input).state,'VERIFIED_HOLD');
 input.related_by_id={[artifact.id]:{run:coverage.run,artifact,bytes:coverage.bytes}};
 const result=evaluateHealth(input);assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.producers.find(p=>p.id==='REQUIREMENT').canonical_leader_artifact_digest,artifact.digest);const wire=JSON.parse(JSON.stringify(result)),{receipt_digest,...unsigned}=wire;assert.equal(receipt_digest,digest(stable(unsigned)));
});
test('alias cannot reuse a leader from another source SHA',()=>{
 const {f,artifact}=aliasFixture(),input=healthInput();input.runs.REQUIREMENT=[f.run];input.artifacts_by_run[f.run.id]=[f.artifact];input.archives_by_id[f.artifact.id]=f.bytes;
 input.related_by_id={[artifact.id]:{run:{...coverage.run,head_sha:'b'.repeat(40)},artifact,bytes:coverage.bytes}};
 assert.equal(evaluateHealth(input).state,'VERIFIED_FAIL');
});
test('direct content API rejects wrong workflow path even with matching payload metadata',()=>assert.throws(()=>check({...canonical,run:{...canonical.run,path:'.github/workflows/other.yml'}}),/CONTENT_WORKFLOW_PATH_EVENT/));
test('extra authority field cannot hide inside an otherwise rehashed canonical packet',()=>assert.throws(()=>check(replace(canonical,'canonical-truth-receipt-v1.json',x=>{x.database_authority=true;})),/CONTENT_AUTHORITY_ELEVATION/));

// Rehash every outer layer so these cases exercise semantic invariants rather
// than merely testing ZIP or member checksum detection.
function rebindCanonicalOutput(mutate,{recomputeRegistry=true}={}){
 const f=canonicalFixture();
 const output=JSON.parse(f.entries[1][1]);mutate(output);
 if(recomputeRegistry)output.material_defect_registry_sha256=materialRegistryDigest(output.material_defects);
 const receipt=JSON.parse(f.entries[0][1]);
 receipt.validation_output_sha256=digest(text(output));
 for(const key of ['material_defect_count','material_defect_registry_sha256','material_defect_query_cardinality'])receipt[key]=output[key];
 receipt.material_defect_issue_numbers=output.material_defects.map(x=>x.issue_number);
 const entries=[['canonical-truth-receipt-v1.json',text(receipt)],['canonical-truth-validation-output-v1.json',text(output)]];
 const bytes=zip(entries);return {...f,entries,bytes,artifact:{...f.artifact,digest:digest(bytes),size_in_bytes:bytes.length}};
}
for(const [name,mutate,options] of [
 ['fabricated registry digest repeated in both members',x=>{x.material_defect_registry_sha256=d;},{recomputeRegistry:false}],
 ['priority inconsistent with title and labels',x=>{x.material_defects[0].effective_priority='P0';}],
 ['declared severity not derived from title',x=>{x.material_defects[0].declared_severity=[];}],
 ['label and declared title conflict',x=>{x.material_defects[0].labels=['P0'];}],
 ['noncanonical duplicate labels',x=>{x.material_defects[0].labels=['P1','P1'];}],
 ['material record with an undeclared field',x=>{x.material_defects[0].hidden_authority='PASS';}],
 ['query cardinality inconsistent with labels',x=>{x.material_defect_query_cardinality={P0:1,P1:0};}],
 ['query counts use booleans',x=>{x.material_defect_query_cardinality={P0:false,P1:true};}],
 ['wrong output validator',x=>{x.validator='OTHER_VALIDATOR';}],
 ['wrong output version',x=>{x.version='0.0.0';}],
 ['legacy authority model',x=>{x.authority_model='CANONICAL_V2';}],
 ['generation from another main',x=>{x.generation_id=generationId('b'.repeat(40),123,1);}],
 ['unsafe generation writer identifier',x=>{x.generation_id=`kpmo-canonical-v3-${sha.slice(0,12)}-9007199254740993-1`;}],
 ['missing aggregate commit',x=>{x.aggregate_comment_id=0;}],
 ['incomplete canonical board set',x=>{x.canonical_issues.pop();}],
 ['substituted canonical board',x=>{x.canonical_issues[0]=99999;}],
 ['future non-current canonical policy',x=>{x.canonical_main_policy='ACCEPT_PREDECESSOR';}],
 ['unverified pagination',x=>{x.dynamic_query_pagination_verified=false;}],
 ['unverified query counts',x=>{x.dynamic_query_cardinality_verified=false;}],
 ['incomplete search accepted',x=>{x.dynamic_query_incomplete_results_rejected=false;}],
 ['unverified ancestry',x=>{x.canonical_main_ancestry_verified=false;}],
 ['legacy body claims authority',x=>{x.legacy_v2_body_authority=true;}],
 ['contradictory public boundaries',x=>{x.public_release='HOLD';x.public='PASS';}],
 ['unsorted material registry',x=>{x.material_defects.push(...buildMaterialRegistry([{number:100,state:'open',title:'[P1] SYNTHETIC older issue',labels:['P1']}]));x.material_defect_count=2;x.material_defect_query_cardinality.P1=2;}],
])test(`Canonical rejects fully rebound ${name}`,()=>assert.throws(()=>check(rebindCanonicalOutput(mutate,options)),/CANONICAL_|CONTENT_PUBLIC_BOUNDARY/));

test('Canonical accepts native overlapping P0/P1 labels without adding the overlapping counts',()=>{
 const f=rebindCanonicalOutput(x=>{x.material_defects=buildMaterialRegistry([{number:10,state:'open',title:'[P0/P1] SYNTHETIC combined',labels:['P0','P1']},{number:11,state:'open',title:'SYNTHETIC label-only issue',labels:['P1']}]);x.material_defect_count=2;x.material_defect_query_cardinality={P0:1,P1:2};});
 assert.equal(check(f).state,'VERIFIED_PASS');
});
test('Canonical empty material registry is valid only with its actual digest and zero counts',()=>{
 const f=rebindCanonicalOutput(x=>{x.material_defects=[];x.material_defect_count=0;x.material_defect_query_cardinality={P0:0,P1:0};});
 assert.equal(check(f).state,'VERIFIED_PASS');
});
for(const [name,raw] of [['positive exponent overflow','{"number":1e999}'],['negative exponent overflow','{"number":-1e999}']]){
 for(const extension of ['json','ndjson'])test(`safe ZIP reader rejects ${name} in ${extension}`,()=>{
  const bytes=zip([[`auxiliary.${extension}`,raw]]);assert.throws(()=>readArchive(bytes,digest(bytes)),/ARCHIVE_CONTENT_REJECTED/);
 });
}
test('safe ZIP reader rejects original ZIP names with NUL suffixes',()=>{const bytes=zip([['receipt.json\0untrusted','{}']]);assert.throws(()=>readArchive(bytes,digest(bytes)));});

test('sentinel PR trigger watches native Canonical semantics and producer output contract',()=>{
 const source=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
 for(const file of ['scripts/kidults/kpmo/material-defect-registry-v3.mjs','scripts/kidults/kpmo/canonical-generation-v3-lib.mjs','scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs','.github/workflows/kpmo-live-canonical-issue-truth-v1.yml'])assert.ok(source.includes(`      - '${file}'`));
});


function rebindCoverageSemantic(mutate,{leaderMutate=()=>{},semanticMutate=()=>{}}={}){
 const f=coverageFixture(),entries=f.entries.map(([n,t])=>[n,t]);
 const si=JSON.parse(entries[2][1]);mutate(si.material);semanticMutate(si);
 si.canonical_input_digest=digest(stable(si.material));entries[2][1]=text(si);
 const leader=JSON.parse(entries[1][1]);leader.canonical_input_digest=si.canonical_input_digest;
 leader.semantic_input_receipt_digest=digest(entries[2][1]);leaderMutate(leader);
 const unsigned={...leader};delete unsigned.observed_at;delete unsigned.receipt_digest;
 leader.receipt_digest=digest(stable(unsigned));entries[1][1]=text(leader);
 const bytes=zip(entries);return {...f,entries,bytes,artifact:{...f.artifact,digest:digest(bytes),size_in_bytes:bytes.length}};
}
for(const [name,mutate,options] of [
 ['missing native material contract',m=>{for(const k of Object.keys(m))delete m[k];m.synthetic_fixture=true;}],
 ['wrong material source',m=>{m.source_sha='b'.repeat(40);}],
 ['wrong projection domain',m=>{m.domain='OTHER_DOMAIN';}],
 ['wrong upstream class',m=>{m.upstream_class='UNRELATED_PRODUCER';}],
 ['wrong projection version',m=>{m.projection_version='0.0.0';}],
 ['omitted native allowlist',m=>{m.projection_allowlist.receipt.pop();}],
 ['undeclared material field',m=>{m.execution_claim='FORGED';}],
 ['missing static source',m=>{delete m.authoritative_input_digests.runtime_contract;}],
 ['extra static source',m=>{m.authoritative_input_digests.external={path:'/tmp/untrusted',digest:d};}],
 ['static path substitution',m=>{m.authoritative_input_digests.runtime_contract.path='/tmp/runtime.json';}],
 ['static digest substitution',m=>{m.authoritative_input_digests.runtime_contract.digest=d;}],
 ['missing implementation',m=>{delete m.implementation_digests[IMPLEMENTATION_FILES[0]];}],
 ['implementation digest substitution',m=>{m.implementation_digests[IMPLEMENTATION_FILES[0]].digest=d;}],
 ['implementation path substitution',m=>{m.implementation_digests[IMPLEMENTATION_FILES[0]].path='other.mjs';}],
 ['changed authoritative constant',m=>{m.authoritative_input_constants.replacement_queue_id='FORGED';}],
 ['missing authoritative constant',m=>{delete m.authoritative_input_constants.replacement_queue_id;}],
 ['missing provenance exclusion',m=>{m.volatile_provenance_excluded_from_identity.pop();}],
 ['contract id mismatch',m=>{m.coverage_contract.id='OTHER_CONTRACT';}],
 ['contract version mismatch',m=>{m.coverage_contract.version='99.0.0';}],
 ['contract bytes digest mismatch',m=>{m.coverage_contract.digest=d;}],
 ['malformed ARL projection hash',m=>{m.arl_semantic_outputs.manifest_digest='not-a-digest';}],
 ['extra ARL projection hash',m=>{m.arl_semantic_outputs.unbound=d;}],
 ['leader contract mismatch',()=>{},{leaderMutate:l=>{l.canonical_contract_digest=d;}}],
 ['unrequired upstream provenance',()=>{},{semanticMutate:s=>{s.exact_upstream_provenance_required_in_observation_receipt=false;}}],
 ['missing provenance declaration',()=>{},{semanticMutate:s=>{delete s.exact_upstream_provenance_included_in_identity;}}],
])test(`Coverage native closure rejects fully rebound ${name}`,()=>assert.throws(()=>check(rebindCoverageSemantic(mutate,options)),/COVERAGE_/));

test('Coverage native closure accepts the real producer projection contract but does not attest unseen ARL bytes',()=>{
 const result=check(coverageFixture());assert.equal(result.state,'VERIFIED_PASS');
 assert.equal(result.static_source_bindings_verified,true);
 assert.equal(result.upstream_payload_recomputed,false);
 assert.equal(result.verified_authoritative_input_count,AUTHORITATIVE_INPUT_FILE_KEYS.length);
 assert.equal(result.verified_implementation_count,IMPLEMENTATION_FILES.length);
});


test('Coverage native closure dependencies participate in the existing bounded PR trigger',()=>{
 const workflow=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
 const file='coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json';
 const contract=JSON.parse(fs.readFileSync(file));
 for(const dependency of [file,...AUTHORITATIVE_INPUT_FILE_KEYS.map(k=>contract.authoritative_inputs[k]),...IMPLEMENTATION_FILES])assert.ok(workflow.includes(`      - '${dependency}'`),dependency);
});


test('Coverage alias preserves native static verification and the upstream recomputation limitation',()=>{
 const {f,artifact}=aliasFixture();
 const alias=check(f),leader=check({...coverage,artifact});
 const result=validateCoverageAliasClosure(alias,leader,coverage.run,artifact);
 assert.equal(result.state,'VERIFIED_PASS');
 assert.equal(result.static_source_bindings_verified,true);
 assert.equal(result.verified_authoritative_input_count,AUTHORITATIVE_INPUT_FILE_KEYS.length);
 assert.equal(result.verified_implementation_count,IMPLEMENTATION_FILES.length);
 assert.equal(result.upstream_payload_recomputed,false);
});
for(const [name,mutate] of [
 ['unverified native static inputs',p=>{p.static_source_bindings_verified=false;}],
 ['missing static input count',p=>{delete p.verified_authoritative_input_count;}],
 ['incomplete implementation count',p=>{p.verified_implementation_count-=1;}],
 ['unperformed upstream recomputation claim',p=>{p.upstream_payload_recomputed=true;}],
])test(`Coverage alias rejects ${name}`,()=>{
 const {f,artifact}=aliasFixture();
 const alias=check(f),leader=check({...coverage,artifact});mutate(leader);
 assert.throws(()=>validateCoverageAliasClosure(alias,leader,coverage.run,artifact),/COVERAGE_ALIAS_NATIVE_PROOF_REQUIRED/);
});
