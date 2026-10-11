import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {validateTerminalNullAssurancePacket,ORIGINAL_TERMINAL_NULL_REFS,TERMINAL_NULL_PUSH_CONTROL_IDS} from '../../../scripts/kidults/kpmo/lib/terminal-null-assurance-packet-v1.mjs';
import {validateFailureRecoveryPushSuite,validateFailureRecoverySentinelBinding} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-exact-main-evidence-v1.mjs';
import {classifyAssuranceSemantics} from '../../../scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs';
const sourceSha='a'.repeat(40),repo='johnkim9524-collab/kaios_enterprise_repo';
const path='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const seal=f=>{const {receipt_digest,observed_at,...core}=f.audit;f.audit.receipt_digest=sha256(canonicalJson(core));delete f.proof.receipt_digest;f.proof.receipt_digest=sha256(canonicalJson(f.proof));};
function fixture(){
 const run={id:101,run_attempt:1,path,head_sha:sourceSha,head_branch:'main',event:'push',status:'completed',conclusion:'failure',repository:{full_name:repo,id:1281328888}};
 const audit={receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha:sourceSha,actual_sha:sourceSha,expected_sha:sourceSha,match:true,kind:'PROTECTED_MAIN_PUSH'},execution:{trigger:'push',profile:'deep',upstream:null,workflow_run_id:'101',workflow_run_attempt:'1'},states:{internal_control_state:'VERIFIED_PASS',promotion_eligible:false},checks:TERMINAL_NULL_PUSH_CONTROL_IDS.map(id=>({id,required:true,state:'VERIFIED_PASS'}))};
 const proof={id:'kidults-whole-platform-operating-proof-v1',repository:repo,source_sha:sourceSha,state:'VERIFIED_FAIL',whole_platform_runtime_proven:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',operating_checks:[{id:'CORE_FOUR_CONTENT',state:'UNVERIFIED'},{id:'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL',state:'VERIFIED_FAIL',reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',evidence_refs:[...ORIGINAL_TERMINAL_NULL_REFS]}]};
 const f={run,audit,proof,sourceSha};seal(f);return f;
}
const bindingNames=['ASI SHADOW upstream evidence','Requirement Coverage upstream evidence','Sharded Reserve upstream terminal','Canonical Truth upstream terminal'].map(x=>'Validate exact '+x+' binding');
function jobs(){return [{id:201,run_id:101,head_sha:sourceSha,name:'audit',status:'completed',conclusion:'failure',steps:[
 ...bindingNames.map(name=>({name,status:'completed',conclusion:'skipped'})),
 ...['Run audit and always retain receipt','Upload exact-run assurance packet','Preserve control result without promoting overall HOLD','Validate SHADOW, Requirement, Reserve, and Canonical Truth watch coverage'].map(name=>({name,status:'completed',conclusion:'success'})),
 ...['Reconcile whole platform operating receipts without side effects','Observe internal recovery evidence without claiming operating completion'].map(name=>({name,status:'completed',conclusion:'failure'}))]}];}
test('sealed original failure is retained as failure and never authority',()=>{const f=fixture(),r=validateTerminalNullAssurancePacket(f);assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.actual_authority_granted,false);assert.equal(r.whole_platform_runtime_proven,false);assert.equal(r.promotion_eligible,false);});
for(const [name,mutate,reseal=true] of [
 ['different original artifact',f=>f.proof.operating_checks[1].evidence_refs[1]++],
 ['different original run',f=>f.proof.operating_checks[1].evidence_refs[0]='123'],
 ['different ZIP',f=>f.proof.operating_checks[1].evidence_refs[2]='sha256:'+'b'.repeat(64)],
 ['second failure',f=>f.proof.operating_checks[0].state='VERIFIED_FAIL'],
 ['borrowed source',f=>f.proof.source_sha='b'.repeat(40)],
 ['missing control',f=>f.audit.checks.pop()],
 ['duplicate control',f=>f.audit.checks[1].id=f.audit.checks[0].id],
 ['failed control',f=>f.audit.checks[0].state='VERIFIED_FAIL'],
 ['fake digest',f=>f.proof.receipt_digest='sha256:'+'0'.repeat(64),false],
 ['authority elevation',f=>f.proof.whole_platform_runtime_proven=true],
 ['release',f=>f.proof.production='RELEASE'],
 ['replay',f=>f.run.run_attempt=2],
 ['manual',f=>f.run.event='workflow_dispatch'],
 ['foreign repository',f=>f.run.repository.full_name='evil/repo'],
 ['fabricated causal provenance',f=>f.audit.execution.upstream={run_id:'100'}],
 ['duplicate terminal',f=>f.proof.operating_checks.push({...f.proof.operating_checks[1]})]
])test('reject '+name,()=>{const f=fixture();mutate(f);if(reseal)seal(f);assert.throws(()=>validateTerminalNullAssurancePacket(f),/PACKET_INVALID/);});
test('Owner structural classifier requires content in addition to exact failed steps',()=>{
 const j=jobs(),f=fixture();assert.equal(classifyAssuranceSemantics(j,sourceSha,101).ok,false);
 const r=classifyAssuranceSemantics(j,sourceSha,101,'push',f);assert.equal(r.ok,true);assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.landing_integrity_only,true);assert.equal(r.producer_health_authority,false);
 j[0].steps.push({name:'Other failed check',status:'completed',conclusion:'failure'});assert.equal(classifyAssuranceSemantics(j,sourceSha,101,'push',f).ok,false);
});
test('failure-only push suite permits one Assurance failure, never another workflow',()=>{
 const suite={ready:true,invalid:[],failure_count:1,required:[{path,conclusion:'failure'},...Array.from({length:5},(_,i)=>({path:'other'+i,conclusion:'success'}))]};
 validateFailureRecoveryPushSuite(suite);suite.required[1].conclusion='failure';suite.failure_count=2;assert.throws(()=>validateFailureRecoveryPushSuite(suite));
});
test('authenticated parent ID uses one numeric representation; clock audit remains null',()=>{
 const f={run:{event:'repository_dispatch'},audit:{execution:{trigger:'repository_dispatch',upstream:null}},parent:{upstream_run_id:'991',upstream_receipt_digest:'sha256:abc'},sentinel:{id:991},health:{receipt_digest:'sha256:abc'}};
 validateFailureRecoverySentinelBinding(f);f.parent.upstream_run_id='992';assert.throws(()=>validateFailureRecoverySentinelBinding(f));f.parent.upstream_run_id='991';f.audit.execution.upstream={};assert.throws(()=>validateFailureRecoverySentinelBinding(f));
});
test('causal parent must match all native Sentinel fields and digest',()=>{
 const sentinel={id:991,name:'Sentinel',path:'sentinel.yml',event:'workflow_run',conclusion:'success'};
 const upstream={run_id:'991',run_attempt:'1',workflow_name:sentinel.name,workflow_path:sentinel.path,workflow_event:sentinel.event,conclusion:'success',repository:repo,head_branch:'main',source_receipt_digest:'sha256:abc'};
 const f={run:{event:'workflow_run'},audit:{execution:{trigger:'workflow_run',upstream}},parent:{upstream_run_id:'991',upstream_receipt_digest:'sha256:abc'},sentinel,health:{receipt_digest:'sha256:abc'}};
 validateFailureRecoverySentinelBinding(f);upstream.workflow_event='workflow_dispatch';assert.throws(()=>validateFailureRecoverySentinelBinding(f));
});
