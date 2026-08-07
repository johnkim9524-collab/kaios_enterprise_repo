(() => {
  'use strict';

  const visualizationCss = document.createElement('link');
  visualizationCss.rel = 'stylesheet';
  visualizationCss.href = 'b30-visualization.css?v=2';
  document.head.appendChild(visualizationCss);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat('en-US');
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get('data') === 'preview';
  const dataAsset = previewMode ? 'intelligence-data.preview.json' : 'intelligence-data.json';

  document.documentElement.dataset.dataMode = previewMode ? 'preview' : 'live';
  window.KIDULTS_DATA_ASSET = dataAsset;

  function setAll(selector, value) {
    $$(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function clampPercentage(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  }

  function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      throw new Error(`Invalid ${label}`);
    }
    return numeric;
  }

  function validateDistribution(items, label) {
    if (!Array.isArray(items) || !items.length) throw new Error(`Missing ${label}`);
    const total = items.reduce((sum, item, index) => sum + finite(item.value, `${label}[${index}].value`, { min: 0, max: 100 }), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error(`${label} must total 100`);
    return total;
  }

  function validateSnapshot(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid intelligence snapshot');
    if (!data.headline || typeof data.headline !== 'object') throw new Error('Missing headline');

    const headline = data.headline;
    finite(headline.kidult100, 'headline.kidult100', { min: 0, max: 100 });
    finite(headline.change30d, 'headline.change30d', { min: -100, max: 100 });
    finite(headline.confidence, 'headline.confidence', { min: 0, max: 100 });
    finite(headline.sentiment, 'headline.sentiment', { min: 0, max: 100 });
    finite(headline.canonStrength, 'headline.canonStrength', { min: 0, max: 100 });
    finite(headline.marketVelocity, 'headline.marketVelocity', { min: 0 });
    finite(headline.activeListings, 'headline.activeListings', { min: 0 });
    finite(headline.coverageBrands, 'headline.coverageBrands', { min: 0 });
    finite(headline.sourceFamilies, 'headline.sourceFamilies', { min: 0 });

    if (!Array.isArray(data.trend) || data.trend.length < 2) throw new Error('Trend requires at least two observations');
    data.trend.forEach((point, index) => finite(point.value, `trend[${index}].value`, { min: 0, max: 100 }));
    const latestTrend = Number(data.trend[data.trend.length - 1].value);
    if (Math.abs(latestTrend - Number(headline.kidult100)) > 0.05) {
      throw new Error('Headline Kidult 100 does not match latest trend observation');
    }

    if (!Array.isArray(data.categoriesData) || !data.categoriesData.length) throw new Error('Missing category intelligence');
    if (Number(headline.categories) !== data.categoriesData.length) throw new Error('Category count mismatch');
    data.categoriesData.forEach((item, index) => {
      if (!item?.name) throw new Error(`Missing categoriesData[${index}].name`);
      finite(item.score, `categoriesData[${index}].score`, { min: 0, max: 100 });
      finite(item.confidence, `categoriesData[${index}].confidence`, { min: 0, max: 100 });
      finite(item.velocity, `categoriesData[${index}].velocity`, { min: 0 });
      finite(item.liquidity, `categoriesData[${index}].liquidity`, { min: 0, max: 100 });
      if (!item.state) throw new Error(`Missing categoriesData[${index}].state`);
    });

    validateDistribution(data.signalMix, 'signalMix');
    validateDistribution(data.confidenceDistribution, 'confidenceDistribution');
    validateDistribution(data.sourceComposition, 'sourceComposition');
    validateDistribution(data.geography, 'geography');

    if (!Array.isArray(data.movers)) throw new Error('Missing movers');
    data.movers.forEach((item, index) => finite(item.change, `movers[${index}].change`, { min: -100, max: 100 }));
    if (!Array.isArray(data.lifecycle)) throw new Error('Missing lifecycle');

    const correlation = data.correlation;
    if (!correlation || !Array.isArray(correlation.labels) || !Array.isArray(correlation.values)) throw new Error('Missing correlation matrix');
    const size = correlation.labels.length;
    if (!size || correlation.values.length !== size) throw new Error('Correlation matrix dimensions mismatch');
    correlation.values.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== size) throw new Error('Correlation matrix dimensions mismatch');
      row.forEach((value, columnIndex) => finite(value, `correlation[${rowIndex}][${columnIndex}]`, { min: -1, max: 1 }));
    });

    const updated = new Date(data.updated);
    if (!Number.isFinite(updated.getTime())) throw new Error('Invalid updated timestamp');
    if (!data.methodologyVersion) throw new Error('Missing methodology version');

    return data;
  }

  function prepareCategories(items) {
    const explicit = items.filter((item) => item.leadSignal === true);
    const leader = explicit.length === 1
      ? explicit[0]
      : items.reduce((best, item) => Number(item.score) > Number(best.score) ? item : best, items[0]);
    return items.map((item) => ({ ...item, leadSignal: item === leader || item.id === leader.id || item.name === leader.name }));
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
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`;
    const grid = [min, (min + max) / 2, max].map((value) => `<g><line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="8" y="${y(value) + 4}">${value.toFixed(1)}</text></g>`).join('');
    const labels = points.map((point, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle">${esc(point.period)}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 intelligence trend"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".36"/><stop offset="1" stop-color="#0b4a3b" stop-opacity=".02"/></linearGradient></defs><g class="chart-grid">${grid}</g><path d="${area}" fill="url(#trendFill)"/><path d="${path}" fill="none" stroke="#0b4a3b" stroke-width="3" vector-effect="non-scaling-stroke"/>${points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="5" fill="#f4efe7" stroke="#0b4a3b" stroke-width="3"><title>${esc(point.period)}: ${point.value}</title></circle>`).join('')}<g class="chart-labels">${labels}</g></svg>`;
  }

  function bars(items) {
    return items.map((item, index) => {
      const score = clampPercentage(item.score);
      const leadClass = item.leadSignal ? ' lead-signal' : '';
      const leadLabel = item.leadSignal ? '<span class="lead-signal-label">Lead signal</span>' : '';
      return `<article class="category-row${leadClass}">${leadLabel}<div class="rank">${String(index + 1).padStart(2, '0')}</div><div class="category-copy"><div><span>${esc(item.name)}</span><strong>${Number(item.score).toFixed(1)}</strong></div><div class="bar-track" role="img" aria-label="${esc(item.name)} score ${score} out of 100"><i style="width:${score}%"></i></div><div class="category-meta"><span>Confidence ${Number(item.confidence).toFixed(1)}</span><span>Velocity ${Number(item.velocity).toFixed(1)}</span><span>Liquidity ${Math.round(Number(item.liquidity))}</span><b>${esc(item.state)}</b></div></div></article>`;
    }).join('');
  }

  function horizontal(items, valueKey, labelKey, suffix = '%', scale = 'percent') {
    const values = items.map((item) => Number(item[valueKey]) || 0);
    const relativeMax = Math.max(...values, 1);
    const denominator = scale === 'percent' ? 100 : relativeMax;
    return items.map((item) => {
      const value = Number(item[valueKey]) || 0;
      const width = clampPercentage((value / denominator) * 100);
      const scaleLabel = scale === 'percent' ? 'out of 100' : `relative to maximum ${relativeMax}`;
      return `<div class="hbar-row"><span>${esc(item[labelKey])}</span><div role="img" aria-label="${esc(item[labelKey])}: ${value}${suffix}, ${scaleLabel}"><i style="width:${width}%"></i></div><strong>${value}${suffix}</strong></div>`;
    }).join('');
  }

  function evidenceComposition(items) {
    const colors = ['#0b4a3b', '#477a69', '#82a99b', '#c4d6cf'];
    const total = items.reduce((sum, item) => sum + Number(item.value), 0);
    const normalizedItems = items.map((item, index) => ({ ...item, color: colors[index % colors.length], value: Number(item.value) }));
    let offset = 0;
    const stops = normalizedItems.map((item) => {
      const start = offset;
      offset += (item.value / total) * 100;
      return `${item.color} ${start}% ${offset}%`;
    }).join(',');
    const legend = normalizedItems.map((item) => `<span><i style="background:${item.color}"></i><b>${esc(item.name)}</b><strong>${item.value}%</strong></span>`).join('');
    return `<div class="signal-donut-layout"><div class="signal-donut-wrap"><div class="signal-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Evidence dimension composition totals ${total}%"></div><div class="signal-donut-center"><strong>${total}%</strong><span>Total composition</span></div></div><div class="signal-donut-legend">${legend}</div></div>`;
  }

  function donut(items) {
    const total = items.reduce((sum, item) => sum + Number(item.value), 0);
    let offset = 0;
    const colors = ['#82d0b3', '#d8c18c', '#73998b', '#b8a789', '#315f52'];
    const stops = items.map((item, index) => {
      const value = Number(item.value);
      const start = offset;
      offset += (value / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${offset}%`;
    }).join(',');
    return `<div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="Source composition totals ${total}%"><div><strong>${total}%</strong><span>covered</span></div></div><div class="legend">${items.map((item, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${esc(item.name)} <b>${item.value}%</b></span>`).join('')}</div>`;
  }

  function movers(items) {
    return items.map((item, index) => `<div class="mover-row"><span>${index + 1}</span><b>${esc(item.name)}</b><strong class="${item.change < 0 ? 'negative' : ''}">${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change).toFixed(1)}%</strong></div>`).join('');
  }

  function lifecycle(items) {
    const stages = ['Emerging', 'Growth', 'Mature', 'Legacy'];
    return `<div class="lifecycle-head">${stages.map((stage) => `<span>${stage}</span>`).join('')}</div>${items.map((item) => `<div class="lifecycle-row"><b>${esc(item.name)}</b><div class="lifecycle-track">${stages.map((stage) => `<i class="${stage === item.stage ? 'active' : ''}"></i>`).join('')}</div><span>${esc(item.stage)}</span></div>`).join('')}`;
  }

  function matrix(data) {
    return `<div class="matrix-grid" style="--count:${data.labels.length + 1}"><span></span>${data.labels.map((label) => `<b>${esc(label)}</b>`).join('')}${data.labels.map((label, row) => `<b>${esc(label)}</b>${data.values[row].map((value) => `<span style="--alpha:${Math.max(.1, Math.abs(value))}"><i>${Number(value).toFixed(2)}</i></span>`).join('')}`).join('')}</div>`;
  }

  function snapshotId(data) {
    return [data.edition || 'undated', data.methodologyVersion || 'unknown', data.updated || 'unknown'].join('|');
  }

  function isProductionEligible(data) {
    return data.status === 'production' && data.governance?.productionEligible === true;
  }

  function render(data) {
    const headline = data.headline;
    const categories = prepareCategories(data.categoriesData);
    const updated = new Date(data.updated);
    const productionEligible = isProductionEligible(data);
    const statusLabel = previewMode
      ? `${data.label || 'Staging data'} · PREVIEW`
      : productionEligible
        ? (data.label || 'Production intelligence')
        : (data.label || 'Illustrative data');

    setAll('[data-k100]', Number(headline.kidult100).toFixed(1));
    setAll('[data-change]', `${Number(headline.change30d) >= 0 ? '▲' : '▼'} ${Math.abs(Number(headline.change30d)).toFixed(1)}% · 30D`);
    setAll('[data-confidence]', `${Number(headline.confidence).toFixed(1)}%`);
    setAll('[data-coverage]', `${fmt.format(Math.round(Number(headline.coverageBrands)))}+ brands`);
    setAll('[data-sources]', fmt.format(Math.round(Number(headline.sourceFamilies))));
    setAll('[data-updated]', updated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    setAll('[data-method]', data.methodologyVersion);
    setAll('[data-sentiment]', Number(headline.sentiment).toFixed(1));
    setAll('[data-canon]', Number(headline.canonStrength).toFixed(1));
    setAll('[data-velocity]', Number(headline.marketVelocity).toFixed(2));
    setAll('[data-listings]', `${Math.round(Number(headline.activeListings) / 1000)}K`);
    setAll('[data-category-count]', String(categories.length));

    $('#trend-chart').innerHTML = lineChart(data.trend);
    $('#category-bars').innerHTML = bars(categories);
    $('#signal-mix').innerHTML = evidenceComposition(data.signalMix);
    $('#confidence-chart').innerHTML = horizontal(data.confidenceDistribution, 'value', 'grade', '%', 'percent');
    $('#source-donut').innerHTML = donut(data.sourceComposition);
    $('#geography-chart').innerHTML = horizontal(data.geography, 'value', 'region', '%', 'percent');
    $('#movers-chart').innerHTML = movers(data.movers);
    $('#lifecycle-chart').innerHTML = lifecycle(data.lifecycle);
    $('#correlation-chart').innerHTML = matrix(data.correlation);

    $$('[data-status-label]').forEach((node) => {
      node.textContent = statusLabel;
    });

    const snapshot = Object.freeze({
      id: snapshotId(data),
      mode: previewMode ? 'preview' : 'live',
      asset: dataAsset,
      schemaVersion: data.schemaVersion || data.governance?.engineVersion || null,
      methodologyVersion: data.methodologyVersion,
      edition: data.edition || null,
      updated: data.updated,
      productionEligible,
      categoryCount: categories.length,
      leadSignal: categories.find((item) => item.leadSignal)?.name || null,
      kidult100: Number(headline.kidult100),
      signalMixTotal: data.signalMix.reduce((sum, item) => sum + Number(item.value), 0)
    });

    window.KIDULTS_INTELLIGENCE_SNAPSHOT = snapshot;
    document.documentElement.dataset.dataReady = 'true';
    document.documentElement.dataset.productionEligible = productionEligible ? 'true' : 'false';
    document.documentElement.dataset.snapshotId = snapshot.id;
    document.dispatchEvent(new CustomEvent('kidults:data-loaded', { detail: snapshot }));
  }

  fetch(dataAsset, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(validateSnapshot)
    .then(render)
    .catch((error) => {
      console.error('Intelligence data load failed closed', error);
      $$('[data-status-label]').forEach((node) => {
        node.textContent = previewMode ? 'Preview data unavailable' : 'Intelligence validation failed';
      });
      document.documentElement.dataset.dataReady = 'false';
      document.documentElement.dataset.productionEligible = 'false';
      document.documentElement.dataset.dataError = 'validation';
      document.dispatchEvent(new CustomEvent('kidults:data-error', { detail: { mode: previewMode ? 'preview' : 'live', asset: dataAsset, message: error.message } }));
    });
})();
