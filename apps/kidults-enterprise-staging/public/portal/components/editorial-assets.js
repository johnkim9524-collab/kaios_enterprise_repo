const VERSION = "4.1.0";
const ASSET_VERSION = "662";
const CACHE_REVISION = "visual95";
const FINAL_TUNE_REVISION = "final";
const ASSET_QUERY = `${ASSET_VERSION}-${CACHE_REVISION}-${FINAL_TUNE_REVISION}`;
const ROADSTER_KEY = "racing-roadster-v662";
const ROADSTER_SOURCE = `assets/hero/racing-roadster-v662.webp?v=${ASSET_QUERY}`;
const IMAGE_FORMAT = "museum-editorial-v662";
const VISUAL_SYSTEM = "single-studio-v662-visual95";

const K100_ASSETS = Object.freeze({
  "footwear-01": {
    title: "Archive Sneaker 01",
    source: `assets/kidult100/footwear-v654.webp?v=${ASSET_QUERY}`,
    alt: "KIDULTS original dark green editorial sneaker in a neutral warm limestone studio"
  },
  "camera-editorial-01": {
    title: "Precision Camera 01",
    source: `assets/kidult100/camera-v654.webp?v=${ASSET_QUERY}`,
    alt: "KIDULTS original rangefinder camera editorial visual in a neutral warm limestone studio"
  },
  "toys-editorial-01": {
    title: "Cobalt Robot 01",
    source: `assets/kidult100/toys-v654.webp?v=${ASSET_QUERY}`,
    alt: "KIDULTS original cobalt robot editorial visual in a neutral warm limestone studio"
  },
  "time-01": {
    title: "Mechanical Time 01",
    source: `assets/kidult100/watch-v655.webp?v=${ASSET_QUERY}`,
    alt: "KIDULTS original mechanical watch editorial visual in a neutral warm limestone studio"
  }
});

function prepareImage(image, source, alt) {
  image.hidden = false;
  image.removeAttribute("hidden");
  image.decoding = "async";
  image.loading = "eager";
  image.dataset.assetVersion = ASSET_QUERY;
  image.dataset.visualSystem = VISUAL_SYSTEM;
  image.alt = alt;
  if (image.getAttribute("src") !== source) image.setAttribute("src", source);
}

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;

  card.dataset.heroAsset = ROADSTER_KEY;
  card.dataset.visualSystem = VISUAL_SYSTEM;
  card.dataset.assetState = "loading";
  image.dataset.heroAsset = ROADSTER_KEY;
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  prepareImage(
    image,
    ROADSTER_SOURCE,
    "KIDULTS original deep green racing roadster in a neutral warm limestone editorial studio"
  );
  if (image.complete && image.naturalWidth > 0) card.dataset.assetState = "ready";
  return true;
}

function findK100Card(id, title) {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  return cards.find(card =>
    card.dataset.k100Id === id ||
    card.querySelector("h3")?.textContent?.trim() === title
  );
}

function bindK100() {
  let count = 0;
  for (const [id, asset] of Object.entries(K100_ASSETS)) {
    const card = findK100Card(id, asset.title);
    const image = card?.querySelector(".k100-figure img");
    if (!card || !image) continue;
    card.dataset.k100Id = id;
    card.dataset.imageFormat = IMAGE_FORMAT;
    card.dataset.visualSystem = VISUAL_SYSTEM;
    prepareImage(image, asset.source, asset.alt);
    count += 1;
  }
  return count;
}

export function startAssetBindingHotfix() {
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      bindRoadster();
      bindK100();
    } finally {
      applying = false;
    }
  };

  const image = document.querySelector("[data-hero-image]");
  const card = document.querySelector("[data-hero-card]");
  image?.addEventListener("load", () => {
    if (image.naturalWidth > 0) card.dataset.assetState = "ready";
  });
  image?.addEventListener("error", () => {
    card.dataset.assetState = "error";
    image.hidden = false;
    image.removeAttribute("hidden");
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
    cacheRevision: CACHE_REVISION,
    roadsterKey: ROADSTER_KEY,
    roadsterSource: ROADSTER_SOURCE,
    k100Sources: K100_ASSETS,
    imageFormat: IMAGE_FORMAT,
    visualSystem: VISUAL_SYSTEM,
    rebind: apply
  });
  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
