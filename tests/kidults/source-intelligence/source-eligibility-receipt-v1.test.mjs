import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const builder = path.join(root, 'scripts/kidults/source-intelligence/build-asi-source-eligibility-receipts-v1.mjs');
const validator = path.join(root, 'scripts/kidults/source-intelligence/validate-asi-source-eligibility-receipts-v1.mjs');
const canonicalContract = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/source-intelligence/asi-source-eligibility-receipt-contract-v1.json'), 'utf8'));
const workflow = fs.readFileSync(path.join(root, canonicalContract.producer_identity.workflow_path), 'utf8');
const sourceSha = '1'.repeat(40);
const hash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function refreshSetDigest(receipt) {
  receipt.receipt_set_digest = hash({
    id: receipt.id,
    version: receipt.version,
    evaluated_at: receipt.evaluated_at,
    purpose_id: receipt.purpose_id,
    producer: receipt.producer,
    inputs: receipt.inputs,
    input_set_digest: receipt.input_set_digest,
    summary: receipt.summary,
    records: receipt.records,
    truth_boundary: receipt.truth_boundary
  });
}

const producerEnv = (eventName = 'schedule') => ({
  KIDULTS_REPOSITORY: canonicalContract.producer_identity.repository,
  KIDULTS_PRODUCER_WORKFLOW_PATH: canonicalContract.producer_identity.workflow_path,
  KIDULTS_SOURCE_SHA: sourceSha,
  KIDULTS_WORKFLOW_RUN_ID: '123456789',
  KIDULTS_WORKFLOW_RUN_ATTEMPT: '1',
  KIDULTS_PRODUCER_EVENT_NAME: eventName,
  KIDULTS_PRODUCER_ARTIFACT_NAME: canonicalContract.producer_identity.artifact_name
});
const expectedEnv = (eventName = 'schedule') => ({
  KIDULTS_EXPECTED_REPOSITORY: canonicalContract.producer_identity.repository,
  KIDULTS_EXPECTED_PRODUCER_WORKFLOW_PATH: canonicalContract.producer_identity.workflow_path,
  KIDULTS_EXPECTED_SOURCE_SHA: sourceSha,
  KIDULTS_EXPECTED_WORKFLOW_RUN_ID: '123456789',
  KIDULTS_EXPECTED_WORKFLOW_RUN_ATTEMPT: '1',
  KIDULTS_EXPECTED_PRODUCER_EVENT_NAME: eventName,
  KIDULTS_EXPECTED_PRODUCER_ARTIFACT_NAME: canonicalContract.producer_identity.artifact_name
});

function fixture({ eventName = 'schedule', evaluatedAt, expiresAt = '2099-01-01T00:00:00Z' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-eligibility-receipt-test-'));
  const paths = Object.fromEntries(['value', 'rights', 'snapshots', 'schemas', 'contract', 'receipt'].map(name => [name, path.join(directory, `${name}.json`)]));
  const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  write(paths.value, { records: [{ source_id: 'fixture-source', value_admission_status: 'VALUE_ELIGIBLE_CONTINUE_RIGHTS_REVIEW', hard_minimum_complete: true, value_score: 90 }] });
  write(paths.rights, { records: [{ source_id: 'fixture-source', decision: 'PASS', rights: { collect: 'ALLOW', store: 'ALLOW', derive: 'ALLOW', commercial_use: 'ALLOW' }, evidence_binding: { recheck_due_at: expiresAt } }] });
  write(paths.snapshots, { records: [{ source_id: 'fixture-source', capture_state: 'SOURCE_CONTENT_SNAPSHOT_BOUND', decision_promotion_eligible: true, source_content_sha256: `sha256:${'2'.repeat(64)}`, governed_object_ref: 'governed://fixture-source' }] });
  write(paths.schemas, { records: [{ source_id: 'fixture-source', state: 'SOURCE_SPECIFIC_SCHEMA_BOUND', terminal_sold_compatible: true, schema_sha256: `sha256:${'3'.repeat(64)}`, sample_digest: `sha256:${'4'.repeat(64)}`, expires_at: expiresAt }] });
  const contract = structuredClone(canonicalContract);
  contract.canonical_input_paths = {
    product_value: paths.value,
    rights: paths.rights,
    snapshots: paths.snapshots,
    schemas: paths.schemas,
    contract: paths.contract
  };
  write(paths.contract, contract);
  const args = [builder, paths.value, paths.rights, paths.snapshots, paths.schemas, paths.contract, paths.receipt];
  if (evaluatedAt) args.push(evaluatedAt);
  const built = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...producerEnv(eventName), ...(evaluatedAt ? { KIDULTS_ALLOW_TEST_CLOCK: '1' } : {}) }
  });
  assert.equal(built.status, 0, built.stderr || built.stdout);
  return { directory, paths, eventName };
}

function validate(item, env = {}) {
  return spawnSync(process.execPath, [validator, item.paths.receipt, item.paths.contract], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...expectedEnv(item.eventName), ...env }
  });
}

