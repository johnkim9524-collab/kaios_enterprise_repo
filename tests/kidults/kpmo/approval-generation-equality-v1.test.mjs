import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  ApprovalGenerationFailure,
  assertApprovalRecordGeneration,
  assertChangedApprovalGenerationEquality,
  assertCompleteApprovalGenerationRegistry,
  assertLiveApprovalCommentReceipt,
  assertRuntimeApprovalExactMain,
  assertRuntimeApprovalLiveBinding,
  isActiveApprovalRecord,
} from '../../../scripts/kidults/kpmo/lib/approval-generation-equality-v1.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const D = 'd'.repeat(40);
const E = 'e'.repeat(40);
const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const filename = 'coordination/kidults/governance/example-authorization-v1.json';
const createdAt = '2026-09-01T00:00:00Z';

const digest = (body) => `sha256:${crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex')}`;

function activeRecord(main = A, {
  id = 'EXAMPLE-APPROVAL-1',
  body = 'approved exact-main authority',
  commentId = 101,
  issueNumber = 100,
} = {}) {
  return {
    id,
    status: 'APPROVED_PENDING_POST_LANDING_EXACT_MAIN_BINDING',
    authorized_by: {
      github_login: 'johnkim9524-collab',
      author_association: 'OWNER',
    },
    root_approval_receipt: {
      repository,
      issue_number: issueNumber,
      comment_id: commentId,
      created_at: createdAt,
      updated_at: createdAt,
      body_sha256: digest(body),
    },
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

function terminalRecord(main = A, options = {}) {
  return {
    ...activeRecord(main, options),
    status: 'INVALIDATED_UNCONSUMED_BY_EXACT_MAIN_DRIFT',
  };
}

function liveComment(record, body = 'approved exact-main authority') {
  return {
    id: record.root_approval_receipt.comment_id,
    issue_url: `https://api.github.com/repos/${repository}/issues/${record.root_approval_receipt.issue_number}`,
    user: {login: record.authorized_by.github_login},
    author_association: record.authorized_by.author_association,
    created_at: record.root_approval_receipt.created_at,
    updated_at: record.root_approval_receipt.updated_at,
    body,
  };
}

function entry(path = filename, sha = D, size = 512) {
  return {path, mode: '100644', type: 'blob', sha, size};
}

function snapshot(entries = [], truncated = false) {
  return {truncated, tree: entries};
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ApprovalGenerationFailure && error.code === code);
}

async function expectAsyncCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof ApprovalGenerationFailure && error.code === code,
  );
}

test('exact issuance, PR base and live main equality passes at record level', () => {
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

test('same candidate blob on a different protected-main generation is rejected', () => {
  expectCode(() => assertApprovalRecordGeneration(activeRecord(A), {
    filename,
    prBaseSha: C,
    liveMainSha: C,
  }), 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE');
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

test('terminal invalidated record remains non-authority', () => {
  const record = terminalRecord(A);
  assert.equal(isActiveApprovalRecord(record), false);
  const result = assertApprovalRecordGeneration(record, {
    filename,
    prBaseSha: B,
    liveMainSha: B,
  });
  assert.equal(result.active, false);
});

test('complete registry scans unchanged terminal authority outside the PR diff', async () => {
  const record = terminalRecord(A);
  const result = await assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry()]),
    baseTree: snapshot([entry()]),
    changedFiles: [{filename: 'docs/unrelated.md', status: 'modified'}],
    readJson: async () => record,
    readIssueComment: async () => { throw new Error('terminal record must not read comment'); },
    prBaseSha: B,
    liveMainSha: B,
    repository,
    phase: 'MERGE_CANDIDATE',
  });
  assert.equal(result.full_candidate_registry_scanned, true);
  assert.equal(result.candidate_record_count, 1);
  assert.equal(result.active_record_count, 0);
});

test('unchanged active record outside PR diff is rejected after descendant-main drift', async () => {
  const record = activeRecord(A);
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry()]),
    baseTree: snapshot([entry()]),
    changedFiles: [{filename: 'docs/unrelated.md', status: 'modified'}],
    readJson: async () => record,
    readIssueComment: async () => liveComment(record),
    prBaseSha: B,
    liveMainSha: B,
    repository,
    phase: 'MERGE_CANDIDATE',
  }), 'APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE');
});

