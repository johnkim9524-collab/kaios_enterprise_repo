import {canonicalJson,sha256} from './canonical-json-v1.mjs';

// Merged-only composition. Native GET/proof validation, signed ledger RPC and
// immutable S3 transport are protected adapters, never event-provided flags.
// There is deliberately no merge, token mint, reservation replacement or
// original-owner impersonation capability in this engine.
const HOLD={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const repository='johnkim9524-collab/kaios_enterprise_repo',repositoryId='1281328888';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const run=x=>typeof x==='string'&&/^[1-9][0-9]{0,15}$/.test(x);
const requireProof=(ok,code)=>{if(!ok)throw new Error(`INTERRUPTED_RECOVERY_${code}`);};
const eq=(a,b)=>canonicalJson(a)===canonicalJson(b);
const fields='id version repository repository_id pull_request base_sha head_sha head_tree_sha merge_sha source_sha original_run_id original_run_attempt original_generation nonce_digest issued_at expires_at production public g5 provider_activation'.split(' ');
export function validateInterruptedRecoveryRequest(request,{now=Date.now(),fresh=true}={}){
  requireProof(request&&eq(Object.keys(request).sort(),fields.sort()),'REQUEST_FIELDS');
  requireProof(request.id==='kidults-interrupted-reservation-postmerge-request-v1'&&request.version==='1.0.0'
    &&request.repository===repository&&request.repository_id===repositoryId,'REQUEST_IDENTITY');
  requireProof(Number.isSafeInteger(request.pull_request)&&request.pull_request>0&&request.pull_request!==1677,'QUARANTINE');
  requireProof(['base_sha','head_sha','head_tree_sha','merge_sha','source_sha'].every(k=>sha(request[k])),'SHA');
  requireProof(run(request.original_run_id)&&request.original_run_attempt===1
    &&/^[A-Za-z0-9_.:-]{12,160}$/.test(request.original_generation||'')&&/^sha256:[a-f0-9]{64}$/.test(request.nonce_digest||''),'ORIGINAL_KEY');
  requireProof(Object.entries(HOLD).every(([k,v])=>request[k]===v),'HOLD');
  for(const t of [request.issued_at,request.expires_at])requireProof(typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(t)
    &&Number.isFinite(Date.parse(t))&&new Date(t).toISOString()===t.replace(/(?<!\.\d{3})Z$/,'.000Z'),'TIMESTAMP');
  const issued=Date.parse(request.issued_at),expires=Date.parse(request.expires_at);
  requireProof(expires>issued&&expires-issued<=1800000&&(!fresh||(issued<=now&&now<expires)),'REQUEST_EXPIRED');
  return sha256(canonicalJson(request));
}

// get is a fixed authenticated GET-only transport. There is no write callback.
export async function observeInterruptedRecoveryNative({request,get,now=Date.now(),currentSourceSha=request.source_sha}){
  validateInterruptedRecoveryRequest(request,{now,fresh:false});
  requireProof(typeof get==='function','NATIVE_READER');
  const r=request;
  const [main,pr,original,commit]=await Promise.all([get('branches/main'),get(`pulls/${r.pull_request}`),get(`actions/runs/${r.original_run_id}`),get(`git/commits/${r.merge_sha}`)]);
  requireProof(main.name==='main'&&main.protected===true&&main.commit?.sha===currentSourceSha,'CURRENT_MAIN');
  requireProof(pr.number===r.pull_request&&pr.state==='closed'&&pr.merged===true&&pr.merge_commit_sha===r.merge_sha&&pr.head?.sha===r.head_sha
    &&pr.base?.ref==='main'&&pr.base?.repo?.full_name===repository&&pr.head?.repo?.full_name===repository,'MERGED_PR');
  requireProof(Number.isFinite(Date.parse(pr.merged_at))&&Date.parse(pr.merged_at)<=Date.parse(r.issued_at),'MERGE_TIME');
  requireProof(commit.sha===r.merge_sha&&commit.tree?.sha===r.head_tree_sha&&eq(commit.parents?.map(p=>p.sha),[r.base_sha,r.head_sha]),'MERGE_GRAPH');
  const paths=['track','kpmo','independent-verification'].map(x=>`.github/workflows/kidults-autonomous-${x}-authorization-v1.yml`);
  requireProof(String(original.id)===r.original_run_id&&original.run_attempt===1&&original.head_sha===r.base_sha&&original.head_branch==='main'
    &&original.repository?.full_name===repository&&String(original.repository?.id)===repositoryId&&paths.includes(original.path)
    &&original.event==='repository_dispatch'&&original.status==='completed'&&['failure','cancelled','timed_out'].includes(original.conclusion),'ORIGINAL_NATIVE_RUN');
  if(currentSourceSha!==r.source_sha){
    const ancestry=await get(`compare/${r.source_sha}...${currentSourceSha}`);
    requireProof(ancestry.base_commit?.sha===r.source_sha&&ancestry.merge_base_commit?.sha===r.source_sha
      &&ancestry.behind_by===0&&['ahead','identical'].includes(ancestry.status),'RECOVERY_SOURCE_ANCESTRY');
  }
  if(r.source_sha!==r.merge_sha){
    const comparison=await get(`compare/${r.merge_sha}...${r.source_sha}?per_page=1&page=2`);
    requireProof(comparison.base_commit?.sha===r.merge_sha&&comparison.merge_base_commit?.sha===r.merge_sha&&comparison.behind_by===0
      &&comparison.status==='ahead','MERGE_NOT_ANCESTOR');
  }
  const latest=await get('branches/main');requireProof(latest.name==='main'&&latest.protected===true&&latest.commit?.sha===currentSourceSha,'MAIN_CHANGED');
  return {repository,source_sha:r.source_sha,pull_request:r.pull_request,merge_sha:r.merge_sha,head_sha:r.head_sha,head_tree_sha:r.head_tree_sha,
    merge_parents:[r.base_sha,r.head_sha],merged_at:pr.merged_at,
    original_run:{run_id:r.original_run_id,run_attempt:1,source_sha:r.base_sha,status:'completed',conclusion:original.conclusion},...HOLD};
}

export function interruptedRecoveryObjectKey(request){
  validateInterruptedRecoveryRequest(request,{fresh:false});
  return `receipts/${request.original_generation}/interrupted-postmerge-v1/${request.merge_sha}.json`;
}

export function failureAssuranceRecoveryObjectKey(request){
  validateInterruptedRecoveryRequest(request,{fresh:false});
  return `receipts/${request.original_generation}/interrupted-postmerge-failure-assurance-v1/${request.merge_sha}.json`;
}

export function validateFailureAssuranceTerminal(terminal,request){
  const requestDigest=validateInterruptedRecoveryRequest(request,{fresh:false});
  const fields='id state request_digest evidence_digest recovery_run_id source_sha merge_sha original_state original_terminal_present actual_authority_granted platform_closure production public g5 provider_activation'.split(' ').sort();
  requireProof(eq(Object.keys(terminal||{}).sort(),fields)&&terminal.id==='kidults-interrupted-failure-assurance-terminal-v1'
    &&terminal.state==='RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY'&&terminal.request_digest===requestDigest
    &&/^sha256:[a-f0-9]{64}$/.test(terminal.evidence_digest||'')&&run(terminal.recovery_run_id)
    &&terminal.recovery_run_id!==request.original_run_id&&terminal.source_sha===request.source_sha&&terminal.merge_sha===request.merge_sha
    &&terminal.original_state==='CONSUMED'&&terminal.original_terminal_present===false
    &&terminal.actual_authority_granted===false&&terminal.platform_closure===false
    &&Object.entries(HOLD).every(([k,v])=>terminal[k]===v),'FAILURE_TERMINAL');
  return sha256(canonicalJson(terminal));
}

export async function recoverFailureAssuranceTerminal({request,recoveryRunId,ledger,evidence,immutable,verifyDrain,now=()=>Date.now()}){
  requireProof(run(recoveryRunId)&&recoveryRunId!==request?.original_run_id&&typeof ledger?.readFailureContext==='function'
    &&typeof ledger?.finalizeFailureTerminal==='function'&&typeof ledger?.acknowledgeFailureTerminal==='function'
    &&typeof evidence==='function'&&typeof immutable?.seal==='function'&&typeof verifyDrain==='function','FAILURE_RECOVERY_ADAPTER');
  const proof=await evidence({request});
  requireProof(proof?.evidence_profile==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'&&Array.isArray(proof.checks)
    &&proof.checks.length===4&&proof.checks.filter(c=>c.kind==='TERMINAL_NULL_ASSURANCE_FAILURE'&&c.conclusion==='failure').length===1
    &&proof.checks.filter(c=>c.kind==='SUCCESS_AUTHORITY_GATE').length===0,'FAILURE_EVIDENCE_PROFILE');
  const evidenceDigest=sha256(canonicalJson(proof));
  let context=await ledger.readFailureContext({request});
  requireProof(['FAILURE_ASSURANCE_TERMINAL_PENDING','FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'].includes(context.state)
    &&context.evidence_digest===evidenceDigest&&canonicalJson(context.evidence)===canonicalJson(proof),'FAILURE_CONTEXT');
  let terminal=context.terminal;
  if(context.state==='FAILURE_ASSURANCE_TERMINAL_PENDING'){
    requireProof(context.approvals?.length===3&&new Set(context.approvals.map(a=>a.role)).size===3
      &&new Set(context.approvals.map(a=>a.approval_run_id)).size===3,'FAILURE_QUORUM');
    await verifyDrain(request);
    terminal={id:'kidults-interrupted-failure-assurance-terminal-v1',state:'RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY',
      request_digest:sha256(canonicalJson(request)),evidence_digest:evidenceDigest,recovery_run_id:recoveryRunId,
      source_sha:request.source_sha,merge_sha:request.merge_sha,original_state:'CONSUMED',original_terminal_present:false,
      actual_authority_granted:false,platform_closure:false,...HOLD};
    validateFailureAssuranceTerminal(terminal,request);
    let finalized;
    try{finalized=await ledger.finalizeFailureTerminal({request,terminal,evidence_digest:evidenceDigest,run_id:recoveryRunId});}
    catch(error){
      context=await ledger.readFailureContext({request});
      requireProof(context.state==='FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'
        &&canonicalJson(context.terminal)===canonicalJson(terminal),'FAILURE_TERMINAL_UNKNOWN_NO_RETRY');
      finalized={state:'FAILURE_ASSURANCE_TERMINAL_RECONCILED',write_reissued:false};
    }
    requireProof(['FAILURE_ASSURANCE_TERMINAL_RECORDED','FAILURE_ASSURANCE_TERMINAL_RECONCILED'].includes(finalized.state),'FAILURE_TERMINAL_WRITE');
  }else{
    validateFailureAssuranceTerminal(terminal,request);
    requireProof(terminal.evidence_digest===evidenceDigest,'FAILURE_TERMINAL_EVIDENCE_BINDING');
  }
  const key=failureAssuranceRecoveryObjectKey(request),object=await immutable.seal({request,terminal,key,if_none_match:'*',failure_assurance:true});
  requireProof(object.key===key&&object.sha256===sha256(canonicalJson(terminal)),'FAILURE_IMMUTABLE_BINDING');
  let ack;
  try{ack=await ledger.acknowledgeFailureTerminal({request,run_id:recoveryRunId,object});}
  catch(error){context=await ledger.readFailureContext({request});
    requireProof(context.state==='FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'
      &&canonicalJson(context.immutable_ack)===canonicalJson(object),'FAILURE_ACK_UNKNOWN_NO_RETRY');
    ack={state:'FAILURE_ASSURANCE_IMMUTABLE_ACKNOWLEDGED',write_reissued:false};}
  requireProof(ack.state==='FAILURE_ASSURANCE_IMMUTABLE_ACKNOWLEDGED','FAILURE_IMMUTABLE_ACK');
  // A successful ACK response alone is not a terminal readback. Re-read the
  // signed writer's consistent row and the pinned immutable bytes before export.
  context=await ledger.readFailureContext({request});
  requireProof(context.state==='FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED'
    &&context.write_performed===false&&canonicalJson(context.request)===canonicalJson(request)
    &&canonicalJson(context.terminal)===canonicalJson(terminal)
    &&context.evidence_digest===evidenceDigest&&canonicalJson(context.evidence)===canonicalJson(proof)
    &&canonicalJson(context.immutable_ack)===canonicalJson(object),'FAILURE_FINAL_READBACK');
  requireProof(typeof immutable.read==='function','FAILURE_IMMUTABLE_READBACK_ADAPTER');
  const immutableReadback=await immutable.read({request,terminal,key,failure_assurance:true,version_id:object.version_id});
  requireProof(canonicalJson(immutableReadback)===canonicalJson(object),'FAILURE_IMMUTABLE_FINAL_READBACK');
  return {state:'RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY',reconciliation_run_id:recoveryRunId,request,consistent_read:context,
    immutable_readback:immutableReadback,terminal,terminal_digest:object.sha256,immutable:object,
    original_reservation_reconsumed:false,original_terminal_created:false,actual_authority_granted:false,platform_closure:false,
    promotion_eligible:false,...HOLD};
}

export function validateInterruptedRecoveryTerminal(terminal,request){
  const requestDigest=validateInterruptedRecoveryRequest(request,{fresh:false});
  requireProof(eq(Object.keys(terminal).sort(),'id state request_digest evidence_digest recovery_run_id revision merge_sha head_sha production public g5 provider_activation'.split(' ').sort())
    &&terminal.id==='kidults-interrupted-reservation-terminal-v1'&&terminal.state==='VERIFIED_PASS'
    &&run(terminal.recovery_run_id)&&terminal.recovery_run_id!==request.original_run_id&&Number.isSafeInteger(terminal.revision)&&terminal.revision>0
    &&/^sha256:[a-f0-9]{64}$/.test(terminal.evidence_digest||'')
    &&terminal.request_digest===requestDigest&&terminal.merge_sha===request.merge_sha&&terminal.head_sha===request.head_sha
    &&Object.entries(HOLD).every(([k,v])=>terminal[k]===v),'STORED_TERMINAL');
  return sha256(canonicalJson(terminal));
}

// Fresh independent role approvals must already be staged for this exact
// request/evidence. The writer authenticates both old and new quorum, checks
// service-clock quiescence, preserves old signed records and caps changes at 2.
// A supersession never reissues a merge or renews original landing authority.
export async function supersedeExpiredInterruptedPostmerge({oldRequest,request,recoveryRunId,ledger,get,verifyEvidence,now=()=>Date.now()}){
  const oldDigest=validateInterruptedRecoveryRequest(oldRequest,{now:now(),fresh:false});
  const newDigest=validateInterruptedRecoveryRequest(request,{now:now()});
  requireProof(run(recoveryRunId)&&recoveryRunId!==request.original_run_id&&typeof ledger?.read==='function'
    &&typeof ledger?.supersede==='function'&&typeof verifyEvidence==='function','SUPERSESSION_ADAPTER');
  requireProof(oldDigest!==newDigest&&Date.parse(oldRequest.expires_at)<=now()&&Date.parse(request.issued_at)>=Date.parse(oldRequest.expires_at),'SUPERSESSION_TIME');
  requireProof(fields.filter(k=>!['source_sha','issued_at','expires_at'].includes(k)).every(k=>eq(oldRequest[k],request[k])),'SUPERSESSION_ORIGINAL_IDENTITY');
  const context=await ledger.read({request:oldRequest,run_id:recoveryRunId});
  requireProof(context.state==='RESERVED'&&!context.terminal&&context.request_digest===oldDigest&&context.original_run_id===request.original_run_id
    &&Number.isSafeInteger(context.supersessions)&&context.supersessions>=0&&context.supersessions<2,'SUPERSESSION_CONTEXT');
  const native=await observeInterruptedRecoveryNative({request,get,now:now()});
  const evidence=await verifyEvidence({request,native});
  requireProof(evidence&&Object.keys(native).every(k=>eq(evidence[k],native[k]))&&Array.isArray(evidence.checks)&&evidence.checks.length===4,'EVIDENCE_BINDING');
  const evidenceDigest=sha256(canonicalJson(evidence));
  await observeInterruptedRecoveryNative({request,get,now:now()});
  validateInterruptedRecoveryRequest(request,{now:now()});
  let response;
  try {response=await ledger.supersede({request,run_id:recoveryRunId,expected_old_request_digest:oldDigest,evidence_digest:evidenceDigest});}
  catch(error){
    // Reconcile a potentially completed CAS by reading the new exact pin;
    // never repeat an ambiguous supersession RPC or alter the old request.
    const after=await ledger.read({request,run_id:recoveryRunId});
    requireProof(after.state==='RESERVED'&&!after.terminal&&after.request_digest===newDigest&&after.evidence_digest===evidenceDigest
      &&after.original_run_id===request.original_run_id&&after.supersessions===context.supersessions+1,'SUPERSESSION_UNKNOWN_NO_RETRY');
    response={state:'POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY',...after};
    response.state='POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY';
  }
  requireProof(response.state==='POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY'&&response.request_digest===newDigest
    &&response.evidence_digest===evidenceDigest&&response.original_run_id===request.original_run_id
    &&response.supersessions===context.supersessions+1,'SUPERSESSION_READBACK');
  return {...response,original_landing_authority_renewed:false,merge_performed:false,...HOLD};
}

// Adapters must perform signature verification themselves. read/claim/consume
// map to the protected merged-only writer; immutable.seal reconciles a fixed
// if-none-match object and verifies version/body/checksum/COMPLIANCE/KMS.
export async function resumeInterruptedPostmerge({request,recoveryRunId,ledger,get,verifyEvidence,immutable,now=()=>Date.now()}){
  requireProof(run(recoveryRunId)&&recoveryRunId!==request?.original_run_id,'RECOVERY_RUN');
  for(const method of ['read','claim','consume','acknowledge'])requireProof(typeof ledger?.[method]==='function','LEDGER_ADAPTER');
  requireProof(typeof verifyEvidence==='function'&&typeof immutable?.seal==='function','PROOF_ADAPTER');
  const requestDigest=validateInterruptedRecoveryRequest(request,{now:now(),fresh:false});
  const context=await ledger.read({request,run_id:recoveryRunId});
  requireProof(context.request_digest===requestDigest&&context.original_run_id===request.original_run_id,'CONTEXT_BINDING');
  let terminal=context.terminal;
  if(context.state==='RESERVED'){
    validateInterruptedRecoveryRequest(request,{now:now()});
    const native=await observeInterruptedRecoveryNative({request,get,now:now()});
    const evidence=await verifyEvidence({request,native});
    requireProof(evidence&&Object.keys(native).every(k=>eq(evidence[k],native[k]))&&Array.isArray(evidence.checks)&&evidence.checks.length===4,'EVIDENCE_BINDING');
    const lease=await ledger.claim({request,run_id:recoveryRunId,expected_revision:context.revision,lease_seconds:120});
    requireProof(lease.state==='TERMINAL_RECOVERY_LEASE_ONLY'&&lease.original_run_id===request.original_run_id
      &&Number.isSafeInteger(lease.revision)&&lease.revision===context.revision+1,'LEASE_BINDING');
    // The old lease holder cannot consume after CAS replacement. Reobserve
    // current native main/merge immediately before the signed conditional RPC.
    await observeInterruptedRecoveryNative({request,get,now:now()});
    validateInterruptedRecoveryRequest(request,{now:now()});
    terminal={id:'kidults-interrupted-reservation-terminal-v1',state:'VERIFIED_PASS',request_digest:requestDigest,
      evidence_digest:sha256(canonicalJson(evidence)),recovery_run_id:recoveryRunId,revision:lease.revision,merge_sha:request.merge_sha,head_sha:request.head_sha,...HOLD};
    try {
      const consumed=await ledger.consume({request,run_id:recoveryRunId,revision:lease.revision,terminal});
      requireProof(consumed.state==='CONSUMED'&&consumed.terminal_digest===sha256(canonicalJson(terminal)),'CONSUME_BINDING');
    } catch(error) {
      // An uncertain RPC is never repeated. Only consistent authenticated
      // readback of the exact persisted body can settle the outcome.
      const reconciled=await ledger.read({request,run_id:recoveryRunId});
      requireProof(reconciled.state==='CONSUMED'&&reconciled.request_digest===requestDigest&&eq(reconciled.terminal,terminal),'CONSUME_UNKNOWN_NO_RETRY');
    }
  } else requireProof(context.state==='CONSUMED'&&terminal,'RESERVATION_STATE');
  validateInterruptedRecoveryTerminal(terminal,request);
  // Consumed history grants only sealing of its immutable stored terminal,
  // even when the original request expired. No fresh approval or lease.
  const object=await immutable.seal({request,terminal,key:interruptedRecoveryObjectKey(request),if_none_match:'*'});
  requireProof(object.key===interruptedRecoveryObjectKey(request)&&object.sha256===sha256(canonicalJson(terminal)),'IMMUTABLE_BINDING');
  const ack=await ledger.acknowledge({request,run_id:recoveryRunId,object});
  requireProof(ack.state==='IMMUTABLE_ACKNOWLEDGED','IMMUTABLE_ACK');
  return {state:'ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE',original_run_id:request.original_run_id,
    recovery_execution_run_id:terminal.recovery_run_id,terminal_digest:object.sha256,immutable:object,
    merge_performed:false,authority_renewed:false,promotion_eligible:false,...HOLD};
}
