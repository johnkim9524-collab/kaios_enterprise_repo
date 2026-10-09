import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {executeRuntimeDomainWorkloads} from '../../../scripts/kidults/runtime/runtime-domain-workloads-v1.mjs';
import {connectAuthenticatedBusinessInput} from '../../../scripts/kidults/integration/authenticated-business-input-v1.mjs';
import {NOW,batchEnvelope,rawObservation,receiptRegistryFor,sealObservation} from '../market/current-sold-test-helpers-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const row=sealObservation(rawObservation({canonical_run_id:'900'})),envelope=batchEnvelope([row],{canonical_run_id:'900'});
  const purposeRights=[{source_id:row.source_id,rights_state:'ALLOW',purpose_rights:{collect:'ALLOW',store:'ALLOW',derive:'ALLOW'},
    commercial_use_authorized:true,access_authorized:true,purpose_bindings:[{purpose:'CURRENT_SOLD_TRANSACTION',source_roles:['SOLD_TRANSACTION'],
      evidence_classes:['CURRENT_SOLD_TRANSACTION'],fields:['transaction_id','sold_status','realized_price','currency','sale_date'],
      outputs:['INTERNAL_CURRENT_SOLD_EVIDENCE'],scope_verified:true,time_scope_verified:true,freshness_verified:true,license_scope_verified:true,
      evidence_refs:['registry:fixture-only'],evidence_digest:'sha256:'+'a'.repeat(64),
      observed_at:new Date(NOW.getTime()-1000).toISOString(),review_due_at:new Date(NOW.getTime()+100000).toISOString()}]}];
  const files={envelope:Buffer.from(JSON.stringify(envelope)),receiptRegistry:Buffer.from(JSON.stringify(receiptRegistryFor(row))),purposeRights:Buffer.from(JSON.stringify(purposeRights))};
  const binding={schema_version:'business-input-file-binding-v1',source_sha:envelope.source_sha,canonical_run_id:envelope.canonical_run_id,
    file_digests:Object.fromEntries(Object.entries(files).map(([key,bytes])=>[key,hash(bytes)]))};
  const members={'business-input-binding.json':JSON.stringify(binding),'envelope.json':files.envelope.toString(),
    'receipt-registry.json':files.receiptRegistry.toString(),'purpose-rights.json':files.purposeRights.toString()};
  const runId=Number(envelope.canonical_run_id);
  assert.ok(Number.isSafeInteger(runId)&&runId>0);
  const contract={id:'kidults-authenticated-business-input-connection-v1',repository,maximum_age_seconds:7200,
    producers:[{id:'fixture-input',workflow:'kidults-fixture-acquisition.yml',artifact_prefix:'kidults-fixture-input',source_ids:[row.source_id]}],
    domain_receipt_emission:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
  const run={id:runId,repository:{full_name:repository},path:'.github/workflows/kidults-fixture-acquisition.yml',head_branch:'main',head_sha:envelope.source_sha,
    run_attempt:1,event:'schedule',status:'completed',conclusion:'success',created_at:new Date(NOW.getTime()-2000).toISOString(),run_started_at:new Date(NOW.getTime()-2000).toISOString()};
  const artifact={id:123,name:`kidults-fixture-input-${envelope.source_sha}-${runId}-1`,expired:false,
    workflow_run:{id:runId,head_sha:envelope.source_sha},created_at:new Date(NOW.getTime()-1000).toISOString(),expires_at:new Date(NOW.getTime()+100000).toISOString()};
  return {contract,run,artifact,members,sourceSha:envelope.source_sha,now:NOW,reference:{producer_id:'fixture-input',run_id:runId,artifact_id:123}};
}
function args(f){
  const zip=spawnSync('python3',['-I','-c','import io,json,sys,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:\n for k,v in json.load(sys.stdin).items(): z.writestr(k,v)\nsys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(f.members)});
  assert.equal(zip.status,0);
  const bytes=zip.stdout;
  f.artifact.digest=hash(bytes);f.artifact.size_in_bytes=bytes.length;
  return {...f,token:'test-fixture-only',download:async()=>bytes,read:async url=>{
    if(url.endsWith('/branches/main'))return {commit:{sha:f.sourceSha}};
    if(url.endsWith(`/actions/runs/${f.run.id}`))return structuredClone(f.run);
    if(url.endsWith(`/actions/artifacts/${f.artifact.id}`))return structuredClone(f.artifact);
    if(url.endsWith(`/actions/runs/${f.run.id}/artifacts?per_page=100`))return {total_count:1,artifacts:[structuredClone(f.artifact)]};
    throw new Error('unexpected URL');
  }};
}
test('fixture native transport is consumed as data and never converted into a live domain certificate',async()=>{
  const result=await connectAuthenticatedBusinessInput(args(fixture()));
  assert.equal(result.state,'INPUT_TRANSPORT_AND_CONTENT_VERIFIED');
  assert.equal(result.binding_transport_authenticated,true);
  assert.equal(result.input_processing.bundle.evidence.length,1);
  const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
  const processed=executeRuntimeDomainWorkloads({connection:result,definition,sourceSha:result.source_sha});
  assert.equal(processed.locally_executed_domain_count,6);
  assert.equal(processed.native_verified_domain_count,0);
  for(const key of ['legal_admission_independently_verified','immutable_pair_created','remote_workload_verified','native_domain_receipt_emitted'])assert.equal(result[key],false);
});
test('missing and unregistered references HOLD without network or downstream execution',async()=>{
  const f=fixture();f.contract.producers=[];
  const input={...f,read:async()=>{throw new Error('network must not run');}};
  assert.equal((await connectAuthenticatedBusinessInput({...input,reference:null})).blocker,'AUTHENTICATED_INPUT_REFERENCE_MISSING');
  assert.equal((await connectAuthenticatedBusinessInput(input)).blocker,'SOURCE_PRODUCER_NOT_REGISTERED');
});
for(const [name,mutate] of [
  ['wrong workflow',f=>f.run.path='.github/workflows/kidults-unregistered.yml'],
  ['foreign repository',f=>f.run.repository.full_name='attacker/repo'],
  ['PR branch',f=>f.run.head_branch='feature'],['foreign SHA',f=>f.run.head_sha='b'.repeat(40)],
  ['manual event',f=>f.run.event='workflow_dispatch'],['rerun',f=>f.run.run_attempt=2],
  ['failed producer',f=>f.run.conclusion='failure'],['in-flight producer',f=>f.run.status='in_progress'],
  ['stale input',f=>f.run.created_at=new Date(NOW.getTime()-7200001).toISOString()],
  ['future input',f=>f.run.created_at=new Date(NOW.getTime()+1).toISOString()],
  ['expired artifact',f=>f.artifact.expired=true],['foreign artifact run',f=>f.artifact.workflow_run.id++],
  ['wrong artifact name',f=>f.artifact.name='arbitrary'],
  ['extra member',f=>f.members['extra.json']='{}'],
  ['missing registry',f=>delete f.members['receipt-registry.json']],
  ['changed input bytes',f=>f.members['envelope.json']+=' '],
  ['nested member path',f=>{f.members['nested/envelope.json']=f.members['envelope.json'];delete f.members['envelope.json'];}],
  ['unadmitted source',f=>f.contract.producers[0].source_ids=['other-source']],
  ['domain emission expansion',f=>f.contract.domain_receipt_emission=true],
  ['release elevation',f=>f.contract.production='GO'],
])test(`rejects ${name}`,async()=>{const f=fixture();mutate(f);await assert.rejects(connectAuthenticatedBusinessInput(args(f)));});
test('rejects archive bytes that disagree with native digest',async()=>{
  const input=args(fixture()),download=input.download;
  input.download=async()=>Buffer.concat([await download(),Buffer.from('tamper')]);
  await assert.rejects(connectAuthenticatedBusinessInput(input),/ARCHIVE_DIGEST/);
});
test('rejects main drift observed after exact artifact readback',async()=>{
  const input=args(fixture()),read=input.read;let count=0;
  input.read=async url=>url.endsWith('/branches/main')&&++count===2?{commit:{sha:'b'.repeat(40)}}:read(url);
  await assert.rejects(connectAuthenticatedBusinessInput(input),/MAIN_CHANGED/);
});
test('rejects a requested run whose returned ID differs',async()=>{
  const input=args(fixture()),read=input.read;input.reference.run_id=777;
  input.read=async url=>url.endsWith('/actions/runs/777')?read(url.replace('/777','/900')):read(url);
  await assert.rejects(connectAuthenticatedBusinessInput(input),/NATIVE_PRODUCER/);
});
test('rejects an artifact readback whose returned ID differs',async()=>{
  const input=args(fixture()),read=input.read;
  input.read=async url=>{const result=await read(url);if(url.endsWith('/actions/artifacts/123'))result.id=124;return result;};
  await assert.rejects(connectAuthenticatedBusinessInput(input),/ARTIFACT_CHANGED/);
});
