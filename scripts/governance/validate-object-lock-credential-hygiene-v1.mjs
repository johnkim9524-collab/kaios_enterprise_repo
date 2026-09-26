import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/kidults-autonomous-object-lock-canary-v1.yml', 'utf8');
const helper = fs.readFileSync('scripts/kidults/kpmo/aws-oidc-credential-process-v1.sh', 'utf8');
const stepName = '- name: Acquire FINALIZER credentials through exact GitHub OIDC subject';
const acquisitionStart = workflow.indexOf(stepName);
const nextStep = workflow.indexOf('\n      - name:', acquisitionStart + stepName.length);
assert.ok(acquisitionStart >= 0 && nextStep > acquisitionStart, 'bounded FINALIZER credential step must exist');
const step = workflow.slice(acquisitionStart, nextStep);

assert.ok(!/set\s+-[^\n]*x/.test(step), 'credential step must never enable shell tracing');
assert.match(step, /credential_process = bash .*aws-oidc-credential-process-v1\.sh/);
assert.ok(step.includes('chmod 600 "$profile_path"'), 'credential profile must be owner-only');
assert.ok(step.includes('AWS_CONFIG_FILE=$profile_path'), 'workflow must export only the credential profile path');
assert.ok(step.includes('AWS_PROFILE=kidults-oidc'), 'workflow must select the credential-process profile');

for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
  assert.ok(!workflow.includes('echo "' + name + '='), name + ' must never be written to GITHUB_ENV');
}
assert.doesNotMatch(workflow, /read\s+-r\s+AWS_ACCESS_KEY_ID/);
assert.ok(!helper.includes('$GITHUB_ENV'), 'credential helper must not persist values across steps');
assert.match(helper, /env[\s\S]*-u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN/, 'helper must reject inherited static credentials');
assert.ok(helper.includes('assume-role-with-web-identity'), 'helper must exchange GitHub OIDC directly');
assert.ok(helper.includes("jq -ce '{Version:1,AccessKeyId,SecretAccessKey,SessionToken,Expiration}'"), 'helper output must use the AWS credential_process contract');
assert.ok(workflow.includes('aws sts get-caller-identity --output json >/dev/null'), 'fail-closed receipt must work with credential_process');
assert.ok(workflow.includes('node scripts/governance/validate-object-lock-credential-hygiene-v1.mjs'), 'workflow must execute this regression before acquisition');

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  validator: 'validate-object-lock-credential-hygiene-v1',
  credential_boundary: 'PROCESS_SCOPED',
  persisted_values: ['AWS_CONFIG_FILE', 'AWS_PROFILE', 'AWS_REGION'],
  raw_credential_persistence: 'DENIED',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
