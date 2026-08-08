(() => {
  'use strict';

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function enforceLeadSignal(leadName) {
    const rows = [...document.querySelectorAll('#category-bars .category-row')];
    if (!rows.length) return;

    const targetName = normalizeText(leadName);
    let targetRow = null;

    rows.forEach((row) => {
      row.classList.remove('lead-signal');
      row.querySelectorAll('.lead-signal-label').forEach((label) => label.remove());
      const name = normalizeText(row.querySelector('.category-copy > div:first-child > span')?.textContent);
      if (!targetRow && targetName && name === targetName) targetRow = row;
    });

    if (!targetRow) {
      targetRow = rows.reduce((best, row) => {
        const bestScore = Number.parseFloat(best?.querySelector('.category-copy strong')?.textContent || '-Infinity');
        const rowScore = Number.parseFloat(row.querySelector('.category-copy strong')?.textContent || '-Infinity');
        return rowScore > bestScore ? row : best;
      }, rows[0]);
    }

    if (!targetRow) return;
    targetRow.classList.add('lead-signal');
    const label = document.createElement('span');
    label.className = 'lead-signal-label';
    label.textContent = 'Lead signal';
    targetRow.prepend(label);

    document.documentElement.dataset.leadSignalSingleton = 'true';
  }

  function applyFromSnapshot(snapshot) {
    enforceLeadSignal(snapshot?.leadSignal || null);
  }

  document.addEventListener('kidults:data-loaded', (event) => {
    applyFromSnapshot(event.detail);
  });

  if (document.documentElement.dataset.dataReady === 'true') {
    applyFromSnapshot(window.KIDULTS_INTELLIGENCE_SNAPSHOT);
  }
})();
