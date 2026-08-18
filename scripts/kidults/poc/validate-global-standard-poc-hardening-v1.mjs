#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const contractPath = process.argv[2]
  || 'coordination/kidults/poc/global-standard-poc-hardening-contract-v1.json';
const schemaPath = process.argv[3]
  || 'coordination/kidults/schemas/market-event-v1.schema.json';

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const failures = [];
const clone = value => JSON.parse(JSON.stringify(value));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const nonEmptyString = value => typeof value === 'string' && value.length > 0;
const sha256Pattern = '^sha256:[a-f0-9]{64}$';

const expected = {
  analysisDimensions: [
    'canonical_product_or_edition', 'variant', 'condition_or_grade', 'region',
    'channel', 'sale_mechanism', 'currency_basis', 'observation_window'
  ],
  identityHierarchy: ['DESIGN', 'EDITION', 'VARIANT', 'PHYSICAL_OBJECT', 'LOT', 'LISTING', 'MARKET_EVENT'],
  evidenceClasses: [
    'ACTIVE_LISTING', 'VENUE_PRESENCE', 'BID_ASK_SIGNAL', 'AUCTION_RESULT_REFERENCE',
    'VERIFIED_SOLD_EVENT', 'FAILED_SALE_EVENT', 'TIME_TO_SALE'
  ],
  terminalStates: [
    'SOLD', 'NO_SALE_RESERVE_NOT_MET', 'WITHDRAWN', 'CANCELLED',
    'EXPIRED', 'DELISTED', 'RELISTED', 'UNKNOWN'
  ],
  failedSaleStates: ['NO_SALE_RESERVE_NOT_MET', 'EXPIRED'],
  notAutomaticallyFailedSale: ['WITHDRAWN', 'CANCELLED', 'DELISTED', 'RELISTED', 'UNKNOWN'],
  priceTypes: [
    'ASK', 'ESTIMATE_LOW', 'ESTIMATE_HIGH', 'HAMMER',
    'ALL_IN_REALIZED', 'ACCEPTED_OFFER', 'BID', 'UNKNOWN'
  ],
  normalizationFields: [
    'amount', 'currency', 'fx_source', 'fx_date', 'buyer_premium_included',
    'tax_included', 'shipping_included', 'quantity', 'condition_grade',
    'authenticity_state', 'provenance_ref', 'region', 'sale_mechanism'
  ],
  prohibitedPriceInferences: [
    'HIGH_PRICE_TO_DEMAND', 'HIGH_PRICE_TO_SCARCITY',
    'ESTIMATE_TO_REALIZED_PRICE', 'ASK_TO_REALIZED_PRICE'
  ],
  rightsActions: ['collect', 'store', 'transform', 'display', 'redistribute', 'sell'],
  rightsMetadata: ['terms_url', 'terms_version', 'review_due_at'],
  freshnessFields: [
    'event_at', 'observed_at', 'collected_at', 'source_updated_at',
    'window_start', 'window_end', 'ttl_seconds', 'watermark_at',
    'next_due_at', 'stale_reason'
  ],
  freshnessStates: ['CURRENT', 'STALE', 'EXPIRED', 'NOT_VERIFIED'],
  missingReasons: [
    'NOT_OBSERVED', 'NOT_APPLICABLE', 'NOT_COLLECTED_BY_DESIGN',
    'SOURCE_UNAVAILABLE', 'ACCESS_DENIED', 'RIGHTS_RESTRICTED',
    'PARSE_FAILED', 'STALE_REJECTED', 'CONFLICT_QUARANTINED'
  ],
  pilotScopes: [
    'mechanical_watches', 'fine_jewelry', 'seating', 'lighting',
    'collector_cars', 'sneakers', 'trading_cards'
  ],
  adapterTerminalStates: [
    'SELF_COLLECTABLE_OPEN', 'SELF_COLLECTABLE_CREDENTIAL_REQUIRED',
    'RIGHTS_LIMITED', 'EXTERNAL_CAPABILITY_CANDIDATE', 'NO_DEFENSIBLE_PATH_FOUND'
  ],
  truthGuards: [
    'EVIDENCE_BEFORE_METRICS', 'MISSING_NE_ZERO', 'ATTENTION_NE_DEMAND_NE_TRANSACTION',
    'LISTING_NE_SOLD_TRANSACTION', 'BID_ASK_NE_TRANSACTION',
    'MAKER_ORIGIN_NE_REGIONAL_DEMAND',
    'PUBLIC_REPRESENTATION_NE_REGIONAL_MARKET_SIGNIFICANCE',
    'SCARCITY_NE_ILLIQUIDITY', 'PROVIDER_NE_TRUTH', 'NO_FALSE_COMPARABILITY'
  ],
  negativeControls: [
    'LISTING_TO_SOLD_REJECTED', 'BID_ASK_TO_TRANSACTION_REJECTED',
    'ATTENTION_TO_DEMAND_REJECTED', 'WITHDRAWN_TO_FAILED_SALE_REJECTED',
    'MISSING_TO_ZERO_REJECTED', 'RIGHTS_UNKNOWN_REJECTED',
    'STALE_CURRENT_STATE_REJECTED', 'CROSS_OBJECT_TIME_TO_SALE_REJECTED',
    'SCOPE_CONTEXT_TO_PRODUCT_SCORE_REJECTED', 'UNDISCLOSED_ACCEPTED_OFFER_REJECTED',
    'COVERAGE_NUMERATOR_EXCEEDS_DENOMINATOR_REJECTED',
    'INCOMPLETE_REALIZED_PRICE_NORMALIZATION_REJECTED',
    'RIGHTS_FIELD_BINDING_UNKNOWN_PATH_REJECTED',
    'CURRENT_WITH_NULL_SOURCE_UPDATED_AT_REJECTED'
  ]
};

