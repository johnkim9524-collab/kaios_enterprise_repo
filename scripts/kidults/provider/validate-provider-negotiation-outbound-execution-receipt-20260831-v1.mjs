import { readFile } from 'node:fs/promises';

const [basePath = 'coordination/kidults/provider/provider-negotiation-outbound-execution-receipt-20260831-v1.json',
  supplementPath = 'coordination/kidults/provider/provider-negotiation-outbound-broad-arrow-supplement-20260831-v1.json'] = process.argv.slice(2);
const [receipt, supplement] = await Promise.all([
  readFile(basePath, 'utf8').then(JSON.parse),
  readFile(supplementPath, 'utf8').then(JSON.parse),
]);
const assert = (condition, code) => { if (!condition) throw new Error(code); };

assert(receipt.id === 'KIDULTS_PROVIDER_NEGOTIATION_OUTBOUND_EXECUTION_RECEIPT_20260831_V1', 'RECEIPT_ID_INVALID');
assert(receipt.authority?.type === 'PROGRAM_OWNER_EXPLICIT_SELECTED_OUTREACH_INSTRUCTION', 'AUTHORITY_INVALID');
assert(receipt.authority?.one_time_authority_consumed === true, 'ONE_TIME_AUTHORITY_NOT_CONSUMED');
assert(receipt.authority?.future_external_communication_authorized === false, 'FUTURE_OUTBOUND_MUST_RELOCK');
assert(receipt.authority?.automatic_followup_authorized === false, 'AUTOMATIC_FOLLOWUP_FORBIDDEN');
assert(receipt.authorization_provenance?.state === 'NOT_MACHINE_PROVEN', 'BASE_AUTHORIZATION_PROVENANCE_MUST_FAIL_CLOSED');
assert(receipt.authorization_provenance?.evidence_class === 'POST_SEND_EXECUTION_RECEIPT_ONLY', 'BASE_EVIDENCE_CLASS_INVALID');
assert(receipt.authorization_provenance?.execution_fact_machine_proven_by_this_repository_artifact === false, 'BASE_EXECUTION_FACT_MUST_NOT_SELF_PROVE');
assert(receipt.authorization_provenance?.independently_issued_pre_send_authorization_receipt === null, 'BASE_UNPROVEN_EXTERNAL_RECEIPT_MUST_BE_NULL');
assert(receipt.authorization_provenance?.candidate_branch_self_attestation_is_authorization_proof === false, 'BASE_SELF_ATTESTATION_MUST_NOT_AUTHORIZE');
assert(receipt.authorization_provenance?.post_send_receipt_can_retroactively_create_authority === false, 'BASE_POST_HOC_AUTHORITY_FORBIDDEN');
assert(receipt.authorization_provenance?.promotable === false, 'BASE_AUTHORITY_MUST_BE_NON_PROMOTABLE');

assert(receipt.messages?.length === 7, 'BASE_SELECTED_MESSAGE_COUNT_INVALID');
assert(receipt.execution_summary?.selected_messages === 7, 'BASE_SUMMARY_SELECTED_COUNT_INVALID');
assert(receipt.execution_summary?.sent === 7, 'BASE_SUMMARY_SENT_COUNT_INVALID');
assert(receipt.execution_summary?.failed === 0, 'BASE_FAILED_MESSAGE_COUNT_NOT_ZERO');
assert(receipt.execution_summary?.duplicate_resends === 0, 'BASE_DUPLICATE_RESEND_COUNT_NOT_ZERO');
assert(receipt.execution_summary?.guessed_recipient_addresses === 0, 'BASE_GUESSED_ADDRESS_COUNT_NOT_ZERO');

const requiredBaseProviders = [
  'PSA_PREMIUM',
  'HOBBYKOREA',
  'CLASSIC_COM',
  'BONHAMS',
  'CHRISTIES',
  'ICONIC_AUCTIONEERS',
  'MECUM',
];
for (const provider of requiredBaseProviders) {
  const message = receipt.messages.find(entry => entry.provider === provider);
  assert(Boolean(message), `PROVIDER_MESSAGE_MISSING:${provider}`);
  assert(message.state === 'SENT', `PROVIDER_MESSAGE_NOT_SENT:${provider}`);
  assert(/^[0-9a-f]{16}$/.test(message.gmail_message_id), `GMAIL_MESSAGE_ID_INVALID:${provider}`);
  assert(/^[0-9a-f]{16}$/.test(message.gmail_thread_id), `GMAIL_THREAD_ID_INVALID:${provider}`);
  assert(Array.isArray(message.to) && message.to.length >= 1, `RECIPIENT_MISSING:${provider}`);
}

