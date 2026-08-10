(() => {
  const DATA_URL = './data/kidults-live.json';
  const text = (el, value) => { if (el && value !== undefined && value !== null) el.textContent = String(value); };
  const pct = (n) => `${(Number(n || 0) * 100).toFixed(0)}%`;
  async function bind() {
    let data;
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      data = await res.json();
    } catch (error) {
      document.documentElement.dataset.liveData = 'unavailable';
      console.warn('KIDULTS live POC data unavailable; static labels retained.', error);
      return;
    }
    document.documentElement.dataset.liveData = 'connected';
    const truth = data.truth || {};
    const meta = [...document.querySelectorAll('.meta > div')];
    for (const box of meta) {
      const label = box.querySelector('small')?.textContent?.trim().toLowerCase();
      const value = box.querySelector('b');
      if (label === 'data state') text(value, truth.label || data.mode || 'LIVE POC');
      if (label === 'core verticals') text(value, `${truth.verticalsCovered || 0}/${truth.totalVerticals || 8}`);
      if (label === 'universe') text(value, `${truth.uniqueCandidates || 0} live`);
    }
    const metrics = [...document.querySelectorAll('.metric')];
    for (const box of metrics) {
      const label = box.querySelector('small')?.textContent?.trim().toLowerCase();
      const value = box.querySelector('b');
      if (label === 'tracked objects' || label === 'universe') text(value, truth.uniqueCandidates || 0);
    }
    const verticalCards = [...document.querySelectorAll('#markets .vertical, #markets .card')];
    for (const v of data.verticals || []) {
      const card = verticalCards.find(c => c.querySelector('h3')?.textContent?.toLowerCase().includes(v.name.split(' & ')[0].split(' / ')[0].toLowerCase()));
      if (!card) continue;
      let badge = card.querySelector('.live-count');
      if (!badge) { badge = document.createElement('div'); badge.className='live-count'; badge.style.cssText='margin-top:10px;font-size:9px;color:#c8ff3d;letter-spacing:.08em;text-transform:uppercase'; card.appendChild(badge); }
      text(badge, `${v.status} · ${v.count} observed`);
    }
    const integrity = [...document.querySelectorAll('.trust .card')];
    for (const card of integrity) {
      const label = card.querySelector('b')?.textContent?.toLowerCase() || '';
      const value = card.querySelector('.mut');
      if (label.includes('provenance')) text(value, `${pct(truth.provenanceCoverage)} live coverage`);
      if (label.includes('rights')) text(value, `${pct(truth.rightsClassified)} classified`);
    }
    const footer = document.querySelector('footer .foot span:last-child');
    if (footer) footer.textContent = `LIVE POC · ${truth.uniqueCandidates || 0} candidates · ${truth.verticalsCovered || 0}/${truth.totalVerticals || 8} verticals · ${new Date(data.generatedAt).toLocaleString()}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
