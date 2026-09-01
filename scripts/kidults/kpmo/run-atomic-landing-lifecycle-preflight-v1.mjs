#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  resolveAtomicLandingLifecycleAuthority,
  isAtomicLandingNativeStatusReady,
} from './lib/atomic-landing-lifecycle-authority-v1.mjs';
import {
  selectExactHeadProgramOwnerApproval,
} from './lib/governed-landing-native-gates-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const outPath = process.env.LIFECYCLE_AUTHORITY_PATH || '/tmp/kpmo-atomic-landing/lifecycle-authority.json';
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('ATOMIC_LIFECYCLE_PREFLIGHT_ENVIRONMENT_BINDING_INVALID');
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-atomic-landing-lifecycle-preflight-v1',
};
const request = async endpoint => {
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {headers, redirect: 'error'});
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${endpoint}:${payload?.message || 'request_failed'}`);
  return payload;
};
const pages = async endpoint => {
  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const values = await request(`${endpoint}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) throw new Error(`PAGINATION_NON_ARRAY:${endpoint}`);
    all.push(...values);
    if (values.length < 100) return all;
  }
  throw new Error(`PAGINATION_BOUND_EXCEEDED:${endpoint}`);
};
const readArtifactReceipt = async artifact => {
  if (!Number.isInteger(artifact?.id) || artifact.id <= 0) throw new Error('LIFECYCLE_ARTIFACT_ID_INVALID');
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
    {headers, redirect: 'follow'},
  );
  if (!response.ok) throw new Error(`LIFECYCLE_ARTIFACT_DOWNLOAD_FAILED:${artifact.id}:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > 2 * 1024 * 1024) throw new Error(`LIFECYCLE_ARTIFACT_ZIP_SIZE_INVALID:${artifact.id}:${bytes.length}`);
  const dir = `/tmp/kpmo-atomic-landing/lifecycle-artifacts/${artifact.id}`;
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const zipPath = path.join(dir, 'artifact.zip');
  fs.writeFileSync(zipPath, bytes, {mode: 0o600});
  const listing = execFileSync('unzip', ['-Z1', zipPath], {encoding: 'utf8', maxBuffer: 1024 * 1024})
    .split('\n').map(value => value.trim()).filter(Boolean);
  if (listing.length !== 1 || listing[0] !== 'receipt.json') throw new Error(`LIFECYCLE_ARTIFACT_ARCHIVE_SHAPE_INVALID:${artifact.id}`);
  const raw = execFileSync('unzip', ['-p', zipPath, 'receipt.json'], {encoding: 'utf8', maxBuffer: 1024 * 1024});
  if (!raw.trim() || Buffer.byteLength(raw) > 1024 * 1024) throw new Error(`LIFECYCLE_RECEIPT_PAYLOAD_SIZE_INVALID:${artifact.id}`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`LIFECYCLE_RECEIPT_JSON_INVALID:${artifact.id}`);
  }
};

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const [pr, mainBranch, combinedStatus, timeline, approvalComments, headCommit, repositoryState] = await Promise.all([
  request(`/pulls/${prNumber}`),
  request('/branches/main'),
  request(`/commits/${expectedHeadSha}/status`),
  pages(`/issues/${prNumber}/timeline`),
  pages(`/issues/${prNumber}/comments`),
  request(`/commits/${expectedHeadSha}`),
  request(''),
]);
if (pr.state !== 'open' || pr.merged === true || pr.draft === true) throw new Error('ATOMIC_LIFECYCLE_PR_NOT_READY_OPEN_UNMERGED');
if (pr.head?.sha !== expectedHeadSha) throw new Error('ATOMIC_LIFECYCLE_HEAD_DRIFT');
if (pr.base?.ref !== 'main' || pr.base?.sha !== mainBranch?.commit?.sha) throw new Error('ATOMIC_LIFECYCLE_BASE_NOT_LIVE_MAIN');

const required = Array.from(new Set(policy.native_required_status_contexts || []));
if (!required.length) throw new Error('ATOMIC_LIFECYCLE_NATIVE_CONTEXT_SET_EMPTY');
const statuses = Array.isArray(combinedStatus?.statuses) ? combinedStatus.statuses : [];
const nativeStatuses = required.map(context => {
  const matches = statuses.filter(status => status?.context === context);
  if (matches.length !== 1) throw new Error(`ATOMIC_LIFECYCLE_NATIVE_CONTEXT_CARDINALITY:${context}:${matches.length}`);
  if (!isAtomicLandingNativeStatusReady(matches[0])) {
    throw new Error(`ATOMIC_LIFECYCLE_NATIVE_CONTEXT_NOT_LANDING_READY:${context}:${matches[0]?.state || 'missing'}`);
  }
  return matches[0];
});

const readinessEvents = timeline.filter(event => event?.event === 'ready_for_review' || event?.event === 'convert_to_draft');
const latestReadiness = readinessEvents.at(-1);
if (!latestReadiness || latestReadiness.event !== 'ready_for_review') throw new Error('ATOMIC_LIFECYCLE_LATEST_READY_EVENT_REQUIRED');

const authorizationId = `LAND-PR-${prNumber}-${expectedHeadSha.slice(0, 12)}`;
const programOwnerApproval = selectExactHeadProgramOwnerApproval(approvalComments, {
  repositoryOwner: repositoryState.owner?.login,
  prNumber,
  headSha: expectedHeadSha,
  baseSha: pr.base.sha,
  authorizationId,
  prCreatedAt: pr.created_at,
  headCommittedAt: headCommit?.commit?.committer?.date || headCommit?.commit?.author?.date,
  latestReadyAt: latestReadiness.created_at,
});

const authority = await resolveAtomicLandingLifecycleAuthority({
  request,
  readArtifactReceipt,
  prNumber,
  headSha: expectedHeadSha,
  baseSha: pr.base.sha,
  prCreatedAt: pr.created_at,
  nativeStatuses,
  lastReadyAt: latestReadiness.created_at,
});

const finalPr = await request(`/pulls/${prNumber}`);
const finalMain = await request('/branches/main');
if (finalPr.head?.sha !== pr.head.sha || finalPr.base?.sha !== pr.base.sha || finalPr.draft !== false || finalPr.state !== 'open' || finalPr.merged === true) {
  throw new Error('ATOMIC_LIFECYCLE_PR_DRIFT_DURING_PREFLIGHT');
}
if (finalMain?.commit?.sha !== mainBranch?.commit?.sha) throw new Error('ATOMIC_LIFECYCLE_MAIN_DRIFT_DURING_PREFLIGHT');

const receipt = {
  id: 'kidults-atomic-landing-lifecycle-authority-receipt-v1',
  version: '1.1.0',
  repository,
  checked_at: new Date().toISOString(),
  ...authority,
  program_owner_exact_head_approval: programOwnerApproval,
  latest_ready_event_at: latestReadiness.created_at,
  final_live_reread: true,
  manual_merge_authority: false,
  atomic_landing_only: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  mutation_authority_created: false,
};
fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, {mode: 0o600});
console.log(JSON.stringify(receipt, null, 2));
