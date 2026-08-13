const ROOT_ID = "kidults-compare-engine";
const STYLE_ID = "kidults-compare-engine-style";

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-compare-engine",
  version: "0.1.0",
  scope: "CORE_VERTICALS",
  default_left_id: "vertical-automobiles-mobility",
  default_right_id: "vertical-watches-jewelry",
  metrics: [
    "right_data_coverage_pct",
    "demand_evidence_pct",
    "relevant",
    "demand_evidence_count",
    "scarcity_evidence_count",
    "current_observation_order",
    "structural_order",
    "featured"
  ],
  truth_rules: {
    allow_rankability_claims: false,
    allow_investment_language: false,
    allow_missing_to_zero: false,
    require_snapshot_traceability: true,
    require_limitations: true,
    separate_observation_from_rank: true
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

const isNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const human = value =>
  String(value ?? "NOT AVAILABLE").replaceAll("_", " ");

const pct = value =>
  isNumber(value) ? `${Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%` : "NOT AVAILABLE";

const integer = value =>
  isNumber(value) ? Number(value).toLocaleString() : "NOT AVAILABLE";

const yesNo = value =>
  value === true ? "YES" : value === false ? "NO" : "NOT AVAILABLE";

const signed = (value, suffix = "") => {
  if (!isNumber(value)) return "NOT AVAILABLE";
  const numeric = Number(value);
  const absolute = Math.abs(numeric).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${numeric > 0 ? "+" : numeric < 0 ? "−" : ""}${absolute}${suffix}`;
};

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    metrics: Array.isArray(candidate.metrics) ? candidate.metrics : DEFAULT_CONTRACT.metrics,
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    }
  };
}

function sortedVerticals(data) {
  return (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.structural_order - b.structural_order);
}

function currentContext(data) {
  const registry = data.registry ?? {};
  const manifest = data.manifest ?? {};
  return {
    snapshot: data.verticals?.source_snapshot_id ?? manifest.snapshot_id ?? registry.snapshot?.baseline_id ?? "NOT AVAILABLE",
    sourceRegistry: data.verticals?.source_registry ?? "portal/data/verticals.json",
    sourceMode: data.verticals?.source_mode ?? manifest.source_mode ?? "NOT AVAILABLE",
    candidate: registry.snapshot?.candidate_id ?? registry.snapshot?.candidate_status ?? "WAITING",
    assessment: registry.assessment?.current_id ?? registry.assessment?.status ?? "WAITING",
    methodology: manifest.methodology_version ?? registry.versions?.methodology ?? "NOT REGISTERED",
    evidenceLineage: manifest.evidence_lineage_version ?? registry.versions?.evidence_lineage ?? "NOT REGISTERED",
    registryAsOf: registry.freshness?.as_of ?? registry.generated_at ?? null,
    production: registry.release?.status ?? "NOT AVAILABLE"
  };
}

function formatDate(value) {
  if (!value) return "NOT AVAILABLE";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(parsed));
}

function baseLimitations(data) {
  const context = currentContext(data);
  const limitations = [
    "This comparison describes the current portal observability baseline.",
    "It is not an independent Track B Rankability Assessment.",
    "Higher coverage does not by itself establish higher value, price performance or permanent category priority."
  ];

  if (!data.registry?.snapshot?.candidate_id) {
    limitations.push("No Candidate Snapshot is registered.");
  }
  if (!data.registry?.assessment?.current_id) {
    limitations.push("No independent Rankability Assessment is registered.");
  }
  if (String(context.methodology).includes("NOT")) {
    limitations.push("The formal methodology version is not registered.");
  }
  if (String(context.evidenceLineage).includes("NOT")) {
    limitations.push("The formal evidence-lineage version is not registered.");
  }
  if (String(context.sourceMode).includes("PROVIDER_INDEPENDENT")) {
    limitations.push("The current source mode is provider-independent and not provider-enriched.");
  }

  return limitations;
}

function numericRow({ key, label, left, right, format, scale = null, differenceLabel, interpretation }) {
  const leftValue = left[key];
  const rightValue = right[key];
  const valid = isNumber(leftValue) && isNumber(rightValue);
  const leftNumeric = valid ? Number(leftValue) : null;
  const rightNumeric = valid ? Number(rightValue) : null;
  const max = valid ? Math.max(Math.abs(leftNumeric), Math.abs(rightNumeric), 1) : 1;
  const divisor = scale || max;

  return {
    key,
    label,
    leftValue: format(leftValue),
    rightValue: format(rightValue),
    leftBar: valid ? Math.max(0, Math.min(100, Math.abs(leftNumeric) / divisor * 100)) : null,
    rightBar: valid ? Math.max(0, Math.min(100, Math.abs(rightNumeric) / divisor * 100)) : null,
    delta: valid ? leftNumeric - rightNumeric : null,
    differenceLabel,
    interpretation
  };
}

function buildRows(left, right) {
  return [
    numericRow({
      key: "right_data_coverage_pct",
      label: "Right Data coverage",
      left,
      right,
      format: pct,
      scale: 100,
      differenceLabel: "percentage points",
      interpretation: "Current observed Right Data coverage under the registered baseline."
    }),
    numericRow({
      key: "demand_evidence_pct",
      label: "Demand evidence",
      left,
      right,
      format: pct,
      scale: 100,
      differenceLabel: "percentage points",
      interpretation: "Share of the current relevant-entity denominator with demand evidence."
    }),
    numericRow({
      key: "relevant",
      label: "Relevant entities",
      left,
      right,
      format: integer,
      differenceLabel: "entities",
      interpretation: "Current relevant-entity set used by the provider-independent projection."
    }),
    {
      key: "demand_evidence_count",
      label: "Demand evidence records",
      leftValue: isNumber(left.demand_evidence_count) && isNumber(left.demand_denominator)
        ? `${integer(left.demand_evidence_count)} / ${integer(left.demand_denominator)}`
        : "NOT AVAILABLE",
      rightValue: isNumber(right.demand_evidence_count) && isNumber(right.demand_denominator)
        ? `${integer(right.demand_evidence_count)} / ${integer(right.demand_denominator)}`
        : "NOT AVAILABLE",
      leftBar: isNumber(left.demand_evidence_pct) ? Number(left.demand_evidence_pct) : null,
      rightBar: isNumber(right.demand_evidence_pct) ? Number(right.demand_evidence_pct) : null,
      delta: isNumber(left.demand_evidence_count) && isNumber(right.demand_evidence_count)
        ? Number(left.demand_evidence_count) - Number(right.demand_evidence_count)
        : null,
      differenceLabel: "records",
      interpretation: "Observed demand-evidence record counts and their current denominators."
    },
    numericRow({
      key: "scarcity_evidence_count",
      label: "Scarcity evidence records",
      left,
      right,
      format: integer,
      differenceLabel: "records",
      interpretation: "Current scarcity-evidence records; zero is displayed only when the source record explicitly contains zero."
    }),
    numericRow({
      key: "current_observation_order",
      label: "Current observation order",
      left,
      right,
      format: integer,
      differenceLabel: "positions",
      interpretation: "Current observation order is dynamic and is not structural order or permanent market rank."
    }),
    numericRow({
      key: "structural_order",
      label: "Structural order",
      left,
      right,
      format: integer,
      differenceLabel: "positions",
      interpretation: "Stable taxonomy order inside the eight Core Verticals."
    }),
    {
      key: "featured",
      label: "Current featured state",
      leftValue: yesNo(left.featured),
      rightValue: yesNo(right.featured),
      leftBar: null,
      rightBar: null,
      delta: null,
      differenceLabel: "",
      interpretation: "Current Featured status can change only through versioned data."
    }
  ];
}

function differenceNarrative(left, right, rows) {
  const coverage = rows.find(row => row.key === "right_data_coverage_pct");
  const demand = rows.find(row => row.key === "demand_evidence_pct");
  const observation = rows.find(row => row.key === "current_observation_order");
  const statements = [];

  if (isNumber(observation?.delta) && observation.delta !== 0) {
    const earlier = observation.delta < 0 ? left : right;
    const later = observation.delta < 0 ? right : left;
    statements.push(
      `${earlier.name} appears earlier in the current observation order than ${later.name}. This is a dynamic observation state, not a permanent rank.`
    );
  } else if (isNumber(observation?.delta)) {
    statements.push("Both verticals share the same current observation order.");
  }

  if (isNumber(coverage?.delta) && coverage.delta !== 0) {
    const higher = coverage.delta > 0 ? left : right;
    const gap = Math.abs(coverage.delta);
    statements.push(
      `${higher.name} currently has ${signed(gap, " percentage points")} more observed Right Data coverage in this baseline.`
    );
  } else if (isNumber(coverage?.delta)) {
    statements.push("Both verticals currently have the same recorded Right Data coverage.");
  }

  if (isNumber(demand?.delta) && demand.delta !== 0) {
    const higher = demand.delta > 0 ? left : right;
    const gap = Math.abs(demand.delta);
    statements.push(
      `${higher.name} currently has ${signed(gap, " percentage points")} more demand-evidence coverage under its own registered denominator.`
    );
  } else if (isNumber(demand?.delta)) {
    statements.push("Both verticals currently have the same demand-evidence percentage.");
  }

  if (!statements.length) {
    statements.push("The current projection does not contain enough comparable numeric fields to explain a difference.");
  }

  return statements;
}

function comparisonModel(data, left, right) {
  const context = currentContext(data);
  const rows = buildRows(left, right);
  return {
    left,
    right,
    rows,
    narrative: differenceNarrative(left, right, rows),
    limitations: baseLimitations(data),
    traceability: [
      ["Source registry", context.sourceRegistry],
      ["Snapshot", context.snapshot],
      ["Source mode", context.sourceMode],
      ["Candidate", context.candidate],
      ["Assessment", context.assessment],
      ["Methodology", context.methodology],
      ["Evidence lineage", context.evidenceLineage],
      ["Registry as of", formatDate(context.registryAsOf)],
      ["Production", context.production]
    ]
  };
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/compare-engine.css?v=630";
  document.head.append(link);
}

function optionMarkup(verticals) {
  return verticals.map(vertical => `
    <option value="${esc(vertical.id)}">${esc(vertical.name)}</option>
  `).join("");
}

function ensureRoot(verticals) {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "compare-engine";
  root.setAttribute("aria-labelledby", "compare-engine-title");
  root.innerHTML = `
    <div class="shell compare-engine__shell">
      <header class="compare-engine__intro">
        <div>
          <p class="eyebrow">DIFFERENCE INTELLIGENCE</p>
          <h2 id="compare-engine-title">Compare what is registered now.</h2>
        </div>
        <p>Place two Core Verticals side by side, explain the recorded differences and follow every value back to the current Registry projection.</p>
      </header>

      <form class="compare-engine__controls" data-compare-form>
        <label>
          <span>LEFT VERTICAL</span>
          <select data-compare-left>${optionMarkup(verticals)}</select>
        </label>
        <button class="compare-engine__swap" type="button" data-compare-swap aria-label="Swap compared verticals">⇄</button>
        <label>
          <span>RIGHT VERTICAL</span>
          <select data-compare-right>${optionMarkup(verticals)}</select>
        </label>
        <button class="compare-engine__apply" type="submit">Compare <span aria-hidden="true">→</span></button>
      </form>

      <article class="compare-engine__result" data-compare-result>
        <header class="compare-engine__result-head">
          <div>
            <p class="eyebrow">CURRENT BASELINE</p>
            <h3 data-compare-title>—</h3>
          </div>
          <span data-compare-state>REGISTRY GROUNDED</span>
        </header>

        <div class="compare-engine__profiles">
          <article data-compare-left-profile></article>
          <div class="compare-engine__versus" aria-hidden="true">VS</div>
          <article data-compare-right-profile></article>
        </div>

        <div class="compare-engine__table" data-compare-table></div>

        <section class="compare-engine__difference">
          <div class="compare-engine__section-head">
            <div><p class="eyebrow">EXPLAIN THE DIFFERENCE</p><h4>What the current records actually say</h4></div>
          </div>
          <ol data-compare-narrative></ol>
        </section>

        <section class="compare-engine__limitations">
          <div class="compare-engine__section-head">
            <div><p class="eyebrow">KNOWN LIMITATIONS</p><h4>What this comparison does not claim</h4></div>
          </div>
          <ul data-compare-limitations></ul>
        </section>

        <details class="compare-engine__traceability">
          <summary>Source traceability</summary>
          <dl data-compare-traceability></dl>
        </details>
      </article>
    </div>
  `;

  const copilot = document.getElementById("kidults-copilot");
  if (copilot) {
    copilot.insertAdjacentElement("afterend", root);
  } else {
    document.querySelector("#main")?.prepend(root);
  }
  return root;
}

function profileMarkup(vertical, index) {
  return `
    <div class="compare-engine__profile-top">
      <span>${String(vertical.structural_order).padStart(2, "0")}</span>
      ${vertical.featured ? "<b>CURRENT FEATURED</b>" : "<b>CURRENT OBSERVATION</b>"}
    </div>
    <h4>${esc(vertical.name)}</h4>
    <p>${esc(vertical.summary)}</p>
    <div class="compare-engine__profile-actions">
      <button type="button" data-compare-why-index="${index}">WHY <span aria-hidden="true">→</span></button>
      <a href="vertical.html?id=${encodeURIComponent(vertical.id)}">Explore <span aria-hidden="true">→</span></a>
    </div>
  `;
}

function rowMarkup(row) {
  const deltaText = isNumber(row.delta)
    ? row.delta === 0
      ? "NO NUMERIC GAP"
      : `${signed(row.delta, row.differenceLabel ? ` ${row.differenceLabel}` : "")}`
    : "STATE COMPARISON";

  const bar = (value, side) => value === null
    ? ""
    : `<div class="compare-engine__bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, value))}%" data-side="${side}"></i></div>`;

  return `
    <div class="compare-engine__row" data-compare-metric="${esc(row.key)}">
      <div class="compare-engine__metric">
        <strong>${esc(row.label)}</strong>
        <small>${esc(row.interpretation)}</small>
      </div>
      <div class="compare-engine__value">
        <b>${esc(row.leftValue)}</b>
        ${bar(row.leftBar, "left")}
      </div>
      <div class="compare-engine__delta">${esc(deltaText)}</div>
      <div class="compare-engine__value">
        <b>${esc(row.rightValue)}</b>
        ${bar(row.rightBar, "right")}
      </div>
    </div>
  `;
}

function renderPairs(node, pairs) {
  node.innerHTML = pairs.map(([label, value]) => `
    <div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>
  `).join("");
}

function renderModel(root, model, verticals) {
  const leftIndex = verticals.findIndex(vertical => vertical.id === model.left.id);
  const rightIndex = verticals.findIndex(vertical => vertical.id === model.right.id);

  root.querySelector("[data-compare-title]").textContent =
    `${model.left.short_name || model.left.name} vs ${model.right.short_name || model.right.name}`;
  root.querySelector("[data-compare-left-profile]").innerHTML = profileMarkup(model.left, leftIndex);
  root.querySelector("[data-compare-right-profile]").innerHTML = profileMarkup(model.right, rightIndex);
  root.querySelector("[data-compare-table]").innerHTML = `
    <div class="compare-engine__table-head">
      <span>Metric</span>
      <strong>${esc(model.left.short_name || model.left.name)}</strong>
      <span>Recorded difference</span>
      <strong>${esc(model.right.short_name || model.right.name)}</strong>
    </div>
    ${model.rows.map(rowMarkup).join("")}
  `;
  root.querySelector("[data-compare-narrative]").innerHTML =
    model.narrative.map(statement => `<li>${esc(statement)}</li>`).join("");
  root.querySelector("[data-compare-limitations]").innerHTML =
    model.limitations.map(statement => `<li>${esc(statement)}</li>`).join("");
  renderPairs(root.querySelector("[data-compare-traceability]"), model.traceability);
  root.querySelector("[data-compare-result]").dataset.leftId = model.left.id;
  root.querySelector("[data-compare-result]").dataset.rightId = model.right.id;
}

function pairFromUrl(verticals) {
  try {
    const url = new URL(window.location.href);
    const combined = url.searchParams.get("compare")?.split(/[,:|]/).map(value => value.trim()).filter(Boolean) ?? [];
    const leftId = url.searchParams.get("left") || combined[0];
    const rightId = url.searchParams.get("right") || combined[1];
    const validIds = new Set(verticals.map(vertical => vertical.id));
    return {
      leftId: validIds.has(leftId) ? leftId : null,
      rightId: validIds.has(rightId) ? rightId : null
    };
  } catch {
    return { leftId: null, rightId: null };
  }
}

function writePairToUrl(leftId, rightId) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("compare", `${leftId},${rightId}`);
    url.searchParams.delete("left");
    url.searchParams.delete("right");
    window.history.replaceState(null, "", url);
  } catch {
    // Comparison remains functional when History or URL APIs are restricted.
  }
}

function chooseDefaults(verticals, contract) {
  const fromUrl = pairFromUrl(verticals);
  const byId = id => verticals.find(vertical => vertical.id === id);
  const observationFirst = verticals
    .slice()
    .sort((a, b) => a.current_observation_order - b.current_observation_order)[0];
  const observationSecond = verticals
    .slice()
    .sort((a, b) => a.current_observation_order - b.current_observation_order)[1];

  let left = byId(fromUrl.leftId) || byId(contract.default_left_id) || observationFirst || verticals[0];
  let right = byId(fromUrl.rightId) || byId(contract.default_right_id) || observationSecond || verticals[1];

  if (left?.id === right?.id) {
    right = verticals.find(vertical => vertical.id !== left.id) || right;
  }
  return { left, right };
}

function openWhy(index) {
  if (!Number.isInteger(index) || index < 0) return;
  const trigger = document.querySelector(`[data-why-type="vertical"][data-why-index="${index}"]`);
  trigger?.click();
}

export function startCompareEngine({ data, contract } = {}) {
  if (!data) throw new Error("Compare Engine requires portal data.");
  const normalizedContract = normalizeContract(contract);
  const verticals = sortedVerticals(data);
  if (verticals.length < 2) throw new Error("Compare Engine requires at least two registered Core Verticals.");

  ensureStylesheet();
  const root = ensureRoot(verticals);
  const leftSelect = root.querySelector("[data-compare-left]");
  const rightSelect = root.querySelector("[data-compare-right]");
  const defaults = chooseDefaults(verticals, normalizedContract);

  const render = ({ updateUrl = true, scroll = false } = {}) => {
    let left = verticals.find(vertical => vertical.id === leftSelect.value);
    let right = verticals.find(vertical => vertical.id === rightSelect.value);

    if (!left) left = verticals[0];
    if (!right || right.id === left.id) {
      right = verticals.find(vertical => vertical.id !== left.id) || verticals[1];
      rightSelect.value = right.id;
    }

    leftSelect.value = left.id;
    rightSelect.value = right.id;
    renderModel(root, comparisonModel(data, left, right), verticals);
    if (updateUrl) writePairToUrl(left.id, right.id);
    if (scroll) root.scrollIntoView({ behavior: "smooth", block: "start" });
    return { leftId: left.id, rightId: right.id };
  };

  leftSelect.value = defaults.left.id;
  rightSelect.value = defaults.right.id;
  render({ updateUrl: false });

  root.querySelector("[data-compare-form]").addEventListener("submit", event => {
    event.preventDefault();
    render();
  });

  root.querySelector("[data-compare-swap]").addEventListener("click", () => {
    const left = leftSelect.value;
    leftSelect.value = rightSelect.value;
    rightSelect.value = left;
    render();
  });

  leftSelect.addEventListener("change", () => render());
  rightSelect.addEventListener("change", () => render());

  root.addEventListener("click", event => {
    const why = event.target.closest("[data-compare-why-index]");
    if (!why) return;
    openWhy(Number(why.dataset.compareWhyIndex));
  });

  window.addEventListener("kidults:compare", event => {
    const leftId = event.detail?.leftId;
    const rightId = event.detail?.rightId;
    if (verticals.some(vertical => vertical.id === leftId)) leftSelect.value = leftId;
    if (verticals.some(vertical => vertical.id === rightId)) rightSelect.value = rightId;
    render({ scroll: true });
  });

  window.KIDULTS_COMPARE = Object.freeze({
    engine: normalizedContract.engine_id,
    version: normalizedContract.version,
    scope: normalizedContract.scope,
    truthRules: { ...normalizedContract.truth_rules },
    open(leftId, rightId) {
      window.dispatchEvent(new CustomEvent("kidults:compare", { detail: { leftId, rightId } }));
    },
    state() {
      return Object.freeze({ leftId: leftSelect.value, rightId: rightSelect.value });
    }
  });
}
