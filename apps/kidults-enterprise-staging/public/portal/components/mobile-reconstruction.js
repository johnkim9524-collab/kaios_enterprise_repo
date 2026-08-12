const STYLE_ID = "kidults-mobile-reconstruction-style";
const HOTFIX_STYLE_ID = "kidults-mobile-overflow-hotfix-style";
const VERSION = "1.0.1";
const MOBILE_QUERY = "(max-width: 768px)";
const WORKSPACE_HASHES = new Set([
  "ask-kidults",
  "compare-intelligence",
  "decision-support"
]);

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-mobile-reconstruction",
  version: VERSION,
  compact_breakpoint_px: 480,
  mobile_breakpoint_px: 768,
  tablet_breakpoint_px: 1024,
  required_viewports_px: [320, 390, 768, 1024],
  minimum_touch_target_px: 44,
  modes: {
    pulse: "COMPACT_BAR_BOTTOM_SHEET",
    workspace_tabs: "ALL_VISIBLE",
    decision_label: "REVIEW",
    hero_visual: "CONTAIN",
    compare: "METRIC_CARDS",
    decision: "SINGLE_COLUMN",
    dialogs: "FULL_SCREEN_SINGLE_SCROLL",
    hash_restore: "AFTER_DYNAMIC_MOUNT",
    overflow: "AUDITED_NOT_MASKED"
  },
  truth_rules: {
    allow_data_mutation: false,
    allow_registry_mutation: false,
    preserve_engine_contracts: true,
    preserve_fail_closed_states: true,
    allow_hidden_horizontal_overflow: false
  }
});

let lastAuditSignature = "";

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    modes: {
      ...DEFAULT_CONTRACT.modes,
      ...(candidate.modes ?? {})
    },
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    }
  };
}

function appendStylesheet(id, href) {
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return Promise.resolve(existing);
  }

  return new Promise(resolve => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener("error", () => resolve(link), { once: true });
    document.head.append(link);
  });
}

function ensureStylesheets() {
  return Promise.all([
    appendStylesheet(STYLE_ID, "components/mobile-reconstruction.css?v=653"),
    appendStylesheet(HOTFIX_STYLE_ID, "components/mobile-overflow-hotfix.css?v=653")
  ]).then(links => {
    document.documentElement.dataset.mobileStyles = "ready";
    return links;
  });
}

function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function annotateWorkspaceHeading() {
  const title = document.getElementById("living-workspace-title");
  if (!title || title.dataset.mobileSplit === "true") return;

  title.dataset.mobileSplit = "true";
  title.setAttribute("aria-label", "Observe. Understand. Decide.");
  title.innerHTML = ["Observe.", "Understand.", "Decide."]
    .map(word => `<span>${word}</span>`)
    .join("");
}

function annotateWorkspaceTabs() {
  document.querySelectorAll("[data-workspace-tab]").forEach(tab => {
    const label = tab.querySelector("b");
    if (!label) return;
    const panel = tab.dataset.workspaceTab;
    label.dataset.mobileLabel = panel === "decision"
      ? "Review"
      : label.textContent.trim();
    tab.dataset.mobileReady = "true";
    if (panel === "decision") {
      tab.setAttribute("aria-label", "Review decision support");
    }
  });
}

function pulseState(root) {
  return String(root?.dataset.state ?? "WAITING").replaceAll("_", " ");
}

function syncPulseSummary(root) {
  if (!root) return;
  const identity = root.querySelector("[data-pulse-toggle].living-pulse__identity");
  if (!identity) return;

  let summary = identity.querySelector("[data-mobile-pulse-state]");
  if (!summary) {
    summary = document.createElement("em");
    summary.className = "living-pulse__mobile-state";
    summary.dataset.mobilePulseState = "";
    identity.append(summary);
  }

  const state = pulseState(root);
  summary.textContent = `${state} · SYSTEM STATUS`;
  identity.setAttribute("aria-label", `Living Intelligence system status: ${state}`);
}

