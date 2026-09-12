import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PREFLIGHT_PATH = 'coordination/kidults/market/alternate-current-sold-provider-preflight-v1.json';
const GATE_PATH = 'coordination/kidults/market/provider-rights-decision-gate-v1.json';
const EXPECTED_PROVIDERS = ['DISCOGS', 'CARDMARKET', 'EBAY_MARKETPLACE_INSIGHTS'];
const EXPECTED_GATE_PROVIDERS = ['CLASSIC.COM', 'ALT/FNDATA', ...EXPECTED_PROVIDERS];
const EXPECTED_PRODUCTS = {
  DISCOGS: 'DISCOGS_MARKETPLACE_SALES_HISTORY',
  CARDMARKET: 'CARDMARKET_SALES_DATA',
  EBAY_MARKETPLACE_INSIGHTS: 'EBAY_MARKETPLACE_INSIGHTS'
};
const EXPECTED_RANKING_BASIS = [
  'STRATEGIC_DOMAIN_FIT',
  'RIGHTS_AND_ACCESS_READINESS',
  'CURRENT_SOLD_PRODUCT_REALITY',
  'EVENT_SCHEMA_COMPLETENESS',
  'FRESHNESS_AND_COVERAGE',
  'INTEGRATION_AND_ECONOMICS'
];
const ASSESSMENT_STATES = ['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN', 'AMBIGUOUS', 'CONDITIONAL'];
const QUESTION_KEYS = [
  'product_access_and_provider_spec',
  'sold_event_semantics',
  'field_by_purpose_rights',
  'termination_and_derived_ip'
];
const QUESTION_IDS = [
  'Q1_PRODUCT_ACCESS_AND_PROVIDER_SPEC',
  'Q2_SOLD_EVENT_SEMANTICS',
  'Q3_FIELD_BY_PURPOSE_RIGHTS',
  'Q4_TERMINATION_AND_DERIVED_IP'
];
const ALLOWED_EVIDENCE_HOSTS = {
  DISCOGS: new Set(['support.discogs.com', 'www.discogs.com']),
  CARDMARKET: new Set(['help.cardmarket.com', 'www.cardmarket.com', 'apiv2.cardmarket.com']),
  EBAY_MARKETPLACE_INSIGHTS: new Set(['developer.ebay.com', 'www.ebay.com'])
};
const ZERO_RECEIPT_KEYS = [
  'provider_contacts',
  'applications_submitted',
  'accounts_created_or_terms_accepted',
  'credentials_created_or_used',
  'provider_network_calls',
  'external_spend_usd',
  'records_acquired',
  'adapters_created_or_enabled'
];
const FALSE_RECEIPT_KEYS = [
  'external_commitment_authorized',
  'contact_authorized',
  'data_acquisition_authorized',
  'adapter_development_authorized'
];
const PROHIBITED_KEYS = new Set([
  'access_token',
  'api_token',
  'authorization',
  'bearer_token',
  'cookie',
  'password',
  'secret',
  'credential_value',
  'raw_email_body',
  'raw_agreement_text',
  'raw_attachment_body',
  'contract_text',
  'license_text'
]);

const clone = value => JSON.parse(JSON.stringify(value));
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameSet = (left, right) => Array.isArray(left)
  && Array.isArray(right)
  && new Set(left).size === left.length
  && new Set(right).size === right.length
  && exact([...left].sort(), [...right].sort());
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const normalizeKey = key => String(key)
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const sha256 = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;

function scanForProhibitedMaterial(value, errors, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForProhibitedMaterial(entry, errors, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (PROHIBITED_KEYS.has(normalizeKey(key))) errors.push(`prohibited private or secret field ${location}.${key}`);
      scanForProhibitedMaterial(entry, errors, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (
    /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)
    || /\bauthorization\s*:/i.test(value)
    || /[?&](?:token|api[_-]?key|access[_-]?token|signature|sig)=/i.test(value)
  )) errors.push(`secret-like value prohibited at ${location}`);
}

