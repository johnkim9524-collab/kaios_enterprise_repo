const STYLE_ID = "kidults-mobile-hero-visibility-style";
const VERSION = "1.2.0";
const ASSET_VERSION = "657";
const RETRY_ASSET = null;

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

function stripQuery(value) {
  const source = String(value ?? "");
  if (source.startsWith("data:")) return source;
  return source.split("?")[0].split("#")[0];
}

function fallbackSvgDataUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="KIDULTS mobility visual unavailable"><rect width="1200" height="900" fill="#e7dfd3"/><text x="600" y="455" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" letter-spacing="4" fill="#073d2d">VISUAL TEMPORARILY UNAVAILABLE</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function cacheBusted(source, attempt) {
  if (source.startsWith("data:")) return source;
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}v=${ASSET_VERSION}&hero_attempt=${attempt}`;
}

function preferredSource(image, manifest) {
  const current = image.getAttribute("src") ?? "";
  if (image.dataset.heroAsset === "racing-roadster-v657" || current.startsWith("data:image/webp")) return current;
  return manifest?.hero?.asset || current;
}

export function startMobileHeroVisibility({ manifest } = {}) {
  ensureStylesheet();

  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return null;

  const primary = stripQuery(preferredSource(image, manifest));
  const sources = [...new Set([primary, RETRY_ASSET].filter(Boolean))];
  let sourceIndex = 0;
  let resolved = false;
  let retryTimer = 0;

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
    card.dataset.assetState = "loading";
    card.dataset.mobileHeroState = "loading";
    image.src = cacheBusted(source, sourceIndex);
  };

  image.addEventListener("load", () => {
    if (image.naturalWidth && image.naturalHeight) {
      markVisible(image.src.startsWith("data:image/svg+xml") ? "fallback" : "ready");
    }
  });
  image.addEventListener("error", () => {
    resolved = false;
    loadNext();
  });

  if (image.complete && image.naturalWidth > 0) markVisible("ready");
  else loadNext();

  retryTimer = window.setTimeout(() => {
    if (!resolved && (!image.complete || image.naturalWidth === 0)) loadNext();
  }, 4500);

  window.KIDULTS_MOBILE_HERO = Object.freeze({
    version: VERSION,
    assetVersion: ASSET_VERSION,
    retrySources: sources.slice(),
    state() {
      return card.dataset.mobileHeroState ?? "NOT AVAILABLE";
    },
    retry() {
      resolved = false;
      sourceIndex = 0;
      loadNext();
    }
  });

  return window.KIDULTS_MOBILE_HERO;
}
