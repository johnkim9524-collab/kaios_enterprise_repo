import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryRoot = path.join(root, 'coordination', 'kidults', 'registry');
const errors = [];

function readJson(relativePath) {
  const absolute = path.join(registryRoot, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const track = readJson('track/index.json');
const snapshot = readJson('snapshot/index.json');
const assessment = readJson('assessment/index.json');
const release = readJson('release/index.json');
const milestone = readJson('milestone/index.json');
const mission = readJson('mission/index.json');
const workQueue = readJson('work-queue/index.json');
const blocker = readJson('blocker/index.json');
const twinIndex = readJson('digital-twin/index.json');
const twin = readJson('digital-twin/records/twin-current-program-state-v1.json');

assert(track?.record_count === 4, 'Track Registry must contain exactly four tracks.');
assert(milestone?.current_record_id === 'milestone-ms-0001-first-canonical-snapshot', 'MS-0001 must be the current milestone.');
assert(mission?.record_count === 4, 'Mission Registry must contain four initial missions.');
assert(workQueue?.record_count === 6, 'Work Queue must contain six initial work items.');
assert(blocker?.record_count === 2, 'Blocker Registry must contain two initial blockers.');
assert(twinIndex?.current_record_id === twin?.id, 'Digital Twin current pointer must resolve.');

const trackState = Object.fromEntries((track?.records ?? []).map((record) => {
  const letter = record.id.includes('track-a-') ? 'A'
    : record.id.includes('track-b-') ? 'B'
    : record.id.includes('track-c-') ? 'C'
    : record.id.includes('track-d-') ? 'D'
    : record.id;
  return [letter, record.status];
}));

for (const letter of ['A', 'B', 'C', 'D']) {
  assert(twin?.track_states?.[letter] === trackState[letter],
    `Digital Twin Track ${letter} state '${twin?.track_states?.[letter]}' does not match Track Registry '${trackState[letter]}'.`);
}

assert(twin?.current_baseline_snapshot_id === snapshot?.current_baseline_snapshot_id,
  'Digital Twin baseline pointer must match Snapshot Registry.');
assert(twin?.current_candidate_snapshot_id === snapshot?.current_candidate_snapshot_id,
  'Digital Twin candidate pointer must match Snapshot Registry.');
assert(twin?.current_assessment_id === assessment?.current_assessment_id,
  'Digital Twin assessment pointer must match Assessment Registry.');
assert(twin?.production_state === release?.status,
  'Digital Twin production state must match Release Registry status.');

const noCandidate = snapshot?.current_candidate_snapshot_id === null;
const blockerIds = new Set(blocker?.records?.filter((record) => record.status === 'OPEN').map((record) => record.id));
assert(noCandidate === blockerIds.has('blocker-no-canonical-candidate'),
  'No-candidate blocker must be open exactly while current_candidate_snapshot_id is null.');

const missionIds = new Set(mission?.records?.map((record) => record.id));
for (const record of workQueue?.records ?? []) {
  const task = readJson(`work-queue/${record.path}`);
  assert(missionIds.has(task?.mission_id), `${record.id}: mission_id '${task?.mission_id}' does not resolve.`);
}

if (errors.length) {
  console.error(`KIDULTS Mission Control: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log('KIDULTS Mission Control: PASS');
console.log(`Current milestone: ${milestone.current_record_id}`);
console.log(`Current candidate: ${snapshot.current_candidate_snapshot_id ?? 'NONE'}`);
console.log(`Current assessment: ${assessment.current_assessment_id ?? 'NONE'}`);
console.log(`Open blockers: ${blocker.records.filter((record) => record.status === 'OPEN').length}`);
console.log(`Work items: ${workQueue.record_count}`);
