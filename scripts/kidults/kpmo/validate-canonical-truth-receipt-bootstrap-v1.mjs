#!/usr/bin/env node
import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function validateWorkflow(text) {
  const initMarker = '- name: Initialize fail-closed canonical-truth receipt';
  const checkoutMarker = '- uses: actions/checkout@';
  const validateMarker = '- name: Validate live canonical issue truth';
  const emitMarker = '- name: Emit exact canonical-truth receipt';
  const uploadMarker = '- name: Upload exact canonical-truth receipt';

  const initIndex = text.indexOf(initMarker);
  const checkoutIndex = text.indexOf(checkoutMarker);
  const validateIndex = text.indexOf(validateMarker);
  const emitIndex = text.indexOf(emitMarker);
  const uploadIndex = text.indexOf(uploadMarker);

  requireTrue(initIndex >= 0, 'CANONICAL_RECEIPT_BOOTSTRAP_MISSING');
  requireTrue(checkoutIndex >= 0, 'CANONICAL_CHECKOUT_MISSING');
  requireTrue(validateIndex >= 0, 'CANONICAL_VALIDATE_STEP_MISSING');
  requireTrue(emitIndex >= 0, 'CANONICAL_RECEIPT_EMIT_STEP_MISSING');
  requireTrue(uploadIndex >= 0, 'CANONICAL_RECEIPT_UPLOAD_STEP_MISSING');
  requireTrue(initIndex < checkoutIndex, 'CANONICAL_RECEIPT_BOOTSTRAP_AFTER_CHECKOUT');
  requireTrue(checkoutIndex < validateIndex && validateIndex < emitIndex && emitIndex < uploadIndex,
    'CANONICAL_RECEIPT_STEP_ORDER_INVALID');

  const bootstrap = text.slice(initIndex, checkoutIndex);
  for (const token of [
    '"validation_outcome": "not_run"',
    '"state": "VERIFIED_FAIL"',
    '"failure_class": "VALIDATION_NOT_COMPLETED"',
    '"promotion_eligible": false',
    '"production": "HOLD"',
    '"public": "HOLD"',
    '"run_attempt": $GITHUB_RUN_ATTEMPT',
    '"head_sha": "$RECEIPT_HEAD_SHA"'
  ]) {
    requireTrue(bootstrap.includes(token), `CANONICAL_RECEIPT_BOOTSTRAP_TOKEN_MISSING:${token}`);
  }

  const emit = text.slice(emitIndex, uploadIndex);
  requireTrue(emit.includes('if: always()'), 'CANONICAL_RECEIPT_EMIT_NOT_ALWAYS');
  requireTrue(emit.includes('if [ -z "${VALIDATION_OUTCOME:-}" ]; then'),
    'CANONICAL_RECEIPT_EMPTY_OUTCOME_FALLBACK_MISSING');
  requireTrue(emit.includes('test -s "$RUNNER_TEMP/canonical-truth-receipt-v1.json"'),
    'CANONICAL_RECEIPT_FALLBACK_FILE_ASSERT_MISSING');
  requireTrue(emit.includes("failure_class: outcome === 'success' ? null : 'CANONICAL_VALIDATION_NON_SUCCESS'"),
    'CANONICAL_RECEIPT_NON_SUCCESS_CLASSIFICATION_MISSING');
  requireTrue(emit.includes('promotion_eligible: false'),
    'CANONICAL_RECEIPT_PROMOTION_HOLD_MISSING');

  const upload = text.slice(uploadIndex);
  requireTrue(upload.includes('if: always()'), 'CANONICAL_RECEIPT_UPLOAD_NOT_ALWAYS');
  requireTrue(upload.includes('if-no-files-found: error'), 'CANONICAL_RECEIPT_UPLOAD_MISSING_FILE_NOT_FATAL');

  return true;
}

const source = fs.readFileSync(WORKFLOW_PATH, 'utf8');

if (process.argv.includes('--self-test')) {
  validateWorkflow(source);
  const mutations = [
    source.replace('- name: Initialize fail-closed canonical-truth receipt', '- name: Initialize canonical-truth receipt'),
    source.replace('if [ -z "${VALIDATION_OUTCOME:-}" ]; then', 'if [ -n "${VALIDATION_OUTCOME:-}" ]; then'),
    source.replace('"promotion_eligible": false', '"promotion_eligible": true')
  ];
  for (const [index, mutation] of mutations.entries()) {
    let rejected = false;
    try { validateWorkflow(mutation); } catch { rejected = true; }
    requireTrue(rejected, `CANONICAL_RECEIPT_NEGATIVE_MUTATION_NOT_REJECTED:${index}`);
  }
  console.log(JSON.stringify({status:'VERIFIED_PASS',contract:'CANONICAL_TRUTH_RECEIPT_BOOTSTRAP_V1',negative_mutations_rejected:mutations.length}));
} else {
  validateWorkflow(source);
  console.log(JSON.stringify({status:'VERIFIED_PASS',contract:'CANONICAL_TRUTH_RECEIPT_BOOTSTRAP_V1'}));
}
