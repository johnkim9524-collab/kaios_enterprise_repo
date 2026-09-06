#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const TRANSPORT = 'DIRECT_OWNER_GITHUB_UI';

const fail = (code, detail = '') => {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
};
const requireCondition = (condition, code, detail = '') => {
  if (!condition) fail(code, detail);
};

export function assertWorkflowTransportBoundary(workflow) {
  requireCondition(workflow.includes('name: KIDULTS Atomic Governed Landing V1'),
    'ATOMIC_EVENT_TRANSPORT_WORKFLOW_IDENTITY_INVALID');
  requireCondition(/^\s{6}contents:\s*read\s*$/m.test(workflow),
    'ATOMIC_EVENT_TRANSPORT_CONTENTS_READ_REQUIRED');
  requireCondition(/^\s{6}pull-requests:\s*read\s*$/m.test(workflow),
    'ATOMIC_EVENT_TRANSPORT_PULL_REQUESTS_READ_REQUIRED');
  requireCondition(!/^\s+contents:\s*write\s*$/m.test(workflow),
    'ATOMIC_EVENT_TRANSPORT_CONTENTS_WRITE_FORBIDDEN');
  requireCondition(!/^\s+pull-requests:\s*write\s*$/m.test(workflow),
    'ATOMIC_EVENT_TRANSPORT_PULL_REQUESTS_WRITE_FORBIDDEN');
  requireCondition(!workflow.includes('ATOMIC_LANDING_GITHUB_TOKEN_POSTMERGE_CI_SUPPRESSED'),
    'ATOMIC_EVENT_TRANSPORT_LEGACY_BLOCKER_PRESENT');
  requireCondition(!workflow.includes('method: \'PUT\'') && !workflow.includes('/merge`'),
    'ATOMIC_EVENT_TRANSPORT_REPOSITORY_TOKEN_MERGE_FORBIDDEN');
  return {
    repository_token_can_merge: false,
    event_emitting_transport: TRANSPORT,
  };
}

export function validateTransportSnapshot(snapshot, expected) {
  for (const value of [expected?.baseSha, expected?.headSha, expected?.headTreeSha]) {
    requireCondition(SHA.test(value || ''), 'ATOMIC_EVENT_TRANSPORT_EXPECTED_SHA_INVALID');
  }
  requireCondition(snapshot?.repositoryOwner && snapshot.actor === snapshot.repositoryOwner,
    'ATOMIC_EVENT_TRANSPORT_OWNER_ACTOR_REQUIRED');
  requireCondition(snapshot?.mergeCommitAllowed === true,
    'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED');
  requireCondition(snapshot?.pr?.state === 'open' && snapshot.pr?.draft === false && snapshot.pr?.merged !== true,
    'ATOMIC_EVENT_TRANSPORT_PR_NOT_OPEN_READY');
  requireCondition(snapshot.pr?.base?.ref === 'main', 'ATOMIC_EVENT_TRANSPORT_BASE_REF_INVALID');
  requireCondition(snapshot.pr?.base?.sha === expected.baseSha, 'ATOMIC_EVENT_TRANSPORT_BASE_SHA_MISMATCH');
  requireCondition(snapshot.pr?.head?.sha === expected.headSha, 'ATOMIC_EVENT_TRANSPORT_HEAD_SHA_MISMATCH');
  requireCondition(snapshot?.mainSha === expected.baseSha, 'ATOMIC_EVENT_TRANSPORT_MAIN_SHA_MISMATCH');
  requireCondition(snapshot?.headTreeSha === expected.headTreeSha, 'ATOMIC_EVENT_TRANSPORT_HEAD_TREE_MISMATCH');
  requireCondition(snapshot.pr?.mergeable === true
    && ['clean', 'unstable', 'blocked', 'has_hooks'].includes(snapshot.pr?.mergeable_state),
  'ATOMIC_EVENT_TRANSPORT_PR_NOT_SERVER_MERGEABLE');
  return {
    exact_base_sha: expected.baseSha,
    exact_head_sha: expected.headSha,
    exact_head_tree_sha: expected.headTreeSha,
    identity_verified: true,
  };
}

