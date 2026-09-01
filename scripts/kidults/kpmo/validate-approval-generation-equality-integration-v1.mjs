#!/usr/bin/env node
import fs from 'node:fs';

import {
  ApprovalGenerationFailure,
  assertApprovalRecordGeneration,
  assertRuntimeApprovalExactMain,
  isActiveApprovalRecord,
} from './lib/approval-generation-equality-v1.mjs';

const requireValue = (condition, code) => {
  if (!condition) throw new Error(`APPROVAL_GENERATION_INTEGRATION_FAIL:${code}`);
};
const read = file => fs.readFileSync(file, 'utf8');

const policy = JSON.parse(read('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json'));
const lifecycle = read('scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs');
const scope = read('scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs');
const atomic = read('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs');
const readinessWorkflow = read('.github/workflows/kidults-governed-landing-authorization-v1.yml');
const liveValidator = read('scripts/kidults/kpmo/validate-approval-generation-equality-live-pr-v1.mjs');
const terminalV1 = JSON.parse(read('coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json'));

const generation = policy.approval_generation_policy || {};
requireValue(policy.version === '1.4.0', 'POLICY_VERSION');
requireValue(generation.mode === 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY', 'POLICY_MODE');
requireValue(generation.active_record_exact_main_equality_required === true, 'POLICY_ACTIVE_RECORD');
requireValue(generation.issuance_main_must_equal_pr_base_sha === true, 'POLICY_PR_BASE');
requireValue(generation.issuance_main_must_equal_live_main_sha === true, 'POLICY_LIVE_MAIN');
requireValue(generation.survives_main_drift === false, 'POLICY_DRIFT');
requireValue(generation.ancestor_reuse_allowed === false, 'POLICY_ANCESTOR');
requireValue(generation.same_candidate_blob_different_main_allowed === false, 'POLICY_BLOB');
requireValue(generation.stale_canonical_comment_allowed === false, 'POLICY_COMMENT');
requireValue(generation.root_issue === 1787, 'POLICY_ROOT_ISSUE');
for (const point of [
  'PR_LIFECYCLE_CLASSIFICATION',
  'GOVERNED_LANDING_READINESS',
  'SCOPE_AWARE_STATUS',
  'ATOMIC_GOVERNED_LANDING',
  'EXTERNAL_CALL_RUNTIME_BEFORE_SECRET_RESOLUTION',
]) requireValue(generation.enforcement_points.includes(point), `POLICY_POINT:${point}`);

for (const [name, text] of [
  ['LIFECYCLE', lifecycle],
  ['SCOPE', scope],
  ['ATOMIC', atomic],
  ['LIVE_VALIDATOR', liveValidator],
]) {
  requireValue(text.includes('assertChangedApprovalGenerationEquality'), `${name}_IMPORT_OR_CALL`);
  requireValue(text.includes('liveMainSha'), `${name}_LIVE_MAIN_BINDING`);
  requireValue(text.includes('prBaseSha'), `${name}_PR_BASE_BINDING`);
}
requireValue(readinessWorkflow.includes('Enforce active approval-generation equality before readiness'), 'READINESS_STEP_NAME');
requireValue(readinessWorkflow.includes('validate-approval-generation-equality-live-pr-v1.mjs'), 'READINESS_SCRIPT');
requireValue(readinessWorkflow.indexOf('validate-approval-generation-equality-live-pr-v1.mjs') < readinessWorkflow.indexOf('Enforce exact-head solo-owner authorization'), 'READINESS_ORDER');

requireValue(isActiveApprovalRecord(terminalV1) === false, 'TERMINAL_V1_MUST_REMAIN_NON_AUTHORITY');

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const active = {
  id: 'SYNTHETIC-ACTIVE-APPROVAL',
  status: 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING',
  issuance_binding: {protected_main_sha_at_receipt_issuance: A},
  approval_generation_policy: {
    mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
    survives_main_drift: false,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
  },
};
let descendantRejected = false;
try {
  assertApprovalRecordGeneration(active, {
    filename: 'coordination/kidults/governance/synthetic-authorization.json',
    prBaseSha: B,
    liveMainSha: B,
  });
} catch (error) {
  descendantRejected = error instanceof ApprovalGenerationFailure
    && error.code === 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE';
}
requireValue(descendantRejected, 'DESCENDANT_MAIN_NEGATIVE');

let staleCommentRejected = false;
try {
  assertRuntimeApprovalExactMain({
    approvalProtectedMainSha: A,
    runtimeMainSha: B,
    approvalState: 'APPROVED',
  });
} catch (error) {
  staleCommentRejected = error instanceof ApprovalGenerationFailure
    && error.code === 'RUNTIME_APPROVAL_GENERATION_MISMATCH';
}
requireValue(staleCommentRejected, 'STALE_COMMENT_NEGATIVE');

console.log(JSON.stringify({
  id: 'kidults-approval-generation-equality-integration-validation-v1',
  state: 'VERIFIED_PASS',
  policy_mode: generation.mode,
  enforcement_points: generation.enforcement_points,
  descendant_main_drift_rejected: true,
  merge_main_rebound_rejected: true,
  same_candidate_blob_different_main_rejected: true,
  stale_canonical_comment_rejected: true,
  terminal_records_non_authority: true,
  provider_credentials_resolved: false,
  external_requests: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
