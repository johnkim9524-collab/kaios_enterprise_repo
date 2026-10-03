// Workload composition only. No CLI, trigger, deployment or credential minting.
import {canonicalJson} from './autonomous-internal-landing-v1.mjs';
import {RECOVERY_ROLES,validatePostmergeRecoveryRequest,validatePostmergeRecoveryObservation,
  validateRecoveryEvidenceSnapshot,runPostmergeTerminalRecovery} from './autonomous-postmerge-recovery-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const equal=(a,b)=>canonicalJson(a)===canonicalJson(b);

export function createRecoveryWorkload({role,ledger,github,evidence,immutable,now=()=>Date.now()}){
  assert(RECOVERY_ROLES.includes(role)||role==='FINALIZER','RECOVERY_WORKLOAD_ROLE');
  for(const [component,methods] of [[ledger,['readContext']],[github,['observe']],
    [evidence,['verifySnapshot']]])for(const method of methods)
    assert(typeof component?.[method]==='function',`RECOVERY_WORKLOAD_COMPONENT:${method}`);
  const observe=async request=>github.observe(request,await ledger.readContext(request));
  const approvePinned=async({request,snapshot})=>{
    assert(role!=='FINALIZER','RECOVERY_WORKLOAD_APPROVAL_ROLE');
    validatePostmergeRecoveryRequest(request,{now:now()});
    validateRecoveryEvidenceSnapshot(snapshot,request,{now:now()});
    const observed=await observe(request);
    validatePostmergeRecoveryObservation(observed,request);
    const reservation=observed.reservation;
    if(reservation.recovery_request)assert(equal(reservation.recovery_request,request),'RECOVERY_WORKLOAD_REQUEST_CONFLICT');
    if(reservation.recovery_snapshot)assert(equal(reservation.recovery_snapshot,snapshot),'RECOVERY_WORKLOAD_SNAPSHOT_CONFLICT');
    const verified=await evidence.verifySnapshot(request,snapshot);
    assert(equal(verified,snapshot),'RECOVERY_WORKLOAD_VERIFIED_SNAPSHOT_DRIFT');
    // A fresh observation immediately precedes signing. Never silently select a
    // replacement snapshot or generation when a pinned one becomes stale.
    validatePostmergeRecoveryRequest(request,{now:now()});
    validatePostmergeRecoveryObservation(await observe(request),request);
    return ledger.createApproval({request,snapshot});
  };
  const finalizePinned=async({request,recoveryRunId})=>{
    assert(role==='FINALIZER','RECOVERY_WORKLOAD_FINALIZER_ROLE');
    for(const method of ['readImmutable','sealIfAbsent'])assert(typeof immutable?.[method]==='function',`RECOVERY_WORKLOAD_COMPONENT:${method}`);
    const adapter={observe,readAuthority:r=>ledger.readAuthority(r),consumeOnce:i=>ledger.consumeOnce(i),
      readImmutable:i=>immutable.readImmutable(i),sealIfAbsent:i=>immutable.sealIfAbsent(i),
      acknowledgeImmutable:i=>ledger.acknowledgeImmutable(i),
      verifyExactMainEvidence:async r=>{
        const context=await ledger.readContext(r);
        assert(context.recovery_request&&equal(context.recovery_request,r),'RECOVERY_WORKLOAD_PINNED_REQUEST_REQUIRED');
        assert(context.recovery_snapshot,'RECOVERY_WORKLOAD_PINNED_SNAPSHOT_REQUIRED');
        validateRecoveryEvidenceSnapshot(context.recovery_snapshot,r,{now:now()});
        const verified=await evidence.verifySnapshot(r,context.recovery_snapshot);
        assert(equal(verified,context.recovery_snapshot),'RECOVERY_WORKLOAD_VERIFIED_SNAPSHOT_DRIFT');
        return verified.evidence;
      }};
    // The engine reuses a durably consumed terminal after expiry. That path
    // never invokes evidence selection, fresh approval or reservation consume.
    return runPostmergeTerminalRecovery({request,recoveryRunId,adapter,now});
  };
  return {approvePinned,finalizePinned};
}