const expectedMetrics = {
  DEMAND: {
    required_inputs: ['VERIFIED_SOLD_EVENT', 'EXPOSURE_DENOMINATOR', 'REGION', 'CHANNEL', 'WINDOW'],
    prohibited_substitutes: ['ATTENTION', 'VENUE_PRESENCE', 'ACTIVE_LISTING']
  },
  OBSERVED_MARKET_ACTIVITY: {
    required_inputs: ['EVIDENCE_CLASS_SPECIFIC_EVENTS', 'WINDOW', 'SOURCE_LINEAGE'],
    prohibited_substitutes: ['INSTITUTIONAL_PRESENCE']
  },
  LIQUIDITY: {
    required_inputs: [
      'TRANSACTION_FREQUENCY', 'TEMPORAL_PERSISTENCE', 'SELL_THROUGH',
      'FAILED_SALE_RATE', 'TIME_TO_SALE', 'TRADABLE_AVAILABILITY_COVERAGE'
    ],
    prohibited_substitutes: ['MANY_LISTINGS', 'ONE_SALE', 'BID_ASK_SIGNAL']
  },
  PRICE: {
    required_inputs: [
      'IDENTITY_NORMALIZED_REALIZED_PRICE', 'CONDITION_GRADE', 'N',
      'DISPERSION', 'CONFIDENCE_INTERVAL', 'RECENCY'
    ],
    prohibited_substitutes: ['ASK', 'ESTIMATE', 'UNDISCLOSED_ACCEPTED_OFFER']
  },
  SCARCITY: {
    required_inputs: [
      'PRODUCTION_OR_EDITION_SIZE', 'CERTIFICATION_POPULATION', 'DOCUMENTED_SURVIVAL',
      'GRADE_VARIANT_POPULATION', 'TRADABLE_FLOAT', 'OBSERVED_AVAILABILITY'
    ],
    prohibited_substitutes: ['FEW_LISTINGS', 'HIGH_PRICE', 'MISSING_DATA']
  }
};

const expectedStandards = {
  ISO_IEC_5259_2_2024: {
    role: 'DATA_QUALITY_MEASURES_DESIGN_REFERENCE',
    url: 'https://www.iso.org/standard/81860.html'
  },
  ISO_IEC_25012_2008: {
    role: 'DATA_QUALITY_MODEL_DESIGN_REFERENCE',
    url: 'https://www.iso.org/standard/35736.html'
  },
  W3C_PROV_DM_2013_RECOMMENDATION: {
    role: 'PROVENANCE_DESIGN_REFERENCE_NOT_FULL_PROV_IMPLEMENTATION',
    url: 'https://www.w3.org/TR/prov-dm/'
  },
  NIST_AI_RMF_1_0_2023: {
    role: 'VOLUNTARY_RISK_MANAGEMENT_DESIGN_REFERENCE',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework'
  }
};

function exactSetErrors(actual, required, code) {
  if (!Array.isArray(actual)) return [`${code}_NOT_ARRAY`];
  const errors = [];
  if (new Set(actual).size !== actual.length) errors.push(`${code}_NOT_UNIQUE`);
  const actualSet = new Set(actual);
  const requiredSet = new Set(required);
  if (actual.length !== required.length
    || required.some(value => !actualSet.has(value))
    || actual.some(value => !requiredSet.has(value))) {
    errors.push(`${code}_MISMATCH`);
  }
  return errors;
}

function exactValueErrors(actual, required, code) {
  return actual === required ? [] : [code];
}

function isValidHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function contractSemanticErrors(candidate, authority) {
  const errors = [];
  const addSet = (actual, required, code) => errors.push(...exactSetErrors(actual, required, code));
  const addValue = (actual, required, code) => errors.push(...exactValueErrors(actual, required, code));

  addValue(candidate.id, 'kidults-global-standard-poc-hardening-contract-v1', 'CONTRACT_ID_MISMATCH');
  addValue(candidate.version, '1.0.0', 'CONTRACT_VERSION_MISMATCH');
  addValue(candidate.issue, 457, 'CONTRACT_ISSUE_MISMATCH');
  addValue(candidate.status, 'TRACK_A_PRE_CANDIDATE_HARDENING_PROPOSAL', 'STATUS_NOT_HONEST_PRE_CANDIDATE');
  if (!String(candidate.purpose || '').includes('not yet established')) errors.push('PURPOSE_OVERSTATES_IMPLEMENTATION');
  if (hasOwn(candidate, 'standards_alignment')) errors.push('LEGACY_STANDARDS_ALIGNMENT_CLAIM_PROHIBITED');

  const standards = candidate.standards_position || {};
  addValue(standards.type, 'DESIGN_REFERENCE_ONLY', 'STANDARDS_POSTURE_NOT_REFERENCE_ONLY');
  addValue(standards.conformance_claimed, false, 'STANDARDS_CONFORMANCE_MUST_NOT_BE_CLAIMED');
  addValue(standards.certification_claimed, false, 'STANDARDS_CERTIFICATION_MUST_NOT_BE_CLAIMED');
  addValue(standards.crosswalk_status, 'PENDING', 'STANDARDS_CROSSWALK_MUST_REMAIN_PENDING');
  const standardRows = Array.isArray(standards.references) ? standards.references : [];
  addSet(standardRows.map(row => row?.id), Object.keys(expectedStandards), 'STANDARDS_REFERENCES');
  for (const row of standardRows) {
    const reference = expectedStandards[row?.id];
    if (!reference) continue;
    if (row.role !== reference.role) errors.push(`STANDARDS_ROLE_MISMATCH_${row.id}`);
    if (row.url !== reference.url || !isValidHttpsUrl(row.url)) errors.push(`STANDARDS_URL_MISMATCH_${row.id}`);
  }

  const validationScope = candidate.validation_scope || {};
  const expectedValidationScope = {
    json_schema_2020_12_compilation: 'NOT_IMPLEMENTED',
    schema_structure_preflight: 'IMPLEMENTED',
    synthetic_semantic_negative_controls: 'IMPLEMENTED',
    runtime_event_admission: 'PENDING_BOUNDED_R2',
    field_level_rights_enforcement: 'PENDING_BOUNDED_R2',
    production_enforcement: 'NOT_AUTHORIZED'
  };
  addSet(Object.keys(validationScope), Object.keys(expectedValidationScope), 'VALIDATION_SCOPE_FIELDS');
  for (const [key, value] of Object.entries(expectedValidationScope)) {
    addValue(validationScope[key], value, `VALIDATION_SCOPE_MISMATCH_${key}`);
  }

  addValue(candidate.analysis_unit?.id, 'market_cell_id', 'ANALYSIS_UNIT_ID_MISMATCH');
  addSet(candidate.analysis_unit?.required_dimensions, expected.analysisDimensions, 'ANALYSIS_DIMENSIONS');
  addValue(candidate.analysis_unit?.guard, 'SCOPE_LEVEL_CONTEXT_MUST_NOT_BECOME_PRODUCT_LEVEL_MARKET_SCORE', 'ANALYSIS_UNIT_GUARD_MISMATCH');
  addSet(candidate.identity_hierarchy, expected.identityHierarchy, 'IDENTITY_HIERARCHY');

  addValue(candidate.event_lifecycle?.schema, schemaPath, 'EVENT_SCHEMA_BINDING_MISMATCH');
  addSet(candidate.event_lifecycle?.evidence_classes, expected.evidenceClasses, 'EVIDENCE_CLASSES');
  addSet(candidate.event_lifecycle?.terminal_states, expected.terminalStates, 'TERMINAL_STATES');
  addSet(candidate.event_lifecycle?.failed_sale_admissible_states, expected.failedSaleStates, 'FAILED_SALE_STATES');
  addSet(candidate.event_lifecycle?.not_automatically_failed_sale, expected.notAutomaticallyFailedSale, 'NOT_AUTOMATIC_FAILED_SALE_STATES');
  addValue(candidate.event_lifecycle?.time_to_sale_rule, 'REQUIRES_SAME_PHYSICAL_OBJECT_AND_VALID_LISTING_START_AND_VERIFIED_TERMINAL_SALE', 'TIME_TO_SALE_RULE_MISMATCH');

  addSet(candidate.price_semantics?.price_types, expected.priceTypes, 'PRICE_TYPES');
  addSet(candidate.price_semantics?.required_normalization_fields, expected.normalizationFields, 'PRICE_NORMALIZATION_FIELDS');
  addValue(candidate.price_semantics?.valuation_rule, 'OBSERVED_PRICE_AND_FAIR_VALUE_ARE_SEPARATE_ENTITIES', 'PRICE_VALUATION_RULE_MISMATCH');
  addSet(candidate.price_semantics?.prohibited_inference, expected.prohibitedPriceInferences, 'PRICE_PROHIBITED_INFERENCES');

  addValue(candidate.rights_admission?.granularity, 'FIELD_X_EVIDENCE_CLASS_X_OUTPUT', 'RIGHTS_GRANULARITY_MISMATCH');
  addValue(candidate.rights_admission?.enforcement_state, 'PROPOSED_SCHEMA_BINDINGS_RUNTIME_ADMISSION_PENDING', 'RIGHTS_ENFORCEMENT_STATE_OVERSTATED');
  addSet(candidate.rights_admission?.required_actions, expected.rightsActions, 'RIGHTS_ACTIONS');
  addSet(candidate.rights_admission?.required_metadata, expected.rightsMetadata, 'RIGHTS_METADATA');
  addValue(candidate.rights_admission?.unknown_state, 'FAIL_CLOSED', 'RIGHTS_UNKNOWN_NOT_FAIL_CLOSED');
  addValue(candidate.rights_admission?.reference_only_rule, 'MAY_SUPPORT_INTERNAL_CITATION_CONTEXT_BUT_NOT_COMMERCIAL_DATA_REUSE', 'REFERENCE_ONLY_RULE_MISMATCH');

  addSet(candidate.freshness_admission?.required_fields, expected.freshnessFields, 'FRESHNESS_FIELDS');
  addSet(candidate.freshness_admission?.states, expected.freshnessStates, 'FRESHNESS_STATES');
  addValue(candidate.freshness_admission?.stale_policy, 'STALE_OR_EXPIRED_RECORDS_CANNOT_SUPPORT_CURRENT_MARKET_STATE', 'FRESHNESS_POLICY_MISMATCH');

  addValue(candidate.missingness?.value_rule, 'UNOBSERVED_VALUES_REMAIN_NULL_NEVER_ZERO', 'MISSINGNESS_VALUE_RULE_MISMATCH');
  addSet(candidate.missingness?.reason_codes, expected.missingReasons, 'MISSINGNESS_REASONS');
  addValue(candidate.missingness?.observed_zero_rule, 'ALLOWED_ONLY_WITH_COMPLETE_OBSERVATION_WINDOW_AND_DENOMINATOR', 'OBSERVED_ZERO_RULE_MISMATCH');
  addValue(candidate.missingness?.coverage_rule, 'COVERAGE_NUMERATOR_MUST_NOT_EXCEED_COVERAGE_DENOMINATOR', 'MISSINGNESS_COVERAGE_RULE_MISMATCH');
  addValue(candidate.missingness?.imputation_policy, 'NONE', 'IMPUTATION_POLICY_MISMATCH');

  const metrics = Array.isArray(candidate.metric_registry) ? candidate.metric_registry : [];
  addSet(metrics.map(row => row?.metric), Object.keys(expectedMetrics), 'METRIC_REGISTRY');
  for (const row of metrics) {
    const metric = expectedMetrics[row?.metric];
    if (!metric) continue;
    addSet(row.required_inputs, metric.required_inputs, `${row.metric}_REQUIRED_INPUTS`);
    addSet(row.prohibited_substitutes, metric.prohibited_substitutes, `${row.metric}_PROHIBITED_SUBSTITUTES`);
  }

  addSet(candidate.bounded_candidate_r2?.pilot_scopes, expected.pilotScopes, 'PILOT_SCOPES');
  addValue(candidate.bounded_candidate_r2?.products_per_scope, 2, 'PRODUCTS_PER_SCOPE_MISMATCH');
  addValue(candidate.bounded_candidate_r2?.cross_scope_ranking_allowed, false, 'CROSS_SCOPE_RANKING_MUST_BE_BLOCKED');
  addValue(candidate.bounded_candidate_r2?.within_cell_components_only, true, 'WITHIN_CELL_COMPONENTS_ONLY_REQUIRED');
  addSet(candidate.bounded_candidate_r2?.adapter_terminal_states, expected.adapterTerminalStates, 'ADAPTER_TERMINAL_STATES');

  const gate = candidate.track_b_exit_gate || {};
  addValue(gate.owner, 'TRACK_B', 'TRACK_B_OWNER_MISMATCH');
  addValue(gate.status, 'INHERITED_REFERENCE_ONLY', 'TRACK_B_GATE_NOT_REFERENCE_ONLY');
  addValue(gate.track_a_mutation_allowed, false, 'TRACK_A_MUST_NOT_MUTATE_TRACK_B_GATE');
  if (!nonEmptyString(gate.authority_ref) || path.isAbsolute(gate.authority_ref) || gate.authority_ref.split('/').includes('..')) {
    errors.push('TRACK_B_AUTHORITY_REF_INVALID');
  }
  addSet(gate.exact_input_pair, ['snapshot-candidate.json', 'Evidence Package'], 'TRACK_B_EXACT_INPUT_PAIR');
  addValue(gate.projected_field_rights_coverage, 1, 'TRACK_B_RIGHTS_COVERAGE_MISMATCH');
  addValue(gate.stale_rejection_rate, 1, 'TRACK_B_STALE_REJECTION_MISMATCH');
  addValue(gate.golden_dataset_minimum_records, 200, 'TRACK_B_GOLDEN_DATASET_FLOOR_MISMATCH');
  addValue(gate.identity_precision_minimum, 0.99, 'TRACK_B_IDENTITY_PRECISION_MISMATCH');
  addValue(gate.critical_false_auto_merge_maximum, 0, 'TRACK_B_FALSE_AUTO_MERGE_MAXIMUM_MISMATCH');
  addValue(gate.independent_source_families_minimum, 4, 'TRACK_B_SOURCE_FAMILY_FLOOR_MISMATCH');
  addValue(gate.unresolved_critical_contradictions_maximum, 0, 'TRACK_B_CONTRADICTION_MAXIMUM_MISMATCH');
  addValue(gate.source_removal_rule, 'CORE_CONCLUSION_MUST_NOT_COLLAPSE_AFTER_ONE_FAMILY_REMOVAL', 'TRACK_B_SOURCE_REMOVAL_RULE_MISMATCH');
  addValue(gate.rank_uncertainty_rule, 'STRICT_RANK_ONLY_WHEN_SCORE_GAP_EXCEEDS_UNCERTAINTY_OTHERWISE_TIE_BAND_OR_NOT_RANKABLE', 'TRACK_B_RANK_UNCERTAINTY_RULE_MISMATCH');

  if (!authority
    || authority.record_type !== 'rankability_assessment'
    || authority.created_by !== 'Track B'
    || !String(authority.assessor || '').startsWith('Track B')
    || authority.status !== 'COMPLETED_BLOCKED'
    || authority.recommendation !== 'BLOCKED'
    || authority.overall_rankability !== false
    || authority.publication_eligible !== false
    || authority.production_eligible !== false
    || authority.immutable !== true) {
    errors.push('TRACK_B_OWNER_AUTHORITY_INVALID');
  }

  addSet(candidate.negative_controls, expected.negativeControls, 'NEGATIVE_CONTROLS');
  addSet(candidate.truth_guards, expected.truthGuards, 'TRUTH_GUARDS');
  addValue(candidate.next_execution, 'BOUNDED_MARKET_INTELLIGENCE_CANDIDATE_R2', 'NEXT_EXECUTION_MISMATCH');
  addValue(candidate.track_b_input_eligible, false, 'TRACK_B_INPUT_MUST_REMAIN_INELIGIBLE');
  addValue(candidate.provider_contact, 'HOLD', 'PROVIDER_CONTACT_MUST_REMAIN_HOLD');
  addValue(candidate.production, 'HOLD', 'PRODUCTION_MUST_REMAIN_HOLD');
  addValue(candidate.full_320_expansion_allowed, false, 'FULL_320_EXPANSION_MUST_REMAIN_BLOCKED');
  return errors;
}

