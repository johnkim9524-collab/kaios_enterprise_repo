import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zip,text} from './recovery-native-archive-fixture-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {digest} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {verifyInterruptedRecoveryNativeTrigger} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-native-trigger-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
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
