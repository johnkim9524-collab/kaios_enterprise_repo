import fs from 'node:fs';

const p = JSON.parse(
  fs.readFileSync(
    'coordination/kidults/internalization/partner-pre-send-internalization-gate-v1.json',
    'utf8',
  ),
);

const errs = [];
const required = [
  'latest_human_inbound_read',
  'github_952_read',
  'provider_specific_issue_read',
  'company_analysis_complete',
  'product_analysis_complete',
  'portfolio_priority_complete',
  'external_fact_internalization_split_complete',
  'internalize_now_plan_complete',
  'korean_internal_report_completed',
  'written_email_only_channel_confirmed',
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
  'outbound_necessary',
];

for (const x of required) {
  if (!p.required_checks?.includes(x)) errs.push(`missing check ${x}`);
}

if (p.fail_closed?.any_required_check_false !== 'DO_NOT_SEND') {
  errs.push('failed check must DO_NOT_SEND');
}
if (p.fail_closed?.newer_human_inbound_unread !== 'DO_NOT_SEND') {
  errs.push('unread inbound must DO_NOT_SEND');
}
if (p.fail_closed?.duplicate_followup !== 'DO_NOT_SEND') {
  errs.push('duplicate followup must DO_NOT_SEND');
}
if (p.fail_closed?.provider_core_capture_requested !== 'DO_NOT_SEND') {
  errs.push('core capture must DO_NOT_SEND');
}
if (p.fail_closed?.outbound_offers_or_accepts_phone_voice_or_video_call !== 'DO_NOT_SEND') {
  errs.push('call offer or acceptance must DO_NOT_SEND');
}
if (p.fail_closed?.agent_requests_program_owner_to_schedule_or_attend_call !== 'CONTROL_DEFECT_DO_NOT_SEND') {
  errs.push('requesting a Program Owner call must be a control defect');
}
if (p.fail_closed?.provider_refuses_to_put_material_terms_in_writing !== 'HOLD_OR_REPLACE') {
  errs.push('provider written-term refusal must HOLD_OR_REPLACE');
}
if (p.fail_closed?.material_term_exists_only_in_verbal_channel !== 'NOT_ADMISSIBLE_AS_EVIDENCE') {
  errs.push('verbal-only material terms must be non-admissible');
}
if (p.fail_closed?.kpmo_review_missing_or_not_approved !== 'DO_NOT_DRAFT_OR_SEND') {
  errs.push('missing KPMO review must DO_NOT_DRAFT_OR_SEND');
}
if (p.fail_closed?.program_owner_exact_content_approval_missing !== 'DO_NOT_DRAFT_OR_SEND') {
  errs.push('missing exact Program Owner approval must DO_NOT_DRAFT_OR_SEND');
}
if (p.fail_closed?.post_approval_email_package_changed !== 'APPROVAL_INVALIDATED_REVIEW_AGAIN') {
  errs.push('post-approval mutation must invalidate approval');
}
if (p.fail_closed?.automatic_gmail_draft_or_send_before_both_gates !== 'PROHIBITED') {
  errs.push('automatic Gmail draft/send must be prohibited before both gates');
}

const truth = p.implementation_truth || {};
if (truth.policy_shape_enforced !== true) errs.push('policy shape must be enforced');
if (truth.per_message_package_and_receipt_validator_implemented !== true) errs.push('per-message receipt validator must be implemented');
if (truth.approval_evidence_live_readback_implemented !== false) errs.push('live approval readback truth drift');
if (truth.gmail_draft_or_send_path_receipt_consumer_implemented !== false) errs.push('Gmail consumer truth drift');
if (truth.repository_validation_grants_send_authority !== false) errs.push('repository validation must not grant send authority');
if (truth.current_state !== 'CONTROL_ONLY_DO_NOT_DRAFT_OR_SEND') errs.push('control-only state drift');

const written = p.written_negotiation || {};
if (written.preferred !== true) errs.push('written negotiation must remain preferred');
if (written.required !== true) errs.push('written negotiation must be mandatory');
if (written.channel !== 'WRITTEN_EMAIL_ONLY') errs.push('negotiation channel must be WRITTEN_EMAIL_ONLY');
for (const key of ['phone_calls', 'voice_calls', 'video_calls']) {
  if (written[key] !== 'NOT_AVAILABLE') errs.push(`${key} must be NOT_AVAILABLE`);
}
for (const key of ['call_before_email', 'call_after_email', 'short_call_if_helpful']) {
  if (written[key] !== 'PROHIBITED') errs.push(`${key} must be PROHIBITED`);
}
if (written.english_not_native_language_disclosure_required_when_provider_requests_a_call !== true) {
  errs.push('non-native-English written-channel disclosure must be required when a call is requested');
}
if (!String(written.reason || '').includes('ENGLISH_IS_NOT_THE_PROGRAM_OWNERS_NATIVE_LANGUAGE')) {
  errs.push('written-only reason must bind the Program Owner non-native-English requirement');
}

