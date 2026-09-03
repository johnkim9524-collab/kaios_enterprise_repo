import crypto from 'node:crypto';
import { isIP } from 'node:net';

export const PRINCIPLES = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

export const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;

export const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
export const hashText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
export const digestObject = (value) => hashText(JSON.stringify(stable(value)));
export const uniq = (values) => [...new Set((values || []).filter(Boolean))].sort();
export const countBy = (values, keyFn) => Object.fromEntries(
  [...values.reduce((map, value) => map.set(keyFn(value), (map.get(keyFn(value)) || 0) + 1), new Map())]
    .sort(([left], [right]) => String(left).localeCompare(String(right))),
);
export const idFor = (prefix, value) => `${prefix}_${crypto.createHash('sha256')
  .update(JSON.stringify(stable(value))).digest('hex').slice(0, 32)}`;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const secureHttps = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const placeholder = host === 'example.com' || host.endsWith('.example.com') || host.endsWith('.example')
      || host === 'example.org' || host.endsWith('.example.org') || host === 'example.net' || host.endsWith('.example.net')
      || host.endsWith('.test') || host.endsWith('.invalid') || host.endsWith('.localhost');
    const ipv4 = isIP(host) === 4 ? host.split('.').map(Number) : null;
    const privateIpv4 = ipv4 && (ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] >= 224
      || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      || (ipv4[0] === 192 && [0, 2, 168].includes(ipv4[1])) || (ipv4[0] === 198 && [18, 19, 51].includes(ipv4[1]))
      || (ipv4[0] === 203 && ipv4[1] === 0 && ipv4[2] === 113));
    const normalizedIpv6 = host.replace(/^\[|\]$/g, '');
    const privateIpv6 = isIP(normalizedIpv6) === 6 && (/^(?:::|::1)$/.test(normalizedIpv6)
      || /^(?:fc|fd|fe[89ab]|2001:db8)/i.test(normalizedIpv6));
    return url.protocol === 'https:' && Boolean(host) && !url.username && !url.password
      && host !== 'localhost' && !placeholder && !privateIpv4 && !privateIpv6;
  } catch {
    return false;
  }
};
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const validTime = (value) => {
  if (typeof value !== 'string' || !STRICT_UTC.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const canonical = new Date(value).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
};
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const REQUIRED_CURRENT_SOLD_EVIDENCE_FIELDS = [
  'sample_purpose',
  'claim_target',
  'source_id',
  'source_record_id',
  'sample_plan_id',
  'sample_plan_sha256',
  'sample_plan_registration_receipt_id',
  'sample_plan_registration_receipt_sha256',
  'sample_plan_artifact_ref',
  'sample_plan_registered_at',
  'sampling_frame_id',
  'sample_unit_id',
  'license_evidence_refs',
];
const REQUIRED_RIGHTS_ASSERTION_FIELDS = ['source_content_snapshot_sha256'];
const ARTIFACT_SHA256 = /^artifact:sha256:[0-9a-f]{64}$/;

function deriveSampleGovernance(contract, samplePolicy) {
  const configured = contract.current_sold_sample_governance;
  requireCondition(configured && typeof configured === 'object' && !Array.isArray(configured), 'P3_SAMPLE_GOVERNANCE_CONFIG_MISSING');
  requireCondition(configured.canonical_policy === 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json', 'P3_SAMPLE_POLICY_PATH_INVALID');
  requireCondition(configured.tier_selection === 'DERIVE_EXACTLY_FROM_CANONICAL_TIER_PURPOSE_AND_CLAIM_TARGET', 'P3_SAMPLE_TIER_SELECTION_INVALID');
  requireCondition(configured.claim_target === 'DATED_OBSERVED_SOLD_TRANSACTION'
    && configured.pair_purpose === 'SCHEMA_AND_BOUNDARY_SMOKE'
    && configured.cohort_class === 'LAWFUL_CURRENT_SOLD_SAMPLE'
    && configured.cohort_mode === 'EMPIRICAL_CANARY', 'P3_SAMPLE_PURPOSE_OR_CLAIM_INVALID');
  requireCondition(JSON.stringify(configured.required_current_sold_evidence_fields) === JSON.stringify(REQUIRED_CURRENT_SOLD_EVIDENCE_FIELDS), 'P3_REQUIRED_CURRENT_SOLD_EVIDENCE_FIELDS_INVALID');
  requireCondition(JSON.stringify(configured.required_rights_assertion_fields) === JSON.stringify(REQUIRED_RIGHTS_ASSERTION_FIELDS), 'P3_REQUIRED_RIGHTS_ASSERTION_FIELDS_INVALID');
  requireCondition(configured.sample_plan_must_precede_observation === true
    && configured.sample_units_must_be_unique === true
    && configured.all_current_sold_records_must_share_one_pre_registered_plan_and_frame === true
    && configured.fixed_platform_wide_sample_minimum_forbidden === true, 'P3_SAMPLE_GOVERNANCE_RULES_INVALID');
  requireCondition(samplePolicy?.id === configured.policy_id && samplePolicy?.version === configured.policy_version, 'P3_SAMPLE_POLICY_ID_VERSION_MISMATCH');
  const matchingTiers = (samplePolicy.tiers || []).filter((tier) => tier.purpose === configured.pair_purpose
    && tier.claim_target === configured.claim_target);
  requireCondition(matchingTiers.length === 1, 'P3_SAMPLE_PURPOSE_TIER_NOT_UNIQUE');
  const [tier] = matchingTiers;
  requireCondition(nonempty(tier.id) && Number.isInteger(tier.min_n) && Number.isInteger(tier.max_n)
    && tier.min_n > 0 && tier.max_n >= tier.min_n, 'P3_SAMPLE_TIER_BOUNDS_INVALID');
  const promotion = samplePolicy.promotion_matrix?.[tier.id];
  requireCondition(promotion && nonempty(promotion.maximum_claim) && promotion.release_allowed === false, 'P3_SAMPLE_TIER_PROMOTION_BOUNDARY_INVALID');
  requireCondition(tier.id === 'CANARY' && tier.min_n === 5 && tier.max_n === 5
    && tier.statistical_claim === false && promotion.maximum_claim === 'SCHEMA_BOUNDARY_SMOKE_ONLY',
  'P3_CANARY_POLICY_BOUNDARY_INVALID');
  return stable({
    canonical_policy: configured.canonical_policy,
    policy_id: samplePolicy.id,
    policy_version: samplePolicy.version,
    policy_digest: digestObject(samplePolicy),
    pair_purpose: configured.pair_purpose,
    claim_target: configured.claim_target,
    sample_tier: tier.id,
    min_n: tier.min_n,
    max_n: tier.max_n,
    statistical_claim: tier.statistical_claim === true,
    cohort_class: configured.cohort_class,
    cohort_mode: configured.cohort_mode,
    maximum_claim: promotion.maximum_claim,
    release_allowed: false,
  });
}

function validateSamplePlanRegistry(p1Admission, sampleGovernance) {
  const plans = uniqueMap(p1Admission.sample_plans || [], 'sample_plan_id', 'P1_SAMPLE_PLAN');
  const validated = new Map();
  for (const [samplePlanId, plan] of plans) {
    const payload = plan.plan_payload;
    requireCondition(payload && typeof payload === 'object' && !Array.isArray(payload), `P1_SAMPLE_PLAN_PAYLOAD_MISSING:${samplePlanId}`);
    requireCondition(nonempty(payload.sampling_frame_id) && validTime(payload.registered_at), `P1_SAMPLE_PLAN_FRAME_OR_TIME_INVALID:${samplePlanId}`);
    const expectedPayload = stable({
      sample_plan_id: samplePlanId,
      registered_at: payload.registered_at,
      sample_policy_id: sampleGovernance.policy_id,
      sample_policy_version: sampleGovernance.policy_version,
      sample_policy_digest: sampleGovernance.policy_digest,
      sample_purpose: sampleGovernance.pair_purpose,
      claim_target: sampleGovernance.claim_target,
      sample_tier: sampleGovernance.sample_tier,
      min_n: sampleGovernance.min_n,
      max_n: sampleGovernance.max_n,
      statistical_claim: sampleGovernance.statistical_claim,
      cohort_class: sampleGovernance.cohort_class,
      cohort_mode: sampleGovernance.cohort_mode,
      maximum_claim: sampleGovernance.maximum_claim,
      release_allowed: false,
      sampling_frame_id: payload.sampling_frame_id,
    });
    requireCondition(stableJson(payload) === stableJson(expectedPayload), `P1_SAMPLE_PLAN_POLICY_PURPOSE_CLAIM_BINDING_INVALID:${samplePlanId}`);
    const samplePlanSha256 = digestObject(expectedPayload);
    requireCondition(plan.sample_plan_sha256 === samplePlanSha256, `P1_SAMPLE_PLAN_PAYLOAD_DIGEST_MISMATCH:${samplePlanId}`);
    const receipt = plan.registration_receipt;
    requireCondition(receipt && typeof receipt === 'object' && !Array.isArray(receipt), `P1_SAMPLE_PLAN_REGISTRATION_RECEIPT_MISSING:${samplePlanId}`);
    const receiptPayload = stable({
      receipt_id: receipt.receipt_id,
      issuer: 'KPMO_PRE_REGISTERED_SAMPLE_PLAN_REGISTRY',
      sample_plan_id: samplePlanId,
      sample_plan_sha256: samplePlanSha256,
      registered_at: payload.registered_at,
      immutable_artifact_ref: `artifact:${samplePlanSha256}`,
    });
    requireCondition(nonempty(receipt.receipt_id)
      && stableJson(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'registration_receipt_sha256'))) === stableJson(receiptPayload)
      && ARTIFACT_SHA256.test(receipt.immutable_artifact_ref || '')
      && receipt.registration_receipt_sha256 === digestObject(receiptPayload), `P1_SAMPLE_PLAN_REGISTRATION_RECEIPT_INVALID:${samplePlanId}`);
    validated.set(samplePlanId, stable({
      ...expectedPayload,
      sample_plan_sha256: samplePlanSha256,
      sample_plan_registration_receipt_id: receipt.receipt_id,
      sample_plan_registration_issuer: receipt.issuer,
      sample_plan_registration_receipt_sha256: receipt.registration_receipt_sha256,
      sample_plan_artifact_ref: receipt.immutable_artifact_ref,
    }));
  }
  return validated;
}

