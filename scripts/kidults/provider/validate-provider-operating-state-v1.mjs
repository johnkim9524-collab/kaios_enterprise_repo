#!/usr/bin/env node
import fs from 'node:fs';

const PATHS = {
  index: 'coordination/kidults/registry/provider/index.json',
  operating: 'coordination/kidults/registry/provider/records/provider-operating-state-v1.json',
  contract: 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json',
  outreach: 'apps/kidults-enterprise-staging/public/a13-b10/data/provider-outreach.json',
  pack: 'apps/kidults-enterprise-staging/public/a13-b10/data/provider-outreach-pack.json',
  dispatch: 'apps/kidults-enterprise-staging/public/a13-b10/data/provider-dispatch-ledger.json',
  actionQueue: 'coordination/kidults/index/provider-authorization-action-queue-v1.json',
  contactGate: 'coordination/kidults/provider/provider-contact-readiness-gate-v1.json',
  psaManifest: 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json',
  psaControls: 'coordination/kidults/provider/psa-120-admission-controls-receipt-v1.json',
  psaConnection: 'coordination/kidults/provider/psa-premium-api-connection-receipt-v1.json',
  psaReadiness: 'coordination/kidults/provider/psa-private-evaluation-readiness-receipt-v2.json',
  gemrate: 'coordination/kidults/provider/gemrate-bounded-pilot-preflight-v1.json',
  classic: 'coordination/kidults/market/classic-bundle3-provider-response-intake-v1.json'
};

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const load = () => Object.fromEntries(Object.entries(PATHS).map(([key, path]) => [key, read(path)]));

