import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_PUBLIC_DIR = resolve(APP_DIR, "public");
const DEFAULT_OPERATIONS_DIR = "/opt/intelligence-holdings/staging/data/kidults-operations";
const DEFAULT_POLICY_PATH = resolve(APP_DIR, "operations/quality-policy.staging.json");

function ensureDir(path, mode = 0o700) {
  mkdirSync(path, { recursive: true, mode });
  chmodSync(path, mode);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value, mode = 0o600) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hoursSince(value, now) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 3600000) : Infinity;
}

function alert(code, severity, message, actual, threshold) {
  return { code, severity, message, actual, threshold };
}

function summarizeSignals(evidence) {
  const signals = Array.isArray(evidence.signals) ? evidence.signals : [];
  const categories = new Set(signals.map((item) => String(item.category || "").trim()).filter(Boolean));
  const confidences = signals.map((item) => finite(item.confidence, NaN)).filter(Number.isFinite);
  const freshness = signals.map((item) => finite(item.freshness_hours, NaN)).filter(Number.isFinite);
  return {
    records: signals.length,
    categories: categories.size,
    average_confidence: confidences.length
      ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(1))
      : 0,
    maximum_freshness_hours: freshness.length ? Math.max(...freshness) : Infinity,
    sources: new Set(
      Array.isArray(evidence.evidence_summary?.source_ids)
        ? evidence.evidence_summary.source_ids
        : []
    ).size
  };
}

function verifyOutputs(latestRun, publicDir) {
  const outputs = Array.isArray(latestRun.outputs) ? latestRun.outputs : [];
  const failures = [];
  for (const output of outputs) {
    const safeName = basename(String(output.path || ""));
    const path = resolve(publicDir, "data", safeName);
    if (!safeName || !existsSync(path)) {
      failures.push({ path: safeName || "unknown", reason: "missing" });
    } else if (sha256(path) !== output.sha256) {
      failures.push({ path: safeName, reason: "sha256_mismatch" });
    }
  }
  return { checked: outputs.length, failures };
}

function highestSeverity(alerts) {
  if (alerts.some((item) => item.severity === "critical")) return "critical";
  if (alerts.length) return "degraded";
  return "operational";
}

function publicStatus(status) {
  return {
    version: status.version,
    environment: "staging",
    status: status.status,
    evaluated_at: status.evaluated_at,
    latest_success_at: status.latest_success_at,
    metrics: status.metrics,
    alerts: status.alerts.map(({ code, severity, message }) => ({ code, severity, message })),
    production_promotion_authorized: false
  };
}

