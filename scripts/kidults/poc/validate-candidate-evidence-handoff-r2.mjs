import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [snapshotPath, evidencePath, outputPath = '/tmp/candidate-evidence-handoff-preflight-r2.json'] = process.argv.slice(2);
if (!snapshotPath || !evidencePath) {
  throw new Error('Usage: node validate-candidate-evidence-handoff-r2.mjs <snapshot-candidate.json> <evidence-package.json> [output.json]');
}

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '../../..');
const HANDOFF_CONTRACT_REPOSITORY_PATH =
  'coordination/kidults/poc/candidate-evidence-handoff-preflight-contract-r2.json';
const BENCHMARK_CONTRACT_REPOSITORY_PATH =
  'coordination/kidults/entity-resolution/entity-resolution-benchmark-v2-contract.json';
const APPROVED_STRATA_REPOSITORY_PATH =
  'coordination/kidults/entity-resolution/approved-bounded-poc-calibration-strata-v1.json';
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const STRICT_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sameCanonical = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const sortedUnique = (values) => [...new Set(values)].sort();
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());
const nonemptyStrings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const nonnegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const finiteUnit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const omit = (value, key) => Object.fromEntries(Object.entries(value || {}).filter(([name]) => name !== key));
const nearlyEqual = (left, right) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-12;
const secureHttpsUrl = (value) => {
  if (!nonempty(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && nonempty(parsed.hostname) && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
};
const strictUtcTimestamp = (value) => STRICT_UTC_TIMESTAMP_PATTERN.test(value || '') && Number.isFinite(Date.parse(value));
const readRepositoryJson = async (repositoryPath) => JSON.parse(
  await fs.readFile(path.resolve(REPOSITORY_ROOT, repositoryPath), 'utf8'),
);
const wilsonLowerBound = (successes, total, z = 1.959963984540054) => {
  if (!nonnegativeInteger(successes) || !nonnegativeInteger(total) || total === 0 || successes > total) return null;
  const proportion = successes / total;
  const zSquared = z * z;
  const denominator = 1 + zSquared / total;
  const centre = proportion + zSquared / (2 * total);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * total)) / total);
  return (centre - margin) / denominator;
};

const [snapshot, evidence, handoffContract, benchmarkContract, approvedStrata] = await Promise.all([
  fs.readFile(snapshotPath, 'utf8').then(JSON.parse),
  fs.readFile(evidencePath, 'utf8').then(JSON.parse),
  readRepositoryJson(HANDOFF_CONTRACT_REPOSITORY_PATH),
  readRepositoryJson(BENCHMARK_CONTRACT_REPOSITORY_PATH),
  readRepositoryJson(APPROVED_STRATA_REPOSITORY_PATH),
]);

const governance = handoffContract.canonical_governance || {};
const policy = benchmarkContract.empirical_attestation_policy || {};
const samplePolicy = policy.empirical_sample_policy || {};
const approvedStrataSha256 = digest(approvedStrata);
const benchmarkContractSha256 = digest(benchmarkContract);
const handoffContractSha256 = digest(handoffContract);
const samplePolicySha256 = digest(samplePolicy);
const approvedStratumIds = sortedUnique(approvedStrata.approved_strata_ids || []);
const requiredStratumIds = sortedUnique(approvedStrata.required_strata_ids || []);
const requiredScopeArchetypes = sortedUnique(policy.required_poc_scope_archetypes || []);
const requiredIdentityBoundaries = sortedUnique(benchmarkContract.identity_boundaries || []);
const requiredCaseClasses = sortedUnique(benchmarkContract.required_case_classes || []);
const currentMarketPolicy = handoffContract.required_gates?.claims?.current_market_evidence_record || {};
const currentMarketMaximumWindowDays = Number(currentMarketPolicy.maximum_window_days);

