import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zip,text} from './recovery-native-archive-fixture-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {digest} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {issueKirCoverageAssuranceContinuation,consumeKirCoverageAssuranceContinuation} from '../../../scripts/kidults/kpmo/validate-kir-coverage-assurance-continuation-v1.mjs';
import {verifyInterruptedRecoveryNativeTrigger,verifyInterruptedRecoveryNativeTriggerOnce,consumeInterruptedRecoveryNativeTriggerToken} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-native-trigger-v1.mjs';
import {assuranceSentinelObservationRoute} from '../../../scripts/kidults/kpmo/lib/assurance-sentinel-observation-route-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
test('failed Assurance admits only explicitly authenticated Coverage Sentinel continuation',()=>{
 const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
 const assuranceRun={id:990,event:'workflow_dispatch',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',head_sha:sha,head_branch:'main',repository:{full_name:repo}};
 const sentinelRun={id:991,event:'workflow_dispatch',path:sentinelPath,conclusion:'success',head_sha:sha,head_branch:'main',repository:{full_name:repo}};
 const audit={source:{sha},execution:{trigger:'workflow_dispatch',upstream:{run_id:'980',workflow_path:'.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml'}}};
 const core={source_sha:sha,repository:repo,protected_evidence:[{workflow_path:sentinelPath,run_id:991,run_attempt:1,source_sha:sha,artifact_id:992,artifact_digest:'sha256:'+'d'.repeat(64)}]};
 const proof={...core,receipt_digest:sha256(canonicalJson(core))};
 assert.throws(()=>assuranceSentinelObservationRoute({audit,sourceSha:sha,assuranceRun,jobs:{jobs:[]},proof,sentinelRun,profile:'failed-terminal-recovery'}));
 const result=assuranceSentinelObservationRoute({audit,sourceSha:sha,assuranceRun,jobs:{jobs:[]},proof,sentinelRun,profile:'failed-terminal-recovery',authenticatedContinuation:true});
 assert.equal(result.mode,'AUTHENTICATED_COVERAGE_CONTINUATION');assert.equal(result.sentinelRunId,991);
});
function fixture(){
 const upstream={id:100,name:'KPMO Continuous Assurance Success Authority Gate V1',path:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',event:'workflow_run',status:'completed',conclusion:'success',run_attempt:1,head_sha:sha,head_branch:'main',repository:{full_name:repo,id:1281328888}};
 const env={GITHUB_EVENT_NAME:'workflow_run',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha};
 const f={env,event:{action:'completed',workflow_run:upstream},live:structuredClone(upstream),jobs:{total_count:1,jobs:[{id:200,run_id:100,run_attempt:1,name:'success-authority-gate',status:'completed',conclusion:'success'}]},main:{name:'main',protected:true,commit:{sha}},calls:[]};
 f.get=async route=>{f.calls.push(route);return route==='branches/main'?f.main:route.includes('/jobs')?f.jobs:f.live;};return f;
}
test('existing natural Gate trigger requires actual authority success at exact attempt',async()=>{const f=fixture();assert.equal((await verifyInterruptedRecoveryNativeTrigger(f)).id,100);assert.deepEqual(f.calls,['actions/runs/100','actions/runs/100/attempts/1/jobs?per_page=100','branches/main']);});
for(const [name,mutate] of [
 ['manual',f=>f.env.GITHUB_EVENT_NAME='workflow_dispatch'],['rerun',f=>f.env.GITHUB_RUN_ATTEMPT='2'],
 ['upstream replay',f=>f.event.workflow_run.run_attempt=2],['borrowed source',f=>f.live.head_sha='b'.repeat(40)],
 ['skipped authority',f=>f.jobs.jobs[0].conclusion='skipped'],['missing authority',f=>{f.jobs.jobs=[];f.jobs.total_count=0;}],
 ['duplicate authority',f=>{f.jobs.jobs.push({...f.jobs.jobs[0],id:201});f.jobs.total_count=2;}],
 ['incomplete job pagination',f=>f.jobs.total_count=101],['unprotected main',f=>f.main.protected=false],['advanced main',f=>f.main.commit.sha='b'.repeat(40)]
])test('deny '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f));});
test('Verifier completion starts a separate fourth run bound back to the same authenticated Gate',async()=>{
 const {createHash}=await import('node:crypto');
 const f=fixture(),gate=f.live,role={...gate,id:300,name:'KIDULTS Autonomous Independent Verification V1',path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',created_at:'2026-10-11T00:00:00Z',run_started_at:'2026-10-11T00:00:00Z'};
 f.event.workflow_run=role;
 const receipt={source_sha:sha,gate_run_id:100,role_run_id:'300',actual_candidates:1};
 const bytes=zip([['interrupted-INDEPENDENT_VERIFIER.json',text(receipt)]]);
 const artifact={id:500,name:'kidults-postmerge-terminal-recovery-independent_verifier-300-1',expired:false,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),size_in_bytes:bytes.length,workflow_run:{id:300,head_sha:sha},created_at:'2026-10-11T00:01:00Z',expires_at:'2027-01-01T00:00:00Z'};
 f.get=async route=>route==='actions/runs/300'?role:route==='actions/runs/300/attempts/1/jobs?per_page=100'?{total_count:1,jobs:[{id:301,run_id:300,run_attempt:1,name:'Bounded original reservation terminal recovery INDEPENDENT_VERIFIER',status:'completed',conclusion:'success',steps:[{name:'Run bounded signed terminal recovery workload',status:'completed',conclusion:'success'}]}]}:route==='actions/runs/300/artifacts?per_page=100'?{total_count:1,artifacts:[artifact]}:route==='actions/runs/100'?gate:route.includes('/jobs')?f.jobs:f.main;
 f.readBytes=async()=>bytes;
 f.archiveReader=(input,expected)=>{assert.equal(digest(input),expected);return {archive_digest:expected,extraction_performed:false,members:[{name:'interrupted-INDEPENDENT_VERIFIER.json',encoding:'utf-8',text:text(receipt),sha256:digest(text(receipt))}]};};
 assert.equal((await verifyInterruptedRecoveryNativeTrigger(f)).id,100);
 artifact.workflow_run.id=301;await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f));
});

