import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryRoot = path.join(root,'coordination','kidults','registry');
const projectionIndexPath = path.join(registryRoot,'projection','index.json');
const twinPath = path.join(registryRoot,'digital-twin','records','twin-current-program-state-v1.json');

const readJson = absolute => JSON.parse(fs.readFileSync(absolute,'utf8'));
const comparable = value => {
  const copy = structuredClone(value);
  delete copy.generated_at;
  return copy;
};

const projectionIndex = readJson(projectionIndexPath);
const projectionRef = projectionIndex.records.find(item => item.id === projectionIndex.current_record_id);
if (!projectionRef) throw new Error('CURRENT_PROJECTION_REFERENCE_NOT_RESOLVED');
const projectionPath = path.join(registryRoot,'projection',projectionRef.path);
const projection = readJson(projectionPath);
const existing = fs.existsSync(twinPath) ? readJson(twinPath) : null;
const writeMode = process.argv.includes('--write');
const generatedAt = writeMode ? new Date().toISOString() : (existing?.generated_at ?? projection.generated_at);

const twin = {
  id:'twin-current-program-state-v1',
  record_type:'digital_twin',
  version:'1.7.0',
  status:'CURRENT',
  twin_id:'TWIN-0001',
  source_projection_id:projection.id,
  source_projection_version:projection.version,
  program_status:projection.program_status,
  program_phase:projection.control_tower_state.program_phase,
  registry_health:'PASS',
  registry_system_version:projection.source_registry_system_version,
  current_milestone_id:projection.control_tower_state.current_milestone_id,
  current_baseline_snapshot_id:projection.snapshot.baseline_id,
  current_candidate_snapshot_id:projection.snapshot.candidate_id,
  current_assessment_id:projection.assessment.current_id,
  production_state:projection.release.status,
  data_connection_state:projection.market_funnel_alignment.runtime_state,
  provider_state:projection.provider.connection_state,
  digitalocean_observation_state:projection.runtime.digitalocean_state,
  platform_market_funnel_alignment:projection.market_funnel_alignment,
  track_states:projection.track_states,
  mission_states:projection.control_tower_state.mission_states,
  critical_blocker_ids:projection.control_tower_state.critical_blocker_ids,
  high_blocker_ids:projection.control_tower_state.high_blocker_ids,
  open_decision_count:projection.control_tower_state.open_decision_count,
  generated_at:generatedAt,
  generated_from:[
    'coordination/kidults/registry/projection/index.json',
    `coordination/kidults/registry/projection/${projectionRef.path}`
  ],
  created_by:'Executive Control Tower Projection Consumer',
  approved_by:'John'
};

if (writeMode) {
  fs.writeFileSync(twinPath,`${JSON.stringify(twin,null,2)}\n`);
  console.log(`Wrote ${path.relative(root,twinPath)}`);
  process.exit(0);
}

if (!existing || JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(twin))) {
  console.error('Executive Control Tower Digital Twin is stale. Run:');
  console.error('node scripts/kidults/mission-control/build-current-state.mjs --write');
  process.exit(1);
}

console.log('Executive Control Tower Digital Twin Projection: PASS');
console.log(`Projection source: ${projection.id}@${projection.version}`);
console.log('Direct non-Projection inputs: 0');
console.log(`Production: ${twin.production_state}`);