function appendTransition(path, previous, current) {
  if (previous?.status === current.status &&
      JSON.stringify(previous?.alerts?.map((item) => item.code) || []) ===
      JSON.stringify(current.alerts.map((item) => item.code))) return false;
  appendFileSync(path, `${JSON.stringify({
    event_id: randomUUID(),
    occurred_at: current.evaluated_at,
    environment: "staging",
    previous_status: previous?.status || "unknown",
    status: current.status,
    alert_codes: current.alerts.map((item) => item.code),
    production_promotion_authorized: false
  })}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return true;
}

export function evaluateQuality(options = {}) {
  const now = options.now || new Date();
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const operationsDir = resolve(options.operationsDir || DEFAULT_OPERATIONS_DIR);
  const policy = readJson(resolve(options.policyPath || DEFAULT_POLICY_PATH));
  const latestRunPath = resolve(operationsDir, "latest-run.json");
  const evidencePath = resolve(operationsDir, "validated-signals.json");
  if (!existsSync(latestRunPath) || !existsSync(evidencePath)) {
    throw new Error("Quality evaluation requires latest-run.json and validated-signals.json");
  }
  ensureDir(operationsDir);
  ensureDir(resolve(publicDir, "data"));
  const latestRun = readJson(latestRunPath);
  const evidence = readJson(evidencePath);
  const summary = summarizeSignals(evidence);
  const outputIntegrity = verifyOutputs(latestRun, publicDir);
  const runAge = Number(hoursSince(latestRun.updated_at, now).toFixed(1));
  const alerts = [];

  if (latestRun.status !== "completed") alerts.push(alert("RUN_INCOMPLETE", "critical", "Latest intelligence refresh did not complete.", latestRun.status, "completed"));
  if (runAge > policy.maximum_run_age_hours) alerts.push(alert("RUN_STALE", "critical", "Latest intelligence refresh is outside the freshness window.", runAge, policy.maximum_run_age_hours));
  if (summary.records < policy.minimum_records) alerts.push(alert("RECORD_COVERAGE_LOW", "critical", "Validated record coverage is below the operating floor.", summary.records, policy.minimum_records));
  if (summary.categories < policy.minimum_categories) alerts.push(alert("CATEGORY_COVERAGE_LOW", "degraded", "Category coverage is below the operating floor.", summary.categories, policy.minimum_categories));
  if (summary.sources < policy.minimum_sources) alerts.push(alert("SOURCE_COVERAGE_LOW", "degraded", "Approved source coverage is below the operating floor.", summary.sources, policy.minimum_sources));
  if (summary.average_confidence < policy.minimum_average_confidence) alerts.push(alert("CONFIDENCE_LOW", "degraded", "Average evidence confidence is below the operating floor.", summary.average_confidence, policy.minimum_average_confidence));
  if (summary.maximum_freshness_hours > policy.maximum_signal_freshness_hours) alerts.push(alert("SIGNAL_STALE", "degraded", "One or more signals exceed the freshness ceiling.", summary.maximum_freshness_hours, policy.maximum_signal_freshness_hours));
  if (outputIntegrity.checked < 3 || outputIntegrity.failures.length) alerts.push(alert("OUTPUT_INTEGRITY_FAILED", "critical", "Published staging output integrity could not be verified.", outputIntegrity.failures.length, 0));

  const previousPath = resolve(operationsDir, "latest-quality.json");
  const previous = existsSync(previousPath) ? readJson(previousPath) : null;
  const status = {
    version: "1.0",
    environment: "staging",
    status: highestSeverity(alerts),
    evaluated_at: now.toISOString(),
    latest_success_at: latestRun.updated_at || null,
    run_id: latestRun.run_id || null,
    policy_version: policy.version,
    metrics: {
      run_age_hours: runAge,
      records: summary.records,
      categories: summary.categories,
      sources: summary.sources,
      average_confidence: summary.average_confidence,
      maximum_freshness_hours: Number.isFinite(summary.maximum_freshness_hours)
        ? summary.maximum_freshness_hours
        : null,
      verified_outputs: outputIntegrity.checked - outputIntegrity.failures.length
    },
    alerts,
    production_promotion_authorized: false
  };

  writeJsonAtomic(previousPath, status);
  writeJsonAtomic(resolve(publicDir, "data/quality-status.json"), publicStatus(status), 0o644);
  appendTransition(resolve(operationsDir, "quality-alerts.jsonl"), previous, status);
  if (status.status === "operational") {
    writeJsonAtomic(resolve(operationsDir, "last-good-quality.json"), status);
    copyFileSync(resolve(publicDir, "data/quality-status.json"), resolve(operationsDir, "last-good-public-quality.json"));
    chmodSync(resolve(operationsDir, "last-good-public-quality.json"), 0o600);
  }
  return status;
}

export function restoreLastGood(options = {}) {
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const operationsDir = resolve(options.operationsDir || DEFAULT_OPERATIONS_DIR);
  const source = resolve(operationsDir, "last-good-public-quality.json");
  if (!existsSync(source)) throw new Error("No last-good public quality status is available");
  ensureDir(resolve(publicDir, "data"));
  copyFileSync(source, resolve(publicDir, "data/quality-status.json"));
  chmodSync(resolve(publicDir, "data/quality-status.json"), 0o644);
  return { restored: true, environment: "staging", production_promotion_authorized: false };
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) values[tokens[index].replace(/^--/, "")] = tokens[index + 1];
  return { command, values };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { command, values } = parseArgs(process.argv.slice(2));
  const options = {
    publicDir: values.public,
    operationsDir: values.operations,
    policyPath: values.policy
  };
  const result = command === "evaluate"
    ? evaluateQuality(options)
    : command === "restore-last-good"
      ? restoreLastGood(options)
      : (() => { throw new Error("Usage: node quality-alerts.mjs <evaluate|restore-last-good> [--public PATH --operations PATH --policy PATH]"); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