function writeReceipt(receipt, receiptPath) {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true, mode: 0o700});
  const temporary = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  fs.renameSync(temporary, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
}

export function buildTransportFailureReceipt({repository, prNumber, baseSha, headSha, headTreeSha, actor, error} = {}) {
  return {
    id: 'kidults-atomic-event-emitting-transport-availability-v1', version: '1.0.0',
    state: 'VERIFIED_FAIL',
    failure_code: String(error?.code || error?.message || 'ATOMIC_EVENT_TRANSPORT_PREFLIGHT_FAILED')
      .split(':')[0].slice(0, 120),
    repository: /^[^/]+\/[^/]+$/.test(repository || '') ? repository : null,
    pull_request: /^\d+$/.test(prNumber || '') ? Number(prNumber) : null,
    exact_base_sha: SHA.test(baseSha || '') ? baseSha : null,
    exact_head_sha: SHA.test(headSha || '') ? headSha : null,
    exact_head_tree_sha: SHA.test(headTreeSha || '') ? headTreeSha : null,
    dispatch_actor: actor || null,
    transport: TRANSPORT,
    transport_available: false,
    authorization_consumed: false,
    repository_github_token_merge_forbidden: true,
    new_secret_required: false,
    permission_expansion_required: false,
    observed_at: new Date().toISOString(),
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}

async function selfTest() {
  const baseSha = 'a'.repeat(40);
  const headSha = 'b'.repeat(40);
  const headTreeSha = 'c'.repeat(40);
  const expected = {baseSha, headSha, headTreeSha};
  const snapshot = {
    repositoryOwner: 'owner', actor: 'owner', mergeCommitAllowed: true, mainSha: baseSha, headTreeSha,
    pr: {state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: 'blocked',
      base: {ref: 'main', sha: baseSha}, head: {sha: headSha}},
  };
  assert.equal(validateTransportSnapshot(snapshot, expected).identity_verified, true);
  const mutations = [
    [{...snapshot, actor: 'other'}, 'ATOMIC_EVENT_TRANSPORT_OWNER_ACTOR_REQUIRED'],
    [{...snapshot, mergeCommitAllowed: false}, 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED'],
    [{...snapshot, pr: {...snapshot.pr, draft: true}}, 'ATOMIC_EVENT_TRANSPORT_PR_NOT_OPEN_READY'],
    [{...snapshot, mainSha: 'd'.repeat(40)}, 'ATOMIC_EVENT_TRANSPORT_MAIN_SHA_MISMATCH'],
    [{...snapshot, headTreeSha: 'd'.repeat(40)}, 'ATOMIC_EVENT_TRANSPORT_HEAD_TREE_MISMATCH'],
    [{...snapshot, pr: {...snapshot.pr, head: {sha: 'd'.repeat(40)}}}, 'ATOMIC_EVENT_TRANSPORT_HEAD_SHA_MISMATCH'],
  ];
  for (const [mutated, code] of mutations) assert.throws(() => validateTransportSnapshot(mutated, expected), new RegExp(code));
  const safeWorkflow = `name: KIDULTS Atomic Governed Landing V1\n      contents: read\n      pull-requests: read\n`;
  assert.equal(assertWorkflowTransportBoundary(safeWorkflow).repository_token_can_merge, false);
  assert.throws(() => assertWorkflowTransportBoundary(`${safeWorkflow}      contents: write\n`),
    /ATOMIC_EVENT_TRANSPORT_CONTENTS_WRITE_FORBIDDEN/);
  const failure = buildTransportFailureReceipt({repository: 'owner/repo', prNumber: '42', baseSha,
    headSha, headTreeSha, actor: 'owner', error: {code: 'ATOMIC_EVENT_TRANSPORT_MAIN_SHA_MISMATCH'}});
  assert.equal(failure.state, 'VERIFIED_FAIL');
  assert.equal(failure.authorization_consumed, false);
  console.log(JSON.stringify({
    id: 'kidults-atomic-event-emitting-transport-preflight-self-test-v1',
    state: 'VERIFIED_PASS',
    negative_mutations_rejected: mutations.length + 1,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  }));
}

async function main() {
  const token = process.env.GH_TOKEN || '';
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const actor = process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR || '';
  const prNumber = process.env.PR_NUMBER || '';
  const baseSha = process.env.EXPECTED_BASE_SHA || '';
  const headSha = process.env.EXPECTED_HEAD_SHA || '';
  const headTreeSha = process.env.EXPECTED_HEAD_TREE_SHA || '';
  const receiptPath = process.env.ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH || '';
  const waitSeconds = Number(process.env.ATOMIC_EVENT_TRANSPORT_WAIT_SECONDS || '600');
  requireCondition(token && /^[^/]+\/[^/]+$/.test(repository) && /^\d+$/.test(prNumber),
    'ATOMIC_EVENT_TRANSPORT_ENVIRONMENT_INVALID');
  requireCondition(process.env.GITHUB_REF === 'refs/heads/main', 'ATOMIC_EVENT_TRANSPORT_MAIN_REF_REQUIRED');
  requireCondition(process.env.GITHUB_RUN_ATTEMPT === '1', 'ATOMIC_EVENT_TRANSPORT_RERUN_FORBIDDEN');
  requireCondition(receiptPath, 'ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH_REQUIRED');
  requireCondition(Number.isInteger(waitSeconds) && waitSeconds >= 60 && waitSeconds <= 900,
    'ATOMIC_EVENT_TRANSPORT_WAIT_WINDOW_INVALID');
  assertWorkflowTransportBoundary(fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8'));

  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kidults-atomic-event-transport-preflight-v1'};
  const request = async apiPath => {
    const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {headers, redirect: 'error'});
    const payload = await response.json().catch(() => null);
    if (!response.ok) fail(`ATOMIC_EVENT_TRANSPORT_GITHUB_API_${response.status}`);
    return payload;
  };
  const [repositoryState, pr, mainBranch, headCommit] = await Promise.all([
    request(''), request(`/pulls/${prNumber}`), request('/branches/main'), request(`/git/commits/${headSha}`),
  ]);
  const identity = validateTransportSnapshot({
    repositoryOwner: repositoryState?.owner?.login,
    actor,
    mergeCommitAllowed: repositoryState?.allow_merge_commit,
    pr,
    mainSha: mainBranch?.commit?.sha,
    headTreeSha: headCommit?.tree?.sha,
  }, {baseSha, headSha, headTreeSha});
  const checkedAt = new Date();
  const receipt = {
    id: 'kidults-atomic-event-emitting-transport-availability-v1', version: '1.0.0',
    state: 'AVAILABLE_POSTMERGE_EVENT_PROOF_REQUIRED', repository, pull_request: Number(prNumber),
    ...identity, repository_owner: repositoryState.owner.login, dispatch_actor: actor,
    transport: TRANSPORT, transport_available: true, authorization_consumed: false,
    merge_performed_by_workflow: false, repository_github_token_merge_forbidden: true,
    event_emitting_push_required: true, new_secret_required: false, permission_expansion_required: false,
    checked_at: checkedAt.toISOString(), expires_at: new Date(checkedAt.getTime() + (waitSeconds + 60) * 1000).toISOString(),
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
  writeReceipt(receipt, receiptPath);
  console.log(JSON.stringify(receipt));
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  if (process.argv.includes('--self-test')) await selfTest();
  else await main().catch(error => {
    const receiptPath = process.env.ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH || '';
    if (receiptPath) {
      try {
        writeReceipt(buildTransportFailureReceipt({
          repository: process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '',
          prNumber: process.env.PR_NUMBER || '',
          baseSha: process.env.EXPECTED_BASE_SHA || '',
          headSha: process.env.EXPECTED_HEAD_SHA || '',
          headTreeSha: process.env.EXPECTED_HEAD_TREE_SHA || '',
          actor: process.env.LANDING_ACTOR || process.env.GITHUB_ACTOR || '',
          error,
        }), receiptPath);
      } catch {}
    }
    console.error(error.code || error.message);
    process.exit(1);
  });
}