const uniqueMap = (values, key, code) => {
  requireCondition(Array.isArray(values), `${code}_ARRAY_MISSING`);
  const map = new Map();
  for (const value of values) {
    const id = value?.[key];
    requireCondition(typeof id === 'string' && id.length > 0 && !map.has(id), `${code}_ID_INVALID_OR_DUPLICATE:${id || 'UNKNOWN'}`);
    map.set(id, value);
  }
  return map;
};

function validateRightsAssertion(candidate, record, snapshotAsOf) {
  const assertion = record.rights_assertion;
  requireCondition(assertion && typeof assertion === 'object' && !Array.isArray(assertion), `RIGHTS_ASSERTION_MISSING:${record.evidence_id}`);
  for (const field of ['assertion_id', 'source_owner_id', 'purpose_binding_id', 'jurisdiction']) {
    requireCondition(typeof assertion[field] === 'string' && assertion[field].length > 0, `RIGHTS_ASSERTION_FIELD_MISSING:${field}:${record.evidence_id}`);
  }
  requireCondition(assertion.source_owner_id === candidate.source_owner_id && assertion.source_owner_id === record.source_owner_id, `RIGHTS_SOURCE_OWNER_BINDING_MISMATCH:${record.evidence_id}`);
  requireCondition(assertion.purpose_binding_id === candidate.purpose_binding_id && assertion.purpose_binding_id === record.purpose_binding_id, `RIGHTS_PURPOSE_BINDING_MISMATCH:${record.evidence_id}`);
  requireCondition(JSON.stringify(uniq(assertion.rights_atoms)) === JSON.stringify(['COLLECT', 'DERIVE', 'DISPLAY', 'STORE']), `RIGHTS_ATOMS_INCOMPLETE:${record.evidence_id}`);
  requireCondition(validTime(assertion.effective_at) && validTime(assertion.expires_at), `RIGHTS_ASSERTION_TIME_INVALID:${record.evidence_id}`);
  const effectiveAt = Date.parse(assertion.effective_at);
  const expiresAt = Date.parse(assertion.expires_at);
  requireCondition(effectiveAt <= snapshotAsOf && snapshotAsOf <= expiresAt && expiresAt > effectiveAt, `RIGHTS_ASSERTION_NOT_EFFECTIVE_AT_SNAPSHOT:${record.evidence_id}`);
  requireCondition(SHA256.test(assertion.document_sha256 || '') && !/^sha256:0{64}$/.test(assertion.document_sha256), `RIGHTS_DOCUMENT_DIGEST_INVALID:${record.evidence_id}`);
  requireCondition(secureHttps(assertion.evidence_uri), `RIGHTS_EVIDENCE_URI_INVALID:${record.evidence_id}`);
  requireCondition(assertion.source_content_snapshot_sha256 === record.source_payload_sha256, `RIGHTS_SOURCE_CONTENT_SNAPSHOT_MISMATCH:${record.evidence_id}`);
}

