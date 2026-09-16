import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  OrchestrationError,
  classifyObservation,
  createLocalFixtureReceipt,
  resolveOrchestration,
  validateReceipt,
} from '../../../scripts/kidults/source-intelligence/resolve-asi-exact-generation-orchestration-v1.mjs';

const sha = 'a'.repeat(40);
const repository = 'kidults/example';
const specification = {
  repository,
  consumerId: 'frontier-runtime-persistence',
  workflowPath: '.github/workflows/kidults-asi-self-driving-control-loop-v1.yml',
  workflowName: 'KIDULTS ASI Self-Driving Control Loop v1',
  artifactName: 'kidults-asi-self-driving-cycle-v1',
  branch: 'main',
  expectedSha: sha,
  expectedBaseSha: 'd'.repeat(40),
  expectedHeadSha: sha,
  expectedGenerationSha: sha,
  triggerExpected: true,
  maxAttempts: 3,
  pollMilliseconds: 0,
};

const run = {
  id: 41,
  run_attempt: 1,
  repository: { full_name: repository },
  path: specification.workflowPath,
  name: specification.workflowName,
  head_branch: specification.branch,
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  created_at: '2026-09-06T00:00:00.000Z',
};

const artifact = {
  id: 71,
  name: specification.artifactName,
  expired: false,
  digest: `sha256:${'b'.repeat(64)}`,
  workflow_run: { id: run.id, head_sha: sha, head_branch: 'main' },
};

function classify(observation, overrides = {}) {
  return classifyObservation({ ...specification, ...overrides }, observation);
}

test('exact successful producer and one bound artifact pass', () => {
  const receipt = classify({ attempt: 1, runs: [run], artifacts: [artifact] });
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.outcome, 'EXACT_GENERATION_ARTIFACT_AVAILABLE');
  assert.equal(receipt.selected_run_id, 41);
  assert.equal(receipt.selected_artifact_id, 71);
  assert.equal(validateReceipt(receipt), true);
});

test('producer not yet created remains bounded waiting before final attempt', () => {
  const receipt = classify({ attempt: 1, runs: [], artifacts: [] });
  assert.equal(receipt.state, 'RUNNING_VERIFIED');
  assert.equal(receipt.outcome, 'WAITING_FOR_PRODUCER');
  assert.equal(receipt.terminal, false);
});

test('producer not created is distinct at final attempt', () => {
  const receipt = classify({ attempt: 3, runs: [], artifacts: [] });
  assert.equal(receipt.failure_class, 'PRODUCER_NOT_CREATED');
  assert.equal(receipt.terminal, true);
});

test('missing trigger contract is distinct from producer absence', () => {
  const receipt = classify({ attempt: 1, runs: [], artifacts: [] }, { triggerExpected: false });
  assert.equal(receipt.failure_class, 'TRIGGER_MISSING');
  assert.equal(receipt.attempts_completed, 1);
});

test('in-progress producer becomes orchestration timeout at bound', () => {
  const receipt = classify({
    attempt: 3,
    runs: [{ ...run, status: 'in_progress', conclusion: null }],
    artifacts: [],
  });
  assert.equal(receipt.failure_class, 'ORCHESTRATION_TIMEOUT');
});

test('terminal producer failure does not masquerade as timeout', () => {
  const receipt = classify({
    attempt: 1,
    runs: [{ ...run, conclusion: 'failure' }],
    artifacts: [],
  });
  assert.equal(receipt.failure_class, 'PRODUCER_TERMINAL_FAILURE');
});

test('artifact publication can wait within the bound', () => {
  const receipt = classify({ attempt: 1, runs: [run], artifacts: [] });
  assert.equal(receipt.state, 'RUNNING_VERIFIED');
  assert.equal(receipt.outcome, 'WAITING_FOR_ARTIFACT');
});

test('artifact missing is distinct after final attempt', () => {
  const receipt = classify({ attempt: 3, runs: [run], artifacts: [] });
  assert.equal(receipt.failure_class, 'ARTIFACT_MISSING');
});

