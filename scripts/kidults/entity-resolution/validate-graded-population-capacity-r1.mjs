import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseJsonNoDuplicateKeys} from './parse-json-no-duplicate-keys.mjs';

const [artifactPath, samplingPath, pcgsRightsPath, providerGatePath, trustedSourcesPath] = process.argv.slice(2);
if (!artifactPath || !samplingPath || !pcgsRightsPath || !providerGatePath || !trustedSourcesPath) {
  throw new Error('usage: node validate-graded-population-capacity-r1.mjs <capacity.json> <sampling.json> <pcgs-rights.json> <provider-gate.json> <trusted-sources.json>');
}

const STRATUM_ID = 'er-stratum-graded-population';
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const WIKIDATA_LICENSE = 'https://www.wikidata.org/wiki/Wikidata:Licensing';
const CGC_TERMS = 'https://www.cgccomics.com/legal/terms-of-use/';
const FROZEN_COMPLETE_SEMANTIC_SHA256 = 'sha256:e3ba38c0186433c9f98eb498a1302b633597f891b486fe761d1291d76d9027f0';
const VOLATILE_SEMANTIC_PATHS = new Set(['generated_at', 'integrity', 'cc0_live_schema_observation.accessed_at']);
const EXPECTED_PROPERTY_DECISIONS = {
  P10611:['has certification', 'certain certification', 'CERTIFICATION_NUMBER', 'REJECT_NOT_AN_IDENTIFIER'],
  P5021:['assessment', 'test or exam', 'COLLECTIBLE_GRADE', 'REJECT_TEST_OR_METHOD_ASSESSMENT_NOT_GRADE_LITERAL'],
  P1082:['population', 'number of people', 'GRADED_POPULATION_CONTEXT', 'REJECT_DEMOGRAPHIC_POPULATION_SEMANTICS'],
  P2598:['serial number', 'specific object', 'PHYSICAL_OBJECT_IDENTIFIER', 'ALLOW_ONLY_AS_OBJECT_SERIAL_NOT_GRADING_CERTIFICATION'],
};
const EXPECTED_BLOCKERS = [
  'NO_RIGHTS_ADMITTED_GRADED_COLLECTIBLES_SOURCE_FIT_IDENTIFIED',
  'PCGS_CURRENT_AUTHORIZATION_EXCLUDES_120_CASE_BULK_COLLECTION',
  'PSA_BULK_RIGHTS_AND_CREDENTIAL_GATE_UNSATISFIED',
  'CGC_MANUAL_CONSERVATIVE_TERMS_REVIEW_NOT_CLEARED_NO_AUTOMATED_FETCH',
  'WIKIDATA_CC0_NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT',
  'RIGHTS_ADMITTED_GRAMMAR_COMPLETE_RECORDS_0_OF_120',
  'SAME_OBJECT_NORMALIZATION_CAPACITY_0_OF_40',
  'HARD_NEGATIVE_CAPACITY_0_OF_40',
  'CROSS_MARKET_ALIAS_CAPACITY_0_OF_40',
  'BLIND_CAPACITY_0_OF_60',
  'SOURCE_RECORD_BOUNDARY_CAPACITY_0_OF_60',
  'PHYSICAL_OBJECT_BOUNDARY_CAPACITY_0_OF_60',
];

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  left.length === new Set(left).size && right.length === new Set(right).size &&
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const stableSemanticProjection = (value, path = []) => {
  if (Array.isArray(value)) return value.map((child, index) => stableSemanticProjection(child, [...path, String(index)]));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !VOLATILE_SEMANTIC_PATHS.has([...path, key].join('.')))
      .map(([key, child]) => [key, stableSemanticProjection(child, [...path, key])]));
  }
  return value;
};
const isCanonicalTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function rejectUnsanctionedClaims(value, path = []) {
  if (!value || typeof value !== 'object') return;
  const forbidden = new Set([
    'expected', 'label', 'labels', 'reviewer', 'reviewers', 'model_prediction',
    'ground_truth', 'attestation', 'labels_collected', 'reviewers_assigned',
    'reviewer_a', 'reviewer_b', 'empirical_attestation_created', 'empirical_cases_created',
    'human_review_assignment_created', 'independent_reviewers_assigned',
    'independent_label_review_complete', 'blind_holdout_sealed', 'empirical_benchmark_ready',
    'track_b_started', 'release_authority', 'publication', 'production',
    'market_claims_created', 'spend_authorized', 'ground_truth_created',
    'identity_conclusion', 'identity_decision', 'physical_identity_conclusion',
    'labels_created', 'human_reviewer', 'human_reviewers', 'review_complete',
    'reviewers_created',
  ]);
  const sanctioned = new Set([
    'downstream_claims.empirical_cases_created',
    'downstream_claims.labels_collected',
    'downstream_claims.independent_reviewers_assigned',
    'downstream_claims.independent_label_review_complete',
    'downstream_claims.blind_holdout_sealed',
    'downstream_claims.empirical_benchmark_ready',
    'downstream_claims.track_b_started',
    'downstream_claims.publication',
    'downstream_claims.production',
    'metrics.empirical_cases_created',
    'metrics.labels_created',
    'metrics.reviewers_created',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join('.');
    assert(!forbidden.has(key) || sanctioned.has(pathText),
      `UNSANCTIONED_CASE_LABEL_REVIEW_OR_RELEASE_FIELD:${pathText}`);
    rejectUnsanctionedClaims(child, nextPath);
  }
}

const [artifact, sampling, pcgsRights, providerGate, trustedSources] = await Promise.all(
  [artifactPath, samplingPath, pcgsRightsPath, providerGatePath, trustedSourcesPath]
    .map(async (filePath) => parseJsonNoDuplicateKeys(await fs.readFile(filePath, 'utf8'), filePath))
);

assert(artifact.id === 'kidults-er-graded-population-live-capacity-r1', 'GRADED_CAPACITY_ID_INVALID');
assert(sameSet(Object.keys(artifact), [
  'audit_scope', 'cc0_live_schema_observation', 'collectible_scope', 'cross_registry_alias_pairs',
  'downstream_claims', 'environment_class', 'generated_at', 'hard_negative_pairs', 'id', 'integrity',
  'metrics', 'probe_status', 'readiness_gate', 'records', 'repository_evidence_bindings',
  'request_boundary', 'sampling_target', 'source_candidates', 'stratum_id', 'strict_record_grammar',
  'truth_boundary', 'version',
]), 'GRADED_CAPACITY_TOP_LEVEL_SCHEMA_INVALID');
assert(artifact.version === '1.2.0' && artifact.stratum_id === STRATUM_ID, 'GRADED_CAPACITY_VERSION_OR_STRATUM_INVALID');
assert(isCanonicalTimestamp(artifact.generated_at), 'GRADED_CAPACITY_GENERATED_AT_INVALID');
assert(artifact.probe_status === 'COMPLETE_FAIL_CLOSED_NO_RIGHTS_ADMITTED_SOURCE_FIT', 'GRADED_CAPACITY_MUST_FAIL_CLOSED');
assert(artifact.environment_class === 'READ_ONLY_LIVE_RIGHTS_AND_SOURCE_FIT_PREFLIGHT', 'READ_ONLY_PREFLIGHT_REQUIRED');
assert(artifact.audit_scope === 'BOUNDED_REPOSITORY_NAMED_TIER1_GRADING_AUTHORITIES_PLUS_WIKIDATA_CC0_ALTERNATIVE',
  'BOUNDED_AUDIT_SCOPE_REQUIRED');
assert(sameSet(artifact.collectible_scope?.allowed, ['trading_cards', 'comic_books', 'video_games_consoles']) &&
  artifact.collectible_scope?.non_collectibles_admitted === false, 'COLLECTIBLES_ONLY_SCOPE_REQUIRED');

const {integrity, ...unsealed} = artifact;
assert(sameSet(Object.keys(integrity || {}), ['canonical_payload_sha256']), 'GRADED_CAPACITY_INTEGRITY_SCHEMA_INVALID');
assert(SHA256.test(integrity?.canonical_payload_sha256 || ''), 'GRADED_CAPACITY_INTEGRITY_REQUIRED');
assert(integrity.canonical_payload_sha256 === digest(unsealed), 'GRADED_CAPACITY_INTEGRITY_MISMATCH');
assert(digest(stableSemanticProjection(artifact)) === FROZEN_COMPLETE_SEMANTIC_SHA256,
  'FROZEN_COMPLETE_SEMANTIC_PROJECTION_MISMATCH');
rejectUnsanctionedClaims(artifact);

const request = artifact.request_boundary || {};
assert(request.http_method === 'GET' && request.authenticated === false && request.credentials_used === false &&
  request.spend_usd === 0 && request.remote_mutation === false && request.provider_record_requests === 0 &&
  request.blocked_provider_web_or_api_requests === 0 && request.maximum_cc0_requests === 4 &&
  request.actual_cc0_requests === 4 && request.local_output_only === true,
  'NO_CREDENTIAL_NO_SPEND_BOUNDED_REQUEST_BOUNDARY_REQUIRED');

const bindings = artifact.repository_evidence_bindings || {};
const expectedBindings = [
  ['sampling_plan', samplingPath, sampling],
  ['pcgs_rights_terminalization', pcgsRightsPath, pcgsRights],
  ['provider_probe_gate', providerGatePath, providerGate],
  ['trusted_collectibles_sources', trustedSourcesPath, trustedSources],
];
for (const [key, expectedPath, payload] of expectedBindings) {
  assert(bindings[key]?.path === expectedPath && bindings[key]?.canonical_payload_sha256 === digest(payload),
    `REPOSITORY_EVIDENCE_BINDING_INVALID:${key}`);
}

const sample = (sampling.strata || []).find((row) => row.stratum_id === STRATUM_ID);
assert(sample?.cases === 120 && sample?.blind === 60, 'GRADED_SAMPLING_120_60_REQUIRED');
assert(sample?.case_class_targets?.SAME_OBJECT_NORMALIZATION === 40 &&
  sample?.case_class_targets?.HARD_NEGATIVE === 40 && sample?.case_class_targets?.CROSS_MARKET_ALIAS === 40,
  'GRADED_SAMPLING_CLASS_40_40_40_REQUIRED');
assert(sample?.identity_boundary_targets?.SOURCE_RECORD === 60 && sample?.identity_boundary_targets?.PHYSICAL_OBJECT === 60,
  'GRADED_SAMPLING_BOUNDARY_60_60_REQUIRED');
assert(JSON.stringify(artifact.sampling_target) === JSON.stringify({
  cases:120,
  blind:60,
  per_class:{SAME_OBJECT_NORMALIZATION:40, HARD_NEGATIVE:40, CROSS_MARKET_ALIAS:40},
  per_boundary:{SOURCE_RECORD:60, PHYSICAL_OBJECT:60},
}), 'GRADED_CAPACITY_TARGET_BINDING_INVALID');

assert(pcgsRights.id === 'pcgs-eula-rights-terminalization-v1' &&
  pcgsRights.bounded_evaluation?.raw_bulk_collection === 'BLOCK' &&
  pcgsRights.bounded_evaluation?.research_single_record_probe === 'ALLOW' &&
  pcgsRights.bounded_evaluation?.internal_er_calibration_reference === 'ALLOW_BOUNDED',
  'PCGS_BOUNDED_EVALUATION_NOT_BULK_REQUIRED');
const pcgsGate = (providerGate.providers || []).find((provider) => provider.provider_id === 'pcgs-public-api');
const psaGate = (providerGate.providers || []).find((provider) => provider.provider_id === 'psa-public-api');
assert(providerGate.founder_approval?.decision === 'APPROVE_PCGS_BOUNDED_API_EVALUATION' &&
  pcgsGate?.prohibited?.includes('BULK_ENUMERATION') && psaGate?.prohibited?.includes('BULK_ENUMERATION') &&
  psaGate?.prohibited?.includes('POPULATION_FIELD_ASSUMPTION') && psaGate?.credential_model === 'ACCOUNT_PLUS_BEARER_TOKEN',
  'PROVIDER_BULK_AND_POPULATION_GATES_REQUIRED');
const psaRegistry = (trustedSources.source_candidates || []).find((source) => source.source_id === 'psa-population-and-verification');
const cgcRegistry = (trustedSources.source_candidates || []).find((source) => source.source_id === 'cgc-population-and-certification');
assert(psaRegistry?.rights_state === 'REFERENCE_USE_ONLY_PENDING_TERMS_REVIEW' && psaRegistry?.commercial_use_state === 'NOT_CLEARED' &&
  cgcRegistry?.rights_state === 'REFERENCE_USE_ONLY_PENDING_TERMS_REVIEW' && cgcRegistry?.commercial_use_state === 'NOT_CLEARED',
  'PSA_CGC_RIGHTS_NOT_CLEARED_REQUIRED');

const grammar = artifact.strict_record_grammar || {};
assert(sameSet(grammar.required, ['title_or_subject', 'issue_or_card', 'printing_or_variant', 'grade', 'certification_number', 'population_context']),
  'STRICT_GRADED_POPULATION_GRAMMAR_REQUIRED');
assert(sameSet(grammar.required_identity_aliases, ['grading_certification_number', 'independent_authoritative_object_or_registry_identifier']),
  'STRICT_GRADED_IDENTITY_ALIAS_GRAMMAR_REQUIRED');
assert(grammar.inference_prohibited === true && grammar.admitted_wikidata_property_mappings?.grade === null &&
  grammar.admitted_wikidata_property_mappings?.certification_number === null &&
  grammar.admitted_wikidata_property_mappings?.population_context === null &&
  grammar.admitted_wikidata_property_mappings?.physical_object_serial === 'P2598_ONLY_NOT_CERTIFICATION',
  'NO_INFERRED_WIKIDATA_GRADE_CERT_POP_MAPPING_REQUIRED');
assert(sameSet(grammar.rejected_substitutions, [
  'P10611_AS_CERTIFICATION_NUMBER',
  'P5021_AS_COLLECTIBLE_GRADE',
  'P1082_AS_GRADED_POPULATION_CONTEXT',
  'P2598_AS_GRADING_CERTIFICATION_WITHOUT_AUTHORITY_BINDING',
]), 'REJECTED_GENERIC_WIKIDATA_SUBSTITUTIONS_REQUIRED');

assert(Array.isArray(artifact.source_candidates) && artifact.source_candidates.length === 4, 'FOUR_BOUNDED_SOURCE_CANDIDATES_REQUIRED');
const sourceMap = new Map(artifact.source_candidates.map((source) => [source.source_family, source]));
assert(sourceMap.size === 4, 'SOURCE_CANDIDATES_MUST_BE_UNIQUE');
const pcgs = sourceMap.get('pcgs-public-api');
const psa = sourceMap.get('psa-public-api-and-population-report');
const cgc = sourceMap.get('cgc-population-and-certification-web');
const wikidata = sourceMap.get('wikidata-cc0-graded-collectible-schema-fit');
assert(pcgs?.rights_state === 'BLOCK_BULK_BOUNDED_EVALUATION_ONLY' &&
  sameSet(pcgs.rights_evidence_refs, [pcgsRightsPath, providerGatePath]) &&
  pcgs.blocking_controls?.includes('raw_bulk_collection=BLOCK') && pcgs.blocking_controls?.includes('BULK_ENUMERATION_PROHIBITED'),
  'PCGS_ZERO_CAPACITY_BULK_BLOCK_REQUIRED');
assert(psa?.rights_state === 'BLOCK_PENDING_ACCOUNT_EULA_AND_BULK_RIGHTS' &&
  sameSet(psa.rights_evidence_refs, [providerGatePath, trustedSourcesPath]) &&
  psa.blocking_controls?.includes('ACCOUNT_PLUS_BEARER_TOKEN_REQUIRED') &&
  psa.blocking_controls?.includes('POPULATION_FIELD_ASSUMPTION_PROHIBITED'),
  'PSA_ZERO_CAPACITY_RIGHTS_GATE_REQUIRED');
assert(cgc?.rights_state === 'BLOCK_CONSERVATIVE_MANUAL_TERMS_REVIEW_NOT_CLEARED' &&
  cgc.grammar_fit_state === 'NOT_ENUMERATED_BECAUSE_RIGHTS_NOT_CLEARED' && cgc.prior_written_consent_present === false &&
  sameSet(cgc.rights_evidence_refs, [CGC_TERMS, trustedSourcesPath]) &&
  cgc.manual_terms_review?.evidence_mode === 'MANUAL_CONSERVATIVE_REPOSITORY_REVIEW_NO_AUTOMATED_FETCH' &&
  cgc.manual_terms_review?.reviewed_on === '2026-08-19' &&
  cgc.manual_terms_review?.terms_url === CGC_TERMS &&
  sameSet(cgc.manual_terms_review?.sections, ['1.2 Prohibited Uses', '2.2 Your Rights to Use the Website Content']) &&
  sameSet(cgc.manual_terms_review?.observed_controls, ['NO_ROBOT_OR_OTHER_AUTOMATIC_DEVICE_ACCESS_WITHOUT_PRIOR_WRITTEN_CONSENT', 'PERSONAL_INFORMATIONAL_NON_COMMERCIAL_CONTENT_USE_ONLY']) &&
  cgc.manual_terms_review?.review_projection_sha256 === digest({
    evidence_mode:cgc.manual_terms_review.evidence_mode,
    reviewed_on:cgc.manual_terms_review.reviewed_on,
    terms_url:cgc.manual_terms_review.terms_url,
    sections:cgc.manual_terms_review.sections,
    observed_controls:cgc.manual_terms_review.observed_controls,
  }) &&
  cgc.blocking_controls?.includes('AUTOMATIC_DEVICE_ACCESS_PROHIBITED_WITHOUT_PRIOR_WRITTEN_CONSENT') &&
  cgc.blocking_controls?.includes('CONTENT_USE_PERSONAL_INFORMATIONAL_NON_COMMERCIAL_ONLY'),
  'CGC_ZERO_CAPACITY_TERMS_BLOCK_REQUIRED');
assert(wikidata?.rights_state === 'ALLOW_CC0_STRUCTURED_DATA' &&
  wikidata.grammar_fit_state === 'NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT' &&
  sameSet(wikidata.rights_evidence_refs, [WIKIDATA_LICENSE]), 'WIKIDATA_CC0_RIGHTS_BUT_NO_SOURCE_FIT_REQUIRED');
for (const source of artifact.source_candidates) {
  const commonSourceKeys = [
    'authenticated_requests', 'blocking_controls', 'capacity_contribution', 'grammar_fit_state',
    'provider_record_requests', 'rights_admitted_records', 'rights_evidence_refs', 'rights_state',
    'scope_fit', 'source_family', 'source_records_observed',
  ];
  const expectedSourceKeys = source.source_family === 'cgc-population-and-certification-web'
    ? [...commonSourceKeys, 'manual_terms_review', 'prior_written_consent_present']
    : commonSourceKeys;
  assert(sameSet(Object.keys(source), expectedSourceKeys),
    `GRADED_SOURCE_CANDIDATE_SCHEMA_INVALID:${source.source_family}`);
  if (source.source_family === 'cgc-population-and-certification-web') {
    assert(sameSet(Object.keys(source.manual_terms_review || {}), [
      'evidence_mode', 'observed_controls', 'review_projection_sha256', 'reviewed_on', 'sections', 'terms_url',
    ]), 'CGC_MANUAL_TERMS_REVIEW_SCHEMA_INVALID');
  }
  assert(source.authenticated_requests === 0 && source.provider_record_requests === 0 &&
    source.source_records_observed === 0 && source.rights_admitted_records === 0 && source.capacity_contribution === 0,
  `SOURCE_MUST_CONTRIBUTE_ZERO:${source.source_family}`);
}

const live = artifact.cc0_live_schema_observation || {};
assert(live.source_family === 'wikidata-cc0-structured-data' && live.license === 'CC0-1.0' &&
  live.license_evidence_ref === WIKIDATA_LICENSE && live.accessed_at === artifact.generated_at,
  'WIKIDATA_CC0_LIVE_OBSERVATION_REQUIRED');
assert(Array.isArray(live.property_evidence) && live.property_evidence.length === 4, 'FOUR_WIKIDATA_PROPERTY_OBSERVATIONS_REQUIRED');
const propertyIds = new Set();
for (const property of live.property_evidence) {
  assert(sameSet(Object.keys(property), [
    'candidate_role', 'decision', 'expected_description_fragment', 'expected_label', 'id',
    'license_evidence_refs', 'observed_datatype', 'observed_description', 'observed_label',
    'source_payload_sha256', 'source_url',
  ]), `WIKIDATA_PROPERTY_EVIDENCE_SCHEMA_INVALID:${property.id}`);
  const expected = EXPECTED_PROPERTY_DECISIONS[property.id];
  assert(expected && !propertyIds.has(property.id), `WIKIDATA_PROPERTY_ID_INVALID_OR_DUPLICATE:${property.id}`);
  propertyIds.add(property.id);
  assert(property.expected_label === expected[0] && property.observed_label === expected[0] &&
    property.expected_description_fragment === expected[1] && property.observed_description?.includes(expected[1]) &&
    property.candidate_role === expected[2] && property.decision === expected[3] &&
    property.source_url === `https://www.wikidata.org/wiki/Special:EntityData/${property.id}.json` &&
    SHA256.test(property.source_payload_sha256 || '') && sameSet(property.license_evidence_refs, [WIKIDATA_LICENSE]),
  `WIKIDATA_PROPERTY_EVIDENCE_INVALID:${property.id}`);
}
assert(propertyIds.size === 4, 'WIKIDATA_PROPERTY_SET_INCOMPLETE');
assert(!('loose_rejected_candidate_shape' in live), 'UNNECESSARY_WIKIDATA_COUNT_QUERY_PROHIBITED');
assert(live.strict_grammar_record_query_executed === false &&
  live.strict_grammar_record_query_reason?.includes('NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT') &&
  artifact.truth_boundary?.includes('does not claim an exhaustive catalog-wide absence'),
  'NO_INFERRED_STRICT_RECORD_QUERY_REQUIRED');

assert(Array.isArray(artifact.records) && artifact.records.length === 0 &&
  Array.isArray(artifact.hard_negative_pairs) && artifact.hard_negative_pairs.length === 0 &&
  Array.isArray(artifact.cross_registry_alias_pairs) && artifact.cross_registry_alias_pairs.length === 0,
  'ZERO_ADMITTED_RECORD_AND_PAIR_ARRAYS_REQUIRED');
const metrics = artifact.metrics || {};
const zeroMetrics = [
  'grammar_fit_source_family_count',
  'rights_and_grammar_fit_source_family_count',
  'authenticated_requests',
  'provider_record_requests',
  'blocked_provider_source_records_observed',
  'rights_admitted_grammar_complete_real_record_count',
  'normalization_candidate_capacity',
  'hard_negative_pair_capacity',
  'cross_registry_alias_pair_capacity',
  'source_record_boundary_capacity',
  'physical_object_boundary_capacity',
  'conservative_case_capacity',
  'empirical_cases_created',
  'labels_created',
  'reviewers_created',
  'market_or_current_price_fields_observed',
];
assert(metrics.candidate_source_families_assessed === 4 && metrics.rights_compatible_source_family_count === 1 &&
  metrics.total_remote_get_requests === 4 && metrics.wikidata_schema_entities_observed === 4 &&
  !('wikidata_loose_rejected_candidate_shape_item_count' in metrics),
  'GRADED_CAPACITY_OBSERVED_METRICS_INVALID');
for (const key of zeroMetrics) assert(metrics[key] === 0, `GRADED_CAPACITY_ZERO_METRIC_REQUIRED:${key}`);

const gate = artifact.readiness_gate || {};
assert(JSON.stringify(gate.requirements) === JSON.stringify({
  rights_and_grammar_fit_source_family_floor:1,
  grammar_complete_real_record_floor:120,
  normalization_candidate_floor:40,
  hard_negative_pair_floor:40,
  cross_registry_alias_pair_floor:40,
  blind_source_record_capacity_floor:60,
  source_record_boundary_floor:60,
  physical_object_boundary_floor:60,
}), 'GRADED_READINESS_REQUIREMENTS_INVALID');
assert(Object.keys(gate.checks || {}).length === 9 && Object.values(gate.checks).every((value) => value === false),
  'ALL_GRADED_READINESS_CHECKS_MUST_FAIL');
assert(gate.source_capacity_ready_for_120_cases === false && gate.acquisition_lane_state === 'BLOCKED_RIGHTS_AND_SOURCE_FIT' &&
  sameSet(gate.blockers, EXPECTED_BLOCKERS), 'GRADED_READINESS_MUST_FAIL_CLOSED_WITH_EXACT_BLOCKERS');

const downstream = artifact.downstream_claims || {};
assert(downstream.empirical_cases_created === 0 && downstream.labels_collected === 0 &&
  downstream.independent_reviewers_assigned === 0 && downstream.independent_label_review_complete === false &&
  downstream.blind_holdout_sealed === false && downstream.empirical_benchmark_ready === false &&
  downstream.track_b_started === false && downstream.publication === 'HOLD' && downstream.production === 'HOLD',
  'GRADED_DOWNSTREAM_CLAIMS_MUST_REMAIN_BLOCKED');
assert(artifact.truth_boundary?.includes('zero provider-record requests') &&
  artifact.truth_boundary?.includes('No cases, labels, reviewers, market/current-price claims, publication or Production authority'),
  'GRADED_TRUTH_BOUNDARY_REQUIRED');

console.log(`PASS: GRADED_POPULATION observes ${metrics.rights_admitted_grammar_complete_real_record_count}/120 rights-admitted strict records and exact class capacity 0/40, 0/40, 0/40; PCGS/PSA/CGC remain zero-contribution and the bounded four-property Wikidata CC0 audit identified no exact mapping.`);