if (handoffContract.id !== 'candidate-evidence-handoff-preflight-contract-r2' ||
    governance.entity_resolution_benchmark_contract_path !== BENCHMARK_CONTRACT_REPOSITORY_PATH ||
    governance.approved_strata_manifest_path !== APPROVED_STRATA_REPOSITORY_PATH ||
    governance.entity_resolution_benchmark_contract_id !== benchmarkContract.id ||
    governance.approved_strata_manifest_id !== approvedStrata.id ||
    governance.approved_strata_manifest_status !== approvedStrata.status ||
    benchmarkContract.id !== 'entity-resolution-benchmark-v2-contract' ||
    policy.approved_calibration_strata_path !== APPROVED_STRATA_REPOSITORY_PATH ||
    policy.approved_calibration_strata_id !== approvedStrata.id ||
    policy.approved_calibration_strata_status !== approvedStrata.status ||
    policy.approved_calibration_strata_sha256 !== approvedStrataSha256 ||
    policy.empirical_sample_policy_sha256 !== samplePolicySha256 ||
    policy.required !== true ||
    !sameCanonical(policy.dataset_payload_digest_fields, ['id', 'dataset_class', 'cases']) ||
    samplePolicy.wilson_confidence_level !== 0.95 ||
    !Number.isInteger(currentMarketMaximumWindowDays) || currentMarketMaximumWindowDays <= 0 ||
    approvedStratumIds.length === 0 ||
    !sameCanonical(approvedStratumIds, requiredStratumIds)) {
  throw new Error('CANONICAL_HANDOFF_GOVERNANCE_INVALID');
}

const blockers = [];
const block = (code) => blockers.push(code);
const requireValue = (value, code) => { if (!nonempty(value)) block(code); };
const er = evidence.entity_resolution || {};

if (Number(er.required_strata) !== requiredStratumIds.length) block('ER_REQUIRED_STRATA_NOT_CANONICAL');
if (Number(er.complete_strata) !== requiredStratumIds.length) block('ER_REQUIRED_STRATA_INCOMPLETE');
const representedStrata = sortedUnique(Array.isArray(er.represented_approved_strata_ids)
  ? er.represented_approved_strata_ids.filter(nonempty)
  : []);
if (!sameCanonical(representedStrata, requiredStratumIds)) block('ER_CANONICAL_APPROVED_STRATA_SET_INCOMPLETE');
const computedScopeStratificationComplete = sameCanonical(representedStrata, requiredStratumIds) &&
  Number(er.complete_strata) === requiredStratumIds.length;
if (!computedScopeStratificationComplete || er.final_scope_stratification_complete !== true) {
  block('ER_FINAL_SCOPE_STRATIFICATION_NOT_COMPLETE');
}
if (er.dataset_class !== 'REAL_WORLD_LABELED') block('ER_FINAL_DATASET_NOT_REAL_WORLD_LABELED');
if (er.constructed_control !== false) block('ER_CONSTRUCTED_CONTROL_NOT_EMPIRICAL');
if (er.empirical_benchmark_eligible !== true) block('ER_EMPIRICAL_BENCHMARK_NOT_ELIGIBLE');
if (er.constructed_control === true && [
  er.overall_accuracy,
  er.blind_accuracy,
  er.overall_accuracy_wilson_lower_95,
  er.blind_accuracy_wilson_lower_95,
].some((value) => value !== null)) {
  block('ER_CONSTRUCTED_CONTROL_METRICS_MUST_BE_NULL');
}
if (Number(er.rights_coverage) !== 1) block('ENTITY_RESOLUTION_RIGHTS_COVERAGE_NOT_1');
if (Number(er.provenance_coverage) !== 1) block('ENTITY_RESOLUTION_PROVENANCE_COVERAGE_NOT_1');
requireValue(er.final_dataset_id, 'ER_FINAL_DATASET_REQUIRED');
if (!nonempty(er.final_dataset_payload_sha256)) block('ER_FINAL_DATASET_DIGEST_REQUIRED');
else if (!SHA256_PATTERN.test(er.final_dataset_payload_sha256)) block('ER_FINAL_DATASET_DIGEST_INVALID');
if (er.approved_strata_manifest_id !== approvedStrata.id || er.approved_strata_manifest_sha256 !== approvedStrataSha256) {
  block('ER_CANONICAL_APPROVED_STRATA_BINDING_MISMATCH');
}
if (er.empirical_sample_policy_sha256 !== samplePolicySha256) block('ER_CANONICAL_SAMPLE_POLICY_BINDING_MISMATCH');
requireValue(er.blind_holdout_freeze_id, 'ER_BLIND_HOLDOUT_FREEZE_REQUIRED');
requireValue(er.calibration_artifact_id, 'ER_CALIBRATION_ARTIFACT_REQUIRED');

