"use strict";

const API = Object.freeze({
  health: "/api/health",
  status: "/api/status",
  edition: "/api/edition",
  collector: "/api/collector?mode=fixture",
  runtime: "/api/runtime?mode=fixture",
});

const elements = {
  connectionBadge: document.querySelector("#connectionBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  errorPanel: document.querySelector("#errorPanel"),
  errorTitle: document.querySelector("#errorTitle"),
  errorMessage: document.querySelector("#errorMessage"),
  runtimeMode: document.querySelector("#runtimeMode"),
  healthStatus: document.querySelector("#healthStatus"),
  healthCheckedAt: document.querySelector("#healthCheckedAt"),
  healthChecks: document.querySelector("#healthChecks"),
  editionValue: document.querySelector("#editionValue"),
  editionGeneratedAt: document.querySelector("#editionGeneratedAt"),
  editionPlatform: document.querySelector("#editionPlatform"),
  editionSystem: document.querySelector("#editionSystem"),
  editionIndex: document.querySelector("#editionIndex"),
  editionSentiment: document.querySelector("#editionSentiment"),
  editionConfidence: document.querySelector("#editionConfidence"),
  collectorStatus: document.querySelector("#collectorStatus"),
  collectorSummary: document.querySelector("#collectorSummary"),
  sourceExecutions: document.querySelector("#sourceExecutions"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  runtimeSummary: document.querySelector("#runtimeSummary"),
  runtimeStages: document.querySelector("#runtimeStages"),
  runCollectorButton: document.querySelector("#runCollectorButton"),
  runRuntimeButton: document.querySelector("#runRuntimeButton"),
};

function text(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatTimestamp(value) {
  if (!value) {
    return "Timestamp unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return text(value);
  }

  return date.toLocaleString();
}

function setConnectionState(status) {
  const normalized = text(status, "error").toLowerCase();

  elements.connectionBadge.textContent = normalized;
  elements.connectionBadge.className = [
    "status-badge",
    `status-${normalized}`,
  ].join(" ");
}

function showError(title, message) {
  elements.errorTitle.textContent = text(title, "Gateway error");
  elements.errorMessage.textContent = text(
    message,
    "An unexpected error occurred."
  );
  elements.errorPanel.classList.remove("hidden");
}

function clearError() {
  elements.errorPanel.classList.add("hidden");
  elements.errorTitle.textContent = "";
  elements.errorMessage.textContent = "";
}

async function fetchEnvelope(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!payload) {
    throw new Error(`Invalid JSON response from ${url}`);
  }

  if (!response.ok || payload.ok !== true) {
    const gatewayError = payload.error || {};
    const message =
      gatewayError.message ||
      `Gateway request failed with HTTP ${response.status}`;

    const error = new Error(message);
    error.type = gatewayError.type || "gateway_error";
    error.status = response.status;
    error.payload = payload;

    throw error;
  }

  return payload.data;
}

function renderHealth(data) {
  const status = text(data.status, "unknown").toLowerCase();

  elements.healthStatus.textContent = status;
  elements.healthStatus.className = [
    "metric-value",
    `state-${status}`,
  ].join(" ");

  elements.healthCheckedAt.textContent =
    `Checked ${formatTimestamp(data.checked_at)}`;

  const checks = Array.isArray(data.checks) ? data.checks : [];

  if (checks.length === 0) {
    elements.healthChecks.innerHTML =
      '<p class="empty-state">No health checks available.</p>';
    return;
  }

  elements.healthChecks.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("div");
      item.className = "check-item";

      const name = document.createElement("span");
      name.textContent = text(check.name, "Unnamed check");

      const state = document.createElement("span");
      state.className = [
        "check-state",
        check.ok ? "state-passed" : "state-failed",
      ].join(" ");
      state.textContent = check.ok ? "Passed" : "Failed";

      item.append(name, state);
      return item;
    })
  );
}

function renderEdition(data) {
  elements.editionValue.textContent = text(data.edition);
  elements.editionGeneratedAt.textContent =
    `Generated ${formatTimestamp(data.generated_at)}`;
  elements.editionPlatform.textContent = text(data.platform);
  elements.editionSystem.textContent = text(data.system);

  const index = data.kidult_100_index || {};
  const sentiment = data.collector_sentiment || {};
  const confidence = data.confidence_engine || {};

  elements.editionIndex.textContent =
    `${text(index.value)} (${text(index.change, "0")})`;
  elements.editionSentiment.textContent =
    `${text(sentiment.score)} · ${text(sentiment.label)}`;
  elements.editionConfidence.textContent =
    `${text(confidence.overall)} · ${text(confidence.grade)}`;
}

