import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
const terminal = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');

test('event-emitting transport is validated before lifecycle and one-use authorization consumption', () => {
  const transport = workflow.indexOf('Verify event-emitting merge transport before authority consumption');
  const lifecycle = workflow.indexOf('Require latest terminal exact-head lifecycle authority');
  const consumption = workflow.indexOf('Consume one-use exact-head landing authorization');
  const merge = workflow.indexOf('Re-read live authority and await exact-head event-emitting merge');
  assert.ok(transport >= 0 && transport < lifecycle && lifecycle < consumption && consumption < merge);
  assert.match(workflow, /EXPECTED_BASE_SHA: \$\{\{ inputs\.expected_base_sha \}\}/);
  assert.match(workflow, /EXPECTED_HEAD_TREE_SHA: \$\{\{ inputs\.expected_head_tree_sha \}\}/);
});

test('repository GITHUB_TOKEN cannot merge and external merge proof is exact', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.doesNotMatch(runner, /method: 'PUT'/);
  assert.doesNotMatch(runner, /merge_method/);
  assert.match(runner, /POST_MERGE_TREE_SHA_MISMATCH/);
  assert.match(runner, /POST_MERGE_PARENT_BINDING_MISMATCH/);
  assert.match(runner, /ATOMIC_EVENT_TRANSPORT_MERGED_BY_NON_OWNER/);
});

test('terminal PASS requires successful exact merge-SHA push suite', () => {
  assert.match(workflow, /Consume exact merge-SHA protected-main push suite/);
  assert.match(workflow, /consume-atomic-postmerge-push-suite-v1\.mjs/);
  assert.match(terminal, /terminal_pass_requires_exact_merge_sha_postmerge_success: true/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_terminal === true/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_success === true/);
  assert.match(terminal, /let state = 'VERIFIED_FAIL'/);
});


import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildAtomicPostMergeReceipt, evaluateCanonicalConvergence} from '../../../scripts/kidults/kpmo/consume-atomic-postmerge-push-suite-v1.mjs';
import {evaluatePostMergePushSuite, validatePolicy} from '../../../scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs';

