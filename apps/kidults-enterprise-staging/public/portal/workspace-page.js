import { loadPortalData } from "./components/data-store.js";
import { startCopilot } from "./components/copilot.js";
import { startCompareEngine } from "./components/compare-engine.js";
import { startDecisionEngine } from "./components/decision-engine.js";
import { startWorkspace } from "./components/workspace.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { setupNavigation } from "./components/interactions.js";

function human(value) {
  return String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
}

function selectedMode() {
  const value = new URL(window.location.href).searchParams.get("mode")?.toLowerCase();
  if (value === "compare") return "compare";
  if (value === "decide" || value === "decision") return "decision";
  return "ask";
}

function renderContext(data) {
  const context = document.querySelector("[data-workspace-context]");
  if (!context) return;

  const evidence = data.summary?.operations?.find(item => item.label === "EVIDENCE OBJECTS");
  const rows = [
    ["Snapshot", data.manifest?.snapshot_id ?? data.registry?.snapshot?.baseline_id],
    ["Evidence", evidence ? `${evidence.value} · ${human(evidence.state)}` : "NOT AVAILABLE"],
    ["Assessment", data.registry?.assessment?.current_id ?? data.registry?.assessment?.status ?? "WAITING"],
    ["Release", data.registry?.release?.status ?? data.manifest?.status]
  ];

  context.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${label}</dt>
      <dd>${human(value)}</dd>
    </div>
  `).join("");
}

function mountWorkspace(data) {
  startCopilot({ data, contract: data.copilot });
  startCompareEngine({ data, contract: data.compare });
  startDecisionEngine({ data, contract: data.decision });
  startWorkspace({ data, contract: data.workspace });

  const root = document.getElementById("kidults-living-workspace");
  const mount = document.querySelector("[data-workspace-mount]");
  if (!root || !mount) throw new Error("The Intelligence Workspace mount is unavailable.");
  mount.append(root);

  const mode = selectedMode();
  window.KIDULTS_WORKSPACE.open(mode, { updateUrl: false, scroll: false });
  document.documentElement.dataset.workspaceRoute = mode;
  return mode;
}

async function init() {
  setupNavigation();

  try {
    const data = await loadPortalData();
    renderContext(data);
    const mode = mountWorkspace(data);
    startMobileReconstruction();

    document.documentElement.dataset.dataState = "workspace-ready";
    window.KIDULTS_WORKSPACE_PAGE = Object.freeze({
      version: "1.0.0",
      route: "workspace.html",
      mode,
      snapshotId: data.manifest?.snapshot_id,
      sourceMode: data.manifest?.source_mode,
      workspaceVersion: data.workspace?.version
    });
  } catch (error) {
    console.error("KIDULTS Intelligence Workspace initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    document.body.insertAdjacentHTML("afterbegin", `
      <div class="workspace-page-error" role="alert">
        <strong>Workspace fail-closed.</strong>
        Required Registry-grounded data could not be loaded.
      </div>
    `);
  }
}

document.addEventListener("DOMContentLoaded", init);
