import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROVIDER_COMMUNICATION_EVIDENCE_PATH,
  validateProviderCommunicationEvidence
} from '../provider/validate-provider-communication-evidence-v1.mjs';

const INTAKE_PATH = 'coordination/kidults/market/classic-bundle3-provider-response-intake-v1.json';
const GATE_PATH = 'coordination/kidults/market/provider-rights-decision-gate-v1.json';
const ACTIVATION_PATH = 'coordination/kidults/market/classic-private-activation-contract-r1.json';
const PROVIDER_CONTRACT_PATH = 'coordination/kidults/source-intelligence/classiccom-licensed-private-market-activation-v1.json';
const LEDGER_PATH = 'coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json';

const ASSESSMENT_STATES = ['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN', 'AMBIGUOUS', 'CONDITIONAL'];
const RIGHTS_AXES = [
  'query_collect',
  'private_store',
  'internal_derive',
  'internal_review',
  'retention_1_to_30_days',
  'automation_rate_limits',
  'attribution',
  'public_derived_output_boundary',
  'onward_transfer',
  'deletion_termination',
  'entity_territory_scope'
];
const EVENT_AXES = [
  'stable_object_or_lot_identity',
  'sold_date',
  'realized_consideration',
  'currency',
  'venue_or_source_reference'
];
const QUESTION_IDS = [
  'Q1_PILOT_PRICE_AND_SCHEDULE',
  'Q2_OPERATING_LIMITS_AND_PROVIDER_SPEC',
  'Q3_SCHEMA_AND_SOLD_SEMANTICS',
  'Q4_RIGHTS_TERMINATION_AND_IP'
];
const COMMERCIAL_AXES = [
  'pilot_and_production_price',
  'query_rate_quota_limits',
  'sla_support_and_corrections',
  'coverage_history_and_freshness'
];
const QUESTION_PENDING = 'PENDING_PROVIDER_SPECIFIC_ANSWER';
const QUESTION_RESOLVED = 'RESOLVED_PROVIDER_SPECIFIC_ANSWER';
const CROSSWALK_PENDING = 'PENDING_PROVIDER_SPEC';
const CROSSWALK_RESOLVED = 'RESOLVED_PROVIDER_SPEC';
const LATEST_REQUEST_SCOPE = [
  'PROPOSED_SCHEDULE_OR_TERM_SHEET',
  'FIVE_UNIQUE_RECORD_FUNCTIONAL_CANARY',
  'THIRTY_TO_ONE_HUNDRED_TWENTY_UNIQUE_SOLD_RECORD_PRIVATE_PILOT',
  'OPTIONAL_ONE_HUNDRED_TWENTY_ONE_TO_FOUR_HUNDRED_FIFTY_NINE_CAPACITY_NO_COMMITMENT',
  'BUNDLE_SCHEMA_AND_REDACTED_SAMPLE',
  'PRICE_QUERY_LIMIT_HISTORY_FRESHNESS_AND_SUPPORT',
  'SOLD_STATUS_REALIZED_PRICE_AND_FEE_SEMANTICS',
  'FIELD_BY_PURPOSE_RIGHTS',
  'RAW_RETENTION_DELETION_AND_TERMINATION',
  'NON_RECONSTRUCTIVE_DERIVED_OUTPUT_RETENTION',
  'KIDULTS_PRE_EXISTING_AND_INDEPENDENT_IP_CARVE_OUT'
];
const REQUIRED_IP_CLARIFICATIONS = [
  'KIDULTS_PRE_EXISTING_AND_INDEPENDENT_ASI_ENTITY_RESOLUTION_NORMALIZATION_SCORING_AND_ANALYTICAL_METHODOLOGY_EXCLUDED',
  'NON_RECONSTRUCTIVE_DERIVED_OUTPUT_RETENTION_DURING_TERM',
  'NON_RECONSTRUCTIVE_DERIVED_OUTPUT_RETENTION_AFTER_TERMINATION',
  'RAW_DATA_RETENTION_DELETION_AND_TERMINATION'
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
const normalizeKey = key => String(key)
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();
const sameSet = (left, right) => Array.isArray(left)
  && Array.isArray(right)
  && new Set(left).size === left.length
  && new Set(right).size === right.length
  && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const isNonemptyString = value => typeof value === 'string' && value.trim().length > 0;
const parsedTime = value => typeof value === 'string' ? Date.parse(value) : Number.NaN;
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

function assessmentEntries(intake) {
  return [
    ...Object.entries(intake.rights_assessments || {}).map(([axis, value]) => [`rights.${axis}`, value]),
    ...Object.entries(intake.event_field_assessments || {}).map(([axis, value]) => [`event.${axis}`, value]),
    ['provider_spec', intake.provider_spec_assessment],
    ...Object.entries(intake.commercial_assessments || {}).map(([axis, value]) => [`commercial.${axis}`, value])
  ];
}

export function deriveClassicRightsDecision(intake, allowedProviderResponseRefs = new Set()) {
  const rightsByAxis = intake.rights_assessments || {};
  const eventsByAxis = intake.event_field_assessments || {};
  const commercialByAxis = intake.commercial_assessments || {};
  const questionsByTopic = intake.required_response || {};
  const crosswalkByAxis = intake.event_field_crosswalk || {};
  const rights = Object.values(rightsByAxis);
  const events = Object.values(eventsByAxis);
  const commercial = Object.values(commercialByAxis);
  const required = [...rights, ...events];
  const allAssessments = [...required, intake.provider_spec_assessment, ...commercial];
  const questions = Object.values(questionsByTopic);
  const crosswalk = Object.values(crosswalkByAxis);
  const observation = intake.response_observation || {};
  if (observation.provider_reply_after_latest_outbound !== true) return 'NEEDS_CLARIFICATION';
  const responseReceivedAt = parsedTime(observation.provider_origin_response_received_at);
  const outboundSentAt = parsedTime(intake.latest_outbound?.sent_at);
  const observedThrough = parsedTime(observation.observed_through);
  if (!isNonemptyString(observation.provider_origin_response_ref)
      || [responseReceivedAt, outboundSentAt, observedThrough].some(Number.isNaN)
      || responseReceivedAt <= outboundSentAt || responseReceivedAt > observedThrough) return 'NEEDS_CLARIFICATION';
  if (!(allowedProviderResponseRefs instanceof Set)
      || !allowedProviderResponseRefs.has(observation.provider_origin_response_ref)) return 'NEEDS_CLARIFICATION';
  if (!sameSet(Object.keys(rightsByAxis), RIGHTS_AXES) || !sameSet(Object.keys(eventsByAxis), EVENT_AXES)) return 'NEEDS_CLARIFICATION';
  if (allAssessments.some(entry => entry?.state !== 'UNKNOWN' && !isNonemptyString(entry?.evidence_ref))) return 'NEEDS_CLARIFICATION';
  if (required.some(entry => entry?.state === 'INCOMPATIBLE')) return 'NO_GO';
  if (intake.provider_spec_assessment?.state === 'INCOMPATIBLE') return 'NO_GO';
  if (required.some(entry => entry?.state !== 'COMPATIBLE')) return 'NEEDS_CLARIFICATION';
  if (intake.provider_spec_assessment?.state !== 'COMPATIBLE'
      || !isNonemptyString(intake.provider_spec_assessment?.evidence_ref)) return 'NEEDS_CLARIFICATION';
  if (!sameSet(Object.keys(commercialByAxis), COMMERCIAL_AXES)
      || commercial.some(entry => entry?.state !== 'COMPATIBLE' || !isNonemptyString(entry?.evidence_ref))) return 'NEEDS_CLARIFICATION';
  if (!sameSet(questions.map(question => question?.question_id), QUESTION_IDS)
      || questions.some(question => question?.state !== QUESTION_RESOLVED || !isNonemptyString(question?.evidence_ref))) return 'NEEDS_CLARIFICATION';
  if (!sameSet(Object.keys(crosswalkByAxis), Object.keys(eventsByAxis)) || crosswalk.some(entry => (
    entry?.state !== CROSSWALK_RESOLVED
    || !isNonemptyString(entry?.evidence_ref)
    || !Array.isArray(entry?.resolved_contract_fields)
    || entry.resolved_contract_fields.length === 0
    || new Set(entry.resolved_contract_fields).size !== entry.resolved_contract_fields.length
    || entry.resolved_contract_fields.some(field => !isNonemptyString(field))
    || !Array.isArray(entry?.candidate_contract_fields)
    || entry.resolved_contract_fields.some(field => !entry.candidate_contract_fields.includes(field))
  ))) return 'NEEDS_CLARIFICATION';
  return 'PASS';
}

export function validateClassicResponseIntakeBundle(bundle) {
  const { intake, gate, activation, providerContract, ledger, communicationEvidence } = bundle;
  const errors = [];
  scanForProhibitedMaterial(intake, errors);
  for (const error of validateProviderCommunicationEvidence(communicationEvidence)) errors.push(`communication evidence invalid: ${error}`);
  const allowedProviderResponseRefs = new Set((communicationEvidence?.events || [])
    .filter(event => event.provider_id === 'CLASSIC_COM' && event.direction === 'INBOUND_SUBSTANTIVE_RESPONSE')
    .map(event => event.evidence_ref));

  if (intake.id !== 'kidults-classic-bundle3-provider-response-intake-v1') errors.push('invalid intake id');
  if (intake.version !== '1.1.0') errors.push('invalid intake version');
  if (intake.parent_issue !== 769 || intake.provider !== 'CLASSIC.COM') errors.push('provider or parent binding drift');
  if (intake.product_id !== 'CLASSIC_COM_LICENSED_BUNDLE_3') errors.push('product binding drift');
  if (intake.scope !== 'CURRENT_SOLD_PRIVATE_EVALUATION') errors.push('scope drift');
  if (intake.current_state !== 'AWAITING_PROVIDER_RESPONSE') errors.push('false current state');
  if (intake.current_decision !== 'NEEDS_CLARIFICATION') errors.push('false current decision');
  if (intake.risk_state !== 'AMBER') errors.push('risk label drift');
  if (intake.vertical_fit !== 'CONFIRMED_FOR_COLLECTOR_CAR_SOLD_COMPS') errors.push('vertical fit drift');
  if (intake.commercial_fit !== 'COMMERCIAL_LICENSING_AVAILABLE_USE_CASE_DEPENDENT') errors.push('commercial-fit evidence ceiling drift');
  if (intake.rights_and_economics !== 'UNRESOLVED' || intake.activation !== 'DISABLED') errors.push('rights/economics or activation falsely advanced');

  const outbound = intake.latest_outbound || {};
  const previousOutbound = intake.previous_outbound || {};
  const observation = intake.response_observation || {};
  const priorReply = observation.latest_provider_reply_before_outbound || {};
  if (previousOutbound.sent_at !== '2026-08-26T15:58:33Z' || previousOutbound.evidence_ref !== 'gmail:message:1a03ecb6a6b5f290') errors.push('previous outbound evidence drift');
  if (previousOutbound.thread_ref !== 'gmail:thread:1a01d87e01b06ad4' || !/^<[^<>\s]+@mail\.gmail\.com>$/.test(previousOutbound.rfc_message_id || '')) errors.push('previous outbound thread or RFC Message-ID drift');
  if (!isNonemptyString(previousOutbound.issue_comment_ref)) errors.push('previous issue evidence reference missing');
  if (outbound.sent_at !== '2026-08-30T15:42:10Z') errors.push('latest outbound timestamp drift');
  if (outbound.evidence_ref !== 'gmail:message:1a05355da1037496') errors.push('latest outbound evidence drift');
  if (outbound.thread_ref !== 'gmail:thread:1a01d87e01b06ad4') errors.push('latest outbound thread drift');
  if (!/^<[^<>\s]+@mail\.gmail\.com>$/.test(outbound.rfc_message_id || '')) errors.push('latest outbound RFC Message-ID missing');
  if (outbound.communication_evidence_ref !== `${PROVIDER_COMMUNICATION_EVIDENCE_PATH}#classic-com-staged-pilot-followup-20260830`) errors.push('latest outbound communication evidence binding drift');
  const communicationEvent = (communicationEvidence?.events || []).find(event => event.event_id === 'classic-com-staged-pilot-followup-20260830');
  if (communicationEvent?.provider_id !== 'CLASSIC_COM' || communicationEvent?.evidence_ref !== outbound.evidence_ref || communicationEvent?.occurred_at !== outbound.sent_at) errors.push('latest outbound communication event reconciliation drift');
  if (!sameSet(outbound.request_scope, LATEST_REQUEST_SCOPE)) errors.push('latest outbound staged request scope drift');
  if (priorReply.received_at !== '2026-08-25T22:47:23Z' || priorReply.evidence_ref !== 'gmail:message:1a03b1b656abf1e0') errors.push('prior provider reply evidence drift');
  if (!/^<[^<>\s]+@mail\.gmail\.com>$/.test(priorReply.rfc_message_id || '')) errors.push('prior provider RFC Message-ID missing');
  if (!isNonemptyString(outbound.issue_ref)) errors.push('issue evidence reference missing');
  for (const key of ['external_commitment_authorized', 'signature_authorized', 'spend_authorized', 'credential_authorized', 'provider_network_call_authorized']) {
    if (outbound[key] !== false) errors.push(`${key} must remain false`);
  }
  if (observation.raw_email_body_retained !== false || observation.raw_agreement_or_attachment_retained !== false) errors.push('raw correspondence or agreement retention boundary weakened');

  const times = [
    parsedTime(priorReply.received_at),
    parsedTime(previousOutbound.sent_at),
    parsedTime(outbound.sent_at),
    parsedTime(observation.observed_through),
    parsedTime(intake.followup_policy?.response_requested_by)
  ];
  if (times.some(Number.isNaN) || times.some((value, index) => index > 0 && value <= times[index - 1])) errors.push('provider response/follow-up timestamp ordering invalid');
  if (String(observation.observed_through || '').slice(0, 10) !== intake.as_of) errors.push('as_of must match observation date');

  if (!Array.isArray(intake.assessment_states) || !sameSet(intake.assessment_states, ASSESSMENT_STATES)) errors.push('assessment state enum drift');
  if (!sameSet(gate.required_dimensions || [], RIGHTS_AXES)) errors.push('provider gate rights dimensions drift');
  if (!sameSet(gate.required_event_fields || [], EVENT_AXES)) errors.push('provider gate event fields drift');
  if (!sameSet(intake.required_event_fields, gate.required_event_fields || [])) errors.push('event field set must bind provider gate');
  if (!sameSet(intake.required_event_fields, activation.required_event_fields || [])) errors.push('event field set must bind activation contract');
  if (!sameSet(Object.keys(intake.rights_assessments || {}), gate.required_dimensions || [])) errors.push('rights assessment axes must be exact');
  if (!sameSet(Object.keys(intake.event_field_assessments || {}), gate.required_event_fields || [])) errors.push('event assessment axes must be exact');
  if (!sameSet(Object.keys(intake.commercial_assessments || {}), COMMERCIAL_AXES)) errors.push('commercial assessment axes must be exact');
  if (!sameSet(intake.required_response?.rights_and_termination?.required_rights_dimensions, gate.required_dimensions || [])) errors.push('Q4 rights axes must be exact');
  if (!sameSet(intake.required_response?.sold_event_semantics?.required_event_fields, gate.required_event_fields || [])) errors.push('Q3 event axes must be exact');
  if (!sameSet(intake.required_response?.rights_and_termination?.required_ip_clarifications, REQUIRED_IP_CLARIFICATIONS)) errors.push('Q4 IP and termination clarifications drift');

  const questions = Object.values(intake.required_response || {});
  const questionIds = questions.map(question => question?.question_id);
  if (questions.length !== 4 || !sameSet(questionIds, QUESTION_IDS)) errors.push('exact four composite questions required');
  for (const question of questions) {
    if (![QUESTION_PENDING, QUESTION_RESOLVED].includes(question?.state)) errors.push(`invalid question state: ${question?.question_id || 'UNKNOWN'}`);
    if (question?.state === QUESTION_PENDING && question.evidence_ref !== undefined && question.evidence_ref !== null) errors.push(`pending question must not cite answer evidence: ${question?.question_id || 'UNKNOWN'}`);
    if (question?.state === QUESTION_RESOLVED && !isNonemptyString(question?.evidence_ref)) errors.push(`resolved question evidence required: ${question?.question_id || 'UNKNOWN'}`);
    if (!Array.isArray(question?.required_items) && !Array.isArray(question?.required_rights_dimensions)) errors.push(`question requirements missing: ${question?.question_id || 'UNKNOWN'}`);
  }

  const crosswalk = intake.event_field_crosswalk || {};
  if (!sameSet(Object.keys(crosswalk), gate.required_event_fields || [])) errors.push('event-field crosswalk axes must be exact');
  const providerFields = new Set(providerContract.required_fields || []);
  for (const [axis, entry] of Object.entries(crosswalk)) {
    if (![CROSSWALK_PENDING, CROSSWALK_RESOLVED].includes(entry?.state)) errors.push(`invalid event crosswalk state: ${axis}`);
    if (!Array.isArray(entry?.candidate_contract_fields) || entry.candidate_contract_fields.length === 0) errors.push(`event crosswalk candidates missing: ${axis}`);
    for (const field of entry?.candidate_contract_fields || []) if (!providerFields.has(field)) errors.push(`crosswalk field not in provider contract: ${axis}.${field}`);
    if (entry?.state === CROSSWALK_PENDING) {
      if (entry.evidence_ref !== undefined && entry.evidence_ref !== null) errors.push(`pending event crosswalk must not cite evidence: ${axis}`);
      if (entry.resolved_contract_fields !== undefined && entry.resolved_contract_fields !== null) errors.push(`pending event crosswalk must not claim resolved fields: ${axis}`);
    }
    if (entry?.state === CROSSWALK_RESOLVED) {
      if (!isNonemptyString(entry?.evidence_ref)) errors.push(`resolved event crosswalk evidence required: ${axis}`);
      if (!Array.isArray(entry?.resolved_contract_fields) || entry.resolved_contract_fields.length === 0
          || new Set(entry.resolved_contract_fields).size !== entry.resolved_contract_fields.length) errors.push(`resolved event crosswalk fields required: ${axis}`);
      for (const field of entry?.resolved_contract_fields || []) {
        if (!providerFields.has(field) || !entry.candidate_contract_fields?.includes(field)) errors.push(`resolved crosswalk field not in provider contract candidates: ${axis}.${field}`);
      }
    }
  }

  for (const [axis, entry] of assessmentEntries(intake)) {
    if (!entry || !ASSESSMENT_STATES.includes(entry.state)) errors.push(`invalid assessment state: ${axis}`);
    if (entry?.state === 'UNKNOWN' && entry.evidence_ref !== null) errors.push(`unknown assessment must not cite fabricated evidence: ${axis}`);
    if (entry?.state !== 'UNKNOWN' && !isNonemptyString(entry?.evidence_ref)) errors.push(`material assessment evidence required: ${axis}`);
  }

  if (observation.provider_reply_after_latest_outbound === false) {
    if (observation.provider_origin_response_ref !== null || observation.provider_origin_response_received_at !== null) errors.push('no-reply state must not claim provider-origin evidence');
    if (assessmentEntries(intake).some(([, entry]) => entry?.state !== 'UNKNOWN')) errors.push('no-reply state cannot claim assessed provider answers');
    if (questions.some(question => question?.state !== QUESTION_PENDING)) errors.push('no-reply state cannot resolve provider questions');
    if (Object.values(crosswalk).some(entry => entry?.state !== CROSSWALK_PENDING)) errors.push('no-reply state cannot resolve event crosswalk');
  } else if (observation.provider_reply_after_latest_outbound === true) {
    if (!/^gmail:message:[a-f0-9]+$/.test(observation.provider_origin_response_ref || '')) errors.push('provider-origin response evidence required');
    const received = parsedTime(observation.provider_origin_response_received_at);
    if (Number.isNaN(received) || received <= parsedTime(outbound.sent_at) || received > parsedTime(observation.observed_through)) errors.push('provider-origin response timestamp invalid');
  } else errors.push('provider reply observation must be boolean');

  const derivedDecision = deriveClassicRightsDecision(intake, allowedProviderResponseRefs);
  if (intake.recorded_rights_decision !== derivedDecision) errors.push(`recorded rights decision mismatch: expected ${derivedDecision}`);
  if (gate.current_provider_state?.['CLASSIC.COM']?.decision !== derivedDecision) errors.push('gate decision must equal derived CLASSIC decision');
  if (intake.recorded_operating_admission !== 'HOLD_RIGHTS_SPEC_ECONOMICS_AND_APPROVAL_PENDING') errors.push('operating admission must remain HOLD on current evidence');

  const followup = intake.followup_policy || {};
  if (followup.status !== 'SENT_AWAITING_RESPONSE' || followup.sent_at !== outbound.sent_at || followup.evidence_ref !== outbound.evidence_ref || followup.same_thread_required !== true) errors.push('follow-up sent-state reconciliation drift');
  if (followup.previous_not_before !== '2026-08-31T16:00:00Z' || followup.dispatch_authority_evidence_state !== 'NOT_REPRESENTED_IN_REPOSITORY_FAIL_CLOSED_FOR_ANY_FURTHER_SEND') errors.push('follow-up audit boundary drift');
  if (followup.further_send_requires_live_no_reply_check !== true || followup.further_send_requires_explicit_owner_authorization !== true || followup.further_send_authorized !== false || followup.automatic_send_authorized !== false) errors.push('further follow-up send authority weakened');
  if (followup.no_response_transition !== 'DEFERRED_HOLD_NO_SUBSTANTIVE_RESPONSE' || followup.no_response_terminal_disposition !== false || followup.no_response_prioritize_alternate_current_sold_path !== true) errors.push('no-response transition must be non-terminal DEFER/HOLD');
  if (followup.explicit_incompatibility_transition !== 'NO_GO' || followup.material_complete_response_transition !== 'RUN_SOURCE_SPECIFIC_RIGHTS_DECISION_GATE') errors.push('provider-response transition law drift');
  if (intake.decision_inputs?.no_response_is_not_no_go !== true) errors.push('no-response cannot become NO_GO');

  const authority = intake.authority_boundary || {};
  if (authority.contract_or_schedule_acceptance !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('contract approval boundary drift');
  if (authority.external_spend !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('spend approval boundary drift');
  if (authority.credential_issuance_or_activation !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') errors.push('credential approval boundary drift');
  if (authority.provider_network_access !== 'PROHIBITED_BEFORE_SEPARATE_APPROVAL_AND_RIGHTS_PASS' || authority.data_acquisition !== 'PROHIBITED_BEFORE_SEPARATE_APPROVAL_AND_RIGHTS_PASS') errors.push('provider network or acquisition boundary drift');
  if (authority.production !== 'HOLD' || authority.public_release !== 'HOLD' || authority.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('release boundary drift');
  for (const effect of ['autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect']) if (!isNonemptyString(intake[effect])) errors.push(`${effect} required`);

  const gateClassic = gate.current_provider_state?.['CLASSIC.COM'] || {};
  if (gate.version !== '1.3.0') errors.push('provider gate version must be 1.3.0');
  if (gateClassic.latest_detailed_request !== 'FOLLOWUP_SENT_2026_08_30_AWAITING_RESPONSE') errors.push('provider gate latest request state drift');
  if (gateClassic.response_intake_ref !== INTAKE_PATH || gateClassic.activation !== 'DISABLED') errors.push('provider gate intake binding or activation drift');
  const ledgerClassic = (ledger.providers || []).find(provider => provider.provider_id === 'CLASSIC_COM');
  if (!ledgerClassic || ledgerClassic.activation_state !== 'HOLD_RIGHTS_AND_ECONOMICS_PENDING') errors.push('commercial ledger CLASSIC hold missing');
  if (!ledgerClassic?.evidence_refs?.includes(INTAKE_PATH) || !ledgerClassic?.evidence_refs?.includes(outbound.evidence_ref)) errors.push('commercial ledger intake evidence binding missing');
  if (activation.activation_state !== 'AWAITING_WRITTEN_RIGHTS_AND_PROVIDER_SPEC' || activation.default_enabled !== false || activation.production !== 'HOLD' || activation.public_release !== 'HOLD') errors.push('activation contract boundary drift');

  return errors;
}

function loadCurrentBundle() {
  return {
    intake: JSON.parse(fs.readFileSync(INTAKE_PATH, 'utf8')),
    gate: JSON.parse(fs.readFileSync(GATE_PATH, 'utf8')),
    activation: JSON.parse(fs.readFileSync(ACTIVATION_PATH, 'utf8')),
    providerContract: JSON.parse(fs.readFileSync(PROVIDER_CONTRACT_PATH, 'utf8')),
    ledger: JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')),
    communicationEvidence: JSON.parse(fs.readFileSync(PROVIDER_COMMUNICATION_EVIDENCE_PATH, 'utf8'))
  };
}

function mutationTests(bundle) {
  return [
    ['reject_missing_rights_axis', value => { delete value.intake.rights_assessments.query_collect; }],
    ['reject_replaced_rights_axis', value => {
      value.intake.rights_assessments.invented_axis = value.intake.rights_assessments.query_collect;
      delete value.intake.rights_assessments.query_collect;
    }],
    ['reject_missing_event_axis', value => { delete value.intake.event_field_assessments.sold_date; }],
    ['reject_replaced_event_axis', value => {
      value.intake.event_field_assessments.invented_event_axis = value.intake.event_field_assessments.sold_date;
      delete value.intake.event_field_assessments.sold_date;
    }],
    ['reject_missing_commercial_axis', value => { delete value.intake.commercial_assessments.pilot_and_production_price; }],
    ['reject_duplicate_question_id', value => { value.intake.required_response.provider_spec.question_id = 'Q1_PILOT_PRICE_AND_SCHEDULE'; }],
    ['reject_resolved_question_without_reply', value => {
      value.intake.required_response.provider_spec.state = QUESTION_RESOLVED;
      value.intake.required_response.provider_spec.evidence_ref = 'gmail:message:feedface';
    }],
    ['reject_resolved_crosswalk_without_reply', value => {
      value.intake.event_field_crosswalk.sold_date.state = CROSSWALK_RESOLVED;
      value.intake.event_field_crosswalk.sold_date.evidence_ref = 'gmail:message:feedface';
      value.intake.event_field_crosswalk.sold_date.resolved_contract_fields = ['lot_date'];
    }],
    ['reject_false_pass_without_reply', value => { value.intake.recorded_rights_decision = 'PASS'; value.gate.current_provider_state['CLASSIC.COM'].decision = 'PASS'; }],
    ['reject_no_reply_no_go', value => { value.intake.recorded_rights_decision = 'NO_GO'; value.gate.current_provider_state['CLASSIC.COM'].decision = 'NO_GO'; }],
    ['reject_reply_claim_without_provider_evidence', value => { value.intake.response_observation.provider_reply_after_latest_outbound = true; }],
    ['reject_automatic_followup_send', value => { value.intake.followup_policy.automatic_send_authorized = true; }],
    ['reject_further_followup_send', value => { value.intake.followup_policy.further_send_authorized = true; }],
    ['reject_terminal_no_response', value => { value.intake.followup_policy.no_response_terminal_disposition = true; }],
    ['reject_followup_sent_at_drift', value => { value.intake.followup_policy.sent_at = '2026-08-30T15:42:11Z'; }],
    ['reject_latest_outbound_manifest_drift', value => { value.intake.latest_outbound.communication_evidence_ref = `${PROVIDER_COMMUNICATION_EVIDENCE_PATH}#fabricated`; }],
    ['reject_intake_activation', value => { value.intake.activation = 'ENABLED'; }],
    ['reject_gate_activation', value => { value.gate.current_provider_state['CLASSIC.COM'].activation = 'ENABLED'; }],
    ['reject_spend_relaxation', value => { value.intake.authority_boundary.external_spend = 'ALLOWED'; }],
    ['reject_credential_relaxation', value => { value.intake.authority_boundary.credential_issuance_or_activation = 'ALLOWED'; }],
    ['reject_network_access_relaxation', value => { value.intake.authority_boundary.provider_network_access = 'ALLOWED'; }],
    ['reject_production_relaxation', value => { value.intake.authority_boundary.production = 'ALLOWED'; }],
    ['reject_public_relaxation', value => { value.intake.authority_boundary.public_release = 'ALLOWED'; }],
    ['reject_g5_relaxation', value => { value.intake.authority_boundary.g5 = 'ALLOWED'; }],
    ['reject_raw_email_body', value => { value.intake.raw_email_body = 'provider text'; }],
    ['reject_missing_derived_retention_clarification', value => { value.intake.required_response.rights_and_termination.required_ip_clarifications.pop(); }]
  ].map(([name, mutate]) => ({ name, mutate }));
}

function decisionRegressionTests(intake) {
  const allowedFixtureResponseRefs = new Set(['gmail:message:feedface']);
  const noReply = clone(intake);
  const incompatible = clone(intake);
  incompatible.response_observation.provider_reply_after_latest_outbound = true;
  incompatible.response_observation.provider_origin_response_ref = 'gmail:message:feedface';
  incompatible.response_observation.provider_origin_response_received_at = '2026-08-30T16:00:00Z';
  incompatible.response_observation.observed_through = '2026-08-30T17:00:00Z';
  incompatible.rights_assessments.internal_derive.state = 'INCOMPATIBLE';
  incompatible.rights_assessments.internal_derive.evidence_ref = 'gmail:message:feedface';
  const ambiguous = clone(intake);
  ambiguous.response_observation.provider_reply_after_latest_outbound = true;
  ambiguous.response_observation.provider_origin_response_ref = 'gmail:message:feedface';
  ambiguous.response_observation.provider_origin_response_received_at = '2026-08-30T16:00:00Z';
  ambiguous.response_observation.observed_through = '2026-08-30T17:00:00Z';
  ambiguous.rights_assessments.internal_derive.state = 'AMBIGUOUS';
  ambiguous.rights_assessments.internal_derive.evidence_ref = 'gmail:message:feedface';
  const eventIncompatible = clone(ambiguous);
  eventIncompatible.rights_assessments.internal_derive.state = 'UNKNOWN';
  eventIncompatible.rights_assessments.internal_derive.evidence_ref = null;
  eventIncompatible.event_field_assessments.realized_consideration.state = 'INCOMPATIBLE';
  eventIncompatible.event_field_assessments.realized_consideration.evidence_ref = 'gmail:message:feedface';
  const specIncompatible = clone(ambiguous);
  specIncompatible.rights_assessments.internal_derive.state = 'UNKNOWN';
  specIncompatible.rights_assessments.internal_derive.evidence_ref = null;
  specIncompatible.provider_spec_assessment.state = 'INCOMPATIBLE';
  specIncompatible.provider_spec_assessment.evidence_ref = 'gmail:message:feedface';
  const complete = clone(ambiguous);
  for (const entry of Object.values(complete.rights_assessments)) {
    entry.state = 'COMPATIBLE';
    entry.evidence_ref = 'gmail:message:feedface';
  }
  for (const entry of Object.values(complete.event_field_assessments)) {
    entry.state = 'COMPATIBLE';
    entry.evidence_ref = 'gmail:message:feedface';
  }
  complete.provider_spec_assessment.state = 'COMPATIBLE';
  complete.provider_spec_assessment.evidence_ref = 'gmail:message:feedface';
  const rightsEventsAndSpecOnly = clone(complete);
  for (const entry of Object.values(complete.commercial_assessments)) {
    entry.state = 'COMPATIBLE';
    entry.evidence_ref = 'gmail:message:feedface';
  }
  for (const question of Object.values(complete.required_response)) {
    question.state = QUESTION_RESOLVED;
    question.evidence_ref = 'gmail:message:feedface';
  }
  for (const entry of Object.values(complete.event_field_crosswalk)) {
    entry.state = CROSSWALK_RESOLVED;
    entry.evidence_ref = 'gmail:message:feedface';
    entry.resolved_contract_fields = [entry.candidate_contract_fields[0]];
  }
  const commercialUnknown = clone(complete);
  commercialUnknown.commercial_assessments.pilot_and_production_price = { state: 'UNKNOWN', evidence_ref: null };
  const commercialEvidenceMissing = clone(complete);
  commercialEvidenceMissing.commercial_assessments.query_rate_quota_limits.evidence_ref = null;
  const pendingQuestion = clone(complete);
  pendingQuestion.required_response.provider_spec.state = QUESTION_PENDING;
  pendingQuestion.required_response.provider_spec.evidence_ref = null;
  const resolvedQuestionEvidenceMissing = clone(complete);
  resolvedQuestionEvidenceMissing.required_response.sold_event_semantics.evidence_ref = null;
  const pendingCrosswalk = clone(complete);
  pendingCrosswalk.event_field_crosswalk.sold_date.state = CROSSWALK_PENDING;
  pendingCrosswalk.event_field_crosswalk.sold_date.evidence_ref = null;
  delete pendingCrosswalk.event_field_crosswalk.sold_date.resolved_contract_fields;
  const resolvedCrosswalkFieldMissing = clone(complete);
  resolvedCrosswalkFieldMissing.event_field_crosswalk.currency.resolved_contract_fields = [];
  const resolvedCrosswalkFieldUnbound = clone(complete);
  resolvedCrosswalkFieldUnbound.event_field_crosswalk.currency.resolved_contract_fields = ['unbound_provider_field'];
  const missingCommercialAxis = clone(complete);
  delete missingCommercialAxis.commercial_assessments.coverage_history_and_freshness;
  const replacedRightsAxis = clone(complete);
  replacedRightsAxis.rights_assessments.invented_axis = replacedRightsAxis.rights_assessments.query_collect;
  delete replacedRightsAxis.rights_assessments.query_collect;
  const replacedEventAxis = clone(complete);
  replacedEventAxis.event_field_assessments.invented_event_axis = replacedEventAxis.event_field_assessments.sold_date;
  delete replacedEventAxis.event_field_assessments.sold_date;
  const responseBeforeOutbound = clone(complete);
  responseBeforeOutbound.response_observation.provider_origin_response_received_at = '2026-08-30T15:00:00Z';
  return [
    ['no_reply_needs_clarification', deriveClassicRightsDecision(noReply, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['required_right_incompatible_no_go', deriveClassicRightsDecision(incompatible, allowedFixtureResponseRefs), 'NO_GO'],
    ['required_event_incompatible_no_go', deriveClassicRightsDecision(eventIncompatible, allowedFixtureResponseRefs), 'NO_GO'],
    ['provider_spec_incompatible_no_go', deriveClassicRightsDecision(specIncompatible, allowedFixtureResponseRefs), 'NO_GO'],
    ['ambiguous_right_needs_clarification', deriveClassicRightsDecision(ambiguous, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['rights_events_and_spec_only_needs_clarification', deriveClassicRightsDecision(rightsEventsAndSpecOnly, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['commercial_unknown_needs_clarification', deriveClassicRightsDecision(commercialUnknown, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['commercial_evidence_missing_needs_clarification', deriveClassicRightsDecision(commercialEvidenceMissing, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['pending_question_needs_clarification', deriveClassicRightsDecision(pendingQuestion, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['resolved_question_evidence_missing_needs_clarification', deriveClassicRightsDecision(resolvedQuestionEvidenceMissing, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['pending_crosswalk_needs_clarification', deriveClassicRightsDecision(pendingCrosswalk, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['resolved_crosswalk_field_missing_needs_clarification', deriveClassicRightsDecision(resolvedCrosswalkFieldMissing, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['resolved_crosswalk_field_unbound_needs_clarification', deriveClassicRightsDecision(resolvedCrosswalkFieldUnbound, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['missing_commercial_axis_needs_clarification', deriveClassicRightsDecision(missingCommercialAxis, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['replaced_rights_axis_needs_clarification', deriveClassicRightsDecision(replacedRightsAxis, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['replaced_event_axis_needs_clarification', deriveClassicRightsDecision(replacedEventAxis, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['response_before_outbound_needs_clarification', deriveClassicRightsDecision(responseBeforeOutbound, allowedFixtureResponseRefs), 'NEEDS_CLARIFICATION'],
    ['complete_but_unbound_response_needs_clarification', deriveClassicRightsDecision(complete), 'NEEDS_CLARIFICATION'],
    ['all_axes_commercial_questions_crosswalk_spec_and_bound_response_pass', deriveClassicRightsDecision(complete, allowedFixtureResponseRefs), 'PASS']
  ];
}

export function runClassicResponseIntakeValidation() {
  const bundle = loadCurrentBundle();
  const errors = validateClassicResponseIntakeBundle(bundle);
  const mutations = mutationTests(bundle);
  for (const test of mutations) {
    const mutated = clone(bundle);
    test.mutate(mutated);
    if (validateClassicResponseIntakeBundle(mutated).length === 0) errors.push(`mutation test did not fail: ${test.name}`);
  }
  const decisionTests = decisionRegressionTests(bundle.intake);
  for (const [name, actual, expected] of decisionTests) if (actual !== expected) errors.push(`decision regression failed: ${name}:${actual}`);
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    suite: 'KIDULTS_CLASSIC_BUNDLE3_PROVIDER_RESPONSE_INTAKE_V1',
    result: 'PASS',
    state: bundle.intake.current_state,
    rights_decision: deriveClassicRightsDecision(bundle.intake),
    operating_admission: bundle.intake.recorded_operating_admission,
    questions: Object.keys(bundle.intake.required_response).length,
    rights_axes: Object.keys(bundle.intake.rights_assessments).length,
    event_axes: Object.keys(bundle.intake.event_field_assessments).length,
    mutation_tests: mutations.length,
    decision_regression_tests: decisionTests.length,
    intake_sha256: sha256(bundle.intake),
    activation: 'DISABLED',
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED'
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    console.log(JSON.stringify(runClassicResponseIntakeValidation(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