function validateAdmittedRecord(candidate, snapshotAsOf, maximumWindowDays, sampleGovernance, samplePlans) {
  const record = candidate.admitted_evidence;
  requireCondition(record && typeof record === 'object' && !Array.isArray(record), `ADMITTED_EVIDENCE_RECORD_MISSING:${candidate.admission_candidate_id}`);
  requireCondition(candidate.state === 'ADMITTED_VERIFIED', `ADMISSION_STATE_INVALID:${candidate.admission_candidate_id}`);
  requireCondition(candidate.gate1_decision === 'PASS', `ADMISSION_GATE1_NOT_PASS:${candidate.admission_candidate_id}`);
  requireCondition(candidate.rights_state === 'ALLOW' && candidate.collection_authorized === true, `ADMISSION_RIGHTS_NOT_ALLOW:${candidate.admission_candidate_id}`);
  requireCondition(['CURRENT_SOLD_TRANSACTION', 'LIQUIDITY_TIME_TO_SALE_EXPOSURE'].includes(candidate.evidence_class), `ADMISSION_EVIDENCE_CLASS_INVALID:${candidate.admission_candidate_id}`);
  requireCondition(typeof candidate.admitted_evidence_id === 'string' && candidate.admitted_evidence_id === record.evidence_id, `ADMISSION_EVIDENCE_ID_MISMATCH:${candidate.admission_candidate_id}`);
  requireCondition(record.evidence_class === candidate.evidence_class, `ADMISSION_EVIDENCE_CLASS_MISMATCH:${candidate.admission_candidate_id}`);
  for (const [field, value] of [
    ['evidence_id', record.evidence_id],
    ['purpose_binding_id', record.purpose_binding_id],
    ['source_owner_id', record.source_owner_id],
    ['factual_origin_id', record.factual_origin_id],
  ]) requireCondition(typeof value === 'string' && value.length > 0, `ADMITTED_EVIDENCE_FIELD_MISSING:${field}`);
  for (const field of ['purpose_binding_id', 'source_owner_id', 'factual_origin_id']) {
    requireCondition(candidate[field] === record[field], `ADMISSION_EVIDENCE_BINDING_MISMATCH:${field}:${record.evidence_id}`);
  }
  requireCondition(record.rights_state === 'ALLOW', `ADMITTED_EVIDENCE_RIGHTS_NOT_ALLOW:${record.evidence_id}`);
  requireCondition(secureHttps(record.source_url), `ADMITTED_EVIDENCE_SOURCE_URL_INVALID:${record.evidence_id}`);
  requireCondition(secureHttps(record.source_object_uri), `ADMITTED_EVIDENCE_SOURCE_OBJECT_URI_INVALID:${record.evidence_id}`);
  requireCondition(SHA256.test(record.source_payload_sha256 || '') && !/^sha256:0{64}$/.test(record.source_payload_sha256), `ADMITTED_EVIDENCE_SOURCE_DIGEST_INVALID:${record.evidence_id}`);
  requireCondition(Array.isArray(record.license_evidence_refs) && record.license_evidence_refs.length > 0
    && record.license_evidence_refs.every(secureHttps), `ADMITTED_EVIDENCE_LICENSE_REFS_INVALID:${record.evidence_id}`);
  requireCondition(validTime(record.observed_at) && validTime(record.valid_until), `ADMITTED_EVIDENCE_TIME_INVALID:${record.evidence_id}`);
  const observedAt = Date.parse(record.observed_at);
  const validUntil = Date.parse(record.valid_until);
  const maximumWindowMs = maximumWindowDays * 24 * 60 * 60 * 1000;
  requireCondition(observedAt <= snapshotAsOf && snapshotAsOf <= validUntil && validUntil > observedAt && validUntil - observedAt <= maximumWindowMs, `ADMITTED_EVIDENCE_FRESHNESS_INVALID:${record.evidence_id}`);
  requireCondition(Number.isFinite(record.evidence_strength) && record.evidence_strength > 0 && record.evidence_strength <= 1, `ADMITTED_EVIDENCE_STRENGTH_INVALID:${record.evidence_id}`);
  requireCondition(record.unresolved_critical_contradiction_count === 0, `ADMITTED_EVIDENCE_CONTRADICTION_OPEN:${record.evidence_id}`);
  validateRightsAssertion(candidate, record, snapshotAsOf);
  if (candidate.evidence_class === 'CURRENT_SOLD_TRANSACTION') {
    requireCondition(record.temporality === 'CURRENT_MARKET' && record.market_observation_type === 'SOLD_TRANSACTION', `CURRENT_SOLD_SEMANTICS_INVALID:${record.evidence_id}`);
    const transactionAt = Date.parse(record.transaction_occurred_at || '');
    requireCondition(validTime(record.transaction_occurred_at) && transactionAt <= observedAt
      && snapshotAsOf - transactionAt >= 0 && snapshotAsOf - transactionAt <= maximumWindowMs, `CURRENT_SOLD_TRANSACTION_TIME_INVALID:${record.evidence_id}`);
    requireCondition(typeof record.asset_identity_id === 'string' && record.asset_identity_id.length > 0, `CURRENT_SOLD_ASSET_IDENTITY_MISSING:${record.evidence_id}`);
    requireCondition(typeof record.market_venue_id === 'string' && record.market_venue_id.length > 0, `CURRENT_SOLD_VENUE_MISSING:${record.evidence_id}`);
    requireCondition(typeof record.grade_or_condition === 'string' && record.grade_or_condition.length > 0, `CURRENT_SOLD_GRADE_CONDITION_MISSING:${record.evidence_id}`);
    requireCondition(Number.isFinite(record.sold_price?.amount) && record.sold_price.amount > 0 && /^[A-Z]{3}$/.test(record.sold_price?.currency || ''), `CURRENT_SOLD_PRICE_INVALID:${record.evidence_id}`);
    requireCondition(record.sample_purpose === sampleGovernance.pair_purpose
      && candidate.sample_purpose === record.sample_purpose, `CURRENT_SOLD_SAMPLE_PURPOSE_MISMATCH:${record.evidence_id}`);
    requireCondition(record.claim_target === sampleGovernance.claim_target
      && candidate.claim_target === record.claim_target, `CURRENT_SOLD_CLAIM_TARGET_MISMATCH:${record.evidence_id}`);
    for (const field of ['source_id', 'source_record_id', 'sample_plan_id', 'sampling_frame_id', 'sample_unit_id']) {
      requireCondition(nonempty(record[field]) && candidate[field] === record[field], `CURRENT_SOLD_SAMPLE_FIELD_MISSING_OR_UNBOUND:${field}:${record.evidence_id}`);
    }
    const registeredPlan = samplePlans.get(record.sample_plan_id);
    requireCondition(Boolean(registeredPlan), `CURRENT_SOLD_SAMPLE_PLAN_NOT_REGISTERED:${record.evidence_id}`);
    for (const field of ['sample_plan_sha256', 'sample_plan_registration_receipt_id', 'sample_plan_registration_receipt_sha256', 'sample_plan_artifact_ref']) {
      requireCondition(record[field] === registeredPlan?.[field] && candidate[field] === record[field], `CURRENT_SOLD_SAMPLE_PLAN_BINDING_INVALID:${field}:${record.evidence_id}`);
    }
    requireCondition(record.sample_plan_registered_at === registeredPlan?.registered_at
      && candidate.sample_plan_registered_at === record.sample_plan_registered_at
      && Date.parse(record.sample_plan_registered_at) < observedAt, `CURRENT_SOLD_SAMPLE_PLAN_NOT_PRE_REGISTERED:${record.evidence_id}`);
    requireCondition(record.sampling_frame_id === registeredPlan?.sampling_frame_id, `CURRENT_SOLD_SAMPLING_FRAME_NOT_REGISTERED:${record.evidence_id}`);
    const canonicalTransactionIdentity = stable({
      source_id: record.source_id,
      source_owner_id: record.source_owner_id,
      factual_origin_id: record.factual_origin_id,
      source_record_id: record.source_record_id,
      asset_identity_id: record.asset_identity_id,
      market_venue_id: record.market_venue_id,
      transaction_occurred_at: record.transaction_occurred_at,
      sold_price: record.sold_price,
    });
    requireCondition(record.sample_unit_id === digestObject(canonicalTransactionIdentity), `CURRENT_SOLD_CANONICAL_TRANSACTION_IDENTITY_MISMATCH:${record.evidence_id}`);
  } else if (candidate.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE') {
    requireCondition(record.temporality === 'CURRENT_MARKET' && record.market_observation_type === 'LIQUIDITY_EXPOSURE', `LIQUIDITY_SEMANTICS_INVALID:${record.evidence_id}`);
    requireCondition(validTime(record.exposure_started_at) && Date.parse(record.exposure_started_at) <= observedAt, `LIQUIDITY_START_TIME_INVALID:${record.evidence_id}`);
    requireCondition(['SOLD_EVENT_OBSERVED', 'RIGHT_CENSORED_ACTIVE'].includes(record.censoring_state), `LIQUIDITY_CENSORING_STATE_INVALID:${record.evidence_id}`);
    if (record.censoring_state === 'SOLD_EVENT_OBSERVED') requireCondition(validTime(record.exposure_ended_at) && Date.parse(record.exposure_ended_at) <= observedAt, `LIQUIDITY_END_TIME_INVALID:${record.evidence_id}`);
    else requireCondition(record.exposure_ended_at === null || record.exposure_ended_at === undefined, `LIQUIDITY_ACTIVE_END_TIME_FORBIDDEN:${record.evidence_id}`);
    const exposureEnd = record.censoring_state === 'SOLD_EVENT_OBSERVED' ? Date.parse(record.exposure_ended_at) : observedAt;
    requireCondition(Number.isFinite(exposureEnd) && exposureEnd >= Date.parse(record.exposure_started_at), `LIQUIDITY_END_TIME_INVALID:${record.evidence_id}`);
    const expectedDays = (exposureEnd - Date.parse(record.exposure_started_at)) / 86400000;
    requireCondition(Number.isFinite(record.exposure_days) && Math.abs(record.exposure_days - expectedDays) < 1e-9, `LIQUIDITY_DURATION_INVALID:${record.evidence_id}`);
  }
  return stable(record);
}

