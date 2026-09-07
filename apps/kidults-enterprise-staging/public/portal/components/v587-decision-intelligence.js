import { buildIntelligenceDecision } from "./v587-intelligence-core.js";

const STYLE_ID = "kidults-v587-decision-intelligence-style";
const DRAWER_ID = "kidults-v587-evidence-drawer";
const SYNTHETIC_NOTICE = "SYNTHETIC TEST DATA";
const BUCKETS = new Set(["CURRENT", "HISTORICAL", "PROJECTED", "SYNTHETIC"]);
const EMPTY_STATES = new Set(["", "—", "NOT AVAILABLE", "NOT VERIFIED", "NOT REGISTERED", "WAITING", "HOLD"]);

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

export function operationalPortalValue(label, value, now = Date.now()) {
  const raw = String(value ?? "NOT AVAILABLE").trim();
  const normalized = raw.toUpperCase().replaceAll("_", " ");
  if (label === "Freshness") {
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) {
      const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60000));
      if (elapsedMinutes < 1) return "Updated just now";
      if (elapsedMinutes < 60) return `Updated ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
      if (elapsedMinutes < 24 * 60) return `Updated ${Math.floor(elapsedMinutes / 60)} hour${Math.floor(elapsedMinutes / 60) === 1 ? "" : "s"} ago`;
      return elapsedMinutes < 48 * 60 ? "Validated today" : "Awaiting provider qualification";
    }
    if (normalized.includes("PENDING") || EMPTY_STATES.has(normalized)) return "Awaiting provider qualification";
  }
  if (label === "Current SOLD" && (EMPTY_STATES.has(normalized) || normalized.includes("NOT AVAILABLE"))) return "Current SOLD not yet qualified";
  if (label === "Evidence" || label === "Evidence Coverage") {
    if (EMPTY_STATES.has(normalized) || normalized.includes("NOT AVAILABLE") || normalized.includes("WAITING")) return "Evidence not yet available";
  }
  if (label === "Timeline" && (EMPTY_STATES.has(normalized) || normalized.includes("NOT AVAILABLE"))) return "Awaiting provider qualification";
  if (label === "Sources" && (EMPTY_STATES.has(normalized) || normalized.includes("NOT AVAILABLE"))) return "Evidence not yet available";
  if (label === "Quality" && normalized.includes("NOT AVAILABLE")) return "Waiting for Evidence and Qualification";
  if (label === "Provider" && (normalized.includes("NONE ACTIVATED") || EMPTY_STATES.has(normalized))) return "Awaiting provider qualification";
  if (label === "Confidence" && (EMPTY_STATES.has(normalized) || normalized.includes("NOT AVAILABLE"))) return "Waiting for Evidence and Qualification";
  if (label === "Rights" || label === "Rights Coverage") {
    if (EMPTY_STATES.has(normalized) || normalized.includes("REVIEW REQUIRED") || normalized.includes("BLOCKED")) return "Rights not yet released";
  }
  if (label === "Qualification" || label === "Track B") {
    if (EMPTY_STATES.has(normalized) || normalized === "WAIT" || normalized.includes("WAITING FOR EXACT")) return "Awaiting provider qualification";
  }
  if (label === "Research" && (EMPTY_STATES.has(normalized) || normalized.includes("NOT YET REGISTERED"))) return "Research not yet available";
  if (label === "Projection" && (normalized.includes("RELEASE CANDIDATE") || EMPTY_STATES.has(normalized))) return "Awaiting Qualification";
  if (label === "Decision" || label === "Decision Readiness") {
    if (normalized.includes("RIGHTS BLOCKED")) return "Action unavailable — Rights not yet released";
    if (EMPTY_STATES.has(normalized) || normalized === "WAIT") return "Waiting for provider qualification";
  }
  return human(raw);
}

function researchIsAvailable(data) {
  const evidence = operationalPortalValue("Evidence", data?.registry?.evidence?.status);
  const qualification = operationalPortalValue("Qualification", data?.registry?.assessment?.gate_state ?? data?.registry?.assessment?.status);
  const projectionState = data?.integrationBus?.state ?? data?.meta?.governedApiState ?? "NO_PROJECTION";
  return projectionState === "LIVE_APPROVED"
    && evidence !== "Evidence not yet available"
    && qualification !== "Awaiting provider qualification";
}

export function buildResearchPresentation(data) {
  if (researchIsAvailable(data)) return Object.freeze({ available: true, ...data.research });
  return Object.freeze({
    available: false,
    issue: "EVIDENCE PENDING",
    title: "Research unavailable",
    subtitle: "Evidence pending",
    summary: "Qualification pending",
    sections: Object.freeze([
      Object.freeze({ index: "01", title: "Evidence", summary: "Evidence pending" }),
      Object.freeze({ index: "02", title: "Qualification", summary: "Qualification pending" }),
      Object.freeze({ index: "03", title: "Research", summary: "Research unavailable" })
    ])
  });
}

export function gateResearchSearchIndex(data) {
  const presentation = buildResearchPresentation(data);
  if (presentation.available) return data.searchIndex;
  return data.searchIndex.map(record => record.type !== "Research" ? record : {
    ...record,
    title: presentation.title,
    description: `${presentation.subtitle}. ${presentation.summary}. Research unavailable until Evidence and Qualification are complete.`,
    evidencePreview: "Evidence pending · Qualification pending · Research unavailable",
    keywords: ["research", "evidence pending", "qualification pending"],
    searchText: "research evidence pending qualification pending research unavailable"
  });
}

export function buildAvailabilityState(model) {
  const currentSold = operationalPortalValue("Current SOLD", model?.hierarchy?.find(([label]) => label === "Current SOLD")?.[1]);
  const qualification = operationalPortalValue("Qualification", model?.panel?.track_b);
  const rights = operationalPortalValue("Rights", model?.panel?.rights);
  if (qualification === "Awaiting provider qualification") return "Awaiting Qualification — Current SOLD cannot be used yet";
  if (rights === "Rights not yet released") return "Provider Restricted — Rights do not permit use";
  if (currentSold === "Current SOLD not yet qualified") return "Unavailable — Current SOLD evidence is not available";
  return "Available — Current SOLD is qualified for review";
}

export function buildPresenceContext(data, objectModel = null) {
  const registry = data?.registry ?? {};
  const projectionState = data?.integrationBus?.state ?? data?.meta?.governedApiState ?? "NO_PROJECTION";
  const evidence = operationalPortalValue("Evidence", registry.evidence?.status);
  const qualification = operationalPortalValue("Qualification", registry.assessment?.gate_state ?? registry.assessment?.status);
  const rights = operationalPortalValue("Rights", registry.release?.status);
  const freshness = operationalPortalValue("Freshness", registry.freshness?.as_of);
  const currentMarket = objectModel
    ? operationalPortalValue("Current SOLD", objectModel.hierarchy.find(([label]) => label === "Current SOLD")?.[1])
    : "Current Market not yet qualified";
  const availability = objectModel ? buildAvailabilityState(objectModel) : "Awaiting Qualification — Current SOLD cannot be used yet";
  const verifiedProjection = projectionState === "LIVE_APPROVED";
  return Object.freeze({
    projectionState,
    marketPulse: verifiedProjection ? `Latest Evidence · ${freshness}` : "Market Pulse · Governed projection unavailable · Awaiting verified Evidence",
    intelligenceStrip: verifiedProjection
      ? `Latest verified intelligence · ${freshness}`
      : "Latest verified intelligence · Awaiting a governed Evidence update",
    objectLines: Object.freeze([
      `Current Market · ${currentMarket} · Availability · ${availability}`,
      `Evidence · ${evidence} · Confidence · ${objectModel ? operationalPortalValue("Confidence", objectModel.panel.confidence) : "Waiting for Evidence and Qualification"}`
    ]),
    workspace: `Evidence · ${evidence} · Qualification · ${qualification} · Rights · ${rights} · ${currentMarket}`,
    research: Object.freeze([
      `Evidence Window · ${evidence}`,
      `Qualification Window · ${qualification}`
    ]),
    confidenceBasis: "Confidence · Evidence → Freshness → Rights → Qualification",
    rights,
    qualification,
    freshness
  });
}

function stateGuidance(label, value) {
  const displayed = operationalPortalValue(label, value);
  if (label === "Confidence") return "Evidence, Freshness, Rights and Qualification determine this value.";
  if (label === "Rights" || label === "Rights Coverage") return displayed === "Rights not yet released" ? "Viewing remains available; Export and Publish require released Rights." : "Available actions follow the released Rights record.";
  if (label === "Decision" || label === "Decision Readiness") return displayed.startsWith("Action unavailable") ? "Complete Rights and Qualification before taking action." : "Review the Evidence before taking action.";
  return null;
}

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
  const governed = data?.governedProjection;
  const evidence = operation(data?.summary, "EVIDENCE OBJECTS");
  const rights = data?.connections?.sources?.filter(source => source.publicationEligible === true).length ?? 0;
  const sourceCount = data?.connections?.sources?.length ?? 0;
  const syntheticCurrentSold = data?.governedProjection?.objects?.filter(object => object?.current_sold?.state === "SYNTHETIC_SOLD_CONTROL").length ?? 0;
  const governedCurrentSold = data?.governedProjection?.objects?.filter(object => object?.current_sold?.verified === true && object?.synthetic !== true).length ?? 0;
  const fallbackIntelligence = buildIntelligenceDecision({
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
  const intelligence = governed?.decision_intelligence ?? fallbackIntelligence;
  const governedEvidenceCount = Array.isArray(governed?.evidence) ? governed.evidence.length : null;
  return {
    decision: intelligence.decision,
    decision_reason: intelligence.reason,
    fields: [
      ["Decision Readiness", intelligence.decision],
      ["Evidence Coverage", governedEvidenceCount > 0 ? `${governedEvidenceCount} GOVERNED` : present(evidence?.value) ? evidence.value : "NOT AVAILABLE"],
      ["Confidence", intelligence.confidence.label],
      ["Rights Coverage", governed?.release?.state ?? (sourceCount > 0 ? `${rights}/${sourceCount} RELEASE ELIGIBLE` : "HOLD")],
      ["Current SOLD", governedCurrentSold > 0 ? `${governedCurrentSold} GOVERNED` : syntheticCurrentSold > 0 ? `${syntheticCurrentSold} SYNTHETIC CONTROL` : "NOT AVAILABLE"],
      ["Freshness", registry.freshness?.as_of ?? "NOT AVAILABLE"]
    ],
    confidence_explanation: intelligence.confidence.explanation,
    reasoning: intelligence,
    evidence_state: governed?.evidence_methodology?.coverage ?? registry.evidence?.status ?? "NOT AVAILABLE",
    rights_state: intelligence.rights.release_state,
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
    ? object.current_sold.display_value
    : synthetic && object?.current_sold?.state === "SYNTHETIC_SOLD_CONTROL"
      ? `SYNTHETIC CONTROL · ${object.current_sold.display_value}` : "NOT AVAILABLE";
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
  const model = {
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
  model.hierarchy.splice(2, 0, ["Availability", buildAvailabilityState(model)]);
  return model;
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
  link.href = "components/v587-decision-intelligence.css?v=587-graduation-1";
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
  body.innerHTML = `<section class="v587-evidence-why"><p class="eyebrow">WHY THIS MATTERS</p>
    <p>Evidence shows what supports this decision and whether it is current. Rights and Qualification determine which actions are available.</p></section>${rows.map(([label, value]) => {
      const resolved = Array.isArray(value) ? value.join(", ") : value;
      return `<section><p class="eyebrow">${esc(label)}</p><p>${esc(operationalPortalValue(label, resolved))}</p></section>`;
    }).join("")}`;
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
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && drawer.dataset.open === "true") close();
    if (event.key !== "Tab" || drawer.dataset.open !== "true") return;
    const focusable = [...drawer.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(node => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
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
      <div><strong>${esc(operationalPortalValue("Decision", snapshot.decision))}</strong><small>A decision becomes available when Evidence is current, Rights are released and Qualification is complete.</small></div></header>
    <div class="v587-decision-snapshot__grid">${snapshot.fields.map(([label, value]) =>
      `<article><span>${esc(label)}</span><strong>${esc(operationalPortalValue(label, value))}</strong>${stateGuidance(label, value) ? `<small>${esc(stateGuidance(label, value))}</small>` : ""}</article>`).join("")}</div>
    <footer>${evidenceButton("platform")}</footer></div>`;
  hero.insertAdjacentElement("afterend", section);
  section.dataset.source = data?.registry?.projection_id ?? "NOT AVAILABLE";
}

