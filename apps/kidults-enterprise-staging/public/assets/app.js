"use strict";

const DATA_PATHS = {
  index: "data/kidult-100.json",
  monthly: "data/monthly-intelligence.json",
  archive: "data/archive.json"
};

const state = {
  archive: [],
  archiveQuery: "",
  archiveType: "all"
};

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

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

function renderIndex(data) {
  const list = document.querySelector("[data-index-list]");
  const count = document.querySelector("[data-index-count]");
  const updated = document.querySelector("[data-index-updated]");
  const method = document.querySelector("[data-index-method]");
  if (!list) return;

  count.textContent = String(data.items.length);
  updated.textContent = formatDate(data.updated_at);
  method.textContent = data.methodology_version || "Pending";
  list.innerHTML = data.items.map((item) => `
    <div class="ranking-row">
      <span aria-label="Rank ${item.rank}">${item.rank}</span>
      <strong>${escapeHtml(item.name)} <small class="metadata">· ${escapeHtml(item.category)}</small></strong>
      <span class="hide-mobile">${Number(item.score).toFixed(1)} score</span>
      <span class="${item.momentum_30d >= 0 ? "positive" : "negative"}">${item.momentum_30d >= 0 ? "+" : ""}${Number(item.momentum_30d).toFixed(1)}%</span>
      <span class="hide-mobile">${item.confidence}% confidence</span>
    </div>
  `).join("");
}

function renderMonthly(data) {
  const title = document.querySelector("[data-monthly-title]");
  const summary = document.querySelector("[data-monthly-summary]");
  const issue = document.querySelector("[data-monthly-issue]");
  if (!title) return;
  title.textContent = data.title;
  summary.textContent = data.executive_summary;
  issue.textContent = data.issue;
}

function renderArchive() {
  const container = document.querySelector("[data-archive-results]");
  const count = document.querySelector("[data-archive-count]");
  if (!container) return;

  const query = state.archiveQuery.trim().toLowerCase();
  const filtered = state.archive.filter((report) => {
    const searchable = [
      report.title,
      report.period,
      report.type,
      report.status,
      ...(report.tags || [])
    ].join(" ").toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesType = state.archiveType === "all" || report.type === state.archiveType;
    return matchesQuery && matchesType;
  });

  count.textContent = `${filtered.length} ${filtered.length === 1 ? "report" : "reports"}`;
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">No reports match this search. Try a broader keyword or select all report types.</div>';
    return;
  }

  container.innerHTML = filtered.map((report) => `
    <article class="archive-card">
      <div>
        <p class="kicker">${escapeHtml(report.period)} · ${escapeHtml(report.status)}</p>
        <h3>${escapeHtml(report.title)}</h3>
        <div class="tag-list" aria-label="Report tags">
          ${(report.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
      <a class="button button-secondary" href="${escapeHtml(report.path)}">Read report<span aria-hidden="true"> →</span></a>
    </article>
  `).join("");
}

function setupArchiveControls() {
  const search = document.querySelector("[data-archive-search]");
  const type = document.querySelector("[data-archive-type]");
  if (!search || !type) return;

  search.addEventListener("input", (event) => {
    state.archiveQuery = event.target.value;
    renderArchive();
  });

  type.addEventListener("change", (event) => {
    state.archiveType = event.target.value;
    renderArchive();
  });
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
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(submission)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "The request could not be recorded.");
    }
    form.reset();
    status.textContent = result.message || form.dataset.successMessage;
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = error instanceof Error
      ? error.message
      : "The service is temporarily unavailable. Please try again.";
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

function setupPrintControls() {
  document.querySelectorAll("[data-print-report]").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });
}

async function initialize() {
  setupArchiveControls();
  setupForms();
  setupPrintControls();

  const tasks = [];
  if (document.querySelector("[data-index-list]")) {
    tasks.push(getJson(DATA_PATHS.index).then(renderIndex));
  }
  if (document.querySelector("[data-monthly-title]")) {
    tasks.push(getJson(DATA_PATHS.monthly).then(renderMonthly));
  }
  if (document.querySelector("[data-archive-results]")) {
    tasks.push(getJson(DATA_PATHS.archive).then((data) => {
      state.archive = Array.isArray(data.reports) ? data.reports : [];
      renderArchive();
    }));
  }

  const results = await Promise.allSettled(tasks);
  if (results.some((result) => result.status === "rejected")) {
    document.querySelectorAll("[data-load-state]").forEach((element) => {
      element.hidden = false;
    });
  }
}

document.addEventListener("DOMContentLoaded", initialize);
