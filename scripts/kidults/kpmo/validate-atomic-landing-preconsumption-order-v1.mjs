#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const dispatchReceiptInitializer = fs.readFileSync(
  'scripts/kidults/kpmo/initialize-atomic-dispatch-terminal-receipt-v1.mjs',
  'utf8',
);
const lifecyclePreflight = fs.readFileSync(
  'scripts/kidults/kpmo/run-atomic-landing-lifecycle-preflight-v1.mjs',
  'utf8',
);
const oneUsePreflight = fs.readFileSync(
  'scripts/kidults/kpmo/run-atomic-landing-one-use-preflight-v1.mjs',
  'utf8',
);
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const dispatchReceiptMarker = 'Initialize fail-closed atomic dispatch terminal receipt';
const compatibilityMarker = 'Require base-workflow to candidate terminal handoff compatibility';
const transportMarker = 'Require event-emitting post-merge CI transport';
const orderedMarkers = [
  dispatchReceiptMarker,
  compatibilityMarker,
  'Require latest terminal exact-head lifecycle authority',
  'Consume one-use exact-head landing authorization',
  'Stage trusted Current-SOLD post-landing validator',
  'Initialize durable atomic landing terminal receipt',
  'Upload pre-mutation atomic landing intent',
  'Re-read live authority and execute exact-head server merge',
  'Reconcile durable atomic landing terminal receipt',
  'Upload durable atomic landing terminal receipt',
];
const positions = orderedMarkers.map(marker => workflow.indexOf(marker));
assert(positions.every(position => position >= 0),
  'ATOMIC_LANDING_PRECONSUMPTION_SURFACE_MISSING');
assert(positions.every((position, index) => index === 0 || position > positions[index - 1]),
  'ATOMIC_LANDING_PRECONSUMPTION_ORDER_INVALID');

assert(workflow.split(dispatchReceiptMarker).length === 2,
  'ATOMIC_LANDING_DISPATCH_RECEIPT_INITIALIZER_CARDINALITY_INVALID');
assert(workflow.indexOf(dispatchReceiptMarker) < workflow.indexOf(compatibilityMarker),
  'ATOMIC_LANDING_DISPATCH_RECEIPT_NOT_FIRST_PREMUTATION_GATE');
assert(workflow.indexOf(dispatchReceiptMarker) < workflow.indexOf(transportMarker),
  'ATOMIC_LANDING_DISPATCH_RECEIPT_AFTER_TRANSPORT_BLOCK');
assert(workflow.includes('run: node scripts/kidults/kpmo/initialize-atomic-dispatch-terminal-receipt-v1.mjs'),
  'ATOMIC_LANDING_DISPATCH_RECEIPT_INITIALIZER_NOT_INVOKED');
assert(workflow.includes('ATOMIC_LANDING_TERMINAL_RECEIPT_PATH: ${{ runner.temp }}/kidults-atomic-landing-terminal/receipt.json'),
  'ATOMIC_LANDING_DISPATCH_RECEIPT_PATH_NOT_BOUND');
const terminalUploadMarker = 'Upload durable atomic landing terminal receipt';
const terminalUploadSection = workflow.slice(workflow.indexOf(terminalUploadMarker));
assert(terminalUploadSection.includes('if: always()')
  && terminalUploadSection.includes('${{ runner.temp }}/kidults-atomic-landing-terminal/receipt.json'),
'ATOMIC_LANDING_TERMINAL_RECEIPT_NOT_ALWAYS_UPLOADED');

const initializerTokens = [
  "state: structurallyValid ? 'DISPATCH_RECEIVED_FAIL_CLOSED' : 'VERIFIED_FAIL'",
  "failureCode = 'ATOMIC_TERMINAL_AUTHORIZATION_BINDING_INVALID'",
  'authorization_id_sha256:',
  'authorization_binding_valid: authorizationBindingValid',
  'raw_authorization_persisted: false',
  'merge_committed: false',
  "production: 'HOLD'",
  "public: 'HOLD'",
  "g5: 'HOLD'",
];
assert(initializerTokens.every(token => dispatchReceiptInitializer.includes(token)),
  'ATOMIC_LANDING_SANITIZED_DISPATCH_RECEIPT_CONTRACT_MISSING');
assert(!dispatchReceiptInitializer.includes('authorization_id: authorizationText')
  && !dispatchReceiptInitializer.includes('landing_authorization_id: authorizationText'),
'ATOMIC_LANDING_RAW_AUTHORIZATION_PERSISTENCE_FORBIDDEN');

