import fs from 'node:fs';

const paths = {
  policy: 'coordination/kidults/governance/provider-written-email-only-negotiation-policy-v1.json',
  sourcing: 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json',
  preSend: 'coordination/kidults/internalization/partner-pre-send-internalization-gate-v1.json',
  minimum: 'coordination/kidults/internalization/minimum-external-dependency-negotiation-contract-v1.json',
  strategy: 'docs/strategy/IH_GROUP_PROVIDER_WRITTEN_EMAIL_ONLY_NEGOTIATION_POLICY_V1.md',
};

const parse = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const read = path => fs.readFileSync(path, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

const policy = parse(paths.policy);
const sourcing = parse(paths.sourcing);
const preSend = parse(paths.preSend);
const minimum = parse(paths.minimum);
const strategy = read(paths.strategy);

function validate(input) {
  const errors = [];
  const { policy: p, sourcing: s, preSend: g, minimum: m, strategy: d } = input;

  if (p.id !== 'KIDULTS_PROVIDER_WRITTEN_EMAIL_ONLY_NEGOTIATION_POLICY_V1') {
    errors.push('POLICY_ID_INVALID');
  }
  if (p.status !== 'MANDATORY_NON_BYPASS') errors.push('POLICY_NOT_MANDATORY');
  if (p.program_owner_accessibility?.native_language_is_english !== false) {
    errors.push('PROGRAM_OWNER_NATIVE_LANGUAGE_BOUNDARY_MISSING');
  }
  if (p.program_owner_accessibility?.required_negotiation_channel !== 'WRITTEN_EMAIL_ONLY') {
    errors.push('NEGOTIATION_CHANNEL_NOT_WRITTEN_EMAIL_ONLY');
  }
  if (p.program_owner_accessibility?.canonical_korean_communication_rule !== '솔직하고 정중하게 양해를 구한다') {
    errors.push('CANONICAL_HONEST_RESPECTFUL_UNDERSTANDING_RULE_MISSING');
  }
  if (p.program_owner_accessibility?.required_communication_manner !== 'HONESTLY_AND_RESPECTFULLY_REQUEST_PROVIDER_UNDERSTANDING') {
    errors.push('REQUIRED_COMMUNICATION_MANNER_MISSING');
  }
  if (!String(p.program_owner_accessibility?.standard_written_explanation || '').includes('I would sincerely appreciate your understanding')) {
    errors.push('STANDARD_UNDERSTANDING_REQUEST_MISSING');
  }
  for (const key of [
    'external_phone_call_available',
    'external_voice_call_available',
    'external_video_call_available',
  ]) {
    if (p.program_owner_accessibility?.[key] !== false) {
      errors.push(`CALL_CHANNEL_AVAILABLE:${key}`);
    }
  }

  const requiredAssertions = [
    'written_email_only_channel_confirmed',
    'honest_respectful_understanding_request_present_when_channel_reason_is_explained',
    'outbound_call_offer_absent',
    'provider_call_request_declined_in_writing_if_present',
    'all_material_terms_requested_in_writing',
    'program_owner_not_assigned_to_phone_voice_or_video_call',
  ];
  for (const assertion of requiredAssertions) {
    if (p.required_outbound_assertions?.[assertion] !== true) {
      errors.push(`OUTBOUND_ASSERTION_MISSING:${assertion}`);
    }
    if (!g.required_checks?.includes(assertion)) {
      errors.push(`PRE_SEND_CHECK_MISSING:${assertion}`);
    }
  }

  if (!p.provider_call_request_handling?.includes('HONESTLY_AND_RESPECTFULLY_REQUEST_PROVIDER_UNDERSTANDING')) {
    errors.push('PROVIDER_UNDERSTANDING_REQUEST_HANDLING_MISSING');
  }

  const forbidden = [
    'OFFER_PHONE_VOICE_OR_VIDEO_CALL',
    'ACCEPT_PHONE_VOICE_OR_VIDEO_CALL',
    'ASK_PROGRAM_OWNER_FOR_CALL_AVAILABILITY',
    'SUGGEST_CALL_BEFORE_WRITTEN_TERMS',
    'SUGGEST_CALL_AFTER_WRITTEN_ALIGNMENT',
    'DESCRIBE_SHORT_CALL_AS_USEFUL_OPTIONAL_OR_NEXT_STEP',
    'TREAT_VERBAL_STATEMENT_AS_RIGHTS_COMMERCIAL_OR_CONTRACT_EVIDENCE',
    'REPORT_PROVIDER_CALL_REQUEST_AS_PROGRAM_OWNER_WORK',
  ];
  for (const action of forbidden) {
    if (!p.forbidden_agent_actions?.includes(action)) {
      errors.push(`FORBIDDEN_ACTION_MISSING:${action}`);
    }
  }

  if (p.fail_closed?.outbound_offers_or_accepts_call !== 'DO_NOT_SEND') {
    errors.push('CALL_OUTBOUND_NOT_FAIL_CLOSED');
  }
  if (p.fail_closed?.agent_assigns_call_to_program_owner !== 'CONTROL_DEFECT_DO_NOT_SEND') {
    errors.push('PROGRAM_OWNER_CALL_ASSIGNMENT_NOT_CONTROL_DEFECT');
  }
  if (p.fail_closed?.provider_requires_call_as_prerequisite !== 'HOLD_OR_REPLACE') {
    errors.push('CALL_REQUIRED_PROVIDER_NOT_HOLD_OR_REPLACE');
  }
  if (p.fail_closed?.provider_refuses_written_material_terms !== 'HOLD_OR_REPLACE') {
    errors.push('WRITTEN_REFUSAL_NOT_HOLD_OR_REPLACE');
  }
  if (p.fail_closed?.material_terms_only_verbal !== 'NON_ADMISSIBLE') {
    errors.push('VERBAL_TERMS_NOT_NON_ADMISSIBLE');
  }

  if (!s.mandatory_strategy_addenda?.includes(paths.strategy)) {
    errors.push('STRATEGY_ADDENDUM_NOT_REGISTERED');
  }
  if (!s.machine_readable_strategy_addenda?.includes(paths.policy)) {
    errors.push('MACHINE_POLICY_NOT_REGISTERED');
  }
  if (s.negotiation_communication_policy?.channel !== 'WRITTEN_EMAIL_ONLY') {
    errors.push('SOURCING_CHANNEL_DRIFT');
  }
  if (s.negotiation_communication_policy?.phone_voice_video_calls !== 'NOT_AVAILABLE') {
    errors.push('SOURCING_CALL_BOUNDARY_DRIFT');
  }
  if (s.negotiation_communication_policy?.provider_call_requirement !== 'HOLD_OR_REPLACE') {
    errors.push('SOURCING_PROVIDER_REFUSAL_DRIFT');
  }
  if (s.agent_requirements?.written_email_only_negotiation_required !== true) {
    errors.push('AGENT_WRITTEN_ONLY_REQUIREMENT_MISSING');
  }
  if (s.agent_requirements?.never_offer_accept_or_recommend_phone_voice_or_video_call !== true) {
    errors.push('AGENT_CALL_PROHIBITION_MISSING');
  }

  if (g.written_negotiation?.required !== true) errors.push('PRE_SEND_WRITTEN_ONLY_NOT_REQUIRED');
  if (g.written_negotiation?.channel !== 'WRITTEN_EMAIL_ONLY') errors.push('PRE_SEND_CHANNEL_DRIFT');
  if (g.written_negotiation?.canonical_korean_communication_rule !== '솔직하고 정중하게 양해를 구한다') {
    errors.push('PRE_SEND_CANONICAL_COMMUNICATION_RULE_MISSING');
  }
  if (g.written_negotiation?.required_communication_manner !== 'HONESTLY_AND_RESPECTFULLY_REQUEST_PROVIDER_UNDERSTANDING') {
    errors.push('PRE_SEND_REQUIRED_COMMUNICATION_MANNER_MISSING');
  }
  if (g.written_negotiation?.provider_understanding_request_required_when_channel_reason_is_explained !== true) {
    errors.push('PRE_SEND_UNDERSTANDING_REQUEST_NOT_REQUIRED');
  }
  for (const key of ['phone_calls', 'voice_calls', 'video_calls']) {
    if (g.written_negotiation?.[key] !== 'NOT_AVAILABLE') {
      errors.push(`PRE_SEND_CALL_CHANNEL_DRIFT:${key}`);
    }
  }
  if (g.fail_closed?.outbound_offers_or_accepts_phone_voice_or_video_call !== 'DO_NOT_SEND') {
    errors.push('PRE_SEND_CALL_FAIL_CLOSED_MISSING');
  }
  if (g.fail_closed?.provider_refuses_to_put_material_terms_in_writing !== 'HOLD_OR_REPLACE') {
    errors.push('PRE_SEND_WRITTEN_REFUSAL_DRIFT');
  }

  if (m.communication_policy?.negotiation_channel !== 'WRITTEN_EMAIL_ONLY') {
    errors.push('MINIMUM_CONTRACT_CHANNEL_DRIFT');
  }
  if (m.communication_policy?.phone_voice_video_calls_available !== false) {
    errors.push('MINIMUM_CONTRACT_CALL_BOUNDARY_DRIFT');
  }
  if (m.communication_policy?.provider_refuses_written_terms !== 'HOLD_OR_REPLACE') {
    errors.push('MINIMUM_CONTRACT_REFUSAL_DRIFT');
  }
  if (!String(m.provider_request_strategy?.CLASSIC_COM || '').includes('DO_NOT_ACCEPT_CALL_AS_A_PREREQUISITE')) {
    errors.push('CLASSIC_COM_CALL_PREREQUISITE_NOT_REJECTED');
  }

  const strategyMarkers = [
    '# Intelligence Holdings Group Provider Written-Email-Only Negotiation Policy v1',
    'must be conducted through written email only',
    'Phone, voice, and video calls are not available negotiation channels',
    "English is not the Program Owner's native language",
    '솔직하고 정중하게 양해를 구한다',
    'I would sincerely appreciate your understanding',
    'HOLD_OR_REPLACE',
    'CLASSIC.COM application',
    'honest_respectful_understanding_request_present_when_channel_reason_is_explained = true',
    'outbound_call_offer_absent = true',
    'program_owner_not_assigned_to_phone_voice_or_video_call = true',
  ];
  for (const marker of strategyMarkers) {
    if (!d.includes(marker)) errors.push(`STRATEGY_MARKER_MISSING:${marker}`);
  }


  const trackZChecks = ["exact_head_provider_governance_read","latest_human_inbound_and_complete_thread_read","message_attachment_authenticity_and_sender_authority_checked","chronology_and_duplicate_or_resend_risk_checked","other_monitor_duplicate_message_id_checked","provider_brand_legal_contract_billing_tax_and_merchant_entities_separated","provider_company_product_and_use_case_fit_assessed","source_provenance_upstream_dependency_common_parent_and_provider_independence_assessed","schema_matching_sample_evidence_assessed","field_semantics_null_empty_omitted_and_missingness_assessed","access_method_activation_timing_rate_limit_and_overage_behavior_assessed","retention_deletion_private_evaluation_and_non_reconstructive_derived_rights_assessed","image_and_media_rights_assessed","trial_price_cancellation_refund_auto_renewal_and_tax_terms_assessed","payment_access_input_data_rights_product_gate_sequence_assessed","lock_in_replacement_path_and_provider_removal_cost_assessed","negotiation_objective_evidence_request_concessions_and_prohibited_commitments_defined","non_native_english_disclosure_and_written_email_only_handling_prepared_if_call_requested","external_display_name_and_legal_contracting_party_separated","intelligence_holdings_identity_authority_billing_tax_email_authentication_conditions_checked","current_authorized_outbound_identity_confirmed","external_communication_authority_confirmed"];
  for (const check of trackZChecks) {
    if (!p.track_z_pre_engagement_gate?.required_checks?.includes(check)) errors.push(`TRACK_Z_PRE_ENGAGEMENT_CHECK_MISSING:${check}`);
    if (!g.required_checks?.includes(check)) errors.push(`PRE_SEND_TRACK_Z_CHECK_MISSING:${check}`);
  }
  if (p.track_z_pre_engagement_gate?.status !== 'MANDATORY_NON_BYPASS_BEFORE_PROVIDER_REVIEW_OR_NEGOTIATION') errors.push('TRACK_Z_PRE_ENGAGEMENT_NOT_MANDATORY');
  if (p.policy_interpretation?.bilingual_email_formatting_rule !== false) errors.push('BILINGUAL_FORMATTING_MISINTERPRETATION');
  const kg = p.kpmo_pre_send_governance || {};
  if (kg.response_strategy_review?.required !== true) errors.push('KPMO_STRATEGY_REVIEW_NOT_REQUIRED');
  if (kg.exact_final_message_review?.required !== true || kg.exact_final_message_review?.line_by_line !== true) errors.push('KPMO_FINAL_MESSAGE_REVIEW_NOT_REQUIRED');
  if (kg.program_owner_pre_send_report_required !== true) errors.push('PROGRAM_OWNER_PRE_SEND_REPORT_NOT_REQUIRED');
  if (kg.program_owner_explicit_message_bound_approval_required !== true) errors.push('PROGRAM_OWNER_EXACT_MESSAGE_APPROVAL_NOT_REQUIRED');
  if (kg.kpmo_self_approval_allowed !== false) errors.push('KPMO_SELF_APPROVAL_NOT_FORBIDDEN');
  if (kg.automatic_gmail_draft_creation !== false || kg.automatic_send !== false) errors.push('AUTOMATIC_GMAIL_ACTION_NOT_FORBIDDEN');
  if (!kg.approval_binding_fields?.includes('approved_content_sha256')) errors.push('APPROVAL_CONTENT_HASH_BINDING_MISSING');
  if (!kg.approval_invalidation_events?.includes('new_human_inbound')) errors.push('NEW_INBOUND_APPROVAL_INVALIDATION_MISSING');
  for (const assertion of ['kpmo_response_strategy_review_completed','kpmo_final_message_review_completed','program_owner_pre_send_report_completed','program_owner_explicit_message_bound_send_approval_recorded','approval_binding_matches_exact_outbound','non_native_english_context_respected']) {
    if (p.required_outbound_assertions?.[assertion] !== true) errors.push(`OUTBOUND_ASSERTION_MISSING:${assertion}`);
    if (!g.required_checks?.includes(assertion)) errors.push(`PRE_SEND_CHECK_MISSING:${assertion}`);
  }
  if (s.agent_requirements?.track_z_pre_engagement_required_before_provider_review_or_negotiation !== true) errors.push('SOURCING_TRACK_Z_PRE_ENGAGEMENT_MISSING');
  if (s.kpmo_pre_send_governance?.exact_message_bound_approval_required !== true) errors.push('SOURCING_EXACT_MESSAGE_APPROVAL_MISSING');
  if (g.fail_closed?.track_z_pre_engagement_missing !== 'DO_NOT_REVIEW_OR_NEGOTIATE') errors.push('TRACK_Z_PRE_ENGAGEMENT_NOT_FAIL_CLOSED');
  if (g.fail_closed?.exact_message_approval_missing_or_stale !== 'DO_NOT_SEND') errors.push('EXACT_MESSAGE_APPROVAL_NOT_FAIL_CLOSED');
  if (!d.includes('Mandatory Track Z pre-engagement, KPMO review, and Program Owner approval')) errors.push('TRACK_Z_STRATEGY_SECTION_MISSING');
  if (!d.includes('it is not a bilingual-email formatting rule')) errors.push('BILINGUAL_RULE_CLARIFICATION_MISSING');
  if (p.authority_boundary?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('SPEND_BOUNDARY_DRIFT');
  if (p.authority_boundary?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('CONTRACT_BOUNDARY_DRIFT');
  if (p.authority_boundary?.credential !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('CREDENTIAL_BOUNDARY_DRIFT');
  if (p.authority_boundary?.production !== 'HOLD') errors.push('PRODUCTION_BOUNDARY_DRIFT');
  if (p.authority_boundary?.public !== 'HOLD') errors.push('PUBLIC_BOUNDARY_DRIFT');
  if (p.authority_boundary?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('G5_BOUNDARY_DRIFT');

  return errors;
}

const errors = validate({ policy, sourcing, preSend, minimum, strategy });
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const negativeTests = [];
function proveNegative(name, mutate, expectedCode) {
  const input = {
    policy: clone(policy),
    sourcing: clone(sourcing),
    preSend: clone(preSend),
    minimum: clone(minimum),
    strategy,
  };
  mutate(input);
  const result = validate(input);
  if (!result.includes(expectedCode)) {
    console.error(`NEGATIVE_TEST_FAILED:${name}:${expectedCode}`);
    process.exit(1);
  }
  negativeTests.push(name);
}

proveNegative(
  'phone_call_enabled',
  input => { input.policy.program_owner_accessibility.external_phone_call_available = true; },
  'CALL_CHANNEL_AVAILABLE:external_phone_call_available',
);
proveNegative(
  'channel_changed_to_call_optional',
  input => { input.policy.program_owner_accessibility.required_negotiation_channel = 'EMAIL_THEN_CALL_OPTIONAL'; },
  'NEGOTIATION_CHANNEL_NOT_WRITTEN_EMAIL_ONLY',
);
proveNegative(
  'provider_written_refusal_softened',
  input => { input.policy.fail_closed.provider_refuses_written_material_terms = 'CONTINUE_BY_CALL'; },
  'WRITTEN_REFUSAL_NOT_HOLD_OR_REPLACE',
);
proveNegative(
  'program_owner_call_assignment_removed',
  input => { input.policy.required_outbound_assertions.program_owner_not_assigned_to_phone_voice_or_video_call = false; },
  'OUTBOUND_ASSERTION_MISSING:program_owner_not_assigned_to_phone_voice_or_video_call',
);
proveNegative(
  'honest_respectful_understanding_request_removed',
  input => { input.policy.required_outbound_assertions.honest_respectful_understanding_request_present_when_channel_reason_is_explained = false; },
  'OUTBOUND_ASSERTION_MISSING:honest_respectful_understanding_request_present_when_channel_reason_is_explained',
);
proveNegative(
  'classic_call_prerequisite_accepted',
  input => { input.minimum.provider_request_strategy.CLASSIC_COM = 'TAXONOMY_AND_SALES_HISTORY_AFTER_CALL'; },
  'CLASSIC_COM_CALL_PREREQUISITE_NOT_REJECTED',
);


proveNegative(
  'track_z_pre_engagement_removed',
  input => { input.policy.track_z_pre_engagement_gate.required_checks = []; },
  'TRACK_Z_PRE_ENGAGEMENT_CHECK_MISSING:exact_head_provider_governance_read',
);
proveNegative(
  'kpmo_strategy_review_removed',
  input => { input.policy.kpmo_pre_send_governance.response_strategy_review.required = false; },
  'KPMO_STRATEGY_REVIEW_NOT_REQUIRED',
);
proveNegative(
  'program_owner_exact_message_approval_removed',
  input => { input.policy.kpmo_pre_send_governance.program_owner_explicit_message_bound_approval_required = false; },
  'PROGRAM_OWNER_EXACT_MESSAGE_APPROVAL_NOT_REQUIRED',
);
proveNegative(
  'kpmo_self_approval_enabled',
  input => { input.policy.kpmo_pre_send_governance.kpmo_self_approval_allowed = true; },
  'KPMO_SELF_APPROVAL_NOT_FORBIDDEN',
);
proveNegative(
  'approved_content_hash_binding_removed',
  input => { input.policy.kpmo_pre_send_governance.approval_binding_fields = []; },
  'APPROVAL_CONTENT_HASH_BINDING_MISSING',
);
console.log(JSON.stringify({
  receipt_id: 'KIDULTS_PROVIDER_WRITTEN_EMAIL_ONLY_NEGOTIATION_POLICY_VALIDATION_V1',
  state: 'VERIFIED_PASS',
  negotiation_channel: 'WRITTEN_EMAIL_ONLY',
  communication_manner: 'HONESTLY_AND_RESPECTFULLY_REQUEST_PROVIDER_UNDERSTANDING',
  canonical_korean_rule: '솔직하고 정중하게 양해를 구한다',
  phone_voice_video_calls_available: false,
  material_verbal_terms_admissible: false,
  provider_written_refusal: 'HOLD_OR_REPLACE',
  negative_tests: negativeTests,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
