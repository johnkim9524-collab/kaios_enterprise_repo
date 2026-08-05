(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat('en-US');

  function setAll(selector, value) { $$(selector).forEach((node) => { node.textContent = value; }); }
  function esc(value) { return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function lineChart(points) {
    const width = 900, height = 300, left = 54, right = 28, top = 24, bottom = 44;
    const values = points.map((d) => d.value);
    const min = Math.floor(Math.min(...values) - 1), max = Math.ceil(Math.max(...values) + 1);
    const x = (i) => left + (i * (width - left - right)) / Math.max(points.length - 1, 1);
    const y = (v) => top + ((max - v) / (max - min)) * (height - top - bottom);
    const path = points.map((d, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`;
    const grid = [min, (min + max) / 2, max].map((v) => `<g><line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text x="8" y="${y(v)+4}">${v.toFixed(1)}</text></g>`).join('');
    const labels = points.map((d, i) => `<text x="${x(i)}" y="${height-12}" text-anchor="middle">${esc(d.period)}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 staging trend"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".36"/><stop offset="1" stop-color="#0b4a3b" stop-opacity=".02"/></linearGradient></defs><g class="chart-grid">${grid}</g><path d="${area}" fill="url(#trendFill)"/><path d="${path}" fill="none" stroke="#0b4a3b" stroke-width="3" vector-effect="non-scaling-stroke"/>${points.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="5" fill="#f4efe7" stroke="#0b4a3b" stroke-width="3"><title>${esc(d.period)}: ${d.value}</title></circle>`).join('')}<g class="chart-labels">${labels}</g></svg>`;
  }

  function bars(items) {
    return items.map((item, index) => `<article class="category-row"><div class="rank">${String(index + 1).padStart(2, '0')}</div><div class="category-copy"><div><span>${esc(item.name)}</span><strong>${item.score.toFixed(1)}</strong></div><div class="bar-track"><i style="width:${item.score}%"></i></div><div class="category-meta"><span>Confidence ${item.confidence}</span><span>Velocity ${item.velocity.toFixed(1)}</span><span>Liquidity ${item.liquidity}</span><b>${esc(item.state)}</b></div></div></article>`).join('');
  }

  function horizontal(items, valueKey, labelKey, suffix = '%') {
    const max = Math.max(...items.map((item) => item[valueKey]));
    return items.map((item) => `<div class="hbar-row"><span>${esc(item[labelKey])}</span><div><i style="width:${(item[valueKey] / max) * 100}%"></i></div><strong>${item[valueKey]}${suffix}</strong></div>`).join('');
  }

  function donut(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let offset = 0;
    const colors = ['#82d0b3','#d8c18c','#73998b','#b8a789','#315f52'];
    const stops = items.map((item, i) => { const start = offset; offset += item.value / total * 100; return `${colors[i % colors.length]} ${start}% ${offset}%`; }).join(',');
    return `<div class="donut" style="background:conic-gradient(${stops})"><div><strong>${total}%</strong><span>covered</span></div></div><div class="legend">${items.map((item,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(item.name)} <b>${item.value}%</b></span>`).join('')}</div>`;
  }

  function movers(items) {
    return items.map((item, i) => `<div class="mover-row"><span>${i + 1}</span><b>${esc(item.name)}</b><strong class="${item.change < 0 ? 'negative' : ''}">${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change).toFixed(1)}%</strong></div>`).join('');
  }

  function lifecycle(items) {
    const stages = ['Emerging','Growth','Mature','Legacy'];
    return `<div class="lifecycle-head">${stages.map((s)=>`<span>${s}</span>`).join('')}</div>${items.map((item)=>`<div class="lifecycle-row"><b>${esc(item.name)}</b><div class="lifecycle-track">${stages.map((stage)=>`<i class="${stage===item.stage?'active':''}"></i>`).join('')}</div><span>${esc(item.stage)}</span></div>`).join('')}`;
  }

  function matrix(data) {
    return `<div class="matrix-grid" style="--count:${data.labels.length + 1}"><span></span>${data.labels.map((l)=>`<b>${esc(l)}</b>`).join('')}${data.labels.map((label,row)=>`<b>${esc(label)}</b>${data.values[row].map((value)=>`<span style="--alpha:${Math.max(.1,value)}"><i>${value.toFixed(2)}</i></span>`).join('')}`).join('')}</div>`;
  }

  fetch('intelligence-data.json', { cache: 'no-store' })
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((data) => {
      const h = data.headline;
      setAll('[data-k100]', h.kidult100.toFixed(1));
      setAll('[data-change]', `▲ ${h.change30d.toFixed(1)}% · 30D`);
      setAll('[data-confidence]', `${h.confidence}%`);
      setAll('[data-coverage]', `${fmt.format(h.coverageBrands)}+ brands`);
      setAll('[data-sources]', fmt.format(h.sourceFamilies));
      setAll('[data-updated]', new Date(data.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      setAll('[data-method]', data.methodologyVersion);
      setAll('[data-sentiment]', h.sentiment.toFixed(1));
      setAll('[data-canon]', h.canonStrength.toFixed(1));
      setAll('[data-velocity]', h.marketVelocity.toFixed(2));
      setAll('[data-listings]', `${Math.round(h.activeListings / 1000)}K`);
      setAll('[data-category-count]', String(h.categories));
      $('#trend-chart').innerHTML = lineChart(data.trend);
      $('#category-bars').innerHTML = bars(data.categoriesData);
      $('#signal-mix').innerHTML = horizontal(data.signalMix, 'value', 'name');
      $('#confidence-chart').innerHTML = horizontal(data.confidenceDistribution, 'value', 'grade');
      $('#source-donut').innerHTML = donut(data.sourceComposition);
      $('#geography-chart').innerHTML = horizontal(data.geography, 'value', 'region');
      $('#movers-chart').innerHTML = movers(data.movers);
      $('#lifecycle-chart').innerHTML = lifecycle(data.lifecycle);
      $('#correlation-chart').innerHTML = matrix(data.correlation);
      $$('[data-status-label]').forEach((node) => { node.textContent = data.label; });
      document.documentElement.dataset.dataReady = 'true';
    })
    .catch((error) => {
      console.error('Intelligence data load failed', error);
      $$('[data-status-label]').forEach((node) => { node.textContent = 'Data temporarily unavailable'; });
      document.documentElement.dataset.dataReady = 'false';
    });
})();
