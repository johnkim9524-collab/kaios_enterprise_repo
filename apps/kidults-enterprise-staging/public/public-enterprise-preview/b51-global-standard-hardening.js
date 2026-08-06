(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const isIntelligenceAsset = (url) => /intelligence-data(?:\.preview)?\.json(?:$|\?)/.test(String(url));

  function normalizeDataset(data) {
    if (!data || typeof data !== 'object') return data;
    const current = Number(data.headline?.kidult100);
    if (Number.isFinite(current) && Array.isArray(data.trend) && data.trend.length) {
      data.trend = data.trend.map((point, index) => index === data.trend.length - 1
        ? { ...point, value: current }
        : point);
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

  function replaceExactText(root, from, to) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue.trim() === from) node.nodeValue = node.nodeValue.replace(from, to);
      else if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
    });
  }

  function hardenVisualNarrative(data) {
    const current = Number(data.headline?.kidult100);
    const currentText = Number.isFinite(current) ? current.toFixed(1) : '—';
    const method = String(data.methodologyVersion || '—');
    const status = String(data.status || '').toLowerCase();
    const trendSection = document.querySelector('.data-section');

    replaceExactText(trendSection, '94.8', currentText);
    replaceExactText(trendSection, 'Methodology v1.3', `Methodology ${method}`);
    replaceExactText(trendSection, 'Current matches headline 94.8', `Current matches headline ${currentText}`);

    const duplicateComposition = document.querySelector('#signal-mix .composition-detail');
    if (duplicateComposition) duplicateComposition.remove();

    const confidence = document.querySelector('#confidence-chart');
    if (confidence && ['illustrative', 'staging'].includes(status) && !confidence.querySelector('.radial-data-note')) {
      const note = document.createElement('p');
      note.className = 'radial-data-note';
      note.textContent = 'Illustrative staging distribution — not a production confidence claim.';
      confidence.appendChild(note);
    }

    const geography = document.querySelector('#geography-chart');
    if (geography && !geography.querySelector('.geography-interpretation')) {
      const note = document.createElement('p');
      note.className = 'geography-interpretation';
      note.textContent = 'Regional weights reflect observed evidence availability, not total market size.';
      geography.appendChild(note);
    }
  }

  function loadAndApply() {
    const params = new URLSearchParams(window.location.search);
    const asset = params.get('data') === 'preview'
      ? 'intelligence-data.preview.json'
      : 'intelligence-data.json';

    nativeFetch(asset, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const normalized = normalizeDataset(data);
        const apply = () => hardenVisualNarrative(normalized);
        apply();
        window.setTimeout(apply, 300);
        window.setTimeout(apply, 1200);
      })
      .catch((error) => console.error('Global standard hardening failed', error));
  }

  document.addEventListener('kidults:data-loaded', loadAndApply, { once: true });
  window.addEventListener('load', () => window.setTimeout(loadAndApply, 400), { once: true });
})();
