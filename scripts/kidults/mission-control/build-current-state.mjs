import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryRoot = path.join(root, 'coordination', 'kidults', 'registry');

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(registryRoot, relativePath), 'utf8'));
}

const track = read('track/index.json');
const snapshot = read('snapshot/index.json');
const assessment = read('assessment/index.json');
const release = read('release/index.json');
const milestone = read('milestone/index.json');
const mission = read('mission/index.json');
const blocker = read('blocker/index.json');
const provider = read('provider/index.json');
const runtime = read('runtime/index.json');

const trackStates = {};
for (const record of track.records) {
  const letter = record.id.includes('track-a-') ? 'A'
    : record.id.includes('track-b-') ? 'B'
    : record.id.includes('track-c-') ? 'C'
    : record.id.includes('track-d-') ? 'D'
    : record.id.includes('track-e-') ? 'E'
    : record.id;
  trackStates[letter] = record.status;
}

const currentState = {
  schema_version: '1.1.0',
  generated_at: new Date().toISOString(),
  program_status: 'ACTIVE',
  program_phase: 'PHASE_1_CONTENT_DATA_PROVIDER_FOUNDATION',
  current_milestone_id: milestone.current_record_id,
  current_baseline_snapshot_id: snapshot.current_baseline_snapshot_id,
  current_candidate_snapshot_id: snapshot.current_candidate_snapshot_id,
  current_assessment_id: assessment.current_assessment_id,
  production_state: release.status,
  provider_state: provider.records[0]?.status ?? 'NOT_REGISTERED',
  runtime_state: runtime.status,
  track_states: trackStates,
  mission_states: Object.fromEntries(mission.records.map((record) => [record.id, record.status])),
  open_blocker_ids: blocker.records.filter((record) => record.status === 'OPEN').map((record) => record.id),
};

process.stdout.write(`${JSON.stringify(currentState, null, 2)}\n`);
