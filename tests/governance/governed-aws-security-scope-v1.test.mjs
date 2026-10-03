import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/kidults-governed-landing-authorization-v1.yml','utf8');
const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json','utf8'));

test('AWS infrastructure is always governed landing scope',()=>{
  assert.ok(policy.governed_path_prefixes.includes('infrastructure/aws/'));
  const occurrences=workflow.match(/'infrastructure\/aws\/'/g)||[];
  assert.equal(occurrences.length,2);
});

test('AWS security changes cannot be classified as ordinary non-governed readiness',()=>{
  assert.match(workflow,/READY_PENDING_ATOMIC_LANDING/);
  assert.match(workflow,/atomic_landing_required:true/);
  assert.match(workflow,/landing_authorization_created:false/);
  assert.match(workflow,/Ready lifecycle verified; operation-specific landing authority required/);
});