const psa = receipt.messages.find(entry => entry.provider === 'PSA_PREMIUM');
assert(psa.volume_semantics.includes('BOUNDED_FUNCTIONAL_PILOT'), 'PSA_FUNCTIONAL_PILOT_SEMANTICS_MISSING');
assert(psa.volume_semantics.includes('NOT_RELIABILITY'), 'PSA_RELIABILITY_GUARD_MISSING');
const hobby = receipt.messages.find(entry => entry.provider === 'HOBBYKOREA');
assert(hobby.stage.includes('CANARY_5'), 'HOBBYKOREA_CANARY_MISSING');
const classic = receipt.messages.find(entry => entry.provider === 'CLASSIC_COM');
assert(classic.prior_not_before_state === 'SUPERSEDED_BY_CURRENT_EXPLICIT_PROGRAM_OWNER_SELECTED_OUTREACH_INSTRUCTION', 'CLASSIC_OWNER_OVERRIDE_NOT_RECORDED');

const baseBroadArrowHold = receipt.selection_logic?.hold?.find(entry => entry.provider === 'BROAD_ARROW');
assert(Boolean(baseBroadArrowHold), 'BASE_BROAD_ARROW_HOLD_MISSING');
assert(baseBroadArrowHold.reason.includes('NO_VERIFIED_OFFICIAL_WRITTEN_DATA_LICENSING_EMAIL_ROUTE_FOUND'), 'BASE_BROAD_ARROW_HOLD_REASON_INVALID');

assert(supplement.id === 'KIDULTS_PROVIDER_NEGOTIATION_OUTBOUND_BROAD_ARROW_SUPPLEMENT_20260831_V1', 'SUPPLEMENT_ID_INVALID');
assert(supplement.base_receipt === basePath, 'SUPPLEMENT_BASE_RECEIPT_BINDING_INVALID');
assert(supplement.authority?.one_time_authority_consumed_for_this_message === true, 'SUPPLEMENT_AUTHORITY_NOT_CONSUMED');
assert(supplement.authority?.future_external_communication_authorized === false, 'SUPPLEMENT_FUTURE_OUTBOUND_MUST_RELOCK');
assert(supplement.authorization_provenance?.state === 'NOT_MACHINE_PROVEN', 'SUPPLEMENT_AUTHORIZATION_PROVENANCE_MUST_FAIL_CLOSED');
assert(supplement.authorization_provenance?.evidence_class === 'POST_SEND_EXECUTION_RECEIPT_ONLY', 'SUPPLEMENT_EVIDENCE_CLASS_INVALID');
assert(supplement.authorization_provenance?.execution_fact_machine_proven_by_this_repository_artifact === false, 'SUPPLEMENT_EXECUTION_FACT_MUST_NOT_SELF_PROVE');
assert(supplement.authorization_provenance?.independently_issued_pre_send_authorization_receipt === null, 'SUPPLEMENT_UNPROVEN_EXTERNAL_RECEIPT_MUST_BE_NULL');
assert(supplement.authorization_provenance?.candidate_branch_self_attestation_is_authorization_proof === false, 'SUPPLEMENT_SELF_ATTESTATION_MUST_NOT_AUTHORIZE');
assert(supplement.authorization_provenance?.post_send_receipt_can_retroactively_create_authority === false, 'SUPPLEMENT_POST_HOC_AUTHORITY_FORBIDDEN');
assert(supplement.authorization_provenance?.base_one_time_assertion_reusable_for_supplement === false, 'BASE_ONE_TIME_ASSERTION_REUSE_FORBIDDEN');
assert(supplement.authorization_provenance?.promotable === false, 'SUPPLEMENT_AUTHORITY_MUST_BE_NON_PROMOTABLE');
assert(supplement.contact_resolution?.provider === 'BROAD_ARROW', 'SUPPLEMENT_PROVIDER_INVALID');
assert(supplement.contact_resolution?.resolved_state === 'VERIFIED_GENERAL_INQUIRY_ROUTE_FOUND_AND_USED', 'BROAD_ARROW_ROUTE_NOT_RESOLVED');
assert(supplement.contact_resolution?.verified_recipient === 'info@broadarrowauctions.com', 'BROAD_ARROW_RECIPIENT_INVALID');
assert(supplement.contact_resolution?.guessed_address === false, 'BROAD_ARROW_ADDRESS_MUST_NOT_BE_GUESSED');
assert(supplement.message?.provider === 'BROAD_ARROW' && supplement.message?.state === 'SENT', 'BROAD_ARROW_MESSAGE_NOT_SENT');
assert(/^[0-9a-f]{16}$/.test(supplement.message.gmail_message_id), 'BROAD_ARROW_GMAIL_MESSAGE_ID_INVALID');
assert(supplement.message.gmail_message_id === supplement.message.gmail_thread_id, 'BROAD_ARROW_THREAD_BINDING_INVALID');
assert(supplement.message.volume_semantics === 'CANARY_5_THEN_30_TO_120_OPTIONAL_459', 'BROAD_ARROW_VOLUME_SEMANTICS_INVALID');
assert(supplement.truth_precedence?.supersedes_base_receipt_selection_hold_for?.includes('BROAD_ARROW'), 'BROAD_ARROW_HOLD_NOT_SUPERSEDED');
assert(supplement.truth_precedence?.future_outbound_after_this_supplement === 'HOLD_UNTIL_NEW_EXPLICIT_PROGRAM_OWNER_AUTHORITY', 'SUPPLEMENT_FUTURE_OUTBOUND_HOLD_MISSING');

