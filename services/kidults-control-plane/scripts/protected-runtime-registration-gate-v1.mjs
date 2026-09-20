import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestObject, requireExactRecord, requireValue } from '../src/common-control/canonical-v1.mjs';
import {
  assessAutonomousRuntimeActivationGate,
  verifyExternalAutonomousTriggerRegistrationReceipt,
  verifyAutonomousTriggerRegistrationPackage,
} from '../src/autonomous-control/launcher-v1.mjs';

const INPUT_KEYS = Object.freeze([
  'registrationPackage', 'registrationReceipt', 'githubRunReadback', 'githubRunId',
  'githubRunAttempt', 'githubEvent', 'sourceSha', 'assessedAt',
]);
const RECEIPT_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'sourceSha', 'workflowPath', 'triggerClass',
  'schedule', 'registrationPackageDigest', 'registrationReceiptDigest',
  'githubRunReadbackDigest', 'githubRunId', 'githubRunAttempt', 'githubEvent',
  'githubRunReadbackVerified', 'automaticTriggerObserved', 'activationGateDigest',
  'assessedAt', 'governedCanaryEligible',
  'credentialResolutionPerformed', 'remoteConnectionPerformed', 'activationAuthorized',
  'remoteWorkerActivation', 'production', 'publicRelease', 'g5', 'receiptDigest',
]);

export function verifyProtectedRuntimeRegistrationReceipt(input) {
  const receipt = structuredClone(input);
  requireExactRecord(receipt, RECEIPT_KEYS, 'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_INVALID');
  requireValue(receipt.contractId === 'kidults-protected-runtime-registration-gate-v1'
    && receipt.version === '1.1.0'
    && /^[0-9a-f]{40}$/.test(receipt.sourceSha)
    && receipt.workflowPath === '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    && receipt.triggerClass === 'SCHEDULE'
    && receipt.schedule === '17 3 * * *', 'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_INVALID');
  const expectedState = receipt.governedCanaryEligible
    ? 'GOVERNED_CANARY_ELIGIBLE_ACTIVATION_HOLD'
    : receipt.githubEvent === 'workflow_dispatch'
      ? 'MANUAL_RECOVERY_OBSERVED_REGISTRATION_HOLD'
      : 'EXTERNAL_REGISTRATION_REQUIRED_HOLD';
  requireValue(receipt.state === expectedState,
  'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_STATE_INVALID');
  requireValue(/^sha256:[0-9a-f]{64}$/.test(receipt.registrationPackageDigest)
    && (receipt.registrationReceiptDigest === null
      || /^sha256:[0-9a-f]{64}$/.test(receipt.registrationReceiptDigest))
    && /^sha256:[0-9a-f]{64}$/.test(receipt.activationGateDigest),
  'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_BINDING_INVALID');
  requireValue((receipt.githubRunReadbackDigest === null
      && receipt.githubRunId === null && receipt.githubRunAttempt === null
      && receipt.githubEvent === null && receipt.githubRunReadbackVerified === false
      && receipt.automaticTriggerObserved === false)
    || (/^sha256:[0-9a-f]{64}$/.test(receipt.githubRunReadbackDigest)
      && /^[1-9][0-9]*$/.test(receipt.githubRunId)
      && Number.isSafeInteger(receipt.githubRunAttempt) && receipt.githubRunAttempt >= 1
      && ['schedule', 'workflow_dispatch'].includes(receipt.githubEvent)
      && receipt.githubRunReadbackVerified === true
      && receipt.automaticTriggerObserved === (receipt.githubEvent === 'schedule')),
  'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_READBACK_INVALID');
  requireValue(receipt.governedCanaryEligible === (receipt.registrationReceiptDigest !== null
    && receipt.githubRunReadbackVerified && receipt.automaticTriggerObserved),
  'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_ELIGIBILITY_INVALID');
  requireValue(receipt.credentialResolutionPerformed === false
    && receipt.remoteConnectionPerformed === false && receipt.activationAuthorized === false
    && receipt.remoteWorkerActivation === 'HOLD' && receipt.production === 'HOLD'
    && receipt.publicRelease === 'HOLD' && receipt.g5 === 'HOLD',
  'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_AUTHORITY_INVALID');
  const { receiptDigest, ...unsigned } = receipt;
  requireValue(receiptDigest === digestObject(unsigned),
    'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_INTEGRITY_INVALID');
  return Object.freeze(receipt);
}

function verifyGitHubRunReadback(readback, request, registration) {
  requireValue(readback && typeof readback === 'object' && !Array.isArray(readback),
    'GITHUB_RUN_READBACK_REQUIRED');
  const runId = String(readback.id ?? '');
  requireValue(runId === request.githubRunId && /^[1-9][0-9]*$/.test(runId),
    'GITHUB_RUN_READBACK_ID_MISMATCH');
  requireValue(readback.run_attempt === request.githubRunAttempt
    && Number.isSafeInteger(readback.run_attempt) && readback.run_attempt >= 1,
  'GITHUB_RUN_READBACK_ATTEMPT_MISMATCH');
  requireValue(readback.event === request.githubEvent
    && ['schedule', 'workflow_dispatch'].includes(readback.event),
  'GITHUB_RUN_READBACK_EVENT_INVALID');
  requireValue(readback.repository?.full_name === 'johnkim9524-collab/kaios_enterprise_repo'
    && readback.head_branch === 'main' && readback.head_sha === request.sourceSha
    && readback.path === registration.workflowPath,
  'GITHUB_RUN_READBACK_SOURCE_MISMATCH');
  requireValue(['queued', 'in_progress', 'completed'].includes(readback.status)
    && readback.html_url
      === `https://github.com/johnkim9524-collab/kaios_enterprise_repo/actions/runs/${runId}`,
  'GITHUB_RUN_READBACK_STATE_INVALID');
  return Object.freeze({
    id: runId, runAttempt: readback.run_attempt, event: readback.event,
    repository: readback.repository.full_name, headBranch: readback.head_branch,
    headSha: readback.head_sha, workflowPath: readback.path, status: readback.status,
    htmlUrl: readback.html_url,
  });
}

