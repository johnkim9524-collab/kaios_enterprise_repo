import {createHash} from 'node:crypto';

const shaPattern = /^[a-f0-9]{40}$/;
const fail = code => {throw new Error(`DEVELOPMENT_RESUME_${code}`);};
export function validateDevelopmentBranchResume({policy, branch, expectedHead, liveHead, parentSha,
  payload, payloadDigest, authorized, bootstrapVerified, force = false, operation = 'CODE_UPDATE'}) {
  const route = policy?.development_branch_resume;
  if (!route || route.scope !== 'EXPLICITLY_AUTHORIZED_REVERSIBLE_DEVELOPMENT_BRANCH_CODE_OR_POLICY_CORRECTION'
    || route.protected_operation_ledger_required !== false
    || route.fresh_exact_head_bootstrap_required !== true
    || route.live_head_reconciliation_required !== true
    || route.exact_parent_and_payload_digest_required !== true
    || route.expected_head_non_forced_update_required !== true
    || route.durable_change_record !== 'GIT_COMMIT_HISTORY'
    || route.ambiguous_or_rejected_write !== 'RECONCILE_NO_BLIND_RETRY'
    || route.main_write_merge_approval_dispatch_deploy_generation_reservation_promotion_allowed !== false
    || route.grants_new_authority !== false) fail('POLICY');
  if (authorized !== true || bootstrapVerified !== true) fail('AUTHORITY_OR_BOOTSTRAP');
  if (operation !== 'CODE_UPDATE' || force !== false) fail('OPERATION');
  if (typeof branch !== 'string' || !branch.startsWith('codex/') || /[\s~^:?*\[\\]/.test(branch)
    || branch.includes('..') || branch.endsWith('/') || branch.endsWith('.lock')) fail('BRANCH');
  if (!shaPattern.test(expectedHead || '') || expectedHead !== liveHead || parentSha !== expectedHead) fail('HEAD_DRIFT');
  if (typeof payload !== 'string' || !payload.length
    || payloadDigest !== `sha256:${createHash('sha256').update(payload).digest('hex')}`) fail('PAYLOAD');
  return {state: 'DEVELOPMENT_UPDATE_PRECONDITIONS_VERIFIED', branch, expectedHead,
    payloadDigest, protected_landing_authority: false, production: 'HOLD', public: 'HOLD', g5: 'HOLD'};
}
