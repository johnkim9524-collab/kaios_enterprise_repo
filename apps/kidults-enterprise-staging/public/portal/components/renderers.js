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

  image.src = `${hero.asset}?v=502`;
  image.alt = hero.alt;
  target("[data-hero-eyebrow]").textContent = hero.eyebrow;
  target("[data-hero-title]").textContent = hero.title;
  target("[data-hero-subtitle]").textContent = hero.subtitle;
  target("[data-hero-rights]").innerHTML = esc(hero.rights_label).replace(/\n/g, "<br>");
  target("[data-hero-vertical]").textContent = hero.vertical_name;
  target("[data-hero-status]").textContent = hero.asset_status.replaceAll("_", " ");
  target("[data-release-label]").textContent = manifest.version.toUpperCase();
}

export function renderRegistryRibbon(registry, manifest) {
  const ribbon = target("[data-registry-ribbon]");
  const items = [
    {
      label: "Release",
      value: manifest.status.replaceAll("_", " "),
      state: manifest.status
    },
    {
      label: "Baseline",
      value: registry.snapshot.baseline_id,
      state: "BASELINE"
    },
    {
      label: "Candidate",
      value: registry.snapshot.candidate_id ?? "WAITING",
      state: registry.snapshot.candidate_status
    },
    {
      label: "Assessment",
      value: registry.assessment.current_id ?? registry.assessment.status,
      state: registry.assessment.status
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
  `).join("") + '<button class="registry-details-button" type="button" data-dialog="registry">Traceability →</button>';
}

export function renderSnapshot(summary) {
  const node = target("[data-snapshot-grid]");
  node.innerHTML = summary.metrics.map(metric => `
    <article class="snapshot-card reveal" data-source-record="${esc(summary.snapshot_id)}">
      <small>${esc(metric.label)}</small>
      <strong>${esc(metric.value)}</strong>
      <p>${esc(metric.caption)}</p>
      <span>${esc(metric.state)}</span>
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
      <small>${esc(item.detail)}</small>
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
              <a href="vertical.html?id=${encodeURIComponent(vertical.id)}">Explore <span>→</span></a>
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
        <div class="k100-figure"><img src="${esc(item.asset)}?v=502" alt="${esc(item.title)}" loading="lazy"></div>
        <div class="k100-score${item.score === null ? " score-gated" : ""}">
          <strong>${score}</strong>
          <p>${detail}</p>
          <a class="text-link" href="object.html?id=${encodeURIComponent(item.id)}">Provenance <span>→</span></a>
        </div>
      </article>`;
  }).join("");
}

export function renderSignals(signalData) {
  const node = target("[data-signal-grid]");
  node.innerHTML = signalData.signals.map(signal => `
    <article class="signal-card reveal">
      <header><strong>${esc(signal.category)}</strong><span>${esc(signal.change)}</span></header>
      <div class="signal-main">
        <div><h3>${esc(signal.title)}</h3><div class="signal-value"><strong>${esc(signal.value)}</strong><span>${esc(signal.unit)}</span></div></div>
      </div>
      <div class="sparkline">${sparklineSvg(signal.series, `${signal.title} recent trend`)}</div>
      <div class="signal-meta">
        <div><b>${esc(signal.confidence)}%</b><span>Confidence</span></div>
        <div><b>${esc(signal.sources)}</b><span>Source count</span></div>
        <div><b>${esc(signal.updated)}</b><span>Last updated</span></div>
      </div>
    </article>`).join("");
}

export function renderEvidence(summary) {
  target("[data-countries]").textContent = summary.coverage.countries;
  target("[data-markets]").textContent = summary.coverage.markets;
  target("[data-languages]").textContent = summary.coverage.languages;
  target("[data-total-signals]").textContent =
    summary.metrics.find(metric => metric.id === "qualifiedSignals")?.value ?? "—";

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
    ["Release", manifest.version],
    ["Snapshot", registry.snapshot.candidate_id ?? "WAITING"],
    ["Assessment", registry.assessment.current_id ?? "WAITING"],
    ["Production", registry.release.status]
  ];
  node.innerHTML = rows.map(([label, value]) => `
    <div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>
  `).join("");
}

export function renderPortalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="portal-error" role="alert">
      <strong>V502 fail-closed.</strong>
      Required portal data could not be loaded. ${esc(message)}
    </div>
  `);
}