const allMessages = [...receipt.messages, supplement.message];
assert(allMessages.length === 8, 'CUMULATIVE_MESSAGE_COUNT_INVALID');
const messageIds = allMessages.map(entry => entry.gmail_message_id);
assert(new Set(messageIds).size === messageIds.length, 'DUPLICATE_MESSAGE_ID');
const recipients = allMessages.flatMap(entry => [...entry.to, ...(entry.cc || [])]);
assert(recipients.every(address => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)), 'RECIPIENT_FORMAT_INVALID');
assert(supplement.cumulative_execution_summary?.total_sent === 8, 'CUMULATIVE_SENT_COUNT_INVALID');
assert(supplement.cumulative_execution_summary?.failed === 0, 'CUMULATIVE_FAILURE_COUNT_NOT_ZERO');
assert(supplement.cumulative_execution_summary?.duplicate_resends === 0, 'CUMULATIVE_DUPLICATE_RESEND_COUNT_NOT_ZERO');
assert(supplement.cumulative_execution_summary?.guessed_recipient_addresses === 0, 'CUMULATIVE_GUESSED_ADDRESS_COUNT_NOT_ZERO');
assert(supplement.cumulative_execution_summary?.provider_status_promotions === 0, 'PROVIDER_STATUS_PROMOTION_FORBIDDEN');
assert(supplement.cumulative_execution_summary?.spend_authorized === false, 'SPEND_AUTHORIZATION_FORBIDDEN');
assert(supplement.cumulative_execution_summary?.contract_authorized === false, 'CONTRACT_AUTHORIZATION_FORBIDDEN');
assert(supplement.cumulative_execution_summary?.credential_authorized === false, 'CREDENTIAL_AUTHORIZATION_FORBIDDEN');
assert(supplement.cumulative_execution_summary?.acquisition_authorized === false, 'ACQUISITION_AUTHORIZATION_FORBIDDEN');
assert(supplement.cumulative_execution_summary?.production === 'HOLD', 'PRODUCTION_HOLD_MISSING');
assert(supplement.cumulative_execution_summary?.public === 'HOLD', 'PUBLIC_HOLD_MISSING');
assert(supplement.cumulative_execution_summary?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5_GATE_INVALID');

process.stdout.write(`${JSON.stringify({
  receipt_id: receipt.id,
  supplement_id: supplement.id,
  state: 'RECORDED_POST_SEND_RECEIPT_AUTHORITY_AND_EXECUTION_NOT_MACHINE_PROVEN',
  authorization_provenance: receipt.authorization_provenance.state,
  promotable: false,
  repository: process.env.GITHUB_REPOSITORY || null,
  source_sha: process.env.SOURCE_SHA || process.env.GITHUB_SHA || null,
  workflow_run_id: process.env.GITHUB_RUN_ID || null,
  workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  trigger_event: process.env.GITHUB_EVENT_NAME || null,
  base_sent: receipt.execution_summary.sent,
  supplemental_sent: supplement.cumulative_execution_summary.supplement_messages,
  cumulative_sent: supplement.cumulative_execution_summary.total_sent,
  broad_arrow: 'VERIFIED_ROUTE_USED_AND_SENT',
  future_external_communication_authorized: supplement.authority.future_external_communication_authorized,
  spend_authorized: supplement.cumulative_execution_summary.spend_authorized,
  production: supplement.cumulative_execution_summary.production,
  public: supplement.cumulative_execution_summary.public,
  g5: supplement.cumulative_execution_summary.g5,
})}\n`);
