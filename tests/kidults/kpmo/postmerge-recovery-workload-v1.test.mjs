import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,RECOVERY_ROLES,buildPostmergeRecoveryRequest} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoveryWorkload} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-workload-v1.mjs';
const NOW=Date.parse('2026-10-04T00:00:00Z'),SHA='a'.repeat(40),H={production:'HOLD',public:'HOLD',g5:'HOLD'};
function fixture(){
  const request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+600000).toISOString()});
  const node=id=>({state:'VERIFIED_PASS',source_sha:SHA,run_id:String(id),receipt_digest:'sha256:'+'b'.repeat(64),...H});
  const evidence={state:'VERIFIED_PASS',source_sha:SHA,...H,push_suite:{...node(1),required_success_count:6,required_failure_count:0},canonical_truth:node(2),sentinel:{...node(3),producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map(id=>({id,state:'VERIFIED_PASS'})),failed_producers:[],waiting_producers:[]},success_authority_gate:node(4)};
  const core={id:'kidults-postmerge-recovery-evidence-snapshot-v1',version:'1.0.0',source_sha:SHA,selected_at:request.issued_at,evidence,scope:'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM',...H};
  const snapshot={...core,snapshot_digest:sha256(canonicalJson(core))};
  const reservation={authorization_generation:I.original_generation,nonce_digest:I.original_nonce_digest,run_id:I.original_run_id,head_sha:I.original_head_sha,state:'RESERVED',recovery_request:request,recovery_snapshot:snapshot};
  const observed={repository:I.repository,repository_id:I.repository_id,main_sha:SHA,reservation,
    original_run:{id:I.original_run_id,status:'completed',conclusion:'cancelled',run_attempt:1,event:'repository_dispatch',head_sha:I.original_base_sha,path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'},
    pull_request:{number:2555,merged:true,merge_commit_sha:I.original_merge_sha,head:{sha:I.original_head_sha},base:{sha:I.original_base_sha}},
    merge_commit:{sha:I.original_merge_sha,tree:{sha:I.original_tree_sha},parents:[{sha:I.original_base_sha},{sha:I.original_head_sha}]},
    original_merge_to_main:{base_commit:{sha:I.original_merge_sha},head_sha:SHA,status:'ahead',behind_by:0,merge_base_commit:{sha:I.original_merge_sha}}};
  const calls={approval:0,verify:0,observe:0};
  const ledger={readContext:async()=>reservation,createApproval:async()=>{calls.approval++;return {ok:true};}};
  const github={observe:async()=>{calls.observe++;return observed;}};
  const collector={verifySnapshot:async()=>{calls.verify++;return snapshot;}};
  return {request,snapshot,reservation,observed,calls,ledger,github,collector,
    workload:role=>createRecoveryWorkload({role,ledger,github,evidence:collector,now:()=>NOW})};
}
test('role verifies the same pinned content and reobserves before signing',async()=>{
  const f=fixture();await f.workload('KPMO').approvePinned(f);assert.deepEqual(f.calls,{approval:1,verify:1,observe:2});
});
test('conflicting pinned snapshot cannot be replaced',async()=>{
  const f=fixture();f.reservation.recovery_snapshot={...f.snapshot,snapshot_digest:'sha256:'+'c'.repeat(64)};
  await assert.rejects(f.workload('KPMO').approvePinned(f),/SNAPSHOT_CONFLICT/);assert.equal(f.calls.approval,0);assert.equal(f.calls.verify,0);
});
test('independent verifier content drift cannot sign approval',async()=>{
  const f=fixture();f.collector.verifySnapshot=async()=>({...f.snapshot,selected_at:new Date(NOW).toISOString()});
  await assert.rejects(f.workload('INDEPENDENT_VERIFIER').approvePinned(f),/VERIFIED_SNAPSHOT_DRIFT/);assert.equal(f.calls.approval,0);
});
test('main moves after content verification: no approval write',async()=>{
  const f=fixture();f.collector.verifySnapshot=async()=>{f.observed.main_sha='d'.repeat(40);f.observed.original_merge_to_main.head_sha=f.observed.main_sha;return f.snapshot;};
  await assert.rejects(f.workload('KPMO').approvePinned(f),/RECOVERY_SOURCE_DRIFT/);assert.equal(f.calls.approval,0);
});
test('finalizer cannot mint a role approval',async()=>{
  const f=fixture();await assert.rejects(f.workload('FINALIZER').approvePinned(f),/APPROVAL_ROLE/);assert.equal(f.calls.approval,0);
});
test('approval workload cannot enter finalizer',async()=>{
  const f=fixture();await assert.rejects(f.workload('KPMO').finalizePinned({request:f.request,recoveryRunId:'9001'}),/FINALIZER_ROLE/);
});
test('resume consumes an existing cryptographically verified role approval without signing again',async()=>{
  const f=fixture();f.reservation.role_approval={signature_verified_by_ledger:true,approval_run_id:'100',
    request_digest:sha256(canonicalJson(f.request)),evidence_digest:sha256(canonicalJson(f.snapshot.evidence))};
  f.ledger.discoverContext=async()=>f.reservation;
  const result=await f.workload('KPMO').resumeApproval();
  assert.equal(result.state,'EXISTING_SIGNED_RECOVERY_APPROVAL');assert.equal(result.write_performed,false);
  assert.equal(f.calls.approval,0);assert.equal(f.calls.verify,0);
});
test('non-Track role cannot select a new request or snapshot',async()=>{
  const f=fixture();delete f.reservation.recovery_request;delete f.reservation.recovery_snapshot;
  f.ledger.discoverContext=async()=>f.reservation;
  const result=await f.workload('KPMO').resumeApproval({newRequest:f.request});
  assert.equal(result.state,'WAITING_PINNED_RECOVERY_REQUEST');assert.equal(result.write_performed,false);
  assert.equal(f.calls.approval,0);
});
test('resume uses the root pinned request even if caller offers a replacement',async()=>{
  const f=fixture();f.ledger.discoverContext=async()=>f.reservation;
  await f.workload('KPMO').resumeApproval({newRequest:{invalid:true}});assert.equal(f.calls.approval,1);
});
test('existing approval cannot claim another evidence digest',async()=>{
  const f=fixture();f.reservation.role_approval={signature_verified_by_ledger:true,request_digest:sha256(canonicalJson(f.request)),evidence_digest:'sha256:'+'f'.repeat(64)};
  f.ledger.discoverContext=async()=>f.reservation;
  await assert.rejects(f.workload('KPMO').resumeApproval(),/EXISTING_APPROVAL_BINDING/);assert.equal(f.calls.approval,0);
});
test('consumed but unsealed incident elects a later finalizer without new approval',async()=>{
  const f=fixture();Object.assign(f.reservation,{state:'CONSUMED',recovery_run_id:'9001',recovery_terminal:{stored:true}});
  f.ledger.discoverContext=async()=>f.reservation;
  const pending=await f.workload('ACCOUNTABLE_TRACK_AGENT').resumeApproval();
  assert.equal(pending.state,'RECOVERY_CONSUMED_SEAL_PENDING');assert.equal(pending.approval_run_id,'9001');
  assert.equal(f.calls.approval,0);assert.equal(f.calls.verify,0);
  f.reservation.recovery_immutable={stored:true};
  const complete=await f.workload('ACCOUNTABLE_TRACK_AGENT').resumeApproval();
  assert.equal(complete.state,'RECOVERY_ALREADY_CONSUMED_NO_APPROVAL');assert.equal(f.calls.approval,0);
});
test('finalizer consumes pinned evidence once; expired resume reads stored immutable terminal',async()=>{
  const f=fixture();let clock=NOW,object=null,consumes=0,authorityReads=0,seals=0;
  f.ledger.readAuthority=async()=>{authorityReads++;return {backend:'AUTHENTICATED_SIGNED_LEDGER_V1',operation:f.request.operation,
    request_digest:sha256(canonicalJson(f.request)),recovery_generation:f.request.recovery_generation,
    roles:RECOVERY_ROLES.map((role,i)=>({role,workload_id:`workload-${i}`,signing_key_arn:`key-${i}`,signature_verified_by_ledger:true,
      request_digest:sha256(canonicalJson(f.request)),expires_at:f.request.expires_at}))};};
  f.ledger.consumeOnce=async({terminal,recoveryRunId})=>{assert.equal(f.reservation.state,'RESERVED');consumes++;
    Object.assign(f.reservation,{state:'CONSUMED',recovery_run_id:recoveryRunId,recovery_terminal:terminal});};
  f.ledger.acknowledgeImmutable=async({immutable})=>{f.reservation.recovery_immutable=structuredClone(immutable);};
  const immutable={readImmutable:async({version_id})=>{assert.equal(version_id,'version-1');return object;},sealIfAbsent:async({key,terminal})=>{seals++;
    object={state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',key,version_id:'version-1',receipt_digest:terminal.receipt_digest,
      object_lock_mode:'COMPLIANCE',checksum_verified:true,retention_verified:true,encryption_verified:true};return object;}};
  const workload=createRecoveryWorkload({role:'FINALIZER',ledger:f.ledger,github:f.github,evidence:f.collector,immutable,now:()=>clock});
  const first=await workload.finalizePinned({request:f.request,recoveryRunId:'9001'});
  assert.equal(first.state,'FINALIZER_TERMINAL_RECOVERY_VERIFIED');clock+=3600000;
  f.collector.verifySnapshot=async()=>{throw new Error('expired resume must not refresh evidence');};
  const resumed=await workload.finalizePinned({request:f.request,recoveryRunId:'9002'});
  assert.equal(resumed.terminal.recovery_run_id,'9001');assert.equal(f.reservation.run_id,I.original_run_id);
  assert.deepEqual({consumes,authorityReads,seals},{consumes:1,authorityReads:1,seals:1});
});
