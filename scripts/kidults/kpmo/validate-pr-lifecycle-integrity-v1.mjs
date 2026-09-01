import fs from 'node:fs';
import path from 'node:path';

import {
  assertFullApprovalGenerationEquality,
} from './lib/approval-generation-equality-v1.mjs';

const SHA40 = /^[0-9a-f]{40}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function latestByContext(statuses) {
  const latest = new Map();
  for (const status of statuses) {
    const context = String(status?.context || '');
    if (!context || latest.has(context)) continue;
    latest.set(context, {
      context,
      state: String(status?.state || 'unknown'),
      created_at: status?.created_at || null,
      updated_at: status?.updated_at || null,
      target_url: status?.target_url || null,
      creator: status?.creator?.login || null,
    });
  }
  return latest;
}

export function classifyLifecycle({pr, liveMainSha, statuses, policy, expectedHeadSha, expectedBaseSha}) {
  assert(pr && typeof pr === 'object', 'PR_SNAPSHOT_MISSING');
  assert(SHA40.test(expectedHeadSha || ''), 'EXPECTED_HEAD_SHA_INVALID');
  assert(SHA40.test(expectedBaseSha || ''), 'EXPECTED_BASE_SHA_INVALID');
  assert(SHA40.test(liveMainSha || ''), 'LIVE_MAIN_SHA_INVALID');
  assert(pr.base?.ref === 'main', 'BASE_REF_NOT_MAIN');
  assert(pr.state === 'open' && pr.merged !== true, 'PR_NOT_OPEN_UNMERGED');
  assert(pr.head?.sha === expectedHeadSha, 'HEAD_CHANGED_FROM_EVENT');
  assert(pr.base?.sha === expectedBaseSha, 'BASE_CHANGED_FROM_EVENT');

  const common = {
    pull_request: Number(pr.number),
    exact_head_sha: pr.head.sha,
    exact_base_sha: pr.base.sha,
    live_main_sha: liveMainSha,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
    promotion_eligible: false,
    validator_authority: 'CONTROL_ONLY',
  };

  if (pr.draft === true) {
    return {...common, state: 'DRAFT', reason: pr.base.sha === liveMainSha ? 'DRAFT_NON_PROMOTABLE' : 'DRAFT_STALE_BASE_NON_PROMOTABLE'};
  }

  if (pr.base.sha !== liveMainSha) {
    return {...common, state: 'READY_NON_PROMOTABLE', reason: 'BASE_NOT_CURRENT_PROTECTED_MAIN'};
  }

  const required = Array.from(new Set(policy?.native_required_status_contexts || []));
  assert(required.length > 0, 'NATIVE_REQUIRED_CONTEXT_SET_EMPTY');
  const latest = latestByContext(statuses);
  const evidence = required.map(context => latest.get(context) || {context, state: 'missing'});
  const incomplete = evidence.filter(item => item.state !== 'success');
  if (incomplete.length) {
    return {
      ...common,
      state: 'READY_NON_PROMOTABLE',
      reason: 'NATIVE_GOVERNED_CONTEXTS_NOT_TERMINAL_SUCCESS',
      native_status_evidence: evidence,
    };
  }

  return {
    ...common,
    state: 'READY_GOVERNED',
    reason: 'NATIVE_GOVERNED_CONTEXTS_TERMINAL_SUCCESS_ON_EXACT_HEAD_AND_CURRENT_BASE',
    native_status_evidence: evidence,
  };
}

