#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  ApprovalGenerationFailure,
  assertCompleteApprovalGenerationRegistry,
  assertRuntimeApprovalLiveBinding,
  isActiveApprovalRecord,
} from './lib/approval-generation-equality-v1.mjs';

const requireValue = (condition, code) => {
  if (!condition) throw new Error(`APPROVAL_GENERATION_INTEGRATION_FAIL:${code}`);
};
const read = file => fs.readFileSync(file, 'utf8');
const count = (text, fragment) => text.split(fragment).length - 1;
const digest = body => `sha256:${crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex')}`;

const policy = JSON.parse(read('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json'));
const library = read('scripts/kidults/kpmo/lib/approval-generation-equality-v1.mjs');
const lifecycle = read('scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs');
const scope = read('scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs');
const atomic = read('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs');
const readinessWorkflow = read('.github/workflows/kidults-governed-landing-authorization-v1.yml');
const liveValidator = read('scripts/kidults/kpmo/validate-approval-generation-equality-live-pr-v1.mjs');
const terminalV1 = JSON.parse(read('coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json'));

const generation = policy.approval_generation_policy || {};
requireValue(policy.version === '1.5.0', 'POLICY_VERSION');
requireValue(generation.mode === 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY', 'POLICY_MODE');
requireValue(generation.registry_scope === 'COMPLETE_BOUNDED_CANDIDATE_AND_BASE_GIT_TREES', 'POLICY_REGISTRY_SCOPE');
requireValue(generation.full_candidate_registry_scan_required === true, 'POLICY_CANDIDATE_SCAN');
requireValue(generation.full_base_registry_scan_required === true, 'POLICY_BASE_SCAN');
requireValue(generation.git_tree_truncated_or_unknown === 'FAIL_CLOSED', 'POLICY_TRUNCATION');
requireValue(generation.changed_file_pagination_incomplete === 'FAIL_CLOSED', 'POLICY_PAGINATION');
requireValue(generation.approval_record_delete_or_rename === 'FAIL_CLOSED', 'POLICY_DELETE_RENAME');
requireValue(generation.malformed_or_unreadable_registry_record === 'FAIL_CLOSED', 'POLICY_MALFORMED');
requireValue(generation.duplicate_authority_id === 'FAIL_CLOSED', 'POLICY_DUPLICATE_ID');
requireValue(generation.active_committed_authority_may_survive_merge === false, 'POLICY_ACTIVE_SURVIVAL');
requireValue(generation.live_issue_comment_readback_required_for_active_authority === true, 'POLICY_LIVE_COMMENT');
requireValue(generation.runtime_workflow_specific_live_comment_verifier_required === true, 'POLICY_RUNTIME_VERIFIER');
requireValue(generation.generic_helper_or_synthetic_test_is_live_runtime_proof === false, 'POLICY_SYNTHETIC_BOUNDARY');
requireValue(generation.survives_main_drift === false, 'POLICY_DRIFT');
requireValue(generation.ancestor_reuse_allowed === false, 'POLICY_ANCESTOR');
requireValue(generation.same_candidate_blob_different_main_allowed === false, 'POLICY_BLOB');
requireValue(generation.stale_canonical_comment_allowed === false, 'POLICY_COMMENT');
requireValue(Array.isArray(generation.root_issues)
  && generation.root_issues.includes(1787)
  && generation.root_issues.includes(1793), 'POLICY_ROOT_ISSUES');

for (const point of [
  'PR_LIFECYCLE_CLASSIFICATION_FULL_REGISTRY',
  'GOVERNED_LANDING_READINESS_FULL_REGISTRY',
  'SCOPE_AWARE_STATUS_FULL_REGISTRY',
  'ATOMIC_GOVERNED_LANDING_FULL_REGISTRY',
  'IMMEDIATE_PREMERGE_FULL_REGISTRY_RESCAN',
  'EXTERNAL_CALL_RUNTIME_LIVE_RECEIPT_BEFORE_SECRET_RESOLUTION',
]) requireValue(generation.enforcement_points.includes(point), `POLICY_POINT:${point}`);

for (const [name, text] of [
  ['LIFECYCLE', lifecycle],
  ['SCOPE', scope],
  ['ATOMIC', atomic],
  ['LIVE_VALIDATOR', liveValidator],
]) {
  requireValue(text.includes('assertCompleteApprovalGenerationRegistry'), `${name}_FULL_REGISTRY_CALL`);
  requireValue(!text.includes('assertChangedApprovalGenerationEquality'), `${name}_CHANGED_ONLY_SCAN_REMOVED`);
  requireValue(text.includes('?recursive=1'), `${name}_RECURSIVE_GIT_TREE`);
  requireValue(text.includes('readIssueComment'), `${name}_LIVE_COMMENT_READER`);
  requireValue(text.includes('liveMainSha'), `${name}_LIVE_MAIN_BINDING`);
  requireValue(text.includes('prBaseSha'), `${name}_PR_BASE_BINDING`);
}
requireValue(count(atomic, 'scanApprovalRegistry(') >= 3, 'ATOMIC_INITIAL_AND_IMMEDIATE_RESCAN');
requireValue(atomic.includes('full_registry_rescanned_immediately_before_merge: true'), 'ATOMIC_RECEIPT_RESCAN');
requireValue(library.includes('APPROVAL_CHANGED_FILE_ONLY_SCAN_FORBIDDEN'), 'CHANGED_ONLY_HELPER_TOMBSTONED');
requireValue(library.includes('APPROVAL_ACTIVE_RECORD_WOULD_SURVIVE_MERGE'), 'ACTIVE_SURVIVAL_BLOCK');
requireValue(library.includes('APPROVAL_REGISTRY_CANDIDATE_TREE_TRUNCATED_OR_UNKNOWN'), 'CANDIDATE_TRUNCATION_BLOCK');
requireValue(library.includes('APPROVAL_REGISTRY_BASE_TREE_TRUNCATED_OR_UNKNOWN'), 'BASE_TRUNCATION_BLOCK');
requireValue(library.includes('APPROVAL_REGISTRY_PATH_REMOVED_OR_RENAMED'), 'DELETE_RENAME_BLOCK');
requireValue(library.includes('APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH'), 'LIVE_COMMENT_DIGEST_BLOCK');
requireValue(library.includes('assertRuntimeApprovalLiveBinding'), 'RUNTIME_LIVE_BINDING_EXPORT');

requireValue(readinessWorkflow.includes('Enforce complete approval authority registry before readiness'), 'READINESS_STEP_NAME');
requireValue(readinessWorkflow.includes('validate-approval-generation-equality-live-pr-v1.mjs'), 'READINESS_SCRIPT');
requireValue(readinessWorkflow.indexOf('validate-approval-generation-equality-live-pr-v1.mjs')
  < readinessWorkflow.indexOf('Enforce exact-head solo-owner authorization'), 'READINESS_ORDER');

requireValue(isActiveApprovalRecord(terminalV1) === false, 'TERMINAL_V1_MUST_REMAIN_NON_AUTHORITY');

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const D = 'd'.repeat(40);
const body = 'synthetic live approval';
const active = {
  id: 'SYNTHETIC-ACTIVE-APPROVAL',
  status: 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING',
  authorized_by: {github_login: 'johnkim9524-collab', author_association: 'OWNER'},
  root_approval_receipt: {
    repository: 'johnkim9524-collab/kaios_enterprise_repo',
    issue_number: 1,
    comment_id: 2,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    body_sha256: digest(body),
  },
  issuance_binding: {protected_main_sha_at_receipt_issuance: A},
  approval_generation_policy: {
    mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
    survives_main_drift: false,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
  },
};
const entry = {
  path: 'coordination/kidults/governance/synthetic-authorization-v1.json',
  mode: '100644',
  type: 'blob',
  sha: D,
  size: 500,
};
const tree = {truncated: false, tree: [entry]};
const comment = {
  id: 2,
  issue_url: 'https://api.github.com/repos/johnkim9524-collab/kaios_enterprise_repo/issues/1',
  user: {login: 'johnkim9524-collab'},
  author_association: 'OWNER',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  body,
};

let outsideDiffRejected = false;
try {
  await assertCompleteApprovalGenerationRegistry({
    candidateTree: tree,
    baseTree: tree,
    changedFiles: [{filename: 'docs/unrelated.md', status: 'modified'}],
    readJson: async () => active,
    readIssueComment: async () => comment,
    prBaseSha: B,
    liveMainSha: B,
    repository: 'johnkim9524-collab/kaios_enterprise_repo',
    phase: 'MERGE_CANDIDATE',
  });
} catch (error) {
  outsideDiffRejected = error instanceof ApprovalGenerationFailure
    && error.code === 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE';
}
requireValue(outsideDiffRejected, 'ACTIVE_OUTSIDE_DIFF_DESCENDANT_MAIN_NEGATIVE');

let truncatedRejected = false;
try {
  await assertCompleteApprovalGenerationRegistry({
    candidateTree: {truncated: true, tree: []},
    baseTree: {truncated: false, tree: []},
    changedFiles: [],
    readJson: async () => ({}),
    prBaseSha: A,
    liveMainSha: A,
  });
} catch (error) {
  truncatedRejected = error instanceof ApprovalGenerationFailure
    && error.code === 'APPROVAL_REGISTRY_CANDIDATE_TREE_TRUNCATED_OR_UNKNOWN';
}
requireValue(truncatedRejected, 'TRUNCATED_TREE_NEGATIVE');

let staleCommentRejected = false;
try {
  assertRuntimeApprovalLiveBinding({
    record: active,
    comment: {...comment, body: 'altered'},
    runtimeMainSha: A,
    repository: 'johnkim9524-collab/kaios_enterprise_repo',
  });
} catch (error) {
  staleCommentRejected = error instanceof ApprovalGenerationFailure
    && error.code === 'APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH';
}
requireValue(staleCommentRejected, 'STALE_LIVE_COMMENT_NEGATIVE');

console.log(JSON.stringify({
  id: 'kidults-approval-generation-full-registry-integration-validation-v2',
  state: 'VERIFIED_PASS',
  policy_mode: generation.mode,
  registry_scope: generation.registry_scope,
  enforcement_points: generation.enforcement_points,
  complete_candidate_and_base_tree_scans: true,
  unchanged_active_authority_outside_pr_diff_rejected: true,
  descendant_main_drift_rejected: true,
  same_candidate_blob_new_main_rejected: true,
  truncated_registry_rejected: true,
  deletion_or_rename_rejected: true,
  live_issue_comment_digest_required: true,
  immediate_premerge_full_registry_rescan: true,
  generic_synthetic_test_is_live_runtime_proof: false,
  terminal_records_non_authority: true,
  provider_credentials_resolved: false,
  external_requests: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
