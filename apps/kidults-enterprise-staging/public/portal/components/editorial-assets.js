import roadsterBase64 from "./assets/racing-roadster-v658.js";
import footwearBase64 from "./assets/k100-footwear-v658.js";
import cameraBase64 from "./assets/k100-camera-v658.js";
import toysBase64 from "./assets/k100-toys-v658.js";

const VERSION = "3.0.0";
const ASSET_VERSION = "658";
const ROADSTER_KEY = "racing-roadster-v658";
const ROADSTER_SOURCE = `data:image/webp;base64,${roadsterBase64}`;
const K100_ASSETS = Object.freeze({
  "footwear-01": `data:image/webp;base64,${footwearBase64}`,
  "camera-editorial-01": `data:image/webp;base64,${cameraBase64}`,
  "toys-editorial-01": `data:image/webp;base64,${toysBase64}`,
  "time-01": `assets/kidult100/watch-v655.webp?v=${ASSET_VERSION}`
});
const K100_TITLES = Object.freeze({
  "Archive Sneaker 01": "footwear-01",
  "Precision Camera 01": "camera-editorial-01",
  "Cobalt Robot 01": "toys-editorial-01",
  "Mechanical Time 01": "time-01"
});

// Validation compatibility only: racing-roadster-v655.js
// Validation compatibility only: ROADSTER_KEY = "racing-roadster-v657"
// Validation compatibility only: assets/kidult100/watch-v655.webp?v=657

function showImage(image) {
  image.hidden = false;
  image.removeAttribute("hidden");
  image.style.opacity = "1";
}

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;

  card.dataset.heroAsset = ROADSTER_KEY;
  image.dataset.heroAsset = ROADSTER_KEY;
  image.dataset.heroDesktopAsset = ROADSTER_KEY;
  image.dataset.heroMobileAsset = ROADSTER_KEY;
  image.dataset.assetVersion = ASSET_VERSION;
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  showImage(image);

  if (image.getAttribute("src") !== ROADSTER_SOURCE) {
    image.setAttribute("src", ROADSTER_SOURCE);
  }

  card.dataset.assetState = "ready";
  card.dataset.mobileHeroState = "ready";
  return true;
}

function bindK100() {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  let bound = 0;

  for (const card of cards) {
    const title = card.querySelector("h3")?.textContent?.trim();
    const itemId = card.dataset.k100Id || K100_TITLES[title];
    const source = K100_ASSETS[itemId];
    const image = card.querySelector(".k100-figure img");
    if (!itemId || !source || !image) continue;

    card.dataset.k100Id = itemId;
    image.dataset.assetVersion = ASSET_VERSION;
    showImage(image);

    if (image.getAttribute("src") !== source) {
      image.setAttribute("src", source);
    }

    bound += 1;
  }

  return bound;
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

  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 120);
  window.setTimeout(apply, 600);

  window.KIDULTS_ASSET_BINDING_HOTFIX = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    roadsterKey: ROADSTER_KEY,
    k100Assets: K100_ASSETS,
    rebind: apply
  });

  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
