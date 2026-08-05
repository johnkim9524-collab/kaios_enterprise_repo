(() => {
  const COLORS = [
    '#123F35',
    '#356456',
    '#5F8174',
    '#8FA69D',
    '#C6C7B8'
  ];

  const esc = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);

  function normalize(items, key = 'value') {
    const clean = items.map((item) => ({ ...item, value: Math.max(0, Number(item[key]) || 0) }));
    const total = clean.reduce((sum, item) => sum + item.value, 0);
    return { items: clean, total };
  }

  function conicStops(items, total) {
    let offset = 0;
    return items.map((item, index) => {
      const start = offset;
      offset += total > 0 ? (item.value / total) * 100 : 0;
      return `${COLORS[index % COLORS.length]} ${start}% ${offset}%`;
    }).join(',');
  }

  function legend(items, labelKey) {
    return `<div class="radial-legend">${items.map((item, index) => `
      <span>
        <i style="background:${COLORS[index % COLORS.length]}"></i>
        <b>${esc(item[labelKey])}</b>
        <strong>${item.value}%</strong>
      </span>`).join('')}</div>`;
  }

  function confidenceDonut(rawItems) {
    const { items, total } = normalize(rawItems);
    const upper = items
      .filter((item) => item.grade === 'A' || item.grade === 'B')
      .reduce((sum, item) => sum + item.value, 0);
    const stops = conicStops(items, total);

    return `<div class="radial-layout confidence-radial">
      <div class="radial-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Confidence distribution: ${items.map((item) => `${item.grade} ${item.value}%`).join(', ')}. A plus B equals ${upper}%.">
        <div class="radial-center"><strong>${upper}%</strong><span>A + B</span></div>
      </div>
      ${legend(items, 'grade')}
    </div>`;
  }

  function geographySemiDonut(rawItems) {
    const { items, total } = normalize(rawItems);
    const stops = conicStops(items, total);
    const leading = items[0] || { region: '—', value: 0 };

    return `<div class="radial-layout geography-radial">
      <div class="semi-wrap">
        <div class="semi-donut" style="background:conic-gradient(from 270deg, ${stops}, transparent 100% 100%)" role="img" aria-label="Regional signal share: ${items.map((item) => `${item.region} ${item.value}%`).join(', ')}.">
          <div class="semi-cutout"></div>
        </div>
        <div class="semi-center"><strong>${leading.value}%</strong><span>${esc(leading.region)}</span></div>
      </div>
      ${legend(items, 'region')}
    </div>`;
  }

  function loadB32() {
    if (!document.querySelector('link[data-b32-integrity]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'b32-visualization-integrity.css';
      stylesheet.dataset.b32Integrity = 'true';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-b32-integrity]')) {
      const script = document.createElement('script');
      script.src = 'b32-visualization-integrity.js';
      script.defer = true;
      script.dataset.b32Integrity = 'true';
      document.head.appendChild(script);
    }
  }

  function loadB35() {
    if (!document.querySelector('link[data-b35-premium-dial]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'b35-premium-intelligence-dial.css';
      stylesheet.dataset.b35PremiumDial = 'true';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-b35-premium-dial]')) {
      const script = document.createElement('script');
      script.src = 'b35-premium-intelligence-dial.js';
      script.defer = true;
      script.dataset.b35PremiumDial = 'true';
      document.head.appendChild(script);
    }
  }

  function render() {
    fetch('intelligence-data.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const confidence = document.querySelector('#confidence-chart');
        const geography = document.querySelector('#geography-chart');
        if (confidence) confidence.innerHTML = confidenceDonut(data.confidenceDistribution || []);
        if (geography) geography.innerHTML = geographySemiDonut(data.geography || []);
        loadB32();
        loadB35();
      })
      .catch((error) => {
        console.error('Radial chart enhancement failed', error);
        loadB32();
        loadB35();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();
