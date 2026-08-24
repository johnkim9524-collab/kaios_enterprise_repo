import fs from 'node:fs';

const errors=[];
const findings=[];
for (const file of [
  'services/kidults-autonomous-intelligence/src/index.ts',
  'services/kidults-autonomous-intelligence/src/asi/runtime.ts',
  'services/kidults-autonomous-intelligence/src/asi/processor-runtime.ts'
]) {
  if (!fs.existsSync(file)) continue;
  const text=fs.readFileSync(file,'utf8');
  findings.push({file,selectStar:[...text.matchAll(/SELECT\s+\*/gi)].length});
}

const worker='services/kidults-autonomous-intelligence/src/worker.ts';
if (fs.existsSync(worker)) {
  const text=fs.readFileSync(worker,'utf8');
  const heartbeat=text.match(/async function recordShadowHeartbeat[\s\S]*?\n}\n/)?.[0] || '';
  if (/asiMeshTelemetry\s*\(/.test(heartbeat)) errors.push('scheduled heartbeat must not invoke full asiMeshTelemetry');
  if (!heartbeat.includes("telemetryMode:'ON_DEMAND_ONLY'")) errors.push('heartbeat must declare on-demand telemetry mode');
}

const migration='services/kidults-autonomous-intelligence/migrations/0007_d1_query_efficiency_indexes.sql';
if (!fs.existsSync(migration)) errors.push('missing D1 query efficiency migration 0007');
else {
  const sql=fs.readFileSync(migration,'utf8');
  for (const required of [
    'idx_evidence_status_observed',
    'idx_observations_entity_metric_latest',
    'idx_observations_metric_latest',
    'idx_intelligence_runs_status_finished',
    'idx_category_snapshots_run_score',
    'idx_publication_snapshots_channel_status_published',
    'idx_source_registry_active_family_region',
    'idx_entity_registry_type',
    'idx_asi_outbox_recovery_due',
    'idx_asi_replay_recovery_due',
    'idx_asi_replay_awaiting_requested',
    'idx_asi_task_leases_active',
    'idx_asi_control_holds_reason'
  ]) if (!sql.includes(required)) errors.push(`missing hot-path index: ${required}`);
}

if (errors.length) {
  console.error(JSON.stringify({suite:'D1_QUERY_EFFICIENCY_V1',result:'FAIL',errors,findings},null,2));
  process.exit(1);
}
console.log(JSON.stringify({suite:'D1_QUERY_EFFICIENCY_V1',result:'PASS',findings},null,2));