function syncOverlayState() {
  const pulse = document.getElementById("kidults-living-pulse");
  const pulseOpen = Boolean(pulse?.classList.contains("is-open"));
  const dialogOpen = Boolean(document.querySelector("dialog[open]"));
  document.body.classList.toggle("mobile-pulse-open", isMobile() && pulseOpen);
  document.body.classList.toggle("mobile-dialog-open", isMobile() && dialogOpen);
}

function setupPulseSheet() {
  const root = document.getElementById("kidults-living-pulse");
  if (!root) return null;
  syncPulseSummary(root);

  const observer = new MutationObserver(() => {
    syncPulseSummary(root);
    syncOverlayState();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-state"]
  });
  return observer;
}

function setupDialogSheets() {
  const observed = new WeakSet();
  const observers = [];

  const observe = dialog => {
    if (!(dialog instanceof HTMLDialogElement) || observed.has(dialog)) return;
    observed.add(dialog);
    const observer = new MutationObserver(syncOverlayState);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    observers.push(observer);
  };

  document.querySelectorAll("dialog").forEach(observe);
  const bodyObserver = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node instanceof HTMLDialogElement) observe(node);
        if (node instanceof Element) node.querySelectorAll?.("dialog").forEach(observe);
      });
    }
    syncOverlayState();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  observers.push(bodyObserver);
  syncOverlayState();
  return observers;
}

function annotateCompareTable() {
  const table = document.querySelector("[data-compare-table]");
  if (!table) return;

  const headers = [...table.querySelectorAll(".compare-engine__table-head strong")]
    .map(node => node.textContent.trim());
  const leftLabel = headers[0] || "Left";
  const rightLabel = headers[1] || "Right";

  table.querySelectorAll(".compare-engine__row").forEach(row => {
    const values = row.querySelectorAll(".compare-engine__value");
    if (values[0]) values[0].dataset.mobileLabel = leftLabel;
    if (values[1]) values[1].dataset.mobileLabel = rightLabel;
    const delta = row.querySelector(".compare-engine__delta");
    if (delta) delta.dataset.mobileLabel = "Recorded difference";
  });
  table.dataset.mobileAnnotated = "true";
}

function setupCompareCards() {
  const table = document.querySelector("[data-compare-table]");
  if (!table) return null;
  annotateCompareTable();
  const observer = new MutationObserver(annotateCompareTable);
  observer.observe(table, { childList: true, subtree: true });
  return observer;
}

function targetFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash || WORKSPACE_HASHES.has(hash)) return null;
  try {
    return document.getElementById(decodeURIComponent(hash));
  } catch {
    return document.getElementById(hash);
  }
}

function restoreHashTarget({ behavior = "auto" } = {}) {
  const target = targetFromHash();
  if (!target) return false;
  target.scrollIntoView({ behavior, block: "start" });
  return true;
}

function scheduleHashRestore() {
  const restore = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => restoreHashTarget());
    });
  };

  window.addEventListener("hashchange", restore, { passive: true });
  window.addEventListener("load", restore, { once: true, passive: true });
  const fontsReady = document.fonts?.ready;
  if (fontsReady?.then) fontsReady.then(restore).catch(() => {});
  window.setTimeout(restore, 80);
  window.setTimeout(restore, 260);
  return restore;
}

function elementLabel(element) {
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList].slice(0, 3).map(name => `.${name}`).join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function isAuditExcluded(element) {
  if (element.matches("script,style,template,[hidden],.sr-only")) return true;
  if (element.matches(".living-pulse__orb,.vertical-glyph")) return true;
  if (element.closest("dialog:not([open])")) return true;
  return false;
}

function isClippedByAncestor(element) {
  const elementRect = element.getBoundingClientRect();
  let ancestor = element.parentElement;

  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    if (["hidden", "clip"].includes(style.overflowX)) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (elementRect.left < ancestorRect.left - 1 || elementRect.right > ancestorRect.right + 1) {
        return true;
      }
    }
    ancestor = ancestor.parentElement;
  }
  return false;
}

