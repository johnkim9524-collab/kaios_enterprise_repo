import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  issueKirCoverageAssuranceContinuation,
  consumeKirCoverageAssuranceContinuation,
} from '../../../scripts/kidults/kpmo/validate-kir-coverage-assurance-continuation-v1.mjs';

const repository = 'johnkim9524-collab/kaios_enterprise_repo';
const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const runId = 34071423953;
const runAttempt = 1;
const artifactId = 10000596594;
const artifactDigest = `sha256:${'c'.repeat(64)}`;
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const reseal = (receipt) => {
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt_digest;
  receipt.receipt_digest = `sha256:${crypto.createHash('sha256').update(stable(unsigned)).digest('hex')}`;
};
const run = (overrides = {}) => ({
  id: runId, run_attempt: runAttempt,
  name: `KIDULTS Coverage / source-${sha}`, display_title: `KIDULTS Coverage / source-${sha}`,
  path: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml', event: 'workflow_run',
  status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: sha,
  repository: {full_name: repository}, head_repository: {full_name: repository},
  created_at: '2026-09-07T00:57:13Z', ...overrides,
});

function fixture() {
  const dispatchReceipt = issueKirCoverageAssuranceContinuation({
    repository, source_sha: sha, source_tree: tree,
    coverage_run_id: runId, coverage_run_attempt: runAttempt, run: run(),
  });
  return {
    request: {
      repository, source_sha: sha, source_tree: tree, coverage_run_id: runId,
      coverage_run_attempt: runAttempt, coverage_created_at: run().created_at,
      dispatch_artifact_id: artifactId, dispatch_artifact_digest: artifactDigest,
      continuation_key: dispatchReceipt.continuation_key,
    },
    run: run(),
    current: {repository, source_sha: sha, source_tree: tree},
    dispatch_artifact: {
      id: artifactId, name: `kidults-kir-coverage-assurance-dispatch-v1-${runId}-${runAttempt}`,
      digest: artifactDigest, expired: false, workflow_run: {id: runId, head_sha: sha},
    },
    dispatch_receipt: dispatchReceipt,
    prior_consumption_count: 0,
    consumer: {run_id: 34080000001, run_attempt: 1},
  };
}

test('exact Coverage continuation issues and consumes once without release authority', () => {
  const issued = fixture().dispatch_receipt;
  assert.equal(issued.state, 'ISSUED_PENDING_ONE_TIME_CONSUMPTION');
  const consumed = consumeKirCoverageAssuranceContinuation(fixture());
  assert.equal(consumed.state, 'CONSUMED_VERIFIED');
  assert.equal(consumed.one_time_consumed, true);
  assert.equal(consumed.authoritative_coverage_verified, true);
  assert.equal(consumed.classification_only_success_accepted, false);
  for (const key of ['public', 'production', 'g5']) assert.equal(consumed[key], 'HOLD');
});

const mutations = [
  ['stale SHA', (x) => { x.request.source_sha = 'd'.repeat(40); }, /CONSUME_STALE_SOURCE_SHA/],
  ['stale Tree', (x) => { x.request.source_tree = 'd'.repeat(40); }, /CONSUME_STALE_SOURCE_TREE/],
  ['stale Receipt', (x) => { x.dispatch_receipt.source_sha = 'd'.repeat(40); reseal(x.dispatch_receipt); }, /CONSUME_RECEIPT_BINDING_SOURCE_SHA/],
  ['replay', (x) => { x.prior_consumption_count = 1; }, /CONSUME_REPLAY_DETECTED/],
  ['missing producer', (x) => { x.run = null; }, /COVERAGE_RUN_REQUIRED/],
  ['missing consumer', (x) => { x.consumer = {}; }, /CONSUMER_RUN_ID_INVALID/],
  ['workflow drift', (x) => { x.run.path = '.github/workflows/other.yml'; }, /COVERAGE_WORKFLOW_IDENTITY_MISMATCH/],
  ['rights drift', (x) => { x.dispatch_receipt.production = 'READY'; reseal(x.dispatch_receipt); }, /CONSUME_AUTHORITY_BOUNDARY/],
  ['lineage corruption', (x) => { x.run.created_at = '2026-09-07T00:58:13Z'; }, /CONSUME_CREATED_AT_MISMATCH/],
  ['classification-only success', (x) => { x.run.event = 'schedule'; }, /COVERAGE_EVENT_NOT_AUTHORITATIVE/],
  ['failed Coverage', (x) => { x.run.conclusion = 'failure'; }, /COVERAGE_NOT_SUCCESS/],
  ['artifact digest drift', (x) => { x.dispatch_artifact.digest = `sha256:${'e'.repeat(64)}`; }, /CONSUME_ARTIFACT_DIGEST_MISMATCH/],
  ['duplicate producer artifact substitution', (x) => { x.dispatch_artifact.id += 1; }, /CONSUME_ARTIFACT_BINDING_MISMATCH/],
  ['continuation key corruption', (x) => { x.request.continuation_key = `sha256:${'f'.repeat(64)}`; }, /CONSUME_CONTINUATION_KEY_MISMATCH/],
  ['receipt field injection', (x) => { x.dispatch_receipt.observation = 'MIXED_EVIDENCE_CLASS'; reseal(x.dispatch_receipt); }, /CONSUME_RECEIPT_FIELDS_NOT_EXACT/],
  ['rehashed continuation key forgery', (x) => { x.dispatch_receipt.continuation_key = `sha256:${'f'.repeat(64)}`; x.request.continuation_key = x.dispatch_receipt.continuation_key; reseal(x.dispatch_receipt); }, /CONSUME_CONTINUATION_KEY_MISMATCH/],
];

for (const [name, mutate, expected] of mutations) test(`fail closed: ${name}`, () => {
  const input = fixture();
  mutate(input);
  assert.throws(() => consumeKirCoverageAssuranceContinuation(input), expected);
});

test('issuer rejects non-authoritative classification-only Coverage', () => {
  assert.throws(() => issueKirCoverageAssuranceContinuation({
    repository, source_sha: sha, source_tree: tree,
    coverage_run_id: runId, coverage_run_attempt: runAttempt,
    run: run({event: 'workflow_dispatch'}),
  }), /COVERAGE_EVENT_NOT_AUTHORITATIVE/);
});
