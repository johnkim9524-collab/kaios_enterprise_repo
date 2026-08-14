const VERSION = "2.0.0";
const ROADSTER_KEY = "racing-roadster-v658";
const DESKTOP_SOURCE = "assets/hero/racing-roadster-v658-desktop.webp?v=658";
const MOBILE_SOURCE = "assets/hero/racing-roadster-v658-mobile.webp?v=658";
const WATCH_SOURCE = "assets/kidult100/watch-v655.webp?v=658";
const MOBILE_QUERY = "(max-width: 768px)";

function roadsterSource() {
  return window.matchMedia(MOBILE_QUERY).matches ? MOBILE_SOURCE : DESKTOP_SOURCE;
}

function bindRoadster() {
  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return false;

  const source = roadsterSource();
  card.dataset.heroAsset = ROADSTER_KEY;
  card.dataset.assetState = "loading";
  image.dataset.heroAsset = ROADSTER_KEY;
  image.hidden = false;
  image.removeAttribute("hidden");
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.alt = "KIDULTS original deep green racing roadster in a warm limestone studio";

  if (image.getAttribute("src") !== source) image.setAttribute("src", source);
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
  image.dataset.assetVersion = "658";
  if (!image.getAttribute("src")?.includes("watch-v655.webp")) image.setAttribute("src", WATCH_SOURCE);
  image.hidden = false;
  image.removeAttribute("hidden");
  return true;
}

function markK100Format() {
  document.querySelectorAll("[data-k100-gallery] .k100-card").forEach(card => {
    card.dataset.imageFormat = "museum-editorial-v658";
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
  window.matchMedia(MOBILE_QUERY).addEventListener?.("change", apply);

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
    desktopSource: DESKTOP_SOURCE,
    mobileSource: MOBILE_SOURCE,
    watchSource: WATCH_SOURCE,
    imageFormat: "MUSEUM_EDITORIAL_V658",
    rebind: apply
  });
  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
