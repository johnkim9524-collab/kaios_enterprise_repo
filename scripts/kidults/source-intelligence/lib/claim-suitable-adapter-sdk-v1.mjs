import crypto from 'node:crypto';

const schemaVersion = 'kidults-claim-suitable-adapter-event-v1';
const currencyPattern = /^[A-Z]{3}$/;
const allowedRightsStates = new Set(['ALLOW']);
const soldTerminalStates = new Set(['SOLD']);
const exposureOutcomeStates = new Set(['SOLD','UNSOLD','WITHDRAWN','CENSORED']);
const forbiddenSoldSignals = ['listing','bid','ask','offer','reserve'];

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
export const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
export const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const validateCommon = (event) => {
  ensure(event?.schema_version === schemaVersion, 'ADAPTER_SCHEMA_VERSION_INVALID');
  ensure(nonEmpty(event.source_record_id), 'ADAPTER_SOURCE_RECORD_ID_MISSING');
  ensure(nonEmpty(event.object_identity), 'ADAPTER_OBJECT_IDENTITY_MISSING');
  ensure(nonEmpty(event.source_owner), 'ADAPTER_SOURCE_OWNER_MISSING');
  ensure(nonEmpty(event.factual_origin), 'ADAPTER_FACTUAL_ORIGIN_MISSING');
  ensure(event.source_owner !== 'UNKNOWN', 'ADAPTER_SOURCE_OWNER_UNKNOWN');
  ensure(event.factual_origin !== 'UNKNOWN', 'ADAPTER_FACTUAL_ORIGIN_UNKNOWN');
  ensure(event.rights && typeof event.rights === 'object', 'ADAPTER_RIGHTS_MISSING');
  for (const purpose of ['collect','store','derive']) {
    ensure(allowedRightsStates.has(event.rights[purpose]), `ADAPTER_RIGHTS_${purpose.toUpperCase()}_NOT_ALLOW`);
  }
  ensure(event.provider_direct_to_truth === false, 'ADAPTER_PROVIDER_DIRECT_TRUTH_FORBIDDEN');
  ensure(event.provider_direct_to_projection === false, 'ADAPTER_PROVIDER_DIRECT_PROJECTION_FORBIDDEN');
  ensure(event.fixture_only === true, 'ADAPTER_FIXTURE_FLAG_REQUIRED');
  ensure(event.empirical === false, 'ADAPTER_FIXTURE_EMPIRICAL_FORBIDDEN');
  ensure(event.promotable === false, 'ADAPTER_FIXTURE_PROMOTION_FORBIDDEN');
  ensure(nonEmpty(event.source_profile_id), 'ADAPTER_SOURCE_PROFILE_ID_MISSING');
  ensure(nonEmpty(event.source_record_locator), 'ADAPTER_SOURCE_RECORD_LOCATOR_MISSING');
};

export function validateSoldFixture(event) {
  validateCommon(event);
  ensure(event.event_type === 'TERMINAL_SOLD_TRANSACTION', 'ADAPTER_SOLD_EVENT_TYPE_INVALID');
  ensure(soldTerminalStates.has(event.terminal_state), 'ADAPTER_TERMINAL_SOLD_STATE_REQUIRED');
  ensure(Number.isFinite(Number(event.realized_price)) && Number(event.realized_price) > 0, 'ADAPTER_REALIZED_PRICE_INVALID');
  ensure(currencyPattern.test(String(event.currency || '')), 'ADAPTER_CURRENCY_INVALID');
  ensure(validTime(event.event_occurred_at), 'ADAPTER_EVENT_TIME_INVALID');
  ensure(validTime(event.source_observed_at), 'ADAPTER_SOURCE_OBSERVED_TIME_INVALID');
  ensure(Date.parse(event.source_observed_at) >= Date.parse(event.event_occurred_at), 'ADAPTER_TEMPORAL_ORDER_INVALID');
  ensure(nonEmpty(event.condition_or_comparability), 'ADAPTER_CONDITION_OR_COMPARABILITY_MISSING');
  for (const signal of forbiddenSoldSignals) {
    ensure(event[`${signal}_only`] !== true, `ADAPTER_${signal.toUpperCase()}_AS_SOLD_FORBIDDEN`);
  }
  const duplicateGrain = {
    source_profile_id: event.source_profile_id,
    source_record_id: event.source_record_id,
    object_identity: event.object_identity,
    event_occurred_at: event.event_occurred_at,
    realized_price: Number(event.realized_price),
    currency: event.currency
  };
  return {
    validation_state: 'FIXTURE_VERIFIED_NON_PROMOTABLE',
    evidence_class: 'CURRENT_SOLD_TRANSACTION',
    event_type: event.event_type,
    duplicate_grain: sha256(stableJson(duplicateGrain)),
    rights_state: 'ALLOW_FOR_FIXTURE_CONTRACT_ONLY',
    empirical: false,
    promotable: false
  };
}

