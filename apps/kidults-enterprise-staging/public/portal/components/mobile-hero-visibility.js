const STYLE_ID = "kidults-mobile-hero-visibility-style";
const VERSION = "2.1.0";
const ASSET_VERSION = "658";

function ensureStylesheet() {
  const href = `components/mobile-hero-visibility.css?v=${ASSET_VERSION}`;
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

export function startMobileHeroVisibility() {
  ensureStylesheet();

  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return null;

  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.hidden = false;
  image.removeAttribute("hidden");

  const markReady = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    image.hidden = false;
    image.removeAttribute("hidden");
    image.dataset.heroVisible = "true";
    card.dataset.assetState = "ready";
    card.dataset.mobileHeroState = "ready";
  };

  image.addEventListener("load", markReady);
  image.addEventListener("error", () => {
    image.hidden = false;
    image.removeAttribute("hidden");
    card.dataset.assetState = "missing";
    card.dataset.mobileHeroState = "missing";
  });

  if (image.complete && image.naturalWidth > 0) markReady();

  window.KIDULTS_MOBILE_HERO = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    state() {
      return card.dataset.mobileHeroState ?? "NOT AVAILABLE";
    },
    retry() {
      image.hidden = false;
      image.removeAttribute("hidden");
      if (image.src.startsWith("data:image/webp")) image.src = image.src;
    }
  });

  return window.KIDULTS_MOBILE_HERO;
}
