import {buildDispatchRequest,transitionDispatchReceipt,DISPATCH_EVENT_TYPE} from './autonomous-dispatch-fanout-v1.mjs';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
import {resumeOperation} from '../../staging-operations/lib/resume-operation-v1.mjs';

// Protected wiring: ledger/readExternal/authenticateReceipt/authorize/send
// must come from the launcher, never from PR payloads. This adapter neither
// mints tokens nor expands broker authority.
export async function resumeDispatchFanout({envelope,rootMissionId,runId,runAttempt,owner,ledger,readExternal,authenticateReceipt,authorize,send,now}){
  const built=buildDispatchRequest({envelope,runId,runAttempt,now});
  const stable=built.receipt.binding;
  const binding={repository:stable.repository,root_mission_id:rootMissionId,
    stage_id:`authorization-fanout:${stable.pull_request}`,
    operation_kind:'WORKFLOW_DISPATCH',
    exact_target:`${stable.base_sha}:${stable.head_sha}:${stable.head_tree_sha}`,
    payload_sha256:sha256(canonicalJson({event_type:DISPATCH_EVENT_TYPE,binding:stable}))};
  const verifyReceipt=async receipt=>{
    if(!receipt||receipt.state!=='DISPATCH_ACCEPTED'||receipt.event_type!==DISPATCH_EVENT_TYPE
      ||canonicalJson(receipt.binding)!==canonicalJson(stable)) return false;
    const {receipt_digest,...core}=receipt;
    if(receipt_digest!==sha256(canonicalJson(core))) return false;
    return await authenticateReceipt(receipt,binding)===true;
  };
  return resumeOperation({binding,ledger,owner,readExternal,verifyReceipt,
    authorize:async()=>await authorize(envelope,binding)===true,
    execute:async({key})=>{
      const result=await send({request:built.request,idempotencyKey:key,binding});
      if(result?.accepted!==true) throw new Error('DISPATCH_DELIVERY_UNKNOWN');
      return transitionDispatchReceipt(built.receipt,{state:'DISPATCH_ACCEPTED',now});
    }});
}