const observations = er.empirical_observations || {};
const totalCases = observations.total_cases;
const blindCases = observations.blind_holdout_cases;
const correctCases = observations.correct_cases;
const blindCorrectCases = observations.blind_correct_cases;
const observationsValid = nonnegativeInteger(totalCases) && totalCases > 0 &&
  nonnegativeInteger(blindCases) && blindCases > 0 && blindCases <= totalCases &&
  nonnegativeInteger(correctCases) && correctCases <= totalCases &&
  nonnegativeInteger(blindCorrectCases) && blindCorrectCases <= blindCases &&
  nonnegativeInteger(observations.critical_false_auto_merge) &&
  nonnegativeInteger(observations.blind_critical_false_auto_merge);
if (!observationsValid) block('ER_EMPIRICAL_OBSERVATION_COUNTS_INVALID');

const deriveCountMapGate = (value, expectedKeys, total, minimum, code) => {
  const map = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keys = Object.keys(map).sort();
  const values = keys.map((key) => map[key]);
  const valid = sameCanonical(keys, expectedKeys) && values.every(nonnegativeInteger) &&
    nonnegativeInteger(total) && values.reduce((sum, count) => sum + count, 0) === total &&
    expectedKeys.every((key) => map[key] >= Number(minimum));
  if (!valid) block(code);
  return valid;
};
const scopeSampleFloorPass = deriveCountMapGate(
  observations.cases_per_required_scope_archetype,
  requiredScopeArchetypes,
  totalCases,
  samplePolicy.minimum_cases_per_required_scope_archetype,
  'ER_SCOPE_ARCHETYPE_SAMPLE_FLOORS_NOT_MET',
);
const blindScopeSampleFloorPass = deriveCountMapGate(
  observations.blind_cases_per_required_scope_archetype,
  requiredScopeArchetypes,
  blindCases,
  samplePolicy.minimum_blind_cases_per_required_scope_archetype,
  'ER_BLIND_SCOPE_ARCHETYPE_SAMPLE_FLOORS_NOT_MET',
);
const boundarySampleFloorPass = deriveCountMapGate(
  observations.cases_per_identity_boundary,
  requiredIdentityBoundaries,
  totalCases,
  samplePolicy.minimum_cases_per_identity_boundary,
  'ER_IDENTITY_BOUNDARY_SAMPLE_FLOORS_NOT_MET',
);
const caseClassSampleFloorPass = deriveCountMapGate(
  observations.cases_per_required_case_class,
  requiredCaseClasses,
  totalCases,
  samplePolicy.minimum_cases_per_required_case_class,
  'ER_CASE_CLASS_SAMPLE_FLOORS_NOT_MET',
);
const aggregateSampleFloorsPass = observationsValid &&
  totalCases >= Number(samplePolicy.minimum_total_cases) &&
  blindCases >= Number(samplePolicy.minimum_blind_holdout_cases);
if (!aggregateSampleFloorsPass) block('ER_AGGREGATE_SAMPLE_FLOORS_NOT_MET');

const computedOverallAccuracy = observationsValid ? correctCases / totalCases : null;
const computedBlindAccuracy = observationsValid ? blindCorrectCases / blindCases : null;
const computedOverallWilsonLower95 = observationsValid ? wilsonLowerBound(correctCases, totalCases) : null;
const computedBlindWilsonLower95 = observationsValid ? wilsonLowerBound(blindCorrectCases, blindCases) : null;
if (computedOverallAccuracy === null || computedOverallAccuracy < Number(benchmarkContract.accuracy_target)) {
  block('ENTITY_RESOLUTION_OVERALL_LT_TARGET');
}
if (computedBlindAccuracy === null || computedBlindAccuracy < Number(benchmarkContract.accuracy_target)) {
  block('ENTITY_RESOLUTION_BLIND_LT_TARGET');
}
if (computedOverallWilsonLower95 === null ||
    computedOverallWilsonLower95 < Number(samplePolicy.minimum_overall_accuracy_wilson_lower_bound)) {
  block('ENTITY_RESOLUTION_OVERALL_WILSON_LT_TARGET');
}
if (computedBlindWilsonLower95 === null ||
    computedBlindWilsonLower95 < Number(samplePolicy.minimum_blind_accuracy_wilson_lower_bound)) {
  block('ENTITY_RESOLUTION_BLIND_WILSON_LT_TARGET');
}
if (!observationsValid || observations.critical_false_auto_merge !== 0) block('CRITICAL_FALSE_AUTO_MERGE_NONZERO_OR_UNMEASURED');
if (!observationsValid || observations.blind_critical_false_auto_merge !== 0) {
  block('BLIND_CRITICAL_FALSE_AUTO_MERGE_NONZERO_OR_UNMEASURED');
}
if (computedOverallAccuracy !== null && !nearlyEqual(er.overall_accuracy, computedOverallAccuracy)) {
  block('ER_REPORTED_OVERALL_ACCURACY_MISMATCH');
}
if (computedBlindAccuracy !== null && !nearlyEqual(er.blind_accuracy, computedBlindAccuracy)) {
  block('ER_REPORTED_BLIND_ACCURACY_MISMATCH');
}
if (computedOverallWilsonLower95 !== null && !nearlyEqual(er.overall_accuracy_wilson_lower_95, computedOverallWilsonLower95)) {
  block('ER_REPORTED_OVERALL_WILSON_MISMATCH');
}
if (computedBlindWilsonLower95 !== null && !nearlyEqual(er.blind_accuracy_wilson_lower_95, computedBlindWilsonLower95)) {
  block('ER_REPORTED_BLIND_WILSON_MISMATCH');
}

