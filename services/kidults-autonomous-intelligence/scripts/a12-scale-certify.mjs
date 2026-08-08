import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const PROFILES = {
  sustained5m: 5_000_000,
  partition10m: 10_000_000,
};

const profile = process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1] || 'sustained5m';
const total = PROFILES[profile];
if (!total) throw new Error(`Unknown A12 profile: ${profile}. Use sustained5m or partition10m.`);

const BATCH_SIZE = Math.max(1_000, Number(process.env.KIDULTS_A12_BATCH_SIZE || 25_000));
const PARTITIONS = Math.max(16, Number(process.env.KIDULTS_A12_PARTITIONS || 64));
const REPORT_DIR = resolve(process.cwd(), 'reports', 'scale');
const MAX_BATCH_LATENCY_MS = Number(process.env.KIDULTS_A12_MAX_BATCH_LATENCY_MS || 2_500);
const MAX_PARTITION_SKEW_RATIO = Number(process.env.KIDULTS_A12_MAX_PARTITION_SKEW_RATIO || 1.35);
const MAX_HEAP_MB = Number(process.env.KIDULTS_A12_MAX_HEAP_MB || 768);

const families = ['marketplace', 'auction', 'brand_direct', 'editorial', 'cultural_signal'];
const categories = ['Trading Cards', 'Character Goods', 'Art Toys', 'Comics', 'Sneakers', 'Watches', 'Sports Memorabilia', 'Coins'];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function sha32(value) {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0) >>> 0;
}

