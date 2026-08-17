#!/usr/bin/env node
import fs from 'node:fs';

const matrix = JSON.parse(fs.readFileSync('coordination/kidults/index/market-evidence-provider-rights-matrix-v1.json','utf8'));
const contract = JSON.parse(fs.readFileSync('coordination/kidults/index/index-market-observation-contract-v1.json','utf8'));
const queue = JSON.parse(fs.readFileSync('coordination/kidults/index/provider-authorization-action-queue-v1.json','utf8'));

const fail = (m) => { throw new Error(m); };
if (matrix.summary.currently_authorized_transaction_families !== 0) fail('No provider may be marked authorized before explicit approval');
if (matrix.summary.index_gate_state !== 'HOLD_EXTERNAL_PROVIDER_AUTHORIZATION') fail('Index must remain fail-closed');
if (matrix.summary.acquisition_authorized !== false) fail('Acquisition must remain false');
if (contract.event_rules.listing_is_sold !== false) fail('Listing cannot equal sold');
if (contract.event_rules.price_guide_is_transaction !== false) fail('Price guide cannot equal transaction');
if (contract.event_rules.unknown_rights_promotable !== false) fail('Unknown rights cannot be promoted');
if (contract.index_gate.min_verified_sold_observations !== 180) fail('Market observation threshold changed');
if (contract.index_gate.min_empirical_regions !== 3) fail('Region threshold changed');
if (contract.index_gate.min_time_depth_months !== 12) fail('Time-depth threshold changed');
if (contract.index_gate.min_independent_transaction_families !== 3) fail('Family threshold changed');
if (queue.actions.length < 4) fail('Authorization action queue incomplete');
if (queue.automatic_resume_rule.minimum_independent_transaction_families_for_index_pass !== 3) fail('Index family rule mismatch');
if (queue.automatic_resume_rule.production !== 'HOLD') fail('Production must remain HOLD');

console.log(JSON.stringify({
  status:'PASS',
  providers: matrix.providers.length,
  authorized_transaction_families: matrix.summary.currently_authorized_transaction_families,
  index_gate: matrix.summary.index_gate_state,
  authorization_actions: queue.actions.length,
  production:'HOLD'
}, null, 2));
