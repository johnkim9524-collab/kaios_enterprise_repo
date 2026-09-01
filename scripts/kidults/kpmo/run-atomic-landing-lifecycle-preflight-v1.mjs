#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {resolveAtomicLandingLifecycleAuthority} from './lib/atomic-landing-lifecycle-authority-v1.mjs';

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

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const [pr, mainBranch, combinedStatus, timeline] = await Promise.all([
  request(`/pulls/${prNumber}`),
  request('/branches/main'),
  request(`/commits/${expectedHeadSha}/status`),
  pages(`/issues/${prNumber}/timeline`),
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
  if (matches[0].state !== 'success') throw new Error(`ATOMIC_LIFECYCLE_NATIVE_CONTEXT_NOT_SUCCESS:${context}`);
  return matches[0];
});

const readinessEvents = timeline.filter(event => event?.event === 'ready_for_review' || event?.event === 'convert_to_draft');
const latestReadiness = readinessEvents.at(-1);
if (!latestReadiness || latestReadiness.event !== 'ready_for_review') throw new Error('ATOMIC_LIFECYCLE_LATEST_READY_EVENT_REQUIRED');

const authority = await resolveAtomicLandingLifecycleAuthority({
  request,
  prNumber,
  headSha: expectedHeadSha,
  baseSha: pr.base.sha,
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
  version: '1.0.0',
  repository,
  checked_at: new Date().toISOString(),
  ...authority,
  latest_ready_event_at: latestReadiness.created_at,
  final_live_reread: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  mutation_authority_created: false,
};
fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, {mode: 0o600});
console.log(JSON.stringify(receipt, null, 2));