test('expired artifact is distinct from missing publication', () => {
  const receipt = classify({ attempt: 1, runs: [run], artifacts: [{ ...artifact, expired: true }] });
  assert.equal(receipt.failure_class, 'ARTIFACT_EXPIRED');
  assert.equal(receipt.artifact_match_count, 1);
  assert.equal(receipt.expired_artifact_count, 1);
  assert.equal(receipt.selected_artifact_id, artifact.id);
  assert.equal(validateReceipt(receipt), true);
  assert.throws(
    () => classify({ attempt: 1, runs: [run], artifacts: [{ ...artifact, expired: true, workflow_run: { ...artifact.workflow_run, head_sha: 'c'.repeat(40) } }] }),
    /ARTIFACT_SHA_MISMATCH/,
  );
});

test('duplicate artifacts fail closed', () => {
  const receipt = classify({ attempt: 1, runs: [run], artifacts: [artifact, { ...artifact, id: 72 }] });
  assert.equal(receipt.failure_class, 'ARTIFACT_CARDINALITY_INVALID');
});

test('artifact head binding mutation fails closed', () => {
  assert.throws(
    () => classify({ attempt: 1, runs: [run], artifacts: [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: 'c'.repeat(40) } }] }),
    (error) => error instanceof OrchestrationError && error.code === 'ARTIFACT_SHA_MISMATCH',
  );
});

test('forbidden pull_request producer event fails closed', () => {
  assert.throws(
    () => classify({ attempt: 1, runs: [{ ...run, event: 'pull_request' }], artifacts: [artifact] }),
    (error) => error instanceof OrchestrationError && error.code === 'RUN_EVENT_FORBIDDEN',
  );
});

test('wrong repository, workflow, branch or SHA evidence fails closed', () => {
  for (const mutation of [
    { repository: { full_name: 'other/repository' } },
    { path: '.github/workflows/other.yml' },
    { head_branch: 'other' },
    { head_sha: 'c'.repeat(40) },
  ]) {
    assert.throws(() => classify({ attempt: 1, runs: [{ ...run, ...mutation }], artifacts: [] }), /RUN_.+MISMATCH/);
  }
});

test('base, head and generation bindings are explicit and fail closed on mutation', () => {
  const receipt = classify({ attempt: 1, runs: [run], artifacts: [artifact] });
  assert.equal(receipt.expected_base_sha, 'd'.repeat(40));
  assert.equal(receipt.expected_head_sha, sha);
  assert.equal(receipt.expected_generation_sha, sha);
  for (const mutation of [
    { expectedBaseSha: 'invalid' },
    { expectedHeadSha: 'c'.repeat(40) },
    { expectedGenerationSha: 'c'.repeat(40) },
  ]) assert.throws(() => classify({ attempt: 1, runs: [run], artifacts: [artifact] }, mutation));
});

test('malformed state and excessive bounds fail closed', () => {
  assert.throws(() => classify({ attempt: 1, runs: {}, artifacts: [] }), /RUN_EVIDENCE_INVALID/);
  assert.throws(() => classify({ attempt: 1, runs: [], artifacts: [] }, { maxAttempts: 61 }), /MAX_ATTEMPTS_INVALID/);
});

test('same evidence creates a deterministic receipt', () => {
  const left = classify({ attempt: 1, runs: [run], artifacts: [artifact] });
  const right = classify({ attempt: 1, runs: [run], artifacts: [artifact] });
  assert.deepEqual(left, right);
});

test('PR local fixture receipt is exact-head bound and request free', () => {
  const receipt = createLocalFixtureReceipt(
    { ...specification, branch: 'feature', triggerExpected: false },
    'tests/kidults/source-intelligence/asi-common-crawl-seed-frontier-rebase-v1.test.mjs',
  );
  assert.equal(receipt.state, 'VERIFIED_PASS_LOCAL_FIXTURE');
  assert.equal(receipt.external_provider_requests, 0);
  assert.equal(receipt.expected_producer_sha, sha);
  assert.equal(validateReceipt(receipt), true);
});

