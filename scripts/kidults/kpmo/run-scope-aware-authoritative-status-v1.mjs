#!/usr/bin/env node
import fs from 'node:fs';
import {
  GateFailure,
  assertStableFinalReread,
  evaluateRequiredCheckRuns,
  resolveScopeRequirements,
} from './lib/governed-landing-native-gates-v1.mjs';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
const maxAttempts = Number(process.env.AGGREGATOR_MAX_ATTEMPTS || 60);
const delayMs = Number(process.env.AGGREGATOR_DELAY_MS || 10_000);
if (!token || !repository || !/^\d+$/.test(prNumber || '') || !/^[0-9a-f]{40}$/.test(expectedHeadSha || '')) {
  throw new Error('SCOPE_AGGREGATOR_ENVIRONMENT_BINDING_INVALID');
}
if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 90 || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000) {
  throw new Error('SCOPE_AGGREGATOR_POLL_BOUND_INVALID');
}

const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
const landingPolicy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json', 'utf8'));
const context = policy.required_status_context;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-scope-aware-authoritative-status-v1',
};
const api = async (path, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})},
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
  if (response.status === 204) return null;
  return response.json();
};
const postStatus = (state, description) => api(`/statuses/${expectedHeadSha}`, {
  method: 'POST',
  body: JSON.stringify({state, context, description: String(description).slice(0, 140)}),
  headers: {'Content-Type': 'application/json'},
});
const arrayPages = async path => {
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const values = await api(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) throw new Error(`GITHUB_PAGINATION_SHAPE_INVALID:${path}`);
    out.push(...values);
    if (values.length < 100) return out;
  }
  throw new Error(`GITHUB_PAGINATION_BOUND_EXCEEDED:${path}`);
};
const checkPages = async sha => {
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    const value = await api(`/commits/${sha}/check-runs?per_page=100&page=${page}`);
    if (!Array.isArray(value?.check_runs)) throw new Error('GITHUB_CHECK_RUNS_SHAPE_INVALID');
    out.push(...value.check_runs);
    if (value.check_runs.length < 100) return out;
  }
  throw new Error('GITHUB_CHECK_RUNS_PAGINATION_BOUND_EXCEEDED');
};
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const retryable = new Set(['REQUIRED_CONTEXT_MISSING', 'REQUIRED_CONTEXT_NOT_TERMINAL']);

let pendingPublished = false;
try {
  const initial = await api(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, initial, {
    repository,
    expectedHeadSha,
    noMergePolicy: landingPolicy.no_merge_policy,
  });
  await postStatus('pending', 'Waiting for exact-head scope requirements');
  pendingPublished = true;

  const files = await arrayPages(`/pulls/${prNumber}/files`);
  const scope = resolveScopeRequirements(files, initial, policy);
  let results = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      results = evaluateRequiredCheckRuns(await checkPages(expectedHeadSha), scope.required_contexts);
      break;
    } catch (error) {
      if (!(error instanceof GateFailure) || !retryable.has(error.code) || attempt === maxAttempts) throw error;
      await wait(delayMs);
    }
  }
  if (!results) throw new Error('SCOPE_AGGREGATOR_NO_TERMINAL_RESULT');
  const final = await api(`/pulls/${prNumber}`);
  assertStableFinalReread(initial, final, {
    repository,
    expectedHeadSha,
    noMergePolicy: landingPolicy.no_merge_policy,
  });
  await postStatus('success', `${scope.required_contexts.length} exact-head contexts verified`);
  console.log(JSON.stringify({
    id: 'kidults-scope-aware-authoritative-status-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS',
    pull_request: Number(prNumber),
    exact_head_sha: expectedHeadSha,
    scopes: scope.scopes,
    files_accounted_for: scope.files.length,
    required_contexts: scope.required_contexts,
    check_results: results,
    final_live_reread: true,
    zero_coverage_scopes: 0,
    technical_status_is_merge_authority: false,
    production: 'HOLD', public_release: 'HOLD', g5: 'HOLD',
  }, null, 2));
} catch (error) {
  if (pendingPublished) {
    try { await postStatus('failure', error?.code || error?.message || 'scope aggregation failed'); } catch {}
  }
  throw error;
}
