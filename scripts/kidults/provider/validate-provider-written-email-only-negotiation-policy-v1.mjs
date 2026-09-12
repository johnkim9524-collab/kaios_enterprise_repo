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
