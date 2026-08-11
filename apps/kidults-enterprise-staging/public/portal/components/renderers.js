import { sparklineSvg } from "./sparkline.js";

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

export function renderSnapshot(summary) {
  const target = document.querySelector("[data-snapshot-grid]");
  target.innerHTML = summary.metrics.map(metric => `
    <article class="snapshot-card reveal">
      <small>${esc(metric.label)}</small>
      <strong>${esc(metric.value)}</strong>
      <p>${esc(metric.caption)}</p>
      <span>${esc(metric.state)}</span>
    </article>`).join("");
}

export function renderOperations(summary) {
  const target = document.querySelector("[data-operations-grid]");
  target.innerHTML = summary.operations.map(item => `
    <article class="operation-card reveal">
      <span class="state-badge" data-tone="${esc(item.tone)}">${esc(item.state)}</span>
      <span class="operation-label">${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <p>${esc(item.caption)}</p>
      <small>${esc(item.detail)}</small>
    </article>`).join("");
}

export function renderK100(k100) {
  const target = document.querySelector("[data-k100-gallery]");
  target.innerHTML = k100.items.map(item => {
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
        <div class="k100-figure"><img src="${esc(item.asset)}?v=500" alt="${esc(item.title)}"></div>
        <div class="k100-score${item.score === null ? " score-gated" : ""}">
          <strong>${score}</strong>
          <p>${detail}</p>
          <button class="text-link" type="button" data-object="${esc(item.id)}">Provenance <span>→</span></button>
        </div>
      </article>`;
  }).join("");
}

export function renderSignals(signalData) {
  const target = document.querySelector("[data-signal-grid]");
  target.innerHTML = signalData.signals.map(signal => `
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
  document.querySelector("[data-countries]").textContent = summary.coverage.countries;
  document.querySelector("[data-markets]").textContent = summary.coverage.markets;
  document.querySelector("[data-languages]").textContent = summary.coverage.languages;
  document.querySelector("[data-total-signals]").textContent =
    summary.metrics.find(metric => metric.id === "qualifiedSignals")?.value ?? "—";

  const stops = [];
  let position = 0;
  summary.composition.forEach(item => {
    stops.push(`${item.color} ${position}% ${position + item.value}%`);
    position += item.value;
  });
  document.querySelector("[data-donut]").style.background = `conic-gradient(${stops.join(",")})`;

  document.querySelector("[data-composition-list]").innerHTML =
    summary.composition.map(item => `
      <li><span><i style="background:${esc(item.color)}"></i>${esc(item.label)}</span><strong>${esc(item.value)}%</strong></li>`
    ).join("");
}

export function renderResearch(research) {
  document.querySelector("[data-research-issue]").textContent = research.issue;
  document.querySelector("[data-research-title]").textContent = research.title;
  document.querySelector("[data-research-subtitle]").textContent = research.subtitle;
  document.querySelector("[data-research-summary]").textContent = research.summary;
  document.querySelector("[data-research-notes]").innerHTML =
    research.sections.map(section => `
      <article class="research-note reveal">
        <span>${esc(section.index)}</span>
        <div><h3>${esc(section.title)}</h3><p>${esc(section.summary)}</p></div>
      </article>`).join("");
}

export function renderArchive(archive) {
  document.querySelector("[data-archive-list]").innerHTML =
    archive.editions.map(item => `
      <article class="archive-row reveal">
        <time>${esc(item.edition)}</time>
        <div><h3>${esc(item.title)}</h3><p>${esc(item.subtitle)}</p></div>
        <span>${esc(item.status)}</span>
      </article>`).join("");
}
