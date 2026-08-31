#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROVIDER_COMMUNICATION_EVIDENCE_PATH =
  'coordination/kidults/provider/provider-communication-evidence-2026-08-30-v1.json';

const EXPECTED_EVENTS = new Map([
  ['cardmarket-licensed-data-inquiry-20260828', ['CARDMARKET', 'OUTBOUND', '2026-08-28T00:50:52Z', 'gmail:message:1a045d91e1005d02', 'gmail:thread:1a045d3c5270d77f', '<CAPAjgK6i0GD8DMzirzhFToV0i-4PeA5-iShO701VE=0mwP3OOw@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['hobbykorea-psa-provenance-source-inquiry-20260828', ['HOBBYKOREA_PSA_PROVENANCE', 'OUTBOUND', '2026-08-28T02:00:47Z', 'gmail:message:1a0461920f47d749', 'gmail:thread:1a0460d8c2ce3e1e', '<CAPAjgK76H8ApBxHprA25e9USD7_UhOhFmK-OWQvnyV6X_D_1Vw@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_DATA_OR_RIGHT_GRANTED']],
  ['card-ladder-enterprise-data-inquiry-20260830', ['CARD_LADDER', 'OUTBOUND', '2026-08-30T07:39:48Z', 'gmail:message:1a0519c3bba2b6d7', 'gmail:thread:1a0519c3bba2b6d7', '<CAPAjgK455DfvHRQU0e_e1q-nsCKJdsCwt3b9wmYDytbjERTZMQ@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['card-ladder-request-ack-20260830', ['CARD_LADDER', 'INBOUND_ACKNOWLEDGEMENT', '2026-08-30T07:39:53Z', 'gmail:message:1a0519c50e27b605', 'gmail:thread:1a0519c50e27b605', '<20N390LX2V4_6a93de49a5639_c90ae173d95058_sprut@zendesk.com>', '14698', 'RECEIPT_ONLY_NO_SUBSTANTIVE_PROVIDER_ANSWER']],
  ['market-movers-enterprise-data-inquiry-20260830', ['MARKET_MOVERS_SCI_ROUTE', 'OUTBOUND', '2026-08-30T07:39:55Z', 'gmail:message:1a0519c564f69f4e', 'gmail:thread:1a0519c564f69f4e', '<CAPAjgK5UignRDSiBFDCwzQE3uQRzo_mL1mWMymMeQx05U6Zh7Q@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['sports-card-investor-request-ack-20260830', ['MARKET_MOVERS_SCI_ROUTE', 'INBOUND_ACKNOWLEDGEMENT', '2026-08-30T07:40:00Z', 'gmail:message:1a0519c6c2f60033', 'gmail:thread:1a0519c6c2f60033', '<Z662WYMRKZ1_6a93de50594c5_6dbb54e76d1c05_sprut@zendesk.com>', '14487', 'RECEIPT_ONLY_NO_SUBSTANTIVE_PROVIDER_ANSWER']],
  ['psa-provenance-source-clarification-20260830', ['PSA_PREMIUM', 'OUTBOUND', '2026-08-30T15:41:23Z', 'gmail:message:1a0535522bb7b510', 'gmail:thread:1a0196deda4c61f3', '<CAPAjgK7HjoLZSCMrjvm+TFQhnpoaJ7YZ-0JX=d9TA8wm8n6Phg@mail.gmail.com>', null, 'OUTBOUND_SENT_EXISTING_BOUNDED_RIGHTS_UNCHANGED']],
  ['hobbykorea-psa-provenance-source-inquiry-20260830', ['HOBBYKOREA_PSA_PROVENANCE', 'OUTBOUND', '2026-08-30T15:41:33Z', 'gmail:message:1a05355487f616d8', 'gmail:thread:1a0460d8c2ce3e1e', '<CAPAjgK4aqEY9eZw04Rq=psk281ys4ofMcxp06PGK5o5sjUxyVQ@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_DATA_OR_RIGHT_GRANTED']],
  ['classic-com-staged-pilot-followup-20260830', ['CLASSIC_COM', 'OUTBOUND', '2026-08-30T15:42:10Z', 'gmail:message:1a05355da1037496', 'gmail:thread:1a01d87e01b06ad4', '<CAPAjgK6Yu0Xh6PuZW=BzUO9qWQCshAEjKDadGE0Z5CjCf_2i1A@mail.gmail.com>', null, 'OUTBOUND_SENT_NO_SIGNATURE_SPEND_CREDENTIAL_ACTIVATION_PUBLIC_OR_PRODUCTION_AUTHORITY']],
  ['bonhams-cars-watches-license-inquiry-20260830', ['BONHAMS', 'OUTBOUND', '2026-08-30T15:42:30Z', 'gmail:message:1a0535626f0c9617', 'gmail:thread:1a0535626f0c9617', '<CAPAjgK6qyqoqUUJuw77zHvstRVzx4xiqO-QtAZbwr9Km1Xmrrw@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['christies-watches-handbags-license-inquiry-20260830', ['CHRISTIES', 'OUTBOUND', '2026-08-30T15:42:48Z', 'gmail:message:1a053566c244d55d', 'gmail:thread:1a053566c244d55d', '<CAPAjgK6sFykS=-tTva++4HstXxmszwXfhgFvqpMc0gjiC=rCtQ@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['iconic-auctioneers-license-inquiry-20260830', ['ICONIC_AUCTIONEERS', 'OUTBOUND', '2026-08-30T15:43:36Z', 'gmail:message:1a053572a23e9e5e', 'gmail:thread:1a053572a23e9e5e', '<CAPAjgK7ZQ5W174B7bP7_yUU1rwOZPkjcVAKDE5acdyD4WN3-8g@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['mecum-auction-results-license-inquiry-20260830', ['MECUM', 'OUTBOUND', '2026-08-30T15:43:49Z', 'gmail:message:1a053575c7371ec7', 'gmail:thread:1a053575c7371ec7', '<CAPAjgK5Fvy5qeMCxR6pKSEA6pZvAj1uqPsKSQSkig6v6Tei4cQ@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']],
  ['bonhams-request-ack-20260830', ['BONHAMS', 'INBOUND_ACKNOWLEDGEMENT', '2026-08-30T15:45:25Z', 'gmail:message:1a05358d5b283fbd', 'gmail:thread:1a05358d5b283fbd', '<1588296307.43.1788104725282@app131060.cwl201.service-now.com>', 'CS0107634', 'RECEIPT_ONLY_NO_SUBSTANTIVE_PROVIDER_ANSWER']],
  ['broad-arrow-license-inquiry-20260830', ['BROAD_ARROW', 'OUTBOUND', '2026-08-30T15:50:27Z', 'gmail:message:1a0535d6fbc9039d', 'gmail:thread:1a0535d6fbc9039d', '<CAPAjgK7Y-=Kr7dG5p8LOPfnH-fGctz2AVYmuJj-JXkCA9R9sgw@mail.gmail.com>', null, 'OUTBOUND_SENT_ONLY_NO_PROVIDER_RIGHT_OR_ACCESS_GRANTED']]
]);

const ALLOWED_DIRECTIONS = new Set(['OUTBOUND', 'INBOUND_ACKNOWLEDGEMENT']);
const PROHIBITED_KEYS = new Set([
  'raw_email_body', 'raw_message_body', 'raw_attachment_body', 'access_token', 'api_key',
  'authorization', 'bearer_token', 'cookie', 'password', 'secret', 'credential_value'
]);

const normalizeKey = key => String(key)
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();

function scan(value, errors, path = '$') {
  if (Array.isArray(value)) return value.forEach((entry, index) => scan(entry, errors, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(normalizeKey(key))) errors.push(`PROHIBITED_FIELD:${path}.${key}`);
    scan(entry, errors, `${path}.${key}`);
  }
}

export function validateProviderCommunicationEvidence(document) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  scan(document, errors);
  check(document.id === 'kidults-provider-communication-evidence-2026-08-30-v1', 'INVALID_ID');
  check(document.version === '1.0.0', 'INVALID_VERSION');
  check(document.status === 'VERIFIED_METADATA_ONLY', 'INVALID_STATUS');
  check(document.evidence_method === 'LIVE_GMAIL_MESSAGE_AND_THREAD_METADATA_READ', 'INVALID_METHOD');
  check(document.raw_message_body_retained === false && document.raw_attachment_retained === false, 'RAW_MATERIAL_BOUNDARY');
  check(Number.isFinite(Date.parse(document.as_of)), 'INVALID_AS_OF');
  const events = document.events || [];
  check(events.length === EXPECTED_EVENTS.size, 'EVENT_CARDINALITY');
  check(new Set(events.map(event => event.event_id)).size === events.length, 'DUPLICATE_EVENT_ID');
  check(new Set(events.map(event => event.evidence_ref)).size === events.length, 'DUPLICATE_EVIDENCE_REF');
  check(new Set(events.map(event => event.rfc_message_id)).size === events.length, 'DUPLICATE_RFC_MESSAGE_ID');
  const byId = new Map(events.map(event => [event.event_id, event]));
  for (const [eventId, [providerId, direction, occurredAt, evidenceRef, threadRef, rfcMessageId, caseReference, claimCeiling]] of EXPECTED_EVENTS) {
    const event = byId.get(eventId);
    check(Boolean(event), `EVENT_MISSING:${eventId}`);
    if (!event) continue;
    check(event.provider_id === providerId, `PROVIDER_DRIFT:${eventId}`);
    check(event.direction === direction && ALLOWED_DIRECTIONS.has(event.direction), `DIRECTION_DRIFT:${eventId}`);
    check(event.occurred_at === occurredAt && Number.isFinite(Date.parse(event.occurred_at)), `TIME_DRIFT:${eventId}`);
    check(event.evidence_ref === evidenceRef && /^gmail:message:[a-f0-9]+$/.test(event.evidence_ref), `EVIDENCE_DRIFT:${eventId}`);
    check(event.thread_ref === threadRef, `THREAD_REF_DRIFT:${eventId}`);
    check(event.rfc_message_id === rfcMessageId, `RFC_MESSAGE_ID_DRIFT:${eventId}`);
    check((event.provider_case_reference ?? null) === caseReference, `CASE_REFERENCE_DRIFT:${eventId}`);
    check(typeof event.purpose === 'string' && event.purpose.length > 10, `PURPOSE_MISSING:${eventId}`);
    check(event.claim_ceiling === claimCeiling, `CLAIM_CEILING_DRIFT:${eventId}`);
    if (event.direction === 'INBOUND_ACKNOWLEDGEMENT') {
      check(typeof event.provider_case_reference === 'string' && event.provider_case_reference.length > 2, `CASE_REFERENCE_MISSING:${eventId}`);
      check(event.claim_ceiling === 'RECEIPT_ONLY_NO_SUBSTANTIVE_PROVIDER_ANSWER', `ACK_CLAIM_INFLATION:${eventId}`);
    }
  }
  const observation = document.substantive_response_observation || {};
  check(Number.isFinite(Date.parse(observation.observed_through)), 'OBSERVED_THROUGH_INVALID');
  check(Date.parse(observation.observed_through) <= Date.parse(document.as_of), 'OBSERVATION_AFTER_AS_OF');
  check(observation.acknowledgement_is_not_substantive_response === true, 'ACK_IS_NOT_SUBSTANTIVE_GUARD');
  const noReply = new Set(observation.no_substantive_response_after_latest_outbound || []);
  const expectedNoReply = new Set(events.filter(event => event.direction === 'OUTBOUND').map(event => event.provider_id));
  check(noReply.size === expectedNoReply.size && [...expectedNoReply].every(id => noReply.has(id)), 'NO_REPLY_PROVIDER_SET_DRIFT');
  const authority = document.authority_boundary || {};
  for (const key of [
    'email_or_acknowledgement_grants_rights', 'contract_or_terms_acceptance', 'external_spend',
    'credential_issuance_or_activation', 'provider_network_data_call', 'data_acquisition', 'adapter_activation'
  ]) check(authority[key] === false, `AUTHORITY_RELAXED:${key}`);
  check(authority.public_release === 'HOLD' && authority.production === 'HOLD' && authority.g5 === 'HOLD', 'RELEASE_BOUNDARY');
  for (const effect of ['autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect']) {
    check(typeof document[effect] === 'string' && document[effect].length > 20, `PRINCIPLE_EFFECT_MISSING:${effect}`);
  }
  return [...new Set(errors)].sort();
}

export function runProviderCommunicationEvidenceValidation() {
  const document = JSON.parse(fs.readFileSync(PROVIDER_COMMUNICATION_EVIDENCE_PATH, 'utf8'));
  const errors = validateProviderCommunicationEvidence(document);
  if (errors.length) throw new Error(`PROVIDER_COMMUNICATION_EVIDENCE_INVALID:${errors.join(',')}`);

  for (const [name, mutate, expected] of [
    ['duplicate-evidence', value => { value.events[1].evidence_ref = value.events[0].evidence_ref; }, 'DUPLICATE_EVIDENCE_REF'],
    ['inflate-ack', value => { value.events.find(event => event.direction === 'INBOUND_ACKNOWLEDGEMENT').claim_ceiling = 'RIGHTS_GRANTED'; }, 'ACK_CLAIM_INFLATION:card-ladder-request-ack-20260830'],
    ['authorize-spend', value => { value.authority_boundary.external_spend = true; }, 'AUTHORITY_RELAXED:external_spend'],
    ['drop-event', value => { value.events.pop(); }, 'EVENT_CARDINALITY'],
    ['tamper-thread', value => { value.events[0].thread_ref = 'gmail:thread:deadbeef'; }, 'THREAD_REF_DRIFT:cardmarket-licensed-data-inquiry-20260828'],
    ['retain-raw-body', value => { value.raw_email_body = 'prohibited'; }, 'PROHIBITED_FIELD:$.raw_email_body']
  ]) {
    const candidate = structuredClone(document);
    mutate(candidate);
    const observed = validateProviderCommunicationEvidence(candidate);
    if (!observed.includes(expected)) throw new Error(`NEGATIVE_MUTATION_NOT_REJECTED:${name}:${expected}`);
  }

  return {
    state: 'VERIFIED_PASS',
    evidence_ref: PROVIDER_COMMUNICATION_EVIDENCE_PATH,
    event_count: document.events.length,
    outbound_count: document.events.filter(event => event.direction === 'OUTBOUND').length,
    acknowledgement_count: document.events.filter(event => event.direction === 'INBOUND_ACKNOWLEDGEMENT').length,
    rights_granted: false,
    acquisition_authorized: false,
    production: 'HOLD'
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) console.log(JSON.stringify(runProviderCommunicationEvidenceValidation(), null, 2));
