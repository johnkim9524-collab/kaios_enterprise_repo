const SHA40 = /^[0-9a-f]{40}$/;

const TERMINAL_STATUS_TOKENS = Object.freeze([
  'CONSUMED',
  'INVALIDATED',
  'REVOKED',
  'EXPIRED',
  'FAILED',
  'TOMBSTONE',
  'EXHAUSTED',
  'CLOSED',
]);

const ACTIVE_STATUS_TOKENS = Object.freeze([
  'APPROVED',
  'AUTHORIZED',
]);

const GOVERNANCE_PREFIX = 'coordination/kidults/governance/';
const APPROVAL_FILE_PATTERN = /(?:approval|authorization).*\.json$/i;

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

export function isApprovalGenerationCandidateFile(filename) {
  return typeof filename === 'string'
    && filename.startsWith(GOVERNANCE_PREFIX)
    && APPROVAL_FILE_PATTERN.test(filename.slice(GOVERNANCE_PREFIX.length));
}

export function isActiveApprovalRecord(record) {
  const status = normalizeStatus(record?.status);
  if (!status) return false;
  if (TERMINAL_STATUS_TOKENS.some((token) => status.includes(token))) return false;
  return ACTIVE_STATUS_TOKENS.some((token) => status.includes(token));
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
      disposition: 'TERMINAL_OR_NON_AUTHORITY_RECORD_IGNORED',
    };
  }

  if (!SHA40.test(String(prBaseSha || ''))) fail('APPROVAL_GENERATION_PR_BASE_SHA_INVALID', filename);
  if (!SHA40.test(String(liveMainSha || ''))) fail('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID', filename);

  const issuanceMain = record?.issuance_binding?.protected_main_sha_at_receipt_issuance;
  if (!SHA40.test(String(issuanceMain || ''))) {
    fail('APPROVAL_GENERATION_ACTIVE_RECORD_ISSUANCE_SHA_INVALID', filename);
  }
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

function assertTreeShape(tree, label) {
  if (!tree || typeof tree !== 'object' || !Array.isArray(tree.tree)) {
    fail('APPROVAL_GENERATION_TREE_SHAPE_INVALID', label);
  }
  if (tree.truncated !== false) {
    fail('APPROVAL_GENERATION_TREE_TRUNCATED_OR_AMBIGUOUS', label);
  }
}

function candidatePathsFromTree(tree, label) {
  assertTreeShape(tree, label);
  const paths = [];
  const seen = new Set();
  for (const entry of tree.tree) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.type !== 'string') {
      fail('APPROVAL_GENERATION_TREE_ENTRY_INVALID', label);
    }
    if (!isApprovalGenerationCandidateFile(entry.path)) continue;
    if (entry.type !== 'blob') {
      fail('APPROVAL_GENERATION_CANDIDATE_NOT_BLOB', entry.path);
    }
    if (seen.has(entry.path)) {
      fail('APPROVAL_GENERATION_TREE_DUPLICATE_PATH', entry.path);
    }
    seen.add(entry.path);
    paths.push(entry.path);
  }
  return paths.sort();
}