test('current schedule receipt without P3 is exact-producer-bound and canary-evaluation eligible only', t => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const result = validate(item);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  assert.equal(receipt.records[0].state, 'CANARY_EVALUATION_ELIGIBLE');
  assert.equal(receipt.records[0].canary_evaluation_eligible, true);
  assert.equal(receipt.records[0].p3_exact_canary_receipt_bound, false);
  assert.equal(receipt.records[0].product_content_admission_authorized, false);
  assert.equal(receipt.records[0].adapter_activation_authorized, false);
  assert.equal(receipt.producer.source_sha, sourceSha);
  assert.equal(receipt.producer.artifact_name, canonicalContract.producer_identity.artifact_name);
});

test('producer workflow binds exact head, run attempt and canonical artifact identity', () => {
  assert.match(workflow, /KIDULTS_EXACT_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /group: kidults-asi-global-any-site-hourly-v2-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ env\.KIDULTS_EXACT_SOURCE_SHA \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$KIDULTS_EXACT_SOURCE_SHA"/);
  assert.match(workflow, /KIDULTS_WORKFLOW_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /KIDULTS_EXPECTED_SOURCE_SHA: \$\{\{ env\.KIDULTS_EXACT_SOURCE_SHA \}\}/);
  assert.match(workflow, /name: kidults-asi-global-any-site-source-pool-v2/);
});

test('expired receipt cannot be replayed as canary-evaluation eligibility or activation authority', t => {
  const item = fixture({ evaluatedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-01-02T00:00:00Z' });
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  assert.equal(receipt.records[0].state, 'CANARY_EVALUATION_ELIGIBLE', 'fixture proves the receipt was canary-evaluation eligible when issued');
  assert.equal(receipt.records[0].adapter_activation_authorized, false);
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CANARY_EVALUATION_RECEIPT_EXPIRED_AT_VALIDATION/);
});

test('expired upstream evidence cannot be hidden by extending and rehashing receipt expiry', t => {
  const item = fixture({ evaluatedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-01-02T00:00:00Z' });
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  receipt.records[0].binding.expires_at = '2099-01-01T00:00:00Z';
  receipt.records[0].receipt_digest = hash(receipt.records[0].binding);
  refreshSetDigest(receipt);
  fs.writeFileSync(item.paths.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPIRY_BINDING_DRIFT/);
});

test('receipt source set cannot omit a governed rights source even after summary rehash', t => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  receipt.records = [];
  receipt.summary = {
    sources: 0,
    evidence_eligible: 0,
    eligible: 0,
    canary_evaluation_eligible: 0,
    p3_exact_canary_bound: 0,
    hold: 0,
    product_content_admitted: 0,
    adapter_activation_authorized: 0
  };
  refreshSetDigest(receipt);
  fs.writeFileSync(item.paths.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RECEIPT_SOURCE_SET_DRIFT/);
});

test('pull request and manual recovery receipts remain canary-evaluation-only without P3', t => {
  for (const eventName of ['pull_request', 'workflow_dispatch']) {
    const item = fixture({ eventName });
    t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
    const result = validate(item);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
    assert.equal(receipt.records[0].state, 'CANARY_EVALUATION_ELIGIBLE');
    assert.equal(receipt.records[0].canary_evaluation_eligible, true);
    assert.equal(receipt.records[0].p3_exact_canary_receipt_bound, false);
    assert.equal(receipt.records[0].adapter_activation_authorized, false);
    assert.equal(receipt.records[0].product_content_admission_authorized, false);
  }
});

test('canonical input path substitution is rejected before receipt use', t => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  receipt.inputs.product_value = path.join(item.directory, 'attacker-controlled.json');
  fs.writeFileSync(receipt.inputs.product_value, '{"records":[]}\n');
  fs.writeFileSync(item.paths.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INPUT_PATH_NOT_CANONICAL:product_value/);
});

test('source SHA, run and artifact expectations are externally exact-bound', t => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const wrongSha = validate(item, { KIDULTS_EXPECTED_SOURCE_SHA: 'f'.repeat(40) });
  assert.notEqual(wrongSha.status, 0);
  assert.match(wrongSha.stderr, /PRODUCER_IDENTITY_MISMATCH/);
  const wrongRun = validate(item, { KIDULTS_EXPECTED_WORKFLOW_RUN_ID: '987654321' });
  assert.notEqual(wrongRun.status, 0);
  assert.match(wrongRun.stderr, /PRODUCER_IDENTITY_MISMATCH/);
  const wrongArtifact = validate(item, { KIDULTS_EXPECTED_PRODUCER_ARTIFACT_NAME: 'untrusted-artifact' });
  assert.notEqual(wrongArtifact.status, 0);
  assert.match(wrongArtifact.stderr, /EXPECTED_ARTIFACT_NOT_CANONICAL/);
});

test('future-dated receipt is rejected against validator system time', t => {
  const item = fixture({ evaluatedAt: '2098-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' });
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RECEIPT_EVALUATED_AT_IN_FUTURE/);
});

test('archive-unverified adapter authority hard-disable cannot be removed and rehashed', t => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(item.paths.receipt, 'utf8'));
  receipt.truth_boundary.adapter_activation_hard_disabled_pending_archive_verified_artifact_consumer = false;
  refreshSetDigest(receipt);
  fs.writeFileSync(item.paths.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  const result = validate(item);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /METADATA_CONTENT_BOUNDARY_WEAKENED/);
});