export function validateProviderOperatingState(documents) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const { index, operating, contract, outreach, pack, dispatch, actionQueue, contactGate,
    psaManifest, psaControls, psaConnection, psaReadiness, gemrate, classic } = documents;
  const providers = operating.providers || [];
  const byId = new Map(providers.map(provider => [provider.provider_id, provider]));

  check(index.current_operating_state_record_id === operating.id, 'PROVIDER_REGISTRY_POINTER');
  check(index.records?.some(record => record.id === operating.id && record.path === 'records/provider-operating-state-v1.json'),
    'PROVIDER_REGISTRY_RECORD');
  check(operating.status === 'ACTIVE_FAIL_CLOSED', 'OPERATING_STATE_STATUS');
  check(operating.canonical_machine_contract === PATHS.contract, 'MACHINE_CONTRACT_BINDING');
  check(providers.length === 13 && byId.size === 13, 'CANONICAL_PROVIDER_CARDINALITY');
  check(operating.communication_reconciliation?.duplicate_or_automatic_outbound_allowed === false,
    'GLOBAL_DUPLICATE_OUTREACH_BOUNDARY');
  check(operating.authority_boundary?.external_communication === 'NOT_AUTHORIZED_BY_THIS_RECORD' &&
    operating.authority_boundary?.new_spend === 'NOT_AUTHORIZED_BY_THIS_RECORD' &&
    operating.authority_boundary?.credential_creation_or_activation === 'NOT_AUTHORIZED_BY_THIS_RECORD' &&
    operating.authority_boundary?.production === 'HOLD', 'GLOBAL_AUTHORITY_BOUNDARY');

  const expected = new Map([
    ['EBAY_MARKETPLACE_INSIGHTS', 'CLOSED'],
    ['PSA_PREMIUM', 'BOUNDED'],
    ['GEMRATE', 'CONDITIONAL'],
    ['CLASSIC_COM', 'HOLD'],
    ['BONHAMS', 'HOLD'],
    ['BROAD_ARROW', 'HOLD'],
    ['CHRISTIES', 'HOLD'],
    ['GOODING_CHRISTIES', 'HOLD'],
    ['SOTHEBYS', 'HOLD'],
    ['BARRETT_JACKSON', 'HOLD'],
    ['COLLECTING_CARS', 'HOLD'],
    ['ICONIC_AUCTIONEERS', 'HOLD'],
    ['MECUM', 'HOLD']
  ]);
  for (const [providerId, state] of expected) {
    const provider = byId.get(providerId);
    check(Boolean(provider), `PROVIDER_MISSING:${providerId}`);
    if (!provider) continue;
    check(provider.state === state, `PROVIDER_STATE:${providerId}`);
    check(provider.owner && Object.prototype.hasOwnProperty.call(provider, 'deadline') && provider.next_action &&
      provider.cost_exposure && provider.blocker && provider.evidence_date, `REPORTING_DIMENSIONS:${providerId}`);
    check(provider.communication?.duplicate_outreach_prohibited === true &&
      provider.communication?.resend_authorized === false &&
      provider.communication?.automatic_followup_authorized === false &&
      provider.external_communication_authorized === false, `COMMUNICATION_GUARD:${providerId}`);
    check(provider.acquisition_authorized === false && provider.credential_authorized === false &&
      provider.new_spend_authorized === false && provider.public_release === 'HOLD' && provider.production === 'HOLD',
    `PROTECTED_BOUNDARY:${providerId}`);
  }
  const fastLaneProviders = providers.filter(provider => Array.isArray(provider.fast_lane_source_ids));
  const fastLaneSourceIds = fastLaneProviders.flatMap(provider => provider.fast_lane_source_ids);
  check(fastLaneProviders.every(provider => typeof provider.operator_id === 'string' && provider.operator_id.length > 2 && typeof provider.ultimate_parent_id === 'string' && provider.ultimate_parent_id.length > 2), 'FAST_LANE_OPERATOR_IDENTITY');
  check(fastLaneSourceIds.length === 12 && new Set(fastLaneSourceIds).size === 12, 'FAST_LANE_SOURCE_PROVIDER_COVERAGE');
  check(fastLaneProviders.every(provider => provider.external_communication_authorized === false && provider.communication?.duplicate_outreach_prohibited === true && provider.communication?.resend_authorized === false && provider.communication?.automatic_followup_authorized === false), 'FAST_LANE_CONTACT_HOLD');
  check(fastLaneProviders.filter(provider => provider.provider_id !== 'CLASSIC_COM').every(provider => provider.communication?.state === 'NO_VERIFIED_OUTBOUND_OR_RESPONSE_IN_CANONICAL_REGISTRY' && provider.communication?.contact_evidence_state === 'UNKNOWN_FAIL_CLOSED'), 'UNSUPPORTED_FAST_LANE_CONTACT_CLAIM');

  check(contract.standing_decisions?.['eBay Marketplace Insights']?.state === byId.get('EBAY_MARKETPLACE_INSIGHTS')?.state,
    'EBAY_STRATEGY_STATE_DRIFT');
  check(contract.standing_decisions?.['PSA Premium']?.state === byId.get('PSA_PREMIUM')?.state,
    'PSA_STRATEGY_STATE_DRIFT');
  check(contract.standing_decisions?.GemRate?.state === byId.get('GEMRATE')?.state,
    'GEMRATE_STRATEGY_STATE_DRIFT');

  const ebay = byId.get('EBAY_MARKETPLACE_INSIGHTS');
  const ebayEvents = (dispatch.events || []).filter(event => event.candidateId === 'ebay-marketplace-insights' && event.type === 'contacted');
  const ebayOutreach = outreach.outreachQueue?.find(record => record.candidateId === 'ebay-marketplace-insights');
  const ebayPack = pack.packs?.find(record => record.candidateId === 'ebay-marketplace-insights');
  const ebayAction = actionQueue.actions?.find(record => record.provider === 'eBay');
  check(ebayEvents.length === 1 && ebayEvents[0].recordedAt === ebay?.communication?.last_outbound_at,
    'EBAY_CONTACT_EVENT_RECONCILIATION');
  check(ebayOutreach?.status === 'closed' && ebayOutreach?.canonicalProviderId === 'EBAY_MARKETPLACE_INSIGHTS' &&
    ebayOutreach?.duplicateOutreachProhibited === true && ebayOutreach?.resendAuthorized === false,
  'EBAY_OUTREACH_PROJECTION');
  check(ebayPack?.status === 'sent-closed' && ebayPack?.duplicateOutreachProhibited === true && ebayPack?.resendAuthorized === false,
    'EBAY_PACK_PROJECTION');
  check(ebayAction?.state === 'CLOSED_NO_DUPLICATE_OUTREACH' && ebayAction?.external_communication_authorized === false &&
    ebayAction?.resend_authorized === false, 'EBAY_ACTION_QUEUE');

  const reconciledIds = new Set((contactGate.groups?.RECONCILED_NO_DUPLICATE_OUTREACH || []).map(record => record.canonical_provider_id));
  check(['EBAY_MARKETPLACE_INSIGHTS', 'PSA_PREMIUM', 'GEMRATE', 'CLASSIC_COM'].every(providerId => reconciledIds.has(providerId)), 'CONTACT_GATE_RECONCILIATION');

  const psa = byId.get('PSA_PREMIUM');
  check(psaManifest.declared_known_count === 2 && psaManifest.provenance_bound_admissible_count === 0 &&
    psaManifest.remaining_required === 120, 'PSA_MANIFEST_TRUTH');
  check(psa?.manifest_progress?.declared_known_hints === 2 &&
    psa?.manifest_progress?.declared_known_hints_count_as_progress === false &&
    psa?.manifest_progress?.provenance_bound_admissible === 0 && psa?.manifest_progress?.remaining_admissible === 120,
  'PSA_CANONICAL_PROGRESS');
  check(psaControls.empirical?.declared_known_cert_hints === 2 &&
    psaControls.empirical?.declared_known_cert_hints_count_as_progress === false &&
    psaControls.empirical?.provenance_bound_admissible_manifest === '0/120' &&
    !Object.prototype.hasOwnProperty.call(psaControls.empirical || {}, 'lawful_known_cert_manifest'), 'PSA_RECEIPT_WORDING');
  check(psaConnection.execution_evidence?.api_connection_state === 'VERIFIED_PASS' &&
    psaConnection.operational_readiness?.declared_known_cert_hints === 2 &&
    psaConnection.operational_readiness?.provenance_bound_admissible_manifest === '0_OF_120' &&
    psaConnection.operational_readiness?.acquisition_progress === '0_OF_120', 'PSA_CONNECTION_TRUTH');
  check(psaReadiness.state === 'VERIFIED_PASS_CONTROLS_RUNTIME_ACTIVATION_HOLD' &&
    psaReadiness.facts?.some(fact => fact.includes('manifest remains 0 of 120')) &&
    psaReadiness.uncertainties?.some(value => value.includes('No persistent governed runner')),
  'PSA_RUNTIME_READINESS_TRUTH');

  const gemrateRecord = byId.get('GEMRATE');
  check(gemrate.activation_decision === 'HOLD' && gemrate.secretless_execution_receipt?.provider_network_calls === 0 &&
    gemrate.secretless_execution_receipt?.external_spend_usd === 0 && gemrate.secretless_execution_receipt?.cases_acquired === 0,
  'GEMRATE_EXECUTION_HOLD');
  check(gemrateRecord?.communication?.latest_provider_response_at === gemrate.source_evidence?.provider_response?.received_at,
    'GEMRATE_RESPONSE_RECONCILIATION');

  const classicRecord = byId.get('CLASSIC_COM');
  check(classic.current_state === 'AWAITING_PROVIDER_RESPONSE' && classic.activation === 'DISABLED' &&
    classic.followup_policy?.status === 'PLANNED_NOT_SENT' && classic.followup_policy?.automatic_send_authorized === false,
  'CLASSIC_EXECUTION_HOLD');
  check(classicRecord?.communication?.last_outbound_at === classic.latest_outbound?.sent_at &&
    classicRecord?.communication?.followup_not_before === classic.followup_policy?.not_before &&
    classicRecord?.communication?.response_after_last_outbound_observed === classic.response_observation?.provider_reply_after_latest_outbound,
  'CLASSIC_COMMUNICATION_RECONCILIATION');

  return [...new Set(errors)].sort();
}

