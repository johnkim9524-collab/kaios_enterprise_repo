#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertFullApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';

const SHA40 = /^[0-9a-f]{40}$/;
const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!token || !repository || !/^\d+$/.test(String(prNumber || '')) || !eventPath) {
  throw new Error('APPROVAL_GENERATION_LIVE_PR_ENVIRONMENT_INVALID');
}

let eventPayload;
try {
  eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
} catch (error) {
  throw new Error(`APPROVAL_GENERATION_EVENT_PAYLOAD_INVALID:${error?.message || error}`);
}

const eventPrNumber = String(eventPayload?.pull_request?.number || '');
const expectedHeadSha = String(eventPayload?.pull_request?.head?.sha || '');
const expectedBaseSha = String(eventPayload?.pull_request?.base?.sha || '');
if (eventPrNumber !== String(prNumber)) throw new Error('APPROVAL_GENERATION_EVENT_PR_NUMBER_MISMATCH');
if (!SHA40.test(expectedHeadSha)) throw new Error('APPROVAL_GENERATION_EVENT_HEAD_SHA_INVALID');
if (!SHA40.test(expectedBaseSha)) throw new Error('APPROVAL_GENERATION_EVENT_BASE_SHA_INVALID');
if (eventPayload?.pull_request?.base?.ref !== 'main') throw new Error('APPROVAL_GENERATION_EVENT_BASE_REF_NOT_MAIN');

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

function encodePath(filename) {
  return filename.split('/').map((part) => encodeURIComponent(part)).join('/');
}

const [pullRequest, mainBranch] = await Promise.all([
  api(`/pulls/${prNumber}`),
  api('/branches/main'),
]);

if (pullRequest?.base?.ref !== 'main') throw new Error('APPROVAL_GENERATION_BASE_REF_NOT_MAIN');
if (pullRequest?.state !== 'open' || pullRequest?.merged === true) {
  throw new Error('APPROVAL_GENERATION_PR_NOT_OPEN_UNMERGED');
}
if (!SHA40.test(String(pullRequest?.head?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_PR_HEAD_SHA_INVALID');
}
if (!SHA40.test(String(pullRequest?.base?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_PR_BASE_SHA_INVALID');
}
if (!SHA40.test(String(mainBranch?.commit?.sha || ''))) {
  throw new Error('APPROVAL_GENERATION_LIVE_MAIN_SHA_INVALID');
}
if (pullRequest.head.sha !== expectedHeadSha) {
  throw new Error('APPROVAL_GENERATION_HEAD_CHANGED_FROM_EVENT');
}
if (pullRequest.base.sha !== expectedBaseSha) {
  throw new Error('APPROVAL_GENERATION_BASE_CHANGED_FROM_EVENT');
}

const [baseTree, headTree] = await Promise.all([
  api(`/git/trees/${expectedBaseSha}?recursive=1`),
  api(`/git/trees/${expectedHeadSha}?recursive=1`),
]);

const readJson = async (filename) => {
  const payload = await api(`/contents/${encodePath(filename)}?ref=${expectedHeadSha}`);
  if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
    throw new Error(`APPROVAL_GENERATION_CONTENT_SHAPE_INVALID:${filename}`);
  }
  const text = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
  return JSON.parse(text);
};

const result = await assertFullApprovalGenerationEquality({
  baseTree,
  headTree,
  readJson,
  prBaseSha: expectedBaseSha,
  liveMainSha: mainBranch.commit.sha,
});

const [finalPullRequest, finalMainBranch] = await Promise.all([
  api(`/pulls/${prNumber}`),
  api('/branches/main'),
]);
if (finalPullRequest?.state !== 'open' || finalPullRequest?.merged === true) {
  throw new Error('APPROVAL_GENERATION_PR_STATE_CHANGED_DURING_VALIDATION');
}
if (finalPullRequest?.head?.sha !== expectedHeadSha) {
  throw new Error('APPROVAL_GENERATION_FINAL_HEAD_CHANGED');
}
if (finalPullRequest?.base?.sha !== expectedBaseSha) {
  throw new Error('APPROVAL_GENERATION_FINAL_BASE_CHANGED');
}
if (finalMainBranch?.commit?.sha !== mainBranch.commit.sha) {
  throw new Error('APPROVAL_GENERATION_LIVE_MAIN_CHANGED_DURING_VALIDATION');
}

console.log(JSON.stringify({
  id: 'kidults-approval-generation-equality-live-pr-receipt-v1',
  version: '1.1.0',
  repository,
  pull_request: Number(prNumber),
  exact_head_sha: expectedHeadSha,
  exact_base_sha: expectedBaseSha,
  event_payload_bound: true,
  initial_live_read: true,
  final_live_reread: true,
  ...result,
  provider_credentials_resolved: false,
  external_requests: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
