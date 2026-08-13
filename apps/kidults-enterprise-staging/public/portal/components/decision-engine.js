const ROOT_ID = "kidults-decision-engine";
const STYLE_ID = "kidults-decision-engine-style";

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-decision-engine",
  version: "0.1.0",
  mode: "PORTAL_REVIEW_GUIDANCE",
  max_items: 5,
  priority_basis: "current_observation_order",
  guidance_states: ["REVIEW_FIRST", "REVIEW", "OBSERVE", "WAITING"],
  gate_states: [
    "CURRENT",
    "WAITING_FOR_CANDIDATE",
    "WAITING_FOR_ASSESSMENT",
    "PREVIEW_ONLY",
    "NOT_AVAILABLE"
  ],
  truth_rules: {
    allow_investment_language: false,
    allow_final_decision: false,
    allow_registry_mutation: false,
    allow_rankability_claims: false,
    allow_missing_to_zero: false,
    require_snapshot_traceability: true,
    require_gate_disclosure: true,
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

const isNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const pct = value =>
  isNumber(value) ? `${Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%` : "NOT AVAILABLE";

const integer = value =>
  isNumber(value) ? Number(value).toLocaleString() : "NOT AVAILABLE";

const human = value =>
  String(value ?? "NOT AVAILABLE").replaceAll("_", " ");

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    max_items: Number.isInteger(candidate.max_items) && candidate.max_items > 0
      ? candidate.max_items
      : DEFAULT_CONTRACT.max_items,
    guidance_states: Array.isArray(candidate.guidance_states)
      ? candidate.guidance_states
      : DEFAULT_CONTRACT.guidance_states,
    gate_states: Array.isArray(candidate.gate_states)
      ? candidate.gate_states
      : DEFAULT_CONTRACT.gate_states,
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    }
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

function sortedByStructure(data) {
  return (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.structural_order - b.structural_order);
}

function sortedByObservation(data) {
  return (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.current_observation_order - b.current_observation_order);
}

function contextFor(data) {
  const registry = data.registry ?? {};
  const manifest = data.manifest ?? {};
  return {
    registryConnected: Boolean(data.meta?.registryProjectionConnected),
    snapshot: data.verticals?.source_snapshot_id ?? manifest.snapshot_id ?? registry.snapshot?.baseline_id ?? "NOT AVAILABLE",
    sourceRegistry: data.verticals?.source_registry ?? "portal/data/verticals.json",
    sourceMode: data.verticals?.source_mode ?? manifest.source_mode ?? "NOT AVAILABLE",
    candidate: registry.snapshot?.candidate_id ?? registry.snapshot?.candidate_status ?? "WAITING",
    candidateReady: Boolean(registry.snapshot?.candidate_id),
    assessment: registry.assessment?.current_id ?? registry.assessment?.status ?? "WAITING",
    assessmentReady: Boolean(registry.assessment?.current_id),
    production: registry.release?.status ?? "NOT AVAILABLE",
    productionReady: registry.release?.status === "PRODUCTION",
    methodology: manifest.methodology_version ?? registry.versions?.methodology ?? "NOT REGISTERED",
    evidenceLineage: manifest.evidence_lineage_version ?? registry.versions?.evidence_lineage ?? "NOT REGISTERED",
    registryAsOf: registry.freshness?.as_of ?? registry.generated_at ?? null,
    release: manifest.status ?? "NOT AVAILABLE"
  };
}

function resolveGateState(context) {
  if (!context.registryConnected) return "NOT_AVAILABLE";
  if (!context.candidateReady) return "WAITING_FOR_CANDIDATE";
  if (!context.assessmentReady) return "WAITING_FOR_ASSESSMENT";
  if (!context.productionReady) return "PREVIEW_ONLY";
  return "CURRENT";
}

function guidanceFor(vertical) {
  if (!vertical || !isNumber(vertical.current_observation_order)) return "WAITING";
  if (Number(vertical.current_observation_order) === 1) return "REVIEW_FIRST";
  if (vertical.featured === true) return "REVIEW";
  return "OBSERVE";
}

function guidanceReason(vertical) {
  const order = isNumber(vertical.current_observation_order)
    ? `current observation order ${integer(vertical.current_observation_order)}`
    : "no registered observation order";
  const coverage = pct(vertical.right_data_coverage_pct);
  const demand = pct(vertical.demand_evidence_pct);

  if (Number(vertical.current_observation_order) === 1) {
    return `${vertical.name} is first in the current observation sequence, with ${coverage} Right Data coverage and ${demand} demand-evidence coverage.`;
  }
  if (vertical.featured === true) {
    return `${vertical.name} is part of the current Featured set at ${order}, with ${coverage} Right Data coverage and ${demand} demand-evidence coverage.`;
  }
  return `${vertical.name} remains in the observation queue at ${order}. It is not part of the current Featured set.`;
}

