import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {assertAutonomousFileScope} from '../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';

const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const delegated=read('coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json');
const landing=read('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json');
const governed=read('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json');

test('AI-020 forbids routine Owner orchestration and human independent review',()=>{
  assert.equal(delegated.normal_activation.manual_owner_orchestration_for_eligible_work,'FORBIDDEN');
  assert.equal(delegated.normal_activation.manual_independent_review_required,false);
  assert.equal(delegated.normal_activation.automated_machine_verification_required,true);
  assert.equal(governed.routing.routine_owner_reapproval_for_delegated_work,'FORBIDDEN');
  assert.equal(governed.routing.internal_reversible_workflow_and_governance_strengthening,'AI_020_AUTONOMOUS');
  assert.equal(governed.review_policy.manual_independent_review_required_for_ai_020_eligible_work,false);
});

test('internal workflow strengthening is autonomous while added authority is Owner-reserved',()=>{
  const safe={filename:'.github/workflows/internal-recovery.yml',patch:'@@ -1 +1,2 @@\n name: recovery\n+concurrency: bounded-recovery'};
  assert.deepEqual(assertAutonomousFileScope({files:[safe],policy:landing}),[safe.filename]);
  for(const line of ['+permissions: write-all','+  id-token: write','+environment: production','+value: ${{ secrets.ADMIN }}','+force: true']){
    assert.throws(()=>assertAutonomousFileScope({files:[{...safe,patch:`@@ -1 +1,2 @@\n name: recovery\n${line}`}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
  }
});

test('trust roots and external-effect surfaces remain Owner-reserved',()=>{
  for(const filename of [
    'CONSTITUTION.md',
    'coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json',
    'secrets/rotation.json',
    'production/release.yml',
    'public/publish.json',
    'g5/promotion.json',
  ]) assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:'@@ -1 +1 @@'}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
});

test('missing patch for governed workflow or governance code fails closed',()=>{
  for(const filename of ['.github/workflows/internal.yml','scripts/kidults/kpmo/internal.mjs']){
    assert.throws(()=>assertAutonomousFileScope({files:[{filename}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_CLASSIFICATION_UNKNOWN/);
  }
});

test('capability expansion and material deletion fail closed before dispatch',()=>{
  const filename='.github/workflows/internal-recovery.yml';
  for(const line of [
    '+permissions:\n+  contents: write',
    '+permissions:\n+  pull-requests: write',
    '+on:\n+  workflow_dispatch:',
    '+run: curl https://example.invalid',
    '+uses: aws-actions/configure-aws-credentials@v5',
  ]) assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:`@@ -1 +1,2 @@\n name: recovery\n${line}`}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);

  for(const removed of [
    '-environment: protected-staging',
    '-if: github.ref == refs/heads/main',
    '-run: node scripts/validate-authority.mjs',
    '-permissions: read-all',
  ]) assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:`@@ -1,2 +1 @@\n${removed}\n name: recovery`}],policy:landing}),/MATERIAL_DELETION_REQUIRES_OWNER/);
});

test('exact exceptions are classified and cannot weaken routing coverage',()=>{
  const filename='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:'@@ -1,2 +1 @@\n-  "authorization_routing": {"route":"CANONICAL_ENVELOPE"}\n+  "state":"updated"'}],policy:landing}),/MATERIAL_DELETION_REQUIRES_OWNER/);
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch:'@@ -1 +1,2 @@\n {\n+  "verification_evidence": "monotonic-hardening"'}],policy:landing}),[filename]);
});

test('comment-only deletion and monotonic hardening remain autonomous',()=>{
  const filename='scripts/kidults/kpmo/internal-recovery.mjs';
  const patch='@@ -1,2 +1,2 @@\n-// stale comment\n+// corrected comment\n+export const failClosed = true;';
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch}],policy:landing}),[filename]);
});