export function deriveAlternateCurrentSoldDecision(provider) {
  const rights = Object.values(provider.rights_assessments || {});
  const events = Object.values(provider.event_field_assessments || {});
  const spec = provider.provider_spec_assessment || {};
  if (rights.some(entry => entry?.state === 'INCOMPATIBLE')
      || events.some(entry => entry?.state === 'INCOMPATIBLE')
      || spec.state === 'INCOMPATIBLE') return 'NO_GO';
  if (rights.length === 11
      && events.length === 5
      && rights.every(entry => entry?.state === 'COMPATIBLE')
      && events.every(entry => entry?.state === 'COMPATIBLE')
      && spec.state === 'COMPATIBLE') return 'PASS';
  return 'NEEDS_CLARIFICATION';
}

function validateEvidence(provider, errors) {
  const evidence = provider.official_evidence || [];
  const evidenceIds = evidence.map(entry => entry?.evidence_id);
  if (evidence.length < 3 || new Set(evidenceIds).size !== evidenceIds.length) {
    errors.push(`${provider.provider_id} official evidence must be unique and source-complete`);
  }
  for (const entry of evidence) {
    if (!nonempty(entry?.evidence_id) || !nonempty(entry?.supports)) {
      errors.push(`${provider.provider_id} official evidence metadata incomplete`);
    }
    if (entry?.observed_on !== '2026-08-28') errors.push(`${provider.provider_id} evidence observation date drift`);
    try {
      const parsed = new URL(entry?.url);
      if (parsed.protocol !== 'https:' || !ALLOWED_EVIDENCE_HOSTS[provider.provider_id]?.has(parsed.hostname)) {
        errors.push(`${provider.provider_id} evidence must use an allowed official host`);
      }
    } catch {
      errors.push(`${provider.provider_id} evidence URL invalid`);
    }
  }
  return new Set(evidenceIds);
}

function validateAssessmentMap(provider, label, map, expectedAxes, evidenceIds, errors) {
  if (!sameSet(Object.keys(map || {}), expectedAxes)) errors.push(`${provider.provider_id} ${label} axes must be exact`);
  for (const [axis, assessment] of Object.entries(map || {})) {
    if (!assessment || !ASSESSMENT_STATES.includes(assessment.state)) {
      errors.push(`${provider.provider_id} ${label}.${axis} assessment state invalid`);
      continue;
    }
    if (!nonempty(assessment.reason)) errors.push(`${provider.provider_id} ${label}.${axis} reason missing`);
    if (assessment.state === 'UNKNOWN') {
      if (assessment.evidence_ref !== null) errors.push(`${provider.provider_id} ${label}.${axis} UNKNOWN must not fabricate evidence`);
    } else if (!nonempty(assessment.evidence_ref) || !evidenceIds.has(assessment.evidence_ref)) {
      errors.push(`${provider.provider_id} ${label}.${axis} material state requires provider official evidence`);
    }
  }
}

function validateQuestions(provider, requiredDimensions, requiredEventFields, errors) {
  const questions = provider.required_written_clarifications || {};
  if (!exact(Object.keys(questions), QUESTION_KEYS)) errors.push(`${provider.provider_id} exact written-clarification groups required`);
  if (!exact(Object.values(questions).map(question => question?.question_id), QUESTION_IDS)) {
    errors.push(`${provider.provider_id} written-clarification question IDs drift`);
  }
  for (const question of Object.values(questions)) {
    if (question?.state !== 'PENDING_PROVIDER_SPECIFIC_ANSWER') {
      errors.push(`${provider.provider_id} clarification must remain pending: ${question?.question_id || 'UNKNOWN'}`);
    }
  }
  if (!exact(questions.sold_event_semantics?.required_event_fields, requiredEventFields)) {
    errors.push(`${provider.provider_id} Q2 event fields must bind gate exactly`);
  }
  if (!exact(questions.field_by_purpose_rights?.required_rights_dimensions, requiredDimensions)) {
    errors.push(`${provider.provider_id} Q3 rights dimensions must bind gate exactly`);
  }
  if (questions.product_access_and_provider_spec?.required_items?.length !== 4
      || questions.termination_and_derived_ip?.required_items?.length !== 4) {
    errors.push(`${provider.provider_id} Q1/Q4 composite requirements incomplete`);
  }
}

