import roadsterBase64 from "./assets/racing-roadster-v657.js";

const VERSION = "2.0.0";
const ROADSTER_KEY = "racing-roadster-v657";
const ROADSTER_SOURCE = `data:image/webp;base64,${roadsterBase64}`;
const WATCH_SOURCE = "assets/kidult100/watch-v655.webp?v=657";
const STYLE_ID = "kidults-v657-visual-freeze-style";

function ensureVisualStyles() {
  const href = "components/v657-visual-freeze.css?v=657";
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

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;

  card.dataset.heroAsset = ROADSTER_KEY;
  card.dataset.assetState = "ready";
  card.dataset.mobileHeroState = "ready";
  image.dataset.heroAsset = ROADSTER_KEY;
  image.dataset.heroVisible = "true";
  image.hidden = false;
  image.removeAttribute("hidden");
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.alt = "KIDULTS original deep green racing roadster in a warm limestone studio";

  if (image.getAttribute("src") !== ROADSTER_SOURCE) image.setAttribute("src", ROADSTER_SOURCE);
  return true;
}

function bindWatch() {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  const card = cards.find(node => node.dataset.k100Id === "time-01" || node.querySelector("h3")?.textContent?.trim() === "Mechanical Time 01");
  const image = card?.querySelector(".k100-figure img");
  if (!card || !image) return false;

  card.dataset.k100Id = "time-01";
  image.dataset.assetVersion = "657";
  if (!image.getAttribute("src")?.includes("watch-v655.webp")) image.setAttribute("src", WATCH_SOURCE);
  image.hidden = false;
  image.removeAttribute("hidden");
  return true;
}

function markK100Format() {
  document.querySelectorAll("[data-k100-gallery] .k100-card").forEach(card => {
    card.dataset.imageFormat = "museum-editorial-v657";
    const image = card.querySelector(".k100-figure img");
    if (image) image.dataset.assetVersion = "657";
  });
}

export function startAssetBindingHotfix() {
  ensureVisualStyles();
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      bindRoadster();
      bindWatch();
      markK100Format();
    } finally {
      applying = false;
    }
  };

  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 180);
  window.setTimeout(apply, 900);

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "hidden"]
  });

  window.KIDULTS_ASSET_BINDING_HOTFIX = Object.freeze({
    version: VERSION,
    roadsterKey: ROADSTER_KEY,
    watchSource: WATCH_SOURCE,
    imageFormat: "MUSEUM_EDITORIAL_V657",
    rebind: apply
  });
  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
