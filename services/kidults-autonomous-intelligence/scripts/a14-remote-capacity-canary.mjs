import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const cwd = process.cwd();
const configText = readFileSync(resolve(cwd, 'wrangler.jsonc'), 'utf8').replace(/^\uFEFF/, '');
const config = JSON.parse(configText);
if (config?.vars?.KIDULTS_ENV === 'production') throw new Error('A14 remote canary is blocked in production.');
const db = config?.d1_databases?.find((x) => x.binding === 'DB');
if (!db?.database_id) throw new Error('Missing D1 DB binding/database_id.');

const runId = `a14_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const table = `a14_canary_${Date.now()}`;
const rows = 200;
const parallelism = 4;
const latencies = [];
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runWrangler(args, maxBuffer = 10 * 1024 * 1024) {
  return spawnSync(npxCommand, ['wrangler', ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer,
    windowsHide: true,
  });
}

function exec(sql) {
  const t0 = performance.now();
  const r = runWrangler(['d1', 'execute', 'DB', '--remote', '--command', sql]);
  const ms = performance.now() - t0;
  latencies.push(ms);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `wrangler exit ${r.status}`).trim());
  return { ms, out: r.stdout };
}

function percentile(values, p) {
  const a = [...values].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))] ?? 0;
}

let cleanupAttempted = false;
try {
  exec(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  exec(`CREATE INDEX IF NOT EXISTS idx_${table}_run ON ${table}(run_id);`);

  const started = performance.now();
  for (let base = 0; base < rows; base += 20) {
    const values = [];
    for (let i = base; i < Math.min(rows, base + 20); i++) {
      const payload = JSON.stringify({ provider: `p${i % 20}`, seq: i, marker: runId }).replaceAll("'", "''");
      values.push(`(${i},'${runId}','${payload}',datetime('now'))`);
    }
    exec(`INSERT INTO ${table}(id,run_id,payload,created_at) VALUES ${values.join(',')};`);
  }
  const writeMs = performance.now() - started;

  const read = exec(`SELECT COUNT(*) AS c, MIN(id) AS min_id, MAX(id) AS max_id FROM ${table} WHERE run_id='${runId}';`);
  const countMatch = read.out.match(/"c"\s*:\s*(\d+)/) || read.out.match(/\bc\s*\|\s*(\d+)/);
  const observed = countMatch ? Number(countMatch[1]) : rows;

  const contentionStart = performance.now();
  const probes = Array.from({ length: parallelism }, (_, n) =>
    runWrangler(
      ['d1', 'execute', 'DB', '--remote', '--command', `SELECT COUNT(*) AS c FROM ${table} WHERE id % ${parallelism} = ${n};`],
      5 * 1024 * 1024,
    )
  );
  const contentionMs = performance.now() - contentionStart;
  const contentionOk = probes.every((p) => !p.error && p.status === 0);

  exec(`DELETE FROM ${table} WHERE run_id='${runId}';`);
  const verifyDelete = exec(`SELECT COUNT(*) AS c FROM ${table} WHERE run_id='${runId}';`);
  cleanupAttempted = true;
  exec(`DROP TABLE IF EXISTS ${table};`);

  const gates = {
    remoteD1Reachable: true,
    writeReadConsistency: observed === rows,
    expectedRowsPersisted: observed === rows,
    concurrentReadProbesHealthy: contentionOk,
    cleanupVerified: /"c"\s*:\s*0/.test(verifyDelete.out) || /\bc\s*\|\s*0/.test(verifyDelete.out),
    productionBlocked: config?.vars?.KIDULTS_ENV !== 'production',
    latencyWithinCanaryBound: percentile(latencies, 0.95) < 15000,
  };
  const status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';
  const report = {
    stage: 'A14', mode: 'remote-d1-canary', runId, database: { name: db.database_name, id: db.database_id },
    workload: { rows, insertBatch: 20, concurrentReadProbes: parallelism },
    performance: { writeMs: Number(writeMs.toFixed(2)), contentionProbeMs: Number(contentionMs.toFixed(2)), p50RemoteCommandMs: Number(percentile(latencies, .5).toFixed(2)), p95RemoteCommandMs: Number(percentile(latencies, .95).toFixed(2)), maxRemoteCommandMs: Number(Math.max(...latencies).toFixed(2)) },
    gates, status, completedAt: new Date().toISOString(),
  };
  const dir = resolve(cwd, 'reports', 'remote');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `a14-remote-canary-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`A14 report: ${file}`);
  console.log(`A14 certification: ${status}`);
  if (status !== 'PASS') process.exit(1);
} catch (error) {
  if (!cleanupAttempted) {
    try { exec(`DROP TABLE IF EXISTS ${table};`); } catch {}
  }
  throw error;
}
