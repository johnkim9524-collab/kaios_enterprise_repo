import { sparklineSvg } from "./sparkline.js";

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

const formatPct = value =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(2).replace(/\.00$/, "")}%` : "NOT REGISTERED";

const formatDate = value => {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(parsed));
};

const stateToken = value =>
  String(value ?? "NOT_AVAILABLE").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");

function target(selector) {
  return document.querySelector(selector);
}

export function renderHero(manifest) {
  const hero = manifest.hero;
  const card = target("[data-hero-card]");
  const image = target("[data-hero-image]");

  card.dataset.assetState = "loading";
  image.addEventListener("load", () => {
    card.dataset.assetState = "ready";
  }, { once: true });
  image.addEventListener("error", () => {
    card.dataset.assetState = "missing";
    image.hidden = true;
  }, { once: true });

  image.src = `${hero.asset}?v=658`;
  image.alt = hero.alt;
  target("[data-hero-eyebrow]").textContent = hero.eyebrow;
  target("[data-hero-title]").textContent = hero.title;
  target("[data-hero-subtitle]").textContent = hero.subtitle;
  target("[data-hero-rights]").innerHTML = esc(hero.rights_label).replace(/\n/g, "<br>");
  target("[data-hero-vertical]").textContent = hero.vertical_name;
  target("[data-hero-status]").textContent = hero.asset_status.replaceAll("_", " ");
  target("[data-release-label]").textContent = manifest.experience_label ?? "V6 RC";
}

export function renderRegistryRibbon(registry, manifest) {
  const ribbon = target("[data-registry-ribbon]");
  const items = [
    {
      label: "Baseline",
      value: registry.snapshot.baseline_id,
      state: "BASELINE"
    },
    {
      label: "Data contract",
      value: manifest.version.toUpperCase(),
      state: manifest.status
    },
    {
      label: "Source",
      value: manifest.source_mode.replaceAll("_", " "),
      state: "CURRENT"
    },
    {
      label: "Methodology",
      value: registry.versions.methodology.replaceAll("_", " "),
      state: registry.versions.methodology === "NOT_YET_REGISTERED" ? "NOT_REGISTERED" : "CURRENT"
    }
  ];

  ribbon.innerHTML = items.map(item => `
    <span class="registry-status-item" data-state="${esc(stateToken(item.state))}">
      <i aria-hidden="true"></i>
      <b>${esc(item.label)}</b>
      <span>${esc(item.value)}</span>
    </span>
  `).join("") + '<button class="registry-details-button" type="button" data-dialog="registry">System traceability →</button>';
}

export function renderSnapshot(summary) {
  const node = target("[data-snapshot-grid]");
  node.innerHTML = summary.metrics.map(metric => `
    <article class="snapshot-card reveal" data-source-record="${esc(summary.snapshot_id)}">
      <header class="snapshot-card-header">
        <small>${esc(metric.label)}</small>
        <div class="why-slot" data-why-slot></div>
      </header>
      <strong>${esc(metric.value)}</strong>
      <p>${esc(metric.caption)}</p>
      <span class="snapshot-state">${esc(metric.state)}</span>
    </article>`).join("");
}

export function renderOperations(summary) {
  const node = target("[data-operations-grid]");
  node.innerHTML = summary.operations.map(item => `
    <article class="operation-card reveal">
      <span class="state-badge" data-tone="${esc(item.tone)}">${esc(item.state)}</span>
      <span class="operation-label">${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <p>${esc(item.caption)}</p>
      <div class="operation-footer">
        <small>${esc(item.detail)}</small>
        <div class="why-slot" data-why-slot></div>
      </div>
    </article>`).join("");
}

export function renderVerticals(verticalData) {
  const node = target("[data-vertical-grid]");
  const interpretation = target("[data-vertical-interpretation]");

  node.innerHTML = verticalData.verticals
    .slice()
    .sort((a, b) => a.structural_order - b.structural_order)
    .map(vertical => {
      const visualState = vertical.visual_status.replaceAll("_", " ");
      const currentOrder = String(vertical.current_observation_order).padStart(2, "0");
      return `
        <article
          class="vertical-card reveal"
          data-vertical-card
          data-featured="${vertical.featured}"
          style="--coverage:${Number(vertical.right_data_coverage_pct)}%"
        >
          <div class="vertical-card-top">
            <span class="vertical-order">${String(vertical.structural_order).padStart(2, "0")}</span>
            <div class="vertical-flags">
              ${vertical.featured ? '<span class="vertical-flag featured">CURRENT FEATURED</span>' : ""}
              <span class="vertical-flag">OBSERVATION ${currentOrder}</span>
            </div>
            <span class="vertical-glyph" aria-hidden="true">${String(vertical.structural_order).padStart(2, "0")}</span>
          </div>
          <div class="vertical-card-body">
            <h3>${esc(vertical.name)}</h3>
            <p class="vertical-card-summary">${esc(vertical.summary)}</p>
            <div class="vertical-metrics">
              <div class="vertical-metric">
                <strong>${formatPct(vertical.right_data_coverage_pct)}</strong>
                <span>Right Data</span>
              </div>
              <div class="vertical-metric">
                <strong>${formatPct(vertical.demand_evidence_pct)}</strong>
                <span>Demand evidence</span>
              </div>
            </div>
            <div class="coverage-bar" aria-hidden="true"><i></i></div>
            <div class="vertical-card-footer">
              <small>${esc(visualState)}</small>
              <div class="vertical-card-actions">
                <div class="why-slot" data-why-slot></div>
                <a href="vertical.html?id=${encodeURIComponent(vertical.id)}">Explore <span>→</span></a>
              </div>
            </div>
          </div>
        </article>`;
    }).join("");

  interpretation.innerHTML = `
    <b>Interpretation.</b>
    ${esc(verticalData.interpretation)}
    Structural order is not the current observation order. The Featured 5 may change when a new immutable snapshot is registered.
  `;
}

export function renderK100(k100) {
  const node = target("[data-k100-gallery]");
  node.innerHTML = k100.items.map(item => {
    const score = item.score === null ? "Score gated" : `Score ${Number(item.score).toFixed(1)}`;
    const detail = item.score === null
      ? `${esc(item.status)} · institutional release pending`
      : `${esc(item.confidence)}% confidence · ${esc(item.freshness)} freshness`;

    return `
      <article class="k100-card reveal">
        <header>
          <span class="k100-rank">${String(item.rank).padStart(2, "0")}</span>
          <span class="k100-category">${esc(item.category)}</span>
        </header>
        <h3>${esc(item.title)}</h3>
        <div class="k100-figure"><img src="${esc(item.asset)}?v=658" alt="${esc(item.title)}" loading="lazy"></div>
        <div class="k100-score${item.score === null ? " score-gated" : ""}">
          <strong>${score}</strong>
          <p>${detail}</p>
          <div class="k100-card-actions">
            <a class="text-link" href="object.html?id=${encodeURIComponent(item.id)}">Provenance <span>→</span></a>
            <div class="why-slot" data-why-slot></div>
          </div>
        </div>
      </article>`;
  }).join("");
}

export function renderSignals(signalData) {
  const node = target("[data-signal-grid]");
  const snapshotTime = formatDate(signalData.updated_at);

  node.innerHTML = signalData.signals.map(signal => `
    <article class="signal-card reveal">
      <header>
        <strong>${esc(signal.category)}</strong>
        <div class="signal-card-tools">
          <span>${esc(signal.change)}</span>
          <div class="why-slot" data-why-slot></div>
        </div>
      </header>
      <div class="signal-main">
        <div><h3>${esc(signal.title)}</h3><div class="signal-value"><strong>${esc(signal.value)}</strong><span>${esc(signal.unit)}</span></div></div>
      </div>
      <div class="sparkline">${sparklineSvg(signal.series, `${signal.title} recent registered trend`)}</div>
      <div class="signal-meta">
        <div><b>${esc(signal.confidence)}%</b><span>Registered confidence</span></div>
        <div><b>${esc(signal.sources)}</b><span>Source count</span></div>
        <div><b>${esc(snapshotTime)}</b><span>Snapshot as of</span></div>
      </div>
    </article>`).join("");
}

export function renderEvidence(summary, k100) {
  target("[data-countries]").textContent = summary.coverage.countries;
  target("[data-markets]").textContent = summary.coverage.markets;
  target("[data-languages]").textContent = summary.coverage.languages;

  const qualifiedSignals = summary.metrics.find(metric => metric.id === "qualifiedSignals");
  const trackedEntities = summary.metrics.find(metric => metric.id === "trackedEntities");
  const evidenceObjects = summary.operations.find(item => item.label === "EVIDENCE OBJECTS");

  target("[data-total-signals]").textContent = qualifiedSignals?.value ?? "—";

  const funnel = target("[data-data-funnel]");
  if (funnel) {
    const layers = [
      [qualifiedSignals?.value ?? "—", "Normalized signals", qualifiedSignals?.state ?? "NOT AVAILABLE"],
      [trackedEntities?.value ?? "—", "Tracked entities", trackedEntities?.state ?? "NOT AVAILABLE"],
      [evidenceObjects?.value ?? "—", "Registered evidence objects", evidenceObjects?.state ?? "NOT AVAILABLE"],
      [String(k100?.items?.length ?? 0), "Current editorial slice", k100?.selection_type ?? "PUBLIC PREVIEW"],
      ["BUILDING", "Kidult 100", "Evidence-gated benchmark"]
    ];

    funnel.innerHTML = layers.map(([value, label, state], index) => `
      <div class="data-funnel__layer">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${esc(value)}</strong>
        <b>${esc(label)}</b>
        <small>${esc(humanState(state))}</small>
      </div>
      ${index < layers.length - 1 ? '<i aria-hidden="true">→</i>' : ""}
    `).join("");
  }

  const stops = [];
  let position = 0;
  summary.composition.forEach(item => {
    stops.push(`${item.color} ${position}% ${position + item.value}%`);
    position += item.value;
  });
  target("[data-donut]").style.background = `conic-gradient(${stops.join(",")})`;

  target("[data-composition-list]").innerHTML =
    summary.composition.map(item => `
      <li><span><i style="background:${esc(item.color)}"></i>${esc(item.label)}</span><strong>${esc(item.value)}%</strong></li>
    `).join("");
}

function humanState(value) {
  return String(value ?? "NOT AVAILABLE").replaceAll("_", " ");
}

export function renderResearch(research) {
  target("[data-research-issue]").textContent = research.issue;
  target("[data-research-title]").textContent = research.title;
  target("[data-research-subtitle]").textContent = research.subtitle;
  target("[data-research-summary]").textContent = research.summary;
  target("[data-research-notes]").innerHTML =
    research.sections.map(section => `
      <article class="research-note reveal">
        <span>${esc(section.index)}</span>
        <div><h3>${esc(section.title)}</h3><p>${esc(section.summary)}</p></div>
      </article>`).join("");
}

export function renderArchive(archive) {
  target("[data-archive-list]").innerHTML =
    archive.editions.map(item => `
      <article class="archive-row reveal">
        <time>${esc(item.edition)}</time>
        <div><h3>${esc(item.title)}</h3><p>${esc(item.subtitle)}</p></div>
        <span>${esc(item.status)}</span>
      </article>`).join("");
}

export function renderReleaseBaseline(registry, manifest) {
  const node = target("[data-release-baseline]");
  const rows = [
    ["Experience", manifest.experience_label ?? "V6 RC"],
    ["Data contract", manifest.version.toUpperCase()],
    ["Candidate", registry.snapshot.candidate_id ?? registry.snapshot.candidate_status ?? "WAITING"],
    ["Production", registry.release.status]
  ];
  node.innerHTML = rows.map(([label, value]) => `
    <div><dt>${esc(label)}</dt><dd>${esc(humanState(value))}</dd></div>
  `).join("");
}

export function renderPortalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="portal-error" role="alert">
      <strong>V6 fail-closed.</strong>
      Required portal data could not be loaded. ${esc(message)}
    </div>
  `);
}