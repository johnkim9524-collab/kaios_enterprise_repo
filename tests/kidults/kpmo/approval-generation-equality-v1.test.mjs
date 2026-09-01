import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApprovalGenerationFailure,
  assertApprovalRecordGeneration,
  assertFullApprovalGenerationEquality,
  assertRuntimeApprovalExactMain,
  isActiveApprovalRecord,
} from '../../../scripts/kidults/kpmo/lib/approval-generation-equality-v1.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const filename = 'coordination/kidults/governance/example-authorization-v1.json';

function activeRecord(main = A) {
  return {
    id: 'EXAMPLE-APPROVAL-1',
    status: 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING',
    issuance_binding: {
      protected_main_sha_at_receipt_issuance: main,
    },
    approval_generation_policy: {
      mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
      survives_main_drift: false,
      ancestor_reuse_allowed: false,
      same_candidate_blob_different_main_allowed: false,
      stale_canonical_comment_allowed: false,
    },
  };
}

function registryTree(paths = [filename], truncated = false) {
  return {
    truncated,
    tree: paths.map(path => ({path, type: 'blob', sha: 'd'.repeat(40)})),
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => (
    error instanceof ApprovalGenerationFailure
    && error.code === code
  ));
}

test('exact issuance, PR base and live main equality passes', () => {
  const result = assertApprovalRecordGeneration(activeRecord(A), {
    filename,
    prBaseSha: A,
    liveMainSha: A,
  });
  assert.equal(result.active, true);
  assert.equal(result.exact_generation_equal, true);
});

test('descendant-main drift is rejected even when ancestry would remain valid', () => {
  expectCode(() => assertApprovalRecordGeneration(activeRecord(A), {
    filename,
    prBaseSha: B,
    liveMainSha: B,
  }), 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE');
});

test('merge-main rebound is rejected', () => {
  expectCode(() => assertApprovalRecordGeneration(activeRecord(A), {
    filename,
    prBaseSha: A,
    liveMainSha: B,
  }), 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_LIVE_MAIN');
});

test('same candidate blob on a different main generation is rejected', () => {
  expectCode(() => assertApprovalRecordGeneration(activeRecord(A), {
    filename,
    prBaseSha: C,
    liveMainSha: C,
  }), 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE');
});

test('stale canonical approval comment binding is rejected at runtime', () => {
  expectCode(() => assertRuntimeApprovalExactMain({
    approvalProtectedMainSha: A,
    runtimeMainSha: B,
    approvalState: 'APPROVED',
  }), 'RUNTIME_APPROVAL_GENERATION_MISMATCH');
});

test('exact runtime approval generation passes', () => {
  const result = assertRuntimeApprovalExactMain({
    approvalProtectedMainSha: A,
    runtimeMainSha: A,
    approvalState: 'APPROVED',
  });
  assert.equal(result.exact_generation_equal, true);
});

test('active record without explicit exact-equality policy is rejected', () => {
  const record = activeRecord(A);
  delete record.approval_generation_policy;
  expectCode(() => assertApprovalRecordGeneration(record, {
    filename,
    prBaseSha: A,
    liveMainSha: A,
  }), 'APPROVAL_GENERATION_EXACT_EQUALITY_POLICY_MISSING');
});

test('terminal invalidated record remains non-authority and does not block unrelated work', () => {
  const record = activeRecord(A);
  record.status = 'INVALIDATED_UNCONSUMED_BY_EXACT_MAIN_DRIFT';
  assert.equal(isActiveApprovalRecord(record), false);
  const result = assertApprovalRecordGeneration(record, {
    filename,
    prBaseSha: B,
    liveMainSha: B,
  });
  assert.equal(result.active, false);
});

test('full-registry scanner rejects stale active approval record outside PR-diff semantics', async () => {
  await assert.rejects(
    assertFullApprovalGenerationEquality({
      baseTree: registryTree(),
      headTree: registryTree(),
      readJson: async () => activeRecord(A),
      prBaseSha: B,
      liveMainSha: B,
    }),
    (error) => error instanceof ApprovalGenerationFailure
      && error.code === 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE',
  );
});

test('full-registry scanner accepts terminal records while ignoring non-authority files', async () => {
  const terminal = activeRecord(A);
  terminal.status = 'CONSUMED_FAIL_CLOSED';
  const result = await assertFullApprovalGenerationEquality({
    baseTree: registryTree([filename, 'docs/example.md']),
    headTree: registryTree([filename, 'docs/example.md']),
    readJson: async () => terminal,
    prBaseSha: B,
    liveMainSha: B,
  });
  assert.equal(result.candidate_record_count, 1);
  assert.equal(result.active_record_count, 0);
});
