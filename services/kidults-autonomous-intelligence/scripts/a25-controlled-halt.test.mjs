import assert from 'node:assert/strict';

import {
  RuntimeState,
  classifyActivationAvailability,
  transition,
} from './lib/autonomous-production-runtime.mjs';

const halted = classifyActivationAvailability(0);
assert.deepEqual(halted, {
  state: RuntimeState.HALTED,
  reason: 'no-eligible-targets-for-cycle',
});
assert.equal(
  transition(RuntimeState.ACTIVATION_CHECK, halted.state),
  RuntimeState.HALTED,
);

const ready = classifyActivationAvailability(1);
assert.deepEqual(ready, {
  state: RuntimeState.READY,
  reason: 'eligible-targets-present',
});

for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '0', null]) {
  assert.deepEqual(classifyActivationAvailability(invalid), {
    state: RuntimeState.FAILED_CLOSED,
    reason: 'invalid-eligible-target-count-fail-closed',
  });
}

assert.equal(
  transition(RuntimeState.ACTIVATION_CHECK, RuntimeState.EXECUTING),
  RuntimeState.FAILED_CLOSED,
);

console.log('A25 controlled-halt regression: PASS');
