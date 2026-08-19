import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [datasetPath, manifestPath, outputPath='/tmp/er-final-approved-v1.json'] = process.argv.slice(2);
if (!datasetPath || !manifestPath) {
  throw new Error('Usage: node finalize-er-approved-dataset-v1.mjs <dataset.json> <approved-strata-manifest.json> [output.json]');
}

const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (dataset.dataset_class !== 'REAL_WORLD_LABELED' || dataset.synthetic === true || !Array.isArray(dataset.cases) || dataset.cases.length === 0) {
  throw new Error('FINALIZE_REAL_WORLD_LABELED_DATASET_REQUIRED');
}
if (manifest.status !== 'APPROVED_BOUNDED_POC_CALIBRATION') throw new Error('FINALIZE_APPROVED_STRATA_MANIFEST_REQUIRED');

const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : (value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value);
const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sameSet = (a,b) => a.size === b.size && [...a].every(x => b.has(x));

const approved = new Set((manifest.approved_strata_ids ?? []).filter(Boolean));
const required = new Set((manifest.required_strata_ids ?? []).filter(Boolean));
const datasetApproved = new Set((dataset.approved_scope_ids ?? []).filter(Boolean));
const datasetRequired = new Set((dataset.required_scope_ids ?? []).filter(Boolean));
if (approved.size === 0 || required.size === 0) throw new Error('FINALIZE_NONEMPTY_APPROVED_REQUIRED_STRATA_REQUIRED');
if (!sameSet(approved, required)) throw new Error('FINALIZE_MANIFEST_APPROVED_REQUIRED_SET_MISMATCH');
if (!sameSet(datasetApproved, approved) || !sameSet(datasetRequired, required)) throw new Error('FINALIZE_DATASET_MANIFEST_BINDING_MISMATCH');
if (dataset.approved_strata_manifest_id !== manifest.id) throw new Error('FINALIZE_MANIFEST_ID_BINDING_MISMATCH');

const manifestRows = (manifest.strata ?? []).filter(row => row?.status === 'APPROVED_REQUIRED');
const rowById = new Map(manifestRows.map(row => [row.stratum_id, row]));
if (![...required].every(id => rowById.has(id))) throw new Error('FINALIZE_REQUIRED_MANIFEST_ROW_MISSING');

const incomplete = [];
const coverage = {};
for (const id of [...required].sort()) {
  const rule = rowById.get(id);
  const rows = dataset.cases.filter(item => item.scope_id === id);
  const classes = new Set(rows.map(item => item.case_class));
  const boundaries = new Set(rows.map(item => item.identity_boundary));
  const missingClasses = (rule.minimum_case_classes ?? []).filter(name => !classes.has(name));
  const missingBoundaries = (rule.minimum_boundaries ?? []).filter(name => !boundaries.has(name));
  const complete = rows.length > 0 && missingClasses.length === 0 && missingBoundaries.length === 0;
  coverage[id] = {
    case_count: rows.length,
    missing_case_classes: missingClasses,
    missing_boundaries: missingBoundaries,
    complete
  };
  if (!complete) incomplete.push(id);
}
if (incomplete.length > 0) throw new Error(`FINALIZE_PER_STRATUM_INCOMPLETE:${incomplete.join(',')}`);

const approvedCases = dataset.cases.filter(item => approved.has(item.scope_id));
const removedCases = dataset.cases.filter(item => !approved.has(item.scope_id));
if (approvedCases.length === 0) throw new Error('FINALIZE_APPROVED_CASES_REQUIRED');
const caseIds = new Set();
for (const item of approvedCases) {
  if (!item.case_id || caseIds.has(item.case_id)) throw new Error(`FINALIZE_CASE_ID_INVALID_OR_DUPLICATE:${item.case_id}`);
  caseIds.add(item.case_id);
  if (!item.provenance_refs?.length) throw new Error(`FINALIZE_PROVENANCE_REQUIRED:${item.case_id}`);
  if (item.rights_state !== 'ALLOW') throw new Error(`FINALIZE_RIGHTS_NOT_ADMITTED:${item.case_id}`);
  if (!item.blind_holdout) throw new Error(`FINALIZE_BLIND_HOLDOUT_REQUIRED_FOR_EVERY_FINAL_CASE:${item.case_id}`);
}

const represented = new Set(approvedCases.map(item => item.scope_id));
if (!sameSet(represented, required)) throw new Error('FINALIZE_ALL_REQUIRED_STRATA_NOT_REPRESENTED_AFTER_DIAGNOSTIC_REMOVAL');
const finalScopes = new Set(approvedCases.map(item => item.scope_id));
if ([...finalScopes].some(id => !approved.has(id))) throw new Error('FINALIZE_DIAGNOSTIC_SCOPE_LEAKAGE');

const sourceHash = digest(dataset);
const shortHash = sourceHash.replace('sha256:','').slice(0,12);
const out = {
  ...dataset,
  id: `${dataset.id ?? 'entity-resolution-dataset'}-final-approved-v1-${shortHash}`,
  source_dataset_id: dataset.id ?? null,
  source_dataset_hash: sourceHash,
  dataset_scope: 'FINAL_APPROVED_BOUNDED_POC_STRATA_ONLY',
  scope_stratification_status: 'COMPLETE_APPROVED_POC',
  approved_scope_ids: [...approved].sort(),
  required_scope_ids: [...required].sort(),
  represented_approved_strata_ids: [...represented].sort(),
  cases: approvedCases,
  finalization: {
    manifest_id: manifest.id,
    all_required_strata_complete: true,
    diagnostic_cases_removed: removedCases.length,
    diagnostic_case_ids_removed: removedCases.map(item => item.case_id).sort(),
    final_case_count: approvedCases.length,
    per_stratum_coverage: coverage,
    policy: 'FILTER_ONLY_ALREADY_APPROVED_STRATUM_CASES; NEVER_RECLASSIFY_OR_MANUFACTURE_CASES; REQUIRE_7_OF_7_BEFORE_COMPLETE_APPROVED_POC'
  },
  truth_boundary: 'This artifact only removes non-approved diagnostic-scope cases after every approved stratum already satisfies its exact manifest minimums. It does not manufacture, relabel or weaken evidence. Benchmark, immutable holdout freeze, registered calibration artifact and independent Track B PASS remain separately required before promotion.',
  production: 'HOLD'
};

await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  id: out.id,
  source_dataset_id: out.source_dataset_id,
  final_case_count: approvedCases.length,
  diagnostic_cases_removed: removedCases.length,
  all_required_strata_complete: true,
  scope_stratification_status: out.scope_stratification_status,
  production: 'HOLD'
}, null, 2));
