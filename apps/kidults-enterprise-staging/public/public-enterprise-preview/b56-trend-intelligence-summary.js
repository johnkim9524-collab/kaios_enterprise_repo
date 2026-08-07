(() => {
  const fmt = (value) => Number(value).toFixed(1);
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get('data') === 'preview';
  const dataAsset = previewMode ? 'intelligence-data.preview.json' : 'intelligence-data.json';

  function buildSummary(data) {
    const side = document.querySelector('.data-section .chart-panel .chart-side');
    if (!side || !Array.isArray(data.trend) || data.trend.length === 0) return;

    const values = data.trend.map((point) => Number(point.value)).filter(Number.isFinite);
    if (!values.length) return;

    const current = Number(data.headline?.kidult100 ?? values[values.length - 1]);
    const change = Number(data.headline?.change30d ?? 0);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const observations = values.length;
    const methodology = data.methodologyVersion || '—';

    side.innerHTML = `
      <div class="trend-intel-primary">
        <span class="trend-intel-kicker">Current</span>
        <strong class="trend-intel-current">${fmt(current)}</strong>
        <span class="trend-intel-delta">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% · 30D</span>
      </div>
      <dl class="trend-intel-stats">
        <div><dt>Low</dt><dd>${fmt(low)}</dd></div>
        <div><dt>High</dt><dd>${fmt(high)}</dd></div>
        <div><dt>Observations</dt><dd>${observations}</dd></div>
      </dl>
      <div class="trend-intel-meta">
        <p><span>Methodology</span><b>${methodology}</b></p>
        <p><span>Matches headline</span><b class="trend-intel-check">✓</b></p>
      </div>`;

    document.querySelectorAll('.data-section > .trend-summary-strip').forEach((node) => node.remove());
  }

  fetch(dataAsset, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(buildSummary)
    .catch(() => {});
})();