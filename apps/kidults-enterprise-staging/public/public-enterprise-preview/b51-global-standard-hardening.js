(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const isIntelligenceAsset = (url) => /intelligence-data(?:\.preview)?\.json(?:$|\?)/.test(String(url));

  function normalizeDataset(data) {
    if (!data || typeof data !== 'object') return data;

    const current = Number(data.headline?.kidult100);
    const trend = Array.isArray(data.trend) ? data.trend : [];
    const last = Number(trend.at(-1)?.value);

    if (Number.isFinite(current) && Number.isFinite(last) && trend.length) {
      const offset = current - last;
      data.trend = trend.map((point) => ({
        ...point,
        value: Number((Number(point.value) + offset).toFixed(1))
      }));
    }

    return data;
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    if (!response.ok || !isIntelligenceAsset(url)) return response;

    try {
      const data = normalizeDataset(await response.clone().json());
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };

  function appendStylesheet(href, dataAttribute) {
    if (document.querySelector(`link[${dataAttribute}]`)) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.setAttribute(dataAttribute, 'true');
    document.head.appendChild(stylesheet);
  }

  function loadFinalPolish() {
    appendStylesheet('b52-global-polish.css?v=2', 'data-b52-global-polish');

    if (!document.querySelector('script[data-b52-global-polish]')) {
      const script = document.createElement('script');
      script.src = 'b52-global-polish.js?v=2';
      script.defer = true;
      script.dataset.b52GlobalPolish = 'true';
      document.head.appendChild(script);
    }

    /* Final homepage-only editorial unification. High-specificity selectors in this
       stylesheet intentionally override earlier frozen layers without touching the
       rest of the portal. */
    appendStylesheet('b54-editorial-intelligence-system.css?v=1', 'data-b54-editorial-intelligence-system');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFinalPolish, { once: true });
  } else {
    loadFinalPolish();
  }
})();
