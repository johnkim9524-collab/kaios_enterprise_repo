import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gatePath, validateBindings, validateGate } from '../../../scripts/kidults/provider/validate-track-z-money-to-usable-data-gate-v1.mjs';

const canonical = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
const clone = () => structuredClone(canonical);

test('canonical Track Z money-to-usable-data gate passes', () => {
  assert.deepEqual(validateGate(clone()), []);
});

test('missing INPUT link fails closed', () => {
  const gate = clone();
  delete gate.links.INPUT;
  assert.ok(validateGate(gate).includes('LINK_INPUT'));
});

test('paid auto-converting trial cannot bypass the gate', () => {
  const gate = clone();
  gate.prepayment_policy.auto_converting_trial_before_gate_pass_forbidden = false;
  assert.ok(validateGate(gate).includes('AUTO_CONVERT'));
});

test('READY_FOR_SPEND_REVIEW never grants spend authority', () => {
  const gate = clone();
  gate.ready_for_spend_review_grants_spend_authority = true;
  assert.ok(validateGate(gate).includes('SPEND_AUTHORITY'));
});

test('Production, Public and G5 remain HOLD', () => {
  const gate = clone();
  gate.production = 'AUTHORIZED';
  assert.ok(validateGate(gate).includes('RELEASE_HOLD'));
});

test('PSA control incident cannot authorize broader rights or spend', () => {
  const gate = clone();
  gate.control_incident.additional_spend_authorized = true;
  assert.ok(validateBindings(gate, {}, '', '').includes('PSA_INCIDENT_BOUNDARY'));
});
