import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [datasetPath, outputPath = '/tmp/entity-resolution-results-v2.json'] = process.argv.slice(2);
if (!datasetPath) throw new Error('Usage: node run-entity-resolution-benchmark-v2.mjs <dataset.json> [output.json]');

const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
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

if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error('BENCHMARK_CASES_REQUIRED');
const ids = new Set();
for (const item of dataset.cases) {
  if (!item.case_id || ids.has(item.case_id)) throw new Error(`CASE_ID_INVALID_OR_DUPLICATE:${item.case_id}`);
  ids.add(item.case_id);
  if (!REQUIRED_CASE_CLASSES.has(item.case_class)) throw new Error(`CASE_CLASS_INVALID:${item.case_id}`);
  if (!REQUIRED_BOUNDARIES.has(item.identity_boundary)) throw new Error(`IDENTITY_BOUNDARY_INVALID:${item.case_id}`);
  if (!ALLOWED_EXPECTED.has(item.expected)) throw new Error(`EXPECTED_RELATION_INVALID:${item.case_id}`);
  if (!item.scope_id) throw new Error(`SCOPE_ID_REQUIRED:${item.case_id}`);
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
const blind = first.filter((x) => x.blind_holdout);
const blindCorrect = blind.filter((x) => x.predicted === x.expected).length;
const blindAccuracy = blind.length ? blindCorrect / blind.length : null;
const blindCriticalFalseMatches = blind.filter((x) => x.predicted === 'MATCH' && x.expected === 'NO_MATCH').length;
const coverage = {
  required_case_classes_complete:[...REQUIRED_CASE_CLASSES].every((x) => classes.has(x)),
  required_identity_boundaries_complete:[...REQUIRED_BOUNDARIES].every((x) => boundaries.has(x)),
  scope_count:scopes.size,
  provenance_coverage:dataset.cases.filter((x) => x.provenance_refs?.length).length / dataset.cases.length,
  rights_coverage:dataset.cases.filter((x) => x.rights_state === 'ALLOW').length / dataset.cases.length,
  blind_holdout_count:blind.length,
};
const empiricalDataset = dataset.dataset_class === 'REAL_WORLD_LABELED' && dataset.synthetic !== true;
const metricsPass = accuracy >= 0.99 && criticalFalseMatches === 0 && blind.length > 0 && blindAccuracy >= 0.99 && blindCriticalFalseMatches === 0;
const promotionEligible = empiricalDataset && coverage.required_case_classes_complete && coverage.required_identity_boundaries_complete && coverage.provenance_coverage === 1 && coverage.rights_coverage === 1 && metricsPass;

const result = {
  id:'entity-resolution-benchmark-v2-results',
  dataset_id:dataset.id || null,
  dataset_class:dataset.dataset_class || 'UNKNOWN',
  case_count:first.length,
  blind_holdout_count:blind.length,
  accuracy,
  blind_accuracy:blindAccuracy,
  critical_false_auto_merge:criticalFalseMatches,
  blind_critical_false_auto_merge:blindCriticalFalseMatches,
  deterministic_replay:'PASS',
  replay_hash:firstHash,
  coverage,
  promotion_gate:{
    measured_accuracy_gte_099:accuracy >= 0.99,
    critical_false_auto_merge_eq_0:criticalFalseMatches === 0,
    blind_accuracy_gte_099:blindAccuracy !== null && blindAccuracy >= 0.99,
    blind_critical_false_auto_merge_eq_0:blindCriticalFalseMatches === 0,
    real_world_dataset:empiricalDataset,
    required_case_classes_complete:coverage.required_case_classes_complete,
    required_identity_boundaries_complete:coverage.required_identity_boundaries_complete,
    provenance_coverage_1:coverage.provenance_coverage === 1,
    rights_coverage_1:coverage.rights_coverage === 1,
    track_b_assessment:'PASS_REQUIRED_SEPARATELY',
    promotion_eligible_before_track_b:promotionEligible,
  },
  results:first,
  truth_boundary: promotionEligible
    ? 'Dataset and measured benchmark gates pass locally; independent Track B assessment is still required before promotion.'
    : 'No promotion claim. Missing empirical dataset breadth, blind performance, accuracy, false-merge, provenance, rights, or case/boundary coverage remains fail-closed.',
  production:'HOLD',
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