test('receipt mutation is rejected', () => {
  const receipt = classify({ attempt: 3, runs: [], artifacts: [] });
  assert.throws(() => validateReceipt({ ...receipt, writes: 1 }), /RECEIPT_DIGEST_INVALID/);
});

test('rehashing an extra receipt field remains fail closed', () => {
  const receipt = classify({ attempt: 3, runs: [], artifacts: [] });
  const unsigned = { ...receipt };
  delete unsigned.receipt_digest;
  unsigned.unbounded_detail = 'forbidden';
  const mutated = {
    ...unsigned,
    receipt_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`,
  };
  assert.throws(() => validateReceipt(mutated), /RECEIPT_FIELDS_INVALID/);
});

test('polling distinguishes producer absence without external provider calls', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify({ total_count: 0, workflow_runs: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const receipt = await resolveOrchestration(specification, {
    token: 'test-token',
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(receipt.failure_class, 'PRODUCER_NOT_CREATED');
  assert.equal(requested.length, 3);
  assert(requested.every((url) => url.startsWith('https://api.github.com/')));
  assert(requested.every((url) => !url.includes('commoncrawl') && !url.includes('openalex') && !url.includes('datacite')));
});

test('causal producer run identity excludes unrelated same-SHA runs before semantic validation', async () => {
  const unrelated = { ...run, id: 99, event: 'pull_request' };
  const fetchImpl = async (url) => {
    if (String(url).includes('/artifacts')) {
      return new Response(JSON.stringify({ total_count: 1, artifacts: [artifact] }), { status: 200 });
    }
    return new Response(JSON.stringify({ total_count: 2, workflow_runs: [unrelated, run] }), { status: 200 });
  };
  const receipt = await resolveOrchestration({ ...specification, expectedRunId: run.id }, {
    token: 'test-token',
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.expected_producer_run_id, run.id);
  assert.equal(receipt.selected_run_id, run.id);
  assert.equal(validateReceipt(receipt), true);
});

test('causal receipt rejects producer run-ID substitution', () => {
  assert.throws(
    () => classify({ attempt: 1, runs: [run], artifacts: [artifact] }, { expectedRunId: 99 }),
    (error) => error instanceof OrchestrationError && error.code === 'RUN_ID_MISMATCH',
  );
});

test('transport and malformed API evidence return bounded failure receipts', async () => {
  const transport = await resolveOrchestration(specification, {
    token: 'test-token',
    fetchImpl: async () => { throw new TypeError('synthetic transport'); },
    sleep: async () => {},
  });
  assert.equal(transport.failure_class, 'TRANSPORT_FAILURE');
  assert.equal(transport.attempts_completed, 1);
  assert.equal(validateReceipt(transport), true);

  const malformed = await resolveOrchestration(specification, {
    token: 'test-token',
    fetchImpl: async () => new Response('{', { status: 200 }),
    sleep: async () => {},
  });
  assert.equal(malformed.failure_class, 'MALFORMED_EVIDENCE');
  assert.equal(malformed.bounded_failure_detail, 'GITHUB_API_RESPONSE_INVALID');
  assert.equal(validateReceipt(malformed), true);
});

test('oversized GitHub metadata is rejected before JSON parsing', async () => {
  const receipt = await resolveOrchestration(specification, {
    token: 'test-token',
    fetchImpl: async () => new Response('{}', { status: 200, headers: { 'content-length': String(4 * 1024 * 1024 + 1) } }),
    sleep: async () => {},
  });
  assert.equal(receipt.failure_class, 'MALFORMED_EVIDENCE');
  assert.equal(receipt.bounded_failure_detail, 'GITHUB_API_RESPONSE_TOO_LARGE');
});
