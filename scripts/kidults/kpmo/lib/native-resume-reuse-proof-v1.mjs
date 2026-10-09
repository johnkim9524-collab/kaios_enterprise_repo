import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {operationKey} from '../../staging-operations/lib/resume-operation-v1.mjs';

// Invoked only by the protected Dispatcher after the authenticated broker has
// accepted this exact operation. The second invocation must reuse the durable
// success; it must never mint a replacement generation or send another event.
export function verifyNativeResumeReuse(first,second) {
  const deny=code=>{throw new Error(`NATIVE_RESUME_REUSE_${code}`);};
  if(first?.ok!==true || !['EXECUTED_VERIFIED','REUSED_SUCCESS'].includes(first.state)
    || second?.ok!==true || second.state!=='REUSED_SUCCESS') deny('STATE');
  if(!/^sha256:[a-f0-9]{64}$/.test(first.key||'') || first.key!==second.key
    || canonicalJson(first.receipt)!==canonicalJson(second.receipt)) deny('ORIGINAL_RECEIPT_BINDING');
  const sealed=first.receipt,receipt=sealed?.receipt;
  if(sealed?.id!=='kidults-broker-resume-receipt-v1' || sealed.key!==first.key
    || !sealed.signature || !/^sha256:[a-f0-9]{64}$/.test(sealed.key_fingerprint||'')
    || receipt?.state!=='DISPATCH_ACCEPTED' || receipt.terminal!==true) deny('PROTECTED_RECEIPT');
  const {receipt_digest,...body}=receipt;
  if(receipt_digest!==sha256(canonicalJson(body))) deny('DIGEST');
  const stable=receipt.binding;
  const expected={repository:stable.repository,root_mission_id:'KIDULTS-AUTONOMOUS-AUTHORIZATION',
    stage_id:`authorization-fanout:${stable.pull_request}`,operation_kind:'WORKFLOW_DISPATCH',
    exact_target:`${stable.base_sha}:${stable.head_sha}:${stable.head_tree_sha}`,
    payload_sha256:sha256(canonicalJson({event_type:'kidults.authorization.generation.v1',binding:stable}))};
  if(canonicalJson(expected)!==canonicalJson(sealed.binding)||operationKey(expected)!==first.key) deny('OPERATION_BINDING');
  return {id:'kidults-native-resume-reuse-proof-v1',state:'VERIFIED_PASS',
    operation_key:first.key,original_receipt_digest:receipt_digest,
    original_sealed_receipt_digest:sha256(canonicalJson(sealed)),
    original_binding:receipt.binding,first_state:first.state,reuse_state:second.state,
    replacement_generation_created:false,original_transport_reused:true,
    proof_scope:'PROTECTED_BROKER_AUTHENTICATED_DURABLE_SUCCESS_REUSE',
    production:'HOLD',public:'HOLD',g5:'HOLD'};
}
