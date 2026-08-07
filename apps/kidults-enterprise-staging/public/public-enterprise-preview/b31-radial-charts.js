(() => {
  'use strict';

  const COLORS = ['#123F35', '#356456', '#5F8174', '#8FA69D', '#C6C7B8'];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

  function normalize(items, key = 'value') {
    const clean = (Array.isArray(items) ? items : []).map((item) => ({ ...item, value: Math.max(0, Number(item[key]) || 0) }));
    const total = clean.reduce((sum, item) => sum + item.value, 0);
    return { items: clean, total };
  }

  function requireHundred(items, label) {
    const { total } = normalize(items);
    if (Math.abs(total - 100) > 0.01) throw new Error(`${label} must total 100`);
  }

  function conicStops(items, total) {
    let offset = 0;
    return items.map((item, index) => {
      const start = offset;
      offset += total > 0 ? (item.value / total) * 100 : 0;
      return `${COLORS[index % COLORS.length]} ${start}% ${offset}%`;
    }).join(',');
  }

  function legend(items, labelKey) {
    return `<div class="radial-legend">${items.map((item, index) => `
      <span>
        <i style="background:${COLORS[index % COLORS.length]}"></i>
        <b>${esc(item[labelKey])}</b>
        <strong>${item.value}%</strong>
      </span>`).join('')}</div>`;
  }

  function confidenceDonut(rawItems) {
    const { items, total } = normalize(rawItems);
    const upper = items.filter((item) => item.grade === 'A' || item.grade === 'B').reduce((sum, item) => sum + item.value, 0);
    const stops = conicStops(items, total);
    return `<div class="radial-layout confidence-radial">
      <div class="radial-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Confidence distribution: ${items.map((item) => `${item.grade} ${item.value}%`).join(', ')}. A plus B equals ${upper}%.">
        <div class="radial-center"><strong>${upper}%</strong><span>A + B</span></div>
      </div>
      ${legend(items, 'grade')}
    </div>`;
  }

  function geographySemiDonut(rawItems) {
    const { items, total } = normalize(rawItems);
    const stops = conicStops(items, total);
    const leading = items[0] || { region: '—', value: 0 };
    return `<div class="radial-layout geography-radial">
      <div class="semi-wrap">
        <div class="semi-donut" style="background:conic-gradient(from 270deg, ${stops}, transparent 100% 100%)" role="img" aria-label="Regional signal share: ${items.map((item) => `${item.region} ${item.value}%`).join(', ')}.">
          <div class="semi-cutout"></div>
        </div>
        <div class="semi-center"><strong>${leading.value}%</strong><span>${esc(leading.region)}</span></div>
      </div>
      ${legend(items, 'region')}
    </div>`;
  }

  function loadStylesheet(href, dataKey) {
    const selector = `link[data-${dataKey}]`;
    if (document.querySelector(selector)) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.setAttribute(`data-${dataKey}`, 'true');
    document.head.appendChild(stylesheet);
  }

  function loadScript(src, dataKey) {
    if (document.querySelector(`script[data-${dataKey}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(`data-${dataKey}`, 'true');
    document.head.appendChild(script);
  }

  function loadEnhancements() {
    loadStylesheet('b32-visualization-integrity.css', 'b32-integrity');
    loadStylesheet('b35-premium-intelligence-dial.css?v=6', 'b35-premium-dial');
    loadStylesheet('b36-category-density.css', 'b36-category-density');
    loadStylesheet('b40-mobile-final-tuning.css', 'b40-mobile-final-tuning');
    loadStylesheet('b41-final-type-overflow-tuning.css', 'b41-final-type-overflow-tuning');
    loadStylesheet('b42-governed-system-mobile-overflow.css', 'b42-governed-system-mobile-overflow');
    loadStylesheet('b43-mobile-kpi-strip-containment.css', 'b43-mobile-kpi-strip-containment');
    loadStylesheet('b44-mobile-kpi-root-containment.css', 'b44-mobile-kpi-root-containment');
    loadStylesheet('b45-typography-scale-freeze-v2.css', 'b45-typography-freeze');
    loadStylesheet('b46-instrument-dial-v2.css?v=3', 'b46-instrument-dial');
    loadStylesheet('b48-rc1-layout-balance.css?v=2', 'b48-rc1-layout-balance');

    loadScript('b32-visualization-integrity.js', 'b32-integrity');
    loadScript('b35-premium-intelligence-dial.js?v=6', 'b35-premium-dial');
    loadScript('b59-lead-signal-singleton.js?v=1', 'b59-lead-signal-singleton');
  }

  function renderFromData(data) {
    requireHundred(data.confidenceDistribution, 'confidenceDistribution');
    requireHundred(data.geography, 'geography');
    const confidence = document.querySelector('#confidence-chart');
    const geography = document.querySelector('#geography-chart');
    if (confidence) confidence.innerHTML = confidenceDonut(data.confidenceDistribution);
    if (geography) geography.innerHTML = geographySemiDonut(data.geography);
    document.documentElement.dataset.radialSnapshotAsset = window.KIDULTS_DATA_ASSET || 'intelligence-data.json';
  }

  async function render() {
    loadEnhancements();
    const asset = window.KIDULTS_DATA_ASSET || (new URLSearchParams(window.location.search).get('data') === 'preview'
      ? 'intelligence-data.preview.json'
      : 'intelligence-data.json');
    try {
      const response = await fetch(asset, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderFromData(data);
    } catch (error) {
      console.error('Radial chart enhancement failed closed', error);
      document.documentElement.dataset.radialReady = 'false';
      return;
    }
    document.documentElement.dataset.radialReady = 'true';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();