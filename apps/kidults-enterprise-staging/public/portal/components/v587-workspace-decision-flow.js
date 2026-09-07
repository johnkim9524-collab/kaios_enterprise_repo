import { buildIntelligenceDecision } from "./v587-intelligence-core.js";

const STORAGE_KEY = "kidults-v587-watchlist-v1";
const STYLE_ID = "kidults-v587-decision-intelligence-style";
const isSynthetic = record => record?.data_bucket === "SYNTHETIC" || record?.environment === "SYNTHETIC" || record?.synthetic === true;

const esc = value => String(value ?? "NOT AVAILABLE").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

export function buildWorkspaceDecisionPacket(data, selectedIds = []) {
  const objects = (data?.k100?.items ?? []).filter(item => selectedIds.includes(item.id));
  if (objects.some(isSynthetic)) throw new Error("V587_SYNTHETIC_EXPORT_PROHIBITED");
  const evaluated = objects.map(item => {
    const intelligence = buildIntelligenceDecision({
      factors: {
        evidence: item.evidence_coverage_pct,
        coverage: item.coverage_pct,
        freshness: item.freshness_score ?? item.freshness_state,
        rights: item.rights_status,
        consistency: item.consistency_pct,
        qualification: data?.registry?.assessment?.gate_state
      },
      rights: {
        rights: item.rights_status,
        permission: item.rights_permission ?? item.permission,
        release_state: item.rights_release_state ?? item.release_state,
        allowed_actions: item.allowed_actions ?? []
      },
      requestedAction: "EXPORT",
      reason: "Workspace actions require evidence, rights and independent qualification."
    });
    return { item, intelligence };
  });
  const actionAllowed = evaluated.length > 0 && evaluated.every(({ intelligence }) => intelligence.action === "EXPORT");
  return {
    packet_id: "kidults-v587-workspace-decision-packet-v1",
    snapshot_id: data?.registry?.snapshot?.candidate_id ?? data?.registry?.snapshot?.baseline_id ?? "NOT AVAILABLE",
    evidence_package_id: data?.registry?.evidence?.current_package_id ?? "NOT AVAILABLE",
    assessment_id: data?.registry?.assessment?.current_id ?? "NOT AVAILABLE",
    release: data?.registry?.release?.status ?? "HOLD",
    sequence: ["WATCHLIST", "EVIDENCE_COLLECTION", "COMPARISON", "DECISION_MEMO", "ACTION"],
    objects: evaluated.map(({ item, intelligence }) => ({
      id: item.id,
      title: item.title,
      confidence: intelligence.confidence.label,
      confidence_explanation: intelligence.confidence.explanation,
      freshness: item.freshness ?? "NOT AVAILABLE",
      rights: intelligence.rights.release_state,
      allowed_actions: intelligence.rights.allowed_actions,
      evidence_state: item.evidence_count ?? "NOT AVAILABLE",
      decision: intelligence.decision,
      action: intelligence.action,
      reason: intelligence.reason
    })),
    final_decision_allowed: false,
    action_allowed: actionAllowed,
    production_eligible: false,
    public_eligible: false,
    export_class: "INTERNAL_DECISION_MEMO",
    limitations: [
      "No transaction or investment recommendation is produced.",
      "Missing evidence, rights or Track B assessment remains explicit.",
      "Export does not alter Registry, rights, Production, Public or G5 state."
    ]
  };
}

function readSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
  } catch { return []; }
}

function writeSelection(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)])); } catch { /* storage is optional */ }
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/v587-decision-intelligence.css?v=587-intelligence-1";
  document.head.append(link);
}

function downloadPacket(packet) {
  const blob = new Blob([`${JSON.stringify(packet, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kidults-v587-internal-decision-memo.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function startV587WorkspaceDecisionFlow(data) {
  ensureStylesheet();
  const mount = document.querySelector("[data-workspace-mount]");
  if (!mount || document.getElementById("v587-workspace-decision-flow")) return null;
  const root = document.createElement("section");
  root.id = "v587-workspace-decision-flow";
  root.className = "v587-workspace-flow";
  root.setAttribute("aria-labelledby", "v587-workspace-flow-title");
  root.innerHTML = `
    <header><div><p class="eyebrow">DECISION WORKFLOW</p><h2 id="v587-workspace-flow-title">Collect evidence. Compare with clarity.</h2></div>
      <p>Workspace actions remain internal and fail-closed.</p></header>
    <ol>${["Watchlist", "Evidence Collection", "Comparison", "Decision Memo", "Action"].map((label, index) =>
      `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong></li>`).join("")}</ol>
    <div class="v587-workspace-flow__objects" data-v587-workspace-objects></div>
    <div class="v587-workspace-flow__memo" aria-live="polite" data-v587-workspace-memo></div>
    <button class="button button-secondary" type="button" data-v587-export disabled>Export internal memo</button>`;
  mount.append(root);

  let selected = readSelection();
  const objectsNode = root.querySelector("[data-v587-workspace-objects]");
  const memoNode = root.querySelector("[data-v587-workspace-memo]");
  const exportButton = root.querySelector("[data-v587-export]");

  const render = () => {
    const packet = buildWorkspaceDecisionPacket(data, selected);
    objectsNode.innerHTML = (data.k100?.items ?? []).filter(item => !isSynthetic(item)).map(item => {
      const active = selected.includes(item.id);
      return `<button type="button" data-v587-watch="${esc(item.id)}" aria-pressed="${active}">
        <span>${active ? "WATCHING" : "ADD"}</span><strong>${esc(item.title)}</strong><small>Rights ${esc(item.rights_status ?? "HOLD")}</small></button>`;
    }).join("");
    memoNode.innerHTML = packet.objects.length
      ? `<strong>${packet.objects.length} object${packet.objects.length === 1 ? "" : "s"} selected</strong><p>Decision: ${esc(packet.objects.map(item => item.decision).join(", "))}. Actions remain rights-gated.</p>`
      : "<strong>No objects selected</strong><p>Add objects to assemble an internal evidence comparison.</p>";
    exportButton.disabled = !packet.action_allowed;
    exportButton.onclick = () => downloadPacket(packet);
    window.KIDULTS_V587_WORKSPACE_PACKET = Object.freeze(packet);
  };

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-v587-watch]");
    if (!button) return;
    const id = button.dataset.v587Watch;
    selected = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
    writeSelection(selected);
    render();
  });
  render();
  return root;
}
