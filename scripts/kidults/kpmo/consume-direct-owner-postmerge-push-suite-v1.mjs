#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const shaPattern = /^[0-9a-f]{40}$/;
const receiptId = 'kidults-direct-owner-landing-handoff-receipt-v1';
const policyPath = process.env.POSTMERGE_PUSH_SUITE_POLICY_PATH || 'coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json';

function codedError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function requireCondition(condition, code, details = null) {
  if (!condition) throw codedError(code, details);
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw codedError(code);
  }
}

function validatePolicy(policy) {
  requireCondition(policy?.id === 'direct-owner-postmerge-push-suite-policy-v1', 'DIRECT_OWNER_POSTMERGE_POLICY_ID_INVALID');
  requireCondition(policy?.version === '1.0.0', 'DIRECT_OWNER_POSTMERGE_POLICY_VERSION_INVALID');
  requireCondition(policy?.branch === 'main' && policy?.event === 'push', 'DIRECT_OWNER_POSTMERGE_POLICY_EVENT_INVALID');
  requireCondition(Number.isInteger(policy?.max_pages) && policy.max_pages >= 1 && policy.max_pages <= 10, 'DIRECT_OWNER_POSTMERGE_POLICY_MAX_PAGES_INVALID');
  requireCondition(Number.isInteger(policy?.poll_interval_seconds) && policy.poll_interval_seconds >= 1 && policy.poll_interval_seconds <= 15, 'DIRECT_OWNER_POSTMERGE_POLICY_POLL_INVALID');
  requireCondition(Number.isInteger(policy?.max_wait_seconds) && policy.max_wait_seconds >= 0 && policy.max_wait_seconds <= 120, 'DIRECT_OWNER_POSTMERGE_POLICY_WAIT_INVALID');
  requireCondition(Array.isArray(policy?.accepted_terminal_conclusions) && policy.accepted_terminal_conclusions.length >= 1, 'DIRECT_OWNER_POSTMERGE_POLICY_CONCLUSIONS_INVALID');
  requireCondition(Array.isArray(policy?.required_workflows) && policy.required_workflows.length >= 1, 'DIRECT_OWNER_POSTMERGE_POLICY_REQUIRED_WORKFLOWS_INVALID');
  const paths = policy.required_workflows.map(item => item?.path);
  requireCondition(paths.every(value => typeof value === 'string' && /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(value)), 'DIRECT_OWNER_POSTMERGE_POLICY_WORKFLOW_PATH_INVALID');
  requireCondition(new Set(paths).size === paths.length, 'DIRECT_OWNER_POSTMERGE_POLICY_WORKFLOW_PATH_DUPLICATE');
  requireCondition(policy.required_workflows.every(item => typeof item?.name === 'string' && item.name.length > 0), 'DIRECT_OWNER_POSTMERGE_POLICY_WORKFLOW_NAME_INVALID');
  requireCondition(policy?.proof_contract?.exact_merge_sha_only === true, 'DIRECT_OWNER_POSTMERGE_POLICY_EXACT_SHA_REQUIRED');
  requireCondition(policy?.proof_contract?.predecessor_head_proof_reuse_forbidden === true, 'DIRECT_OWNER_POSTMERGE_POLICY_PREDECESSOR_REUSE_FORBIDDEN');
  requireCondition(policy?.proof_contract?.all_required_workflows_must_be_present === true, 'DIRECT_OWNER_POSTMERGE_POLICY_REQUIRED_SET_INVALID');
  requireCondition(policy?.proof_contract?.all_required_workflows_must_be_terminal === true, 'DIRECT_OWNER_POSTMERGE_POLICY_TERMINAL_REQUIRED');
  requireCondition(policy?.proof_contract?.production === 'HOLD' && policy?.proof_contract?.public === 'HOLD' && policy?.proof_contract?.g5 === 'HOLD', 'DIRECT_OWNER_POSTMERGE_POLICY_HOLD_BOUNDARY_INVALID');
  return policy;
}

