import fs from 'node:fs';

const c = JSON.parse(
  fs.readFileSync(
    'coordination/kidults/internalization/minimum-external-dependency-negotiation-contract-v1.json',
    'utf8',
  ),
);

const errs = [];

for (const x of [
  'canonical_identity_ownership',
  'normalization_ownership',
  'methodology_scoring_ownership',
  'confidence_provenance_ownership',
  'ontology_ownership',
  'provider_switching_control',
  'historical_learning_control',
]) {
  if (!c.never_concede?.includes(x)) errs.push(`missing never_concede ${x}`);
}

for (const x of ['post_termination_derived_intelligence', 'portability_export']) {
  if (!c.rights_requirements?.includes(x)) errs.push(`missing rights requirement ${x}`);
}

if (!c.required_order?.includes('written_email_only_negotiation')) {
  errs.push('written_email_only_negotiation must be a required step');
}

const comms = c.communication_policy || {};
if (comms.negotiation_channel !== 'WRITTEN_EMAIL_ONLY') {
  errs.push('negotiation channel must be WRITTEN_EMAIL_ONLY');
}
if (comms.program_owner_native_language !== 'NOT_ENGLISH') {
  errs.push('Program Owner non-native-English requirement missing');
}
if (comms.phone_voice_video_calls_available !== false) {
  errs.push('phone/voice/video calls must be unavailable');
}
if (comms.call_as_prerequisite !== 'REJECT') {
  errs.push('call prerequisite must be rejected');
}
if (comms.call_after_written_alignment !== 'REJECT') {
  errs.push('post-email call suggestion must be rejected');
}
if (comms.verbal_only_material_terms !== 'NON_ADMISSIBLE') {
  errs.push('verbal-only material terms must be non-admissible');
}
if (comms.provider_call_request !== 'POLITELY_DECLINE_AND_REQUEST_WRITTEN_RESPONSE') {
  errs.push('provider call request handling must decline and request written response');
}
if (comms.provider_refuses_written_terms !== 'HOLD_OR_REPLACE') {
  errs.push('provider written-term refusal must HOLD_OR_REPLACE');
}
for (const action of [
  'DO_NOT_OFFER_OR_ACCEPT_PHONE_VOICE_OR_VIDEO_CALL',
  'DO_NOT_ASK_PROGRAM_OWNER_FOR_CALL_TIMES',
  'DO_NOT_DESCRIBE_A_CALL_AS_NEXT_STEP',
  'DO_NOT_SUGGEST_A_CALL_AFTER_EMAIL_ALIGNMENT',
  'DO_NOT_TREAT_VERBAL_TERMS_AS_EVIDENCE',
]) {
  if (!comms.agent_prohibitions?.includes(action)) {
    errs.push(`missing communication prohibition ${action}`);
  }
}

if (!String(c.provider_request_strategy?.CLASSIC_COM || '').includes('DO_NOT_ACCEPT_CALL_AS_A_PREREQUISITE')) {
  errs.push('CLASSIC_COM strategy must reject calls as a prerequisite');
}

if (c.fail_closed?.unknown_material_rights !== 'HOLD') errs.push('unknown rights must HOLD');
if (c.fail_closed?.provider_core_capture !== 'NO_GO') errs.push('provider core capture must NO_GO');
if (c.fail_closed?.provider_requires_phone_voice_or_video_negotiation !== 'HOLD_OR_REPLACE') {
  errs.push('call-required provider must HOLD_OR_REPLACE');
}
if (c.fail_closed?.material_terms_not_supplied_in_writing !== 'NOT_ADMISSIBLE') {
  errs.push('unwritten material terms must be NOT_ADMISSIBLE');
}

if (c.non_bypass?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (c.non_bypass?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (c.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (c.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (c.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      suite: 'KIDULTS_MINIMUM_EXTERNAL_DEPENDENCY_NEGOTIATION_V1',
      result: 'PASS',
      providers: Object.keys(c.provider_request_strategy || {}).length,
      negotiation_channel: comms.negotiation_channel,
      phone_voice_video_calls_available: comms.phone_voice_video_calls_available,
      verbal_only_material_terms: comms.verbal_only_material_terms,
      provider_refuses_written_terms: comms.provider_refuses_written_terms,
      production: c.non_bypass.production,
      g5: c.non_bypass.g5,
    },
    null,
    2,
  ),
);
