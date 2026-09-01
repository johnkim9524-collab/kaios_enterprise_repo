#!/usr/bin/env node
import fs from 'node:fs';
import {
  PROVIDER_COMMUNICATION_EVIDENCE_PATH,
  validateProviderCommunicationEvidence
} from './validate-provider-communication-evidence-v1.mjs';

const DEFAULT_GATE = 'coordination/kidults/provider/provider-contact-readiness-gate-v1.json';
const DEFAULT_OPERATING_STATE = 'coordination/kidults/registry/provider/records/provider-operating-state-v1.json';

export function validateProviderContactReadiness(gate, operatingState, communicationEvidence) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const reconciled = gate.groups?.RECONCILED_NO_DUPLICATE_OUTREACH || [];
  const providerById = new Map((operatingState.providers || []).map(provider => [provider.provider_id, provider]));

  check(gate.status === 'PROGRAM_OWNER_DECISION_READY', 'CONTACT_GATE_STATUS');
  check(gate.version === '1.1.0', 'CONTACT_GATE_VERSION');
  check(gate.canonical_input === DEFAULT_OPERATING_STATE, 'CANONICAL_PROVIDER_STATE_BINDING');
  check(gate.communication_evidence_manifest === PROVIDER_COMMUNICATION_EVIDENCE_PATH,
    'COMMUNICATION_EVIDENCE_BINDING');
  for (const error of validateProviderCommunicationEvidence(communicationEvidence)) {
    errors.push(`COMMUNICATION_EVIDENCE:${error}`);
  }
  check(gate.contact_authorized === false, 'CONTACT_MUST_HOLD');
  check(gate.groups?.HIGH_FIT_APPLICATION_OR_LICENSE_INQUIRY?.length === 1, 'UNRECONCILED_HIGH_FIT_COUNT');
  check(gate.groups?.RIGHTS_OR_BULK_ACCESS_INQUIRY?.length === 2, 'UNRECONCILED_RIGHTS_INQUIRY_COUNT');
  check(reconciled.length === 14, 'RECONCILED_PROVIDER_COUNT');
  check(gate.groups?.REJECT_FOR_SOLD_TRANSACTION_EVIDENCE?.some(item => item.provider.includes('StockX')), 'STOCKX_REJECTION_MISSING');
  check(gate.groups?.REJECT_FOR_SOLD_TRANSACTION_EVIDENCE?.some(item => item.provider.includes('TCGplayer')), 'TCGPLAYER_REJECTION_MISSING');
  check(gate.groups?.DISCOVERY_GAP_REMAINS?.length === 8, 'DOMAIN_GAP_COUNT');
  check(gate.program_owner_decision?.required === true && gate.program_owner_decision?.default === 'HOLD_ALL_CONTACTS', 'PROGRAM_OWNER_GATE');
  check(gate.guards?.canonical_provider_state_must_be_checked === true, 'CANONICAL_STATE_CHECK_GUARD');
  check(gate.guards?.duplicate_or_resend_forbidden_without_explicit_authority === true, 'DUPLICATE_RESEND_GUARD');
  check(gate.guards?.no_contact_without_owner_decision === true &&
    gate.guards?.no_contract_commitment_without_separate_approval === true &&
    gate.guards?.no_credentials_in_registry === true && gate.guards?.no_production === true, 'PROTECTED_GUARDS');
  check(gate.production === 'HOLD', 'PRODUCTION_HOLD');

  const expectedStates = new Map([
    ['EBAY_MARKETPLACE_INSIGHTS', 'CLOSED'],
    ['PSA_PREMIUM', 'BOUNDED'],
    ['GEMRATE', 'CONDITIONAL'],
    ['CLASSIC_COM', 'HOLD'],
    ['CGC_CCG', 'HOLD'],
    ['CARDMARKET', 'HOLD'],
    ['CARD_LADDER', 'HOLD'],
    ['MARKET_MOVERS_SCI_ROUTE', 'HOLD'],
    ['HOBBYKOREA_PSA_PROVENANCE', 'HOLD'],
    ['BONHAMS', 'HOLD'],
    ['BROAD_ARROW', 'HOLD'],
    ['CHRISTIES', 'HOLD'],
    ['ICONIC_AUCTIONEERS', 'HOLD'],
    ['MECUM', 'HOLD']
  ]);
  for (const [providerId, expectedState] of expectedStates) {
    const gateRecord = reconciled.find(record => record.canonical_provider_id === providerId);
    const canonical = providerById.get(providerId);
    check(Boolean(gateRecord), `RECONCILED_PROVIDER_MISSING:${providerId}`);
    check(Boolean(canonical), `CANONICAL_PROVIDER_MISSING:${providerId}`);
    if (gateRecord && canonical) {
      check(gateRecord.state === expectedState && canonical.state === expectedState, `PROVIDER_STATE_DRIFT:${providerId}`);
      check(gateRecord.communication_state === canonical.communication?.state, `COMMUNICATION_STATE_DRIFT:${providerId}`);
      check(gateRecord.resend_authorized === false && canonical.communication?.resend_authorized === false,
        `RESEND_AUTHORIZED:${providerId}`);
    }
  }
  const prospectiveNames = [
    ...(gate.groups?.HIGH_FIT_APPLICATION_OR_LICENSE_INQUIRY || []),
    ...(gate.groups?.RIGHTS_OR_BULK_ACCESS_INQUIRY || [])
  ].map(record => record.provider);
  check(!prospectiveNames.some(name => [
    'eBay', 'eBay Marketplace Insights', 'PSA', 'PSA Premium', 'GemRate', 'CLASSIC.COM',
    'CGC', 'CGC / CCG', 'Cardmarket', 'Card Ladder', 'Market Movers',
    'Sports Card Investor', 'HobbyKorea', 'Bonhams', 'Broad Arrow Auctions', "Christie's",
    'Iconic Auctioneers', 'Mecum Auctions'
  ].includes(name)),
    'RECONCILED_PROVIDER_STILL_IN_PROSPECTIVE_OUTREACH_QUEUE');

  const fastLane = gate.groups?.FAST_LANE_NO_VERIFIED_OUTREACH || [];
  const expectedFastLane = new Set([
    'GOODING_CHRISTIES', 'SOTHEBYS', 'BARRETT_JACKSON', 'COLLECTING_CARS'
  ]);
  check(fastLane.length === expectedFastLane.size, 'FAST_LANE_NO_OUTREACH_COUNT');
  for (const providerId of expectedFastLane) {
    const gateRecord = fastLane.find(record => record.canonical_provider_id === providerId);
    const canonical = providerById.get(providerId);
    check(Boolean(gateRecord), `FAST_LANE_NO_OUTREACH_MISSING:${providerId}`);
    check(Boolean(canonical), `CANONICAL_PROVIDER_MISSING:${providerId}`);
    if (gateRecord && canonical) {
      check(gateRecord.state === 'HOLD' && canonical.state === 'HOLD', `FAST_LANE_STATE_DRIFT:${providerId}`);
      check(gateRecord.communication_state === canonical.communication?.state,
        `FAST_LANE_COMMUNICATION_STATE_DRIFT:${providerId}`);
      check(gateRecord.contact_authorized === false && canonical.communication?.resend_authorized === false,
        `FAST_LANE_CONTACT_AUTHORIZED:${providerId}`);
    }
  }

  const gateProviderIds = new Set([
    ...reconciled.map(record => record.canonical_provider_id),
    ...fastLane.map(record => record.canonical_provider_id)
  ]);
  check(gateProviderIds.size === reconciled.length + fastLane.length, 'CONTACT_GATE_DUPLICATE_PROVIDER');
  return [...new Set(errors)].sort();
}

