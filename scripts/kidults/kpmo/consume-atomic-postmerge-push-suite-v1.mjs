#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  evaluatePostMergePushSuite,
  validatePolicy,
} from './consume-direct-owner-postmerge-push-suite-v1.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ASSURANCE_PATH = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const fail = (code, details = null) => {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
};
const requireCondition = (condition, code, details = null) => {
  if (!condition) fail(code, details);
};
const readJson = (filename, code) => {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { fail(code); }
};
const writeReceipt = (receipt, receiptPath) => {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true, mode: 0o700});
  const temporary = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'w'});
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
};

export function buildAtomicPostMergeReceipt({
  repository, baseSha, headSha, headTreeSha, mergeSha, mergedAt, evaluation,
  canonicalConvergence = null, failureCode = null,
} = {}) {
  const allTerminal = evaluation?.ready === true;
  const allSuccess = allTerminal && evaluation?.all_required_success === true;
  const failures = (evaluation?.required || []).filter(run => run.conclusion === 'failure');
  const canonicalConverged = canonicalConvergence?.state === 'VERIFIED_PASS';
  const convergedStartup = allTerminal && canonicalConverged
    && failures.length === 1 && failures[0].path === ASSURANCE_PATH;
  const state = !failureCode && canonicalConverged && (allSuccess || convergedStartup)
    ? 'VERIFIED_PASS' : 'VERIFIED_FAIL';
  return {
    id: 'kidults-atomic-postmerge-push-suite-receipt-v1', version: '1.0.0', state,
    failure_code: state === 'VERIFIED_FAIL'
      ? failureCode || 'ATOMIC_POSTMERGE_REQUIRED_WORKFLOW_FAILURE'
      : null,
    repository, exact_base_sha: baseSha, exact_head_sha: headSha,
    exact_head_tree_sha: headTreeSha, exact_merge_sha: mergeSha, merged_at: mergedAt,
    event: 'push', branch: 'main',
    all_required_present: allTerminal && evaluation.waiting.length === 0,
    all_required_terminal: allTerminal,
    all_required_success: allSuccess,
    required_workflows: evaluation?.required || [],
    canonical_convergence: canonicalConvergence,
    startup_race_preserved_as_evidence: convergedStartup,
    waiting: evaluation?.waiting || [],
    invalid: evaluation?.invalid || [],
    predecessor_head_proof_reused: false,
    terminal_pass_before_postmerge_success: false,
    promotion_eligible: false,
    observed_at: new Date().toISOString(),
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}

export function evaluateCanonicalConvergence(runs, policy, mergeSha, mergedAt) {
  requireCondition(Array.isArray(runs), 'ATOMIC_POSTMERGE_CANONICAL_RUNS_INVALID');
  requireCondition(SHA.test(mergeSha || ''), 'ATOMIC_POSTMERGE_CANONICAL_SHA_INVALID');
  const config = policy?.canonical_convergence;
  requireCondition(config?.exact_merge_sha_required === true
    && config?.producer_before_consumer_required === true
    && config?.terminal_success_required === true,
  'ATOMIC_POSTMERGE_CANONICAL_POLICY_INVALID');
  const mergedAtMs = Date.parse(mergedAt || '');
  const select = expected => runs.filter(run => run?.head_sha === mergeSha
    && run?.head_branch === 'main' && run?.path === expected.path
    && run?.name === expected.name && run?.event === expected.event
    && run?.status === 'completed' && run?.conclusion === 'success'
    && Date.parse(run?.created_at || '') >= mergedAtMs);
  const producers = select(config.producer);
  const consumers = select(config.consumer);
  if (producers.length !== 1 || consumers.length !== 1) {
    return {state: 'WAITING', producer_success_count: producers.length,
      consumer_success_count: consumers.length};
  }
  const producer = producers[0];
  const consumer = consumers[0];
  const producerCompleted = Date.parse(producer.updated_at || '');
  const consumerCreated = Date.parse(consumer.created_at || '');
  if (!Number.isFinite(producerCompleted) || !Number.isFinite(consumerCreated)
      || consumerCreated < producerCompleted) {
    return {state: 'VERIFIED_FAIL', failure_code: 'CANONICAL_CONSUMER_PRECEDES_PRODUCER',
      producer_run_id: Number(producer.id), consumer_run_id: Number(consumer.id)};
  }
  return {
    state: 'VERIFIED_PASS', exact_merge_sha: mergeSha,
    producer_run_id: Number(producer.id), producer_event: producer.event,
    producer_completed_at: producer.updated_at,
    consumer_run_id: Number(consumer.id), consumer_event: consumer.event,
    consumer_created_at: consumer.created_at,
    failed_push_reinterpreted_as_success: false,
  };
}

async function selfTest() {
  const policy = validatePolicy(readJson(
    process.env.POSTMERGE_PUSH_SUITE_POLICY_PATH
      || 'coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json',
    'ATOMIC_POSTMERGE_POLICY_INVALID',
  ));
  const mergeSha = 'd'.repeat(40);
  const mergedAt = '2026-09-06T00:00:00Z';
  const runs = policy.required_workflows.map((item, index) => ({
    id: 2000 + index, workflow_id: 10 + index, name: item.name, path: item.path,
    head_sha: mergeSha, head_branch: 'main', event: 'push', status: 'completed',
    conclusion: 'success', run_attempt: 1, created_at: '2026-09-06T00:00:01Z',
    updated_at: '2026-09-06T00:00:02Z',
  }));
  const success = evaluatePostMergePushSuite(runs, policy, mergeSha, mergedAt);
  const producer = {id: 3001, name: policy.canonical_convergence.producer.name,
    path: policy.canonical_convergence.producer.path, head_sha: mergeSha, head_branch: 'main',
    event: 'push', status: 'completed', conclusion: 'success',
    created_at: '2026-09-06T00:00:01Z', updated_at: '2026-09-06T00:00:03Z'};
  const consumer = {id: 3002, name: policy.canonical_convergence.consumer.name,
    path: policy.canonical_convergence.consumer.path, head_sha: mergeSha, head_branch: 'main',
    event: 'workflow_run', status: 'completed', conclusion: 'success',
    created_at: '2026-09-06T00:00:04Z', updated_at: '2026-09-06T00:00:05Z'};
  const convergence = evaluateCanonicalConvergence([...runs, producer, consumer], policy, mergeSha, mergedAt);
  assert.equal(convergence.state, 'VERIFIED_PASS');
  const base = {repository: 'owner/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
    headTreeSha: 'c'.repeat(40), mergeSha, mergedAt};
  assert.equal(buildAtomicPostMergeReceipt({...base, evaluation: success,
    canonicalConvergence: convergence}).state, 'VERIFIED_PASS');
  assert.equal(buildAtomicPostMergeReceipt({...base, evaluation: success}).state, 'VERIFIED_FAIL');
  const assuranceFailure = structuredClone(runs);
  assuranceFailure.find(run => run.path === ASSURANCE_PATH).conclusion = 'failure';
  const convergedFailure = evaluatePostMergePushSuite(assuranceFailure, policy, mergeSha, mergedAt);
  assert.equal(buildAtomicPostMergeReceipt({...base, evaluation: convergedFailure,
    canonicalConvergence: convergence}).state, 'VERIFIED_PASS');
  assert.equal(buildAtomicPostMergeReceipt({...base, evaluation: convergedFailure,
    canonicalConvergence: {state: 'WAITING'}}).state, 'VERIFIED_FAIL');
  assert.equal(evaluateCanonicalConvergence([producer, {...consumer, head_sha: 'e'.repeat(40)}],
    policy, mergeSha, mergedAt).state, 'WAITING');
  assert.equal(evaluateCanonicalConvergence([producer, {...consumer,
    created_at: '2026-09-06T00:00:02Z'}], policy, mergeSha, mergedAt).state, 'VERIFIED_FAIL');
  const failedRuns = structuredClone(runs);
  failedRuns[0].conclusion = 'failure';
  const failed = evaluatePostMergePushSuite(failedRuns, policy, mergeSha, mergedAt);
  assert.equal(buildAtomicPostMergeReceipt({...base, evaluation: failed}).state, 'VERIFIED_FAIL');
  const partial = evaluatePostMergePushSuite(runs.slice(1), policy, mergeSha, mergedAt);
  const partialReceipt = buildAtomicPostMergeReceipt({...base, evaluation: partial,
    failureCode: 'ATOMIC_POSTMERGE_PUSH_SUITE_TIMEOUT'});
  assert.equal(partialReceipt.state, 'VERIFIED_FAIL');
  assert.equal(partialReceipt.all_required_terminal, false);
  const predecessor = evaluatePostMergePushSuite(runs.map(run => ({...run, head_sha: 'e'.repeat(40)})),
    policy, mergeSha, mergedAt);
  assert.equal(predecessor.ready, false);
  console.log(JSON.stringify({
    id: 'kidults-atomic-postmerge-push-suite-self-test-v1', state: 'VERIFIED_PASS',
    terminal_success_verified: true, terminal_failure_rejected: true,
    timeout_partial_execution_rejected: true, predecessor_reuse_rejected: true,
    same_sha_canonical_convergence_required: true,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  }));
}

async function main() {
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || '';
  const baseSha = process.env.EXPECTED_BASE_SHA || '';
  const headSha = process.env.EXPECTED_HEAD_SHA || '';
  const headTreeSha = process.env.EXPECTED_HEAD_TREE_SHA || '';
  const mergeSha = process.env.EXACT_MERGE_SHA || '';
  const mergedAt = process.env.MERGED_AT || '';
  const receiptPath = process.env.ATOMIC_POSTMERGE_PUSH_SUITE_RECEIPT_PATH || '';
  const policy = validatePolicy(readJson(process.env.POSTMERGE_PUSH_SUITE_POLICY_PATH
    || 'coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json',
  'ATOMIC_POSTMERGE_POLICY_INVALID'));
  for (const value of [baseSha, headSha, headTreeSha, mergeSha]) {
    requireCondition(SHA.test(value), 'ATOMIC_POSTMERGE_SHA_BINDING_INVALID');
  }
  requireCondition(token && /^[^/]+\/[^/]+$/.test(repository) && receiptPath,
    'ATOMIC_POSTMERGE_ENVIRONMENT_INVALID');
  requireCondition(Number.isFinite(Date.parse(mergedAt)), 'ATOMIC_POSTMERGE_MERGED_AT_INVALID');
  const waitSeconds = Number(process.env.POSTMERGE_PUSH_SUITE_WAIT_SECONDS || policy.max_wait_seconds);
  requireCondition(Number.isInteger(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 120,
    'ATOMIC_POSTMERGE_WAIT_INVALID');

  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kidults-atomic-postmerge-push-suite-v1'};
  const request = async apiPath => {
    const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {headers, redirect: 'error'});
    const payload = await response.json().catch(() => null);
    if (!response.ok) fail(`ATOMIC_POSTMERGE_GITHUB_API_${response.status}`);
    return payload;
  };
  const readRuns = async event => {
    const output = [];
    for (let page = 1; page <= policy.max_pages; page += 1) {
      const query = new URLSearchParams({branch: 'main', head_sha: mergeSha,
        per_page: '100', page: String(page)});
      if (event) query.set('event', event);
      const payload = await request(`/actions/runs?${query}`);
      requireCondition(Array.isArray(payload?.workflow_runs), 'ATOMIC_POSTMERGE_RUN_LIST_INVALID');
      output.push(...payload.workflow_runs);
      if (payload.workflow_runs.length < 100) return output;
    }
    fail('ATOMIC_POSTMERGE_RUN_PAGINATION_BOUND_EXCEEDED');
  };

  let evaluation = null;
  let canonicalConvergence = null;
  try {
    const mergeCommit = await request(`/git/commits/${mergeSha}`);
    requireCondition(mergeCommit?.tree?.sha === headTreeSha, 'ATOMIC_POSTMERGE_TREE_MISMATCH');
    requireCondition(Array.isArray(mergeCommit?.parents) && mergeCommit.parents.length === 2
      && mergeCommit.parents[0]?.sha === baseSha && mergeCommit.parents[1]?.sha === headSha,
    'ATOMIC_POSTMERGE_PARENT_MISMATCH');
    const deadline = Date.now() + waitSeconds * 1000;
    while (true) {
      const mainBranch = await request('/branches/main');
      requireCondition(mainBranch?.commit?.sha === mergeSha, 'ATOMIC_POSTMERGE_MAIN_SHA_MISMATCH');
      evaluation = evaluatePostMergePushSuite(await readRuns('push'), policy, mergeSha, mergedAt);
      canonicalConvergence = evaluateCanonicalConvergence(await readRuns(), policy, mergeSha, mergedAt);
      if (evaluation.invalid.length) fail('ATOMIC_POSTMERGE_PUSH_SUITE_INVALID', evaluation);
      if (canonicalConvergence.state === 'VERIFIED_FAIL') {
        fail(canonicalConvergence.failure_code, canonicalConvergence);
      }
      if (evaluation.ready && canonicalConvergence.state === 'VERIFIED_PASS') break;
      if (Date.now() >= deadline) fail('ATOMIC_POSTMERGE_PUSH_SUITE_TIMEOUT', evaluation);
      await new Promise(resolve => setTimeout(resolve, policy.poll_interval_seconds * 1000));
    }
    const receipt = buildAtomicPostMergeReceipt({repository, baseSha, headSha, headTreeSha,
      mergeSha, mergedAt, evaluation, canonicalConvergence});
    writeReceipt(receipt, receiptPath);
    if (receipt.state !== 'VERIFIED_PASS') fail(receipt.failure_code, evaluation);
    console.log(JSON.stringify(receipt));
  } catch (error) {
    const receipt = buildAtomicPostMergeReceipt({repository, baseSha, headSha, headTreeSha,
      mergeSha, mergedAt, evaluation: error.details || evaluation, canonicalConvergence,
      failureCode: error.code || error.message});
    try { writeReceipt(receipt, receiptPath); } catch {}
    throw error;
  }
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  if (process.argv.includes('--self-test')) await selfTest();
  else await main().catch(error => { console.error(error.code || error.message); process.exit(1); });
}
