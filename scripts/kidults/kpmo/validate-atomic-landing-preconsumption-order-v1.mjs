#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
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

const orderedMarkers = [
  'Require base-workflow to candidate terminal handoff compatibility',
  'Verify event-emitting merge transport before authority consumption',
  'Require latest terminal exact-head lifecycle authority',
  'Consume one-use exact-head landing authorization',
  'Stage trusted Current-SOLD post-landing validator',
  'Initialize durable atomic landing terminal receipt',
  'Upload pre-mutation atomic landing intent',
  'Re-read live authority and await exact-head event-emitting merge',
  'Reconcile durable atomic landing terminal receipt',
  'Upload durable atomic landing terminal receipt',
];
const positions = orderedMarkers.map(marker => workflow.indexOf(marker));
assert(positions.every(position => position >= 0),
  'ATOMIC_LANDING_PRECONSUMPTION_SURFACE_MISSING');
assert(positions.every((position, index) => index === 0 || position > positions[index - 1]),
  'ATOMIC_LANDING_PRECONSUMPTION_ORDER_INVALID');

const lifecycleMarker = 'Require latest terminal exact-head lifecycle authority';
const consumptionMarker = 'Consume one-use exact-head landing authorization';
assert(workflow.split(lifecycleMarker).length === 2,
  'ATOMIC_LANDING_LIFECYCLE_PREFLIGHT_CARDINALITY_INVALID');
assert(workflow.split(consumptionMarker).length === 2,
  'ATOMIC_LANDING_AUTHORIZATION_CONSUMPTION_CARDINALITY_INVALID');
assert(workflow.indexOf(lifecycleMarker) < workflow.indexOf(consumptionMarker),
  'ATOMIC_LANDING_AUTHORIZATION_CONSUMED_BEFORE_LIFECYCLE_AUTHORITY');
const transportMarker = 'Verify event-emitting merge transport before authority consumption';
assert(workflow.indexOf(transportMarker) < workflow.indexOf(lifecycleMarker),
  'ATOMIC_LANDING_TRANSPORT_VALIDATED_AFTER_AUTHORITY_CONSUMPTION');
const transportSection = workflow.slice(workflow.indexOf(transportMarker), workflow.indexOf(lifecycleMarker));
assert(transportSection.includes('EXPECTED_BASE_SHA: ${{ inputs.expected_base_sha }}')
  && transportSection.includes('EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}')
  && transportSection.includes('EXPECTED_HEAD_TREE_SHA: ${{ inputs.expected_head_tree_sha }}')
  && transportSection.includes('run-atomic-event-emitting-transport-preflight-v1.mjs'),
'ATOMIC_LANDING_TRANSPORT_EXACT_IDENTITY_PREFLIGHT_MISSING');
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
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  lifecycle_authority_precedes_one_use_consumption: true,
  authorization_not_burned_by_missing_lifecycle: true,
  complete_owner_approval_contract_precedes_one_use_consumption: true,
  invalid_approval_not_recorded_as_consumed: true,
  consumption_receipt_written_after_final_pr_main_reread: true,
  complete_approval_authority_inputs_paginated: true,
  event_emitting_transport_validated_before_consumption: true,
  exact_base_head_tree_validated_before_consumption: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
