import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_AUDIT_RETENTION_DAYS = 90;

function parseJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`AUDIT_RETENTION_INVALID_JSON:${index + 1}`);
    }
    const timestamp = new Date(record.occurred_at).getTime();
    if (!Number.isFinite(timestamp)) throw new Error(`AUDIT_RETENTION_INVALID_OCCURRED_AT:${index + 1}`);
    return { record, timestamp };
  });
}

function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function enforceStagingAuditRetention(options = {}) {
  const path = resolve(options.path);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const retentionDays = Number(options.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error("AUDIT_RETENTION_DAYS_OUT_OF_RANGE");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("AUDIT_RETENTION_INVALID_NOW");

  const parsed = parseJsonLines(path);
  const cutoffMs = now.getTime() - retentionDays * 86400000;
  const retained = parsed.filter(({ timestamp }) => timestamp >= cutoffMs).map(({ record }) => record);
  if (parsed.length !== retained.length) {
    atomicWrite(path, retained.map((record) => JSON.stringify(record)).join("\n") + (retained.length ? "\n" : ""));
  } else if (existsSync(path)) {
    chmodSync(path, 0o600);
  }

  return {
    policy_id: "KIDULTS_STAGING_OPERATIONAL_AUDIT_RETENTION_V1",
    environment: "staging",
    retention_days: retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    records_before: parsed.length,
    removed: parsed.length - retained.length,
    retained: retained.length,
    fail_closed_on_malformed_record: true,
    production_authorized: false
  };
}

function argValue(tokens, name) {
  const index = tokens.indexOf(name);
  return index >= 0 ? tokens[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tokens = process.argv.slice(2);
  const path = argValue(tokens, "--path");
  if (!path) throw new Error("--path is required");
  const days = argValue(tokens, "--days");
  const now = argValue(tokens, "--now");
  const result = enforceStagingAuditRetention({
    path,
    retentionDays: days === undefined ? DEFAULT_AUDIT_RETENTION_DAYS : Number(days),
    now: now ? new Date(now) : new Date()
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