test('exact-current active committed authority cannot survive a merge candidate', async () => {
  const record = activeRecord(A);
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry()]),
    baseTree: snapshot([entry()]),
    changedFiles: [],
    readJson: async () => record,
    readIssueComment: async () => liveComment(record),
    prBaseSha: A,
    liveMainSha: A,
    repository,
    phase: 'MERGE_CANDIDATE',
  }), 'APPROVAL_ACTIVE_RECORD_WOULD_SURVIVE_MERGE');
});

test('runtime-phase full registry validates exact-main active authority and live comment', async () => {
  const record = activeRecord(A);
  const result = await assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry()]),
    baseTree: snapshot([entry()]),
    changedFiles: [],
    readJson: async () => record,
    readIssueComment: async () => liveComment(record),
    prBaseSha: A,
    liveMainSha: A,
    repository,
    phase: 'RUNTIME_PREAUTHORIZATION',
  });
  assert.equal(result.active_record_count, 1);
  assert.equal(result.records[0].live_comment.live_readback, true);
});

test('candidate tree truncation fails closed', async () => {
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([], true),
    baseTree: snapshot([]),
    changedFiles: [],
    readJson: async () => ({}),
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_CANDIDATE_TREE_TRUNCATED_OR_UNKNOWN');
});

test('base tree truncation fails closed', async () => {
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([]),
    baseTree: snapshot([], true),
    changedFiles: [],
    readJson: async () => ({}),
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_BASE_TREE_TRUNCATED_OR_UNKNOWN');
});

test('removed or renamed authority path fails closed even when omitted from candidate tree', async () => {
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([]),
    baseTree: snapshot([entry()]),
    changedFiles: [{filename, status: 'removed'}],
    readJson: async () => terminalRecord(A),
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_PATH_REMOVED_OR_RENAMED');
});

test('renamed authority ambiguity in PR metadata fails closed', async () => {
  const newPath = 'coordination/kidults/governance/example-authorization-v2.json';
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry(), entry(newPath, E)]),
    baseTree: snapshot([entry(), entry(newPath, E)]),
    changedFiles: [{filename: newPath, previous_filename: filename, status: 'renamed'}],
    readJson: async () => terminalRecord(A),
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_DIFF_REMOVAL_OR_RENAME');
});

test('malformed or unreadable authority record fails closed', async () => {
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry()]),
    baseTree: snapshot([entry()]),
    changedFiles: [],
    readJson: async () => { throw new SyntaxError('bad json'); },
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_RECORD_UNREADABLE');
});

test('duplicate authority IDs fail closed across the complete registry', async () => {
  const otherPath = 'coordination/kidults/governance/other-approval-v1.json';
  await expectAsyncCode(assertCompleteApprovalGenerationRegistry({
    candidateTree: snapshot([entry(), entry(otherPath, E)]),
    baseTree: snapshot([entry(), entry(otherPath, E)]),
    changedFiles: [],
    readJson: async () => terminalRecord(A, {id: 'DUPLICATE-ID'}),
    prBaseSha: A,
    liveMainSha: A,
    repository,
  }), 'APPROVAL_REGISTRY_DUPLICATE_AUTHORITY_ID');
});

test('stale or altered live issue-comment body fails digest binding', () => {
  const record = activeRecord(A);
  expectCode(() => assertLiveApprovalCommentReceipt(
    record,
    liveComment(record, 'altered approval body'),
    {filename, repository},
  ), 'APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH');
});

test('changed-file-only authority scan is permanently forbidden', async () => {
  await expectAsyncCode(
    assertChangedApprovalGenerationEquality({files: []}),
    'APPROVAL_CHANGED_FILE_ONLY_SCAN_FORBIDDEN',
  );
});

test('exact runtime approval generation and live-comment binding pass', () => {
  const record = activeRecord(A);
  const result = assertRuntimeApprovalLiveBinding({
    record,
    comment: liveComment(record),
    runtimeMainSha: A,
    repository,
    filename,
  });
  assert.equal(result.exact_generation_equal, true);
  assert.equal(result.live_comment.live_readback, true);
});

test('stale canonical approval generation is rejected at runtime', () => {
  expectCode(() => assertRuntimeApprovalExactMain({
    approvalProtectedMainSha: A,
    runtimeMainSha: B,
    approvalState: 'APPROVED',
  }), 'RUNTIME_APPROVAL_GENERATION_MISMATCH');
});
