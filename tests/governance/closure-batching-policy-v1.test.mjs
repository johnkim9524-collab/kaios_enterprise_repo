import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const p=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/closure-batching-policy-v1.json','utf8'));

test('closure policy batches diagnosis before corrective PR',()=>{
  assert.equal(p.state,'ACTIVE');
  assert.equal(p.execution.corrective_pr_limit_per_closure_set,1);
  assert.ok(p.execution.on_defect.indexOf('DO_NOT_IMMEDIATELY_CREATE_FOLLOWUP_PR') <
            p.execution.on_defect.indexOf('BATCH_CONFIRMED_DEFECTS_INTO_ONE_CLOSURE_SET'));
  assert.equal(p.execution.report_every_chunks,3);
});

test('closure requires whole-surface and real terminal proof',()=>{
  for(const x of ['GOVERNANCE_CLASSIFICATION','APPROVAL_POLICY_MANIFEST','POSITIVE_PATH','NEGATIVE_REPLAY_OR_FORGERY_PATH'])
    assert.ok(p.pre_pr_required_surfaces.includes(x));
  assert.equal(p.completion_gate.minimum_consecutive_natural_generations_without_corrective_change,2);
  assert.equal(p.completion_gate.require_actual_staging_e2e,true);
  assert.equal(p.completion_gate.require_durable_ledger_positive_and_negative,true);
  assert.equal(p.completion_gate.require_sentinel_assurance_terminal,true);
});

test('production boundaries remain held',()=>{
  assert.equal(p.completion_gate.production,'HOLD');
  assert.equal(p.completion_gate.public,'HOLD');
  assert.equal(p.completion_gate.g5,'HOLD');
});
