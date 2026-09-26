import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAuthorityChainTriggerContract,
  validateAuthorityChainTriggerCompatibility,
} from '../../../scripts/kidults/source-intelligence/lib/authority-chain-trigger-compatibility-v1.mjs';

const contract = loadAuthorityChainTriggerContract();
const validate = value => validateAuthorityChainTriggerCompatibility(value, contract);

for (const event of ['workflow_run', 'workflow_dispatch']) {
  test(`accepts registered, equal, exactly-bound ${event}`, () =>
    assert.equal(validate({producerEvent:event, consumerEvent:event, exactTriggeringRunBound:true}), true));
}

const events = ['workflow_run', 'workflow_dispatch', 'push', 'schedule', 'pull_request', undefined];
const adversarial = [];
for (const producerEvent of events) for (const consumerEvent of events) {
  if (producerEvent === consumerEvent && contract.allowed_events.includes(producerEvent)) continue;
  adversarial.push({producerEvent, consumerEvent, exactTriggeringRunBound:true});
}
for (const event of contract.allowed_events) {
  adversarial.push({producerEvent:event, consumerEvent:event, exactTriggeringRunBound:false});
}
assert.equal(adversarial.length, 36);
for (const [index, value] of adversarial.entries()) {
  test(`rejects adversarial trigger mutation ${index + 1}/36`, () => assert.throws(() => validate(value)));
}
