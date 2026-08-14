const STYLE_ID = "kidults-v661-final-freeze-style";
const VERSION = "1.0.0";

function ensureStylesheet() {
  const href = "components/v661-final-freeze.css?v=661";
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return existing;
  }
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
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
  nav.dataset.finalNavigation = "v661";
}

function createWorkspaceEntry() {
  const existing = document.getElementById("workspace-entry");
  if (existing) return existing;

  const section = document.createElement("section");
  section.id = "workspace-entry";
  section.className = "section workspace-entry-section";
  section.setAttribute("aria-labelledby", "workspace-entry-title");
  section.innerHTML = `
    <div class="shell">
      <div class="section-heading split-heading workspace-entry-heading">
        <div>
          <p class="eyebrow">KIDULTS INTELLIGENCE WORKSPACE</p>
          <h2 id="workspace-entry-title">Move from evidence<br>to action.</h2>
        </div>
        <p>Enter a dedicated, Registry-grounded workspace after exploring the platform. Ask questions, compare objects and categories, or review structured decision support without losing source traceability.</p>
      </div>
      <div class="workspace-entry-grid">
        <a class="workspace-entry-card" href="workspace.html?mode=ask">
          <span>01</span>
          <h3>Ask</h3>
          <p>Question the current evidence baseline and receive bounded, source-traceable answers.</p>
          <b>Open Ask <i>→</i></b>
        </a>
        <a class="workspace-entry-card" href="workspace.html?mode=compare">
          <span>02</span>
          <h3>Compare</h3>
          <p>Compare objects, categories and markets across the same governed data context.</p>
          <b>Open Compare <i>→</i></b>
        </a>
        <a class="workspace-entry-card" href="workspace.html?mode=decide">
          <span>03</span>
          <h3>Decide</h3>
          <p>Review alternatives, limitations and evidence gaps before taking the next action.</p>
          <b>Open Decide <i>→</i></b>
        </a>
      </div>
      <a class="button button-primary workspace-entry-button" href="workspace.html">Open Intelligence Workspace <span>→</span></a>
    </div>
  `;
  return section;
}

function reorderHomepage() {
  const main = document.getElementById("main");
  if (!main) return;

  const workspaceEntry = createWorkspaceEntry();
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
    document.getElementById("institution")
  ].filter(Boolean);

  ordered.forEach(section => main.append(section));
  main.dataset.finalStructure = "v661";
}

export function startHomepageStructure() {
  ensureStylesheet();
  updatePrimaryNavigation();
  reorderHomepage();
  document.documentElement.dataset.homepageStructure = "v661";

  window.KIDULTS_HOMEPAGE_STRUCTURE = Object.freeze({
    version: VERSION,
    entry: "HOME",
    workspaceRoute: "workspace.html",
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
      "Institution"
    ]
  });
  return window.KIDULTS_HOMEPAGE_STRUCTURE;
}