function validateProviderSpecificTruth(provider, errors) {
  const facts = provider.observed_product_facts || {};
  if (provider.provider_id === 'DISCOGS') {
    if (provider.strategic_fit_rank !== 1) errors.push('DISCOGS must remain rank 1');
    if (provider.product_reality_state !== 'PARTIAL_UI_ONLY_NO_SALES_HISTORY_ROWS_API') errors.push('DISCOGS product reality drift');
    if (provider.access_state !== 'SALES_HISTORY_DETAIL_REQUIRES_LOGIN_AND_CAPTCHA_PUBLIC_ROWS_API_NOT_DOCUMENTED') errors.push('DISCOGS access reality drift');
    if (provider.standard_terms_current_fit !== 'NO_GO_FOR_KIDULTS_COMMERCIAL_CURRENT_SOLD_UNDER_STANDARD_TERMS') errors.push('DISCOGS standard terms truth drift');
    if (facts.public_sales_history_rows_api !== 'NOT_DOCUMENTED') errors.push('DISCOGS undocumented sales-history rows API falsely promoted');
    if (facts.marketplace_stats_semantics !== 'CURRENT_LISTING_NOT_SOLD') errors.push('DISCOGS listing stats falsely promoted to SOLD');
    if (facts.price_suggestions_semantics !== 'DERIVED_SUGGESTION_NOT_TRANSACTION') errors.push('DISCOGS suggestion falsely promoted to transaction');
    if (facts.standard_terms_sales_history_classification !== 'RESTRICTED_MARKETPLACE_DATA'
        || facts.standard_terms_commercial_use !== 'PROHIBITED') errors.push('DISCOGS Restricted Data truth drift');
  } else if (provider.provider_id === 'CARDMARKET') {
    if (provider.strategic_fit_rank !== 2) errors.push('CARDMARKET must remain rank 2');
    if (provider.product_reality_state !== 'PARTIAL_PUBLIC_AGGREGATES_ONLY_NO_MARKETWIDE_TRANSACTION_ROWS') errors.push('CARDMARKET product reality drift');
    if (provider.access_state !== 'NEW_API_APPLICATIONS_NOT_ACCEPTED_EXISTING_USER_ACCESS_ONLY') errors.push('CARDMARKET access reality drift');
    if (provider.standard_terms_current_fit !== 'NO_TRANSACTION_LEVEL_PRODUCT_AND_NO_NEW_API_ACCESS') errors.push('CARDMARKET standard terms truth drift');
    if (facts.new_api_applications !== 'NOT_ACCEPTED') errors.push('CARDMARKET new access falsely promoted');
    if (facts.public_price_semantics !== 'AGGREGATED_PRICE_GUIDE_NOT_TRANSACTION_ROWS') errors.push('CARDMARKET price guide falsely promoted to transaction rows');
    if (facts.own_order_scope !== 'AUTHENTICATED_USERS_OWN_BUYER_OR_SELLER_ORDERS_ONLY') errors.push('CARDMARKET own-order scope falsely widened');
  } else if (provider.provider_id === 'EBAY_MARKETPLACE_INSIGHTS') {
    if (provider.strategic_fit_rank !== 3) errors.push('EBAY_MARKETPLACE_INSIGHTS must remain rank 3');
    if (provider.product_reality_state !== 'SOLD_HISTORY_API_EXISTS_RESTRICTED_NEW_USER_SCHEMA_UNAVAILABLE') errors.push('eBay product reality drift');
    if (provider.access_state !== 'RESTRICTED_NOT_OPEN_TO_NEW_USERS') errors.push('eBay restricted access falsely promoted');
    if (provider.standard_terms_current_fit !== 'NO_NEW_MARKETPLACE_INSIGHTS_ACCESS_AND_WRITTEN_CONSENT_REQUIRED') errors.push('eBay standard terms truth drift');
    if (facts.marketplace_insights_purpose !== 'SALES_HISTORY_OF_SOLD_ITEMS'
        || facts.new_user_access !== 'RESTRICTED_NOT_OPEN') errors.push('eBay Marketplace Insights product or access truth drift');
    if (facts.product_research_surface !== 'HUMAN_UI_ONLY_NOT_PROGRAMMATIC_FEED') errors.push('eBay Product Research falsely promoted to feed');
    if (facts.browse_api_semantics !== 'ACTIVE_PURCHASABLE_ITEMS_NOT_SOLD_HISTORY') errors.push('eBay Browse API falsely promoted to sold history');
  }
}

