#!/usr/bin/env node
import fs from 'node:fs';
import {
  assertAtomicLandingHandoffCompatibility,
} from './lib/atomic-landing-handoff-compatibility-v1.mjs';

const workflow = fs.readFileSync('.github/workflows/kidults-atomic-governed-landing-v1.yml', 'utf8');
const reconciler = fs.readFileSync('scripts/kidults/kpmo/reconcile-atomic-landing-terminal-v1.mjs', 'utf8');

const live = assertAtomicLandingHandoffCompatibility({
  baseWorkflow: workflow,
  candidateTerminalReconciler: reconciler,
});
if (live.required_contracts.length !== 1 || live.required_contracts[0] !== 'CURRENT_SOLD_CHANGED') {
  throw new Error('ATOMIC_HANDOFF_LIVE_CONTRACT_SET_INVALID');
}

let rejected = false;
try {
  assertAtomicLandingHandoffCompatibility({
    baseWorkflow: workflow.replace(
      '          CURRENT_SOLD_CHANGED: ${{ steps.landing.outputs.current_sold_changed }}\n',
      '',
    ),
    candidateTerminalReconciler: reconciler,
  });
} catch (error) {
  rejected = String(error?.code || error?.message || '').startsWith(
    'ATOMIC_HANDOFF_BASE_WORKFLOW_INCOMPATIBLE:CURRENT_SOLD_CHANGED',
  );
}
if (!rejected) throw new Error('ATOMIC_HANDOFF_MISSING_PRODUCER_NOT_REJECTED');

const legacy = assertAtomicLandingHandoffCompatibility({
  baseWorkflow: workflow.replace(
    '          CURRENT_SOLD_CHANGED: ${{ steps.landing.outputs.current_sold_changed }}\n',
    '',
  ),
  candidateTerminalReconciler: reconciler.replace(
    'const landingCurrentSoldChanged = process.env.CURRENT_SOLD_CHANGED || null;',
    'const landingCurrentSoldChanged = null;',
  ),
});
if (legacy.required_contracts.length !== 0) {
  throw new Error('ATOMIC_HANDOFF_LEGACY_CONSUMER_FALSE_POSITIVE');
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ATOMIC_LANDING_HANDOFF_COMPATIBILITY_V1',
  state: 'VERIFIED_PASS',
  live_required_contracts: live.required_contracts,
  missing_producer_negative_case: 'REJECTED',
  legacy_consumer_control: 'PASS',
  authorization_consumed: false,
  merge_executed: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
