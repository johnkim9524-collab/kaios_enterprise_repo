import {canonicalJson,buildTerminalReceipt} from './autonomous-internal-landing-v1.mjs';
import {validateReservationConsumption} from './autonomous-finalizer-election-v1.mjs';

// Prepare canonical bytes before the mutation, but do not publish/seal a
// terminal until authenticated ALL_NEW (or a signed read after lost reply).
export function consumeOriginalTerminalAtomically({envelope,runId,quorum,merge,postmerge,invoke,now}){
 const binding={contract_version:'3.0.0',action:'CONSUME_RESERVATION',authorization_generation:envelope.authorization_generation,
   nonce_digest:envelope.nonce_digest,run_id:String(runId),head_sha:envelope.head_sha,merge_sha:merge.merge_sha,state:'CONSUMED',conditional_write:true};
 const reservation={state:'CONSUMED',conditional_write:true,backend:'AWS_DYNAMODB',remote_binding:binding,
   ledger_key:{pk:`RESERVE#${envelope.authorization_generation}`,sk:`NONCE#${envelope.nonce_digest}`}};
 const terminal=buildTerminalReceipt({quorum,reservation,merge,postmerge,...(now?{now}:{})});
 const payload={action:'CONSUME_RESERVATION',authorization_generation:envelope.authorization_generation,
   nonce_digest:envelope.nonce_digest,run_id:String(runId),head_sha:envelope.head_sha,merge_sha:merge.merge_sha,terminal};
 let response;
 try{response=invoke(payload);}
 catch(error){
   // A potentially completed consume is NEVER issued again.
   response=invoke({...payload,action:'READ_ORIGINAL_CONSUMED_TERMINAL'});
 }
 const confirmed=validateReservationConsumption({response,envelope,runId,mergeSha:merge.merge_sha,terminal});
 if(canonicalJson(confirmed)!==canonicalJson(reservation)||canonicalJson(response.terminal)!==canonicalJson(terminal))throw Error('AUTONOMOUS_ATOMIC_TERMINAL_READBACK');
 return terminal;
}