export function evaluatePostMergePushSuite(runs, policy, mergeSha, mergedAt) {
  requireCondition(shaPattern.test(mergeSha || ''), 'DIRECT_OWNER_POSTMERGE_MERGE_SHA_INVALID');
  requireCondition(Array.isArray(runs), 'DIRECT_OWNER_POSTMERGE_RUNS_INVALID');
  const mergedAtMs = Date.parse(mergedAt || '');
  requireCondition(Number.isFinite(mergedAtMs), 'DIRECT_OWNER_POSTMERGE_MERGED_AT_INVALID');

  const exactRuns = runs.filter(run => run?.head_sha === mergeSha && run?.event === policy.event && run?.head_branch === policy.branch);
  const required = [];
  const waiting = [];
  const invalid = [];

  for (const expected of policy.required_workflows) {
    const matches = exactRuns.filter(run => run?.path === expected.path);
    if (matches.length === 0) {
      waiting.push({path: expected.path, reason: 'MISSING'});
      continue;
    }
    if (matches.length !== 1) {
      invalid.push({path: expected.path, reason: 'AMBIGUOUS_MULTIPLE_RUNS', run_ids: matches.map(run => run.id)});
      continue;
    }
    const run = matches[0];
    if (run?.name !== expected.name) {
      invalid.push({path: expected.path, reason: 'NAME_PATH_MISMATCH', observed_name: run?.name || null});
      continue;
    }
    const createdAtMs = Date.parse(run?.created_at || '');
    if (!Number.isFinite(createdAtMs) || createdAtMs < mergedAtMs) {
      invalid.push({path: expected.path, reason: 'PREMERGE_OR_INVALID_CREATED_AT', created_at: run?.created_at || null});
      continue;
    }
    if (run?.status !== 'completed') {
      waiting.push({path: expected.path, reason: 'NOT_TERMINAL', status: run?.status || null, run_id: run?.id || null});
      continue;
    }
    if (!policy.accepted_terminal_conclusions.includes(run?.conclusion)) {
      invalid.push({path: expected.path, reason: 'TERMINAL_CONCLUSION_FORBIDDEN', conclusion: run?.conclusion || null, run_id: run?.id || null});
      continue;
    }
    required.push({
      path: expected.path,
      name: expected.name,
      run_id: Number(run.id),
      run_attempt: Number(run.run_attempt || 1),
      conclusion: run.conclusion,
      created_at: run.created_at,
      updated_at: run.updated_at || null,
    });
  }

  const successCount = required.filter(run => run.conclusion === 'success').length;
  const failureCount = required.filter(run => run.conclusion === 'failure').length;
  return {
    ready: waiting.length === 0 && invalid.length === 0 && required.length === policy.required_workflows.length,
    exact_run_count: exactRuns.length,
    required,
    waiting,
    invalid,
    success_count: successCount,
    failure_count: failureCount,
    all_required_success: required.length === policy.required_workflows.length && failureCount === 0,
  };
}