const documents = load();
const errors = validateProviderOperatingState(documents);
if (errors.length) throw new Error(`PROVIDER_OPERATING_STATE_INVALID:${errors.join(',')}`);

const negativeMutations = [];
for (const [name, mutate, expectedCode] of [
  ['duplicate-ebay-outreach', value => value.dispatch.events.push(structuredClone(value.dispatch.events[0])), 'EBAY_CONTACT_EVENT_RECONCILIATION'],
  ['inflate-psa-declared-hints', value => { value.operating.providers.find(record => record.provider_id === 'PSA_PREMIUM').manifest_progress.provenance_bound_admissible = 2; }, 'PSA_CANONICAL_PROGRESS'],
  ['authorize-classic-resend', value => { value.operating.providers.find(record => record.provider_id === 'CLASSIC_COM').communication.resend_authorized = true; }, 'COMMUNICATION_GUARD:CLASSIC_COM'],
  ['drop-fast-lane-provider-binding', value => { delete value.operating.providers.find(record => record.provider_id === 'MECUM').operator_id; }, 'FAST_LANE_OPERATOR_IDENTITY'],
  ['invent-fast-lane-outreach', value => { value.operating.providers.find(record => record.provider_id === 'MECUM').communication.state = 'OUTBOUND_SENT'; }, 'UNSUPPORTED_FAST_LANE_CONTACT_CLAIM']
]) {
  const candidate = structuredClone(documents);
  mutate(candidate);
  const observed = validateProviderOperatingState(candidate);
  if (!observed.includes(expectedCode)) throw new Error(`NEGATIVE_MUTATION_NOT_REJECTED:${name}`);
  negativeMutations.push({ name, rejected_by: expectedCode });
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  canonical_provider_count: documents.operating.providers.length,
  states: Object.fromEntries(documents.operating.providers.map(provider => [provider.provider_id, provider.state])),
  psa_declared_known_hints: 2,
  psa_provenance_bound_admissible: '0/120',
  duplicate_outreach_authorized: false,
  negative_mutations: negativeMutations,
  external_communication: 'HOLD',
  production: 'HOLD'
}, null, 2));
