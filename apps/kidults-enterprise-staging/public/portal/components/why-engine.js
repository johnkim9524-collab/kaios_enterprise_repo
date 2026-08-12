const ROOT_ID = "kidults-why-engine";
const STYLE_ID = "kidults-why-engine-style";

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-why-engine",
  version: "0.1.0",
  supported_targets: ["metric", "operation", "vertical", "object", "signal"],
  truth_rules: {
    allow_fabricated_values: false,
    missing_to_zero: false,
    require_snapshot_traceability: true,
    require_limitations: true
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

function textState(value) {
  return String(value ?? "NOT_AVAILABLE")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function humanState(value) {
  return String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
}

function isNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function validTimestamp(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value) {
  const parsed = validTimestamp(value);
  if (parsed === null) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(parsed));
}

function formatPercent(value) {
  return isNumber(value) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}%` : "NOT AVAILABLE";
}

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    },
    supported_targets: Array.isArray(candidate.supported_targets)
      ? candidate.supported_targets
      : DEFAULT_CONTRACT.supported_targets
  };
}

function contextFor(data) {
  const registry = data.registry ?? {};
  const manifest = data.manifest ?? {};
  return {
    snapshot: manifest.snapshot_id ?? registry.snapshot?.baseline_id ?? "NOT AVAILABLE",
    candidate: registry.snapshot?.candidate_id ?? registry.snapshot?.candidate_status ?? "WAITING",
    assessment: registry.assessment?.current_id ?? registry.assessment?.status ?? "WAITING",
    production: registry.release?.status ?? "NOT AVAILABLE",
    release: manifest.status ?? "NOT AVAILABLE",
    methodology: manifest.methodology_version ?? registry.versions?.methodology ?? "NOT REGISTERED",
    evidenceLineage: manifest.evidence_lineage_version ?? registry.versions?.evidence_lineage ?? "NOT REGISTERED",
    sourceMode: manifest.source_mode ?? "NOT AVAILABLE",
    registryAsOf: registry.freshness?.as_of ?? registry.generated_at ?? null
  };
}

function traceabilityTimeline(data, extra = []) {
  const events = [
    { label: "Registry projection as of", value: data.registry?.freshness?.as_of },
    { label: "Registry projection generated", value: data.registry?.generated_at },
    { label: "Portal baseline as of", value: data.summary?.as_of },
    { label: "Release registered", value: data.manifest?.registered_at },
    { label: "Portal build", value: data.manifest?.build_at },
    ...extra
  ]
    .map(event => ({ ...event, parsed: validTimestamp(event.value) }))
    .filter(event => event.parsed !== null)
    .sort((a, b) => b.parsed - a.parsed);

  const seen = new Set();
  return events.filter(event => {
    const key = `${event.label}|${event.parsed}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function baseLimitations(data) {
  const context = contextFor(data);
  const limits = [];

  if (!data.manifest?.production || context.production !== "PRODUCTION") {
    limits.push("This release is not approved as Production intelligence.");
  }
  if (!data.registry?.snapshot?.candidate_id) {
    limits.push("No Candidate Snapshot is registered.");
  }
  if (!data.registry?.assessment?.current_id) {
    limits.push("No independent Rankability Assessment is registered.");
  }
  if (String(context.methodology).includes("NOT")) {
    limits.push("The formal methodology version is not registered.");
  }
  if (String(context.evidenceLineage).includes("NOT")) {
    limits.push("The formal evidence-lineage version is not registered.");
  }
  if (String(context.sourceMode).includes("PROVIDER_INDEPENDENT")) {
    limits.push("The current baseline is provider-independent and does not represent provider-enriched coverage.");
  }

  return limits;
}

function traceability(data, sourceRecord) {
  const context = contextFor(data);
  return [
    ["Source record", sourceRecord],
    ["Snapshot", context.snapshot],
    ["Candidate", context.candidate],
    ["Assessment", context.assessment],
    ["Methodology", context.methodology],
    ["Evidence lineage", context.evidenceLineage],
    ["Source mode", context.sourceMode],
    ["Registry as of", context.registryAsOf ? formatDate(context.registryAsOf) : "NOT AVAILABLE"]
  ];
}

function metricModel(data, index) {
  const metric = data.summary?.metrics?.[index];
  if (!metric) return null;
  const context = contextFor(data);

  return {
    targetType: "metric",
    targetId: metric.id,
    eyebrow: "PLATFORM METRIC",
    title: metric.label,
    value: metric.value,
    valueLabel: "Current public-preview value",
    state: metric.state,
    summary: `${metric.caption}. This value belongs to the ${humanState(context.sourceMode)} baseline registered against snapshot ${context.snapshot}.`,
    confidence: null,
    facts: [
      ["Value", metric.value],
      ["Publication state", metric.state],
      ["Snapshot", context.snapshot],
      ["Assessment", context.assessment]
    ],
    evidence: [
      ["Definition", metric.caption],
      ["Portal interpretation", data.summary?.interpretation ?? "NOT AVAILABLE"],
      ["Registered as of", data.summary?.as_of ? formatDate(data.summary.as_of) : "NOT AVAILABLE"]
    ],
    composition: data.summary?.composition ?? [],
    timeline: traceabilityTimeline(data),
    limitations: baseLimitations(data),
    traceability: traceability(data, "portal/data/portal-summary.json")
  };
}

function operationModel(data, index) {
  const item = data.summary?.operations?.[index];
  if (!item) return null;
  const context = contextFor(data);

  return {
    targetType: "operation",
    targetId: item.label,
    eyebrow: "OPERATIONAL EVIDENCE",
    title: item.label,
    value: item.value,
    valueLabel: item.caption,
    state: item.state,
    summary: `${item.caption}. ${item.detail}. The displayed state is ${humanState(item.state)} within the ${humanState(context.sourceMode)} release baseline.`,
    confidence: item.label === "MODEL CONFIDENCE" && isNumber(String(item.value).replace("%", ""))
      ? Number(String(item.value).replace("%", ""))
      : null,
    facts: [
      ["Value", item.value],
      ["State", item.state],
      ["Detail", item.detail],
      ["Production", context.production]
    ],
    evidence: [
      ["Definition", item.caption],
      ["Snapshot", context.snapshot],
      ["Source mode", context.sourceMode]
    ],
    composition: data.summary?.composition ?? [],
    timeline: traceabilityTimeline(data),
    limitations: baseLimitations(data),
    traceability: traceability(data, "portal/data/portal-summary.json")
  };
}

function verticalModel(data, index) {
  const vertical = data.verticals?.verticals
    ?.slice()
    .sort((a, b) => a.structural_order - b.structural_order)?.[index];
  if (!vertical) return null;
  const context = contextFor(data);

  return {
    targetType: "vertical",
    targetId: vertical.id,
    eyebrow: "CORE VERTICAL",
    title: vertical.name,
    value: formatPercent(vertical.right_data_coverage_pct),
    valueLabel: "Current Right Data coverage",
    state: vertical.featured ? "CURRENT FEATURED" : "CURRENT OBSERVATION",
    summary: `${vertical.summary} Current measurements describe observability under the available self-collected baseline; structural order ${vertical.structural_order} is not a market rank.`,
    confidence: null,
    facts: [
      ["Right Data coverage", formatPercent(vertical.right_data_coverage_pct)],
      ["Demand evidence", formatPercent(vertical.demand_evidence_pct)],
      ["Current observation order", String(vertical.current_observation_order)],
      ["Structural order", String(vertical.structural_order)]
    ],
    evidence: [
      ["Relevant entities", String(vertical.relevant)],
      ["Demand evidence count", `${vertical.demand_evidence_count} / ${vertical.demand_denominator}`],
      ["Scarcity evidence count", String(vertical.scarcity_evidence_count)],
      ["Representative scope", vertical.representative_scope.join(", ")]
    ],
    composition: [],
    timeline: traceabilityTimeline(data),
    limitations: [
      ...baseLimitations(data),
      "Structural order and current observation order are separate concepts.",
      "Featured status describes the current baseline and is not permanent superiority."
    ],
    traceability: traceability(data, data.verticals?.source_registry ?? "portal/data/verticals.json")
  };
}

function objectModel(data, index) {
  const item = data.k100?.items?.[index];
  if (!item) return null;
  const context = contextFor(data);
  const scoreAvailable = isNumber(item.score);

  return {
    targetType: "object",
    targetId: item.id,
    eyebrow: "KIDULT 100 EXPLANATION",
    title: item.title,
    value: scoreAvailable ? Number(item.score).toFixed(1) : "GATED",
    valueLabel: scoreAvailable ? "Preview observation score" : "Public score state",
    state: item.status,
    summary: scoreAvailable
      ? `${item.provenance} The score is a preview observation under snapshot ${context.snapshot}; it is not a canonical or Rankability-approved result.`
      : `${item.provenance} A public score is withheld until the registered evidence and methodology gates are satisfied.`,
    confidence: isNumber(item.confidence) ? Number(item.confidence) : null,
    facts: [
      ["Preview score", scoreAvailable ? Number(item.score).toFixed(1) : "GATED"],
      ["Registered confidence", formatPercent(item.confidence)],
      ["Publisher freshness label", item.freshness ?? "NOT AVAILABLE"],
      ["Assessment", context.assessment]
    ],
    evidence: [
      ["Category", item.category],
      ["Provenance statement", item.provenance],
      ["Asset status", item.asset_status],
      ["Selection type", data.k100?.selection_type ?? "NOT AVAILABLE"]
    ],
    composition: data.summary?.composition ?? [],
    timeline: traceabilityTimeline(data),
    limitations: [
      ...baseLimitations(data),
      "The displayed score, when present, is a preview observation and not a canonical ranking.",
      "The evidence-composition chart describes the portal baseline, not a causal decomposition of this object score."
    ],
    traceability: traceability(data, "portal/data/kidult100.json"),
    href: `object.html?id=${encodeURIComponent(item.id)}`
  };
}

function signalModel(data, index) {
  const signal = data.signals?.signals?.[index];
  if (!signal) return null;
  const context = contextFor(data);

  return {
    targetType: "signal",
    targetId: signal.id,
    eyebrow: "MARKET SIGNAL EXPLANATION",
    title: signal.title,
    value: `${signal.value} ${signal.unit}`,
    valueLabel: signal.category,
    state: data.signals?.status ?? "PUBLIC PREVIEW",
    summary: `This is the current public-preview reading for ${signal.category}. Its registered signal snapshot is ${data.signals?.updated_at ? formatDate(data.signals.updated_at) : "not available"}; it is not presented as a Production live feed.`,
    confidence: isNumber(signal.confidence) ? Number(signal.confidence) : null,
    facts: [
      ["Current reading", `${signal.value} ${signal.unit}`],
      ["Change", signal.change],
      ["Registered confidence", formatPercent(signal.confidence)],
      ["Source count", String(signal.sources)]
    ],
    evidence: [
      ["Category", signal.category],
      ["Signal snapshot", data.signals?.updated_at ? formatDate(data.signals.updated_at) : "NOT AVAILABLE"],
      ["Release", data.signals?.release ?? "NOT AVAILABLE"],
      ["Publication state", data.signals?.status ?? "NOT AVAILABLE"]
    ],
    composition: data.summary?.composition ?? [],
    timeline: traceabilityTimeline(data, [
      { label: "Market signal snapshot", value: data.signals?.updated_at }
    ]),
    limitations: [
      ...baseLimitations(data),
      "The publisher-provided relative update label is not used as the authoritative Registry timestamp.",
      "The evidence-composition chart describes the portal baseline, not a causal decomposition of this signal."
    ],
    traceability: traceability(data, "portal/data/market-signals.json")
  };
}

function modelFor(data, type, index) {
  const builders = {
    metric: metricModel,
    operation: operationModel,
    vertical: verticalModel,
    object: objectModel,
    signal: signalModel
  };
  return builders[type]?.(data, index) ?? null;
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/why-engine.css?v=610";
  document.head.append(link);
}

function ensureDialog() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const dialog = document.createElement("dialog");
  dialog.id = ROOT_ID;
  dialog.className = "why-engine";
  dialog.setAttribute("aria-labelledby", "why-engine-title");
  dialog.innerHTML = `
    <div class="why-engine__surface">
      <header class="why-engine__header">
        <div>
          <p class="eyebrow" data-why-eyebrow>WHY</p>
          <h2 id="why-engine-title" data-why-title>Explain this intelligence</h2>
        </div>
        <button class="why-engine__close" type="button" data-why-close aria-label="Close WHY explanation">Close</button>
      </header>

      <div class="why-engine__scroll">
        <section class="why-engine__hero">
          <div>
            <small data-why-value-label>Current value</small>
            <strong data-why-value>—</strong>
          </div>
          <span class="why-engine__state" data-why-state>WAITING</span>
          <p data-why-summary></p>
        </section>

        <section class="why-engine__section" data-why-confidence-section hidden>
          <div class="why-engine__section-head">
            <div><p class="eyebrow">CONFIDENCE</p><h3>Registered preview confidence</h3></div>
            <strong data-why-confidence-value>—</strong>
          </div>
          <div class="why-engine__confidence" role="meter" aria-valuemin="0" aria-valuemax="100" data-why-confidence-meter>
            <i data-why-confidence-bar></i>
          </div>
          <p class="why-engine__note">Confidence is shown as registered. It is not silently upgraded into an independent assessment.</p>
        </section>

        <section class="why-engine__section">
          <div class="why-engine__section-head"><div><p class="eyebrow">CURRENT FACTS</p><h3>What is registered now</h3></div></div>
          <dl class="why-engine__facts" data-why-facts></dl>
        </section>

        <section class="why-engine__section">
          <div class="why-engine__section-head"><div><p class="eyebrow">EVIDENCE</p><h3>What supports the explanation</h3></div></div>
          <dl class="why-engine__evidence" data-why-evidence></dl>
        </section>

        <section class="why-engine__section" data-why-composition-section hidden>
          <div class="why-engine__section-head"><div><p class="eyebrow">BASELINE COMPOSITION</p><h3>Source-family context</h3></div></div>
          <div class="why-engine__composition" data-why-composition></div>
          <p class="why-engine__note">This is the portal baseline composition. It is not represented as a causal score formula.</p>
        </section>

        <section class="why-engine__section">
          <div class="why-engine__section-head"><div><p class="eyebrow">TRACEABILITY TIMELINE</p><h3>Registered system events</h3></div></div>
          <ol class="why-engine__timeline" data-why-timeline></ol>
        </section>

        <section class="why-engine__section why-engine__limitations">
          <div class="why-engine__section-head"><div><p class="eyebrow">KNOWN LIMITATIONS</p><h3>What this does not claim</h3></div></div>
          <ul data-why-limitations></ul>
        </section>

        <section class="why-engine__section">
          <div class="why-engine__section-head"><div><p class="eyebrow">SOURCE TRACEABILITY</p><h3>Follow the value to its source</h3></div></div>
          <dl class="why-engine__traceability" data-why-traceability></dl>
        </section>
      </div>

      <footer class="why-engine__footer">
        <a class="why-engine__provenance" data-why-provenance hidden>Open object provenance →</a>
        <button class="why-engine__copy" type="button" data-why-copy>Copy traceability</button>
        <span class="why-engine__copy-state" data-why-copy-state aria-live="polite"></span>
      </footer>
    </div>
  `;

  document.body.append(dialog);
  return dialog;
}

