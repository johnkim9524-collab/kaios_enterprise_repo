import assert from 'node:assert/strict';

import {
  inferCertification,
  isCertifiedControlledHalt,
} from './a39-enterprise-acceptance.mjs';

const controlledHalt = {
  stage: 'A25',
  status: 'HALTED',
  state: 'HALTED',
  activationEvidenceRef: 'a24-production-activation-example.json',
  failureClass: 'POLICY',
  failureReason: 'no-eligible-targets-for-cycle',
  metrics: {
    halt_count: 1,
    failure_count: 0,
    remote_call_count: 0,
    records_mutated: 0,
  },
  targetResults: [],
  rollback: { required: false, status: 'NOT_REQUIRED' },
  invariants: {
    policyBeforeExecution: true,
    preflightBeforeMutation: true,
    activationCheckBeforeExecution: true,
    failClosedOnUnknownState: true,
  },
};

assert.equal(isCertifiedControlledHalt(controlledHalt), true);
assert.equal(inferCertification(controlledHalt), true);

for (const mutate of [
  (report) => { report.state = 'FAILED_CLOSED'; },
  (report) => { report.failureClass = 'RUNTIME'; },
  (report) => { report.failureReason = 'unknown'; },
  (report) => { report.metrics.failure_count = 1; },
  (report) => { report.metrics.remote_call_count = 1; },
  (report) => { report.metrics.records_mutated = 1; },
  (report) => { report.targetResults = [{ status: 'EXECUTED_BOUNDED' }]; },
  (report) => { report.rollback.required = true; },
  (report) => { report.invariants.preflightBeforeMutation = false; },
]) {
  const invalid = structuredClone(controlledHalt);
  mutate(invalid);
  assert.equal(isCertifiedControlledHalt(invalid), false);
  assert.notEqual(inferCertification(invalid), true);
}

console.log('A39 controlled-halt certification regression: PASS');
