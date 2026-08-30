#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  P1RuntimeLineageValidationError,
  validateP1RuntimeLineageFromEnvironment,
  validateP1RuntimeLineageSnapshot
} from '../../../scripts/kidults/source-intelligence/validate-asi-p1-runtime-lineage-v1.mjs';

const sha = 'a'.repeat(40);
const eventPayload = {
  action: 'completed',
  workflow_run: {
    id: 202,
    event: 'workflow_run',
    name: 'KIDULTS ASI P1 Source Preflight v1',
    path: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml',
    head_branch: 'main',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success'
  }
};
const receipt = {
  id: 'kidults-asi-p1-source-preflight-receipt-v1',
  state: 'VERIFIED_PASS',
  source_sha: sha,
  trigger_event: 'workflow_run',
  p0b_input_mode: 'EXACT_TRIGGERING_WORKFLOW_RUN',
  p0b_origin_run_id: 101,
  p0b_origin_source_sha: sha,
  public_release: 'HOLD',
  production: 'HOLD'
};

assert.equal(validateP1RuntimeLineageSnapshot({
  eventName: 'workflow_run', eventPayload, receipt, expectedSourceSha: sha
}).state, 'COMPLETE_VERIFIED');

const authoritativeReceipt = {
  ...receipt,
  artifact_role: 'AUTHORITATIVE_P1_PRODUCER',
  authoritative_producer: true,
  downstream_consumable: true
};
assert.equal(validateP1RuntimeLineageSnapshot({
  eventName: 'workflow_run', eventPayload, receipt: authoritativeReceipt, expectedSourceSha: sha
}).state, 'COMPLETE_VERIFIED');

const rejected = [
  ['manual-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'workflow_dispatch'}}, receipt],
  ['scheduled-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'schedule'}}, receipt],
  ['push-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'push'}}, receipt],
  ['local-control-receipt', eventPayload, {...receipt, trigger_event: 'workflow_dispatch', p0b_input_mode: 'REBUILT_LOCAL_CONTROL'}],
  ['wrong-workflow-path', {...eventPayload, workflow_run: {...eventPayload.workflow_run, path: '.github/workflows/other.yml'}}, receipt],
  ['wrong-head-sha', {...eventPayload, workflow_run: {...eventPayload.workflow_run, head_sha: 'b'.repeat(40)}}, receipt],
  ['p0b-self-reference', eventPayload, {...receipt, p0b_origin_run_id: 202}],
  ['p0b-source-mismatch', eventPayload, {...receipt, p0b_origin_source_sha: 'b'.repeat(40)}],
  ['partial-authority', eventPayload, {...receipt, artifact_role: 'AUTHORITATIVE_P1_PRODUCER'}]
];
for (const [name, mutatedEvent, mutatedReceipt] of rejected) {
  assert.throws(
    () => validateP1RuntimeLineageSnapshot({
      eventName: 'workflow_run',
      eventPayload: mutatedEvent,
      receipt: mutatedReceipt,
      expectedSourceSha: sha
    }),
    P1RuntimeLineageValidationError,
    name
  );
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-p1-runtime-lineage-'));
try {
  const expanded = path.join(temp, 'expanded', 'nested');
  fs.mkdirSync(expanded, { recursive: true });
  const eventPath = path.join(temp, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(eventPayload));
  fs.writeFileSync(path.join(expanded, 'kidults-asi-p1-source-preflight-receipt-v1.json'), JSON.stringify(receipt));
  assert.equal(validateP1RuntimeLineageFromEnvironment({
    eventName: 'workflow_run',
    eventPath,
    expandedRoot: path.join(temp, 'expanded'),
    expectedSourceSha: sha
  }).state, 'COMPLETE_VERIFIED');
  fs.writeFileSync(path.join(temp, 'expanded', 'kidults-asi-p1-source-preflight-receipt-v1.json'), JSON.stringify(receipt));
  assert.throws(() => validateP1RuntimeLineageFromEnvironment({
    eventName: 'workflow_run',
    eventPath,
    expandedRoot: path.join(temp, 'expanded'),
    expectedSourceSha: sha
  }), P1RuntimeLineageValidationError);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ASI_P1_RUNTIME_LINEAGE_V1',
  result: 'PASS',
  exact_p0b_to_p1_to_arl_lineage: true,
  manual_schedule_push_p1_artifacts_rejected: true,
  p1_receipt_cardinality_enforced: true,
  self_origin_rejected: true,
  candidate_created: false,
  evidence_created: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