function renderPairs(node, pairs) {
  node.innerHTML = pairs.map(([label, value]) => `
    <div>
      <dt>${esc(label)}</dt>
      <dd>${esc(value ?? "NOT AVAILABLE")}</dd>
    </div>
  `).join("");
}

function renderComposition(node, composition) {
  const total = composition.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  node.innerHTML = composition.map(item => `
    <div class="why-engine__composition-row">
      <span><i style="--why-color:${esc(item.color)}"></i>${esc(item.label)}</span>
      <div><b style="width:${Math.max(0, Math.min(100, Number(item.value) / total * 100))}%"></b></div>
      <strong>${esc(item.value)}%</strong>
    </div>
  `).join("");
}

function renderModel(dialog, model) {
  dialog.dataset.targetType = model.targetType;
  dialog.dataset.targetId = model.targetId;
  dialog.querySelector("[data-why-eyebrow]").textContent = model.eyebrow;
  dialog.querySelector("[data-why-title]").textContent = model.title;
  dialog.querySelector("[data-why-value]").textContent = model.value;
  dialog.querySelector("[data-why-value-label]").textContent = model.valueLabel;

  const state = dialog.querySelector("[data-why-state]");
  state.textContent = humanState(model.state);
  state.dataset.state = textState(model.state);

  dialog.querySelector("[data-why-summary]").textContent = model.summary;
  renderPairs(dialog.querySelector("[data-why-facts]"), model.facts);
  renderPairs(dialog.querySelector("[data-why-evidence]"), model.evidence);
  renderPairs(dialog.querySelector("[data-why-traceability]"), model.traceability);

  const confidenceSection = dialog.querySelector("[data-why-confidence-section]");
  if (isNumber(model.confidence)) {
    const value = Math.max(0, Math.min(100, Number(model.confidence)));
    confidenceSection.hidden = false;
    dialog.querySelector("[data-why-confidence-value]").textContent = `${value}%`;
    const meter = dialog.querySelector("[data-why-confidence-meter]");
    meter.setAttribute("aria-valuenow", String(value));
    dialog.querySelector("[data-why-confidence-bar]").style.width = `${value}%`;
  } else {
    confidenceSection.hidden = true;
  }

  const compositionSection = dialog.querySelector("[data-why-composition-section]");
  if (Array.isArray(model.composition) && model.composition.length) {
    compositionSection.hidden = false;
    renderComposition(dialog.querySelector("[data-why-composition]"), model.composition);
  } else {
    compositionSection.hidden = true;
  }

  dialog.querySelector("[data-why-timeline]").innerHTML = model.timeline.length
    ? model.timeline.map(event => `
        <li>
          <time datetime="${esc(event.value)}">${esc(formatDate(event.value))}</time>
          <span>${esc(event.label)}</span>
        </li>
      `).join("")
    : '<li><span>No registered timestamp is available.</span></li>';

  dialog.querySelector("[data-why-limitations]").innerHTML = model.limitations.length
    ? model.limitations.map(limit => `<li>${esc(limit)}</li>`).join("")
    : "<li>No additional limitation is registered.</li>";

  const provenance = dialog.querySelector("[data-why-provenance]");
  if (model.href) {
    provenance.hidden = false;
    provenance.href = model.href;
  } else {
    provenance.hidden = true;
    provenance.removeAttribute("href");
  }

  dialog.__whyModel = model;
  dialog.querySelector(".why-engine__scroll").scrollTop = 0;
}

