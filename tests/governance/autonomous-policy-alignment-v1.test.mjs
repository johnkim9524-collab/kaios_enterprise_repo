import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {assertAutonomousFileScope,sha256,validateLiveChangedPaths} from '../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {evaluateSemanticCapabilityDelta} from '../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';

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

test('capability expansion fails before dispatch while replacements reach semantic verification',()=>{
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
  ]) assert.deepEqual(
    assertAutonomousFileScope({files:[{filename,patch:`@@ -1,2 +1 @@\n${removed}\n name: recovery`}],policy:landing}),
    [filename],
  );
});

test('exact exceptions are classified and cannot weaken routing coverage',()=>{
  const filename='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch:'@@ -1,2 +1 @@\n-  "authorization_routing": {"route":"CANONICAL_ENVELOPE"}\n+  "state":"updated"'}],policy:landing}),[filename]);
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch:'@@ -1 +1,2 @@\n {\n+  "verification_evidence": "monotonic-hardening"'}],policy:landing}),[filename]);
});

test('comment-only deletion and monotonic hardening remain autonomous',()=>{
  const filename='scripts/kidults/kpmo/internal-recovery.mjs';
  const patch='@@ -1,2 +1,2 @@\n-// stale comment\n+// corrected comment\n+export const failClosed = true;';
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch}],policy:landing}),[filename]);
});

const workflow=(extra='')=>`name: internal\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  validate:\n    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Validate\n        run: node scripts/validate.mjs\n${extra}`;
const semanticFile=(head,overrides={})=>({filename:'.github/workflows/internal.yml',status:'modified',base_content:workflow(),head_content:head,...overrides});

test('immutable before and after blobs are mandatory',()=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[{filename:'.github/workflows/internal.yml'}],policy:landing}),/CAPABILITY_IMMUTABLE_BLOBS_REQUIRED/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[{filename:'.github/workflows/internal.yml'}],policy:landing}),/INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED/);
});

test('semantic classifier rejects every P1 negative capability mutation',()=>{
  const mutations=[
    workflow().replace('contents: read','contents: write'),
    workflow().replace("    if: github.ref == 'refs/heads/main'\n",''),
    workflow().replace('  pull_request:','  pull_request:\n  workflow_dispatch:'),
    workflow('      - name: Network\n        run: curl https://example.invalid\n'),
    workflow('      - name: Provider\n        uses: aws-actions/configure-aws-credentials@v5\n'),
    workflow('    environment: protected-staging\n'),
    workflow('    secrets:\n      TOKEN: ${{ secrets.ADMIN }}\n'),
  ];
  for(const [index,head] of mutations.entries()) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_/);
    assert.throws(()=>independentlyVerifyCapabilityDelta({files:[semanticFile(head)],policy:landing}),/INDEPENDENT_/,`mutation ${index}`);
  }
});

test('ordered workflow steps cannot hide risky capabilities behind later safe steps',()=>{
  const safeStep='      - name: Safe after risk\n        run: node scripts/validate.mjs\n';
  const riskyStep='      - name: Network\n        run: curl https://example.invalid\n';
  const cases=[
    workflow(`${riskyStep}${safeStep}`),
    workflow(`${safeStep}${riskyStep}${safeStep}`),
  ];
  for(const [index,head] of cases.entries()) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_EXPANSION/,`primary ordered mutation ${index}`);
    assert.throws(()=>independentlyVerifyCapabilityDelta({files:[semanticFile(head)],policy:landing}),/INDEPENDENT_SECURITY_CAPABILITY_ADDED/,`independent ordered mutation ${index}`);
  }
});

test('unknown YAML indirection and unavailable blobs fail closed',()=>{
  for(const head of [workflow('\npermissions: &privileged\n  contents: write\n'),workflow('\npermissions:\n  <<: *privileged\n')]) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_YAML_UNSUPPORTED_SYNTAX/);
  }
});

