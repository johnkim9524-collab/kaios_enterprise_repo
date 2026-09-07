import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {
  classifyRepositoryMergeCommitObservation,
  classifyGraphqlRepositoryMergeCommitObservation,
  selectRepositoryMergeCommitObservation,
  compareRepositoryMergeCommitOwnerView,
  requireEnabledRepositoryMergeCommit,
  buildTransportFailureReceipt,
} from '../../../scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const landing = fs.readFileSync('scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs', 'utf8');
const terminal = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');

test('transport and postmerge self-tests reject drift, failure, timeout, partial execution and predecessor reuse', () => {
  const preflight = execFileSync(process.execPath, [
    'scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs', '--self-test',
  ], {encoding: 'utf8'});
  const postmerge = execFileSync(process.execPath, [
    'scripts/kidults/kpmo/consume-atomic-postmerge-push-suite-v1.mjs', '--self-test',
  ], {encoding: 'utf8'});
  assert.equal(JSON.parse(preflight).state, 'VERIFIED_PASS');
  const receipt = JSON.parse(postmerge);
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.terminal_failure_rejected, true);
  assert.equal(receipt.timeout_partial_execution_rejected, true);
  assert.equal(receipt.predecessor_reuse_rejected, true);
  const preflightSource = fs.readFileSync(
    'scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs', 'utf8');
  assert.match(preflightSource, /state: 'VERIFIED_FAIL'/);
  assert.match(preflightSource, /authorization_consumed: false/);
});

test('workflow preserves read-only merge transport and orders exact identity before one-use consumption', () => {
  const transport = workflow.indexOf('Verify event-emitting merge transport before authority consumption');
  const consume = workflow.indexOf('Consume one-use exact-head landing authorization');
  const observer = workflow.indexOf('Re-read live authority and await exact-head event-emitting merge');
  const postmerge = workflow.indexOf('Consume exact merge-SHA protected-main push suite');
  assert.ok(transport >= 0 && transport < consume && consume < observer && observer < postmerge);
  assert.match(workflow, /expected_base_sha:/);
  assert.match(workflow, /expected_head_sha:/);
  assert.match(workflow, /expected_head_tree_sha:/);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^      pull-requests: read$/m);
  assert.doesNotMatch(workflow, /^\s+contents: write$/m);
  assert.doesNotMatch(workflow, /^\s+pull-requests: write$/m);
  assert.doesNotMatch(landing, /method: 'PUT'|merge_method/);
});