function copyTraceability(dialog) {
  const model = dialog.__whyModel;
  if (!model) return;
  const lines = [
    `KIDULTS WHY — ${model.title}`,
    `Type: ${model.targetType}`,
    `ID: ${model.targetId}`,
    ...model.traceability.map(([label, value]) => `${label}: ${value}`),
    "",
    "Known limitations:",
    ...model.limitations.map(item => `- ${item}`)
  ];

  const state = dialog.querySelector("[data-why-copy-state]");
  navigator.clipboard?.writeText(lines.join("\n"))
    .then(() => {
      state.textContent = "Copied";
      window.setTimeout(() => { state.textContent = ""; }, 1800);
    })
    .catch(() => {
      state.textContent = "Copy unavailable";
    });
}

function appendTrigger(card, type, index, label) {
  if (!card || card.querySelector(":scope > .why-trigger, .why-trigger")) return;
  const button = document.createElement("button");
  button.className = "why-trigger";
  button.type = "button";
  button.dataset.whyType = type;
  button.dataset.whyIndex = String(index);
  button.setAttribute("aria-label", `Explain ${label}`);
  button.innerHTML = '<span aria-hidden="true">?</span> WHY';
  card.append(button);
  card.classList.add("why-enabled");
}

function decorateTargets(data) {
  document.querySelectorAll("[data-snapshot-grid] .snapshot-card").forEach((card, index) => {
    appendTrigger(card, "metric", index, data.summary?.metrics?.[index]?.label ?? "metric");
  });

  document.querySelectorAll("[data-operations-grid] .operation-card").forEach((card, index) => {
    appendTrigger(card, "operation", index, data.summary?.operations?.[index]?.label ?? "operation");
  });

  const verticals = data.verticals?.verticals?.slice().sort((a, b) => a.structural_order - b.structural_order) ?? [];
  document.querySelectorAll("[data-vertical-grid] .vertical-card").forEach((card, index) => {
    appendTrigger(card, "vertical", index, verticals[index]?.name ?? "vertical");
  });

  document.querySelectorAll("[data-k100-gallery] .k100-card").forEach((card, index) => {
    appendTrigger(card, "object", index, data.k100?.items?.[index]?.title ?? "object");
  });

  document.querySelectorAll("[data-signal-grid] .signal-card").forEach((card, index) => {
    appendTrigger(card, "signal", index, data.signals?.signals?.[index]?.title ?? "signal");
  });
}

export function startWhyEngine({ data, contract } = {}) {
  if (!data) throw new Error("WHY Engine requires portal data.");
  const normalizedContract = normalizeContract(contract);
  ensureStylesheet();
  const dialog = ensureDialog();
  let returnFocus = null;

  decorateTargets(data);

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-why-type]");
    if (!trigger) return;

    const type = trigger.dataset.whyType;
    const index = Number(trigger.dataset.whyIndex);
    if (!normalizedContract.supported_targets.includes(type) || !Number.isInteger(index)) return;

    const model = modelFor(data, type, index);
    if (!model) return;

    returnFocus = trigger;
    renderModel(dialog, model);
    if (!dialog.open) dialog.showModal();
  });

  dialog.querySelector("[data-why-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-why-copy]").addEventListener("click", () => copyTraceability(dialog));
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    returnFocus?.focus?.();
    returnFocus = null;
  });

  window.KIDULTS_WHY = Object.freeze({
    engine: normalizedContract.engine_id,
    version: normalizedContract.version,
    targets: normalizedContract.supported_targets.slice(),
    truthRules: { ...normalizedContract.truth_rules }
  });
}
