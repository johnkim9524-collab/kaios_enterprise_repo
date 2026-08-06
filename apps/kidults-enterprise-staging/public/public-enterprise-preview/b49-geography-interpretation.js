(() => {
  const esc = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);

  function dataFile() {
    return new URLSearchParams(window.location.search).get('data') === 'preview'
      ? 'intelligence-data.preview.json'
      : 'intelligence-data.json';
  }

  function render(data) {
    const chart = document.querySelector('#geography-chart');
    if (!chart || chart.parentElement?.querySelector('.geography-interpretation')) return;

    const items = Array.isArray(data.geography) ? data.geography : [];
    if (!items.length) return;

    const sorted = [...items].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    const top = sorted[0];
    const crossMarket = items
      .filter((item) => item.region === 'Europe' || item.region === 'East Asia')
      .reduce((sum, item) => sum + Number(item.value || 0), 0);

    const note = document.createElement('div');
    note.className = 'geography-interpretation';
    note.innerHTML = `
      <p class="geography-interpretation__label">Coverage interpretation</p>
      <p class="geography-interpretation__copy">North America remains the largest observable signal base, while Europe and East Asia provide meaningful cross-market validation. Regional weights reflect evidence availability, not total market size.</p>
      <div class="geography-interpretation__metrics">
        <span><small>Top region</small><strong>${esc(top?.region || '—')} · ${Number(top?.value || 0)}%</strong></span>
        <span><small>Cross-market</small><strong>Europe + East Asia · ${crossMarket}%</strong></span>
      </div>`;

    chart.insertAdjacentElement('afterend', note);
  }

  fetch(dataFile(), { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(render)
    .catch(() => {});
})();
