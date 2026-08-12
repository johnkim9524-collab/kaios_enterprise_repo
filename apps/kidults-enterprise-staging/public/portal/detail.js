const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

async function getJson(path) {
  const response = await fetch(path, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

function statusPills(items) {
  return `<div class="detail-status-row">${items.map(item => `<span>${esc(item)}</span>`).join("")}</div>`;
}

function traceability(data) {
  const rows = Object.entries(data).map(([key, value]) => `
    <div><dt>${esc(key.replaceAll("_", " "))}</dt><dd>${esc(value ?? "NOT AVAILABLE")}</dd></div>
  `).join("");

  return `<div class="traceability-panel"><dl>${rows}</dl></div>`;
}

function visualMarkup(asset, label, order) {
  if (asset) {
    return `<div class="detail-visual"><img src="${esc(asset)}?v=502" alt="${esc(label)}" loading="eager"></div>`;
  }

  return `<div class="detail-visual"><div class="detail-visual-placeholder" aria-label="Editorial visual pending">${esc(order)}</div></div>`;
}

function renderVertical(root, verticals, manifest, id) {
  const vertical = verticals.verticals.find(item => item.id === id);
  if (!vertical) throw new Error(`Unknown vertical: ${id || "missing id"}`);

  document.title = `${vertical.name} — KIDULTS V502`;
  root.innerHTML = `
    <section class="detail-hero">
      <div>
        <p class="eyebrow">CORE VERTICAL ${String(vertical.structural_order).padStart(2, "0")}</p>
        <h1>${esc(vertical.name)}</h1>
        ${statusPills([
          vertical.featured ? "CURRENT FEATURED" : "CORE VERTICAL",
          `OBSERVATION ${String(vertical.current_observation_order).padStart(2, "0")}`,
          vertical.visual_status.replaceAll("_", " ")
        ])}
        <p class="detail-intro">${esc(vertical.summary)}</p>
      </div>
      ${visualMarkup(vertical.visual_asset, vertical.name, String(vertical.structural_order).padStart(2, "0"))}
    </section>

    <section class="detail-section">
      <p class="eyebrow">CURRENT OBSERVABILITY</p>
      <h2>Measured under the provider-independent baseline.</h2>
      <div class="detail-metric-grid">
        <article class="detail-metric-card"><strong>${Number(vertical.right_data_coverage_pct).toFixed(2)}%</strong><span>Right Data Coverage</span></article>
        <article class="detail-metric-card"><strong>${Number(vertical.demand_evidence_pct).toFixed(1)}%</strong><span>Demand Evidence</span></article>
        <article class="detail-metric-card"><strong>${esc(vertical.relevant)}</strong><span>Relevant Records</span></article>
        <article class="detail-metric-card"><strong>${esc(vertical.scarcity_evidence_count)}</strong><span>Scarcity Evidence</span></article>
      </div>
    </section>

    <section class="detail-section">
      <p class="eyebrow">REPRESENTATIVE SCOPE</p>
      <h2>Objects and entities covered by this vertical.</h2>
      <ul class="scope-list">${vertical.representative_scope.map(item => `<li>${esc(item)}</li>`).join("")}</ul>
    </section>

    <section class="detail-section">
      <p class="eyebrow">INTERPRETATION LIMITS</p>
      <h2>Current readiness, not permanent superiority.</h2>
      <p class="detail-intro">${esc(verticals.interpretation)}</p>
    </section>

    <section class="detail-section">
      <p class="eyebrow">TRACEABILITY</p>
      <h2>Source and release context.</h2>
      ${traceability({
        source_registry: verticals.source_registry,
        source_snapshot_id: verticals.source_snapshot_id,
        source_mode: verticals.source_mode,
        release_id: manifest.release_id,
        portal_contract_version: manifest.portal_contract_version
      })}
    </section>
  `;
}

function renderObject(root, k100, manifest, id) {
  const object = k100.items.find(item => item.id === id);
  if (!object) throw new Error(`Unknown object: ${id || "missing id"}`);

  document.title = `${object.title} — KIDULTS V502`;
  const score = object.score === null ? "GATED" : Number(object.score).toFixed(1);

  root.innerHTML = `
    <section class="detail-hero">
      <div>
        <p class="eyebrow">${esc(object.category)} · FEATURED OBJECT ${String(object.rank).padStart(2, "0")}</p>
        <h1>${esc(object.title)}</h1>
        ${statusPills([
          object.status,
          `${object.confidence}% CONFIDENCE`,
          object.asset_status.replaceAll("_", " ")
        ])}
        <p class="detail-intro">${esc(object.provenance)}</p>
      </div>
      ${visualMarkup(object.asset, object.title, String(object.rank).padStart(2, "0"))}
    </section>

    <section class="detail-section">
      <p class="eyebrow">PUBLIC PREVIEW READING</p>
      <h2>Evidence and publication state remain separated.</h2>
      <div class="detail-metric-grid">
        <article class="detail-metric-card"><strong>${esc(score)}</strong><span>Preview Score</span></article>
        <article class="detail-metric-card"><strong>${esc(object.confidence)}%</strong><span>Confidence</span></article>
        <article class="detail-metric-card"><strong>${esc(object.freshness)}</strong><span>Freshness</span></article>
        <article class="detail-metric-card"><strong>${String(object.rank).padStart(2, "0")}</strong><span>Featured Slice Position</span></article>
      </div>
    </section>

    <section class="detail-section">
      <p class="eyebrow">TRACEABILITY</p>
      <h2>Source and release context.</h2>
      ${traceability({
        source_snapshot_id: k100.snapshot_id,
        methodology_version: k100.methodology,
        vertical_id: object.vertical_id,
        release_id: manifest.release_id,
        asset_status: object.asset_status
      })}
    </section>
  `;
}

async function init() {
  const root = document.querySelector("[data-detail-root]");
  const type = document.documentElement.dataset.detailType;
  const id = new URLSearchParams(window.location.search).get("id");

  try {
    const [manifest, verticals, k100] = await Promise.all([
      getJson("data/v502-manifest.json?v=502"),
      getJson("data/verticals.json?v=502"),
      getJson("data/kidult100.json?v=502")
    ]);

    if (type === "vertical") renderVertical(root, verticals, manifest, id);
    else if (type === "object") renderObject(root, k100, manifest, id);
    else throw new Error(`Unsupported detail type: ${type}`);
  } catch (error) {
    root.innerHTML = `
      <section class="detail-loading">
        <p class="eyebrow">FAIL-CLOSED</p>
        <h1>Detail not available.</h1>
        <p class="detail-intro">${esc(error.message)}</p>
        <p><a class="button button-primary" href="index.html">Return to V502</a></p>
      </section>
    `;
  }
}

document.addEventListener("DOMContentLoaded", init);
