(() => {
  const COLORS = ['#0B4A3B', '#2E6F73', '#4F87A3', '#67AFC2', '#79CDB8'];
  const params = new URLSearchParams(window.location.search);
  const dataFile = params.get('data') === 'preview'
    ? 'intelligence-data.preview.json'
    : 'intelligence-data.json';

  const esc = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const normalize = (items) => {
    const clean = (items || []).map((item) => ({ ...item, value: Math.max(0, Number(item.value) || 0) }));
    return { items: clean, total: clean.reduce((sum, item) => sum + item.value, 0) };
  };

  const stops = (items, total) => {
    let offset = 0;
    return items.map((item, index) => {
      const start = offset;
      offset += total > 0 ? (item.value / total) * 100 : 0;
      return `${COLORS[index % COLORS.length]} ${start}% ${offset}%`;
    }).join(',');
  };

  const legend = (items, key) => `<div class="radial-legend">${items.map((item, index) => `
    <span><i style="background:${COLORS[index % COLORS.length]}"></i><b>${esc(item[key])}</b><strong>${item.value}%</strong></span>
  `).join('')}</div>`;

  const confidenceMarkup = (rawItems) => {
    const { items, total } = normalize(rawItems);
    const upper = items.filter((item) => ['A', 'B'].includes(item.grade)).reduce((sum, item) => sum + item.value, 0);
    return `<div class="radial-layout confidence-radial" data-frozen-radial="confidence">
      <div class="radial-donut" style="background:conic-gradient(${stops(items, total)})" role="img" aria-label="Confidence distribution: ${items.map((item) => `${item.grade} ${item.value}%`).join(', ')}. A plus B equals ${upper}%.">
        <div class="radial-center"><strong>${upper}%</strong><span>A + B</span></div>
      </div>${legend(items, 'grade')}
    </div>`;
  };

  const geographyMarkup = (rawItems) => {
    const { items, total } = normalize(rawItems);
    const leading = items[0] || { region: '—', value: 0 };
    return `<div class="radial-layout geography-radial" data-frozen-radial="geography">
      <div class="radial-donut geography-donut" style="background:conic-gradient(${stops(items, total)})" role="img" aria-label="Regional signal share: ${items.map((item) => `${item.region} ${item.value}%`).join(', ')}.">
        <div class="radial-center"><strong>${leading.value}%</strong><span>${esc(leading.region)}</span></div>
      </div>${legend(items, 'region')}
    </div>`;
  };

  fetch(dataFile, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const confidence = document.querySelector('#confidence-chart');
      const geography = document.querySelector('#geography-chart');
      const confidenceHtml = confidenceMarkup(data.confidenceDistribution || []);
      const geographyHtml = geographyMarkup(data.geography || []);
      let applying = false;

      const restore = () => {
        if (applying) return;
        applying = true;
        if (confidence && !confidence.querySelector('[data-frozen-radial="confidence"]')) confidence.innerHTML = confidenceHtml;
        if (geography && !geography.querySelector('[data-frozen-radial="geography"]')) geography.innerHTML = geographyHtml;
        applying = false;
      };

      restore();
      const observer = new MutationObserver(restore);
      if (confidence) observer.observe(confidence, { childList: true });
      if (geography) observer.observe(geography, { childList: true });
      window.setTimeout(restore, 250);
      window.setTimeout(restore, 1000);
    })
    .catch((error) => console.error('Frozen radial restoration failed', error));
})();
