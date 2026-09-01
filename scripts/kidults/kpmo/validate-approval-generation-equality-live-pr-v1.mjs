#!/usr/bin/env node
import {
  assertCompleteApprovalGenerationRegistry,
} from './lib/approval-generation-equality-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;

if (!token || !repository || !/^\d+$/.test(String(prNumber || ''))) {
  throw new Error('APPROVAL_REGISTRY_LIVE_PR_ENVIRONMENT_INVALID');
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-approval-generation-registry-live-pr-v2',
};

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers,
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
  return response.json();
}

async function pages(path) {
  const values = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`GITHUB_PAGINATION_SHAPE_INVALID:${path}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
  throw new Error(`GITHUB_PAGINATION_BOUND_EXCEEDED:${path}`);
}

function assertSha(value, code) {
  if (!/^[0-9a-f]{40}$/.test(String(value || ''))) throw new Error(code);
}

const [initial, initialMain, files] = await Promise.all([
  api(`/pulls/${prNumber}`),
  api('/branches/main'),
  pages(`/pulls/${prNumber}/files`),
]);

if (initial?.base?.ref !== 'main') throw new Error('APPROVAL_REGISTRY_BASE_REF_NOT_MAIN');
if (initial?.state !== 'open' || initial?.merged === true) throw new Error('APPROVAL_REGISTRY_PR_NOT_OPEN_UNMERGED');
assertSha(initial?.head?.sha, 'APPROVAL_REGISTRY_PR_HEAD_SHA_INVALID');
assertSha(initial?.base?.sha, 'APPROVAL_REGISTRY_PR_BASE_SHA_INVALID');
assertSha(initialMain?.commit?.sha, 'APPROVAL_REGISTRY_LIVE_MAIN_SHA_INVALID');
if (initial.base.sha !== initialMain.commit.sha) throw new Error('APPROVAL_REGISTRY_PR_BASE_NOT_LIVE_MAIN');
if (files.length !== Number(initial.changed_files || 0)) {
  throw new Error(`APPROVAL_REGISTRY_CHANGED_FILE_PAGINATION_INCOMPLETE:${files.length}/${initial.changed_files}`);
}

const [candidateTree, baseTree] = await Promise.all([
  api(`/git/trees/${initial.head.sha}?recursive=1`),
  api(`/git/trees/${initial.base.sha}?recursive=1`),
]);

const readJson = async (entry) => {
  const payload = await api(`/git/blobs/${entry.sha}`);
  if (payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
    throw new Error(`APPROVAL_REGISTRY_BLOB_SHAPE_INVALID:${entry.path}`);
  }
  const bytes = Buffer.from(payload.content.replace(/\s/g, ''), 'base64');
  if (bytes.length !== entry.size) throw new Error(`APPROVAL_REGISTRY_BLOB_SIZE_MISMATCH:${entry.path}`);
  return JSON.parse(bytes.toString('utf8'));
};

const result = await assertCompleteApprovalGenerationRegistry({
  candidateTree,
  baseTree,
  changedFiles: files,
  readJson,
  readIssueComment: (commentId) => api(`/issues/comments/${commentId}`),
  prBaseSha: initial.base.sha,
  liveMainSha: initialMain.commit.sha,
  repository,
  phase: 'MERGE_CANDIDATE',
});

const [final, finalMain] = await Promise.all([
  api(`/pulls/${prNumber}`),
  api('/branches/main'),
]);
if (final.state !== initial.state || final.merged !== initial.merged || final.draft !== initial.draft) {
  throw new Error('APPROVAL_REGISTRY_PR_STATE_DRIFT');
}
if (final.head?.sha !== initial.head.sha || final.base?.sha !== initial.base.sha) {
  throw new Error('APPROVAL_REGISTRY_PR_REF_DRIFT');
}
if (finalMain?.commit?.sha !== initialMain.commit.sha) throw new Error('APPROVAL_REGISTRY_LIVE_MAIN_DRIFT');

console.log(JSON.stringify({
  id: 'kidults-approval-generation-full-registry-live-pr-receipt-v2',
  version: '2.0.0',
  repository,
  pull_request: Number(prNumber),
  exact_head_sha: initial.head.sha,
  exact_base_sha: initial.base.sha,
  ...result,
  final_live_reread: true,
  provider_credentials_resolved: false,
  external_provider_requests: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
