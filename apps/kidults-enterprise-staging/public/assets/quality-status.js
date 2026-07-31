const root = document.querySelector("[data-quality-root]");

function text(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value ?? "—";
}

function formatDate(value) {
  if (!value) return "Awaiting first evaluation";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value)) + " UTC";
}

function render(status) {
  root.dataset.status = status.status;
  text("[data-quality-state]", status.status.replaceAll("_", " "));
  text("[data-quality-evaluated]", formatDate(status.evaluated_at));
  text("[data-quality-run-age]", status.metrics.run_age_hours == null ? "—" : `${status.metrics.run_age_hours}h`);
  text("[data-quality-records]", status.metrics.records);
  text("[data-quality-categories]", status.metrics.categories);
  text("[data-quality-confidence]", status.metrics.average_confidence == null ? "—" : `${status.metrics.average_confidence}%`);
  text("[data-quality-outputs]", status.metrics.verified_outputs);
  const alerts = document.querySelector("[data-quality-alerts]");
  alerts.replaceChildren();
  if (!status.alerts.length) {
    const item = document.createElement("li");
    item.className = "quality-clear";
    item.textContent = status.status === "monitoring_pending"
      ? "The first staging evaluation has not run yet."
      : "All configured intelligence quality gates pass.";
    alerts.append(item);
    return;
  }
  for (const alert of status.alerts) {
    const item = document.createElement("li");
    item.className = `quality-alert quality-alert-${alert.severity}`;
    const heading = document.createElement("strong");
    heading.textContent = alert.code.replaceAll("_", " ");
    const message = document.createElement("span");
    message.textContent = alert.message;
    item.append(heading, message);
    alerts.append(item);
  }
}

if (root) {
  fetch("data/quality-status.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Quality status request failed: ${response.status}`);
      return response.json();
    })
    .then(render)
    .catch(() => {
      root.dataset.status = "critical";
      text("[data-quality-state]", "status unavailable");
      text("[data-quality-evaluated]", "Staging status endpoint could not be read");
    });
}
