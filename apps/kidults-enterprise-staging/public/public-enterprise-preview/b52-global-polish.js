(() => {
  'use strict';

  const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const params = new URLSearchParams(window.location.search);
  const dataAsset = params.get('data') === 'preview'
    ? 'intelligence-data.preview.json'
    : 'intelligence-data.json';

  function normalizeTrend(data) {
    const current = Number(data?.headline?.kidult100);
    const source = Array.isArray(data?.trend) ? data.trend : [];
    if (!Number.isFinite(current) || source.length === 0) return source;
    const values = source.map((point) => Number(point.value)).filter(Number.isFinite);
    if (values.length !== source.length) return source;
    const offset = current - values.at(-1);
    return source.map((point) => ({ ...point, value: Number((Number(point.value) + offset).toFixed(1)) }));
  }

  function renderTrend(points) {
    if (!Array.isArray(points) || points.length === 0) return '';
    const width = 900, height = 300, left = 54, right = 28, top = 24, bottom = 44;
    const values = points.map((point) => Number(point.value));
    const min = Math.floor(Math.min(...values) - 1);
    const max = Math.ceil(Math.max(...values) + 1);
    const range = Math.max(max - min, 1);
    const x = (index) => left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
    const y = (value) => top + ((max - value) / range) * (height - top - bottom);
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`;
    const grid = [min, (min + max) / 2, max].map((value) => `<g><line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="8" y="${y(value) + 4}">${value.toFixed(1)}</text></g>`).join('');
    const labels = points.map((point, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle">${esc(point.period)}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 staging trend"><defs><linearGradient id="trendFillB52" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".36"/><stop offset="1" stop-color="#0b4a3b" stop-opacity=".02"/></linearGradient></defs><g class="chart-grid">${grid}</g><path d="${area}" fill="url(#trendFillB52)"/><path d="${path}" fill="none" stroke="#0b4a3b" stroke-width="3" vector-effect="non-scaling-stroke"/>${points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="5" fill="#f4efe7" stroke="#0b4a3b" stroke-width="3"><title>${esc(point.period)}: ${point.value}</title></circle>`).join('')}<g class="chart-labels">${labels}</g></svg>`;
  }

  function renderSignalDonut(items) {
    const colors = ['#0b4a3b', '#477a69', '#82a99b', '#c4d6cf'];
    const clean = (Array.isArray(items) ? items : []).map((item, index) => ({ name: item.name, value: Math.max(0, Number(item.value) || 0), color: colors[index % colors.length] }));
    const total = clean.reduce((sum, item) => sum + item.value, 0);
    let offset = 0;
    const stops = clean.map((item) => { const start = offset; offset += total > 0 ? (item.value / total) * 100 : 0; return `${item.color} ${start}% ${offset}%`; }).join(',');
    return `<div class="signal-donut-layout"><div class="signal-donut-wrap"><div class="signal-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Signal composition totals ${total}%"></div><div class="signal-donut-center"><strong>${total}%</strong><span>Total composition</span></div></div><div class="signal-donut-legend">${clean.map((item) => `<span><i style="background:${item.color}"></i><b>${esc(item.name)}</b><strong>${item.value}%</strong></span>`).join('')}</div></div>`;
  }

  function updateTrendSummaries(points, current, methodologyVersion) {
    const values = points.map((point) => Number(point.value));
    const low = Math.min(...values).toFixed(1);
    const high = Math.max(...values).toFixed(1);
    const currentText = Number(current).toFixed(1);
    document.querySelectorAll('[data-k100]').forEach((node) => { node.textContent = currentText; });
    document.querySelectorAll('[data-method]').forEach((node) => { node.textContent = methodologyVersion; });
    document.querySelectorAll('*').forEach((node) => {
      if (node.children.length > 0) return;
      const label = node.textContent.trim().toUpperCase();
      if (label === 'LOW' || label === 'HIGH') {
        const valueNode = node.previousElementSibling || node.parentElement?.querySelector('strong');
        if (valueNode) valueNode.textContent = label === 'LOW' ? low : high;
      }
    });
  }

  function markPendingConfidence(data) {
    const items = Array.isArray(data?.confidenceDistribution) ? data.confidenceDistribution : [];
    const upper = items.filter((item) => item.grade === 'A' || item.grade === 'B').reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    if (upper !== 0) return;
    const center = document.querySelector('#confidence-chart .radial-center');
    if (!center) return;
    center.innerHTML = '<span class="confidence-pending">Pending</span><span>A + B</span>';
    center.closest('[role="img"]')?.setAttribute('aria-label', 'Confidence distribution is illustrative staging data. Production confidence is pending.');
  }

  function applyFinalStructure() {
    const firstCategory = document.querySelector('#category-bars > *:first-child');
    if (firstCategory) {
      firstCategory.classList.add('lead-signal');
      if (!firstCategory.querySelector('.lead-signal-label')) {
        const label = document.createElement('span');
        label.className = 'lead-signal-label';
        label.textContent = 'Lead signal';
        firstCategory.appendChild(label);
      }
    }

    const footer = document.querySelector('footer');
    if (footer && !footer.classList.contains('kidults-final-footer')) {
      footer.className = 'kidults-final-footer';
      footer.innerHTML = `
        <div class="footer-brand"><strong>KIDULTS</strong><span>Global Collectibles Intelligence</span></div>
        <div class="footer-pillar"><strong>Intelligence</strong><a href="intelligence.html">Kidult 100</a><a href="research.html">Research</a><a href="archive.html">Archive</a></div>
        <div class="footer-pillar"><strong>Evidence</strong><a href="methodology.html">Methodology</a><a href="reports.html">Reports</a></div>
        <div class="footer-pillar"><strong>Enterprise</strong><a href="api.html">API</a><a href="../provider/">Providers</a></div>
        <div class="footer-pillar"><strong>Company</strong><a href="company.html">About</a><a href="../provider/partnership.html">Enterprise Access</a></div>
        <div class="footer-meta">© 2026 KIDULTS<br>Research · Evidence · Decision</div>`;
    }
  }

  function apply(data) {
    const points = normalizeTrend(data);
    const trend = document.querySelector('#trend-chart');
    if (trend && points.length) trend.innerHTML = renderTrend(points);
    const signalMix = document.querySelector('#signal-mix');
    if (signalMix) signalMix.innerHTML = renderSignalDonut(data.signalMix || []);
    updateTrendSummaries(points, data.headline?.kidult100, data.methodologyVersion || '—');
    markPendingConfidence(data);
    applyFinalStructure();
  }

  async function run() {
    try {
      const response = await fetch(dataAsset, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      requestAnimationFrame(() => apply(data));
      setTimeout(() => apply(data), 250);
      setTimeout(() => apply(data), 900);
    } catch (error) {
      console.error('B52 global polish failed', error);
      applyFinalStructure();
    }
  }

  document.addEventListener('kidults:data-loaded', run, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
