import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import { assessProtectedRuntimeRegistration } from './protected-runtime-registration-gate-v1.mjs';
import {
  appendRuntimeRegistrationLedgerAdmission, createRuntimeRegistrationLedgerAdmission,
  verifyRuntimeRegistrationLedgerAdmission,
} from './runtime-registration-ledger-admission-v1.mjs';

const sourceSha = 'a'.repeat(40);

function registrationPackage() {
  const unsigned = {
    contractId: 'kidults-autonomous-trigger-registration-package-v1', version: '1.0.0',
    state: 'READY_FOR_EXTERNAL_REGISTRATION_REVIEW_HOLD', sourceSha,
    evidenceBundleDigest: digestObject({ evidence: 1 }), soakVerdictDigest: digestObject({ soak: 1 }),
    workflowPath: '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml',
    triggerClass: 'SCHEDULE', schedule: '17 3 * * *', createdAt: '2026-09-19T09:00:00.000Z',
    registrationPerformed: false, automaticTrigger: 'NOT_REGISTERED_HOLD',
    activationAuthorized: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, packageDigest: digestObject(unsigned) };
}

function externalReceipt(registration) {
  const unsigned = {
    contractId: 'kidults-external-trigger-registration-receipt-v1', version: '1.0.0',
    state: 'EXTERNAL_REGISTRATION_VERIFIED', sourceSha,
    registrationPackageDigest: registration.packageDigest, workflowPath: registration.workflowPath,
    triggerClass: 'SCHEDULE', schedule: registration.schedule,
    registeredAt: '2026-09-19T09:30:00.000Z', registrar: 'github-protected-main',
    externalRegistrationVerified: true, automaticTrigger: 'REGISTERED_PROTECTED_HOLD',
    activationAuthorized: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function gate(event = 'schedule', withReceipt = true) {
  const registration = registrationPackage();
  return assessProtectedRuntimeRegistration({
    registrationPackage: registration,
    registrationReceipt: withReceipt ? externalReceipt(registration) : null,
    githubRunReadback: {
      id: 123456789, run_attempt: 1, event, status: 'in_progress', head_sha: sourceSha,
      head_branch: 'main', path: registration.workflowPath,
      html_url: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/123456789',
      repository: { full_name: 'johnkim9524-collab/kaios_enterprise_repo' },
    },
    githubRunId: '123456789', githubRunAttempt: 1, githubEvent: event,
    sourceSha, assessedAt: '2026-09-19T10:00:00.000Z',
  });
}

function storedRow(params) {
  return {
    workflow_receipt_id: params[0], repository: params[1], workflow_path: params[2],
    workflow_name: params[3], workflow_run_id: String(params[4]),
    workflow_run_attempt: String(params[5]), event_name: params[6], head_branch: params[7],
    head_sha: params[8], workflow_conclusion: params[9], canonical_job_conclusion: params[10],
    receipt_type: params[11], receipt_schema_version: params[12], source_receipt_digest: params[13],
    canonical_claim_id: params[14], canonical_relation: params[15], canonical_binding_digest: params[16],
    artifact_name: params[17], artifact_id: params[18], artifact_digest: params[19],
    artifact_expires_at: params[20], result_state: params[21], result_json: JSON.parse(params[22]),
    result_digest: params[23], binding_digest: params[24], observed_at: params[25], writer_id: params[26],
  };
}

class Client {
  calls = [];
  row = null;
  async query(sql, params = []) {
    const text = String(sql).trim();
    this.calls.push(text);
    if (text.includes('INSERT INTO kidults_control.workflow_run_receipts')) {
      this.row = storedRow(params);
      return { rows: [{ workflow_receipt_id: params[0] }] };
    }
    if (text.includes('FROM kidults_control.workflow_run_receipts')) return { rows: [this.row] };
    return { rows: [] };
  }
}

test('scheduled readback maps exactly to an immutable ledger admission', () => {
  const admission = createRuntimeRegistrationLedgerAdmission({ registrationGate: gate() });
  assert.equal(admission.state, 'LEDGER_APPEND_REQUIRED_CANARY_HOLD');
  assert.equal(admission.governedCanaryEligible, false);
  assert.equal(admission.governedCanaryEligibleAfterLedgerAppend, true);
  assert.equal(admission.ledgerReceiptInput.sourceReceiptDigest, admission.registrationGateDigest);
  assert.equal(admission.ledgerReceiptInput.eventName, 'schedule');
  assert.equal(verifyRuntimeRegistrationLedgerAdmission(admission).admissionDigest,
    admission.admissionDigest);
});

test('manual recovery remains ineligible after ledger append', () => {
  const admission = createRuntimeRegistrationLedgerAdmission({
    registrationGate: gate('workflow_dispatch'),
  });
  assert.equal(admission.governedCanaryEligibleAfterLedgerAppend, false);
  assert.equal(admission.ledgerReceiptInput.result.automatic_trigger_observed, false);
});

test('missing GitHub readback and admission tampering fail closed', () => {
  const withoutReadback = assessProtectedRuntimeRegistration({
    registrationPackage: registrationPackage(), registrationReceipt: null,
    githubRunReadback: null, githubRunId: null, githubRunAttempt: null, githubEvent: null,
    sourceSha, assessedAt: '2026-09-19T10:00:00.000Z',
  });
  assert.throws(() => createRuntimeRegistrationLedgerAdmission({ registrationGate: withoutReadback }),
    /RUNTIME_REGISTRATION_LEDGER_READBACK_REQUIRED/);
  const admission = createRuntimeRegistrationLedgerAdmission({ registrationGate: gate() });
  admission.ledgerReceiptInput.headSha = 'b'.repeat(40);
  assert.throws(() => verifyRuntimeRegistrationLedgerAdmission(admission),
    /RUNTIME_REGISTRATION_LEDGER_ADMISSION_GATE_MAPPING_INVALID/);
});

test('existing single writer appends before canary eligibility is released', async () => {
  const client = new Client();
  const admission = createRuntimeRegistrationLedgerAdmission({ registrationGate: gate() });
  const result = await appendRuntimeRegistrationLedgerAdmission({
    client, admission, id: () => '00000000-0000-4000-8000-000000000950',
  });
  assert.equal(result.state, 'RECORDED');
  assert.equal(result.governedCanaryEligible, true);
  assert.equal(result.activationAuthorized, false);
  assert.equal(client.calls.at(-1), 'COMMIT');
});
