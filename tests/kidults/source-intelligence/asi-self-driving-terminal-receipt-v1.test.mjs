import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReceipt } from '../../../scripts/kidults/source-intelligence/build-asi-self-driving-terminal-receipt-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo';
const sha='69f9c45c8371c4439649de0f811f4c6a7b2149d6';
const base={expected_repository:repo,upstream_repository:repo,upstream_branch:'main',upstream_sha:sha,live_main_sha:sha,upstream_conclusion:'success',upstream_run_id:'123',upstream_run_attempt:'1'};

test('exact current-main upstream success is control-pass but never promotable',()=>{
  const r=buildReceipt(base);
  assert.equal(r.terminal_state,'VERIFIED_PASS');
  assert.equal(r.protected_main.exact_upstream_binding,true);
  assert.equal(r.promotion_eligible,false);
  assert.equal(r.empirical_authority,false);
  assert.equal(r.production,'HOLD');
  assert.equal(r.public_release,'HOLD');
  assert.equal(r.g5,'HOLD');
});

test('failed upstream is durably fail-closed',()=>{
  const r=buildReceipt({...base,upstream_conclusion:'failure'});
  assert.equal(r.terminal_state,'VERIFIED_FAIL');
  assert.ok(r.findings.includes('UPSTREAM_CONCLUSION_FAILURE'));
  assert.equal(r.promotion_eligible,false);
});

test('cancelled upstream is durably fail-closed',()=>{
  const r=buildReceipt({...base,upstream_conclusion:'cancelled'});
  assert.equal(r.terminal_state,'VERIFIED_FAIL');
  assert.ok(r.findings.includes('UPSTREAM_CONCLUSION_CANCELLED'));
});

test('historical same-repository SHA cannot masquerade as current main',()=>{
  const r=buildReceipt({...base,live_main_sha:'1111111111111111111111111111111111111111'});
  assert.equal(r.terminal_state,'VERIFIED_FAIL');
  assert.ok(r.findings.includes('UPSTREAM_NOT_CURRENT_PROTECTED_MAIN'));
  assert.equal(r.protected_main.exact_upstream_binding,false);
});

test('repository or branch substitution fails closed',()=>{
  const wrongRepo=buildReceipt({...base,upstream_repository:'other/repo'});
  assert.equal(wrongRepo.terminal_state,'VERIFIED_FAIL');
  assert.ok(wrongRepo.findings.includes('UPSTREAM_REPOSITORY_MISMATCH'));
  const wrongBranch=buildReceipt({...base,upstream_branch:'feature'});
  assert.equal(wrongBranch.terminal_state,'VERIFIED_FAIL');
  assert.ok(wrongBranch.findings.includes('UPSTREAM_BRANCH_NOT_MAIN'));
});

test('malformed run identity fails closed',()=>{
  const r=buildReceipt({...base,upstream_run_id:'abc',upstream_run_attempt:'0'});
  assert.equal(r.terminal_state,'VERIFIED_FAIL');
  assert.ok(r.findings.includes('UPSTREAM_RUN_ID_MALFORMED'));
  assert.ok(r.findings.includes('UPSTREAM_RUN_ATTEMPT_MALFORMED'));
});


test('workflow_run terminal receipts are attempt-bound and cannot cancel one another',()=>{
  const workflow=readFileSync('.github/workflows/kidults-asi-autobalance-steering-overlay-live-v1.yml','utf8');
  assert.ok(workflow.includes("github.event.workflow_run.run_attempt || github.run_attempt"));
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name != 'workflow_run' }}"));
  assert.equal(/cancel-in-progress:\s*true/.test(workflow),false);
});

test('market feedback step failures retain a non-promotable terminal receipt',()=>{
  const workflow=readFileSync('.github/workflows/kidults-asi-market-structure-acquisition-feedback-v1.yml','utf8');
  assert.ok(workflow.includes('Emit durable fail-closed market feedback terminal receipt'));
  assert.ok(workflow.includes('Upload durable market feedback terminal receipt'));
  assert.ok((workflow.match(/if: \${{ always\(\) }}/g)||[]).length>=2);
  assert.ok(workflow.includes("terminal_state:pass?'VERIFIED_PASS':'VERIFIED_FAIL'"));
  assert.ok(workflow.includes('primary_feedback_artifact_available:pass'));
  assert.ok(workflow.includes('promotion_eligible:false'));
  assert.ok(workflow.includes("public_release:'HOLD'"));
  assert.ok(workflow.indexOf('Upload durable market feedback terminal receipt')>workflow.indexOf('Refresh bounded regional observation'));
});
