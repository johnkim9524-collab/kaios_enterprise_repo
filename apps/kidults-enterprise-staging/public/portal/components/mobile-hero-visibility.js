const STYLE_ID = "kidults-mobile-hero-visibility-style";
const VERSION = "2.2.0";
const ASSET_VERSION = "666";
const CACHE_REVISION = "experience-closure";
const FINAL_TUNE_REVISION = "single-surface";
const ASSET_QUERY = `${ASSET_VERSION}-${CACHE_REVISION}-${FINAL_TUNE_REVISION}`;
const HERO_KEY = "racing-roadster-v666";
const RETRY_ASSET = "assets/hero/racing-roadster-v662.webp";

function ensureStylesheet() {
  const href = `components/mobile-hero-visibility.css?v=${ASSET_QUERY}`;
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

function stripQuery(value) {
  return String(value ?? "").split("?")[0].split("#")[0];
}

function fallbackSvgDataUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="KIDULTS mobility visual unavailable"><rect width="1200" height="900" fill="#f4f2ee"/><text x="600" y="455" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" letter-spacing="4" fill="#073d2d">VISUAL TEMPORARILY UNAVAILABLE</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function cacheBusted(source, attempt) {
  if (source.startsWith("data:")) return source;
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}v=${ASSET_QUERY}&hero_attempt=${attempt}`;
}

export function startMobileHeroVisibility({ manifest } = {}) {
  ensureStylesheet();

  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return null;

  card.dataset.heroAsset = HERO_KEY;
  image.dataset.heroAsset = HERO_KEY;

  const primary = stripQuery(manifest?.hero?.asset || image.getAttribute("src"));
  const sources = [...new Set([primary, RETRY_ASSET].filter(Boolean))];
  let sourceIndex = 0;
  let fallbackActive = false;
  let resolved = false;
  let retryTimer = 0;
  let pendingState = "loading";

  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.hidden = false;
  image.removeAttribute("hidden");

  const markVisible = state => {
    resolved = true;
    window.clearTimeout(retryTimer);
    image.hidden = false;
    image.removeAttribute("hidden");
    image.dataset.heroVisible = "true";
    card.dataset.assetState = state;
    card.dataset.mobileHeroState = state;
  };

  const activateFallback = () => {
    if (fallbackActive) {
      card.dataset.assetState = "missing";
      card.dataset.mobileHeroState = "missing";
      return;
    }
    fallbackActive = true;
    pendingState = "fallback";
    card.dataset.assetState = "fallback-loading";
    card.dataset.mobileHeroState = "fallback-loading";
    image.src = fallbackSvgDataUri();
  };

  const loadNext = () => {
    if (sourceIndex >= sources.length) {
      activateFallback();
      return;
    }
    const source = sources[sourceIndex++];
    pendingState = "ready";
    card.dataset.assetState = "loading";
    card.dataset.mobileHeroState = "loading";
    image.hidden = false;
    image.removeAttribute("hidden");
    image.src = cacheBusted(source, sourceIndex);
  };

  image.addEventListener("load", () => {
    if (image.naturalWidth && image.naturalHeight) markVisible(fallbackActive ? "fallback" : pendingState);
  });
  image.addEventListener("error", () => {
    resolved = false;
    image.hidden = false;
    image.removeAttribute("hidden");
    loadNext();
  });

  loadNext();
  retryTimer = window.setTimeout(() => {
    if (!resolved && (!image.complete || image.naturalWidth === 0)) loadNext();
  }, 4500);

  window.KIDULTS_MOBILE_HERO = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    cacheRevision: CACHE_REVISION,
    heroKey: HERO_KEY,
    canonicalSource: primary,
    retrySources: sources.slice(),
    state() { return card.dataset.mobileHeroState ?? "NOT AVAILABLE"; },
    retry() {
      resolved = false;
      fallbackActive = false;
      sourceIndex = 0;
      loadNext();
    }
  });
  return window.KIDULTS_MOBILE_HERO;
}
