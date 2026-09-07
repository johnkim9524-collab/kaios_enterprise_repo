import { buildIntelligenceDecision } from "./v587-intelligence-core.js";

const STYLE_ID = "kidults-v587-decision-intelligence-style";
const DRAWER_ID = "kidults-v587-evidence-drawer";
const SYNTHETIC_NOTICE = "SYNTHETIC TEST DATA";
const BUCKETS = new Set(["CURRENT", "HISTORICAL", "PROJECTED", "SYNTHETIC"]);

const esc = value => String(value ?? "NOT AVAILABLE").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));
const human = value => String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
const present = value => value !== null && value !== undefined && value !== "";
const isSynthetic = record => record?.data_bucket === "SYNTHETIC" || record?.environment === "SYNTHETIC" || record?.synthetic === true;
const score = value => {
  if (!present(value)) return null;
  const numeric = Number(String(value).replace("%", ""));
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
};
const rightsInput = record => ({
  rights: record?.rights_status ?? record?.rights_state,
  permission: record?.permission ?? record?.rights_permission,
  release_state: record?.release_state ?? record?.rights_release_state,
  allowed_actions: record?.allowed_actions ?? []
});

export function assertDecisionDataSeparation(record) {
  const bucket = record?.data_bucket ?? (record?.environment === "SYNTHETIC" || record?.synthetic === true ? "SYNTHETIC" : "CURRENT");
  if (!BUCKETS.has(bucket)) throw new Error("V587_DATA_BUCKET_INVALID");
  if (bucket === "SYNTHETIC") {
    if (record.environment !== "SYNTHETIC" || record.empirical !== false || record.production_eligible !== false
      || record.public_eligible !== false || record.market_authority !== false) {
      throw new Error("V587_SYNTHETIC_BOUNDARY_INVALID");
    }
    if (!String(record.portal_label ?? "").includes(SYNTHETIC_NOTICE)) {
      throw new Error("V587_SYNTHETIC_NOTICE_REQUIRED");
    }
  }
  return bucket;
}

function operation(summary, label) {
  return summary?.operations?.find(item => item.label === label) ?? null;
}

export function buildDecisionSnapshot(data) {
  const registry = data?.registry ?? {};
  const evidence = operation(data?.summary, "EVIDENCE OBJECTS");
  const rights = data?.connections?.sources?.filter(source => source.publicationEligible === true).length ?? 0;
  const sourceCount = data?.connections?.sources?.length ?? 0;
  const intelligence = buildIntelligenceDecision({
    factors: {
      evidence: score(registry.evidence?.coverage_pct),
      coverage: score(data?.summary?.coverage?.coverage_pct),
      freshness: registry.freshness?.status,
      rights: sourceCount > 0 ? Math.round((rights / sourceCount) * 100) : null,
      consistency: score(registry.evidence?.consistency_pct),
      qualification: registry.assessment?.gate_state
    },
    rights: {
      rights: rights === sourceCount && sourceCount > 0 ? "CLEARED" : rights > 0 ? "PARTIAL" : "HOLD",
      permission: registry.release?.portal_permission,
      release_state: registry.release?.status,
      allowed_actions: registry.release?.allowed_actions ?? []
    },
    requestedAction: "VIEW",
    reason: "Platform decision readiness requires evidence, coverage, freshness, rights, consistency and independent qualification."
  });
  return {
    decision: intelligence.decision,
    decision_reason: intelligence.reason,
    fields: [
      ["Decision Readiness", intelligence.decision],
      ["Evidence Coverage", present(evidence?.value) ? evidence.value : "NOT AVAILABLE"],
      ["Confidence", intelligence.confidence.label],
      ["Rights Coverage", sourceCount > 0 ? `${rights}/${sourceCount} RELEASE ELIGIBLE` : "HOLD"],
      ["Current SOLD", "NOT AVAILABLE"],
      ["Freshness", registry.freshness?.as_of ?? "NOT AVAILABLE"]
    ],
    confidence_explanation: intelligence.confidence.explanation,
    reasoning: intelligence,
    evidence_state: registry.evidence?.status ?? "NOT AVAILABLE",
    rights_state: rights > 0 ? "PARTIAL" : "HOLD",
    track_b: registry.assessment?.gate_state ?? "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE",
    risk: intelligence.decision === "READY" ? "REVIEW REQUIRED" : "HIGH — RELEASE GATES UNRESOLVED",
    production: "HOLD",
    public: "HOLD"
  };
}

