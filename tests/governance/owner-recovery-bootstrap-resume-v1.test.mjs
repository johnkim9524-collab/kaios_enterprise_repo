import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateOwnerRecoveryBootstrapResume} from '../../scripts/governance/lib/owner-recovery-bootstrap-resume-v1.mjs';
import {EXPLICIT_EXECUTION_CONTROLS,routeAuthorizationControl} from '../../scripts/governance/lib/approval-policy-routing-v1.mjs';
const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/resume-contract-v1.json'));
const good={policy,purpose:'RESUME_LEDGER_BOOTSTRAP',repository:'owner/repo',actor:'owner',executionRef:'refs/heads/main',
  runId:123,runAttempt:1,handoffWindowSeconds:600,
  approval:{actor:'owner',comment_id:20,comment_created_at:'2026-10-08T22:00:01Z',comment_body_sha256:'sha256:'+createHash('sha256').update('approval').digest('hex')},
  ready:{id:10,created_at:'2026-10-08T22:00:00Z',actor:'owner',direct_repository_owner:true,performed_via_github_app:null,synthetic_lifecycle_boundary:false},
  rawReady:{id:10,event:'ready_for_review',created_at:'2026-10-08T22:00:00Z',actor:{login:'owner',type:'User'},performed_via_github_app:null},
  rawApproval:{id:20,body:'approval',created_at:'2026-10-08T22:00:01Z',updated_at:'2026-10-08T22:00:01Z',user:{login:'owner',type:'User'},author_association:'OWNER',performed_via_github_app:null},
  oneUse:{matching_run_count:1,matching_run_id:123,matching_run_attempt:1,bounded_attempt_ordinal:1,prior_non_success_attempt_count:0}};
test('protected lifecycle libraries remain inventoried write controls',()=>{
  for(const name of ['resume','readback','executor']) {
    const path=`scripts/kidults/staging-operations/lib/github-lifecycle-${name}-v1.mjs`;
    assert.ok(EXPLICIT_EXECUTION_CONTROLS.includes(path));
    assert.equal(routeAuthorizationControl(path,fs.readFileSync(path,'utf8')).route,'STAGING_BOUNDED');
  }
});
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
for(const field of ['rawReady','rawApproval']) {
  for(const mutation of ['missing','bot','missing-app','app','id','time']) {
    test(`rejects ${field} ${mutation} provenance`,()=>{
      const input=structuredClone(good);const raw=input[field];
      if(mutation==='missing') delete input[field];
      if(mutation==='bot') raw[field==='rawReady'?'actor':'user'].type='Bot';
      if(mutation==='missing-app') delete raw.performed_via_github_app;
      if(mutation==='app') raw.performed_via_github_app={id:1};
      if(mutation==='id') raw.id++;
      if(mutation==='time') raw.created_at='2026-10-08T22:00:03Z';
      assert.throws(()=>validateOwnerRecoveryBootstrapResume(input),/RAW_NATIVE_OWNER_EVIDENCE/);
    });
  }
}
for(const [field,key,value] of [['rawReady','event','converted_to_draft'],['rawApproval','author_association','MEMBER'],
  ['rawApproval','body','different approval'],['rawApproval','updated_at','2026-10-08T22:00:02Z']]) {
  test(`rejects raw ${field}.${key} drift`,()=>{
    const input=structuredClone(good);input[field][key]=value;
    assert.throws(()=>validateOwnerRecoveryBootstrapResume(input),/RAW_NATIVE_OWNER_EVIDENCE/);
  });
}
