import {canonicalJson, sha256} from './autonomous-internal-landing-v1.mjs';

// This bounded recovery contract does not grant credentials or merge authority.
// Adapters must authenticate GitHub evidence and signed ledger authority. No
// production adapter or automatic trigger is activated by this module.
export const POSTMERGE_RECOVERY_INCIDENT=Object.freeze({
  repository:'johnkim9524-collab/kaios_enterprise_repo',
  repository_id:'1281328888',
  pull_request:2555,
  original_generation:'pr-2555-6a88733e40fc42290053-12cede9977fcc0d7',
  original_run_id:'37123641239',
  original_base_sha:'c09474e218fb2220b58645f883f9ef3a1a4e957b',
  original_head_sha:'6a88733e40fc42290053f5a0cac7a0f2d9878776',
  original_tree_sha:'52785d48a1d71aa1ccb3cfc48d452469881a8cd4',
  original_merge_sha:'ad1bae34fd785cea4aecb00046ca0c5a7323b085',
  original_nonce_digest:'sha256:12cede9977fcc0d7319fb1aa015588d2edc0770c1ef9665dad93cee6ba7f50cc',
});
export const RECOVERY_ROLES=Object.freeze(['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER']);
const SHA=/^[0-9a-f]{40}$/;
const RUN=/^[1-9][0-9]{0,19}$/;
const fail=code=>{throw new Error(code);};
const assert=(condition,code)=>{if(!condition)fail(code);};
const hold=value=>assert(['production','public','g5'].every(key=>value?.[key]==='HOLD'),'RECOVERY_HOLD_BOUNDARY');
const equal=(left,right)=>canonicalJson(left)===canonicalJson(right);

export function buildPostmergeRecoveryRequest({sourceSha,issuedAt,expiresAt}){
  assert(SHA.test(sourceSha),'RECOVERY_SOURCE_SHA');
  const core={id:'kidults-postmerge-terminal-recovery-request-v1',version:'1.0.0',operation:'POSTMERGE_TERMINAL_RECOVERY_ONLY',
    ...POSTMERGE_RECOVERY_INCIDENT,source_sha:sourceSha,issued_at:issuedAt,expires_at:expiresAt,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...core,recovery_generation:`postmerge-2555-${sha256(canonicalJson(core)).slice(7,39)}`};
}

export function validatePostmergeRecoveryRequest(request,{now=Date.now(),requireFresh=true}={}){
  hold(request);
  const expected=buildPostmergeRecoveryRequest({sourceSha:request?.source_sha,issuedAt:request?.issued_at,expiresAt:request?.expires_at});
  assert(equal(request,expected),'RECOVERY_REQUEST_BINDING');
  for(const timestamp of [request.issued_at,request.expires_at]){
    assert(typeof timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)
      &&Number.isFinite(Date.parse(timestamp))
      &&new Date(timestamp).toISOString()===timestamp.replace(/(?<!\.\d{3})Z$/,'.000Z'),'RECOVERY_TIMESTAMP');
  }
  const issued=Date.parse(request.issued_at),expires=Date.parse(request.expires_at);
  assert(Number.isFinite(issued)&&Number.isFinite(expires)&&expires>issued&&expires-issued<=1800000,'RECOVERY_REQUEST_LIFETIME');
  if(requireFresh)assert(issued<=now&&now<expires,'RECOVERY_AUTHORITY_EXPIRED');
  return {request_digest:sha256(canonicalJson(request)),recovery_generation:request.recovery_generation};
}

export function validatePostmergeRecoveryObservation(observed,request,{consumed=false}={}){
  const incident=POSTMERGE_RECOVERY_INCIDENT;
  assert(observed?.repository===incident.repository&&String(observed.repository_id)===incident.repository_id,'RECOVERY_REPOSITORY');
  const original=observed.original_run;
  assert(String(original?.id)===incident.original_run_id&&original.status==='completed'&&original.conclusion==='cancelled'
    &&original.run_attempt===1&&original.event==='repository_dispatch'&&original.head_sha===incident.original_base_sha
    &&original.path==='.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml','RECOVERY_ORIGINAL_RUN_NOT_FENCED');
  const pr=observed.pull_request;
  assert(pr?.number===incident.pull_request&&pr.merged===true&&pr.merge_commit_sha===incident.original_merge_sha
    &&pr.head?.sha===incident.original_head_sha&&pr.base?.sha===incident.original_base_sha,'RECOVERY_MERGED_PR_BINDING');
  const commit=observed.merge_commit;
  assert(commit?.sha===incident.original_merge_sha&&commit.tree?.sha===incident.original_tree_sha
    &&equal(commit.parents?.map(parent=>parent.sha),[incident.original_base_sha,incident.original_head_sha]),'RECOVERY_MERGE_TREE_OR_PARENT_DRIFT');
  assert(SHA.test(observed.main_sha),'RECOVERY_MAIN_IDENTITY');
  const comparison=observed.original_merge_to_main;
  assert(comparison?.base_commit?.sha===incident.original_merge_sha&&comparison.head_sha===observed.main_sha
    &&['ahead','identical'].includes(comparison.status)&&comparison.behind_by===0
    &&comparison.merge_base_commit?.sha===incident.original_merge_sha,'RECOVERY_MAIN_NOT_DESCENDANT');
  if(!consumed)assert(observed.main_sha===request.source_sha,'RECOVERY_SOURCE_DRIFT');
  else if(observed.main_sha!==request.source_sha){
    const next=observed.recovery_source_to_main;
    assert(next?.base_commit?.sha===request.source_sha&&next.head_sha===observed.main_sha&&next.status==='ahead'
      &&next.behind_by===0&&next.merge_base_commit?.sha===request.source_sha,'RECOVERY_CONSUMED_HISTORY_NOT_DESCENDANT');
  }
  const reservation=observed.reservation;
  assert(reservation?.authorization_generation===incident.original_generation&&reservation.nonce_digest===incident.original_nonce_digest
    &&reservation.run_id===incident.original_run_id&&reservation.head_sha===incident.original_head_sha,'RECOVERY_RESERVATION_BINDING');
  assert(reservation.state===(consumed?'CONSUMED':'RESERVED'),'RECOVERY_RESERVATION_STATE');
  return {state:'RECOVERY_OBSERVATION_VALIDATED',scope:'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY',grants_authority:false};
}