function auditOverflow() {
  if (!isMobile()) {
    document.documentElement.dataset.mobileOverflow = "not-applicable";
    document.documentElement.dataset.mobileOverflowPx = "0";
    lastAuditSignature = "";
    return [];
  }

  const viewport = document.documentElement.clientWidth;
  const documentWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body?.scrollWidth ?? 0
  );
  const rootOverflowPx = Math.max(0, Math.ceil(documentWidth - viewport));
  document.documentElement.dataset.mobileOverflowPx = String(rootOverflowPx);

  if (rootOverflowPx <= 1) {
    document.documentElement.dataset.mobileOverflow = "clear";
    lastAuditSignature = "";
    return [];
  }

  const offenderElements = [...document.body.querySelectorAll("*")].filter(element => {
    if (!(element instanceof HTMLElement) || isAuditExcluded(element)) return false;

    const style = window.getComputedStyle(element);
    if (style.position === "fixed" && element.hidden) return false;

    const rect = element.getBoundingClientRect();
    const overflowMode = style.overflowX;
    const intrinsicOverflow =
      element.clientWidth > 0 &&
      element.scrollWidth > element.clientWidth + 1 &&
      !["auto", "scroll", "hidden", "clip"].includes(overflowMode);
    const viewportOverflow =
      rect.width > viewport + 1 ||
      rect.left < -1 ||
      rect.right > viewport + 1;

    if (!intrinsicOverflow && !viewportOverflow) return false;
    return !isClippedByAncestor(element);
  });

  const offenderSet = new Set(offenderElements);
  const leafOffenders = offenderElements.filter(element =>
    ![...element.children].some(child => offenderSet.has(child))
  );
  const unique = [...new Set(leafOffenders.map(elementLabel))].slice(0, 20);
  if (!unique.length) unique.push("document.documentElement");

  document.documentElement.dataset.mobileOverflow = "detected";
  const signature = `${rootOverflowPx}:${unique.join("|")}`;
  if (signature !== lastAuditSignature) {
    console.warn(`KIDULTS mobile overflow audit detected ${rootOverflowPx}px of real document overflow:`, unique);
    lastAuditSignature = signature;
  }
  return unique;
}

function setupResponsiveState(stylesReady) {
  const media = window.matchMedia(MOBILE_QUERY);
  let ready = false;

  const update = () => {
    document.documentElement.dataset.mobileViewport = media.matches ? "compact" : "wide";
    syncOverlayState();
    if (ready) window.requestAnimationFrame(auditOverflow);
  };

  stylesReady.finally(() => {
    ready = true;
    update();
  });
  media.addEventListener?.("change", update);
  window.addEventListener("resize", () => window.requestAnimationFrame(update), { passive: true });
  update();
  return update;
}

function initializeShared() {
  const stylesReady = ensureStylesheets();
  document.documentElement.dataset.mobileReconstruction = "v1";
  annotateWorkspaceHeading();
  annotateWorkspaceTabs();
  const pulseObserver = setupPulseSheet();
  const compareObserver = setupCompareCards();
  const dialogObservers = setupDialogSheets();
  const restore = scheduleHashRestore();
  const refresh = setupResponsiveState(stylesReady);

  stylesReady.finally(() => {
    window.setTimeout(auditOverflow, 160);
    window.setTimeout(auditOverflow, 520);
  });

  return {
    pulseObserver,
    compareObserver,
    dialogObservers,
    restore,
    refresh,
    stylesReady
  };
}

export function startMobileReconstruction({ contract } = {}) {
  const normalized = normalizeContract(contract);
  const runtime = initializeShared();

  window.KIDULTS_MOBILE = Object.freeze({
    engine: normalized.engine_id,
    version: normalized.version,
    breakpoints: Object.freeze({
      compact: normalized.compact_breakpoint_px,
      mobile: normalized.mobile_breakpoint_px,
      tablet: normalized.tablet_breakpoint_px
    }),
    requiredViewports: normalized.required_viewports_px.slice(),
    minimumTouchTarget: normalized.minimum_touch_target_px,
    modes: Object.freeze({ ...normalized.modes }),
    truthRules: Object.freeze({ ...normalized.truth_rules }),
    restoreHash: runtime.restore,
    audit: auditOverflow,
    refresh: runtime.refresh
  });

  return window.KIDULTS_MOBILE;
}

export function startDetailMobileReconstruction() {
  if (window.KIDULTS_MOBILE) return window.KIDULTS_MOBILE;
  return startMobileReconstruction();
}
