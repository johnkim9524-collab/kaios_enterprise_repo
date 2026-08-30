import { readFile } from 'node:fs/promises';

const path = 'coordination/kidults/provider/provider-negotiation-outbound-execution-receipt-20260831-v1.json';
const receipt = JSON.parse(await readFile(path, 'utf8'));
const assert = (condition, code) => { if (!condition) throw new Error(code); };

assert(receipt.id === 'KIDULTS_PROVIDER_NEGOTIATION_OUTBOUND_EXECUTION_RECEIPT_20260831_V1', 'RECEIPT_ID_INVALID');
assert(receipt.authority?.type === 'PROGRAM_OWNER_EXPLICIT_SELECTED_OUTREACH_INSTRUCTION', 'AUTHORITY_INVALID');
assert(receipt.authority?.one_time_authority_consumed === true, 'ONE_TIME_AUTHORITY_NOT_CONSUMED');
assert(receipt.authority?.future_external_communication_authorized === false, 'FUTURE_OUTBOUND_MUST_RELOCK');
assert(receipt.authority?.automatic_followup_authorized === false, 'AUTOMATIC_FOLLOWUP_FORBIDDEN');

assert(receipt.messages?.length === 7, 'SELECTED_MESSAGE_COUNT_INVALID');
assert(receipt.execution_summary?.selected_messages === 7, 'SUMMARY_SELECTED_COUNT_INVALID');
assert(receipt.execution_summary?.sent === 7, 'SUMMARY_SENT_COUNT_INVALID');
assert(receipt.execution_summary?.failed === 0, 'FAILED_MESSAGE_COUNT_NOT_ZERO');
assert(receipt.execution_summary?.duplicate_resends === 0, 'DUPLICATE_RESEND_COUNT_NOT_ZERO');
assert(receipt.execution_summary?.guessed_recipient_addresses === 0, 'GUESSED_ADDRESS_COUNT_NOT_ZERO');

const requiredProviders = [
  'PSA_PREMIUM',
  'HOBBYKOREA',
  'CLASSIC_COM',
  'BONHAMS',
  'CHRISTIES',
  'ICONIC_AUCTIONEERS',
  'MECUM',
];
for (const provider of requiredProviders) {
  const message = receipt.messages.find(entry => entry.provider === provider);
  assert(Boolean(message), `PROVIDER_MESSAGE_MISSING:${provider}`);
  assert(message.state === 'SENT', `PROVIDER_MESSAGE_NOT_SENT:${provider}`);
  assert(/^[0-9a-f]{16}$/.test(message.gmail_message_id), `GMAIL_MESSAGE_ID_INVALID:${provider}`);
  assert(/^[0-9a-f]{16}$/.test(message.gmail_thread_id), `GMAIL_THREAD_ID_INVALID:${provider}`);
  assert(Array.isArray(message.to) && message.to.length >= 1, `RECIPIENT_MISSING:${provider}`);
}

const messageIds = receipt.messages.map(entry => entry.gmail_message_id);
assert(new Set(messageIds).size === messageIds.length, 'DUPLICATE_MESSAGE_ID');
const recipients = receipt.messages.flatMap(entry => [...entry.to, ...(entry.cc || [])]);
assert(recipients.every(address => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)), 'RECIPIENT_FORMAT_INVALID');

const psa = receipt.messages.find(entry => entry.provider === 'PSA_PREMIUM');
assert(psa.volume_semantics.includes('BOUNDED_FUNCTIONAL_PILOT'), 'PSA_FUNCTIONAL_PILOT_SEMANTICS_MISSING');
assert(psa.volume_semantics.includes('NOT_RELIABILITY'), 'PSA_RELIABILITY_GUARD_MISSING');
const hobby = receipt.messages.find(entry => entry.provider === 'HOBBYKOREA');
assert(hobby.stage.includes('CANARY_5'), 'HOBBYKOREA_CANARY_MISSING');
const classic = receipt.messages.find(entry => entry.provider === 'CLASSIC_COM');
assert(classic.prior_not_before_state === 'SUPERSEDED_BY_CURRENT_EXPLICIT_PROGRAM_OWNER_SELECTED_OUTREACH_INSTRUCTION', 'CLASSIC_OWNER_OVERRIDE_NOT_RECORDED');

const broadArrow = receipt.selection_logic?.hold?.find(entry => entry.provider === 'BROAD_ARROW');
assert(Boolean(broadArrow), 'BROAD_ARROW_HOLD_MISSING');
assert(broadArrow.reason.includes('NO_VERIFIED_OFFICIAL_WRITTEN_DATA_LICENSING_EMAIL_ROUTE_FOUND'), 'BROAD_ARROW_HOLD_REASON_INVALID');
assert(receipt.execution_summary?.provider_status_promotions === 0, 'PROVIDER_STATUS_PROMOTION_FORBIDDEN');
assert(receipt.execution_summary?.spend_authorized === false, 'SPEND_AUTHORIZATION_FORBIDDEN');
assert(receipt.execution_summary?.contract_authorized === false, 'CONTRACT_AUTHORIZATION_FORBIDDEN');
assert(receipt.execution_summary?.credential_authorized === false, 'CREDENTIAL_AUTHORIZATION_FORBIDDEN');
assert(receipt.execution_summary?.acquisition_authorized === false, 'ACQUISITION_AUTHORIZATION_FORBIDDEN');
assert(receipt.execution_summary?.production === 'HOLD', 'PRODUCTION_HOLD_MISSING');
assert(receipt.execution_summary?.public === 'HOLD', 'PUBLIC_HOLD_MISSING');
assert(receipt.execution_summary?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5_GATE_INVALID');
assert(receipt.truth_precedence?.future_outbound_after_this_receipt === 'HOLD_UNTIL_NEW_EXPLICIT_PROGRAM_OWNER_AUTHORITY', 'FUTURE_OUTBOUND_HOLD_MISSING');

process.stdout.write(`${JSON.stringify({
  receipt_id: receipt.id,
  state: 'VERIFIED_PASS',
  selected_messages: receipt.execution_summary.selected_messages,
  sent: receipt.execution_summary.sent,
  held_without_guessed_address: ['BROAD_ARROW'],
  future_external_communication_authorized: receipt.authority.future_external_communication_authorized,
  spend_authorized: receipt.execution_summary.spend_authorized,
  production: receipt.execution_summary.production,
  public: receipt.execution_summary.public,
  g5: receipt.execution_summary.g5,
})}\n`);
