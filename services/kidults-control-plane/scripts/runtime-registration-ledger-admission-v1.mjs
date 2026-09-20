import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestObject, requireExactRecord, requireValue } from '../src/common-control/canonical-v1.mjs';
import { appendWorkflowRunReceipt, workflowReceiptLedgerInternals } from '../src/workflow-receipt-ledger.mjs';
import { verifyProtectedRuntimeRegistrationReceipt } from './protected-runtime-registration-gate-v1.mjs';

const ADMISSION_KEYS = Object.freeze([
  'contractId', 'version', 'state', 'registrationGate', 'registrationGateDigest', 'ledgerReceiptInput',
  'ledgerAppendRequired', 'governedCanaryEligibleAfterLedgerAppend',
  'governedCanaryEligible', 'credentialResolutionPerformed', 'remoteConnectionPerformed',
  'activationAuthorized', 'production', 'publicRelease', 'g5', 'admissionDigest',
]);

function ledgerReceiptInputForGate(gate) {
  return {
    repository: 'johnkim9524-collab/kaios_enterprise_repo', workflowPath: gate.workflowPath,
    workflowName: 'KIDULTS Control Plane Autonomous Runtime Registration Gate',
    workflowRunId: Number(gate.githubRunId), workflowRunAttempt: gate.githubRunAttempt,
    eventName: gate.githubEvent, headBranch: 'main', headSha: gate.sourceSha,
    workflowConclusion: 'neutral', canonicalJobConclusion: 'neutral',
    receiptType: 'KIDULTS_AUTONOMOUS_RUNTIME_REGISTRATION_GATE',
    receiptSchemaVersion: gate.version, sourceReceiptDigest: gate.receiptDigest,
    canonicalBinding: null, artifact: null, resultState: gate.state,
    result: {
      state: gate.state, registration_package_digest: gate.registrationPackageDigest,
      registration_receipt_digest: gate.registrationReceiptDigest,
      github_run_readback_digest: gate.githubRunReadbackDigest,
      automatic_trigger_observed: gate.automaticTriggerObserved,
      governed_canary_eligible: gate.governedCanaryEligible,
      activation_authorized: false, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD',
    },
    observedAt: gate.assessedAt,
  };
}

export function verifyRuntimeRegistrationLedgerAdmission(input) {
  const admission = structuredClone(input);
  requireExactRecord(admission, ADMISSION_KEYS,
    'RUNTIME_REGISTRATION_LEDGER_ADMISSION_SHAPE_INVALID');
  requireValue(admission.contractId === 'kidults-runtime-registration-ledger-admission-v1'
    && admission.version === '1.0.0'
    && admission.state === 'LEDGER_APPEND_REQUIRED_CANARY_HOLD',
  'RUNTIME_REGISTRATION_LEDGER_ADMISSION_CONTRACT_INVALID');
  const gate = verifyProtectedRuntimeRegistrationReceipt(admission.registrationGate);
  requireValue(gate.receiptDigest === admission.registrationGateDigest
    && digestObject(admission.ledgerReceiptInput) === digestObject(ledgerReceiptInputForGate(gate)),
  'RUNTIME_REGISTRATION_LEDGER_ADMISSION_GATE_MAPPING_INVALID');
  const normalized = workflowReceiptLedgerInternals.normalizeInput(admission.ledgerReceiptInput);
  requireValue(normalized.repository === 'johnkim9524-collab/kaios_enterprise_repo'
    && normalized.workflowPath
      === '.github/workflows/kidults-control-plane-autonomous-runtime-v1.yml'
    && normalized.workflowName === 'KIDULTS Control Plane Autonomous Runtime Registration Gate'
    && normalized.sourceReceiptDigest === admission.registrationGateDigest
    && normalized.receiptType === 'KIDULTS_AUTONOMOUS_RUNTIME_REGISTRATION_GATE'
    && normalized.receiptSchemaVersion === '1.1.0'
    && normalized.canonicalBinding.claimId === null
    && normalized.artifact.name === null,
  'RUNTIME_REGISTRATION_LEDGER_ADMISSION_BINDING_INVALID');
  requireValue(admission.ledgerAppendRequired === true
    && admission.governedCanaryEligible === false
    && admission.governedCanaryEligibleAfterLedgerAppend
      === (normalized.result.governed_canary_eligible === true)
    && admission.credentialResolutionPerformed === false
    && admission.remoteConnectionPerformed === false && admission.activationAuthorized === false
    && admission.production === 'HOLD' && admission.publicRelease === 'HOLD'
    && admission.g5 === 'HOLD',
  'RUNTIME_REGISTRATION_LEDGER_ADMISSION_AUTHORITY_INVALID');
  const { admissionDigest, ...unsigned } = admission;
  requireValue(admissionDigest === digestObject(unsigned),
    'RUNTIME_REGISTRATION_LEDGER_ADMISSION_INTEGRITY_INVALID');
  return Object.freeze(admission);
}

export function createRuntimeRegistrationLedgerAdmission(input) {
  requireExactRecord(input, ['registrationGate'],
    'RUNTIME_REGISTRATION_LEDGER_ADMISSION_INPUT_INVALID');
  const gate = verifyProtectedRuntimeRegistrationReceipt(input.registrationGate);
  requireValue(gate.githubRunReadbackVerified === true,
    'RUNTIME_REGISTRATION_LEDGER_READBACK_REQUIRED');
  const ledgerReceiptInput = ledgerReceiptInputForGate(gate);
  workflowReceiptLedgerInternals.normalizeInput(ledgerReceiptInput);
  const unsigned = {
    contractId: 'kidults-runtime-registration-ledger-admission-v1', version: '1.0.0',
    state: 'LEDGER_APPEND_REQUIRED_CANARY_HOLD', registrationGate: gate,
    registrationGateDigest: gate.receiptDigest,
    ledgerReceiptInput, ledgerAppendRequired: true,
    governedCanaryEligibleAfterLedgerAppend: gate.governedCanaryEligible,
    governedCanaryEligible: false, credentialResolutionPerformed: false,
    remoteConnectionPerformed: false, activationAuthorized: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  return verifyRuntimeRegistrationLedgerAdmission({
    ...unsigned, admissionDigest: digestObject(unsigned),
  });
}

export async function appendRuntimeRegistrationLedgerAdmission({ client, admission, id }) {
  const verified = verifyRuntimeRegistrationLedgerAdmission(admission);
  const result = await appendWorkflowRunReceipt({ client, receipt: verified.ledgerReceiptInput, id });
  requireValue(result.sourceReceiptDigest === verified.registrationGateDigest
    && result.workflowRunId === verified.ledgerReceiptInput.workflowRunId
    && result.workflowRunAttempt === verified.ledgerReceiptInput.workflowRunAttempt,
  'RUNTIME_REGISTRATION_LEDGER_APPEND_BINDING_INVALID');
  return Object.freeze({
    state: result.state, workflowReceiptId: result.workflowReceiptId,
    admissionDigest: verified.admissionDigest, registrationGateDigest: verified.registrationGateDigest,
    ledgerBindingDigest: result.bindingDigest,
    governedCanaryEligible: verified.governedCanaryEligibleAfterLedgerAppend,
    activationAuthorized: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return process.argv[index + 1];
}

async function main() {
  const gate = JSON.parse(fs.readFileSync(argument('--registration-gate'), 'utf8'));
  const output = argument('--output');
  const admission = createRuntimeRegistrationLedgerAdmission({ registrationGate: gate });
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, `${JSON.stringify(admission, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(admission)}\n`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'LEDGER_ADMISSION_FAILED'}\n`);
  process.exitCode = 1;
});
