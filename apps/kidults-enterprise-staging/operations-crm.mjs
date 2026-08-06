import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
      try { return JSON.parse(line); }
      catch { throw new Error(`Invalid JSONL at ${path}:${index + 1}`); }
    });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`Invalid JSON: ${path}`); }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isTestSubmission(submission) {
  const text = `${submission.email_fingerprint || ""} ${submission.interest || ""}`.toLowerCase();
  return /manual-sprint\d+-test|notification delivery test|\btest submission\b/.test(text);
}

function classify(submission) {
  if (isTestSubmission(submission)) return "Test";
  const text = `${submission.type || ""} ${submission.interest || ""} ${submission.organization || ""}`.toLowerCase();
  if (/provider|data partner|supplier/.test(text)) return "Provider";
  if (/press|media|journal|editor/.test(text)) return "Media";
  if (/invest|capital|fund/.test(text)) return "Investor";
  if (/api|integration|developer/.test(text)) return "API";
  if (/research|report|methodology/.test(text)) return "Research";
  if (/newsletter|subscribe/.test(text)) return "Newsletter";
  if (/partner|collaborat|enterprise/.test(text)) return "Partnership";
  return "General";
}

function priorityFor(submission, category) {
  if (category === "Test") return "normal";
  const text = `${submission.interest || ""} ${submission.organization || ""}`.toLowerCase();
  if (/urgent|immediate|contract|pilot|license|licence/.test(text)) return "high";
  if (["Provider", "Investor", "API", "Partnership"].includes(category)) return "medium";
  return "normal";
}

function normalizeState(state) {
  return {
    records: state?.records && typeof state.records === "object" ? state.records : {}
  };
}

