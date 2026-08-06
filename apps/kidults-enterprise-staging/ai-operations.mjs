import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CATEGORIES = ["Provider", "Partnership", "Media", "Investor", "API", "Research", "Newsletter", "General", "Test"];
const PRIORITIES = ["low", "normal", "high", "critical"];
const APPROVALS = ["draft", "approved", "rejected", "sent"];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function sentence(value, max = 180) {
  const text = cleanText(value);
  if (!text) return "No detailed inquiry was provided.";
  const first = text.split(/(?<=[.!?])\s+/)[0] || text;
  return first.length > max ? `${first.slice(0, max - 1).trim()}…` : first;
}
function detectCategory(record) {
  if (record.is_test) return "Test";
  const text = `${record.type || ""} ${record.category || ""} ${record.organization || ""} ${record.interest || ""}`.toLowerCase();
  if (/provider|supplier|data partner|catalog|feed/.test(text)) return "Provider";
  if (/press|media|journal|editor|interview/.test(text)) return "Media";
  if (/invest|capital|fund|shareholder/.test(text)) return "Investor";
  if (/api|integration|developer|webhook/.test(text)) return "API";
  if (/research|report|methodology|academic/.test(text)) return "Research";
  if (/newsletter|subscribe/.test(text)) return "Newsletter";
  if (/partner|collaborat|enterprise|pilot|license|licence/.test(text)) return "Partnership";
  return CATEGORIES.includes(record.category) ? record.category : "General";
}
function scoreRecord(record, category) {
  const text = `${record.organization || ""} ${record.interest || ""}`.toLowerCase();
  let score = 35;
  if (record.organization) score += 8;
  if (["Provider", "Partnership", "Investor", "API"].includes(category)) score += 15;
  if (/pilot|contract|license|licence|integration|enterprise/.test(text)) score += 18;
  if (/urgent|immediate|this week|deadline/.test(text)) score += 12;
  if (/global|international|portfolio|dataset|exclusive/.test(text)) score += 7;
  if (record.is_test) score = 0;
  return Math.max(0, Math.min(100, score));
}
function priorityFromScore(score) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "normal";
  return "low";
}
function nextAction(category, priority) {
  if (category === "Test") return "No action — archived test record.";
  const timing = priority === "critical" ? "within 2 hours" : priority === "high" ? "within 1 business day" : "within 2 business days";
  const action = {
    Provider: "Review data scope, provenance and pilot fit",
    Partnership: "Qualify strategic fit and propose a discovery call",
    Media: "Verify outlet and prepare approved media response",
    Investor: "Route to corporate strategy and verify identity",
    API: "Confirm use case, volume and security requirements",
    Research: "Review methodology request and evidence needs",
    Newsletter: "Confirm consent and subscription status",
    General: "Clarify objective and route to the correct owner"
  }[category] || "Review and route";
  return `${action} ${timing}.`;
}
function replyDraft(record, category) {
  const name = cleanText(record.organization) || "there";
  const topic = sentence(record.interest, 140);
  return `Hello ${name},\n\nThank you for contacting KIDULTS. We have received your ${category.toLowerCase()} inquiry regarding: ${topic}\n\nOur team is reviewing the request and will follow up with the appropriate next step. Where helpful, please share any relevant timeline, scope, data requirements or proposed collaboration structure.\n\nKind regards,\nKidults Partnerships\nGlobal Collectibles Intelligence Platform`;
}

export function enrichRecord(record, saved = {}) {
  const category = saved.category || detectCategory(record);
  const opportunity_score = Number.isFinite(saved.opportunity_score) ? saved.opportunity_score : scoreRecord(record, category);
  const priority = saved.priority || priorityFromScore(opportunity_score);
  return {
    ...record,
    category,
    opportunity_score,
    priority: PRIORITIES.includes(priority) ? priority : "normal",
    executive_summary: saved.executive_summary || sentence(record.interest),
    next_action: saved.next_action || nextAction(category, priority),
    reply_draft: saved.reply_draft || replyDraft(record, category),
    approval_status: APPROVALS.includes(saved.approval_status) ? saved.approval_status : "draft",
    ai_mode: "governed-rules-v1",
    human_approval_required: true
  };
}

export function buildAiOperationsSnapshot({ crmSnapshot, state = {}, now = new Date() }) {
  const saved = state.records || {};
  const records = (crmSnapshot.records || []).map((record) => enrichRecord(record, saved[record.id] || {}));
  return {
    generated_at: now.toISOString(),
    governance: { auto_send: false, human_approval_required: true, pii_masking: true, engine: "governed-rules-v1" },
    counts: {
      total: records.length,
      pending_approval: records.filter((r) => r.approval_status === "draft" && !r.is_test).length,
      high_value: records.filter((r) => r.opportunity_score >= 65 && !r.is_test).length,
      approved: records.filter((r) => r.approval_status === "approved").length,
      sent: records.filter((r) => r.approval_status === "sent").length
    },
    records
  };
}