export function validateExposureFixture(event) {
  validateCommon(event);
  ensure(event.event_type === 'EXPOSURE_AND_TERMINAL_OUTCOME', 'ADAPTER_EXPOSURE_EVENT_TYPE_INVALID');
  ensure(validTime(event.exposure_started_at), 'ADAPTER_EXPOSURE_START_INVALID');
  ensure(exposureOutcomeStates.has(event.outcome_state), 'ADAPTER_OUTCOME_STATE_INVALID');
  if (event.outcome_state === 'CENSORED') {
    ensure(validTime(event.censored_at), 'ADAPTER_CENSORED_AT_REQUIRED');
    ensure(Date.parse(event.censored_at) >= Date.parse(event.exposure_started_at), 'ADAPTER_CENSOR_TEMPORAL_ORDER_INVALID');
    ensure(event.exposure_ended_at == null, 'ADAPTER_CENSORED_END_CONFLICT');
  } else {
    ensure(validTime(event.exposure_ended_at), 'ADAPTER_EXPOSURE_END_REQUIRED');
    ensure(Date.parse(event.exposure_ended_at) >= Date.parse(event.exposure_started_at), 'ADAPTER_EXPOSURE_TEMPORAL_ORDER_INVALID');
  }
  ensure(validTime(event.source_observed_at), 'ADAPTER_SOURCE_OBSERVED_TIME_INVALID');
  const terminalTime = event.outcome_state === 'CENSORED' ? event.censored_at : event.exposure_ended_at;
  ensure(Date.parse(event.source_observed_at) >= Date.parse(terminalTime), 'ADAPTER_OBSERVATION_BEFORE_OUTCOME');
  ensure(event.failed_or_withdrawn_state_explicit === true, 'ADAPTER_FAILED_WITHDRAWN_STATE_NOT_EXPLICIT');
  const duplicateGrain = {
    source_profile_id: event.source_profile_id,
    source_record_id: event.source_record_id,
    object_identity: event.object_identity,
    exposure_started_at: event.exposure_started_at,
    outcome_state: event.outcome_state,
    exposure_ended_at: event.exposure_ended_at || null,
    censored_at: event.censored_at || null
  };
  return {
    validation_state: 'FIXTURE_VERIFIED_NON_PROMOTABLE',
    evidence_class: 'LIQUIDITY_TIME_TO_SALE_EXPOSURE',
    event_type: event.event_type,
    duplicate_grain: sha256(stableJson(duplicateGrain)),
    rights_state: 'ALLOW_FOR_FIXTURE_CONTRACT_ONLY',
    empirical: false,
    promotable: false
  };
}

export function validateClaimSuitableFixture(event) {
  if (event?.event_type === 'TERMINAL_SOLD_TRANSACTION') return validateSoldFixture(event);
  if (event?.event_type === 'EXPOSURE_AND_TERMINAL_OUTCOME') return validateExposureFixture(event);
  throw new Error('ADAPTER_EVENT_TYPE_UNSUPPORTED');
}

export function buildFixture({ familyId, evidenceClass, ordinal = 1 }) {
  const common = {
    schema_version: schemaVersion,
    source_profile_id: `fixture-profile::${familyId}`,
    source_record_id: `fixture-record-${ordinal}`,
    source_record_locator: `fixture://${familyId}/${ordinal}`,
    object_identity: `fixture-object::${familyId}::${ordinal}`,
    source_owner: `fixture-owner::${familyId}`,
    factual_origin: `fixture-origin::${familyId}`,
    rights: { collect: 'ALLOW', store: 'ALLOW', derive: 'ALLOW', display: 'HOLD', redistribute: 'HOLD' },
    provider_direct_to_truth: false,
    provider_direct_to_projection: false,
    fixture_only: true,
    empirical: false,
    promotable: false,
    source_observed_at: '2026-08-23T00:00:00.000Z'
  };
  if (evidenceClass === 'CURRENT_SOLD_TRANSACTION') return {
    ...common,
    event_type: 'TERMINAL_SOLD_TRANSACTION',
    terminal_state: 'SOLD',
    realized_price: 1000 + ordinal,
    currency: 'USD',
    event_occurred_at: '2026-08-22T00:00:00.000Z',
    condition_or_comparability: 'FIXTURE_CONDITION_SEGMENT',
    listing_only: false,
    bid_only: false,
    ask_only: false,
    offer_only: false,
    reserve_only: false
  };
  if (evidenceClass === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE') return {
    ...common,
    event_type: 'EXPOSURE_AND_TERMINAL_OUTCOME',
    exposure_started_at: '2026-08-01T00:00:00.000Z',
    exposure_ended_at: '2026-08-22T00:00:00.000Z',
    censored_at: null,
    outcome_state: 'SOLD',
    failed_or_withdrawn_state_explicit: true
  };
  throw new Error(`ADAPTER_FIXTURE_EVIDENCE_CLASS_UNSUPPORTED:${evidenceClass}`);
}

export const sdkMetadata = Object.freeze({
  id: 'kidults-claim-suitable-adapter-sdk-v1',
  version: '1.0.0',
  schema_version: schemaVersion,
  supported_evidence_classes: ['CURRENT_SOLD_TRANSACTION','LIQUIDITY_TIME_TO_SALE_EXPOSURE'],
  fixture_only: true,
  empirical: false,
  promotable: false
});
