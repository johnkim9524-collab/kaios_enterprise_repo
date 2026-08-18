#!/usr/bin/env node

import fs from 'node:fs';

const contractPath = process.argv[2]
  || 'coordination/kidults/poc/global-standard-poc-hardening-contract-v1.json';
const schemaPath = process.argv[3]
  || 'coordination/kidults/schemas/market-event-v1.schema.json';

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const requiredTruthGuards = [
  'EVIDENCE_BEFORE_METRICS',
  'MISSING_NE_ZERO',
  'ATTENTION_NE_DEMAND_NE_TRANSACTION',
  'LISTING_NE_SOLD_TRANSACTION',
  'BID_ASK_NE_TRANSACTION',
  'PUBLIC_REPRESENTATION_NE_REGIONAL_MARKET_SIGNIFICANCE',
  'SCARCITY_NE_ILLIQUIDITY',
  'PROVIDER_NE_TRUTH',
  'NO_FALSE_COMPARABILITY'
];
const requiredMetrics = ['DEMAND', 'OBSERVED_MARKET_ACTIVITY', 'LIQUIDITY', 'PRICE', 'SCARCITY'];
const requiredRights = ['collect', 'store', 'transform', 'display', 'redistribute', 'sell'];
const requiredMissingReasons = [
  'NOT_OBSERVED',
  'NOT_APPLICABLE',
  'NOT_COLLECTED_BY_DESIGN',
  'SOURCE_UNAVAILABLE',
  'ACCESS_DENIED',
  'RIGHTS_RESTRICTED',
  'PARSE_FAILED',
  'STALE_REJECTED',
  'CONFLICT_QUARANTINED'
];

expect(contract.id === 'kidults-global-standard-poc-hardening-contract-v1', 'unexpected hardening contract id');
expect(contract.version === '1.0.0', 'hardening contract version must be 1.0.0');
expect(contract.issue === 457, 'hardening contract must bind to issue #457');
expect(contract.status === 'CANONICAL_CANDIDATE', 'hardening contract must remain a canonical candidate');
expect(contract.track_b_input_eligible === false, 'contract alone cannot become Track B input');
expect(contract.provider_contact === 'HOLD', 'Provider Contact must remain HOLD');
expect(contract.production === 'HOLD', 'Production must remain HOLD');
expect(contract.full_320_expansion_allowed === false, '320 expansion must remain blocked');
expect(contract.next_execution === 'BOUNDED_MARKET_INTELLIGENCE_CANDIDATE_R2', 'unexpected next execution');
expect(contract.analysis_unit?.id === 'market_cell_id', 'market_cell_id analysis unit required');
expect(contract.analysis_unit?.required_dimensions?.length === 8, 'market cell must bind all eight dimensions');
expect(contract.event_lifecycle?.schema === schemaPath, 'event schema binding mismatch');
expect(contract.event_lifecycle?.failed_sale_admissible_states?.length === 2, 'failed-sale admission must be narrow');
expect(contract.event_lifecycle?.not_automatically_failed_sale?.includes('WITHDRAWN'), 'withdrawn must not auto-convert to failed sale');
expect(contract.price_semantics?.valuation_rule === 'OBSERVED_PRICE_AND_FAIR_VALUE_ARE_SEPARATE_ENTITIES', 'price and valuation must be separate');
expect(requiredRights.every(action => contract.rights_admission?.required_actions?.includes(action)), 'field-level rights actions incomplete');
expect(contract.rights_admission?.unknown_state === 'FAIL_CLOSED', 'unknown rights must fail closed');
expect(contract.freshness_admission?.states?.includes('STALE'), 'stale state missing');
expect(contract.freshness_admission?.states?.includes('EXPIRED'), 'expired state missing');
expect(contract.missingness?.value_rule === 'UNOBSERVED_VALUES_REMAIN_NULL_NEVER_ZERO', 'missing-to-zero guard missing');
expect(requiredMissingReasons.every(reason => contract.missingness?.reason_codes?.includes(reason)), 'missingness reason codes incomplete');
expect(contract.missingness?.imputation_policy === 'NONE', 'imputation must remain disabled');
expect(requiredMetrics.every(metric => contract.metric_registry?.some(row => row.metric === metric)), 'metric registry incomplete');
expect(contract.bounded_candidate_r2?.pilot_scopes?.length === 7, 'R2 must remain bounded to seven calibration Scopes');
expect(contract.bounded_candidate_r2?.products_per_scope === 2, 'R2 products-per-Scope must remain two');
expect(contract.bounded_candidate_r2?.cross_scope_ranking_allowed === false, 'cross-Scope ranking must remain blocked');
expect(contract.track_b_exit_gate?.projected_field_rights_coverage === 1, 'Track B rights coverage must be 100%');
expect(contract.track_b_exit_gate?.stale_rejection_rate === 1, 'Track B stale rejection must be 100%');
expect(contract.track_b_exit_gate?.golden_dataset_minimum_records >= 200, 'Golden Dataset floor must be at least 200');
expect(contract.track_b_exit_gate?.identity_precision_minimum >= 0.99, 'identity precision floor must be at least 99%');
expect(contract.track_b_exit_gate?.critical_false_auto_merge_maximum === 0, 'critical false auto merge maximum must be zero');
expect(contract.track_b_exit_gate?.independent_source_families_minimum >= 4, 'rankability source-family floor must be at least four');
expect(requiredTruthGuards.every(guard => contract.truth_guards?.includes(guard)), 'required truth guards incomplete');