export function buildMarketCardMetadata(signal, data) {
  const synthetic = isSynthetic(signal);
  if (synthetic) assertDecisionDataSeparation(signal);
  const rightsReleased = data?.connections?.sources?.some(source => source.publicationEligible === true) === true;
  const intelligence = buildIntelligenceDecision({
    synthetic,
    factors: {
      evidence: score(signal?.evidence_coverage_pct),
      coverage: score(signal?.coverage_pct),
      freshness: signal?.freshness_score ?? signal?.freshness_state,
      rights: signal?.rights_status ?? (rightsReleased ? "PARTIAL" : "HOLD"),
      consistency: score(signal?.consistency_pct),
      qualification: data?.registry?.assessment?.gate_state
    },
    rights: rightsInput(signal),
    requestedAction: "VIEW",
    reason: "Market signal review remains bound to registered evidence and release rights."
  });
  return {
    confidence: intelligence.confidence.label,
    confidence_explanation: intelligence.confidence.explanation,
    freshness: signal?.updated ?? data?.signals?.updated_at ?? "NOT AVAILABLE",
    rights: intelligence.rights.release_state,
    decision: intelligence.decision,
    market_authority: false,
    decision_eligible: false
  };
}

export function buildObjectDecisionModel(object, k100, manifest, registry = {}) {
  const synthetic = isSynthetic(object);
  if (synthetic) assertDecisionDataSeparation(object);
  const rights = object?.rights_status ?? "HOLD";
  const trackB = registry.assessment?.gate_state ?? "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE";
  const currentSold = object?.current_sold?.verified === true && !synthetic
    ? object.current_sold.display_value : "NOT AVAILABLE";
  const evidenceCount = Number.isInteger(object?.evidence_count) && !synthetic
    ? String(object.evidence_count) : "NOT AVAILABLE";
  const intelligence = buildIntelligenceDecision({
    synthetic,
    factors: {
      evidence: score(object?.evidence_coverage_pct),
      coverage: score(object?.coverage_pct),
      freshness: object?.freshness_score ?? object?.freshness_state,
      rights,
      consistency: score(object?.consistency_pct),
      qualification: trackB
    },
    rights: rightsInput(object),
    requestedAction: "VIEW",
    reason: currentSold === "NOT AVAILABLE"
      ? "Current SOLD evidence is not registered."
      : "Object review is bound to Current SOLD evidence and qualification gates."
  });
  const confidence = intelligence.confidence.label;
  const decision = intelligence.decision;
  return {
    object_id: object?.id ?? object?.record_id ?? "NOT AVAILABLE",
    synthetic,
    notice: synthetic ? SYNTHETIC_NOTICE : null,
    hierarchy: [
      ["Identity", object?.title ?? object?.canonical_entity?.display_name ?? "NOT AVAILABLE"],
      ["Current SOLD", currentSold],
      ["Evidence", evidenceCount],
      ["Confidence", confidence],
      ["Rights", rights],
      ["Research", manifest?.methodology_version ?? k100?.methodology ?? "NOT REGISTERED"],
      ["Projection", synthetic ? "SYNTHETIC INTERNAL ONLY" : manifest?.status ?? "HOLD"],
      ["Decision", decision]
    ],
    panel: {
      decision,
      confidence,
      evidence: evidenceCount,
      rights,
      track_b: trackB,
      risk: decision === "HOLD" ? "UNRESOLVED GATES" : "REVIEW REQUIRED",
      freshness: object?.freshness ?? registry.freshness?.as_of ?? "NOT AVAILABLE"
    },
    confidence_explanation: intelligence.confidence.explanation,
    reasoning: intelligence,
    evidence_drawer: {
      timeline: [object?.freshness ?? "NOT AVAILABLE"],
      sources: evidenceCount === "NOT AVAILABLE" ? [] : ["REGISTERED EVIDENCE LEDGER"],
      quality: confidence,
      freshness: object?.freshness ?? "NOT AVAILABLE",
      provider: "NONE ACTIVATED"
    },
    production_eligible: false,
    public_eligible: false,
    market_authority: false
  };
}

