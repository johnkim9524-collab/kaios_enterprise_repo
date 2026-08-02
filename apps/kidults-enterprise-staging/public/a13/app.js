"use strict";

const DATA_PATHS = {
  index: "/data/kidult-100.json",
  monthly: "/data/monthly-intelligence.json",
  archive: "/data/archive.json",
  quality: "/data/quality-status.json"
};

const QUALITY_LABELS = {
  operational: "Operational",
  degraded: "Degraded",
  critical: "Critical",
  delayed: "Delayed",
  under_review: "Under review",
  insufficient_evidence: "Insufficient evidence",
  monitoring_pending: "Monitoring pending"
};

const state = { archive: [], archiveQuery: "", archiveType: "all" };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Pending publication";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Monitoring pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(date);
}

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

function renderQualityStatus(data) {
  const rawStatus = typeof data?.status === "string" ? data.status : "monitoring_pending";
  const status = Object.hasOwn(QUALITY_LABELS, rawStatus) ? rawStatus : "monitoring_pending";
  const label = QUALITY_LABELS[status];
  const metrics = data?.metrics && typeof data.metrics === "object" ? data.metrics : {};
  const scoreValue = Number(metrics.average_confidence);
  const score = Number.isFinite(scoreValue) ? `${Math.round(scoreValue)}%` : "—";
  const updated = data?.evaluated_at || data?.latest_success_at || null;

  document.querySelectorAll("[data-hero-status], [data-quality-status]").forEach((element) => {
    element.textContent = label;
    element.dataset.qualityState = status;
  });
  document.querySelectorAll("[data-hero-updated]").forEach((element) => {
    element.textContent = formatDateTime(updated);
  });
  document.querySelectorAll("[data-hero-score]").forEach((element) => {
    element.textContent = score;
  });
  document.documentElement.dataset.qualityState = status;
}

function renderIndex(data) {
  const list = document.querySelector("[data-index-list]");
  const count = document.querySelector("[data-index-count]");
  const updated = document.querySelector("[data-index-updated]");
  const method = document.querySelector("[data-index-method]");
  if (!list) return;

  const items = Array.isArray(data?.items) ? data.items : [];
  if (count) count.textContent = String(items.length);
  if (updated) updated.textContent = formatDate(data?.updated_at);
  if (method) method.textContent = data?.methodology_version || "Pending";

  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Kidult 100 is awaiting sufficient evidence.</div>';
    return;
  }

  list.innerHTML = items.slice(0, 10).map((item) => `
    <div class="ranking-row">
      <span class="ranking-position" aria-label="Rank ${item.rank}">${item.rank}</span>
      <strong>${escapeHtml(item.name)} <small>${escapeHtml(item.category)}</small></strong>
      <span class="ranking-score">${Number(item.score).toFixed(1)}</span>
      <span class="${item.momentum_30d >= 0 ? "positive" : "negative"}">${item.momentum_30d >= 0 ? "+" : ""}${Number(item.momentum_30d).toFixed(1)}%</span>
      <span class="ranking-confidence">${item.confidence}%</span>
    </div>
  `).join("");
}

function renderMonthly(data) {
  const title = document.querySelector("[data-monthly-title]");
  if (!title) return;
  title.textContent = data?.title || "Monthly Intelligence";
  const summary = document.querySelector("[data-monthly-summary]");
  const issue = document.querySelector("[data-monthly-issue]");
  if (summary) summary.textContent = data?.executive_summary || "The current brief is awaiting publication.";
  if (issue) issue.textContent = data?.issue || "Pending";
}

function absoluteReportPath(path) {
  if (!path) return "#";
  return path.startsWith("/") ? path : `/${path}`;
}

function renderArchive() {
  const container = document.querySelector("[data-archive-results]");
  const count = document.querySelector("[data-archive-count]");
  if (!container) return;

  const query = state.archiveQuery.trim().toLowerCase();
  const filtered = state.archive.filter((report) => {
    const searchable = [report.title, report.period, report.type, report.status, ...(report.tags || [])]
      .join(" ").toLowerCase();
    return (!query || searchable.includes(query)) &&
      (state.archiveType === "all" || report.type === state.archiveType);
  });

  if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? "report" : "reports"}`;
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">No reports match this search.</div>';
    return;
  }

  container.innerHTML = filtered.slice(0, 6).map((report) => `
    <article class="research-card">
      <div>
        <p class="eyebrow">${escapeHtml(report.period)} · ${escapeHtml(report.status)}</p>
        <h3>${escapeHtml(report.title)}</h3>
        <div class="tag-list">${(report.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <a class="text-link" href="${escapeHtml(absoluteReportPath(report.path))}">Read research <span aria-hidden="true">↗</span></a>
    </article>
  `).join("");
}

function setupArchiveControls() {
  const search = document.querySelector("[data-archive-search]");
  const type = document.querySelector("[data-archive-type]");
  if (!search || !type) return;
  search.addEventListener("input", (event) => { state.archiveQuery = event.target.value; renderArchive(); });
  type.addEventListener("change", (event) => { state.archiveType = event.target.value; renderArchive(); });
}

async function submitConversion(form, status, button) {
  const formData = new FormData(form);
  const submission = {
    type: form.dataset.conversionForm,
    email: String(formData.get("email") || "").trim(),
    organization: String(formData.get("organization") || "").trim(),
    interest: String(formData.get("interest") || "").trim(),
    consent: formData.get("consent") === "yes",
    consent_version: "2026-08",
    website: String(formData.get("website") || "").trim()
  };

  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  status.classList.remove("is-error");
  status.textContent = "Securely recording your request…";

  try {
    const response = await fetch("/api/conversions", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "The request could not be recorded.");
    form.reset();
    status.textContent = result.message || form.dataset.successMessage;
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = error instanceof Error ? error.message : "The service is temporarily unavailable.";
  } finally {
    button.disabled = false;
    form.removeAttribute("aria-busy");
    status.focus();
  }
}

function setupForms() {
  document.querySelectorAll("[data-conversion-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-form-status]");
      const button = form.querySelector('button[type="submit"]');
      if (!status || !button || !form.reportValidity()) return;
      await submitConversion(form, status, button);
    });
  });
}

async function initialize() {
  setupArchiveControls();
  setupForms();
  const tasks = [];
  if (document.querySelector("[data-index-list]")) tasks.push(getJson(DATA_PATHS.index).then(renderIndex));
  if (document.querySelector("[data-monthly-title]")) tasks.push(getJson(DATA_PATHS.monthly).then(renderMonthly));
  if (document.querySelector("[data-archive-results]")) {
    tasks.push(getJson(DATA_PATHS.archive).then((data) => {
      state.archive = Array.isArray(data.reports) ? data.reports : [];
      renderArchive();
    }));
  }
  if (document.querySelector("[data-hero-status], [data-quality-status]")) {
    tasks.push(getJson(DATA_PATHS.quality).then(renderQualityStatus));
  }
  const results = await Promise.allSettled(tasks);
  if (results.some((result) => result.status === "rejected")) {
    document.querySelectorAll("[data-load-state]").forEach((element) => { element.hidden = false; });
  }
}

document.addEventListener("DOMContentLoaded", initialize);