test('pre-consumption transport failure emits a fail-closed unconsumed receipt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-event-transport-fail-'));
  const receiptPath = path.join(directory, 'receipt.json');
  try {
    const result = spawnSync(process.execPath, [
      'scripts/kidults/kpmo/run-atomic-event-emitting-transport-preflight-v1.mjs',
    ], {
      encoding: 'utf8',
      env: {...process.env, ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH: receiptPath},
    });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.state, 'VERIFIED_FAIL');
    assert.equal(receipt.authorization_consumed, false);
    assert.equal(receipt.transport_available, false);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('repository merge capability observations distinguish every fail-closed class', () => {
  const classify = values => classifyRepositoryMergeCommitObservation(values);
  const enabled = classify({httpStatus: 200, responseOk: true, payload: {allow_merge_commit: true}});
  assert.equal(enabled.classification, 'ENABLED');
  assert.equal(enabled.boolean_value, true);
  assert.doesNotThrow(() => requireEnabledRepositoryMergeCommit(enabled));

  const cases = [
    [{httpStatus: 200, responseOk: true, payload: {allow_merge_commit: false}},
      'DISABLED', 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED'],
    [{httpStatus: 200, responseOk: true, payload: {}},
      'FIELD_MISSING', 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_FIELD_MISSING'],
    [{httpStatus: 200, responseOk: true, payload: {allow_merge_commit: 'true'}},
      'FIELD_MALFORMED', 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_FIELD_MALFORMED'],
    [{httpStatus: 403, responseOk: false, payload: {message: 'forbidden'}},
      'PERMISSION_FAILURE', 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_PERMISSION_FAILURE'],
    [{httpStatus: 403, responseOk: false, headers: {'x-ratelimit-remaining': '0'}, payload: {message: 'limit'}},
      'RATE_LIMITED', 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_RATE_LIMITED'],
    [{httpStatus: 429, responseOk: false, headers: {'retry-after': '60'}, payload: {message: 'limit'}},
      'RATE_LIMITED', 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_RATE_LIMITED'],
    [{httpStatus: 200, responseOk: true, payload: null, jsonParsed: false},
      'RESPONSE_MALFORMED', 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_RESPONSE_MALFORMED'],
  ];
  for (const [input, classification, failureCode] of cases) {
    const observation = classify(input);
    assert.equal(observation.classification, classification);
    assert.equal(observation.failure_code, failureCode);
    assert.throws(() => requireEnabledRepositoryMergeCommit(observation), new RegExp(failureCode));
    const receipt = buildTransportFailureReceipt({
      repository: 'owner/repo', prNumber: '2055', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
      headTreeSha: 'c'.repeat(40), actor: 'owner',
      error: Object.assign(new Error(failureCode), {code: failureCode, repositoryMergeCommitObservation: observation}),
    });
    assert.equal(receipt.failure_code, failureCode);
    assert.equal(receipt.repository_merge_commit_observation.classification, classification);
    assert.equal(receipt.repository_merge_commit_observation.raw_response_persisted, false);
    assert.equal(receipt.authorization_consumed, false);
  }
  const misleadingRetryAfter = classify({
    httpStatus: 200, responseOk: true, headers: {'retry-after': '60'}, payload: {allow_merge_commit: true},
  });
  assert.equal(misleadingRetryAfter.classification, 'ENABLED');
});

test('Actions-token and Owner-view disagreement is distinct and fail-closed', () => {
  const actions = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {allow_merge_commit: false},
    provenance: 'GITHUB_ACTIONS_WORKFLOW_TOKEN_REPOSITORY_METADATA',
  });
  const owner = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {allow_merge_commit: true},
    provenance: 'AUTHENTICATED_OWNER_READBACK',
  });
  const comparison = compareRepositoryMergeCommitOwnerView(actions, owner);
  assert.deepEqual(comparison, {state: 'OWNER_VIEW_MISMATCH', mismatch: true});
  assert.throws(() => requireEnabledRepositoryMergeCommit(actions, comparison),
    /ATOMIC_EVENT_TRANSPORT_OWNER_VIEW_MISMATCH/);
  assert.deepEqual(compareRepositoryMergeCommitOwnerView(owner), {
    state: 'NOT_AVAILABLE_NO_OWNER_CREDENTIAL_USED', mismatch: null,
  });
});

test('REST field omission uses the same-token GraphQL repository capability without widening authority', () => {
  const restMissing = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {},
  });
  const graphqlEnabled = classifyGraphqlRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true,
    payload: {data: {repository: {mergeCommitAllowed: true}}},
  });
  const selected = selectRepositoryMergeCommitObservation(restMissing, graphqlEnabled);
  assert.equal(selected.classification, 'ENABLED');
  assert.equal(selected.field_name, 'mergeCommitAllowed');
  assert.equal(selected.provenance, 'GITHUB_ACTIONS_WORKFLOW_TOKEN_GRAPHQL_REPOSITORY_METADATA');
  assert.doesNotThrow(() => requireEnabledRepositoryMergeCommit(selected));

  const graphqlCases = [
    [{data: {repository: {mergeCommitAllowed: false}}}, 'DISABLED'],
    [{data: {repository: {}}}, 'FIELD_MISSING'],
    [{data: {repository: {mergeCommitAllowed: 'true'}}}, 'FIELD_MALFORMED'],
    [{errors: [{message: 'denied'}], data: {repository: {mergeCommitAllowed: true}}}, 'RESPONSE_MALFORMED'],
  ];
  for (const [payload, classification] of graphqlCases) {
    const observation = classifyGraphqlRepositoryMergeCommitObservation({
      httpStatus: 200, responseOk: true, payload,
    });
    assert.equal(observation.classification, classification);
    assert.throws(() => requireEnabledRepositoryMergeCommit(observation));
  }

  const restDisabled = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {allow_merge_commit: false},
  });
  assert.equal(selectRepositoryMergeCommitObservation(restDisabled, graphqlEnabled), restDisabled);
  assert.throws(() => requireEnabledRepositoryMergeCommit(
    selectRepositoryMergeCommitObservation(restDisabled, graphqlEnabled)),
  /ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED/);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^      pull-requests: read$/m);
});

