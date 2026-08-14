const VERSION = "2.1.0";
const ASSET_VERSION = "660";
const ROADSTER_KEY = "racing-roadster-v660";
const ROADSTER_SOURCE = `assets/hero/racing-roadster-v660-master.webp?v=${ASSET_VERSION}`;
const WATCH_SOURCE = `assets/kidult100/watch-v655.webp?v=${ASSET_VERSION}`;

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;

  card.dataset.heroAsset = ROADSTER_KEY;
  card.dataset.assetState = "loading";
  image.dataset.heroAsset = ROADSTER_KEY;
  image.hidden = false;
  image.removeAttribute("hidden");
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.alt = "KIDULTS original deep green racing roadster in one warm editorial studio";

  if (image.getAttribute("src") !== ROADSTER_SOURCE) image.setAttribute("src", ROADSTER_SOURCE);
  if (image.complete && image.naturalWidth > 0) card.dataset.assetState = "ready";
  return true;
}

function bindWatch() {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  const card = cards.find(node =>
    node.dataset.k100Id === "time-01" ||
    node.querySelector("h3")?.textContent?.trim() === "Mechanical Time 01"
  );
  const image = card?.querySelector(".k100-figure img");
  if (!card || !image) return false;

  card.dataset.k100Id = "time-01";
  image.dataset.assetVersion = ASSET_VERSION;
  if (!image.getAttribute("src")?.includes("watch-v655.webp")) image.setAttribute("src", WATCH_SOURCE);
  image.hidden = false;
  image.removeAttribute("hidden");
  return true;
}

function markK100Format() {
  document.querySelectorAll("[data-k100-gallery] .k100-card").forEach(card => {
    card.dataset.imageFormat = "museum-editorial-v660";
  });
}

export function startAssetBindingHotfix() {
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

  const image = document.querySelector("[data-hero-image]");
  const card = document.querySelector("[data-hero-card]");
  image?.addEventListener("load", () => {
    if (image.naturalWidth > 0) card.dataset.assetState = "ready";
  });

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
    assetVersion: ASSET_VERSION,
    roadsterKey: ROADSTER_KEY,
    roadsterSource: ROADSTER_SOURCE,
    watchSource: WATCH_SOURCE,
    imageFormat: "MUSEUM_EDITORIAL_V660",
    rebind: apply
  });
  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