export function deriveReadiness(inputs, contract, samplePolicy) {
  const {
    p0Registry, p0Bindings, p0Manifest, p1Gate, p1Admission, p1Actions, p1Manifest,
    p2Graph, p2Lineage, p2Quality, p2Value, p2Manifest, upstreamBinding,
  } = inputs;
  requireCondition(p0Registry.id === 'kidults-asi-p0b-source-candidate-registry-v1' && p0Registry.canonical_candidate_count > 0, 'P0B_REGISTRY_INVALID');
  requireCondition(p0Bindings.id === 'kidults-asi-p0b-mission-candidate-binding-ledger-v1' && p0Bindings.mission_count === 192 && p0Bindings.bindings?.length === 192, 'P0B_BINDINGS_INVALID');
  requireCondition(p0Manifest.id === 'kidults-asi-p0b-bounded-discovery-manifest-v1', 'P0B_MANIFEST_INVALID');
  requireCondition(p1Gate.id === 'kidults-asi-p1-gate1-source-safety-decisions-v1' && p1Gate.decision_count === 576 && p1Gate.decisions?.length === 576, 'P1_GATE_INVALID');
  requireCondition(p1Admission.id === 'kidults-asi-p1-evidence-admission-candidate-register-v1' && p1Admission.candidate_count === 576 && p1Admission.candidates?.length === 576, 'P1_ADMISSION_INVALID');
  const p1ActionTypes = Array.isArray(p1Actions.action_types) ? p1Actions.action_types : [];
  const p1ActionRows = Array.isArray(p1Actions.actions) ? p1Actions.actions : [];
  const p1ActionCandidateIds = new Set(p1ActionRows.map((action) => action.candidate_id));
  const p1ActionPairs = new Set(p1ActionRows.map((action) => `${action.candidate_id}:${action.action_type}`));
  requireCondition(
    p1Actions.id === 'kidults-asi-p1-preflight-action-queue-v1' &&
    Number.isInteger(p1Actions.unique_candidate_count) && p1Actions.unique_candidate_count > 0 &&
    p1ActionTypes.length > 0 && new Set(p1ActionTypes).size === p1ActionTypes.length &&
    p1ActionTypes.every((actionType) => typeof actionType === 'string' && actionType.length > 0) &&
    p1ActionRows.every((action) => typeof action.candidate_id === 'string' && action.candidate_id.length > 0 && p1ActionTypes.includes(action.action_type)) &&
    p1Actions.action_count === p1ActionRows.length &&
    p1ActionCandidateIds.size === p1Actions.unique_candidate_count &&
    p1ActionPairs.size === p1ActionRows.length &&
    p1ActionRows.length === p1Actions.unique_candidate_count * p1ActionTypes.length,
    'P1_ACTIONS_INVALID'
  );
  requireCondition(p1Manifest.id === 'kidults-asi-p1-source-preflight-manifest-v1', 'P1_MANIFEST_INVALID');
  requireCondition(p2Graph.id === 'kidults-owned-source-intelligence-graph-v2' && p2Graph.version === '2.0.0', 'P2_GRAPH_INVALID');
  requireCondition(p2Lineage.id === 'kidults-owned-source-intelligence-lineage-v2' && p2Lineage.graph?.digest === hashText(stableJson(p2Graph)), 'P2_LINEAGE_INVALID');
  requireCondition(p2Quality.id === 'kidults-owned-source-intelligence-quality-v2' && p2Quality.state === 'VERIFIED_GRAPH_INTEGRITY_READY', 'P2_QUALITY_INVALID');
  requireCondition(p2Value.id === 'kidults-owned-source-intelligence-value-receipt-v2', 'P2_VALUE_INVALID');
  requireCondition(p2Manifest.id === 'kidults-owned-source-intelligence-manifest-v2' && p2Manifest.graph_digest === p2Lineage.graph.digest, 'P2_MANIFEST_INVALID');
  requireCondition(contract.id === 'kidults-asi-snapshot-readiness-factory-contract-v2' && contract.version === '2.2.0' && JSON.stringify(contract.platform_principles) === JSON.stringify(PRINCIPLES), 'P3_CONTRACT_INVALID');
  const sampleGovernance = deriveSampleGovernance(contract, samplePolicy);
  const samplePlans = validateSamplePlanRegistry(p1Admission, sampleGovernance);

  const candidateById = uniqueMap(p0Registry.candidates, 'candidate_id', 'P0B_CANDIDATE');
  requireCondition(candidateById.size === p0Registry.canonical_candidate_count, 'P0B_CANDIDATE_COUNT_DRIFT');
  requireCondition(new Set([...candidateById.values()].map((candidate) => candidate.canonical_host)).size === p0Registry.unique_host_count, 'P0B_UNIQUE_HOST_COUNT_DRIFT');
  uniqueMap(p0Bindings.bindings, 'binding_id', 'P0B_BINDING');
  const missionById = uniqueMap(p0Bindings.bindings, 'mission_id', 'P0B_MISSION');
  requireCondition(missionById.size === p0Bindings.mission_count, 'P0B_MISSION_COUNT_DRIFT');
  for (const mission of missionById.values()) {
    const slotIds = (mission.slot_bindings || []).map((slot) => slot.candidate_id).filter(Boolean);
    requireCondition(new Set(slotIds).size === slotIds.length && slotIds.every((id) => candidateById.has(id)), `P0B_MISSION_SLOT_BINDING_INVALID:${mission.mission_id}`);
  }
  const missionSlotIds = (mission) => (mission.slot_bindings || []).map((slot) => slot.candidate_id).filter(Boolean);
  requireCondition([...missionById.values()].filter((mission) => missionSlotIds(mission).length >= 1).length === p0Bindings.missions_with_at_least_one_candidate, 'P0B_MISSION_COVERAGE_COUNT_DRIFT');
  requireCondition([...missionById.values()].filter((mission) => missionSlotIds(mission).length >= 2).length === p0Bindings.missions_with_primary_and_fallback_candidates, 'P0B_PRIMARY_FALLBACK_COUNT_DRIFT');
  requireCondition([...missionById.values()].filter((mission) => new Set(missionSlotIds(mission).map((id) => candidateById.get(id)?.canonical_host)).size >= 3).length === p0Bindings.missions_with_three_candidate_hosts, 'P0B_THREE_HOST_COUNT_DRIFT');
  const gateByGrain = uniqueMap(p1Gate.decisions, 'grain_id', 'P1_GATE_GRAIN');
  uniqueMap(p1Gate.decisions, 'gate1_decision_id', 'P1_GATE_DECISION');
  const admissionByGrain = uniqueMap(p1Admission.candidates, 'grain_id', 'P1_ADMISSION_GRAIN');
  uniqueMap(p1Admission.candidates, 'admission_candidate_id', 'P1_ADMISSION_CANDIDATE');
  requireCondition(gateByGrain.size === admissionByGrain.size && gateByGrain.size === p1Gate.decision_count, 'P1_GATE_ADMISSION_PARTITION_DRIFT');
  for (const [grainId, gate] of gateByGrain) {
    const admission = admissionByGrain.get(grainId);
    const mission = missionById.get(gate.mission_id);
    requireCondition(Boolean(admission && mission && candidateById.has(gate.candidate_id)), `P0_P1_IDENTITY_ORPHAN:${grainId}`);
    requireCondition((mission.slot_bindings || []).some((slot) => slot.candidate_id === gate.candidate_id), `P0_MISSION_GATE_CANDIDATE_MISMATCH:${grainId}`);
    requireCondition(gate.market_cell_id === mission.market_cell_id, `P0_MISSION_GATE_MARKET_CELL_MISMATCH:${grainId}`);
    for (const field of ['candidate_id', 'mission_id', 'market_cell_id']) {
      requireCondition(admission[field] === gate[field], `GATE_ADMISSION_IDENTITY_MISMATCH:${field}:${grainId}`);
    }
    requireCondition(admission.gate1_decision === gate.decision && admission.rights_state === gate.rights_state, `GATE_ADMISSION_DECISION_RIGHTS_MISMATCH:${grainId}`);
    requireCondition(admission.collection_authorized === gate.collection_authorized, `GATE_ADMISSION_COLLECTION_AUTHORITY_MISMATCH:${grainId}`);
    requireCondition(admission.evidence_class === mission.evidence_class, `MISSION_ADMISSION_EVIDENCE_CLASS_MISMATCH:${grainId}`);
  }
  const actionById = uniqueMap(p1Actions.actions, 'action_id', 'P1_ACTION');
  requireCondition(actionById.size === p1Actions.action_count, 'P1_ACTION_COUNT_DRIFT');
  const admissionsByCandidate = new Map();
  for (const admission of admissionByGrain.values()) {
    if (!admissionsByCandidate.has(admission.candidate_id)) admissionsByCandidate.set(admission.candidate_id, []);
    admissionsByCandidate.get(admission.candidate_id).push(admission);
  }
  const actionsByCandidate = new Map();
  for (const action of actionById.values()) {
    const sourceCandidate = candidateById.get(action.candidate_id);
    const candidateAdmissions = admissionsByCandidate.get(action.candidate_id) || [];
    requireCondition(Boolean(sourceCandidate) && action.canonical_host === sourceCandidate.canonical_host, `P1_ACTION_CANDIDATE_ORPHAN:${action.action_id}`);
    requireCondition(JSON.stringify(uniq(action.impacted_grain_ids)) === JSON.stringify(uniq(candidateAdmissions.map((admission) => admission.grain_id))), `P1_ACTION_GRAIN_SET_MISMATCH:${action.action_id}`);
    requireCondition(JSON.stringify(uniq(action.impacted_mission_ids)) === JSON.stringify(uniq(candidateAdmissions.map((admission) => admission.mission_id))), `P1_ACTION_MISSION_SET_MISMATCH:${action.action_id}`);
    if (!actionsByCandidate.has(action.candidate_id)) actionsByCandidate.set(action.candidate_id, []);
    actionsByCandidate.get(action.candidate_id).push(action);
  }
  for (const [candidateId, actions] of actionsByCandidate) requireCondition(new Set(actions.map((action) => action.action_type)).size === actions.length, `P1_ACTION_TYPE_DUPLICATE:${candidateId}`);
  for (const admission of admissionByGrain.values()) {
    const actions = actionsByCandidate.get(admission.candidate_id) || [];
    const requiredTypes = uniq(admission.required_next_actions || []);
    const boundActions = actions.filter((action) => (action.impacted_grain_ids || []).includes(admission.grain_id)
      && (action.impacted_mission_ids || []).includes(admission.mission_id));
    requireCondition(requiredTypes.length > 0 && requiredTypes.every((type) => boundActions.some((action) => action.action_type === type)), `ADMISSION_PREFLIGHT_ACTION_BINDING_INCOMPLETE:${admission.admission_candidate_id}`);
    if (admission.evidence_admitted === true) {
      requireCondition(boundActions.filter((action) => requiredTypes.includes(action.action_type)).every((action) => ['COMPLETED', 'PASS', 'VERIFIED_PASS'].includes(action.state)), `ADMISSION_PREFLIGHT_ACTION_NOT_COMPLETED:${admission.admission_candidate_id}`);
    }
  }

  requireCondition(upstreamBinding?.id === 'kidults-asi-snapshot-readiness-upstream-binding-v2' && upstreamBinding?.state === 'VERIFIED_EXACT_UPSTREAM_CHAIN', 'P3_UPSTREAM_BINDING_RECEIPT_INVALID');
  requireCondition(upstreamBinding.p2_workflow_path === '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml', 'P3_UPSTREAM_WORKFLOW_PATH_INVALID');
  requireCondition(typeof upstreamBinding.repository === 'string' && upstreamBinding.repository.includes('/'), 'P3_UPSTREAM_REPOSITORY_INVALID');
  requireCondition(upstreamBinding.p0b_and_p1_selected_from_p2_receipt === true && upstreamBinding.global_artifact_scan_used === false && upstreamBinding.any_branch_fallback_used === false, 'P3_UPSTREAM_SELECTION_BOUNDARY_INVALID');
  requireCondition(upstreamBinding.graph_digest === p2Lineage.graph.digest, 'P3_UPSTREAM_GRAPH_DIGEST_MISMATCH');
  requireCondition(upstreamBinding.p2_head_sha === upstreamBinding.observed_main_head_sha && /^[0-9a-f]{40}$/.test(upstreamBinding.p2_head_sha || ''), 'P3_UPSTREAM_NOT_CURRENT_MAIN_HEAD');
  requireCondition(validTime(upstreamBinding.p2_completed_at) && validTime(upstreamBinding.readback_observed_at), 'P3_UPSTREAM_TIME_INVALID');
  const maximumUpstreamAgeMs = Number(contract.upstream_freshness?.maximum_age_hours) * 3600000;
  const upstreamAgeMs = Date.parse(upstreamBinding.readback_observed_at) - Date.parse(upstreamBinding.p2_completed_at);
  requireCondition(Number.isFinite(maximumUpstreamAgeMs) && maximumUpstreamAgeMs > 0 && upstreamAgeMs >= 0 && upstreamAgeMs <= maximumUpstreamAgeMs, 'P3_UPSTREAM_RUN_STALE');
  for (const field of ['p0b_artifact_digest', 'p1_artifact_digest', 'p2_artifact_digest', 'p0b_downloaded_archive_sha256', 'p1_downloaded_archive_sha256', 'p2_downloaded_archive_sha256']) {
    requireCondition(SHA256.test(upstreamBinding[field] || '') && !/^sha256:0{64}$/.test(upstreamBinding[field]), `P3_UPSTREAM_DIGEST_INVALID:${field}`);
  }
  for (const stage of ['p0b', 'p1', 'p2']) {
    requireCondition(/^[1-9][0-9]*$/.test(upstreamBinding[`${stage}_artifact_id`] || ''), `P3_UPSTREAM_ARTIFACT_ID_INVALID:${stage}`);
    requireCondition(upstreamBinding[`${stage}_artifact_digest`] === upstreamBinding[`${stage}_downloaded_archive_sha256`], `P3_UPSTREAM_PROVIDER_DOWNLOAD_DIGEST_MISMATCH:${stage}`);
  }

  const lineageInputs = new Map((p2Lineage.inputs || []).map((entry) => [entry.id, entry.digest]));
  for (const value of [p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions]) {
    requireCondition(lineageInputs.get(value.id) === hashText(stableJson(value)), `P2_INPUT_LINEAGE_MISMATCH:${value.id}`);
  }

  const missionCount = p0Bindings.mission_count;
  const candidateCount = p0Registry.canonical_candidate_count;
  const uniqueHosts = p0Registry.unique_host_count;
  const actualGatePass = p1Gate.decisions.filter((value) => value.decision === 'PASS').length;
  const actualGateHold = p1Gate.decisions.filter((value) => value.decision === 'HOLD').length;
  const actualGateReject = p1Gate.decisions.filter((value) => value.decision === 'REJECT').length;
  requireCondition(p1Gate.pass_count === actualGatePass && p1Gate.hold_count === actualGateHold && p1Gate.reject_count === actualGateReject, 'P1_GATE_COUNT_DRIFT');
  const rightsPass = p1Admission.candidates.filter((value) => value.rights_state === 'ALLOW' && value.collection_authorized === true).length;
  const semanticVerified = p1Gate.decisions.filter((value) => value.decision === 'PASS' && value.market_semantics_verified === true).length;
  const factualOriginVerified = p0Bindings.bindings.filter((value) => value.factual_origin_independence_proven === true).length;
  const regionalCoverageVerified = p0Bindings.bindings.filter((value) => value.regional_coverage_proven === true).length;
  const completedActions = p1Actions.actions.filter((value) => ['COMPLETED', 'PASS', 'VERIFIED_PASS'].includes(value.state)).length;
  const queuedActions = p1Actions.actions.length - completedActions;
  const admittedCandidates = p1Admission.candidates.filter((value) => value.evidence_admitted === true);
  requireCondition(p1Admission.admitted_count === admittedCandidates.length, 'P1_ADMISSION_COUNT_DRIFT');

  const snapshotAsOf = Date.parse(p2Graph.as_of);
  requireCondition(validTime(p2Graph.as_of), 'P2_AS_OF_INVALID');
  requireCondition(snapshotAsOf <= Date.parse(upstreamBinding.p2_completed_at) && Date.parse(upstreamBinding.readback_observed_at) - snapshotAsOf <= maximumUpstreamAgeMs, 'P2_AS_OF_STALE_OR_AFTER_COMPLETION');
  const maximumWindowDays = Number(contract.snapshot_creation_gate.current_evidence_maximum_window_days);
  requireCondition(Number.isInteger(maximumWindowDays) && maximumWindowDays > 0, 'P3_CURRENT_WINDOW_INVALID');
  const evidenceRecords = admittedCandidates.map((candidate) => validateAdmittedRecord(candidate, snapshotAsOf, maximumWindowDays, sampleGovernance, samplePlans));
  requireCondition(new Set(evidenceRecords.map((value) => value.evidence_id)).size === evidenceRecords.length, 'ADMITTED_EVIDENCE_ID_DUPLICATE');

  const admittedSold = admittedCandidates.filter((value) => value.evidence_class === 'CURRENT_SOLD_TRANSACTION').length;
  const admittedLiquidity = admittedCandidates.filter((value) => value.evidence_class === 'LIQUIDITY_TIME_TO_SALE_EXPOSURE').length;
  const currentSoldRecords = evidenceRecords
    .filter((record) => record.evidence_class === 'CURRENT_SOLD_TRANSACTION')
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  let samplePlanBinding = null;
  let launchCohort = null;
  if (currentSoldRecords.length > 0) {
    for (const field of ['sample_plan_id', 'sample_plan_sha256', 'sample_plan_registration_receipt_id', 'sample_plan_registration_receipt_sha256', 'sample_plan_artifact_ref', 'sample_plan_registered_at', 'sampling_frame_id']) {
      requireCondition(new Set(currentSoldRecords.map((record) => record[field])).size === 1, `CURRENT_SOLD_COHORT_PLAN_OR_FRAME_DRIFT:${field}`);
    }
    requireCondition(new Set(currentSoldRecords.map((record) => record.sample_unit_id)).size === currentSoldRecords.length, 'CURRENT_SOLD_COHORT_SAMPLE_UNIT_DUPLICATE');
    samplePlanBinding = samplePlans.get(currentSoldRecords[0].sample_plan_id);
    requireCondition(Boolean(samplePlanBinding), 'CURRENT_SOLD_COHORT_SAMPLE_PLAN_NOT_REGISTERED');
    const cohortPayload = {
      cohort_class: sampleGovernance.cohort_class,
      sample_tier: sampleGovernance.sample_tier,
      cohort_mode: sampleGovernance.cohort_mode,
      sample_size: currentSoldRecords.length,
      terminal_state: 'SOLD',
      event_ids: currentSoldRecords.map((record) => record.evidence_id),
      event_digests: currentSoldRecords.map((record) => digestObject(record)).sort(),
    };
    const cohortDigest = digestObject(cohortPayload);
    const canaryTransactions = currentSoldRecords.map((record) => stable({
      evidence_id: record.evidence_id,
      transaction_identity_digest: record.sample_unit_id,
      evidence_record_digest: digestObject(record),
      source_id: record.source_id,
      source_content_snapshot_sha256: record.rights_assertion.source_content_snapshot_sha256,
    }));
    requireCondition(new Set(canaryTransactions.map((value) => value.transaction_identity_digest)).size === canaryTransactions.length
      && new Set(canaryTransactions.map((value) => value.evidence_record_digest)).size === canaryTransactions.length,
    'CURRENT_SOLD_CANARY_TRANSACTION_BINDING_INVALID');
    const sourceIds = [...new Set(canaryTransactions.map((record) => record.source_id))].sort();
    const sourceBindingPayload = stable({
      cohort_digest: cohortDigest,
      sample_plan_sha256: samplePlanBinding.sample_plan_sha256,
      source_ids: sourceIds,
      source_content_snapshots: canaryTransactions.map((value) => ({
        source_id: value.source_id,
        source_content_snapshot_sha256: value.source_content_snapshot_sha256,
      })),
    });
    launchCohort = stable({
      ...cohortPayload,
      cohort_digest: cohortDigest,
      source_ids: sourceIds,
      source_binding_digest: digestObject(sourceBindingPayload),
      canary_transactions: canaryTransactions,
      transaction_binding_digest: digestObject({
        cohort_digest: cohortDigest,
        transactions: canaryTransactions,
      }),
      sample_policy_id: sampleGovernance.policy_id,
      sample_policy_version: sampleGovernance.policy_version,
      sample_policy_digest: sampleGovernance.policy_digest,
      sample_purpose: sampleGovernance.pair_purpose,
      claim_target: sampleGovernance.claim_target,
      maximum_claim: sampleGovernance.maximum_claim,
      release_allowed: false,
      ...samplePlanBinding,
    });
  }
  const marketEvents = Array.isArray(p2Graph.market_events) ? p2Graph.market_events : [];
  requireCondition((p2Graph.market_events_created || 0) === marketEvents.length, 'P2_MARKET_EVENT_COUNT_DRIFT');
  requireCondition((p2Graph.evidence_admitted || 0) === evidenceRecords.length, 'P2_EVIDENCE_ADMISSION_COUNT_DRIFT');
  requireCondition(p2Manifest.results?.market_events_created === marketEvents.length && p2Manifest.results?.evidence_admitted === evidenceRecords.length, 'P2_MANIFEST_EVIDENCE_COUNT_DRIFT');
  requireCondition(p2Value.source_intelligence_graph_is_market_evidence_graph === (marketEvents.length > 0), 'P2_VALUE_MARKET_GRAPH_TRUTH_DRIFT');
  requireCondition(marketEvents.length === evidenceRecords.length, 'P2_MARKET_EVENT_ADMISSION_CARDINALITY_MISMATCH');
  const eventByEvidence = new Map();
  const eventIds = new Set();
  const evidenceRecordIds = new Set(evidenceRecords.map((record) => record.evidence_id));
  for (const event of marketEvents) {
    requireCondition(typeof event.event_id === 'string' && event.event_id.length > 0 && typeof event.evidence_id === 'string', 'P2_MARKET_EVENT_ID_INVALID');
    requireCondition(!eventIds.has(event.event_id), `P2_MARKET_EVENT_ID_DUPLICATE:${event.event_id}`);
    requireCondition(evidenceRecordIds.has(event.evidence_id), `P2_MARKET_EVENT_WITHOUT_ADMITTED_EVIDENCE:${event.evidence_id}`);
    eventIds.add(event.event_id);
    requireCondition(!eventByEvidence.has(event.evidence_id), `P2_MARKET_EVENT_EVIDENCE_DUPLICATE:${event.evidence_id}`);
    eventByEvidence.set(event.evidence_id, event);
  }
  const marketEventBindingComplete = evidenceRecords.every((record) => {
    const event = eventByEvidence.get(record.evidence_id);
    return event && event.rights_state === 'ALLOW' && event.observed_at === record.observed_at
      && event.source_payload_sha256 === record.source_payload_sha256
      && event.evidence_record_digest === digestObject(record);
  });
  if (evidenceRecords.length > 0) requireCondition(marketEventBindingComplete, 'P2_MARKET_EVENT_EVIDENCE_BINDING_INVALID');

  const coveragePass = p0Bindings.missions_with_at_least_one_candidate === missionCount;
  const replacementCoveragePass = p0Bindings.missions_with_primary_and_fallback_candidates === missionCount
    && p0Bindings.missions_with_three_candidate_hosts === missionCount
    && regionalCoverageVerified === missionCount;
  const gate1Pass = actualGatePass === p1Gate.decision_count && actualGateHold === 0 && actualGateReject === 0 && queuedActions === 0;
  const rightsPassAll = rightsPass === p1Admission.candidate_count;
  const semanticsPass = semanticVerified === p1Gate.decision_count;
  const originPass = factualOriginVerified === missionCount;
  const admissionPass = evidenceRecords.length >= contract.snapshot_creation_gate.admitted_evidence_minimum && marketEventBindingComplete;
  const soldPass = admittedSold >= sampleGovernance.min_n && admittedSold <= sampleGovernance.max_n;
  const liquidityPass = admittedLiquidity >= contract.snapshot_creation_gate.admitted_liquidity_minimum;
  const eventPass = marketEvents.length >= contract.snapshot_creation_gate.market_event_graph_nodes_minimum && marketEventBindingComplete;

  const dimensions = [
    { dimension: 'MISSION_SOURCE_CANDIDATE_COVERAGE', state: coveragePass ? 'PASS' : 'FAIL', current_value: p0Bindings.missions_with_at_least_one_candidate, required_value: missionCount, evidence_refs: [p0Registry.id, p0Bindings.id] },
    { dimension: 'PRIMARY_FALLBACK_REPLACEMENT_COVERAGE', state: replacementCoveragePass ? 'PASS' : 'FAIL', current_value: { primary_and_fallback: p0Bindings.missions_with_primary_and_fallback_candidates, three_candidate_hosts: p0Bindings.missions_with_three_candidate_hosts, regional_coverage_verified: regionalCoverageVerified }, required_value: { primary_and_fallback: missionCount, three_candidate_hosts: missionCount, regional_coverage_verified: missionCount }, evidence_refs: [p0Bindings.id] },
    { dimension: 'GATE1_SOURCE_SAFETY', state: gate1Pass ? 'PASS' : 'FAIL', current_value: { pass: actualGatePass, hold: actualGateHold, reject: actualGateReject, completed_actions: completedActions }, required_value: { pass: p1Gate.decision_count, hold: 0, reject: 0, completed_actions: p1Actions.action_count }, evidence_refs: [p1Gate.id, p1Actions.id] },
    { dimension: 'PURPOSE_SPECIFIC_RIGHTS', state: rightsPassAll ? 'PASS' : 'FAIL', current_value: rightsPass, required_value: p1Admission.candidate_count, evidence_refs: [p1Admission.id] },
    { dimension: 'MARKET_SEMANTIC_SUFFICIENCY', state: semanticsPass ? 'PASS' : 'FAIL', current_value: semanticVerified, required_value: p1Gate.decision_count, evidence_refs: [p1Gate.id] },
    { dimension: 'FACTUAL_ORIGIN_INDEPENDENCE', state: originPass ? 'PASS' : 'FAIL', current_value: factualOriginVerified, required_value: missionCount, evidence_refs: [p0Bindings.id, p2Graph.id] },
    { dimension: 'EVIDENCE_ADMISSION', state: admissionPass ? 'PASS' : 'FAIL', current_value: evidenceRecords.length, required_value: contract.snapshot_creation_gate.admitted_evidence_minimum, evidence_refs: [p1Admission.id, p2Graph.id] },
    { dimension: 'CURRENT_SOLD_TRANSACTION_EVIDENCE', state: soldPass ? 'PASS' : 'FAIL', current_value: { admitted: admittedSold, sample_tier: sampleGovernance.sample_tier, sample_purpose: sampleGovernance.pair_purpose, claim_target: sampleGovernance.claim_target }, required_value: { min_n: sampleGovernance.min_n, max_n: sampleGovernance.max_n, maximum_claim: sampleGovernance.maximum_claim }, evidence_refs: [p1Admission.id, sampleGovernance.canonical_policy] },
    { dimension: 'LIQUIDITY_TIME_TO_SALE_EVIDENCE', state: liquidityPass ? 'PASS' : 'FAIL', current_value: admittedLiquidity, required_value: contract.snapshot_creation_gate.admitted_liquidity_minimum, evidence_refs: [p1Admission.id] },
    { dimension: 'MARKET_EVENT_GRAPH', state: eventPass ? 'PASS' : 'FAIL', current_value: marketEvents.length, required_value: contract.snapshot_creation_gate.market_event_graph_nodes_minimum, evidence_refs: [p2Graph.id, p2Lineage.id] },
  ];
  requireCondition(JSON.stringify(dimensions.map((value) => value.dimension)) === JSON.stringify(contract.prerequisite_dimensions), 'P3_PREREQUISITE_DIMENSION_ORDER_INVALID');
  const prerequisitesPass = dimensions.every((value) => value.state === 'PASS');

  const blockerSpecs = [
    [coveragePass, 'MISSION_SOURCE_CANDIDATE_COVERAGE_INCOMPLETE', 'P0', missionCount - p0Bindings.missions_with_at_least_one_candidate, 'Bind at least one governed source candidate to every mission.'],
    [replacementCoveragePass, 'REPLACEMENT_OR_REGIONAL_COVERAGE_INCOMPLETE', 'P1', missionCount - Math.min(p0Bindings.missions_with_three_candidate_hosts || 0, regionalCoverageVerified), 'Complete primary, fallback, replacement-host and regional relevance coverage for every mission.'],
    [gate1Pass, 'GATE1_OR_PREFLIGHT_ACTIONS_OPEN', 'P0', actualGateHold + actualGateReject + queuedActions, 'Complete every required preflight action and recompute every Gate 1 decision to PASS.'],
    [rightsPassAll, 'PURPOSE_SPECIFIC_RIGHTS_UNKNOWN', 'P0', p1Admission.candidate_count - rightsPass, 'Admit explicit collect, store, derive and display rights for every source-purpose grain.'],
    [semanticsPass, 'MARKET_SEMANTICS_UNVERIFIED', 'P0', p1Gate.decision_count - semanticVerified, 'Verify market semantics without Listing/Sold or Attention/Demand conflation.'],
    [originPass, 'FACTUAL_ORIGIN_INDEPENDENCE_UNPROVEN', 'P0', missionCount - factualOriginVerified, 'Verify distinct factual origins and source-removal resilience for every mission.'],
    [admissionPass, 'EVIDENCE_ADMISSION_ZERO_OR_UNBOUND', 'P0', Math.max(0, contract.snapshot_creation_gate.admitted_evidence_minimum - evidenceRecords.length), 'Admit rights-cleared, fresh, provenance-bound evidence and bind each record to one market event.'],
    [soldPass, 'CURRENT_SOLD_SAMPLE_POLICY_TIER_NOT_SATISFIED', 'P0', admittedSold < sampleGovernance.min_n ? sampleGovernance.min_n - admittedSold : admittedSold - sampleGovernance.max_n, `Admit exactly the canonical ${sampleGovernance.sample_tier} range (${sampleGovernance.min_n}-${sampleGovernance.max_n}) for ${sampleGovernance.pair_purpose}; do not derive the tier from the observed count.`],
    [liquidityPass, 'LIQUIDITY_TIME_TO_SALE_EVIDENCE_ZERO', 'P0', Math.max(0, contract.snapshot_creation_gate.admitted_liquidity_minimum - admittedLiquidity), 'Admit at least one censoring-aware liquidity exposure record.'],
    [eventPass, 'MARKET_EVENT_GRAPH_ZERO_OR_UNBOUND', 'P0', Math.max(0, contract.snapshot_creation_gate.market_event_graph_nodes_minimum - marketEvents.length), 'Materialize admitted evidence as digest-bound governed market events.'],
  ];
  const blockers = blockerSpecs.filter(([passed]) => !passed).map(([, blockerClass, severity, affectedCount, unblockCondition]) => ({
    blocker_id: idFor('blocker', { blocker_class: blockerClass, source_graph_digest: p2Lineage.graph.digest }),
    blocker_class: blockerClass,
    severity,
    state: 'OPEN',
    affected_count: Math.max(0, affectedCount),
    unblock_condition: unblockCondition,
    dependencies: uniq(dimensions.filter((value) => value.state === 'FAIL').flatMap((value) => value.evidence_refs)),
    evidence_refs: uniq([p0Bindings.id, p1Gate.id, p1Admission.id, p1Actions.id, p2Graph.id, p2Lineage.id]),
    snapshot_gate_effect: 'BLOCK',
    public_release: 'HOLD',
    production: 'HOLD',
  })).sort((left, right) => left.severity.localeCompare(right.severity) || left.blocker_class.localeCompare(right.blocker_class));

  return {
    missionCount, candidateCount, uniqueHosts, actualGatePass, actualGateHold, actualGateReject,
    rightsPass, semanticVerified, factualOriginVerified, regionalCoverageVerified, completedActions, queuedActions,
    evidenceRecords: evidenceRecords.sort((left, right) => left.evidence_id.localeCompare(right.evidence_id)),
    admittedSold, admittedLiquidity, marketEvents: stable(marketEvents), marketEventBindingComplete,
    sampleGovernance, samplePlanBinding, launchCohort,
    prerequisiteDimensions: dimensions, prerequisitesPass, blockers,
    asOf: new Date(snapshotAsOf).toISOString(), sourceGraphDigest: p2Lineage.graph.digest,
    upstreamBinding: stable(upstreamBinding), upstreamBindingDigest: hashText(stableJson(upstreamBinding)),
  };
}
