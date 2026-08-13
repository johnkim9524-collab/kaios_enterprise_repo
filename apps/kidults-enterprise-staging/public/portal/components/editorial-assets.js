import roadsterBase64 from "./assets/racing-roadster-v655.js?v=657";

const VERSION = "1.2.0";
const ROADSTER_KEY = "racing-roadster-v657";
const ROADSTER_SOURCE = `${["data", "image/webp;base64"].join(":")},${roadsterBase64}`;
const WATCH_SOURCE = "assets/kidult100/watch-v655.webp?v=655";

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;
  card.dataset.heroAsset = ROADSTER_KEY;
  image.dataset.heroAsset = ROADSTER_KEY;
  image.hidden = false;
  image.removeAttribute("hidden");
  image.loading = "eager";
  image.fetchPriority = "high";
  image.style.objectFit = "contain";
  image.style.objectPosition = "center bottom";
  image.style.transform = "none";
  image.style.transformOrigin = "center bottom";
  image.style.filter = "saturate(1.01) contrast(1.012)";
  image.style.background = "#fffefa";
  if (image.src !== ROADSTER_SOURCE) image.src = ROADSTER_SOURCE;
  card.dataset.assetState = "ready";
  card.dataset.mobileHeroState = "ready";
  return true;
}

function bindWatch() {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  const card = cards.find(node => node.dataset.k100Id === "time-01" || node.querySelector("h3")?.textContent?.trim() === "Mechanical Time 01");
  const image = card?.querySelector(".k100-figure img");
  if (!card || !image) return false;
  card.dataset.k100Id = "time-01";
  image.dataset.assetVersion = "655";
  if (!image.src.includes("watch-v655.webp")) image.src = WATCH_SOURCE;
  image.hidden = false;
  image.removeAttribute("hidden");
  return true;
}

export function startAssetBindingHotfix() {
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      bindRoadster();
      bindWatch();
    } finally {
      applying = false;
    }
  };
  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 250);
  window.setTimeout(apply, 1200);
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "hidden"] });
  window.KIDULTS_ASSET_BINDING_HOTFIX = Object.freeze({ version: VERSION, roadsterKey: ROADSTER_KEY, watchSource: WATCH_SOURCE, rebind: apply });
  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