function failedAssuranceFixture(){
 const now=new Date().toISOString(),assurance={id:990,name:'KIDULTS Platform Continuous Assurance V1',path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',event:'workflow_run',status:'completed',conclusion:'failure',run_attempt:1,head_sha:sha,head_branch:'main',created_at:now,run_started_at:now,updated_at:now,repository:{full_name:repo,id:1281328888},head_repository:{full_name:repo}};
 const upstream={run_id:'991',run_attempt:'1',workflow_name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',workflow_path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',workflow_event:'workflow_run',conclusion:'success',repository:repo,head_branch:'main',source_receipt_digest:'sha256:'+'d'.repeat(64)};
 const auditCore={receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha,actual_sha:sha,expected_sha:sha,match:true},execution:{trigger:'workflow_run',workflow_run_id:'990',workflow_run_attempt:'1',upstream},states:{internal_control_state:'VERIFIED_PASS',promotion_eligible:false},checks:[{id:'CONTROL',required:true,state:'VERIFIED_PASS'}]};
 const audit={...auditCore,observed_at:now,receipt_digest:sha256(canonicalJson(auditCore))};
 const proofCore={id:'kidults-whole-platform-operating-proof-v1',source_sha:sha,repository:repo,state:'VERIFIED_FAIL',whole_platform_runtime_proven:false,
   operating_checks:[{id:'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL',state:'VERIFIED_FAIL',reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',evidence_refs:['800',801,'sha256:'+'c'.repeat(64)]},
     {id:'CORE_FOUR_CONTENT',state:'VERIFIED_PASS'}]};
 const proof={...proofCore,receipt_digest:sha256(canonicalJson(proofCore))};
 const bytes=zip([['audit-receipt.json',text(audit)],['whole-platform-operating-proof-v1.json',text(proof)]]),artifact={id:992,name:`kidults-continuous-assurance-${sha}-990-1`,digest:digest(bytes),size_in_bytes:bytes.length,expired:false,created_at:now,expires_at:new Date(Date.now()+86400000).toISOString(),workflow_run:{id:990,head_sha:sha}};
 const env={GITHUB_EVENT_NAME:'workflow_run',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha};
 const f={env,event:{action:'completed',workflow_run:assurance},assurance,audit,proof,artifact,bytes,calls:[],get:async route=>{f.calls.push(route);if(route==='actions/runs/990')return assurance;if(route==='actions/runs/990/attempts/1/jobs?per_page=100')return {total_count:1,jobs:[{id:993,run_id:990,run_attempt:1,name:'audit',status:'completed',conclusion:'failure'}]};if(route==='actions/runs/990/artifacts?per_page=100')return {total_count:1,artifacts:[artifact]};if(route==='branches/main')return {name:'main',protected:true,commit:{sha}};throw Error('unexpected '+route);},readBytes:async()=>f.bytes,
   archiveReader:(input,expected)=>{assert.equal(digest(input),expected);return {archive_digest:expected,extraction_performed:false,members:[
     {name:'audit-receipt.json',encoding:'utf-8',text:text(f.audit),sha256:digest(text(f.audit))},
     {name:'whole-platform-operating-proof-v1.json',encoding:'utf-8',text:text(f.proof),sha256:digest(text(f.proof))}]};}};return f;
}
test('failure Assurance parent is admitted only for isolated terminal-null proof and exact Sentinel workflow_run',async()=>{
 const f=failedAssuranceFixture(),result=await verifyInterruptedRecoveryNativeTrigger(f);assert.equal(result.recovery_parent.kind,'TERMINAL_NULL_ASSURANCE_FAILURE_V1');
 assert.equal(result.recovery_parent.actual_authority_granted,false);assert.equal(result.recovery_parent.terminal_check_id,'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL');
 for(const mutate of [
  x=>x.assurance.event='push',
  x=>{x.assurance.conclusion='success';x.event.workflow_run.conclusion='success';},
  x=>{x.audit.execution.upstream.source_receipt_digest=null;const u=structuredClone(x.audit);delete u.observed_at;delete u.receipt_digest;x.audit.receipt_digest=sha256(canonicalJson(u));x.bytes=zip([['audit-receipt.json',text(x.audit)],['whole-platform-operating-proof-v1.json',text(x.proof)]]);x.artifact.digest=digest(x.bytes);x.artifact.size_in_bytes=x.bytes.length;},
  x=>{x.proof.operating_checks.push({id:'OTHER_FAILURE',state:'VERIFIED_FAIL'});delete x.proof.receipt_digest;x.proof.receipt_digest=sha256(canonicalJson(x.proof));x.bytes=zip([['audit-receipt.json',text(x.assurance)],['whole-platform-operating-proof-v1.json',text(x.proof)]]);x.artifact.digest=digest(x.bytes);x.artifact.size_in_bytes=x.bytes.length;}
 ]){const x=failedAssuranceFixture();mutate(x);await assert.rejects(verifyInterruptedRecoveryNativeTrigger(x));}
});

test('bot failure Assurance dispatch verifies one-time natural Coverage and exact Sentinel continuation',async()=>{
 const now=Date.now(),iso=t=>new Date(t).toISOString(),tree='b'.repeat(40),coverageId=980,assuranceId=990,sentinelId=991;
 const coverageName=`KIDULTS Coverage / source-${sha}`,coveragePath='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
 const coverageRun={id:coverageId,name:coverageName,display_title:coverageName,path:coveragePath,event:'workflow_run',status:'completed',conclusion:'success',run_attempt:1,
  head_sha:sha,head_branch:'main',created_at:iso(now-120000),run_started_at:iso(now-119500),updated_at:iso(now-90000),repository:{full_name:repo,id:1281328888},head_repository:{full_name:repo}};
 const issued=issueKirCoverageAssuranceContinuation({repository:repo,source_sha:sha,source_tree:tree,coverage_event:'workflow_run',coverage_run_id:coverageId,
  coverage_run_attempt:1,run:coverageRun});
 const dispatchBytes=zip([['kir-coverage-assurance-continuation-v1.json',text(issued)]]);
 const dispatchArtifact={id:981,name:`kidults-kir-coverage-assurance-dispatch-v1-${coverageId}-1`,expired:false,digest:digest(dispatchBytes),size_in_bytes:dispatchBytes.length,
  created_at:iso(now-119000),expires_at:iso(now+86400000),workflow_run:{id:coverageId,head_sha:sha}};
 const request={repository:repo,source_sha:sha,source_tree:tree,coverage_event:'workflow_run',coverage_run_id:coverageId,coverage_run_attempt:1,
  coverage_created_at:coverageRun.created_at,generation_id:issued.generation_id,dispatch_artifact_id:dispatchArtifact.id,dispatch_artifact_digest:dispatchArtifact.digest,
  continuation_key:issued.continuation_key};
 const consumed=consumeKirCoverageAssuranceContinuation({request,current:{repository:repo,source_sha:sha,source_tree:tree},dispatch_artifact:dispatchArtifact,
  dispatch_receipt:issued,run:coverageRun,prior_consumption_count:0,consumer:{run_id:assuranceId,run_attempt:1}});
 const consumedBytes=zip([['kir-coverage-assurance-continuation-v1.json',text(issued)],['kir-forwarded-dispatch-archive-receipt.json',text({archive_digest:dispatchArtifact.digest})],
  ['kir-coverage-assurance-consumption-v1.json',text(consumed)]]);
 const assuranceName='KIDULTS Platform Continuous Assurance V1',assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
 const assurance={id:assuranceId,name:assuranceName,path:assurancePath,event:'workflow_dispatch',status:'completed',conclusion:'failure',run_attempt:1,
  head_sha:sha,head_branch:'main',created_at:iso(now-30000),run_started_at:iso(now-25000),updated_at:iso(now),actor:{login:'github-actions[bot]'},
  repository:{full_name:repo,id:1281328888},head_repository:{full_name:repo}};
 const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
 const continuationBinding={slot:'SENTINEL_CHAIN',exact_main_sha:sha,path:coveragePath,coverage_workflow_path:coveragePath,upstream_run_id:coverageId,
  upstream_run_attempt:1,run_id:coverageId,run_attempt:1,upstream_event:'workflow_run',continuation_artifact_id:dispatchArtifact.id,
  continuation_artifact_digest:dispatchArtifact.digest,continuation_key:issued.continuation_key,generation_id:issued.generation_id};
 const healthCore={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',repository:repo,source_sha:sha,observer_run_id:sentinelId,observer_run_attempt:1,
  whole_platform_authority:false,promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD',continuation_binding:continuationBinding};
 const health={...healthCore,receipt_digest:sha256(canonicalJson(healthCore))};
 const sentinelBytes=zip([['kpmo-continuous-assurance-sentinel-health-v1.json',text(health)]]);
 const sentinelArtifact={id:996,name:`kpmo-continuous-assurance-sentinel-health-v1-${sha}-${sentinelId}-1`,expired:false,digest:digest(sentinelBytes),size_in_bytes:sentinelBytes.length,
  created_at:iso(now-39000),expires_at:iso(now+86400000),workflow_run:{id:sentinelId,head_sha:sha}};
 const sentinel={id:sentinelId,name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',path:sentinelPath,event:'workflow_dispatch',status:'completed',conclusion:'success',run_attempt:1,
  head_sha:sha,head_branch:'main',created_at:iso(now-40000),run_started_at:iso(now-39500),actor:{login:'github-actions[bot]'},repository:{full_name:repo,id:1281328888},head_repository:{full_name:repo}};
 const f=failedAssuranceFixture();
 f.assurance=assurance;f.event.workflow_run=assurance;f.audit.execution.trigger='workflow_dispatch';
 f.audit.execution.upstream={run_id:String(coverageId),run_attempt:'1',workflow_name:coverageName,workflow_path:coveragePath,workflow_event:'workflow_run',
  conclusion:'success',repository:repo,head_branch:'main'};
 f.proof.protected_evidence=[{workflow_path:sentinelPath,run_id:sentinelId,run_attempt:1,source_sha:sha,artifact_id:sentinelArtifact.id,artifact_digest:sentinelArtifact.digest}];
 delete f.proof.receipt_digest;f.proof.receipt_digest=sha256(canonicalJson(f.proof));
 const assuranceBytes=zip([['audit-receipt.json',text(f.audit)],['whole-platform-operating-proof-v1.json',text(f.proof)]]);
 f.bytes=assuranceBytes;f.artifact.digest=digest(assuranceBytes);f.artifact.size_in_bytes=assuranceBytes.length;f.artifact.created_at=iso(now-10000);f.artifact.expires_at=iso(now+86400000);
 const consumptionArtifact={id:993,name:`kidults-kir-coverage-assurance-consumption-v1-${coverageId}-1`,expired:false,digest:digest(consumedBytes),size_in_bytes:consumedBytes.length,
  created_at:iso(now-9000),expires_at:iso(now+86400000),workflow_run:{id:assuranceId,head_sha:sha}};
 f.jobs={total_count:2,jobs:[{id:994,run_id:assuranceId,run_attempt:1,name:'audit',status:'completed',conclusion:'failure'},
  {id:995,run_id:assuranceId,run_attempt:1,name:'classify-canonical-identity',status:'completed',conclusion:'success',steps:[
   {name:'Reject partial forwarded Coverage continuation inputs',status:'completed',conclusion:'success'},
   {name:'Validate and consume forwarded exact Coverage continuation',status:'completed',conclusion:'success'},
   {name:'Retain one-time Coverage continuation consumption receipt',status:'completed',conclusion:'success'}]}]};
 f.audit.execution.workflow_run_id=String(assuranceId);f.audit.execution.workflow_run_attempt='1';
 const auditUnsigned=structuredClone(f.audit);delete auditUnsigned.observed_at;delete auditUnsigned.receipt_digest;f.audit.receipt_digest=sha256(canonicalJson(auditUnsigned));
 const proofUnsigned=structuredClone(f.proof);delete proofUnsigned.receipt_digest;f.proof.receipt_digest=sha256(canonicalJson(proofUnsigned));
 f.bytes=zip([['audit-receipt.json',text(f.audit)],['whole-platform-operating-proof-v1.json',text(f.proof)]]);f.artifact.digest=digest(f.bytes);f.artifact.size_in_bytes=f.bytes.length;
 const artifactMap=new Map([[f.artifact.id,f.bytes],[consumptionArtifact.id,consumedBytes],[dispatchArtifact.id,dispatchBytes],[sentinelArtifact.id,sentinelBytes]]);
 const packetEntries=[
  [f.artifact.digest,[{name:'audit-receipt.json',encoding:'utf-8',text:text(f.audit),sha256:digest(text(f.audit))},
   {name:'whole-platform-operating-proof-v1.json',encoding:'utf-8',text:text(f.proof),sha256:digest(text(f.proof))}]],
  [consumptionArtifact.digest,[{name:'kir-coverage-assurance-continuation-v1.json',encoding:'utf-8',text:text(issued),sha256:digest(text(issued))},
   {name:'kir-forwarded-dispatch-archive-receipt.json',encoding:'utf-8',text:text({archive_digest:dispatchArtifact.digest}),sha256:digest(text({archive_digest:dispatchArtifact.digest}))},
   {name:'kir-coverage-assurance-consumption-v1.json',encoding:'utf-8',text:text(consumed),sha256:digest(text(consumed))}]],
  [dispatchArtifact.digest,[{name:'kir-coverage-assurance-continuation-v1.json',encoding:'utf-8',text:text(issued),sha256:digest(text(issued))}]],
  [sentinelArtifact.digest,[{name:'kpmo-continuous-assurance-sentinel-health-v1.json',encoding:'utf-8',text:text(health),sha256:digest(text(health))}]],
 ];
 const packetMap=new Map(packetEntries);
 assert.equal(f.artifact.size_in_bytes,artifactMap.get(f.artifact.id).length);
 const baseGet=f.get;
 f.get=async route=>{
  if(route==='actions/runs/990')return assurance;
  if(route==='actions/runs/990/attempts/1/jobs?per_page=100')return f.jobs;
  if(route==='actions/runs/990/artifacts?per_page=100')return {total_count:2,artifacts:[f.artifact,consumptionArtifact]};
  if(route==='actions/runs/980')return coverageRun;
  if(route==='actions/runs/980/artifacts?per_page=100')return {total_count:1,artifacts:[dispatchArtifact]};
  if(route==='actions/runs/991')return sentinel;
  if(route==='actions/runs/991/artifacts?per_page=100')return {total_count:1,artifacts:[sentinelArtifact]};
  if(route===`git/commits/${sha}`)return {sha,tree:{sha:tree}};
  return baseGet(route);
 };
 f.readBytes=async route=>{const match=route.match(/actions\/artifacts\/(\d+)\/zip/);if(!match)throw Error('TEST_ARTIFACT_ROUTE');const bytes=artifactMap.get(Number(match[1]));if(!Buffer.isBuffer(bytes))throw Error('TEST_ARTIFACT_BYTES_MISSING');return bytes;};
 f.archiveReader=(input,expected)=>{assert.equal(digest(input),expected);const members=packetMap.get(expected);assert.ok(members);return {archive_digest:expected,members};};
 const result=await verifyInterruptedRecoveryNativeTrigger(f);
 assert.equal(result.recovery_parent.coverage_continuation.state,'VERIFIED_PASS');
 assert.equal(result.recovery_parent.coverage_continuation.coverage_run_id,coverageId);
 assert.equal(result.recovery_parent.upstream_run_id,String(sentinelId));
 assert.equal(Object.hasOwn(result.recovery_parent.coverage_continuation,'continuation_key'),false);
});

function failedClockFixture(){
 const f=failedAssuranceFixture(),now=f.assurance.created_at;
 f.assurance.event='repository_dispatch';
 f.audit.source.kind='PROTECTED_MAIN_EXTERNAL_NATURAL_CLOCK';
 f.audit.execution.trigger='repository_dispatch';f.audit.execution.upstream=null;
 f.audit.execution.canonical_identity={alias:false,canonical_run_id:'990',canonical_run_attempt:'1',source_sha:sha,upstream_class:'ASSURANCE_EXTERNAL_NATURAL_CLOCK',generation_discriminator:`assurance-external-clock:kidults-natural-clock-v1:ASSURANCE:${sha}:${'n'.repeat(32)}:slot:2026-10-11T00:00:00.000Z`};
 f.proof.observed_at=now;
 f.sentinel={id:991,name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',event:'repository_dispatch',status:'completed',conclusion:'success',run_attempt:1,head_sha:sha,head_branch:'main',created_at:new Date(Date.parse(now)-60000).toISOString(),updated_at:now,run_started_at:new Date(Date.parse(now)-59000).toISOString(),repository:{full_name:repo,id:1281328888},head_repository:{full_name:repo}};
 const body={receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',version:'1.0.0',repository:repo,source_sha:sha,observer_run_id:991,observer_run_attempt:1,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',runtime_health_proven:false,whole_platform_authority:false,promotion_eligible:false,provider_authority:false,database_authority:false,public:'HOLD',production:'HOLD',g5:'HOLD',empirical_delta:0,state:'VERIFIED_PASS',semantic_content_verified:true,producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map(id=>({id,state:'VERIFIED_PASS',artifact_content_validated:true})),failed_producers:[],waiting_producers:[]};
 f.health={...body,receipt_digest:sha256(canonicalJson(body))};
 f.sentinelBytes=zip([['kpmo-continuous-assurance-sentinel-health-v1.json',text(f.health)]]);
 f.sentinelArtifact={id:994,name:`kpmo-continuous-assurance-sentinel-health-v1-${sha}-991-1`,digest:digest(f.sentinelBytes),size_in_bytes:f.sentinelBytes.length,expired:false,created_at:now,expires_at:new Date(Date.now()+86400000).toISOString(),workflow_run:{id:991,head_sha:sha}};
 f.proof.protected_evidence=[{workflow_path:f.sentinel.path,run_id:991,run_attempt:1,source_sha:sha,artifact_id:994,artifact_digest:f.sentinelArtifact.digest}];
 f.jobs={total_count:2,jobs:[{id:993,run_id:990,run_attempt:1,name:'audit',status:'completed',conclusion:'failure'},{id:995,run_id:990,run_attempt:1,name:'classify-canonical-identity',status:'completed',conclusion:'success',steps:[{name:'Verify independent natural-clock receipt',status:'completed',conclusion:'success'}]}]};
 f.reseal=()=>{let u=structuredClone(f.audit);delete u.observed_at;delete u.receipt_digest;f.audit.receipt_digest=sha256(canonicalJson(u));delete f.proof.receipt_digest;f.proof.receipt_digest=sha256(canonicalJson(f.proof));f.bytes=zip([['audit-receipt.json',text(f.audit)],['whole-platform-operating-proof-v1.json',text(f.proof)]]);f.artifact.digest=digest(f.bytes);f.artifact.size_in_bytes=f.bytes.length;};f.reseal();
 const get=f.get,reader=f.archiveReader;
 f.get=async route=>{if(route==='actions/runs/990/attempts/1/jobs?per_page=100')return f.jobs;if(route.includes('sentinel-health-v1.yml/runs?'))return {total_count:1,workflow_runs:[f.sentinel]};if(route==='actions/runs/991/attempts/1/jobs?per_page=100')return {total_count:1,jobs:[{id:996,run_id:991,run_attempt:1,name:'exact-main-health',status:'completed',conclusion:'success',steps:[{name:'Verify independent natural-clock receipt',status:'completed',conclusion:'success'}]}]};if(route==='actions/runs/991')return f.sentinel;if(route==='actions/runs/991/artifacts?per_page=100')return {total_count:1,artifacts:[f.sentinelArtifact]};return get(route);};
 f.readBytes=async route=>route==='actions/artifacts/994/zip'?f.sentinelBytes:f.bytes;
 f.archiveReader=(input,expected)=>{if(digest(input)===f.sentinelArtifact.digest){assert.equal(digest(input),expected);return {archive_digest:expected,members:[{name:'kpmo-continuous-assurance-sentinel-health-v1.json',encoding:'utf-8',text:text(f.health),sha256:digest(text(f.health))}]};}return reader(input,expected);};return f;
}
test('failed authenticated external clock consumes natural Sentinel archive without granting authority',async()=>{
 const f=failedClockFixture(),r=await verifyInterruptedRecoveryNativeTrigger(f);assert.equal(r.recovery_parent.actual_authority_granted,false);assert.equal(r.recovery_parent.platform_closure,false);assert.equal(r.recovery_parent.upstream_run_id,'991');
});
for(const [name,mutate] of [
 ['manual Sentinel',f=>f.sentinel.event='workflow_dispatch'],
 ['unauthenticated clock',f=>f.jobs.jobs[1].steps[0].conclusion='skipped'],
 ['clock alias',f=>f.audit.execution.canonical_identity.alias=true],
 ['snapshot outside run',f=>f.proof.observed_at=new Date(Date.parse(f.assurance.updated_at)+1000).toISOString()],
 ['foreign artifact',f=>f.proof.protected_evidence[0].artifact_id=999],
 ['second failure',f=>f.proof.operating_checks.push({id:'OTHER',state:'VERIFIED_FAIL'})],
 ['failed classifier',f=>f.jobs.jobs[1].conclusion='failure'],
 ['unsealed proof',f=>f.proof.source_sha='b'.repeat(40)]
])test('failed clock rejects '+name,async()=>{const f=failedClockFixture();mutate(f);f.reseal();await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f));});

test('failed clock opt-in never weakens default success boundary or route',async()=>{
 const f=failedClockFixture();
 const {assuranceClockObservationBoundary}=await import('../../../scripts/kidults/kpmo/lib/assurance-clock-observation-boundary-v1.mjs');
 const {assuranceSentinelObservationRoute}=await import('../../../scripts/kidults/kpmo/lib/assurance-sentinel-observation-route-v1.mjs');
 const boundary={proof:f.proof,assuranceRun:f.assurance,sourceSha:sha};
 assert.throws(()=>assuranceClockObservationBoundary(boundary),/BOUNDARY_INVALID/);
 assert.throws(()=>assuranceClockObservationBoundary({...boundary,profile:'unregistered'}),/BOUNDARY_INVALID/);
 assert.throws(()=>assuranceSentinelObservationRoute({audit:f.audit,sourceSha:sha,assuranceRun:f.assurance,jobs:f.jobs,proof:f.proof,sentinelRun:f.sentinel}),/ROUTE_INVALID/);
});

test('failed clock paginates a complete stable snapshot and excludes post-snapshot runs',async()=>{
 const f=failedClockFixture(),get=f.get,calls=[];
 const older=Array.from({length:99},(_,i)=>({...f.sentinel,id:2000+i,conclusion:'skipped'}));
 const future={...f.sentinel,id:9999,created_at:new Date(Date.parse(f.proof.observed_at)+1000).toISOString()};
 f.get=async route=>{if(route.includes('sentinel-health-v1.yml/runs?')){calls.push(route);assert.match(route,/created=/);return {total_count:101,workflow_runs:route.endsWith('page=1')?[f.sentinel,...older]:[future]};}return get(route);};
 const result=await verifyInterruptedRecoveryNativeTrigger(f);assert.equal(result.recovery_parent.upstream_run_id,'991');assert.equal(calls.length,2);
});
test('failed clock rejects pagination total drift and incomplete pages',async()=>{
 for(const drift of [true,false]){
  const f=failedClockFixture(),get=f.get;
  f.get=async route=>{if(route.includes('sentinel-health-v1.yml/runs?'))return route.endsWith('page=1')?{total_count:101,workflow_runs:Array.from({length:100},(_,i)=>({...f.sentinel,id:2000+i,conclusion:'skipped'}))}:{total_count:drift?102:101,workflow_runs:[]};return get(route);};
  await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f),/FAILURE_CLOCK_SENTINEL_LIST/);
 }
});