export function updateAiRecord(state, id, patch, now = new Date()) {
  const safe = { records: { ...(state.records || {}) }, audit: [...(state.audit || [])] };
  const current = safe.records[id] || {};
  const allowed = {};
  if (APPROVALS.includes(patch.approval_status)) allowed.approval_status = patch.approval_status;
  if (typeof patch.reply_draft === "string") allowed.reply_draft = patch.reply_draft.trim().slice(0, 8000);
  if (typeof patch.executive_summary === "string") allowed.executive_summary = patch.executive_summary.trim().slice(0, 1000);
  if (typeof patch.next_action === "string") allowed.next_action = patch.next_action.trim().slice(0, 1000);
  if (CATEGORIES.includes(patch.category)) allowed.category = patch.category;
  if (PRIORITIES.includes(patch.priority)) allowed.priority = patch.priority;
  safe.records[id] = { ...current, ...allowed, updated_at: now.toISOString() };
  safe.audit.push({ id, action: Object.keys(allowed).join(",") || "no-op", at: now.toISOString(), actor: "human-operator" });
  return safe;
}

function dashboardHtml(snapshot) {
  const cards = snapshot.records.map((r) => `<article class="case" data-status="${escapeHtml(r.approval_status)}"><header><div><span class="status ${escapeHtml(r.approval_status)}">${escapeHtml(r.approval_status)}</span><span class="category">${escapeHtml(r.category)}</span></div><strong>${r.opportunity_score}</strong></header><h2>${escapeHtml(r.organization || "Independent inquiry")}</h2><p class="contact">Private contact protected</p><section><h3>Executive Summary</h3><p>${escapeHtml(r.executive_summary)}</p></section><section><h3>Recommended Action</h3><p>${escapeHtml(r.next_action)}</p></section><section><h3>Reply Draft</h3><pre>${escapeHtml(r.reply_draft)}</pre></section><footer><span>${escapeHtml(r.priority)} priority</span><a href="mailto:${escapeHtml(r.email)}?subject=${encodeURIComponent("Re: KIDULTS inquiry")}&body=${encodeURIComponent(r.reply_draft)}">Open Reply Draft</a></footer></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIDULTS AI Operations</title><link rel="stylesheet" href="ai-operations.css"></head><body><header class="top"><div><b>KIDULTS</b><span>AI-Assisted Operations</span></div><small>Human approval required · Auto-send disabled</small></header><main><section class="hero"><div><p>SPRINT 24</p><h1>Decision-ready<br>inquiry operations.</h1><span>Every inquiry is summarized, scored and prepared for human review.</span></div><div class="metrics"><article><span>Pending</span><strong>${snapshot.counts.pending_approval}</strong></article><article><span>High Value</span><strong>${snapshot.counts.high_value}</strong></article><article><span>Approved</span><strong>${snapshot.counts.approved}</strong></article><article><span>Sent</span><strong>${snapshot.counts.sent}</strong></article></div></section><section class="toolbar"><input id="search" type="search" placeholder="Search organization, category or summary"><select id="status"><option value="">All approval states</option><option>draft</option><option>approved</option><option>rejected</option><option>sent</option></select></section><section id="cases" class="cases">${cards || "<p>No inquiries available.</p>"}</section></main><script>const q=document.querySelector('#search'),s=document.querySelector('#status');function filter(){for(const c of document.querySelectorAll('.case')){c.hidden=!(c.textContent.toLowerCase().includes(q.value.toLowerCase())&&(!s.value||c.dataset.status===s.value));}}q.addEventListener('input',filter);s.addEventListener('change',filter);</script></body></html>`;
}

export function runAiOperations(command, env = process.env, args = process.argv.slice(3)) {
  if (env.KAIOS_ENVIRONMENT !== "staging") throw new Error("KAIOS_ENVIRONMENT must be staging");
  if (env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== "false") throw new Error("Production promotion must remain false");
  const crmPath = resolve(env.KIDULTS_CRM_SNAPSHOT || "public/operations/data.json");
  const statePath = resolve(env.KIDULTS_AI_OPERATIONS_STATE || ".local-data/ai-operations-state.json");
  const outputDir = resolve(env.KIDULTS_AI_OPERATIONS_OUTPUT_DIR || "public/operations-ai");
  const crmSnapshot = readJson(crmPath, { records: [] });
  let state = readJson(statePath, { records: {}, audit: [] });
  if (["approve", "reject", "sent", "draft"].includes(command)) {
    const id = args[0];
    if (!id) throw new Error("submission id is required");
    const approval_status = command === "approve" ? "approved" : command === "reject" ? "rejected" : command;
    state = updateAiRecord(state, id, { approval_status });
    writeJson(statePath, state);
  } else if (command === "set-draft") {
    const [id, ...parts] = args;
    if (!id || !parts.length) throw new Error("submission id and reply draft are required");
    state = updateAiRecord(state, id, { reply_draft: parts.join(" ") });
    writeJson(statePath, state);
  } else if (!["build", "status"].includes(command)) {
    throw new Error(`Unsupported AI operations command: ${command}`);
  }
  const snapshot = buildAiOperationsSnapshot({ crmSnapshot, state });
  if (command !== "status") {
    mkdirSync(outputDir, { recursive: true });
    writeJson(resolve(outputDir, "data.json"), snapshot);
    writeFileSync(resolve(outputDir, "index.html"), dashboardHtml(snapshot), "utf8");
  }
  console.log(JSON.stringify(snapshot.counts));
  return snapshot;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) runAiOperations(process.argv[2] || "build");
