import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalJsonDigest as digest} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {authenticateRuntimeDomainOutput,reconcileRuntimeDomainOutputs} from '../../../scripts/kidults/integration/authenticated-runtime-domain-outputs-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40),h='sha256:'+'b'.repeat(64);
const now=new Date('2026-10-09T00:34:00Z'),rawHash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const holds={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const seal=(body,key)=>({...body,[key]:digest(body)});
function fixture(domainId='VALUE_TRACEABILITY'){
 const workflow='kidults-fixture-domain.yml',prefix='kidults-fixture-domain',runId=900;
 const output=seal({id:'kidults-runtime-domain-output-v1',domain_id:domainId,source_sha:sha,input_digest:h,
  fixture_evidence:false,dependency_receipt_digests:{},edge_count:1,source_digest:h,decision_digest:h,lineage_digest:h,...holds},'output_digest');
 const members={'domain-output.json':JSON.stringify(output)};
 const primaryName=domainId==='SECURITY_SUPPLY_CHAIN'?'security-results.json':'domain-output.json';
 if(domainId==='SECURITY_SUPPLY_CHAIN'){delete members['domain-output.json'];members[primaryName]='{"audit":"fixture"}';}
 const receipt={id:'kidults-value-chain-runtime-domain-receipt-v1',domain_id:domainId,source_sha:sha,
  repository:repo,workflow_path:'.github/workflows/'+workflow,run_id:runId,run_attempt:1,
  state:'VERIFIED_PASS',execution_mode:'LIVE_RUNTIME',fixture_evidence:false,empirical_inputs_verified:true,...holds,
  primary_evidence:[{name:primaryName,digest:rawHash(Buffer.from(members[primaryName])),
   protected_source_ref:`https://github.com/${repo}/actions/runs/${runId}#artifact/${primaryName}`}]};
 members['runtime-domain-receipt.json']=JSON.stringify(seal(receipt,'receipt_digest'));
 return {domainId,sourceSha:sha,inputDigest:h,sourceIds:['fixture-source'],now,members,
  contract:{id:'kidults-whole-platform-operating-proof-v1',repository:repo,maximum_evidence_age_seconds:108000,...holds,
   runtime_domain_sources:[{domain_id:domainId,workflow,artifact_prefix:prefix}]},
  reference:{run_id:runId,artifact_id:123},
  run:{id:runId,path:'.github/workflows/'+workflow,repository:{full_name:repo},head_sha:sha,head_branch:'main',
   run_attempt:1,event:'schedule',status:'completed',conclusion:'success',
   created_at:new Date(now-2000).toISOString(),run_started_at:new Date(now-2000).toISOString()},
  artifact:{id:123,name:`${prefix}-${sha}-${runId}-1`,expired:false,workflow_run:{id:runId,head_sha:sha},
   created_at:new Date(now-1000).toISOString(),expires_at:new Date(+now+100000).toISOString()}};
}
function args(f){
 const z=spawnSync('python3',['-I','-c','import io,json,sys,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:\n for k,v in json.load(sys.stdin).items(): z.writestr(k,v)\nsys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(f.members)});
 assert.equal(z.status,0);const bytes=z.stdout;
 f.artifact.digest=rawHash(bytes);f.artifact.size_in_bytes=bytes.length;
 return {...f,token:'test-fixture-only',download:async()=>bytes,read:async url=>{
  if(url.endsWith('/branches/main'))return {commit:{sha}};
  if(url.endsWith('/actions/runs/900'))return structuredClone(f.run);
  if(url.endsWith('/actions/artifacts/123'))return structuredClone(f.artifact);
  if(url.endsWith('/actions/runs/900/artifacts?per_page=100'))return {total_count:1,artifacts:[structuredClone(f.artifact)]};
  throw new Error('unexpected URL');
 }};
}
function changeReceipt(f,fn){const r=JSON.parse(f.members['runtime-domain-receipt.json']);delete r.receipt_digest;fn(r);f.members['runtime-domain-receipt.json']=JSON.stringify(seal(r,'receipt_digest'));}

test('native output fixture exercises transport and content boundaries without emitting certificates',async()=>{
 const result=await authenticateRuntimeDomainOutput(args(fixture()));
 assert.equal(result.state,'AUTHENTICATED_NATIVE_OUTPUT_CONTENT_VERIFIED');
 assert.equal(result.semantic_result.native_producer_authenticated,false);
 assert.equal(result.native_domain_receipt_emitted,false);assert.equal(result.dispatch_authorized,false);
});
test('security fixture authenticates every primary byte digest',async()=>{
 assert.equal((await authenticateRuntimeDomainOutput(args(fixture('SECURITY_SUPPLY_CHAIN')))).state,'AUTHENTICATED_NATIVE_OUTPUT_CONTENT_VERIFIED');
});
test('unregistered, missing reference and missing read token hold without network access',async()=>{
 const f=fixture(),read=async()=>{throw new Error('must not read');};
 assert.equal((await authenticateRuntimeDomainOutput({...f,contract:{...f.contract,runtime_domain_sources:[]},read})).blocker,'NATIVE_DOMAIN_PRODUCER_NOT_REGISTERED');
 assert.equal((await authenticateRuntimeDomainOutput({...f,reference:null,read})).blocker,'NATIVE_DOMAIN_OUTPUT_REFERENCE_MISSING');
 assert.equal((await authenticateRuntimeDomainOutput({...f,read})).blocker,'NATIVE_ARTIFACT_READ_AUTHORITY_MISSING');
});
for(const [name,mutate] of [
 ['wrong workflow',f=>f.run.path='.github/workflows/kidults-other.yml'],
 ['wrong run',f=>f.run.id++],['wrong repository',f=>f.run.repository.full_name='other/repo'],
 ['wrong head',f=>f.run.head_sha='c'.repeat(40)],['feature branch',f=>f.run.head_branch='feature'],
 ['manual dispatch',f=>f.run.event='workflow_dispatch'],['rerun',f=>f.run.run_attempt=2],
 ['failed run',f=>f.run.conclusion='failure'],['running run',f=>f.run.status='in_progress'],
 ['stale run',f=>f.run.created_at=new Date(now-7200001).toISOString()],
 ['future run',f=>f.run.created_at=new Date(+now+1).toISOString()],
 ['wrong artifact run',f=>f.artifact.workflow_run.id++],['expired artifact',f=>f.artifact.expired=true],
 ['wrong artifact name',f=>f.artifact.name='other'],['expired by timestamp',f=>f.artifact.expires_at=now.toISOString()],
 ['extra archive member',f=>f.members['extra.json']='{}'],['missing receipt',f=>delete f.members['runtime-domain-receipt.json']],
 ['unbound changed output bytes',f=>f.members['domain-output.json']+=' '],
 ['duplicate registration',f=>f.contract.runtime_domain_sources.push({...f.contract.runtime_domain_sources[0]})],
 ['contract promotion',f=>f.contract.public='GO'],
 ['wrong receipt workflow',f=>changeReceipt(f,r=>r.workflow_path='.github/workflows/kidults-other.yml')],
 ['wrong protected primary source',f=>changeReceipt(f,r=>r.primary_evidence[0].protected_source_ref='https://example.com/fake')],
 ['fixture marked receipt',f=>changeReceipt(f,r=>r.fixture_evidence=true)],
 ['wrong receipt domain',f=>changeReceipt(f,r=>r.domain_id='SOURCE_RIGHTS')],
 ['receipt promotion',f=>changeReceipt(f,r=>r.g5='GO')],
 ['missing native dependency join',f=>f.requiredDependencyIds=['SOURCE_RIGHTS']],
 ['foreign native dependency join',f=>{
  f.requiredDependencyIds=['SOURCE_RIGHTS'];f.dependencyReceiptDigests={SOURCE_RIGHTS:h};
  const o=JSON.parse(f.members['domain-output.json']);delete o.output_digest;
  o.dependency_receipt_digests={SOURCE_RIGHTS:'sha256:'+'c'.repeat(64)};
  f.members['domain-output.json']=JSON.stringify(seal(o,'output_digest'));
  changeReceipt(f,r=>r.primary_evidence[0].digest=rawHash(Buffer.from(f.members['domain-output.json'])));
 }],
 ['semantic input mismatch',f=>{
  const o=JSON.parse(f.members['domain-output.json']);delete o.output_digest;o.input_digest='sha256:'+'c'.repeat(64);
  f.members['domain-output.json']=JSON.stringify(seal(o,'output_digest'));
  changeReceipt(f,r=>r.primary_evidence[0].digest=rawHash(Buffer.from(f.members['domain-output.json'])));
 }],
])test(`native output rejects ${name}`,async()=>{const f=fixture();mutate(f);await assert.rejects(authenticateRuntimeDomainOutput(args(f)));});
test('security rejects fabricated primary bytes even with resealed native receipt',async()=>{
 const f=fixture('SECURITY_SUPPLY_CHAIN');f.members['security-results.json']='{}';
 await assert.rejects(authenticateRuntimeDomainOutput(args(f)),/SECURITY_EVIDENCE_DIGEST/);
});
test('native output rejects ZIP digest drift',async()=>{
 const a=args(fixture()),d=a.download;a.download=async()=>Buffer.concat([await d(),Buffer.from('tamper')]);
 await assert.rejects(authenticateRuntimeDomainOutput(a),/ARCHIVE_DIGEST/);
});
for(const kind of ['MAIN_CHANGED','RUN_CHANGED','ARTIFACT_CHANGED'])test(`native output rejects final readback ${kind}`,async()=>{
 const a=args(fixture()),read=a.read;let main=0,run=0;
 a.read=async url=>{const r=await read(url);
  if(url.endsWith('/branches/main')&&++main===2&&kind==='MAIN_CHANGED')r.commit.sha='c'.repeat(40);
  if(url.endsWith('/actions/runs/900')&&++run===2&&kind==='RUN_CHANGED')r.created_at=new Date(now-3000).toISOString();
  if(url.endsWith('/actions/artifacts/123')&&kind==='ARTIFACT_CHANGED')r.size_in_bytes++;
  return r;
 };await assert.rejects(authenticateRuntimeDomainOutput(a),new RegExp(kind));
});
test('reconciliation preserves fourteen HOLDs without input, certificate or network execution',async()=>{
 const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
 const f=fixture('SECURITY_SUPPLY_CHAIN');
 const result=await reconcileRuntimeDomainOutputs({...f,definition,connection:{state:'HOLD'},read:async()=>{throw new Error('must not read');}});
 assert.equal(result.domains.length,14);assert.equal(result.authenticated_output_count,0);
 assert.equal(result.whole_platform_runtime_proven,false);assert.equal(result.native_domain_receipt_emitted,false);
 for(const row of result.domains)assert.equal(row.state,'HOLD');
});
test('reconciliation rejects invented domain and cyclic definitions',async()=>{
 const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
 const f=fixture();const other=structuredClone(definition);other.domains[0].id='INVENTED';
 await assert.rejects(reconcileRuntimeDomainOutputs({...f,definition:other}));
 const cycle=structuredClone(definition);cycle.domains.find(r=>r.id==='SOURCE_RIGHTS').requires=['ENTITY_RESOLUTION'];
 await assert.rejects(reconcileRuntimeDomainOutputs({...f,definition:cycle}),/DEPENDENCY_CYCLE/);
});
test('reconciled native security fixture strips private receipt and primary bodies',async()=>{
 const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
 const f=fixture('SECURITY_SUPPLY_CHAIN');
 const result=await reconcileRuntimeDomainOutputs({...args(f),references:{SECURITY_SUPPLY_CHAIN:f.reference},definition,connection:{state:'HOLD'}});
 assert.equal(result.authenticated_output_count,1);assert.equal(result.state,'VERIFIED_INCOMPLETE');
 assert.equal(result.domains.filter(r=>r.state==='HOLD').length,13);
 const security=result.domains.find(r=>r.domain_id==='SECURITY_SUPPLY_CHAIN');
 assert.equal(Object.hasOwn(security,'receipt'),false);assert.equal(Object.hasOwn(security,'output'),false);
 assert.equal(JSON.stringify(result).includes('primary_evidence'),false);
});
test('runtime reliability waits for authenticated immutable business pair even when original graph has no dependency',async()=>{
 const definition=JSON.parse(fs.readFileSync(new URL('../../../coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json',import.meta.url)));
 const f=fixture('SECURITY_SUPPLY_CHAIN');
 const result=await reconcileRuntimeDomainOutputs({...f,definition,connection:{state:'INPUT_TRANSPORT_AND_CONTENT_VERIFIED'},read:async()=>{throw new Error('must not read');}});
 const reliability=result.domains.find(r=>r.domain_id==='RUNTIME_RELIABILITY');
 assert.equal(reliability.blocker,'AUTHENTICATED_NATIVE_DEPENDENCY_MISSING');
 assert.deepEqual(reliability.unmet_dependencies,['IMMUTABLE_CANDIDATE']);
});
