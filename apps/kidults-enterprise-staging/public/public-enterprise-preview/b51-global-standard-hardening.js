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

  function loadFinalPolish() {
    if (!document.querySelector('link[data-b52-global-polish]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'b52-global-polish.css?v=1';
      stylesheet.dataset.b52GlobalPolish = 'true';
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('script[data-b52-global-polish]')) {
      const script = document.createElement('script');
      script.src = 'b52-global-polish.js?v=1';
      script.defer = true;
      script.dataset.b52GlobalPolish = 'true';
      document.head.appendChild(script);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFinalPolish, { once: true });
  } else {
    loadFinalPolish();
  }
})();
