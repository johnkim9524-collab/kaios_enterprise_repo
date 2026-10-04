import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,RECOVERY_ROLES,buildPostmergeRecoveryRequest,runPostmergeTerminalRecovery,recoveryObjectKey} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';

const SHA='1d7981f6c09e2b7ad52fe5a819c59a54ea01525c';
const NOW=Date.parse('2026-10-03T15:00:00Z');
const H={production:'HOLD',public:'HOLD',g5:'HOLD'};
const clone=x=>structuredClone(x);
function fixture(){
  const request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+600000).toISOString()});
  const digest=sha256(canonicalJson(request));
  const observed={repository:I.repository,repository_id:I.repository_id,main_sha:SHA,
    original_run:{id:I.original_run_id,status:'completed',conclusion:'cancelled',event:'repository_dispatch',run_attempt:1,head_sha:I.original_base_sha,path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml'},
    pull_request:{number:I.pull_request,merged:true,merge_commit_sha:I.original_merge_sha,head:{sha:I.original_head_sha},base:{sha:I.original_base_sha}},
    merge_commit:{sha:I.original_merge_sha,tree:{sha:I.original_tree_sha},parents:[{sha:I.original_base_sha},{sha:I.original_head_sha}]},
    original_merge_to_main:{base_commit:{sha:I.original_merge_sha},head_sha:SHA,status:'ahead',behind_by:0,merge_base_commit:{sha:I.original_merge_sha}},
    reservation:{authorization_generation:I.original_generation,nonce_digest:I.original_nonce_digest,run_id:I.original_run_id,head_sha:I.original_head_sha,state:'RESERVED'}};
  const authority={backend:'AUTHENTICATED_SIGNED_LEDGER_V1',operation:request.operation,request_digest:digest,recovery_generation:request.recovery_generation,
    roles:RECOVERY_ROLES.map((role,i)=>({role,workload_id:`workload-${i}`,signing_key_arn:`key-${i}`,signature_verified_by_ledger:true,request_digest:digest,expires_at:request.expires_at}))};
  const node=id=>({state:'VERIFIED_PASS',source_sha:SHA,run_id:String(id),receipt_digest:`sha256:${'a'.repeat(64)}`,...H});
  const evidence={state:'VERIFIED_PASS',source_sha:SHA,...H,push_suite:{...node(1),required_success_count:6,required_failure_count:0},canonical_truth:node(2),sentinel:{...node(3),producers:['SHADOW','REQUIREMENT','RESERVE','CANONICAL_TRUTH'].map(id=>({id,state:'VERIFIED_PASS'})),failed_producers:[],waiting_producers:[]},success_authority_gate:node(4)};
  const calls={consume:0,seal:0,ack:0,authority:0,merge:0};let object=null;
  const adapter={
    observe:async()=>clone(observed),
    readAuthority:async()=>{calls.authority++;return clone(authority);},
    verifyExactMainEvidence:async()=>clone(evidence),
    consumeOnce:async({terminal,recoveryRunId,expected_state,expected_original_run_id,expected_original_head_sha,preserve_original_owner})=>{
      assert.equal(observed.reservation.state,expected_state,'conditional write conflict');assert.equal(expected_original_run_id,I.original_run_id);assert.equal(expected_original_head_sha,I.original_head_sha);assert.equal(preserve_original_owner,true);
      calls.consume++;Object.assign(observed.reservation,{state:'CONSUMED',recovery_run_id:recoveryRunId,recovery_terminal:clone(terminal)});
    },
    readImmutable:async()=>object&&clone(object),
    sealIfAbsent:async({key,terminal,if_none_match,object_lock_mode,retention_years})=>{
      assert.equal(object,null,'conditional immutable put conflict');assert.equal(if_none_match,'*');assert.equal(object_lock_mode,'COMPLIANCE');assert.equal(retention_years,10);
      calls.seal++;object={state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',key,version_id:'immutable-version-1',receipt_digest:terminal.receipt_digest,object_lock_mode:'COMPLIANCE',checksum_verified:true,retention_verified:true,encryption_verified:true};return clone(object);
    },
    acknowledgeImmutable:async()=>{calls.ack++;},
    merge:async()=>{calls.merge++;throw new Error('merge must never be called');}
  };
  return {request,observed,authority,evidence,calls,adapter,run:()=>runPostmergeTerminalRecovery({request,recoveryRunId:'9001',adapter,now:()=>NOW})};
}

test('one bounded consume, immutable readback, no merge or owner impersonation',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.state,'FINALIZER_TERMINAL_RECOVERY_VERIFIED');assert.equal(result.promotion_eligible,false);assert.equal(result.authority_renewed,false);assert.equal(result.terminal.original_reservation_owner_run_id,I.original_run_id);assert.equal(f.observed.reservation.run_id,I.original_run_id);assert.deepEqual(f.calls,{consume:1,seal:1,ack:1,authority:1,merge:0});
});
test('completed recovery consumes existing immutable receipt without repeated approvals/writes',async()=>{
  const f=fixture();await f.run();await f.run();assert.equal(f.calls.consume,1);assert.equal(f.calls.seal,1);assert.equal(f.calls.authority,1);
});
test('lost consume response resumes the durable terminal payload',async()=>{
  const f=fixture(),original=f.adapter.consumeOnce;f.adapter.consumeOnce=async input=>{await original(input);throw new Error('lost consume response');};
  await assert.rejects(f.run(),/lost consume response/);f.adapter.consumeOnce=original;
  const result=await f.run();assert.equal(result.state,'FINALIZER_TERMINAL_RECOVERY_VERIFIED');assert.equal(f.calls.consume,1);assert.equal(f.calls.seal,1);assert.equal(f.calls.authority,1);
});
test('lost immutable write response reuses the existing version',async()=>{
  const f=fixture(),original=f.adapter.sealIfAbsent;f.adapter.sealIfAbsent=async input=>{await original(input);throw new Error('lost seal response');};
  await assert.rejects(f.run(),/lost seal response/);f.adapter.sealIfAbsent=original;await f.run();assert.equal(f.calls.consume,1);assert.equal(f.calls.seal,1);assert.equal(f.calls.authority,1);
});
test('post-consume sealing resumes without renewing expired reservation authority',async()=>{
  const f=fixture(),original=f.adapter.sealIfAbsent;f.adapter.sealIfAbsent=async()=>{throw new Error('interruption before sealing');};await assert.rejects(f.run(),/interruption before sealing/);f.adapter.sealIfAbsent=original;
  const result=await runPostmergeTerminalRecovery({request:f.request,recoveryRunId:'9002',adapter:f.adapter,now:()=>NOW+3600000});assert.equal(result.terminal.recovery_run_id,'9001');assert.equal(f.calls.consume,1);assert.equal(f.calls.authority,1);
});
test('concurrent workers have exactly one conditional reservation winner',async()=>{
  const f=fixture();const results=await Promise.allSettled(['9001','9002'].map(recoveryRunId=>runPostmergeTerminalRecovery({request:f.request,recoveryRunId,adapter:f.adapter,now:()=>NOW})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.consume,1);assert.equal(f.calls.seal,1);assert.equal(f.calls.merge,0);
});
for(const [name,mutate,code] of [
  ['original run still active',f=>f.observed.original_run.status='in_progress','RECOVERY_ORIGINAL_RUN_NOT_FENCED'],
  ['original attempt replay',f=>f.observed.original_run.run_attempt=2,'RECOVERY_ORIGINAL_RUN_NOT_FENCED'],
  ['merged PR head drift',f=>f.observed.pull_request.head.sha='b'.repeat(40),'RECOVERY_MERGED_PR_BINDING'],
  ['ordered parent reversal',f=>f.observed.merge_commit.parents.reverse(),'RECOVERY_MERGE_TREE_OR_PARENT_DRIFT'],
  ['source drift',f=>{f.observed.main_sha='b'.repeat(40);f.observed.original_merge_to_main.head_sha=f.observed.main_sha;},'RECOVERY_SOURCE_DRIFT'],
  ['main ancestry drift',f=>f.observed.original_merge_to_main.behind_by=1,'RECOVERY_MAIN_NOT_DESCENDANT'],
  ['reservation owner drift',f=>f.observed.reservation.run_id='12','RECOVERY_RESERVATION_BINDING'],
  ['nonce drift',f=>f.observed.reservation.nonce_digest=`sha256:${'0'.repeat(64)}`,'RECOVERY_RESERVATION_BINDING'],
  ['missing role',f=>f.authority.roles.pop(),'RECOVERY_THREE_ROLE_QUORUM'],
  ['role collision',f=>f.authority.roles[0].role='KPMO','RECOVERY_ROLE_SET'],
  ['signing key collision',f=>f.authority.roles[0].signing_key_arn=f.authority.roles[1].signing_key_arn,'RECOVERY_SIGNER_COLLISION'],
  ['unverified signature',f=>f.authority.roles[0].signature_verified_by_ledger=false,'RECOVERY_ROLE_BINDING'],
  ['quorum context drift',f=>f.authority.request_digest=`sha256:${'0'.repeat(64)}`,'RECOVERY_AUTHORITY_BINDING'],
  ['foreign gate evidence',f=>f.evidence.success_authority_gate.source_sha='b'.repeat(40),'RECOVERY_EVIDENCE_IDENTITY'],
  ['nonpassing Sentinel producer',f=>f.evidence.sentinel.producers[1].state='VERIFIED_FAIL','RECOVERY_SENTINEL_CORE_FOUR'],
  ['nested production release',f=>f.evidence.push_suite.production='APPROVED','RECOVERY_HOLD_BOUNDARY'],
  ['attempted operation expansion',f=>f.request.operation='MERGE','RECOVERY_REQUEST_BINDING'],
  ['extra caller authority field',f=>f.request.owner_approved=true,'RECOVERY_REQUEST_BINDING']
])test(`reject ${name} without any write`,async()=>{const f=fixture();mutate(f);await assert.rejects(f.run(),new RegExp(code));assert.equal(f.calls.consume,0);assert.equal(f.calls.seal,0);assert.equal(f.calls.merge,0);});
test('expired pre-consume authority causes no write',async()=>{const f=fixture();await assert.rejects(runPostmergeTerminalRecovery({request:f.request,recoveryRunId:'9001',adapter:f.adapter,now:()=>NOW+3600000}),/RECOVERY_AUTHORITY_EXPIRED/);assert.equal(f.calls.consume,0);});
test('tampered consumed payload is never resealed',async()=>{
  const f=fixture();await f.run();f.observed.reservation.recovery_terminal.merge_performed=true;await assert.rejects(f.run(),/RECOVERY_STORED_TERMINAL_BINDING/);assert.equal(f.calls.seal,1);
});
test('immutable checksum mismatch is not acknowledged',async()=>{
  const f=fixture(),original=f.adapter.readImmutable;f.adapter.readImmutable=async input=>{const value=await original(input);return value?{...value,checksum_verified:false}:null;};await assert.rejects(f.run(),/RECOVERY_IMMUTABLE_BINDING/);assert.equal(f.calls.ack,0);
});
test('fixed object identity is original-generation scoped',()=>{const f=fixture();assert.equal(recoveryObjectKey(f.request),`receipts/${I.original_generation}/postmerge-recovery-v1/${I.original_merge_sha}.json`);});
test('recovery cannot impersonate the original cancelled run',async()=>{
  const f=fixture();await assert.rejects(runPostmergeTerminalRecovery({request:f.request,recoveryRunId:I.original_run_id,adapter:f.adapter,now:()=>NOW}),/RECOVERY_RUN_ID/);assert.equal(f.calls.consume,0);
});
test('ambiguous timezone or normalized invalid date cannot establish recovery authority',async()=>{
  for(const issuedAt of ['2026-10-03T15:00:00+00:00','2026-02-30T15:00:00Z']){
    const f=fixture();f.request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt,expiresAt:'2026-10-03T15:20:00.000Z'});
    await assert.rejects(runPostmergeTerminalRecovery({request:f.request,recoveryRunId:'9001',adapter:f.adapter,now:()=>NOW}),/RECOVERY_TIMESTAMP/);assert.equal(f.calls.consume,0);
  }
});