function renderPresenceLayer(data) {
  const hero = document.getElementById("discover");
  if (!hero || document.querySelector("[data-v587-presence-strip]")) return;
  const presence = buildPresenceContext(data);
  const strip = document.createElement("section");
  strip.className = "v587-intelligence-strip";
  strip.dataset.v587PresenceStrip = "true";
  strip.setAttribute("aria-label", "Latest verified intelligence");
  strip.innerHTML = `<div class="shell"><strong>${esc(presence.intelligenceStrip)}</strong><span>${esc(presence.confidenceBasis)}</span></div>`;
  hero.insertAdjacentElement("afterend", strip);

  const marketSection = document.querySelector(".market-signals-section");
  const marketEyebrow = marketSection?.querySelector(".section-heading .eyebrow");
  const marketContext = marketSection?.querySelector(".section-heading > p");
  if (marketEyebrow) marketEyebrow.textContent = "MARKET PULSE";
  if (marketContext) marketContext.textContent = presence.marketPulse;

  const researchHost = document.querySelector(".research-layout");
  if (researchHost && !document.querySelector("[data-v587-research-context]")) {
    const research = document.createElement("div");
    research.className = "v587-research-context";
    research.dataset.v587ResearchContext = "true";
    research.setAttribute("aria-label", "Research context");
    research.innerHTML = `<strong>RESEARCH CONTEXT</strong><span>${presence.research.map(esc).join("</span><span>")}</span>`;
    researchHost.insertAdjacentElement("beforebegin", research);
  }

  const researchPresentation = buildResearchPresentation(data);
  if (!researchPresentation.available && researchHost) {
    document.querySelector("[data-research-issue]").textContent = researchPresentation.issue;
    document.querySelector("[data-research-title]").textContent = researchPresentation.title;
    document.querySelector("[data-research-subtitle]").textContent = researchPresentation.subtitle;
    document.querySelector("[data-research-summary]").textContent = researchPresentation.summary;
    document.querySelector("[data-research-notes]").innerHTML = researchPresentation.sections.map(section => `
      <article class="research-note reveal"><span>${esc(section.index)}</span><div><h3>${esc(section.title)}</h3><p>${esc(section.summary)}</p></div></article>`).join("");
    const action = researchHost.querySelector("[data-dialog=research]");
    if (action) {
      action.disabled = true;
      action.setAttribute("aria-disabled", "true");
      action.textContent = "Research unavailable";
    }
    researchHost.dataset.researchGate = "EVIDENCE_AND_QUALIFICATION_PENDING";
  }
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
      .map(([label, value]) => `<div title="${esc(stateGuidance(label, value) ?? `${label} status`)}"><dt>${esc(label)}</dt><dd>${esc(operationalPortalValue(label, value))}</dd></div>`).join("");
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
  node.innerHTML = `<p class="eyebrow">EVIDENCE TIMELINE</p><time>${esc(flow.timeline)}</time>
    <div class="v587-research-decision">
      <span>Evidence · ${esc(operationalPortalValue("Evidence", flow.evidence_state))}</span>
      <span>Reason · ${esc(flow.reasoning.reason)}</span>
      <span>Decision · ${esc(operationalPortalValue("Decision", flow.conclusion))}</span>
      <a href="workspace.html?mode=ask">Continue in Workspace <span aria-hidden="true">→</span></a>
    </div>`;
  host.append(node);
}

