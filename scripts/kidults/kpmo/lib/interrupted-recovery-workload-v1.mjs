import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {observeInterruptedRecoveryNative,resumeInterruptedPostmerge,supersedeExpiredInterruptedPostmerge,recoverFailureAssuranceTerminal} from './interrupted-reservation-recovery-v1.mjs';
const check=(ok,code)=>{if(!ok)throw Error('INTERRUPTED_WORKLOAD_'+code);};
export async function runInterruptedRecoveryWorkload({role,candidates,ledger,get,evidence,immutable,verifyDrain,runId,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const results=[];
  for(const candidate of candidates){
    if(candidate.failure_parent){
      const request=candidate.request,parent=candidate.failure_parent;
      check(parent.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'&&parent.source_sha===request.source_sha
        &&parent.actual_authority_granted===false&&parent.platform_closure===false&&parent.promotion_eligible===false,'FAILURE_PARENT');
      let context=await ledger.readFailureContext({request});
      if(context.state==='ORIGINAL_RESERVATION_MISSING'){results.push({state:context.state,write_performed:false});continue;}
      check(['FAILURE_ASSURANCE_TERMINAL_PENDING','FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'].includes(context.state),'FAILURE_CONTEXT_STATE');
      const native=await observeInterruptedRecoveryNative({request,get,now:now()});
      const originalArchive={artifact_id:candidate.original_artifact_id,archive_digest:candidate.original_archive_digest};
      const proof=await evidence.verifyEvidence({request,native:{...native,recovery_parent:parent},originalArchive});
      const proofDigest=sha256(canonicalJson(proof));
      if(context.evidence_digest)check(context.evidence_digest===proofDigest,'FAILURE_EVIDENCE_PIN');
      if(context.state==='FAILURE_ASSURANCE_TERMINAL_PENDING'){
        check(context.evidence===null||canonicalJson(context.evidence)===canonicalJson(proof),'FAILURE_EVIDENCE_PIN');
        if(role!=='FINALIZER'){
          const prior=context.approvals?.find(a=>a.role===role);
          if(prior){check(prior.request_digest===sha256(canonicalJson(request))&&prior.evidence_digest===proofDigest,'FAILURE_APPROVAL_BINDING');results.push({state:'EXISTING_FAILURE_ASSURANCE_APPROVAL',write_performed:false});continue;}
          check(['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].includes(role),'FAILURE_APPROVAL_ROLE');
          try{results.push(await ledger.createFailureApproval({request,evidence:proof}));}
          catch(error){
            const after=await ledger.readFailureContext({request}),a=after.approvals?.find(x=>x.role===role);
            check(a&&a.approval_run_id===runId&&a.request_digest===sha256(canonicalJson(request))&&a.evidence_digest===proofDigest,'FAILURE_APPROVAL_UNKNOWN_NO_RETRY');
            results.push({state:'FAILURE_ASSURANCE_APPROVAL_RECONCILED',write_reissued:false});
          }
          continue;
        }
      }else check(role==='FINALIZER','FAILURE_TERMINAL_ALREADY_RECORDED');
      check(role==='FINALIZER'&&typeof verifyDrain==='function','FAILURE_FINALIZER_ROLE');
      if(context.state==='FAILURE_ASSURANCE_TERMINAL_PENDING'){
        for(let attempt=0;context.approvals?.length!==3&&attempt<18;attempt++){
          await wait(5000);context=await ledger.readFailureContext({request});
        }
        check(context.state==='FAILURE_ASSURANCE_TERMINAL_PENDING'&&context.approvals?.length===3,'FAILURE_QUORUM_PENDING');
      }
      const recovered=await recoverFailureAssuranceTerminal({request,recoveryRunId:runId,ledger,evidence:async()=>proof,
        immutable,verifyDrain,now});
      results.push(recovered);continue;
    }
    let request=candidate.request,context=await ledger.readContext({request});
    if(['ORIGINAL_RESERVATION_MISSING','ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED'].includes(context.state)){results.push({state:context.state,write_performed:false});continue;}
    if(context.state==='ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING'){
      if(context.immutable_ack){results.push({state:'ORIGINAL_IMMUTABLE_ALREADY_ACKNOWLEDGED',write_performed:false});continue;}
      if(role!=='FINALIZER'){results.push({state:'ORIGINAL_CONSUMED_SEAL_PENDING',write_performed:false});continue;}
      await observeInterruptedRecoveryNative({request,get,now:now()});
      check(typeof verifyDrain==='function'&&typeof ledger.acknowledgeOriginal==='function','ORIGINAL_ARCHIVE_ADAPTER');
      await verifyDrain(request);
      const terminal=context.terminal,key=`receipts/${request.original_generation}/${request.merge_sha}/terminal.json`;
      const object=await immutable.seal({request,terminal,key,original:true,if_none_match:'*'});
      try{check((await ledger.acknowledgeOriginal({request,run_id:runId,object})).state==='ORIGINAL_IMMUTABLE_ACKNOWLEDGED','ORIGINAL_ACK');}
      catch(error){const after=await ledger.readContext({request});check(canonicalJson(after.immutable_ack)===canonicalJson(object),'ORIGINAL_ACK_UNKNOWN_NO_RETRY');}
      results.push({state:'ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE',terminal,immutable_object:object,original_consumption_reissued:false});continue;
    }
    for(let attempt=0;context.state==='RESERVED'&&!context.request&&role!=='ACCOUNTABLE_TRACK_AGENT'&&attempt<18;attempt++){
      await wait(5000);context=await ledger.readContext({request});
    }
    const oldRequest=context.request;
    const superseding=context.state==='RESERVED'&&oldRequest&&Date.parse(oldRequest.expires_at)<=now();
    if(oldRequest&&!superseding)request=oldRequest;
    if(superseding)check(Date.parse(request.issued_at)>=Date.parse(oldRequest.expires_at),'SUPERSESSION_CLOCK');
    if(canonicalJson(request)!==canonicalJson(candidate.request))context=await ledger.readContext({request});
    if(context.state==='CONSUMED'&&context.immutable_ack){results.push({state:'IMMUTABLE_ALREADY_ACKNOWLEDGED',write_performed:false});continue;}
    if(context.state==='CONSUMED'){
      if(role!=='FINALIZER'){results.push({state:'CONSUMED_SEAL_PENDING',write_performed:false});continue;}
    }else{
      check(context.state==='RESERVED','STATE');
      if(!context.request&&role!=='ACCOUNTABLE_TRACK_AGENT'){results.push({state:'WAITING_ORIGINAL_REQUEST_PIN',write_performed:false});continue;}
      const native=await observeInterruptedRecoveryNative({request,get,now:now()});
      const proof=await evidence.verifyEvidence({request,native,pinned:superseding?context.candidate_evidence:context.evidence});
      if(role!=='FINALIZER'){
        const existing=superseding?context.candidate_approvals?.find(a=>a.role===role):context.approval;
        if(existing){check(existing.request_digest===sha256(canonicalJson(request))&&existing.evidence_digest===sha256(canonicalJson(proof)),'EXISTING_APPROVAL_BINDING');results.push({state:'EXISTING_SIGNED_APPROVAL',write_performed:false});continue;}
        try{results.push(await ledger.createApproval({request,evidence:proof}));}
        catch(error){
          const after=await ledger.readContext({request}),a=after.candidate_approvals?.find(a=>a.role===role);
          check(a&&a.approval_run_id===runId&&a.request_digest===sha256(canonicalJson(request))
            &&a.evidence_digest===sha256(canonicalJson(proof)),'APPROVAL_UNKNOWN_NO_RETRY');
          results.push({state:'SIGNED_APPROVAL_RECONCILED',write_reissued:false});
        }
        continue;
      }
    }
    check(role==='FINALIZER'&&typeof verifyDrain==='function','DRAIN_ADAPTER');
    if(context.state==='RESERVED'){
      for(let attempt=0;(context.candidate_approvals?.length||0)<3&&attempt<18;attempt++){
        await wait(5000);context=await ledger.readContext({request});
      }
      check(context.candidate_approvals?.length===3,'INDEPENDENT_QUORUM_PENDING');
    }
    await verifyDrain(request); // Authenticated broker read-only drain, no mint/reissue.
    if(superseding)await supersedeExpiredInterruptedPostmerge({oldRequest,request,recoveryRunId:runId,ledger,get,now,
      verifyEvidence:({request,native})=>evidence.verifyEvidence({request,native,pinned:context.candidate_evidence})});
    const pinned=superseding?context.candidate_evidence:context.evidence;
    const result=await resumeInterruptedPostmerge({request,recoveryRunId:runId,ledger,get,immutable,now,
      verifyEvidence:({request,native})=>evidence.verifyEvidence({request,native,pinned})});
    results.push(result);
  }
  return {state:results.some(r=>r.state==='ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE')?'BOUNDED_RECOVERY_TERMINAL_VERIFIED':'RECOVERY_SCAN_NOT_OPERATING_CLOSURE',
    results,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',promotion_eligible:false};
}
