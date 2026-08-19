import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [datasetPath, outputPath = '/tmp/entity-resolution-results-v2.json', governancePathA, governancePathB] = process.argv.slice(2);
if (!datasetPath) {
  throw new Error('Usage: node run-entity-resolution-benchmark-v2.mjs <dataset.json> [output.json] [approved-strata-manifest.json|attestation.json] [attestation.json]');
}

const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(
  scriptDirectory,
  '../../../coordination/kidults/entity-resolution/entity-resolution-benchmark-v2-contract.json',
);
const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
const policy = contract.empirical_attestation_policy || {};
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const CANONICAL_SCOPE_MATRIX_REPOSITORY_PATH =
  'coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json';
if (policy.canonical_scope_matrix_path !== CANONICAL_SCOPE_MATRIX_REPOSITORY_PATH) {
  throw new Error('CANONICAL_SCOPE_MATRIX_PATH_MISMATCH');
}
const canonicalScopeMatrixPath = path.resolve(repositoryRoot, CANONICAL_SCOPE_MATRIX_REPOSITORY_PATH);
const scopeMatrix = JSON.parse(await fs.readFile(canonicalScopeMatrixPath, 'utf8'));
const CANONICAL_CALIBRATION_STRATA_REPOSITORY_PATH =
  'coordination/kidults/entity-resolution/approved-bounded-poc-calibration-strata-v1.json';
if (policy.approved_calibration_strata_path !== CANONICAL_CALIBRATION_STRATA_REPOSITORY_PATH) {
  throw new Error('CANONICAL_CALIBRATION_STRATA_PATH_MISMATCH');
}
const canonicalCalibrationStrataPath = path.resolve(repositoryRoot, CANONICAL_CALIBRATION_STRATA_REPOSITORY_PATH);
const canonicalCalibrationStrata = JSON.parse(await fs.readFile(canonicalCalibrationStrataPath, 'utf8'));