function gateRows(context) {
  return [
    ["Registry", context.registryConnected ? "CONNECTED" : "NOT AVAILABLE"],
    ["Candidate", context.candidate],
    ["Assessment", context.assessment],
    ["Production", context.production],
    ["Methodology", context.methodology],
    ["Evidence lineage", context.evidenceLineage]
  ];
}

function limitationsFor(data, context) {
  const limitations = [
    "This is portal review guidance, not investment advice and not a final decision.",
    "Review order is derived from registered current observation order and Featured state.",
    "The Decision Support Engine does not modify any Registry or approve Production.",
    "A higher review priority does not imply higher price, value, return or permanent rank."
  ];

  if (!context.candidateReady) limitations.push("No Candidate Snapshot is registered.");
  if (!context.assessmentReady) limitations.push("No independent Track B Rankability Assessment is registered.");
  if (!context.productionReady) limitations.push("The current release is not approved as Production intelligence.");
  if (String(context.methodology).includes("NOT")) limitations.push("The formal methodology version is not registered.");
  if (String(context.evidenceLineage).includes("NOT")) limitations.push("The formal evidence-lineage version is not registered.");
  if (String(context.sourceMode).includes("PROVIDER_INDEPENDENT")) {
    limitations.push("The current baseline is provider-independent and not provider-enriched.");
  }

  return limitations;
}

function buildModel(data, contract) {
  const context = contextFor(data);
  const structural = sortedByStructure(data);
  const queue = sortedByObservation(data)
    .slice(0, contract.max_items)
    .map(vertical => ({
      vertical,
      structuralIndex: structural.findIndex(item => item.id === vertical.id),
      guidance: guidanceFor(vertical),
      reason: guidanceReason(vertical)
    }));

  return {
    context,
    gateState: resolveGateState(context),
    queue,
    leader: queue[0]?.vertical ?? null,
    gates: gateRows(context),
    limitations: limitationsFor(data, context),
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
  link.href = "components/decision-engine.css?v=640";
  document.head.append(link);
}

function ensureRoot() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "decision-engine";
  root.setAttribute("aria-labelledby", "decision-engine-title");
  root.innerHTML = `
    <div class="shell decision-engine__shell">
      <header class="decision-engine__intro">
        <div>
          <p class="eyebrow">DECISION SUPPORT</p>
          <h2 id="decision-engine-title">Know what to review next.</h2>
        </div>
        <p>Turn the current Registry projection into a focused review queue. Guidance remains fail-closed until Candidate, Assessment and Production gates are registered.</p>
      </header>

      <div class="decision-engine__overview">
        <article class="decision-engine__primary" data-decision-primary></article>
        <aside class="decision-engine__gates">
          <div class="decision-engine__gates-head">
            <p class="eyebrow">DECISION GATES</p>
            <span data-decision-gate-state>WAITING</span>
          </div>
          <dl data-decision-gates></dl>
        </aside>
      </div>

      <div class="decision-engine__section-head">
        <div><p class="eyebrow">TOP REVIEW QUEUE</p><h3>Five current priorities, one traceable basis.</h3></div>
        <p>Priority follows current observation order. It is not a market rank, recommendation to transact or independent assessment.</p>
      </div>

      <div class="decision-engine__queue" data-decision-queue></div>

      <section class="decision-engine__limitations">
        <div class="decision-engine__section-head">
          <div><p class="eyebrow">KNOWN LIMITATIONS</p><h3>What this guidance does not claim.</h3></div>
        </div>
        <ul data-decision-limitations></ul>
      </section>

      <details class="decision-engine__traceability">
        <summary>Decision-support traceability</summary>
        <dl data-decision-traceability></dl>
      </details>
    </div>
  `;

  const compare = document.getElementById("kidults-compare-engine");
  if (compare) {
    compare.insertAdjacentElement("afterend", root);
  } else {
    document.querySelector("#main")?.prepend(root);
  }
  return root;
}

function renderPairs(node, pairs) {
  node.innerHTML = pairs.map(([label, value]) => `
    <div><dt>${esc(label)}</dt><dd>${esc(human(value))}</dd></div>
  `).join("");
}

function actionButtons(item, leader) {
  const compareTarget = item.vertical.id === leader?.id
    ? null
    : leader?.id;

  return `
    <div class="decision-engine__actions">
      <button type="button" data-decision-why-index="${item.structuralIndex}">WHY <span aria-hidden="true">→</span></button>
      ${compareTarget ? `<button type="button" data-decision-compare-left="${esc(leader.id)}" data-decision-compare-right="${esc(item.vertical.id)}">Compare <span aria-hidden="true">→</span></button>` : ""}
      <button type="button" data-decision-ask="${esc(item.vertical.name)}">Ask <span aria-hidden="true">→</span></button>
      <a href="vertical.html?id=${encodeURIComponent(item.vertical.id)}">Explore <span aria-hidden="true">→</span></a>
    </div>
  `;
}