function runSelfTest() {
  const head = '1'.repeat(40);
  const base = '2'.repeat(40);
  const policy = {native_required_status_contexts: ['scope', 'landing']};
  const pr = {number: 7, state: 'open', merged: false, draft: false, head: {sha: head}, base: {ref: 'main', sha: base}};
  const success = context => ({context, state: 'success', created_at: '2026-09-01T00:00:00Z'});

  assert(classifyLifecycle({pr: {...pr, draft: true}, liveMainSha: base, statuses: [], policy, expectedHeadSha: head, expectedBaseSha: base}).state === 'DRAFT', 'SELFTEST_DRAFT');
  assert(classifyLifecycle({pr, liveMainSha: base, statuses: [success('scope')], policy, expectedHeadSha: head, expectedBaseSha: base}).state === 'READY_NON_PROMOTABLE', 'SELFTEST_MISSING_LANDING');
  assert(classifyLifecycle({pr, liveMainSha: base, statuses: [success('scope'), {context: 'landing', state: 'pending'}], policy, expectedHeadSha: head, expectedBaseSha: base}).state === 'READY_NON_PROMOTABLE', 'SELFTEST_PENDING_LANDING');
  assert(classifyLifecycle({pr, liveMainSha: '3'.repeat(40), statuses: [success('scope'), success('landing')], policy, expectedHeadSha: head, expectedBaseSha: base}).state === 'READY_NON_PROMOTABLE', 'SELFTEST_STALE_BASE');
  assert(classifyLifecycle({pr, liveMainSha: base, statuses: [success('scope'), success('landing')], policy, expectedHeadSha: head, expectedBaseSha: base}).state === 'READY_GOVERNED', 'SELFTEST_READY_GOVERNED');

  let changedHeadRejected = false;
  try {
    classifyLifecycle({pr: {...pr, head: {sha: '4'.repeat(40)}}, liveMainSha: base, statuses: [], policy, expectedHeadSha: head, expectedBaseSha: base});
  } catch (error) {
    changedHeadRejected = /HEAD_CHANGED_FROM_EVENT/.test(String(error?.message));
  }
  assert(changedHeadRejected, 'SELFTEST_HEAD_MUTATION_REJECTED');
  console.log('PR lifecycle integrity self-test: PASS');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const token = process.env.GH_TOKEN;
  const repository = process.env.GH_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
  const expectedBaseSha = process.env.EXPECTED_BASE_SHA;
  const outPath = process.env.RECEIPT_PATH || '/tmp/kpmo-pr-lifecycle/receipt.json';
  assert(token, 'GH_TOKEN_MISSING');
  assert(repository, 'GH_REPOSITORY_MISSING');
  assert(/^\d+$/.test(prNumber || ''), 'PR_NUMBER_INVALID');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kpmo-pr-lifecycle-integrity-v1',
  };
  const api = async endpoint => {
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {headers, redirect: 'error'});
    if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${endpoint}`);
    return response.json();
  };
  const pages = async endpoint => {
    const all = [];
    for (let page = 1; page <= 10; page += 1) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const values = await api(`${endpoint}${separator}per_page=100&page=${page}`);
      assert(Array.isArray(values), `PAGINATION_NON_ARRAY:${endpoint}`);
      all.push(...values);
      if (values.length < 100) return all;
    }
    throw new Error(`PAGINATION_BOUND_EXCEEDED:${endpoint}`);
  };
  const encodePath = filename => filename.split('/').map(part => encodeURIComponent(part)).join('/');
  const readJsonAtRef = async (filename, ref) => {
    const payload = await api(`/contents/${encodePath(filename)}?ref=${ref}`);
    assert(payload?.type === 'file' && payload?.encoding === 'base64' && typeof payload?.content === 'string', `CONTENTS_SHAPE_INVALID:${filename}`);
    return JSON.parse(Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8'));
  };

  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  let receipt;
  try {
    const policy = JSON.parse(fs.readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));
    const [prInitial, mainBranch, statuses] = await Promise.all([
      api(`/pulls/${prNumber}`),
      api('/branches/main'),
      pages(`/commits/${expectedHeadSha}/statuses`),
    ]);
    const [approvalBaseTree, approvalHeadTree] = await Promise.all([
      api(`/git/trees/${prInitial.base.sha}?recursive=1`),
      api(`/git/trees/${prInitial.head.sha}?recursive=1`),
    ]);
    const approvalGeneration = await assertFullApprovalGenerationEquality({
      baseTree: approvalBaseTree,
      headTree: approvalHeadTree,
      readJson: filename => readJsonAtRef(filename, prInitial.head.sha),
      prBaseSha: prInitial.base.sha,
      liveMainSha: mainBranch?.commit?.sha,
    });
    const classification = classifyLifecycle({
      pr: prInitial,
      liveMainSha: mainBranch?.commit?.sha,
      statuses,
      policy,
      expectedHeadSha,
      expectedBaseSha,
    });
    const prFinal = await api(`/pulls/${prNumber}`);
    assert(prFinal.head?.sha === prInitial.head?.sha, 'HEAD_CHANGED_DURING_EVALUATION');
    assert(prFinal.base?.sha === prInitial.base?.sha, 'BASE_CHANGED_DURING_EVALUATION');
    assert(prFinal.draft === prInitial.draft, 'DRAFT_STATE_CHANGED_DURING_EVALUATION');
    assert(prFinal.state === prInitial.state && prFinal.merged === prInitial.merged, 'PR_STATE_CHANGED_DURING_EVALUATION');

    receipt = {
      id: 'kpmo-pr-lifecycle-integrity-receipt-v1',
      repository,
      workflow_run_id: process.env.GITHUB_RUN_ID || null,
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
      event_name: process.env.GITHUB_EVENT_NAME || null,
      approval_generation_equality: approvalGeneration,
      ...classification,
      final_live_reread: true,
    };
  } catch (error) {
    receipt = {
      id: 'kpmo-pr-lifecycle-integrity-receipt-v1',
      repository,
      pull_request: Number(prNumber),
      exact_head_sha: expectedHeadSha || null,
      exact_base_sha: expectedBaseSha || null,
      workflow_run_id: process.env.GITHUB_RUN_ID || null,
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
      event_name: process.env.GITHUB_EVENT_NAME || null,
      state: 'READY_NON_PROMOTABLE',
      reason: String(error?.message || error),
      validator_authority: 'CONTROL_ONLY',
      promotion_eligible: false,
      public_release: 'HOLD',
      production: 'HOLD',
      g5: 'HOLD',
      final_live_reread: false,
    };
  }

  fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.state === 'READY_NON_PROMOTABLE') process.exit(1);
}

await main();
