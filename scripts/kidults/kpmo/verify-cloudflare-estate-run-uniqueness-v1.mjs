#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const WORKFLOW_PATH = '.github/workflows/kidults-cloudflare-estate-inventory-v1.yml';
const WORKFLOW_FILE = 'kidults-cloudflare-estate-inventory-v1.yml';
const RUN_TITLE_PREFIX = 'KIDULTS Cloudflare Estate Inventory / comment-';
const SHA40 = /^[0-9a-f]{40}$/;

const fail = (code, detail = null) => {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
};
const requireValue = (condition, code, detail = null) => {
  if (!condition) fail(code, detail);
};

function evaluateRuns({runs, commentId, runId, runAttempt, sourceSha}) {
  requireValue(Array.isArray(runs), 'ACTIONS_RUNS_SHAPE_INVALID');
  requireValue(Number.isInteger(commentId) && commentId > 0, 'APPROVAL_COMMENT_ID_INVALID');
  requireValue(Number.isInteger(runId) && runId > 0, 'WORKFLOW_RUN_ID_INVALID');
  requireValue(runAttempt === 1, 'RERUN_FORBIDDEN');
  requireValue(SHA40.test(sourceSha), 'SOURCE_SHA_INVALID');
  const expectedTitle = `${RUN_TITLE_PREFIX}${commentId}`;
  const matching = runs.filter(run => String(run?.display_title || '') === expectedTitle);
  const siblings = matching.filter(run => Number(run?.id || 0) !== runId);
  requireValue(siblings.length === 0, `APPROVAL_COMMENT_ALREADY_HAS_OTHER_RUN_${siblings.length}`);
  const current = matching.filter(run => Number(run?.id || 0) === runId);
  requireValue(current.length <= 1, `CURRENT_RUN_CARDINALITY_${current.length}`);
  if (current.length === 1) {
    requireValue(current[0]?.event === 'issue_comment', 'CURRENT_RUN_EVENT_MISMATCH');
    requireValue(current[0]?.head_sha === sourceSha, 'CURRENT_RUN_SHA_MISMATCH');
    requireValue(Number(current[0]?.run_attempt || 0) === 1, 'CURRENT_RUN_ATTEMPT_MISMATCH');
  }
  return {
    expected_title: expectedTitle,
    indexed_current_run_count: current.length,
    prior_or_sibling_run_count: siblings.length,
  };
}

async function publicGitHubGet(endpoint) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${endpoint}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kidults-cloudflare-estate-one-shot-public-fail-closed-v1',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`PUBLIC_GITHUB_ACTIONS_READ_HTTP_${response.status}`, endpoint);
  return response.json();
}

