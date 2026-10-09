#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const contractPath = 'coordination/kidults/governance/cloudflare-workers-shadow-receipt-lifetime-contract-v1.json';
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

assert.equal(contract.id, 'kidults-cloudflare-workers-shadow-receipt-lifetime-contract-v1');
assert.equal(contract.status, 'MANDATORY_FOR_ANY_FUTURE_WORKERS_SHADOW_ONE_SHOT');
assert.equal(contract.canonical_receipt_location, 'RUNNER_TEMP_OUTSIDE_GITHUB_WORKSPACE');
assert.equal(contract.incident.workflow_run_id, 33410598558);
assert.equal(contract.incident.provider_mutation_attempted, false);
assert.equal(contract.future_execution.current_approval_reusable, false);
assert.equal(contract.future_execution.new_explicit_approval_required, true);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-shadow-receipt-'));
const workspace = path.join(root, 'workspace');
const runnerTemp = path.join(root, 'runner-temp');
const workspaceReceipt = path.join(workspace, 'artifacts', 'cloudflare-workers-shadow', 'receipt.json');
const canonicalReceipt = path.join(runnerTemp, 'cloudflare-workers-shadow', 'receipt.json');

fs.mkdirSync(path.dirname(workspaceReceipt), {recursive: true});
fs.mkdirSync(path.dirname(canonicalReceipt), {recursive: true});
fs.writeFileSync(workspaceReceipt, '{"state":"WORKSPACE_SCOPED"}\n');
fs.writeFileSync(canonicalReceipt, '{"state":"RUNNER_TEMP_SCOPED"}\n');

// Model actions/checkout clean: repository workspace is deleted and recreated,
// while runner.temp is outside the checkout-clean boundary.
fs.rmSync(workspace, {recursive: true, force: true});
fs.mkdirSync(workspace, {recursive: true});

assert.equal(fs.existsSync(workspaceReceipt), false, 'workspace receipt must be destroyed by checkout-clean simulation');
assert.equal(fs.existsSync(canonicalReceipt), true, 'runner.temp receipt must survive checkout-clean simulation');
assert.match(fs.readFileSync(canonicalReceipt, 'utf8'), /RUNNER_TEMP_SCOPED/);

// Model the mandatory always-finalizer. If the canonical receipt is somehow
// missing, it must create a truthful fallback without falsely asserting that
// provider mutation did not occur.
fs.rmSync(canonicalReceipt, {force: true});
fs.mkdirSync(path.dirname(canonicalReceipt), {recursive: true});
if (!fs.existsSync(canonicalReceipt)) {
  fs.writeFileSync(canonicalReceipt, `${JSON.stringify({
    state: 'VERIFIED_FAIL_RECEIPT_RECOVERED_BY_ALWAYS_FINALIZER',
    provider_mutation_attempted: 'UNKNOWN_REQUIRES_LOG_READBACK',
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  })}\n`);
}
const fallback = JSON.parse(fs.readFileSync(canonicalReceipt, 'utf8'));
assert.equal(fallback.provider_mutation_attempted, 'UNKNOWN_REQUIRES_LOG_READBACK');
assert.equal(fallback.public, 'HOLD');
assert.equal(fallback.production, 'HOLD');
assert.equal(fallback.g5, 'HOLD');

fs.rmSync(root, {recursive: true, force: true});

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-receipt-lifetime-regression-v1',
  state: 'VERIFIED_PASS',
  checkout_clean_workspace_receipt_removed: true,
  runner_temp_receipt_survived: true,
  truthful_fallback_receipt_created: true,
  future_approval_required: true,
}, null, 2));
