import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { notifierFromEnvironment } from "./notification.mjs";

const DEFAULT_INTERVAL_MS = 30000;

function required(value, name) {
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}`);
      }
    });
}

function readState(path) {
  if (!existsSync(path)) return { delivered_ids: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      delivered_ids: Array.isArray(parsed.delivered_ids) ? parsed.delivered_ids : []
    };
  } catch {
    throw new Error(`Invalid notification state: ${path}`);
  }
}

function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function appendAudit(path, event) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function dispatchPendingNotifications(options) {
  const submissionsPath = resolve(required(options.submissionsPath, "submissionsPath"));
  const statePath = resolve(required(options.statePath, "statePath"));
  const auditPath = resolve(required(options.auditPath, "auditPath"));
  const notify = required(options.notify, "notify");
  const now = options.now || (() => new Date());
  const state = readState(statePath);
  const delivered = new Set(state.delivered_ids);
  const submissions = readJsonLines(submissionsPath);
  const pending = submissions.filter((submission) => submission?.id && !delivered.has(submission.id));
  const results = [];

  for (const submission of pending) {
    try {
      const result = await notify(submission);
      delivered.add(submission.id);
      results.push({ id: submission.id, ok: true, result });
      appendAudit(auditPath, {
        event: "conversion_notification_delivered",
        occurred_at: now().toISOString(),
        submission_id: submission.id,
        type: submission.type,
        channel: result?.channel || "unknown"
      });
      writeState(statePath, { delivered_ids: [...delivered] });
    } catch (error) {
      results.push({ id: submission.id, ok: false, error: error.message });
      appendAudit(auditPath, {
        event: "conversion_notification_failed",
        occurred_at: now().toISOString(),
        submission_id: submission.id,
        type: submission.type,
        reason: String(error.message || error).slice(0, 500)
      });
    }
  }

  return {
    checked: submissions.length,
    pending: pending.length,
    delivered: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

function configurationFromEnvironment(env = process.env) {
  const dataDir = resolve(required(env.KIDULTS_CONVERSION_DATA_DIR, "KIDULTS_CONVERSION_DATA_DIR"));
  return {
    submissionsPath: resolve(dataDir, "conversion-submissions.jsonl"),
    statePath: resolve(dataDir, "notification-state.json"),
    auditPath: resolve(dataDir, "conversion-audit.jsonl"),
    notify: required(notifierFromEnvironment(env), "KIDULTS_NOTIFICATION_ENABLED=true")
  };
}

async function runOnce(config) {
  const result = await dispatchPendingNotifications(config);
  console.log(JSON.stringify(result));
  if (result.failed > 0) process.exitCode = 1;
}

async function runWatch(config, intervalMs) {
  console.log(`Kidults notification dispatcher watching every ${intervalMs}ms`);
  while (true) {
    try {
      await runOnce(config);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  if (process.env.KAIOS_ENVIRONMENT !== "staging") {
    throw new Error("KAIOS_ENVIRONMENT must be staging");
  }
  if (process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== "false") {
    throw new Error("Production promotion must remain false");
  }
  const config = configurationFromEnvironment();
  const command = process.argv[2] || "once";
  if (command === "once") {
    await runOnce(config);
  } else if (command === "watch") {
    await runWatch(config, Number(process.env.KIDULTS_NOTIFICATION_INTERVAL_MS || DEFAULT_INTERVAL_MS));
  } else {
    throw new Error(`Unsupported command: ${command}`);
  }
}