function renderPrimary(node, model) {
  const first = model.queue[0];
  if (!first) {
    node.innerHTML = `
      <p class="eyebrow">CURRENT PRIORITY</p>
      <h3>WAITING</h3>
      <p>No registered Core Vertical is available for review guidance.</p>
    `;
    return;
  }

  node.innerHTML = `
    <div class="decision-engine__primary-top">
      <div>
        <p class="eyebrow">CURRENT PRIORITY</p>
        <span data-guidance="${esc(first.guidance)}">${esc(human(first.guidance))}</span>
      </div>
      <b>OBSERVATION ${String(first.vertical.current_observation_order).padStart(2, "0")}</b>
    </div>
    <h3>${esc(first.vertical.name)}</h3>
    <p>${esc(first.reason)}</p>
    <div class="decision-engine__primary-metrics">
      <div><strong>${esc(pct(first.vertical.right_data_coverage_pct))}</strong><span>Right Data</span></div>
      <div><strong>${esc(pct(first.vertical.demand_evidence_pct))}</strong><span>Demand evidence</span></div>
      <div><strong>${esc(integer(first.vertical.relevant))}</strong><span>Relevant entities</span></div>
    </div>
    ${actionButtons(first, model.leader)}
  `;
}

function queueCard(item, model, index) {
  return `
    <article class="decision-engine__card" data-guidance="${esc(item.guidance)}">
      <header>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <b>${esc(human(item.guidance))}</b>
      </header>
      <h4>${esc(item.vertical.name)}</h4>
      <p>${esc(item.reason)}</p>
      <dl>
        <div><dt>Observation</dt><dd>${esc(integer(item.vertical.current_observation_order))}</dd></div>
        <div><dt>Right Data</dt><dd>${esc(pct(item.vertical.right_data_coverage_pct))}</dd></div>
        <div><dt>Demand</dt><dd>${esc(pct(item.vertical.demand_evidence_pct))}</dd></div>
        <div><dt>Featured</dt><dd>${item.vertical.featured ? "YES" : "NO"}</dd></div>
      </dl>
      ${actionButtons(item, model.leader)}
    </article>
  `;
}

function renderModel(root, model) {
  root.dataset.gateState = model.gateState;
  const gateState = root.querySelector("[data-decision-gate-state]");
  gateState.textContent = human(model.gateState);
  gateState.dataset.state = model.gateState;

  renderPrimary(root.querySelector("[data-decision-primary]"), model);
  renderPairs(root.querySelector("[data-decision-gates]"), model.gates);
  renderPairs(root.querySelector("[data-decision-traceability]"), model.traceability);

  root.querySelector("[data-decision-queue]").innerHTML = model.queue
    .map((item, index) => queueCard(item, model, index))
    .join("");

  root.querySelector("[data-decision-limitations]").innerHTML = model.limitations
    .map(limit => `<li>${esc(limit)}</li>`)
    .join("");
}

function openWhy(index) {
  if (!Number.isInteger(index) || index < 0) return;
  document.querySelector(`[data-why-type="vertical"][data-why-index="${index}"]`)?.click();
}

function openCompare(leftId, rightId) {
  if (!leftId || !rightId) return;
  if (window.KIDULTS_COMPARE?.open) {
    window.KIDULTS_COMPARE.open(leftId, rightId);
    return;
  }
  window.dispatchEvent(new CustomEvent("kidults:compare", { detail: { leftId, rightId } }));
}

function askCopilot(verticalName) {
  if (!verticalName) return;
  const question = `Explain ${verticalName}`;
  if (window.KIDULTS_COPILOT?.ask) {
    window.KIDULTS_COPILOT.ask(question);
    document.getElementById("kidults-copilot")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function startDecisionEngine({ data, contract } = {}) {
  if (!data) throw new Error("Decision Support Engine requires portal data.");
  const normalizedContract = normalizeContract(contract);
  ensureStylesheet();
  const root = ensureRoot();
  const model = buildModel(data, normalizedContract);
  renderModel(root, model);

  root.addEventListener("click", event => {
    const why = event.target.closest("[data-decision-why-index]");
    if (why) {
      openWhy(Number(why.dataset.decisionWhyIndex));
      return;
    }

    const compare = event.target.closest("[data-decision-compare-left]");
    if (compare) {
      openCompare(compare.dataset.decisionCompareLeft, compare.dataset.decisionCompareRight);
      return;
    }

    const ask = event.target.closest("[data-decision-ask]");
    if (ask) askCopilot(ask.dataset.decisionAsk);
  });

  window.KIDULTS_DECISION = Object.freeze({
    engine: normalizedContract.engine_id,
    version: normalizedContract.version,
    mode: normalizedContract.mode,
    gateState: model.gateState,
    truthRules: { ...normalizedContract.truth_rules },
    queue: model.queue.map(item => Object.freeze({
      verticalId: item.vertical.id,
      guidance: item.guidance,
      observationOrder: item.vertical.current_observation_order
    }))
  });
}