// Authenticated adapter evidence is mandatory. This checks its exact scope; it
// deliberately cannot turn a caller assertion into a cryptographic approval.
export function validatePostmergeRecoveryQuorum(authority,request,{now=Date.now()}={}){
  const bound=validatePostmergeRecoveryRequest(request,{now});
  assert(authority?.backend==='AUTHENTICATED_SIGNED_LEDGER_V1'&&authority.operation===request.operation
    &&authority.request_digest===bound.request_digest&&authority.recovery_generation===request.recovery_generation,'RECOVERY_AUTHORITY_BINDING');
  assert(Array.isArray(authority.roles)&&authority.roles.length===3,'RECOVERY_THREE_ROLE_QUORUM');
  assert(equal(authority.roles.map(role=>role.role).sort(),[...RECOVERY_ROLES].sort()),'RECOVERY_ROLE_SET');
  assert(new Set(authority.roles.map(role=>role.workload_id)).size===3&&new Set(authority.roles.map(role=>role.signing_key_arn)).size===3,'RECOVERY_SIGNER_COLLISION');
  for(const role of authority.roles){
    assert(role.signature_verified_by_ledger===true&&role.request_digest===bound.request_digest
      &&role.expires_at===request.expires_at&&typeof role.workload_id==='string'&&role.workload_id.length>0
      &&typeof role.signing_key_arn==='string'&&role.signing_key_arn.length>0,'RECOVERY_ROLE_BINDING');
  }
  return bound;
}

export function buildPostmergeRecoveryTerminal({request,recoveryRunId,evidence}){
  assert(RUN.test(String(recoveryRunId))&&String(recoveryRunId)!==POSTMERGE_RECOVERY_INCIDENT.original_run_id,'RECOVERY_RUN_ID');hold(evidence);
  assert(evidence.state==='VERIFIED_PASS'&&evidence.source_sha===request.source_sha&&evidence.push_suite?.state==='VERIFIED_PASS'
    &&evidence.canonical_truth?.state==='VERIFIED_PASS'&&evidence.sentinel?.state==='VERIFIED_PASS'
    &&evidence.success_authority_gate?.state==='VERIFIED_PASS','RECOVERY_EXACT_MAIN_EVIDENCE');
  for(const key of ['push_suite','canonical_truth','sentinel','success_authority_gate']){
    const node=evidence[key];hold(node);
    assert(node.source_sha===request.source_sha&&RUN.test(String(node.run_id))&&/^sha256:[0-9a-f]{64}$/.test(node.receipt_digest),'RECOVERY_EVIDENCE_IDENTITY');
  }
  assert(evidence.push_suite.required_success_count===6&&evidence.push_suite.required_failure_count===0,'RECOVERY_PUSH_SUITE');
  assert(Array.isArray(evidence.sentinel.producers)&&evidence.sentinel.producers.length===4
    &&equal(evidence.sentinel.producers.map(node=>node.id).sort(),['CANONICAL_TRUTH','REQUIREMENT','RESERVE','SHADOW'])
    &&evidence.sentinel.producers.every(node=>node.state==='VERIFIED_PASS')
    &&equal(evidence.sentinel.failed_producers,[])&&equal(evidence.sentinel.waiting_producers,[]),'RECOVERY_SENTINEL_CORE_FOUR');
  const core={id:'kidults-postmerge-terminal-recovery-receipt-v1',version:'1.0.0',state:'RECOVERED_CONSUMED_TERMINAL',
    proof_scope:'ORIGINAL_LANDING_TERMINAL_RECOVERY_ONLY_NOT_WHOLE_PLATFORM',request,
    original_reservation_owner_run_id:POSTMERGE_RECOVERY_INCIDENT.original_run_id,recovery_run_id:String(recoveryRunId),
    exact_recovery_main_sha:request.source_sha,original_merge_sha:POSTMERGE_RECOVERY_INCIDENT.original_merge_sha,
    evidence,reservation_state:'CONSUMED',merge_performed:false,authority_renewed:false,promotion_eligible:false,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...core,receipt_digest:sha256(canonicalJson(core))};
}

