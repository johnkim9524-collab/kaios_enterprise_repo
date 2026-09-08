#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const TRANSPORT = 'DIRECT_OWNER_GITHUB_UI';

const API_SURFACE = 'GET /repos/{owner}/{repo}';
const API_PROVENANCE = 'GITHUB_ACTIONS_WORKFLOW_TOKEN_REPOSITORY_METADATA';
const GRAPHQL_API_SURFACE = 'POST /graphql Repository.mergeCommitAllowed';
const GRAPHQL_API_PROVENANCE = 'GITHUB_ACTIONS_WORKFLOW_TOKEN_GRAPHQL_REPOSITORY_METADATA';

const fail = (code, detail = '', evidence = null) => {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  if (evidence) error.repositoryMergeCommitObservation = evidence;
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

const valueType = value => {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const headerValue = (headers, name) => {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : null;
};

const boundedIntegerHeader = (headers, name) => {
  const raw = headerValue(headers, name);
  if (raw === null || !/^\d{1,12}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
};

export function classifyRepositoryMergeCommitObservation({
  httpStatus,
  responseOk,
  headers = {},
  payload,
  jsonParsed = true,
  apiSurface = API_SURFACE,
  provenance = API_PROVENANCE,
} = {}) {
  const status = Number.isInteger(httpStatus) ? httpStatus : null;
  const remaining = boundedIntegerHeader(headers, 'x-ratelimit-remaining');
  const retryAfterSeconds = boundedIntegerHeader(headers, 'retry-after');
  const fieldPresent = Boolean(payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.hasOwn(payload, 'allow_merge_commit'));
  const observedValue = fieldPresent ? payload.allow_merge_commit : undefined;
  const observedType = valueType(observedValue);
  const base = {
    api_surface: apiSurface,
    http_status: status,
    response_ok: typeof responseOk === 'boolean' ? responseOk : null,
    response_json_parsed: jsonParsed === true,
    field_name: 'allow_merge_commit',
    field_present: fieldPresent,
    value_type: observedType,
    boolean_value: observedType === 'boolean' ? observedValue : null,
    rate_limit_remaining: remaining,
    retry_after_seconds: retryAfterSeconds,
    provenance,
    raw_response_persisted: false,
  };
  let classification;
  let failureCode = null;
  if (status === 429 || (status === 403 && (remaining === 0 || retryAfterSeconds !== null))) {
    classification = 'RATE_LIMITED';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_RATE_LIMITED';
  } else if (status === 401 || status === 403) {
    classification = 'PERMISSION_FAILURE';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_PERMISSION_FAILURE';
  } else if (status === null || responseOk !== true || status < 200 || status >= 300) {
    classification = 'HTTP_FAILURE';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_HTTP_FAILURE';
  } else if (jsonParsed !== true || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    classification = 'RESPONSE_MALFORMED';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_RESPONSE_MALFORMED';
  } else if (!fieldPresent) {
    classification = 'FIELD_MISSING';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_FIELD_MISSING';
  } else if (observedType !== 'boolean') {
    classification = 'FIELD_MALFORMED';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_FIELD_MALFORMED';
  } else if (observedValue === false) {
    classification = 'DISABLED';
    failureCode = 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED';
  } else {
    classification = 'ENABLED';
  }
  return {...base, classification, failure_code: failureCode};
}

export function classifyGraphqlRepositoryMergeCommitObservation({
  httpStatus,
  responseOk,
  headers = {},
  payload,
  jsonParsed = true,
} = {}) {
  const repository = payload?.data?.repository;
  const responseShapeValid = repository && typeof repository === 'object' && !Array.isArray(repository)
    && !(Array.isArray(payload?.errors) && payload.errors.length > 0)
    && !(!Array.isArray(payload?.errors) && payload?.errors !== undefined);
  const normalizedPayload = responseShapeValid
    ? (Object.hasOwn(repository, 'mergeCommitAllowed')
      ? {allow_merge_commit: repository.mergeCommitAllowed}
      : {})
    : null;
  const observation = classifyRepositoryMergeCommitObservation({
    httpStatus,
    responseOk,
    headers,
    payload: normalizedPayload,
    jsonParsed: jsonParsed === true && normalizedPayload !== null,
    apiSurface: GRAPHQL_API_SURFACE,
    provenance: GRAPHQL_API_PROVENANCE,
  });
  return {
    ...observation,
    field_name: 'mergeCommitAllowed',
  };
}

export function selectRepositoryMergeCommitObservation(restObservation, graphqlObservation = null) {
  if (restObservation?.classification !== 'FIELD_MISSING') return restObservation;
  return graphqlObservation || restObservation;
}

export function compareRepositoryMergeCommitOwnerView(actionsObservation, ownerObservation = null) {
  if (ownerObservation === null) return {
    state: 'NOT_AVAILABLE_NO_OWNER_CREDENTIAL_USED',
    mismatch: null,
  };
  const valid = observation => observation
    && ['ENABLED', 'DISABLED'].includes(observation.classification)
    && typeof observation.boolean_value === 'boolean';
  if (!valid(actionsObservation) || !valid(ownerObservation)) return {
    state: 'COMPARISON_NOT_AUTHORITATIVE',
    mismatch: null,
  };
  const mismatch = actionsObservation.boolean_value !== ownerObservation.boolean_value;
  return {
    state: mismatch ? 'OWNER_VIEW_MISMATCH' : 'MATCH',
    mismatch,
  };
}

export function requireEnabledRepositoryMergeCommit(observation, ownerComparison = null) {
  if (ownerComparison?.mismatch === true) {
    fail('ATOMIC_EVENT_TRANSPORT_OWNER_VIEW_MISMATCH', '', observation);
  }
  if (observation?.classification !== 'ENABLED') {
    fail(observation?.failure_code || 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_OBSERVATION_INVALID', '', observation);
  }
  return observation;
}

export function validateTransportSnapshot(snapshot, expected) {
  for (const value of [expected?.baseSha, expected?.headSha, expected?.headTreeSha]) {
    requireCondition(SHA.test(value || ''), 'ATOMIC_EVENT_TRANSPORT_EXPECTED_SHA_INVALID');
  }
  requireCondition(snapshot?.repositoryOwner && snapshot.actor === snapshot.repositoryOwner,
    'ATOMIC_EVENT_TRANSPORT_OWNER_ACTOR_REQUIRED');
  requireEnabledRepositoryMergeCommit(snapshot?.repositoryMergeCommitObservation,
    snapshot?.repositoryMergeCommitOwnerComparison);
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
  const repositoryMergeCommitObservation = error?.repositoryMergeCommitObservation || {
    api_surface: API_SURFACE, http_status: null, response_ok: null, response_json_parsed: false,
    field_name: 'allow_merge_commit', field_present: false, value_type: 'missing', boolean_value: null,
    rate_limit_remaining: null, retry_after_seconds: null, provenance: API_PROVENANCE,
    raw_response_persisted: false, classification: 'NOT_OBSERVED',
    failure_code: 'ATOMIC_EVENT_TRANSPORT_REPOSITORY_OBSERVATION_NOT_ESTABLISHED',
  };
  return {
    id: 'kidults-atomic-event-emitting-transport-availability-v1', version: '1.1.0',
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
    repository_merge_commit_observation: repositoryMergeCommitObservation,
    owner_view_comparison: compareRepositoryMergeCommitOwnerView(repositoryMergeCommitObservation),
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
  const enabled = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {allow_merge_commit: true},
  });
  const snapshot = {
    repositoryOwner: 'owner', actor: 'owner', repositoryMergeCommitObservation: enabled,
    repositoryMergeCommitOwnerComparison: compareRepositoryMergeCommitOwnerView(enabled), mainSha: baseSha, headTreeSha,
    pr: {state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: 'blocked',
      base: {ref: 'main', sha: baseSha}, head: {sha: headSha}},
  };
  assert.equal(validateTransportSnapshot(snapshot, expected).identity_verified, true);
  const restMissing = classifyRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true, payload: {},
  });
  const graphqlEnabled = classifyGraphqlRepositoryMergeCommitObservation({
    httpStatus: 200, responseOk: true,
    payload: {data: {repository: {mergeCommitAllowed: true}}},
  });
  assert.equal(selectRepositoryMergeCommitObservation(restMissing, graphqlEnabled).classification, 'ENABLED');
  const mutations = [
    [{...snapshot, actor: 'other'}, 'ATOMIC_EVENT_TRANSPORT_OWNER_ACTOR_REQUIRED'],
    [{...snapshot, repositoryMergeCommitObservation: classifyRepositoryMergeCommitObservation({
      httpStatus: 200, responseOk: true, payload: {allow_merge_commit: false},
    })}, 'ATOMIC_EVENT_TRANSPORT_MERGE_COMMIT_DISABLED'],
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
    repository_observation_classification_verified: true,
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
  const readRepositoryState = async () => {
    let response;
    try {
      response = await fetch(`https://api.github.com/repos/${repository}`, {headers, redirect: 'error'});
    } catch (error) {
      const observation = classifyRepositoryMergeCommitObservation({
        httpStatus: null, responseOk: false, payload: null, jsonParsed: false,
      });
      fail('ATOMIC_EVENT_TRANSPORT_REPOSITORY_HTTP_FAILURE', error?.name || '', observation);
    }
    let payload = null;
    let jsonParsed = true;
    try { payload = await response.json(); } catch { jsonParsed = false; }
    const restObservation = classifyRepositoryMergeCommitObservation({
      httpStatus: response.status, responseOk: response.ok, headers: response.headers, payload, jsonParsed,
    });
    let graphqlObservation = null;
    if (restObservation.classification === 'FIELD_MISSING') {
      const [owner, name] = repository.split('/');
      let graphqlResponse;
      try {
        graphqlResponse = await fetch('https://api.github.com/graphql', {
          method: 'POST', headers, redirect: 'error',
          body: JSON.stringify({
            query: 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeCommitAllowed}}',
            variables: {owner, name},
          }),
        });
      } catch (error) {
        graphqlObservation = classifyGraphqlRepositoryMergeCommitObservation({
          httpStatus: null, responseOk: false, payload: null, jsonParsed: false,
        });
        fail('ATOMIC_EVENT_TRANSPORT_REPOSITORY_HTTP_FAILURE', error?.name || '', graphqlObservation);
      }
      let graphqlPayload = null;
      let graphqlJsonParsed = true;
      try { graphqlPayload = await graphqlResponse.json(); } catch { graphqlJsonParsed = false; }
      graphqlObservation = classifyGraphqlRepositoryMergeCommitObservation({
        httpStatus: graphqlResponse.status,
        responseOk: graphqlResponse.ok,
        headers: graphqlResponse.headers,
        payload: graphqlPayload,
        jsonParsed: graphqlJsonParsed,
      });
    }
    const observation = selectRepositoryMergeCommitObservation(restObservation, graphqlObservation);
    requireEnabledRepositoryMergeCommit(observation);
    return {payload, observation};
  };
  const [repositoryRead, pr, mainBranch, headCommit] = await Promise.all([
    readRepositoryState(), request(`/pulls/${prNumber}`), request('/branches/main'), request(`/git/commits/${headSha}`),
  ]);
  const repositoryState = repositoryRead.payload;
  const ownerViewComparison = compareRepositoryMergeCommitOwnerView(repositoryRead.observation);
  const identity = validateTransportSnapshot({
    repositoryOwner: repositoryState?.owner?.login,
    actor,
    repositoryMergeCommitObservation: repositoryRead.observation,
    repositoryMergeCommitOwnerComparison: ownerViewComparison,
    pr,
    mainSha: mainBranch?.commit?.sha,
    headTreeSha: headCommit?.tree?.sha,
  }, {baseSha, headSha, headTreeSha});
  const checkedAt = new Date();
  const receipt = {
    id: 'kidults-atomic-event-emitting-transport-availability-v1', version: '1.1.0',
    state: 'AVAILABLE_POSTMERGE_EVENT_PROOF_REQUIRED', repository, pull_request: Number(prNumber),
    ...identity, repository_owner: repositoryState.owner.login, dispatch_actor: actor,
    transport: TRANSPORT, transport_available: true, authorization_consumed: false,
    repository_merge_commit_observation: repositoryRead.observation,
    owner_view_comparison: ownerViewComparison,
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