export function validateAlternateCurrentSoldProviderPreflightBundle(bundle) {
  const { preflight, gate } = bundle;
  const errors = [];
  scanForProhibitedMaterial(preflight, errors);

  if (preflight.id !== 'kidults-alternate-current-sold-provider-preflight-v1') errors.push('invalid alternate Current-SOLD preflight id');
  if (preflight.version !== '1.0.0') errors.push('invalid alternate Current-SOLD preflight version');
  if (preflight.status !== 'VERIFIED_FAIL_CLOSED_NEEDS_CLARIFICATION') errors.push('preflight status drift');
  if (preflight.parent_issue !== 769 || preflight.track_z_issue !== 1166) errors.push('issue binding drift');
  if (preflight.as_of !== '2026-08-28') errors.push('preflight observation date drift');
  if (preflight.decision_law_ref !== GATE_PATH) errors.push('provider decision law reference drift');
  if (!exact(preflight.provider_order, EXPECTED_PROVIDERS)) errors.push('alternate Current-SOLD provider order must remain exact');
  if (!exact(preflight.ranking_basis, EXPECTED_RANKING_BASIS)) errors.push('provider ranking basis drift');
  if (!sameSet(preflight.assessment_states, ASSESSMENT_STATES)) errors.push('assessment state enum drift');
  if (!exact(preflight.required_dimensions, gate.required_dimensions || [])) errors.push('11 rights dimensions must bind provider gate exactly');
  if (!exact(preflight.required_event_fields, gate.required_event_fields || [])) errors.push('5 event fields must bind provider gate exactly');

  const providers = preflight.providers || [];
  if (!exact(providers.map(provider => provider.provider_id), EXPECTED_PROVIDERS)) errors.push('alternate provider records must be exact and ordered');
  if (!exact(providers.map(provider => provider.strategic_fit_rank), [1, 2, 3])) errors.push('strategic fit ranking must be exact and contiguous');
  for (const provider of providers) {
    if (provider.product_id !== EXPECTED_PRODUCTS[provider.provider_id]) errors.push(`${provider.provider_id} product binding drift`);
    if (!nonempty(provider.provider_name) || !Array.isArray(provider.scope_fit) || provider.scope_fit.length === 0) errors.push(`${provider.provider_id} provider identity or scope missing`);
    if (provider.separate_license_path_state !== 'UNCONFIRMED_NOT_REJECTED') errors.push(`${provider.provider_id} separate license path prematurely closed or promoted`);
    const evidenceIds = validateEvidence(provider, errors);
    validateAssessmentMap(provider, 'rights', provider.rights_assessments, preflight.required_dimensions || [], evidenceIds, errors);
    validateAssessmentMap(provider, 'events', provider.event_field_assessments, preflight.required_event_fields || [], evidenceIds, errors);
    const spec = provider.provider_spec_assessment || {};
    if (!ASSESSMENT_STATES.includes(spec.state) || !nonempty(spec.reason)) errors.push(`${provider.provider_id} provider-spec assessment invalid`);
    if (spec.state === 'UNKNOWN' && spec.evidence_ref !== null) errors.push(`${provider.provider_id} UNKNOWN provider spec must not fabricate evidence`);
    if (spec.state !== 'UNKNOWN' && (!nonempty(spec.evidence_ref) || !evidenceIds.has(spec.evidence_ref))) errors.push(`${provider.provider_id} provider spec evidence invalid`);
    if (Object.values(provider.rights_assessments || {}).some(entry => entry?.state === 'COMPATIBLE')
        || Object.values(provider.event_field_assessments || {}).some(entry => entry?.state === 'COMPATIBLE')
        || spec.state === 'COMPATIBLE') errors.push(`${provider.provider_id} current evidence cannot claim COMPATIBLE axes`);
    validateQuestions(provider, preflight.required_dimensions || [], preflight.required_event_fields || [], errors);
    validateProviderSpecificTruth(provider, errors);

    const derived = deriveAlternateCurrentSoldDecision(provider);
    if (provider.recorded_decision !== derived || provider.recorded_decision !== 'NEEDS_CLARIFICATION') {
      errors.push(`${provider.provider_id} must remain NEEDS_CLARIFICATION on current evidence`);
    }
    if (provider.activation !== 'DISABLED' || provider.qualifies_as_complete_current_sold_feed !== false) {
      errors.push(`${provider.provider_id} activation or completeness falsely promoted`);
    }
    if (provider.operating_admission !== 'HOLD_RIGHTS_ACCESS_PRODUCT_SPEC_AND_APPROVAL_PENDING') {
      errors.push(`${provider.provider_id} operating admission must remain HOLD`);
    }

    const gateState = gate.current_provider_state?.[provider.provider_id];
    if (!gateState || gateState.preflight_ref !== PREFLIGHT_PATH) errors.push(`${provider.provider_id} provider gate preflight binding missing`);
    if (gateState?.decision !== provider.recorded_decision || gateState?.activation !== 'DISABLED') errors.push(`${provider.provider_id} provider gate decision or activation drift`);
  }

  if (gate.version !== '1.3.0') errors.push('provider rights gate must be version 1.3.0');
  if (!exact(gate.providers, EXPECTED_GATE_PROVIDERS)) errors.push('provider rights gate provider universe drift');

  const portfolio = preflight.portfolio_truth || {};
  if (portfolio.rights_clear_current_sold_provider_count !== 0
      || portfolio.complete_current_sold_provider_count !== 0
      || portfolio.current_sold_transaction_events_created !== 0) errors.push('Current-SOLD zero-count truth falsely promoted');
  if (portfolio.current_sold_gap !== 'OPEN'
      || portfolio.fail_closed_output !== 'UNAVAILABLE_NO_RIGHTS_CLEAR_CURRENT_SOLD_FEED') errors.push('Current-SOLD open-gap fail-closed output drift');

  const receipt = preflight.execution_receipt || {};
  if (!sameSet(Object.keys(receipt), [...ZERO_RECEIPT_KEYS, ...FALSE_RECEIPT_KEYS])) errors.push('execution receipt field universe drift');
  for (const key of ZERO_RECEIPT_KEYS) if (receipt[key] !== 0) errors.push(`${key} must remain zero`);
  for (const key of FALSE_RECEIPT_KEYS) if (receipt[key] !== false) errors.push(`${key} must remain false`);

  const promotion = preflight.promotion_boundary || {};
  if (promotion.candidate_evidence !== 'NOT_ADMITTED' || promotion.current_sold_transaction !== 'NOT_ADMITTED') errors.push('candidate or Current-SOLD evidence falsely admitted');
  if (promotion.track_b !== 'HOLD' || promotion.public_intelligence !== 'HOLD' || promotion.production !== 'HOLD') errors.push('Track B, Public, or Production boundary drift');
  if (promotion.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('G5 approval boundary drift');

  const authority = preflight.authority_boundary || {};
  if (authority.provider_contact !== 'EXPLICIT_PROGRAM_OWNER_AUTHORIZATION_REQUIRED') errors.push('provider-contact authority drift');
  if (authority.account_or_terms_acceptance !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED'
      || authority.contract_or_schedule_acceptance !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED'
      || authority.credential_issuance_or_activation !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED'
      || authority.external_spend !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('account, contract, credential, or spend authority drift');
  if (authority.provider_network_access !== 'PROHIBITED_BEFORE_SEPARATE_APPROVAL_AND_RIGHTS_PASS'
      || authority.data_acquisition !== 'PROHIBITED_BEFORE_SEPARATE_APPROVAL_AND_RIGHTS_PASS') errors.push('network or acquisition authority drift');
  if (authority.production !== 'HOLD' || authority.public_release !== 'HOLD' || authority.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('release authority drift');
  if (!nonempty(preflight.truth_boundary)) errors.push('truth boundary missing');

  return errors;
}

function loadCurrentBundle() {
  return {
    preflight: JSON.parse(fs.readFileSync(PREFLIGHT_PATH, 'utf8')),
    gate: JSON.parse(fs.readFileSync(GATE_PATH, 'utf8'))
  };
}

function mutationTests(bundle) {
  return [
    ['reject_missing_provider', value => { value.preflight.providers.pop(); }],
    ['reject_provider_order_drift', value => { [value.preflight.providers[0], value.preflight.providers[1]] = [value.preflight.providers[1], value.preflight.providers[0]]; }],
    ['reject_missing_rights_axis', value => { delete value.preflight.providers[0].rights_assessments.query_collect; }],
    ['reject_missing_event_axis', value => { delete value.preflight.providers[0].event_field_assessments.sold_date; }],
    ['reject_false_compatible_axis', value => { value.preflight.providers[0].rights_assessments.query_collect.state = 'COMPATIBLE'; }],
    ['reject_non_unknown_without_evidence', value => { value.preflight.providers[1].event_field_assessments.sold_date.state = 'CONDITIONAL'; }],
    ['reject_false_pass', value => { value.preflight.providers[0].recorded_decision = 'PASS'; }],
    ['reject_provider_activation', value => { value.preflight.providers[0].activation = 'ENABLED'; }],
    ['reject_discogs_rows_api_promotion', value => { value.preflight.providers[0].observed_product_facts.public_sales_history_rows_api = 'DOCUMENTED'; }],
    ['reject_discogs_listing_to_sold', value => { value.preflight.providers[0].observed_product_facts.marketplace_stats_semantics = 'CURRENT_SOLD_TRANSACTION'; }],
    ['reject_cardmarket_aggregate_to_transaction', value => { value.preflight.providers[1].observed_product_facts.public_price_semantics = 'TRANSACTION_ROWS'; }],
    ['reject_cardmarket_open_access_claim', value => { value.preflight.providers[1].observed_product_facts.new_api_applications = 'OPEN'; }],
    ['reject_ebay_open_access_claim', value => { value.preflight.providers[2].observed_product_facts.new_user_access = 'OPEN'; }],
    ['reject_provider_contact', value => { value.preflight.execution_receipt.provider_contacts = 1; }],
    ['reject_application_submission', value => { value.preflight.execution_receipt.applications_submitted = 1; }],
    ['reject_account_or_terms_acceptance', value => { value.preflight.execution_receipt.accounts_created_or_terms_accepted = 1; }],
    ['reject_credential_use', value => { value.preflight.execution_receipt.credentials_created_or_used = 1; }],
    ['reject_provider_network_call', value => { value.preflight.execution_receipt.provider_network_calls = 1; }],
    ['reject_spend', value => { value.preflight.execution_receipt.external_spend_usd = 1; }],
    ['reject_record_acquisition', value => { value.preflight.execution_receipt.records_acquired = 1; }],
    ['reject_adapter_creation', value => { value.preflight.execution_receipt.adapters_created_or_enabled = 1; }],
    ['reject_rights_clear_count', value => { value.preflight.portfolio_truth.rights_clear_current_sold_provider_count = 1; }],
    ['reject_complete_feed_count', value => { value.preflight.portfolio_truth.complete_current_sold_provider_count = 1; }],
    ['reject_closed_gap', value => { value.preflight.portfolio_truth.current_sold_gap = 'CLOSED'; }],
    ['reject_candidate_admission', value => { value.preflight.promotion_boundary.candidate_evidence = 'ADMITTED'; }],
    ['reject_current_sold_admission', value => { value.preflight.promotion_boundary.current_sold_transaction = 'ADMITTED'; }],
    ['reject_track_b_promotion', value => { value.preflight.promotion_boundary.track_b = 'PASS'; }],
    ['reject_public_promotion', value => { value.preflight.promotion_boundary.public_intelligence = 'PASS'; }],
    ['reject_production_promotion', value => { value.preflight.promotion_boundary.production = 'PASS'; }],
    ['reject_g5_promotion', value => { value.preflight.promotion_boundary.g5 = 'PASS'; }],
    ['reject_contact_authorization', value => { value.preflight.execution_receipt.contact_authorized = true; }],
    ['reject_adapter_authorization', value => { value.preflight.execution_receipt.adapter_development_authorized = true; }],
    ['reject_gate_state_promotion', value => { value.gate.current_provider_state.DISCOGS.decision = 'PASS'; }],
    ['reject_missing_evidence_binding', value => { value.preflight.providers[0].rights_assessments.query_collect.evidence_ref = 'MISSING'; }],
    ['reject_nonofficial_evidence_host', value => { value.preflight.providers[0].official_evidence[0].url = 'https://example.com/not-official'; }],
    ['reject_missing_question_group', value => { delete value.preflight.providers[0].required_written_clarifications.termination_and_derived_ip; }],
    ['reject_gate_provider_universe_drift', value => { value.gate.providers.pop(); }],
    ['reject_account_authority_relaxation', value => { value.preflight.authority_boundary.account_or_terms_acceptance = 'ALLOWED'; }]
  ].map(([name, mutate]) => ({ name, mutate }));
}

function decisionRegressionTests(provider) {
  const needs = clone(provider);
  const incompatibleRight = clone(provider);
  incompatibleRight.rights_assessments.query_collect.state = 'INCOMPATIBLE';
  const incompatibleEvent = clone(provider);
  incompatibleEvent.event_field_assessments.sold_date.state = 'INCOMPATIBLE';
  incompatibleEvent.event_field_assessments.sold_date.evidence_ref = incompatibleEvent.official_evidence[0].evidence_id;
  const compatible = clone(provider);
  const evidenceRef = compatible.official_evidence[0].evidence_id;
  for (const entry of Object.values(compatible.rights_assessments)) {
    entry.state = 'COMPATIBLE';
    entry.evidence_ref = evidenceRef;
  }
  for (const entry of Object.values(compatible.event_field_assessments)) {
    entry.state = 'COMPATIBLE';
    entry.evidence_ref = evidenceRef;
  }
  compatible.provider_spec_assessment.state = 'COMPATIBLE';
  compatible.provider_spec_assessment.evidence_ref = evidenceRef;
  const specConditional = clone(compatible);
  specConditional.provider_spec_assessment.state = 'CONDITIONAL';
  return [
    ['current_unknown_or_conditional_needs_clarification', deriveAlternateCurrentSoldDecision(needs), 'NEEDS_CLARIFICATION'],
    ['incompatible_right_no_go', deriveAlternateCurrentSoldDecision(incompatibleRight), 'NO_GO'],
    ['incompatible_event_no_go', deriveAlternateCurrentSoldDecision(incompatibleEvent), 'NO_GO'],
    ['all_axes_and_spec_compatible_pass', deriveAlternateCurrentSoldDecision(compatible), 'PASS'],
    ['conditional_spec_needs_clarification', deriveAlternateCurrentSoldDecision(specConditional), 'NEEDS_CLARIFICATION']
  ];
}

export function runAlternateCurrentSoldProviderPreflightValidation() {
  const bundle = loadCurrentBundle();
  const errors = validateAlternateCurrentSoldProviderPreflightBundle(bundle);
  const mutations = mutationTests(bundle);
  for (const test of mutations) {
    const mutated = clone(bundle);
    test.mutate(mutated);
    if (validateAlternateCurrentSoldProviderPreflightBundle(mutated).length === 0) {
      errors.push(`mutation test did not fail: ${test.name}`);
    }
  }
  const decisionTests = decisionRegressionTests(bundle.preflight.providers[0]);
  for (const [name, actual, expected] of decisionTests) {
    if (actual !== expected) errors.push(`decision regression failed: ${name}:${actual}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    suite: 'KIDULTS_ALTERNATE_CURRENT_SOLD_PROVIDER_PREFLIGHT_V1',
    result: 'PASS',
    provider_order: bundle.preflight.provider_order,
    decisions: Object.fromEntries(bundle.preflight.providers.map(provider => [provider.provider_id, provider.recorded_decision])),
    rights_axes_per_provider: bundle.preflight.required_dimensions.length,
    event_axes_per_provider: bundle.preflight.required_event_fields.length,
    rights_clear_current_sold_providers: bundle.preflight.portfolio_truth.rights_clear_current_sold_provider_count,
    complete_current_sold_providers: bundle.preflight.portfolio_truth.complete_current_sold_provider_count,
    provider_contacts: bundle.preflight.execution_receipt.provider_contacts,
    provider_network_calls: bundle.preflight.execution_receipt.provider_network_calls,
    records_acquired: bundle.preflight.execution_receipt.records_acquired,
    mutation_tests: mutations.length,
    decision_regression_tests: decisionTests.length,
    preflight_sha256: sha256(bundle.preflight),
    activation: 'DISABLED',
    current_sold_gap: 'OPEN',
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED'
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    console.log(JSON.stringify(runAlternateCurrentSoldProviderPreflightValidation(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