export async function assertFullApprovalGenerationEquality({
  baseTree,
  headTree,
  readJson,
  prBaseSha,
  liveMainSha,
} = {}) {
  if (typeof readJson !== 'function') fail('APPROVAL_GENERATION_JSON_READER_REQUIRED');
  if (!SHA40.test(String(prBaseSha || ''))) fail('APPROVAL_GENERATION_PR_BASE_SHA_INVALID');
  if (!SHA40.test(String(liveMainSha || ''))) fail('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID');
  if (prBaseSha !== liveMainSha) {
    fail('APPROVAL_GENERATION_PR_BASE_NOT_LIVE_MAIN', `${prBaseSha}:${liveMainSha}`);
  }

  const baseCandidates = candidatePathsFromTree(baseTree, 'base');
  const headCandidates = candidatePathsFromTree(headTree, 'head');
  const headSet = new Set(headCandidates);
  for (const filename of baseCandidates) {
    if (!headSet.has(filename)) {
      fail('APPROVAL_GENERATION_RECORD_REMOVED_OR_RENAMED', filename);
    }
  }

  const records = [];
  for (const filename of headCandidates) {
    let record;
    try {
      record = await readJson(filename);
    } catch (error) {
      fail('APPROVAL_GENERATION_RECORD_UNREADABLE', `${filename}:${error?.message || error}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail('APPROVAL_GENERATION_RECORD_NOT_OBJECT', filename);
    }
    records.push(assertApprovalRecordGeneration(record, {
      filename,
      prBaseSha,
      liveMainSha,
    }));
  }

  return {
    state: 'VERIFIED_PASS',
    scan_scope: 'FULL_BOUNDED_GOVERNANCE_AUTHORITY_REGISTRY',
    pr_base_sha: prBaseSha,
    live_main_sha: liveMainSha,
    base_candidate_record_count: baseCandidates.length,
    candidate_record_count: headCandidates.length,
    active_record_count: records.filter((record) => record.active).length,
    removed_or_renamed_record_count: 0,
    tree_truncation_allowed: false,
    records,
    exact_main_equality_enforced: true,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
  };
}

// Kept only for compatibility with older callers. New authoritative lifecycle paths
// must use assertFullApprovalGenerationEquality so unchanged ACTIVE authority cannot
// escape exact-current-main generation checks merely by staying outside a PR diff.
export async function assertChangedApprovalGenerationEquality({
  files,
  readJson,
  prBaseSha,
  liveMainSha,
} = {}) {
  if (!Array.isArray(files)) fail('APPROVAL_GENERATION_FILES_REQUIRED');
  if (typeof readJson !== 'function') fail('APPROVAL_GENERATION_JSON_READER_REQUIRED');
  if (!SHA40.test(String(prBaseSha || ''))) fail('APPROVAL_GENERATION_PR_BASE_SHA_INVALID');
  if (!SHA40.test(String(liveMainSha || ''))) fail('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID');

  const candidates = files
    .filter((entry) => String(entry?.status || '').toLowerCase() !== 'removed')
    .map((entry) => typeof entry === 'string' ? {filename: entry, status: 'modified'} : entry)
    .filter((entry) => isApprovalGenerationCandidateFile(entry?.filename));

  const records = [];
  for (const candidate of candidates) {
    let record;
    try {
      record = await readJson(candidate.filename);
    } catch (error) {
      fail('APPROVAL_GENERATION_RECORD_UNREADABLE', `${candidate.filename}:${error?.message || error}`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail('APPROVAL_GENERATION_RECORD_NOT_OBJECT', candidate.filename);
    }
    records.push(assertApprovalRecordGeneration(record, {
      filename: candidate.filename,
      prBaseSha,
      liveMainSha,
    }));
  }

  return {
    state: 'VERIFIED_PASS',
    scan_scope: 'CHANGED_FILES_ONLY_COMPATIBILITY_NON_AUTHORITATIVE',
    pr_base_sha: prBaseSha,
    live_main_sha: liveMainSha,
    candidate_record_count: candidates.length,
    active_record_count: records.filter((record) => record.active).length,
    records,
    exact_main_equality_enforced: true,
    ancestor_reuse_allowed: false,
    same_candidate_blob_different_main_allowed: false,
    stale_canonical_comment_allowed: false,
  };
}

export function assertRuntimeApprovalExactMain({
  approvalProtectedMainSha,
  runtimeMainSha,
  approvalState = 'APPROVED',
} = {}) {
  if (normalizeStatus(approvalState) !== 'APPROVED') {
    fail('RUNTIME_APPROVAL_STATE_NOT_APPROVED', normalizeStatus(approvalState));
  }
  if (!SHA40.test(String(approvalProtectedMainSha || ''))) {
    fail('RUNTIME_APPROVAL_MAIN_SHA_INVALID');
  }
  if (!SHA40.test(String(runtimeMainSha || ''))) {
    fail('RUNTIME_MAIN_SHA_INVALID');
  }
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
