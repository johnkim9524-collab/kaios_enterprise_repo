import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {validateInterruptedRecoveryRequest,validateFailureAssuranceTerminal,failureAssuranceRecoveryObjectKey} from './interrupted-reservation-recovery-v1.mjs';
const check=(ok,code)=>{if(!ok)throw new Error('FAILURE_TERMINAL_RECONCILIATION_'+code);};
// The caller must authenticate the native FINALIZER job and protected archive.
// This proof clears only the historical terminal debt, never operating authority.
export function verifyFailureTerminalReconciliation(result,{sourceSha,runId,original,observedAt}){
  const request=result?.request,context=result?.consistent_read;
  validateInterruptedRecoveryRequest(request,{fresh:false});
  check(request.source_sha===sourceSha&&request.pull_request===2655&&request.original_run_id==='38132692877'
    &&request.original_run_attempt===1,'INCIDENT');
  for(const key of ['pull_request','base_sha','head_sha','head_tree_sha','original_generation','nonce_digest','original_run_id','original_run_attempt'])
    check(request[key]===original[key],'ORIGINAL_TUPLE');
  check(request.merge_sha==='d1b801ebf75dfc2b582c6381771f8194016328ca','MERGE');
  const terminal=result.terminal,terminalDigest=validateFailureAssuranceTerminal(terminal,request);
  check(result.state==='RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY'&&result.reconciliation_run_id===String(runId)
    &&result.terminal_digest===terminalDigest&&result.original_reservation_reconsumed===false
    &&result.original_terminal_created===false&&result.actual_authority_granted===false
    &&result.platform_closure===false&&result.promotion_eligible===false,'SCOPE');
  check(context?.state==='FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'&&context.write_performed===false
    &&canonicalJson(context.request)===canonicalJson(request)&&canonicalJson(context.terminal)===canonicalJson(terminal)
    &&context.evidence_digest===terminal.evidence_digest&&sha256(canonicalJson(context.evidence))===terminal.evidence_digest
    &&context.evidence.evidence_profile==='TERMINAL_NULL_ASSURANCE_FAILURE_V1','CONSISTENT_READ');
  const approvals=context.approvals;
  check(Array.isArray(approvals)&&approvals.length===3
    &&new Set(approvals.map(a=>a.role)).size===3
    &&['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].every(role=>approvals.some(a=>a.role===role))
    &&new Set(approvals.map(a=>a.approval_run_id)).size===3
    &&approvals.every(a=>a.approval_run_id!==terminal.recovery_run_id&&a.approval_run_id!==String(runId))
    &&approvals.every(a=>a.request_digest===terminal.request_digest&&a.evidence_digest===terminal.evidence_digest),'QUORUM');
  const object=result.immutable;
  check(object?.key===failureAssuranceRecoveryObjectKey(request)&&object.sha256===terminalDigest
    &&/^kidults-autonomous-[a-z0-9-]+$/.test(object.bucket||'')
    &&typeof object.version_id==='string'&&object.version_id.length>0&&object.version_id!=='null'
    &&!/[\x00-\x20]/.test(object.version_id)&&object.retention_mode==='COMPLIANCE'
    &&/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(object.encryption_key_arn||''),'IMMUTABLE');
  const minimum=new Date(request.issued_at);const month=minimum.getUTCMonth();minimum.setUTCFullYear(minimum.getUTCFullYear()+10);
  if(minimum.getUTCMonth()!==month)minimum.setUTCDate(0);
  check(Date.parse(object.retain_until)>=minimum.getTime()&&Date.parse(object.retain_until)>Date.parse(observedAt)
    &&canonicalJson(result.immutable_readback)===canonicalJson(object)
    &&canonicalJson(context.immutable_ack)===canonicalJson(object),'ACK_READBACK');
  check(['production','public','g5','provider_activation'].every(k=>result[k]==='HOLD'),'HOLD');
  return {request_digest:terminal.request_digest,terminal_digest:terminalDigest,immutable:object,
    scope:'ORIGINAL_TERMINAL_DEBT_ONLY',actual_authority_granted:false,platform_closure:false};
}
