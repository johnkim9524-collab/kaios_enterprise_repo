import { performance } from 'node:perf_hooks';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PROFILES = { smoke: 10_000, baseline: 100_000, million: 1_000_000 };
const profile = process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1] || 'baseline';
const total = PROFILES[profile];
if (!total) throw new Error(`Unknown profile: ${profile}. Use smoke, baseline, or million.`);

const BATCH_SIZE = Math.max(100, Number(process.env.KIDULTS_A11_BATCH_SIZE || 2_000));
const READ_SAMPLES = Math.max(100, Number(process.env.KIDULTS_A11_READ_SAMPLES || 5_000));
const REPORT_DIR = resolve(process.cwd(), 'reports', 'persistence');
const WORK_DIR = resolve(process.cwd(), '.a11-work');
const DB_PATH = resolve(WORK_DIR, `a11-${profile}.sqlite`);
const REPORT_PATH = resolve(REPORT_DIR, `a11-${profile}-${Date.now()}.json`);

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(WORK_DIR, { recursive: true });
if (existsSync(DB_PATH)) rmSync(DB_PATH, { force: true });

const nowIso = () => new Date().toISOString();
const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function makeRecord(index) {
  const categories = ['Trading Cards', 'Character Goods', 'Art Toys', 'Comics', 'Sneakers', 'Watches', 'Sports Memorabilia', 'Coins'];
  const families = ['marketplace', 'auction', 'brand_direct', 'editorial', 'cultural_signal'];
  const category = categories[index % categories.length];
  const family = families[index % families.length];
  const payload = {
    synthetic: true,
    index,
    category,
    family,
    price: Number((25 + (index % 100_000) * 0.013).toFixed(2)),
    inventory: index % 500,
    observedAt: new Date(Date.now() - (index % 86_400_000)).toISOString(),
  };
  return {
    id: `ev_${index.toString(36)}`,
    externalId: `a11-${index}`,
    sourceFamily: family,
    category,
    payloadJson: JSON.stringify(payload),
    payloadHash: sha256(payload),
    createdAt: nowIso(),
  };
}

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA temp_store=MEMORY;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS a11_evidence (
      id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL,
      source_family TEXT NOT NULL,
      category TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_family, external_id, payload_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_a11_category_created ON a11_evidence(category, created_at);
    CREATE INDEX IF NOT EXISTS idx_a11_family_created ON a11_evidence(source_family, created_at);
    CREATE TABLE IF NOT EXISTS a11_checkpoints (
      key TEXT PRIMARY KEY,
      value_text TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function writeBatch(db, start, end) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO a11_evidence
      (id, external_id, source_family, category, payload_json, payload_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const checkpoint = db.prepare(`
    INSERT INTO a11_checkpoints(key, value_text, updated_at)
    VALUES ('last_committed_index', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_text=excluded.value_text, updated_at=excluded.updated_at
  `);
  let accepted = 0;
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (let index = start; index < end; index += 1) {
      const r = makeRecord(index);
      const result = insert.run(r.id, r.externalId, r.sourceFamily, r.category, r.payloadJson, r.payloadHash, r.createdAt);
      accepted += Number(result.changes || 0);
    }
    checkpoint.run(String(end - 1), nowIso());
    db.exec('COMMIT;');
    return accepted;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

const startedAt = nowIso();
const writeLatencies = [];
let accepted = 0;
let db = openDb(DB_PATH);
const writeStart = performance.now();

for (let offset = 0; offset < total; offset += BATCH_SIZE) {
  const end = Math.min(total, offset + BATCH_SIZE);
  const batchStart = performance.now();
  accepted += writeBatch(db, offset, end);
  writeLatencies.push(performance.now() - batchStart);
}

const writeDurationMs = performance.now() - writeStart;
const countBeforeRestart = Number(db.prepare('SELECT COUNT(*) AS c FROM a11_evidence').get().c);
const checkpointBeforeRestart = db.prepare("SELECT value_text FROM a11_checkpoints WHERE key='last_committed_index'").get()?.value_text;
db.close();

const restartStart = performance.now();
db = openDb(DB_PATH);
const restartMs = performance.now() - restartStart;
const countAfterRestart = Number(db.prepare('SELECT COUNT(*) AS c FROM a11_evidence').get().c);
const checkpointAfterRestart = db.prepare("SELECT value_text FROM a11_checkpoints WHERE key='last_committed_index'").get()?.value_text;

const replayStart = Math.max(0, total - Math.min(total, BATCH_SIZE * 2));
const replayBefore = Number(db.prepare('SELECT COUNT(*) AS c FROM a11_evidence').get().c);
writeBatch(db, replayStart, total);
const replayAfter = Number(db.prepare('SELECT COUNT(*) AS c FROM a11_evidence').get().c);
const duplicateLeakage = replayAfter - replayBefore;

const readLatencies = [];
let readMismatches = 0;
const readById = db.prepare('SELECT payload_hash, payload_json FROM a11_evidence WHERE id=?');
const sampleCount = Math.min(READ_SAMPLES, total);
for (let i = 0; i < sampleCount; i += 1) {
  const index = Math.floor((i * total) / sampleCount);
  const readStart = performance.now();
  const row = readById.get(`ev_${index.toString(36)}`);
  readLatencies.push(performance.now() - readStart);
  if (!row || sha256(JSON.parse(row.payload_json)) !== row.payload_hash) readMismatches += 1;
}

const aggregationStart = performance.now();
const aggregates = db.prepare(`
  SELECT source_family, category, COUNT(*) AS records
  FROM a11_evidence
  GROUP BY source_family, category
  ORDER BY records DESC
`).all();
const aggregationMs = performance.now() - aggregationStart;

const integritySweepStart = performance.now();
let hashMismatches = 0;
const sweep = db.prepare('SELECT payload_json, payload_hash FROM a11_evidence');
for (const row of sweep.iterate()) {
  if (sha256(JSON.parse(row.payload_json)) !== row.payload_hash) hashMismatches += 1;
}
const integritySweepMs = performance.now() - integritySweepStart;

const finalCount = Number(db.prepare('SELECT COUNT(*) AS c FROM a11_evidence').get().c);
db.close();

const gates = {
  expectedRowsPersisted: finalCount === total,
  restartDurability: countBeforeRestart === total && countAfterRestart === total,
  checkpointRecovered: checkpointBeforeRestart === String(total - 1) && checkpointAfterRestart === String(total - 1),
  duplicateReplayIdempotent: duplicateLeakage === 0,
  sampledReadsValid: readMismatches === 0,
  fullHashIntegrity: hashMismatches === 0,
  syntheticDataNonProduction: true,
};

const report = {
  certification: 'KIDULTS A11 Million-Record Persistence & Recovery Certification',
  profile,
  startedAt,
  completedAt: nowIso(),
  configuration: {
    total,
    batchSize: BATCH_SIZE,
    readSamples: sampleCount,
    storage: 'SQLite WAL / D1-compatible persistence model',
    synthetic: true,
    productionEligible: false,
    databasePath: DB_PATH,
  },
  persistence: {
    accepted,
    finalCount,
    countBeforeRestart,
    countAfterRestart,
    checkpointBeforeRestart,
    checkpointAfterRestart,
    duplicateLeakage,
    readMismatches,
    hashMismatches,
    aggregateGroups: aggregates.length,
  },
  performance: {
    writeDurationMs: Number(writeDurationMs.toFixed(2)),
    writeRecordsPerSecond: Number((total / Math.max(writeDurationMs / 1000, 0.001)).toFixed(2)),
    batchWriteLatencyMs: {
      p50: Number(percentile(writeLatencies, 50).toFixed(2)),
      p95: Number(percentile(writeLatencies, 95).toFixed(2)),
      p99: Number(percentile(writeLatencies, 99).toFixed(2)),
      max: Number(Math.max(...writeLatencies).toFixed(2)),
    },
    sampledReadLatencyMs: {
      p50: Number(percentile(readLatencies, 50).toFixed(4)),
      p95: Number(percentile(readLatencies, 95).toFixed(4)),
      p99: Number(percentile(readLatencies, 99).toFixed(4)),
      max: Number(Math.max(...readLatencies).toFixed(4)),
    },
    restartMs: Number(restartMs.toFixed(2)),
    aggregationMs: Number(aggregationMs.toFixed(2)),
    integritySweepMs: Number(integritySweepMs.toFixed(2)),
    memory: process.memoryUsage(),
  },
  gates,
};

report.status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify(report, null, 2));
console.log(`\nA11 report: ${REPORT_PATH}`);
console.log(`A11 certification: ${report.status}`);
console.log('Next gates: sustained 5M, 10M partition/index stress, provider-shaped concurrency, D1 remote canary.');

if (report.status !== 'PASS') process.exit(1);
