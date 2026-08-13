const STYLE_ID = "kidults-mobile-hero-visibility-style";
const VERSION = "1.1.0";
const ASSET_VERSION = "654";
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
  return String(value ?? "").split("?")[0].split("#")[0];
}

function fallbackSvgDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="KIDULTS mobility fallback visual">
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fffefa"/>
          <stop offset="1" stop-color="#f1eee6"/>
        </linearGradient>
        <linearGradient id="body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.55" stop-color="#f4f3ef"/>
          <stop offset="1" stop-color="#d9ddd8"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="22"/>
        </filter>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)"/>
      <g opacity="0.22" stroke="#d9d5cb" stroke-width="24">
        <path d="M840 60 610 420"/>
        <path d="M950 60 720 420"/>
        <path d="M1060 60 830 420"/>
      </g>
      <ellipse cx="650" cy="720" rx="350" ry="46" fill="#7f887f" opacity="0.22" filter="url(#shadow)"/>
      <g transform="translate(210 250)">
        <path d="M110 350C145 237 255 173 405 164l183-10c90-5 168 29 217 92l68 88c22 29 31 67 23 103l-13 59H84l7-74c2-25 8-49 19-72Z" fill="url(#body)" stroke="#cfd3ce" stroke-width="6"/>
        <path d="M355 183c36-68 112-113 207-117l107-4c49-2 94 16 128 51l55 57-497 13Z" fill="#0d1110"/>
        <path d="M96 447c57 5 112 5 163 0 25-68 81-111 147-111 69 0 126 44 151 113h127c24-69 81-113 150-113 68 0 125 44 149 113l34-2-13 49H84l12-49Z" fill="#111715"/>
        <circle cx="407" cy="455" r="104" fill="#f7f7f4" stroke="#121816" stroke-width="18"/>
        <circle cx="407" cy="455" r="20" fill="#121816"/>
        <circle cx="834" cy="455" r="104" fill="#f7f7f4" stroke="#121816" stroke-width="18"/>
        <circle cx="834" cy="455" r="20" fill="#121816"/>
        <path d="M118 362c127 26 267 25 420-4 105-20 215-50 330-92" fill="none" stroke="#ffffff" stroke-width="11" opacity="0.75"/>
      </g>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function cacheBusted(source, attempt) {
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}v=${ASSET_VERSION}&hero_attempt=${attempt}`;
}

export function startMobileHeroVisibility({ manifest } = {}) {
  ensureStylesheet();

  const card = document.querySelector("[data-hero-card]");
  const image = document.querySelector("[data-hero-image]");
  if (!card || !image) return null;

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
    image.hidden = false;
    image.removeAttribute("hidden");
    image.src = fallbackSvgDataUri();
  };

  const loadNext = () => {
    if (sourceIndex >= sources.length) {
      activateFallback();
      return;
    }

    const source = sources[sourceIndex];
    sourceIndex += 1;
    pendingState = "ready";
    card.dataset.assetState = "loading";
    card.dataset.mobileHeroState = "loading";
    image.hidden = false;
    image.removeAttribute("hidden");
    image.src = cacheBusted(source, sourceIndex);
  };

  const handleLoad = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    markVisible(fallbackActive ? "fallback" : pendingState);
  };

  const handleError = () => {
    resolved = false;
    image.hidden = false;
    image.removeAttribute("hidden");
    loadNext();
  };

  image.addEventListener("load", handleLoad);
  image.addEventListener("error", handleError);

  loadNext();

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
      fallbackActive = false;
      sourceIndex = 0;
      loadNext();
    }
  });

  return window.KIDULTS_MOBILE_HERO;
}
