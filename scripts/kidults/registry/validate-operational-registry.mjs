import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const registryRoot = path.join(repoRoot, 'coordination', 'kidults', 'registry');
const errors = [];
const warnings = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`JSON parse/read failure: ${path.relative(repoRoot, filePath)}: ${error.message}`);
    return null;
  }
}

function requireKeys(object, keys, label) {
  for (const key of keys) {
    if (!(key in object)) errors.push(`${label}: missing required key '${key}'`);
  }
}

const catalogPath = path.join(registryRoot, 'catalog.json');
const catalog = readJson(catalogPath);
if (!catalog) {
  console.error('Operational registry validation failed: catalog unavailable.');
  process.exit(1);
}

requireKeys(catalog, ['registry_system_id', 'registry_system_version', 'status', 'registries'], 'catalog.json');
if (!Array.isArray(catalog.registries) || catalog.registries.length < 10) {
  errors.push('catalog.json: registries must contain the operational registry set.');
}

const globalIds = new Map();
let totalIndexedRecords = 0;
let totalResolvedRecords = 0;

for (const entry of catalog.registries ?? []) {
  const indexPath = path.join(registryRoot, entry.path);
  const index = readJson(indexPath);
  if (!index) continue;

  const label = path.relative(repoRoot, indexPath);
  requireKeys(index, ['registry_id', 'registry_name', 'registry_version', 'schema_version', 'owner', 'custodian', 'status', 'record_directory', 'record_count', 'records'], label);

  if (index.record_directory !== 'records') errors.push(`${label}: record_directory must be 'records'.`);
  if (!Array.isArray(index.records)) errors.push(`${label}: records must be an array.`);
  if (Array.isArray(index.records) && index.record_count !== index.records.length) {
    errors.push(`${label}: record_count=${index.record_count} but records.length=${index.records.length}.`);
  }

  const localIds = new Set();
  for (const ref of index.records ?? []) {
    totalIndexedRecords += 1;
    requireKeys(ref, ['id', 'path', 'status'], `${label} record reference`);
    if (localIds.has(ref.id)) errors.push(`${label}: duplicate record ID '${ref.id}'.`);
    localIds.add(ref.id);

    const recordPath = path.join(path.dirname(indexPath), ref.path);
    if (!fs.existsSync(recordPath)) {
      errors.push(`${label}: missing record file '${ref.path}'.`);
      continue;
    }
    const record = readJson(recordPath);
    if (!record) continue;
    totalResolvedRecords += 1;
    requireKeys(record, ['id', 'record_type', 'version', 'status', 'created_by'], path.relative(repoRoot, recordPath));
    if (record.id !== ref.id) errors.push(`${label}: index ID '${ref.id}' != file ID '${record.id}'.`);
    if (globalIds.has(record.id)) errors.push(`Global duplicate record ID '${record.id}' in ${globalIds.get(record.id)} and ${path.relative(repoRoot, recordPath)}.`);
    globalIds.set(record.id, path.relative(repoRoot, recordPath));
  }

  // These pointers resolve within their own Registry. Cross-Registry references
  // such as Assessment.current_snapshot_id are validated explicitly below.
  const localPointers = [
    'current_record_id',
    'current_baseline_snapshot_id',
    'current_candidate_snapshot_id',
    'current_published_snapshot_id',
    'current_assessment_id',
    'current_runtime_id',
    'current_release_id'
  ];
  for (const pointer of localPointers) {
    if (pointer in index && index[pointer] !== null && !localIds.has(index[pointer])) {
      errors.push(`${label}: pointer '${pointer}' references unknown ID '${index[pointer]}'.`);
    }
  }
}

function getIndex(key) {
  return readJson(path.join(registryRoot, key, 'index.json'));
}

const trackIndex = getIndex('track');
const expectedTracks = new Set([
  'track-a-120-intelligence-factory',
  'track-b-rankability-validation-gate',
  'track-c-portal-v502-experience-layer',
  'track-d-data-platform-production-reliability',
  'track-e-executive-operating-system'
]);
for (const trackId of expectedTracks) {
  if (!trackIndex?.records?.some((record) => record.id === trackId)) errors.push(`Track Registry: missing '${trackId}'.`);
}

const verticalIndex = getIndex('vertical');
if (verticalIndex?.record_count !== 8) errors.push(`Core Vertical Registry must contain exactly 8 records; found ${verticalIndex?.record_count}.`);

const snapshotIndex = getIndex('snapshot');
if (snapshotIndex?.current_baseline_snapshot_id && !snapshotIndex.records.some((record) => record.id === snapshotIndex.current_baseline_snapshot_id)) {
  errors.push('Snapshot Registry baseline pointer does not resolve.');
}

const assessmentIndex = getIndex('assessment');
const assessmentSnapshotId = assessmentIndex?.current_snapshot_id ?? null;
if (assessmentSnapshotId !== null && !snapshotIndex?.records?.some((record) => record.id === assessmentSnapshotId)) {
  errors.push(`Assessment Registry current_snapshot_id '${assessmentSnapshotId}' does not resolve in Snapshot Registry.`);
}
if (!snapshotIndex?.current_candidate_snapshot_id) {
  if (assessmentIndex?.current_assessment_id !== null) errors.push('Assessment must be null when no candidate snapshot exists.');
  if (assessmentIndex?.status !== 'WAITING_FOR_SNAPSHOT') warnings.push(`Assessment status is '${assessmentIndex?.status}', expected WAITING_FOR_SNAPSHOT while candidate is null.`);
} else if (assessmentSnapshotId !== snapshotIndex.current_candidate_snapshot_id) {
  errors.push(`Assessment Registry current_snapshot_id '${assessmentSnapshotId}' does not match current Candidate '${snapshotIndex.current_candidate_snapshot_id}'.`);
}

if (errors.length) {
  console.error(`KIDULTS Operational Registry: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS Operational Registry: PASS`);
console.log(`Registries: ${catalog.registries.length}`);
console.log(`Indexed records: ${totalIndexedRecords}`);
console.log(`Resolved records: ${totalResolvedRecords}`);
console.log(`Warnings: ${warnings.length}`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