test('workflow block scalars are parsed without weakening capability checks',()=>{
  const base=workflow('      - name: Script\n        run: |\n          set -euo pipefail\n          node scripts/validate.mjs\n');
  const safe=base.replace('    runs-on: ubuntu-24.04','    runs-on: ubuntu-24.04\n    timeout-minutes: 10');
  assert.equal(evaluateSemanticCapabilityDelta({files:[semanticFile(safe,{base_content:base})],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');

  const network=base.replace('          node scripts/validate.mjs','          node scripts/validate.mjs\n          curl https://example.invalid');
  assert.throws(
    ()=>evaluateSemanticCapabilityDelta({files:[semanticFile(network,{base_content:base})],policy:landing}),
    /CAPABILITY_(?:GUARD_WEAKENED|EXPANSION)/,
  );

  const shellOperators=workflow('      - name: Shell operators\n        run: |-\n          ! test -z "$VALUE"\n          printf "* literal"\n');
  assert.equal(evaluateSemanticCapabilityDelta({files:[semanticFile(shellOperators,{base_content:shellOperators})],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});

test('exact exception policy weakening fails while monotonic evidence addition passes',()=>{
  const filename='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const base=JSON.stringify({authorization_routing:{route:'CANONICAL_ENVELOPE'},evidence:['a']});
  const weakened=JSON.stringify({authorization_routing:{route:'NON_EXECUTING_REFERENCE'},evidence:['a']});
  const strengthened=JSON.stringify({authorization_routing:{route:'CANONICAL_ENVELOPE'},evidence:['a'],verification_evidence:'monotonic-hardening'});
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[{filename,base_content:base,head_content:weakened}],policy:landing}),/CAPABILITY_EXISTING_VALUE_CHANGED/);
  assert.equal(evaluateSemanticCapabilityDelta({files:[{filename,base_content:base,head_content:strengthened}],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});

test('safe monotonic workflow hardening passes both independent models',()=>{
  const file=semanticFile(workflow('    timeout-minutes: 10\n'));
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});

test('safe internal implementation replacement is autonomous in both independent models',()=>{
  const file={
    filename:'scripts/kidults/kpmo/internal-normalizer.mjs',
    base_content:'export const normalize = value => String(value).trim();\n',
    head_content:'export const normalize = value => String(value ?? "").trim();\n',
  };
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});

test('fail-closed guard replacement remains Owner-reserved',()=>{
  const file={
    filename:'scripts/kidults/kpmo/internal-normalizer.mjs',
    base_content:'if (!authorized) throw new Error("AUTHORIZATION_REQUIRED");\n',
    head_content:'export const normalize = value => String(value).trim();\n',
  };
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file],policy:landing}),/CAPABILITY_(?:GUARD_REMOVED|GUARD_DEPENDENCY_CHANGED)/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file],policy:landing}),/INDEPENDENT_(?:SECURITY_CAPABILITY_CHANGED|GUARD_DEPENDENCY_CHANGED)/);
});


test('live scope validation enforces the independent verifier, not only the primary model',()=>{
  const filename='scripts/kidults/kpmo/internal-normalizer.mjs';
  const file={
    filename,
    patch:'@@ -1 +1 @@\n-if (value) return "a";\n+if (value) return "b";',
    base_content:'if (value) return "a";\n',
    head_content:'if (value) return "b";\n',
  };
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.throws(()=>validateLiveChangedPaths({
    files:[file],
    expectedPaths:[filename],
    expectedScopeDigest:sha256(filename),
    policy:landing,
  }),/INDEPENDENT_SECURITY_CAPABILITY_CHANGED/);
});

const scriptFile=(base,head)=>({
  filename:'scripts/kidults/kpmo/internal-authorization.mjs',
  base_content:base,
  head_content:head,
});
const rejectGuardDependencyMutation=file=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file],policy:landing}),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file],policy:landing}),/INDEPENDENT_GUARD_DEPENDENCY_CHANGED/);
};

test('guard predicate constants cannot bypass either semantic verifier',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = true;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('guard helper return changes and aliases remain dependency-bound',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "function evaluatePolicy(value) { return value.authorized; }\nconst decision = evaluatePolicy(input);\nconst isAuthorized = decision;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "function evaluatePolicy(value) { return true; }\nconst decision = evaluatePolicy(input);\nconst isAuthorized = decision;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('multi-line guard dependencies cannot be weakened through indirection',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const policyDecision = evaluatePolicy(input);\nconst isAuthorized = policyDecision.allowed;\nif (\n  !isAuthorized\n) {\n  throw new Error('AUTHORIZATION_REQUIRED');\n}\n",
    "const policyDecision = {allowed: true};\nconst isAuthorized = policyDecision.allowed;\nif (\n  !isAuthorized\n) {\n  throw new Error('AUTHORIZATION_REQUIRED');\n}\n",
  ));
});

test('mixed safe and risky replacements still reject the risky guard mutation',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nconst label = 'old';\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = true;\nconst label = 'new';\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('unrelated safe implementation replacement does not alter guard dependency graph',()=>{
  const file=scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nconst normalize = value => String(value).trim();\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = evaluatePolicy(input);\nconst normalize = value => String(value ?? '').trim();\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  );
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});