expect(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'market-event schema must use JSON Schema 2020-12');
expect(schema.additionalProperties === false, 'market-event schema must reject unknown top-level fields');
for (const field of ['market_event_id', 'evidence_class', 'event_state', 'market_cell_id', 'canonical_entity_id', 'rights', 'freshness', 'lineage', 'price', 'missingness']) {
  expect(schema.required?.includes(field), `market-event schema missing required field: ${field}`);
}
expect(schema.properties?.lineage?.properties?.raw_digest?.pattern === '^sha256:[a-f0-9]{64}$', 'raw lineage digest must be SHA-256');
expect(schema.properties?.lineage?.properties?.normalized_digest?.pattern === '^sha256:[a-f0-9]{64}$', 'normalized lineage digest must be SHA-256');
expect(schema.properties?.missingness?.properties?.imputation_policy?.const === 'NONE', 'schema must prohibit imputation');

function admissionErrors(event) {
  const errors = [];
  const rights = event.rights || {};
  const freshness = event.freshness || {};
  const price = event.price || {};

  if (!event.market_cell_id) errors.push('MARKET_CELL_REQUIRED');
  if (!event.canonical_entity_id) errors.push('CANONICAL_ENTITY_REQUIRED');
  if (requiredRights.some(action => rights[action] !== 'ALLOW')) errors.push('RIGHTS_NOT_FULLY_ADMITTED');
  if (freshness.state !== 'CURRENT') errors.push('CURRENT_FRESHNESS_REQUIRED');
  if (event.value === 0 && event.missingness?.reason !== 'NONE') errors.push('MISSING_TO_ZERO');

  if (event.evidence_class === 'ACTIVE_LISTING' && event.event_state === 'SOLD') {
    errors.push('LISTING_TO_SOLD_SUBSTITUTION');
  }
  if (event.evidence_class === 'BID_ASK_SIGNAL' && event.event_state === 'SOLD') {
    errors.push('BID_ASK_TO_TRANSACTION_SUBSTITUTION');
  }
  if (event.evidence_class === 'VERIFIED_SOLD_EVENT') {
    if (event.event_state !== 'SOLD') errors.push('SOLD_STATE_REQUIRED');
    if (!['HAMMER', 'ALL_IN_REALIZED', 'ACCEPTED_OFFER'].includes(price.price_type)) errors.push('REALIZED_PRICE_SEMANTICS_REQUIRED');
    if (!(price.amount > 0) || !/^[A-Z]{3}$/.test(price.currency || '')) errors.push('REALIZED_PRICE_VALUE_REQUIRED');
  }
  if (event.evidence_class === 'FAILED_SALE_EVENT') {
    if (!['NO_SALE_RESERVE_NOT_MET', 'EXPIRED'].includes(event.event_state)) errors.push('FAILED_SALE_STATE_NOT_ADMISSIBLE');
  }
  if (event.evidence_class === 'TIME_TO_SALE') {
    if (!event.physical_object_id || !event.source_listing_id || !event.terminal_at) errors.push('LINKED_TIME_TO_SALE_EVENTS_REQUIRED');
    if (event.start_physical_object_id !== event.physical_object_id) errors.push('CROSS_OBJECT_TIME_TO_SALE');
  }
  if (event.source_signal === 'ATTENTION' && event.metric_claim === 'DEMAND') {
    errors.push('ATTENTION_TO_DEMAND_SUBSTITUTION');
  }
  if (event.source_signal === 'REGIONAL_CONTEXT' && event.metric_claim === 'PRODUCT_MARKET_SCORE') {
    errors.push('SCOPE_CONTEXT_TO_PRODUCT_SCORE_SUBSTITUTION');
  }
  return errors;
}