export function assessProtectedRuntimeRegistration(input) {
  const request = structuredClone(input);
  requireExactRecord(request, INPUT_KEYS, 'PROTECTED_RUNTIME_REGISTRATION_INPUT_INVALID');
  requireValue(/^[0-9a-f]{40}$/.test(request.sourceSha),
    'PROTECTED_RUNTIME_REGISTRATION_SOURCE_INVALID');
  const registration = verifyAutonomousTriggerRegistrationPackage(request.registrationPackage);
  requireValue(registration.sourceSha === request.sourceSha,
    'PROTECTED_RUNTIME_REGISTRATION_SOURCE_MISMATCH');
  let readback = null;
  if (request.githubRunReadback !== null) {
    readback = verifyGitHubRunReadback(request.githubRunReadback, request, registration);
  } else {
    requireValue(request.githubRunId === null && request.githubRunAttempt === null
      && request.githubEvent === null, 'GITHUB_RUN_READBACK_BINDING_WITHOUT_EVIDENCE');
  }
  requireValue(request.registrationReceipt === null || readback !== null,
    'GITHUB_RUN_READBACK_REQUIRED_FOR_EXTERNAL_RECEIPT');
  let externalReceipt = null;
  if (request.registrationReceipt !== null) {
    externalReceipt = verifyExternalAutonomousTriggerRegistrationReceipt(
      request.registrationReceipt, {
        expectedSourceSha: registration.sourceSha,
        expectedPackageDigest: registration.packageDigest,
      });
    requireValue(externalReceipt.workflowPath === registration.workflowPath
      && externalReceipt.schedule === registration.schedule,
    'PROTECTED_RUNTIME_REGISTRATION_RECEIPT_BINDING_INVALID');
  }
  const automaticTriggerObserved = readback?.event === 'schedule';
  const gate = assessAutonomousRuntimeActivationGate({
    registrationPackage: registration,
    registrationReceipt: automaticTriggerObserved ? externalReceipt : null,
    assessedAt: request.assessedAt,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
  const unsigned = {
    contractId: 'kidults-protected-runtime-registration-gate-v1', version: '1.1.0',
    state: gate.governedCanaryEligible
      ? 'GOVERNED_CANARY_ELIGIBLE_ACTIVATION_HOLD'
      : readback?.event === 'workflow_dispatch'
        ? 'MANUAL_RECOVERY_OBSERVED_REGISTRATION_HOLD'
        : 'EXTERNAL_REGISTRATION_REQUIRED_HOLD',
    sourceSha: request.sourceSha, workflowPath: registration.workflowPath,
    triggerClass: registration.triggerClass, schedule: registration.schedule,
    registrationPackageDigest: registration.packageDigest,
    registrationReceiptDigest: externalReceipt?.receiptDigest ?? null,
    githubRunReadbackDigest: readback === null ? null : digestObject(readback),
    githubRunId: readback?.id ?? null, githubRunAttempt: readback?.runAttempt ?? null,
    githubEvent: readback?.event ?? null, githubRunReadbackVerified: readback !== null,
    automaticTriggerObserved,
    activationGateDigest: gate.gateDigest, assessedAt: request.assessedAt,
    governedCanaryEligible: gate.governedCanaryEligible,
    credentialResolutionPerformed: false, remoteConnectionPerformed: false,
    activationAuthorized: false, remoteWorkerActivation: 'HOLD',
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyProtectedRuntimeRegistrationReceipt({
    ...unsigned, receiptDigest: digestObject(unsigned),
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return process.argv[index + 1];
}

function readJson(file, code) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(code); }
}

function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

async function main() {
  const packagePath = argument('--registration-package');
  const receiptPath = argument('--registration-receipt');
  const readbackPath = argument('--github-run-readback');
  const outputPath = argument('--output');
  const sourceSha = argument('--source-sha');
  const assessedAt = argument('--assessed-at');
  const result = assessProtectedRuntimeRegistration({
    registrationPackage: readJson(packagePath, 'REGISTRATION_PACKAGE_UNREADABLE'),
    registrationReceipt: receiptPath === 'NONE'
      ? null : readJson(receiptPath, 'REGISTRATION_RECEIPT_UNREADABLE'),
    githubRunReadback: readbackPath === 'NONE'
      ? null : readJson(readbackPath, 'GITHUB_RUN_READBACK_UNREADABLE'),
    githubRunId: readbackPath === 'NONE' ? null : argument('--github-run-id'),
    githubRunAttempt: readbackPath === 'NONE' ? null : Number(argument('--github-run-attempt')),
    githubEvent: readbackPath === 'NONE' ? null : argument('--github-event'),
    sourceSha, assessedAt,
  });
  writeExclusive(outputPath, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'PROTECTED_RUNTIME_GATE_FAILED'}\n`);
    process.exitCode = 1;
  });
}
