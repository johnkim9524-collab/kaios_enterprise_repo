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
    const total = values.reduce((sum, value) => sum + value, 0);
    return { values, total };
  }

  function renderTrend(points, headline) {
    const target = $('#trend-chart');
    if (!target || !points?.length) return;

    const width = 960;
    const height = 360;
    const margin = { left: 66, right: 30, top: 38, bottom: 58 };
    const clean = points.map((point) => ({
      ...point,
      value: Number(point.value),
      date: parseDate(point.period)
    })).filter((point) => Number.isFinite(point.value));
    if (!clean.length) return;

    const values = clean.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const current = values.at(-1);
    const expectedCurrent = Number(headline.kidult100);
    const first = values[0];
    const calculatedChange = first ? ((current - first) / first) * 100 : 0;
    const expectedChange = Number(headline.change30d);

    const rawRange = Math.max(maxValue - minValue, 1);
    const padding = Math.max(rawRange * 0.28, 1.2);
    const yMin = Math.max(0, Math.floor((minValue - padding) * 2) / 2);
    const yMax = Math.ceil((maxValue + padding) * 2) / 2;
    const yRange = Math.max(yMax - yMin, 1);

    const dates = clean.map((point) => point.date?.getTime()).filter(Number.isFinite);
    const useDates = dates.length === clean.length && dates.at(-1) > dates[0];
    const dateMin = useDates ? dates[0] : 0;
    const dateMax = useDates ? dates.at(-1) : Math.max(clean.length - 1, 1);

    const x = (point, index) => {
      const value = useDates ? point.date.getTime() : index;
      return margin.left + ((value - dateMin) / Math.max(dateMax - dateMin, 1)) * (width - margin.left - margin.right);
    };
    const y = (value) => margin.top + ((yMax - value) / yRange) * (height - margin.top - margin.bottom);

    const path = clean.map((point, index) => `${index ? 'L' : 'M'} ${x(point, index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
    const baseline = height - margin.bottom;
    const area = `${path} L ${x(clean.at(-1), clean.length - 1).toFixed(1)} ${baseline} L ${x(clean[0], 0).toFixed(1)} ${baseline} Z`;
    const ticks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
    const grid = ticks.map((value) => `<g><line x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text x="12" y="${y(value) + 4}">${value.toFixed(1)}</text></g>`).join('');
    const mobileLabelIndexes = new Set([0, Math.floor((clean.length - 1) / 2), clean.length - 1]);
    const labels = clean.map((point, index) => `<text class="${mobileLabelIndexes.has(index) ? 'major-label' : 'minor-label'}" x="${x(point, index)}" y="${height - 18}" text-anchor="middle">${esc(point.period)}</text>`).join('');
    const pointsMarkup = clean.map((point, index) => {
      const classes = [index === clean.length - 1 ? 'current-point' : '', point.value === minValue ? 'min-point' : '', point.value === maxValue ? 'max-point' : ''].filter(Boolean).join(' ');
      return `<g class="trend-point ${classes}" tabindex="0" role="button" aria-label="${esc(point.period)}, ${point.value.toFixed(1)}">
        <circle cx="${x(point, index)}" cy="${y(point.value)}" r="6"/>
        <g class="trend-tooltip" transform="translate(${x(point, index)},${Math.max(y(point.value) - 18, 18)})">
          <rect x="-52" y="-34" width="104" height="27" rx="2"/>
          <text x="0" y="-16" text-anchor="middle">${esc(point.period)} · ${point.value.toFixed(1)}</text>
        </g>
      </g>`;
    }).join('');

    const currentMatches = Math.abs(current - expectedCurrent) < 0.001;
    const changeDifference = Math.abs(calculatedChange - expectedChange);
    const dateSpanDays = useDates ? Math.round((dateMax - dateMin) / 86400000) : null;

    target.innerHTML = `<div class="trend-integrity-summary" aria-label="Trend summary">
      <span><b>${current.toFixed(1)}</b> Current</span>
      <span><b>${minValue.toFixed(1)}</b> Minimum</span>
      <span><b>${maxValue.toFixed(1)}</b> Maximum</span>
      <span><b>${calculatedChange >= 0 ? '+' : ''}${calculatedChange.toFixed(1)}%</b> Observed period</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kidult 100 illustrative staging trend from ${esc(clean[0].period)} to ${esc(clean.at(-1).period)}">
      <defs><linearGradient id="b32TrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0b4a3b" stop-opacity=".28"/><stop offset="1" stop-color="#0b4a3b" stop-opacity=".015"/></linearGradient></defs>
      <g class="chart-grid">${grid}</g>
      <path d="${area}" fill="url(#b32TrendFill)"/>
      <path class="trend-line" d="${path}"/>
      ${pointsMarkup}
      <g class="chart-labels">${labels}</g>
    </svg>
    <div class="trend-integrity-note">
      <span>${dateSpanDays ? `${dateSpanDays}-day displayed span` : 'Evenly spaced observations'}</span>
      <span class="${currentMatches ? 'valid' : 'warning'}">Current ${currentMatches ? 'matches' : 'does not match'} headline ${expectedCurrent.toFixed(1)}</span>
      <span class="${changeDifference <= 0.15 ? 'valid' : 'warning'}">Displayed-period change ${calculatedChange.toFixed(1)}%; headline 30D ${expectedChange.toFixed(1)}%</span>
      <span>Illustrative staging data · ${esc(document.querySelector('[data-method]')?.textContent || 'method pending')}</span>
    </div>`;
  }

  function tuneCategoryRows(items) {
    const rows = $$('.category-row');
    rows.forEach((row, index) => {
      const item = items[index];
      if (!item) return;
      const score = clamp(item.score);
      const confidence = clamp(item.confidence);
      const liquidity = clamp(item.liquidity);
      const velocity = Number(item.velocity);
      const bar = $('.bar-track i', row);
      if (bar) bar.style.width = `${score}%`;
      row.dataset.score = score.toFixed(1);
      row.dataset.confidence = confidence.toFixed(0);
      row.dataset.liquidity = liquidity.toFixed(0);
      row.dataset.velocity = Number.isFinite(velocity) ? velocity.toFixed(1) : 'Pending';
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
    renderTrend(data.trend || [], data.headline || {});
    tuneCategoryRows(data.categoriesData || []);
    annotateComposition('#signal-mix', data.signalMix || [], 'Evidence dimensions');
    annotateComposition('#confidence-chart', data.confidenceDistribution || [], 'Confidence distribution');
    annotateComposition('#source-donut', data.sourceComposition || [], 'Source composition');
    annotateComposition('#geography-chart', data.geography || [], 'Geographic coverage');
    window.setTimeout(refineRadialCenters, 60);
    document.documentElement.dataset.visualizationIntegrity = 'b32-ready';
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