const kpmo = p.kpmo_pre_send_review || {};
if (kpmo.required !== true) errs.push('KPMO pre-send review must be required');
if (kpmo.review_scope !== 'DETAILED_RESPONSE_STRATEGY_AND_EXACT_EMAIL_PACKAGE') {
  errs.push('KPMO review must cover strategy and exact email package');
}
if (!kpmo.verdicts?.includes('APPROVED_FOR_PROGRAM_OWNER_REVIEW')) {
  errs.push('KPMO approved verdict missing');
}
if (kpmo.self_authored_candidate_requires_distinct_second_pass_adversarial_review !== true) {
  errs.push('self-authored candidate must receive a distinct adversarial second pass');
}
if (kpmo.kpmo_review_is_send_authority !== false) errs.push('KPMO must not hold send authority');
if (kpmo.program_owner_report_language !== 'KOREAN') errs.push('Program Owner report must be Korean');
if (kpmo.program_owner_exact_content_send_approval_required !== true) {
  errs.push('exact Program Owner send approval must be required');
}
if (kpmo.post_approval_change_invalidates_approval !== true) {
  errs.push('post-approval changes must invalidate approval');
}
if (kpmo.content_digest_specification?.algorithm !== 'SHA-256') {
  errs.push('content digest algorithm must be SHA-256');
}
if (kpmo.content_digest_specification?.canonicalization !== 'RFC_8785_JSON') {
  errs.push('content digest must use RFC 8785 JSON canonicalization');
}
if (kpmo.content_digest_specification?.line_endings !== 'CRLF_NORMALIZED_TO_LF') {
  errs.push('content digest must normalize CRLF to LF');
}
for (const field of [
  'sender_identity',
  'to',
  'cc',
  'bcc',
  'thread_or_reply_target',
  'subject',
  'complete_body',
  'attachments',
  'links',
  'deterministic_content_digest',
]) {
  if (!kpmo.exact_email_package_fields?.includes(field)) errs.push(`exact package field missing ${field}`);
}

const requiredMaterialTerms = [
  'rights_and_permitted_uses',
  'schema_fields_and_semantics',
  'pricing_and_volume_bands',
  'term_and_cancellation',
  'retention_deletion_and_post_termination_duties',
  'derived_output_and_pre_existing_ip_rights',
  'quota_sla_support_and_schema_change_notice',
];
for (const term of requiredMaterialTerms) {
  if (!written.material_terms_required_in_writing?.includes(term)) {
    errs.push(`material written term missing ${term}`);
  }
}

const prohibitedAgentActions = [
  'OFFER_A_CALL',
  'ACCEPT_A_CALL',
  'SUGGEST_A_CALL_AFTER_EMAIL_ALIGNMENT',
  'ASK_THE_PROGRAM_OWNER_FOR_CALL_AVAILABILITY',
  'REPORT_A_CALL_AS_THE_NEXT_REQUIRED_ACTION',
  'TREAT_VERBAL_STATEMENTS_AS_BINDING_RIGHTS_OR_COMMERCIAL_EVIDENCE',
];
for (const action of prohibitedAgentActions) {
  if (!written.agent_must_not?.includes(action)) errs.push(`agent prohibition missing ${action}`);
}

for (const k of ['spend', 'contract', 'credential_activation']) {
  if (p.non_bypass?.[k] !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push(`${k} boundary drift`);
}
if (p.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');

if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      suite: 'KIDULTS_PARTNER_PRE_SEND_INTERNALIZATION_GATE_V1',
      result: 'PASS',
      required_checks: p.required_checks.length,
      negotiation_channel: written.channel,
      phone_voice_video_calls: 'NOT_AVAILABLE',
      verbal_material_terms_admissible: false,
      provider_written_refusal_outcome: written.provider_written_refusal_outcome,
      kpmo_pre_send_review: 'MANDATORY_POLICY_CONTROL_ONLY',
      program_owner_exact_content_approval: 'MANDATORY_POLICY_CONTROL_ONLY',
      per_message_receipt_validator: 'IMPLEMENTED',
      approval_evidence_live_readback: 'NOT_IMPLEMENTED',
      gmail_send_path_receipt_consumer: 'NOT_IMPLEMENTED',
      send_authority: false,
      automatic_gmail_draft_or_send_before_both_gates: 'PROHIBITED',
      production: 'HOLD',
    },
    null,
    2,
  ),
);
