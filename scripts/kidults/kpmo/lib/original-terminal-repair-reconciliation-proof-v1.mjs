import {canonicalJson} from './canonical-json-v1.mjs';
import {validateOriginalTerminalRepairRequest,validateOriginalTerminalRepairEvidence,
  validateOriginalTerminalRepairTerminal,validateOriginalTerminalRepairAck} from './interrupted-reservation-recovery-v1.mjs';

const check=(ok,code)=>{if(!ok)throw new Error(`ORIGINAL_TERMINAL_REPAIR_RECONCILIATION_${code}`);};

// Verifies only the explicit RESERVED -> CONSUMED recovery transition and its
// immutable receipt. It never represents the missing normal landing terminal
// or operating authority as recovered.
export function verifyOriginalTerminalRepairReconciliation(result,{sourceSha,runId,original,observedAt}){
  const request=result?.request,context=result?.consistent_read;
  check(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE_SHA');
  check(/^[1-9][0-9]{0,15}$/.test(String(runId||''))&&String(runId)!==String(original?.original_run_id),'RECOVERY_RUN');
  validateOriginalTerminalRepairRequest(request);
  check(request.source_sha===sourceSha&&request.pull_request===2655
    &&request.original_run_id==='38132692877'&&request.original_run_attempt===1,'INCIDENT');
  for(const key of ['pull_request','base_sha','head_sha','head_tree_sha','original_generation','nonce_digest','original_run_id','original_run_attempt'])
    check(request[key]===original[key],'ORIGINAL_TUPLE');
  check(request.merge_sha==='d1b801ebf75dfc2b582c6381771f8194016328ca','MERGE');
  const terminal=result.terminal,terminalDigest=validateOriginalTerminalRepairTerminal(terminal,request);
  check(result.state==='ORIGINAL_RESERVATION_TERMINATED_RECOVERY_ONLY'
    &&result.authority_scope==='ORIGINAL_TERMINAL_DEBT_ONLY'
    &&result.terminal_digest===terminal.repair_digest&&result.original_reservation_transition_verified===true
    &&result.original_reservation_reconsumed===false&&result.original_terminal_created===false
    &&result.normal_original_terminal_created===false&&result.actual_authority_granted===false
    &&result.platform_closure===false&&result.promotion_eligible===false,'SCOPE');
  const transition=terminal.original_reservation_transition;
  check(context?.state==='ORIGINAL_TERMINAL_DEBT_ONLY'&&context.write_performed===false
    &&context.request&&canonicalJson(context.request)===canonicalJson(request)
    &&canonicalJson(context.terminal)===canonicalJson(terminal)
    &&context.evidence_digest===terminal.evidence_digest
    &&validateOriginalTerminalRepairEvidence(context.evidence,request)===terminal.evidence_digest,'CONSISTENT_READ');
  const approvals=context.approvals;
  check(Array.isArray(approvals)&&approvals.length===3
    &&new Set(approvals.map(a=>a.role)).size===3
    &&['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].every(role=>approvals.some(a=>a.role===role))
    &&new Set(approvals.map(a=>a.approval_run_id)).size===3
    &&approvals.every(a=>/^[1-9][0-9]{0,15}$/.test(String(a.approval_run_id))
      &&String(a.approval_run_id)!==request.original_run_id)
    &&approvals.filter(a=>String(a.approval_run_id)===String(runId)).length<=1
    &&approvals.every(a=>a.request_digest===terminal.request_digest&&a.evidence_digest===terminal.evidence_digest),'QUORUM');
  const object=result.immutable_readback;
  validateOriginalTerminalRepairAck(object,request,terminal);
  check(object.key===`receipts/${request.original_generation}/original-reservation-terminal-repair/${request.merge_sha}.json`
    &&/^kidults-autonomous-[a-z0-9-]+$/.test(object.bucket||'')
    &&/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(object.encryption_key_arn||'')
    &&Date.parse(object.retain_until)>Date.parse(observedAt)
    &&canonicalJson(context.immutable_ack)===canonicalJson(object)
    &&result.physical_immutable_object_verified===true,'IMMUTABLE_READBACK');
  check(['production','public','g5','provider_activation'].every(k=>result[k]==='HOLD'),'HOLD');
  return {request_digest:terminal.request_digest,terminal_digest:terminalDigest,immutable:object,
    lifecycle_state:terminal.lifecycle_state,transition,scope:terminal.authority_scope,
    normal_original_terminal_created:false,actual_authority_granted:false,platform_closure:false};
}
