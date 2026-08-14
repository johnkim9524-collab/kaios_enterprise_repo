const STYLE_ID = "kidults-k100-integrity-style";

function ensureStylesheet() {
  const href = "components/k100-integrity-reset.css?v=658";
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
  image.addEventListener("error", () => {
    image.hidden = true;
    figure.dataset.assetState = "withheld";
    const fallback = document.createElement("div");
    fallback.className = "k100-visual-withheld";
    fallback.innerHTML = "<strong>VISUAL WITHHELD</strong><span>Pending evidence and rights verification</span>";
    figure.append(fallback);
  }, { once: true });
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
    card.dataset.imageFormat = "museum-editorial-v658";
    card.style.setProperty("--k100-object-scale", String(Number(item.display_scale) || 1));

    if (figure) {
      figure.dataset.visualRole = role;
      figure.dataset.assetState = item.asset ? "registered" : "withheld";
    }
    if (figure && image) {
      image.dataset.assetVersion = "658";
      installFallback(figure, image);
    }
  });

  window.KIDULTS_K100_INTEGRITY = Object.freeze({
    version: "1.2.0",
    selectionCount: items.length,
    itemIds: items.map(item => item.id),
    imageFormat: "MUSEUM_EDITORIAL_V658",
    unverifiedVisualPolicy: data.k100?.asset_standard?.unverified_visual_policy ?? "WITHHOLD",
    assetStandard: data.k100?.asset_standard?.id ?? "NOT REGISTERED"
  });
}
