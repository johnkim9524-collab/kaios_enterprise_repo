(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat('en-US');

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function lineChart(points) {
    const width = 760;
    const height = 250;
    const pad = 24;
    const values = points.map((d) => d.value);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const x = (i) => pad + (i * (width - pad * 2)) / Math.max(points.length - 1, 1);
    const y = (v) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
    const path = points.map((d, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 staging trend">
      <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".32"/><stop offset="1" stop-color="#0b4a3b" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#trendFill)"/>
      <path d="${path}" fill="none" stroke="#0b4a3b" stroke-width="3" vector-effect="non-scaling-stroke"/>
      ${points.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="4" fill="#f4efe7" stroke="#0b4a3b" stroke-width="2"><title>${d.period}: ${d.value}</title></circle>`).join('')}
    </svg>`;
  }

  function bars(items) {
    const max = Math.max(...items.map((item) => item.score));
    return items.map((item) => `<article class="category-row">
      <div><span>${item.name}</span><strong>${item.score.toFixed(1)}</strong></div>
      <div class="bar-track"><i style="width:${(item.score / max) * 100}%"></i></div>
      <div class="category-meta"><span>Confidence ${item.confidence}</span><b>${item.state}</b></div>
    </article>`).join('');
  }

  function mix(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return items.map((item) => `<div class="mix-row"><span>${item.name}</span><div><i style="width:${(item.value / total) * 100}%"></i></div><strong>${item.value}%</strong></div>`).join('');
  }

  fetch('intelligence-data.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const h = data.headline;
      setText('[data-k100]', h.kidult100.toFixed(1));
      setText('[data-change]', `▲ ${h.change30d.toFixed(1)}% · 30D`);
      setText('[data-confidence]', `${h.confidence}%`);
      setText('[data-coverage]', `${fmt.format(h.coverageBrands)}+ brands`);
      setText('[data-sources]', fmt.format(h.sourceFamilies));
      setText('[data-edition]', '2026.08');
      setText('[data-updated]', new Date(data.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      setText('[data-method]', data.methodologyVersion);
      setText('[data-sentiment]', h.sentiment.toFixed(1));
      setText('[data-canon]', h.canonStrength.toFixed(1));
      setText('[data-velocity]', h.marketVelocity.toFixed(2));
      setText('[data-listings]', `${Math.round(h.activeListings / 1000)}K`);
      setText('[data-category-count]', String(h.categories));
      $('#trend-chart').innerHTML = lineChart(data.trend);
      $('#category-bars').innerHTML = bars(data.categoriesData);
      $('#signal-mix').innerHTML = mix(data.signalMix);
      $$('[data-status-label]').forEach((node) => { node.textContent = data.label; });
      document.documentElement.dataset.dataReady = 'true';
    })
    .catch((error) => {
      console.error('Intelligence data load failed', error);
      $$('[data-status-label]').forEach((node) => { node.textContent = 'Data temporarily unavailable'; });
      document.documentElement.dataset.dataReady = 'false';
    });
})();
