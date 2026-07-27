"use strict";

const runHistoryElements = {
  list: document.querySelector("#recentRuns"),
  detail: document.querySelector("#runDetail"),
  count: document.querySelector("#runHistoryCount"),
  refresh: document.querySelector("#refreshRunsButton"),
};

let selectedRunId = null;

function historyText(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function historyTimestamp(value) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return historyText(value);
  }

  return date.toLocaleString();
}

function historyStatusClass(status) {
  const normalized = historyText(
    status,
    "unknown"
  ).toLowerCase();

  if (normalized === "published" || normalized === "passed") {
    return "state-passed";
  }

  if (normalized === "failed") {
    return "state-failed";
  }

  if (normalized === "running") {
    return "state-loading";
  }

  return `state-${normalized}`;
}

async function fetchHistoryEnvelope(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => null);

  if (!payload) {
    throw new Error(
      `Invalid JSON response from ${url}`
    );
  }

  if (!response.ok || payload.ok !== true) {
    const message =
      payload.error?.message ||
      `Run history request failed with HTTP ${response.status}`;

    throw new Error(message);
  }

  return payload.data;
}

function emptyHistory(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;

  return paragraph;
}

function createRunCard(run) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "run-card";

  if (run.run_id === selectedRunId) {
    button.classList.add("run-card-active");
  }

  const heading = document.createElement("div");
  heading.className = "run-card-heading";

  const title = document.createElement("strong");
  title.textContent = [
    historyText(run.edition, "No edition"),
    historyText(run.trigger_type, "unknown"),
  ].join(" · ");

  const status = document.createElement("span");
  status.className = [
    "execution-state",
    historyStatusClass(run.status),
  ].join(" ");
  status.textContent = historyText(run.status);

  heading.append(title, status);

  const identifier = document.createElement("div");
  identifier.className = "run-id";
  identifier.textContent = historyText(run.run_id);

  const meta = document.createElement("div");
  meta.className = "run-card-meta";

  const started = document.createElement("span");
  started.textContent = historyTimestamp(run.started_at);

  const mode = document.createElement("span");
  mode.textContent = `Mode: ${historyText(run.mode)}`;

  const duration = document.createElement("span");
  duration.textContent = `Duration: ${historyText(
    run.duration_ms,
    "0"
  )} ms`;

  meta.append(started, mode, duration);
  button.append(heading, identifier, meta);

  button.addEventListener("click", async () => {
    await loadRunDetail(run.run_id);
    await loadRuns();
  });

  return button;
}

function renderRuns(data) {
  const runs = Array.isArray(data.runs)
    ? data.runs
    : [];

  runHistoryElements.count.textContent =
    `${runs.length} recent run${runs.length === 1 ? "" : "s"}`;

  if (runs.length === 0) {
    runHistoryElements.list.replaceChildren(
      emptyHistory(
        "No persistent runtime history is available yet."
      )
    );

    runHistoryElements.detail.replaceChildren(
      emptyHistory(
        "Run a full runtime to create the first history record."
      )
    );

    return;
  }

  runHistoryElements.list.replaceChildren(
    ...runs.map(createRunCard)
  );

  if (!selectedRunId) {
    loadRunDetail(runs[0].run_id);
  }
}

function createDetailRow(label, value) {
  const row = document.createElement("div");
  row.className = "run-detail-row";

  const labelNode = document.createElement("span");
  labelNode.textContent = label;

  const valueNode = document.createElement("strong");
  valueNode.textContent = historyText(value);

  row.append(labelNode, valueNode);

  return row;
}

function createExecutionItem(
  name,
  detail,
  status
) {
  const item = document.createElement("div");
  item.className = "execution-item";

  const main = document.createElement("div");
  main.className = "execution-main";

  const title = document.createElement("strong");
  title.textContent = historyText(name);

  const description = document.createElement("small");
  description.textContent = historyText(
    detail,
    "No additional detail"
  );

  main.append(title, description);

  const state = document.createElement("span");
  state.className = [
    "execution-state",
    historyStatusClass(status),
  ].join(" ");
  state.textContent = historyText(status);

  item.append(main, state);

  return item;
}

