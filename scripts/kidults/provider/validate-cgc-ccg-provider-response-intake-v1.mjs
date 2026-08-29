import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CGC_CCG_INTAKE_PATH = 'coordination/kidults/provider/cgc-ccg-provider-response-intake-v1.json';
const EXPECTED_UNRESOLVED = [
  'CERT_IDENTITY_GRADE_AND_POPULATION_COVERAGE',
  'ENTITY_RESOLUTION_MODEL_CALIBRATION_AND_HUMAN_QA_RIGHTS',
  'MEMBERSHIP_FEE_AMOUNT',
  'NUMERIC_RATE_LIMITS',
  'PRIVATE_STORAGE_NORMALIZATION_RIGHTS',
  'RETENTION_DELETION_AND_POST_TERMINATION_DERIVED_RIGHTS',
  'SCHEMA_SAMPLE_AND_DOCUMENTATION',
  'SLA_SUPPORT_AND_MINIMUM_COMMITMENT'
];
const clone = value => JSON.parse(JSON.stringify(value));
const sameMembers = (a = [], b = []) => a.length === b.length &&
  [...a].sort().every((value, index) => value === [...b].sort()[index]);

export function validateCgcCcgResponseIntake(x) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(x.id === 'kidults-cgc-ccg-provider-response-intake-v1', 'invalid intake id');
  require(x.provider_id === 'CGC_CCG' && x.product_id === 'CGC_DEALER_PORTAL_API', 'provider/product binding drift');
  require(x.governing_issue === 1220 && x.active_ticket === 1133459, 'issue/ticket binding drift');
  require(x.state === 'PARTIAL_RESPONSE_RECEIVED' && x.decision === 'NEEDS_CLARIFICATION', 'partial-response decision drift');
  const outbound = x.source_evidence?.latest_substantive_outbound ?? {};
  const response = x.source_evidence?.provider_response ?? {};
  require(outbound.evidence_ref === 'gmail:message:1a0348bf65698c4f', 'outbound evidence drift');
  require(outbound.rfc_message_id === '<CAPAjgK7GVRKZf7NH=ycUyUpGqHnKuohv_UJcJH69yGUS_nQnUQ@mail.gmail.com>', 'outbound RFC drift');
  require(outbound.sent_at === '2026-08-24T16:13:02Z', 'outbound timestamp drift');
  require(response.evidence_ref === 'gmail:message:1a0436674fda570e', 'provider response evidence required');
  require(response.rfc_message_id === '<YPL9GPYY7EK_6a903afe3ed7f_d2a71ac22b42f1_sprut@zendesk.com>', 'provider response RFC drift');
  require(response.received_at === '2026-08-27T13:26:22Z' && response.ticket === 1133459, 'provider response ticket/timestamp drift');
  require(Date.parse(response.received_at) > Date.parse(outbound.sent_at), 'response must post-date outbound');
  for (const field of [
    'api_included_with_authorized_dealer_membership_fee_and_agreement',
    'internal_data_validation_and_intelligence_use_can_qualify',
    'two_industry_references_mandatory',
    'provider_will_contact_submitted_references'
  ]) require(x.confirmed?.[field] === true, `confirmed fact drift: ${field}`);
  require(x.bounded_interpretation?.no_additional_requirement_stated_beyond_membership_fee === true, 'bounded commercial interpretation missing');
  for (const field of ['membership_fee_amount_known', 'numeric_rate_limit_known', 'unlimited_api_claim_allowed', 'dealer_approval_guarantees_api_activation']) {
    require(x.bounded_interpretation?.[field] === false, `unsafe interpretation: ${field}`);
  }
  require(sameMembers(x.unresolved, EXPECTED_UNRESOLVED), 'unresolved universe drift');
  require(x.prepared_next_request?.state === 'PREPARED_NOT_SENT' && x.prepared_next_request?.route_to === 'CGC_API_OR_DATA_OWNER', 'next request routing drift');
  require(x.prepared_next_request?.send_authorized === false, 'outbound request must not be pre-authorized');
  const receipt = x.execution_receipt ?? {};
  for (const field of ['application_submitted', 'references_submitted', 'reference_contact_observed', 'agreement_accepted', 'account_or_credential_created', 'data_acquired']) require(receipt[field] === false, `execution must remain false: ${field}`);
  require(receipt.provider_api_calls === 0 && receipt.external_spend_usd === 0, 'provider calls/spend must remain zero');
  const boundary = x.non_bypass ?? {};
  for (const field of ['application', 'references', 'data_acquisition', 'public', 'production']) require(boundary[field] === 'HOLD', `${field} boundary drift`);
  require(boundary.agreement === 'HOLD_EXPLICIT_APPROVAL_REQUIRED', 'agreement boundary drift');
  require(boundary.spend === 'HOLD_EXPLICIT_FOUNDER_APPROVAL_REQUIRED', 'spend boundary drift');
  require(boundary.credential === 'HOLD_EXPLICIT_APPROVAL_REQUIRED', 'credential boundary drift');
  require(boundary.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 boundary drift');
  return errors;
}

const mutations = [
  ['reject_missing_provider_evidence', x => { x.source_evidence.provider_response.evidence_ref = null; }],
  ['reject_full_response_claim', x => { x.state = 'COMPLETE_RESPONSE_RECEIVED'; }],
  ['reject_known_membership_fee', x => { x.bounded_interpretation.membership_fee_amount_known = true; }],
  ['reject_unlimited_api_claim', x => { x.bounded_interpretation.unlimited_api_claim_allowed = true; }],
  ['reject_missing_retention_unknown', x => { x.unresolved = x.unresolved.filter(v => !v.startsWith('RETENTION_')); }],
  ['reject_application_submission', x => { x.execution_receipt.application_submitted = true; }],
  ['reject_reference_submission', x => { x.execution_receipt.references_submitted = true; }],
  ['reject_unobserved_reference_contact_promotion', x => { x.execution_receipt.reference_contact_observed = true; }],
  ['reject_agreement_acceptance', x => { x.execution_receipt.agreement_accepted = true; }],
  ['reject_provider_call', x => { x.execution_receipt.provider_api_calls = 1; }],
  ['reject_spend', x => { x.execution_receipt.external_spend_usd = 1; }],
  ['reject_pre_authorized_send', x => { x.prepared_next_request.send_authorized = true; }],
  ['reject_production', x => { x.non_bypass.production = 'ALLOW'; }]
];

function run(pathname = CGC_CCG_INTAKE_PATH) {
  const artifact = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  const errors = validateCgcCcgResponseIntake(artifact);
  for (const [name, mutate] of mutations) {
    const mutated = clone(artifact);
    mutate(mutated);
    if (validateCgcCcgResponseIntake(mutated).length === 0) errors.push(`mutation escaped: ${name}`);
  }
  if (errors.length) {
    console.error(JSON.stringify({ suite: 'KIDULTS_CGC_CCG_PROVIDER_RESPONSE_INTAKE_V1', result: 'FAIL', errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    suite: 'KIDULTS_CGC_CCG_PROVIDER_RESPONSE_INTAKE_V1', result: 'PASS',
    response: artifact.state, decision: artifact.decision, mutations: mutations.length,
    application: 'HOLD', provider_calls: 0, spend_usd: 0,
    production: artifact.non_bypass.production, public: artifact.non_bypass.public, g5: artifact.non_bypass.g5
  }, null, 2));
}
const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) run(process.argv[2]);
