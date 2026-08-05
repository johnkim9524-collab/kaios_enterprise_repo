(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
  const esc = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  function parseDate(period) {
    const parsed = new Date(`${period}, 2026 12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function validatePercentSet(items, key = 'value') {
    const values = items.map((item) => clamp(item[key]));
    return { values, total: values.reduce((sum, value) => sum + value, 0) };
  }

  function installTrendChrome(summary, note) {
    const panel = $('.chart-panel');
    if (!panel) return;

    let summaryNode = $('.trend-summary-strip');
    if (!summaryNode) {
      summaryNode = document.createElement('div');
      summaryNode.className = 'trend-summary-strip';
      panel.parentNode.insertBefore(summaryNode, panel);
    }
    summaryNode.innerHTML = summary;

    let noteNode = $('.trend-validation-note');
    if (!noteNode) {
      noteNode = document.createElement('div');
      noteNode.className = 'trend-validation-note';
      panel.insertAdjacentElement('afterend', noteNode);
    }
    noteNode.innerHTML = note;
  }

  function renderTrend(points, headline, methodologyVersion, dataLabel) {
    const target = $('#trend-chart');
    if (!target || !points?.length) return;

    const clean = points.map((point) => ({
      ...point,
      value: Number(point.value),
      date: parseDate(point.period)
    })).filter((point) => Number.isFinite(point.value));
    if (!clean.length) return;

    const width = 900;
    const height = 300;
    const margin = { left: 54, right: 28, top: 24, bottom: 44 };
    const values = clean.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const current = values.at(-1);
    const expectedCurrent = Number(headline.kidult100);
    const expectedChange = Number(headline.change30d);

    const yMin = Math.floor((minValue - 1) / 2) * 2;
    const yMax = Math.ceil((maxValue + 1) / 2) * 2;
    const yRange = Math.max(yMax - yMin, 1);

    const timestamps = clean.map((point) => point.date?.getTime());
    const useDates = timestamps.every(Number.isFinite) && timestamps.at(-1) > timestamps[0];
    const xMin = useDates ? timestamps[0] : 0;
    const xMax = useDates ? timestamps.at(-1) : Math.max(clean.length - 1, 1);
    const x = (point, index) => {
      const value = useDates ? point.date.getTime() : index;
      return margin.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * (width - margin.left - margin.right);
    };
    const y = (value) => margin.top + ((yMax - value) / yRange) * (height - margin.top - margin.bottom);

    const path = clean.map((point, index) => `${index ? 'L' : 'M'} ${x(point, index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
    const baseline = height - margin.bottom;
    const area = `${path} L ${x(clean.at(-1), clean.length - 1).toFixed(1)} ${baseline} L ${x(clean[0], 0).toFixed(1)} ${baseline} Z`;
    const ticks = [yMin, (yMin + yMax) / 2, yMax];
    const grid = ticks.map((value) => `<g><line x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text x="8" y="${y(value) + 4}">${value.toFixed(1)}</text></g>`).join('');
    const majorIndexes = new Set([0, Math.floor((clean.length - 1) / 2), clean.length - 1]);
    const labels = clean.map((point, index) => `<text class="${majorIndexes.has(index) ? 'major-label' : 'minor-label'}" x="${x(point, index)}" y="${height - 12}" text-anchor="middle">${esc(point.period)}</text>`).join('');
    const pointMarkup = clean.map((point, index) => `<g class="trend-point${index === clean.length - 1 ? ' current-point' : ''}" tabindex="0" aria-label="${esc(point.period)}, ${point.value.toFixed(1)}">
      <circle cx="${x(point, index)}" cy="${y(point.value)}" r="5"/>
      <g class="trend-tooltip" transform="translate(${x(point, index)},${Math.max(y(point.value) - 14, 28)})">
        <rect x="-54" y="-34" width="108" height="27" rx="2"/>
        <text x="0" y="-16" text-anchor="middle">${esc(point.period)} · ${point.value.toFixed(1)}</text>
      </g>
    </g>`).join('');

    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 illustrative staging trend from ${esc(clean[0].period)} to ${esc(clean.at(-1).period)}">
      <defs><linearGradient id="b32TrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".28"/><stop offset="1" stop-color="#0b4a3b" stop-opacity=".015"/></linearGradient></defs>
      <g class="chart-grid">${grid}</g>
      <path d="${area}" fill="url(#b32TrendFill)"/>
      <path class="trend-line" d="${path}"/>
      ${pointMarkup}
      <g class="chart-labels">${labels}</g>
    </svg>`;

    const dateSpanDays = useDates ? Math.round((xMax - xMin) / 86400000) : null;
    const target30d = useDates ? xMax - (30 * 86400000) : null;
    let comparison = clean[0];
    if (useDates) {
      comparison = clean.reduce((best, point) => {
        const bestDistance = Math.abs(best.date.getTime() - target30d);
        const pointDistance = Math.abs(point.date.getTime() - target30d);
        return pointDistance < bestDistance ? point : best;
      }, clean[0]);
    }
    const retained30d = comparison.value ? ((current - comparison.value) / comparison.value) * 100 : 0;
    const currentMatches = Math.abs(current - expectedCurrent) < 0.001;

    installTrendChrome(
      `<span><b>${current.toFixed(1)}</b><small>Current</small></span>
       <span><b>${minValue.toFixed(1)}</b><small>Low</small></span>
       <span><b>${maxValue.toFixed(1)}</b><small>High</small></span>
       <span><b>${dateSpanDays ?? '—'}</b><small>Days displayed</small></span>`,
      `<span>${esc(dataLabel || 'Illustrative staging data')}</span>
       <span>${clean.length} retained observations</span>
       <span>Headline 30D: ${expectedChange >= 0 ? '+' : ''}${expectedChange.toFixed(1)}%</span>
       <span>Nearest retained comparison: ${retained30d >= 0 ? '+' : ''}${retained30d.toFixed(1)}% (${esc(comparison.period)} → ${esc(clean.at(-1).period)})</span>
       <span class="${currentMatches ? 'valid' : 'warning'}">Current ${currentMatches ? 'matches' : 'does not match'} headline ${expectedCurrent.toFixed(1)}</span>
       <span>Methodology ${esc(methodologyVersion || 'pending')}</span>`
    );
  }

  function tuneCategoryRows(items) {
    $$('.category-row').forEach((row, index) => {
      const item = items[index];
      if (!item) return;
      const score = clamp(item.score);
      const confidence = clamp(item.confidence);
      const liquidity = clamp(item.liquidity);
      const velocity = Number(item.velocity);
      const bar = $('.bar-track i', row);
      if (bar) bar.style.width = `${score}%`;
      row.setAttribute('aria-label', `${item.name}. Score ${score.toFixed(1)} out of 100. Confidence ${confidence.toFixed(0)} out of 100. Velocity ${Number.isFinite(velocity) ? velocity.toFixed(1) : 'pending'}. Liquidity ${liquidity.toFixed(0)} out of 100. Status ${item.state}.`);
    });
  }

  function annotateComposition(selector, items, label) {
    const node = $(selector);
    if (!node) return;
    const { total } = validatePercentSet(items);
    node.dataset.total = total.toFixed(0);
    node.setAttribute('aria-label', `${label}. Total ${total.toFixed(0)} percent. Illustrative staging data.`);
    node.classList.toggle('distribution-warning', Math.abs(total - 100) > 0.01);
  }

  function refineRadialCenters() {
    $$('.radial-center span, .semi-center span, .donut span').forEach((label) => {
      const value = label.textContent.trim();
      label.textContent = value.toLowerCase() === 'covered' ? 'Covered' : value;
      label.classList.add('radial-center-label');
    });
  }

  function render(data) {
    renderTrend(data.trend || [], data.headline || {}, data.methodologyVersion, data.label);
    tuneCategoryRows(data.categoriesData || []);
    annotateComposition('#signal-mix', data.signalMix || [], 'Evidence dimensions');
    annotateComposition('#confidence-chart', data.confidenceDistribution || [], 'Confidence distribution');
    annotateComposition('#source-donut', data.sourceComposition || [], 'Source composition');
    annotateComposition('#geography-chart', data.geography || [], 'Geographic coverage');
    window.setTimeout(refineRadialCenters, 60);
    document.documentElement.dataset.visualizationIntegrity = 'b32-integrated';
  }

  function start() {
    fetch('intelligence-data.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(render)
      .catch((error) => {
        console.error('B32 visualization integrity load failed', error);
        document.documentElement.dataset.visualizationIntegrity = 'b32-error';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
