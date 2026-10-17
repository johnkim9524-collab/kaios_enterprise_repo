import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const template = JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
// Inspect the authenticated original code, rather than searching compressed bytes.
const writerCapsule = template.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;
const capsulePayload = writerCapsule.match(/_s = json\.loads\(bz2\.decompress\(base64\.b64decode\('([A-Za-z0-9+/=]+)'\)\)\.decode\('utf-8'\)\)/);
assert.ok(capsulePayload, 'fixed ledger source capsule required');
const writerSources = JSON.parse(execFileSync('python3',['-c','import bz2,sys;sys.stdout.write(bz2.decompress(sys.stdin.buffer.read()).decode())'],
  {input:Buffer.from(capsulePayload[1],'base64'),encoding:'utf8'}));
assert.deepEqual(Object.keys(writerSources).sort(), ['core','historical','interrupted','shared_budget']);
const hashLiteral = writerCapsule.match(/^_h = (\{[^\n]+\})$/m);
assert.ok(hashLiteral, 'fixed capsule hash mapping required');
const sourceHashes = JSON.parse(hashLiteral[1].replaceAll("'", '"'));
assert.deepEqual(Object.keys(sourceHashes).sort(), Object.keys(writerSources).sort());
for (const [name, source] of Object.entries(writerSources)) {
  const digest = createHash('sha256').update(source).digest('hex');
  assert.equal(sourceHashes[name], digest, `${name} capsule digest mismatch`);
  const file = {core:'autonomous-landing-ledger-core-v2.py',historical:'autonomous_postmerge_recovery_ledger_v1.py',interrupted:'interrupted-reservation-recovery-ledger-v1.py',shared_budget:'shared_github_read_budget_ledger_v1.py'}[name];
  const normalized=execFileSync('python3',['-c',"import ast,pathlib,sys;sys.stdout.write(ast.unparse(ast.parse(pathlib.Path(sys.argv[1]).read_text()))+'\\n')",`scripts/kidults/kpmo/lib/${file}`],{encoding:'utf8'});
  assert.equal(source, normalized, `${name} normalized source mismatch`);
}
const writerCode = writerSources.core;
const oidc = JSON.parse(fs.readFileSync('coordination/kidults/governance/github-oidc-subject-customization-v1.json','utf8'));
const runner = fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
const landingPolicy = JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
const roles = [
  ['Track','TrackEnvironment','TrackWorkflowRef','TrackApprovalSigningKey','kidults-autonomous-track-authorization-v1.yml','kidults.authorization.generation.v1'],
  ['Kpmo','KpmoEnvironment','KpmoWorkflowRef','KpmoApprovalSigningKey','kidults-autonomous-kpmo-authorization-v1.yml','kidults.authorization.generation.v1'],
  ['Verifier','VerifierEnvironment','VerifierWorkflowRef','VerifierApprovalSigningKey','kidults-autonomous-independent-verification-authorization-v1.yml','kidults.authorization.generation.v1'],
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
    const statements=template.Resources[`${prefix}ApprovalRole`].Properties.Policies[0].PolicyDocument.Statement;
    const actions=statements.flatMap(v=>v.Action||[]);
    assert.deepEqual(actions.filter(a=>a.startsWith('dynamodb:')).sort(),['dynamodb:Query']);
    const ledgerRead=statements.find(statement=>(statement.Action||[]).includes('dynamodb:Query'));
    assert.deepEqual(ledgerRead.Resource,{'Fn::GetAtt':['AutonomousLandingLedger','Arn']});
    assert.deepEqual(ledgerRead.Condition,{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['AUTH#*']}});
    const budget=statements.filter(s=>JSON.stringify(s)===JSON.stringify({Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem'],Resource:{'Fn::GetAtt':['AutonomousLandingLedger','Arn']},Condition:{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['GITHUB_READ_BUDGET#*']}}}));
    assert.equal(budget.length,0);
    assert.equal(actions.some(a=>['dynamodb:DeleteItem','dynamodb:BatchWriteItem'].includes(a)),false);
    assert.ok(actions.includes('kms:Sign'));
  }
  assert.equal(refs.size,3);
});

test('finalizer trusts KPMO and machine-verifier workflows plus isolated canary, with no direct ledger writes', () => {
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

test('writer has exact-table read/write authority required by canonical alias binding', () => {
  const statements=template.Resources.AutonomousLedgerWriterRole.Properties.Policies[0].PolicyDocument.Statement;
  const ddb=statements.find(s=>Array.isArray(s.Action)&&s.Action.includes('dynamodb:PutItem'));
  assert.deepEqual(ddb.Action,['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem']);
  assert.deepEqual(ddb.Resource,{'Fn::GetAtt':['AutonomousLandingLedger','Arn']});
  assert.equal(ddb.Action.includes('dynamodb:Scan'),false);
});

test('writer verifies KMS signatures and runner rejects caller-supplied workload identity', () => {
  const code=writerCode;
  for(const marker of ['verify_approval_signature','verify_finalizer_signature','APPROVAL_SIGNATURE_INVALID','FINALIZER_SIGNATURE_INVALID']) assert.match(code,new RegExp(marker));
  assert.match(runner,/AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN/);
  assert.match(runner,/KIDULTS_AUTONOMOUS_WORKFLOW_REF/);
  assert.equal(runner.includes('AUTONOMOUS_EVENT_SENDER_ID_MISMATCH'),false);
});

test('finalizer reservation is a single-winner lease and followers exit without merge authority', () => {
  const code=writerCode;
  for(const marker of ['reserve_once','ReturnValuesOnConditionCheckFailure','ConditionalCheckFailedException','ALREADY_RESERVED','owner_run_id','RESERVATION_CONFLICT_INVALID']) assert.match(code,new RegExp(marker));
  assert.match(runner,/state:'FINALIZER_FOLLOWER'/);
  assert.match(runner,/reservation_owner_run_id/);
  assert.match(runner,/process\.exit\(0\)/);
  assert.match(runner,/String\(reservation\.owner_run_id\)!==finalizerRunId/);
  assert.match(code,/ConditionExpression='#s = :reserved AND run_id = :run AND head_sha = :head'/);
});

test('normal-ops finalization is quorum-and-reservation elected, writer-bound, and bounded', () => {
  const recovery=landingPolicy.bounded_recovery.normal_ops_finalizer;
  assert.equal(recovery.election_mode,'ORIGINAL_RESERVATION_CAS_AFTER_KPMO_AND_MACHINE_VERIFICATION');
  assert.equal(recovery.allowed_workflows.length,2);
  assert.equal(recovery.losing_finalizer_behavior,'SUCCESSFUL_NON_MERGING_RESERVATION_FOLLOWER');
  assert.equal(recovery.writer_policy_rejection_retry,false);
  assert.equal(recovery.persistent_writer_failure,'FAIL_CLOSED_AND_WAIT_FOR_AUTONOMOUS_STAGING_SELF_HEAL');
  assert.match(runner,/finalizer_quorum_wait_seconds\|\|90/);
  assert.match(runner,/assertFinalizerElection/);
  assert.match(runner,/assertFinalizerElection\(\{policy,workflow:required\('GITHUB_WORKFLOW'\)\}\)/);
  assert.match(runner,/writer_retry_attempts\|\|3/);
  assert.match(runner,/error\.code!==?'?AUTONOMOUS_LEDGER_WRITER_FAILURE'?/);
  assert.doesNotMatch(runner,/RECOVERY_VERIFIER_ELECTED|GITHUB_EXACT_HEAD_FAILOVER|primary_writer_failure/);
});
