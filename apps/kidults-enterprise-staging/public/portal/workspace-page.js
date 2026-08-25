import { loadWorkspaceData } from "./components/data-store.js";
import { startCopilot } from "./components/copilot.js";
import { startCompareEngine } from "./components/compare-engine.js";
import { startDecisionEngine } from "./components/decision-engine.js";
import { startWhyEngine } from "./components/why-engine.js";
import { startWorkspace } from "./components/workspace.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startAccessibilityR1 } from "./components/accessibility-r1.js";
import { setupNavigation } from "./components/interactions.js";

function human(value) {
  return String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
}

function registrySnapshotContext(registry) {
  const snapshot = registry?.snapshot;
  if (!snapshot) return "NOT AVAILABLE";
  return snapshot.candidate_id ?? snapshot.candidate_status ?? "NOT AVAILABLE";
}

function registryEvidenceContext(registry) {
  const evidence = registry?.evidence;
  if (!evidence) return "NOT AVAILABLE";
  if (evidence.current_package_id) {
    return `${evidence.current_package_id} · ${human(evidence.status ?? "REGISTERED")}`;
  }
  return evidence.status ?? "NOT AVAILABLE";
}

function renderContext(data) {
  const context = document.querySelector("[data-workspace-context]");
  if (!context) return;

  const rows = [
    ["Snapshot", registrySnapshotContext(data.registry)],
    ["Evidence", registryEvidenceContext(data.registry)],
    ["Assessment", data.registry?.assessment?.current_id ?? data.registry?.assessment?.status ?? "WAITING"],
    ["Release", data.registry?.release?.status ?? "HOLD"]
  ];

  const fragments = rows.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = human(value);
    row.append(term, description);
    return row;
  });
  context.replaceChildren(...fragments);
}

function mountWorkspace(data) {
  startWhyEngine({ data, contract: data.why });
  startCopilot({ data, contract: data.copilot });
  startCompareEngine({ data, contract: data.compare });
  startDecisionEngine({ data, contract: data.decision });
  startWorkspace({ data, contract: data.workspace });

  const root = document.getElementById("kidults-living-workspace");
  const mount = document.querySelector("[data-workspace-mount]");
  if (!root || !mount) throw new Error("The Intelligence Workspace mount is unavailable.");
  mount.append(root);

  const mode = window.KIDULTS_WORKSPACE.state();
  document.documentElement.dataset.workspaceRoute = mode;
  return mode;
}

async function init() {
  setupNavigation();
  startAccessibilityR1();

  try {
    const data = await loadWorkspaceData();
    renderContext(data);
    const mode = mountWorkspace(data);
    startMobileReconstruction();
    startAccessibilityR1();

    document.documentElement.dataset.dataState = "workspace-ready";
    window.KIDULTS_WORKSPACE_PAGE = Object.freeze({
      version: "1.1.0",
      route: "workspace.html",
      mode,
      candidateSnapshotId: data.registry?.snapshot?.candidate_id ?? null,
      baselineSnapshotId: data.registry?.snapshot?.baseline_id ?? null,
      evidencePackageId: data.registry?.evidence?.current_package_id ?? null,
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
