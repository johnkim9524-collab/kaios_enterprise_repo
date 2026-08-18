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
function assert(condition, message) { if (!condition) errors.push(message); }

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

assert(track?.record_count === 5, 'Track Registry must contain exactly five registered tracks (A–E).');
assert(milestone?.current_record_id === 'milestone-ms-0001-first-canonical-snapshot', 'MS-0001 remains the historical milestone pointer until a versioned milestone transition is registered.');
assert(mission?.record_count === 5, 'Mission Registry must preserve the five registered mission ledger records.');
assert(workQueue?.record_count >= 6, 'Work Queue must retain at least six bootstrap work items.');
assert(blocker?.record_count >= 7, 'Blocker Registry must retain historical blockers and current Holistic Review blockers.');
assert(twinIndex?.current_record_id === twin?.id, 'Digital Twin current pointer must resolve.');

const trackState = Object.fromEntries((track?.records ?? []).map((record) => {
  const letter = record.id.includes('track-a-') ? 'A'
    : record.id.includes('track-b-') ? 'B'
    : record.id.includes('track-c-') ? 'C'
    : record.id.includes('track-d-') ? 'D'
    : record.id.includes('track-e-') ? 'E'
    : record.id;
  return [letter, record.status];
}));
for (const letter of ['A', 'B', 'C', 'D', 'E']) {
  assert(twin?.track_states?.[letter] === trackState[letter],
    `Digital Twin Track ${letter} state '${twin?.track_states?.[letter]}' does not match Track Registry '${trackState[letter]}'.`);
}

assert(twin?.current_baseline_snapshot_id === snapshot?.current_baseline_snapshot_id, 'Digital Twin baseline pointer must match Snapshot Registry.');
assert(twin?.current_candidate_snapshot_id === snapshot?.current_candidate_snapshot_id, 'Digital Twin candidate pointer must match Snapshot Registry.');
assert(twin?.current_assessment_id === assessment?.current_assessment_id, 'Digital Twin assessment pointer must match Assessment Registry.');
assert(twin?.production_state === release?.status, 'Digital Twin production state must match Release Registry status.');

const openBlockers = blocker?.records?.filter((record) => record.status === 'OPEN') ?? [];
const blockerIds = new Set(openBlockers.map((record) => record.id));
const noCandidate = snapshot?.current_candidate_snapshot_id === null;
assert(noCandidate === blockerIds.has('blocker-no-canonical-candidate'), 'No-current-candidate blocker must be open exactly while current_candidate_snapshot_id is null.');
const criticalFromRegistry = openBlockers.filter(record => record.severity === 'CRITICAL').map(record => record.id).sort();
const highFromRegistry = openBlockers.filter(record => record.severity === 'HIGH').map(record => record.id).sort();
assert(JSON.stringify([...(twin?.critical_blocker_ids ?? [])].sort()) === JSON.stringify(criticalFromRegistry), 'Digital Twin CRITICAL blocker projection must match Blocker Registry.');
assert(JSON.stringify([...(twin?.high_blocker_ids ?? [])].sort()) === JSON.stringify(highFromRegistry), 'Digital Twin HIGH blocker projection must match Blocker Registry.');

const missionIds = new Set(mission?.records?.map((record) => record.id));
for (const record of workQueue?.records ?? []) {
  const task = readJson(`work-queue/${record.path}`);
  assert(missionIds.has(task?.mission_id), `${record.id}: mission_id '${task?.mission_id}' does not resolve.`);
}

const trackE = track?.records?.find((record) => record.id === 'track-e-executive-operating-system');
const missionE = mission?.records?.find((record) => record.id === 'mission-track-e-executive-operating-system');
assert(trackE?.status === 'FOUNDATION_COMPLETE_INTEGRATION_ACTIVE', 'Track E must reflect approved Foundation Complete / Integration Active state.');
assert(missionE?.status === 'IN_PROGRESS', 'MISSION-E-0001 historical mission ledger remains IN_PROGRESS until Founder Acceptance closes it.');
assert(twin?.source_freshness_status === 'CURRENT_CANONICAL_BASELINE', 'Digital Twin must consume semantically current Projection truth.');
assert(twin?.production_state === 'HOLD', 'Current phase must not change Production HOLD.');

if (errors.length) {
  console.error(`KIDULTS Mission Control: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('KIDULTS Mission Control: PASS');
console.log(`Registered tracks: ${track.record_count}`);
console.log(`Registered missions: ${mission.record_count}`);
console.log(`Current milestone: ${milestone.current_record_id}`);
console.log(`Current candidate: ${snapshot.current_candidate_snapshot_id ?? 'NONE'}`);
console.log(`Current assessment: ${assessment.current_assessment_id ?? 'NONE'}`);
console.log(`Open operational blockers: ${openBlockers.length}`);
console.log(`Critical blockers: ${criticalFromRegistry.length}`);
console.log(`High blockers: ${highFromRegistry.length}`);
console.log(`Rankability assessment: ${assessment.status}`);
console.log(`Work items: ${workQueue.record_count}`);
