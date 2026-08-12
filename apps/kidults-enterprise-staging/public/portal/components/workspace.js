const ROOT_ID = "kidults-living-workspace";
const STYLE_ID = "kidults-living-workspace-style";

const DEFAULT_CONTRACT = Object.freeze({
  workspace_id: "kidults-living-intelligence-workspace",
  version: "0.1.0",
  default_panel: "ask",
  panels: [
    {
      id: "ask",
      label: "Ask",
      source_id: "kidults-copilot",
      hash: "ask-kidults"
    },
    {
      id: "compare",
      label: "Compare",
      source_id: "kidults-compare-engine",
      hash: "compare-intelligence"
    },
    {
      id: "decision",
      label: "Decide",
      source_id: "kidults-decision-engine",
      hash: "decision-support"
    }
  ],
  truth_rules: {
    allow_data_mutation: false,
    allow_registry_mutation: false,
    preserve_engine_contracts: true,
    preserve_fail_closed_states: true,
    require_keyboard_navigation: true,
    require_deep_links: true
  }
});

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  const panels = Array.isArray(candidate.panels) && candidate.panels.length
    ? candidate.panels
    : DEFAULT_CONTRACT.panels;

  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    panels: panels.map(panel => ({ ...panel })),
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    }
  };
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/workspace.css?v=650";
  document.head.append(link);
}

function badgeFor(panel, data) {
  if (panel.id === "ask") {
    const count = data.copilot?.supported_intents?.length;
    return Number.isInteger(count) ? `${count} intents` : "Registry grounded";
  }
  if (panel.id === "compare") {
    const count = data.verticals?.verticals?.length;
    return Number.isInteger(count) ? `${count} verticals` : "Current baseline";
  }
  if (panel.id === "decision") {
    const count = data.decision?.max_items;
    return Number.isInteger(count) ? `Top ${count}` : "Fail closed";
  }
  return "Current";
}

function createRoot(contract, data) {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const sources = new Map();
  for (const panel of contract.panels) {
    const source = document.getElementById(panel.source_id);
    if (!source) throw new Error(`Workspace source is unavailable: ${panel.source_id}`);
    sources.set(panel.id, source);
  }

  const firstSource = sources.get(contract.panels[0].id);
  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "living-workspace";
  root.setAttribute("aria-labelledby", "living-workspace-title");
  root.innerHTML = `
    <header class="living-workspace__header">
      <div class="shell living-workspace__header-inner">
        <div class="living-workspace__title">
          <div>
            <p class="eyebrow">LIVING INTELLIGENCE WORKSPACE</p>
            <h2 id="living-workspace-title">Observe. Understand. Decide.</h2>
          </div>
          <p>One governed workspace for Registry-grounded questions, comparison and review guidance.</p>
        </div>
      </div>

      <div class="shell living-workspace__navigation">
        <div class="living-workspace__tabs" role="tablist" aria-label="Living Intelligence tools">
          ${contract.panels.map((panel, index) => `
            <button
              id="workspace-tab-${esc(panel.id)}"
              type="button"
              role="tab"
              aria-selected="${index === 0 ? "true" : "false"}"
              aria-controls="workspace-panel-${esc(panel.id)}"
              tabindex="${index === 0 ? "0" : "-1"}"
              data-workspace-tab="${esc(panel.id)}"
            >
              <span>${String(index + 1).padStart(2, "0")}</span>
              <b>${esc(panel.label)}</b>
              <small>${esc(badgeFor(panel, data))}</small>
            </button>
          `).join("")}
        </div>
        <p class="living-workspace__truth">Navigation changes; source truth, Registry state and engine contracts remain unchanged.</p>
      </div>
    </header>

    <div class="living-workspace__panels" data-workspace-panels></div>
  `;

  firstSource.insertAdjacentElement("beforebegin", root);
  const panelContainer = root.querySelector("[data-workspace-panels]");

  for (const panel of contract.panels) {
    const source = sources.get(panel.id);
    const wrapper = document.createElement("div");
    wrapper.id = `workspace-panel-${panel.id}`;
    wrapper.className = "living-workspace__panel";
    wrapper.dataset.workspacePanel = panel.id;
    wrapper.setAttribute("role", "tabpanel");
    wrapper.setAttribute("aria-labelledby", `workspace-tab-${panel.id}`);
    wrapper.tabIndex = 0;
    wrapper.hidden = true;
    source.dataset.workspaceSource = panel.id;
    wrapper.append(source);
    panelContainer.append(wrapper);
  }

  return root;
}

