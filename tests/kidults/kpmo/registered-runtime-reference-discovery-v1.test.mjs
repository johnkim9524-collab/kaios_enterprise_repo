import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRegisteredRuntimeReferences as discover} from '../../../scripts/kidults/integration/discover-registered-runtime-references-v1.mjs';
const sha='a'.repeat(40),repo='johnkim9524-collab/kaios_enterprise_repo',now=new Date('2026-10-09T02:00:00Z');
function fixture(){
 const holds={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 const inputContract={id:'kidults-authenticated-business-input-connection-v1',repository:repo,maximum_age_seconds:7200,producers:[],...holds};
 const domainContract={id:'kidults-whole-platform-operating-proof-v1',repository:repo,maximum_evidence_age_seconds:108000,
  value_chain_dimensions:['SECURITY_SUPPLY_CHAIN','VALUE_TRACEABILITY'],runtime_domain_sources:[{domain_id:'SECURITY_SUPPLY_CHAIN',workflow:'kidults-security.yml',artifact_prefix:'kidults-security'}],...holds};
 const run={id:101,repository:{full_name:repo},head_branch:'main',head_sha:sha,path:'.github/workflows/kidults-security.yml',
  run_attempt:1,event:'push',status:'completed',conclusion:'success',created_at:'2026-10-09T01:00:00Z',run_started_at:'2026-10-09T01:00:01Z'};
 const artifact={id:201,name:`kidults-security-${sha}-101-1`,digest:'sha256:'+'b'.repeat(64),expired:false,
  workflow_run:{id:101,head_sha:sha},size_in_bytes:100,created_at:'2026-10-09T01:01:00Z',expires_at:'2026-10-10T00:00:00Z'};
 const runs={total_count:1,workflow_runs:[run]},artifacts={total_count:1,artifacts:[artifact]},calls=[];
 let mainReads=0;const main={name:'main',protected:true,commit:{sha}};
 const read=async url=>{calls.push(url);if(url.endsWith('/branches/main')){mainReads++;return structuredClone(main);}
  if(url.includes('/actions/workflows/'))return structuredClone(runs);
  if(url.includes('/actions/runs/'))return structuredClone(artifacts);throw Error('UNEXPECTED_READ');};
 return {inputContract,domainContract,sourceSha:sha,token:'synthetic-read-token',now,read,run,artifact,runs,artifacts,calls,main};
}
test('select registered natural exact-main artifact without requiring a manifest',async()=>{
 const f=fixture(),r=await discover(f);assert.deepEqual(r.domain_references.SECURITY_SUPPLY_CHAIN,{run_id:101,artifact_id:201});
 assert.equal(r.selection_is_content_verification,false);assert.equal(r.registration,false);assert.equal(r.dispatch,false);assert.equal(r.external_writes,0);
 assert.equal(r.diagnostics[0].blocker,'BUSINESS_INPUT_PRODUCER_NOT_REGISTERED');assert.equal(f.calls.length,4);
 assert.match(f.calls[1],/head_sha=a{40}/);
});
test('all empty registries need no token or network',async()=>{
 const f=fixture();f.domainContract.runtime_domain_sources=[];delete f.token;
 const r=await discover(f);assert.equal(r.state,'NO_DISCOVERY_REQUIRED');assert.equal(f.calls.length,0);
});
test('missing read token retains HOLD without requests',async()=>{
 const f=fixture();delete f.token;const r=await discover(f);assert.equal(r.state,'HOLD');assert.equal(f.calls.length,0);
});
test('supplied refs are preserved and require later byte authentication',async()=>{
 const f=fixture();f.domainReferences={SECURITY_SUPPLY_CHAIN:{run_id:777,artifact_id:888}};
 const r=await discover(f);assert.deepEqual(r.domain_references,f.domainReferences);assert.equal(f.calls.length,0);assert.equal(r.selection_is_content_verification,false);
});
test('latest failed natural run does not fall back to an older success',async()=>{
 const f=fixture();f.runs.workflow_runs.push({...f.run,id:102,created_at:'2026-10-09T01:30:00Z',conclusion:'failure'});f.runs.total_count=2;
 const r=await discover(f);assert.deepEqual(r.domain_references,{});assert.equal(r.diagnostics.at(-1).blocker,'LATEST_NATURAL_RUN_NOT_SUCCESS');assert.equal(f.calls.length,3);
});
test('shared workflow run and artifact indexes are read once per selection pass',async()=>{
 const f=fixture();f.domainContract.runtime_domain_sources.push({domain_id:'VALUE_TRACEABILITY',workflow:'kidults-security.yml',artifact_prefix:'kidults-lineage'});
 f.artifacts.artifacts.push({...f.artifact,id:202,name:`kidults-lineage-${sha}-101-1`});f.artifacts.total_count=2;
 const r=await discover(f);assert.equal(r.domain_references.VALUE_TRACEABILITY.artifact_id,202);assert.equal(f.calls.length,4);
});
for(const [name,mutate] of [
 ['manual event',f=>f.run.event='workflow_dispatch'],['retry',f=>f.run.run_attempt=2],['wrong repository',f=>f.run.repository.full_name='other/repo'],
 ['old source',f=>f.run.head_sha='c'.repeat(40)],['wrong branch',f=>f.run.head_branch='feature'],['wrong workflow',f=>f.run.path='.github/workflows/kidults-other.yml']
])test('excluded run: '+name,async()=>{const f=fixture();mutate(f);const r=await discover(f);assert.deepEqual(r.domain_references,{});assert.equal(r.diagnostics.at(-1).blocker,'NATURAL_EXACT_MAIN_RUN_MISSING');});
test('stale successful run remains HOLD',async()=>{const f=fixture();f.run.created_at='2026-10-08T00:00:00Z';const r=await discover(f);assert.equal(r.diagnostics.at(-1).blocker,'LATEST_NATURAL_RUN_STALE');});
test('missing exact artifact remains HOLD',async()=>{const f=fixture();f.artifact.name='unrelated';const r=await discover(f);assert.equal(r.diagnostics.at(-1).blocker,'EXACT_NATIVE_ARTIFACT_MISSING');});
for(const [name,mutate,code] of [
 ['unprotected main',f=>f.main.protected=false,'EXACT_PROTECTED_MAIN'],['main source drift',f=>f.main.commit.sha='c'.repeat(40),'EXACT_PROTECTED_MAIN'],
 ['duplicate registration',f=>f.domainContract.runtime_domain_sources.push(f.domainContract.runtime_domain_sources[0]),'DUPLICATE_REGISTRATION'],
 ['unknown domain',f=>f.domainContract.runtime_domain_sources[0].domain_id='UNREGISTERED','DOMAIN_ID'],
 ['unsafe workflow',f=>f.domainContract.runtime_domain_sources[0].workflow='../x.yml','REGISTRATION'],
 ['run page truncation',f=>f.runs.total_count=2,'RUN_INDEX_BOUND'],['duplicate run',f=>{f.runs.workflow_runs.push(f.run);f.runs.total_count=2;},'RUN_INDEX_DUPLICATE'],
 ['future run',f=>f.run.created_at='2026-10-10T00:00:00Z','RUN_INDEX_IDENTITY'],
 ['artifact page truncation',f=>f.artifacts.total_count=2,'ARTIFACT_INDEX_BOUND'],
 ['duplicate artifact id',f=>{f.artifacts.artifacts.push(f.artifact);f.artifacts.total_count=2;},'ARTIFACT_INDEX_DUPLICATE'],
 ['duplicate artifact name',f=>{f.artifacts.artifacts.push({...f.artifact,id:202});f.artifacts.total_count=2;},'ARTIFACT_CARDINALITY'],
 ['expired artifact',f=>f.artifact.expired=true,'CONTENT_ARTIFACT_IDENTITY'],['bad digest',f=>f.artifact.digest='bad','CONTENT_ARTIFACT_IDENTITY'],
 ['artifact from another run',f=>f.artifact.workflow_run.id=999,'CONTENT_ARTIFACT_RUN_BINDING'],
 ['previous-attempt artifact',f=>f.artifact.created_at='2026-10-09T00:50:00Z','CONTENT_PREVIOUS_ATTEMPT_ARTIFACT'],
 ['release changed',f=>f.inputContract.production='ALLOW','CONTRACT']
])test('reject selection: '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(discover(f),new RegExp(code));});
test('main is re-read after indexes and any movement rejects selection',async()=>{
 const f=fixture(),read=f.read;let n=0;f.read=async url=>{const r=await read(url);if(url.endsWith('/branches/main')&&++n===2)r.commit.sha='c'.repeat(40);return r;};
 await assert.rejects(discover(f),/MAIN_CHANGED/);
});
test('multiple input feeds cannot be silently merged or chosen by recency',async()=>{
 const f=fixture();f.domainContract.runtime_domain_sources=[];
 f.inputContract.producers=[{id:'one',workflow:'kidults-security.yml',artifact_prefix:'kidults-security',source_ids:['s1']},
  {id:'two',workflow:'kidults-security.yml',artifact_prefix:'kidults-other-input',source_ids:['s2']}];
 f.artifacts.artifacts.push({...f.artifact,id:202,name:`kidults-other-input-${sha}-101-1`});f.artifacts.total_count=2;
 await assert.rejects(discover(f),/AMBIGUOUS_BUSINESS_INPUT/);
});
