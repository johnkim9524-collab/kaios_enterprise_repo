import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOwnerRecoveryBootstrapResume} from '../../scripts/governance/lib/owner-recovery-bootstrap-resume-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/resume-contract-v1.json'));
const good={policy,purpose:'RESUME_LEDGER_BOOTSTRAP',repository:'owner/repo',actor:'owner',executionRef:'refs/heads/main',
  runId:123,runAttempt:1,handoffWindowSeconds:600,
  approval:{actor:'owner',comment_id:20,comment_body_sha256:'sha256:'+'a'.repeat(64)},
  ready:{actor:'owner',direct_repository_owner:true,performed_via_github_app:null,synthetic_lifecycle_boundary:false},
  oneUse:{matching_run_count:1,matching_run_id:123,matching_run_attempt:1,bounded_attempt_ordinal:1,prior_non_success_attempt_count:0}};
test('native exact Owner one-use recovery does not prove external ledger or normal operations',()=>{
  const result=validateOwnerRecoveryBootstrapResume(good);assert.equal(result.external_ledger_proven,false);assert.equal(result.normal_operations_proven,false);
});
for(const [name,value] of Object.entries({purpose:'NORMAL_OPERATION',actor:'bot',executionRef:'refs/heads/feature',runAttempt:2,handoffWindowSeconds:901,
  approval:null,ready:{...good.ready,performed_via_github_app:{id:1}},oneUse:{...good.oneUse,bounded_attempt_ordinal:2}})) {
  test(`rejects ${name} mutation`,()=>assert.throws(()=>validateOwnerRecoveryBootstrapResume({...good,[name]:value})));
}
for(const field of ['normal_operation_allowed','credential_or_iam_expansion_allowed','ruleset_bypass_allowed','grants_new_owner_authority']) {
  test(`policy cannot expand ${field}`,()=>{const changed=structuredClone(policy);changed.owner_recovery_bootstrap[field]=true;assert.throws(()=>validateOwnerRecoveryBootstrapResume({...good,policy:changed}));});
}
test('new operations and removed postmerge evidence cannot broaden the route',()=>{
  const p=structuredClone(policy);p.owner_recovery_bootstrap.allowed_operations.push('DEPLOY');assert.throws(()=>validateOwnerRecoveryBootstrapResume({...good,policy:p}));
  p.owner_recovery_bootstrap=structuredClone(policy.owner_recovery_bootstrap);p.owner_recovery_bootstrap.postmerge_exact_sha_suite_required=false;
  assert.throws(()=>validateOwnerRecoveryBootstrapResume({...good,policy:p}));
});
