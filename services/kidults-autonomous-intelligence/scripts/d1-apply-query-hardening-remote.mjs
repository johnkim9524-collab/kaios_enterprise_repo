import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const targets = {
  dev: {
    name: 'kidults-intelligence-db-dev',
    id: '8a6978d9-36c5-42de-b469-27278e21973b',
  },
  staging: {
    name: 'kidults-intelligence-db-staging',
    id: '9bc6a406-6fca-4959-be7f-dd7f715b092c',
  },
};

const forbiddenNames = new Set(['kidults-intelligence-db', 'kidults-main-db', 'kidults_db']);
const arg = process.argv.find((x) => x.startsWith('--target='));
const targetName = arg?.split('=')[1];
const apply = process.argv.includes('--apply');
const target = targets[targetName];

if (!target) {
  throw new Error('A target is required: --target=dev or --target=staging');
}
if (forbiddenNames.has(target.name)) throw new Error('Forbidden non-bounded D1 target');
if (!apply) {
  console.log(JSON.stringify({
    mode: 'DRY_RUN_ONLY',
    target: targetName,
    database: target,
    migration: 'migrations/0007_d1_query_efficiency_hardening_shadow.sql',
    mutation_performed: false,
    production: 'HOLD',
  }, null, 2));
  process.exit(0);
}

if (process.env.KIDULTS_D1_REMOTE_MIGRATION_APPROVED !== 'true') {
  throw new Error('Remote mutation blocked: KIDULTS_D1_REMOTE_MIGRATION_APPROVED=true is required');
}
if (process.env.KIDULTS_ENV === 'production') throw new Error('Production environment is forbidden');

const cwd = resolve(process.cwd());
const migration = resolve(cwd, 'migrations/0007_d1_query_efficiency_hardening_shadow.sql');
const sql = readFileSync(migration, 'utf8');
if (!sql.includes('idx_asi_outbox_hot_selection') || !sql.includes('idx_evidence_status_observed')) {
  throw new Error('Expected D1 hardening migration signature missing');
}

function run(args) {
  const r = spawnSync('npx', ['wrangler', ...args], { cwd, encoding: 'utf8', shell: false, maxBuffer: 10 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `wrangler exit ${r.status}`).trim());
  return r.stdout;
}

// Verify the named remote DB resolves to the exact allowlisted UUID before mutation.
const info = run(['d1', 'info', target.name, '--json']);
if (!info.includes(target.id)) throw new Error(`Remote D1 identity mismatch for ${targetName}`);

// Apply only the single additive index migration, never the entire migration history.
run(['d1', 'execute', target.name, '--remote', '--file', migration, '--yes']);

// Read-only postcondition: all required indexes must exist.
const required = [
  'idx_asi_source_candidate_observations_latest',
  'idx_asi_source_pool_decisions_latest',
  'idx_asi_outbox_hot_selection',
  'idx_asi_replay_claim_covering',
  'idx_evidence_status_observed',
  'idx_observations_latest_covering',
  'idx_source_registry_active_family',
  'idx_source_registry_active_region',
  'idx_entity_registry_type',
  'idx_intelligence_runs_status_finished',
  'idx_category_snapshots_run_score',
  'idx_publication_snapshots_channel_status_time',
];
const escaped = required.map((x) => `'${x}'`).join(',');
const post = run(['d1', 'execute', target.name, '--remote', '--command', `SELECT name FROM sqlite_master WHERE type='index' AND name IN (${escaped}) ORDER BY name;`, '--json']);
for (const index of required) if (!post.includes(index)) throw new Error(`Postcondition missing index: ${index}`);

console.log(JSON.stringify({
  mode: 'APPLIED_AND_VERIFIED',
  target: targetName,
  database: target,
  required_indexes: required.length,
  production: 'HOLD',
}, null, 2));
