import { loadPortalData } from "./components/data-store.js";
import { startCopilot } from "./components/copilot.js";
import { startCompareEngine } from "./components/compare-engine.js";
import { startDecisionEngine } from "./components/decision-engine.js";
import { startWorkspace } from "./components/workspace.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startAccessibilityR1 } from "./components/accessibility-r1.js";
import { setupNavigation } from "./components/interactions.js";
import { startV587WorkspaceDecisionFlow } from "./components/v587-workspace-decision-flow.js?v=587-graduation-1";
import { buildPresenceContext } from "./components/v587-decision-intelligence.js?v=587-graduation-1";
import { startWhyEngine } from "./components/why-engine.js";
import { beginPerformanceQualification } from "./components/v587-performance-qualification.js";
import { startBusinessJourneyQualification } from "./components/v587-business-journey-qualification.js";

function human(value) {
  return String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
}

function selectedMode() {
  const value = new URL(window.location.href).searchParams.get("mode")?.toLowerCase();
  if (value === "compare") return "compare";
  if (value === "decide" || value === "decision") return "decision";
  return "ask";
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

  context.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${label}</dt>
      <dd>${human(value)}</dd>
    </div>
  `).join("");

  const presence = buildPresenceContext(data);
  const copy = document.querySelector(".workspace-page-context-copy");
  if (copy) copy.innerHTML = `<b>Workspace Context</b><span>${presence.workspace}</span>`;
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

  const mode = selectedMode();
  window.KIDULTS_WORKSPACE.open(mode, { updateUrl: false, scroll: false });
  document.documentElement.dataset.workspaceRoute = mode;
  return mode;
}

async function init() {
  const completePerformanceQualification = beginPerformanceQualification("WORKSPACE");
  setupNavigation();
  startAccessibilityR1();

  try {
    const data = await loadPortalData();
    document.documentElement.dataset.integrationBusState = data.integrationBus.state;
    renderContext(data);
    const mode = mountWorkspace(data);
    startV587WorkspaceDecisionFlow(data);
    startBusinessJourneyQualification({ surface: "WORKSPACE", integrationBus: data.integrationBus, exportAllowed: window.KIDULTS_V587_WORKSPACE_PACKET?.action_allowed === true });
    startMobileReconstruction();
    startAccessibilityR1();
    window.KIDULTS_PERFORMANCE_RECEIPT_READY = completePerformanceQualification(data.integrationBus);

    document.documentElement.dataset.dataState = "workspace-ready";
    window.KIDULTS_WORKSPACE_PAGE = Object.freeze({
      version: "1.1.0",
      route: "workspace.html",
      mode,
      candidateSnapshotId: data.registry?.snapshot?.candidate_id ?? null,
      baselineSnapshotId: data.registry?.snapshot?.baseline_id ?? null,
      evidencePackageId: data.registry?.evidence?.current_package_id ?? null,
      sourceMode: data.manifest?.source_mode,
      workspaceVersion: data.workspace?.version,
      integrationBus: data.integrationBus
    });
  } catch (error) {
    console.error("KIDULTS Intelligence Workspace initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    document.documentElement.dataset.workspaceErrorCode = String(error?.message ?? error).slice(0, 80);
    document.body.insertAdjacentHTML("afterbegin", `
      <div class="workspace-page-error" role="alert">
        <strong>Action unavailable.</strong>
        Evidence and Rights could not be verified. Return to the Portal while Qualification completes.
      </div>
    `);
  }
}

document.addEventListener("DOMContentLoaded", init);