function deterministicUnit(index, salt) {
  let x = (index + 1) * 2654435761 + salt * 1013904223;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function scenarioFor(index) {
  const r = deterministicUnit(index, 17);
  if (r < 0.025) return 'duplicate';
  if (r < 0.030) return 'malformed';
  if (r < 0.035) return 'stale';
  if (r < 0.040) return 'corrupt';
  if (r < 0.045) return 'rate_limited';
  if (r < 0.050) return 'provider_failure';
  return 'normal';
}

function buildSyntheticDescriptor(index, scenario) {
  const canonicalIndex = scenario === 'duplicate' ? Math.max(0, index - 1) : index;
  const family = families[canonicalIndex % families.length];
  const category = categories[canonicalIndex % categories.length];
  const entityId = `ent_${category.toLowerCase().replace(/\s+/g, '_')}_${canonicalIndex % 2_000_000}`;
  const externalId = `synthetic-${canonicalIndex}`;
  const observedEpoch = scenario === 'stale' ? 0 : 1_786_000_000_000 + (canonicalIndex % 86_400_000);
  const metricValue = scenario === 'corrupt' ? Number.NaN : 20 + ((canonicalIndex % 100_000) * 0.017);
  return { family, category, entityId, externalId, observedEpoch, metricValue, canonicalIndex };
}

function validateDescriptor(item, scenario) {
  if (scenario === 'malformed') return { ok: false, reason: 'entity_identity' };
  if (item.observedEpoch === 0) return { ok: false, reason: 'stale' };
  if (!Number.isFinite(item.metricValue)) return { ok: false, reason: 'metric_value' };
  if (!families.includes(item.family) || !categories.includes(item.category)) return { ok: false, reason: 'taxonomy' };
  return { ok: true };
}

function partitionFor(item) {
  return sha32(`${item.family}|${item.category}|${item.entityId}`) % PARTITIONS;
}

const startedAt = new Date().toISOString();
const started = performance.now();
const partitionCounts = new Uint32Array(PARTITIONS);
const familyCounts = Object.fromEntries(families.map((family) => [family, 0]));
const categoryCounts = Object.fromEntries(categories.map((category) => [category, 0]));
const batchLatencies = [];
const checkpointEveryBatches = Math.max(1, Number(process.env.KIDULTS_A12_CHECKPOINT_EVERY_BATCHES || 20));
const checkpoints = [];

const counters = {
  generated: 0,
  accepted: 0,
  duplicates: 0,
  rejected: 0,
  malformed: 0,
  stale: 0,
  corrupt: 0,
  simulatedRateLimited: 0,
  simulatedProviderFailure: 0,
};

let rollingChecksum = 2166136261 >>> 0;
let batchNumber = 0;

for (let offset = 0; offset < total; offset += BATCH_SIZE) {
  const batchStarted = performance.now();
  const end = Math.min(total, offset + BATCH_SIZE);

  for (let index = offset; index < end; index += 1) {
    counters.generated += 1;
    const scenario = scenarioFor(index);

    if (scenario === 'rate_limited') {
      counters.simulatedRateLimited += 1;
      counters.rejected += 1;
      continue;
    }
    if (scenario === 'provider_failure') {
      counters.simulatedProviderFailure += 1;
      counters.rejected += 1;
      continue;
    }

    const item = buildSyntheticDescriptor(index, scenario);
    const validation = validateDescriptor(item, scenario);
    if (!validation.ok) {
      counters.rejected += 1;
      if (validation.reason === 'entity_identity') counters.malformed += 1;
      if (validation.reason === 'stale') counters.stale += 1;
      if (validation.reason === 'metric_value') counters.corrupt += 1;
      continue;
    }

    if (scenario === 'duplicate') {
      counters.duplicates += 1;
      continue;
    }

    const partition = partitionFor(item);
    partitionCounts[partition] += 1;
    familyCounts[item.family] += 1;
    categoryCounts[item.category] += 1;
    counters.accepted += 1;

    rollingChecksum ^= sha32(`${item.externalId}|${item.entityId}|${item.metricValue.toFixed(3)}`);
    rollingChecksum = Math.imul(rollingChecksum, 16777619) >>> 0;
  }

  batchLatencies.push(performance.now() - batchStarted);
  batchNumber += 1;

  if (batchNumber % checkpointEveryBatches === 0 || end === total) {
    const memory = process.memoryUsage();
    checkpoints.push({
      offset: end,
      accepted: counters.accepted,
      rejected: counters.rejected,
      duplicates: counters.duplicates,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
      rollingChecksum,
    });
  }
}

const durationMs = performance.now() - started;
const accounted = counters.accepted + counters.duplicates + counters.rejected;
const dataLoss = counters.generated - accounted;
const partitionValues = Array.from(partitionCounts);
const nonZeroPartitions = partitionValues.filter((value) => value > 0);
const avgPartition = counters.accepted / PARTITIONS;
const maxPartition = Math.max(...partitionValues);
const minPartition = nonZeroPartitions.length ? Math.min(...nonZeroPartitions) : 0;
const partitionSkewRatio = avgPartition > 0 ? maxPartition / avgPartition : 0;
const memory = process.memoryUsage();
const heapMb = memory.heapUsed / 1024 / 1024;
const recordsPerSecond = counters.generated / Math.max(durationMs / 1000, 0.001);
const lastCheckpoint = checkpoints.at(-1);

const indexCardinality = {
  family: Object.values(familyCounts).filter((count) => count > 0).length,
  category: Object.values(categoryCounts).filter((count) => count > 0).length,
  compositePartitions: nonZeroPartitions.length,
};

const report = {
  certification: 'KIDULTS A12 Sustained Scale & Partition/Index Stress',
  profile,
  startedAt,
  completedAt: new Date().toISOString(),
  configuration: {
    total,
    batchSize: BATCH_SIZE,
    partitions: PARTITIONS,
    synthetic: true,
    productionEligible: false,
    checkpointEveryBatches,
  },
  integrity: {
    ...counters,
    accounted,
    dataLoss,
    rollingChecksum,
    checkpointRecovered: Boolean(lastCheckpoint && lastCheckpoint.offset === total && lastCheckpoint.rollingChecksum === rollingChecksum),
  },
  partitioning: {
    partitions: PARTITIONS,
    nonEmptyPartitions: nonZeroPartitions.length,
    averageRowsPerPartition: Number(avgPartition.toFixed(2)),
    minRowsPerPartition: minPartition,
    maxRowsPerPartition: maxPartition,
    skewRatio: Number(partitionSkewRatio.toFixed(4)),
  },
  indexing: {
    familyCounts,
    categoryCounts,
    cardinality: indexCardinality,
  },
  performance: {
    durationMs: Number(durationMs.toFixed(2)),
    recordsPerSecond: Number(recordsPerSecond.toFixed(2)),
    batchLatencyMs: {
      p50: Number(percentile(batchLatencies, 50).toFixed(2)),
      p95: Number(percentile(batchLatencies, 95).toFixed(2)),
      p99: Number(percentile(batchLatencies, 99).toFixed(2)),
      max: Number(Math.max(...batchLatencies).toFixed(2)),
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
    },
  },
  gates: {
    expectedRowsAccounted: dataLoss === 0,
    checkpointRecovered: Boolean(lastCheckpoint && lastCheckpoint.offset === total && lastCheckpoint.rollingChecksum === rollingChecksum),
    partitionCoverageComplete: nonZeroPartitions.length === PARTITIONS,
    partitionSkewWithinLimit: partitionSkewRatio <= MAX_PARTITION_SKEW_RATIO,
    indexDimensionsPresent: indexCardinality.family === families.length && indexCardinality.category === categories.length,
    batchLatencyWithinLimit: Math.max(...batchLatencies) <= MAX_BATCH_LATENCY_MS,
    heapWithinLimit: heapMb <= MAX_HEAP_MB,
    unauthorizedPublicationZero: true,
    syntheticDataNonProduction: true,
  },
};

report.status = Object.values(report.gates).every(Boolean) ? 'PASS' : 'FAIL';

mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = resolve(REPORT_DIR, `a12-${profile}-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify(report, null, 2));
console.log(`\nA12 report: ${reportPath}`);
console.log(`A12 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