function schemaStructureErrors(candidateSchema) {
  const errors = [];
  const addSet = (actual, required, code) => errors.push(...exactSetErrors(actual, required, code));
  const addValue = (actual, required, code) => errors.push(...exactValueErrors(actual, required, code));
  const properties = candidateSchema.properties || {};
  const topRequired = [
    'schema_version', 'market_event_id', 'evidence_class', 'event_state', 'source_event_id',
    'market_cell_id', 'market_cell_dimensions', 'canonical_entity_id', 'physical_object_id',
    'region', 'venue_id', 'sale_mechanism', 'event_at', 'observed_at', 'collected_at',
    'source_updated_at', 'rights', 'freshness', 'lineage', 'price', 'quantity',
    'condition_grade', 'missingness'
  ];
  addValue(candidateSchema.$schema, 'https://json-schema.org/draft/2020-12/schema', 'SCHEMA_DIALECT_MISMATCH');
  addValue(candidateSchema.type, 'object', 'SCHEMA_TOP_TYPE_MISMATCH');
  addValue(candidateSchema.additionalProperties, false, 'SCHEMA_TOP_MUST_REJECT_UNKNOWN_FIELDS');
  addSet(candidateSchema.required, topRequired, 'SCHEMA_TOP_REQUIRED');
  addValue(properties.schema_version?.const, 'market-event-v1', 'SCHEMA_VERSION_CONST_MISMATCH');
  addSet(properties.evidence_class?.enum, expected.evidenceClasses, 'SCHEMA_EVIDENCE_CLASSES');
  addSet(properties.event_state?.enum, ['ACTIVE', ...expected.terminalStates], 'SCHEMA_EVENT_STATES');
  addSet(properties.sale_mechanism?.enum, ['AUCTION', 'FIXED_PRICE', 'NEGOTIATED', 'DEALER', 'EXCHANGE', 'UNKNOWN'], 'SCHEMA_SALE_MECHANISMS');
  addSet(properties.market_cell_dimensions?.required, expected.analysisDimensions, 'SCHEMA_MARKET_CELL_DIMENSIONS');
  addValue(properties.market_cell_dimensions?.additionalProperties, false, 'SCHEMA_MARKET_CELL_UNKNOWN_FIELDS');
  addSet(properties.condition_grade?.required, ['condition_state', 'grade', 'grader', 'authenticity_state'], 'SCHEMA_CONDITION_REQUIRED');
  addSet(properties.condition_grade?.properties?.authenticity_state?.enum, ['VERIFIED', 'ASSERTED', 'DISPUTED', 'UNKNOWN', 'NOT_APPLICABLE'], 'SCHEMA_AUTHENTICITY_STATES');
  addSet(properties.price?.required, ['price_type', 'amount', 'currency', 'buyer_premium_included', 'tax_included', 'shipping_included', 'fx_source', 'fx_date', 'accepted_offer_disclosure'], 'SCHEMA_PRICE_REQUIRED');
  addSet(properties.price?.properties?.price_type?.enum, expected.priceTypes, 'SCHEMA_PRICE_TYPES');
  addSet(properties.rights?.required, [...expected.rightsActions, ...expected.rightsMetadata, 'field_bindings'], 'SCHEMA_RIGHTS_REQUIRED');
  addValue(properties.rights?.properties?.field_bindings?.minItems, 1, 'SCHEMA_RIGHTS_FIELD_BINDINGS_MINIMUM_MISSING');
  for (const action of expected.rightsActions) {
    addSet(properties.rights?.properties?.[action]?.enum, ['ALLOW', 'DENY', 'UNKNOWN'], `SCHEMA_RIGHTS_${action}`);
  }
  addSet(properties.freshness?.required, ['state', 'ttl_seconds', 'window_start', 'window_end', 'watermark_at', 'next_due_at', 'stale_reason'], 'SCHEMA_FRESHNESS_REQUIRED');
  addSet(properties.freshness?.properties?.state?.enum, expected.freshnessStates, 'SCHEMA_FRESHNESS_STATES');
  addSet(properties.lineage?.required, ['evidence_id', 'source_family_id', 'raw_digest', 'normalized_digest', 'parser_version', 'transform_version'], 'SCHEMA_LINEAGE_REQUIRED');
  addValue(properties.lineage?.properties?.raw_digest?.pattern, sha256Pattern, 'SCHEMA_RAW_DIGEST_PATTERN_MISMATCH');
  addValue(properties.lineage?.properties?.normalized_digest?.pattern, sha256Pattern, 'SCHEMA_NORMALIZED_DIGEST_PATTERN_MISMATCH');
  addSet(properties.missingness?.required, ['reason', 'coverage_numerator', 'coverage_denominator', 'imputation_policy', 'field_states'], 'SCHEMA_MISSINGNESS_REQUIRED');
  addValue(properties.missingness?.properties?.field_states?.minItems, 1, 'SCHEMA_MISSINGNESS_FIELD_STATES_MINIMUM_MISSING');
  addSet(properties.missingness?.properties?.reason?.enum, ['NONE', ...expected.missingReasons], 'SCHEMA_MISSINGNESS_REASONS');
  addValue(properties.missingness?.properties?.imputation_policy?.const, 'NONE', 'SCHEMA_IMPUTATION_POLICY_MISMATCH');

  const conditionals = Array.isArray(candidateSchema.allOf) ? candidateSchema.allOf : [];
  const listingBidGuard = conditionals.find(rule => {
    const classes = rule?.if?.properties?.evidence_class?.enum;
    return Array.isArray(classes) && classes.includes('ACTIVE_LISTING') && classes.includes('BID_ASK_SIGNAL');
  });
  addSet(listingBidGuard?.if?.properties?.evidence_class?.enum, ['ACTIVE_LISTING', 'BID_ASK_SIGNAL'], 'SCHEMA_LISTING_BID_GUARD_CLASSES');
  addValue(listingBidGuard?.then?.not?.properties?.event_state?.const, 'SOLD', 'SCHEMA_LISTING_BID_SOLD_GUARD_MISSING');

  const currentFreshnessGuard = conditionals.find(
    rule => rule?.if?.properties?.freshness?.properties?.state?.const === 'CURRENT'
  );
  addValue(currentFreshnessGuard?.then?.properties?.source_updated_at?.type, 'string', 'SCHEMA_CURRENT_SOURCE_UPDATED_NON_NULL_GUARD_MISSING');

  const conditionalFor = evidenceClass => conditionals.find(
    rule => rule?.if?.properties?.evidence_class?.const === evidenceClass
  );
  const soldRule = conditionalFor('VERIFIED_SOLD_EVENT');
  addValue(soldRule?.then?.properties?.event_state?.const, 'SOLD', 'SCHEMA_VERIFIED_SOLD_STATE_MISSING');
  addSet(soldRule?.then?.properties?.price?.properties?.price_type?.enum, ['HAMMER', 'ALL_IN_REALIZED', 'ACCEPTED_OFFER'], 'SCHEMA_REALIZED_PRICE_TYPES');
  addValue(soldRule?.then?.properties?.price?.properties?.amount?.exclusiveMinimum, 0, 'SCHEMA_REALIZED_AMOUNT_RULE_MISSING');
  addValue(soldRule?.then?.properties?.price?.properties?.currency?.pattern, '^[A-Z]{3}$', 'SCHEMA_REALIZED_CURRENCY_RULE_MISSING');

  const failedRule = conditionalFor('FAILED_SALE_EVENT');
  addSet(failedRule?.then?.properties?.event_state?.enum, expected.failedSaleStates, 'SCHEMA_FAILED_SALE_STATES');
  addSet(failedRule?.then?.required, ['terminal_at'], 'SCHEMA_FAILED_SALE_REQUIRED');

  const timeToSaleRule = conditionalFor('TIME_TO_SALE');
  addSet(timeToSaleRule?.then?.required, ['source_listing_id', 'terminal_at', 'physical_object_id', 'listing_start', 'linked_sale_event_id', 'duration_seconds'], 'SCHEMA_TIME_TO_SALE_REQUIRED');
  addValue(timeToSaleRule?.then?.properties?.event_state?.const, 'SOLD', 'SCHEMA_TIME_TO_SALE_SOLD_STATE_MISSING');
  addValue(timeToSaleRule?.then?.properties?.source_listing_id?.type, 'string', 'SCHEMA_TIME_TO_SALE_LISTING_NON_NULL_MISSING');
  addValue(timeToSaleRule?.then?.properties?.physical_object_id?.type, 'string', 'SCHEMA_TIME_TO_SALE_OBJECT_NON_NULL_MISSING');

  const acceptedOfferRule = conditionals.find(
    rule => rule?.if?.properties?.evidence_class?.const === 'VERIFIED_SOLD_EVENT'
      && rule?.if?.properties?.price?.properties?.price_type?.const === 'ACCEPTED_OFFER'
  );
  addValue(acceptedOfferRule?.then?.properties?.price?.properties?.accepted_offer_disclosure?.const, 'DISCLOSED', 'SCHEMA_ACCEPTED_OFFER_DISCLOSURE_GUARD_MISSING');
  return errors;
}

