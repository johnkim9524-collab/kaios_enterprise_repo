(() => {
  'use strict';

  const COLORS = ['#0B4A3B', '#2E6F73', '#4F87A3', '#67AFC2', '#79CDB8'];
  const params = new URLSearchParams(window.location.search);
  const dataAsset = window.KIDULTS_DATA_ASSET || (params.get('data') === 'preview'
    ? 'intelligence-data.preview.json'
    : 'intelligence-data.json');

  function normalizedStops(items) {
    const clean = (Array.isArray(items) ? items : []).map((item, index) => ({
      value: Math.max(0, Number(item.value) || 0),
      color: COLORS[index % COLORS.length]
    }));
    const total = clean.reduce((sum, item) => sum + item.value, 0);
    let offset = 0;
    return {
      total,
      colors: clean,
      stops: clean.map((item) => {
        const start = offset;
        offset += total > 0 ? (item.value / total) * 100 : 0;
        return `${item.color} ${start}% ${offset}%`;
      }).join(',')
    };
  }

  function applyDonut(selector, legendSelector, items) {
    const target = document.querySelector(selector);
    if (!target) return;
    const { stops, colors } = normalizedStops(items);
    if (stops) target.style.background = `conic-gradient(${stops})`;
    document.querySelectorAll(legendSelector).forEach((dot, index) => {
      if (colors[index]) dot.style.background = colors[index].color;
    });
  }

  function apply(data) {
    applyDonut('#source-donut .donut', '#source-donut .legend i', data.sourceComposition || []);
    applyDonut('#signal-mix .signal-donut', '#signal-mix .signal-donut-legend i', data.signalMix || []);
    document.documentElement.dataset.radialSpectrum = 'kidults-intelligence-spectrum-v1';
  }

  fetch(dataAsset, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      requestAnimationFrame(() => apply(data));
      window.setTimeout(() => apply(data), 300);
      window.setTimeout(() => apply(data), 1100);
    })
    .catch((error) => console.error('KIDULTS radial spectrum system failed', error));
})();
