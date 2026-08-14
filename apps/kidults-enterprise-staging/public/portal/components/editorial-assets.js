import roadsterBase64 from "./assets/racing-roadster-v655.js?v=658";

const VERSION = "2.1.0";
const ROADSTER_KEY = "racing-roadster-v658";
const ROADSTER_SOURCE = `data:image/webp;base64,${roadsterBase64}`;
const WATCH_SOURCE = "assets/kidult100/watch-v655.webp?v=658";

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
  image.alt = "KIDULTS original deep green Racing Roadster in a warm limestone studio";
  image.style.objectFit = "cover";
  image.style.objectPosition = "right center";
  image.style.transform = "none";
  image.style.transformOrigin = "center";
  image.style.filter = "saturate(1.01) contrast(1.012)";
  image.style.background = "#e7dfd3";
  card.style.background = "#e7dfd3";

  image.addEventListener("load", () => {
    card.dataset.assetState = "ready";
    card.dataset.mobileHeroState = "ready";
    image.dataset.heroVisible = "true";
  }, { once: true });

  if (image.getAttribute("src") !== ROADSTER_SOURCE) {
    image.setAttribute("src", ROADSTER_SOURCE);
  } else if (image.complete && image.naturalWidth > 0) {
    card.dataset.assetState = "ready";
    card.dataset.mobileHeroState = "ready";
  }
  return true;
}

function bindK100() {
  const cards = [...document.querySelectorAll("[data-k100-gallery] .k100-card")];
  cards.forEach(card => {
    card.dataset.imageFormat = "museum-editorial-v658";
    const image = card.querySelector(".k100-figure img");
    if (image) image.dataset.assetVersion = "658";
  });

  const watchCard = cards.find(card =>
    card.dataset.k100Id === "time-01" ||
    card.querySelector("h3")?.textContent?.trim() === "Mechanical Time 01"
  );
  const watchImage = watchCard?.querySelector(".k100-figure img");
  if (watchCard && watchImage) {
    watchCard.dataset.k100Id = "time-01";
    if (!watchImage.getAttribute("src")?.includes("watch-v655.webp")) {
      watchImage.setAttribute("src", WATCH_SOURCE);
    }
    watchImage.hidden = false;
    watchImage.removeAttribute("hidden");
  }
  return cards.length > 0;
}

export function startAssetBindingHotfix() {
  const apply = () => {
    bindRoadster();
    bindK100();
  };

  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 120);
  window.setTimeout(apply, 600);

  const gallery = document.querySelector("[data-k100-gallery]");
  if (gallery) {
    const observer = new MutationObserver(bindK100);
    observer.observe(gallery, { subtree: true, childList: true });
  }

  window.KIDULTS_ASSET_BINDING_HOTFIX = Object.freeze({
    version: VERSION,
    roadsterKey: ROADSTER_KEY,
    watchSource: WATCH_SOURCE,
    imageFormat: "MUSEUM_EDITORIAL_V658",
    rebind: apply
  });

  return window.KIDULTS_ASSET_BINDING_HOTFIX;
}