const lifecycleMarker = 'Require latest terminal exact-head lifecycle authority';
const consumptionMarker = 'Consume one-use exact-head landing authorization';
assert(workflow.split(lifecycleMarker).length === 2,
  'ATOMIC_LANDING_LIFECYCLE_PREFLIGHT_CARDINALITY_INVALID');
assert(workflow.split(consumptionMarker).length === 2,
  'ATOMIC_LANDING_AUTHORIZATION_CONSUMPTION_CARDINALITY_INVALID');
assert(workflow.indexOf(lifecycleMarker) < workflow.indexOf(consumptionMarker),
  'ATOMIC_LANDING_AUTHORIZATION_CONSUMED_BEFORE_LIFECYCLE_AUTHORITY');
const lifecycleSection = workflow.slice(
  workflow.indexOf(lifecycleMarker),
  workflow.indexOf(consumptionMarker),
);
assert(lifecycleSection.includes('LANDING_AUTHORIZATION_ID: ${{ inputs.landing_authorization_id }}')
  && lifecycleSection.includes('LANDING_ACTOR: ${{ github.actor }}'),
'ATOMIC_LANDING_OWNER_APPROVAL_PREFLIGHT_ENV_MISSING');
assert(workflow.includes('complete exact-head Program Owner approval')
  && workflow.includes('malformed/expired/overlong approval'),
'ATOMIC_LANDING_PRECONSUMPTION_FAIL_CLOSED_RATIONALE_MISSING');

const lifecycleApprovalTokens = [
  'assertLandingActorAndAuthorization',
  'selectExactHeadProgramOwnerApproval',
  `pages(\`/issues/\${prNumber}/comments\`)`,
  `request(\`/commits/\${expectedHeadSha}\`)`,
  'complete_owner_approval_contract_validated_before_consumption: true',
];
assert(lifecycleApprovalTokens.every(token => lifecyclePreflight.includes(token)),
  'ATOMIC_LANDING_COMPLETE_OWNER_APPROVAL_PREFLIGHT_MISSING');

const approvalSelection = oneUsePreflight.indexOf('const programOwnerApproval = selectExactHeadProgramOwnerApproval');
const receiptValidation = oneUsePreflight.lastIndexOf('assertAtomicLandingConsumptionReceipt(receipt, {');
const receiptWrite = oneUsePreflight.lastIndexOf('writeReceipt(receipt, receiptPath);');
assert(approvalSelection >= 0 && receiptValidation > approvalSelection && receiptWrite > receiptValidation,
  'ATOMIC_LANDING_CONSUMPTION_WRITTEN_BEFORE_COMPLETE_VALIDATION');
assert(oneUsePreflight.includes('complete_owner_approval_contract_validated_before_consumption: true')
  && oneUsePreflight.includes('ATOMIC_ONE_USE_PR_DRIFT_DURING_CONSUMPTION')
  && oneUsePreflight.includes('ATOMIC_ONE_USE_MAIN_DRIFT_DURING_CONSUMPTION'),
  'ATOMIC_LANDING_ONE_USE_FINAL_REREAD_INVARIANT_MISSING');
assert(oneUsePreflight.includes(`pages(\`/issues/\${prNumber}/timeline\`)`)
  && oneUsePreflight.includes(`pages(\`/issues/\${prNumber}/comments\`)`)
  && oneUsePreflight.includes('ATOMIC_ONE_USE_PAGINATION_BOUND_EXCEEDED'),
  'ATOMIC_LANDING_ONE_USE_APPROVAL_PAGINATION_INVARIANT_MISSING');

console.log(JSON.stringify({
  id: 'kidults-atomic-landing-preconsumption-order-receipt-v1',
  version: '1.1.0',
  state: 'VERIFIED_PASS',
  dispatch_receipt_precedes_all_premutation_gates: true,
  malformed_dispatch_gets_sanitized_terminal_evidence: true,
  terminal_receipt_upload_is_always_on: true,
  lifecycle_authority_precedes_one_use_consumption: true,
  authorization_not_burned_by_missing_lifecycle: true,
  complete_owner_approval_contract_precedes_one_use_consumption: true,
  invalid_approval_not_recorded_as_consumed: true,
  consumption_receipt_written_after_final_pr_main_reread: true,
  complete_approval_authority_inputs_paginated: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
