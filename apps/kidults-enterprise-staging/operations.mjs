import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_PUBLIC_DIR = resolve(APP_DIR, "public");
const DEFAULT_DATA_DIR = "/opt/intelligence-holdings/staging/data/kidults-conversions";
const DEFAULT_OPERATIONS_DIR = "/opt/intelligence-holdings/staging/data/kidults-operations";
const RETENTION_DAYS = 365;

function ensureDir(path, mode = 0o700) {
  mkdirSync(path, { recursive: true, mode });
  chmodSync(path, mode);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSONL record at ${basename(path)}:${index + 1}`);
    }
  });
}

function writeAtomic(path, value, mode = 0o600) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { encoding: "utf8", mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

function writeJsonAtomic(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizedSignal(signal, index) {
  const result = {
    name: String(signal.name || "").trim().slice(0, 120),
    category: String(signal.category || "").trim().slice(0, 120),
    score: Number(signal.score),
    momentum_30d: Number(signal.momentum_30d),
    confidence: Number(signal.confidence),
    freshness_hours: Number(signal.freshness_hours)
  };
  if (!result.name || !result.category) throw new Error(`Signal ${index + 1} requires name and category`);
  for (const [label, minimum, maximum] of [
    ["score", 0, 100],
    ["momentum_30d", -100, 100],
    ["confidence", 0, 100],
    ["freshness_hours", 0, 720]
  ]) {
    if (!Number.isFinite(result[label]) || result[label] < minimum || result[label] > maximum) {
      throw new Error(`Signal ${index + 1} has invalid ${label}`);
    }
  }
  result.score = Number(result.score.toFixed(1));
  result.momentum_30d = Number(result.momentum_30d.toFixed(1));
  result.confidence = Math.round(result.confidence);
  result.freshness_hours = Math.round(result.freshness_hours);
  return result;
}

function rankSignals(signals) {
  return signals.map(normalizedSignal)
    .sort((left, right) => (
      right.score - left.score ||
      right.confidence - left.confidence ||
      left.name.localeCompare(right.name)
    ))
    .map((signal, index) => ({ rank: index + 1, ...signal }));
}

export function refreshIntelligence(options = {}) {
  const now = options.now || new Date();
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const operationsDir = resolve(options.operationsDir || DEFAULT_OPERATIONS_DIR);
  const sourcePath = resolve(options.sourcePath || resolve(operationsDir, "validated-signals.json"));
  const source = readJson(sourcePath);
  if (!Array.isArray(source.signals) || source.signals.length < 3) {
    throw new Error("validated-signals.json requires at least three signals");
  }
  const items = rankSignals(source.signals);
  const updatedAt = now.toISOString();
  const issue = options.issue || updatedAt.slice(0, 7);
  const dataDir = resolve(publicDir, "data");
  ensureDir(dataDir);
  ensureDir(operationsDir);
  const k100Path = resolve(dataDir, "kidult-100.json");
  const monthlyPath = resolve(dataDir, "monthly-intelligence.json");
  const archivePath = resolve(dataDir, "archive.json");
  const currentArchive = existsSync(archivePath) ? readJson(archivePath) : { reports: [] };
  const archiveId = `monthly-intelligence-${issue}`;
  const reports = Array.isArray(currentArchive.reports) ? currentArchive.reports : [];
  const nextReports = [{
    id: archiveId,
    title: `Monthly Intelligence ${issue}`,
    type: "monthly-intelligence",
    period: issue,
    status: "published",
    path: `reports/monthly-intelligence-${issue}.html`,
    tags: ["market-pulse", "categories", "liquidity"]
  }, ...reports.filter((report) => report.id !== archiveId)]
    .sort((left, right) => right.period.localeCompare(left.period));

  writeJsonAtomic(k100Path, {
    version: "1.1",
    status: "staging",
    index_name: "Kidult 100",
    methodology_version: "K100-0.9",
    updated_at: updatedAt,
    currency: "USD",
    source_mode: "validated-collector-evidence",
    source_batch_id: String(source.batch_id || "unversioned").slice(0, 120),
    items
  });
  writeJsonAtomic(monthlyPath, {
    version: "1.1",
    status: "published",
    issue,
    title: `Monthly Intelligence ${issue}`,
    subtitle: "Global Collectibles Market Signals",
    published_at: updatedAt,
    updated_at: updatedAt,
    executive_summary: `${items[0].name} leads the current validated category set with a score of ${items[0].score}.`,
    sections: [
      { id: "market-pulse", title: "Market Pulse", summary: `${items.filter((item) => item.momentum_30d > 0).length} of ${items.length} ranked categories show positive 30-day momentum.` },
      { id: "category-intelligence", title: "Category Intelligence", summary: `${items[0].name}, ${items[1].name} and ${items[2].name} lead the current ranking.` },
      { id: "liquidity", title: "Evidence Confidence", summary: `Average evidence confidence is ${Math.round(items.reduce((sum, item) => sum + item.confidence, 0) / items.length)}.` },
      { id: "risk", title: "Risk Watch", summary: "Staging intelligence requires source-rights and release-gate certification before production use." }
    ]
  });
  writeJsonAtomic(archivePath, {
    version: "1.1",
    status: "active",
    updated_at: updatedAt,
    reports: nextReports
  });
  const manifest = {
    run_id: randomUUID(),
    status: "completed",
    environment: "staging",
    source_batch_id: String(source.batch_id || "unversioned").slice(0, 120),
    source_sha256: sha256(sourcePath),
    updated_at: updatedAt,
    records: items.length,
    outputs: [k100Path, monthlyPath, archivePath].map((path) => ({ path: basename(path), sha256: sha256(path) })),
    production_promotion_authorized: false
  };
  writeJsonAtomic(resolve(operationsDir, "latest-run.json"), manifest);
  return manifest;
}

export function exportConversions(options = {}) {
  const dataDir = resolve(options.dataDir || DEFAULT_DATA_DIR);
  const outputPath = resolve(options.outputPath);
  const records = readJsonLines(resolve(dataDir, "conversion-submissions.jsonl"));
  const header = ["id", "type", "email", "organization", "interest", "consent_version", "created_at", "environment"];
  const rows = records.map((record) => header.map((key) => csvCell(record[key])).join(","));
  ensureDir(dirname(outputPath));
  writeAtomic(outputPath, `${header.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`);
  return { output_path: outputPath, records: records.length };
}

export function enforceRetention(options = {}) {
  const now = options.now || new Date();
  const retentionDays = options.retentionDays || RETENTION_DAYS;
  const dataDir = resolve(options.dataDir || DEFAULT_DATA_DIR);
  const path = resolve(dataDir, "conversion-submissions.jsonl");
  const records = readJsonLines(path);
  const cutoff = now.getTime() - retentionDays * 86400000;
  const retained = records.filter((record) => new Date(record.created_at).getTime() >= cutoff);
  if (records.length !== retained.length) {
    writeAtomic(path, retained.map((record) => JSON.stringify(record)).join("\n") + (retained.length ? "\n" : ""));
  }
  return { removed: records.length - retained.length, retained: retained.length, retention_days: retentionDays };
}

export function backupOperations(options = {}) {
  const now = options.now || new Date();
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const dataDir = resolve(options.dataDir || DEFAULT_DATA_DIR);
  const target = resolve(options.backupRoot, now.toISOString().replaceAll(":", "").replaceAll(".", "-"));
  ensureDir(target);
  const candidates = [
    resolve(publicDir, "data/kidult-100.json"),
    resolve(publicDir, "data/monthly-intelligence.json"),
    resolve(publicDir, "data/archive.json"),
    resolve(dataDir, "conversion-submissions.jsonl"),
    resolve(dataDir, "conversion-audit.jsonl")
  ].filter(existsSync);
  const files = candidates.map((source) => {
    const targetPath = resolve(target, basename(source));
    copyFileSync(source, targetPath);
    chmodSync(targetPath, 0o600);
    return { name: basename(source), bytes: statSync(targetPath).size, sha256: sha256(targetPath) };
  });
  writeJsonAtomic(resolve(target, "manifest.json"), {
    created_at: now.toISOString(),
    environment: "staging",
    files,
    production_promotion_authorized: false
  });
  return { backup_path: target, files: files.length };
}

export function verifyBackup(path) {
  const backupPath = resolve(path);
  const manifest = readJson(resolve(backupPath, "manifest.json"));
  const failures = manifest.files.filter((file) => (
    !existsSync(resolve(backupPath, file.name)) ||
    sha256(resolve(backupPath, file.name)) !== file.sha256
  ));
  return { ok: failures.length === 0, files: manifest.files.length, failures: failures.map((file) => file.name) };
}

export function operationsStatus(options = {}) {
  const operationsDir = resolve(options.operationsDir || DEFAULT_OPERATIONS_DIR);
  const dataDir = resolve(options.dataDir || DEFAULT_DATA_DIR);
  const latestRunPath = resolve(operationsDir, "latest-run.json");
  const submissions = readJsonLines(resolve(dataDir, "conversion-submissions.jsonl"));
  return {
    environment: "staging",
    latest_run: existsSync(latestRunPath) ? readJson(latestRunPath) : null,
    conversion_counts: submissions.reduce((counts, record) => {
      counts[record.type] = (counts[record.type] || 0) + 1;
      return counts;
    }, {}),
    production_promotion_authorized: false
  };
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) values[tokens[index].replace(/^--/, "")] = tokens[index + 1];
  return { command, values };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { command, values } = parseArgs(process.argv.slice(2));
  const common = { publicDir: values.public, dataDir: values.data, operationsDir: values.operations };
  let result;
  if (command === "refresh") result = refreshIntelligence({ ...common, sourcePath: values.source, issue: values.issue });
  else if (command === "status") result = operationsStatus(common);
  else if (command === "export-conversions") result = exportConversions({ ...common, outputPath: values.output });
  else if (command === "enforce-retention") result = enforceRetention({ ...common, retentionDays: Number(values.days || RETENTION_DAYS) });
  else if (command === "backup") result = backupOperations({ ...common, backupRoot: values.output });
  else if (command === "verify-backup") result = verifyBackup(values.path);
  else throw new Error("Command must be refresh, status, export-conversions, enforce-retention, backup, or verify-backup");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
