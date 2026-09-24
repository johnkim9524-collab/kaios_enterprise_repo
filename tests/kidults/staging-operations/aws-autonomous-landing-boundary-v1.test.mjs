import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
const oidc = JSON.parse(fs.readFileSync('coordination/kidults/governance/github-oidc-subject-customization-v1.json','utf8'));
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
const roles = [
  ['Track','TrackEnvironment','TrackWorkflowRef','TrackApprovalSigningKey','kidults-autonomous-track-authorization-v1.yml','kidults.track.authorization.v1'],
  ['Kpmo','KpmoEnvironment','KpmoWorkflowRef','KpmoApprovalSigningKey','kidults-autonomous-kpmo-authorization-v1.yml','kidults.kpmo.authorization.v1'],
  ['Verifier','VerifierEnvironment','VerifierWorkflowRef','VerifierApprovalSigningKey','kidults-autonomous-independent-verification-authorization-v1.yml','kidults.independent.verification.v1'],
];

test('AWS trust uses only aud and custom sub and role workflows are distinct', () => {
  assert.deepEqual(oidc.desired.include_claim_keys,['repo','context','workflow_ref']);
  assert.equal(fs.existsSync('.github/workflows/kidults-autonomous-internal-landing-v1.yml'), false);
  const refs=new Set();
  for (const [prefix,envParam,wfParam,key,workflowFile,eventName] of roles) {
    const condition=template.Resources[`${prefix}ApprovalRole`].Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
    assert.deepEqual(Object.keys(condition).sort(),['token.actions.githubusercontent.com:aud','token.actions.githubusercontent.com:sub']);
    assert.equal(condition['token.actions.githubusercontent.com:aud'],'sts.amazonaws.com');
    assert.equal(condition['token.actions.githubusercontent.com:sub']['Fn::Sub'],`repo:${'${GitHubRepository}'}:environment:${'${' + envParam + '}'}:workflow_ref:${'${' + wfParam + '}'}`);
    const workflow=fs.readFileSync(`.github/workflows/${workflowFile}`,'utf8');
    assert.ok(workflow.includes(`      - ${eventName}`));
    for(const other of roles.map(v=>v[5]).filter(v=>v!==eventName)) assert.equal(workflow.includes(`      - ${other}`),false);
    assert.ok(workflow.includes(`environment: ${template.Parameters[envParam].Default}`));
    refs.add(template.Parameters[wfParam].Default);
    const actions=template.Resources[`${prefix}ApprovalRole`].Properties.Policies[0].PolicyDocument.Statement.flatMap(v=>v.Action||[]);
    assert.equal(actions.some(a=>a.startsWith('dynamodb:')),false);
    assert.ok(actions.includes('kms:Sign'));
  }
  assert.equal(refs.size,3);
});

test('finalizer trusts the three role workflows and the isolated canary, with no direct ledger writes', () => {
  const role=template.Resources.FinalizerRole.Properties;
  const condition=role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals;
  assert.deepEqual(Object.keys(condition).sort(),['token.actions.githubusercontent.com:aud','token.actions.githubusercontent.com:sub']);
  assert.deepEqual(condition['token.actions.githubusercontent.com:sub'],[
    ...roles.map(([, , workflowRef])=>({'Fn::Sub':`repo:${'${GitHubRepository}'}:environment:${'${FinalizerEnvironment}'}:workflow_ref:${'${' + workflowRef + '}'}`})),
    {'Fn::Sub':`repo:${'${GitHubRepository}'}:environment:${'${FinalizerEnvironment}'}:workflow_ref:${'${CanaryWorkflowRef}'}`},
  ]);
  const actions=role.Policies[0].PolicyDocument.Statement.flatMap(v=>v.Action||[]);
  for(const action of ['dynamodb:Query','lambda:InvokeFunction','kms:Sign']) assert.ok(actions.includes(action));
  assert.equal(actions.includes('dynamodb:PutItem'),false);
  assert.equal(actions.includes('dynamodb:UpdateItem'),false);
});

test('writer verifies KMS signatures and runner rejects caller-supplied workload identity', () => {
  const code=template.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;
  for(const marker of ['verify_approval_signature','verify_finalizer_signature','APPROVAL_SIGNATURE_INVALID','FINALIZER_SIGNATURE_INVALID']) assert.match(code,new RegExp(marker));
  assert.match(runner,/AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN/);
  assert.match(runner,/KIDULTS_AUTONOMOUS_WORKFLOW_REF/);
  assert.equal(runner.includes('AUTONOMOUS_EVENT_SENDER_ID_MISMATCH'),false);
});