function runSelfTest() {
  const sha = 'a'.repeat(40);
  const base = {commentId: 12345, runId: 99, runAttempt: 1, sourceSha: sha};
  const title = `${RUN_TITLE_PREFIX}${base.commentId}`;
  evaluateRuns({...base, runs: []});
  evaluateRuns({...base, runs: [{id: 99, display_title: title, event: 'issue_comment', head_sha: sha, run_attempt: 1}]});
  for (const mutation of [
    {...base, runs: [{id: 98, display_title: title, event: 'issue_comment', head_sha: sha, run_attempt: 1}]},
    {...base, runAttempt: 2, runs: []},
    {...base, runs: [{id: 99, display_title: title, event: 'push', head_sha: sha, run_attempt: 1}]},
    {...base, runs: [{id: 99, display_title: title, event: 'issue_comment', head_sha: 'b'.repeat(40), run_attempt: 1}]},
    {...base, runs: [
      {id: 99, display_title: title, event: 'issue_comment', head_sha: sha, run_attempt: 1},
      {id: 98, display_title: title, event: 'issue_comment', head_sha: sha, run_attempt: 1},
    ]},
  ]) {
    let rejected = false;
    try { evaluateRuns(mutation); } catch { rejected = true; }
    requireValue(rejected, 'NEGATIVE_MUTATION_NOT_REJECTED');
  }
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  for (const marker of [
    `run-name: ${RUN_TITLE_PREFIX}\${{ github.event.comment.id || 'none' }}`,
    'Verify cross-run one-shot approval uniqueness',
    'verify-cloudflare-estate-run-uniqueness-v1.mjs',
    "steps.uniqueness.outcome == 'success'",
  ]) requireValue(workflow.includes(marker), `WORKFLOW_UNIQUENESS_MARKER_MISSING:${marker}`);
  requireValue(!workflow.includes('actions: read'), 'ACTIONS_TOKEN_PERMISSION_FORBIDDEN');
  console.log(JSON.stringify({
    id: 'kidults-cloudflare-estate-run-uniqueness-self-test-v1',
    state: 'VERIFIED_PASS',
    duplicate_distinct_run_rejected: true,
    rerun_rejected: true,
    wrong_event_rejected: true,
    wrong_sha_rejected: true,
    unauthenticated_public_actions_read_required: true,
  }, null, 2));
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const outputPath = process.argv[2];
if (!outputPath) fail('RUN_UNIQUENESS_RECEIPT_PATH_REQUIRED');
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
const write = value => fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
const initial = {
  id: 'kidults-cloudflare-estate-run-uniqueness-v1',
  state: 'PREAUTHORIZATION_RUN_UNIQUENESS_PENDING',
  repository: process.env.GITHUB_REPOSITORY || null,
  workflow: WORKFLOW_PATH,
  source_sha: process.env.GITHUB_SHA || null,
  workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
  workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  approval_comment_id: Number(process.env.APPROVAL_COMMENT_ID || 0) || null,
  prior_or_sibling_run_count: null,
  provider_secret_resolution_started: false,
  cloudflare_request_count: 0,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
write(initial);

try {
  const repository = process.env.GITHUB_REPOSITORY || '';
  const sourceSha = process.env.GITHUB_SHA || '';
  const runId = Number(process.env.GITHUB_RUN_ID || 0);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0);
  const commentId = Number(process.env.APPROVAL_COMMENT_ID || 0);
  requireValue(repository === REPOSITORY, 'REPOSITORY_MISMATCH');
  requireValue(process.env.GITHUB_EVENT_NAME === 'issue_comment', 'EVENT_NOT_ISSUE_COMMENT');
  requireValue(process.env.GITHUB_REF === 'refs/heads/main', 'SOURCE_REF_NOT_MAIN');

  const runs = [];
  for (let page = 1; page <= 5; page += 1) {
    const payload = await publicGitHubGet(`/repos/${repository}/actions/runs?event=issue_comment&per_page=100&page=${page}`);
    requireValue(Array.isArray(payload?.workflow_runs), 'ACTIONS_RUNS_SHAPE_INVALID');
    runs.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) break;
    if (page === 5) fail('ACTIONS_RUNS_PAGINATION_BOUND_EXCEEDED');
  }
  const evaluated = evaluateRuns({runs, commentId, runId, runAttempt, sourceSha});
  const verified = {
    ...initial,
    ...evaluated,
    state: 'VERIFIED_UNIQUE_ONE_SHOT_RUN',
    prior_or_sibling_run_count: 0,
    public_github_actions_read_mode: 'UNAUTHENTICATED_PUBLIC_FAIL_CLOSED',
  };
  write(verified);
  console.log(JSON.stringify({
    state: verified.state,
    workflow_run_id: runId,
    approval_comment_id: commentId,
    indexed_current_run_count: verified.indexed_current_run_count,
    prior_or_sibling_run_count: 0,
  }, null, 2));
} catch (error) {
  write({
    ...initial,
    state: 'FAIL_CLOSED_DUPLICATE_OR_AMBIGUOUS_RUN',
    failure_code: String(error?.code || error?.message || 'UNKNOWN_RUN_UNIQUENESS_FAILURE').slice(0, 180),
    failure_detail: error?.detail ? String(error.detail).slice(0, 180) : null,
  });
  throw error;
}