test('terminal reconciler preserves a classified pre-consumption transport failure', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-event-terminal-fail-'));
  const transportPath = path.join(directory, 'transport.json');
  const terminalPath = path.join(directory, 'terminal.json');
  const headSha = 'b'.repeat(40);
  const baseSha = 'a'.repeat(40);
  const headTreeSha = 'c'.repeat(40);
  const authorizationId = `LAND-PR-2055-${headSha.slice(0, 12)}`;
  try {
    const observation = classifyRepositoryMergeCommitObservation({
      httpStatus: 200, responseOk: true, payload: {},
    });
    const error = Object.assign(new Error(observation.failure_code), {
      code: observation.failure_code,
      repositoryMergeCommitObservation: observation,
    });
    fs.writeFileSync(transportPath, `${JSON.stringify(buildTransportFailureReceipt({
      repository: 'johnkim9524-collab/kaios_enterprise_repo', prNumber: '2055', baseSha,
      headSha, headTreeSha, actor: 'johnkim9524-collab', error,
    }))}\n`);
    const fixtureUrl = pathToFileURL(path.resolve(
      'tests/kidults/kpmo/atomic-terminal-fetch-fixture-v1.mjs')).href;
    const result = spawnSync(process.execPath, [
      '--import', fixtureUrl,
      'scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', '--finalize',
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: 'fixture-token',
        GH_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
        PR_NUMBER: '2055',
        EXPECTED_BASE_SHA: baseSha,
        EXPECTED_HEAD_SHA: headSha,
        EXPECTED_HEAD_TREE_SHA: headTreeSha,
        LANDING_AUTHORIZATION_ID: authorizationId,
        LANDING_ACTOR: 'johnkim9524-collab',
        GITHUB_RUN_ID: '34033554301',
        GITHUB_RUN_ATTEMPT: '1',
        ATOMIC_EVENT_TRANSPORT_RECEIPT_PATH: transportPath,
        ATOMIC_LANDING_TERMINAL_RECEIPT_PATH: terminalPath,
        ATOMIC_LANDING_CONSUMPTION_PATH: path.join(directory, 'absent-consumption.json'),
        ATOMIC_POSTMERGE_PUSH_SUITE_RECEIPT_PATH: path.join(directory, 'absent-postmerge.json'),
        LANDING_STEP_OUTCOME: 'skipped',
        CURRENT_SOLD_POSTLANDING_OUTCOME: 'skipped',
        ATOMIC_POSTMERGE_PUSH_SUITE_OUTCOME: 'skipped',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const terminalReceipt = JSON.parse(fs.readFileSync(terminalPath, 'utf8'));
    assert.equal(terminalReceipt.version, '2.5.0');
    assert.equal(terminalReceipt.state, 'MERGE_REJECTED');
    assert.equal(terminalReceipt.authorization_consumption.state, 'NOT_ESTABLISHED_FAIL_CLOSED');
    assert.equal(terminalReceipt.event_emitting_transport_availability.state, 'VERIFIED_FAIL');
    assert.equal(terminalReceipt.event_emitting_transport_availability.failure_code,
      'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_FIELD_MISSING');
    assert.equal(terminalReceipt.event_emitting_transport_availability
      .repository_merge_commit_observation.classification, 'FIELD_MISSING');
    assert.equal(terminalReceipt.event_emitting_transport_availability.authorization_consumed, false);
    assert.equal(JSON.stringify(terminalReceipt).includes(authorizationId), false);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('terminal PASS is exact merge-SHA suite bound and every incomplete path defaults to failure', () => {
  assert.match(landing, /POST_MERGE_TREE_SHA_MISMATCH/);
  assert.match(landing, /POST_MERGE_PARENT_BINDING_MISMATCH/);
  assert.match(landing, /ATOMIC_EVENT_TRANSPORT_TIMEOUT_UNCONSUMED/);
  assert.match(terminal, /let state = 'VERIFIED_FAIL'/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.exact_merge_sha === mergeSha/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_terminal === true/);
  assert.match(terminal, /postMergeSuiteReceipt\?\.all_required_success === true/);
  assert.match(terminal, /terminal_pass_requires_exact_merge_sha_postmerge_success: true/);
});