const allowedRights = Object.fromEntries(requiredRights.map(action => [action, 'ALLOW']));
const baseEvent = {
  market_cell_id: 'synthetic-market-cell',
  canonical_entity_id: 'synthetic-entity',
  physical_object_id: 'synthetic-object',
  source_listing_id: 'synthetic-listing',
  terminal_at: '2026-08-18T00:00:00Z',
  start_physical_object_id: 'synthetic-object',
  evidence_class: 'VERIFIED_SOLD_EVENT',
  event_state: 'SOLD',
  rights: allowedRights,
  freshness: { state: 'CURRENT' },
  missingness: { reason: 'NONE' },
  price: { price_type: 'HAMMER', amount: 100, currency: 'USD' }
};
expect(admissionErrors(baseEvent).length === 0, 'synthetic valid event must pass admission controls');

const negativeControls = [
  ['LISTING_TO_SOLD_REJECTED', { evidence_class: 'ACTIVE_LISTING', event_state: 'SOLD' }, 'LISTING_TO_SOLD_SUBSTITUTION'],
  ['BID_ASK_TO_TRANSACTION_REJECTED', { evidence_class: 'BID_ASK_SIGNAL', event_state: 'SOLD' }, 'BID_ASK_TO_TRANSACTION_SUBSTITUTION'],
  ['ATTENTION_TO_DEMAND_REJECTED', { source_signal: 'ATTENTION', metric_claim: 'DEMAND' }, 'ATTENTION_TO_DEMAND_SUBSTITUTION'],
  ['WITHDRAWN_TO_FAILED_SALE_REJECTED', { evidence_class: 'FAILED_SALE_EVENT', event_state: 'WITHDRAWN' }, 'FAILED_SALE_STATE_NOT_ADMISSIBLE'],
  ['MISSING_TO_ZERO_REJECTED', { value: 0, missingness: { reason: 'NOT_OBSERVED' } }, 'MISSING_TO_ZERO'],
  ['RIGHTS_UNKNOWN_REJECTED', { rights: { ...allowedRights, display: 'UNKNOWN' } }, 'RIGHTS_NOT_FULLY_ADMITTED'],
  ['STALE_CURRENT_STATE_REJECTED', { freshness: { state: 'STALE' } }, 'CURRENT_FRESHNESS_REQUIRED'],
  ['CROSS_OBJECT_TIME_TO_SALE_REJECTED', { evidence_class: 'TIME_TO_SALE', start_physical_object_id: 'other-object' }, 'CROSS_OBJECT_TIME_TO_SALE'],
  ['SCOPE_CONTEXT_TO_PRODUCT_SCORE_REJECTED', { source_signal: 'REGIONAL_CONTEXT', metric_claim: 'PRODUCT_MARKET_SCORE' }, 'SCOPE_CONTEXT_TO_PRODUCT_SCORE_SUBSTITUTION']
];

for (const [name, mutation, expectedError] of negativeControls) {
  const candidate = {
    ...baseEvent,
    ...mutation,
    rights: mutation.rights || baseEvent.rights,
    freshness: mutation.freshness || baseEvent.freshness,
    missingness: mutation.missingness || baseEvent.missingness,
    price: mutation.price || baseEvent.price
  };
  expect(admissionErrors(candidate).includes(expectedError), `negative control did not reject ${name}`);
  expect(contract.negative_controls?.includes(name), `contract missing negative control declaration: ${name}`);
}

if (failures.length) {
  console.error('Global-standard PoC hardening validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  market_event_schema: schema.title,
  analysis_unit: contract.analysis_unit.id,
  pilot_scopes: contract.bounded_candidate_r2.pilot_scopes.length,
  metrics_separated: contract.metric_registry.length,
  negative_controls: negativeControls.length,
  track_b_input_eligible: contract.track_b_input_eligible,
  provider_contact: contract.provider_contact,
  production: contract.production,
  full_320_expansion_allowed: contract.full_320_expansion_allowed
}, null, 2));
