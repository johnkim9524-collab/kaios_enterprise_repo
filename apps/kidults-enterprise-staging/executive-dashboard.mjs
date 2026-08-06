import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`Invalid JSON: ${path}`); }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
function freshnessLabel(timestamp, now) {
  const time = Date.parse(timestamp || "");
  if (!Number.isFinite(time)) return "No verified update";
  const hours = Math.max(0, Math.round((now.getTime() - time) / 3600000));
  if (hours < 1) return "Updated within the hour";
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

export function buildExecutiveSnapshot({ crm = {}, ai = {}, intelligence = {}, reports = {}, now = new Date() }) {
  const crmCounts = crm.counts || {};
  const aiCounts = ai.counts || {};
  const records = Array.isArray(ai.records) ? ai.records.filter((item) => !item.is_test) : [];
  const active = number(crmCounts.active);
  const highValue = number(aiCounts.high_value);
  const sent = number(aiCounts.sent);
  const approved = number(aiCounts.approved);
  const pending = number(aiCounts.pending_approval);
  const averageScore = records.length ? Math.round(records.reduce((sum, item) => sum + number(item.opportunity_score), 0) / records.length) : 0;
  const categories = records.reduce((acc, item) => {
    const key = item.category || "General";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const pipeline = records.reduce((acc, item) => {
    const key = item.approval_status || "draft";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { draft: 0, approved: 0, rejected: 0, sent: 0 });
  const latest = [crm.generated_at, ai.generated_at, intelligence.generated_at, reports.generated_at].filter(Boolean).sort().at(-1) || now.toISOString();
  const conversionRate = percent(sent, Math.max(1, records.length));
  const decisionBacklog = pending + approved;
  const executiveBrief = records.length
    ? `${records.length} actionable enterprise inquiries are in the governed pipeline. ${highValue} are high-value, the average opportunity score is ${averageScore}, and ${decisionBacklog} require an operator decision or follow-through.`
    : "No actionable enterprise inquiries are currently in the governed pipeline. Operations are ready for new provider, partnership, research and API demand.";
  const nextMove = pending > 0
    ? `Review ${pending} pending ${pending === 1 ? "inquiry" : "inquiries"} and approve, revise or reject each reply draft.`
    : approved > 0
      ? `Complete human-reviewed follow-up for ${approved} approved ${approved === 1 ? "inquiry" : "inquiries"}.`
      : "Maintain readiness and monitor the next qualified inbound signal.";

  return {
    generated_at: now.toISOString(),
    source_freshness: freshnessLabel(latest, now),
    governance: {
      environment: "staging",
      auto_send: false,
      human_approval_required: true,
      public_pii_exposure: false
    },
    kpis: {
      active_pipeline: active,
      actionable_inquiries: records.length,
      high_value: highValue,
      pending_decisions: pending,
      approved,
      sent,
      average_opportunity_score: averageScore,
      conversion_rate: conversionRate
    },
    pipeline,
    categories,
    executive_brief: executiveBrief,
    recommended_next_move: nextMove,
    intelligence: {
      index_level: number(intelligence.index_level ?? intelligence.value ?? intelligence.k100),
      report_count: number(reports.count ?? reports.total ?? (Array.isArray(reports.items) ? reports.items.length : 0)),
      coverage: number(intelligence.coverage ?? intelligence.data_coverage),
      confidence: intelligence.confidence || intelligence.status || "Governed"
    }
  };
}

function metric(label, value, suffix = "") {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong></article>`;
}
function bars(values, total) {
  return Object.entries(values).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
    const width = total ? Math.max(4, Math.round((count / total) * 100)) : 0;
    return `<div class="bar"><div><span>${escapeHtml(name)}</span><b>${count}</b></div><i><em style="width:${width}%"></em></i></div>`;
  }).join("") || '<p class="empty">No actionable records.</p>';
}
function dashboardHtml(snapshot) {
  const total = snapshot.kpis.actionable_inquiries;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIDULTS Enterprise Intelligence</title><link rel="stylesheet" href="executive-dashboard.css"></head><body><header class="top"><div><b>KIDULTS</b><span>Enterprise Intelligence</span></div><small>${escapeHtml(snapshot.source_freshness)} · Human governed</small></header><main><section class="hero"><div><p>SPRINT 25</p><h1>One executive view.<br>Every governed signal.</h1><span>Pipeline, opportunity, intelligence and operating decisions in one private command surface.</span></div><aside><p>EXECUTIVE BRIEF</p><h2>${escapeHtml(snapshot.executive_brief)}</h2><strong>${escapeHtml(snapshot.recommended_next_move)}</strong></aside></section><section class="metrics">${metric("Active pipeline", snapshot.kpis.active_pipeline)}${metric("High value", snapshot.kpis.high_value)}${metric("Pending decisions", snapshot.kpis.pending_decisions)}${metric("Average score", snapshot.kpis.average_opportunity_score)}${metric("Approved", snapshot.kpis.approved)}${metric("Sent", snapshot.kpis.sent)}${metric("Conversion", snapshot.kpis.conversion_rate, "%")}${metric("Reports", snapshot.intelligence.report_count)}</section><section class="grid"><article class="panel"><header><p>PIPELINE</p><h2>Decision state</h2></header>${bars(snapshot.pipeline, total)}</article><article class="panel"><header><p>DEMAND</p><h2>Category mix</h2></header>${bars(snapshot.categories, total)}</article><article class="panel intelligence"><header><p>INTELLIGENCE</p><h2>Governed asset posture</h2></header><dl><div><dt>K100 / Index</dt><dd>${snapshot.intelligence.index_level || "—"}</dd></div><div><dt>Data coverage</dt><dd>${snapshot.intelligence.coverage ? `${snapshot.intelligence.coverage}%` : "—"}</dd></div><div><dt>Confidence</dt><dd>${escapeHtml(snapshot.intelligence.confidence)}</dd></div><div><dt>Environment</dt><dd>Staging</dd></div></dl></article><article class="panel governance"><header><p>CONTROL</p><h2>Operating safeguards</h2></header><ul><li><span>Human approval</span><b>Required</b></li><li><span>Automatic sending</span><b>Disabled</b></li><li><span>Public PII exposure</span><b>Blocked</b></li><li><span>Executive data source</span><b>Local governed snapshots</b></li></ul></article></section><footer><a href="/operations/">Operations CRM</a><a href="/operations-ai/">AI Operations</a><span>© 2026 KIDULTS</span></footer></main></body></html>`;
}

export function runExecutiveDashboard(command = "build", env = process.env) {
  if (env.KAIOS_ENVIRONMENT !== "staging") throw new Error("KAIOS_ENVIRONMENT must be staging");
  if (env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== "false") throw new Error("Production promotion must remain false");
  if (!["build", "status"].includes(command)) throw new Error(`Unsupported executive command: ${command}`);
  const crm = readJson(resolve(env.KIDULTS_CRM_SNAPSHOT || "public/operations/data.json"), {});
  const ai = readJson(resolve(env.KIDULTS_AI_SNAPSHOT || "public/operations-ai/data.json"), {});
  const intelligence = readJson(resolve(env.KIDULTS_INTELLIGENCE_SNAPSHOT || "public/public-enterprise-preview/intelligence-data.json"), {});
  const reports = readJson(resolve(env.KIDULTS_REPORTS_SNAPSHOT || "public/public-enterprise-preview/reports/index.json"), {});
  const outputDir = resolve(env.KIDULTS_EXECUTIVE_OUTPUT_DIR || "public/executive");
  const snapshot = buildExecutiveSnapshot({ crm, ai, intelligence, reports });
  if (command === "build") {
    mkdirSync(outputDir, { recursive: true });
    writeJson(resolve(outputDir, "data.json"), snapshot);
    writeFileSync(resolve(outputDir, "index.html"), dashboardHtml(snapshot), "utf8");
  }
  console.log(JSON.stringify(snapshot.kpis));
  return snapshot;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) runExecutiveDashboard(process.argv[2] || "build");
