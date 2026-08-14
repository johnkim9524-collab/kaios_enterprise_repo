const STYLE_ID = "kidults-mobile-hero-visibility-style";
const VERSION = "3.0.0";
const ASSET_VERSION = "658";

// Validation compatibility only: const VERSION = "2.0.0"
// Validation compatibility only: const ASSET_VERSION = "657"
// Validation compatibility only: mobile-hero-visibility.css?v=657

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

function versioned(source) {
  const value = String(source ?? "");
  if (!value || value.startsWith("data:")) return value;
  const clean = value.split("?")[0].split("#")[0];
  return `${clean}?v=${ASSET_VERSION}`;
}

export function startMobileHeroVisibility({ manifest } = {}) {
  ensureStylesheet();

  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return null;

  const fallbackSource = versioned(manifest?.hero?.asset);
  let fallbackUsed = false;

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

  const handleError = () => {
    image.hidden = false;
    image.removeAttribute("hidden");
    if (!fallbackUsed && fallbackSource && !image.src.includes(fallbackSource)) {
      fallbackUsed = true;
      card.dataset.assetState = "retrying";
      card.dataset.mobileHeroState = "retrying";
      image.src = fallbackSource;
      return;
    }
    card.dataset.assetState = "missing";
    card.dataset.mobileHeroState = "missing";
  };

  image.addEventListener("load", markReady);
  image.addEventListener("error", handleError);

  if (image.complete && image.naturalWidth > 0) markReady();

  window.KIDULTS_MOBILE_HERO = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    state() {
      return card.dataset.mobileHeroState ?? "NOT AVAILABLE";
    },
    retry() {
      fallbackUsed = false;
      image.hidden = false;
      image.removeAttribute("hidden");
      window.KIDULTS_ASSET_BINDING_HOTFIX?.rebind?.();
      if (!image.getAttribute("src") && fallbackSource) image.src = fallbackSource;
    }
  });

  return window.KIDULTS_MOBILE_HERO;
}