import fsToken from 'node:fs';import osToken from 'node:os';import pathToken from 'node:path';
import {createInterruptedRecoverySignedLedgerClient} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-signed-ledger-client-v1.mjs';
function capabilityFixture(f=failedAssuranceFixture()){
 const dir=fsToken.mkdtempSync(pathToken.join(osToken.tmpdir(),'recovery-token-')),eventPath=pathToken.join(dir,'event.json');
 Object.assign(f.env,{GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'400',GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml@refs/heads/main`,GITHUB_EVENT_PATH:eventPath,GITHUB_ACTOR:'github-actions[bot]',KIDULTS_RECOVERY_ROLE:'KPMO',KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN:'arn:aws:kms:ap-northeast-2:528314240275:key/key-1',KIDULTS_PRODUCTION_STATE:'HOLD',KIDULTS_PUBLIC_STATE:'HOLD',KIDULTS_G5_STATE:'HOLD'});
 fsToken.writeFileSync(eventPath,JSON.stringify(f.event));f.byteReads=0;
 f.nativeReads=[];const get=f.get,bytes=f.readBytes;f.get=async route=>{f.nativeReads.push(route);if(f.readError&&route==='branches/main')throw f.readError;return get(route);};
 if(bytes)f.readBytes=async route=>{f.byteReads++;return bytes(route);};
 f.close=()=>fsToken.rmSync(dir,{recursive:true,force:true});f.mint=()=>verifyInterruptedRecoveryNativeTriggerOnce(f);
 f.consume=(token,extra={})=>consumeInterruptedRecoveryNativeTriggerToken({token,env:f.env,...extra});return f;
}
test('private token reuses verified original ZIP once but repeats metadata and semantics before client AWS',async()=>{
 const f=capabilityFixture();try{const {upstream,token}=await f.mint();assert.ok(Object.isFrozen(upstream.recovery_parent));assert.equal(f.byteReads,1);
 let awsCalls=0;const client=await createInterruptedRecoverySignedLedgerClient({role:'KPMO',signingKeyArn:f.env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,sourceSha:sha,env:f.env,nativeVerificationToken:token,aws:async args=>{assert.equal(args[0],'sts');awsCalls++;return {Account:'528314240275',Arn:'arn:aws:sts::528314240275:assumed-role/kidults-autonomous-kpmo-staging-role/session'};}});
 assert.ok(client);assert.equal(awsCalls,1);assert.equal(f.byteReads,1);assert.equal(f.calls.filter(x=>x==='actions/runs/990/artifacts?per_page=100').length,2);assert.equal(f.calls.filter(x=>x==='branches/main').length,2);
 await assert.rejects(f.consume(token),/CONSUMED/);
 }finally{f.close();}
});
for(const [name,make] of [['plain',()=>({})],['clone',t=>structuredClone(t)],['serialized',t=>JSON.parse(JSON.stringify(t))],['boolean',()=>true],['null',()=>null]])test('reject '+name+' token without any native request',async()=>{const f=capabilityFixture();try{const {token}=await f.mint(),calls=f.calls.length;await assert.rejects(f.consume(make(token)),/TOKEN_UNKNOWN/);assert.equal(f.calls.length,calls);}finally{f.close();}});
for(const key of ['GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_WORKFLOW_REF','GITHUB_REF','GITHUB_REPOSITORY','GITHUB_ACTOR','GITHUB_EVENT_NAME','GITHUB_EVENT_PATH','KIDULTS_RECOVERY_ROLE','KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN','KIDULTS_PRODUCTION_STATE','KIDULTS_PUBLIC_STATE','KIDULTS_G5_STATE'])test('changed '+key+' consumes/rejects token before read or AWS',async()=>{const f=capabilityFixture();try{const {token}=await f.mint(),calls=f.calls.length;f.env[key]='changed';await assert.rejects(f.consume(token),/TOKEN_CONTEXT/);assert.equal(f.calls.length,calls);await assert.rejects(f.consume(token),/CONSUMED/);}finally{f.close();}});
test('changed event file is rejected without full verification fallback',async()=>{const f=capabilityFixture();try{const {token}=await f.mint(),calls=f.calls.length;fsToken.writeFileSync(f.env.GITHUB_EVENT_PATH,JSON.stringify({...f.event,action:'requested'}));await assert.rejects(f.consume(token),/TOKEN_EVENT/);assert.equal(f.calls.length,calls);}finally{f.close();}});
for(const time of [()=>NaN,()=>0,()=>Date.now()+900001])test('invalid/backward/expired clock rejects token before native reads',async()=>{const f=capabilityFixture();try{const {token}=await f.mint(),calls=f.calls.length;await assert.rejects(f.consume(token,{now:time}),/TOKEN_EXPIRED/);assert.equal(f.calls.length,calls);}finally{f.close();}});
for(const [name,mutate] of [['rerun',f=>f.assurance.run_attempt=2],['new conclusion',f=>f.assurance.conclusion='success'],['expired archive',f=>f.artifact.expired=true],['borrowed archive',f=>f.artifact.workflow_run.id=991],['digest drift',f=>f.artifact.digest='sha256:'+'0'.repeat(64)]])test('fresh '+name+' is rejected even with cached bytes',async()=>{const f=capabilityFixture();try{const {token}=await f.mint();mutate(f);await assert.rejects(f.consume(token));await assert.rejects(f.consume(token),/CONSUMED/);}finally{f.close();}});
test('fresh main API403 is preserved and client never reaches AWS',async()=>{const f=capabilityFixture();try{const {token}=await f.mint();f.readError=Error('API_403');let aws=0;await assert.rejects(createInterruptedRecoverySignedLedgerClient({role:'KPMO',signingKeyArn:f.env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,sourceSha:sha,env:f.env,nativeVerificationToken:token,aws:async()=>{aws++;}}),e=>e===f.readError);assert.equal(aws,0);await assert.rejects(f.consume(token),/CONSUMED/);}finally{f.close();}});
test('concurrent token consumption has exactly one verified winner',async()=>{const f=capabilityFixture();try{const {token}=await f.mint(),r=await Promise.allSettled([f.consume(token),f.consume(token)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected').length,1);assert.equal(f.byteReads,1);}finally{f.close();}});
test('failed full verification cannot issue a token',async()=>{const f=capabilityFixture();try{f.assurance.conclusion='success';await assert.rejects(f.mint());assert.equal(f.byteReads,0);}finally{f.close();}});
test('full proof is deeply immutable and cannot mutate the recorded parent',async()=>{const f=capabilityFixture();try{const {upstream,token}=await f.mint();assert.throws(()=>{upstream.recovery_parent.terminal_check_evidence_refs[0]='other';},TypeError);assert.equal((await f.consume(token)).recovery_parent.terminal_check_evidence_refs[0],'800');}finally{f.close();}});

test('clock parent reuses both bound ZIPs while rechecking the actual Sentinel run',async()=>{const f=capabilityFixture(failedClockFixture());try{const {token}=await f.mint();assert.equal(f.byteReads,2);await f.consume(token);assert.equal(f.byteReads,2);assert.equal(f.nativeReads.filter(x=>x==='actions/runs/991').length,2);}finally{f.close();}});
test('clock parent cannot reuse a Sentinel after its native attempt advances',async()=>{const f=capabilityFixture(failedClockFixture());try{const {token}=await f.mint();f.sentinel.run_attempt=2;await assert.rejects(f.consume(token));assert.equal(f.byteReads,2);}finally{f.close();}});
for(const milliseconds of [899999,900000])test('token exact15-minute boundary '+milliseconds+'ms',async()=>{
 const f=capabilityFixture(),real=Date.now,time=real();try{Date.now=()=>time;const {token}=await f.mint();Date.now=real;if(milliseconds===899999)await f.consume(token,{now:()=>time+milliseconds});else await assert.rejects(f.consume(token,{now:()=>time+milliseconds}),/TOKEN_EXPIRED/);}finally{Date.now=real;f.close();}
});
test('parent request expiry is an earlier cap than the token15-minute lifetime',async()=>{const f=capabilityFixture(),real=Date.now,time=real();try{f.assurance.updated_at=new Date(time-1800000+10).toISOString();Date.now=()=>time;const {token}=await f.mint();Date.now=real;await assert.rejects(f.consume(token,{now:()=>time+10}),/TOKEN_EXPIRED/);}finally{Date.now=real;f.close();}});
