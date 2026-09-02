#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');
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
assert(workflow.includes('A missing, stale, pending, or RED lifecycle generation must'),
  'ATOMIC_LANDING_PRECONSUMPTION_FAIL_CLOSED_RATIONALE_MISSING');

console.log(JSON.stringify({
  id: 'kidults-atomic-landing-preconsumption-order-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  lifecycle_authority_precedes_one_use_consumption: true,
  authorization_not_burned_by_missing_lifecycle: true,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
