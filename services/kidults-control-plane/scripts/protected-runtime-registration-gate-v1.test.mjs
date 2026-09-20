import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/common-control/canonical-v1.mjs';
import {
  assessProtectedRuntimeRegistration, verifyProtectedRuntimeRegistrationReceipt,
} from './protected-runtime-registration-gate-v1.mjs';

const sourceSha = 'a'.repeat(40);
const assessedAt = '2026-09-19T10:00:00.000Z';

function registrationPackage() {
  const unsigned = {
    contractId: 'kidults-autonomous-trigger-registration-package-v1', version: '1.0.0',
    state: 'READY_FOR_EXTERNAL_REGISTRATION_REVIEW_HOLD', sourceSha,
    evidenceBundleDigest: digestObject({ evidence: 1 }),
    soakVerdictDigest: digestObject({ soak: 1 }),
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
    registrationPackageDigest: registration.packageDigest,
    workflowPath: registration.workflowPath, triggerClass: 'SCHEDULE',
    schedule: registration.schedule, registeredAt: '2026-09-19T09:30:00.000Z',
    registrar: 'github-protected-main', externalRegistrationVerified: true,
    automaticTrigger: 'REGISTERED_PROTECTED_HOLD', activationAuthorized: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, receiptDigest: digestObject(unsigned) };
}

function githubReadback(event = 'schedule') {
  return {
    id: 123456789, run_attempt: 1, event, status: 'in_progress', conclusion: null,
    head_sha: sourceSha, head_branch: 'main',
    path: '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml',
    html_url: 'https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/123456789',
    repository: { full_name: 'johnkim9524-collab/kaios_enterprise_repo' },
    ignored_api_field: true,
  };
}

function request(overrides = {}) {
  return {
    registrationPackage: registrationPackage(), registrationReceipt: null,
    githubRunReadback: null, githubRunId: null, githubRunAttempt: null,
    githubEvent: null, sourceSha, assessedAt, ...overrides,
  };
}

test('missing external registration stays HOLD without resolving credentials or connecting', () => {
  const result = assessProtectedRuntimeRegistration(request());
  assert.equal(result.state, 'EXTERNAL_REGISTRATION_REQUIRED_HOLD');
  assert.equal(result.governedCanaryEligible, false);
  assert.equal(result.credentialResolutionPerformed, false);
  assert.equal(result.remoteConnectionPerformed, false);
  assert.equal(result.production, 'HOLD');
});

test('verified external registration permits only governed canary eligibility', () => {
  const registration = registrationPackage();
  const result = assessProtectedRuntimeRegistration(request({ registrationPackage: registration,
    registrationReceipt: externalReceipt(registration), githubRunReadback: githubReadback(),
    githubRunId: '123456789', githubRunAttempt: 1, githubEvent: 'schedule' }));
  assert.equal(result.state, 'GOVERNED_CANARY_ELIGIBLE_ACTIVATION_HOLD');
  assert.equal(result.governedCanaryEligible, true);
  assert.equal(result.activationAuthorized, false);
  assert.equal(result.remoteWorkerActivation, 'HOLD');
  assert.equal(result.githubRunReadbackVerified, true);
  assert.equal(result.automaticTriggerObserved, true);
});

test('external receipt without GitHub API readback fails closed', () => {
  const registration = registrationPackage();
  assert.throws(() => assessProtectedRuntimeRegistration(request({
    registrationPackage: registration, registrationReceipt: externalReceipt(registration),
  })), /GITHUB_RUN_READBACK_REQUIRED_FOR_EXTERNAL_RECEIPT/);
});

test('manual recovery readback never proves the automatic schedule', () => {
  const registration = registrationPackage();
  const result = assessProtectedRuntimeRegistration(request({
    registrationPackage: registration, registrationReceipt: externalReceipt(registration),
    githubRunReadback: githubReadback('workflow_dispatch'), githubRunId: '123456789',
    githubRunAttempt: 1, githubEvent: 'workflow_dispatch',
  }));
  assert.equal(result.state, 'MANUAL_RECOVERY_OBSERVED_REGISTRATION_HOLD');
  assert.equal(result.governedCanaryEligible, false);
  assert.equal(result.automaticTriggerObserved, false);
});

test('GitHub readback substitution fails closed', () => {
  const bad = githubReadback();
  bad.head_sha = 'b'.repeat(40);
  assert.throws(() => assessProtectedRuntimeRegistration(request({
    githubRunReadback: bad, githubRunId: '123456789', githubRunAttempt: 1,
    githubEvent: 'schedule',
  })), /GITHUB_RUN_READBACK_SOURCE_MISMATCH/);
});

test('source and receipt substitution fail closed', () => {
  const registration = registrationPackage();
  assert.throws(() => assessProtectedRuntimeRegistration(request({ registrationPackage: registration,
    sourceSha: 'b'.repeat(40) })),
  /PROTECTED_RUNTIME_REGISTRATION_SOURCE_MISMATCH/);
  const receipt = externalReceipt(registration);
  receipt.registrationPackageDigest = digestObject({ substituted: true });
  assert.throws(() => assessProtectedRuntimeRegistration(request({ registrationPackage: registration,
    registrationReceipt: receipt, githubRunReadback: githubReadback(),
    githubRunId: '123456789', githubRunAttempt: 1, githubEvent: 'schedule' })));
});

test('bounded gate receipt rejects authority and digest tampering', () => {
  const result = assessProtectedRuntimeRegistration(request());
  assert.equal(verifyProtectedRuntimeRegistrationReceipt(result).receiptDigest,
    result.receiptDigest);
  assert.throws(() => verifyProtectedRuntimeRegistrationReceipt({
    ...result, activationAuthorized: true,
  }), /PROTECTED_RUNTIME_REGISTRATION_RECEIPT_AUTHORITY_INVALID/);
  assert.throws(() => verifyProtectedRuntimeRegistrationReceipt({
    ...result, assessedAt: '2026-09-19T10:01:00.000Z',
  }), /PROTECTED_RUNTIME_REGISTRATION_RECEIPT_INTEGRITY_INVALID/);
});
