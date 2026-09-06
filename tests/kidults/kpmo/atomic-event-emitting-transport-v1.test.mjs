import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

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
