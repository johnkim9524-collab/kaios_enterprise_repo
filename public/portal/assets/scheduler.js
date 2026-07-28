"use strict";

const schedulerElements = {
  enabled: document.querySelector("#schedulerEnabled"),
  mode: document.querySelector("#schedulerMode"),
  lastRun: document.querySelector("#schedulerLastRun"),
  nextRun: document.querySelector("#schedulerNextRun"),
  lock: document.querySelector("#schedulerLock"),
  refresh: document.querySelector("#refreshSchedulerButton"),
};

function schedulerText(value, fallback = "-") {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
}

function schedulerTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return schedulerText(value);
  }

  return date.toLocaleString();
}

function renderSchedulerStatus(data) {
  schedulerElements.enabled.textContent =
    data.enabled
      ? "Enabled"
      : "Disabled";

  schedulerElements.mode.textContent =
    schedulerText(
      data.runtime_mode,
      "unknown"
    );

  if (data.last_run_id) {
    schedulerElements.lastRun.textContent = [
      schedulerText(
        data.last_run_status,
        "unknown"
      ),
      schedulerTime(
        data.last_run_completed_at
      ),
    ].join(" / ");
  } else {
    schedulerElements.lastRun.textContent =
      "No scheduled run";
  }

  schedulerElements.nextRun.textContent =
    schedulerTime(
      data.next_run_at
    );

  if (data.lock) {
    schedulerElements.lock.textContent = [
      `Owner: ${schedulerText(
        data.lock.owner_id
      )}`,
      `Expires: ${schedulerTime(
        data.lock.expires_at
      )}`,
      `Stale: ${
        data.lock.stale
          ? "Yes"
          : "No"
      }`,
    ].join(" / ");
  } else {
    schedulerElements.lock.textContent =
      "No active runtime lock";
  }
}

async function loadSchedulerStatus() {
  schedulerElements.refresh.disabled = true;
  schedulerElements.refresh.textContent =
    "Loading...";

  try {
    const response = await fetch(
      "/api/scheduler/status",
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const payload = await response.json();

    if (
      !response.ok ||
      payload.ok !== true
    ) {
      throw new Error(
        payload.error?.message ||
        "Scheduler status request failed."
      );
    }

    renderSchedulerStatus(
      payload.data
    );
  } catch (error) {
    schedulerElements.lock.textContent =
      error instanceof Error
        ? error.message
        : "Scheduler status request failed.";
  } finally {
    schedulerElements.refresh.disabled = false;
    schedulerElements.refresh.textContent =
      "Refresh Scheduler";
  }
}

schedulerElements.refresh.addEventListener(
  "click",
  loadSchedulerStatus
);

window.addEventListener(
  "kaios:runtime-complete",
  loadSchedulerStatus
);

document.addEventListener(
  "DOMContentLoaded",
  loadSchedulerStatus
);