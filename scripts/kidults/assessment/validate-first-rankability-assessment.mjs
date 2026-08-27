import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const historicalSnapshotId = 'candidate-structural-20260816-r1';
const historicalAssessmentId = 'assessment-candidate-structural-20260816-r1-v1';
const errors = [];

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function check(condition, message) { if (!condition) errors.push(message); }

const assessment = readJson(`coordination/kidults/registry/assessment/records/${historicalAssessmentId}.json`);
const assessmentIndex = readJson('coordination/kidults/registry/assessment/index.json');
const track = readJson('coordination/kidults/registry/track/records/track-b-rankability-validation-gate.json');
const role = readJson('coordination/kidults/registry/role/records/role-track-b.json');
const candidate = readJson(`coordination/kidults/candidates/${historicalSnapshotId}/snapshot-candidate.json`);
const evidence = readJson(`coordination/kidults/candidates/${historicalSnapshotId}/evidence-package.json`);

check(assessment?.assessment_id === historicalAssessmentId, 'Historical assessment ID mismatch.');
check(assessment?.snapshot_id === historicalSnapshotId, 'Historical assessment snapshot mismatch.');
check(assessment?.snapshot_id === candidate?.snapshot_id, 'Historical candidate snapshot binding mismatch.');
check(assessment?.evidence_package_id === evidence?.evidence_package_id, 'Historical Evidence Package binding mismatch.');
check(assessment?.immutable === true, 'Historical assessment must remain immutable.');
check(assessment?.recommendation === 'BLOCKED', 'Historical assessment recommendation must remain BLOCKED.');
check(assessment?.overall_rankability === false, 'Historical assessment must not assert rankability.');
check(assessment?.publication_eligible === false, 'Historical assessment must not authorize publication.');
check(assessment?.production_eligible === false, 'Historical assessment must not authorize production.');
check(/^sha256:[a-f0-9]{64}$/.test(assessment?.assessment_fingerprint ?? ''), 'Historical assessment fingerprint invalid.');

const historicalRegistryEntry = assessmentIndex?.records?.find((entry) => entry.id === historicalAssessmentId);
check(historicalRegistryEntry?.status === 'HISTORICAL_COMPLETED_BLOCKED', 'Assessment registry must classify first assessment as historical blocked history.');
check(assessmentIndex?.current_assessment_id === null, 'No historical assessment may remain current authority.');
check(assessmentIndex?.current_snapshot_id === null, 'No historical snapshot may remain current Track B input.');
check(assessmentIndex?.status === 'WAITING_FOR_SNAPSHOT', 'Assessment registry must wait for a new snapshot.');

check(track?.current_snapshot_id === null, 'Track B current_snapshot_id must remain null while exact pair is absent.');
check(track?.current_assessment_id === null, 'Track B current_assessment_id must remain null while exact pair is absent.');
check(track?.input_evidence_package_id === null, 'Track B current Evidence Package pointer must remain null.');
check(track?.status === 'WAITING_FOR_EXACT_IMMUTABLE_PACKAGE', 'Track B must remain waiting for exact immutable pair.');
check(stable(track?.input_boundary) === stable(['snapshot-candidate.json', 'Evidence Package']), 'Track B registry input boundary drifted.');
check(track?.production === 'HOLD', 'Track B production must remain HOLD.');

check(stable(role?.official_input) === stable(['snapshot-candidate.json', 'Evidence Package']), 'Track B role official input boundary drifted.');
check(stable(role?.official_output) === stable(['rankability-assessment.json']), 'Track B role official output boundary drifted.');
check(Array.isArray(role?.must_not) && role.must_not.includes('PRODUCTION_APPROVAL'), 'Track B role must prohibit production approval.');

if (errors.length) {
  console.error(`KIDULTS Track B Historical Assessment Archive: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log('KIDULTS Track B Historical Assessment Archive: PASS');
console.log(`Historical assessment: ${historicalAssessmentId}`);
console.log('Current assessment: NONE');
console.log('Current exact Candidate/Evidence pair: NONE');
console.log('Track B: WAITING_FOR_EXACT_IMMUTABLE_PACKAGE');
console.log('Publication: HOLD');
console.log('Production: HOLD');
