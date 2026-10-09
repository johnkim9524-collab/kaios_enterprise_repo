import fs from 'node:fs';

const paths = {
  policy: 'coordination/kidults/governance/provider-written-email-only-negotiation-policy-v1.json',
  sourcing: 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json',
  preSend: 'coordination/kidults/internalization/partner-pre-send-internalization-gate-v1.json',
  minimum: 'coordination/kidults/internalization/minimum-external-dependency-negotiation-contract-v1.json',
  strategy: 'docs/strategy/IH_GROUP_PROVIDER_WRITTEN_EMAIL_ONLY_NEGOTIATION_POLICY_V1.md',
  globalStrategy: 'docs/strategy/IH_GROUP_GLOBAL_PROVIDER_STRATEGY_V6.md',
};

const parse = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const read = path => fs.readFileSync(path, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

const policy = parse(paths.policy);
const sourcing = parse(paths.sourcing);
const preSend = parse(paths.preSend);
const minimum = parse(paths.minimum);
const strategy = read(paths.strategy);
const globalStrategy = read(paths.globalStrategy);

function validate(input) {
  const errors = [];
  const {
    policy: p,
    sourcing: s,
    preSend: g,
    minimum: m,
    strategy: d,
    globalStrategy: gd,
  } = input;

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
    'current_provider_evidence_refreshed',
    'detailed_response_strategy_reviewed_by_kpmo',
    'exact_email_package_reviewed_by_kpmo',
    'kpmo_verdict_approved_for_program_owner_review',
    'program_owner_report_contains_strategy_and_exact_email_package',
    'exact_program_owner_send_approval_recorded',
    'approval_bound_to_sender_recipients_thread_subject_body_attachments_links_and_digest',
    'post_approval_change_absent',
  ];
  for (const assertion of requiredAssertions) {
    if (p.required_outbound_assertions?.[assertion] !== 'REQUIRED_IN_PER_MESSAGE_RECEIPT') {
      errors.push(`OUTBOUND_ASSERTION_MISSING:${assertion}`);
    }
    if (!g.required_checks?.includes(assertion)) {
      errors.push(`PRE_SEND_CHECK_MISSING:${assertion}`);
    }
  }

  for (const [name, truth] of [['POLICY', p.implementation_truth], ['PRE_SEND', g.implementation_truth]]) {
    if (truth?.policy_shape_enforced !== true) errors.push(`${name}_POLICY_SHAPE_NOT_ENFORCED`);
    if (truth?.per_message_package_and_receipt_validator_implemented !== true) errors.push(`${name}_RECEIPT_VALIDATOR_NOT_IMPLEMENTED`);
    if (truth?.approval_evidence_live_readback_implemented !== false) errors.push(`${name}_LIVE_READBACK_TRUTH_DRIFT`);
    if (truth?.gmail_draft_or_send_path_receipt_consumer_implemented !== false) errors.push(`${name}_GMAIL_CONSUMER_TRUTH_DRIFT`);
    if (truth?.repository_validation_grants_send_authority !== false) errors.push(`${name}_SEND_AUTHORITY_OVERCLAIM`);
    if (truth?.current_state !== 'CONTROL_ONLY_DO_NOT_DRAFT_OR_SEND') errors.push(`${name}_CONTROL_STATE_DRIFT`);
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

  const review = p.pre_send_review_and_approval || {};
  if (review.status !== 'MANDATORY_NON_BYPASS') errors.push('KPMO_REVIEW_NOT_MANDATORY');
  for (const action of ['GMAIL_DRAFT_CREATION', 'FORWARD', 'REPLY', 'SEND']) {
    if (!review.applies_before?.includes(action)) errors.push(`KPMO_REVIEW_SCOPE_MISSING:${action}`);
  }
  if (!review.kpmo_verdicts?.includes('APPROVED_FOR_PROGRAM_OWNER_REVIEW')) {
    errors.push('KPMO_APPROVED_VERDICT_MISSING');
  }
  if (review.self_authored_candidate_requires_distinct_second_pass_adversarial_review !== true) {
    errors.push('KPMO_SECOND_PASS_NOT_REQUIRED');
  }
  if (review.kpmo_review_is_send_authority !== false) errors.push('KPMO_IMPROPER_SEND_AUTHORITY');
  if (review.program_owner_report_language !== 'KOREAN') errors.push('PROGRAM_OWNER_REPORT_NOT_KOREAN');
  for (const field of [
    'SENDER_IDENTITY',
    'TO',
    'CC',
    'BCC',
    'THREAD_OR_REPLY_TARGET',
    'SUBJECT',
    'COMPLETE_BODY',
    'ATTACHMENTS',
    'LINKS',
    'DETERMINISTIC_CONTENT_DIGEST',
  ]) {
    if (!review.exact_approval_binding_fields?.includes(field)) {
      errors.push(`EXACT_APPROVAL_BINDING_FIELD_MISSING:${field}`);
    }
  }
  if (review.post_approval_change_invalidates_approval !== true) {
    errors.push('POST_APPROVAL_MUTATION_NOT_INVALIDATING');
  }
  if (review.content_digest_specification?.algorithm !== 'SHA-256') {
    errors.push('CONTENT_DIGEST_ALGORITHM_INVALID');
  }
  if (review.content_digest_specification?.encoding !== 'sha256:lowercase-hex') {
    errors.push('CONTENT_DIGEST_ENCODING_INVALID');
  }
  if (review.content_digest_specification?.canonicalization !== 'RFC_8785_JSON') {
    errors.push('CONTENT_DIGEST_CANONICALIZATION_INVALID');
  }
  if (review.content_digest_specification?.line_endings !== 'CRLF_NORMALIZED_TO_LF') {
    errors.push('CONTENT_DIGEST_LINE_ENDING_RULE_INVALID');
  }
  for (const field of ['filename', 'media_type', 'byte_length', 'sha256']) {
    if (!review.content_digest_specification?.attachments_bind?.includes(field)) {
      errors.push(`CONTENT_DIGEST_ATTACHMENT_FIELD_MISSING:${field}`);
    }
  }
  if (review.automatic_gmail_draft_or_send_before_approval !== 'PROHIBITED') {
    errors.push('GMAIL_DRAFT_OR_SEND_NOT_FAIL_CLOSED');
  }
  if (p.fail_closed?.kpmo_review_missing_or_not_approved !== 'DO_NOT_DRAFT_OR_SEND') {
    errors.push('KPMO_REVIEW_MISSING_NOT_FAIL_CLOSED');
  }
  if (p.fail_closed?.program_owner_exact_content_approval_missing !== 'DO_NOT_DRAFT_OR_SEND') {
    errors.push('PROGRAM_OWNER_APPROVAL_MISSING_NOT_FAIL_CLOSED');
  }
  if (p.fail_closed?.post_approval_email_package_changed !== 'APPROVAL_INVALIDATED_REVIEW_AGAIN') {
    errors.push('POST_APPROVAL_MUTATION_FAIL_CLOSED_MISSING');
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
  const sourcingReview = s.provider_outbound_pre_send_policy || {};
  if (sourcingReview.status !== 'MANDATORY_NON_BYPASS') errors.push('SOURCING_KPMO_REVIEW_NOT_MANDATORY');
  if (sourcingReview.self_authored_candidate_requires_distinct_second_pass_adversarial_review !== true) {
    errors.push('SOURCING_KPMO_SECOND_PASS_MISSING');
  }
  if (sourcingReview.kpmo_review_is_send_authority !== false) errors.push('SOURCING_KPMO_SEND_AUTHORITY_DRIFT');
  if (sourcingReview.gmail_draft_creation_before_both_gates !== 'PROHIBITED') {
    errors.push('SOURCING_GMAIL_DRAFT_PROHIBITION_MISSING');
  }
  if (sourcingReview.send_before_both_gates !== 'DO_NOT_DRAFT_OR_SEND') {
    errors.push('SOURCING_PRE_SEND_FAIL_CLOSED_MISSING');
  }
  if (sourcingReview.content_digest_specification?.canonicalization !== 'RFC_8785_JSON') {
    errors.push('SOURCING_CONTENT_DIGEST_CANONICALIZATION_INVALID');
  }
  for (const key of [
    'kpmo_detailed_strategy_and_exact_email_review_required_before_external_provider_email',
    'program_owner_korean_report_required_before_external_provider_email',
    'program_owner_exact_content_send_approval_required',
    'post_approval_content_or_routing_change_requires_fresh_review_and_approval',
    'automatic_gmail_draft_or_send_before_approval_forbidden',
  ]) {
    if (s.agent_requirements?.[key] !== true) errors.push(`SOURCING_AGENT_REQUIREMENT_MISSING:${key}`);
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
  const gateReview = g.kpmo_pre_send_review || {};
  if (gateReview.required !== true) errors.push('PRE_SEND_KPMO_REVIEW_NOT_REQUIRED');
  if (gateReview.review_scope !== 'DETAILED_RESPONSE_STRATEGY_AND_EXACT_EMAIL_PACKAGE') {
    errors.push('PRE_SEND_KPMO_REVIEW_SCOPE_DRIFT');
  }
  if (gateReview.self_authored_candidate_requires_distinct_second_pass_adversarial_review !== true) {
    errors.push('PRE_SEND_KPMO_SECOND_PASS_MISSING');
  }
  if (gateReview.kpmo_review_is_send_authority !== false) errors.push('PRE_SEND_KPMO_SEND_AUTHORITY_DRIFT');
  if (gateReview.program_owner_report_language !== 'KOREAN') errors.push('PRE_SEND_OWNER_REPORT_LANGUAGE_DRIFT');
  if (gateReview.program_owner_exact_content_send_approval_required !== true) {
    errors.push('PRE_SEND_OWNER_EXACT_APPROVAL_NOT_REQUIRED');
  }
  if (gateReview.post_approval_change_invalidates_approval !== true) {
    errors.push('PRE_SEND_POST_APPROVAL_MUTATION_NOT_INVALIDATING');
  }
  if (gateReview.content_digest_specification?.canonicalization !== 'RFC_8785_JSON') {
    errors.push('PRE_SEND_CONTENT_DIGEST_CANONICALIZATION_INVALID');
  }
  if (g.fail_closed?.automatic_gmail_draft_or_send_before_both_gates !== 'PROHIBITED') {
    errors.push('PRE_SEND_AUTOMATIC_GMAIL_NOT_PROHIBITED');
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
    'detailed_response_strategy_reviewed_by_kpmo = true',
    'exact_email_package_reviewed_by_kpmo = true',
    'exact_program_owner_send_approval_recorded = true',
    'DO_NOT_DRAFT_OR_SEND',
  ];
  for (const marker of strategyMarkers) {
    if (!d.includes(marker)) errors.push(`STRATEGY_MARKER_MISSING:${marker}`);
  }
  for (const marker of [
    '### 9.1 Mandatory KPMO provider-email pre-send gate',
    'KPMO semantic and adversarial review',
    'Program Owner exact-content send approval',
    'deterministic content digest',
    'RFC 8785 canonical JSON',
    '`DO_NOT_DRAFT_OR_SEND`',
  ]) {
    if (!gd.includes(marker)) errors.push(`GLOBAL_STRATEGY_MARKER_MISSING:${marker}`);
  }

  if (p.authority_boundary?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('SPEND_BOUNDARY_DRIFT');
  if (p.authority_boundary?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('CONTRACT_BOUNDARY_DRIFT');
  if (p.authority_boundary?.credential !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('CREDENTIAL_BOUNDARY_DRIFT');
  if (p.authority_boundary?.production !== 'HOLD') errors.push('PRODUCTION_BOUNDARY_DRIFT');
  if (p.authority_boundary?.public !== 'HOLD') errors.push('PUBLIC_BOUNDARY_DRIFT');
  if (p.authority_boundary?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('G5_BOUNDARY_DRIFT');

  return errors;
}

const errors = validate({ policy, sourcing, preSend, minimum, strategy, globalStrategy });
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
    globalStrategy,
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
  'kpmo_strategy_review_missing',
  input => { input.policy.required_outbound_assertions.detailed_response_strategy_reviewed_by_kpmo = false; },
  'OUTBOUND_ASSERTION_MISSING:detailed_response_strategy_reviewed_by_kpmo',
);
proveNegative(
  'program_owner_exact_approval_missing',
  input => { input.policy.required_outbound_assertions.exact_program_owner_send_approval_recorded = false; },
  'OUTBOUND_ASSERTION_MISSING:exact_program_owner_send_approval_recorded',
);
proveNegative(
  'post_approval_mutation_does_not_invalidate',
  input => { input.policy.pre_send_review_and_approval.post_approval_change_invalidates_approval = false; },
  'POST_APPROVAL_MUTATION_NOT_INVALIDATING',
);
proveNegative(
  'content_digest_not_bound_to_approval',
  input => {
    input.policy.pre_send_review_and_approval.exact_approval_binding_fields =
      input.policy.pre_send_review_and_approval.exact_approval_binding_fields
        .filter(field => field !== 'DETERMINISTIC_CONTENT_DIGEST');
  },
  'EXACT_APPROVAL_BINDING_FIELD_MISSING:DETERMINISTIC_CONTENT_DIGEST',
);
proveNegative(
  'gmail_runtime_enforcement_overclaimed',
  input => { input.policy.implementation_truth.gmail_draft_or_send_path_receipt_consumer_implemented = true; },
  'POLICY_GMAIL_CONSUMER_TRUTH_DRIFT',
);
proveNegative(
  'repository_validation_promoted_to_send_authority',
  input => { input.policy.implementation_truth.repository_validation_grants_send_authority = true; },
  'POLICY_SEND_AUTHORITY_OVERCLAIM',
);
proveNegative(
  'content_digest_canonicalization_weakened',
  input => {
    input.policy.pre_send_review_and_approval.content_digest_specification.canonicalization = 'UNSPECIFIED_JSON';
  },
  'CONTENT_DIGEST_CANONICALIZATION_INVALID',
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
  kpmo_pre_send_review: 'MANDATORY_POLICY_CONTROL_ONLY',
  program_owner_exact_content_approval: 'MANDATORY_POLICY_CONTROL_ONLY',
  per_message_receipt_validator: 'IMPLEMENTED',
  approval_evidence_live_readback: 'NOT_IMPLEMENTED',
  gmail_send_path_receipt_consumer: 'NOT_IMPLEMENTED',
  send_authority: false,
  gmail_draft_before_both_gates: 'PROHIBITED',
  negative_tests: negativeTests,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
