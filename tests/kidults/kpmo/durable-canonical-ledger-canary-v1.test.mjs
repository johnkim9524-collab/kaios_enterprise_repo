import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/kidults/kpmo/run-durable-canonical-ledger-canary-v1.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/kidults-autonomous-object-lock-canary-v1.yml','utf8');

test('canonical canary uses existing FINALIZER OIDC boundary and is explicit-only',()=>{
  assert.match(workflow,/durable_canonical_claim_canary:/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.durable_canonical_claim_canary/);
  assert.match(workflow,/KIDULTS_AUTONOMOUS_ENVIRONMENT: KIDULTS-AUTONOMOUS-FINALIZER/);
  assert.match(workflow,/run-durable-canonical-ledger-canary-v1\.mjs/);
  assert.match(workflow,/kidults-durable-canonical-ledger-canary-\$\{\{ github\.run_id \}\}/);
});

test('canonical canary proves duplicate and forged alias rejection before PASS',()=>{
  assert.match(script,/CREATE_CANONICAL_CLAIM/);
  assert.match(script,/COMMIT_CANONICAL_CLAIM/);
  assert.match(script,/CREATE_CANONICAL_ALIAS/);
  assert.match(script,/expectFailure/);
  assert.match(script,/duplicate_claim_rejected:true/);
  assert.match(script,/wrong_alias_rejected:true/);
  assert.match(script,/production:'HOLD',public:'HOLD',g5:'HOLD'/);
});