function renderRunDetail(run) {
  const fragment = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "run-detail-header";

  const heading = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent = historyText(
    run.edition,
    "Runtime Run"
  );

  const identifier = document.createElement("div");
  identifier.className = "run-id";
  identifier.textContent = historyText(run.run_id);

  heading.append(title, identifier);

  const status = document.createElement("span");
  status.className = [
    "execution-state",
    historyStatusClass(run.status),
  ].join(" ");
  status.textContent = historyText(run.status);

  header.append(heading, status);
  fragment.append(header);

  const summary = document.createElement("section");
  summary.className = "run-detail-section";

  const summaryTitle = document.createElement("h3");
  summaryTitle.textContent = "Run Summary";

  const summaryList = document.createElement("div");
  summaryList.className = "run-detail-list";

  summaryList.append(
    createDetailRow("Trigger", run.trigger_type),
    createDetailRow("Mode", run.mode),
    createDetailRow(
      "Started",
      historyTimestamp(run.started_at)
    ),
    createDetailRow(
      "Completed",
      historyTimestamp(run.completed_at)
    ),
    createDetailRow(
      "Duration",
      `${historyText(run.duration_ms, "0")} ms`
    ),
    createDetailRow(
      "Published",
      run.published ? "Yes" : "No"
    )
  );

  summary.append(summaryTitle, summaryList);
  fragment.append(summary);

  const stages = Array.isArray(run.stages)
    ? run.stages
    : [];

  const stageSection = document.createElement("section");
  stageSection.className = "run-detail-section";

  const stageTitle = document.createElement("h3");
  stageTitle.textContent = `Stage Timeline (${stages.length})`;

  const stageList = document.createElement("div");
  stageList.className = "execution-list";

  if (stages.length === 0) {
    stageList.append(
      emptyHistory("No stage history recorded.")
    );
  } else {
    stageList.append(
      ...stages.map((stage) =>
        createExecutionItem(
          `${stage.sequence_number}. ${stage.stage_name}`,
          stage.detail,
          stage.status
        )
      )
    );
  }

  stageSection.append(stageTitle, stageList);
  fragment.append(stageSection);

  const sources = Array.isArray(run.sources)
    ? run.sources
    : [];

  const sourceSection = document.createElement("section");
  sourceSection.className = "run-detail-section";

  const sourceTitle = document.createElement("h3");
  sourceTitle.textContent =
    `Source Executions (${sources.length})`;

  const sourceList = document.createElement("div");
  sourceList.className = "execution-list";

  if (sources.length === 0) {
    sourceList.append(
      emptyHistory("No source execution history recorded.")
    );
  } else {
    sourceList.append(
      ...sources.map((source) =>
        createExecutionItem(
          source.source_name,
          [
            `Type: ${historyText(source.source_type)}`,
            `Attempts: ${historyText(source.attempts, "0")}`,
            `Signals: ${historyText(source.signal_count, "0")}`,
            source.error
              ? `Error: ${source.error}`
              : null,
          ].filter(Boolean).join(" · "),
          source.status
        )
      )
    );
  }

  sourceSection.append(sourceTitle, sourceList);
  fragment.append(sourceSection);

  const publicationSection =
    document.createElement("section");

  publicationSection.className = "run-detail-section";

  const publicationTitle = document.createElement("h3");
  publicationTitle.textContent = "Publication";

  if (run.publication) {
    publicationSection.append(
      publicationTitle,
      createDetailRow(
        "Edition",
        run.publication.edition
      ),
      createDetailRow(
        "Published At",
        historyTimestamp(
          run.publication.published_at
        )
      )
    );
  } else {
    publicationSection.append(
      publicationTitle,
      emptyHistory(
        "No publication was recorded for this run."
      )
    );
  }

  fragment.append(publicationSection);

  if (run.error) {
    const error = document.createElement("div");
    error.className = "run-error";

    const errorTitle = document.createElement("strong");
    errorTitle.textContent = [
      historyText(run.error.type, "Runtime error"),
      historyText(run.error.stage, "unknown stage"),
    ].join(" · ");

    const errorMessage = document.createElement("p");
    errorMessage.textContent = historyText(
      run.error.message,
      "No error message recorded."
    );

    error.append(errorTitle, errorMessage);
    fragment.append(error);
  }

  runHistoryElements.detail.replaceChildren(
    fragment
  );
}

async function loadRunDetail(runId) {
  selectedRunId = runId;

  runHistoryElements.detail.replaceChildren(
    emptyHistory("Loading run detail...")
  );

  try {
    const run = await fetchHistoryEnvelope(
      `/api/runs/${encodeURIComponent(runId)}`
    );

    renderRunDetail(run);
  } catch (error) {
    runHistoryElements.detail.replaceChildren(
      emptyHistory(error.message)
    );
  }
}

async function loadRuns() {
  runHistoryElements.refresh.disabled = true;
  runHistoryElements.refresh.textContent = "Loading...";

  try {
    const data = await fetchHistoryEnvelope(
      "/api/runs?limit=20"
    );

    renderRuns(data);
  } catch (error) {
    runHistoryElements.list.replaceChildren(
      emptyHistory(error.message)
    );

    runHistoryElements.detail.replaceChildren(
      emptyHistory(
        "Run detail is unavailable."
      )
    );
  } finally {
    runHistoryElements.refresh.disabled = false;
    runHistoryElements.refresh.textContent = "Refresh Runs";
  }
}

runHistoryElements.refresh.addEventListener(
  "click",
  loadRuns
);

window.addEventListener(
  "kaios:runtime-complete",
  loadRuns
);

document.addEventListener(
  "DOMContentLoaded",
  loadRuns
);