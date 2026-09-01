#!/usr/bin/env node
import {
  assertChangedApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;

if (!token || !repository || !/^\d+$/.test(String(prNumber || ''))) {
  throw new Error('APPROVAL_GENERATION_LIVE_PR_ENVIRONMENT_INVALID');
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-approval-generation-equality-live-pr-v1',
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

function encodePath(filename) {
  return filename.split('/').map((part) => encodeURIComponent(part)).join('/');
}

const [pullRequest, mainBranch, files] = await Promise.all([
  api(`/pulls/${prNumber}`),
  api('/branches/main'),
  pages(`/pulls/${prNumber}/files`),
]);

if (pullRequest?.base?.ref !== 'main') throw new Error('APPROVAL_GENERATION_BASE_REF_NOT_MAIN');
if (pullRequest?.state !== 'open' || pullRequest?.merged === true) {
  throw new Error('APPROVAL_GENERATION_PR_NOT_OPEN_UNMERGED');
}
if (!/^[0-9a-f]{40}$/.test(String(pullRequest?.head?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_PR_HEAD_SHA_INVALID');
}
if (!/^[0-9a-f]{40}$/.test(String(pullRequest?.base?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_PR_BASE_SHA_INVALID');
}
if (!/^[0-9a-f]{40}$/.test(String(mainBranch?.commit?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID');
}

const readJson = async (filename) => {
  const payload = await api(`/contents/${encodePath(filename)}?ref=${pullRequest.head.sha}`);
  if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
    throw new Error(`APPROVAL_GENERATION_CONTENT_SHAPE_INVALID:${filename}`);
  }
  const text = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
  return JSON.parse(text);
};

const result = await assertChangedApprovalGenerationEquality({
  files,
  readJson,
  prBaseSha: pullRequest.base.sha,
  liveMainSha: mainBranch.commit.sha,
});

console.log(JSON.stringify({
  id: 'kidults-approval-generation-equality-live-pr-receipt-v1',
  version: '1.0.0',
  repository,
  pull_request: Number(prNumber),
  exact_head_sha: pullRequest.head.sha,
  ...result,
  provider_credentials_resolved: false,
  external_requests: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
