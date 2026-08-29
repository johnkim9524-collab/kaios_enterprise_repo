#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = process.env.POSTGRES_CONTAINMENT_WORKFLOW || '.github/workflows/p0-remote-postgres-persistence-pitr.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

const forbidden = [
  "vars.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED",
  'ACTIVATION_AUTHORIZED:',
  'environment: kidults-do-staging-ssh',
  'secrets.KIDULTS_STAGING_SSH_PRIVATE_KEY_B64',
  'secrets.KIDULTS_STAGING_POSTGRES_DSN',
  'remote-persistence-pitr-fixture:',
  'run-postgres-verifier-through-ssh-tunnel.sh',
  'ssh-keyscan',
  'POSTGRES_DSN:'
];
for (const token of forbidden) assert.equal(source.includes(token), false, `unsafe activation token remains: ${token}`);

for (const required of [
  'fail-closed-activation-containment:',
  'BLOCKED_ONE_SHOT_AUTHORIZATION_REQUIRED',
  'standing_boolean_consulted',
  'provider_secrets_resolved',
  'remote_mutation_performed',
  'KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED=false',
  'if-no-files-found: error',
  'VERIFY_OUTCOME:',
  'containment_contract_verified'
]) assert.equal(source.includes(required), true, `containment contract missing: ${required}`);

const jobCount = (source.match(/^  [a-z0-9-]+:\n    name:/gm) || []).length;
assert.equal(jobCount, 1, `expected exactly one non-secret containment job, found ${jobCount}`);
assert.match(source, /"provider_secrets_resolved": False/);
assert.match(source, /"remote_mutation_performed": False/);
assert.match(source, /"pitr_proven": False/);
assert.ok((source.match(/if: always\(\)/g) || []).length >= 2, 'receipt and artifact upload must both run under always()');

console.log(JSON.stringify({
  test: 'P0_POSTGRES_STANDING_AUTH_CONTAINMENT_V1',
  state: 'VERIFIED_PASS',
  standing_boolean_ignored: true,
  provider_environment_absent: true,
  provider_secrets_absent: true,
  remote_execution_absent: true,
  non_empty_failure_receipt_required: true,
  receipt_emitted_on_verification_failure: true
}, null, 2));