const attestation = er.empirical_attestation_manifest;
let attestationFingerprint = null;
let attestationFingerprintApproved = false;
let attestationVerified = false;
if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
  block('ER_EMPIRICAL_ATTESTATION_REQUIRED');
} else {
  attestationFingerprint = digest(attestation);
  attestationFingerprintApproved = Array.isArray(policy.approved_manifest_fingerprints) &&
    policy.approved_manifest_fingerprints.includes(attestationFingerprint);
  if (!attestationFingerprintApproved) block('ER_EMPIRICAL_ATTESTATION_FINGERPRINT_NOT_APPROVED');
  const reviewerIds = sortedUnique((attestation.independent_label_review?.reviewer_ids || []).filter(nonempty));
  const blindCaseIds = sortedUnique((attestation.holdout?.blind_case_ids || []).filter(nonempty));
  const sealedAt = Date.parse(attestation.holdout?.sealed_at || '');
  const modelFrozenAt = Date.parse(attestation.holdout?.model_frozen_at || '');
  const datasetBindingPass = attestation.dataset_id === er.final_dataset_id &&
    attestation.dataset_payload_sha256 === er.final_dataset_payload_sha256;
  const independentReviewPass = attestation.independent_label_review?.completed === true &&
    reviewerIds.length >= Number(policy.minimum_independent_reviewers);
  const adjudicationPass = attestation.label_adjudication?.completed === true;
  const holdoutPass = attestation.holdout?.sealed_before_modeling === true &&
    attestation.holdout?.labels_inaccessible_until_model_freeze === true &&
    Number.isFinite(sealedAt) && Number.isFinite(modelFrozenAt) && sealedAt < modelFrozenAt &&
    nonnegativeInteger(blindCases) && blindCaseIds.length === blindCases;
  const governanceBindingPass = attestation.approved_calibration_strata_sha256 === approvedStrataSha256 &&
    sameCanonical(sortedUnique(attestation.required_stratum_ids || []), requiredStratumIds) &&
    attestation.empirical_sample_policy_sha256 === samplePolicySha256 &&
    sameCanonical(attestation.empirical_sample_policy, samplePolicy);
  const observationBindingPass = sameCanonical(attestation.empirical_observations, observations);
  if (!datasetBindingPass) block('ER_ATTESTATION_DATASET_BINDING_MISMATCH');
  if (!independentReviewPass) block('ER_INDEPENDENT_LABEL_REVIEW_REQUIRED');
  if (!adjudicationPass) block('ER_LABEL_ADJUDICATION_REQUIRED');
  if (!holdoutPass) block('ER_BLIND_HOLDOUT_SEAL_INVALID');
  if (!governanceBindingPass) block('ER_ATTESTATION_CANONICAL_POLICY_BINDING_MISMATCH');
  if (!observationBindingPass) block('ER_ATTESTATION_OBSERVATION_BINDING_MISMATCH');
  attestationVerified = attestationFingerprintApproved && datasetBindingPass && independentReviewPass &&
    adjudicationPass && holdoutPass && governanceBindingPass && observationBindingPass;
}
if (er.empirical_attestation_present !== Boolean(attestation)) block('ER_REPORTED_ATTESTATION_PRESENCE_MISMATCH');
if (er.empirical_attestation_approved !== attestationFingerprintApproved) block('ER_REPORTED_ATTESTATION_APPROVAL_MISMATCH');
if (er.empirical_attestation !== attestationVerified) block('ER_REPORTED_EMPIRICAL_ATTESTATION_MISMATCH');
if (er.independent_label_review_complete !== attestationVerified) block('ER_REPORTED_INDEPENDENT_REVIEW_MISMATCH');
if (er.label_adjudication_complete !== attestationVerified) block('ER_REPORTED_ADJUDICATION_MISMATCH');
if (er.holdout_sealed_before_modeling !== attestationVerified) block('ER_REPORTED_HOLDOUT_SEAL_MISMATCH');

