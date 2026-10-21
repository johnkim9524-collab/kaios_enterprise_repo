#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CLASSIC_RESPONSE_EVIDENCE_PATH =
  'coordination/kidults/provider/classic-com-provider-response-20261021-v1.json';

const PROHIBITED_KEYS = new Set([
  'api_key_value', 'access_token', 'authorization', 'bearer_token', 'cookie', 'password',
  'secret', 'credential_value', 'raw_email_body', 'raw_agreement_text', 'raw_attachment_body'
]);
const normalizeKey = key => String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

function scan(value, errors, location = '$') {
  if (Array.isArray(value)) return value.forEach((entry, index) => scan(entry, errors, `${location}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(normalizeKey(key))) errors.push(`PROHIBITED_FIELD:${location}.${key}`);
    scan(entry, errors, `${location}.${key}`);
  }
}

export function validateClassicProviderResponse(document) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  scan(document, errors);
  check(document.id === 'KIDULTS_CLASSIC_COM_PROVIDER_RESPONSE_20261021_V1', 'INVALID_ID');
  check(document.version === '1.0.0', 'INVALID_VERSION');
  check(document.status === 'VERIFIED_SECRET_SAFE_RESPONSE_EVIDENCE', 'INVALID_STATUS');
  check(document.provider_id === 'CLASSIC_COM', 'INVALID_PROVIDER');
  check(document.evidence_method === 'AUTHENTICATED_GMAIL_FULL_MESSAGE_THREAD_AND_ATTACHMENT_READ', 'INVALID_METHOD');
  check(document.message?.message_id === '1a1604837dcb0d54'
    && document.message?.thread_id === '1a0b5669d94b054b'
    && document.message?.evidence_ref === 'gmail:message:1a1604837dcb0d54'
    && document.message?.thread_ref === 'gmail:thread:1a0b5669d94b054b', 'MESSAGE_BINDING');
  check(document.message?.classification === 'INBOUND_SUBSTANTIVE_RESPONSE'
    && document.message?.authentication === 'CLASSIC_COM_DKIM_SPF_DMARC_PASS', 'MESSAGE_AUTHENTICATION');
  check(Number.isFinite(Date.parse(document.message?.received_at))
    && Date.parse(document.message.received_at) <= Date.parse(document.observed_at), 'MESSAGE_TIME');
  check(document.attachment?.sha256 === '28588da7506da7fd213e768354cb33c2e57c0734b58bb2afffe9534e810eede7'
    && document.attachment?.page_count === 11
    && document.attachment?.schedule_attached === false
    && document.attachment?.raw_attachment_retained_in_repository === false, 'ATTACHMENT_BINDING');
  check(document.material_facts?.commercial?.evaluation_term_days === 30
    && document.material_facts?.commercial?.one_time_price_usd === 500
    && document.material_facts?.commercial?.automatic_renewal === false
    && document.material_facts?.commercial?.free_sample_listing_count === 120, 'COMMERCIAL_FACTS');
  check(document.material_facts?.access_and_provisioning?.interface === 'GRAPHQL_API'
    && document.material_facts?.access_and_provisioning?.authentication === 'API_KEY'
    && document.material_facts?.access_and_provisioning?.evaluation_query_cap === 10000, 'ACCESS_FACTS');
  check(document.material_facts?.retention_and_termination?.email_stated_post_termination_derived_retention === false
    && String(document.material_facts?.retention_and_termination?.conflict_state).includes('MISSING_SCHEDULE'), 'RETENTION_CONFLICT');
  check(document.material_facts?.provenance_and_fields?.named_auction_house_dealer_or_venue_in_standard_bundle === false
    && document.material_facts?.provenance_and_fields?.stable_classic_vdp_url === true, 'PROVENANCE_FACTS');
  check(document.documentary_conflicts_and_missing_items?.includes('EMAIL_SAYS_PROPOSED_SCHEDULE_ATTACHED_BUT_NO_SCHEDULE_WAS_PRESENT')
    && document.documentary_conflicts_and_missing_items?.includes('EMAIL_SAYS_PARTY_AND_DATE_FIELDS_FILLED_BUT_ATTACHED_MASTER_FIELDS_ARE_BLANK'), 'DOCUMENT_CONFLICTS');
  for (const key of ['contract_or_schedule_acceptance', 'external_spend', 'credential_issuance_or_activation',
    'provider_network_access', 'data_or_sample_acquisition', 'provider_activation', 'external_reply']) {
    check(document.authority_boundary?.[key] === false, `AUTHORITY_RELAXED:${key}`);
  }
  check(document.authority_boundary?.public_release === 'HOLD'
    && document.authority_boundary?.production === 'HOLD'
    && document.authority_boundary?.g5 === 'HOLD', 'RELEASE_BOUNDARY');
  check(document.negotiation_channel === 'WRITTEN_EMAIL_ONLY_NO_PHONE_VOICE_OR_VIDEO_CALL', 'WRITTEN_ONLY_BOUNDARY');
  check(document.raw_email_body_retained === false
    && document.raw_agreement_text_retained === false
    && document.secrets_or_credentials_retained === false, 'SECRET_SAFE_BOUNDARY');
  check(document.current_state === 'SUBSTANTIVE_RESPONSE_RECEIVED_NEEDS_CLARIFICATION_OWNER_HOLD', 'STATE_DRIFT');
  return [...new Set(errors)].sort();
}

export function runClassicProviderResponseValidation() {
  const document = JSON.parse(fs.readFileSync(CLASSIC_RESPONSE_EVIDENCE_PATH, 'utf8'));
  const errors = validateClassicProviderResponse(document);
  if (errors.length) throw new Error(`CLASSIC_PROVIDER_RESPONSE_EVIDENCE_INVALID:${errors.join(',')}`);
  for (const [name, mutate, expected] of [
    ['authorize-spend', value => { value.authority_boundary.external_spend = true; }, 'AUTHORITY_RELAXED:external_spend'],
    ['attach-schedule-without-evidence', value => { value.attachment.schedule_attached = true; }, 'ATTACHMENT_BINDING'],
    ['retain-raw-email', value => { value.raw_email_body = 'prohibited'; }, 'PROHIBITED_FIELD:$.raw_email_body'],
    ['inflate-provenance', value => { value.material_facts.provenance_and_fields.named_auction_house_dealer_or_venue_in_standard_bundle = true; }, 'PROVENANCE_FACTS']
  ]) {
    const candidate = structuredClone(document);
    mutate(candidate);
    const observed = validateClassicProviderResponse(candidate);
    if (!observed.includes(expected)) throw new Error(`NEGATIVE_MUTATION_NOT_REJECTED:${name}:${expected}`);
  }
  return {
    state: 'VERIFIED_PASS',
    provider: document.provider_id,
    message_id: document.message.message_id,
    attachment_sha256: `sha256:${document.attachment.sha256}`,
    rights_decision: 'NEEDS_CLARIFICATION',
    activation: 'DISABLED',
    external_spend: 'HOLD',
    production: 'HOLD'
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) console.log(JSON.stringify(runClassicProviderResponseValidation(), null, 2));