function renderCollector(data) {
  const status = text(data.status, "unknown").toLowerCase();

  elements.collectorStatus.textContent = status;
  elements.collectorStatus.className = [
    "metric-value",
    `state-${status}`,
  ].join(" ");

  elements.collectorSummary.textContent = [
    `${text(data.successful_source_count, "0")} successful`,
    `${text(data.failed_source_count, "0")} failed`,
    `${Array.isArray(data.signals) ? data.signals.length : 0} signals`,
  ].join(" · ");

  const sources = Array.isArray(data.sources) ? data.sources : [];

  if (sources.length === 0) {
    elements.sourceExecutions.innerHTML =
      '<p class="empty-state">No source execution data available.</p>';
    return;
  }

  elements.sourceExecutions.replaceChildren(
    ...sources.map((source) => {
      const item = document.createElement("div");
      item.className = "execution-item";

      const main = document.createElement("div");
      main.className = "execution-main";

      const name = document.createElement("strong");
      name.textContent = text(source.source_name, source.source_id);

      const detail = document.createElement("small");
      detail.textContent = [
        `Attempts: ${text(source.attempts, "0")}`,
        `Signals: ${text(source.signal_count, "0")}`,
        source.error ? `Error: ${source.error}` : null,
      ].filter(Boolean).join(" · ");

      main.append(name, detail);

      const state = document.createElement("span");
      const normalizedStatus = text(source.status, "unknown").toLowerCase();
      state.className = [
        "execution-state",
        `state-${normalizedStatus}`,
      ].join(" ");
      state.textContent = normalizedStatus;

      item.append(main, state);
      return item;
    })
  );
}

function renderRuntime(data) {
  const published = data.published === true;

  elements.runtimeMode.textContent = text(data.mode, "fixture");
  elements.runtimeStatus.textContent = published ? "published" : "failed";
  elements.runtimeStatus.className = [
    "metric-value",
    published ? "state-passed" : "state-failed",
  ].join(" ");

  elements.runtimeSummary.textContent = published
    ? `Edition ${text(data.edition)} published successfully`
    : text(data.error?.message, "Runtime execution failed");

  const stages = Array.isArray(data.stages) ? data.stages : [];

  if (stages.length === 0) {
    elements.runtimeStages.innerHTML =
      '<p class="empty-state">No runtime stage data available.</p>';
    return;
  }

  elements.runtimeStages.replaceChildren(
    ...stages.map((stage) => {
      const item = document.createElement("div");
      item.className = "execution-item";

      const main = document.createElement("div");
      main.className = "execution-main";

      const name = document.createElement("strong");
      name.textContent = text(stage.name, "Unnamed stage");

      const detail = document.createElement("small");
      detail.textContent = text(
        stage.detail,
        "Completed without additional detail"
      );

      main.append(name, detail);

      const state = document.createElement("span");
      const normalizedStatus = text(stage.status, "unknown").toLowerCase();
      state.className = [
        "execution-state",
        `state-${normalizedStatus}`,
      ].join(" ");
      state.textContent = normalizedStatus;

      item.append(main, state);
      return item;
    })
  );
}

async function loadOverview() {
  clearError();
  setConnectionState("loading");
  elements.refreshButton.disabled = true;

  try {
    const [health, status, edition] = await Promise.all([
      fetchEnvelope(API.health),
      fetchEnvelope(API.status),
      fetchEnvelope(API.edition),
    ]);

    renderHealth(health);
    renderEdition(edition);

    const gatewayStatus =
      status.status ||
      status.health?.status ||
      health.status ||
      "operational";

    setConnectionState(gatewayStatus);
  } catch (error) {
    setConnectionState("error");
    showError(error.type || "Gateway error", error.message);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function runCollector() {
  clearError();
  elements.runCollectorButton.disabled = true;
  elements.runCollectorButton.textContent = "Running...";

  try {
    const data = await fetchEnvelope(API.collector);
    renderCollector(data);
  } catch (error) {
    const data = error.payload?.data;

    if (data) {
      renderCollector(data);
    }

    showError(error.type || "Collector error", error.message);
  } finally {
    elements.runCollectorButton.disabled = false;
    elements.runCollectorButton.textContent = "Run Collector";
  }
}

async function runRuntime() {
  clearError();
  elements.runRuntimeButton.disabled = true;
  elements.runRuntimeButton.textContent = "Running...";

  try {
    const data = await fetchEnvelope(API.runtime);
    renderRuntime(data);
    await loadOverview();
  } catch (error) {
    const data = error.payload?.data;

    if (data) {
      renderRuntime(data);
    }

    showError(error.type || "Runtime error", error.message);
  } finally {
    elements.runRuntimeButton.disabled = false;
    elements.runRuntimeButton.textContent = "Run Full Runtime";
  }
}

elements.refreshButton.addEventListener("click", loadOverview);
elements.runCollectorButton.addEventListener("click", runCollector);
elements.runRuntimeButton.addEventListener("click", runRuntime);

document.addEventListener("DOMContentLoaded", loadOverview);