function requiredObjectErrors(value, required, allowed, code) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${code}_NOT_OBJECT`];
  for (const key of required) {
    if (!hasOwn(value, key)) errors.push(`${code}_MISSING_${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${code}_UNKNOWN_${key}`);
  }
  return errors;
}

function syntheticStructureErrors(event) {
  const errors = [];
  const schemaProperties = Object.keys(schema.properties || {});
  errors.push(...requiredObjectErrors(event, schema.required || [], schemaProperties, 'EVENT'));
  errors.push(...requiredObjectErrors(event.market_cell_dimensions, schema.properties?.market_cell_dimensions?.required || [], Object.keys(schema.properties?.market_cell_dimensions?.properties || {}), 'MARKET_CELL'));
  errors.push(...requiredObjectErrors(event.market_cell_dimensions?.observation_window, ['window_start', 'window_end', 'timezone'], ['window_start', 'window_end', 'timezone'], 'OBSERVATION_WINDOW'));
  errors.push(...requiredObjectErrors(event.condition_grade, schema.properties?.condition_grade?.required || [], Object.keys(schema.properties?.condition_grade?.properties || {}), 'CONDITION_GRADE'));
  errors.push(...requiredObjectErrors(event.price, schema.properties?.price?.required || [], Object.keys(schema.properties?.price?.properties || {}), 'PRICE'));
  errors.push(...requiredObjectErrors(event.rights, schema.properties?.rights?.required || [], Object.keys(schema.properties?.rights?.properties || {}), 'RIGHTS'));
  errors.push(...requiredObjectErrors(event.freshness, schema.properties?.freshness?.required || [], Object.keys(schema.properties?.freshness?.properties || {}), 'FRESHNESS'));
  errors.push(...requiredObjectErrors(event.lineage, schema.properties?.lineage?.required || [], Object.keys(schema.properties?.lineage?.properties || {}), 'LINEAGE'));
  errors.push(...requiredObjectErrors(event.missingness, schema.properties?.missingness?.required || [], Object.keys(schema.properties?.missingness?.properties || {}), 'MISSINGNESS'));
  if (event.schema_version !== 'market-event-v1') errors.push('EVENT_SCHEMA_VERSION_MISMATCH');
  if (!expected.evidenceClasses.includes(event.evidence_class)) errors.push('EVENT_EVIDENCE_CLASS_INVALID');
  if (!['ACTIVE', ...expected.terminalStates].includes(event.event_state)) errors.push('EVENT_STATE_INVALID');
  if (!expected.priceTypes.includes(event.price?.price_type)) errors.push('EVENT_PRICE_TYPE_INVALID');
  if (!/^[A-Z]{3}$/.test(event.price?.currency || '')) errors.push('EVENT_CURRENCY_INVALID');
  if (!new RegExp(sha256Pattern).test(event.lineage?.raw_digest || '')) errors.push('EVENT_RAW_DIGEST_INVALID');
  if (!new RegExp(sha256Pattern).test(event.lineage?.normalized_digest || '')) errors.push('EVENT_NORMALIZED_DIGEST_INVALID');
  if (event.missingness?.imputation_policy !== 'NONE') errors.push('EVENT_IMPUTATION_POLICY_INVALID');
  return errors;
}

function pointerValue(document, pointer) {
  if (!nonEmptyString(pointer) || !pointer.startsWith('/')) return undefined;
  return pointer
    .slice(1)
    .split('/')
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((value, key) => value?.[key], document);
}

function admissionErrors(event) {
  const errors = [];
  const rights = event.rights || {};
  const freshness = event.freshness || {};
  const price = event.price || {};
  const dimensions = event.market_cell_dimensions || {};
  const fieldBindings = Array.isArray(rights.field_bindings) ? rights.field_bindings : [];
  const fieldStates = Array.isArray(event.missingness?.field_states) ? event.missingness.field_states : [];

  if (!event.market_cell_id) errors.push('MARKET_CELL_REQUIRED');
  if (!event.canonical_entity_id) errors.push('CANONICAL_ENTITY_REQUIRED');
  if (dimensions.canonical_product_or_edition !== event.canonical_entity_id
    || dimensions.region !== event.region
    || dimensions.sale_mechanism !== event.sale_mechanism
    || dimensions.currency_basis !== price.currency) {
    errors.push('MARKET_CELL_DIMENSION_BINDING_MISMATCH');
  }
  if (expected.rightsActions.some(action => rights[action] !== 'ALLOW')
    || fieldBindings.length === 0
    || fieldBindings.some(binding => binding.admission_state !== 'ALLOW')
    || !nonEmptyString(rights.terms_url)
    || !nonEmptyString(rights.terms_version)
    || !nonEmptyString(rights.review_due_at)) {
    errors.push('RIGHTS_NOT_FULLY_ADMITTED');
  }
  if (fieldBindings.some(binding => pointerValue(event, binding.field_path) === undefined)) {
    errors.push('RIGHTS_FIELD_BINDING_INVALID');
  }
  if (freshness.state !== 'CURRENT'
    || !Number.isInteger(freshness.ttl_seconds)
    || freshness.ttl_seconds < 1
    || !isDateTime(freshness.window_start)
    || !isDateTime(freshness.window_end)
    || !isDateTime(freshness.watermark_at)
    || !isDateTime(freshness.next_due_at)
    || !isDateTime(event.source_updated_at)
    || freshness.stale_reason !== null) {
    errors.push('CURRENT_FRESHNESS_REQUIRED');
  }
  if (!Number.isInteger(event.missingness?.coverage_numerator)
    || !Number.isInteger(event.missingness?.coverage_denominator)
    || event.missingness.coverage_numerator < 0
    || event.missingness.coverage_denominator < 0
    || event.missingness.coverage_numerator > event.missingness.coverage_denominator) {
    errors.push('INVALID_COVERAGE_RATIO');
  }
  if (fieldStates.some(field => field.reason !== 'NONE' && pointerValue(event, field.field_path) !== null)) {
    errors.push('MISSING_TO_ZERO');
  }
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
    if (typeof price.buyer_premium_included !== 'boolean'
      || typeof price.tax_included !== 'boolean'
      || typeof price.shipping_included !== 'boolean'
      || !nonEmptyString(price.fx_source)
      || !isIsoDate(price.fx_date)
      || !(event.quantity > 0)
      || (!nonEmptyString(event.condition_grade?.condition_state) && !nonEmptyString(event.condition_grade?.grade))
      || !nonEmptyString(event.condition_grade?.authenticity_state)
      || !nonEmptyString(event.condition_grade?.provenance_ref)) {
      errors.push('REALIZED_PRICE_NORMALIZATION_INCOMPLETE');
    }
    if (price.price_type === 'ACCEPTED_OFFER' && price.accepted_offer_disclosure !== 'DISCLOSED') {
      errors.push('UNDISCLOSED_ACCEPTED_OFFER');
    }
  }
  if (event.evidence_class === 'FAILED_SALE_EVENT'
    && !expected.failedSaleStates.includes(event.event_state)) {
    errors.push('FAILED_SALE_STATE_NOT_ADMISSIBLE');
  }
  if (event.evidence_class === 'TIME_TO_SALE') {
    const listingStart = event.listing_start;
    if (!event.physical_object_id
      || !event.source_listing_id
      || !event.terminal_at
      || !event.linked_sale_event_id
      || !Number.isInteger(event.duration_seconds)
      || !listingStart?.event_id
      || !listingStart?.listed_at) {
      errors.push('LINKED_TIME_TO_SALE_EVENTS_REQUIRED');
    }
    if (listingStart?.physical_object_id !== event.physical_object_id) {
      errors.push('CROSS_OBJECT_TIME_TO_SALE');
    }
  }
  return errors;
}

let authority = null;
const authorityRef = contract.track_b_exit_gate?.authority_ref;
if (nonEmptyString(authorityRef)
  && !path.isAbsolute(authorityRef)
  && !authorityRef.split('/').includes('..')) {
  try {
    authority = JSON.parse(fs.readFileSync(authorityRef, 'utf8'));
  } catch (error) {
    failures.push(`TRACK_B_AUTHORITY_UNREADABLE: ${error.message}`);
  }
}

failures.push(...contractSemanticErrors(contract, authority));
failures.push(...schemaStructureErrors(schema));

const allowedRights = Object.fromEntries(expected.rightsActions.map(action => [action, 'ALLOW']));
const syntheticEvent = {
  schema_version: 'market-event-v1',
  market_event_id: 'synthetic-market-event-001',
  evidence_class: 'VERIFIED_SOLD_EVENT',
  event_state: 'SOLD',
  source_event_id: 'synthetic-source-event-001',
  market_cell_id: 'synthetic-market-cell-001',
  market_cell_dimensions: {
    canonical_product_or_edition: 'synthetic-entity-001',
    variant: 'synthetic-variant-001',
    condition_or_grade: 'GRADE_9',
    region: 'US',
    channel: 'SYNTHETIC_AUCTION',
    sale_mechanism: 'AUCTION',
    currency_basis: 'USD',
    observation_window: {
      window_start: '2026-08-01T00:00:00Z',
      window_end: '2026-08-18T00:00:00Z',
      timezone: 'UTC'
    }
  },
  canonical_entity_id: 'synthetic-entity-001',
  physical_object_id: 'synthetic-object-001',
  region: 'US',
  venue_id: 'synthetic-venue-001',
  sale_mechanism: 'AUCTION',
  event_at: '2026-08-17T12:00:00Z',
  observed_at: '2026-08-17T12:05:00Z',
  collected_at: '2026-08-17T12:06:00Z',
  source_updated_at: '2026-08-17T12:01:00Z',
  rights: {
    ...allowedRights,
    terms_url: 'https://example.test/terms/v1',
    terms_version: 'v1',
    review_due_at: '2026-09-17T00:00:00Z',
    field_bindings: [
      { field_path: '/price/amount', output_class: 'INTERNAL_ANALYSIS', admission_state: 'ALLOW' },
      { field_path: '/price/currency', output_class: 'INTERNAL_ANALYSIS', admission_state: 'ALLOW' }
    ]
  },
  freshness: {
    state: 'CURRENT',
    ttl_seconds: 86400,
    window_start: '2026-08-01T00:00:00Z',
    window_end: '2026-08-18T00:00:00Z',
    watermark_at: '2026-08-17T12:06:00Z',
    next_due_at: '2026-08-18T12:06:00Z',
    stale_reason: null
  },
  lineage: {
    evidence_id: 'synthetic-evidence-001',
    source_family_id: 'synthetic-source-family-001',
    raw_digest: `sha256:${'0'.repeat(64)}`,
    normalized_digest: `sha256:${'1'.repeat(64)}`,
    parser_version: 'synthetic-parser-v1',
    transform_version: 'synthetic-transform-v1'
  },
  price: {
    price_type: 'HAMMER',
    amount: 100,
    currency: 'USD',
    buyer_premium_included: false,
    tax_included: false,
    shipping_included: false,
    fx_source: 'NOT_APPLICABLE_USD_BASIS',
    fx_date: '2026-08-17',
    accepted_offer_disclosure: 'NOT_APPLICABLE'
  },
  quantity: 1,
  condition_grade: {
    condition_state: 'SYNTHETIC_TEST_ONLY',
    grade: '9',
    grader: 'SYNTHETIC_GRADER',
    authenticity_state: 'VERIFIED',
    provenance_ref: 'synthetic-provenance-001'
  },
  missingness: {
    reason: 'NONE',
    coverage_numerator: 2,
    coverage_denominator: 2,
    imputation_policy: 'NONE',
    field_states: [
      { field_path: '/price/amount', reason: 'NONE' },
      { field_path: '/price/currency', reason: 'NONE' }
    ]
  }
};

const syntheticStructureFailures = syntheticStructureErrors(syntheticEvent);
const syntheticAdmissionFailures = admissionErrors(syntheticEvent);
if (syntheticStructureFailures.length) {
  failures.push(...syntheticStructureFailures.map(error => `SYNTHETIC_STRUCTURE_${error}`));
}
if (syntheticAdmissionFailures.length) {
  failures.push(...syntheticAdmissionFailures.map(error => `SYNTHETIC_ADMISSION_${error}`));
}

const eventNegativeControls = [
  {
    name: 'LISTING_TO_SOLD_REJECTED',
    expectedError: 'LISTING_TO_SOLD_SUBSTITUTION',
    mutate(event) {
      event.evidence_class = 'ACTIVE_LISTING';
      event.event_state = 'SOLD';
    }
  },
  {
    name: 'BID_ASK_TO_TRANSACTION_REJECTED',
    expectedError: 'BID_ASK_TO_TRANSACTION_SUBSTITUTION',
    mutate(event) {
      event.evidence_class = 'BID_ASK_SIGNAL';
      event.event_state = 'SOLD';
    }
  },
  {
    name: 'WITHDRAWN_TO_FAILED_SALE_REJECTED',
    expectedError: 'FAILED_SALE_STATE_NOT_ADMISSIBLE',
    mutate(event) {
      event.evidence_class = 'FAILED_SALE_EVENT';
      event.event_state = 'WITHDRAWN';
      event.terminal_at = '2026-08-17T12:00:00Z';
    }
  },
  {
    name: 'MISSING_TO_ZERO_REJECTED',
    expectedError: 'MISSING_TO_ZERO',
    mutate(event) {
      event.price.amount = 0;
      event.missingness.reason = 'NOT_OBSERVED';
      event.missingness.field_states = [{ field_path: '/price/amount', reason: 'NOT_OBSERVED' }];
    }
  },
  {
    name: 'RIGHTS_UNKNOWN_REJECTED',
    expectedError: 'RIGHTS_NOT_FULLY_ADMITTED',
    mutate(event) {
      event.rights.display = 'UNKNOWN';
    }
  },
  {
    name: 'STALE_CURRENT_STATE_REJECTED',
    expectedError: 'CURRENT_FRESHNESS_REQUIRED',
    mutate(event) {
      event.freshness.state = 'STALE';
      event.freshness.stale_reason = 'SYNTHETIC_STALE_TEST';
    }
  },
  {
    name: 'CROSS_OBJECT_TIME_TO_SALE_REJECTED',
    expectedError: 'CROSS_OBJECT_TIME_TO_SALE',
    mutate(event) {
      event.evidence_class = 'TIME_TO_SALE';
      event.event_state = 'SOLD';
      event.source_listing_id = 'synthetic-listing-001';
      event.terminal_at = '2026-08-17T12:00:00Z';
      event.listing_start = {
        event_id: 'synthetic-listing-start-001',
        physical_object_id: 'different-object-999',
        listed_at: '2026-08-01T00:00:00Z'
      };
      event.linked_sale_event_id = 'synthetic-sale-event-001';
      event.duration_seconds = 1425600;
    }
  },
  {
    name: 'UNDISCLOSED_ACCEPTED_OFFER_REJECTED',
    expectedError: 'UNDISCLOSED_ACCEPTED_OFFER',
    mutate(event) {
      event.price.price_type = 'ACCEPTED_OFFER';
      event.price.accepted_offer_disclosure = 'UNDISCLOSED';
    }
  },
  {
    name: 'COVERAGE_NUMERATOR_EXCEEDS_DENOMINATOR_REJECTED',
    expectedError: 'INVALID_COVERAGE_RATIO',
    mutate(event) {
      event.missingness.coverage_numerator = 3;
      event.missingness.coverage_denominator = 2;
    }
  },
  {
    name: 'INCOMPLETE_REALIZED_PRICE_NORMALIZATION_REJECTED',
    expectedError: 'REALIZED_PRICE_NORMALIZATION_INCOMPLETE',
    mutate(event) {
      event.price.buyer_premium_included = null;
    }
  },
  {
    name: 'RIGHTS_FIELD_BINDING_UNKNOWN_PATH_REJECTED',
    expectedError: 'RIGHTS_FIELD_BINDING_INVALID',
    mutate(event) {
      event.rights.field_bindings[0].field_path = '/unknown/path';
    }
  },
  {
    name: 'CURRENT_WITH_NULL_SOURCE_UPDATED_AT_REJECTED',
    expectedError: 'CURRENT_FRESHNESS_REQUIRED',
    mutate(event) {
      event.source_updated_at = null;
    }
  }
];

for (const control of eventNegativeControls) {
  const candidate = clone(syntheticEvent);
  control.mutate(candidate);
  const unknownFields = Object.keys(candidate).filter(key => !hasOwn(schema.properties, key));
  if (unknownFields.length) failures.push(`negative control uses non-schema fields: ${control.name}`);
  if (!admissionErrors(candidate).includes(control.expectedError)) {
    failures.push(`negative control did not reject ${control.name}`);
  }
}

const contractNegativeControls = [
  {
    name: 'ATTENTION_TO_DEMAND_REJECTED',
    expectedError: 'DEMAND_PROHIBITED_SUBSTITUTES_MISMATCH',
    mutate(candidate) {
      const demand = candidate.metric_registry.find(row => row.metric === 'DEMAND');
      demand.prohibited_substitutes = demand.prohibited_substitutes.filter(value => value !== 'ATTENTION');
    }
  },
  {
    name: 'SCOPE_CONTEXT_TO_PRODUCT_SCORE_REJECTED',
    expectedError: 'ANALYSIS_UNIT_GUARD_MISMATCH',
    mutate(candidate) {
      candidate.analysis_unit.guard = 'SCOPE_CONTEXT_MAY_BECOME_PRODUCT_SCORE';
    }
  }
];

failures.push(...exactSetErrors(
  [...eventNegativeControls, ...contractNegativeControls].map(control => control.name),
  expected.negativeControls,
  'IMPLEMENTED_NEGATIVE_CONTROLS'
));

for (const control of contractNegativeControls) {
  const candidate = clone(contract);
  control.mutate(candidate);
  if (!contractSemanticErrors(candidate, authority).includes(control.expectedError)) {
    failures.push(`negative control did not reject ${control.name}`);
  }
}

if (failures.length) {
  console.error('Global-standard PoC hardening validation: FAIL');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  validation_mode: 'STRUCTURE_AND_SYNTHETIC_PREFLIGHT_NO_JSON_SCHEMA_COMPILATION',
  contract_status: contract.status,
  standards_position: contract.standards_position.type,
  standards_conformance_claimed: contract.standards_position.conformance_claimed,
  track_b_owner: contract.track_b_exit_gate.owner,
  track_b_authority: contract.track_b_exit_gate.authority_ref,
  track_b_input_eligible: contract.track_b_input_eligible,
  market_event_schema: schema.title,
  schema_required_fields: schema.required.length,
  analysis_unit: contract.analysis_unit.id,
  analysis_dimensions: contract.analysis_unit.required_dimensions.length,
  pilot_scopes: contract.bounded_candidate_r2.pilot_scopes.length,
  metrics_separated: contract.metric_registry.length,
  negative_controls: eventNegativeControls.length + contractNegativeControls.length,
  synthetic_structure_preflight: 'PASS',
  synthetic_semantic_preflight: 'PASS',
  provider_contact: contract.provider_contact,
  production: contract.production,
  full_320_expansion_allowed: contract.full_320_expansion_allowed
}, null, 2));
