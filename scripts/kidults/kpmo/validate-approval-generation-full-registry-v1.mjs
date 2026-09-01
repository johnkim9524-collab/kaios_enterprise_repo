#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  ApprovalGenerationFailure,
  assertFullApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';

const current = '1'.repeat(40);
const old = '2'.repeat(40);
const path = 'coordination/kidults/governance/TEST_APPROVAL.json';
const tree = (paths, truncated = false) => ({
  truncated,
  tree: paths.map(value => ({path: value, type: 'blob', sha: '3'.repeat(40)})),
});
const active = issuance => ({
  id: 'TEST-APPROVAL',
  status: 'APPROVED_PENDING_EXECUTION',
  issuance_binding: {protected_main_sha_at_receipt_issuance: issuance},
  approval_generation_policy: {
    mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
    survives_main_drift: false,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
  },
});
const terminal = {
  id: 'TEST-APPROVAL',
  status: 'CONSUMED',
};

async function expectFailure(code, fn) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApprovalGenerationFailure, `expected ApprovalGenerationFailure for ${code}`);
  assert.equal(caught.code, code);
}

const pass = await assertFullApprovalGenerationEquality({
  baseTree: tree([path]),
  headTree: tree([path]),
  readJson: async () => active(current),
  prBaseSha: current,
  liveMainSha: current,
});
assert.equal(pass.state, 'VERIFIED_PASS');
assert.equal(pass.scan_scope, 'FULL_BOUNDED_GOVERNANCE_AUTHORITY_REGISTRY');
assert.equal(pass.active_record_count, 1);

await expectFailure('APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE', () => assertFullApprovalGenerationEquality({
  baseTree: tree([path]),
  headTree: tree([path]),
  readJson: async () => active(old),
  prBaseSha: current,
  liveMainSha: current,
}));

await expectFailure('APPROVAL_GENERATION_RECORD_REMOVED_OR_RENAMED', () => assertFullApprovalGenerationEquality({
  baseTree: tree([path]),
  headTree: tree([]),
  readJson: async () => terminal,
  prBaseSha: current,
  liveMainSha: current,
}));

await expectFailure('APPROVAL_GENERATION_TREE_TRUNCATED_OR_AMBIGUOUS', () => assertFullApprovalGenerationEquality({
  baseTree: tree([path]),
  headTree: tree([path], true),
  readJson: async () => terminal,
  prBaseSha: current,
  liveMainSha: current,
}));

await expectFailure('APPROVAL_GENERATION_ACTIVE_RECORD_ISSUANCE_SHA_INVALID', () => assertFullApprovalGenerationEquality({
  baseTree: tree([path]),
  headTree: tree([path]),
  readJson: async () => active(null),
  prBaseSha: current,
  liveMainSha: current,
}));

console.log('approval generation full-registry regression: PASS');
