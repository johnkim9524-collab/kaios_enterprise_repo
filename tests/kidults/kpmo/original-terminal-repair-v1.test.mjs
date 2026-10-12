import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {recoverOriginalTerminalRepair,originalTerminalRepairObjectKey,validateOriginalTerminalRepairTerminal} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';

const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:'1281328888',
  pull_request:42,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d'.repeat(40),source_sha:'e'.repeat(40),
  original_run_id:'100',original_run_attempt:1,original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),
  issued_at:'2026-10-11T00:00:00.000Z',expires_at:'2026-10-11T00:20:00.000Z',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const evidence={evidence_profile:'TERMINAL_NULL_ASSURANCE_FAILURE_V1',checks:[
  {kind:'REQUIRED_PUSH_SUITE',conclusion:'success'},{kind:'CANONICAL_TRUTH',conclusion:'success'},
  {kind:'SENTINEL',conclusion:'success'},{kind:'TERMINAL_NULL_ASSURANCE_FAILURE',conclusion:'failure'}]};
function fixture({ambiguousFinalize=false,ambiguousAck=false}={}){
  const evidence_digest=sha256(canonicalJson(evidence));let context={state:'ORIGINAL_TERMINAL_REPAIR_PENDING',request,evidence,evidence_digest,
    approvals:['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].map((role,i)=>({role,approval_run_id:String(200+i)})),terminal:null,immutable_ack:null,write_performed:false};
  let finalizeCalls=0,ackCalls=0,drains=0,seals=0,reads=0;
  const ledger={readOriginalTerminalRepairContext:async()=>structuredClone(context),
    finalizeOriginalTerminalRepair:async p=>{finalizeCalls++;context={...context,state:'ORIGINAL_TERMINAL_DEBT_ONLY',terminal:p.terminal};if(ambiguousFinalize)throw Error('lost response');return{write_performed:true};},
    acknowledgeOriginalTerminalRepair:async({object})=>{ackCalls++;context={...context,immutable_ack:object};if(ambiguousAck)throw Error('lost response');return{write_performed:true};}};
  let sealedObject;
  const immutable={seal:async({key,terminal})=>{seals++;sealedObject={bucket:'immutable',key,version_id:'v1',sha256:sha256(canonicalJson(terminal)),retention_mode:'COMPLIANCE',retain_until:'2036-10-11T00:01:00.000Z',encryption_key_arn:'arn:aws:kms:ap-northeast-2:528314240275:key/receipt'};return sealedObject;},
    read:async()=>{reads++;return sealedObject;}};
  return {ledger,immutable,get context(){return context;},counts:()=>({finalizeCalls,ackCalls,drains,seals,reads}),
    drain:async()=>{drains++;}};
}

test('reserved repair is terminal debt only and reconciles ambiguous CAS and ACK without reissue',async()=>{
  const f=fixture({ambiguousFinalize:true,ambiguousAck:true});
  const result=await recoverOriginalTerminalRepair({request,recoveryRunId:'400',ledger:f.ledger,evidence:async()=>evidence,immutable:f.immutable,
    verifyDrain:f.drain,now:()=>Date.parse('2026-10-11T00:01:00.000Z')});
  assert.equal(result.state,'ORIGINAL_TERMINAL_DEBT_ONLY');assert.equal(result.terminal.original_state,'RESERVED');
  assert.equal(result.terminal.original_terminal_present,false);assert.equal(result.actual_authority_granted,false);
  assert.equal(result.promotion_eligible,false);assert.equal(f.counts().finalizeCalls,1);assert.equal(f.counts().ackCalls,1);
  assert.equal(f.counts().drains,1);assert.equal(f.counts().seals,1);assert.equal(f.counts().reads,1);
  assert.equal(f.context.state,'ORIGINAL_TERMINAL_DEBT_ONLY');assert.equal(validateOriginalTerminalRepairTerminal(f.context.terminal,request),sha256(canonicalJson(f.context.terminal)));
  assert.equal(originalTerminalRepairObjectKey(request),`receipts/${request.original_generation}/original-reservation-terminal-repair/${request.merge_sha}.json`);
});

test('repair rejects missing quorum, identity drift, and nonfailure evidence before any write',async()=>{
  const f=fixture();f.context.approvals.pop();
  await assert.rejects(recoverOriginalTerminalRepair({request,recoveryRunId:'400',ledger:f.ledger,evidence:async()=>evidence,
    immutable:f.immutable,verifyDrain:f.drain}),/ORIGINAL_REPAIR_QUORUM/);
  assert.equal(f.counts().finalizeCalls,0);assert.equal(f.counts().ackCalls,0);assert.equal(f.counts().drains,0);
  await assert.rejects(recoverOriginalTerminalRepair({request,recoveryRunId:'100',ledger:f.ledger,evidence:async()=>evidence,
    immutable:f.immutable,verifyDrain:f.drain}),/ORIGINAL_REPAIR_ADAPTER/);
});