let suppliedCalibrationStrata = null;
let attestation = null;
for (const governancePath of [governancePathA, governancePathB].filter(Boolean)) {
  const value = JSON.parse(await fs.readFile(governancePath, 'utf8'));
  if (value?.status === 'APPROVED_BOUNDED_POC_CALIBRATION' || value?.id === policy.approved_calibration_strata_id) {
    if (suppliedCalibrationStrata) throw new Error('DUPLICATE_CALIBRATION_STRATA_MANIFEST');
    suppliedCalibrationStrata = value;
  } else {
    if (attestation) throw new Error('DUPLICATE_EMPIRICAL_ATTESTATION_MANIFEST');
    attestation = value;
  }
}
const REQUIRED_CASE_CLASSES = new Set([
  'HARD_NEGATIVE',
  'SAME_OBJECT_NORMALIZATION',
  'SAME_DESIGN_DIFFERENT_OBJECT',
  'CROSS_MARKET_ALIAS',
  'TRANSACTION_TO_OBJECT_LINKAGE',
  'AMBIGUOUS_REVIEW_REQUIRED',
]);
const REQUIRED_BOUNDARIES = new Set(['SOURCE_RECORD','PHYSICAL_OBJECT','CANONICAL_DESIGN','MARKET_EVENT']);
const ALLOWED_EXPECTED = new Set(['MATCH','NO_MATCH','REVIEW']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}
function sortedUnique(values) {
  return [...new Set(values)].sort();
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function nonemptyStrings(values) {
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === 'string' && value.trim());
}
function sameCanonical(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    if (typeof key === 'string' && key) counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => compareText(left, right)));
}
function wilsonLowerBound(successes, total, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || total <= 0 || successes < 0 || successes > total) return null;
  const proportion = successes / total;
  const zSquared = z * z;
  const denominator = 1 + zSquared / total;
  const centre = proportion + zSquared / (2 * total);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * total)) / total);
  return (centre - margin) / denominator;
}
function normalized(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function strictAnchor(record, boundary) {
  const anchors = record?.anchors || {};
  return typeof anchors[boundary] === 'string' && anchors[boundary].trim() ? anchors[boundary].trim() : null;
}
function conservativeResolve(item) {
  const leftAnchor = strictAnchor(item.left, item.identity_boundary);
  const rightAnchor = strictAnchor(item.right, item.identity_boundary);
  if (leftAnchor && rightAnchor) return leftAnchor === rightAnchor ? 'MATCH' : 'NO_MATCH';

  // Only unique-authority keys may create MATCH without a canonical anchor.
  const uniqueKeys = ['object_id','serial','vin','reference_id','transaction_id','accession_number'];
  for (const key of uniqueKeys) {
    const l = item.left?.unique_keys?.[key];
    const r = item.right?.unique_keys?.[key];
    if (l != null && r != null && normalized(l) && normalized(l) === normalized(r)) return 'MATCH';
  }

  // Strong contradictory unique keys block a merge. Everything else remains REVIEW.
  for (const key of uniqueKeys) {
    const l = item.left?.unique_keys?.[key];
    const r = item.right?.unique_keys?.[key];
    if (l != null && r != null && normalized(l) && normalized(r) && normalized(l) !== normalized(r)) return 'NO_MATCH';
  }
  return 'REVIEW';
}

const scopeMatrixSha256 = digest(scopeMatrix);
if (scopeMatrixSha256 !== policy.canonical_scope_matrix_sha256) {
  throw new Error('CANONICAL_SCOPE_MATRIX_FINGERPRINT_MISMATCH');
}
if (!Array.isArray(scopeMatrix.scopes) || scopeMatrix.scopes.length !== 32) {
  throw new Error('CANONICAL_SCOPE_MATRIX_32_SCOPES_REQUIRED');
}
const scopeToArchetype = new Map();
for (const scope of scopeMatrix.scopes) {
  if (typeof scope?.scope_id !== 'string' || !scope.scope_id.trim() ||
      typeof scope?.archetype !== 'string' || !scope.archetype.trim() ||
      scopeToArchetype.has(scope.scope_id)) {
    throw new Error('CANONICAL_SCOPE_MATRIX_SCOPE_MAPPING_INVALID');
  }
  scopeToArchetype.set(scope.scope_id, scope.archetype);
}
const requiredScopeArchetypes = sortedUnique([...scopeToArchetype.values()]);
if (!sameCanonical(requiredScopeArchetypes, policy.required_poc_scope_archetypes)) {
  throw new Error('CANONICAL_REQUIRED_SCOPE_ARCHETYPES_MISMATCH');
}
const canonicalScopeArchetypeMapping = Object.fromEntries(
  [...scopeToArchetype.entries()].sort(([left], [right]) => compareText(left, right)),
);
const canonicalScopeArchetypeMappingSha256 = digest(canonicalScopeArchetypeMapping);
if (canonicalScopeArchetypeMappingSha256 !== policy.canonical_scope_archetype_mapping_sha256) {
  throw new Error('CANONICAL_SCOPE_ARCHETYPE_MAPPING_FINGERPRINT_MISMATCH');
}
const calibrationStrataSha256 = digest(canonicalCalibrationStrata);
if (calibrationStrataSha256 !== policy.approved_calibration_strata_sha256 ||
    canonicalCalibrationStrata.id !== policy.approved_calibration_strata_id ||
    canonicalCalibrationStrata.status !== policy.approved_calibration_strata_status ||
    canonicalCalibrationStrata.source_scope_matrix !== CANONICAL_SCOPE_MATRIX_REPOSITORY_PATH ||
    canonicalCalibrationStrata.source_scope_matrix_status_required !== scopeMatrix.status) {
  throw new Error('CANONICAL_CALIBRATION_STRATA_IDENTITY_OR_FINGERPRINT_MISMATCH');
}
if (suppliedCalibrationStrata && !sameCanonical(suppliedCalibrationStrata, canonicalCalibrationStrata)) {
  throw new Error('CALLER_SUPPLIED_CALIBRATION_STRATA_DIVERGES_FROM_CANONICAL');
}
const calibrationRows = Array.isArray(canonicalCalibrationStrata.strata) ? canonicalCalibrationStrata.strata : [];
const requiredStratumIds = sortedUnique(canonicalCalibrationStrata.required_strata_ids || []);
const approvedStratumIds = sortedUnique(canonicalCalibrationStrata.approved_strata_ids || []);
const stratumById = new Map();
const stratumByArchetype = new Map();
for (const row of calibrationRows) {
  if (typeof row?.stratum_id !== 'string' || !row.stratum_id.trim() || row.status !== 'APPROVED_REQUIRED' ||
      typeof row?.archetype !== 'string' || !row.archetype.trim() || stratumById.has(row.stratum_id) ||
      stratumByArchetype.has(row.archetype) || !nonemptyStrings(row.minimum_case_classes) ||
      !nonemptyStrings(row.minimum_boundaries) || !nonemptyStrings(row.representative_scope_examples) ||
      !row.minimum_case_classes.every((value) => REQUIRED_CASE_CLASSES.has(value)) ||
      !row.minimum_boundaries.every((value) => REQUIRED_BOUNDARIES.has(value)) ||
      !row.representative_scope_examples.every((scopeId) => scopeToArchetype.get(scopeId) === row.archetype)) {
    throw new Error('CANONICAL_CALIBRATION_STRATUM_INVALID');
  }
  stratumById.set(row.stratum_id, row);
  stratumByArchetype.set(row.archetype, row);
}
if (calibrationRows.length !== requiredScopeArchetypes.length ||
    !sameCanonical(requiredStratumIds, approvedStratumIds) ||
    !sameCanonical(requiredStratumIds, sortedUnique([...stratumById.keys()])) ||
    !sameCanonical(requiredScopeArchetypes, sortedUnique([...stratumByArchetype.keys()])) ||
    canonicalCalibrationStrata.common_requirements?.rights_coverage !== 1 ||
    canonicalCalibrationStrata.common_requirements?.provenance_coverage !== 1 ||
    canonicalCalibrationStrata.common_requirements?.synthetic_promotion_allowed !== false ||
    canonicalCalibrationStrata.common_requirements?.diagnostic_scope_leakage_allowed !== false ||
    canonicalCalibrationStrata.common_requirements?.production !== 'HOLD') {
  throw new Error('CANONICAL_CALIBRATION_STRATA_COVERAGE_OR_BOUNDARY_INVALID');
}
const empiricalSamplePolicy = policy.empirical_sample_policy || {};
const empiricalSamplePolicySha256 = digest(empiricalSamplePolicy);
if (empiricalSamplePolicySha256 !== policy.empirical_sample_policy_sha256 ||
    empiricalSamplePolicy.wilson_confidence_level !== 0.95) {
  throw new Error('CANONICAL_EMPIRICAL_SAMPLE_POLICY_FINGERPRINT_MISMATCH');
}

if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error('BENCHMARK_CASES_REQUIRED');
const ids = new Set();
for (const item of dataset.cases) {
  if (typeof item.case_id !== 'string' || !item.case_id.trim() || ids.has(item.case_id)) throw new Error(`CASE_ID_INVALID_OR_DUPLICATE:${item.case_id}`);
  ids.add(item.case_id);
  if (!REQUIRED_CASE_CLASSES.has(item.case_class)) throw new Error(`CASE_CLASS_INVALID:${item.case_id}`);
  if (!REQUIRED_BOUNDARIES.has(item.identity_boundary)) throw new Error(`IDENTITY_BOUNDARY_INVALID:${item.case_id}`);
  if (!ALLOWED_EXPECTED.has(item.expected)) throw new Error(`EXPECTED_RELATION_INVALID:${item.case_id}`);
  if (typeof item.scope_id !== 'string' || !item.scope_id.trim()) throw new Error(`SCOPE_ID_REQUIRED:${item.case_id}`);
  if (!Array.isArray(item.provenance_refs) || item.provenance_refs.length === 0) throw new Error(`PROVENANCE_REQUIRED:${item.case_id}`);
  if (item.rights_state !== 'ALLOW') throw new Error(`RIGHTS_NOT_ADMITTED:${item.case_id}`);
  if (!item.left || !item.right) throw new Error(`PAIR_REQUIRED:${item.case_id}`);
}

const run = () => dataset.cases.map((item) => ({
  case_id:item.case_id,
  case_class:item.case_class,
  identity_boundary:item.identity_boundary,
  scope_id:item.scope_id,
  blind_holdout:item.blind_holdout === true,
  expected:item.expected,
  predicted:conservativeResolve(item),
}));
const first = run();
const second = run();
const firstHash = digest(first);
const secondHash = digest(second);
if (firstHash !== secondHash) throw new Error('DETERMINISTIC_REPLAY_FAILED');

const correct = first.filter((x) => x.predicted === x.expected).length;
const criticalFalseMatches = first.filter((x) => x.predicted === 'MATCH' && x.expected === 'NO_MATCH').length;
const accuracy = correct / first.length;
const classes = new Set(dataset.cases.map((x) => x.case_class));
const boundaries = new Set(dataset.cases.map((x) => x.identity_boundary));
const scopes = new Set(dataset.cases.map((x) => x.scope_id));
const archetypeForCaseScope = (scopeId) => scopeToArchetype.get(scopeId) || stratumById.get(scopeId)?.archetype || null;
const stratumForCaseScope = (scopeId) => {
  const archetype = archetypeForCaseScope(scopeId);
  return archetype ? stratumByArchetype.get(archetype)?.stratum_id || null : null;
};
const unknownScopeIds = sortedUnique([...scopes].filter((scopeId) => !archetypeForCaseScope(scopeId)));
const coveredScopeArchetypes = sortedUnique(
  dataset.cases.map((item) => archetypeForCaseScope(item.scope_id)).filter(Boolean),
);
const caseScopeArchetypeBindings = Object.fromEntries(
  [...dataset.cases]
    .sort((left, right) => compareText(left.case_id, right.case_id))
    .map((item) => [item.case_id, archetypeForCaseScope(item.scope_id)]),
);
const caseApprovedStratumBindings = Object.fromEntries(
  [...dataset.cases]
    .sort((left, right) => compareText(left.case_id, right.case_id))
    .map((item) => [item.case_id, stratumForCaseScope(item.scope_id)]),
);
const blind = first.filter((x) => x.blind_holdout);
const blindCorrect = blind.filter((x) => x.predicted === x.expected).length;
const blindAccuracy = blind.length ? blindCorrect / blind.length : null;
const blindCriticalFalseMatches = blind.filter((x) => x.predicted === 'MATCH' && x.expected === 'NO_MATCH').length;
const overallAccuracyWilsonLower95 = wilsonLowerBound(correct, first.length);
const blindAccuracyWilsonLower95 = wilsonLowerBound(blindCorrect, blind.length);
const casesByScopeArchetype = countBy(dataset.cases, (item) => archetypeForCaseScope(item.scope_id));
const blindCasesByScopeArchetype = countBy(dataset.cases.filter((item) => item.blind_holdout === true), (item) =>
  archetypeForCaseScope(item.scope_id));
const casesByIdentityBoundary = countBy(dataset.cases, (item) => item.identity_boundary);
const casesByCaseClass = countBy(dataset.cases, (item) => item.case_class);
const representedStratumIds = sortedUnique(dataset.cases.map((item) => stratumForCaseScope(item.scope_id)).filter(Boolean));
const declaredApprovedStratumIds = sortedUnique(Array.isArray(dataset.approved_scope_ids) ? dataset.approved_scope_ids : []);
const declaredRequiredStratumIds = sortedUnique(Array.isArray(dataset.required_scope_ids) ? dataset.required_scope_ids : []);
const exactApprovedStratumIdsMatch = sameCanonical(declaredApprovedStratumIds, approvedStratumIds);
const exactRequiredStratumIdsMatch = sameCanonical(declaredRequiredStratumIds, requiredStratumIds);
const allCasesResolveToApprovedStrata = unknownScopeIds.length === 0 &&
  Object.values(caseApprovedStratumBindings).every((stratumId) => approvedStratumIds.includes(stratumId));
const allRequiredStrataRepresented = requiredStratumIds.every((stratumId) => representedStratumIds.includes(stratumId));
const perStratumCoverage = Object.fromEntries(calibrationRows.map((row) => {
  const rows = dataset.cases.filter((item) => stratumForCaseScope(item.scope_id) === row.stratum_id);
  const observedCaseClasses = sortedUnique(rows.map((item) => item.case_class));
  const observedBoundaries = sortedUnique(rows.map((item) => item.identity_boundary));
  const caseClassesComplete = row.minimum_case_classes.every((caseClass) => observedCaseClasses.includes(caseClass));
  const boundariesComplete = row.minimum_boundaries.every((boundary) => observedBoundaries.includes(boundary));
  return [row.stratum_id, {
    archetype:row.archetype,
    case_count:rows.length,
    required_case_classes:row.minimum_case_classes,
    observed_case_classes:observedCaseClasses,
    required_boundaries:row.minimum_boundaries,
    observed_boundaries:observedBoundaries,
    case_classes_complete:caseClassesComplete,
    boundaries_complete:boundariesComplete,
    complete:caseClassesComplete && boundariesComplete,
  }];
}));
const canonicalStratumRequirements = Object.fromEntries([...calibrationRows]
  .sort((left, right) => compareText(left.stratum_id, right.stratum_id))
  .map((row) => [row.stratum_id, {
    archetype:row.archetype,
    required_case_classes:row.minimum_case_classes,
    required_boundaries:row.minimum_boundaries,
  }]));
const perStratumRequirementsComplete = requiredStratumIds.every((stratumId) => perStratumCoverage[stratumId]?.complete === true);
const strataManifestBinding = {
  provided:Boolean(suppliedCalibrationStrata),
  canonical_manifest_loaded:true,
  manifest_id:canonicalCalibrationStrata.id,
  manifest_status:canonicalCalibrationStrata.status,
  manifest_sha256:calibrationStrataSha256,
  exact_approved_ids_match:exactApprovedStratumIdsMatch,
  exact_required_ids_match:exactRequiredStratumIdsMatch,
  all_required_strata_approved:requiredStratumIds.every((stratumId) => approvedStratumIds.includes(stratumId) && stratumById.has(stratumId)),
  binding_valid:Boolean(suppliedCalibrationStrata) && exactApprovedStratumIdsMatch && exactRequiredStratumIdsMatch,
};
const scopeStratificationComplete = dataset.scope_stratification_status === 'COMPLETE_APPROVED_POC' &&
  strataManifestBinding.binding_valid && allCasesResolveToApprovedStrata && allRequiredStrataRepresented &&
  perStratumRequirementsComplete;
const sampleFloors = {
  total_cases_gte_minimum:first.length >= Number(empiricalSamplePolicy.minimum_total_cases),
  blind_holdout_cases_gte_minimum:blind.length >= Number(empiricalSamplePolicy.minimum_blind_holdout_cases),
  cases_per_required_scope_archetype_gte_minimum:requiredScopeArchetypes.every((archetype) =>
    (casesByScopeArchetype[archetype] || 0) >= Number(empiricalSamplePolicy.minimum_cases_per_required_scope_archetype)),
  blind_cases_per_required_scope_archetype_gte_minimum:requiredScopeArchetypes.every((archetype) =>
    (blindCasesByScopeArchetype[archetype] || 0) >= Number(empiricalSamplePolicy.minimum_blind_cases_per_required_scope_archetype)),
  cases_per_identity_boundary_gte_minimum:[...REQUIRED_BOUNDARIES].every((boundary) =>
    (casesByIdentityBoundary[boundary] || 0) >= Number(empiricalSamplePolicy.minimum_cases_per_identity_boundary)),
  cases_per_required_case_class_gte_minimum:[...REQUIRED_CASE_CLASSES].every((caseClass) =>
    (casesByCaseClass[caseClass] || 0) >= Number(empiricalSamplePolicy.minimum_cases_per_required_case_class)),
};
const sampleFloorsComplete = Object.values(sampleFloors).every(Boolean);
const coverage = {
  required_case_classes_complete:[...REQUIRED_CASE_CLASSES].every((x) => classes.has(x)),
  required_identity_boundaries_complete:[...REQUIRED_BOUNDARIES].every((x) => boundaries.has(x)),
  scope_count:scopes.size,
  canonical_scope_matrix_sha256:scopeMatrixSha256,
  canonical_scope_archetype_mapping_sha256:canonicalScopeArchetypeMappingSha256,
  canonical_scope_matrix_scope_count:scopeToArchetype.size,
  required_scope_archetypes:requiredScopeArchetypes,
  covered_scope_archetypes:coveredScopeArchetypes,
  unknown_scope_ids:unknownScopeIds,
  all_case_scopes_in_canonical_matrix:unknownScopeIds.length === 0,
  required_scope_archetypes_complete:unknownScopeIds.length === 0 &&
    requiredScopeArchetypes.every((archetype) => coveredScopeArchetypes.includes(archetype)),
  approved_calibration_strata_sha256:calibrationStrataSha256,
  approved_strata_manifest_binding:strataManifestBinding.binding_valid,
  approved_strata_count:approvedStratumIds.length,
  required_strata_count:requiredStratumIds.length,
  represented_strata_count:representedStratumIds.length,
  all_cases_in_approved_scopes:allCasesResolveToApprovedStrata,
  all_required_scopes_represented:allRequiredStrataRepresented,
  case_approved_stratum_bindings:caseApprovedStratumBindings,
  per_stratum_requirements_complete:perStratumRequirementsComplete,
  per_stratum:perStratumCoverage,
  scope_stratification_complete:scopeStratificationComplete,
  provenance_coverage:dataset.cases.filter((x) => x.provenance_refs?.length).length / dataset.cases.length,
  rights_coverage:dataset.cases.filter((x) => x.rights_state === 'ALLOW').length / dataset.cases.length,
  blind_holdout_count:blind.length,
  cases_by_scope_archetype:casesByScopeArchetype,
  blind_cases_by_scope_archetype:blindCasesByScopeArchetype,
  cases_by_identity_boundary:casesByIdentityBoundary,
  cases_by_case_class:casesByCaseClass,
  empirical_sample_policy:empiricalSamplePolicy,
  empirical_sample_policy_sha256:empiricalSamplePolicySha256,
  empirical_sample_floors:sampleFloors,
  empirical_sample_floors_complete:sampleFloorsComplete,
};
const datasetPayloadHash = digest({id:dataset.id ?? null,dataset_class:dataset.dataset_class ?? null,cases:dataset.cases});
const allProvenanceRefs = dataset.cases.flatMap((item) => item.provenance_refs || []);
const prohibitedProvenanceAbsent = allProvenanceRefs.every((ref) =>
  typeof ref === 'string' && !(policy.prohibited_provenance_prefixes || []).some((prefix) => ref.startsWith(prefix)));
const algorithmicLabelBasisAbsent = dataset.cases.every((item) =>
  !(policy.prohibited_label_basis_fragments || []).some((fragment) =>
    typeof item.label_basis === 'string' && item.label_basis.includes(fragment)));
const validSourceEvidence = (item) =>
  typeof item?.source_url === 'string' && /^https:\/\//.test(item.source_url) &&
  /^sha256:[a-f0-9]{64}$/.test(item?.source_payload_sha256 || '') &&
  nonemptyStrings(item?.license_evidence_refs);
const perCaseSourceEvidenceComplete = dataset.cases.every((item) =>
  Array.isArray(item.source_evidence) && item.source_evidence.length > 0 && item.source_evidence.every(validSourceEvidence));
const sourceEvidence = dataset.cases.flatMap((item) => Array.isArray(item.source_evidence) ? item.source_evidence : []);
const caseSourcePayloadBindings = Object.fromEntries(
  [...dataset.cases]
    .sort((left, right) => compareText(left.case_id, right.case_id))
    .map((item) => [item.case_id, sortedUnique(
      (Array.isArray(item.source_evidence) ? item.source_evidence : [])
        .map((evidence) => evidence?.source_payload_sha256)
        .filter((value) => typeof value === 'string'),
    )]),
);
const caseLicenseEvidenceBindings = Object.fromEntries(
  [...dataset.cases]
    .sort((left, right) => compareText(left.case_id, right.case_id))
    .map((item) => [item.case_id, sortedUnique(
      (Array.isArray(item.source_evidence) ? item.source_evidence : [])
        .flatMap((evidence) => Array.isArray(evidence?.license_evidence_refs) ? evidence.license_evidence_refs : [])
        .filter((value) => typeof value === 'string' && value.trim()),
    )]),
);
const caseSourceEvidenceBindings = Object.fromEntries(
  [...dataset.cases]
    .sort((left, right) => compareText(left.case_id, right.case_id))
    .map((item) => [item.case_id,
      (Array.isArray(item.source_evidence) ? item.source_evidence : [])
        .map((evidence) => ({
          source_url:evidence?.source_url,
          source_payload_sha256:evidence?.source_payload_sha256,
          license_evidence_refs:sortedUnique(
            (Array.isArray(evidence?.license_evidence_refs) ? evidence.license_evidence_refs : [])
              .filter((value) => typeof value === 'string' && value.trim()),
          ),
        }))
        .sort((left, right) => compareText(JSON.stringify(canonical(left)), JSON.stringify(canonical(right)))),
    ]),
);
const boundSourcePayloadDigests = sortedUnique(sourceEvidence
  .map((item) => item.source_payload_sha256)
  .filter((value) => typeof value === 'string'));
const empiricalDatasetFlags = dataset.dataset_class === 'REAL_WORLD_LABELED' &&
  dataset.synthetic !== true &&
  dataset.constructed_control !== true &&
  dataset.empirical_benchmark_eligible === true &&
  dataset.independent_label_review_complete === true &&
  dataset.label_adjudication_complete === true &&
  dataset.holdout_sealed_before_modeling === true;
let attestationFingerprint = null;
let attestationFingerprintApproved = false;
let caseSourceEvidenceBindingMatchesAttestation = false;
let caseSourcePayloadBindingMatchesAttestation = false;
let caseLicenseEvidenceBindingMatchesAttestation = false;
let scopePolicyBindingMatchesAttestation = false;
let strataPolicyBindingMatchesAttestation = false;
let samplePolicyBindingMatchesAttestation = false;
let attestationVerified = false;
if (attestation) {
  attestationFingerprint = digest(attestation);
  attestationFingerprintApproved = Array.isArray(policy.approved_manifest_fingerprints) &&
    policy.approved_manifest_fingerprints.includes(attestationFingerprint);
  if (!attestationFingerprintApproved) throw new Error('EMPIRICAL_ATTESTATION_MANIFEST_NOT_CANONICALLY_APPROVED');
  const reviewerIds = sortedUnique((attestation.independent_label_review?.reviewer_ids || [])
    .filter((value) => typeof value === 'string' && value.trim()));
  const blindCaseIds = sortedUnique(dataset.cases.filter((item) => item.blind_holdout === true).map((item) => item.case_id));
  const sealedBlindCaseIds = sortedUnique(attestation.holdout?.blind_case_ids || []);
  const sealedAt = Date.parse(attestation.holdout?.sealed_at || '');
  const modelFrozenAt = Date.parse(attestation.holdout?.model_frozen_at || '');
  caseSourcePayloadBindingMatchesAttestation =
    sameCanonical(sortedUnique(attestation.accepted_source_payload_sha256 || []), boundSourcePayloadDigests) &&
    sameCanonical(attestation.case_source_payload_sha256_bindings, caseSourcePayloadBindings);
  caseSourceEvidenceBindingMatchesAttestation =
    sameCanonical(attestation.case_source_evidence_bindings, caseSourceEvidenceBindings);
  caseLicenseEvidenceBindingMatchesAttestation =
    sameCanonical(attestation.case_license_evidence_ref_bindings, caseLicenseEvidenceBindings);
  scopePolicyBindingMatchesAttestation =
    attestation.canonical_scope_matrix_sha256 === scopeMatrixSha256 &&
    attestation.canonical_scope_archetype_mapping_sha256 === canonicalScopeArchetypeMappingSha256 &&
    sameCanonical(attestation.required_scope_archetypes, requiredScopeArchetypes) &&
    sameCanonical(attestation.case_scope_archetype_bindings, caseScopeArchetypeBindings);
  strataPolicyBindingMatchesAttestation =
    attestation.approved_calibration_strata_sha256 === calibrationStrataSha256 &&
    sameCanonical(attestation.required_stratum_ids, requiredStratumIds) &&
    sameCanonical(attestation.case_approved_stratum_bindings, caseApprovedStratumBindings) &&
    sameCanonical(attestation.canonical_stratum_requirements, canonicalStratumRequirements);
  samplePolicyBindingMatchesAttestation =
    attestation.empirical_sample_policy_sha256 === empiricalSamplePolicySha256 &&
    sameCanonical(attestation.empirical_sample_policy, empiricalSamplePolicy);
  attestationVerified = attestation.manifest_schema_version === policy.manifest_schema_version &&
    attestation.status === 'TRACK_B_INDEPENDENT_REVIEW_PASS_SEALED' &&
    attestation.dataset_id === dataset.id &&
    attestation.dataset_payload_sha256 === datasetPayloadHash &&
    attestation.independent_label_review?.completed === true &&
    reviewerIds.length >= Number(policy.minimum_independent_reviewers || 2) &&
    attestation.label_adjudication?.completed === true &&
    attestation.holdout?.sealed_before_modeling === true &&
    Number.isFinite(sealedAt) && Number.isFinite(modelFrozenAt) && sealedAt < modelFrozenAt &&
    JSON.stringify(blindCaseIds) === JSON.stringify(sealedBlindCaseIds) &&
    attestation.holdout?.labels_inaccessible_until_model_freeze === true &&
    attestation.track_b?.status === 'PASS' &&
    typeof attestation.track_b?.authority_ref === 'string' && Boolean(attestation.track_b.authority_ref.trim()) &&
    caseSourceEvidenceBindingMatchesAttestation && caseSourcePayloadBindingMatchesAttestation &&
    caseLicenseEvidenceBindingMatchesAttestation &&
    scopePolicyBindingMatchesAttestation && strataPolicyBindingMatchesAttestation &&
    samplePolicyBindingMatchesAttestation && perCaseSourceEvidenceComplete &&
    coverage.required_scope_archetypes_complete && coverage.scope_stratification_complete &&
    prohibitedProvenanceAbsent && algorithmicLabelBasisAbsent;
}
const empiricalDataset = empiricalDatasetFlags && attestationVerified;
const confidenceBoundsPass = overallAccuracyWilsonLower95 !== null && blindAccuracyWilsonLower95 !== null &&
  overallAccuracyWilsonLower95 >= Number(empiricalSamplePolicy.minimum_overall_accuracy_wilson_lower_bound) &&
  blindAccuracyWilsonLower95 >= Number(empiricalSamplePolicy.minimum_blind_accuracy_wilson_lower_bound);
const metricsPass = accuracy >= 0.99 && criticalFalseMatches === 0 && blind.length > 0 && blindAccuracy >= 0.99 &&
  blindCriticalFalseMatches === 0 && sampleFloorsComplete && confidenceBoundsPass;
const empiricalBenchmarkGatePass = empiricalDataset && coverage.required_case_classes_complete && coverage.required_identity_boundaries_complete &&
  coverage.required_scope_archetypes_complete && coverage.scope_stratification_complete && perCaseSourceEvidenceComplete &&
  coverage.provenance_coverage === 1 && coverage.rights_coverage === 1 && metricsPass;

const result = {
  id:'entity-resolution-benchmark-v2-results',
  dataset_id:dataset.id || null,
  dataset_class:dataset.dataset_class || 'UNKNOWN',
  case_count:first.length,
  blind_holdout_count:blind.length,
  accuracy,
  blind_accuracy:blindAccuracy,
  overall_accuracy_wilson_lower_95:overallAccuracyWilsonLower95,
  blind_accuracy_wilson_lower_95:blindAccuracyWilsonLower95,
  critical_false_auto_merge:criticalFalseMatches,
  blind_critical_false_auto_merge:blindCriticalFalseMatches,
  deterministic_replay:'PASS',
  replay_hash:firstHash,
  strata_manifest_binding:strataManifestBinding,
  coverage,
  promotion_gate:{
    measured_accuracy_gte_099:accuracy >= 0.99,
    critical_false_auto_merge_eq_0:criticalFalseMatches === 0,
    blind_accuracy_gte_099:blindAccuracy !== null && blindAccuracy >= 0.99,
    blind_critical_false_auto_merge_eq_0:blindCriticalFalseMatches === 0,
    real_world_dataset:empiricalDataset,
    required_case_classes_complete:coverage.required_case_classes_complete,
    required_identity_boundaries_complete:coverage.required_identity_boundaries_complete,
    all_case_scopes_in_canonical_matrix:coverage.all_case_scopes_in_canonical_matrix,
    required_scope_archetypes_complete:coverage.required_scope_archetypes_complete,
    canonical_scope_matrix_sha256:scopeMatrixSha256,
    canonical_scope_archetype_mapping_sha256:canonicalScopeArchetypeMappingSha256,
    required_scope_archetypes:requiredScopeArchetypes,
    covered_scope_archetypes:coveredScopeArchetypes,
    case_scope_archetype_bindings:caseScopeArchetypeBindings,
    approved_calibration_strata_sha256:calibrationStrataSha256,
    approved_strata_manifest_binding:coverage.approved_strata_manifest_binding,
    case_approved_stratum_bindings:caseApprovedStratumBindings,
    canonical_stratum_requirements:canonicalStratumRequirements,
    per_stratum_requirements_complete:coverage.per_stratum_requirements_complete,
    scope_stratification_complete:coverage.scope_stratification_complete,
    empirical_sample_policy:empiricalSamplePolicy,
    empirical_sample_policy_sha256:empiricalSamplePolicySha256,
    empirical_sample_floors:sampleFloors,
    empirical_sample_floors_complete:sampleFloorsComplete,
    overall_accuracy_wilson_lower_95:overallAccuracyWilsonLower95,
    blind_accuracy_wilson_lower_95:blindAccuracyWilsonLower95,
    overall_accuracy_wilson_lower_bound_gte_099:overallAccuracyWilsonLower95 !== null &&
      overallAccuracyWilsonLower95 >= Number(empiricalSamplePolicy.minimum_overall_accuracy_wilson_lower_bound),
    blind_accuracy_wilson_lower_bound_gte_099:blindAccuracyWilsonLower95 !== null &&
      blindAccuracyWilsonLower95 >= Number(empiricalSamplePolicy.minimum_blind_accuracy_wilson_lower_bound),
    provenance_coverage_1:coverage.provenance_coverage === 1,
    rights_coverage_1:coverage.rights_coverage === 1,
    independent_label_review_complete:dataset.independent_label_review_complete === true,
    label_adjudication_complete:dataset.label_adjudication_complete === true,
    holdout_sealed_before_modeling:dataset.holdout_sealed_before_modeling === true,
    constructed_control:dataset.constructed_control === true,
    empirical_benchmark_eligible:dataset.empirical_benchmark_eligible === true,
    empirical_dataset_flags_complete:empiricalDatasetFlags,
    empirical_attestation_required:policy.required === true,
    empirical_attestation_manifest_present:Boolean(attestation),
    empirical_attestation_fingerprint:attestationFingerprint,
    empirical_attestation_fingerprint_approved:attestationFingerprintApproved,
    empirical_attestation_verified:attestationVerified,
    dataset_payload_sha256:datasetPayloadHash,
    source_payload_digest_and_license_evidence_present_per_case:perCaseSourceEvidenceComplete,
    case_source_payload_sha256_bindings:caseSourcePayloadBindings,
    case_license_evidence_ref_bindings:caseLicenseEvidenceBindings,
    case_source_evidence_bindings:caseSourceEvidenceBindings,
    case_source_evidence_binding_matches_attestation:caseSourceEvidenceBindingMatchesAttestation,
    case_source_payload_binding_matches_attestation:caseSourcePayloadBindingMatchesAttestation,
    case_license_evidence_binding_matches_attestation:caseLicenseEvidenceBindingMatchesAttestation,
    scope_policy_binding_matches_attestation:scopePolicyBindingMatchesAttestation,
    strata_policy_binding_matches_attestation:strataPolicyBindingMatchesAttestation,
    sample_policy_binding_matches_attestation:samplePolicyBindingMatchesAttestation,
    source_payload_digest_and_license_evidence_bound:perCaseSourceEvidenceComplete &&
      caseSourceEvidenceBindingMatchesAttestation && caseSourcePayloadBindingMatchesAttestation &&
      caseLicenseEvidenceBindingMatchesAttestation,
    prohibited_fixture_or_selftest_provenance_absent:prohibitedProvenanceAbsent,
    algorithmically_constructed_label_basis_absent:algorithmicLabelBasisAbsent,
    track_b_assessment:attestationVerified ? 'APPROVED_ATTESTATION_VERIFIED' : 'PASS_REQUIRED_SEPARATELY',
    empirical_benchmark_gate_pass:empiricalBenchmarkGatePass,
    promotion_eligible_before_track_b:false,
    production_promotion_authorized:false,
  },
  results:first,
  truth_boundary: empiricalBenchmarkGatePass
    ? 'The empirical benchmark gate, including an approved independent Track B attestation, passes. Production promotion remains separately controlled and HOLD.'
    : 'No promotion claim. Synthetic or constructed-control mechanics metrics do not evidence independently labeled empirical accuracy. Independent labels/adjudication, a holdout sealed before modeling, canonical per-case evidence, every approved stratum grammar, scope breadth, sample floors, Wilson 95% lower bounds, and Track B approval remain fail-closed requirements.',
  production:'HOLD',
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
