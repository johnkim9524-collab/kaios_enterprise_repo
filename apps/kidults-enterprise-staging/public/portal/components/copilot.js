const ROOT_ID = "kidults-copilot";
const STYLE_ID = "kidults-copilot-style";

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-copilot",
  version: "0.1.0",
  mode: "DETERMINISTIC_REGISTRY_GROUNDED_MVP",
  suggested_questions: [
    "Why is Mobility leading?",
    "What changed today?",
    "Compare Mobility and Watches.",
    "Show current evidence.",
    "What should I review today?"
  ],
  supported_intents: [
    "why-leading",
    "what-changed",
    "compare-verticals",
    "show-evidence",
    "review-today",
    "explain-target"
  ],
  truth_rules: {
    allow_external_llm: false,
    allow_fabricated_values: false,
    allow_unregistered_change_claims: false,
    missing_to_zero: false,
    require_snapshot_traceability: true,
    require_limitations: true,
    allow_investment_language: false
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

const human = value =>
  String(value ?? "NOT AVAILABLE").replaceAll("_", " ");

const isNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const formatPercent = value =>
  isNumber(value) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}%` : "NOT AVAILABLE";

const formatDate = value => {
  if (!value) return "NOT AVAILABLE";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(parsed));
};

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    suggested_questions: Array.isArray(candidate.suggested_questions)
      ? candidate.suggested_questions
      : DEFAULT_CONTRACT.suggested_questions,
    supported_intents: Array.isArray(candidate.supported_intents)
      ? candidate.supported_intents
      : DEFAULT_CONTRACT.supported_intents,
    truth_rules: {
      ...DEFAULT_CONTRACT.truth_rules,
      ...(candidate.truth_rules ?? {})
    }
  };
}

function normalizeQuestion(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[?.,!:/\\()[\]{}'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentContext(data) {
  const registry = data.registry ?? {};
  const manifest = data.manifest ?? {};
  return {
    snapshot: manifest.snapshot_id ?? registry.snapshot?.baseline_id ?? "NOT AVAILABLE",
    candidate: registry.snapshot?.candidate_id ?? registry.snapshot?.candidate_status ?? "WAITING",
    assessment: registry.assessment?.current_id ?? registry.assessment?.status ?? "WAITING",
    production: registry.release?.status ?? "NOT AVAILABLE",
    methodology: manifest.methodology_version ?? registry.versions?.methodology ?? "NOT REGISTERED",
    evidenceLineage: manifest.evidence_lineage_version ?? registry.versions?.evidence_lineage ?? "NOT REGISTERED",
    sourceMode: manifest.source_mode ?? "NOT AVAILABLE",
    registryAsOf: registry.freshness?.as_of ?? registry.generated_at ?? null,
    release: manifest.status ?? "NOT AVAILABLE"
  };
}

function baseTraceability(data, sourceRecord) {
  const context = currentContext(data);
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

function baseLimitations(data) {
  const context = currentContext(data);
  const limitations = [];

  if (!data.manifest?.production || context.production !== "PRODUCTION") {
    limitations.push("This release is not approved as Production intelligence.");
  }
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
    limitations.push("The current baseline is provider-independent and not provider-enriched.");
  }

  return limitations;
}

function sortedVerticals(data) {
  return (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.structural_order - b.structural_order);
}

function aliasesForVertical(vertical) {
  const aliases = new Set([
    vertical.name,
    vertical.short_name,
    vertical.slug,
    vertical.name.replace(/&/g, "and")
  ]);

  const name = normalizeQuestion(vertical.name);
  if (name.includes("automobiles")) {
    ["mobility", "automobile", "automobiles", "cars", "car"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("watches")) {
    ["watch", "watches", "time", "jewelry", "jewellery"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("fashion")) {
    ["fashion", "accessories", "sneakers", "footwear"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("toys")) {
    ["toy", "toys", "models", "figures"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("design")) {
    ["design", "furniture"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("technology")) {
    ["technology", "tech", "camera", "cameras"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("music")) {
    ["music", "audio", "instruments"].forEach(alias => aliases.add(alias));
  }
  if (name.includes("sports")) {
    ["sports", "memorabilia"].forEach(alias => aliases.add(alias));
  }

  return [...aliases]
    .map(normalizeQuestion)
    .filter(Boolean);
}

function findVerticalsInQuestion(question, data) {
  const normalized = normalizeQuestion(question);
  return sortedVerticals(data)
    .map((vertical, index) => {
      const matches = aliasesForVertical(vertical)
        .map(alias => ({ alias, position: normalized.indexOf(alias) }))
        .filter(match => match.position >= 0)
        .sort((a, b) => a.position - b.position || b.alias.length - a.alias.length);
      return matches.length ? { vertical, index, position: matches[0].position } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

function findObjectInQuestion(question, data) {
  const normalized = normalizeQuestion(question);
  return (data.k100?.items ?? [])
    .map((item, index) => {
      const candidates = [
        item.title,
        item.id,
        item.category
      ].map(normalizeQuestion);
      const match = candidates
        .map(alias => ({ alias, position: normalized.indexOf(alias) }))
        .filter(candidate => candidate.position >= 0)
        .sort((a, b) => a.position - b.position || b.alias.length - a.alias.length)[0];
      return match ? { item, index, position: match.position } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)[0] ?? null;
}

function leadingVerticalAnswer(data) {
  const verticalsByObservation = (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.current_observation_order - b.current_observation_order);
  const leader = verticalsByObservation[0];
  const structuralIndex = sortedVerticals(data).findIndex(item => item.id === leader?.id);

  if (!leader) return fallbackAnswer(data);

  return {
    intent: "why-leading",
    eyebrow: "CURRENT OBSERVATION",
    title: `Why ${leader.short_name || leader.name} appears first now`,
    summary:
      `${leader.name} is current observation order 1 in the provider-independent baseline. ` +
      `That position reflects the current evidence available to the portal; it is not a permanent market rank, canonical conclusion, or Track B assessment.`,
    state: "REGISTRY GROUNDED",
    facts: [
      ["Current observation order", String(leader.current_observation_order)],
      ["Right Data coverage", formatPercent(leader.right_data_coverage_pct)],
      ["Demand evidence", formatPercent(leader.demand_evidence_pct)],
      ["Relevant entities", String(leader.relevant)]
    ],
    evidence: [
      ["Demand evidence records", `${leader.demand_evidence_count} / ${leader.demand_denominator}`],
      ["Scarcity evidence records", String(leader.scarcity_evidence_count)],
      ["Current featured state", leader.featured ? "CURRENT FEATURED" : "CURRENT OBSERVATION"],
      ["Baseline interpretation", data.verticals?.interpretation ?? "NOT AVAILABLE"]
    ],
    limitations: [
      ...baseLimitations(data),
      "Current observation order and structural order are separate concepts.",
      "The portal does not claim permanent category superiority."
    ],
    traceability: baseTraceability(data, data.verticals?.source_registry ?? "portal/data/verticals.json"),
    actions: [
      { label: "Open WHY", kind: "why", targetType: "vertical", targetIndex: structuralIndex },
      { label: `Explore ${leader.short_name || leader.name}`, kind: "link", href: `vertical.html?id=${encodeURIComponent(leader.id)}` }
    ]
  };
}

function changeAnswer(data) {
  const context = currentContext(data);
  const registered = [
    ["Registry projection", data.registry?.freshness?.as_of ?? data.registry?.generated_at],
    ["Market signal snapshot", data.signals?.updated_at],
    ["Portal baseline", data.summary?.as_of],
    ["Release registered", data.manifest?.registered_at],
    ["Portal build", data.manifest?.build_at]
  ].filter(([, value]) => Boolean(value));

  return {
    intent: "what-changed",
    eyebrow: "CURRENT REGISTERED STATE",
    title: "What the portal can verify now",
    summary:
      "Copilot can describe the current registered state, but it will not claim a new change unless a previous observation or registered change event exists. The Living Pulse panel performs browser-to-browser delta detection.",
    state: "FAIL CLOSED",
    facts: [
      ["Candidate", context.candidate],
      ["Assessment", context.assessment],
      ["Production", context.production],
      ["Current research issue", data.research?.issue ?? "NOT AVAILABLE"]
    ],
    evidence: registered.map(([label, value]) => [label, formatDate(value)]),
    limitations: [
      ...baseLimitations(data),
      "No central event stream is registered for material-change classification.",
      "A first browser visit establishes a baseline rather than inventing historical changes."
    ],
    traceability: baseTraceability(data, "portal/data/registry-view.json"),
    actions: [
      { label: "Open Living Pulse", kind: "pulse" },
      { label: "View research", kind: "link", href: "#research" }
    ]
  };
}

function evidenceAnswer(data) {
  const evidence = data.summary?.operations?.find(item => item.label === "EVIDENCE OBJECTS");
  const sources = data.summary?.operations?.find(item => item.label === "SOURCE FAMILIES");
  const context = currentContext(data);

  return {
    intent: "show-evidence",
    eyebrow: "EVIDENCE STATUS",
    title: "Current evidence baseline",
    summary:
      "The portal can show the registered evidence baseline. It cannot call an evidence object 'new' until an event-level evidence record or comparison baseline is registered.",
    state: evidence?.state ?? "NOT AVAILABLE",
    facts: [
      ["Evidence objects", evidence?.value ?? "NOT AVAILABLE"],
      ["Evidence state", evidence?.state ?? "NOT AVAILABLE"],
      ["Source families", sources?.value ?? "NOT AVAILABLE"],
      ["Snapshot", context.snapshot]
    ],
    evidence: [
      ["Evidence definition", evidence?.caption ?? "NOT AVAILABLE"],
      ["Evidence detail", evidence?.detail ?? "NOT AVAILABLE"],
      ["Source-family definition", sources?.caption ?? "NOT AVAILABLE"],
      ["Source-family detail", sources?.detail ?? "NOT AVAILABLE"]
    ],
    limitations: [
      ...baseLimitations(data),
      "The current portal projection does not expose event-level evidence additions.",
      "No evidence object is labeled new without a registered comparison event."
    ],
    traceability: baseTraceability(data, "portal/data/portal-summary.json"),
    actions: [
      { label: "Open Evidence WHY", kind: "why", targetType: "operation", targetIndex: Math.max(0, data.summary?.operations?.findIndex(item => item.label === "EVIDENCE OBJECTS") ?? 0) },
      { label: "View evidence landscape", kind: "link", href: "#evidence-title" }
    ]
  };
}

function reviewAnswer(data) {
  const verticals = (data.verticals?.verticals ?? [])
    .slice()
    .sort((a, b) => a.current_observation_order - b.current_observation_order);
  const first = verticals[0];
  const second = verticals[1];
  const structuralIndex = sortedVerticals(data).findIndex(item => item.id === first?.id);

  if (!first) return fallbackAnswer(data);

  return {
    intent: "review-today",
    eyebrow: "REVIEW QUEUE",
    title: "A focused review path for the current baseline",
    summary:
      `Start with ${first.name}, then review the current research issue. This is a navigation recommendation based on the current observation structure—not investment advice or a Production decision.`,
    state: "PORTAL GUIDANCE",
    facts: [
      ["First review", first.name],
      ["Current observation order", String(first.current_observation_order)],
      ["Second review", second?.name ?? "NOT AVAILABLE"],
      ["Research issue", data.research?.issue ?? "NOT AVAILABLE"]
    ],
    evidence: [
      ["First vertical demand evidence", formatPercent(first.demand_evidence_pct)],
      ["First vertical Right Data", formatPercent(first.right_data_coverage_pct)],
      ["Current research", data.research?.title ?? "NOT AVAILABLE"],
      ["Research state", data.research?.status ?? "PUBLIC PREVIEW"]
    ],
    limitations: [
      ...baseLimitations(data),
      "This recommendation only prioritizes portal review.",
      "It is not a buy, sell, valuation, or investment recommendation."
    ],
    traceability: baseTraceability(data, data.verticals?.source_registry ?? "portal/data/verticals.json"),
    actions: [
      { label: "Open WHY", kind: "why", targetType: "vertical", targetIndex: structuralIndex },
      { label: "Open research", kind: "link", href: "#research" }
    ]
  };
}

function verticalAnswer(data, match) {
  const { vertical, index } = match;
  return {
    intent: "explain-target",
    eyebrow: "CORE VERTICAL",
    title: vertical.name,
    summary:
      `${vertical.summary} The portal currently reports provider-independent observability, not permanent category leadership.`,
    state: vertical.featured ? "CURRENT FEATURED" : "CURRENT OBSERVATION",
    facts: [
      ["Right Data coverage", formatPercent(vertical.right_data_coverage_pct)],
      ["Demand evidence", formatPercent(vertical.demand_evidence_pct)],
      ["Current observation order", String(vertical.current_observation_order)],
      ["Structural order", String(vertical.structural_order)]
    ],
    evidence: [
      ["Relevant entities", String(vertical.relevant)],
      ["Demand evidence records", `${vertical.demand_evidence_count} / ${vertical.demand_denominator}`],
      ["Scarcity evidence records", String(vertical.scarcity_evidence_count)],
      ["Representative scope", vertical.representative_scope.join(", ")]
    ],
    limitations: [
      ...baseLimitations(data),
      "Structural order is not a market rank.",
      "Featured state can change with a future immutable snapshot."
    ],
    traceability: baseTraceability(data, data.verticals?.source_registry ?? "portal/data/verticals.json"),
    actions: [
      { label: "Open WHY", kind: "why", targetType: "vertical", targetIndex: index },
      { label: "Explore vertical", kind: "link", href: `vertical.html?id=${encodeURIComponent(vertical.id)}` }
    ]
  };
}

function objectAnswer(data, match) {
  const { item, index } = match;
  const score = isNumber(item.score) ? Number(item.score).toFixed(1) : "GATED";

  return {
    intent: "explain-target",
    eyebrow: "KIDULT 100 OBJECT",
    title: item.title,
    summary:
      `${item.provenance} The portal keeps this public-preview result separate from a canonical ranking and independent Rankability Assessment.`,
    state: item.status,
    facts: [
      ["Preview observation score", score],
      ["Registered confidence", formatPercent(item.confidence)],
      ["Publisher freshness label", item.freshness ?? "NOT AVAILABLE"],
      ["Category", item.category]
    ],
    evidence: [
      ["Provenance statement", item.provenance],
      ["Asset state", item.asset_status],
      ["Selection type", data.k100?.selection_type ?? "NOT AVAILABLE"],
      ["Snapshot", data.k100?.snapshot_id ?? "NOT AVAILABLE"]
    ],
    limitations: [
      ...baseLimitations(data),
      "A displayed score is a preview observation, not a canonical ranking.",
      "The portal does not infer missing evidence."
    ],
    traceability: baseTraceability(data, "portal/data/kidult100.json"),
    actions: [
      { label: "Open WHY", kind: "why", targetType: "object", targetIndex: index },
      { label: "Open provenance", kind: "link", href: `object.html?id=${encodeURIComponent(item.id)}` }
    ]
  };
}

function compareAnswer(data, matches) {
  const selected = matches.slice(0, 2);
  if (selected.length < 2) {
    const verticals = (data.verticals?.verticals ?? [])
      .slice()
      .sort((a, b) => a.current_observation_order - b.current_observation_order)
      .slice(0, 2);
    selected.splice(0, selected.length, ...verticals.map(vertical => ({
      vertical,
      index: sortedVerticals(data).findIndex(item => item.id === vertical.id)
    })));
  }

  const [left, right] = selected;
  const a = left.vertical;
  const b = right.vertical;

  return {
    intent: "compare-verticals",
    eyebrow: "BASELINE COMPARISON",
    title: `${a.short_name || a.name} vs ${b.short_name || b.name}`,
    summary:
      "This comparison uses the current provider-independent vertical projection. It compares observability and evidence coverage—not investment quality, price performance, or permanent rank.",
    state: "COMPARISON",
    comparison: {
      headers: [a.short_name || a.name, b.short_name || b.name],
      rows: [
        ["Right Data coverage", formatPercent(a.right_data_coverage_pct), formatPercent(b.right_data_coverage_pct)],
        ["Demand evidence", formatPercent(a.demand_evidence_pct), formatPercent(b.demand_evidence_pct)],
        ["Relevant entities", String(a.relevant), String(b.relevant)],
        ["Demand records", `${a.demand_evidence_count} / ${a.demand_denominator}`, `${b.demand_evidence_count} / ${b.demand_denominator}`],
        ["Observation order", String(a.current_observation_order), String(b.current_observation_order)],
        ["Featured now", a.featured ? "YES" : "NO", b.featured ? "YES" : "NO"]
      ]
    },
    facts: [],
    evidence: [
      ["Comparison source", data.verticals?.source_registry ?? "portal/data/verticals.json"],
      ["Snapshot", data.verticals?.source_snapshot_id ?? "NOT AVAILABLE"],
      ["Source mode", data.verticals?.source_mode ?? "NOT AVAILABLE"],
      ["Interpretation", data.verticals?.interpretation ?? "NOT AVAILABLE"]
    ],
    limitations: [
      ...baseLimitations(data),
      "The comparison does not constitute a Track B Rankability Assessment.",
      "Higher coverage does not automatically mean higher value or superior market performance."
    ],
    traceability: baseTraceability(data, data.verticals?.source_registry ?? "portal/data/verticals.json"),
    actions: [
      { label: `WHY ${a.short_name || a.name}`, kind: "why", targetType: "vertical", targetIndex: left.index },
      { label: `WHY ${b.short_name || b.name}`, kind: "why", targetType: "vertical", targetIndex: right.index }
    ]
  };
}

function fallbackAnswer(data) {
  const context = currentContext(data);
  return {
    intent: "fallback",
    eyebrow: "REGISTRY-GROUNDED MVP",
    title: "That question is outside the current Copilot contract",
    summary:
      "This first Copilot release answers a controlled set of questions from the current Portal Registry projection. It does not call an external language model or invent an answer.",
    state: "LIMITED",
    facts: [
      ["Snapshot", context.snapshot],
      ["Candidate", context.candidate],
      ["Assessment", context.assessment],
      ["Release", context.release]
    ],
    evidence: [
      ["Supported", "Why the current leading vertical appears first"],
      ["Supported", "Current registered state and evidence baseline"],
      ["Supported", "Vertical comparison"],
      ["Supported", "Focused portal review path"]
    ],
    limitations: [
      ...baseLimitations(data),
      "Natural-language coverage is intentionally constrained in this MVP.",
      "Unsupported questions fail closed rather than produce speculative answers."
    ],
    traceability: baseTraceability(data, "portal/data/copilot-contract.json"),
    actions: []
  };
}

function routeQuestion(question, data) {
  const normalized = normalizeQuestion(question);
  const verticalMatches = findVerticalsInQuestion(normalized, data);
  const objectMatch = findObjectInQuestion(normalized, data);

  if (!normalized) return fallbackAnswer(data);

  if (
    normalized.includes("compare") ||
    normalized.includes(" versus ") ||
    normalized.includes(" vs ")
  ) {
    return compareAnswer(data, verticalMatches);
  }

  if (
    normalized.includes("what changed") ||
    normalized.includes("changed today") ||
    normalized.includes("changes today")
  ) {
    return changeAnswer(data);
  }

  if (
    normalized.includes("new evidence") ||
    normalized.includes("show evidence") ||
    normalized.includes("current evidence") ||
    normalized === "evidence"
  ) {
    return evidenceAnswer(data);
  }

  if (
    normalized.includes("what should i review") ||
    normalized.includes("review today") ||
    normalized.includes("what to review") ||
    normalized.includes("where should i start")
  ) {
    return reviewAnswer(data);
  }

  if (
    normalized.includes("leading") ||
    normalized.includes("first") ||
    normalized.includes("observation order 1")
  ) {
    return leadingVerticalAnswer(data);
  }

  if (objectMatch) return objectAnswer(data, objectMatch);
  if (verticalMatches.length) return verticalAnswer(data, verticalMatches[0]);

  return fallbackAnswer(data);
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/copilot.css?v=620";
  document.head.append(link);
}

function ensureRoot(contract) {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "kidults-copilot";
  root.setAttribute("aria-labelledby", "kidults-copilot-title");
  root.innerHTML = `
    <div class="shell kidults-copilot__shell">
      <div class="kidults-copilot__intro">
        <div>
          <p class="eyebrow">REGISTRY-GROUNDED INTELLIGENCE</p>
          <h2 id="kidults-copilot-title">Ask KIDULTS.</h2>
        </div>
        <p>Question the current Portal Registry, evidence baseline and WHY layer. Unsupported questions fail closed.</p>
      </div>

      <form class="kidults-copilot__form" data-copilot-form>
        <label class="sr-only" for="kidults-copilot-question">Ask KIDULTS a question</label>
        <input
          id="kidults-copilot-question"
          name="question"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Why is Mobility leading?"
          data-copilot-input
        >
        <button type="submit">Ask <span aria-hidden="true">→</span></button>
      </form>

      <div class="kidults-copilot__suggestions" aria-label="Suggested questions" data-copilot-suggestions>
        ${contract.suggested_questions.map(question => `
          <button type="button" data-copilot-question="${esc(question)}">${esc(question)}</button>
        `).join("")}
      </div>

      <div class="kidults-copilot__status">
        <span><i aria-hidden="true"></i> Deterministic MVP</span>
        <span>No external LLM</span>
        <span>Snapshot traceable</span>
      </div>

      <article class="kidults-copilot__answer" data-copilot-answer hidden aria-live="polite">
        <header class="kidults-copilot__answer-head">
          <div>
            <p class="eyebrow" data-copilot-eyebrow>ANSWER</p>
            <h3 data-copilot-title>—</h3>
          </div>
          <span data-copilot-state>WAITING</span>
        </header>

        <p class="kidults-copilot__summary" data-copilot-summary></p>

        <div class="kidults-copilot__comparison" data-copilot-comparison hidden></div>

        <div class="kidults-copilot__answer-grid">
          <section data-copilot-facts-section>
            <p class="eyebrow">CURRENT FACTS</p>
            <dl data-copilot-facts></dl>
          </section>
          <section data-copilot-evidence-section>
            <p class="eyebrow">EVIDENCE</p>
            <dl data-copilot-evidence></dl>
          </section>
        </div>

        <section class="kidults-copilot__limitations">
          <p class="eyebrow">KNOWN LIMITATIONS</p>
          <ul data-copilot-limitations></ul>
        </section>

        <details class="kidults-copilot__traceability">
          <summary>Source traceability</summary>
          <dl data-copilot-traceability></dl>
        </details>

        <footer class="kidults-copilot__actions" data-copilot-actions></footer>
      </article>
    </div>
  `;

  const main = document.querySelector("#main");
  if (main) {
    main.prepend(root);
  } else {
    document.body.append(root);
  }
  return root;
}

function renderPairs(node, pairs) {
  node.innerHTML = pairs.map(([label, value]) => `
    <div>
      <dt>${esc(label)}</dt>
      <dd>${esc(value ?? "NOT AVAILABLE")}</dd>
    </div>
  `).join("");
}

function renderComparison(node, comparison) {
  if (!comparison) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }

  node.hidden = false;
  node.innerHTML = `
    <div class="kidults-copilot__comparison-head">
      <span>Metric</span>
      <strong>${esc(comparison.headers[0])}</strong>
      <strong>${esc(comparison.headers[1])}</strong>
    </div>
    ${comparison.rows.map(([label, left, right]) => `
      <div class="kidults-copilot__comparison-row">
        <span>${esc(label)}</span>
        <b>${esc(left)}</b>
        <b>${esc(right)}</b>
      </div>
    `).join("")}
  `;
}

function renderActions(node, actions) {
  node.innerHTML = actions.map((action, index) => {
    if (action.kind === "link") {
      return `<a href="${esc(action.href)}">${esc(action.label)} <span aria-hidden="true">→</span></a>`;
    }
    return `
      <button
        type="button"
        data-copilot-action="${esc(action.kind)}"
        data-copilot-action-index="${index}"
      >${esc(action.label)} <span aria-hidden="true">→</span></button>
    `;
  }).join("");
}

function renderAnswer(root, answer) {
  const container = root.querySelector("[data-copilot-answer]");
  container.hidden = false;
  container.dataset.intent = answer.intent;
  root.querySelector("[data-copilot-eyebrow]").textContent = answer.eyebrow;
  root.querySelector("[data-copilot-title]").textContent = answer.title;
  root.querySelector("[data-copilot-summary]").textContent = answer.summary;

  const state = root.querySelector("[data-copilot-state]");
  state.textContent = human(answer.state);
  state.dataset.state = normalizeQuestion(answer.state).replace(/\s+/g, "_").toUpperCase();

  const factsSection = root.querySelector("[data-copilot-facts-section]");
  const evidenceSection = root.querySelector("[data-copilot-evidence-section]");
  factsSection.hidden = !answer.facts.length;
  evidenceSection.hidden = !answer.evidence.length;

  renderPairs(root.querySelector("[data-copilot-facts]"), answer.facts);
  renderPairs(root.querySelector("[data-copilot-evidence]"), answer.evidence);
  renderPairs(root.querySelector("[data-copilot-traceability]"), answer.traceability);
  renderComparison(root.querySelector("[data-copilot-comparison]"), answer.comparison);

  root.querySelector("[data-copilot-limitations]").innerHTML =
    answer.limitations.map(item => `<li>${esc(item)}</li>`).join("");

  renderActions(root.querySelector("[data-copilot-actions]"), answer.actions);
  container.__copilotAnswer = answer;
  container.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function executeAction(action) {
  if (!action) return;

  if (action.kind === "why") {
    const trigger = document.querySelector(
      `[data-why-type="${CSS.escape(action.targetType)}"][data-why-index="${Number(action.targetIndex)}"]`
    );
    trigger?.click();
    return;
  }

  if (action.kind === "pulse") {
    const trigger = document.querySelector("[data-pulse-toggle]");
    trigger?.click();
  }
}

export function startCopilot({ data, contract } = {}) {
  if (!data) throw new Error("KIDULTS Copilot requires portal data.");
  const normalizedContract = normalizeContract(contract);
  ensureStylesheet();
  const root = ensureRoot(normalizedContract);
  const form = root.querySelector("[data-copilot-form]");
  const input = root.querySelector("[data-copilot-input]");

  const ask = question => {
    const text = String(question ?? "").trim();
    input.value = text;
    const answer = routeQuestion(text, data);
    renderAnswer(root, answer);
    return answer;
  };

  form.addEventListener("submit", event => {
    event.preventDefault();
    ask(input.value);
  });

  root.addEventListener("click", event => {
    const suggestion = event.target.closest("[data-copilot-question]");
    if (suggestion) {
      ask(suggestion.dataset.copilotQuestion);
      return;
    }

    const actionButton = event.target.closest("[data-copilot-action]");
    if (!actionButton) return;
    const answer = root.querySelector("[data-copilot-answer]")?.__copilotAnswer;
    const action = answer?.actions?.[Number(actionButton.dataset.copilotActionIndex)];
    executeAction(action);
  });

  window.KIDULTS_COPILOT = Object.freeze({
    engine: normalizedContract.engine_id,
    version: normalizedContract.version,
    mode: normalizedContract.mode,
    intents: normalizedContract.supported_intents.slice(),
    truthRules: { ...normalizedContract.truth_rules },
    ask
  });
}
