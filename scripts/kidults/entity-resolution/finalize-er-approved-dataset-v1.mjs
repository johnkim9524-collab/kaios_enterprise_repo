import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [datasetPath, resultsPath, manifestPath, contractPath, outputPath = '/tmp/er-final-approved-v1.json'] =
  process.argv.slice(2);
if (!datasetPath || !resultsPath || !manifestPath || !contractPath) {
  throw new Error(
    'Usage: node finalize-er-approved-dataset-v1.mjs <dataset.json> <benchmark-results.json> <approved-strata-manifest.json> <benchmark-contract.json> [output.json]',
  );
}

const [dataset, results, manifest, contract] = await Promise.all(
  [datasetPath, resultsPath, manifestPath, contractPath].map(async (file) =>
    JSON.parse(await fs.readFile(file, 'utf8'))),
);

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sortedUnique = (values) => [...new Set(values)].sort();
const sameStrings = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  new Set(left).size === left.length && new Set(right).size === right.length &&
  JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
const validSourceEvidence = (evidence) =>
  typeof evidence?.source_url === 'string' && /^https:\/\//.test(evidence.source_url) &&
  /^sha256:[a-f0-9]{64}$/.test(evidence?.source_payload_sha256 || '') &&
  Array.isArray(evidence?.license_evidence_refs) && evidence.license_evidence_refs.length > 0 &&
  evidence.license_evidence_refs.every((ref) => typeof ref === 'string' && /^https:\/\//.test(ref));

const blockers = [];
const block = (condition, code) => { if (!condition) blockers.push(code); };
const policy = contract.empirical_attestation_policy || {};
const samplePolicy = policy.empirical_sample_policy || {};

block(contract.id === 'entity-resolution-benchmark-v2-contract' && contract.status === 'ACTIVE_P0',
  'FINALIZE_ACTIVE_BENCHMARK_CONTRACT_REQUIRED');
block(manifest.id === policy.approved_calibration_strata_id &&
  manifest.status === policy.approved_calibration_strata_status,
  'FINALIZE_CANONICAL_APPROVED_STRATA_MANIFEST_REQUIRED');
block(digest(manifest) === policy.approved_calibration_strata_sha256,
  'FINALIZE_APPROVED_STRATA_DIGEST_MISMATCH');
block(sameStrings(manifest.approved_strata_ids, manifest.required_strata_ids) &&
  manifest.required_strata_ids?.length === 7,
  'FINALIZE_EXACT_SEVEN_REQUIRED_STRATA_REQUIRED');
block(dataset.approved_strata_manifest_id === manifest.id &&
  sameStrings(dataset.approved_scope_ids, manifest.approved_strata_ids) &&
  sameStrings(dataset.required_scope_ids, manifest.required_strata_ids),
  'FINALIZE_DATASET_MANIFEST_BINDING_MISMATCH');
block(Array.isArray(dataset.cases) && dataset.cases.length > 0 &&
  new Set(dataset.cases.map((item) => item.case_id)).size === dataset.cases.length &&
  dataset.cases.every((item) => typeof item.case_id === 'string' && item.case_id.trim()),
  'FINALIZE_UNIQUE_NONEMPTY_CASES_REQUIRED');
block(dataset.cases?.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 &&
  item.source_evidence.every(validSourceEvidence) && Array.isArray(item.provenance_refs) &&
  item.provenance_refs.length > 0 && item.rights_state === 'ALLOW'),
  'FINALIZE_PER_CASE_SOURCE_EVIDENCE_RIGHTS_PROVENANCE_REQUIRED');

const represented = sortedUnique((dataset.cases || []).map((item) => item.scope_id)
  .filter((scopeId) => manifest.required_strata_ids?.includes(scopeId)));
const rowById = new Map((manifest.strata || []).map((row) => [row.stratum_id, row]));
const perStratum = {};
for (const stratumId of [...(manifest.required_strata_ids || [])].sort()) {
  const rule = rowById.get(stratumId);
  const cases = (dataset.cases || []).filter((item) => item.scope_id === stratumId);
  const classes = new Set(cases.map((item) => item.case_class));
  const boundaries = new Set(cases.map((item) => item.identity_boundary));
  const missingClasses = (rule?.minimum_case_classes || []).filter((value) => !classes.has(value));
  const missingBoundaries = (rule?.minimum_boundaries || []).filter((value) => !boundaries.has(value));
  perStratum[stratumId] = {
    case_count:cases.length,
    missing_case_classes:missingClasses,
    missing_boundaries:missingBoundaries,
    complete:Boolean(rule) && cases.length > 0 && missingClasses.length === 0 && missingBoundaries.length === 0,
  };
}
const incompleteStrata = Object.entries(perStratum).filter(([, value]) => !value.complete).map(([id]) => id);
block(incompleteStrata.length === 0 && represented.length === 7,
  `FINALIZE_PER_STRATUM_INCOMPLETE:${incompleteStrata.join(',') || 'REPRESENTATION'}`);

const datasetPayloadFields = policy.dataset_payload_digest_fields || [];
const datasetPayload = Object.fromEntries(datasetPayloadFields.map((field) => [field, dataset[field]]));
const datasetPayloadSha256 = digest(datasetPayload);
block(results.id === 'entity-resolution-benchmark-v2-results' && results.dataset_id === dataset.id,
  'FINALIZE_BENCHMARK_RESULT_DATASET_ID_MISMATCH');