requireValue(evidence.package_id, 'EVIDENCE_PACKAGE_ID_REQUIRED');
if (evidence.package_status !== 'IMMUTABLE') block('EVIDENCE_PACKAGE_NOT_IMMUTABLE');
for (const [field, label] of [
  ['registry_version', 'EVIDENCE_PACKAGE_REGISTRY_VERSION'],
  ['methodology_version', 'EVIDENCE_PACKAGE_METHODOLOGY_VERSION'],
  ['evidence_lineage_version', 'EVIDENCE_PACKAGE_EVIDENCE_LINEAGE_VERSION'],
]) requireValue(evidence[field], `${label}_REQUIRED`);
const computedEvidencePayloadSha256 = digest(omit(evidence, 'package_payload_sha256'));
if (!nonempty(evidence.package_payload_sha256)) block('EVIDENCE_PACKAGE_DIGEST_REQUIRED');
else if (!SHA256_PATTERN.test(evidence.package_payload_sha256) || evidence.package_payload_sha256 !== computedEvidencePayloadSha256) {
  block('EVIDENCE_PACKAGE_DIGEST_MISMATCH');
}
if (evidence.bound_snapshot_id !== snapshot.snapshot_id || snapshot.bound_evidence_package_id !== evidence.package_id) {
  block('SNAPSHOT_EVIDENCE_PACKAGE_BINDING_MISMATCH');
}
if (evidence.publication_authorized === true) block('EVIDENCE_PACKAGE_MUST_NOT_PREAUTHORIZE_PUBLICATION');
if (evidence.production_authorized === true) block('EVIDENCE_PACKAGE_MUST_NOT_PREAUTHORIZE_PRODUCTION');

