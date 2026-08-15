const STYLE_ID = "kidults-v662-stability-freeze-style";
const VERSION = "2.0.0";

function ensureStylesheet() {
  document.querySelectorAll('link[href*="v661-final-freeze.css"],link[href*="v658-visual-freeze.css"]').forEach(link => link.remove());

  const href = "components/v662-stability-freeze.css?v=662-visual95";
  let link = document.getElementById(STYLE_ID);
  if (!link) {
    link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
  }
  link.href = href;
  document.head.append(link);
  return link;
}

function updatePrimaryNavigation() {
  const nav = document.getElementById("primary-nav");
  if (!nav) return;

  const why = [...nav.querySelectorAll("a")].find(link =>
    link.getAttribute("href") === "#why" || link.textContent.trim().toUpperCase() === "WHY"
  );
  if (why) {
    why.href = "workspace.html";
    why.textContent = "Workspace";
  }
  nav.dataset.finalNavigation = "v662";
}

function removeHomepageWorkspaceRuntime() {
  [
    "kidults-living-workspace",
    "kidults-copilot",
    "kidults-compare-engine",
    "kidults-decision-engine"
  ].forEach(id => document.getElementById(id)?.remove());
}

function createWorkspaceEntry() {
  document.querySelectorAll(".workspace-entry-section").forEach(section => section.remove());

  const section = document.createElement("section");
  section.id = "workspace-entry";
  section.className = "section workspace-entry-section";
  section.setAttribute("aria-labelledby", "workspace-entry-title");
  section.innerHTML = `
    <div class="shell workspace-entry-compact">
      <div class="workspace-entry-copy">
        <p class="eyebrow">KIDULTS INTELLIGENCE WORKSPACE</p>
        <h2 id="workspace-entry-title">Move from evidence to action.</h2>
        <p>Ask Registry-grounded questions, compare objects and categories, or review structured decision support in a dedicated environment.</p>
        <div class="workspace-entry-modes" aria-label="Workspace modes">
          <span>Ask</span><i></i><span>Compare</span><i></i><span>Decide</span>
        </div>
      </div>
      <a class="button button-primary workspace-entry-button" href="workspace.html">Open Intelligence Workspace <span>→</span></a>
    </div>
  `;
  return section;
}

function reorderHomepage() {
  const main = document.getElementById("main");
  if (!main) return;

  removeHomepageWorkspaceRuntime();
  const workspaceEntry = createWorkspaceEntry();
  const release = main.querySelector(".release-baseline");
  const ordered = [
    document.getElementById("discover"),
    main.querySelector(".snapshot-section"),
    document.getElementById("why"),
    document.getElementById("verticals"),
    document.getElementById("k100"),
    document.getElementById("markets"),
    main.querySelector(".evidence-section"),
    main.querySelector(".operations-section"),
    document.getElementById("research"),
    document.getElementById("archive"),
    workspaceEntry,
    document.getElementById("institution"),
    release
  ].filter(Boolean);

  ordered.forEach(section => main.append(section));
  main.dataset.finalStructure = "v662";
}

export function startHomepageStructure() {
  updatePrimaryNavigation();
  reorderHomepage();
  ensureStylesheet();
  document.documentElement.dataset.homepageStructure = "v662";

  window.KIDULTS_HOMEPAGE_STRUCTURE = Object.freeze({
    version: VERSION,
    entry: "HOME",
    workspaceRoute: "workspace.html",
    workspaceMountedOnHome: false,
    order: [
      "Hero",
      "Platform Snapshot",
      "Intelligence Method",
      "Eight Core Verticals",
      "Kidult 100",
      "Market Signals",
      "Evidence",
      "Operational Control",
      "Research",
      "Archive",
      "Workspace Entry",
      "Institution",
      "Release Baseline"
    ]
  });
  return window.KIDULTS_HOMEPAGE_STRUCTURE;
}
