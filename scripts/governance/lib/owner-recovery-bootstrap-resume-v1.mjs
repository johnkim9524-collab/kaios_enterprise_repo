// Internal composition guard, not an RPC authority or self-approved exception.
// approval, ready and oneUse are outputs of the protected controller's native
// validators. Keep their validation and GREEN/ruleset gates before this call.
import {createHash} from 'node:crypto';
export function validateOwnerRecoveryBootstrapResume({policy,purpose,repository,actor,executionRef,
  approval,ready,rawApproval,rawReady,oneUse,runId,runAttempt,handoffWindowSeconds}) {
  const fail=code=>{throw new Error(`OWNER_RECOVERY_BOOTSTRAP_${code}`);};
  const route=policy?.owner_recovery_bootstrap;
  const expected={scope:'EXACT_HEAD_OWNER_AUTHORIZED_RESUME_LEDGER_BOOTSTRAP_ONLY',purpose:'RESUME_LEDGER_BOOTSTRAP',
    normal_operation_allowed:false,external_operation_ledger_required:false,native_recovery_controller_required:true,
    controller_workflow:'.github/workflows/kidults-direct-owner-landing-handoff-v1.yml',controller_source:'EXACT_PROTECTED_MAIN',
    owner_exact_base_head_tree_approval_required:true,native_owner_ready_and_immutable_comment_required:true,
    one_matching_dispatch_first_attempt_only:true,maximum_handoff_window_seconds:900,completed_stage_reuse_required:true,
    ambiguity:'HOLD_NO_REISSUE',postmerge_exact_sha_suite_required:true,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',
    credential_or_iam_expansion_allowed:false,ruleset_bypass_allowed:false,cross_system_exactly_once_claimed:false,
    grants_new_owner_authority:false,policy_activation_requires_exact_head_owner_decision:true};
  if(!route || Object.keys(route).length!==Object.keys(expected).length+1
    || Object.entries(expected).some(([k,v])=>route[k]!==v)
    || JSON.stringify(route.allowed_operations)!==JSON.stringify(['READY_FOR_REVIEW','OWNER_APPROVAL_COMMENT','WORKFLOW_DISPATCH','MERGE_PROTECTED_MAIN'])) fail('POLICY');
  if(purpose!==route.purpose || !/^[^/]+\/[^/]+$/.test(repository || '') || actor!==repository.split('/')[0]
    || executionRef!=='refs/heads/main' || runAttempt!==1 || !Number.isSafeInteger(Number(runId)) || Number(runId)<1) fail('ACTOR_OR_SOURCE');
  if(!approval || approval.actor!==actor || !Number.isSafeInteger(approval.comment_id) || approval.comment_id<1
    || !/^sha256:[a-f0-9]{64}$/.test(approval.comment_body_sha256 || '')
    || !ready || ready.actor!==actor || ready.direct_repository_owner!==true
    || ready.performed_via_github_app!==null || ready.synthetic_lifecycle_boundary===true) fail('NATIVE_OWNER_EVIDENCE');
  // Normalized selectors cannot establish absence of app involvement: missing
  // fields may have been normalized to null. Bind strict original API evidence.
  if(!rawReady || rawReady.id!==ready.id || rawReady.event!=='ready_for_review'
    || rawReady.actor?.login!==actor || rawReady.actor?.type!=='User'
    || rawReady.performed_via_github_app!==null || !ready.created_at
    || rawReady.created_at!==ready.created_at
    || !rawApproval || rawApproval.id!==approval.comment_id
    || rawApproval.user?.login!==actor || rawApproval.user?.type!=='User'
    || rawApproval.author_association!=='OWNER' || rawApproval.performed_via_github_app!==null
    || !approval.comment_created_at || rawApproval.created_at!==approval.comment_created_at
    || rawApproval.updated_at!==rawApproval.created_at || typeof rawApproval.body!=='string'
    || 'sha256:'+createHash('sha256').update(rawApproval.body,'utf8').digest('hex')!==approval.comment_body_sha256) fail('RAW_NATIVE_OWNER_EVIDENCE');
  if(!oneUse || oneUse.matching_run_count!==1 || oneUse.matching_run_id!==Number(runId)
    || oneUse.matching_run_attempt!==1 || oneUse.bounded_attempt_ordinal!==1
    || oneUse.prior_non_success_attempt_count!==0) fail('ONE_USE');
  if(!Number.isInteger(handoffWindowSeconds) || handoffWindowSeconds<60 || handoffWindowSeconds>900) fail('WINDOW');
  return {state:'OWNER_RECOVERY_BOOTSTRAP_ROUTE_VERIFIED',purpose,
    external_ledger_proven:false,normal_operations_proven:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
