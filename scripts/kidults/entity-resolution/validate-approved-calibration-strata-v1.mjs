import fs from 'node:fs/promises';

const [manifestPath, matrixPath] = process.argv.slice(2);
if (!manifestPath || !matrixPath) throw new Error('Usage: node validate-approved-calibration-strata-v1.mjs <manifest.json> <scope-matrix.json>');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));

const REQUIRED_ARCHETYPES = new Set([
  'DESIGNER_MAKER_EDITION',
  'SERIALIZED_REFERENCE',
  'PROVENANCE_UNIQUE_OBJECT',
  'VEHICLE_MECHANICAL_ASSET',
  'VARIANT_RELEASE_HEAVY',
  'GRADED_POPULATION',
  'PRESSING_EDITION_MEDIA',
]);

if (manifest.status !== 'APPROVED_BOUNDED_POC_CALIBRATION') throw new Error('CALIBRATION_MANIFEST_NOT_APPROVED');
if (matrix.status !== manifest.source_scope_matrix_status_required) throw new Error(`SCOPE_MATRIX_STATUS_MISMATCH:${matrix.status}`);
if (!Array.isArray(matrix.scopes) || matrix.scopes.length === 0) throw new Error('SCOPE_MATRIX_EMPTY');
if (!Array.isArray(manifest.strata) || manifest.strata.length === 0) throw new Error('CALIBRATION_STRATA_EMPTY');

const matrixScopeIds = new Set(matrix.scopes.map((x) => x.scope_id));
const matrixArchetypes = new Set(matrix.scopes.map((x) => x.archetype));
for (const archetype of REQUIRED_ARCHETYPES) if (!matrixArchetypes.has(archetype)) throw new Error(`REQUIRED_ARCHETYPE_MISSING_FROM_MATRIX:${archetype}`);

const stratumIds = new Set();
const coveredArchetypes = new Set();
for (const stratum of manifest.strata) {
  if (!stratum.stratum_id || stratumIds.has(stratum.stratum_id)) throw new Error(`STRATUM_ID_INVALID_OR_DUPLICATE:${stratum.stratum_id}`);
  stratumIds.add(stratum.stratum_id);
  if (stratum.status !== 'APPROVED_REQUIRED') throw new Error(`STRATUM_NOT_APPROVED_REQUIRED:${stratum.stratum_id}`);
  if (!REQUIRED_ARCHETYPES.has(stratum.archetype)) throw new Error(`UNKNOWN_ARCHETYPE:${stratum.stratum_id}:${stratum.archetype}`);
  if (coveredArchetypes.has(stratum.archetype)) throw new Error(`ARCHETYPE_DUPLICATED_ACROSS_REQUIRED_STRATA:${stratum.archetype}`);
  coveredArchetypes.add(stratum.archetype);
  if (!Array.isArray(stratum.identity_grammar) || stratum.identity_grammar.length === 0) throw new Error(`IDENTITY_GRAMMAR_REQUIRED:${stratum.stratum_id}`);
  if (!Array.isArray(stratum.representative_scope_examples) || stratum.representative_scope_examples.length === 0) throw new Error(`REPRESENTATIVE_SCOPE_EXAMPLES_REQUIRED:${stratum.stratum_id}`);
  for (const scopeId of stratum.representative_scope_examples) if (!matrixScopeIds.has(scopeId)) throw new Error(`UNKNOWN_REPRESENTATIVE_SCOPE:${stratum.stratum_id}:${scopeId}`);
  if (!Array.isArray(stratum.minimum_case_classes) || stratum.minimum_case_classes.length === 0) throw new Error(`MINIMUM_CASE_CLASSES_REQUIRED:${stratum.stratum_id}`);
  if (!Array.isArray(stratum.minimum_boundaries) || stratum.minimum_boundaries.length === 0) throw new Error(`MINIMUM_BOUNDARIES_REQUIRED:${stratum.stratum_id}`);
  if (!stratum.rationale) throw new Error(`RATIONALE_REQUIRED:${stratum.stratum_id}`);
}

for (const archetype of REQUIRED_ARCHETYPES) if (!coveredArchetypes.has(archetype)) throw new Error(`ARCHETYPE_NOT_COVERED_BY_REQUIRED_STRATUM:${archetype}`);
const approved = new Set(manifest.approved_strata_ids || []);
const required = new Set(manifest.required_strata_ids || []);
if (approved.size !== REQUIRED_ARCHETYPES.size || required.size !== REQUIRED_ARCHETYPES.size) throw new Error('APPROVED_REQUIRED_STRATA_COUNT_MUST_EQUAL_SEVEN');
for (const id of stratumIds) {
  if (!approved.has(id)) throw new Error(`STRATUM_NOT_IN_APPROVED_LIST:${id}`);
  if (!required.has(id)) throw new Error(`STRATUM_NOT_IN_REQUIRED_LIST:${id}`);
}
for (const id of approved) if (!stratumIds.has(id)) throw new Error(`UNKNOWN_APPROVED_STRATUM:${id}`);
for (const id of required) if (!stratumIds.has(id)) throw new Error(`UNKNOWN_REQUIRED_STRATUM:${id}`);

if (manifest.common_requirements?.rights_coverage !== 1 || manifest.common_requirements?.provenance_coverage !== 1) throw new Error('RIGHTS_AND_PROVENANCE_MUST_BE_100_PERCENT');
if (manifest.common_requirements?.diagnostic_scope_leakage_allowed !== false) throw new Error('DIAGNOSTIC_SCOPE_LEAKAGE_MUST_BE_FALSE');
if (manifest.common_requirements?.synthetic_promotion_allowed !== false) throw new Error('SYNTHETIC_PROMOTION_MUST_BE_FALSE');
if (manifest.common_requirements?.production !== 'HOLD') throw new Error('PRODUCTION_MUST_REMAIN_HOLD');

console.log(JSON.stringify({
  status:'PASS',
  manifest_id:manifest.id,
  matrix_version:matrix.version,
  matrix_status:matrix.status,
  required_strata_count:required.size,
  approved_strata_count:approved.size,
  required_archetypes:[...REQUIRED_ARCHETYPES],
  taxonomy_promotion:false,
  production:'HOLD'
}, null, 2));