async function selfTest() {
  const policy = validatePolicy(readJson(policyPath, 'DIRECT_OWNER_POSTMERGE_POLICY_JSON_INVALID'));
  const mergeSha = 'a'.repeat(40);
  const predecessorSha = 'b'.repeat(40);
  const mergedAt = '2026-09-05T00:00:00Z';
  const positive = policy.required_workflows.map((item, index) => ({
    id: 1000 + index,
    name: item.name,
    path: item.path,
    head_sha: mergeSha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: index === 1 ? 'failure' : 'success',
    run_attempt: 1,
    created_at: '2026-09-05T00:00:01Z',
    updated_at: '2026-09-05T00:00:02Z',
  }));
  const accepted = evaluatePostMergePushSuite(positive, policy, mergeSha, mergedAt);
  assert.equal(accepted.ready, true);
  assert.equal(accepted.failure_count, 1);
  assert.equal(accepted.all_required_success, false);

  const missing = evaluatePostMergePushSuite(positive.slice(1), policy, mergeSha, mergedAt);
  assert.equal(missing.ready, false);
  assert.equal(missing.waiting[0].reason, 'MISSING');

  const predecessorOnly = positive.map(run => ({...run, head_sha: predecessorSha}));
  assert.equal(evaluatePostMergePushSuite(predecessorOnly, policy, mergeSha, mergedAt).ready, false);

  const prOnly = positive.map(run => ({...run, event: 'pull_request'}));
  assert.equal(evaluatePostMergePushSuite(prOnly, policy, mergeSha, mergedAt).ready, false);

  const nonTerminal = structuredClone(positive);
  nonTerminal[0].status = 'in_progress';
  nonTerminal[0].conclusion = null;
  assert.equal(evaluatePostMergePushSuite(nonTerminal, policy, mergeSha, mergedAt).waiting[0].reason, 'NOT_TERMINAL');

  const cancelled = structuredClone(positive);
  cancelled[0].conclusion = 'cancelled';
  assert.equal(evaluatePostMergePushSuite(cancelled, policy, mergeSha, mergedAt).invalid[0].reason, 'TERMINAL_CONCLUSION_FORBIDDEN');

  const duplicate = [...positive, {...positive[0], id: 9001}];
  assert.equal(evaluatePostMergePushSuite(duplicate, policy, mergeSha, mergedAt).invalid[0].reason, 'AMBIGUOUS_MULTIPLE_RUNS');

  console.log(JSON.stringify({
    state: 'VERIFIED_PASS',
    contract: 'DIRECT_OWNER_POSTMERGE_PUSH_SUITE_CONSUMER_V1',
    negative_mutations_rejected: 6,
    terminal_failure_preserved_as_evidence: true,
    predecessor_head_proof_reuse_forbidden: true,
  }));
}