const evidenceRecords = Array.isArray(evidence.evidence_records) ? evidence.evidence_records : [];
const evidenceRecordById = new Map();
const snapshotAsOfMs = strictUtcTimestamp(snapshot.as_of) ? Date.parse(snapshot.as_of) : null;
if (snapshotAsOfMs === null) block('SNAPSHOT_AS_OF_REQUIRED_OR_INVALID');
const currentMarketRecordValid = (record) => {
  const observedAtMs = strictUtcTimestamp(record?.observed_at) ? Date.parse(record.observed_at) : null;
  const validUntilMs = strictUtcTimestamp(record?.valid_until) ? Date.parse(record.valid_until) : null;
  const maximumWindowMs = currentMarketMaximumWindowDays * 24 * 60 * 60 * 1000;
  return record?.temporality === 'CURRENT_MARKET' && record?.market_observation_type === 'SOLD_TRANSACTION' &&
    secureHttpsUrl(record?.source_url) && SHA256_PATTERN.test(record?.source_payload_sha256 || '') &&
    !/^sha256:0{64}$/.test(record.source_payload_sha256) &&
    nonemptyStrings(record?.license_evidence_refs) && record.license_evidence_refs.every(secureHttpsUrl) &&
    snapshotAsOfMs !== null && observedAtMs !== null && validUntilMs !== null &&
    observedAtMs <= snapshotAsOfMs && snapshotAsOfMs <= validUntilMs &&
    validUntilMs > observedAtMs && validUntilMs - observedAtMs <= maximumWindowMs &&
    snapshotAsOfMs - observedAtMs <= maximumWindowMs;
};
for (const record of evidenceRecords) {
  if (!nonempty(record?.evidence_id) || evidenceRecordById.has(record.evidence_id)) {
    block(`EVIDENCE_RECORD_ID_INVALID_OR_DUPLICATE:${record?.evidence_id || 'UNKNOWN'}`);
  } else {
    evidenceRecordById.set(record.evidence_id, record);
    if (record.temporality === 'CURRENT_MARKET' && !currentMarketRecordValid(record)) {
      block(`CURRENT_MARKET_EVIDENCE_RECORD_INVALID:${record.evidence_id}`);
    }
  }
}
const claims = Array.isArray(evidence.claims) ? evidence.claims : [];
if (claims.length === 0) block('CLAIMS_REQUIRED');
let computedCurrentMarketEvidencePresent = false;
for (const claim of claims) {
  const id = nonempty(claim?.claim_id) ? claim.claim_id : 'UNKNOWN';
  const refs = nonemptyStrings(claim?.evidence_refs) ? claim.evidence_refs : [];
  if (refs.length === 0) block(`CLAIM_NO_EVIDENCE:${id}`);
  const resolved = refs.map((ref) => evidenceRecordById.get(ref)).filter(Boolean);
  if (resolved.length !== refs.length) block(`CLAIM_EVIDENCE_REF_UNRESOLVED:${id}`);
  if (claim.rights_state !== 'ALLOW' || resolved.some((record) => record.rights_state !== 'ALLOW')) {
    block(`CLAIM_RIGHTS_NOT_ALLOW:${id}`);
  }
  const strengths = resolved.map((record) => record.evidence_strength).filter(finiteUnit);
  const resolvedStrength = strengths.length === resolved.length && strengths.length > 0 ? Math.max(...strengths) : null;
  if (!finiteUnit(claim.claim_strength) || resolvedStrength === null || claim.claim_strength > resolvedStrength) {
    block(`CLAIM_STRENGTH_EXCEEDS_EVIDENCE:${id}`);
  }
  const currentRecords = resolved.filter(currentMarketRecordValid);
  const hasCurrentMarketEvidence = currentRecords.length > 0;
  computedCurrentMarketEvidencePresent ||= hasCurrentMarketEvidence;
  if (claim.temporality === 'CURRENT_MARKET' && !hasCurrentMarketEvidence) {
    block(`CURRENT_CLAIM_WITHOUT_CURRENT_EVIDENCE:${id}`);
  }
  if (claim.current_market_evidence_present !== hasCurrentMarketEvidence) {
    block(`CLAIM_REPORTED_CURRENT_EVIDENCE_MISMATCH:${id}`);
  }
  if (claim.listing_only === true && claim.claim_type === 'SOLD_TRANSACTION') block(`LISTING_AS_SOLD:${id}`);
}
if (er.current_market_evidence_present !== computedCurrentMarketEvidencePresent) {
  block('ER_REPORTED_CURRENT_MARKET_EVIDENCE_MISMATCH');
}
if (er.current_market_evidence !== computedCurrentMarketEvidencePresent) {
  block('ER_REPORTED_CURRENT_MARKET_EVIDENCE_TRUTH_MISMATCH');
}
if (Number(evidence.unresolved_critical_contradiction_count ?? -1) !== 0) block('UNRESOLVED_CRITICAL_CONTRADICTIONS');
if (Number(evidence.unknown_or_denied_claim_input_count ?? -1) !== 0) block('UNKNOWN_OR_DENIED_CLAIM_INPUTS');

for (const [field, label] of [
  ['snapshot_id', 'SNAPSHOT_ID'],
  ['registry_version', 'SNAPSHOT_REGISTRY_VERSION'],
  ['methodology_version', 'SNAPSHOT_METHODOLOGY_VERSION'],
  ['evidence_lineage_version', 'SNAPSHOT_EVIDENCE_LINEAGE_VERSION'],
]) requireValue(snapshot[field], `${label}_REQUIRED`);
if (snapshot.snapshot_status !== 'DRAFT_CANDIDATE') block('SNAPSHOT_STATUS_NOT_DRAFT_CANDIDATE');
if (snapshot.publication_eligible === true) block('CANDIDATE_MUST_NOT_PREAUTHORIZE_PUBLICATION');
if (snapshot.production_authorized === true) block('CANDIDATE_MUST_NOT_PREAUTHORIZE_PRODUCTION');
const computedSnapshotPayloadSha256 = digest(omit(snapshot, 'snapshot_payload_sha256'));
if (!nonempty(snapshot.snapshot_payload_sha256)) block('SNAPSHOT_DIGEST_REQUIRED');
else if (!SHA256_PATTERN.test(snapshot.snapshot_payload_sha256) || snapshot.snapshot_payload_sha256 !== computedSnapshotPayloadSha256) {
  block('SNAPSHOT_DIGEST_MISMATCH');
}

