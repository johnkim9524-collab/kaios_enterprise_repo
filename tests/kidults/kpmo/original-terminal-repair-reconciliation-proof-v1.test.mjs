import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {validateOriginalTerminalRepairEvidence,validateOriginalTerminalRepairTerminal,originalTerminalRepairObjectKey} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
import {verifyOriginalTerminalRepairReconciliation} from '../../../scripts/kidults/kpmo/lib/original-terminal-repair-reconciliation-proof-v1.mjs';

const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:'1281328888',
  pull_request:2655,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d1b801ebf75dfc2b582c6381771f8194016328ca',source_sha:'e'.repeat(40),
  original_run_id:'38132692877',original_run_attempt:1,original_generation:'pr-2655-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),
  issued_at:'2026-10-11T00:00:00.000Z',expires_at:'2026-10-11T00:20:00.000Z',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const evidence={repository:request.repository,source_sha:request.source_sha,pull_request:request.pull_request,merge_sha:request.merge_sha,
  head_sha:request.head_sha,head_tree_sha:request.head_tree_sha,merge_parents:[request.base_sha,request.head_sha],merged_at:'2026-10-10T23:59:00Z',
  original_run:{run_id:request.original_run_id,run_attempt:1,source_sha:request.base_sha,status:'completed',conclusion:'cancelled'},
  production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',evidence_profile:'TERMINAL_NULL_ASSURANCE_FAILURE_V1',
  original_archive:{artifact_id:11700046124,archive_digest:'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4'},
  checks:['REQUIRED_PUSH_SUITE','CANONICAL_TRUTH','SENTINEL','TERMINAL_NULL_ASSURANCE_FAILURE'].map((kind,i)=>({kind,run_id:String(900+i),run_attempt:1,
    source_sha:request.source_sha,conclusion:i===3?'failure':'success',artifact_id:9100+i,archive_digest:'sha256:'+'1'.repeat(64),receipt_digest:'sha256:'+'2'.repeat(64),
    ...(i===3?{terminal_null_evidence_refs:[38132692877,11700046124,'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4']}:{})}))};
const terminalCore=()=>({id:'kidults-original-reservation-terminal-repair-v1',version:'1.0.0',state:'ORIGINAL_TERMINAL_DEBT_ONLY',
  lifecycle_state:'ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY',authority_scope:'ORIGINAL_TERMINAL_DEBT_ONLY',
  original_reservation_transition:{id:'kidults-original-reservation-transition-v1',from_state:'RESERVED',to_state:'CONSUMED',
    ledger_key:{pk:`RESERVE#${request.original_generation}`,sk:`NONCE#${request.nonce_digest}`},conditional_cas:true,merge_sha:request.merge_sha},
  request_digest:sha256(canonicalJson(request)),evidence_digest:validateOriginalTerminalRepairEvidence(evidence,request),
  original_run_id:request.original_run_id,original_head_sha:request.head_sha,original_merge_sha:request.merge_sha,original_state:'RESERVED',
  original_terminal_present:false,actual_authority_granted:false,platform_closure:false,production:'HOLD',public:'HOLD',g5:'HOLD',created_at:'2026-10-11T00:01:00.000Z'});
function fixture(){
  const core=terminalCore(),terminal={...core,repair_digest:sha256(canonicalJson(core))};validateOriginalTerminalRepairTerminal(terminal,request);
  const object={bucket:'kidults-autonomous-receipts',key:originalTerminalRepairObjectKey(request),version_id:'repair-v1',
    sha256:sha256(canonicalJson(terminal)),retention_mode:'COMPLIANCE',retain_until:'2036-10-11T00:01:00.000Z',
    encryption_key_arn:'arn:aws:kms:ap-northeast-2:528314240275:key/receipt-key'};
  const context={state:'ORIGINAL_TERMINAL_DEBT_ONLY',request,terminal,evidence,evidence_digest:terminal.evidence_digest,immutable_ack:object,write_performed:false,
    approvals:['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].map((role,i)=>({role,approval_run_id:String(200+i),
      request_digest:terminal.request_digest,evidence_digest:terminal.evidence_digest}))};
  return {terminal,object,context,result:{state:terminal.lifecycle_state,authority_scope:terminal.authority_scope,request,terminal,
    terminal_digest:terminal.repair_digest,consistent_read:context,immutable_readback:structuredClone(object),original_reservation_transition_verified:true,
    physical_immutable_object_verified:true,original_reservation_reconsumed:false,original_terminal_created:false,normal_original_terminal_created:false,
    actual_authority_granted:false,platform_closure:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'}};
}
const original={pull_request:request.pull_request,base_sha:request.base_sha,head_sha:request.head_sha,head_tree_sha:request.head_tree_sha,
  original_generation:request.original_generation,nonce_digest:request.nonce_digest,original_run_id:request.original_run_id,original_run_attempt:request.original_run_attempt};
const options={sourceSha:request.source_sha,runId:'400',original,observedAt:'2026-10-12T00:00:00.000Z'};

test('collector verifies the recovery-only RESERVED to CONSUMED transition and immutable readback',()=>{
  const f=fixture(),proof=verifyOriginalTerminalRepairReconciliation(f.result,options);
  assert.equal(proof.lifecycle_state,'ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY');
  assert.equal(proof.transition.from_state,'RESERVED');assert.equal(proof.transition.to_state,'CONSUMED');
  assert.equal(proof.normal_original_terminal_created,false);assert.equal(proof.actual_authority_granted,false);
});

test('collector accepts the real Track approval and FINALIZER jobs sharing one workflow run ID',()=>{
  const f=fixture();f.context.approvals[0].approval_run_id='400';
  assert.equal(verifyOriginalTerminalRepairReconciliation(f.result,{...options,runId:400}).transition.to_state,'CONSUMED');
});

test('collector rejects KPMO or verifier approval sharing the FINALIZER run ID',()=>{
  for(const role of ['KPMO','INDEPENDENT_VERIFIER']){
    const f=fixture();f.context.approvals.find(a=>a.role===role).approval_run_id='400';
    assert.throws(()=>verifyOriginalTerminalRepairReconciliation(f.result,{...options,runId:400}),/ORIGINAL_TERMINAL_REPAIR_RECONCILIATION_QUORUM/);
  }
});

test('collector rejects missing CAS/readback evidence and authority promotion',()=>{
  for(const mutate of [
    r=>{r.terminal.original_reservation_transition.conditional_cas=false;},
    r=>{r.original_reservation_transition_verified=false;},
    r=>{r.physical_immutable_object_verified=false;},
    r=>{r.actual_authority_granted=true;},
    r=>{r.consistent_read.immutable_ack.version_id='other';},
  ]){
    const f=fixture();mutate(f.result);
    assert.throws(()=>verifyOriginalTerminalRepairReconciliation(f.result,options),/ORIGINAL_TERMINAL_REPAIR_RECONCILIATION_|INTERRUPTED_RECOVERY_ORIGINAL_REPAIR_TERMINAL/);
  }
});