function nativeFixture() {
  const policy = validatePolicy(JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json', 'utf8')));
  const mergeSha = 'd'.repeat(40), mergedAt = '2026-09-22T00:00:00Z';
  const runs = policy.required_workflows.map((item, index) => ({
    id: 2000 + index, workflow_id: 10 + index, name: item.name, path: item.path,
    head_sha: mergeSha, head_branch: 'main', event: 'push', status: 'completed',
    conclusion: 'success', run_attempt: 1, created_at: '2026-09-22T00:00:01Z', updated_at: '2026-09-22T00:00:02Z',
  }));
  const producer = {...policy.canonical_convergence.producer, id: 3001, head_sha: mergeSha, head_branch: 'main',
    status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-09-22T00:00:01Z', updated_at: '2026-09-22T00:00:03Z'};
  const consumer = {...policy.canonical_convergence.consumer, id: 3002, head_sha: mergeSha, head_branch: 'main',
    status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-09-22T00:00:04Z', updated_at: '2026-09-22T00:00:05Z'};
  return {repository: 'fixture-owner/fixture-repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
    headTreeSha: 'c'.repeat(40), mergeSha, mergedAt,
    evaluation: evaluatePostMergePushSuite(runs, policy, mergeSha, mergedAt),
    canonicalConvergence: evaluateCanonicalConvergence([...runs, producer, consumer], policy, mergeSha, mergedAt)};
}
function assertNativeReceipt(input, expected) {
  const before = structuredClone(input);
  const result = buildAtomicPostMergeReceipt(input);
  assert.equal(result.state, expected);
  assert.deepEqual(input, before, 'historical evidence must not be changed');
  for (const field of ['production', 'public', 'g5']) assert.equal(result[field], 'HOLD');
  assert.equal(result.promotion_eligible, false);
  if (result.state === 'VERIFIED_PASS') {
    for (const field of ['all_required_present','all_required_terminal','all_required_success']) assert.equal(result[field], true);
    assert.ok(result.required_workflows.length > 0);
    assert.ok(result.required_workflows.every(row => row.conclusion === 'success'));
    assert.deepEqual(result.waiting, []); assert.deepEqual(result.invalid, []);
    assert.equal(result.canonical_convergence.exact_merge_sha, result.exact_merge_sha);
  }
  return result;
}
test('native receipt agrees with required evidence', () => assertNativeReceipt(nativeFixture(), 'VERIFIED_PASS'));
test('canonical convergence cannot waive the failed required Assurance', () => {
  const input = nativeFixture();
  input.evaluation.required.find(row => row.path === '.github/workflows/kidults-platform-continuous-assurance-v1.yml').conclusion = 'failure';
  input.evaluation.all_required_success = false;
  const receipt = assertNativeReceipt(input, 'VERIFIED_FAIL');
  assert.equal(receipt.startup_race_preserved_as_evidence, true);
});
const receiptMutations = [
  ['waiting evidence', x => {x.evaluation.waiting = ['missing'];}],
  ['invalid evidence', x => {x.evaluation.invalid = ['invalid'];}],
  ['wrong canonical SHA', x => {x.canonicalConvergence.exact_merge_sha = 'e'.repeat(40);}],
  ['empty required set', x => {x.evaluation.required = [];}],
  ['null required set', x => {x.evaluation.required = null;}],
  ['null row', x => {x.evaluation.required[0] = null;}],
  ['duplicate path', x => {x.evaluation.required[1].path = x.evaluation.required[0].path;}],
  ['duplicate run', x => {x.evaluation.required[1].run_id = x.evaluation.required[0].run_id;}],
  ['missing run id', x => {delete x.evaluation.required[0].run_id;}],
  ['unsafe run id', x => {x.evaluation.required[0].run_id = Number.MAX_SAFE_INTEGER + 1;}],
  ['string attempt', x => {x.evaluation.required[0].run_attempt = '1';}],
  ['missing waiting', x => {delete x.evaluation.waiting;}],
  ['missing invalid', x => {delete x.evaluation.invalid;}],
  ['string success', x => {x.evaluation.all_required_success = 'true';}],
  ['string ready', x => {x.evaluation.ready = 'true';}],
  ['absent evaluation', x => {delete x.evaluation;}],
  ['absent convergence', x => {delete x.canonicalConvergence;}],
  ['invalid merge SHA', x => {x.mergeSha = 'invalid';}],
  ['explicit failure', x => {x.failureCode = 'PRESERVED_FAILURE';}],
];
for (const [name, mutate] of receiptMutations) test('native receipt rejects ' + name, () => {
  const input = nativeFixture(); mutate(input); assertNativeReceipt(input, 'VERIFIED_FAIL');
});
for (const conclusion of ['failure','cancelled','timed_out','skipped','neutral','action_required','stale',null]) {
  for (const summary of [true,false]) test('native required outcome ' + conclusion + ' with summary ' + summary, () => {
    const input = nativeFixture(); input.evaluation.required[0].conclusion = conclusion;
    input.evaluation.all_required_success = summary; assertNativeReceipt(input, 'VERIFIED_FAIL');
  });
}

function runNativeFinalizer(options = {}) {
  const input = nativeFixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-native-finalizer-'));
  const suitePath = path.join(root, 'suite.json'), receiptPath = path.join(root, 'terminal.json');
  const statusPath = path.join(root, 'status.json'), hookPath = path.join(root, 'network-denied-hook.mjs');
  const suite = buildAtomicPostMergeReceipt(input);
  if (options.suiteFailure) {suite.state = 'VERIFIED_FAIL'; suite.all_required_success = false;}
  if (options.inconsistentSummary) suite.all_required_success = false;
  if (!options.missingSuite) fs.writeFileSync(suitePath, JSON.stringify(suite));
  const fixture = {repository: input.repository, base: input.baseSha, head: input.headSha,
    merge: input.mergeSha, rejected: options.rejected === true, drift: options.drift === true, statusPath};
  fs.writeFileSync(hookPath, `import fs from 'node:fs';\nconst f=${JSON.stringify(fixture)};\n` + String.raw`
    globalThis.fetch = async (url, options = {}) => {
      const prefix = 'https://api.github.com/repos/' + f.repository;
      if (!String(url).startsWith(prefix + '/')) throw new Error('TEST_EXTERNAL_NETWORK_FORBIDDEN');
      const endpoint = String(url).slice(prefix.length);
      const response = value => ({ok:true,status:200,json:async()=>value});
      if (endpoint === '/pulls/999') return response({head:{sha:f.head},base:{ref:'main',sha:f.base},merged:!f.rejected,merge_commit_sha:f.merge});
      if (endpoint === '/branches/main') return response({commit:{sha:f.drift ? 'e'.repeat(40) : f.merge}});
      if (endpoint.startsWith('/pulls/999/files?')) return response([{filename:'docs/non-current-sold-fixture.md'}]);
      if (endpoint === '/statuses/' + f.head && options.method === 'POST') {
        fs.writeFileSync(f.statusPath, options.body); return response({});
      }
      throw new Error('TEST_UNEXPECTED_API:' + endpoint);
    };
  `);
  const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','HOME'].filter(k => process.env[k]).map(k => [k,process.env[k]]));
  Object.assign(env, {GH_REPOSITORY: input.repository, GH_TOKEN: 'test-not-a-credential', PR_NUMBER: '999',
    EXPECTED_BASE_SHA: input.baseSha, EXPECTED_HEAD_SHA: input.headSha, EXPECTED_HEAD_TREE_SHA: input.headTreeSha,
    LANDING_AUTHORIZATION_ID: 'LAND-PR-999-' + input.headSha.slice(0,12), LANDING_ACTOR: 'fixture-owner',
    GITHUB_RUN_ID: '99901', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: root,
    ATOMIC_LANDING_TERMINAL_RECEIPT_PATH: receiptPath, ATOMIC_LANDING_CONSUMPTION_PATH: path.join(root,'no-consumption.json'),
    ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH: path.join(root,'no-transport.json'),
    CURRENT_SOLD_RECEIPT_PATH: path.join(root,'no-sold.json'), CURRENT_SOLD_CHANGED: 'false',
    ATOMIC_POSTMERGE_PUSH_SUITE_RECEIPT_PATH: suitePath, ATOMIC_POSTMERGE_PUSH_SUITE_OUTCOME: 'success',
    LANDING_STEP_OUTCOME: options.landingFailure ? 'failure' : 'success'});
  try {
    const child = spawnSync(process.execPath, ['--import', pathToFileURL(hookPath).href,
      path.resolve('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs'), '--finalize'],
      {env, encoding:'utf8',timeout:10000});
    assert.equal(child.error, undefined); assert.equal(child.signal, null);
    assert.ok(fs.existsSync(receiptPath), child.stderr);
    return {exit:child.status, receipt:JSON.parse(fs.readFileSync(receiptPath)), status:JSON.parse(fs.readFileSync(statusPath))};
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('complete native finalizer preserves PASS exit 0 without real network', () => {
  const result = runNativeFinalizer(); assert.equal(result.exit,0);
  assert.equal(result.receipt.state,'VERIFIED_PASS'); assert.equal(result.status.state,'success');
});
for (const flag of ['suiteFailure','inconsistentSummary','missingSuite','drift','landingFailure','rejected']) {
  test('complete native finalizer rejects ' + flag + ' with durable receipt and exit 1', () => {
    const result = runNativeFinalizer({[flag]:true}); assert.equal(result.exit,1);
    assert.notEqual(result.receipt.state,'VERIFIED_PASS'); assert.equal(result.status.state,'failure');
    for (const field of ['production','public','g5']) assert.equal(result.receipt[field],'HOLD');
  });
}
for (const workflowPath of ['.github/workflows/kidults-platform-continuous-assurance-v1.yml',
  '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml']) {
  test('artifact expiry is explicitly boolean fail-closed in ' + workflowPath, () => {
    const source = fs.readFileSync(workflowPath,'utf8');
    assert.equal(source.includes('.expired // true'), false);
    assert.equal(source.split('if type == "object" then (.expired != false) else true end').length - 1, 1);
  });
}
