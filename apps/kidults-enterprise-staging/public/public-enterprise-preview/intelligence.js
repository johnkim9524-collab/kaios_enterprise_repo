(() => {
  const visualizationCss = document.createElement('link');
  visualizationCss.rel = 'stylesheet';
  visualizationCss.href = 'b30-visualization.css';
  document.head.appendChild(visualizationCss);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat('en-US');

  function setAll(selector, value) {
    $$(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function esc(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]);
  }

  function clampPercentage(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  }

  function lineChart(points) {
    const width = 900;
    const height = 300;
    const left = 54;
    const right = 28;
    const top = 24;
    const bottom = 44;
    const values = points.map((point) => point.value);
    const min = Math.floor(Math.min(...values) - 1);
    const max = Math.ceil(Math.max(...values) + 1);
    const range = Math.max(max - min, 1);
    const x = (index) => left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
    const y = (value) => top + ((max - value) / range) * (height - top - bottom);
    const path = points
      .map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`)
      .join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`;
    const grid = [min, (min + max) / 2, max]
      .map((value) => `<g><line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="8" y="${y(value) + 4}">${value.toFixed(1)}</text></g>`)
      .join('');
    const labels = points
      .map((point, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle">${esc(point.period)}</text>`)
      .join('');

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 staging trend">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#0b4a3b" stop-opacity=".36"/>
          <stop offset="1" stop-color="#0b4a3b" stop-opacity=".02"/>
        </linearGradient>
      </defs>
      <g class="chart-grid">${grid}</g>
      <path d="${area}" fill="url(#trendFill)"/>
      <path d="${path}" fill="none" stroke="#0b4a3b" stroke-width="3" vector-effect="non-scaling-stroke"/>
      ${points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="5" fill="#f4efe7" stroke="#0b4a3b" stroke-width="3"><title>${esc(point.period)}: ${point.value}</title></circle>`).join('')}
      <g class="chart-labels">${labels}</g>
    </svg>`;
  }

  function bars(items) {
    return items.map((item, index) => {
      const score = clampPercentage(item.score);
      return `<article class="category-row">
        <div class="rank">${String(index + 1).padStart(2, '0')}</div>
        <div class="category-copy">
          <div><span>${esc(item.name)}</span><strong>${Number(item.score).toFixed(1)}</strong></div>
          <div class="bar-track" role="img" aria-label="${esc(item.name)} score ${score} out of 100"><i style="width:${score}%"></i></div>
          <div class="category-meta">
            <span>Confidence ${item.confidence}</span>
            <span>Velocity ${Number(item.velocity).toFixed(1)}</span>
            <span>Liquidity ${item.liquidity}</span>
            <b>${esc(item.state)}</b>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function horizontal(items, valueKey, labelKey, suffix = '%', scale = 'relative') {
    const values = items.map((item) => Number(item[valueKey]) || 0);
    const relativeMax = Math.max(...values, 1);
    const denominator = scale === 'percent' ? 100 : relativeMax;

    return items.map((item) => {
      const value = Number(item[valueKey]) || 0;
      const width = clampPercentage((value / denominator) * 100);
      return `<div class="hbar-row">
        <span>${esc(item[labelKey])}</span>
        <div role="img" aria-label="${esc(item[labelKey])}: ${value}${suffix}"><i style="width:${width}%"></i></div>
        <strong>${value}${suffix}</strong>
      </div>`;
    }).join('');
  }

  function evidenceComposition(items) {
    const colors = ['#0b4a3b', '#477a69', '#82a99b', '#c4d6cf'];
    const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const normalizedItems = items.map((item, index) => ({
      ...item,
      color: colors[index % colors.length],
      value: Number(item.value) || 0
    }));

    const stacked = normalizedItems.map((item) => {
      const width = total > 0 ? (item.value / total) * 100 : 0;
      return `<span style="width:${width}%;background:${item.color}" title="${esc(item.name)}: ${item.value}%"></span>`;
    }).join('');

    const legend = normalizedItems.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.name)} <b>${item.value}%</b></span>`).join('');

    return `<div class="composition-summary">
      <div class="composition-stack" role="img" aria-label="Evidence dimension composition totals ${total}%">${stacked}</div>
      <div class="composition-total"><strong>${total}%</strong><span>Total composition</span></div>
    </div>
    <div class="composition-legend">${legend}</div>
    <div class="hbar-chart composition-detail">${horizontal(items, 'value', 'name', '%', 'percent')}</div>`;
  }

  function donut(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let offset = 0;
    const colors = ['#82d0b3', '#d8c18c', '#73998b', '#b8a789', '#315f52'];
    const stops = items.map((item, index) => {
      const start = offset;
      offset += (item.value / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${offset}%`;
    }).join(',');

    return `<div class="donut" style="background:conic-gradient(${stops})">
      <div><strong>${total}%</strong><span>covered</span></div>
    </div>
    <div class="legend">${items.map((item, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${esc(item.name)} <b>${item.value}%</b></span>`).join('')}</div>`;
  }

  function movers(items) {
    return items.map((item, index) => `<div class="mover-row">
      <span>${index + 1}</span>
      <b>${esc(item.name)}</b>
      <strong class="${item.change < 0 ? 'negative' : ''}">${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change).toFixed(1)}%</strong>
    </div>`).join('');
  }

  function lifecycle(items) {
    const stages = ['Emerging', 'Growth', 'Mature', 'Legacy'];
    return `<div class="lifecycle-head">${stages.map((stage) => `<span>${stage}</span>`).join('')}</div>
      ${items.map((item) => `<div class="lifecycle-row">
        <b>${esc(item.name)}</b>
        <div class="lifecycle-track">${stages.map((stage) => `<i class="${stage === item.stage ? 'active' : ''}"></i>`).join('')}</div>
        <span>${esc(item.stage)}</span>
      </div>`).join('')}`;
  }

  function matrix(data) {
    return `<div class="matrix-grid" style="--count:${data.labels.length + 1}">
      <span></span>
      ${data.labels.map((label) => `<b>${esc(label)}</b>`).join('')}
      ${data.labels.map((label, row) => `<b>${esc(label)}</b>${data.values[row].map((value) => `<span style="--alpha:${Math.max(.1, value)}"><i>${value.toFixed(2)}</i></span>`).join('')}`).join('')}
    </div>`;
  }

  fetch('intelligence-data.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const headline = data.headline;
      setAll('[data-k100]', headline.kidult100.toFixed(1));
      setAll('[data-change]', `▲ ${headline.change30d.toFixed(1)}% · 30D`);
      setAll('[data-confidence]', `${headline.confidence}%`);
      setAll('[data-coverage]', `${fmt.format(headline.coverageBrands)}+ brands`);
      setAll('[data-sources]', fmt.format(headline.sourceFamilies));
      setAll('[data-updated]', new Date(data.updated).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }));
      setAll('[data-method]', data.methodologyVersion);
      setAll('[data-sentiment]', headline.sentiment.toFixed(1));
      setAll('[data-canon]', headline.canonStrength.toFixed(1));
      setAll('[data-velocity]', headline.marketVelocity.toFixed(2));
      setAll('[data-listings]', `${Math.round(headline.activeListings / 1000)}K`);
      setAll('[data-category-count]', String(headline.categories));

      $('#trend-chart').innerHTML = lineChart(data.trend);
      $('#category-bars').innerHTML = bars(data.categoriesData);
      $('#signal-mix').innerHTML = evidenceComposition(data.signalMix);
      $('#confidence-chart').innerHTML = horizontal(data.confidenceDistribution, 'value', 'grade', '', 'relative');
      $('#source-donut').innerHTML = donut(data.sourceComposition);
      $('#geography-chart').innerHTML = horizontal(data.geography, 'value', 'region', '', 'relative');
      $('#movers-chart').innerHTML = movers(data.movers);
      $('#lifecycle-chart').innerHTML = lifecycle(data.lifecycle);
      $('#correlation-chart').innerHTML = matrix(data.correlation);
      $$('[data-status-label]').forEach((node) => {
        node.textContent = data.label;
      });
      document.documentElement.dataset.dataReady = 'true';
    })
    .catch((error) => {
      console.error('Intelligence data load failed', error);
      $$('[data-status-label]').forEach((node) => {
        node.textContent = 'Data temporarily unavailable';
      });
      document.documentElement.dataset.dataReady = 'false';
    });
})();
