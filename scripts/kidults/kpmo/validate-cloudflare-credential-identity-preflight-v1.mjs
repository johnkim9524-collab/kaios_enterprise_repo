#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const P = {
  auth: 'coordination/kidults/governance/cloudflare-credential-identity-preflight-authorization-20260901-v1.json',
  contract: 'coordination/kidults/governance/cloudflare-workers-shadow-credential-identity-preflight-v1.json',
  receipt: 'coordination/kidults/governance/receipts/CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01.md',
  workflow: '.github/workflows/kidults-cloudflare-credential-identity-preflight-v1.yml',
  extractor: 'scripts/kidults/kpmo/extract-github-comment-body-v1.mjs',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
};
const fail = (code) => { throw new Error(`CLOUDFLARE_CREDENTIAL_IDENTITY_PREFLIGHT_VALIDATION_FAIL:${code}`); };
const ok = (condition, code) => { if (!condition) fail(code); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

for (const file of Object.values(P)) ok(fs.existsSync(file), `MISSING_FILE:${file}`);
const auth = json(P.auth);
const contract = json(P.contract);
const receipt = read(P.receipt);
const workflow = read(P.workflow);
const extractorSource = read(P.extractor);
const registry = json(P.registry);

ok(auth.id === 'CF-CREDENTIAL-IDENTITY-PREFLIGHT-20260901-01', 'AUTH_ID');
ok(auth.version === '1.1.0', 'AUTH_VERSION');
ok(auth.status === 'TERMINATED_PREAUTHORIZATION_SERIALIZATION_FAIL_NO_REUSE', 'AUTH_STATUS');
ok(auth.root_approval_receipt?.comment_id === 5489201610, 'AUTH_COMMENT');
ok(sha256(receipt) === auth.root_approval_receipt?.body_sha256, 'APPROVAL_BODY_DIGEST');
ok(auth.runtime_state?.dispatch_run_id === 33478469222, 'AUTH_RUN');
ok(auth.runtime_state?.dispatch_slot_used === true, 'AUTH_SLOT');
ok(auth.runtime_state?.authorization_consumed === false, 'AUTH_CONSUMED_TRUTH');
ok(auth.runtime_state?.external_request_count === 0, 'AUTH_EXTERNAL_REQUESTS');
ok(auth.runtime_state?.provider_process_invoked === false, 'AUTH_PROVIDER_PROCESS');
ok(auth.runtime_state?.operational_reuse_allowed === false, 'AUTH_REUSE');
ok(auth.runtime_state?.terminal_artifact_id === 9789017392, 'AUTH_ARTIFACT');
ok(auth.runtime_state?.terminal_artifact_digest === 'sha256:98a76cea4abbaead3b2e3a6b2f85b8808b2438a7f945765dd5ffcbbb5d25567b', 'AUTH_ARTIFACT_DIGEST');

ok(contract.id === 'kidults-cloudflare-workers-shadow-credential-identity-preflight-v1', 'CONTRACT_ID');
ok(contract.version === '1.2.0', 'CONTRACT_VERSION');
ok(contract.status === 'TERMINATED_PREAUTHORIZATION_SERIALIZATION_FAIL_TOMBSTONED', 'CONTRACT_STATUS');
ok(contract.terminal_state?.root_cause === 'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF', 'ROOT_CAUSE');
ok(contract.terminal_state?.authorization_consumed === false, 'CONTRACT_CONSUMED');
ok(contract.terminal_state?.dispatch_slot_used === true, 'CONTRACT_SLOT');
ok(contract.terminal_state?.external_read_request_count === 0, 'CONTRACT_REQUESTS');
ok(contract.terminal_state?.operational_reuse_allowed === false, 'CONTRACT_REUSE');
for (const key of ['worker_mutation_count','pages_mutation_count','route_mutation_count','domain_mutation_count']) {
  ok(contract.terminal_state?.[key] === 0, `CONTRACT_ZERO:${key}`);
}
ok(contract.tombstone?.workflow_trigger_removed === true, 'TOMBSTONE_TRIGGER');
ok(contract.tombstone?.environment_bound === false, 'TOMBSTONE_ENVIRONMENT');
ok(contract.tombstone?.secret_references_present === false, 'TOMBSTONE_SECRETS');
ok(contract.tombstone?.provider_network_path_present === false, 'TOMBSTONE_NETWORK');
ok(contract.future_execution_gate?.new_versioned_workflow_required === true, 'FUTURE_VERSION');
ok(contract.future_execution_gate?.new_explicit_program_owner_approval_required === true, 'FUTURE_APPROVAL');

ok(/^on:\s*\[\]\s*$/m.test(workflow), 'WORKFLOW_NO_TRIGGER');
ok(!/^\\s*workflow_dispatch\\s*:/m.test(workflow), 'WORKFLOW_DISPATCH_REINTRODUCED');
for (const marker of [
  'DISPATCH_SLOT_USED_PREAUTHORIZATION_SERIALIZATION_FAIL',
  'APPROVAL_BODY_JQ_RAW_OUTPUT_ADDS_SECOND_TERMINAL_LF',
  'historical_run_id:33478469222',
  'historical_job_id:99762628587',
  'historical_terminal_artifact_id:9789017392',
  'authorization_consumed:false',
  'external_read_request_count:0',
  'PREFLIGHT_V1_DISPATCH_SLOT_USED_ZERO_EXECUTABLE_AUTHORITY_NO_REPLAY',
]) ok(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
for (const forbidden of [
  'environment:', '${{ secrets.', 'actions/checkout@', 'curl ', 'api.cloudflare.com',
  'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', "jq -r '.body'", 'jq -r ".body"',
]) ok(!workflow.includes(forbidden), `WORKFLOW_EXECUTABLE_AUTHORITY:${forbidden}`);

ok(extractorSource.includes('process.stdout.write(value.body)'), 'EXTRACTOR_BYTE_EXACT_WRITE');
ok(!extractorSource.includes('console.log(value.body)'), 'EXTRACTOR_RECORD_SEPARATOR');
ok(!extractorSource.includes("value.body + '\\n'"), 'EXTRACTOR_APPENDED_LF');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'github-comment-body-extract-'));
try {
  for (const body of ['', 'no-terminal-lf', 'one-terminal-lf\n', 'two-terminal-lfs\n\n']) {
    const input = path.join(directory, `case-${crypto.randomUUID()}.json`);
    fs.writeFileSync(input, JSON.stringify({ body }));
    const run = spawnSync(process.execPath, [P.extractor, input], { encoding: null });
    ok(run.status === 0, 'EXTRACTOR_CASE_STATUS');
    ok(Buffer.compare(run.stdout, Buffer.from(body)) === 0, `EXTRACTOR_BYTE_DRIFT:${JSON.stringify(body)}`);
  }
  const invalid = path.join(directory, 'invalid.json');
  fs.writeFileSync(invalid, JSON.stringify({ body: null }));
  ok(spawnSync(process.execPath, [P.extractor, invalid]).status !== 0, 'EXTRACTOR_BODY_TYPE_FAIL_OPEN');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

ok(registry.registered_count === registry.registered_workflows?.length, 'REGISTRY_COUNT');
ok(registry.registered_count === registry.required_environment_bindings?.length, 'REGISTRY_BINDINGS');
ok(!registry.registered_workflows.includes(P.workflow), 'REGISTRY_V1_PRESENT');
ok(!registry.required_environment_bindings.some((entry) => entry.workflow === P.workflow), 'REGISTRY_V1_BINDING');
for (const key of [
  'environment_bound_secret_bearing_jobs',
  'exact_main_guarded_secret_bearing_jobs',
  'live_main_sha_guarded_secret_bearing_jobs',
  'step_scoped_secret_bearing_jobs',
]) ok(registry.repository_binding_state?.[key] === registry.registered_count, `REGISTRY_STATE:${key}`);
const privilegedSteps = registry.required_environment_bindings.reduce(
  (sum, entry) => sum + (entry.required_secret_step_names?.length || 0), 0);
ok(registry.repository_binding_state?.privileged_secret_steps === privilegedSteps, 'REGISTRY_PRIVILEGED');
const consumed = registry.repository_containment?.consumed_cloudflare_credential_identity_preflight_v1;
ok(consumed?.workflow === P.workflow, 'REGISTRY_CONSUMED_WORKFLOW');
ok(consumed?.dispatch_run_id === 33478469222, 'REGISTRY_CONSUMED_RUN');
ok(consumed?.authorization_consumed === false, 'REGISTRY_CONSUMED_TRUTH');
ok(consumed?.external_read_request_count === 0, 'REGISTRY_REQUEST_TRUTH');
ok(consumed?.secret_registry_membership === false, 'REGISTRY_SECRET_REMOVAL');
ok(consumed?.future_execution === 'NEW_VERSION_AND_NEW_EXPLICIT_APPROVAL_REQUIRED', 'REGISTRY_FUTURE_AUTHORITY');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-credential-identity-preflight-v1-terminal-validation-v2',
  state: 'VERIFIED_PASS_TOMBSTONED',
  historical_run_id: 33478469222,
  authorization_consumed: false,
  dispatch_slot_used: true,
  external_read_request_count: 0,
  registered_secret_bearing_lanes: registry.registered_count,
  privileged_secret_steps: privilegedSteps,
  future_execution: 'NEW_VERSION_AND_NEW_EXPLICIT_APPROVAL_REQUIRED',
  public: 'HOLD', production: 'HOLD', g5: 'HOLD',
}, null, 2));