const gatePath = process.argv[2] || DEFAULT_GATE;
const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
const operatingState = JSON.parse(fs.readFileSync(DEFAULT_OPERATING_STATE, 'utf8'));
const communicationEvidence = JSON.parse(fs.readFileSync(PROVIDER_COMMUNICATION_EVIDENCE_PATH, 'utf8'));
const errors = validateProviderContactReadiness(gate, operatingState, communicationEvidence);
if (errors.length) throw new Error(`PROVIDER_CONTACT_READINESS_INVALID:${errors.join(',')}`);

const mutation = structuredClone(gate);
mutation.groups.RECONCILED_NO_DUPLICATE_OUTREACH[0].resend_authorized = true;
const negativeErrors = validateProviderContactReadiness(mutation, operatingState, communicationEvidence);
if (!negativeErrors.includes('RESEND_AUTHORIZED:EBAY_MARKETPLACE_INSIGHTS')) {
  throw new Error('PROVIDER_DUPLICATE_OUTREACH_NEGATIVE_TEST_NOT_REJECTED');
}

const fastLaneMutation = structuredClone(gate);
fastLaneMutation.groups.FAST_LANE_NO_VERIFIED_OUTREACH[0].contact_authorized = true;
const fastLaneNegativeErrors = validateProviderContactReadiness(fastLaneMutation, operatingState, communicationEvidence);
if (!fastLaneNegativeErrors.includes('FAST_LANE_CONTACT_AUTHORIZED:GOODING_CHRISTIES')) {
  throw new Error('FAST_LANE_CONTACT_AUTHORITY_NEGATIVE_TEST_NOT_REJECTED');
}

console.log(JSON.stringify({
  status: 'PASS',
  prospective_high_fit: gate.groups.HIGH_FIT_APPLICATION_OR_LICENSE_INQUIRY.length,
  prospective_rights_inquiry: gate.groups.RIGHTS_OR_BULK_ACCESS_INQUIRY.length,
  reconciled_no_duplicate_outreach: gate.groups.RECONCILED_NO_DUPLICATE_OUTREACH.length,
  fast_lane_no_verified_outreach: gate.groups.FAST_LANE_NO_VERIFIED_OUTREACH.length,
  duplicate_resend_negative_test: 'REJECTED',
  unauthorized_fast_lane_contact_negative_test: 'REJECTED',
  contact: 'HOLD',
  production: 'HOLD'
}, null, 2));
