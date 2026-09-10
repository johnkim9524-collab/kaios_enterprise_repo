import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildReceipt } from '../../../scripts/kidults/kpmo/build-p0b-terminal-observer-receipt-v1.mjs';

const repo = 'johnkim9524-collab/kaios_enterprise_repo';
const sha = 'a'.repeat(40);

function event(conclusion = 'success') {
  return {
    action: 'completed',
    workflow_run: {
      id: 34502810427,
      run_attempt: 1,
      name: 'KIDULTS ASI P0B Bounded Discovery Candidates v1',
      head_branch: 'main',
      head_sha: sha,
      conclusion,
      repository: { full_name: repo }
    }
  };
}

function artifact() {
  return {
    id: 101,
    name: 'kidults-asi-p0b-bounded-discovery-candidates-v1',
    expired: false,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 34502810427, head_sha: sha }
  };
}

function build(e = event(), artifacts = [artifact()], liveMainSha = sha) {
  return buildReceipt({
    event: e,
    artifactsResponse: { artifacts },
    repository: repo,
    liveMainSha,
    observerRunId: '9001',
    observerRunAttempt: '1'
  });
}

test('success requires exactly one exact-generation durable artifact', () => {
  const receipt = build();
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_PASS');
  assert.equal(receipt.overall_state, 'HOLD');
  assert.deepEqual(receipt.failure_classes, []);
  assert.equal(receipt.promotion_eligible, false);
  assert.equal(receipt.production, 'HOLD');
  assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
});

test('cancel after local receipt with zero durable artifact is RED and non-substitutable', () => {
  const receipt = build(event('cancelled'), []);
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.equal(receipt.overall_state, 'RED');
  assert.ok(receipt.failure_classes.includes('PRODUCER_CONCLUSION_cancelled'));
  assert.ok(receipt.failure_classes.includes('P0B_ARTIFACT_CARDINALITY_0'));
  assert.equal(receipt.later_run_substitution_allowed, false);
  assert.equal(receipt.same_sha_run_substitution_allowed, false);
});

test('failure remains RED even when the source artifact exists', () => {
  const receipt = build(event('failure'));
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.ok(receipt.failure_classes.includes('PRODUCER_CONCLUSION_failure'));
});

test('success without a source artifact cannot become green', () => {
  const receipt = build(event('success'), []);
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.ok(receipt.failure_classes.includes('P0B_ARTIFACT_CARDINALITY_0'));
});

test('wrong artifact generation is rejected', () => {
  const wrong = artifact();
  wrong.workflow_run.id += 1;
  const receipt = build(event('success'), [wrong]);
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.ok(receipt.failure_classes.includes('P0B_ARTIFACT_RUN_ID_MISMATCH'));
});

test('expired or digestless source artifacts are rejected', () => {
  const bad = artifact();
  bad.expired = true;
  bad.digest = null;
  const receipt = build(event('success'), [bad]);
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.ok(receipt.failure_classes.includes('P0B_ARTIFACT_EXPIRED_OR_INVALID'));
  assert.ok(receipt.failure_classes.includes('P0B_ARTIFACT_DIGEST_INVALID'));
});

test('historical same-branch producer cannot substitute for current protected main', () => {
  const receipt = build(event('success'), [artifact()], 'c'.repeat(40));
  assert.equal(receipt.producer_terminal_state, 'VERIFIED_FAIL');
  assert.ok(receipt.failure_classes.includes('PRODUCER_NOT_CURRENT_PROTECTED_MAIN'));
});

test('observer is polling-based so cancellation protection does not consume another workflow_run edge', () => {
  const workflow = fs.readFileSync('.github/workflows/kpmo-p0b-terminal-observer-v1.yml', 'utf8');
  assert.match(workflow, /name: KPMO P0B Terminal Observer V1/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*workflow_run:/m);
  assert.match(workflow, /kidults-asi-p0b-bounded-discovery-candidates-v1\.yml\/runs/);
  assert.match(workflow, /actions\/runs\/\$\{RUN_ID\}\/artifacts\?per_page=100/);
  assert.match(workflow, /24 hours ago/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /contents: write|issues: write|pull-requests: write|deployments: write/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Fail closed after durable observer receipts/);
});

test('current P0B direct workflow_run fanout stays at the pre-correction count', () => {
  const p1 = fs.readFileSync('.github/workflows/kidults-asi-p1-source-preflight-v1.yml', 'utf8');
  const observer = fs.readFileSync('.github/workflows/kpmo-p0b-terminal-observer-v1.yml', 'utf8');
  assert.match(p1, /workflow_run:[\s\S]*KIDULTS ASI P0B Bounded Discovery Candidates v1/);
  assert.doesNotMatch(observer, /^\s*workflow_run:/m);
});
