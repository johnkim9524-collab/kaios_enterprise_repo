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

const terminalBootstrapCall = '\nwriteFailClosedTerminalBootstrap();';
const strictApprovalCall = '\nassertLandingActorAndAuthorization(landingActor, repositoryOwner, authorizationId, prNumber, expectedHeadSha);';
const terminalBootstrap = lifecyclePreflight.indexOf(terminalBootstrapCall);
const lifecycleApprovalValidation = lifecyclePreflight.indexOf(strictApprovalCall);
assert(lifecyclePreflight.split(terminalBootstrapCall).length === 2,
  'ATOMIC_LANDING_TERMINAL_BOOTSTRAP_CALL_CARDINALITY_INVALID');
assert(lifecyclePreflight.split(strictApprovalCall).length === 2,
  'ATOMIC_LANDING_STRICT_APPROVAL_CALL_CARDINALITY_INVALID');
assert(terminalBootstrap >= 0 && lifecycleApprovalValidation > terminalBootstrap,
  'ATOMIC_LANDING_TERMINAL_BOOTSTRAP_NOT_BEFORE_APPROVAL_VALIDATION');
// Import declarations intentionally precede the bootstrap. Only the executable
// strict-approval call is relevant to the prevalidation ordering invariant.
const reorderedLifecycle = lifecyclePreflight
  .replace(terminalBootstrapCall, '')
  .replace(strictApprovalCall, `${strictApprovalCall}${terminalBootstrapCall}`);
const reorderedBootstrap = reorderedLifecycle.indexOf(terminalBootstrapCall);
const reorderedApproval = reorderedLifecycle.indexOf(strictApprovalCall);
assert(reorderedApproval >= 0 && reorderedBootstrap > reorderedApproval,
  'ATOMIC_LANDING_PREVALIDATION_MUTATION_SETUP_INVALID');
assert(!(reorderedBootstrap >= 0 && reorderedApproval > reorderedBootstrap),
  'ATOMIC_LANDING_PREVALIDATION_REORDER_FALSE_GREEN');
assert(lifecyclePreflight.includes("terminal_class: 'PREVALIDATION_FAIL_CLOSED_BOOTSTRAP'")
  && lifecyclePreflight.includes('authorization_id_sha256: sha256(authorizationId)')
  && lifecyclePreflight.includes('raw_authorization_persisted: false')
  && lifecyclePreflight.includes("path.join(runnerTemp, 'kidults-atomic-landing-terminal', 'receipt.json')")
  && lifecyclePreflight.includes('mode: 0o600'),
'ATOMIC_LANDING_PREVALIDATION_TERMINAL_DURABILITY_INVARIANT_MISSING');

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
  lifecycle_authority_precedes_one_use_consumption: true,
  terminal_bootstrap_precedes_strict_approval_validation: true,
  malformed_authorization_failure_keeps_sanitized_terminal_receipt: true,
  authorization_not_burned_by_missing_lifecycle: true,
  complete_owner_approval_contract_precedes_one_use_consumption: true,
  invalid_approval_not_recorded_as_consumed: true,
  consumption_receipt_written_after_final_pr_main_reread: true,
  complete_approval_authority_inputs_paginated: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
