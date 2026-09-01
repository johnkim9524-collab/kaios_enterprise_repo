import crypto from 'node:crypto';

const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const GOVERNANCE_PREFIX = 'coordination/kidults/governance/';
const APPROVAL_FILE_PATTERN = /(?:approval|authorization).*\.json$/i;
const MAX_REGISTRY_RECORDS = 256;
const MAX_RECORD_BYTES = 1_000_000;

const TERMINAL_STATUS_TOKENS = Object.freeze([
  'CONSUMED',
  'INVALIDATED',
  'REVOKED',
  'EXPIRED',
  'FAILED',
  'TOMBSTONE',
  'EXHAUSTED',
  'CLOSED',
  'DENIED',
  'REJECTED',
  'CANCELLED',
]);

const ACTIVE_STATUS_TOKENS = Object.freeze([
  'APPROVED',
  'AUTHORIZED',
]);

export class ApprovalGenerationFailure extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ApprovalGenerationFailure';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = '') => {
  throw new ApprovalGenerationFailure(code, detail);
};

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const digestBody = (value) => `sha256:${crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex')}`;

export function isApprovalGenerationCandidateFile(filename) {
  return typeof filename === 'string'
    && filename.startsWith(GOVERNANCE_PREFIX)
    && APPROVAL_FILE_PATTERN.test(filename.slice(GOVERNANCE_PREFIX.length));
}

export function isActiveApprovalRecord(record) {
  const issuance = record?.issuance_binding?.protected_main_sha_at_receipt_issuance;
  if (!SHA40.test(String(issuance || ''))) return false;
  const status = normalizeStatus(record?.status);
  if (!status) return false;
  if (TERMINAL_STATUS_TOKENS.some((token) => status.includes(token))) return false;
  return ACTIVE_STATUS_TOKENS.some((token) => status.includes(token));
}

function normalizeTreeSnapshot(snapshot, label) {
  if (!snapshot || typeof snapshot !== 'object') fail(`APPROVAL_REGISTRY_${label}_TREE_REQUIRED`);
  if (snapshot.truncated !== false) fail(`APPROVAL_REGISTRY_${label}_TREE_TRUNCATED_OR_UNKNOWN`);
  if (!Array.isArray(snapshot.tree)) fail(`APPROVAL_REGISTRY_${label}_TREE_SHAPE_INVALID`);

  const seen = new Set();
  const entries = [];
  for (const raw of snapshot.tree) {
    if (!raw || typeof raw.path !== 'string' || !raw.path.length) {
      fail(`APPROVAL_REGISTRY_${label}_TREE_PATH_INVALID`);
    }
    if (seen.has(raw.path)) fail(`APPROVAL_REGISTRY_${label}_TREE_DUPLICATE_PATH`, raw.path);
    seen.add(raw.path);
    if (raw.type !== 'blob') continue;
    if (!SHA40.test(String(raw.sha || ''))) fail(`APPROVAL_REGISTRY_${label}_BLOB_SHA_INVALID`, raw.path);
    if (!Number.isInteger(raw.size) || raw.size < 0) fail(`APPROVAL_REGISTRY_${label}_BLOB_SIZE_INVALID`, raw.path);
    entries.push({
      path: raw.path,
      sha: raw.sha,
      size: raw.size,
      mode: String(raw.mode || ''),
      type: raw.type,
    });
  }
  return entries;
}