const empiricalSampleFloorsPass = aggregateSampleFloorsPass && scopeSampleFloorPass && blindScopeSampleFloorPass &&
  boundarySampleFloorPass && caseClassSampleFloorPass;
const empiricalMetricGatesPass = computedOverallAccuracy !== null && computedBlindAccuracy !== null &&
  computedOverallWilsonLower95 !== null && computedBlindWilsonLower95 !== null &&
  computedOverallAccuracy >= Number(benchmarkContract.accuracy_target) &&
  computedBlindAccuracy >= Number(benchmarkContract.accuracy_target) &&
  computedOverallWilsonLower95 >= Number(samplePolicy.minimum_overall_accuracy_wilson_lower_bound) &&
  computedBlindWilsonLower95 >= Number(samplePolicy.minimum_blind_accuracy_wilson_lower_bound) &&
  observations.critical_false_auto_merge === 0 && observations.blind_critical_false_auto_merge === 0;
const uniqueBlockers = sortedUnique(blockers);
const pairDigest = digest({ snapshot, evidence });
const result = {
  id: 'candidate-evidence-handoff-preflight-r2',
  contract_version: handoffContract.version,
  snapshot_id: snapshot.snapshot_id || null,
  evidence_package_id: evidence.package_id || null,
  pair_digest: pairDigest,
  snapshot_payload_sha256: computedSnapshotPayloadSha256,
  evidence_package_payload_sha256: computedEvidencePayloadSha256,
  canonical_governance: {
    handoff_contract_sha256: handoffContractSha256,
    entity_resolution_benchmark_contract_sha256: benchmarkContractSha256,
    approved_strata_manifest_sha256: approvedStrataSha256,
    empirical_sample_policy_sha256: samplePolicySha256,
    approved_empirical_attestation_fingerprint_count: Array.isArray(policy.approved_manifest_fingerprints)
      ? policy.approved_manifest_fingerprints.length
      : 0,
  },
  computed_entity_resolution_gates: {
    canonical_required_strata_count: requiredStratumIds.length,
    canonical_approved_strata_set_complete: computedScopeStratificationComplete,
    final_dataset_payload_sha256: SHA256_PATTERN.test(er.final_dataset_payload_sha256 || '')
      ? er.final_dataset_payload_sha256
      : null,
    empirical_attestation_fingerprint: attestationFingerprint,
    empirical_attestation_fingerprint_approved: attestationFingerprintApproved,
    empirical_attestation_verified: attestationVerified,
    total_cases: nonnegativeInteger(totalCases) ? totalCases : null,
    blind_holdout_cases: nonnegativeInteger(blindCases) ? blindCases : null,
    overall_accuracy: computedOverallAccuracy,
    blind_accuracy: computedBlindAccuracy,
    overall_accuracy_wilson_lower_95: computedOverallWilsonLower95,
    blind_accuracy_wilson_lower_95: computedBlindWilsonLower95,
    empirical_sample_floors_pass: empiricalSampleFloorsPass,
    empirical_metric_gates_pass: empiricalMetricGatesPass,
    current_market_evidence_present: computedCurrentMarketEvidencePresent,
    caller_gate_booleans_authoritative: false,
    caller_point_estimates_authoritative: false,
  },
  handoff_state: uniqueBlockers.length === 0 ? 'READY_FOR_TRACK_B' : 'BLOCKED',
  handoff_semantics: 'TRACK_B_SUBMISSION_ELIGIBILITY_ONLY',
  blocker_count: uniqueBlockers.length,
  blockers: uniqueBlockers,
  track_b_input_pair: ['snapshot-candidate.json', 'evidence-package.json'],
  track_b_assessment: 'NOT_PERFORMED_BY_THIS_PREFLIGHT',
  track_b_pass: 'NOT_ASSERTED_BY_THIS_PREFLIGHT',
  publication: 'HOLD',
  production: 'HOLD',
  truth_boundary: uniqueBlockers.length === 0
    ? 'The exact digest-bound immutable pair satisfies Track A handoff gates and is eligible only for Track B submission. This is never Track B PASS, publication approval, public release or Production authorization.'
    : 'The pair is not eligible for Track B submission until every evidence-derived blocker is removed. CI/local success, caller booleans, constructed-control mechanics and point estimates cannot waive an evidence gate.',
};

await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (process.env.KAIOS_REQUIRE_HANDOFF_READY === '1' && uniqueBlockers.length > 0) process.exit(2);
