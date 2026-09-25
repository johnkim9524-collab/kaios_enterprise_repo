/**
 * Shared, side-effect-free Sentinel receipt contract.
 * Envelope validity does NOT establish producer health or permission to promote.
 * Success/HOLD/error paths retain the existing v1 digest and identity rules.
 */
import crypto from 'node:crypto';

export const CORE_FOUR_PRODUCER_IDS = Object.freeze([
  'SHADOW', 'REQUIREMENT', 'RESERVE', 'CANONICAL_TRUTH',
]);
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const fail = code => { throw new Error(code); };

export function stableHealthJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableHealthJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableHealthJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function sealHealthReceipt(base) {
  const snapshot = JSON.parse(JSON.stringify(base));
  if (stableHealthJson(base) !== stableHealthJson(snapshot)) fail('SENTINEL_RECEIPT_NOT_JSON_STABLE');
  return {...snapshot, receipt_digest: sha256(stableHealthJson(snapshot))};
}

/**
 * A failed observation is not evidence that all four producers failed.
 * Give every producer an explicit unevaluated HOLD row, retain the original
 * observer failure at the top level, and keep the overall verdict fail-closed.
 * Invalid/missing source identity is NOT repaired or guessed here: the consumer
 * will still reject it under the existing binding checks.
 */
export function buildSentinelObservationFailure(error, env, observedAt = new Date().toISOString()) {
  const producers = CORE_FOUR_PRODUCER_IDS.map(id => ({
    id,
    state: 'VERIFIED_HOLD',
    failure_class: 'OBSERVATION_FAILED_NOT_EVALUATED',
    selected_run_id: null,
    superseded_red_run_ids: [],
    artifact_transport_verified: false,
    artifact_content_validated: false,
  }));
  return sealHealthReceipt({
    receipt_id: 'kpmo-continuous-assurance-sentinel-health-v1',
    version: '1.0.0',
    state: 'VERIFIED_FAIL',
    coverage_scope: 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',
    repository: env.GITHUB_REPOSITORY || null,
    observer_run_id: env.GITHUB_RUN_ID || null,
    observer_run_attempt: env.GITHUB_RUN_ATTEMPT || null,
    semantic_content_verified: false,
    runtime_health_proven: false,
    source_sha: env.GITHUB_SHA || null,
    observed_at: observedAt,
    failure_class: String(error?.message || error),
    producers,
    failed_producers: [],
    waiting_producers: [...CORE_FOUR_PRODUCER_IDS],
    whole_platform_authority: false,
    promotion_eligible: false,
    empirical_delta: 0,
    provider_authority: false,
    database_authority: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}

/**
 * A complete but unevaluated producer list describes an OBSERVER failure,
 * not a producer-health aggregate. This predicate recognizes that one exact
 * non-authorizing error shape; source identity and digest are checked by
 * consumers before using it. It cannot turn any failure into HOLD or PASS.
 */
export function isUnevaluatedSentinelFailure(receipt) {
  return receipt?.state === 'VERIFIED_FAIL' &&
    typeof receipt.failure_class === 'string' && receipt.failure_class.trim().length > 0 &&
    receipt.semantic_content_verified === false && receipt.runtime_health_proven === false &&
    Array.isArray(receipt.producers) && receipt.producers.length === CORE_FOUR_PRODUCER_IDS.length &&
    receipt.producers.every((producer, index) =>
      producer?.id === CORE_FOUR_PRODUCER_IDS[index] &&
      producer.state === 'VERIFIED_HOLD' &&
      producer.failure_class === 'OBSERVATION_FAILED_NOT_EVALUATED' &&
      producer.selected_run_id === null &&
      Array.isArray(producer.superseded_red_run_ids) && producer.superseded_red_run_ids.length === 0 &&
      producer.artifact_transport_verified === false && producer.artifact_content_validated === false);
}

/** Extracted without weakening the original inline consumer's checks. */
export function validateHealthReceipt(receipt, env) {
  const sourceSha = env.KPMO_SOURCE_SHA || env.GITHUB_SHA || '';
  if (!SHA_PATTERN.test(sourceSha)) fail('INLINE_HEALTH_GATE_SOURCE_SHA_INVALID');
  if (env.GITHUB_SHA !== sourceSha) fail('INLINE_HEALTH_GATE_SOURCE_SHA_DIVERGENCE');
  if (receipt?.receipt_id !== 'kpmo-continuous-assurance-sentinel-health-v1') fail('INLINE_HEALTH_GATE_RECEIPT_ID');
  if (receipt?.coverage_scope !== 'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM') fail('INLINE_HEALTH_GATE_SCOPE');
  if (receipt?.repository !== env.GITHUB_REPOSITORY || receipt?.source_sha !== sourceSha) fail('INLINE_HEALTH_GATE_SOURCE_BINDING');
  if (Number(receipt?.observer_run_id) !== Number(env.GITHUB_RUN_ID) || Number(receipt?.observer_run_attempt) !== Number(env.GITHUB_RUN_ATTEMPT)) fail('INLINE_HEALTH_GATE_OBSERVER_BINDING');
  if (!DIGEST_PATTERN.test(receipt?.receipt_digest || '')) fail('INLINE_HEALTH_GATE_DIGEST_FORMAT');
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt_digest;
  if (receipt.receipt_digest !== sha256(stableHealthJson(unsigned))) fail('INLINE_HEALTH_GATE_DIGEST_MISMATCH');
  if (receipt?.whole_platform_authority !== false || receipt?.promotion_eligible !== false || receipt?.provider_authority !== false || receipt?.database_authority !== false) fail('INLINE_HEALTH_GATE_AUTHORITY_BOUNDARY');
  if (receipt?.public !== 'HOLD' || receipt?.production !== 'HOLD' || receipt?.g5 !== 'HOLD') fail('INLINE_HEALTH_GATE_HOLD_BOUNDARY');
  if (!Array.isArray(receipt?.producers) || receipt.producers.length !== 4) fail('INLINE_HEALTH_GATE_PRODUCER_CARDINALITY');
  const ids = receipt.producers.map(producer => producer?.id).sort();
  if (ids.join(',') !== [...CORE_FOUR_PRODUCER_IDS].sort().join(',')) fail('INLINE_HEALTH_GATE_PRODUCER_SET');
  return sourceSha;
}