function registryEntries(snapshot, label) {
  const entries = normalizeTreeSnapshot(snapshot, label)
    .filter((entry) => isApprovalGenerationCandidateFile(entry.path));
  if (entries.length > MAX_REGISTRY_RECORDS) {
    fail('APPROVAL_REGISTRY_RECORD_BOUND_EXCEEDED', String(entries.length));
  }
  for (const entry of entries) {
    if (entry.mode !== '100644') fail('APPROVAL_REGISTRY_RECORD_MODE_INVALID', `${entry.path}:${entry.mode}`);
    if (entry.size <= 0 || entry.size > MAX_RECORD_BYTES) {
      fail('APPROVAL_REGISTRY_RECORD_SIZE_INVALID', `${entry.path}:${entry.size}`);
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function assertApprovalRecordGeneration(record, {
  filename = 'unknown',
  prBaseSha,
  liveMainSha,
} = {}) {
  if (!isActiveApprovalRecord(record)) {
    return {
      filename,
      active: false,
      disposition: 'TERMINAL_OR_NON_AUTHORITY_RECORD',
    };
  }

  if (!SHA40.test(String(prBaseSha || ''))) fail('APPROVAL_GENERATION_PR_BASE_SHA_INVALID', filename);
  if (!SHA40.test(String(liveMainSha || ''))) fail('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID', filename);

  const issuanceMain = record.issuance_binding.protected_main_sha_at_receipt_issuance;
  const policy = record.approval_generation_policy || {};

  if (policy.mode !== 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY') {
    fail('APPROVAL_GENERATION_EXACT_EQUALITY_POLICY_MISSING', filename);
  }
  if (policy.survives_main_drift !== false) {
    fail('APPROVAL_GENERATION_MAIN_DRIFT_MUST_INVALIDATE', filename);
  }
  if (policy.ancestor_reuse_allowed !== false) {
    fail('APPROVAL_GENERATION_ANCESTOR_REUSE_FORBIDDEN', filename);
  }
  if (policy.same_candidate_blob_different_main_allowed !== false) {
    fail('APPROVAL_GENERATION_SAME_BLOB_DIFFERENT_MAIN_FORBIDDEN', filename);
  }
  if (policy.stale_canonical_comment_allowed !== false) {
    fail('APPROVAL_GENERATION_STALE_COMMENT_FORBIDDEN', filename);
  }
  if (issuanceMain !== prBaseSha) {
    fail('APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_PR_BASE', `${filename}:${issuanceMain}:${prBaseSha}`);
  }
  if (issuanceMain !== liveMainSha) {
    fail('APPROVAL_GENERATION_ISSUANCE_MAIN_NOT_LIVE_MAIN', `${filename}:${issuanceMain}:${liveMainSha}`);
  }
  if (prBaseSha !== liveMainSha) {
    fail('APPROVAL_GENERATION_PR_BASE_NOT_LIVE_MAIN', `${filename}:${prBaseSha}:${liveMainSha}`);
  }

  return {
    filename,
    active: true,
    approval_id: record.id || null,
    issuance_main_sha: issuanceMain,
    pr_base_sha: prBaseSha,
    live_main_sha: liveMainSha,
    exact_generation_equal: true,
    main_drift_survival: false,
    ancestor_reuse_allowed: false,
  };
}

export function assertLiveApprovalCommentReceipt(record, comment, {
  filename = 'unknown',
  repository,
} = {}) {
  const root = record?.root_approval_receipt;
  if (!root || typeof root !== 'object') fail('APPROVAL_LIVE_COMMENT_BINDING_MISSING', filename);
  if (!Number.isInteger(root.issue_number) || root.issue_number <= 0) fail('APPROVAL_LIVE_COMMENT_ISSUE_INVALID', filename);
  if (!Number.isInteger(root.comment_id) || root.comment_id <= 0) fail('APPROVAL_LIVE_COMMENT_ID_INVALID', filename);
  if (!DIGEST.test(String(root.body_sha256 || ''))) fail('APPROVAL_LIVE_COMMENT_DIGEST_INVALID', filename);
  if (!record?.authorized_by?.github_login) fail('APPROVAL_LIVE_COMMENT_OWNER_BINDING_MISSING', filename);
  if (!comment || typeof comment !== 'object') fail('APPROVAL_LIVE_COMMENT_UNREADABLE', filename);
  if (comment.id !== root.comment_id) fail('APPROVAL_LIVE_COMMENT_ID_MISMATCH', filename);
  if (comment.user?.login !== record.authorized_by.github_login) fail('APPROVAL_LIVE_COMMENT_OWNER_MISMATCH', filename);
  if (record.authorized_by.author_association
    && comment.author_association !== record.authorized_by.author_association) {
    fail('APPROVAL_LIVE_COMMENT_ASSOCIATION_MISMATCH', filename);
  }
  if (repository && root.repository && root.repository !== repository) {
    fail('APPROVAL_LIVE_COMMENT_REPOSITORY_BINDING_MISMATCH', filename);
  }
  if (repository && comment.issue_url !== `https://api.github.com/repos/${repository}/issues/${root.issue_number}`) {
    fail('APPROVAL_LIVE_COMMENT_ISSUE_URL_MISMATCH', filename);
  }
  if (typeof comment.body !== 'string') fail('APPROVAL_LIVE_COMMENT_BODY_MISSING', filename);
  if (comment.created_at !== comment.updated_at) fail('APPROVAL_LIVE_COMMENT_EDITED', filename);
  if (root.created_at && comment.created_at !== root.created_at) fail('APPROVAL_LIVE_COMMENT_CREATED_AT_MISMATCH', filename);
  if (root.updated_at && comment.updated_at !== root.updated_at) fail('APPROVAL_LIVE_COMMENT_UPDATED_AT_MISMATCH', filename);
  const actualDigest = digestBody(comment.body);
  if (actualDigest !== root.body_sha256) fail('APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH', filename);

  return {
    comment_id: comment.id,
    issue_number: root.issue_number,
    author: comment.user.login,
    author_association: comment.author_association,
    body_sha256: actualDigest,
    edited: false,
    live_readback: true,
  };
}

export async function assertCompleteApprovalGenerationRegistry({
  candidateTree,
  baseTree,
  changedFiles = [],
  readJson,
  readIssueComment,
  prBaseSha,
  liveMainSha,
  repository,
  phase = 'MERGE_CANDIDATE',
} = {}) {
  if (typeof readJson !== 'function') fail('APPROVAL_REGISTRY_JSON_READER_REQUIRED');
  if (!Array.isArray(changedFiles)) fail('APPROVAL_REGISTRY_CHANGED_FILES_REQUIRED');
  if (!SHA40.test(String(prBaseSha || ''))) fail('APPROVAL_GENERATION_PR_BASE_SHA_INVALID');
  if (!SHA40.test(String(liveMainSha || ''))) fail('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID');
  if (prBaseSha !== liveMainSha) fail('APPROVAL_GENERATION_PR_BASE_NOT_LIVE_MAIN', `${prBaseSha}:${liveMainSha}`);

  const candidateEntries = registryEntries(candidateTree, 'CANDIDATE');
  const baseEntries = registryEntries(baseTree, 'BASE');
  const candidateByPath = new Map(candidateEntries.map((entry) => [entry.path, entry]));
  const baseByPath = new Map(baseEntries.map((entry) => [entry.path, entry]));

  const removed = [...baseByPath.keys()].filter((path) => !candidateByPath.has(path));
  if (removed.length) fail('APPROVAL_REGISTRY_PATH_REMOVED_OR_RENAMED', removed.join(','));

  for (const file of changedFiles) {
    const status = String(file?.status || '').toLowerCase();
    const filename = String(file?.filename || '');
    const previous = String(file?.previous_filename || '');
    if ((status === 'removed' || status === 'renamed')
      && (isApprovalGenerationCandidateFile(filename) || isApprovalGenerationCandidateFile(previous))) {
      fail('APPROVAL_REGISTRY_DIFF_REMOVAL_OR_RENAME', `${previous || filename}->${filename}`);
    }
  }

  const records = [];
  const authorityIds = new Set();
  for (const entry of candidateEntries) {
    let record;
    try {
      record = await readJson(entry);
    } catch (error) {
      fail('APPROVAL_REGISTRY_RECORD_UNREADABLE', `${entry.path}:${error?.message || error}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail('APPROVAL_REGISTRY_RECORD_NOT_OBJECT', entry.path);
    }

    const authorityLike = Boolean(record.status && record.issuance_binding);
    if (authorityLike) {
      if (typeof record.id !== 'string' || !record.id.trim()) fail('APPROVAL_REGISTRY_AUTHORITY_ID_MISSING', entry.path);
      if (authorityIds.has(record.id)) fail('APPROVAL_REGISTRY_DUPLICATE_AUTHORITY_ID', record.id);
      authorityIds.add(record.id);
    }

    const generation = assertApprovalRecordGeneration(record, {
      filename: entry.path,
      prBaseSha,
      liveMainSha,
    });
    let liveComment = null;
    if (generation.active) {
      if (typeof readIssueComment !== 'function') fail('APPROVAL_LIVE_COMMENT_READER_REQUIRED', entry.path);
      const commentId = record.root_approval_receipt?.comment_id;
      let comment;
      try {
        comment = await readIssueComment(commentId);
      } catch (error) {
        fail('APPROVAL_LIVE_COMMENT_READ_FAILED', `${entry.path}:${error?.message || error}`);
      }
      liveComment = assertLiveApprovalCommentReceipt(record, comment, {
        filename: entry.path,
        repository,
      });
      if (phase === 'MERGE_CANDIDATE') {
        fail('APPROVAL_ACTIVE_RECORD_WOULD_SURVIVE_MERGE', `${entry.path}:${record.id}`);
      }
    }

    records.push({
      ...generation,
      blob_sha: entry.sha,
      size: entry.size,
      authority_like: authorityLike,
      live_comment: liveComment,
    });
  }

  return {
    state: 'VERIFIED_PASS',
    phase,
    pr_base_sha: prBaseSha,
    live_main_sha: liveMainSha,
    candidate_tree_truncated: false,
    base_tree_truncated: false,
    full_candidate_registry_scanned: true,
    full_base_registry_scanned: true,
    candidate_record_count: candidateEntries.length,
    base_record_count: baseEntries.length,
    active_record_count: records.filter((record) => record.active).length,
    authority_record_count: records.filter((record) => record.authority_like).length,
    removed_or_renamed_record_count: 0,
    records,
    exact_main_equality_enforced: true,
    active_committed_authority_may_survive_merge: false,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
    live_comment_readback_required_for_active_authority: true,
  };
}

export async function assertChangedApprovalGenerationEquality() {
  fail('APPROVAL_CHANGED_FILE_ONLY_SCAN_FORBIDDEN');
}

export function assertRuntimeApprovalExactMain({
  approvalProtectedMainSha,
  runtimeMainSha,
  approvalState = 'APPROVED',
} = {}) {
  const status = normalizeStatus(approvalState);
  if (TERMINAL_STATUS_TOKENS.some((token) => status.includes(token))
    || !ACTIVE_STATUS_TOKENS.some((token) => status.includes(token))) {
    fail('RUNTIME_APPROVAL_STATE_NOT_ACTIVE', status);
  }
  if (!SHA40.test(String(approvalProtectedMainSha || ''))) fail('RUNTIME_APPROVAL_MAIN_SHA_INVALID');
  if (!SHA40.test(String(runtimeMainSha || ''))) fail('RUNTIME_MAIN_SHA_INVALID');
  if (approvalProtectedMainSha !== runtimeMainSha) {
    fail('RUNTIME_APPROVAL_GENERATION_MISMATCH', `${approvalProtectedMainSha}:${runtimeMainSha}`);
  }
  return {
    state: 'VERIFIED_PASS',
    approval_protected_main_sha: approvalProtectedMainSha,
    runtime_main_sha: runtimeMainSha,
    exact_generation_equal: true,
  };
}

export function assertRuntimeApprovalLiveBinding({
  record,
  comment,
  runtimeMainSha,
  repository,
  filename = 'runtime-approval',
} = {}) {
  const generation = assertRuntimeApprovalExactMain({
    approvalProtectedMainSha: record?.issuance_binding?.protected_main_sha_at_receipt_issuance,
    runtimeMainSha,
    approvalState: record?.status,
  });
  const liveComment = assertLiveApprovalCommentReceipt(record, comment, {filename, repository});
  return {
    state: 'VERIFIED_PASS',
    ...generation,
    live_comment: liveComment,
    terminal_consumption_state_required_after_dispatch: true,
  };
}