export function validateStoredRecoveryTerminal(terminal,request){
  hold(terminal);
  assert(terminal?.id==='kidults-postmerge-terminal-recovery-receipt-v1'&&terminal.state==='RECOVERED_CONSUMED_TERMINAL'
    &&terminal.original_reservation_owner_run_id===POSTMERGE_RECOVERY_INCIDENT.original_run_id
    &&terminal.original_merge_sha===POSTMERGE_RECOVERY_INCIDENT.original_merge_sha&&terminal.exact_recovery_main_sha===request.source_sha
    &&terminal.reservation_state==='CONSUMED'&&terminal.merge_performed===false&&terminal.authority_renewed===false
    &&terminal.promotion_eligible===false&&equal(terminal.request,request),'RECOVERY_STORED_TERMINAL_BINDING');
  const {receipt_digest,...core}=terminal;assert(receipt_digest===sha256(canonicalJson(core)),'RECOVERY_TERMINAL_DIGEST');
  const expected=buildPostmergeRecoveryTerminal({request,recoveryRunId:terminal.recovery_run_id,evidence:terminal.evidence});
  assert(equal(expected,terminal),'RECOVERY_TERMINAL_FIELD_SET');
  return terminal;
}

export const recoveryObjectKey=request=>`receipts/${request.original_generation}/postmerge-recovery-v1/${request.original_merge_sha}.json`;

export async function runPostmergeTerminalRecovery({request,recoveryRunId,adapter,now=()=>Date.now()}){
  // Only these bounded operations exist; the engine has no merge/token broker,
  // Ready, status-authorization, deployment, or workflow-dispatch operation.
  for(const method of ['observe','readAuthority','verifyExactMainEvidence','consumeOnce','readImmutable','sealIfAbsent','acknowledgeImmutable'])
    assert(typeof adapter?.[method]==='function',`RECOVERY_ADAPTER_REQUIRED:${method}`);
  let observed=await adapter.observe(request);
  const consumed=observed?.reservation?.state==='CONSUMED';
  validatePostmergeRecoveryRequest(request,{now:now(),requireFresh:!consumed});
  validatePostmergeRecoveryObservation(observed,request,{consumed});
  let terminal;
  if(!consumed){
    validatePostmergeRecoveryQuorum(await adapter.readAuthority(request),request,{now:now()});
    const evidence=await adapter.verifyExactMainEvidence(request);
    terminal=buildPostmergeRecoveryTerminal({request,recoveryRunId,evidence});
    // Reconcile immediately before the one irreversible reservation transition.
    observed=await adapter.observe(request);
    validatePostmergeRecoveryRequest(request,{now:now()});
    validatePostmergeRecoveryObservation(observed,request);
    await adapter.consumeOnce({request,recoveryRunId:String(recoveryRunId),terminal,
      expected_original_run_id:request.original_run_id,expected_original_head_sha:request.original_head_sha,
      expected_state:'RESERVED',preserve_original_owner:true});
    observed=await adapter.observe(request);
    validatePostmergeRecoveryObservation(observed,request,{consumed:true});
    assert(observed.reservation.recovery_run_id===String(recoveryRunId),'RECOVERY_CONSUME_WINNER');
    assert(equal(observed.reservation.recovery_terminal,terminal),'RECOVERY_CONSUME_READBACK');
  }else{
    // Continue only the exact payload durably approved and consumed earlier.
    // No fresh approval generation and no second reservation consumption.
    terminal=validateStoredRecoveryTerminal(observed.reservation.recovery_terminal,request);
    assert(observed.reservation.recovery_run_id===terminal.recovery_run_id,'RECOVERY_RECORDED_WINNER');
  }
  const key=recoveryObjectKey(request);
  let immutable=await adapter.readImmutable({key,terminal});
  if(immutable===null){
    immutable=await adapter.sealIfAbsent({key,terminal,if_none_match:'*',object_lock_mode:'COMPLIANCE',retention_years:10});
    // The write result is insufficient: verify the stored immutable version.
    const readback=await adapter.readImmutable({key,terminal,version_id:immutable?.version_id});
    assert(readback!==null,'RECOVERY_IMMUTABLE_READBACK_MISSING');immutable=readback;
  }
  assert(immutable?.state==='OBJECT_LOCK_COMPLIANCE_VERIFIED'&&immutable.key===key
    &&typeof immutable.version_id==='string'&&immutable.version_id.length>0
    &&immutable.receipt_digest===terminal.receipt_digest&&immutable.object_lock_mode==='COMPLIANCE'
    &&immutable.checksum_verified===true&&immutable.retention_verified===true&&immutable.encryption_verified===true,'RECOVERY_IMMUTABLE_BINDING');
  await adapter.acknowledgeImmutable({request,terminal,immutable});
  return {state:'FINALIZER_TERMINAL_RECOVERY_VERIFIED',terminal,immutable,merge_performed:false,
    authority_renewed:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