export function startV587DecisionIntelligence(data) {
  ensureStylesheet();
  const snapshot = buildDecisionSnapshot(data);
  renderDecisionSnapshot(data, snapshot);
  renderPresenceLayer(data);
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
  window.KIDULTS_V587_INTELLIGENCE = Object.freeze({ version: "1.1.0", snapshot, presence: buildPresenceContext(data), production: "HOLD", public: "HOLD", g5: "HOLD" });
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
    <ol>${model.hierarchy.map(([label, value]) => `<li><span>${esc(label)}</span><strong>${esc(operationalPortalValue(label, value))}</strong>${stateGuidance(label, value) ? `<small>${esc(stateGuidance(label, value))}</small>` : ""}</li>`).join("")}</ol>
    ${evidenceButton("object")}`;
  root.append(hierarchy);

  const panel = document.createElement("aside");
  panel.className = "v587-decision-panel";
  panel.setAttribute("aria-label", "Decision panel");
  panel.innerHTML = `<p class="eyebrow">DECISION PANEL</p>${Object.entries(model.panel).map(([label, value]) => {
    const displayLabel = label === "track_b" ? "Qualification" : human(label).replace(/\b\w/g, character => character.toUpperCase());
    const guidance = label === "confidence"
      ? "Evidence → Freshness → Rights → Qualification"
      : label === "risk"
        ? `Why · release gates are unresolved. Current Situation · ${operationalPortalValue("Decision", model.panel.decision)}. Evidence · ${operationalPortalValue("Evidence", model.panel.evidence)}. Rights · ${operationalPortalValue("Rights", model.panel.rights)}. Qualification · ${operationalPortalValue("Qualification", model.panel.track_b)}. Next Action · wait for verified Evidence, released Rights and completed Qualification.`
        : stateGuidance(displayLabel, value);
    return `<div><span>${esc(displayLabel)}</span><strong>${esc(operationalPortalValue(displayLabel, value))}</strong>${guidance ? `<small>${esc(guidance)}</small>` : ""}</div>`;
  }).join("")}`;
  root.querySelector(".detail-hero")?.insertAdjacentElement("afterend", panel);

  const presence = buildPresenceContext({ registry }, model);
  const objectContext = document.createElement("section");
  objectContext.className = "v587-object-context";
  objectContext.setAttribute("aria-label", "Market context");
  objectContext.innerHTML = `<strong>MARKET CONTEXT</strong>${presence.objectLines.map(line => `<span>${esc(line)}</span>`).join("")}`;
  root.querySelector(".detail-hero")?.insertAdjacentElement("afterend", objectContext);

  const context = document.createElement("section");
  context.className = "v587-object-context v587-museum-context";
  context.setAttribute("aria-label", "Evidence and provenance context");
  context.innerHTML = `<strong>EVIDENCE &amp; PROVENANCE</strong>
    <span>Evidence Availability · ${esc(operationalPortalValue("Evidence", model.panel.evidence))}</span>
    <span>Qualification · ${esc(operationalPortalValue("Qualification", model.panel.track_b))}</span>
    <span>Research Availability · ${esc(operationalPortalValue("Research", model.hierarchy.find(([label]) => label === "Research")?.[1]))}</span>
    <span>Provenance State · ${esc(object?.provenance ? "Editorial provenance available" : "Provenance not yet available")}</span>`;
  objectContext.insertAdjacentElement("afterend", context);

  const drawer = ensureEvidenceDrawer();
  bindDrawer(drawer, () => model.evidence_drawer);
  document.documentElement.dataset.v587Intelligence = "1";
  return model;
}
