#!/usr/bin/env node
import fs from 'node:fs';
import {
  PROVIDER_COMMUNICATION_EVIDENCE_PATH,
  validateProviderCommunicationEvidence
} from './validate-provider-communication-evidence-v1.mjs';

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
  classic: 'coordination/kidults/market/classic-bundle3-provider-response-intake-v1.json',
  communicationEvidence: PROVIDER_COMMUNICATION_EVIDENCE_PATH
};

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const load = () => Object.fromEntries(Object.entries(PATHS).map(([key, path]) => [key, read(path)]));

export function validateProviderOperatingState(documents) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const { index, operating, contract, outreach, pack, dispatch, actionQueue, contactGate,
    psaManifest, psaControls, psaConnection, psaReadiness, gemrate, classic, communicationEvidence } = documents;
  const providers = operating.providers || [];
  const byId = new Map(providers.map(provider => [provider.provider_id, provider]));
  const communicationErrors = validateProviderCommunicationEvidence(communicationEvidence);
  for (const error of communicationErrors) errors.push(`COMMUNICATION_EVIDENCE:${error}`);
  const evidenceEvents = communicationEvidence.events || [];
  const eventsByProvider = new Map();
  for (const event of evidenceEvents) {
    const list = eventsByProvider.get(event.provider_id) || [];
    list.push(event);
    eventsByProvider.set(event.provider_id, list);
  }
  const latestOutboundByProvider = new Map([...eventsByProvider].map(([providerId, events]) => [
    providerId,
    events.filter(event => event.direction === 'OUTBOUND').sort((left, right) =>
      Date.parse(left.occurred_at) - Date.parse(right.occurred_at)).at(-1)
  ]));
  const markdownAnchorExists = (localPath, fragment) => {
    const text = fs.readFileSync(localPath, 'utf8');
    return text.split(/\r?\n/).some(line => {
      const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
      if (!match) return false;
      const anchor = match[1].toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
      return anchor === fragment;
    });
  };
  const localFragmentExists = (localPath, fragment, provider) => {
    if (!fragment) return true;
    if (localPath.endsWith('.md')) return markdownAnchorExists(localPath, fragment);
    let document;
    try { document = JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch { return false; }
    if (Object.prototype.hasOwnProperty.call(document, fragment)) return true;
    if (localPath === PROVIDER_COMMUNICATION_EVIDENCE_PATH) {
      return document.events?.some(event => event.event_id === fragment && event.provider_id === provider.provider_id) === true;
    }
    if (localPath === 'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json') {
      return document.records?.some(record => record.source_id === fragment && provider.fast_lane_source_ids?.includes(fragment)) === true;
    }
    if (localPath === 'coordination/kidults/market/alternate-current-sold-provider-preflight-v1.json') {
      return document.providers?.some(record => record.provider_id === fragment && fragment === provider.provider_id) === true;
    }
    return false;
  };
  const validEvidenceRef = (ref, provider) => {
    if (typeof ref !== 'string' || ref.length < 4) return false;
    if (/^gmail:(?:message|thread):[a-f0-9]+$/.test(ref) || /^https:\/\/github\.com\//.test(ref)) return true;
    const [localPath, fragment = ''] = ref.split('#', 2);
    return !localPath.includes('://') && fs.existsSync(localPath) && localFragmentExists(localPath, fragment, provider);
  };

  check(index.current_operating_state_record_id === operating.id, 'PROVIDER_REGISTRY_POINTER');
  check(index.records?.some(record => record.id === operating.id && record.path === 'records/provider-operating-state-v1.json'),
    'PROVIDER_REGISTRY_RECORD');
  check(operating.status === 'ACTIVE_FAIL_CLOSED', 'OPERATING_STATE_STATUS');
  check(operating.version === '1.1.0', 'OPERATING_STATE_VERSION');
  check(operating.canonical_machine_contract === PATHS.contract, 'MACHINE_CONTRACT_BINDING');
  check(operating.communication_evidence_manifest === PROVIDER_COMMUNICATION_EVIDENCE_PATH, 'COMMUNICATION_EVIDENCE_BINDING');
  check(Date.parse(operating.as_of) >= Date.parse(communicationEvidence.as_of), 'OPERATING_AS_OF_PRECEDES_COMMUNICATION_EVIDENCE');
  const freshnessPolicy = operating.evidence_freshness_policy || {};
  const maxAgeDaysByState = freshnessPolicy.max_age_days_by_state || {};
  check(freshnessPolicy.evaluation_time === 'OPERATING_AS_OF' && freshnessPolicy.future_evidence_forbidden === true &&
    freshnessPolicy.local_fragment_must_resolve === true, 'EVIDENCE_FRESHNESS_POLICY');
  check(JSON.stringify(maxAgeDaysByState) === JSON.stringify({ CLOSED: 365, BOUNDED: 31, CONDITIONAL: 31, HOLD: 31 }),
    'EVIDENCE_MAX_AGE_POLICY');
  const operatingAsOfMs = Date.parse(operating.as_of);
  check(providers.length === 18 && byId.size === 18, 'CANONICAL_PROVIDER_CARDINALITY');
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
    ['MECUM', 'HOLD'],
    ['CGC_CCG', 'HOLD'],
    ['CARDMARKET', 'HOLD'],
    ['CARD_LADDER', 'HOLD'],
    ['MARKET_MOVERS_SCI_ROUTE', 'HOLD'],
    ['HOBBYKOREA_PSA_PROVENANCE', 'HOLD']
  ]);
  for (const [providerId, state] of expected) {
    const provider = byId.get(providerId);
    check(Boolean(provider), `PROVIDER_MISSING:${providerId}`);
    if (!provider) continue;
    check(provider.state === state, `PROVIDER_STATE:${providerId}`);
    check(provider.owner && Object.prototype.hasOwnProperty.call(provider, 'deadline') && provider.next_action &&
      provider.cost_exposure && provider.blocker && provider.evidence_date, `REPORTING_DIMENSIONS:${providerId}`);
    const evidenceDateMs = Date.parse(provider.evidence_date);
    check(Number.isFinite(evidenceDateMs), `EVIDENCE_DATE_INVALID:${providerId}`);
    check(evidenceDateMs <= operatingAsOfMs, `EVIDENCE_DATE_FUTURE:${providerId}`);
    check(operatingAsOfMs - evidenceDateMs <= maxAgeDaysByState[state] * 24 * 60 * 60 * 1000,
      `EVIDENCE_DATE_STALE:${providerId}`);
    check(Array.isArray(provider.evidence_refs) && provider.evidence_refs.length > 0 &&
      provider.evidence_refs.every(ref => validEvidenceRef(ref, provider)), `EVIDENCE_REF_UNRESOLVED:${providerId}`);
    check(provider.communication?.duplicate_outreach_prohibited === true &&
      provider.communication?.resend_authorized === false &&
      provider.communication?.automatic_followup_authorized === false &&
      provider.external_communication_authorized === false, `COMMUNICATION_GUARD:${providerId}`);
    check(provider.acquisition_authorized === false && provider.credential_authorized === false &&
      provider.new_spend_authorized === false && provider.public_release === 'HOLD' && provider.production === 'HOLD',
    `PROTECTED_BOUNDARY:${providerId}`);
  }
  for (const [providerId, events] of eventsByProvider) {
    const provider = byId.get(providerId);
    check(Boolean(provider), `COMMUNICATION_PROVIDER_MISSING:${providerId}`);
    if (!provider) continue;
    const refs = new Set([
      provider.communication?.initial_outbound_evidence_ref,
      provider.communication?.last_outbound_evidence_ref,
      provider.communication?.latest_acknowledgement_evidence_ref
    ].filter(Boolean));
    for (const event of events) check(refs.has(event.evidence_ref), `COMMUNICATION_EVENT_NOT_RECONCILED:${event.event_id}`);
  }
  const fastLaneProviders = providers.filter(provider => Array.isArray(provider.fast_lane_source_ids));
  const fastLaneSourceIds = fastLaneProviders.flatMap(provider => provider.fast_lane_source_ids);
  check(fastLaneProviders.every(provider => typeof provider.operator_id === 'string' && provider.operator_id.length > 2 && typeof provider.ultimate_parent_id === 'string' && provider.ultimate_parent_id.length > 2), 'FAST_LANE_OPERATOR_IDENTITY');
  check(fastLaneSourceIds.length === 12 && new Set(fastLaneSourceIds).size === 12, 'FAST_LANE_SOURCE_PROVIDER_COVERAGE');
  check(fastLaneProviders.every(provider => provider.external_communication_authorized === false && provider.communication?.duplicate_outreach_prohibited === true && provider.communication?.resend_authorized === false && provider.communication?.automatic_followup_authorized === false), 'FAST_LANE_CONTACT_HOLD');
  const contactedFastLaneIds = new Set(['CLASSIC_COM', 'BONHAMS', 'BROAD_ARROW', 'CHRISTIES', 'ICONIC_AUCTIONEERS', 'MECUM']);
  for (const provider of fastLaneProviders) {
    if (contactedFastLaneIds.has(provider.provider_id)) {
      const expectedOutbound = latestOutboundByProvider.get(provider.provider_id);
      check(Boolean(expectedOutbound), `FAST_LANE_OUTBOUND_EVENT_MISSING:${provider.provider_id}`);
      check(provider.communication?.last_outbound_evidence_ref === expectedOutbound?.evidence_ref &&
        provider.communication?.last_outbound_at === expectedOutbound?.occurred_at &&
        provider.communication?.state !== 'NO_VERIFIED_OUTBOUND_OR_RESPONSE_IN_CANONICAL_REGISTRY',
      `FAST_LANE_OUTBOUND_RECONCILIATION:${provider.provider_id}`);
    } else {
      check(provider.communication?.state === 'NO_VERIFIED_OUTBOUND_OR_RESPONSE_IN_CANONICAL_REGISTRY' &&
        provider.communication?.contact_evidence_state === 'UNKNOWN_FAIL_CLOSED',
      `UNSUPPORTED_FAST_LANE_CONTACT_CLAIM:${provider.provider_id}`);
    }
  }

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
  const expectedReconciledIds = [
    'EBAY_MARKETPLACE_INSIGHTS', 'PSA_PREMIUM', 'GEMRATE', 'CLASSIC_COM', 'CGC_CCG', 'CARDMARKET',
    'CARD_LADDER', 'MARKET_MOVERS_SCI_ROUTE', 'HOBBYKOREA_PSA_PROVENANCE', 'BONHAMS',
    'BROAD_ARROW', 'CHRISTIES', 'ICONIC_AUCTIONEERS', 'MECUM'
  ];
  check(reconciledIds.size === expectedReconciledIds.length &&
    expectedReconciledIds.every(providerId => reconciledIds.has(providerId)), 'CONTACT_GATE_RECONCILIATION');

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
  const psaOutbound = latestOutboundByProvider.get('PSA_PREMIUM');
  check(psa?.communication?.last_outbound_evidence_ref === psaOutbound?.evidence_ref &&
    psa?.communication?.last_outbound_at === psaOutbound?.occurred_at &&
    psa?.communication?.latest_provider_response_evidence_ref === 'gmail:message:1a03f28074fb26a6' &&
    psa?.communication?.latest_substantive_rights_response_evidence_ref === 'gmail:message:1a0396dc3b4b7528',
  'PSA_COMMUNICATION_RECONCILIATION');

  const gemrateRecord = byId.get('GEMRATE');
  check(gemrate.activation_decision === 'HOLD' && gemrate.secretless_execution_receipt?.provider_network_calls === 0 &&
    gemrate.secretless_execution_receipt?.external_spend_usd === 0 && gemrate.secretless_execution_receipt?.cases_acquired === 0,
  'GEMRATE_EXECUTION_HOLD');
  check(gemrateRecord?.communication?.latest_provider_response_at === gemrate.source_evidence?.provider_response?.received_at,
    'GEMRATE_RESPONSE_RECONCILIATION');

  const classicRecord = byId.get('CLASSIC_COM');
  check(classic.current_state === 'AWAITING_PROVIDER_RESPONSE' && classic.activation === 'DISABLED' &&
    classic.followup_policy?.status === 'SENT_AWAITING_RESPONSE' && classic.followup_policy?.further_send_authorized === false &&
    classic.followup_policy?.automatic_send_authorized === false,
  'CLASSIC_EXECUTION_HOLD');
  check(classicRecord?.communication?.last_outbound_at === classic.latest_outbound?.sent_at &&
    classicRecord?.communication?.last_outbound_evidence_ref === classic.latest_outbound?.evidence_ref &&
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
  ['tamper-mecum-outbound', value => { value.operating.providers.find(record => record.provider_id === 'MECUM').communication.last_outbound_evidence_ref = 'gmail:message:deadbeef'; }, 'FAST_LANE_OUTBOUND_RECONCILIATION:MECUM'],
  ['stale-operating-as-of', value => { value.operating.as_of = '1900-01-01T00:00:00Z'; }, 'OPERATING_AS_OF_PRECEDES_COMMUNICATION_EVIDENCE'],
  ['ancient-provider-evidence-date', value => { value.operating.providers.find(record => record.provider_id === 'CARDMARKET').evidence_date = '1900-01-01'; }, 'EVIDENCE_DATE_STALE:CARDMARKET'],
  ['future-provider-evidence-date', value => { value.operating.providers.find(record => record.provider_id === 'CARDMARKET').evidence_date = '2099-01-01'; }, 'EVIDENCE_DATE_FUTURE:CARDMARKET'],
  ['fabricated-evidence-ref', value => { value.operating.providers.find(record => record.provider_id === 'CARDMARKET').evidence_refs = ['missing://fabricated-evidence']; }, 'EVIDENCE_REF_UNRESOLVED:CARDMARKET'],
  ['fabricated-existing-file-fragment', value => { value.operating.providers.find(record => record.provider_id === 'CARDMARKET').evidence_refs = [`${PROVIDER_COMMUNICATION_EVIDENCE_PATH}#fabricated`]; }, 'EVIDENCE_REF_UNRESOLVED:CARDMARKET'],
  ['drop-communication-event', value => { value.communicationEvidence.events.pop(); }, 'COMMUNICATION_EVIDENCE:EVENT_CARDINALITY']
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