export function buildResearchDecisionFlow(data) {
  const intelligence = buildIntelligenceDecision({
    factors: {
      evidence: score(data?.research?.evidence_coverage_pct),
      coverage: score(data?.research?.coverage_pct),
      freshness: data?.research?.freshness_state,
      rights: data?.research?.rights_status,
      consistency: score(data?.research?.consistency_pct),
      qualification: data?.registry?.assessment?.gate_state
    },
    rights: rightsInput(data?.research),
    requestedAction: "VIEW",
    reason: "Research conclusions require registered evidence, context and qualification."
  });
  return {
    timeline: data?.research?.issue ?? "NOT AVAILABLE",
    evidence_state: data?.registry?.evidence?.status ?? "NOT AVAILABLE",
    reasoning: intelligence,
    conclusion: intelligence.decision,
    final_decision_allowed: false
  };
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/v587-decision-intelligence.css?v=587-intelligence-1";
  document.head.append(link);
}

function evidenceButton(context = "platform") {
  return `<button class="text-link v587-evidence-trigger" type="button" data-v587-evidence-open="${esc(context)}">Evidence <span aria-hidden="true">→</span></button>`;
}

function ensureEvidenceDrawer() {
  let drawer = document.getElementById(DRAWER_ID);
  if (drawer) return drawer;
  drawer = document.createElement("aside");
  drawer.id = DRAWER_ID;
  drawer.className = "v587-evidence-drawer";
  drawer.setAttribute("aria-labelledby", "v587-evidence-drawer-title");
  drawer.setAttribute("aria-hidden", "true");
  drawer.hidden = true;
  drawer.innerHTML = `
    <header><div><p class="eyebrow">EVIDENCE</p><h2 id="v587-evidence-drawer-title">Decision evidence</h2></div>
      <button type="button" data-v587-evidence-close aria-label="Close evidence drawer">Close</button></header>
    <div data-v587-evidence-body></div>`;
  document.body.append(drawer);
  return drawer;
}

function renderDrawer(drawer, evidence) {
  const body = drawer.querySelector("[data-v587-evidence-body]");
  const rows = [
    ["Timeline", evidence.timeline ?? "NOT AVAILABLE"],
    ["Sources", evidence.sources ?? "NOT AVAILABLE"],
    ["Quality", evidence.quality ?? "NOT AVAILABLE"],
    ["Freshness", evidence.freshness ?? "NOT AVAILABLE"],
    ["Provider", evidence.provider ?? "NONE ACTIVATED"]
  ];
  body.innerHTML = rows.map(([label, value]) => `<section><p class="eyebrow">${esc(label)}</p><p>${esc(Array.isArray(value) ? value.join(", ") || "NOT AVAILABLE" : value)}</p></section>`).join("");
}

function bindDrawer(drawer, resolveEvidence) {
  let returnFocus = null;
  const close = () => {
    drawer.dataset.open = "false";
    drawer.setAttribute("aria-hidden", "true");
    drawer.hidden = true;
    document.body.classList.remove("v587-drawer-open");
    returnFocus?.focus?.();
  };
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-v587-evidence-open]");
    if (trigger) {
      returnFocus = trigger;
      renderDrawer(drawer, resolveEvidence(trigger.dataset.v587EvidenceOpen));
      drawer.hidden = false;
      drawer.dataset.open = "true";
      drawer.setAttribute("aria-hidden", "false");
      document.body.classList.add("v587-drawer-open");
      drawer.querySelector("[data-v587-evidence-close]")?.focus();
    }
    if (event.target.closest("[data-v587-evidence-close]")) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && drawer.dataset.open === "true") close(); });
}

