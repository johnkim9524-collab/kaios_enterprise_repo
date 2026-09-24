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