export function buildCrmSnapshot({ submissions, state, now = new Date() }) {
  const safeState = normalizeState(state);
  const records = submissions
    .filter((item) => item?.id)
    .map((submission) => {
      const saved = safeState.records[submission.id] || {};
      const category = saved.category || classify(submission);
      const testRecord = isTestSubmission(submission);
      return {
        id: submission.id,
        type: submission.type || "unknown",
        email: submission.email || "",
        organization: submission.organization || "",
        interest: submission.interest || "",
        created_at: submission.created_at || null,
        environment: submission.environment || "staging",
        category,
        priority: saved.priority || priorityFor(submission, category),
        status: saved.status || (testRecord ? "archived" : "unread"),
        is_test: testRecord,
        notes: saved.notes || "",
        updated_at: saved.updated_at || submission.created_at || null
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const active = records.filter((item) => item.status !== "archived");
  const today = now.toISOString().slice(0, 10);
  const counts = {
    total: records.length,
    active: active.length,
    unread: active.filter((item) => item.status === "unread").length,
    read: active.filter((item) => item.status === "read").length,
    archived: records.filter((item) => item.status === "archived").length,
    today: active.filter((item) => String(item.created_at || "").startsWith(today)).length
  };

  const categories = {};
  for (const item of active) categories[item.category] = (categories[item.category] || 0) + 1;
  return { generated_at: now.toISOString(), counts, categories, records };
}

export function updateCrmRecord(state, id, patch, now = new Date()) {
  const safe = normalizeState(state);
  const existing = safe.records[id] || {};
  const allowed = {};
  if (["unread", "read", "archived"].includes(patch.status)) allowed.status = patch.status;
  if (["high", "medium", "normal"].includes(patch.priority)) allowed.priority = patch.priority;
  if (typeof patch.category === "string" && patch.category.trim()) allowed.category = patch.category.trim().slice(0, 80);
  if (typeof patch.notes === "string") allowed.notes = patch.notes.trim().slice(0, 1000);
  safe.records[id] = { ...existing, ...allowed, updated_at: now.toISOString() };
  return safe;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function maskEmail(email) {
  const value = String(email || "");
  const at = value.indexOf("@");
  if (at <= 0) return "Private contact";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function dashboardHtml(snapshot) {
  const rows = snapshot.records.map((item) => {
    const maskedEmail = maskEmail(item.email);
    const testBadge = item.is_test ? '<span class="priority normal">TEST</span>' : "";
    return `<tr data-status="${escapeHtml(item.status)}" data-category="${escapeHtml(item.category)}"><td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td><b>${escapeHtml(item.category)}</b><small>${escapeHtml(item.type)}</small>${testBadge}</td><td><b>${escapeHtml(item.organization || "Independent")}</b><small>${escapeHtml(maskedEmail)}</small><a href="mailto:${escapeHtml(item.email)}" aria-label="Reply to ${escapeHtml(maskedEmail)}">Reply</a></td><td>${escapeHtml(item.interest || "—")}</td><td><span class="priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span></td><td>${escapeHtml(item.created_at || "—")}</td></tr>`;
  }).join("");
  const categoryCards = Object.entries(snapshot.categories).map(([name, count]) => `<div><span>${escapeHtml(name)}</span><strong>${count}</strong></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIDULTS Operations CRM</title><link rel="stylesheet" href="operations.css"></head><body><header><div><span>KIDULTS</span><small>Enterprise Operations</small></div><p>Generated ${escapeHtml(snapshot.generated_at)}</p></header><main><section class="hero"><div><p class="eyebrow">SPRINT 23</p><h1>Operations CRM</h1><p>Contact, newsletter and inquiry activity in one governed local dashboard.</p></div><div class="metrics"><article><span>Today</span><strong>${snapshot.counts.today}</strong></article><article><span>Unread</span><strong>${snapshot.counts.unread}</strong></article><article><span>Active</span><strong>${snapshot.counts.active}</strong></article><article><span>Archived</span><strong>${snapshot.counts.archived}</strong></article></div></section><section class="categories">${categoryCards || "<p>No active records.</p>"}</section><section class="table-wrap"><div class="toolbar"><input id="search" type="search" placeholder="Search organization or interest"><select id="status"><option value="">All statuses</option><option>unread</option><option>read</option><option>archived</option></select><select id="category"><option value="">All categories</option>${Object.keys(snapshot.categories).map((name) => `<option>${escapeHtml(name)}</option>`).join("")}</select></div><table><thead><tr><th>Status</th><th>Category</th><th>Contact</th><th>Interest</th><th>Priority</th><th>Received</th></tr></thead><tbody id="rows">${rows || "<tr><td colspan=6>No submissions yet.</td></tr>"}</tbody></table></section></main><script>const q=document.querySelector('#search'),s=document.querySelector('#status'),c=document.querySelector('#category');function filter(){for(const row of document.querySelectorAll('#rows tr')){const text=row.textContent.toLowerCase();row.hidden=!(text.includes(q.value.toLowerCase())&&(!s.value||row.dataset.status===s.value)&&(!c.value||row.dataset.category===c.value));}}q.addEventListener('input',filter);s.addEventListener('change',filter);c.addEventListener('change',filter);</script></body></html>`;
}

export function runCrmCommand(command, env = process.env, args = process.argv.slice(3)) {
  if (env.KAIOS_ENVIRONMENT !== "staging") throw new Error("KAIOS_ENVIRONMENT must be staging");
  if (env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== "false") throw new Error("Production promotion must remain false");
  const dataDir = resolve(required(env.KIDULTS_CONVERSION_DATA_DIR, "KIDULTS_CONVERSION_DATA_DIR"));
  const submissionsPath = resolve(dataDir, "conversion-submissions.jsonl");
  const statePath = resolve(dataDir, "crm-state.json");
  const outputDir = resolve(env.KIDULTS_CRM_OUTPUT_DIR || "public/operations");
  const submissions = readJsonLines(submissionsPath);
  let state = normalizeState(readJson(statePath, { records: {} }));

  if (command === "mark-read" || command === "archive" || command === "reopen") {
    const id = required(args[0], "submission id");
    const status = command === "mark-read" ? "read" : command === "archive" ? "archived" : "unread";
    state = updateCrmRecord(state, id, { status });
    writeJson(statePath, state);
  } else if (command === "set") {
    const id = required(args[0], "submission id");
    const field = required(args[1], "field");
    const value = required(args.slice(2).join(" "), "value");
    state = updateCrmRecord(state, id, { [field]: value });
    writeJson(statePath, state);
  } else if (!["build", "status"].includes(command)) {
    throw new Error(`Unsupported CRM command: ${command}`);
  }

  const snapshot = buildCrmSnapshot({ submissions, state });
  if (command !== "status") {
    mkdirSync(outputDir, { recursive: true });
    writeJson(resolve(outputDir, "data.json"), snapshot);
    writeFileSync(resolve(outputDir, "index.html"), dashboardHtml(snapshot), "utf8");
  }
  console.log(JSON.stringify(snapshot.counts));
  return snapshot;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCrmCommand(process.argv[2] || "build");
}