block(results.promotion_gate?.dataset_payload_sha256 === datasetPayloadSha256,
  'FINALIZE_BENCHMARK_RESULT_DATASET_DIGEST_MISMATCH');
block(results.deterministic_replay === 'PASS', 'FINALIZE_DETERMINISTIC_REPLAY_REQUIRED');
block(results.coverage?.per_stratum_requirements_complete === true &&
  results.coverage?.scope_stratification_complete === true,
  'FINALIZE_BENCHMARK_SEVEN_STRATA_COVERAGE_REQUIRED');

const empiricalFlags = dataset.dataset_class === 'REAL_WORLD_LABELED' && dataset.synthetic !== true &&
  dataset.constructed_control !== true && dataset.empirical_benchmark_eligible === true &&
  dataset.independent_label_review_complete === true && dataset.label_adjudication_complete === true &&
  dataset.holdout_sealed_before_modeling === true;
block(empiricalFlags, 'FINALIZE_EMPIRICAL_DATASET_FLAGS_REQUIRED');
block(dataset.constructed_control !== true &&
  !(dataset.cases || []).some((item) => String(item.label_basis || '').includes('ALGORITHMICALLY_CONSTRUCTED')),
  'FINALIZE_CONSTRUCTED_CONTROL_PROHIBITED');
block(Array.isArray(policy.approved_manifest_fingerprints) && policy.approved_manifest_fingerprints.length > 0,
  'FINALIZE_CANONICALLY_APPROVED_EMPIRICAL_ATTESTATION_REQUIRED');
block(results.promotion_gate?.empirical_attestation_fingerprint_approved === true &&
  results.promotion_gate?.empirical_attestation_verified === true &&
  results.promotion_gate?.track_b_assessment === 'APPROVED_ATTESTATION_VERIFIED',
  'FINALIZE_VERIFIED_TRACK_B_EMPIRICAL_ATTESTATION_REQUIRED');
block(results.promotion_gate?.empirical_sample_floors_complete === true &&
  Number(results.case_count) >= Number(samplePolicy.minimum_total_cases) &&
  Number(results.blind_holdout_count) >= Number(samplePolicy.minimum_blind_holdout_cases),
  'FINALIZE_EMPIRICAL_SAMPLE_FLOORS_REQUIRED');
block(results.promotion_gate?.overall_accuracy_wilson_lower_bound_gte_099 === true &&
  results.promotion_gate?.blind_accuracy_wilson_lower_bound_gte_099 === true &&
  Number(results.overall_accuracy_wilson_lower_95) >= Number(samplePolicy.minimum_overall_accuracy_wilson_lower_bound) &&
  Number(results.blind_accuracy_wilson_lower_95) >= Number(samplePolicy.minimum_blind_accuracy_wilson_lower_bound),
  'FINALIZE_WILSON95_LOWER_BOUNDS_REQUIRED');
block(results.promotion_gate?.source_payload_digest_and_license_evidence_bound === true,
  'FINALIZE_ATTESTED_CASE_EVIDENCE_BINDING_REQUIRED');
block(results.promotion_gate?.empirical_benchmark_gate_pass === true &&
  results.promotion_gate?.real_world_dataset === true,
  'FINALIZE_EMPIRICAL_BENCHMARK_GATE_REQUIRED');
block(results.promotion_gate?.promotion_eligible_before_track_b === false &&
  results.promotion_gate?.production_promotion_authorized === false && results.production === 'HOLD',
  'FINALIZE_PRODUCTION_BOUNDARY_REQUIRED');

if (blockers.length > 0) {
  const unique = [...new Set(blockers)];
  throw new Error(`FINALIZE_BLOCKED:${unique.join('|')}`);
}

const sourceDatasetHash = digest(dataset);
const output = {
  ...dataset,
  id:`${dataset.id}-final-bounded-poc-candidate-${sourceDatasetHash.slice(7, 19)}`,
  source_dataset_id:dataset.id,
  source_dataset_hash:sourceDatasetHash,
  dataset_scope:'FINAL_EMPIRICAL_BOUNDED_POC_CANDIDATE_NOT_PRODUCTION',
  scope_stratification_status:'COMPLETE_APPROVED_POC',
  represented_approved_strata_ids:represented,
  finalization:{
    state:'EMPIRICAL_TRACK_B_ATTESTED_BOUNDED_POC_CANDIDATE',
    benchmark_result_id:results.id,
    benchmark_dataset_payload_sha256:datasetPayloadSha256,
    manifest_id:manifest.id,
    per_stratum_coverage:perStratum,
    public_release_authorized:false,
    production_promotion_authorized:false,
  },
  public_claim_authorized:false,
  public_release_authorized:false,
  production_promotion_authorized:false,
  production:'HOLD',
  truth_boundary:'A canonical empirical attestation and independent Track B PASS may authorize only this bounded PoC dataset candidate. Public claims, release, and Production remain separately blocked.',
};
await fs.writeFile(outputPath, `${JSON.stringify(canonical(output), null, 2)}\n`);
console.log(JSON.stringify({
  id:output.id,
  final_case_count:output.cases.length,
  represented_strata:represented.length,
  public_release_authorized:false,
  production_promotion_authorized:false,
  production:'HOLD',
}, null, 2));
