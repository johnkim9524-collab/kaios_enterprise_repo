import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function writeAtomic(path, value) {
  ensureDir(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function appendAudit(path, value) {
  ensureDir(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  chmodSync(path, 0o600);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function numeric(value, label, minimum = 0, maximum = 100) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new Error(`invalid_${label}`);
  }
  return result;
}

function timestamp(value, label, now, maximumAgeHours) {
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) throw new Error(`invalid_${label}`);
  if (time > now.getTime() + MAX_FUTURE_SKEW_MS) throw new Error(`future_${label}`);
  if (now.getTime() - time > maximumAgeHours * 60 * 60 * 1000) {
    throw new Error(`stale_${label}`);
  }
  return parsed;
}

function sourcePolicy(registry, sourceId) {
  const policy = registry.sources.find((source) => source.id === sourceId);
  if (!policy || policy.enabled !== true || policy.environment !== "staging") {
    throw new Error("source_not_allowlisted");
  }
  if (!["allowed", "restricted"].includes(policy.rights?.collect)) {
    throw new Error("collection_rights_blocked");
  }
  if (policy.rights?.store !== "allowed" || policy.rights?.transform !== "allowed") {
    throw new Error("processing_rights_blocked");
  }
  return policy;
}

function normalizeSignal(signal, policy, reportCollectedAt, now) {
  if (signal.mode !== "live") throw new Error("non_live_signal");
  if (String(signal.source_id || "") !== policy.id) throw new Error("source_identity_mismatch");
  if (!validSha256(signal.payload_hash)) throw new Error("invalid_payload_hash");
  if (!validHttpUrl(signal.source_url) || !validHttpUrl(signal.evidence_url)) {
    throw new Error("invalid_evidence_url");
  }
  const collectedAt = timestamp(
    signal.collected_at || reportCollectedAt,
    "collected_at",
    now,
    policy.maximum_age_hours
  );
  const publishedAt = signal.published_at
    ? new Date(signal.published_at)
    : collectedAt;
  if (!Number.isFinite(publishedAt.getTime())) throw new Error("invalid_published_at");
  const brandId = String(signal.brand_id || "").trim();
  const category = String(signal.category || "").trim();
  const externalId = String(signal.external_id || "").trim();
  if (!brandId || !category || !externalId) throw new Error("incomplete_identity");
  if (signal.coverage_assigned === true) throw new Error("synthetic_coverage_signal");
  return {
    source_id: policy.id,
    source_tier: policy.tier,
    brand_id: brandId.slice(0, 100),
    category: category.slice(0, 120),
    external_id: externalId.slice(0, 500),
    signal: numeric(signal.signal, "signal"),
    sentiment: numeric(signal.sentiment, "sentiment"),
    visibility: numeric(signal.visibility, "visibility"),
    confidence: numeric(signal.confidence, "confidence"),
    source_weight: numeric(signal.source_weight, "source_weight", 0, 1),
    payload_hash: String(signal.payload_hash).toLowerCase(),
    evidence_url_hash: sha256(String(signal.evidence_url)),
    published_at: publishedAt.toISOString(),
    collected_at: collectedAt.toISOString()
  };
}

function aggregate(signals, now) {
  const categories = new Map();
  for (const signal of signals) {
    const list = categories.get(signal.category) || [];
    list.push(signal);
    categories.set(signal.category, list);
  }
  return [...categories.entries()].map(([category, records]) => {
    const weighted = (field) => {
      const denominator = records.reduce((sum, record) => sum + record.source_weight, 0);
      return records.reduce((sum, record) => sum + record[field] * record.source_weight, 0) /
        (denominator || records.length);
    };
    const newest = Math.max(...records.map((record) => new Date(record.collected_at).getTime()));
    const score = weighted("signal") * 0.45 +
      weighted("sentiment") * 0.2 +
      weighted("visibility") * 0.2 +
      weighted("confidence") * 0.15;
    return {
      name: category,
      category,
      score: Number(score.toFixed(1)),
      momentum_30d: Number(((weighted("sentiment") - 75) / 4).toFixed(1)),
      confidence: Math.round(weighted("confidence")),
      freshness_hours: Math.max(0, Math.round((now.getTime() - newest) / 3600000)),
      evidence_count: records.length,
      source_count: new Set(records.map((record) => record.source_id)).size
    };
  }).sort((left, right) => right.score - left.score);
}

export function validateCollectorEvidence(options) {
  const now = options.now || new Date();
  const inputPath = resolve(options.inputPath);
  const registryPath = resolve(options.registryPath);
  const outputPath = resolve(options.outputPath);
  const auditPath = resolve(options.auditPath);
  const inputBytes = readFileSync(inputPath);
  const report = JSON.parse(inputBytes.toString("utf8"));
  const registry = readJson(registryPath);
  const runId = randomUUID();
  try {
    if (report.mode !== "live") throw new Error("collector_not_live");
    if (!["operational", "degraded"].includes(report.status)) {
      throw new Error("collector_failed");
    }
    if (!Array.isArray(report.signals) || report.signals.length === 0) {
      throw new Error("collector_empty");
    }
    timestamp(report.collected_at, "report_collected_at", now, registry.maximum_batch_age_hours);
    const dedupe = new Set();
    let duplicateCount = 0;
    const normalized = [];
    for (const signal of report.signals) {
      const policy = sourcePolicy(registry, String(signal.source_id || ""));
      try {
        const record = normalizeSignal(signal, policy, report.collected_at, now);
        const key = `${record.source_id}:${record.external_id}:${record.brand_id}`;
        if (dedupe.has(key)) {
          duplicateCount += 1;
          continue;
        }
        dedupe.add(key);
        normalized.push(record);
      } catch (error) {
        if (error.message === "synthetic_coverage_signal") continue;
        throw error;
      }
    }
    const signals = aggregate(normalized, now);
    if (signals.length < registry.minimum_categories) throw new Error("insufficient_category_coverage");
    if (normalized.length < registry.minimum_evidence_records) throw new Error("insufficient_evidence");
    const result = {
      batch_id: `collector-${report.collected_at}`,
      generated_at: now.toISOString(),
      source_report_sha256: sha256(inputBytes),
      methodology_version: "K100-0.9",
      eligibility: "staging-research",
      signals,
      evidence_summary: {
        accepted_records: normalized.length,
        duplicate_records: duplicateCount,
        categories: signals.length,
        source_ids: [...new Set(normalized.map((record) => record.source_id))].sort()
      },
      production_promotion_authorized: false
    };
    writeAtomic(outputPath, result);
    appendAudit(auditPath, {
      run_id: runId,
      event: "collector_evidence_accepted",
      occurred_at: now.toISOString(),
      input_sha256: result.source_report_sha256,
      accepted_records: normalized.length,
      duplicates: duplicateCount,
      categories: signals.length,
      environment: "staging"
    });
    return result;
  } catch (error) {
    appendAudit(auditPath, {
      run_id: runId,
      event: "collector_evidence_rejected",
      occurred_at: now.toISOString(),
      input_sha256: sha256(inputBytes),
      reason: error.message,
      environment: "staging"
    });
    throw error;
  }
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index].replace(/^--/, "")] = argv[index + 1];
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = parseArgs(process.argv.slice(2));
  const result = validateCollectorEvidence({
    inputPath: values.input,
    registryPath: values.registry,
    outputPath: values.output,
    auditPath: values.audit
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
