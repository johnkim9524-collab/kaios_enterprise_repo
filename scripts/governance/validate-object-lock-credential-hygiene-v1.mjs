import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-autonomous-object-lock-canary-v1.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const acquisitionStart = workflow.indexOf('- name: Acquire FINALIZER credentials through exact GitHub OIDC subject');
const nextStep = workflow.indexOf('\n      - name:', acquisitionStart + 10);
assert.ok(acquisitionStart >= 0, 'FINALIZER credential acquisition step must exist');
assert.ok(nextStep > acquisitionStart, 'FINALIZER credential acquisition step must be bounded');
const step = workflow.slice(acquisitionStart, nextStep);

assert.ok(!/set\s+-[^\n]*x/.test(step), 'credential step must never enable shell tracing');
assert.ok(step.includes('echo "::add-mask::$OIDC_TOKEN"'), 'OIDC token must be masked immediately after acquisition');

for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
  const shellRef = '$' + name;
  const nonEmpty = step.indexOf('test -n "' + shellRef + '"');
  const mask = step.indexOf('echo "::add-mask::' + shellRef + '"');
  const exportToEnv = step.indexOf('echo "' + name + '=' + shellRef + '"');
  assert.ok(nonEmpty >= 0, name + ' must be validated');
  assert.ok(mask > nonEmpty, name + ' must be masked after validation');
  assert.ok(exportToEnv > mask, name + ' must be masked before GITHUB_ENV export');
}

const envWrite = step.indexOf('} >> "$GITHUB_ENV"');
const scrub = step.indexOf('unset CREDS OIDC_JSON OIDC_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN');
assert.ok(envWrite >= 0, 'credential environment write must exist');
assert.ok(scrub > envWrite, 'temporary credential variables must be scrubbed after export');
assert.ok(workflow.includes('node scripts/governance/validate-object-lock-credential-hygiene-v1.mjs'), 'workflow must execute credential hygiene regression before OIDC acquisition');

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  validator: 'validate-object-lock-credential-hygiene-v1',
  protected_values: ['OIDC_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'],
  export_order: 'MASK_BEFORE_GITHUB_ENV',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