function panelFromHash(contract) {
  const hash = window.location.hash.replace(/^#/, "");
  return contract.panels.find(panel => panel.hash === hash)?.id ?? null;
}

function updateHash(contract, panelId) {
  const panel = contract.panels.find(item => item.id === panelId);
  if (!panel) return;
  try {
    const url = new URL(window.location.href);
    url.hash = panel.hash;
    window.history.replaceState(null, "", url);
  } catch {
    // Deep-link updates are best effort; workspace navigation still works.
  }
}

function activate(root, contract, panelId, { focus = false, updateUrl = true, scroll = false } = {}) {
  const selected = contract.panels.some(panel => panel.id === panelId)
    ? panelId
    : contract.default_panel;

  root.dataset.activePanel = selected;

  root.querySelectorAll("[data-workspace-tab]").forEach(tab => {
    const active = tab.dataset.workspaceTab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });

  root.querySelectorAll("[data-workspace-panel]").forEach(panel => {
    const active = panel.dataset.workspacePanel === selected;
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", String(!active));
  });

  document.documentElement.dataset.workspacePanel = selected;
  if (updateUrl) updateHash(contract, selected);

  if (scroll) {
    requestAnimationFrame(() => {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  window.dispatchEvent(new CustomEvent("kidults:workspace-change", {
    detail: { panel: selected }
  }));
  return selected;
}

function setupKeyboard(root, contract, activatePanel) {
  const tabs = [...root.querySelectorAll("[data-workspace-tab]")];
  root.querySelector("[role=tablist]").addEventListener("keydown", event => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;

    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;

    event.preventDefault();
    activatePanel(tabs[next].dataset.workspaceTab, { focus: true });
  });
}

export function startWorkspace({ data, contract } = {}) {
  if (!data) throw new Error("Living Intelligence Workspace requires portal data.");
  const normalizedContract = normalizeContract(contract);
  ensureStylesheet();
  const root = createRoot(normalizedContract, data);

  const open = (panelId, options = {}) => activate(root, normalizedContract, panelId, options);
  const initial = panelFromHash(normalizedContract) ?? normalizedContract.default_panel;
  open(initial, { updateUrl: false });

  root.addEventListener("click", event => {
    const tab = event.target.closest("[data-workspace-tab]");
    if (!tab) return;
    open(tab.dataset.workspaceTab, { focus: true });
  });

  setupKeyboard(root, normalizedContract, open);

  window.addEventListener("hashchange", () => {
    const panel = panelFromHash(normalizedContract);
    if (panel) open(panel, { updateUrl: false });
  });

  window.addEventListener("kidults:workspace", event => {
    open(event.detail?.panel, { scroll: Boolean(event.detail?.scroll) });
  });

  window.addEventListener("kidults:compare", () => {
    open("compare", { scroll: true });
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-decision-ask]")) {
      open("ask", { scroll: false });
    }
    if (event.target.closest("[data-decision-compare-left]")) {
      open("compare", { scroll: false });
    }
  }, true);

  window.KIDULTS_WORKSPACE = Object.freeze({
    workspace: normalizedContract.workspace_id,
    version: normalizedContract.version,
    panels: normalizedContract.panels.map(panel => panel.id),
    truthRules: { ...normalizedContract.truth_rules },
    open(panelId, options = {}) {
      return open(panelId, options);
    },
    state() {
      return root.dataset.activePanel;
    }
  });
}