function renderDecisionSnapshot(data, snapshot) {
  const hero = document.getElementById("discover");
  if (!hero || document.getElementById("v587-decision-snapshot")) return;
  const section = document.createElement("section");
  section.id = "v587-decision-snapshot";
  section.className = "v587-decision-snapshot";
  section.setAttribute("aria-labelledby", "v587-decision-snapshot-title");
  section.innerHTML = `<div class="shell"><header><div><p class="eyebrow">DECISION SNAPSHOT</p>
      <h2 id="v587-decision-snapshot-title">Evidence before decision.</h2></div>
      <div><strong>${esc(snapshot.decision)}</strong><small>${esc(snapshot.decision_reason)}</small></div></header>
    <div class="v587-decision-snapshot__grid">${snapshot.fields.map(([label, value]) =>
      `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("")}</div>
    <footer>${evidenceButton("platform")}</footer></div>`;
  hero.insertAdjacentElement("afterend", section);
  section.dataset.source = data?.registry?.projection_id ?? "NOT AVAILABLE";
}

function extendMarketCards(data) {
  const cards = [...document.querySelectorAll("[data-signal-grid] .signal-card")];
  cards.forEach((card, index) => {
    if (card.querySelector("[data-v587-market-meta]")) return;
    const meta = buildMarketCardMetadata(data.signals?.signals?.[index], data);
    const node = document.createElement("dl");
    node.dataset.v587MarketMeta = "true";
    node.className = "v587-market-badges";
    node.setAttribute("aria-label", "Signal confidence, rights and freshness");
    node.innerHTML = [["Confidence", meta.confidence], ["Rights", meta.rights], ["Freshness", meta.freshness]]
      .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
    card.append(node);
    card.insertAdjacentHTML("beforeend", evidenceButton(`market-${index}`));
  });
}

function extendResearch(data) {
  const host = document.querySelector(".research-layout");
  if (!host || host.querySelector("[data-v587-research-flow]")) return;
  const flow = buildResearchDecisionFlow(data);
  const node = document.createElement("section");
  node.className = "v587-research-timeline";
  node.dataset.v587ResearchFlow = "true";
  node.setAttribute("aria-label", "Research evidence timeline");
  node.innerHTML = `<p class="eyebrow">EVIDENCE TIMELINE</p><time>${esc(flow.timeline)}</time><span>${esc(flow.evidence_state)}</span>`;
  host.append(node);
}

export function startV587DecisionIntelligence(data) {
  ensureStylesheet();
  const snapshot = buildDecisionSnapshot(data);
  renderDecisionSnapshot(data, snapshot);
  extendMarketCards(data);
  extendResearch(data);
  const drawer = ensureEvidenceDrawer();
  bindDrawer(drawer, context => ({
    timeline: data.registry?.freshness?.as_of ?? "NOT AVAILABLE",
    sources: context.startsWith("market-")
      ? `${data.signals?.signals?.[Number(context.split("-")[1])]?.sources ?? "NOT AVAILABLE"} registered preview sources`
      : data.registry?.evidence?.status ?? "NOT AVAILABLE",
    quality: context.startsWith("market-")
      ? (() => { const meta = buildMarketCardMetadata(data.signals?.signals?.[Number(context.split("-")[1])], data); return `${meta.confidence} — ${meta.confidence_explanation}`; })()
      : `${snapshot.fields.find(([label]) => label === "Confidence")?.[1] ?? "NOT AVAILABLE"} — ${snapshot.confidence_explanation}`,
    freshness: data.registry?.freshness?.status ?? "NOT AVAILABLE",
    provider: data.registry?.provider?.production_connection === "PROHIBITED" ? "NONE ACTIVATED" : "HOLD"
  }));
  document.documentElement.dataset.v587Intelligence = "1";
  window.KIDULTS_V587_INTELLIGENCE = Object.freeze({ version: "1.0.0", snapshot, production: "HOLD", public: "HOLD", g5: "HOLD" });
  return window.KIDULTS_V587_INTELLIGENCE;
}

export function enrichObjectDetailV587({ root, object, k100, manifest, registry = {} }) {
  ensureStylesheet();
  const model = buildObjectDecisionModel(object, k100, manifest, registry);
  const hierarchy = document.createElement("section");
  hierarchy.className = "detail-section v587-object-hierarchy";
  hierarchy.setAttribute("aria-labelledby", "v587-object-intelligence-title");
  hierarchy.innerHTML = `${model.synthetic ? `<strong class="v587-synthetic-notice">${SYNTHETIC_NOTICE}</strong>` : ""}
    <p class="eyebrow">DECISION INTELLIGENCE</p><h2 id="v587-object-intelligence-title">From identity to decision.</h2>
    <ol>${model.hierarchy.map(([label, value]) => `<li><span>${esc(label)}</span><strong>${esc(value)}</strong></li>`).join("")}</ol>
    ${evidenceButton("object")}`;
  root.append(hierarchy);

  const panel = document.createElement("aside");
  panel.className = "v587-decision-panel";
  panel.setAttribute("aria-label", "Decision panel");
  panel.innerHTML = `<p class="eyebrow">DECISION PANEL</p>${Object.entries(model.panel).map(([label, value]) =>
    `<div><span>${esc(human(label))}</span><strong>${esc(value)}</strong>${label === "confidence" ? `<small>${esc(model.confidence_explanation)}</small>` : ""}</div>`).join("")}`;
  root.querySelector(".detail-hero")?.insertAdjacentElement("afterend", panel);

  const drawer = ensureEvidenceDrawer();
  bindDrawer(drawer, () => model.evidence_drawer);
  document.documentElement.dataset.v587Intelligence = "1";
  return model;
}