async function main() {
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || '';
  const receiptPath = process.env.HANDOFF_RECEIPT_PATH || 'out/direct-owner-landing-handoff-v1/receipt.json';
  requireCondition(repository && /^[^/]+\/[^/]+$/.test(repository), 'DIRECT_OWNER_POSTMERGE_REPOSITORY_INVALID');
  requireCondition(token, 'DIRECT_OWNER_POSTMERGE_GITHUB_TOKEN_REQUIRED');
  const policy = validatePolicy(readJson(policyPath, 'DIRECT_OWNER_POSTMERGE_POLICY_JSON_INVALID'));
  const receipt = readJson(receiptPath, 'DIRECT_OWNER_POSTMERGE_RECEIPT_JSON_INVALID');
  requireCondition(receipt?.id === receiptId, 'DIRECT_OWNER_POSTMERGE_RECEIPT_ID_INVALID');
  requireCondition(receipt?.state === 'CONSUMED_BY_DIRECT_OWNER_MERGE', 'DIRECT_OWNER_POSTMERGE_RECEIPT_STATE_INVALID');
  requireCondition(shaPattern.test(receipt?.merge_commit_sha || ''), 'DIRECT_OWNER_POSTMERGE_RECEIPT_MERGE_SHA_INVALID');
  requireCondition(receipt?.merged_by && receipt.merged_by === receipt.direct_owner, 'DIRECT_OWNER_POSTMERGE_RECEIPT_MERGE_ACTOR_INVALID');
  requireCondition(receipt?.production === 'HOLD' && receipt?.public === 'HOLD' && receipt?.g5 === 'HOLD', 'DIRECT_OWNER_POSTMERGE_RECEIPT_HOLD_BOUNDARY_INVALID');

  const mergeSha = receipt.merge_commit_sha;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-direct-owner-postmerge-push-suite-consumer-v1',
  };
  const request = async apiPath => {
    const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {headers, redirect: 'error'});
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw codedError(`DIRECT_OWNER_POSTMERGE_GITHUB_API_${response.status}`);
    return payload;
  };
  const readRuns = async () => {
    const output = [];
    for (let page = 1; page <= policy.max_pages; page += 1) {
      const query = new URLSearchParams({
        branch: policy.branch,
        event: policy.event,
        head_sha: mergeSha,
        per_page: '100',
        page: String(page),
      });
      const payload = await request(`/actions/runs?${query.toString()}`);
      requireCondition(Array.isArray(payload?.workflow_runs), 'DIRECT_OWNER_POSTMERGE_RUN_LIST_SHAPE_INVALID');
      output.push(...payload.workflow_runs);
      if (payload.workflow_runs.length < 100) return output;
    }
    throw codedError('DIRECT_OWNER_POSTMERGE_RUN_PAGINATION_BOUND_EXCEEDED');
  };

  const currentMain = await request('/branches/main');
  requireCondition(currentMain?.commit?.sha === mergeSha, 'DIRECT_OWNER_POSTMERGE_MAIN_ADVANCED_BEFORE_CONSUMPTION');

  const waitSeconds = Number(process.env.POSTMERGE_PUSH_SUITE_WAIT_SECONDS || policy.max_wait_seconds);
  requireCondition(Number.isInteger(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 120, 'DIRECT_OWNER_POSTMERGE_WAIT_SECONDS_INVALID');
  const deadline = Date.now() + waitSeconds * 1000;
  let evaluation = null;
  let runs = [];
  while (true) {
    runs = await readRuns();
    evaluation = evaluatePostMergePushSuite(runs, policy, mergeSha, receipt.merged_at);
    if (evaluation.invalid.length > 0) throw codedError('DIRECT_OWNER_POSTMERGE_PUSH_SUITE_INVALID', evaluation);
    if (evaluation.ready) break;
    if (Date.now() >= deadline) throw codedError('DIRECT_OWNER_POSTMERGE_PUSH_SUITE_NOT_TERMINAL', evaluation);
    await new Promise(resolve => setTimeout(resolve, policy.poll_interval_seconds * 1000));
  }

  const requiredRunIds = evaluation.required.map(run => run.run_id);
  const postMergeProof = {
    id: 'direct-owner-postmerge-push-suite-receipt-v1',
    state: 'CONSUMED_EXACT_MERGE_SHA_PUSH_SUITE',
    exact_merge_sha: mergeSha,
    event: policy.event,
    branch: policy.branch,
    policy_id: policy.id,
    required_workflow_count: policy.required_workflows.length,
    observed_exact_push_run_count: evaluation.exact_run_count,
    required_workflows: evaluation.required,
    required_run_ids: requiredRunIds,
    required_success_count: evaluation.success_count,
    required_failure_count: evaluation.failure_count,
    all_required_terminal: true,
    all_required_success: evaluation.all_required_success,
    terminal_failure_preserved_as_fail_closed_evidence: evaluation.failure_count > 0,
    predecessor_head_proof_reused: false,
    consumed_at: new Date().toISOString(),
    promotion_eligible: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
  const updated = {
    ...receipt,
    version: '1.1.0',
    post_merge_push_suite: postMergeProof,
    post_merge_push_suite_consumed: true,
    promotion_eligible: false,
  };
  const directory = path.dirname(receiptPath);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const temporary = `${receiptPath}.postmerge-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'w'});
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
  console.log(JSON.stringify(postMergeProof));
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  try {
    await main();
  } catch (error) {
    const failureCode = String(error?.code || error?.message || 'DIRECT_OWNER_POSTMERGE_PUSH_SUITE_FAILED').split(':')[0].slice(0, 120);
    const receiptPath = process.env.HANDOFF_RECEIPT_PATH || 'out/direct-owner-landing-handoff-v1/receipt.json';
    try {
      const receipt = readJson(receiptPath, 'DIRECT_OWNER_POSTMERGE_RECEIPT_JSON_INVALID');
      const failed = {
        ...receipt,
        state: 'VERIFIED_FAIL',
        prior_merge_terminal_state: receipt?.state || null,
        failure_code: failureCode,
        post_merge_push_suite_consumed: false,
        post_merge_push_suite: {
          id: 'direct-owner-postmerge-push-suite-receipt-v1',
          state: 'VERIFIED_FAIL',
          failure_code: failureCode,
          exact_merge_sha: receipt?.merge_commit_sha || null,
          predecessor_head_proof_reused: false,
          promotion_eligible: false,
          production: 'HOLD',
          public: 'HOLD',
          g5: 'HOLD',
        },
        promotion_eligible: false,
        production: 'HOLD',
        public: 'HOLD',
        g5: 'HOLD',
      };
      const temporary = `${receiptPath}.postmerge-fail-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(failed, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'w'});
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, receiptPath);
      fs.chmodSync(receiptPath, 0o600);
    } catch {}
    console.error(failureCode);
    process.exit(1);
  }
}
