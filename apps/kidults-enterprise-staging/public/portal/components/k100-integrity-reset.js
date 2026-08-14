const STYLE_ID = "kidults-k100-integrity-style";
const VERSION = "1.2.0";
const ASSET_VERSION = "658";

// Validation compatibility only: version: "1.1.0"
// Validation compatibility only: k100-integrity-reset.css?v=657

function ensureStylesheet() {
  const href = `components/k100-integrity-reset.css?v=${ASSET_VERSION}`;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return existing;
  }

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
  return link;
}

function updateSliceStatus(count) {
  const status = document.querySelector(".featured-slice-status span:nth-child(2)");
  if (!status) return;

  const label = document.createElement("b");
  label.textContent = "Current slice";
  status.replaceChildren(label, document.createTextNode(` ${count} editorial objects`));
}

function visualLabel(value) {
  return String(value ?? "EDITORIAL_INTERPRETATION")
    .replaceAll("_", " ")
    .toLocaleUpperCase();
}

function installFallback(figure, image) {
  if (image.dataset.fallbackInstalled === "true") return;
  image.dataset.fallbackInstalled = "true";

  image.addEventListener("error", () => {
    image.hidden = true;
    figure.dataset.assetState = "withheld";
    const previous = figure.querySelector(".k100-visual-withheld");
    if (previous) return;

    const fallback = document.createElement("div");
    fallback.className = "k100-visual-withheld";
    fallback.innerHTML = "<strong>VISUAL WITHHELD</strong><span>Pending evidence and rights verification</span>";
    figure.append(fallback);
  });
}

export function startK100IntegrityReset({ data } = {}) {
  const items = data?.k100?.items;
  if (!Array.isArray(items)) throw new Error("K100 Integrity Reset requires Kidult 100 data.");

  ensureStylesheet();
  document.documentElement.dataset.k100Integrity = "v1";
  updateSliceStatus(items.length);

  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item) return;

    const figure = card.querySelector(".k100-figure");
    const image = figure?.querySelector("img");
    const role = visualLabel(item.visual_role);

    card.dataset.k100Id = item.id;
    card.dataset.visualRole = item.visual_role ?? "EDITORIAL_INTERPRETATION";
    card.style.setProperty("--k100-object-scale", "1");

    if (figure) {
      figure.dataset.visualRole = role;
      figure.dataset.assetState = item.asset ? "registered" : "withheld";
    }
    if (figure && image) installFallback(figure, image);
  });

  window.KIDULTS_K100_INTEGRITY = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    selectionCount: items.length,
    itemIds: items.map(item => item.id),
    unverifiedVisualPolicy: data.k100?.asset_standard?.unverified_visual_policy ?? "WITHHOLD",
    assetStandard: data.k100?.asset_standard?.id ?? "NOT REGISTERED"
  });

  return window.KIDULTS_K100_INTEGRITY;
}
